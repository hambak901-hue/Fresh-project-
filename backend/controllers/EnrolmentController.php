<?php
/**
 * @file EnrolmentController.php
 * Stage 4 — HAMBAK ENROLMENT CENTRE Controller
 *
 * Manages verified 2SureVerify manual NIN Enrolment workflows:
 * - NIN Enrolment (Adult): bvn_enroll_adult -> /api/v1/bvn_enroll_adult.php (₦10,000 wholesale)
 * - NIN Enrolment (Child): bvn_enroll_child -> /api/v1/bvn_enroll_child.php (₦8,000 wholesale)
 *
 * Explicitly preserves NIN Enrolment naming (never miscategorised as BVN Enrolment)
 * and enforces strict unverified-service guardrails for BVN Enrolment & Arrangement
 * until confirmed submission endpoints exist in provider API documentation.
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
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Services\ResultDocumentService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;

class EnrolmentController
{
    private Database $db;
    private WalletService $walletService;

    /**
     * Only confirmed 2SureVerify submission endpoints are permitted for live customer enrolment orders.
     */
    private const VERIFIED_SERVICE_KEYS = [
        'bvn_enroll_adult',
        'bvn_enroll_child',
    ];

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    private function maskDigits(string $val): string
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
        return Security::sanitizeCustomerError($message);
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

    private function getUnverifiedServiceNotices(): array
    {
        return [
            [
                'service_key' => 'unverified_bvn_enrolment',
                'name' => 'BVN Enrolment (Bank-Assisted)',
                'identity_domain' => 'BVN',
                'status' => 'unverified_disabled',
                'reason' => 'Provider API documentation exposes only the read-only helper /api/v1/bvn_enrollment_banks.php (bank list and ₦3,000 fee). No confirmed BVN Enrolment submission endpoint exists on 2SureVerify /api/v1/services.php.',
            ],
            [
                'service_key' => 'unverified_nin_bvn_arrangement',
                'name' => 'NIN / BVN Arrangement',
                'identity_domain' => 'NIN/BVN',
                'status' => 'unverified_disabled',
                'reason' => 'No NIN Arrangement or BVN Arrangement submission endpoint exists in 2SureVerify /api/v1/services.php or API documentation. /api/v1/bvn_modification_banks.php is strictly a helper list for BVN Modification.',
            ],
        ];
    }

    private function fetchSamplesByService(?string $serviceKey = null, bool $activeOnly = true): array
    {
        try {
            $sql = 'SELECT * FROM enrolment_sample_documents WHERE 1=1 ';
            $params = [];
            if ($serviceKey !== null && $serviceKey !== '') {
                $sql .= 'AND service_key = :sk ';
                $params['sk'] = $serviceKey;
            }
            if ($activeOnly) {
                $sql .= 'AND is_active = 1 ';
            }
            $sql .= 'ORDER BY created_at DESC';
            $rows = $this->db->fetchAll($sql, $params);
            $grouped = [];
            foreach ($rows as $r) {
                $sk = (string)$r['service_key'];
                $grouped[$sk][] = [
                    'id' => (string)$r['id'],
                    'service_key' => $sk,
                    'title' => (string)$r['title'],
                    'description' => (string)($r['description'] ?? ''),
                    'original_name' => (string)$r['original_name'],
                    'mime_type' => (string)$r['mime_type'],
                    'file_size' => (int)($r['file_size'] ?? 0),
                    'is_active' => (bool)$r['is_active'],
                    'file_url' => '/api/enrolments/sample/' . $r['id'],
                    'created_at' => $r['created_at'] ?? null,
                ];
            }
            return $serviceKey !== null && $serviceKey !== '' ? ($grouped[$serviceKey] ?? []) : $grouped;
        } catch (Throwable) {
            return [];
        }
    }

    private function formatServiceRow(array $row, bool $isAdmin = false, array $samples = []): array
    {
        $serviceKey = (string)($row['service_key'] ?? $row['key'] ?? '');
        $selling = (float)($row['selling_price'] ?? $row['price'] ?? 0);
        $wholesale = (float)($row['wholesale_cost'] ?? 0);
        $rawDocs = $this->decodeJsonColumn($row['required_documents'] ?? null, []);
        $rawSchema = $this->decodeJsonColumn($row['form_schema'] ?? null, []);
        $endpoint = trim((string)($row['endpoint'] ?? ''));
        $isVerified = in_array($serviceKey, self::VERIFIED_SERVICE_KEYS, true) && $endpoint !== '';

        // Guardrail: never allow misleading BVN label on verified NIN Enrolment endpoints
        $displayName = (string)($row['name'] ?? '');
        if ($serviceKey === 'bvn_enroll_adult' && ($displayName === '' || stripos($displayName, 'bvn') !== false)) {
            $displayName = 'NIN Enrolment (Adult)';
        } elseif ($serviceKey === 'bvn_enroll_child' && ($displayName === '' || stripos($displayName, 'bvn') !== false)) {
            $displayName = 'NIN Enrolment (Child)';
        }

        $formatted = [
            'id' => (string)($row['id'] ?? ''),
            'key' => $serviceKey,
            'service_key' => $serviceKey,
            'category' => 'enrolment',
            'identity_domain' => 'NIN',
            'enrolment_type' => $serviceKey === 'bvn_enroll_child' ? 'NIN_CHILD' : 'NIN_ADULT',
            'name' => $displayName,
            'description' => (string)($row['description'] ?? ''),
            'selling_price' => $selling,
            'price' => $selling,
            'is_active' => $isVerified && (bool)($row['is_active'] ?? true),
            'enabled' => $isVerified && (bool)($row['is_active'] ?? true),
            'verified_provider_service' => $isVerified,
            'processing_type' => 'manual',
            'manual_label' => (string)(!empty($row['manual_label']) ? $row['manual_label'] : 'Manual Processing'),
            'estimated_turnaround' => (string)(!empty($row['estimated_turnaround']) ? $row['estimated_turnaround'] : '3 – 7 Business Days (Manual Processing)'),
            'supported_notes' => (string)($row['supported_notes'] ?? ''),
            'required_fields' => $this->decodeJsonColumn($row['required_fields'] ?? null, []),
            'required_documents' => $this->normalizeRequiredDocuments($rawDocs, $isAdmin),
            'form_schema' => $this->normalizeFormSchema($rawSchema, $isAdmin),
            'sample_documents' => $samples,
            'updated_at' => $row['updated_at'] ?? null,
        ];

        if ($isAdmin) {
            $mappingSpec = TwoSureVerifyAdapter::getEnrolmentMappingSpec($serviceKey, $rawSchema, $rawDocs);
            $formatted['provider_id'] = (string)($row['provider_id'] ?? '2sureverify');
            $formatted['provider'] = $formatted['provider_id'];
            $formatted['endpoint'] = $endpoint;
            $formatted['wholesale_cost'] = $wholesale;
            $formatted['profit'] = round($selling - $wholesale, 2);
            $formatted['margin_percent'] = $selling > 0 ? round((($selling - $wholesale) / $selling) * 100, 1) : 0.0;
            $formatted['provider_schema_verified'] = (bool)($mappingSpec['provider_schema_verified'] ?? false);
            $formatted['payload_mapping'] = $mappingSpec;
        }

        return $formatted;
    }

    private function formatOrderRow(array $row, bool $isAdmin = false): array
    {
        $fields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        foreach (['password', 'pin', 'transaction_pin'] as $secKey) {
            if (isset($fields[$secKey]) && $fields[$secKey] !== '') {
                $fields[$secKey] = '[PROTECTED]';
            }
        }
        $docs = $this->decodeJsonColumn($row['supporting_documents'] ?? null, []);
        $customerPrice = (float)($row['customer_price'] ?? 0);
        $providerCost = (float)($row['provider_cost'] ?? 0);
        $profit = (float)($row['profit'] ?? ($customerPrice - $providerCost));

        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $row, 'enrolment', $isAdmin);

        $item = array_merge([
            'id' => (string)($row['id'] ?? ''),
            'order_number' => (string)($row['order_number'] ?? ''),
            'user_id' => (string)($row['user_id'] ?? ''),
            'enrolment_type' => (string)($row['enrolment_type'] ?? 'NIN_ADULT'),
            'identity_domain' => (string)($row['identity_domain'] ?? 'NIN'),
            'service_key' => (string)($row['service_key'] ?? ''),
            'service_name' => (string)($row['service_name'] ?? ''),
            'applicant_name' => (string)($row['applicant_name'] ?? ''),
            'applicant_phone_masked' => (string)($row['applicant_phone_masked'] ?? ''),
            'submitted_fields' => $fields,
            'supporting_documents' => $docs,
            'customer_price' => $customerPrice,
            'payment_reference' => (string)($row['payment_reference'] ?? ''),
            'refund_reference' => $row['refund_reference'] ?? null,
            'provider_remarks' => $row['provider_remarks'] ?? null,
            'estimated_completion_text' => (string)($row['estimated_completion_text'] ?? '3 – 7 Business Days (Manual Processing)'),
            'status' => (string)($row['status'] ?? 'pending'),
            'reviewed_at' => $row['reviewed_at'] ?? null,
            'completed_at' => $row['completed_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ], $resultMeta);

        if ($isAdmin) {
            $item['provider_reference'] = $row['provider_reference'] ?? null;
            $item['provider_status'] = $row['provider_status'] ?? null;
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
            if (!empty($item['provider_remarks'])) {
                $item['provider_remarks'] = $this->sanitizeCustomerError((string)$item['provider_remarks']);
            }
        }

        return $item;
    }

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
                 VALUES (:id, :uid, :title, "service", :body, 0, :ref, "View Order", "#services", NOW())',
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
                $ordNo = htmlspecialchars((string)($emailMeta['order_number'] ?? $reference), ENT_QUOTES, 'UTF-8');
                $statusLbl = htmlspecialchars(strtoupper((string)($emailMeta['status'] ?? 'PENDING')), ENT_QUOTES, 'UTF-8');
                $srvName = htmlspecialchars((string)($emailMeta['service_name'] ?? 'NIN Enrolment'), ENT_QUOTES, 'UTF-8');

                $html = "<div style=\"font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;\">"
                    . "<div style=\"background:#0f172a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;\">"
                    . "<h2 style=\"margin:0;font-size:18px;\">HAMBAKTECH Enrolment Centre</h2>"
                    . "<p style=\"margin:4px 0 0;color:#94a3b8;font-size:12px;\">Order Reference: {$ordNo}</p>"
                    . "</div>"
                    . "<div style=\"background:#ffffff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;\">"
                    . "<p style=\"margin:0 0 12px;color:#0f172a;font-size:14px;\">Hello {$safeName},</p>"
                    . "<h3 style=\"margin:0 0 10px;color:#0f172a;font-size:16px;\">{$safeTitle}</h3>"
                    . "<p style=\"margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;\">{$safeBody}</p>"
                    . "<div style=\"background:#f1f5f9;padding:12px 16px;border-radius:8px;font-size:12px;color:#334155;margin-bottom:16px;\">"
                    . "<div><strong>Service:</strong> {$srvName}</div>"
                    . "<div><strong>Order Number:</strong> {$ordNo}</div>"
                    . "<div><strong>Current Status:</strong> {$statusLbl}</div>"
                    . "</div>"
                    . "<p style=\"margin:0;color:#64748b;font-size:12px;\">Need assistance? Reply to this email and our support team at support@hambaktech.com.ng will assist you.</p>"
                    . "</div></div>";

                $mailer = new MailService();
                $mailer->send(
                    (string)$u['email'],
                    (string)($u['full_name'] ?: 'Customer'),
                    "HAMBAKTECH: {$title} ({$ordNo})",
                    $html,
                    null,
                    [
                        'from_email' => 'notification@hambaktech.com.ng',
                        'from_name' => 'HAMBAKTECH Notifications',
                        'reply_to' => 'support@hambaktech.com.ng',
                        'audit_action' => 'ENROLMENT_NOTIFICATION_EMAIL',
                    ]
                );
            }
        } catch (Throwable) {
        }
    }

    /**
     * Issue AT MOST ONE atomic refund for a failed or rejected enrolment order.
     */
    private function issueSingleAtomicRefund(string $orderId, string $reason, ?string $actorId = null, string $targetStatus = 'refunded'): array
    {
        return $this->db->withTransaction(function (Database $db) use ($orderId, $reason, $actorId, $targetStatus) {
            $order = $db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id FOR UPDATE', ['id' => $orderId]);
            if (!$order) {
                throw new RuntimeException('Enrolment order not found for refund.');
            }

            if (!empty($order['refund_reference']) || $order['status'] === 'refunded') {
                $wallet = $db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $order['user_id']]);
                return [
                    'refunded' => false,
                    'already_refunded' => true,
                    'refund_reference' => $order['refund_reference'],
                    'balance_after' => $wallet ? (float)$wallet['balance'] : null,
                ];
            }

            if ($order['status'] === 'completed') {
                throw new RuntimeException('Completed enrolment orders cannot be auto-refunded.');
            }

            $refundRef = 'REFUND_' . $order['payment_reference'];
            $amount = (float)$order['customer_price'];

            $existingTx = $db->fetchOne(
                'SELECT id, balance_after FROM transactions WHERE reference = :ref LIMIT 1',
                ['ref' => $refundRef]
            );

            $balanceAfter = null;
            $refundConfirmed = false;
            if ($existingTx) {
                $balanceAfter = (float)$existingTx['balance_after'];
                $refundConfirmed = true;
            } elseif ($amount > 0) {
                try {
                    $creditRes = $this->walletService->credit(
                        (string)$order['user_id'],
                        $amount,
                        'enrolment_refund',
                        $refundRef,
                        "Refund for {$order['service_name']} ({$order['order_number']})",
                        'internal',
                        [
                            'enrolment_order_id' => $order['id'],
                            'order_number' => $order['order_number'],
                            'payment_reference' => $order['payment_reference'],
                            'actor_id' => $actorId,
                        ]
                    );
                    $verifiedTx = $db->fetchOne(
                        'SELECT id, balance_after FROM transactions WHERE reference = :ref AND user_id = :uid AND type = "credit" AND status = "successful" LIMIT 1',
                        ['ref' => $refundRef, 'uid' => (string)$order['user_id']]
                    );
                    if ($verifiedTx) {
                        $balanceAfter = (float)$verifiedTx['balance_after'];
                        $refundConfirmed = true;
                    } elseif (isset($creditRes['balance_after'])) {
                        $balanceAfter = (float)$creditRes['balance_after'];
                        $refundConfirmed = true;
                    }
                } catch (Throwable $refundEx) {
                    Security::logPrivateError('EnrolmentRefund', $refundEx, [
                        'enrolment_order_id' => $order['id'],
                        'refund_reference' => $refundRef,
                        'user_id' => $order['user_id'],
                    ]);
                    $refundConfirmed = false;
                }
            }

            $finalStatus = $refundConfirmed
                ? (in_array($targetStatus, ['failed', 'rejected', 'refunded'], true) ? $targetStatus : 'refunded')
                : 'failed';
            $safeRem = Security::sanitizeCustomerError($reason, '');
            $db->execute(
                'UPDATE enrolment_orders
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
                    'rref' => $refundConfirmed ? $refundRef : null,
                    'rem' => $safeRem,
                    'rby' => $actorId,
                    'rby2' => $actorId,
                    'id' => $order['id'],
                ]
            );

            return [
                'refunded' => $refundConfirmed,
                'refund_pending' => !$refundConfirmed,
                'already_refunded' => false,
                'refund_reference' => $refundRef,
                'balance_after' => $balanceAfter,
            ];
        });
    }

    /**
     * GET /api/enrolments/services
     * Returns strictly verified and enabled NIN Enrolment services (Adult & Child).
     */
    public function services(Request $request): void
    {
        SchemaSync::syncEnrolmentCatalog($this->db);
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $rows = $this->db->fetchAll(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE c.code = "enrolment"
               AND s.is_active = 1
               AND s.service_key IN ("bvn_enroll_adult", "bvn_enroll_child")
             ORDER BY s.selling_price DESC, s.name ASC'
        );

        $samplesByService = $this->fetchSamplesByService(null, true);
        $services = [];
        foreach ($rows as $row) {
            if (empty(trim((string)($row['endpoint'] ?? '')))) {
                continue;
            }
            $sk = (string)$row['service_key'];
            $services[] = $this->formatServiceRow($row, $isAdmin, $samplesByService[$sk] ?? []);
        }

        Response::success([
            'services' => $services,
            'count' => count($services),
        ]);
    }

    /**
     * POST /api/enrolments/upload-document
     */
    public function uploadDocument(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $docKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('doc_key', 'enrolment_doc')) ?: 'enrolment_doc';
        $serviceKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('service_key', ''));

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Please attach a valid supporting document file.', 422);
        }

        $maxSizeMb = 5;
        $configuredFormats = ['JPG', 'PNG', 'WEBP', 'PDF'];
        if ($serviceKey !== '') {
            $srv = $this->db->fetchOne(
                'SELECT s.required_documents FROM service_catalogue s
                 JOIN service_categories c ON c.id = s.category_id
                 WHERE s.service_key = :sk AND c.code = "enrolment"
                 LIMIT 1',
                ['sk' => $serviceKey]
            );
            if ($srv) {
                $docsSpec = $this->decodeJsonColumn($srv['required_documents'] ?? null, []);
                foreach ($docsSpec as $ds) {
                    if (is_array($ds) && (string)($ds['key'] ?? '') === $docKey) {
                        if (!empty($ds['accepted_formats']) && is_array($ds['accepted_formats'])) {
                            $configuredFormats = array_values(array_filter(array_map('strtoupper', $ds['accepted_formats'])));
                        }
                        if (!empty($ds['max_size_mb']) && is_numeric($ds['max_size_mb'])) {
                            $maxSizeMb = max(1, min(25, (int)$ds['max_size_mb']));
                        }
                        break;
                    }
                }
            }
        }

        $safeExtMimeMap = [
            'jpg'  => ['exts' => ['jpg', 'jpeg'], 'mime' => 'image/jpeg'],
            'jpeg' => ['exts' => ['jpg', 'jpeg'], 'mime' => 'image/jpeg'],
            'png'  => ['exts' => ['png'], 'mime' => 'image/png'],
            'webp' => ['exts' => ['webp'], 'mime' => 'image/webp'],
            'pdf'  => ['exts' => ['pdf'], 'mime' => 'application/pdf'],
        ];
        $allowedExts = [];
        $allowedMimes = [];
        foreach ($configuredFormats as $fmt) {
            $lf = strtolower(trim((string)$fmt));
            if (isset($safeExtMimeMap[$lf])) {
                foreach ($safeExtMimeMap[$lf]['exts'] as $e) {
                    $allowedExts[] = $e;
                }
                $allowedMimes[] = $safeExtMimeMap[$lf]['mime'];
            }
        }
        $allowedExts = array_values(array_unique($allowedExts ?: ['jpg', 'jpeg', 'png', 'webp', 'pdf']));
        $allowedMimes = array_values(array_unique($allowedMimes ?: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']));

        $file = $_FILES['file'];
        if ((int)$file['size'] > $maxSizeMb * 1024 * 1024) {
            Response::error("Document file must not exceed {$maxSizeMb}MB.", 422);
        }

        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Invalid file format. Accepted formats: ' . implode(', ', $configuredFormats) . '.', 422);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mime, $allowedMimes, true)) {
            Response::error('Document file signature validation failed.', 422);
        }

        $storageDir = dirname(__DIR__) . '/storage/uploads';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
        }
        $htaccessPath = $storageDir . '/.htaccess';
        if (!is_file($htaccessPath)) {
            @file_put_contents(
                $htaccessPath,
                "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n"
            );
        }

        $docId = Security::generateUuid();
        $storedName = 'enr_' . $docKey . '_' . time() . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
        $destPath = $storageDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to store uploaded document securely.', 500);
        }

        $fileUrl = '/api/enrolments/document/' . $docId;
        $this->db->execute(
            'INSERT INTO uploaded_documents (id, user_id, document_type, original_name, stored_name, mime_type, file_size, file_path, file_url, created_at)
             VALUES (:id, :uid, :dtype, :oname, :sname, :mime, :sz, :fpath, :furl, NOW())',
            [
                'id' => $docId,
                'uid' => $user['id'],
                'dtype' => 'enrolment_' . $docKey,
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
     * GET /api/enrolments/document/:id
     */
    public function getDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $docId = trim((string)($params['id'] ?? ''));

        $doc = $this->db->fetchOne('SELECT * FROM uploaded_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        if (!$doc) {
            Response::notFound('Supporting document not found.');
        }

        $isStaff = Auth::isAdmin($user) && Auth::hasPermission($user, 'services');
        if (!$isStaff && $doc['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to document.');
        }

        $storageBase = realpath(dirname(__DIR__) . '/storage');
        $path = realpath((string)($doc['file_path'] ?? ''));
        if ($storageBase === false || $path === false || !str_starts_with($path, $storageBase . DIRECTORY_SEPARATOR) || !is_file($path)) {
            Response::notFound('Document file missing from storage.');
        }

        $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename((string)($doc['original_name'] ?? 'document'))) ?: 'document';

        header('Content-Type: ' . ($doc['mime_type'] ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . $safeName . '"');
        header('Cache-Control: private, no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        readfile($path);
        exit;
    }

    /**
     * GET /api/enrolments/:id/result-document
     */
    public function downloadResultDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $forceDownload = in_array((string)$request->query('download', ''), ['1', 'true', 'yes'], true);
        ResultDocumentService::streamResultDocument($this->db, $user, 'enrolment', $id, $forceDownload);
    }

    /**
     * GET /api/enrolments/sample/:id
     */
    public function getSampleDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isStaff = Auth::isAdmin($user) && Auth::hasPermission($user, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $sample = $this->db->fetchOne('SELECT * FROM enrolment_sample_documents WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$sample || (!$isStaff && empty($sample['is_active']))) {
            Response::notFound('Sample document not found.');
        }

        $storageBase = realpath(dirname(__DIR__) . '/storage');
        $path = realpath((string)($sample['file_path'] ?? ''));
        if ($storageBase === false || $path === false || !str_starts_with($path, $storageBase . DIRECTORY_SEPARATOR) || !is_file($path)) {
            Response::notFound('Sample document file missing from storage.');
        }

        $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename((string)($sample['original_name'] ?? 'sample'))) ?: 'sample';

        header('Content-Type: ' . ($sample['mime_type'] ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . $safeName . '"');
        header('Cache-Control: private, no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        readfile($path);
        exit;
    }

    /**
     * POST /api/enrolments/submit
     */
    public function submit(Request $request): void
    {
        SchemaSync::syncEnrolmentCatalog($this->db);

        $user = Auth::requireVerifiedEmail($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $body = $request->getBody();

        // 1. Consent & idempotency checks first
        if (empty($body['consent'])) {
            Response::error('You must accept the applicant authorization and declaration checkbox before submitting.', 422);
        }

        $idempotencyKey = trim((string)($body['idempotency_key'] ?? ''));
        if ($idempotencyKey !== '') {
            $existingIdemp = $this->db->fetchOne(
                'SELECT * FROM enrolment_orders WHERE user_id = :uid AND idempotency_key = :ikey LIMIT 1',
                ['uid' => $user['id'], 'ikey' => substr($idempotencyKey, 0, 120)]
            );
            if ($existingIdemp) {
                $wallet = $this->db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $user['id']]);
                Response::success([
                    'idempotent_replay' => true,
                    'order' => $this->formatOrderRow($existingIdemp, $isAdmin),
                    'balance_after' => $wallet ? (float)$wallet['balance'] : null,
                ], 'NIN Enrolment order already submitted.');
            }
        }

        // 2. Verified service check
        $serviceKey = trim((string)($body['service_key'] ?? ''));
        if ($serviceKey === '' || !in_array($serviceKey, self::VERIFIED_SERVICE_KEYS, true)) {
            Response::error('Please select a verified NIN Enrolment service (NIN Enrolment Adult or Child). Unverified enrolment services cannot be submitted.', 422);
        }

        $serviceRow = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE s.service_key = :sk AND c.code = "enrolment"
             LIMIT 1',
            ['sk' => $serviceKey]
        );
        if (!$serviceRow) {
            Response::error('Selected enrolment service does not exist.', 404);
        }
        if (empty($serviceRow['is_active'])) {
            Response::error('This NIN Enrolment service is currently disabled by administration.', 503);
        }
        $endpoint = trim((string)($serviceRow['endpoint'] ?? ''));
        if ($endpoint === '') {
            Security::logPrivateError('EnrolmentSubmitConfig', 'Enrolment service has no verified endpoint configured', ['service_key' => $serviceKey]);
            Response::error(Security::ERR_PROVIDER_AUTH, 503);
        }

        // 3. Validate all fields against service schema
        $rawFields = is_array($body['fields'] ?? null) ? $body['fields'] : $body;
        $formSchema = $this->decodeJsonColumn($serviceRow['form_schema'] ?? null, []);
        $requiredFieldKeys = $this->decodeJsonColumn($serviceRow['required_fields'] ?? null, []);
        $requiredDocsSchema = $this->decodeJsonColumn($serviceRow['required_documents'] ?? null, []);

        $submittedFields = [];
        foreach ($formSchema as $fDef) {
            if (!is_array($fDef) || empty($fDef['key'])) {
                continue;
            }
            $fk = (string)$fDef['key'];
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
                } elseif (($fDef['type'] ?? '') === 'date') {
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $val)) {
                        Response::error(($fDef['label'] ?? 'Date of Birth') . ' must be in YYYY-MM-DD format.', 422);
                    }
                    $parts = explode('-', $val);
                    if (!checkdate((int)$parts[1], (int)$parts[2], (int)$parts[0]) || $val > date('Y-m-d')) {
                        Response::error(($fDef['label'] ?? 'Date of Birth') . ' must be a valid calendar date not in the future.', 422);
                    }
                } elseif (($fDef['type'] ?? '') === 'select' && !empty($fDef['options']) && is_array($fDef['options'])) {
                    $allowedOptions = array_map(static fn ($opt) => (string)($opt['value'] ?? ''), $fDef['options']);
                    if (!in_array($val, $allowedOptions, true)) {
                        Response::error('Invalid selection for ' . ($fDef['label'] ?? $fk) . '.', 422);
                    }
                }
                $submittedFields[$fk] = $val;
            }
        }

        foreach ($requiredFieldKeys as $rk) {
            $rkStr = (string)$rk;
            if (!isset($submittedFields[$rkStr]) || trim((string)$submittedFields[$rkStr]) === '') {
                if (isset($rawFields[$rkStr]) && trim((string)$rawFields[$rkStr]) !== '') {
                    $submittedFields[$rkStr] = trim((string)$rawFields[$rkStr]);
                } else {
                    Response::error("Missing required field: {$rkStr}.", 422);
                }
            }
        }

        // 4. Validate uploaded supporting documents ownership & required documents
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
                $ph = ':edid_' . $idx;
                $placeholders[] = $ph;
                $qParams['edid_' . $idx] = $did;
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
                $dKey = $docKeyMap[$dr['id']] ?? str_replace('enrolment_', '', (string)$dr['document_type']);
                $attachedFiles[] = [
                    'id' => $dr['id'],
                    'doc_key' => $dKey,
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_path' => $filePath,
                    'file_url' => '/api/enrolments/document/' . $dr['id'],
                ];
                $storedDocsMeta[] = [
                    'id' => $dr['id'],
                    'doc_key' => $dKey,
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_size' => (int)($dr['file_size'] ?? 0),
                    'file_url' => '/api/enrolments/document/' . $dr['id'],
                ];
            }
        }

        $uploadedDocKeys = array_column($storedDocsMeta, 'doc_key');
        foreach ($requiredDocsSchema as $reqDoc) {
            if (!empty($reqDoc['required'])) {
                $rKey = (string)($reqDoc['key'] ?? '');
                if ($rKey !== '' && !in_array($rKey, $uploadedDocKeys, true)) {
                    Response::error('Please upload required supporting document: ' . ($reqDoc['label'] ?? $rKey), 422);
                }
            }
        }

        // 5. Account status, security policy & Transaction PIN verification BEFORE debit
        $userRow = $this->db->fetchOne(
            'SELECT id, email, full_name, status, kyc_level, tier, transaction_pin_hash FROM users WHERE id = :id LIMIT 1',
            ['id' => $user['id']]
        );
        if (!$userRow || ($userRow['status'] ?? 'active') !== 'active') {
            Response::forbidden('Your account is currently not permitted to submit enrolment orders.');
        }

        try {
            $secRule = $this->db->fetchOne(
                'SELECT * FROM service_security_rules WHERE service_key IN (:sk1, "enrolment", "nin_enrolment") AND is_active = 1 ORDER BY CASE WHEN service_key = :sk2 THEN 0 ELSE 1 END LIMIT 1',
                ['sk1' => $serviceKey, 'sk2' => $serviceKey]
            );
            if ($secRule) {
                $minKyc = (int)($secRule['min_kyc_level'] ?? $secRule['min_tier'] ?? 1);
                $userKyc = (int)($userRow['kyc_level'] ?? $userRow['tier'] ?? 1);
                if ($userKyc < $minKyc) {
                    Response::error("KYC Tier {$minKyc} is required before submitting this NIN Enrolment order.", 403);
                }
            }
        } catch (Throwable) {
        }

        $pinService = new PinSecurityService($this->db);
        $pinService->requireValidPin($userRow, $body, 'identity_enrolment', $serviceKey);

        // 6. Pricing check
        $customerPrice = (float)$serviceRow['selling_price'];
        $expectedWholesale = (float)$serviceRow['wholesale_cost'];
        if ($customerPrice <= 0) {
            Response::error('Service pricing is not yet configured. Please contact support.', 422);
        }

        $applicantName = trim(implode(' ', array_filter([
            $submittedFields['first_name'] ?? '',
            $submittedFields['middle_name'] ?? '',
            $submittedFields['last_name'] ?? '',
        ]))) ?: 'Applicant';
        $maskedPhone = $this->maskDigits((string)($submittedFields['phone'] ?? ''));

        $enrolmentTypeEnum = $serviceKey === 'bvn_enroll_child' ? 'NIN_CHILD' : 'NIN_ADULT';
        $displayServiceName = $serviceKey === 'bvn_enroll_child' ? 'NIN Enrolment (Child)' : 'NIN Enrolment (Adult)';
        if (!empty($serviceRow['name']) && stripos((string)$serviceRow['name'], 'bvn') === false) {
            $displayServiceName = (string)$serviceRow['name'];
        }

        $orderId = Security::generateUuid();
        $orderNumber = 'ENR-NIN-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $paymentRef = 'ENRPAY_' . date('YmdHis') . '_' . strtoupper(bin2hex(random_bytes(4)));
        $etaText = (string)(!empty($serviceRow['estimated_turnaround']) ? $serviceRow['estimated_turnaround'] : '3 – 7 Business Days (Manual Processing)');
        $providerId = (string)($serviceRow['provider_id'] ?: '2sureverify');

        // 7. Atomic Wallet Debit + Persist enrolment_orders inside DB transaction
        try {
            $debitResult = $this->db->withTransaction(function (Database $db) use (
                $user,
                $customerPrice,
                $paymentRef,
                $displayServiceName,
                $applicantName,
                $maskedPhone,
                $orderNumber,
                $orderId,
                $enrolmentTypeEnum,
                $serviceKey,
                $submittedFields,
                $storedDocsMeta,
                $expectedWholesale,
                $providerId,
                $endpoint,
                $idempotencyKey,
                $etaText
            ) {
                $debitRes = $this->walletService->debit(
                    (string)$user['id'],
                    $customerPrice,
                    'nin_enrolment',
                    $paymentRef,
                    "{$displayServiceName} — {$applicantName} [{$orderNumber}]",
                    'internal',
                    [
                        'enrolment_order_id' => $orderId,
                        'order_number' => $orderNumber,
                        'service_key' => $serviceKey,
                        'enrolment_type' => $enrolmentTypeEnum,
                        'identity_domain' => 'NIN',
                    ]
                );

                $db->execute(
                    'INSERT INTO enrolment_orders
                     (id, order_number, user_id, enrolment_type, identity_domain, service_key, service_name, applicant_name, applicant_phone_masked,
                      submitted_fields, supporting_documents, customer_price, provider_cost, profit, provider_id, endpoint, payment_reference, idempotency_key,
                      estimated_completion_text, status, created_at)
                     VALUES
                     (:id, :ono, :uid, :etype, "NIN", :sk, :snm, :aname, :aphone,
                      :sfields, :sdocs, :cprice, :pcost, :profit, :pid, :ep, :pref, :ikey,
                      :eta, "pending", NOW())',
                    [
                        'id' => $orderId,
                        'ono' => $orderNumber,
                        'uid' => $user['id'],
                        'etype' => $enrolmentTypeEnum,
                        'sk' => $serviceKey,
                        'snm' => $displayServiceName,
                        'aname' => $applicantName,
                        'aphone' => $maskedPhone,
                        'sfields' => json_encode($submittedFields),
                        'sdocs' => json_encode($storedDocsMeta),
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
        } catch (Throwable $e) {
            $errMsg = Security::sanitizeWalletDebitError($e);
            $status = Security::isCustomerWalletInsufficient($e) ? 400 : 500;
            Response::error($errMsg, $status);
        }

        // 8. Dispatch to 2SureVerify via X-Api-Key and explicit NIN Enrolment field/file mapping
        $adapter = new TwoSureVerifyAdapter();
        $providerRes = $adapter->submitEnrolment(
            $endpoint,
            $submittedFields,
            $attachedFiles,
            $paymentRef,
            $serviceKey,
            $formSchema,
            $requiredDocsSchema
        );

        $provRef = (string)($providerRes['reference'] ?? $paymentRef);
        $actualCost = !empty($providerRes['provider_cost']) && (float)$providerRes['provider_cost'] > 0
            ? (float)$providerRes['provider_cost']
            : $expectedWholesale;
        $actualProfit = round($customerPrice - $actualCost, 2);
        $provMsg = (string)($providerRes['message'] ?? '');

        // 9. Manual NIN Enrolment MUST remain pending until provider/admin confirms completion
        if (!empty($providerRes['pending']) || !empty($providerRes['success'])) {
            $provStatus = (string)($providerRes['provider_status'] ?? 'pending');

            $this->db->execute(
                'UPDATE enrolment_orders
                 SET provider_reference = :pr,
                     provider_status = :pst,
                     provider_remarks = :prem,
                     provider_response = :pres,
                     provider_cost = :pcost,
                     profit = :profit,
                     status = "pending",
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'pr' => $provRef,
                    'pst' => $provStatus,
                    'prem' => $provMsg,
                    'pres' => json_encode($providerRes['raw'] ?? $providerRes),
                    'pcost' => $actualCost,
                    'profit' => $actualProfit,
                    'id' => $orderId,
                ]
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'NIN_ENROLMENT_SUBMITTED',
                'service_type' => $serviceKey,
                'reference' => $orderNumber,
                'provider' => $providerId,
                'status' => 'pending',
                'amount' => $customerPrice,
                'metadata' => [
                    'enrolment_type' => $enrolmentTypeEnum,
                    'payment_reference' => $paymentRef,
                    'provider_reference' => $provRef,
                ],
            ]);

            $this->notifyCustomer(
                (string)$user['id'],
                "{$displayServiceName} Order Submitted",
                "Your {$displayServiceName} order ({$orderNumber}) for {$applicantName} has been submitted for Manual Processing. Estimated turnaround: {$etaText}.",
                'info',
                $orderNumber,
                ['order_number' => $orderNumber, 'status' => 'pending', 'service_name' => $displayServiceName]
            );

            $savedRow = $this->db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id LIMIT 1', ['id' => $orderId]);
            $payload = [
                'order' => $savedRow ? $this->formatOrderRow($savedRow, $isAdmin) : null,
                'pending' => true,
                'status' => 'pending',
                'balance_after' => $debitResult['balance_after'] ?? null,
                'newBalance' => $debitResult['balance_after'] ?? null,
                'payment_reference' => $paymentRef,
            ];
            if ($isAdmin) {
                $payload['provider_reference'] = $provRef;
            }

            Response::success($payload, "{$displayServiceName} order submitted for manual processing. Track live status updates in your Enrolment Order History.");
        }

        // 10. Confirmed immediate provider rejection/failure -> issue AT MOST ONE atomic refund
        $refundRes = $this->issueSingleAtomicRefund(
            $orderId,
            $provMsg ?: 'NIN Enrolment submission rejected by provider.',
            null,
            'refunded'
        );
        $refundConfirmed = !empty($refundRes['refunded']);

        Security::logPrivateError('EnrolmentSubmitFailed', $provMsg ?: 'Provider rejected enrolment order', [
            'user_id' => $user['id'],
            'service_key' => $serviceKey,
            'order_number' => $orderNumber,
            'provider' => $providerId,
            'refund_confirmed' => $refundConfirmed,
        ]);

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'service',
            'action' => $refundConfirmed ? 'NIN_ENROLMENT_FAILED_REFUNDED' : 'NIN_ENROLMENT_FAILED',
            'service_type' => $serviceKey,
            'reference' => $orderNumber,
            'provider' => $providerId,
            'status' => $refundConfirmed ? 'refunded' : 'failed',
            'amount' => $customerPrice,
            'error_message' => $provMsg,
            'metadata' => [
                'refund_reference' => $refundRes['refund_reference'] ?? null,
                'refund_confirmed' => $refundConfirmed,
            ],
        ]);

        $this->notifyCustomer(
            (string)$user['id'],
            $refundConfirmed ? "{$displayServiceName} Failed & Refunded" : "{$displayServiceName} Failed",
            $refundConfirmed
                ? "Your {$displayServiceName} order ({$orderNumber}) could not be accepted. Your wallet has been refunded."
                : "Your {$displayServiceName} order ({$orderNumber}) could not be accepted. Your refund is being processed.",
            'warning',
            $orderNumber,
            ['order_number' => $orderNumber, 'status' => $refundConfirmed ? 'refunded' : 'failed', 'service_name' => $displayServiceName]
        );

        $errMsg = $refundConfirmed ? Security::ERR_TXN_REFUNDED : Security::ERR_TXN_REFUND_PENDING;
        Response::error(
            $errMsg,
            502,
            [
                'refunded' => $refundConfirmed,
                'refund_pending' => !$refundConfirmed,
                'refund_reference' => $refundRes['refund_reference'] ?? null,
                'balance_after' => $refundRes['balance_after'] ?? null,
                'newBalance' => $refundRes['balance_after'] ?? null,
                'order_number' => $orderNumber,
            ]
        );
    }

    /**
     * GET /api/enrolments/history
     */
    public function history(Request $request): void
    {
        SchemaSync::syncEnrolmentCatalog($this->db);

        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $search = trim((string)$request->query('search', ''));
        $limit = min(100, max(1, (int)$request->query('limit', 40)));

        $where = 'WHERE user_id = :uid ';
        $params = ['uid' => $user['id']];

        if ($status !== '' && $status !== 'all') {
            $where .= 'AND status = :st ';
            $params['st'] = $status;
        }
        if ($search !== '') {
            $where .= 'AND (order_number LIKE :q1 OR service_name LIKE :q2 OR applicant_name LIKE :q3 OR payment_reference LIKE :q4) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
            $params['q4'] = $like;
        }

        // Two-step deferred ID fetch to minimize MySQL sort buffer memory usage
        $idRows = $this->db->fetchAll(
            "SELECT id FROM enrolment_orders {$where} ORDER BY created_at DESC LIMIT " . (int)$limit,
            $params
        );

        $rows = [];
        if (!empty($idRows)) {
            $ids = array_column($idRows, 'id');
            $phs = [];
            $idParams = [];
            foreach ($ids as $idx => $id) {
                $ph = ':eid_' . $idx;
                $phs[] = $ph;
                $idParams['eid_' . $idx] = $id;
            }
            $rows = $this->db->fetchAll(
                'SELECT * FROM enrolment_orders WHERE id IN (' . implode(', ', $phs) . ') ORDER BY created_at DESC',
                $idParams
            );
        }

        $formatted = [];
        foreach ($rows as $r) {
            $formatted[] = $this->formatOrderRow($r, $isAdmin);
        }

        Response::success([
            'count' => count($formatted),
            'orders' => $formatted,
        ]);
    }

    /**
     * GET /api/enrolments/:id/status
     */
    public function orderStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM enrolment_orders WHERE id = :id1 OR order_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Enrolment order not found.');
        }
        if (!$isAdmin && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to enrolment order.');
        }

        Response::success([
            'order' => $this->formatOrderRow($row, $isAdmin),
        ]);
    }

    private function syncProviderStatusForRow(array $row, ?string $actorId = null): array
    {
        $lookupRef = trim((string)($row['provider_reference'] ?: $row['payment_reference']));
        if ($lookupRef === '') {
            return ['updated' => false, 'message' => 'No provider reference attached to this order.', 'row' => $row];
        }

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Security::logPrivateError('EnrolmentPollStatus', 'Live provider credentials not configured on host', [
                'order_id' => $row['id'] ?? null,
            ]);
            return ['updated' => false, 'message' => Security::ERR_PROVIDER_AUTH, 'row' => $row];
        }

        $res = $adapter->checkStatus($lookupRef);
        $rawStatus = strtolower(trim((string)($res['data']['status'] ?? $res['order_status'] ?? $res['status'] ?? '')));
        $remarks = trim((string)($res['message'] ?? $res['remarks'] ?? $res['data']['remarks'] ?? $res['data']['message'] ?? ''));

        $isLookupError = empty($res['success']) && (
            $rawStatus === ''
            || $rawStatus === 'error'
            || $rawStatus === 'unconfigured'
            || ((int)($res['code'] ?? 0) >= 400)
            || stripos($remarks, 'not found') !== false
            || stripos($remarks, 'no record') !== false
            || stripos($remarks, 'invalid reference') !== false
        );

        if ($isLookupError || ($rawStatus === '' && empty($res['success']))) {
            Security::logPrivateError('EnrolmentPollStatus', $remarks ?: 'Invalid/empty status response', [
                'order_id' => $row['id'] ?? null,
                'raw_status' => $rawStatus,
            ]);
            return [
                'updated' => false,
                'message' => Security::ERR_PROVIDER_UNAVAILABLE,
                'row' => $row,
            ];
        }

        $prevStatus = (string)$row['status'];
        $isTerminal = in_array($prevStatus, ['completed', 'refunded'], true);
        $newStatus = $prevStatus;

        if (!$isTerminal) {
            if (in_array($rawStatus, ['completed', 'complete', 'approved', 'success', 'successful', 'done', 'delivered'], true)) {
                $newStatus = 'completed';
            } elseif (in_array($rawStatus, ['processing', 'in_progress', 'in-progress', 'reviewing'], true)) {
                $newStatus = 'processing';
            } elseif (in_array($rawStatus, ['query', 'query_required', 'info_required', 'action_required'], true)) {
                $newStatus = 'query_required';
            } elseif (in_array($rawStatus, ['pending', 'queued', 'submitted'], true)) {
                $newStatus = 'pending';
            } elseif (($rawStatus === 'refunded' || in_array($rawStatus, ['failed', 'rejected', 'declined', 'cancelled', 'canceled'], true)) && !empty($res['success'])) {
                $newStatus = 'rejected';
            }
        }

        $refundInfo = null;
        if (!$isTerminal && in_array($newStatus, ['failed', 'rejected'], true) && empty($row['refund_reference'])) {
            $refundInfo = $this->issueSingleAtomicRefund(
                (string)$row['id'],
                $remarks ?: 'Provider marked order as ' . $newStatus,
                $actorId,
                'refunded'
            );
            $newStatus = !empty($refundInfo['refunded']) ? 'refunded' : 'failed';
        } elseif (!$isTerminal) {
            $this->db->execute(
                'UPDATE enrolment_orders
                 SET status = :st,
                     provider_status = :pst,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     provider_response = :pres,
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id AND status NOT IN ("completed", "refunded")',
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

        if ($newStatus === 'completed' || $prevStatus === 'completed') {
            $freshForDoc = $this->db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;
            ResultDocumentService::syncFromProviderPayload($this->db, 'enrolment', $freshForDoc, $res, $adapter->getAuthHeaders());
        }

        $updatedRow = $this->db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;

        if ($newStatus !== $prevStatus) {
            $safeRemarks = $remarks !== '' ? Security::sanitizeCustomerError($remarks, '') : '';
            $titleMap = [
                'processing' => "{$row['service_name']} In Processing",
                'query_required' => "{$row['service_name']}: Additional Info Required",
                'completed' => "{$row['service_name']} Completed",
                'refunded' => "{$row['service_name']} Rejected & Refunded",
                'failed' => "{$row['service_name']} Failed",
            ];
            $msgMap = [
                'processing' => "Your {$row['service_name']} order ({$row['order_number']}) is now actively processing." . ($safeRemarks ? " Note: {$safeRemarks}" : ''),
                'query_required' => "Action required for {$row['order_number']}: " . ($safeRemarks ?: 'Please contact support with requested details/documents.'),
                'completed' => "Great news! Your {$row['service_name']} order ({$row['order_number']}) has been completed." . (!empty($updatedRow['result_document_id']) ? ' Your official result PDF is now ready in your portal.' : ($safeRemarks ? " Details: {$safeRemarks}" : '')),
                'refunded' => "Your {$row['service_name']} order ({$row['order_number']}) was not approved and ₦" . number_format((float)$row['customer_price'], 2) . " has been refunded to your wallet.",
                'failed' => "Your {$row['service_name']} order ({$row['order_number']}) could not be completed. Your refund is being processed.",
            ];
            $this->notifyCustomer(
                (string)$row['user_id'],
                $titleMap[$newStatus] ?? 'Enrolment Order Status Updated',
                $msgMap[$newStatus] ?? "Status changed to {$newStatus}.",
                $newStatus === 'completed' ? 'success' : (in_array($newStatus, ['query_required', 'refunded', 'failed'], true) ? 'warning' : 'info'),
                (string)$row['order_number'],
                ['order_number' => $row['order_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
            try {
                $refEngine = new ReferralEngineService($this->db);
                $srcRef = (string)($row['payment_reference'] ?: $row['order_number']);
                if ($newStatus === 'completed') {
                    $refEngine->recordQualifyingTransaction([
                        'user_id' => (string)$row['user_id'],
                        'service_category' => 'enrolment',
                        'service_key' => (string)$row['service_key'],
                        'source_reference' => $srcRef,
                        'gross_amount' => (float)$row['customer_price'],
                        'wholesale_cost' => (float)$row['provider_cost'],
                        'gateway_fee' => 0.0,
                    ]);
                } elseif ($newStatus === 'refunded') {
                    $refEngine->reverseRewardsForSource($srcRef, 'Enrolment order refunded on poll', $actorId);
                }
            } catch (Throwable) {
            }
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
     * POST /api/enrolments/:id/poll
     */
    public function pollStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isStaff = Auth::isAdmin($user) && Auth::hasPermission($user, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM enrolment_orders WHERE id = :id1 OR order_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Enrolment order not found.');
        }
        if (!$isStaff && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to enrolment order.');
        }

        $sync = $this->syncProviderStatusForRow($row, $isStaff ? (string)$user['id'] : null);

        Response::success([
            'updated' => $sync['updated'],
            'order' => $this->formatOrderRow($sync['row'], $isStaff),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    /**
     * POST /api/enrolments/webhook
     */
    public function webhook(Request $request): void
    {
        $rawInput = file_get_contents('php://input') ?: '';
        $configuredSecret = trim((string)(getenv('TWOSUREVERIFY_WEBHOOK_SECRET') ?: ''));
        if ($configuredSecret !== '') {
            $sigHeader = trim((string)(
                $request->header('x-2sureverify-signature')
                ?: $request->header('x-webhook-signature')
                ?: $request->header('x-signature')
                ?: ''
            ));
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
        if (empty($body) && $rawInput !== '') {
            $decoded = json_decode($rawInput, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        }

        $res = $this->handleWebhookPayload($body);
        if (empty($res['matched'])) {
            Response::notFound('No matching enrolment order found for reference.');
        }
        Response::success($res);
    }

    public function handleWebhookPayload(array $body): array
    {
        $ref = trim((string)($body['reference'] ?? $body['data']['reference'] ?? $body['request_id'] ?? ''));
        if ($ref === '') {
            return ['matched' => false, 'processed' => false];
        }

        $row = $this->db->fetchOne(
            'SELECT * FROM enrolment_orders WHERE provider_reference = :r1 OR payment_reference = :r2 OR order_number = :r3 LIMIT 1',
            ['r1' => $ref, 'r2' => $ref, 'r3' => $ref]
        );
        if (!$row) {
            return ['matched' => false, 'processed' => false];
        }

        $prevStatus = (string)$row['status'];
        $isTerminal = in_array($prevStatus, ['completed', 'refunded'], true);
        $adapter = new TwoSureVerifyAdapter();

        if ($isTerminal) {
            if ($prevStatus === 'completed' && empty($row['result_document_id'])) {
                ResultDocumentService::syncFromProviderPayload($this->db, 'enrolment', $row, $body, $adapter->getAuthHeaders());
            }
            return ['matched' => true, 'processed' => false, 'status' => $prevStatus, 'message' => 'Terminal state preserved.'];
        }

        $statusRaw = strtolower(trim((string)($body['status'] ?? $body['data']['status'] ?? '')));
        $remarks = trim((string)($body['message'] ?? $body['remarks'] ?? $body['data']['remarks'] ?? $body['data']['admin_note'] ?? ''));
        $newStatus = $prevStatus;

        if (in_array($statusRaw, ['completed', 'complete', 'approved', 'success', 'successful', 'done', 'delivered'], true)) {
            $newStatus = 'completed';
        } elseif (in_array($statusRaw, ['processing', 'in_progress'], true)) {
            $newStatus = 'processing';
        } elseif (in_array($statusRaw, ['query', 'query_required', 'info_required'], true)) {
            $newStatus = 'query_required';
        } elseif (in_array($statusRaw, ['failed', 'rejected', 'declined', 'error', 'refunded'], true)) {
            $newStatus = 'rejected';
        }

        if (in_array($newStatus, ['failed', 'rejected'], true) && empty($row['refund_reference'])) {
            $this->issueSingleAtomicRefund((string)$row['id'], $remarks ?: 'Provider webhook reported failure', null, 'refunded');
            $newStatus = 'refunded';
        } else {
            $this->db->execute(
                'UPDATE enrolment_orders
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

        if ($newStatus === 'completed') {
            $freshForDoc = $this->db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;
            $docSync = ResultDocumentService::syncFromProviderPayload($this->db, 'enrolment', $freshForDoc, $body, $adapter->getAuthHeaders());
            if (empty($docSync['document']) && !empty($row['provider_reference'])) {
                $polled = $adapter->checkStatus((string)$row['provider_reference']);
                if (!empty($polled)) {
                    ResultDocumentService::syncFromProviderPayload($this->db, 'enrolment', $freshForDoc, $polled, $adapter->getAuthHeaders());
                }
            }
        }

        $updatedRow = $this->db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;

        if ($newStatus !== $prevStatus) {
            $safeRemarks = $remarks !== '' ? Security::sanitizeCustomerError($remarks, '') : '';
            $completedNote = !empty($updatedRow['result_document_id'])
                ? ' Your official PDF result is now ready in your portal.'
                : ($safeRemarks ?: 'Status changed to completed.');
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['service_name']} Status: " . strtoupper(str_replace('_', ' ', $newStatus)),
                $newStatus === 'completed'
                    ? "Great news! Your {$row['service_name']} order ({$row['order_number']}) has been completed.{$completedNote}"
                    : "Update on order {$row['order_number']} ({$row['service_name']}): " . ($safeRemarks ?: "Status changed to {$newStatus}."),
                $newStatus === 'completed' ? 'success' : ($newStatus === 'refunded' || $newStatus === 'query_required' ? 'warning' : 'info'),
                (string)$row['order_number'],
                ['order_number' => $row['order_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
            try {
                $refEngine = new ReferralEngineService($this->db);
                $srcRef = (string)($row['payment_reference'] ?: $row['order_number']);
                if ($newStatus === 'completed') {
                    $refEngine->recordQualifyingTransaction([
                        'user_id' => (string)$row['user_id'],
                        'service_category' => 'enrolment',
                        'service_key' => (string)$row['service_key'],
                        'source_reference' => $srcRef,
                        'gross_amount' => (float)$row['customer_price'],
                        'wholesale_cost' => (float)$row['provider_cost'],
                        'gateway_fee' => 0.0,
                    ]);
                } elseif ($newStatus === 'refunded') {
                    $refEngine->reverseRewardsForSource($srcRef, 'Enrolment refunded via webhook');
                }
            } catch (Throwable) {
            }
        }

        return ['matched' => true, 'processed' => true, 'status' => $newStatus];
    }

    // =========================================================================
    // ADMIN MANAGEMENT ENDPOINTS (Super Admin / Admin)
    // =========================================================================

    /**
     * GET /api/admin/enrolments
     */
    public function adminList(Request $request): void
    {
        Auth::requirePermission($request, 'services');
        SchemaSync::syncEnrolmentCatalog($this->db);

        $serviceKey = trim((string)$request->query('service_key', 'all'));
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $search = trim((string)$request->query('search', ''));
        $page = max(1, (int)$request->query('page', 1));
        $limit = min(100, max(10, (int)$request->query('limit', 25)));
        $offset = ($page - 1) * $limit;

        $where = 'WHERE 1=1 ';
        $params = [];

        if ($serviceKey !== '' && $serviceKey !== 'all') {
            $where .= 'AND eo.service_key = :sk ';
            $params['sk'] = $serviceKey;
        }
        if ($status !== '' && $status !== 'all') {
            $where .= 'AND eo.status = :st ';
            $params['st'] = $status;
        }
        if ($search !== '') {
            $where .= 'AND (eo.order_number LIKE :q1 OR eo.service_name LIKE :q2 OR eo.applicant_name LIKE :q3 OR eo.payment_reference LIKE :q4 OR eo.provider_reference LIKE :q5 OR u.full_name LIKE :q6 OR u.email LIKE :q7) ';
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
            "SELECT COUNT(*) as total FROM enrolment_orders eo LEFT JOIN users u ON u.id = eo.user_id {$where}",
            $params
        );
        $total = (int)($countRow['total'] ?? 0);

        $idRows = $this->db->fetchAll(
            "SELECT eo.id FROM enrolment_orders eo LEFT JOIN users u ON u.id = eo.user_id {$where} ORDER BY eo.created_at DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset,
            $params
        );

        $items = [];
        if (!empty($idRows)) {
            $ids = array_column($idRows, 'id');
            $phs = [];
            $idParams = [];
            foreach ($ids as $idx => $id) {
                $phs[] = ':aeid_' . $idx;
                $idParams['aeid_' . $idx] = $id;
            }
            $rows = $this->db->fetchAll(
                'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
                 FROM enrolment_orders eo
                 LEFT JOIN users u ON u.id = eo.user_id
                 WHERE eo.id IN (' . implode(', ', $phs) . ')
                 ORDER BY eo.created_at DESC',
                $idParams
            );
            foreach ($rows as $r) {
                $items[] = $this->formatOrderRow($r, true);
            }
        }

        $statsRow = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_all,
                SUM(CASE WHEN service_key = "bvn_enroll_adult" THEN 1 ELSE 0 END) as adult_count,
                SUM(CASE WHEN service_key = "bvn_enroll_child" THEN 1 ELSE 0 END) as child_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "processing" THEN 1 ELSE 0 END) as processing_count,
                SUM(CASE WHEN status = "query_required" THEN 1 ELSE 0 END) as query_count,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status IN ("failed", "rejected") THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = "refunded" THEN 1 ELSE 0 END) as refunded_count,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN customer_price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN provider_cost ELSE 0 END), 0) as total_provider_cost,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN profit ELSE 0 END), 0) as total_margin
             FROM enrolment_orders'
        );

        Response::success([
            'orders' => $items,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => max(1, (int)ceil($total / $limit)),
            ],
            'stats' => [
                'total_all' => (int)($statsRow['total_all'] ?? 0),
                'adult_count' => (int)($statsRow['adult_count'] ?? 0),
                'child_count' => (int)($statsRow['child_count'] ?? 0),
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
     * GET /api/admin/enrolments/:id
     */
    public function adminDetail(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id1 OR eo.order_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Enrolment order not found.');
        }

        Response::success([
            'order' => $this->formatOrderRow($row, true),
        ]);
    }

    /**
     * POST /api/admin/enrolments/:id/poll
     */
    public function adminPollStatus(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id LIMIT 1',
            ['id' => $id]
        );
        if (!$row) {
            Response::notFound('Enrolment order not found.');
        }

        $sync = $this->syncProviderStatusForRow($row, (string)$admin['id']);
        $fresh = $this->db->fetchOne(
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id LIMIT 1',
            ['id' => $id]
        ) ?: $sync['row'];

        Response::success([
            'updated' => $sync['updated'],
            'order' => $this->formatOrderRow($fresh, true),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    /**
     * POST /api/admin/enrolments/:id/update
     */
    public function adminUpdateOrder(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM enrolment_orders WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::notFound('Enrolment order not found.');
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
            Response::error('A completed enrolment order cannot be transitioned to failed/refunded via quick status update.', 422);
        }

        if (in_array($targetStatus, ['failed', 'rejected', 'refunded'], true) && $triggerRefund) {
            $refundRes = $this->issueSingleAtomicRefund(
                $id,
                $remarks ?: ($adminNotes ?: 'Rejected by administrator'),
                (string)$admin['id'],
                'refunded'
            );
            if ($adminNotes !== '') {
                $this->db->execute('UPDATE enrolment_orders SET admin_notes = :an WHERE id = :id', ['an' => $adminNotes, 'id' => $id]);
            }
        } else {
            $this->db->execute(
                'UPDATE enrolment_orders
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
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id LIMIT 1',
            ['id' => $id]
        );

        $finalStatus = (string)($fresh['status'] ?? $targetStatus);

        $footprintStatus = in_array($finalStatus, ['pending', 'processing', 'successful', 'failed'], true)
            ? $finalStatus
            : ($finalStatus === 'completed' ? 'successful' : ($finalStatus === 'query_required' ? 'processing' : 'failed'));

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_ORDER_UPDATED',
            'service_type' => $row['service_key'],
            'reference' => $row['order_number'],
            'status' => $footprintStatus,
            'amount' => (float)$row['customer_price'],
            'metadata' => ['previous_status' => $prevStatus, 'new_status' => $finalStatus, 'refund' => $refundRes],
        ]);

        if ($finalStatus !== $prevStatus || $remarks !== (string)($row['provider_remarks'] ?? '')) {
            $title = "{$row['service_name']} Update: " . strtoupper(str_replace('_', ' ', $finalStatus));
            $bodyMsg = "Your {$row['service_name']} order ({$row['order_number']}) status is now " . strtoupper(str_replace('_', ' ', $finalStatus)) . ".";
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
                (string)$row['order_number'],
                ['order_number' => $row['order_number'], 'status' => $finalStatus, 'service_name' => $row['service_name']]
            );
        }

        try {
            $refEngine = new ReferralEngineService($this->db);
            $srcRef = (string)($row['payment_reference'] ?: $row['order_number']);
            if ($finalStatus === 'completed' && $prevStatus !== 'completed') {
                $refEngine->recordQualifyingTransaction([
                    'user_id' => (string)$row['user_id'],
                    'service_category' => 'enrolment',
                    'service_key' => (string)$row['service_key'],
                    'source_reference' => $srcRef,
                    'gross_amount' => (float)$row['customer_price'],
                    'wholesale_cost' => (float)$row['provider_cost'],
                    'gateway_fee' => 0.0,
                ]);
            } elseif (in_array($finalStatus, ['refunded', 'rejected', 'failed'], true)) {
                $refEngine->reverseRewardsForSource($srcRef, 'Enrolment order marked ' . $finalStatus . ' by admin', (string)$admin['id']);
            }
        } catch (Throwable) {
        }

        Response::success([
            'order' => $fresh ? $this->formatOrderRow($fresh, true) : null,
            'refund' => $refundRes,
        ], 'Enrolment order updated successfully.');
    }

    /**
     * POST /api/admin/enrolments/:id/retry-result
     */
    public function adminRetryResultFetch(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id1 OR eo.order_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Enrolment order not found.');
        }

        $sync = $this->syncProviderStatusForRow($row, (string)$admin['id']);
        $fresh = $this->db->fetchOne(
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $sync['row'];

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_RESULT_RETRY',
            'service_type' => $row['service_key'],
            'reference' => $row['order_number'],
            'status' => !empty($fresh['result_document_id']) ? 'successful' : 'processing',
            'metadata' => [
                'has_result_document' => !empty($fresh['result_document_id']),
                'result_retrieval_status' => $fresh['result_retrieval_status'] ?? null,
            ],
        ]);

        Response::success([
            'updated' => $sync['updated'],
            'order' => $this->formatOrderRow($fresh, true),
        ], !empty($fresh['result_document_id'])
            ? 'Provider result document retrieved and saved securely.'
            : ($sync['message'] ?? 'Provider checked; no PDF document attached upstream yet.'));
    }

    /**
     * POST /api/admin/enrolments/:id/result-document
     */
    public function adminUploadResultDocument(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM enrolment_orders WHERE id = :id1 OR order_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Enrolment order not found.');
        }

        $file = $_FILES['file'] ?? $_FILES['result_pdf'] ?? [];
        $trackingId = trim((string)($request->input('tracking_id', '')));
        $remarks = trim((string)($request->input('provider_remarks', '')));
        $markCompleted = in_array((string)$request->input('mark_completed', '1'), ['1', 'true', 'yes'], true);
        $notifyCustomerFlag = in_array((string)$request->input('notify_customer', '1'), ['1', 'true', 'yes'], true);

        $doc = ResultDocumentService::storeAdminUploadedPdf(
            $this->db,
            'enrolment',
            $row,
            $file,
            (string)$admin['id'],
            $trackingId !== '' ? $trackingId : null
        );

        $prevStatus = (string)$row['status'];
        if ($markCompleted && $prevStatus !== 'refunded') {
            $this->db->execute(
                'UPDATE enrolment_orders
                 SET status = "completed",
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     completed_at = COALESCE(completed_at, NOW()),
                     updated_at = NOW()
                 WHERE id = :id AND status != "refunded"',
                [
                    'prem' => $remarks,
                    'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'],
                    'id' => $row['id'],
                ]
            );
        } elseif ($remarks !== '') {
            $this->db->execute(
                'UPDATE enrolment_orders SET provider_remarks = :prem, updated_at = NOW() WHERE id = :id',
                ['prem' => $remarks, 'id' => $row['id']]
            );
        }

        $fresh = $this->db->fetchOne(
            'SELECT eo.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM enrolment_orders eo
             LEFT JOIN users u ON u.id = eo.user_id
             WHERE eo.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $row;

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_RESULT_UPLOADED',
            'service_type' => $row['service_key'],
            'reference' => $row['order_number'],
            'status' => 'successful',
            'metadata' => [
                'document_id' => $doc['id'],
                'document_source' => 'admin_uploaded',
                'is_provider_issued' => false,
                'tracking_id' => $trackingId !== '' ? $trackingId : null,
            ],
        ]);

        if ($notifyCustomerFlag) {
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['service_name']} Result Ready",
                "Your official result document for {$row['service_name']} ({$row['order_number']}) is now available to preview and download in your dashboard.",
                'success',
                (string)$row['order_number'],
                ['order_number' => $row['order_number'], 'status' => $fresh['status'] ?? 'completed', 'service_name' => $row['service_name']]
            );
        }

        Response::success([
            'order' => $this->formatOrderRow($fresh, true),
        ], 'Official result document uploaded (Admin-Uploaded) and linked to order.');
    }

    /**
     * GET /api/admin/enrolments/services
     */
    public function adminServices(Request $request): void
    {
        Auth::requirePermission($request, 'services');
        SchemaSync::syncEnrolmentCatalog($this->db);

        $rows = $this->db->fetchAll(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE c.code = "enrolment"
               AND s.service_key IN ("bvn_enroll_adult", "bvn_enroll_child")
             ORDER BY s.selling_price DESC, s.name ASC'
        );

        $samplesByService = $this->fetchSamplesByService(null, false);
        $services = [];
        foreach ($rows as $row) {
            $sk = (string)$row['service_key'];
            $services[] = $this->formatServiceRow($row, true, $samplesByService[$sk] ?? []);
        }

        Response::success([
            'services' => $services,
            'unverified_services' => $this->getUnverifiedServiceNotices(),
        ]);
    }

    /**
     * PUT /api/admin/enrolments/services/:key
     */
    public function adminUpdateService(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncEnrolmentCatalog($this->db);

        $key = trim((string)($params['key'] ?? ''));
        if (!in_array($key, self::VERIFIED_SERVICE_KEYS, true)) {
            Response::error('Only verified NIN Enrolment services can be configured and enabled here.', 422);
        }
        $body = $request->getBody();

        $existing = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE s.service_key = :sk AND c.code = "enrolment"
             LIMIT 1',
            ['sk' => $key]
        );
        if (!$existing) {
            Response::notFound('Enrolment service not found.');
        }

        $updates = [];
        $dbParams = ['id' => $existing['id']];

        if (isset($body['name']) && trim((string)$body['name']) !== '') {
            $cleanName = trim((string)$body['name']);
            if (stripos($cleanName, 'bvn') !== false) {
                Response::error('Verified endpoints bvn_enroll_adult and bvn_enroll_child are NIN Enrolment services and cannot be renamed as BVN Enrolment.', 422);
            }
            $updates[] = 'name = :nm';
            $dbParams['nm'] = $cleanName;
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

        $targetSelling = isset($dbParams['sp']) ? (float)$dbParams['sp'] : (float)$existing['selling_price'];
        $targetWholesale = isset($dbParams['wc']) ? (float)$dbParams['wc'] : (float)$existing['wholesale_cost'];
        if ($targetSelling < $targetWholesale) {
            Response::error(
                'Customer selling price (₦' . number_format($targetSelling, 2) . ') cannot be lower than wholesale cost (₦' . number_format($targetWholesale, 2) . ').',
                422
            );
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $this->db->execute('UPDATE service_catalogue SET ' . implode(', ', $updates) . ' WHERE id = :id', $dbParams);
        }

        $fresh = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code FROM service_catalogue s JOIN service_categories c ON c.id = s.category_id WHERE s.id = :id LIMIT 1',
            ['id' => $existing['id']]
        );
        $samples = $this->fetchSamplesByService($key, false);

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_SERVICE_UPDATED',
            'service_type' => $key,
            'reference' => $key,
            'status' => 'successful',
        ]);

        Response::success([
            'service' => $fresh ? $this->formatServiceRow($fresh, true, $samples) : null,
        ], 'Enrolment service configuration saved.');
    }

    /**
     * POST /api/admin/enrolments/services/:key/sample
     */
    public function adminUploadSample(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncEnrolmentCatalog($this->db);

        $key = trim((string)($params['key'] ?? ''));
        if (!in_array($key, self::VERIFIED_SERVICE_KEYS, true)) {
            Response::error('Invalid enrolment service key.', 422);
        }

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Please choose a sample document file (JPG, PNG, WEBP, or PDF).', 422);
        }

        $file = $_FILES['file'];
        if ((int)$file['size'] > 10 * 1024 * 1024) {
            Response::error('Sample document must not exceed 10MB.', 422);
        }

        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'pdf'], true)) {
            Response::error('Sample document must be JPG, PNG, WEBP, or PDF.', 422);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true)) {
            Response::error('Sample document signature validation failed.', 422);
        }

        $storageDir = dirname(__DIR__) . '/storage/enrolment_samples';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
        }
        $htaccessPath = $storageDir . '/.htaccess';
        if (!is_file($htaccessPath)) {
            @file_put_contents(
                $htaccessPath,
                "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n"
            );
        }

        $sampleId = Security::generateUuid();
        $storedName = 'sample_' . $key . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $destPath = $storageDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to store sample document securely.', 500);
        }

        $title = trim((string)$request->input('title', '')) ?: pathinfo((string)$file['name'], PATHINFO_FILENAME);
        $description = trim((string)$request->input('description', ''));

        $this->db->execute(
            'INSERT INTO enrolment_sample_documents (id, service_key, title, description, original_name, stored_name, mime_type, file_size, file_path, is_active, created_by, created_at)
             VALUES (:id, :sk, :title, :desc, :oname, :sname, :mime, :sz, :fpath, 1, :cby, NOW())',
            [
                'id' => $sampleId,
                'sk' => $key,
                'title' => $title,
                'desc' => $description,
                'oname' => basename((string)$file['name']),
                'sname' => $storedName,
                'mime' => $mime,
                'sz' => (int)$file['size'],
                'fpath' => $destPath,
                'cby' => $admin['id'],
            ]
        );

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_SAMPLE_UPLOADED',
            'service_type' => $key,
            'reference' => $sampleId,
            'status' => 'successful',
        ]);

        Response::success([
            'sample' => [
                'id' => $sampleId,
                'service_key' => $key,
                'title' => $title,
                'description' => $description,
                'original_name' => basename((string)$file['name']),
                'mime_type' => $mime,
                'file_size' => (int)$file['size'],
                'is_active' => true,
                'file_url' => '/api/enrolments/sample/' . $sampleId,
            ],
        ], 'Sample guide document uploaded.');
    }

    /**
     * DELETE /api/admin/enrolments/samples/:id
     */
    public function adminDeleteSample(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        $id = trim((string)($params['id'] ?? ''));

        $sample = $this->db->fetchOne('SELECT * FROM enrolment_sample_documents WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$sample) {
            Response::notFound('Sample document not found.');
        }

        $path = (string)($sample['file_path'] ?? '');
        if ($path !== '' && is_file($path)) {
            @unlink($path);
        }

        $this->db->execute('DELETE FROM enrolment_sample_documents WHERE id = :id', ['id' => $id]);

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_SAMPLE_DELETED',
            'service_type' => $sample['service_key'] ?? 'enrolment',
            'reference' => $id,
            'status' => 'successful',
        ]);

        Response::success(['deleted' => true], 'Sample document removed.');
    }

    /**
     * POST /api/admin/enrolments/sync-catalog
     * Syncs live wholesale provider prices from 2SureVerify /api/v1/services.php.
     */
    public function adminSyncCatalog(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncEnrolmentCatalog($this->db, true);

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Response::error('2SureVerify API key is not configured on this server. Local enrolment schema verified, but live provider costs require API credentials.', 503);
        }

        $updatedServices = 0;
        $srvRes = $adapter->getServicesCatalog();
        $list = $srvRes['data'] ?? $srvRes['services'] ?? [];
        if (is_array($list) && !empty($list['services']) && is_array($list['services'])) {
            $list = $list['services'];
        }

        if (!empty($srvRes['success']) && is_array($list)) {
            $localRows = $this->db->fetchAll(
                'SELECT s.id, s.service_key, s.endpoint FROM service_catalogue s JOIN service_categories c ON c.id = s.category_id WHERE c.code = "enrolment" AND s.service_key IN ("bvn_enroll_adult", "bvn_enroll_child")'
            );
            foreach ($list as $k => $entry) {
                if (is_string($k) && is_array($entry)) {
                    $ep = strtolower(trim((string)($entry['endpoint'] ?? $entry['url'] ?? '')));
                    $sk = strtolower(trim((string)($entry['service_key'] ?? $entry['key'] ?? $entry['code'] ?? $k)));
                    $price = $entry['price'] ?? $entry['cost'] ?? $entry['amount'] ?? null;
                } elseif (is_array($entry)) {
                    $ep = strtolower(trim((string)($entry['endpoint'] ?? $entry['url'] ?? '')));
                    $sk = strtolower(trim((string)($entry['service_key'] ?? $entry['key'] ?? $entry['code'] ?? '')));
                    $price = $entry['price'] ?? $entry['cost'] ?? $entry['amount'] ?? null;
                } else {
                    continue;
                }
                if (!is_numeric($price) || (float)$price <= 0) {
                    continue;
                }
                foreach ($localRows as $lr) {
                    $localEp = strtolower(trim((string)$lr['endpoint']));
                    $localSk = strtolower(trim((string)$lr['service_key']));
                    $epBase = $ep !== '' ? basename($ep) : '';
                    $localBase = $localEp !== '' ? basename($localEp) : '';
                    if (
                        ($sk !== '' && $sk === $localSk)
                        || ($ep !== '' && ($ep === $localEp || ($epBase !== '' && $epBase === $localBase)))
                    ) {
                        $this->db->execute(
                            'UPDATE service_catalogue SET wholesale_cost = :wc, updated_at = NOW() WHERE id = :id',
                            ['wc' => (float)$price, 'id' => $lr['id']]
                        );
                        $updatedServices++;
                    }
                }
            }
        }

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_ENROLMENT_CATALOG_SYNCED',
            'service_type' => 'enrolment',
            'reference' => 'ENR_SYNC_' . date('YmdHis'),
            'status' => 'successful',
            'metadata' => ['updated_services' => $updatedServices],
        ]);

        Response::success([
            'updated_services' => $updatedServices,
        ], "Synchronized {$updatedServices} NIN Enrolment wholesale provider costs.");
    }
}
