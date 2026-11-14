<?php
/**
 * @file ModificationController.php
 * Stage 3 — Sovereign Manual NIN & BVN Modification Controller
 *
 * Strictly isolates NIN Modification and BVN Modification across service listing,
 * input validation, document attachments, 2SureVerify manual submission, polling,
 * webhooks, atomic wallet settlement, single-refund guarantees, and customer/admin lifecycle.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Core\SchemaSync;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;

class ModificationController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    private function maskIdentifier(string $val): string
    {
        $clean = preg_replace('/\s+/', '', trim($val)) ?? '';
        if ($clean === '') {
            return 'N/A';
        }
        $len = strlen($clean);
        if ($len <= 5) {
            return str_repeat('•', $len);
        }
        return substr($clean, 0, 3) . str_repeat('•', max(3, $len - 6)) . substr($clean, -3);
    }

    private function decodeJsonColumn(mixed $val, array $default = []): array
    {
        if (is_array($val)) {
            return $val;
        }
        if (is_string($val) && trim($val) !== '') {
            $decoded = json_decode($val, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return $default;
    }

    private function sanitizeCustomerError(string $message): string
    {
        $clean = preg_replace('/https?:\/\/\S+/i', '', $message) ?? $message;
        $clean = str_ireplace(
            ['2sureverify', 'veripine', 'ulamadata', 'api_key', 'twosureverify_api_key', 'secret_key'],
            'verification gateway',
            $clean
        );
        return trim($clean) ?: 'Request could not be submitted right now. Please verify your details and try again.';
    }

    private function isFieldConditionMet(array $fDef, array $values): bool
    {
        $cond = $fDef['conditional_on'] ?? null;
        if (!is_array($cond) || empty($cond['field']) || !is_array($cond['values'] ?? null)) {
            return true;
        }
        $targetVal = trim((string)($values[$cond['field']] ?? ''));
        if ($targetVal === '') {
            return false;
        }
        $allowed = array_map(static fn ($v) => (string)$v, $cond['values']);
        return in_array($targetVal, $allowed, true);
    }

    private function normalizeFormSchema(array $schema, bool $includeProviderParams = false): array
    {
        $out = [];
        foreach ($schema as $f) {
            if (!is_array($f) || empty($f['key'])) {
                continue;
            }
            $item = $f;
            if (isset($item['helper']) && empty($item['help_text'])) {
                $item['help_text'] = $item['helper'];
            }
            unset($item['helper']);
            if (!$includeProviderParams) {
                unset($item['provider_param']);
            }
            $out[] = $item;
        }
        return $out;
    }

    private function normalizeRequiredDocuments(array $docs, bool $includeProviderParams = false): array
    {
        $out = [];
        foreach ($docs as $d) {
            if (!is_array($d) || empty($d['key'])) {
                continue;
            }
            $item = $d;
            if (empty($item['accepted_formats']) || !is_array($item['accepted_formats'])) {
                $item['accepted_formats'] = ['JPG', 'PNG', 'WEBP', 'PDF'];
            }
            if (empty($item['max_size_mb'])) {
                $item['max_size_mb'] = 5;
            }
            if (!$includeProviderParams) {
                unset($item['provider_file_param']);
            }
            $out[] = $item;
        }
        return $out;
    }

    private function formatServiceRow(array $row, bool $isAdmin = false): array
    {
        $selling = (float)($row['selling_price'] ?? $row['price'] ?? 0);
        $wholesale = (float)($row['wholesale_cost'] ?? 0);
        $catCode = strtolower(trim((string)($row['category_code'] ?? $row['category'] ?? '')));
        $serviceKey = (string)($row['service_key'] ?? $row['key'] ?? '');
        $identityType = ($catCode === 'bvn_modification' || str_starts_with(strtolower($serviceKey), 'bvn_'))
            ? 'BVN'
            : 'NIN';

        $rawDocs = $this->decodeJsonColumn($row['required_documents'] ?? null, []);
        $rawSchema = $this->decodeJsonColumn($row['form_schema'] ?? null, []);

        $formatted = [
            'id' => (string)($row['id'] ?? ''),
            'key' => $serviceKey,
            'service_key' => $serviceKey,
            'category' => $catCode ?: ($identityType === 'BVN' ? 'bvn_modification' : 'nin_modification'),
            'identity_type' => $identityType,
            'name' => (string)($row['name'] ?? ''),
            'description' => (string)($row['description'] ?? ''),
            'selling_price' => $selling,
            'price' => $selling,
            'is_active' => (bool)($row['is_active'] ?? true),
            'enabled' => (bool)($row['is_active'] ?? true),
            'processing_type' => (string)($row['processing_type'] ?? 'manual'),
            'manual_label' => (string)(!empty($row['manual_label']) ? $row['manual_label'] : 'Manual Processing'),
            'estimated_turnaround' => (string)(!empty($row['estimated_turnaround']) ? $row['estimated_turnaround'] : '3 – 10 Business Days'),
            'supported_notes' => (string)($row['supported_notes'] ?? ''),
            'required_fields' => $this->decodeJsonColumn($row['required_fields'] ?? null, []),
            'required_documents' => $this->normalizeRequiredDocuments($rawDocs, $isAdmin),
            'form_schema' => $this->normalizeFormSchema($rawSchema, $isAdmin),
            'updated_at' => $row['updated_at'] ?? null,
        ];

        if ($isAdmin) {
            $mappingSpec = TwoSureVerifyAdapter::getModificationMappingSpec($serviceKey, $rawSchema, $rawDocs);
            $formatted['provider_id'] = (string)($row['provider_id'] ?? '2sureverify');
            $formatted['provider'] = $formatted['provider_id'];
            $formatted['endpoint'] = (string)($row['endpoint'] ?? '');
            $formatted['wholesale_cost'] = $wholesale;
            $formatted['profit'] = round($selling - $wholesale, 2);
            $formatted['margin_percent'] = $selling > 0 ? round((($selling - $wholesale) / $selling) * 100, 1) : 0.0;
            $formatted['provider_schema_verified'] = (bool)($mappingSpec['provider_schema_verified'] ?? false);
            $formatted['payload_mapping'] = $mappingSpec;
        }

        return $formatted;
    }

    private function formatRequestRow(array $row, bool $isAdmin = false): array
    {
        $fields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        // Ensure sensitive credential values are never exposed even from legacy records
        foreach (['password', 'pin', 'transaction_pin'] as $secKey) {
            if (isset($fields[$secKey]) && $fields[$secKey] !== '') {
                $fields[$secKey] = '[PROTECTED]';
            }
        }
        $docs = $this->decodeJsonColumn($row['supporting_documents'] ?? null, []);

        $customerPrice = (float)($row['customer_price'] ?? 0);
        $providerCost = (float)($row['provider_cost'] ?? 0);
        $profit = (float)($row['profit'] ?? ($customerPrice - $providerCost));

        $item = [
            'id' => (string)($row['id'] ?? ''),
            'request_number' => (string)($row['request_number'] ?? ''),
            'user_id' => (string)($row['user_id'] ?? ''),
            'identity_type' => (string)($row['identity_type'] ?? 'NIN'),
            'service_key' => (string)($row['service_key'] ?? ''),
            'service_name' => (string)($row['service_name'] ?? ''),
            'masked_identifier' => (string)($row['masked_identifier'] ?? ''),
            'submitted_fields' => $fields,
            'supporting_documents' => $docs,
            'enrollment_type' => $row['enrollment_type'] ?? null,
            'customer_price' => $customerPrice,
            'payment_reference' => (string)($row['payment_reference'] ?? ''),
            'refund_reference' => $row['refund_reference'] ?? null,
            'provider_reference' => $row['provider_reference'] ?? null,
            'provider_status' => $row['provider_status'] ?? null,
            'provider_remarks' => $row['provider_remarks'] ?? null,
            'estimated_completion_text' => (string)($row['estimated_completion_text'] ?? 'Manual Processing'),
            'status' => (string)($row['status'] ?? 'pending'),
            'reviewed_at' => $row['reviewed_at'] ?? null,
            'completed_at' => $row['completed_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];

        if ($isAdmin) {
            $item['customer_name'] = $row['customer_name'] ?? null;
            $item['customer_email'] = $row['customer_email'] ?? null;
            $item['customer_phone'] = $row['customer_phone'] ?? null;
            $item['provider_cost'] = $providerCost;
            $item['profit'] = round($profit, 2);
            $item['provider_id'] = (string)($row['provider_id'] ?? '2sureverify');
            $item['endpoint'] = (string)($row['endpoint'] ?? '');
            $item['admin_notes'] = $row['admin_notes'] ?? null;
            $item['reviewed_by'] = $row['reviewed_by'] ?? null;
            $item['provider_response'] = $this->decodeJsonColumn($row['provider_response'] ?? null, []);
        } else {
            // Strip provider_cost & provider_remarks internal host details if any URL slipped in
            if (!empty($item['provider_remarks'])) {
                $item['provider_remarks'] = $this->sanitizeCustomerError((string)$item['provider_remarks']);
            }
        }

        return $item;
    }

    /**
     * Sync or read live BVN Modification enrollment types from 2SureVerify
     */
    private function syncOrFetchBvnTypes(bool $forceLive = false): array
    {
        SchemaSync::syncModificationCatalog($this->db);

        $existingRows = $this->db->fetchAll(
            'SELECT * FROM modification_bvn_types ORDER BY label ASC'
        );

        $needsLiveSync = $forceLive || empty($existingRows);
        if (!$needsLiveSync && !empty($existingRows[0]['provider_synced_at'])) {
            $lastSync = strtotime((string)$existingRows[0]['provider_synced_at']);
            if ($lastSync !== false && (time() - $lastSync) > 10800) { // Refresh cache every 3 hours
                $needsLiveSync = true;
            }
        }

        $liveSynced = false;
        $syncMessage = '';

        if ($needsLiveSync) {
            $adapter = new TwoSureVerifyAdapter();
            if ($adapter->hasCredentials()) {
                $res = $adapter->getBvnModificationBanks();
                $list = $res['data'] ?? $res['banks'] ?? $res['enrollment_types'] ?? [];
                if (!empty($res['success']) && is_array($list) && !empty($list)) {
                    foreach ($list as $entry) {
                        if (!is_array($entry)) {
                            continue;
                        }
                        $typeCode = trim((string)($entry['enrollment_type'] ?? $entry['bank_code'] ?? $entry['code'] ?? $entry['name'] ?? $entry['bank_name'] ?? ''));
                        $label = trim((string)($entry['label'] ?? $entry['name'] ?? $entry['bank_name'] ?? $entry['enrollment_type'] ?? $typeCode));
                        if ($typeCode === '') {
                            continue;
                        }
                        $rawPrice = $entry['price'] ?? $entry['cost'] ?? $entry['amount'] ?? 0;
                        $wholesale = is_numeric($rawPrice) ? (float)$rawPrice : 0.0;
                        // Default sensible customer markup only for newly discovered rows; preserve admin overrides
                        $defaultSelling = $wholesale > 0 ? round($wholesale + max(2500.0, $wholesale * 0.25), -2) : 12000.0;
                        $rowId = 'bvnt_' . substr(md5(strtolower($typeCode)), 0, 12);

                        $exists = $this->db->fetchOne(
                            'SELECT id, selling_price FROM modification_bvn_types WHERE enrollment_type = :et LIMIT 1',
                            ['et' => $typeCode]
                        );
                        if (!$exists) {
                            $this->db->execute(
                                'INSERT INTO modification_bvn_types (id, enrollment_type, label, wholesale_cost, selling_price, is_active, provider_synced_at)
                                 VALUES (:id, :et, :lbl, :wc, :sp, 1, NOW())',
                                [
                                    'id' => $rowId,
                                    'et' => $typeCode,
                                    'lbl' => $label,
                                    'wc' => $wholesale,
                                    'sp' => $defaultSelling,
                                ]
                            );
                        } else {
                            $updSp = ((float)$exists['selling_price'] <= 0 && $defaultSelling > 0) ? $defaultSelling : (float)$exists['selling_price'];
                            $this->db->execute(
                                'UPDATE modification_bvn_types
                                 SET label = :lbl, wholesale_cost = :wc, selling_price = :sp, provider_synced_at = NOW(), updated_at = NOW()
                                 WHERE id = :id',
                                [
                                    'lbl' => $label,
                                    'wc' => $wholesale > 0 ? $wholesale : 0.0,
                                    'sp' => $updSp,
                                    'id' => $exists['id'],
                                ]
                            );
                        }
                    }
                    $liveSynced = true;
                    $syncMessage = 'Synchronized live BVN modification enrollment types.';
                    $existingRows = $this->db->fetchAll('SELECT * FROM modification_bvn_types ORDER BY label ASC');
                } else {
                    $syncMessage = (string)($res['message'] ?? 'Provider did not return BVN modification types.');
                }
            } else {
                $syncMessage = 'Live 2SureVerify API credentials not configured on this host.';
            }
        }

        return [
            'rows' => $existingRows,
            'live_synced' => $liveSynced,
            'message' => $syncMessage,
        ];
    }

    /**
     * Send both in-app notification + transactional email safely (non-blocking)
     */
    private function notifyCustomer(string $userId, string $title, string $body, string $notifType, string $reference, array $emailMeta = []): void
    {
        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                 VALUES (:id, :uid, :title, :msg, :type, 0, "#services", NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => $title,
                    'msg' => $body,
                    'type' => in_array($notifType, ['info', 'success', 'warning', 'alert'], true) ? $notifType : 'info',
                ]
            );
        } catch (Throwable) {
        }

        try {
            $this->db->execute(
                'INSERT INTO customer_messages (id, user_id, title, category, body, is_read, reference, action_label, action_link, created_at)
                 VALUES (:id, :uid, :title, "service", :body, 0, :ref, "View Status", "#services", NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => $title,
                    'body' => $body,
                    'ref' => $reference,
                ]
            );
        } catch (Throwable) {
        }

        try {
            $u = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $userId]);
            if ($u && !empty($u['email']) && filter_var($u['email'], FILTER_VALIDATE_EMAIL)) {
                $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
                $safeName = htmlspecialchars((string)($u['full_name'] ?: 'Valued Customer'), ENT_QUOTES, 'UTF-8');
                $safeBody = nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'));
                $reqNo = htmlspecialchars((string)($emailMeta['request_number'] ?? $reference), ENT_QUOTES, 'UTF-8');
                $statusLbl = htmlspecialchars(strtoupper((string)($emailMeta['status'] ?? 'PENDING')), ENT_QUOTES, 'UTF-8');
                $srvName = htmlspecialchars((string)($emailMeta['service_name'] ?? 'Identity Modification'), ENT_QUOTES, 'UTF-8');

                $html = "<div style=\"font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;\">"
                    . "<div style=\"background:#0f172a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;\">"
                    . "<h2 style=\"margin:0;font-size:18px;\">HAMBAKTECH Identity Services</h2>"
                    . "<p style=\"margin:4px 0 0;color:#94a3b8;font-size:12px;\">Request Update: {$reqNo}</p>"
                    . "</div>"
                    . "<div style=\"background:#ffffff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;\">"
                    . "<p style=\"margin:0 0 12px;color:#0f172a;font-size:14px;\">Hello {$safeName},</p>"
                    . "<h3 style=\"margin:0 0 10px;color:#0f172a;font-size:16px;\">{$safeTitle}</h3>"
                    . "<p style=\"margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;\">{$safeBody}</p>"
                    . "<div style=\"background:#f1f5f9;padding:12px 16px;border-radius:8px;font-size:12px;color:#334155;margin-bottom:16px;\">"
                    . "<div><strong>Service:</strong> {$srvName}</div>"
                    . "<div><strong>Request ID:</strong> {$reqNo}</div>"
                    . "<div><strong>Current Status:</strong> {$statusLbl}</div>"
                    . "</div>"
                    . "<p style=\"margin:0;color:#64748b;font-size:12px;\">Need assistance? Reply to this email and our support team will assist you.</p>"
                    . "</div></div>";

                $mailer = new MailService();
                $mailer->send(
                    (string)$u['email'],
                    (string)($u['full_name'] ?: 'Customer'),
                    "HAMBAKTECH: {$title} ({$reqNo})",
                    $html,
                    null,
                    [
                        'from_email' => 'notification@hambaktech.com.ng',
                        'from_name' => 'HAMBAKTECH Support',
                        'reply_to' => 'support@hambaktech.com.ng',
                        'audit_action' => 'MODIFICATION_NOTIFICATION_EMAIL',
                    ]
                );
            }
        } catch (Throwable) {
        }
    }

    /**
     * Issue AT MOST ONE atomic refund for a failed or rejected modification request.
     * Protected by SELECT ... FOR UPDATE, refund_reference check, and WalletService ledger idempotency.
     */
    private function issueSingleAtomicRefund(string $requestId, string $reason, ?string $actorId = null, string $targetStatus = 'refunded'): array
    {
        return $this->db->withTransaction(function (Database $db) use ($requestId, $reason, $actorId, $targetStatus) {
            $req = $db->fetchOne('SELECT * FROM modification_requests WHERE id = :id FOR UPDATE', ['id' => $requestId]);
            if (!$req) {
                throw new RuntimeException('Modification request not found for refund.');
            }

            // Already refunded guard
            if (!empty($req['refund_reference']) || $req['status'] === 'refunded') {
                $wallet = $db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $req['user_id']]);
                return [
                    'refunded' => false,
                    'already_refunded' => true,
                    'refund_reference' => $req['refund_reference'],
                    'balance_after' => $wallet ? (float)$wallet['balance'] : null,
                ];
            }

            if ($req['status'] === 'completed') {
                throw new RuntimeException('Completed requests cannot be auto-refunded.');
            }

            $refundRef = 'REFUND_' . $req['payment_reference'];
            $amount = (float)$req['customer_price'];

            // Check ledger directly as secondary guard
            $existingTx = $db->fetchOne(
                'SELECT id, balance_after FROM transactions WHERE reference = :ref LIMIT 1',
                ['ref' => $refundRef]
            );

            $balanceAfter = null;
            if ($existingTx) {
                $balanceAfter = (float)$existingTx['balance_after'];
            } elseif ($amount > 0) {
                $creditRes = $this->walletService->credit(
                    (string)$req['user_id'],
                    $amount,
                    'modification_refund',
                    $refundRef,
                    "Refund for {$req['identity_type']} modification {$req['request_number']}: {$reason}",
                    'internal',
                    [
                        'modification_request_id' => $req['id'],
                        'request_number' => $req['request_number'],
                        'payment_reference' => $req['payment_reference'],
                        'actor_id' => $actorId,
                    ]
                );
                $balanceAfter = $creditRes['balance_after'] ?? null;
            }

            $finalStatus = in_array($targetStatus, ['failed', 'rejected', 'refunded'], true) ? $targetStatus : 'refunded';
            $db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     refund_reference = :rref,
                     provider_remarks = COALESCE(NULLIF(:rem, ""), provider_remarks),
                     provider_cost = 0.00,
                     profit = 0.00,
                     reviewed_by = COALESCE(:rby, reviewed_by),
                     reviewed_at = CASE WHEN :rby2 IS NOT NULL THEN NOW() ELSE reviewed_at END,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'st' => $finalStatus,
                    'rref' => $refundRef,
                    'rem' => $reason,
                    'rby' => $actorId,
                    'rby2' => $actorId,
                    'id' => $req['id'],
                ]
            );

            return [
                'refunded' => true,
                'already_refunded' => false,
                'refund_reference' => $refundRef,
                'balance_after' => $balanceAfter,
            ];
        });
    }

    /**
     * GET /api/modifications/services
     * Strictly returns separated nin_modification and bvn_modification arrays.
     */
    public function services(Request $request): void
    {
        SchemaSync::syncModificationCatalog($this->db);
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $rows = $this->db->fetchAll(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE c.code IN ("nin_modification", "bvn_modification")
               AND s.is_active = 1
             ORDER BY c.display_order ASC, s.selling_price ASC, s.name ASC'
        );

        $ninMods = [];
        $bvnMods = [];
        foreach ($rows as $row) {
            $formatted = $this->formatServiceRow($row, $isAdmin);
            if ($formatted['identity_type'] === 'BVN') {
                $bvnMods[] = $formatted;
            } else {
                $ninMods[] = $formatted;
            }
        }

        Response::success([
            'nin_modification' => $ninMods,
            'bvn_modification' => $bvnMods,
            'counts' => [
                'nin' => count($ninMods),
                'bvn' => count($bvnMods),
            ],
        ]);
    }

    /**
     * GET /api/modifications/bvn-types
     */
    public function bvnTypes(Request $request): void
    {
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $force = $isAdmin && filter_var($request->query('refresh', '0'), FILTER_VALIDATE_BOOLEAN);

        $syncRes = $this->syncOrFetchBvnTypes($force);
        $items = [];
        foreach ($syncRes['rows'] as $r) {
            if (!$isAdmin && empty($r['is_active'])) {
                continue;
            }
            $row = [
                'id' => (string)$r['id'],
                'enrollment_type' => (string)$r['enrollment_type'],
                'label' => (string)$r['label'],
                'selling_price' => (float)$r['selling_price'],
                'price' => (float)$r['selling_price'],
                'is_active' => (bool)$r['is_active'],
                'provider_synced_at' => $r['provider_synced_at'] ?? null,
            ];
            if ($isAdmin) {
                $row['wholesale_cost'] = (float)$r['wholesale_cost'];
            }
            $items[] = $row;
        }

        Response::success([
            'bvn_types' => $items,
            'count' => count($items),
            'live_synced' => $syncRes['live_synced'],
            'sync_note' => $syncRes['message'],
        ]);
    }

    /**
     * POST /api/modifications/upload-document
     */
    public function uploadDocument(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $docKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('doc_key', 'supporting_doc')) ?: 'supporting_doc';

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Please attach a valid supporting document file.', 422);
        }

        $file = $_FILES['file'];
        if ((int)$file['size'] > 5 * 1024 * 1024) {
            Response::error('Supporting document file must not exceed 5MB.', 422);
        }

        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Invalid file format. Accepted formats: JPG, PNG, WEBP, PDF.', 422);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!in_array($mime, $allowedMimes, true)) {
            Response::error('Document file signature validation failed.', 422);
        }

        $storageDir = dirname(__DIR__) . '/storage/uploads';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
            @file_put_contents($storageDir . '/.htaccess', "Deny from all\n");
        }

        $docId = Security::generateUuid();
        $storedName = 'mod_' . $docKey . '_' . time() . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
        $destPath = $storageDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to store uploaded document securely.', 500);
        }

        $fileUrl = '/api/modifications/document/' . $docId;
        $this->db->execute(
            'INSERT INTO uploaded_documents (id, user_id, document_type, original_name, stored_name, mime_type, file_size, file_path, file_url, created_at)
             VALUES (:id, :uid, :dtype, :oname, :sname, :mime, :sz, :fpath, :furl, NOW())',
            [
                'id' => $docId,
                'uid' => $user['id'],
                'dtype' => 'modification_' . $docKey,
                'oname' => basename((string)$file['name']),
                'sname' => $storedName,
                'mime' => $mime,
                'sz' => (int)$file['size'],
                'fpath' => $destPath,
                'furl' => $fileUrl,
            ]
        );

        Response::success([
            'document' => [
                'id' => $docId,
                'doc_key' => $docKey,
                'original_name' => basename((string)$file['name']),
                'mime_type' => $mime,
                'file_size' => (int)$file['size'],
                'file_url' => $fileUrl,
            ],
        ], 'Supporting document uploaded securely.');
    }

    /**
     * GET /api/modifications/document/:id
     */
    public function getDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $docId = trim((string)($params['id'] ?? ''));

        $doc = $this->db->fetchOne('SELECT * FROM uploaded_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        if (!$doc) {
            Response::notFound('Supporting document not found.');
        }

        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        if (!$isAdmin && $doc['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to document.');
        }

        $path = (string)($doc['file_path'] ?? '');
        if ($path === '' || !is_file($path)) {
            Response::notFound('Document file missing from storage.');
        }

        header('Content-Type: ' . ($doc['mime_type'] ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . basename((string)$doc['original_name']) . '"');
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }

    /**
     * POST /api/modifications/submit
     * Validates all inputs, documents, consent, PIN, and idempotency BEFORE debiting wallet.
     */
    public function submit(Request $request): void
    {
        SchemaSync::syncModificationCatalog($this->db);

        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $body = $request->getBody();

        // 1. Legal consent & idempotency checks first
        if (empty($body['consent'])) {
            Response::error('You must accept the legal authorization and declaration checkbox before submitting.', 422);
        }

        $idempotencyKey = trim((string)($body['idempotency_key'] ?? ''));
        if ($idempotencyKey !== '') {
            $existingIdemp = $this->db->fetchOne(
                'SELECT * FROM modification_requests WHERE user_id = :uid AND idempotency_key = :ikey LIMIT 1',
                ['uid' => $user['id'], 'ikey' => substr($idempotencyKey, 0, 120)]
            );
            if ($existingIdemp) {
                $wallet = $this->db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $user['id']]);
                Response::success([
                    'idempotent_replay' => true,
                    'request' => $this->formatRequestRow($existingIdemp, $isAdmin),
                    'balance_after' => $wallet ? (float)$wallet['balance'] : null,
                ], 'Modification request already submitted.');
            }
        }

        // 2. Service & strict category domain resolution
        $serviceKey = trim((string)($body['service_key'] ?? ''));
        if ($serviceKey === '') {
            Response::error('Please select a modification service.', 422);
        }

        $serviceRow = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE s.service_key = :sk AND c.code IN ("nin_modification", "bvn_modification")
             LIMIT 1',
            ['sk' => $serviceKey]
        );
        if (!$serviceRow) {
            Response::error('Selected modification service does not exist.', 404);
        }
        if (empty($serviceRow['is_active'])) {
            Response::error('This modification service is currently paused by administration.', 503);
        }

        $serviceDomain = ($serviceRow['category_code'] === 'bvn_modification') ? 'BVN' : 'NIN';
        $requestedIdentityType = strtoupper(trim((string)($body['identity_type'] ?? $serviceDomain)));
        if ($requestedIdentityType !== $serviceDomain) {
            Response::error("Cross-category submission rejected: {$serviceRow['name']} belongs exclusively to {$serviceDomain} Modification.", 422);
        }

        // 3. Gather & validate input fields before touching wallet
        $rawFields = is_array($body['fields'] ?? null) ? $body['fields'] : $body;
        $formSchema = $this->decodeJsonColumn($serviceRow['form_schema'] ?? null, []);
        $requiredFieldKeys = $this->decodeJsonColumn($serviceRow['required_fields'] ?? null, []);
        $requiredDocsSchema = $this->decodeJsonColumn($serviceRow['required_documents'] ?? null, []);

        $submittedFields = [];
        $plaintextSecrets = []; // kept strictly in-memory for immediate POST submission only
        $visibleFieldKeys = [];

        foreach ($formSchema as $fDef) {
            if (!is_array($fDef)) {
                continue;
            }
            $fk = (string)($fDef['key'] ?? '');
            if ($fk === '') {
                continue;
            }
            if (!$this->isFieldConditionMet($fDef, $rawFields)) {
                continue;
            }
            $visibleFieldKeys[$fk] = true;
            $val = isset($rawFields[$fk]) ? trim((string)$rawFields[$fk]) : '';
            if (!empty($fDef['required']) && $val === '') {
                Response::error(($fDef['label'] ?? $fk) . ' is required.', 422);
            }
            if ($val !== '') {
                if (in_array($fk, ['nin', 'parent_nin', 'bvn'], true)) {
                    $digits = preg_replace('/\D/', '', $val) ?? '';
                    if (strlen($digits) !== 11) {
                        Response::error(($fDef['label'] ?? strtoupper($fk)) . ' must be exactly 11 digits.', 422);
                    }
                    $val = $digits;
                } elseif (in_array($fk, ['phone', 'previous_phone'], true)) {
                    $digits = preg_replace('/\D/', '', $val) ?? '';
                    if (strlen($digits) < 10 || strlen($digits) > 13) {
                        Response::error(($fDef['label'] ?? 'Phone number') . ' must be a valid Nigerian phone number.', 422);
                    }
                    $val = $digits;
                } elseif ($fk === 'email' && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
                    Response::error('Please provide a valid email address.', 422);
                } elseif (($fDef['type'] ?? '') === 'select' && !empty($fDef['options']) && is_array($fDef['options'])) {
                    $allowedOptions = array_map(static fn ($opt) => (string)($opt['value'] ?? ''), $fDef['options']);
                    if (!in_array($val, $allowedOptions, true)) {
                        Response::error('Invalid selection for ' . ($fDef['label'] ?? $fk) . '.', 422);
                    }
                }

                if ($fk === 'password') {
                    $plaintextSecrets['password'] = $val;
                    $submittedFields[$fk] = '[PROTECTED]';
                } else {
                    $submittedFields[$fk] = $val;
                }
            }
        }

        // Fallback required_fields validation for fields in active schema
        $schemaByKey = [];
        foreach ($formSchema as $fDef) {
            if (is_array($fDef) && !empty($fDef['key'])) {
                $schemaByKey[(string)$fDef['key']] = $fDef;
            }
        }
        foreach ($requiredFieldKeys as $rk) {
            $rkStr = (string)$rk;
            if (isset($schemaByKey[$rkStr]) && empty($visibleFieldKeys[$rkStr])) {
                continue;
            }
            if (!isset($submittedFields[$rkStr]) || trim((string)$submittedFields[$rkStr]) === '') {
                if (isset($rawFields[$rkStr]) && trim((string)$rawFields[$rkStr]) !== '') {
                    $submittedFields[$rkStr] = trim((string)$rawFields[$rkStr]);
                } else {
                    Response::error("Missing required field: {$rkStr}.", 422);
                }
            }
        }

        // Resolve primary identifier strictly matching category domain
        $primaryIdRaw = $serviceDomain === 'BVN'
            ? (string)($submittedFields['bvn'] ?? '')
            : (string)($submittedFields['nin'] ?? '');
        if (strlen($primaryIdRaw) !== 11) {
            Response::error("Valid 11-digit {$serviceDomain} number is required.", 422);
        }
        $maskedIdentifier = $this->maskIdentifier($primaryIdRaw);

        // 4. Validate uploaded supporting documents ownership & required docs
        $docIds = [];
        $docKeyMap = [];
        if (is_array($body['document_ids'] ?? null)) {
            foreach ($body['document_ids'] as $k => $v) {
                if (is_string($v) && trim($v) !== '') {
                    $cleanId = trim($v);
                    $docIds[] = $cleanId;
                    if (is_string($k) && $k !== '') {
                        $docKeyMap[$cleanId] = preg_replace('/[^a-zA-Z0-9_-]/', '', $k) ?: 'document';
                    }
                } elseif (is_array($v) && !empty($v['id'])) {
                    $cleanId = trim((string)$v['id']);
                    $docIds[] = $cleanId;
                    $docKeyMap[$cleanId] = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($v['doc_key'] ?? 'document')) ?: 'document';
                }
            }
        }
        if (is_array($body['supporting_documents'] ?? null)) {
            foreach ($body['supporting_documents'] as $sd) {
                if (is_array($sd) && !empty($sd['id'])) {
                    $cleanId = trim((string)$sd['id']);
                    $docIds[] = $cleanId;
                    $docKeyMap[$cleanId] = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($sd['doc_key'] ?? 'document')) ?: 'document';
                }
            }
        }
        $docIds = array_values(array_unique(array_filter($docIds)));

        $attachedFiles = [];
        $storedDocsMeta = [];
        if (!empty($docIds)) {
            $placeholders = [];
            $qParams = ['uid' => $user['id']];
            foreach ($docIds as $idx => $did) {
                $ph = ':did_' . $idx;
                $placeholders[] = $ph;
                $qParams['did_' . $idx] = $did;
            }
            $docRows = $this->db->fetchAll(
                'SELECT * FROM uploaded_documents WHERE user_id = :uid AND id IN (' . implode(', ', $placeholders) . ')',
                $qParams
            );
            foreach ($docRows as $dr) {
                $filePath = (string)($dr['file_path'] ?? '');
                if ($filePath === '' || !is_file($filePath) || !is_readable($filePath)) {
                    Response::error('One or more uploaded documents are missing from secure storage. Please re-upload and retry.', 422);
                }
                $dKey = $docKeyMap[$dr['id']] ?? str_replace('modification_', '', (string)$dr['document_type']);
                $attachedFiles[] = [
                    'id' => $dr['id'],
                    'doc_key' => $dKey,
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_path' => $filePath,
                    'file_url' => '/api/modifications/document/' . $dr['id'],
                ];
                $storedDocsMeta[] = [
                    'id' => $dr['id'],
                    'doc_key' => $dKey,
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_size' => (int)($dr['file_size'] ?? 0),
                    'file_url' => '/api/modifications/document/' . $dr['id'],
                ];
            }
        }

        // Unconditionally verify every required document key defined for this service has been uploaded
        $uploadedDocKeys = array_column($storedDocsMeta, 'doc_key');
        foreach ($requiredDocsSchema as $reqDoc) {
            if (!empty($reqDoc['required'])) {
                $rKey = (string)($reqDoc['key'] ?? '');
                if ($rKey !== '' && !in_array($rKey, $uploadedDocKeys, true)) {
                    Response::error('Please upload required supporting document: ' . ($reqDoc['label'] ?? $rKey), 422);
                }
            }
        }

        // 5. Security rules & Transaction PIN validation (before debit)
        $userRow = $this->db->fetchOne(
            'SELECT id, email, full_name, status, kyc_level, tier, transaction_pin_hash FROM users WHERE id = :id LIMIT 1',
            ['id' => $user['id']]
        );
        if (!$userRow || ($userRow['status'] ?? 'active') !== 'active') {
            Response::forbidden('Your account is currently not permitted to submit modification requests.');
        }

        try {
            $secRule = $this->db->fetchOne(
                'SELECT * FROM service_security_rules WHERE service_key IN (:sk1, :sk2, "modification") AND is_active = 1 ORDER BY CASE WHEN service_key = :sk3 THEN 0 ELSE 1 END LIMIT 1',
                [
                    'sk1' => $serviceKey,
                    'sk2' => $serviceDomain === 'BVN' ? 'bvn_modification' : 'nin_modification',
                    'sk3' => $serviceKey,
                ]
            );
            if ($secRule) {
                $minKyc = (int)($secRule['min_kyc_level'] ?? $secRule['min_tier'] ?? 1);
                $userKyc = (int)($userRow['kyc_level'] ?? $userRow['tier'] ?? 1);
                if ($userKyc < $minKyc) {
                    Response::error("KYC Tier {$minKyc} is required before submitting this modification request.", 403);
                }
            }
        } catch (Throwable) {
        }

        $suppliedPin = trim((string)($body['transaction_pin'] ?? $body['pin'] ?? ''));
        if (!empty($userRow['transaction_pin_hash'])) {
            if ($suppliedPin === '') {
                Response::error('Please enter your 4-digit Transaction PIN to authorize this debit.', 422, ['requires_pin' => true]);
            }
            if (!Security::verifyPin($suppliedPin, (string)$userRow['transaction_pin_hash'])) {
                Response::error('Invalid 4-digit Transaction PIN.', 401);
            }
        }

        // 6. Resolve exact price (dynamic for BVN enrollment_type when configured in modification_bvn_types)
        $enrollmentType = null;
        $customerPrice = (float)$serviceRow['selling_price'];
        $expectedWholesale = (float)$serviceRow['wholesale_cost'];

        if ($serviceDomain === 'BVN') {
            $enrollmentType = trim((string)($submittedFields['enrollment_type'] ?? ''));
            if ($enrollmentType === '') {
                Response::error('Please select the BVN enrollment bank / channel type.', 422);
            }
            $bvnTypeRow = $this->db->fetchOne(
                'SELECT * FROM modification_bvn_types WHERE enrollment_type = :et AND is_active = 1 LIMIT 1',
                ['et' => $enrollmentType]
            );
            if ($bvnTypeRow) {
                if ((float)$bvnTypeRow['selling_price'] > 0) {
                    $customerPrice = (float)$bvnTypeRow['selling_price'];
                }
                if ((float)$bvnTypeRow['wholesale_cost'] > 0) {
                    $expectedWholesale = (float)$bvnTypeRow['wholesale_cost'];
                }
            }
        }

        if ($customerPrice <= 0) {
            Response::error('Service pricing is not yet configured. Please contact support.', 422);
        }

        // 7 & 8. Atomic Wallet Debit + Persist modification_requests inside a single DB transaction
        $requestId = Security::generateUuid();
        $requestNumber = 'MOD-' . $serviceDomain . '-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $paymentRef = 'MODPAY_' . date('YmdHis') . '_' . strtoupper(bin2hex(random_bytes(4)));
        $categorySlug = $serviceDomain === 'BVN' ? 'bvn_modification' : 'nin_modification';
        $etaText = (string)(!empty($serviceRow['estimated_turnaround']) ? $serviceRow['estimated_turnaround'] : '3 – 10 Business Days');
        $endpoint = (string)($serviceRow['endpoint'] ?? '');
        $providerId = (string)($serviceRow['provider_id'] ?: '2sureverify');

        try {
            $debitResult = $this->db->withTransaction(function (Database $db) use (
                $user,
                $customerPrice,
                $categorySlug,
                $paymentRef,
                $serviceRow,
                $maskedIdentifier,
                $requestNumber,
                $requestId,
                $serviceKey,
                $serviceDomain,
                $submittedFields,
                $storedDocsMeta,
                $enrollmentType,
                $expectedWholesale,
                $providerId,
                $endpoint,
                $idempotencyKey,
                $etaText
            ) {
                $debitRes = $this->walletService->debit(
                    (string)$user['id'],
                    $customerPrice,
                    $categorySlug,
                    $paymentRef,
                    "{$serviceRow['name']} ({$maskedIdentifier}) [{$requestNumber}]",
                    'internal',
                    [
                        'modification_request_id' => $requestId,
                        'request_number' => $requestNumber,
                        'service_key' => $serviceKey,
                        'identity_type' => $serviceDomain,
                    ]
                );

                $db->execute(
                    'INSERT INTO modification_requests
                     (id, request_number, user_id, identity_type, service_key, service_name, masked_identifier, submitted_fields, supporting_documents, enrollment_type,
                      customer_price, provider_cost, profit, provider_id, endpoint, payment_reference, idempotency_key, estimated_completion_text, status, created_at)
                     VALUES
                     (:id, :rno, :uid, :itype, :sk, :snm, :mid, :sfields, :sdocs, :etype,
                      :cprice, :pcost, :profit, :pid, :ep, :pref, :ikey, :eta, "pending", NOW())',
                    [
                        'id' => $requestId,
                        'rno' => $requestNumber,
                        'uid' => $user['id'],
                        'itype' => $serviceDomain,
                        'sk' => $serviceKey,
                        'snm' => $serviceRow['name'],
                        'mid' => $maskedIdentifier,
                        'sfields' => json_encode($submittedFields),
                        'sdocs' => json_encode($storedDocsMeta),
                        'etype' => $enrollmentType,
                        'cprice' => $customerPrice,
                        'pcost' => $expectedWholesale,
                        'profit' => max(0.0, round($customerPrice - $expectedWholesale, 2)),
                        'pid' => $providerId,
                        'ep' => $endpoint,
                        'pref' => $paymentRef,
                        'ikey' => $idempotencyKey !== '' ? substr($idempotencyKey, 0, 120) : null,
                        'eta' => $etaText,
                    ]
                );

                return $debitRes;
            });
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 400);
        }

        // 9. Dispatch to 2SureVerify via explicit parameter & file mapping registry (keeps secrets in-memory only)
        $providerPayload = array_merge($submittedFields, $plaintextSecrets);
        $adapter = new TwoSureVerifyAdapter();
        $providerRes = $adapter->submitModification(
            $endpoint,
            $providerPayload,
            $attachedFiles,
            $paymentRef,
            $serviceKey,
            $formSchema,
            $requiredDocsSchema
        );

        // 10. Evaluate provider response: PENDING MUST STAY PENDING & NEVER AUTO-REFUND!
        $provRef = (string)($providerRes['reference'] ?? $paymentRef);
        $actualCost = !empty($providerRes['provider_cost']) && (float)$providerRes['provider_cost'] > 0
            ? (float)$providerRes['provider_cost']
            : $expectedWholesale;
        $actualProfit = round($customerPrice - $actualCost, 2);
        $provMsg = (string)($providerRes['message'] ?? '');

        if (!empty($providerRes['pending']) || !empty($providerRes['success'])) {
            $newStatus = ($providerRes['status'] ?? 'pending') === 'completed' ? 'completed' : 'pending';
            $provStatus = (string)($providerRes['provider_status'] ?? 'pending');

            $this->db->execute(
                'UPDATE modification_requests
                 SET provider_reference = :pr,
                     provider_status = :pst,
                     provider_remarks = :prem,
                     provider_response = :pres,
                     provider_cost = :pcost,
                     profit = :profit,
                     status = :st,
                     completed_at = CASE WHEN :st2 = "completed" THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'pr' => $provRef,
                    'pst' => $provStatus,
                    'prem' => $provMsg,
                    'pres' => json_encode($providerRes['raw'] ?? $providerRes),
                    'pcost' => $actualCost,
                    'profit' => $actualProfit,
                    'st' => $newStatus,
                    'st2' => $newStatus,
                    'id' => $requestId,
                ]
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'MODIFICATION_SUBMITTED',
                'service_type' => $serviceKey,
                'reference' => $requestNumber,
                'provider' => $providerId,
                'status' => $newStatus,
                'amount' => $customerPrice,
                'metadata' => [
                    'identity_type' => $serviceDomain,
                    'payment_reference' => $paymentRef,
                    'provider_reference' => $provRef,
                ],
            ]);

            $this->notifyCustomer(
                (string)$user['id'],
                "{$serviceDomain} Modification Submitted",
                "Your {$serviceRow['name']} request ({$requestNumber}) has been submitted for manual processing. Estimated turnaround: {$etaText}.",
                'info',
                $requestNumber,
                ['request_number' => $requestNumber, 'status' => $newStatus, 'service_name' => $serviceRow['name']]
            );

            $savedRow = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $requestId]);

            Response::success([
                'request' => $savedRow ? $this->formatRequestRow($savedRow, $isAdmin) : null,
                'pending' => true,
                'status' => $newStatus,
                'balance_after' => $debitResult['balance_after'] ?? null,
                'newBalance' => $debitResult['balance_after'] ?? null,
                'payment_reference' => $paymentRef,
                'provider_reference' => $isAdmin ? $provRef : $requestNumber,
            ], "{$serviceRow['name']} submitted for manual processing. You can track live status updates in your request tracker.");
        }

        // 11. Confirmed immediate provider rejection/failure -> issue AT MOST ONE atomic refund
        $refundRes = $this->issueSingleAtomicRefund(
            $requestId,
            $provMsg ?: 'Modification submission rejected by provider.',
            null,
            'refunded'
        );

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'service',
            'action' => 'MODIFICATION_SUBMIT_FAILED_REFUNDED',
            'service_type' => $serviceKey,
            'reference' => $requestNumber,
            'provider' => $providerId,
            'status' => 'refunded',
            'amount' => $customerPrice,
            'error_message' => $provMsg,
            'metadata' => ['refund_reference' => $refundRes['refund_reference'] ?? null],
        ]);

        $this->notifyCustomer(
            (string)$user['id'],
            "{$serviceDomain} Modification Failed & Refunded",
            "Your {$serviceRow['name']} request ({$requestNumber}) could not be accepted. ₦" . number_format($customerPrice, 2) . " has been automatically refunded to your wallet.",
            'warning',
            $requestNumber,
            ['request_number' => $requestNumber, 'status' => 'refunded', 'service_name' => $serviceRow['name']]
        );

        $displayErr = $isAdmin ? $provMsg : $this->sanitizeCustomerError($provMsg);
        Response::error(
            'Modification request could not be accepted: ' . $displayErr . '. Your wallet has been automatically refunded.',
            502,
            [
                'refunded' => true,
                'refund_reference' => $refundRes['refund_reference'] ?? null,
                'balance_after' => $refundRes['balance_after'] ?? null,
                'newBalance' => $refundRes['balance_after'] ?? null,
                'request_number' => $requestNumber,
            ]
        );
    }

    /**
     * GET /api/modifications/history?identity_type=NIN|BVN|ALL&status=...&search=...
     */
    public function history(Request $request): void
    {
        SchemaSync::syncModificationCatalog($this->db);

        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $identityType = strtoupper(trim((string)$request->query('identity_type', 'ALL')));
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $search = trim((string)$request->query('search', ''));
        $limit = min(100, max(1, (int)$request->query('limit', 40)));

        $where = 'WHERE user_id = :uid ';
        $params = ['uid' => $user['id']];

        if (in_array($identityType, ['NIN', 'BVN'], true)) {
            $where .= 'AND identity_type = :itype ';
            $params['itype'] = $identityType;
        }
        if ($status !== '' && $status !== 'all') {
            $where .= 'AND status = :st ';
            $params['st'] = $status;
        }
        if ($search !== '') {
            $where .= 'AND (request_number LIKE :q1 OR service_name LIKE :q2 OR masked_identifier LIKE :q3 OR payment_reference LIKE :q4) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
            $params['q4'] = $like;
        }

        $idRows = $this->db->fetchAll(
            "SELECT id FROM modification_requests {$where} ORDER BY created_at DESC LIMIT " . (int)$limit,
            $params
        );

        $rows = [];
        if (!empty($idRows)) {
            $ids = array_column($idRows, 'id');
            $phs = [];
            $idParams = [];
            foreach ($ids as $idx => $id) {
                $ph = ':mid_' . $idx;
                $phs[] = $ph;
                $idParams['mid_' . $idx] = $id;
            }
            $rows = $this->db->fetchAll(
                'SELECT * FROM modification_requests WHERE id IN (' . implode(', ', $phs) . ') ORDER BY created_at DESC',
                $idParams
            );
        }

        $formatted = [];
        foreach ($rows as $r) {
            $formatted[] = $this->formatRequestRow($r, $isAdmin);
        }

        Response::success([
            'count' => count($formatted),
            'requests' => $formatted,
        ]);
    }

    /**
     * GET /api/modifications/:id/status
     */
    public function requestStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Modification request not found.');
        }
        if (!$isAdmin && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to modification request.');
        }

        Response::success([
            'request' => $this->formatRequestRow($row, $isAdmin),
        ]);
    }

    /**
     * Shared status synchronization routine using 2SureVerify /api/v1/status.php
     */
    private function syncProviderStatusForRow(array $row, ?string $actorId = null): array
    {
        $lookupRef = trim((string)($row['provider_reference'] ?: $row['payment_reference']));
        if ($lookupRef === '') {
            return ['updated' => false, 'message' => 'No provider reference attached to this request.', 'row' => $row];
        }

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            return ['updated' => false, 'message' => 'Live provider credentials are not configured on this host.', 'row' => $row];
        }

        $res = $adapter->checkStatus($lookupRef);
        $rawStatus = strtolower(trim((string)($res['status'] ?? $res['data']['status'] ?? '')));
        $remarks = trim((string)($res['message'] ?? $res['remarks'] ?? $res['data']['remarks'] ?? $res['data']['message'] ?? ''));

        if ($rawStatus === '' && empty($res['success'])) {
            return ['updated' => false, 'message' => (string)($res['message'] ?? 'Status check did not return a valid status.'), 'row' => $row];
        }

        $prevStatus = (string)$row['status'];
        $newStatus = $prevStatus;

        if (in_array($rawStatus, ['completed', 'complete', 'approved', 'success', 'successful', 'done'], true)) {
            $newStatus = 'completed';
        } elseif (in_array($rawStatus, ['processing', 'in_progress', 'in-progress', 'reviewing'], true)) {
            $newStatus = 'processing';
        } elseif (in_array($rawStatus, ['query', 'query_required', 'info_required', 'action_required'], true)) {
            $newStatus = 'query_required';
        } elseif (in_array($rawStatus, ['pending', 'queued', 'submitted'], true)) {
            $newStatus = 'pending';
        } elseif (in_array($rawStatus, ['failed', 'rejected', 'declined', 'cancelled', 'canceled', 'error'], true)) {
            $newStatus = 'rejected';
        }

        $refundInfo = null;
        if (in_array($newStatus, ['failed', 'rejected'], true) && empty($row['refund_reference']) && $prevStatus !== 'completed') {
            $refundInfo = $this->issueSingleAtomicRefund(
                (string)$row['id'],
                $remarks ?: 'Provider marked request as ' . $newStatus,
                $actorId,
                'refunded'
            );
            $newStatus = 'refunded';
        } else {
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     provider_status = :pst,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     provider_response = :pres,
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'st' => $newStatus,
                    'pst' => $rawStatus ?: $row['provider_status'],
                    'prem' => $remarks,
                    'pres' => json_encode($res),
                    'st2' => $newStatus,
                    'id' => $row['id'],
                ]
            );
        }

        $updatedRow = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;

        if ($newStatus !== $prevStatus) {
            $titleMap = [
                'processing' => "{$row['identity_type']} Modification In Processing",
                'query_required' => "{$row['identity_type']} Modification: Additional Info Requested",
                'completed' => "{$row['identity_type']} Modification Completed",
                'refunded' => "{$row['identity_type']} Modification Rejected & Refunded",
            ];
            $msgMap = [
                'processing' => "Your {$row['service_name']} request ({$row['request_number']}) is now actively processing." . ($remarks ? " Note: {$remarks}" : ''),
                'query_required' => "Action required for {$row['request_number']}: " . ($remarks ?: 'Please submit additional requested details/documents.'),
                'completed' => "Great news! Your {$row['service_name']} request ({$row['request_number']}) has been completed." . ($remarks ? " Details: {$remarks}" : ''),
                'refunded' => "Your {$row['service_name']} request ({$row['request_number']}) was not approved and ₦" . number_format((float)$row['customer_price'], 2) . " has been refunded to your wallet.",
            ];
            $this->notifyCustomer(
                (string)$row['user_id'],
                $titleMap[$newStatus] ?? 'Modification Status Updated',
                $msgMap[$newStatus] ?? "Status changed to {$newStatus}.",
                $newStatus === 'completed' ? 'success' : ($newStatus === 'query_required' || $newStatus === 'refunded' ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
        }

        return [
            'updated' => true,
            'previous_status' => $prevStatus,
            'current_status' => $updatedRow['status'],
            'refund' => $refundInfo,
            'message' => 'Live provider status synchronized: ' . strtoupper((string)$updatedRow['status']),
            'row' => $updatedRow,
        ];
    }

    /**
     * POST /api/modifications/:id/poll
     */
    public function pollStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Modification request not found.');
        }
        if (!$isAdmin && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to modification request.');
        }

        $sync = $this->syncProviderStatusForRow($row, $isAdmin ? $user['id'] : null);

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($sync['row'], $isAdmin),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    /**
     * POST /api/modifications/:id/submit-info
     * Allows customer to submit requested additional notes or replacement supporting documents when status is query_required.
     */
    public function submitAdditionalInfo(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id AND user_id = :uid LIMIT 1', ['id' => $id, 'uid' => $user['id']]);
        if (!$row) {
            Response::notFound('Modification request not found.');
        }
        if ($row['status'] !== 'query_required') {
            Response::error('Additional information can only be submitted when the request status is Query / Info Required.', 422);
        }

        $note = trim((string)($body['note'] ?? $body['response_note'] ?? ''));
        $newDocIds = [];
        if (is_array($body['document_ids'] ?? null)) {
            foreach ($body['document_ids'] as $k => $v) {
                if (is_string($v) && trim($v) !== '') {
                    $newDocIds[] = ['id' => trim($v), 'doc_key' => is_string($k) ? $k : 'query_response'];
                } elseif (is_array($v) && !empty($v['id'])) {
                    $newDocIds[] = ['id' => trim((string)$v['id']), 'doc_key' => (string)($v['doc_key'] ?? 'query_response')];
                }
            }
        }

        if ($note === '' && empty($newDocIds)) {
            Response::error('Please provide an explanation note or attach the requested document.', 422);
        }

        $existingFields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        if ($note !== '') {
            $existingFields['customer_query_response'] = $note;
            $existingFields['customer_query_responded_at'] = date('Y-m-d H:i:s');
        }

        $existingDocs = $this->decodeJsonColumn($row['supporting_documents'] ?? null, []);
        if (!empty($newDocIds)) {
            $onlyIds = array_values(array_unique(array_column($newDocIds, 'id')));
            $phs = [];
            $qParams = ['uid' => $user['id']];
            foreach ($onlyIds as $idx => $did) {
                $phs[] = ':qid_' . $idx;
                $qParams['qid_' . $idx] = $did;
            }
            $docRows = $this->db->fetchAll(
                'SELECT * FROM uploaded_documents WHERE user_id = :uid AND id IN (' . implode(', ', $phs) . ')',
                $qParams
            );
            $existingDocIds = array_column($existingDocs, 'id');
            foreach ($docRows as $dr) {
                if (!in_array($dr['id'], $existingDocIds, true)) {
                    $existingDocs[] = [
                        'id' => $dr['id'],
                        'doc_key' => str_replace('modification_', '', (string)$dr['document_type']),
                        'original_name' => $dr['original_name'],
                        'mime_type' => $dr['mime_type'],
                        'file_size' => (int)($dr['file_size'] ?? 0),
                        'file_url' => '/api/modifications/document/' . $dr['id'],
                    ];
                }
            }
        }

        $this->db->execute(
            'UPDATE modification_requests
             SET submitted_fields = :sf,
                 supporting_documents = :sd,
                 status = "processing",
                 updated_at = NOW()
             WHERE id = :id',
            [
                'sf' => json_encode($existingFields),
                'sd' => json_encode($existingDocs),
                'id' => $row['id'],
            ]
        );

        $updated = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]);
        Response::success([
            'request' => $updated ? $this->formatRequestRow($updated, false) : null,
        ], 'Additional information submitted. Your request has resumed processing.');
    }

    /**
     * POST /api/modifications/webhook
     * Idempotent webhook receiver for 2SureVerify async status updates.
     */
    public function webhook(Request $request): void
    {
        $configuredSecret = trim((string)(getenv('TWOSUREVERIFY_WEBHOOK_SECRET') ?: ''));
        if ($configuredSecret !== '') {
            $rawInput = file_get_contents('php://input') ?: '';
            $sigHeader = trim((string)($request->header('x-webhook-signature') ?: $request->header('x-signature') ?: ''));
            $authHeader = trim((string)($request->header('authorization') ?: ''));
            $bearer = str_starts_with(strtolower($authHeader), 'bearer ') ? trim(substr($authHeader, 7)) : '';
            $expectedHmac = hash_hmac('sha256', $rawInput, $configuredSecret);
            $validSig = ($sigHeader !== '' && (hash_equals($configuredSecret, $sigHeader) || hash_equals($expectedHmac, strtolower($sigHeader))))
                || ($bearer !== '' && hash_equals($configuredSecret, $bearer));
            if (!$validSig) {
                Response::unauthorized('Invalid webhook signature.');
            }
        }

        $body = $request->getBody();
        $ref = trim((string)($body['reference'] ?? $body['data']['reference'] ?? $body['request_id'] ?? ''));
        if ($ref === '') {
            Response::error('Reference missing in webhook payload.', 422);
        }

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE provider_reference = :r1 OR payment_reference = :r2 OR request_number = :r3 LIMIT 1',
            ['r1' => $ref, 'r2' => $ref, 'r3' => $ref]
        );
        if (!$row) {
            Response::notFound('No matching modification request found for reference.');
        }

        $prevStatus = (string)$row['status'];
        if (in_array($prevStatus, ['completed', 'refunded'], true)) {
            Response::success(['processed' => false, 'status' => $prevStatus, 'message' => 'Terminal state already recorded.']);
        }

        $statusRaw = strtolower(trim((string)($body['status'] ?? $body['data']['status'] ?? '')));
        $remarks = trim((string)($body['message'] ?? $body['remarks'] ?? $body['data']['remarks'] ?? ''));
        $newStatus = $prevStatus;

        if (in_array($statusRaw, ['completed', 'complete', 'approved', 'success', 'successful'], true)) {
            $newStatus = 'completed';
        } elseif (in_array($statusRaw, ['processing', 'in_progress'], true)) {
            $newStatus = 'processing';
        } elseif (in_array($statusRaw, ['query', 'query_required', 'info_required'], true)) {
            $newStatus = 'query_required';
        } elseif (in_array($statusRaw, ['failed', 'rejected', 'declined', 'error'], true)) {
            $newStatus = 'rejected';
        }

        if (in_array($newStatus, ['failed', 'rejected'], true) && empty($row['refund_reference']) && $prevStatus !== 'completed') {
            $this->issueSingleAtomicRefund((string)$row['id'], $remarks ?: 'Provider webhook reported failure', null, 'refunded');
            $newStatus = 'refunded';
        } else {
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     provider_status = COALESCE(NULLIF(:pst, ""), provider_status),
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     provider_response = :pres,
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id AND status NOT IN ("completed", "refunded")',
                [
                    'st' => $newStatus,
                    'pst' => $statusRaw,
                    'prem' => $remarks,
                    'pres' => json_encode($body),
                    'st2' => $newStatus,
                    'id' => $row['id'],
                ]
            );
        }

        if ($newStatus !== $prevStatus) {
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['identity_type']} Modification Status: " . strtoupper(str_replace('_', ' ', $newStatus)),
                "Update on request {$row['request_number']} ({$row['service_name']}): " . ($remarks ?: "Status changed to {$newStatus}."),
                $newStatus === 'completed' ? 'success' : ($newStatus === 'refunded' || $newStatus === 'query_required' ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
        }

        Response::success(['processed' => true, 'status' => $newStatus]);
    }

    // =========================================================================
    // ADMIN MANAGEMENT ENDPOINTS (Super Admin / Admin)
    // =========================================================================

    /**
     * GET /api/admin/modifications
     */
    public function adminList(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        SchemaSync::syncModificationCatalog($this->db);

        $identityType = strtoupper(trim((string)$request->query('identity_type', 'ALL')));
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $search = trim((string)$request->query('search', ''));
        $page = max(1, (int)$request->query('page', 1));
        $limit = min(100, max(10, (int)$request->query('limit', 25)));
        $offset = ($page - 1) * $limit;

        $where = 'WHERE 1=1 ';
        $params = [];

        if (in_array($identityType, ['NIN', 'BVN'], true)) {
            $where .= 'AND mr.identity_type = :itype ';
            $params['itype'] = $identityType;
        }
        if ($status !== '' && $status !== 'all') {
            $where .= 'AND mr.status = :st ';
            $params['st'] = $status;
        }
        if ($search !== '') {
            $where .= 'AND (mr.request_number LIKE :q1 OR mr.service_name LIKE :q2 OR mr.masked_identifier LIKE :q3 OR mr.payment_reference LIKE :q4 OR mr.provider_reference LIKE :q5 OR u.full_name LIKE :q6 OR u.email LIKE :q7) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
            $params['q4'] = $like;
            $params['q5'] = $like;
            $params['q6'] = $like;
            $params['q7'] = $like;
        }

        $countRow = $this->db->fetchOne(
            "SELECT COUNT(*) as total FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id {$where}",
            $params
        );
        $total = (int)($countRow['total'] ?? 0);

        $idRows = $this->db->fetchAll(
            "SELECT mr.id FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id {$where} ORDER BY mr.created_at DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset,
            $params
        );

        $items = [];
        if (!empty($idRows)) {
            $ids = array_column($idRows, 'id');
            $phs = [];
            $idParams = [];
            foreach ($ids as $idx => $id) {
                $phs[] = ':arid_' . $idx;
                $idParams['arid_' . $idx] = $id;
            }
            $rows = $this->db->fetchAll(
                'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
                 FROM modification_requests mr
                 LEFT JOIN users u ON u.id = mr.user_id
                 WHERE mr.id IN (' . implode(', ', $phs) . ')
                 ORDER BY mr.created_at DESC',
                $idParams
            );
            foreach ($rows as $r) {
                $items[] = $this->formatRequestRow($r, true);
            }
        }

        // Summary KPI counts
        $statsRow = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_all,
                SUM(CASE WHEN identity_type = "NIN" THEN 1 ELSE 0 END) as nin_count,
                SUM(CASE WHEN identity_type = "BVN" THEN 1 ELSE 0 END) as bvn_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "processing" THEN 1 ELSE 0 END) as processing_count,
                SUM(CASE WHEN status = "query_required" THEN 1 ELSE 0 END) as query_count,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status IN ("failed", "rejected") THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = "refunded" THEN 1 ELSE 0 END) as refunded_count,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN customer_price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN provider_cost ELSE 0 END), 0) as total_provider_cost,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN profit ELSE 0 END), 0) as total_margin
             FROM modification_requests'
        );

        Response::success([
            'requests' => $items,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => max(1, (int)ceil($total / $limit)),
            ],
            'stats' => [
                'total_all' => (int)($statsRow['total_all'] ?? 0),
                'nin_count' => (int)($statsRow['nin_count'] ?? 0),
                'bvn_count' => (int)($statsRow['bvn_count'] ?? 0),
                'pending_count' => (int)($statsRow['pending_count'] ?? 0),
                'processing_count' => (int)($statsRow['processing_count'] ?? 0),
                'query_count' => (int)($statsRow['query_count'] ?? 0),
                'completed_count' => (int)($statsRow['completed_count'] ?? 0),
                'failed_count' => (int)($statsRow['failed_count'] ?? 0),
                'refunded_count' => (int)($statsRow['refunded_count'] ?? 0),
                'total_revenue' => (float)($statsRow['total_revenue'] ?? 0),
                'total_provider_cost' => (float)($statsRow['total_provider_cost'] ?? 0),
                'total_margin' => (float)($statsRow['total_margin'] ?? 0),
            ],
        ]);
    }

    /**
     * GET /api/admin/modifications/:id
     */
    public function adminDetail(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id1 OR mr.request_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Modification request not found.');
        }

        Response::success([
            'request' => $this->formatRequestRow($row, true),
        ]);
    }

    /**
     * POST /api/admin/modifications/:id/poll
     */
    public function adminPollStatus(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id LIMIT 1',
            ['id' => $id]
        );
        if (!$row) {
            Response::notFound('Modification request not found.');
        }

        $sync = $this->syncProviderStatusForRow($row, (string)$admin['id']);
        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id LIMIT 1',
            ['id' => $id]
        ) ?: $sync['row'];

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($fresh, true),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    /**
     * POST /api/admin/modifications/:id/update
     */
    public function adminUpdateRequest(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::notFound('Modification request not found.');
        }

        $allowedStatuses = ['pending', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded'];
        $targetStatus = strtolower(trim((string)($body['status'] ?? $row['status'])));
        if (!in_array($targetStatus, $allowedStatuses, true)) {
            Response::error('Invalid target status specified.', 422);
        }

        $remarks = array_key_exists('provider_remarks', $body) ? trim((string)$body['provider_remarks']) : (string)($row['provider_remarks'] ?? '');
        $adminNotes = array_key_exists('admin_notes', $body) ? trim((string)$body['admin_notes']) : (string)($row['admin_notes'] ?? '');
        $etaText = array_key_exists('estimated_completion_text', $body) ? trim((string)$body['estimated_completion_text']) : (string)($row['estimated_completion_text'] ?? '');
        $triggerRefund = !array_key_exists('trigger_refund', $body) || (bool)$body['trigger_refund'];

        $prevStatus = (string)$row['status'];
        $refundRes = null;

        if ($prevStatus === 'completed' && in_array($targetStatus, ['failed', 'rejected', 'refunded'], true)) {
            Response::error('A completed request cannot be transitioned to failed/refunded via quick status update.', 422);
        }

        if (in_array($targetStatus, ['failed', 'rejected', 'refunded'], true) && $triggerRefund) {
            $refundRes = $this->issueSingleAtomicRefund(
                $id,
                $remarks ?: ($adminNotes ?: 'Rejected by administrator'),
                (string)$admin['id'],
                'refunded'
            );
            if ($adminNotes !== '') {
                $this->db->execute('UPDATE modification_requests SET admin_notes = :an WHERE id = :id', ['an' => $adminNotes, 'id' => $id]);
            }
        } else {
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     provider_remarks = :prem,
                     admin_notes = :anotes,
                     estimated_completion_text = :eta,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'st' => $targetStatus,
                    'prem' => $remarks,
                    'anotes' => $adminNotes,
                    'eta' => $etaText,
                    'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'],
                    'st2' => $targetStatus,
                    'id' => $id,
                ]
            );
        }

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id LIMIT 1',
            ['id' => $id]
        );

        $finalStatus = (string)($fresh['status'] ?? $targetStatus);

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_MODIFICATION_UPDATED',
            'service_type' => $row['service_key'],
            'reference' => $row['request_number'],
            'status' => $finalStatus,
            'amount' => (float)$row['customer_price'],
            'metadata' => ['previous_status' => $prevStatus, 'new_status' => $finalStatus, 'refund' => $refundRes],
        ]);

        if ($finalStatus !== $prevStatus || $remarks !== (string)($row['provider_remarks'] ?? '')) {
            $title = "{$row['identity_type']} Modification Update: " . strtoupper(str_replace('_', ' ', $finalStatus));
            $bodyMsg = "Your {$row['service_name']} request ({$row['request_number']}) status is now " . strtoupper(str_replace('_', ' ', $finalStatus)) . ".";
            if ($finalStatus === 'refunded') {
                $bodyMsg .= ' ₦' . number_format((float)$row['customer_price'], 2) . ' has been refunded to your wallet.';
            }
            if ($remarks !== '') {
                $bodyMsg .= " Remarks: {$remarks}";
            }
            $this->notifyCustomer(
                (string)$row['user_id'],
                $title,
                $bodyMsg,
                $finalStatus === 'completed' ? 'success' : ($finalStatus === 'query_required' || $finalStatus === 'refunded' ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $finalStatus, 'service_name' => $row['service_name']]
            );
        }

        Response::success([
            'request' => $fresh ? $this->formatRequestRow($fresh, true) : null,
            'refund' => $refundRes,
        ], 'Modification request updated successfully.');
    }

    /**
     * GET /api/admin/modifications/services
     */
    public function adminServices(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        SchemaSync::syncModificationCatalog($this->db);

        $rows = $this->db->fetchAll(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE c.code IN ("nin_modification", "bvn_modification")
             ORDER BY c.display_order ASC, s.selling_price ASC, s.name ASC'
        );

        $ninMods = [];
        $bvnMods = [];
        foreach ($rows as $row) {
            $formatted = $this->formatServiceRow($row, true);
            if ($formatted['identity_type'] === 'BVN') {
                $bvnMods[] = $formatted;
            } else {
                $ninMods[] = $formatted;
            }
        }

        Response::success([
            'nin_modification' => $ninMods,
            'bvn_modification' => $bvnMods,
            'services' => array_merge($ninMods, $bvnMods),
        ]);
    }

    /**
     * PUT /api/admin/modifications/services/:key
     */
    public function adminUpdateService(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        SchemaSync::syncModificationCatalog($this->db);

        $key = trim((string)($params['key'] ?? ''));
        $body = $request->getBody();

        $existing = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE s.service_key = :sk AND c.code IN ("nin_modification", "bvn_modification")
             LIMIT 1',
            ['sk' => $key]
        );
        if (!$existing) {
            Response::notFound('Modification service not found.');
        }

        $updates = [];
        $dbParams = ['id' => $existing['id']];

        if (isset($body['name']) && trim((string)$body['name']) !== '') {
            $updates[] = 'name = :nm';
            $dbParams['nm'] = trim((string)$body['name']);
        }
        if (array_key_exists('description', $body)) {
            $updates[] = 'description = :desc';
            $dbParams['desc'] = trim((string)$body['description']);
        }
        if (isset($body['selling_price']) || isset($body['price'])) {
            $price = isset($body['selling_price']) ? (float)$body['selling_price'] : (float)$body['price'];
            $updates[] = 'selling_price = :sp';
            $dbParams['sp'] = max(0.0, $price);
        }
        if (isset($body['wholesale_cost'])) {
            $updates[] = 'wholesale_cost = :wc';
            $dbParams['wc'] = max(0.0, (float)$body['wholesale_cost']);
        }
        if (isset($body['is_active']) || isset($body['enabled'])) {
            $active = isset($body['is_active']) ? (bool)$body['is_active'] : (bool)$body['enabled'];
            $updates[] = 'is_active = :act';
            $dbParams['act'] = $active ? 1 : 0;
        }
        if (array_key_exists('manual_label', $body)) {
            $updates[] = 'manual_label = :ml';
            $dbParams['ml'] = trim((string)$body['manual_label']) ?: 'Manual Processing';
        }
        if (array_key_exists('estimated_turnaround', $body)) {
            $updates[] = 'estimated_turnaround = :eta';
            $dbParams['eta'] = trim((string)$body['estimated_turnaround']);
        }
        if (array_key_exists('supported_notes', $body)) {
            $updates[] = 'supported_notes = :notes';
            $dbParams['notes'] = trim((string)$body['supported_notes']);
        }
        if (array_key_exists('endpoint', $body) && trim((string)$body['endpoint']) !== '') {
            $updates[] = 'endpoint = :ep';
            $dbParams['ep'] = trim((string)$body['endpoint']);
        }
        if (array_key_exists('provider_id', $body) && trim((string)$body['provider_id']) !== '') {
            $updates[] = 'provider_id = :pid';
            $dbParams['pid'] = trim((string)$body['provider_id']);
        }
        if (isset($body['required_fields']) && is_array($body['required_fields'])) {
            $cleanReqFields = [];
            foreach ($body['required_fields'] as $rf) {
                $s = trim((string)$rf);
                if ($s !== '') {
                    $cleanReqFields[] = $s;
                }
            }
            $updates[] = 'required_fields = :rf';
            $dbParams['rf'] = json_encode(array_values(array_unique($cleanReqFields)));
        }
        if (isset($body['required_documents']) && is_array($body['required_documents'])) {
            $normalizedDocs = $this->normalizeRequiredDocuments($body['required_documents'], true);
            $updates[] = 'required_documents = :rdoc';
            $dbParams['rdoc'] = json_encode($normalizedDocs);
        }
        if (isset($body['form_schema']) && is_array($body['form_schema'])) {
            $normalizedSchema = $this->normalizeFormSchema($body['form_schema'], true);
            $updates[] = 'form_schema = :fsc';
            $dbParams['fsc'] = json_encode($normalizedSchema);
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $this->db->execute('UPDATE service_catalogue SET ' . implode(', ', $updates) . ' WHERE id = :id', $dbParams);
        }

        $fresh = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code FROM service_catalogue s JOIN service_categories c ON c.id = s.category_id WHERE s.id = :id LIMIT 1',
            ['id' => $existing['id']]
        );

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_MODIFICATION_SERVICE_UPDATED',
            'service_type' => $key,
            'reference' => $key,
            'status' => 'successful',
        ]);

        Response::success([
            'service' => $fresh ? $this->formatServiceRow($fresh, true) : null,
        ], 'Modification service configuration saved.');
    }

    /**
     * GET /api/admin/modifications/bvn-types
     */
    public function adminBvnTypes(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $force = filter_var($request->query('refresh', '0'), FILTER_VALIDATE_BOOLEAN);
        $syncRes = $this->syncOrFetchBvnTypes($force);

        $rows = [];
        foreach ($syncRes['rows'] as $r) {
            $rows[] = [
                'id' => (string)$r['id'],
                'enrollment_type' => (string)$r['enrollment_type'],
                'label' => (string)$r['label'],
                'wholesale_cost' => (float)$r['wholesale_cost'],
                'selling_price' => (float)$r['selling_price'],
                'profit' => round((float)$r['selling_price'] - (float)$r['wholesale_cost'], 2),
                'is_active' => (bool)$r['is_active'],
                'provider_synced_at' => $r['provider_synced_at'] ?? null,
            ];
        }

        Response::success([
            'bvn_types' => $rows,
            'live_synced' => $syncRes['live_synced'],
            'sync_note' => $syncRes['message'],
        ]);
    }

    /**
     * PUT /api/admin/modifications/bvn-types/:id
     */
    public function adminUpdateBvnType(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM modification_bvn_types WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$existing) {
            Response::notFound('BVN modification enrollment type not found.');
        }

        $label = isset($body['label']) && trim((string)$body['label']) !== '' ? trim((string)$body['label']) : (string)$existing['label'];
        $selling = isset($body['selling_price']) ? max(0.0, (float)$body['selling_price']) : (float)$existing['selling_price'];
        $wholesale = isset($body['wholesale_cost']) ? max(0.0, (float)$body['wholesale_cost']) : (float)$existing['wholesale_cost'];
        $isActive = isset($body['is_active']) ? ((bool)$body['is_active'] ? 1 : 0) : (int)$existing['is_active'];

        $this->db->execute(
            'UPDATE modification_bvn_types
             SET label = :lbl, selling_price = :sp, wholesale_cost = :wc, is_active = :act, updated_at = NOW()
             WHERE id = :id',
            [
                'lbl' => $label,
                'sp' => $selling,
                'wc' => $wholesale,
                'act' => $isActive,
                'id' => $id,
            ]
        );

        $fresh = $this->db->fetchOne('SELECT * FROM modification_bvn_types WHERE id = :id LIMIT 1', ['id' => $id]);
        Response::success([
            'bvn_type' => $fresh ? [
                'id' => $fresh['id'],
                'enrollment_type' => $fresh['enrollment_type'],
                'label' => $fresh['label'],
                'wholesale_cost' => (float)$fresh['wholesale_cost'],
                'selling_price' => (float)$fresh['selling_price'],
                'profit' => round((float)$fresh['selling_price'] - (float)$fresh['wholesale_cost'], 2),
                'is_active' => (bool)$fresh['is_active'],
                'provider_synced_at' => $fresh['provider_synced_at'],
            ] : null,
        ], 'BVN enrollment type pricing updated.');
    }

    /**
     * POST /api/admin/modifications/sync-catalog
     * Syncs wholesale costs from live 2SureVerify /services.php and BVN types from /bvn_modification_banks.php
     */
    public function adminSyncCatalog(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        SchemaSync::syncModificationCatalog($this->db, true);

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Response::error('2SureVerify API key is not configured on this server. Local catalog schema was verified, but live provider tariffs require API credentials.', 503);
        }

        $updatedServices = 0;
        $srvRes = $adapter->getServicesCatalog();
        $list = $srvRes['data'] ?? $srvRes['services'] ?? [];
        if (!empty($srvRes['success']) && is_array($list)) {
            $localRows = $this->db->fetchAll(
                'SELECT s.id, s.service_key, s.endpoint FROM service_catalogue s JOIN service_categories c ON c.id = s.category_id WHERE c.code IN ("nin_modification", "bvn_modification")'
            );
            foreach ($list as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $ep = strtolower(trim((string)($entry['endpoint'] ?? $entry['url'] ?? '')));
                $sk = strtolower(trim((string)($entry['service_key'] ?? $entry['key'] ?? $entry['code'] ?? '')));
                $price = $entry['price'] ?? $entry['cost'] ?? $entry['amount'] ?? null;
                if (!is_numeric($price) || (float)$price <= 0) {
                    continue;
                }
                foreach ($localRows as $lr) {
                    $localEp = strtolower((string)$lr['endpoint']);
                    $localSk = strtolower((string)$lr['service_key']);
                    if (($ep !== '' && (str_contains($ep, basename($localEp)) || $ep === $localEp)) || ($sk !== '' && $sk === $localSk)) {
                        $this->db->execute(
                            'UPDATE service_catalogue SET wholesale_cost = :wc, updated_at = NOW() WHERE id = :id',
                            ['wc' => (float)$price, 'id' => $lr['id']]
                        );
                        $updatedServices++;
                    }
                }
            }
        }

        $bvnRes = $this->syncOrFetchBvnTypes(true);

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_MODIFICATION_CATALOG_SYNCED',
            'service_type' => 'modifications',
            'reference' => 'SYNC_' . date('YmdHis'),
            'status' => 'successful',
            'metadata' => [
                'updated_services' => $updatedServices,
                'bvn_types_count' => count($bvnRes['rows'] ?? []),
                'bvn_live_synced' => $bvnRes['live_synced'] ?? false,
            ],
        ]);

        Response::success([
            'updated_services' => $updatedServices,
            'bvn_types_count' => count($bvnRes['rows'] ?? []),
            'bvn_live_synced' => $bvnRes['live_synced'] ?? false,
            'sync_note' => $bvnRes['message'] ?? '',
        ], "Synchronized {$updatedServices} service wholesale tariffs and " . count($bvnRes['rows'] ?? []) . ' BVN enrollment types.');
    }
}
