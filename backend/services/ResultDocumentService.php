<?php
/**
 * @file ResultDocumentService.php
 * Secure Provider-Issued & Admin-Uploaded Official Result Document Service
 *
 * Responsibilities:
 * - Extract base64 PDFs, safe remote URLs, tracking IDs, and structured details from provider payloads
 * - Validate PDF magic bytes (%PDF-), MIME type, and 15MB ceiling
 * - Enforce SSRF protection when fetching provider-supplied HTTPS PDF URLs
 * - Store PDF files strictly outside the public web root (/backend/storage/results) with .htaccess deny-all
 * - Persist normalized document metadata in identity_result_documents with SHA-256 deduplication
 * - Stream PDFs with owner / RBAC authorization, realpath confinement, and safe headers
 * - Never fabricate provider PDFs or expose server paths, credentials, or raw provider errors
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use Throwable;

class ResultDocumentService
{
    public const MAX_PDF_BYTES = 15728640; // 15 MB

    public static function getStorageRoot(): string
    {
        $root = dirname(__DIR__) . '/storage/results';
        if (!is_dir($root)) {
            @mkdir($root, 0750, true);
        }
        $htaccess = $root . '/.htaccess';
        if (!is_file($htaccess)) {
            @file_put_contents(
                $htaccess,
                "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n"
            );
        }
        $indexFile = $root . '/index.php';
        if (!is_file($indexFile)) {
            @file_put_contents($indexFile, "<?php http_response_code(403); exit;\n");
        }
        return $root;
    }

    /**
     * Extracts normalized provider PDFs (base64 or URL), tracking ID, and safe structured result details
     * from a 2SureVerify / Veripine response without retaining raw base64 blobs in structured details.
     */
    public static function extractProviderResult(array $providerRes): array
    {
        $raw = isset($providerRes['raw']) && is_array($providerRes['raw']) ? $providerRes['raw'] : $providerRes;
        $data = isset($raw['data']) && is_array($raw['data'])
            ? $raw['data']
            : (isset($providerRes['data']) && is_array($providerRes['data']) ? $providerRes['data'] : []);

        $merged = array_merge($raw, $data);

        // 1. Collect tracking IDs across known provider field variants
        $trackingCandidates = [
            $providerRes['tracking_id'] ?? null,
            $data['tracking_id'] ?? null,
            $data['trackingId'] ?? null,
            $data['nimc_tracking_id'] ?? null,
            $data['transaction_id'] ?? null,
            $raw['tracking_id'] ?? null,
            $raw['trackingId'] ?? null,
        ];
        $trackingId = '';
        foreach ($trackingCandidates as $cand) {
            if (is_string($cand) || is_int($cand)) {
                $val = trim((string)$cand);
                if ($val !== '' && strlen($val) <= 140) {
                    $trackingId = $val;
                    break;
                }
            }
        }

        // 2. Collect base64 documents in deterministic priority order
        $priorityKeys = [
            'report_pdf_base64',
            'premium_slip_base64',
            'certificate_base64',
            'publication_base64',
            'slip_pdf_base64',
            'pdf_base64',
            'document_base64',
            'result_pdf_base64',
            'nin_slip_base64',
            'bvn_slip_base64',
        ];

        $extractedFiles = [];
        $seenBase64Keys = [];

        $inspectPool = function (array $pool) use (&$extractedFiles, &$seenBase64Keys, $priorityKeys): void {
            foreach ($priorityKeys as $pk) {
                if (!empty($pool[$pk]) && is_string($pool[$pk]) && empty($seenBase64Keys[$pk])) {
                    $mimeKey = preg_replace('/_base64$/', '_mime', $pk);
                    $mime = is_string($pool[$mimeKey] ?? null) ? trim((string)$pool[$mimeKey]) : 'application/pdf';
                    $extractedFiles[] = [
                        'key' => $pk,
                        'base64' => $pool[$pk],
                        'mime' => $mime ?: 'application/pdf',
                    ];
                    $seenBase64Keys[$pk] = true;
                }
            }
            foreach ($pool as $k => $v) {
                if (!is_string($k) || !is_string($v) || $v === '' || !empty($seenBase64Keys[$k])) {
                    continue;
                }
                if (str_ends_with(strtolower($k), '_base64')) {
                    $mimeKey = substr($k, 0, -7) . '_mime';
                    $mime = is_string($pool[$mimeKey] ?? null) ? trim((string)$pool[$mimeKey]) : 'application/pdf';
                    $extractedFiles[] = [
                        'key' => $k,
                        'base64' => $v,
                        'mime' => $mime ?: 'application/pdf',
                    ];
                    $seenBase64Keys[$k] = true;
                }
            }
        };

        $inspectPool($data);
        $inspectPool($raw);
        if (isset($providerRes['extracted_files']) && is_array($providerRes['extracted_files'])) {
            foreach ($providerRes['extracted_files'] as $ef) {
                if (is_array($ef) && !empty($ef['base64']) && is_string($ef['base64'])) {
                    $k = (string)($ef['key'] ?? 'provider_file');
                    if (empty($seenBase64Keys[$k])) {
                        $extractedFiles[] = [
                            'key' => $k,
                            'base64' => $ef['base64'],
                            'mime' => (string)($ef['mime'] ?? 'application/pdf'),
                        ];
                        $seenBase64Keys[$k] = true;
                    }
                }
            }
        }

        // 3. Collect remote result URLs (strictly kept backend-only for fetch, never returned directly)
        $urlKeys = ['report_url', 'pdf_url', 'document_url', 'certificate_url', 'publication_url', 'slip_url', 'file_url', 'result_url'];
        $resultUrls = [];
        foreach ($urlKeys as $uk) {
            foreach ([$data[$uk] ?? null, $raw[$uk] ?? null, $providerRes[$uk] ?? null] as $uVal) {
                if (is_string($uVal) && filter_var(trim($uVal), FILTER_VALIDATE_URL)) {
                    $cleanU = trim($uVal);
                    if (!in_array($cleanU, $resultUrls, true)) {
                        $resultUrls[] = $cleanU;
                    }
                }
            }
        }

        // 4. Build safe structured result details (strip binaries, URLs, credentials, internal fields)
        $ignoredDetailKeys = [
            'api_key', 'apikey', 'secret', 'secret_key', 'token', 'access_token', 'authorization',
            'raw', 'extracted_files', 'result_urls', 'balance', 'wallet_balance', 'provider_balance',
        ];
        $resultDetails = [];
        $candidateDetails = array_merge($data, array_intersect_key($merged, array_flip([
            'status', 'admin_note', 'remark', 'remarks', 'message', 'tracking_id', 'trackingId',
            'old_tracking_id', 'new_tracking_id', 'nimc_tracking_id', 'enrollment_type', 'completed_at', 'updated_at', 'created_at',
            'nin', 'bvn', 'surname', 'firstname', 'middlename', 'first_name', 'middle_name',
            'last_name', 'phone', 'dob', 'gender',
        ])));
        foreach ($candidateDetails as $dk => $dv) {
            $kl = strtolower((string)$dk);
            if (
                in_array($kl, $ignoredDetailKeys, true)
                || str_ends_with($kl, '_base64')
                || str_ends_with($kl, '_mime')
                || str_ends_with($kl, '_url')
                || str_contains($kl, 'secret')
                || str_contains($kl, 'token')
                || str_contains($kl, 'password')
            ) {
                continue;
            }
            if (is_string($dv)) {
                $trimV = trim($dv);
                if ($trimV === '' || str_starts_with(strtolower($trimV), 'data:') || strlen($trimV) > 1000) {
                    continue;
                }
                if (preg_match('/^https?:\/\//i', $trimV) === 1) {
                    continue;
                }
                $resultDetails[(string)$dk] = $trimV;
            } elseif (is_numeric($dv) || is_bool($dv)) {
                $resultDetails[(string)$dk] = $dv;
            }
        }

        if ($trackingId !== '' && empty($resultDetails['tracking_id'])) {
            $resultDetails['tracking_id'] = $trackingId;
        }

        return [
            'tracking_id' => $trackingId !== '' ? $trackingId : null,
            'extracted_files' => $extractedFiles,
            'result_urls' => $resultUrls,
            'result_details' => $resultDetails,
        ];
    }

    /**
     * Decodes a base64 PDF payload cleanly and validates %PDF- header + size ceiling.
     *
     * @return array{ok:bool,bytes:?string,mime:string,error:?string}
     */
    public static function decodeAndValidatePdfBase64(string $rawBase64, string $declaredMime = 'application/pdf'): array
    {
        $clean = trim($rawBase64);
        if ($clean === '') {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Empty base64 document payload.'];
        }

        if (preg_match('/^data:([^;]+);base64,(.*)$/is', $clean, $m)) {
            $declaredMime = strtolower(trim($m[1])) ?: $declaredMime;
            $clean = $m[2];
        }

        $clean = preg_replace('/\s+/', '', $clean) ?? '';
        $bytes = base64_decode($clean, true);
        if (!is_string($bytes) || $bytes === '') {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Invalid base64 encoding returned by provider.'];
        }

        return self::validatePdfBytes($bytes, $declaredMime);
    }

    /**
     * Validates raw PDF binary bytes (%PDF- magic header, optional finfo MIME check, max 15MB).
     *
     * @return array{ok:bool,bytes:?string,mime:string,error:?string}
     */
    public static function validatePdfBytes(string $bytes, string $declaredMime = 'application/pdf'): array
    {
        $len = strlen($bytes);
        if ($len < 32) {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Provider result file is empty or corrupt.'];
        }
        if ($len > self::MAX_PDF_BYTES) {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Result document exceeds 15MB security limit.'];
        }
        if (substr($bytes, 0, 5) !== '%PDF-') {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Result file is not a valid PDF document.'];
        }

        if (class_exists('finfo')) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $detected = $finfo->buffer($bytes);
            if (is_string($detected) && $detected !== '' && !in_array($detected, ['application/pdf', 'application/x-pdf', 'application/octet-stream'], true)) {
                return ['ok' => false, 'bytes' => null, 'mime' => $detected, 'error' => 'Unexpected file signature returned for PDF document.'];
            }
        }

        $safeMime = in_array(strtolower(trim($declaredMime)), ['application/pdf', 'application/x-pdf'], true)
            ? 'application/pdf'
            : 'application/pdf';

        return ['ok' => true, 'bytes' => $bytes, 'mime' => $safeMime, 'error' => null];
    }

    /**
     * Downloads a remote provider PDF URL with strict SSRF protection, HTTPS enforcement, and %PDF- validation.
     *
     * @return array{ok:bool,bytes:?string,mime:string,error:?string}
     */
    public static function downloadRemotePdfSafely(string $url, array $headers = [], int $timeout = 30): array
    {
        $cleanUrl = trim($url);
        if ($cleanUrl === '' || !filter_var($cleanUrl, FILTER_VALIDATE_URL)) {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Invalid provider document URL.'];
        }

        $parts = parse_url($cleanUrl);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower((string)($parts['host'] ?? ''));
        if ($scheme !== 'https' || $host === '') {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Only HTTPS provider document URLs are permitted.'];
        }
        if (in_array($host, ['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'], true)) {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Blocked unsafe internal document host.'];
        }

        $ips = @gethostbynamel($host);
        if (!is_array($ips) || count($ips) === 0) {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Provider document host could not be resolved.'];
        }
        foreach ($ips as $ip) {
            if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Blocked private or reserved document host IP.'];
            }
        }

        $ch = curl_init($cleanUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false, // Disable redirects to prevent SSRF bypass
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/pdf,application/octet-stream'], $headers),
        ]);
        $body = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== '' || !is_string($body) || $httpCode < 200 || $httpCode >= 300) {
            return ['ok' => false, 'bytes' => null, 'mime' => 'application/pdf', 'error' => 'Provider result file could not be downloaded at this time.'];
        }

        return self::validatePdfBytes($body, 'application/pdf');
    }

    /**
     * Attempts to extract and persist an official provider result PDF + tracking ID + details onto
     * modification_requests or enrolment_orders cleanly and idempotently.
     */
    public static function syncFromProviderPayload(
        Database $db,
        string $domain,
        array $recordRow,
        array $providerRes,
        array $downloadHeaders = []
    ): array {
        $table = $domain === 'enrolment' ? 'enrolment_orders' : 'modification_requests';
        $recordId = (string)$recordRow['id'];
        $userId = (string)$recordRow['user_id'];
        $refNum = (string)($recordRow['request_number'] ?? $recordRow['order_number'] ?? $recordId);
        $provRef = (string)($providerRes['provider_reference'] ?? $recordRow['provider_reference'] ?? '');

        $extracted = self::extractProviderResult($providerRes);
        $trackingId = $extracted['tracking_id'] ?: ($recordRow['provider_tracking_id'] ?? null);
        $details = $extracted['result_details'];

        // Merge any existing decoded result_payload without discarding keys
        $existingPayload = json_decode((string)($recordRow['result_payload'] ?? ''), true);
        if (!is_array($existingPayload)) {
            $existingPayload = [];
        }
        $mergedDetails = array_merge($existingPayload, $details);

        $existingDocId = trim((string)($recordRow['result_document_id'] ?? ''));
        $storedDoc = null;
        $lastRetrievalError = null;
        $retrievalStatus = $existingDocId !== '' ? 'ready' : 'unavailable';

        // Only attempt extraction if no official PDF is already stored (or if current stored doc is missing on disk)
        $needsPdf = ($existingDocId === '');
        if (!$needsPdf && $existingDocId !== '') {
            $existingDocRow = $db->fetchOne('SELECT id, file_path FROM identity_result_documents WHERE id = :id LIMIT 1', ['id' => $existingDocId]);
            if (!$existingDocRow || !is_file((string)$existingDocRow['file_path'])) {
                $needsPdf = true;
            }
        }

        if ($needsPdf) {
            // Priority A: Base64 PDF files directly inside provider payload (keep primary + optional secondary e.g. premium_slip_base64)
            foreach ($extracted['extracted_files'] as $ef) {
                $decoded = self::decodeAndValidatePdfBase64((string)$ef['base64'], (string)($ef['mime'] ?? 'application/pdf'));
                if ($decoded['ok'] && is_string($decoded['bytes'])) {
                    $persisted = self::persistPdfBytes(
                        $db,
                        $domain,
                        $recordId,
                        $userId,
                        $decoded['bytes'],
                        'provider_base64',
                        true,
                        self::sanitizePdfFilename($refNum . '_' . ($ef['key'] ?? 'official_result') . '.pdf'),
                        (string)($ef['key'] ?? 'provider_base64'),
                        $provRef !== '' ? $provRef : null,
                        $trackingId ? (string)$trackingId : null,
                        null
                    );
                    if ($storedDoc === null) {
                        $storedDoc = $persisted;
                        $retrievalStatus = 'ready';
                        $lastRetrievalError = null;
                    } elseif (($persisted['id'] ?? '') !== ($storedDoc['id'] ?? '') && empty($mergedDetails['secondary_document_id'])) {
                        $mergedDetails['secondary_document_id'] = $persisted['id'];
                        $mergedDetails['secondary_document_label'] = ($ef['key'] ?? '') === 'premium_slip_base64'
                            ? 'Official Premium NIN Slip'
                            : 'Secondary Provider Document';
                    }
                } else {
                    if ($storedDoc === null) {
                        $lastRetrievalError = $decoded['error'] ?? 'Invalid provider base64 PDF';
                    }
                }
            }

            // Priority B: Remote HTTPS URLs returned by provider (SSRF-protected)
            if ($storedDoc === null && !empty($extracted['result_urls'])) {
                foreach ($extracted['result_urls'] as $rUrl) {
                    $remote = self::downloadRemotePdfSafely($rUrl, $downloadHeaders);
                    if ($remote['ok'] && is_string($remote['bytes'])) {
                        $storedDoc = self::persistPdfBytes(
                            $db,
                            $domain,
                            $recordId,
                            $userId,
                            $remote['bytes'],
                            'provider_url',
                            true,
                            self::sanitizePdfFilename($refNum . '_official_result.pdf'),
                            'provider_url',
                            $provRef !== '' ? $provRef : null,
                            $trackingId ? (string)$trackingId : null,
                            null
                        );
                        $retrievalStatus = 'ready';
                        $lastRetrievalError = null;
                        break;
                    } else {
                        $lastRetrievalError = $remote['error'] ?? 'Failed to fetch provider result PDF URL';
                    }
                }
            }

            if ($storedDoc === null && $lastRetrievalError !== null) {
                $retrievalStatus = 'failed';
            }
        }

        // Update record result metadata safely (never alters financial/wallet fields)
        $updateSets = [
            'provider_tracking_id = :trk',
            'result_payload = :rp',
            'updated_at = NOW()',
        ];
        $params = [
            'trk' => $trackingId ?: null,
            'rp' => !empty($mergedDetails) ? json_encode($mergedDetails, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : ($recordRow['result_payload'] ?? null),
            'id' => $recordId,
        ];

        if ($storedDoc !== null) {
            $updateSets[] = 'result_document_id = :docid';
            $updateSets[] = 'result_source = :rsrc';
            $updateSets[] = 'result_retrieval_status = "ready"';
            $updateSets[] = 'result_retrieval_error = NULL';
            $updateSets[] = 'result_retrieved_at = NOW()';
            $params['docid'] = $storedDoc['id'];
            $params['rsrc'] = $storedDoc['document_source'];
        } elseif ($needsPdf) {
            $updateSets[] = 'result_retrieval_status = :rstat';
            $updateSets[] = 'result_retrieval_error = :rerr';
            $params['rstat'] = $retrievalStatus;
            $params['rerr'] = $lastRetrievalError;
        }

        try {
            $db->execute("UPDATE `{$table}` SET " . implode(', ', $updateSets) . " WHERE id = :id", $params);
        } catch (Throwable $e) {
            // Keep processing non-fatal if optional columns are not yet synced
        }

        return [
            'document' => $storedDoc,
            'tracking_id' => $trackingId,
            'result_details' => $mergedDetails,
            'retrieval_status' => $retrievalStatus,
            'retrieval_error' => $lastRetrievalError,
        ];
    }

    /**
     * Stores an Admin-uploaded official result PDF. Strictly sets is_provider_issued = 0 and document_source = 'admin_uploaded'.
     */
    public static function storeAdminUploadedPdf(
        Database $db,
        string $domain,
        array $recordRow,
        array $uploadedFile,
        string $adminId,
        ?string $trackingId = null
    ): array {
        if (empty($uploadedFile) || ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::error('Please attach a valid PDF document to upload.', 422);
        }
        $tmpPath = (string)($uploadedFile['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_file($tmpPath)) {
            Response::error('Uploaded file could not be read on the server.', 422);
        }
        $size = (int)($uploadedFile['size'] ?? 0);
        if ($size <= 0 || $size > self::MAX_PDF_BYTES) {
            Response::error('Official result PDF must be between 1 byte and 15 MB.', 422);
        }

        $bytes = @file_get_contents($tmpPath);
        if (!is_string($bytes)) {
            Response::error('Failed to read uploaded PDF bytes.', 500);
        }

        $validation = self::validatePdfBytes($bytes, 'application/pdf');
        if (!$validation['ok'] || !is_string($validation['bytes'])) {
            Response::error($validation['error'] ?? 'Uploaded file is not a valid PDF document.', 422);
        }

        $table = $domain === 'enrolment' ? 'enrolment_orders' : 'modification_requests';
        $recordId = (string)$recordRow['id'];
        $userId = (string)$recordRow['user_id'];
        $refNum = (string)($recordRow['request_number'] ?? $recordRow['order_number'] ?? $recordId);
        $origName = self::sanitizePdfFilename((string)($uploadedFile['name'] ?? ($refNum . '_official_result.pdf')));

        $doc = self::persistPdfBytes(
            $db,
            $domain,
            $recordId,
            $userId,
            $validation['bytes'],
            'admin_uploaded',
            false,
            $origName,
            'admin_upload',
            !empty($recordRow['provider_reference']) ? (string)$recordRow['provider_reference'] : null,
            $trackingId ?: (!empty($recordRow['provider_tracking_id']) ? (string)$recordRow['provider_tracking_id'] : null),
            $adminId
        );

        $updateSql = "UPDATE `{$table}` SET result_document_id = :docid, result_source = 'admin_uploaded', result_retrieval_status = 'ready', result_retrieval_error = NULL, result_retrieved_at = NOW()";
        $params = ['docid' => $doc['id'], 'id' => $recordId];
        if ($trackingId !== null && trim($trackingId) !== '') {
            $updateSql .= ', provider_tracking_id = :trk';
            $params['trk'] = trim($trackingId);
        }
        $updateSql .= ', updated_at = NOW() WHERE id = :id';
        $db->execute($updateSql, $params);

        return $doc;
    }

    /**
     * Persists validated PDF bytes to /backend/storage/results and writes an identity_result_documents row.
     */
    public static function persistPdfBytes(
        Database $db,
        string $domain,
        string $recordId,
        string $userId,
        string $bytes,
        string $documentSource,
        bool $isProviderIssued,
        string $originalName,
        ?string $providerDocRef,
        ?string $providerRef,
        ?string $trackingId,
        ?string $uploadedBy
    ): array {
        $sha256 = hash('sha256', $bytes);

        // Deduplicate identical binary for the same domain + record + source
        $existing = $db->fetchOne(
            'SELECT * FROM identity_result_documents WHERE domain = :dom AND record_id = :rid AND sha256_hash = :sha LIMIT 1',
            ['dom' => $domain, 'rid' => $recordId, 'sha' => $sha256]
        );
        if ($existing && is_file((string)$existing['file_path'])) {
            return $existing;
        }

        $root = self::getStorageRoot();
        $docId = Security::generateUuid();
        $safePrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $domain . '_' . $recordId);
        $storedName = $safePrefix . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(6)) . '.pdf';
        $destPath = $root . '/' . $storedName;

        // Atomic write via temp file + rename
        $tmpFile = $destPath . '.tmp_' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmpFile, $bytes, LOCK_EX) === false || !@rename($tmpFile, $destPath)) {
            @unlink($tmpFile);
            throw new \RuntimeException('Failed to write official result document securely.');
        }

        $safeOrigName = self::sanitizePdfFilename($originalName);
        $db->execute(
            'INSERT INTO identity_result_documents
             (id, domain, record_id, user_id, document_source, is_provider_issued, original_name, stored_name, file_path, mime_type, file_size, sha256_hash, provider_document_ref, provider_reference, tracking_id, uploaded_by, retrieval_status, retrieval_error, retrieved_at, created_at, updated_at)
             VALUES (:id, :dom, :rid, :uid, :src, :ipi, :oname, :sname, :fpath, "application/pdf", :sz, :sha, :pdref, :pref, :trk, :uby, "ready", NULL, NOW(), NOW(), NOW())',
            [
                'id' => $docId,
                'dom' => $domain,
                'rid' => $recordId,
                'uid' => $userId,
                'src' => $documentSource,
                'ipi' => $isProviderIssued ? 1 : 0,
                'oname' => $safeOrigName,
                'sname' => $storedName,
                'fpath' => $destPath,
                'sz' => strlen($bytes),
                'sha' => $sha256,
                'pdref' => $providerDocRef,
                'pref' => $providerRef,
                'trk' => $trackingId,
                'uby' => $uploadedBy,
            ]
        );

        $row = $db->fetchOne('SELECT * FROM identity_result_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        return $row ?: [
            'id' => $docId,
            'domain' => $domain,
            'record_id' => $recordId,
            'user_id' => $userId,
            'document_source' => $documentSource,
            'is_provider_issued' => $isProviderIssued ? 1 : 0,
            'original_name' => $safeOrigName,
            'stored_name' => $storedName,
            'file_path' => $destPath,
            'mime_type' => 'application/pdf',
            'file_size' => strlen($bytes),
            'sha256_hash' => $sha256,
            'tracking_id' => $trackingId,
            'retrieval_status' => 'ready',
            'retrieved_at' => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * Streams a stored official result PDF after validating ownership/RBAC, path confinement, and %PDF- signature.
     */
    public static function streamResultDocument(
        Database $db,
        array $user,
        string $domain,
        string $recordIdOrNum,
        bool $forceDownload = false,
        ?string $requestedDocId = null
    ): void {
        $isMod = ($domain === 'modification');
        $table = $isMod ? 'modification_requests' : 'enrolment_orders';
        $numCol = $isMod ? 'request_number' : 'order_number';

        $record = $db->fetchOne(
            "SELECT * FROM `{$table}` WHERE id = :id OR `{$numCol}` = :num LIMIT 1",
            ['id' => $recordIdOrNum, 'num' => $recordIdOrNum]
        );
        if (!$record) {
            Response::notFound('Record not found.');
        }

        $isOwner = ((string)($record['user_id'] ?? '') === (string)($user['id'] ?? ''));
        $isStaff = Auth::isAdmin($user) && Auth::hasPermission($user, 'services');
        if (!$isOwner && !$isStaff) {
            Response::forbidden('Access denied to this result document.');
        }

        $doc = null;
        $reqDocClean = trim((string)($requestedDocId ?? ''));
        if ($reqDocClean !== '') {
            $doc = $db->fetchOne(
                'SELECT * FROM identity_result_documents WHERE id = :id AND domain = :dom AND record_id = :rid LIMIT 1',
                ['id' => $reqDocClean, 'dom' => $domain, 'rid' => $record['id']]
            );
        }
        $docId = trim((string)($record['result_document_id'] ?? ''));
        if (!$doc && $docId !== '') {
            $doc = $db->fetchOne('SELECT * FROM identity_result_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        }
        if (!$doc) {
            $doc = $db->fetchOne(
                'SELECT * FROM identity_result_documents WHERE domain = :dom AND record_id = :rid ORDER BY created_at DESC LIMIT 1',
                ['dom' => $domain, 'rid' => $record['id']]
            );
        }
        if (!$doc) {
            Response::notFound('No official result PDF document is available for this request.');
        }

        $storageBase = realpath(self::getStorageRoot());
        $fileReal = realpath((string)($doc['file_path'] ?? ''));
        if ($storageBase === false || $fileReal === false || !str_starts_with($fileReal, $storageBase . DIRECTORY_SEPARATOR) || !is_file($fileReal)) {
            Response::notFound('Result PDF file is unavailable on the server.');
        }

        $headerCheck = @file_get_contents($fileReal, false, null, 0, 5);
        if ($headerCheck !== '%PDF-') {
            Response::error('Stored result document failed integrity verification.', 500);
        }

        $refLabel = (string)($record[$numCol] ?? $record['id']);
        $safeFilename = self::sanitizePdfFilename($refLabel . '_Official_Result.pdf');
        $disposition = $forceDownload ? 'attachment' : 'inline';

        header('Content-Type: application/pdf');
        header('Content-Disposition: ' . $disposition . '; filename="' . $safeFilename . '"');
        header('Content-Length: ' . (string)filesize($fileReal));
        header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        readfile($fileReal);
        exit;
    }

    /**
     * Builds normalized, path-free result document metadata for API JSON responses.
     */
    public static function formatResultMetadata(Database $db, array $row, string $domain, bool $includeAdminFields = false): array
    {
        $docId = trim((string)($row['result_document_id'] ?? ''));
        $doc = null;
        if ($docId !== '') {
            $doc = $db->fetchOne('SELECT id, domain, record_id, document_source, is_provider_issued, original_name, mime_type, file_size, sha256_hash, tracking_id, retrieval_status, retrieved_at, created_at FROM identity_result_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        }
        if (!$doc) {
            $doc = $db->fetchOne('SELECT id, domain, record_id, document_source, is_provider_issued, original_name, mime_type, file_size, sha256_hash, tracking_id, retrieval_status, retrieved_at, created_at FROM identity_result_documents WHERE domain = :dom AND record_id = :rid ORDER BY created_at DESC LIMIT 1', ['dom' => $domain, 'rid' => $row['id']]);
        }

        $hasDoc = ($doc !== null);
        $endpointBase = $domain === 'enrolment'
            ? '/api/enrolments/' . $row['id'] . '/result-document'
            : '/api/modifications/' . $row['id'] . '/result-document';

        $details = json_decode((string)($row['result_payload'] ?? ''), true);
        if (!is_array($details)) {
            $details = [];
        }

        $trackingId = trim((string)($row['provider_tracking_id'] ?? ''));
        if ($trackingId === '' && !empty($doc['tracking_id'])) {
            $trackingId = trim((string)$doc['tracking_id']);
        }
        if ($trackingId === '' && !empty($details['tracking_id']) && is_string($details['tracking_id'])) {
            $trackingId = trim($details['tracking_id']);
        }

        $docPayload = $hasDoc ? [
            'id' => $doc['id'],
            'document_source' => $doc['document_source'],
            'is_provider_issued' => (bool)(int)($doc['is_provider_issued'] ?? 0),
            'source_label' => ((int)($doc['is_provider_issued'] ?? 0) === 1)
                ? 'Provider-Issued Official Document'
                : 'Admin-Uploaded Official Document',
            'original_name' => $doc['original_name'],
            'mime_type' => $doc['mime_type'] ?? 'application/pdf',
            'file_size' => (int)($doc['file_size'] ?? 0),
            'sha256_hash' => $doc['sha256_hash'] ?? null,
            'retrieved_at' => $doc['retrieved_at'] ?? $doc['created_at'] ?? null,
            'preview_url' => $endpointBase,
            'download_url' => $endpointBase . '?download=1',
        ] : null;

        $retrievalStatus = $hasDoc ? 'ready' : strtolower(trim((string)($row['result_retrieval_status'] ?? 'unavailable')));
        $rowStatus = strtolower(trim((string)($row['status'] ?? '')));

        if ($hasDoc) {
            $availabilityState = 'document_available';
        } elseif (in_array($rowStatus, ['failed', 'rejected', 'refunded'], true)) {
            $availabilityState = 'failed_or_rejected';
        } elseif (in_array($rowStatus, ['pending', 'processing', 'query_required'], true)) {
            $availabilityState = 'processing';
        } elseif ($rowStatus === 'completed') {
            $availabilityState = in_array($retrievalStatus, ['unavailable', 'failed'], true)
                ? 'document_unavailable'
                : 'result_available';
        } else {
            $availabilityState = 'none';
        }

        $secondaryDocPayload = null;
        $secondaryDocId = trim((string)($details['secondary_document_id'] ?? ''));
        if ($secondaryDocId !== '') {
            $secDoc = $db->fetchOne(
                'SELECT id, domain, record_id, document_source, is_provider_issued, original_name, mime_type, file_size, sha256_hash, tracking_id, retrieval_status, retrieved_at, created_at FROM identity_result_documents WHERE id = :id AND domain = :dom AND record_id = :rid LIMIT 1',
                ['id' => $secondaryDocId, 'dom' => $domain, 'rid' => $row['id']]
            );
            if ($secDoc) {
                $secondaryDocPayload = [
                    'id' => $secDoc['id'],
                    'document_source' => $secDoc['document_source'],
                    'is_provider_issued' => (bool)(int)($secDoc['is_provider_issued'] ?? 0),
                    'source_label' => (string)($details['secondary_document_label'] ?? 'Secondary Provider Document'),
                    'original_name' => $secDoc['original_name'],
                    'mime_type' => $secDoc['mime_type'] ?? 'application/pdf',
                    'file_size' => (int)($secDoc['file_size'] ?? 0),
                    'preview_url' => $endpointBase . '?doc_id=' . urlencode((string)$secDoc['id']),
                    'download_url' => $endpointBase . '?download=1&doc_id=' . urlencode((string)$secDoc['id']),
                ];
            }
        }

        $out = [
            'has_result_document' => $hasDoc,
            'result_document_id' => $hasDoc ? $doc['id'] : null,
            'result_source' => $hasDoc ? $doc['document_source'] : ($row['result_source'] ?? null),
            'result_document' => $docPayload,
            'secondary_result_document' => $secondaryDocPayload,
            'provider_tracking_id' => $trackingId !== '' ? $trackingId : null,
            'result_details' => $details,
            'result_retrieval_status' => $hasDoc ? 'ready' : ($row['result_retrieval_status'] ?? 'unavailable'),
            'result_availability_state' => $availabilityState,
            'result_retrieved_at' => $row['result_retrieved_at'] ?? ($doc['retrieved_at'] ?? null),
        ];

        if ($includeAdminFields) {
            $out['result_retrieval_error'] = $row['result_retrieval_error'] ?? null;
        }

        return $out;
    }

    public static function sanitizePdfFilename(string $rawName): string
    {
        $base = basename(str_replace(["\r", "\n", "\0", '"', "'", '/', '\\'], '_', trim($rawName)));
        $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $base) ?? 'official_result.pdf';
        $safe = ltrim($safe, '.');
        if ($safe === '') {
            $safe = 'official_result.pdf';
        }
        if (!str_ends_with(strtolower($safe), '.pdf')) {
            $safe .= '.pdf';
        }
        return substr($safe, 0, 120);
    }
}
