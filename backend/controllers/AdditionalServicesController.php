<?php
/**
 * @file AdditionalServicesController.php
 * Phase 4 — Verified Async NIMC Clearance, Validation, Personalisation, NPC Attestation & Delinking Controller
 *
 * Strictly isolates `identity_type = "ADDITIONAL"` workflows inside modification_requests while reusing
 * WalletService, PinSecurityService, ResultDocumentService, uploaded_documents, modification_status_history,
 * and identity_webhook_deliveries with atomic single-refund & non-refundable service enforcement.
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
use HambakTech\Services\FulfilmentRouterService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;

class AdditionalServicesController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    /**
     * Unverified / Unsupported services MUST NOT be fabricated or purchasable.
     */
    public static function getUnverifiedServiceNotices(): array
    {
        return [
            [
                'service_key' => 'nin_tracking',
                'name' => 'NIN Tracking Lookup / Retrieval',
                'supported' => false,
                'status' => 'not_yet_supported',
                'label' => 'Not Yet Supported',
                'description' => 'Direct Tracking-ID-to-NIN lookup without Personalisation/IPE clearance does not have a verified endpoint on the active provider API.',
                'alternative_service_key' => 'ipe_clearance',
                'alternative_label' => 'Use IPE Clearance or NIN Personalisation',
            ],
            [
                'service_key' => 'bvn_enrolment',
                'name' => 'BVN Enrolment (New Registration)',
                'supported' => false,
                'status' => 'not_yet_supported',
                'label' => 'Not Yet Supported',
                'description' => 'New BVN Enrolment submission requires verified NIBSS/2SureVerify enrollment bank endpoints not yet active in the provider catalog.',
                'alternative_service_key' => null,
                'alternative_label' => 'Visit an accredited physical BVN enrolment center',
            ],
            [
                'service_key' => 'nin_bvn_arrangement',
                'name' => 'NIN / BVN Arrangement Service',
                'supported' => false,
                'status' => 'not_yet_supported',
                'label' => 'Not Yet Supported',
                'description' => 'Standalone NIN/BVN Arrangement does not have a verified automated or manual provider fulfillment endpoint.',
                'alternative_service_key' => 'nin_validation',
                'alternative_label' => 'Check NIN Validation or Self-MOD IPE',
            ],
        ];
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
        return Security::sanitizeCustomerError($message);
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
        $serviceKey = (string)($row['service_key'] ?? $row['key'] ?? '');
        $spec = TwoSureVerifyAdapter::getAdditionalMappingSpec($serviceKey);
        $isRefundable = array_key_exists('is_refundable', $row)
            ? (bool)(int)$row['is_refundable']
            : (bool)($spec['is_refundable'] ?? true);

        $rawDocs = $this->decodeJsonColumn($row['required_documents'] ?? null, []);
        $rawSchema = $this->decodeJsonColumn($row['form_schema'] ?? null, []);

        $fulfilmentMode = strtolower(trim((string)($row['fulfilment_mode'] ?? '')));
        if (!in_array($fulfilmentMode, FulfilmentRouterService::VALID_MODES, true)) {
            $fulfilmentMode = ($row['provider_id'] ?? '') === 'hambak_manual' ? 'internal_manual' : 'provider_async';
        }
        $slaHours = isset($row['sla_hours']) && $row['sla_hours'] !== null ? (int)$row['sla_hours'] : null;
        $internalCost = (float)($row['internal_fulfilment_cost'] ?? 0);

        $formatted = [
            'id' => (string)($row['id'] ?? ''),
            'key' => $serviceKey,
            'service_key' => $serviceKey,
            'category' => 'additional_services',
            'identity_type' => 'ADDITIONAL',
            'name' => (string)($row['name'] ?? ''),
            'description' => (string)($row['description'] ?? ''),
            'selling_price' => $selling,
            'price' => $selling,
            'is_active' => (bool)($row['is_active'] ?? true),
            'enabled' => (bool)($row['is_active'] ?? true),
            'is_refundable' => $isRefundable,
            'processing_type' => (string)($row['processing_type'] ?? 'manual'),
            'fulfilment_mode' => $fulfilmentMode,
            'sla_hours' => $slaHours,
            'manual_label' => (string)(!empty($row['manual_label']) ? $row['manual_label'] : 'Provider Async Processing'),
            'estimated_turnaround' => (string)(!empty($row['estimated_turnaround']) ? $row['estimated_turnaround'] : '24 – 72 Hours'),
            'supported_notes' => (string)($row['supported_notes'] ?? ''),
            'required_fields' => $this->decodeJsonColumn($row['required_fields'] ?? null, []),
            'required_documents' => $this->normalizeRequiredDocuments($rawDocs, $isAdmin),
            'form_schema' => $this->normalizeFormSchema($rawSchema, $isAdmin),
            'updated_at' => $row['updated_at'] ?? null,
        ];

        if ($isAdmin) {
            $formatted['provider_id'] = (string)($row['provider_id'] ?? '2sureverify');
            $formatted['provider'] = $formatted['provider_id'];
            $formatted['endpoint'] = (string)($row['endpoint'] ?? ($spec['endpoint'] ?? ''));
            $formatted['status_endpoint'] = (string)($spec['status_endpoint'] ?? TwoSureVerifyAdapter::getStatusEndpointForService($serviceKey));
            $formatted['wholesale_cost'] = $wholesale;
            $formatted['internal_fulfilment_cost'] = $internalCost;
            $effectiveCost = $fulfilmentMode === 'internal_manual' ? $internalCost : $wholesale;
            $formatted['profit'] = round($selling - $effectiveCost, 2);
            $formatted['margin_percent'] = $selling > 0 ? round((($selling - $effectiveCost) / $selling) * 100, 1) : 0.0;
            $formatted['internal_manual_eligible'] = !empty($row['internal_manual_eligible']);
            $formatted['provider_schema_verified'] = true;
            $formatted['payload_mapping'] = $spec;
        }

        return $formatted;
    }

    private function formatRequestRow(array $row, bool $isAdmin = false): array
    {
        $fields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        foreach (['password', 'pin', 'transaction_pin'] as $secKey) {
            if (isset($fields[$secKey]) && $fields[$secKey] !== '') {
                $fields[$secKey] = '[PROTECTED]';
            }
        }
        $clarReq = is_array($fields['clarification_request'] ?? null) ? $fields['clarification_request'] : null;
        if (!$isAdmin && is_array($clarReq)) {
            unset($clarReq['requested_by_id'], $clarReq['requested_by_name']);
            $fields['clarification_request'] = $clarReq;
        }
        $docs = $this->decodeJsonColumn($row['supporting_documents'] ?? null, []);
        $customerPrice = (float)($row['customer_price'] ?? 0);
        $providerCost = (float)($row['provider_cost'] ?? 0);
        $internalFulfilmentCost = (float)($row['internal_fulfilment_cost'] ?? 0);
        $fulfilmentMode = strtolower(trim((string)($row['fulfilment_mode'] ?? '')));
        if (!in_array($fulfilmentMode, FulfilmentRouterService::VALID_MODES, true)) {
            $fulfilmentMode = FulfilmentRouterService::isInternalManualOrder($row) ? 'internal_manual' : 'provider_async';
        }
        $effectiveCost = $fulfilmentMode === 'internal_manual' ? $internalFulfilmentCost : $providerCost;
        $profit = (float)($row['profit'] ?? ($customerPrice - $effectiveCost));

        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $row, 'modification', $isAdmin);
        if (!empty($resultMeta['result_document']) && is_array($resultMeta['result_document'])) {
            $ep = '/api/additional-services/' . $row['id'] . '/result-document';
            $resultMeta['result_document']['preview_url'] = $ep;
            $resultMeta['result_document']['download_url'] = $ep . '?download=1';
        }
        if (!empty($resultMeta['secondary_result_document']) && is_array($resultMeta['secondary_result_document'])) {
            $secDocId = (string)($resultMeta['secondary_result_document']['id'] ?? '');
            $ep = '/api/additional-services/' . $row['id'] . '/result-document';
            if ($secDocId !== '') {
                $resultMeta['secondary_result_document']['preview_url'] = $ep . '?doc_id=' . urlencode($secDocId);
                $resultMeta['secondary_result_document']['download_url'] = $ep . '?download=1&doc_id=' . urlencode($secDocId);
            }
        }

        $infoHistory = $this->decodeJsonColumn($row['additional_info_history'] ?? null, []);
        if (!$isAdmin && is_array($infoHistory)) {
            $infoHistory = array_map(static function ($entry) {
                if (!is_array($entry)) {
                    return $entry;
                }
                unset($entry['reviewed_by'], $entry['staff_name'], $entry['assigned_staff_name'], $entry['actor_id']);
                return $entry;
            }, $infoHistory);
        }
        $queryReviewStatus = (string)($fields['query_review_status'] ?? '');

        $statusHistory = [];
        try {
            $histSql = $isAdmin
                ? 'SELECT id, request_id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at FROM modification_status_history WHERE request_id = :rid ORDER BY created_at ASC'
                : 'SELECT id, request_id, previous_status, new_status, actor_type, remarks, created_at FROM modification_status_history WHERE request_id = :rid AND is_customer_visible = 1 ORDER BY created_at ASC';
            $histRows = $this->db->fetchAll($histSql, ['rid' => (string)($row['id'] ?? '')]);
            foreach ($histRows as $hr) {
                $remarkText = (string)($hr['remarks'] ?? '');
                if (!$isAdmin && $remarkText !== '') {
                    $remarkText = $this->sanitizeCustomerError($remarkText);
                    $remarkText = str_ireplace(
                        ['HAMBAK Manual Desk', 'HAMBAK MANUAL', 'HAMBAK Desk', 'hambak_manual', '2SureVerify', 'Veripine'],
                        ['Manual Processing', 'manual processing', 'processing team', 'manual', 'verification provider', 'verification provider'],
                        $remarkText
                    );
                }
                $entry = [
                    'id' => (string)($hr['id'] ?? ''),
                    'previous_status' => $hr['previous_status'] ?? null,
                    'new_status' => (string)($hr['new_status'] ?? ''),
                    'actor_type' => (string)($hr['actor_type'] ?? 'system'),
                    'remarks' => $remarkText !== '' ? $remarkText : null,
                    'created_at' => $hr['created_at'] ?? null,
                ];
                if ($isAdmin) {
                    $entry['actor_id'] = $hr['actor_id'] ?? null;
                    $entry['is_customer_visible'] = (bool)(int)($hr['is_customer_visible'] ?? 1);
                }
                $statusHistory[] = $entry;
            }
        } catch (Throwable) {
        }

        $checklist = $this->decodeJsonColumn($row['document_review_checklist'] ?? null, []);
        if (!$isAdmin && is_array($checklist)) {
            $cleanChecklist = [];
            foreach ($checklist as $ck => $cv) {
                if (is_array($cv)) {
                    unset($cv['reviewed_by'], $cv['staff_name'], $cv['assigned_staff_name'], $cv['actor_id']);
                }
                $cleanChecklist[$ck] = $cv;
            }
            $checklist = $cleanChecklist;
        }
        $isRefundable = array_key_exists('is_refundable', $row) ? (bool)(int)$row['is_refundable'] : true;

        $item = array_merge([
            'id' => (string)($row['id'] ?? ''),
            'request_number' => (string)($row['request_number'] ?? ''),
            'user_id' => (string)($row['user_id'] ?? ''),
            'identity_type' => 'ADDITIONAL',
            'service_key' => (string)($row['service_key'] ?? ''),
            'service_name' => (string)($row['service_name'] ?? ''),
            'masked_identifier' => (string)($row['masked_identifier'] ?? ''),
            'submitted_fields' => $fields,
            'supporting_documents' => $docs,
            'document_review_checklist' => is_array($checklist) ? $checklist : [],
            'customer_price' => $customerPrice,
            'is_refundable' => $isRefundable,
            'fulfilment_mode' => $fulfilmentMode,
            'sla_due_at' => $row['sla_due_at'] ?? null,
            'awaiting_admin_review' => !empty($row['awaiting_admin_review']),
            'payment_reference' => (string)($row['payment_reference'] ?? ''),
            'refund_reference' => $row['refund_reference'] ?? null,
            'provider_remarks' => $row['provider_remarks'] ?? null,
            'requested_corrections' => $row['requested_corrections'] ?? null,
            'clarification_request' => $clarReq,
            'clarification_deadline' => $row['clarification_deadline'] ?? ($clarReq['submission_deadline'] ?? null),
            'cancelled_at' => $row['cancelled_at'] ?? null,
            'cancellation_reason' => $row['cancellation_reason'] ?? null,
            'estimated_completion_text' => (string)($row['estimated_completion_text'] ?? 'Provider Async Processing'),
            'status' => (string)($row['status'] ?? 'pending'),
            'query_review_status' => $queryReviewStatus !== '' ? $queryReviewStatus : null,
            'additional_info_history' => $infoHistory,
            'status_history' => $statusHistory,
            'reviewed_at' => $row['reviewed_at'] ?? null,
            'completed_at' => $row['completed_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ], $resultMeta);

        if ($isAdmin) {
            $item['claimed_by'] = $row['claimed_by'] ?? null;
            $item['claimed_at'] = $row['claimed_at'] ?? null;
            $item['assigned_by'] = $row['assigned_by'] ?? null;
            $item['assigned_to'] = $row['assigned_to'] ?? null;
            $item['assigned_staff_name'] = $row['assigned_staff_name'] ?? null;
            $item['assigned_at'] = $row['assigned_at'] ?? null;
            $item['assignment_accepted_at'] = $row['assignment_accepted_at'] ?? null;
            $item['provider_reference'] = $row['provider_reference'] ?? null;
            $item['provider_transaction_id'] = $row['provider_transaction_id'] ?? null;
            $item['provider_status'] = $row['provider_status'] ?? null;
            $item['provider_refunded'] = isset($row['provider_refunded']) ? (bool)(int)$row['provider_refunded'] : null;
            $item['provider_refunded_amount'] = (float)($row['provider_refunded_amount'] ?? 0);
            $item['customer_name'] = $row['customer_name'] ?? null;
            $item['customer_email'] = $row['customer_email'] ?? null;
            $item['customer_phone'] = $row['customer_phone'] ?? null;
            $item['provider_cost'] = $providerCost;
            $item['internal_fulfilment_cost'] = $internalFulfilmentCost;
            $item['routing_snapshot'] = FulfilmentRouterService::extractOrderRoutingSnapshot($row);
            $item['profit'] = round($profit, 2);
            $item['provider_id'] = (string)($row['provider_id'] ?? '2sureverify');
            $item['endpoint'] = (string)($row['endpoint'] ?? '');
            $item['admin_notes'] = $row['admin_notes'] ?? null;
            $item['reviewed_by'] = $row['reviewed_by'] ?? null;
            $item['result_verification_status'] = $row['result_verification_status'] ?? 'none';
            $item['result_verified_by'] = $row['result_verified_by'] ?? null;
            $item['result_verified_at'] = $row['result_verified_at'] ?? null;
            $item['result_verification_notes'] = $row['result_verification_notes'] ?? null;
            $item['completion_approved_by'] = $row['completion_approved_by'] ?? null;
            $item['completion_approved_at'] = $row['completion_approved_at'] ?? null;
            $item['cancelled_by'] = $row['cancelled_by'] ?? null;
            $item['provider_response'] = $this->decodeJsonColumn($row['provider_response'] ?? null, []);
        } else {
            if (!empty($item['provider_remarks'])) {
                $item['provider_remarks'] = $this->sanitizeCustomerError((string)$item['provider_remarks']);
            }
        }

        return $item;
    }

    private function appendStatusHistory(
        string $requestId,
        ?string $previousStatus,
        string $newStatus,
        string $actorType = 'system',
        ?string $actorId = null,
        ?string $remarks = null,
        bool $isCustomerVisible = true
    ): void {
        try {
            $this->db->execute(
                'INSERT INTO modification_status_history
                    (id, request_id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at)
                 VALUES (:id, :rid, :prev, :newst, :atype, :aid, :rem, :vis, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'rid' => $requestId,
                    'prev' => $previousStatus,
                    'newst' => $newStatus,
                    'atype' => in_array($actorType, ['customer', 'provider', 'admin', 'system'], true) ? $actorType : 'system',
                    'aid' => $actorId,
                    'rem' => $remarks !== null && trim($remarks) !== '' ? trim($remarks) : null,
                    'vis' => $isCustomerVisible ? 1 : 0,
                ]
            );
        } catch (Throwable) {
        }
    }

    private function recordAudit(array $admin, string $action, array $details, ?Request $request = null): void
    {
        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
                 VALUES (:id, :uid, :email, :act, :det, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => (string)($admin['id'] ?? ''),
                    'email' => (string)($admin['email'] ?? ''),
                    'act' => $action,
                    'det' => json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                    'ip' => $request ? $request->getIp() : ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'),
                ]
            );
        } catch (Throwable) {
        }
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
                $srvName = htmlspecialchars((string)($emailMeta['service_name'] ?? 'Clearance & NIN Service'), ENT_QUOTES, 'UTF-8');

                $html = "<div style=\"font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;\">"
                    . "<div style=\"background:#0f172a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;\">"
                    . "<h2 style=\"margin:0;font-size:18px;\">HAMBAKTECH Identity & Clearance Services</h2>"
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

                (new MailService())->send(
                    (string)$u['email'],
                    (string)($u['full_name'] ?: 'Customer'),
                    "HAMBAKTECH: {$title} ({$reqNo})",
                    $html,
                    null,
                    [
                        'from_email' => 'notification@hambaktech.com.ng',
                        'from_name' => 'HAMBAKTECH Support',
                        'reply_to' => 'support@hambaktech.com.ng',
                        'audit_action' => 'ADDITIONAL_SERVICE_NOTIFICATION_EMAIL',
                    ]
                );
            }
        } catch (Throwable) {
        }
    }

    /**
     * Issue AT MOST ONE atomic refund for an eligible failed or rejected additional service request.
     */
    private function issueSingleAtomicRefund(string $requestId, string $reason, ?string $actorId = null, string $targetStatus = 'refunded'): array
    {
        return $this->db->withTransaction(function (Database $db) use ($requestId, $reason, $actorId, $targetStatus) {
            $req = $db->fetchOne('SELECT * FROM modification_requests WHERE id = :id AND identity_type = "ADDITIONAL" FOR UPDATE', ['id' => $requestId]);
            if (!$req) {
                throw new RuntimeException('Service request not found for refund.');
            }

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

            $existingTx = $db->fetchOne('SELECT id, balance_after FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $refundRef]);
            $balanceAfter = null;
            $refundConfirmed = false;

            if ($existingTx) {
                $balanceAfter = (float)$existingTx['balance_after'];
                $refundConfirmed = true;
            } elseif ($amount > 0) {
                try {
                    $creditRes = $this->walletService->credit(
                        (string)$req['user_id'],
                        $amount,
                        'additional_service_refund',
                        $refundRef,
                        "Refund for {$req['service_name']} ({$req['request_number']})",
                        'internal',
                        [
                            'modification_request_id' => $req['id'],
                            'request_number' => $req['request_number'],
                            'payment_reference' => $req['payment_reference'],
                            'actor_id' => $actorId,
                        ]
                    );
                    $verifiedTx = $db->fetchOne(
                        'SELECT id, balance_after FROM transactions WHERE reference = :ref AND user_id = :uid AND type = "credit" AND status = "successful" LIMIT 1',
                        ['ref' => $refundRef, 'uid' => (string)$req['user_id']]
                    );
                    if ($verifiedTx) {
                        $balanceAfter = (float)$verifiedTx['balance_after'];
                        $refundConfirmed = true;
                    } elseif (isset($creditRes['balance_after'])) {
                        $balanceAfter = (float)$creditRes['balance_after'];
                        $refundConfirmed = true;
                    }
                } catch (Throwable $refundEx) {
                    Security::logPrivateError('AdditionalServiceRefund', $refundEx, [
                        'request_id' => $req['id'],
                        'refund_reference' => $refundRef,
                        'user_id' => $req['user_id'],
                    ]);
                    $refundConfirmed = false;
                }
            }

            $finalStatus = $refundConfirmed
                ? (in_array($targetStatus, ['failed', 'rejected', 'refunded'], true) ? $targetStatus : 'refunded')
                : 'failed';
            $safeRem = Security::sanitizeCustomerError($reason, '');
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
                    'rref' => $refundConfirmed ? $refundRef : null,
                    'rem' => $safeRem,
                    'rby' => $actorId,
                    'rby2' => $actorId,
                    'id' => $req['id'],
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
     * GET /api/additional-services/catalog
     */
    public function catalog(Request $request): void
    {
        SchemaSync::syncAdditionalServicesCatalog($this->db);
        $user = Auth::user($request);
        $isAdmin = $user && Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));

        $rows = $this->db->fetchAll(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE c.code = "additional_services"
               AND s.is_active = 1
             ORDER BY s.selling_price ASC, s.name ASC'
        );

        $services = [];
        foreach ($rows as $row) {
            if (TwoSureVerifyAdapter::getAdditionalMappingSpec((string)($row['service_key'] ?? '')) !== null) {
                $services[] = $this->formatServiceRow($row, $isAdmin);
            }
        }

        Response::success([
            'services' => $services,
            'count' => count($services),
            'unverified_services' => self::getUnverifiedServiceNotices(),
        ]);
    }

    /**
     * POST /api/additional-services/upload
     */
    public function uploadDocument(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $docKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('doc_key', 'supporting_doc')) ?: 'supporting_doc';
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
                 WHERE s.service_key = :sk AND c.code = "additional_services"
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
            Response::error("Supporting document file must not exceed {$maxSizeMb}MB.", 422);
        }

        $originalName = basename((string)$file['name']);
        $dangerousExts = ['php', 'phtml', 'phar', 'exe', 'sh', 'bash', 'js', 'mjs', 'cjs', 'svg', 'html', 'htm', 'bat', 'cmd', 'com', 'msi', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb'];
        $nameParts = explode('.', strtolower($originalName));
        if (count($nameParts) > 1) {
            array_shift($nameParts);
            foreach ($nameParts as $seg) {
                if (in_array(trim($seg), $dangerousExts, true)) {
                    Response::error('Executable or active script file types are strictly blocked.', 422);
                }
            }
        }

        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
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
        $storedName = 'add_' . $docKey . '_' . time() . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
        $destPath = $storageDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to store uploaded document securely.', 500);
        }

        $fileUrl = '/api/additional-services/document/' . $docId;
        $this->db->execute(
            'INSERT INTO uploaded_documents (id, user_id, document_type, original_name, stored_name, mime_type, file_size, file_path, file_url, created_at)
             VALUES (:id, :uid, :dtype, :oname, :sname, :mime, :sz, :fpath, :furl, NOW())',
            [
                'id' => $docId,
                'uid' => $user['id'],
                'dtype' => 'additional_' . $docKey,
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
     * GET /api/additional-services/document/:id
     */
    public function getDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $docId = trim((string)($params['id'] ?? ''));

        $doc = $this->db->fetchOne('SELECT * FROM uploaded_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        if (!$doc) {
            Response::notFound('Supporting document not found.');
        }

        $isOwner = (string)$doc['user_id'] === (string)$user['id'];
        if (!$isOwner) {
            $authorizedStaff = false;
            if (Auth::isAdmin($user)) {
                if (Auth::hasPermission($user, 'services') || Auth::isManualFulfilmentSupervisor($user)) {
                    $authorizedStaff = true;
                } elseif (Auth::hasPermission($user, 'manual_fulfilment.view')) {
                    $reqRows = $this->db->fetchAll(
                        'SELECT id, user_id, fulfilment_mode, provider_id, assigned_to, claimed_by, result_verification_status
                         FROM modification_requests WHERE user_id = :uid AND identity_type = "ADDITIONAL" AND supporting_documents LIKE :doclike LIMIT 10',
                        ['uid' => $doc['user_id'], 'doclike' => '%' . $docId . '%']
                    );
                    foreach ($reqRows as $rr) {
                        if (Auth::canAccessManualRecord($user, $rr)) {
                            $authorizedStaff = true;
                            break;
                        }
                    }
                }
            }
            if (!$authorizedStaff) {
                Response::forbidden('Unauthorized access to document.');
            }
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
     * GET /api/additional-services/:id/result-document
     */
    public function downloadResultDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $forceDownload = in_array((string)$request->query('download', ''), ['1', 'true', 'yes'], true);
        $docId = trim((string)$request->query('doc_id', ''));
        ResultDocumentService::streamResultDocument($this->db, $user, 'modification', $id, $forceDownload, $docId !== '' ? $docId : null);
    }

    /**
     * POST /api/additional-services/submit
     */
    public function submit(Request $request): void
    {
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $user = Auth::requireVerifiedEmail($request);
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
        $body = $request->getBody();

        if (empty($body['consent'])) {
            Response::error('You must accept the legal authorization and declaration checkbox before submitting.', 422);
        }

        $idempotencyKey = trim((string)($body['idempotency_key'] ?? ''));
        if ($idempotencyKey !== '') {
            $existingIdemp = $this->db->fetchOne(
                'SELECT * FROM modification_requests WHERE user_id = :uid AND identity_type = "ADDITIONAL" AND idempotency_key = :ikey LIMIT 1',
                ['uid' => $user['id'], 'ikey' => substr($idempotencyKey, 0, 120)]
            );
            if ($existingIdemp) {
                $wallet = $this->db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $user['id']]);
                Response::success([
                    'idempotent_replay' => true,
                    'request' => $this->formatRequestRow($existingIdemp, $isAdmin),
                    'balance_after' => $wallet ? (float)$wallet['balance'] : null,
                ], 'Service request already submitted.');
            }
        }

        $serviceKey = strtolower(trim((string)($body['service_key'] ?? '')));
        if ($serviceKey === '') {
            Response::error('Please select a verified clearance or additional NIN service.', 422);
        }

        // Explicitly block unverified / unsupported service keys
        $unverifiedKeys = array_column(self::getUnverifiedServiceNotices(), 'service_key');
        if (in_array($serviceKey, $unverifiedKeys, true)) {
            Response::error('This service is not yet supported on HAMBAKTECH because no verified upstream fulfillment endpoint is active.', 422);
        }

        $mappingSpec = TwoSureVerifyAdapter::getAdditionalMappingSpec($serviceKey);
        if (!$mappingSpec) {
            Response::error('Selected service is not a supported async additional/clearance service.', 422);
        }

        $serviceRow = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE s.service_key = :sk AND c.code = "additional_services"
             LIMIT 1',
            ['sk' => $serviceKey]
        );
        if (!$serviceRow) {
            Response::error('Selected service does not exist in active catalog.', 404);
        }
        if (empty($serviceRow['is_active'])) {
            Response::error('This service is currently paused by administration.', 503);
        }

        // Field validation BEFORE wallet debit
        $rawFields = is_array($body['fields'] ?? null) ? $body['fields'] : $body;
        $formSchema = $this->decodeJsonColumn($serviceRow['form_schema'] ?? null, []);
        $requiredFieldKeys = $this->decodeJsonColumn($serviceRow['required_fields'] ?? null, []);
        $requiredDocsSchema = $this->decodeJsonColumn($serviceRow['required_documents'] ?? null, []);

        $submittedFields = [];
        $visibleFieldKeys = [];

        foreach ($formSchema as $fDef) {
            if (!is_array($fDef) || empty($fDef['key'])) {
                continue;
            }
            $fk = (string)$fDef['key'];
            if (!$this->isFieldConditionMet($fDef, $rawFields)) {
                continue;
            }
            $visibleFieldKeys[$fk] = true;
            $val = isset($rawFields[$fk]) ? trim((string)$rawFields[$fk]) : '';
            if (!empty($fDef['required']) && $val === '') {
                Response::error(($fDef['label'] ?? $fk) . ' is required.', 422);
            }
            if ($val !== '') {
                if (in_array($fk, ['nin', 'father_nin', 'mother_nin'], true)) {
                    $digits = preg_replace('/\D/', '', $val) ?? '';
                    if (strlen($digits) !== 11) {
                        Response::error(($fDef['label'] ?? strtoupper($fk)) . ' must be exactly 11 digits.', 422);
                    }
                    $val = $digits;
                } elseif (in_array($fk, ['tracking_id', 'ticket_id'], true)) {
                    $valClean = preg_replace('/\s+/', '', $val) ?? '';
                    if (!preg_match('/^[A-Za-z0-9\-_]{1,20}$/', $valClean)) {
                        Response::error(($fDef['label'] ?? 'Tracking / Ticket ID') . ' must be 1 to 20 alphanumeric characters.', 422);
                    }
                    $val = $valClean;
                } elseif ($fk === 'phone') {
                    $digits = preg_replace('/\D/', '', $val) ?? '';
                    if (strlen($digits) < 10 || strlen($digits) > 13) {
                        Response::error('Please enter a valid Nigerian phone number.', 422);
                    }
                    $val = $digits;
                } elseif ($fk === 'email' && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
                    Response::error('Please provide a valid email address.', 422);
                } elseif (($fDef['type'] ?? '') === 'date') {
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $val)) {
                        Response::error(($fDef['label'] ?? 'Date') . ' must be in YYYY-MM-DD format.', 422);
                    }
                    $parts = explode('-', $val);
                    if (!checkdate((int)$parts[1], (int)$parts[2], (int)$parts[0]) || $val > date('Y-m-d')) {
                        Response::error(($fDef['label'] ?? 'Date') . ' must be a valid calendar date not in the future.', 422);
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

        // Enforce conditional email for nin_delinking delinking mode
        if ($serviceKey === 'nin_delinking' && ($submittedFields['sub_type'] ?? '') === 'delinking' && empty($submittedFields['email'])) {
            Response::error('New Email Address is required when selecting NIN Delinking.', 422);
        }

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
                Response::error("Missing required field: {$rkStr}.", 422);
            }
        }

        $primaryIdRaw = (string)($submittedFields['nin'] ?? $submittedFields['tracking_id'] ?? $submittedFields['ticket_id'] ?? '');
        $maskedIdentifier = $primaryIdRaw !== '' ? $this->maskIdentifier($primaryIdRaw) : 'N/A';

        // Supporting documents ownership validation
        $docIds = [];
        $docKeyMap = [];
        if (is_array($body['document_ids'] ?? null)) {
            foreach ($body['document_ids'] as $k => $v) {
                if (is_string($v) && trim($v) !== '') {
                    $cleanId = trim($v);
                    $docIds[] = $cleanId;
                    if (is_string($k) && $k !== '') {
                        $docKeyMap[$cleanId] = preg_replace('/[^a-zA-Z0-9_-]/', '', $k) ?: 'supporting_doc';
                    }
                } elseif (is_array($v) && !empty($v['id'])) {
                    $cleanId = trim((string)$v['id']);
                    $docIds[] = $cleanId;
                    $docKeyMap[$cleanId] = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($v['doc_key'] ?? 'supporting_doc')) ?: 'supporting_doc';
                }
            }
        }
        $docIds = array_values(array_unique(array_filter($docIds)));

        $attachedFiles = [];
        $storedDocsMeta = [];
        if (!empty($docIds)) {
            $phs = [];
            $qParams = ['uid' => $user['id']];
            foreach ($docIds as $idx => $did) {
                $ph = ':did_' . $idx;
                $phs[] = $ph;
                $qParams['did_' . $idx] = $did;
            }
            $docRows = $this->db->fetchAll(
                'SELECT * FROM uploaded_documents WHERE user_id = :uid AND id IN (' . implode(', ', $phs) . ')',
                $qParams
            );
            foreach ($docRows as $dr) {
                $filePath = (string)($dr['file_path'] ?? '');
                if ($filePath === '' || !is_file($filePath) || !is_readable($filePath)) {
                    Response::error('One or more uploaded documents are missing from secure storage. Please re-upload.', 422);
                }
                $dKey = $docKeyMap[$dr['id']] ?? str_replace('additional_', '', (string)$dr['document_type']);
                $attachedFiles[$dKey] = [
                    'id' => $dr['id'],
                    'doc_key' => $dKey,
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_path' => $filePath,
                    'file_url' => '/api/additional-services/document/' . $dr['id'],
                ];
                $storedDocsMeta[] = [
                    'id' => $dr['id'],
                    'doc_key' => $dKey,
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_size' => (int)($dr['file_size'] ?? 0),
                    'file_url' => '/api/additional-services/document/' . $dr['id'],
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

        $userRow = $this->db->fetchOne(
            'SELECT id, email, full_name, status, kyc_level, tier, transaction_pin_hash FROM users WHERE id = :id LIMIT 1',
            ['id' => $user['id']]
        );
        if (!$userRow || ($userRow['status'] ?? 'active') !== 'active') {
            Response::forbidden('Your account is currently not permitted to submit service requests.');
        }

        (new PinSecurityService($this->db))->requireValidPin($userRow, $body, 'identity_modification', $serviceKey);

        $customerPrice = (float)$serviceRow['selling_price'];
        $expectedWholesale = (float)$serviceRow['wholesale_cost'];
        if ($customerPrice <= 0) {
            Response::error('Service pricing is not yet configured. Please contact support.', 422);
        }

        // Unified Routing Check BEFORE touching wallet
        $routerService = new FulfilmentRouterService($this->db);
        $route = $routerService->resolveRoute($serviceKey);
        if (!$route) {
            Response::error('Service routing configuration could not be loaded.', 503);
        }

        $isManualRoute = (($route['fulfilment_mode'] ?? '') === 'internal_manual');
        if ($isManualRoute) {
            $check = $routerService->canRouteManual($route);
            if (empty($check['allowed'])) {
                Security::logPrivateError('AdditionalServiceRouting', (string)($check['reason'] ?? 'Manual routing rejected'), ['service_key' => $serviceKey]);
                Response::error((string)($check['customer_message'] ?? 'This service is temporarily unavailable.'), (int)($check['code'] ?? 503));
            }
        } else {
            $check = $routerService->canDispatchExternal($route);
            if (empty($check['allowed'])) {
                Security::logPrivateError('AdditionalServiceRouting', (string)($check['reason'] ?? 'External dispatch rejected'), ['service_key' => $serviceKey]);
                Response::error((string)($check['customer_message'] ?? Security::ERR_PROVIDER_UNAVAILABLE), (int)($check['code'] ?? 503));
            }
        }

        $orderMeta = $routerService->buildOrderRoutingMetadata($route);

        $isRefundable = array_key_exists('is_refundable', $serviceRow)
            ? (int)(bool)(int)$serviceRow['is_refundable']
            : (int)(bool)($mappingSpec['is_refundable'] ?? true);

        $requestId = Security::generateUuid();
        $requestNumber = 'ADD-' . strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $serviceKey), 0, 4)) . '-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $paymentRef = 'ADDPAY_' . date('YmdHis') . '_' . strtoupper(bin2hex(random_bytes(4)));
        $etaText = (string)(!empty($serviceRow['estimated_turnaround']) ? $serviceRow['estimated_turnaround'] : '24 – 72 Hours');
        $endpoint = (string)($orderMeta['endpoint'] ?: $mappingSpec['endpoint']);
        $providerId = (string)$orderMeta['provider_id'];
        $persistedCost = $isManualRoute ? (float)$orderMeta['internal_fulfilment_cost'] : $expectedWholesale;
        $initialProfit = max(0.0, round($customerPrice - $persistedCost, 2));

        try {
            $debitResult = $this->db->withTransaction(function (Database $db) use (
                $user,
                $customerPrice,
                $paymentRef,
                $serviceRow,
                $maskedIdentifier,
                $requestNumber,
                $requestId,
                $serviceKey,
                $submittedFields,
                $storedDocsMeta,
                $isManualRoute,
                $expectedWholesale,
                $initialProfit,
                $isRefundable,
                $providerId,
                $endpoint,
                $idempotencyKey,
                $etaText,
                $orderMeta
            ) {
                $debitRes = $this->walletService->debit(
                    (string)$user['id'],
                    $customerPrice,
                    'additional_services',
                    $paymentRef,
                    "{$serviceRow['name']} ({$maskedIdentifier}) [{$requestNumber}]",
                    'internal',
                    [
                        'modification_request_id' => $requestId,
                        'request_number' => $requestNumber,
                        'service_key' => $serviceKey,
                        'identity_type' => 'ADDITIONAL',
                        'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                    ]
                );

                try {
                    $db->execute(
                        'INSERT INTO modification_requests
                         (id, request_number, user_id, identity_type, service_key, service_name, masked_identifier, submitted_fields, supporting_documents,
                          customer_price, provider_cost, internal_fulfilment_cost, profit, is_refundable, provider_id, endpoint,
                          fulfilment_mode, routing_snapshot, sla_due_at,
                          payment_reference, idempotency_key, estimated_completion_text, status, created_at)
                         VALUES
                         (:id, :rno, :uid, "ADDITIONAL", :sk, :snm, :mid, :sfields, :sdocs,
                          :cprice, :pcost, :icost, :profit, :iref, :pid, :ep,
                          :fmode, :rsnap, :sladue,
                          :pref, :ikey, :eta, "pending", NOW())',
                        [
                            'id' => $requestId,
                            'rno' => $requestNumber,
                            'uid' => $user['id'],
                            'sk' => $serviceKey,
                            'snm' => $serviceRow['name'],
                            'mid' => $maskedIdentifier,
                            'sfields' => json_encode($submittedFields),
                            'sdocs' => json_encode($storedDocsMeta),
                            'cprice' => $customerPrice,
                            'pcost' => $isManualRoute ? 0.00 : $expectedWholesale,
                            'icost' => $orderMeta['internal_fulfilment_cost'],
                            'profit' => $initialProfit,
                            'iref' => $isRefundable,
                            'pid' => $providerId,
                            'ep' => $endpoint,
                            'fmode' => $orderMeta['fulfilment_mode'],
                            'rsnap' => $orderMeta['routing_snapshot_json'],
                            'sladue' => $orderMeta['sla_due_at'],
                            'pref' => $paymentRef,
                            'ikey' => $idempotencyKey !== '' ? substr($idempotencyKey, 0, 120) : null,
                            'eta' => $etaText,
                        ]
                    );
                } catch (Throwable) {
                    $db->execute(
                        'INSERT INTO modification_requests
                         (id, request_number, user_id, identity_type, service_key, service_name, masked_identifier, submitted_fields, supporting_documents,
                          customer_price, provider_cost, profit, is_refundable, provider_id, endpoint, payment_reference, idempotency_key, estimated_completion_text, status, created_at)
                         VALUES
                         (:id, :rno, :uid, "ADDITIONAL", :sk, :snm, :mid, :sfields, :sdocs,
                          :cprice, :pcost, :profit, :iref, :pid, :ep, :pref, :ikey, :eta, "pending", NOW())',
                        [
                            'id' => $requestId,
                            'rno' => $requestNumber,
                            'uid' => $user['id'],
                            'sk' => $serviceKey,
                            'snm' => $serviceRow['name'],
                            'mid' => $maskedIdentifier,
                            'sfields' => json_encode($submittedFields),
                            'sdocs' => json_encode($storedDocsMeta),
                            'cprice' => $customerPrice,
                            'pcost' => $isManualRoute ? 0.00 : $expectedWholesale,
                            'profit' => $initialProfit,
                            'iref' => $isRefundable,
                            'pid' => $providerId,
                            'ep' => $endpoint,
                            'pref' => $paymentRef,
                            'ikey' => $idempotencyKey !== '' ? substr($idempotencyKey, 0, 120) : null,
                            'eta' => $etaText,
                        ]
                    );
                }

                return $debitRes;
            });
        } catch (Throwable $e) {
            $errMsg = Security::sanitizeWalletDebitError($e);
            $status = Security::isCustomerWalletInsufficient($e) ? 400 : 500;
            Response::error($errMsg, $status);
        }

        // Internal Manual Path: Queue directly for HAMBAK MANUAL desk without calling external APIs
        if ($isManualRoute) {
            $this->appendStatusHistory(
                $requestId,
                null,
                'pending',
                'customer',
                (string)$user['id'],
                'Request submitted for manual processing',
                true
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'ADDITIONAL_SERVICE_MANUAL_SUBMITTED',
                'service_type' => $serviceKey,
                'reference' => $requestNumber,
                'provider' => 'hambak_manual',
                'status' => 'pending',
                'amount' => $customerPrice,
                'metadata' => [
                    'payment_reference' => $paymentRef,
                    'fulfilment_mode' => 'internal_manual',
                    'sla_due_at' => $orderMeta['sla_due_at'],
                    'is_refundable' => (bool)$isRefundable,
                ],
            ]);

            $this->notifyCustomer(
                (string)$user['id'],
                "{$serviceRow['name']} Queued",
                "Your {$serviceRow['name']} request ({$requestNumber}) has been received by our internal fulfilment desk. Estimated turnaround: {$etaText}.",
                'info',
                $requestNumber,
                ['request_number' => $requestNumber, 'status' => 'pending', 'service_name' => $serviceRow['name']]
            );

            $savedRow = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $requestId]);
            Response::success([
                'request' => $savedRow ? $this->formatRequestRow($savedRow, $isAdmin) : null,
                'pending' => true,
                'status' => 'pending',
                'fulfilment_mode' => 'internal_manual',
                'sla_due_at' => $orderMeta['sla_due_at'],
                'balance_after' => $debitResult['balance_after'] ?? null,
                'newBalance' => $debitResult['balance_after'] ?? null,
                'payment_reference' => $paymentRef,
            ], "{$serviceRow['name']} queued with our fulfilment desk. Track live status updates below.");
            return;
        }

        // Dispatch to 2SureVerify official endpoint
        $routerService->acquireDispatchLock('modification_requests', $requestId);
        $adapter = new TwoSureVerifyAdapter();
        $providerRes = $adapter->submitAdditionalService(
            $serviceKey,
            array_merge($submittedFields, ['reference' => $paymentRef]),
            $attachedFiles,
            $endpoint
        );
        $routerService->releaseDispatchLock(
            'modification_requests',
            $requestId,
            empty($providerRes['success']) && empty($providerRes['pending']) ? (string)($providerRes['message'] ?? '') : null
        );

        $provRef = (string)($providerRes['reference'] ?? $paymentRef);
        $provTxId = !empty($providerRes['provider_transaction_id']) ? (string)$providerRes['provider_transaction_id'] : null;
        $actualCost = !empty($providerRes['provider_cost']) && (float)$providerRes['provider_cost'] > 0
            ? (float)$providerRes['provider_cost']
            : $expectedWholesale;
        $actualProfit = round($customerPrice - $actualCost, 2);
        $provMsg = (string)($providerRes['message'] ?? '');
        $provRefunded = $providerRes['provider_refunded'] ?? null;

        if (!empty($providerRes['pending']) || !empty($providerRes['success'])) {
            $mappedSt = (string)($providerRes['status'] ?? 'pending');
            $newStatus = in_array($mappedSt, ['completed', 'processing', 'pending'], true) ? $mappedSt : 'pending';
            $provStatus = (string)($providerRes['provider_status'] ?? $newStatus);

            $this->db->execute(
                'UPDATE modification_requests
                 SET provider_reference = :pr,
                     provider_transaction_id = COALESCE(:ptx, provider_transaction_id),
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
                    'ptx' => $provTxId,
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

            if ($newStatus === 'completed') {
                $freshForDoc = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $requestId]);
                if ($freshForDoc) {
                    ResultDocumentService::syncFromProviderPayload($this->db, 'modification', $freshForDoc, $providerRes, $adapter->getAuthHeaders());
                }
            }

            $this->appendStatusHistory(
                $requestId,
                null,
                $newStatus,
                'customer',
                (string)$user['id'],
                $newStatus === 'completed' ? 'Submitted and completed immediately' : 'Submitted to verification gateway queue',
                true
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'ADDITIONAL_SERVICE_SUBMITTED',
                'service_type' => $serviceKey,
                'reference' => $requestNumber,
                'provider' => $providerId,
                'status' => $newStatus,
                'amount' => $customerPrice,
                'metadata' => [
                    'payment_reference' => $paymentRef,
                    'provider_reference' => $provRef,
                    'provider_transaction_id' => $provTxId,
                    'is_refundable' => (bool)$isRefundable,
                    'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                ],
            ]);

            $this->notifyCustomer(
                (string)$user['id'],
                $newStatus === 'completed' ? "{$serviceRow['name']} Completed" : "{$serviceRow['name']} Submitted",
                $newStatus === 'completed'
                    ? "Your {$serviceRow['name']} request ({$requestNumber}) has been completed immediately. View details and official slip in your request tracker."
                    : "Your {$serviceRow['name']} request ({$requestNumber}) has been queued for processing. Estimated turnaround: {$etaText}.",
                $newStatus === 'completed' ? 'success' : 'info',
                $requestNumber,
                ['request_number' => $requestNumber, 'status' => $newStatus, 'service_name' => $serviceRow['name']]
            );

            if ($newStatus === 'completed') {
                try {
                    (new ReferralEngineService($this->db))->recordQualifyingTransaction([
                        'user_id' => (string)$user['id'],
                        'service_category' => 'additional_services',
                        'service_key' => $serviceKey,
                        'source_reference' => $paymentRef,
                        'gross_amount' => $customerPrice,
                        'wholesale_cost' => $actualCost,
                        'gateway_fee' => 0.0,
                    ]);
                } catch (Throwable) {
                }
            }

            $savedRow = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $requestId]);
            $submitPayload = [
                'request' => $savedRow ? $this->formatRequestRow($savedRow, $isAdmin) : null,
                'pending' => $newStatus !== 'completed',
                'status' => $newStatus,
                'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                'sla_due_at' => $orderMeta['sla_due_at'],
                'balance_after' => $debitResult['balance_after'] ?? null,
                'newBalance' => $debitResult['balance_after'] ?? null,
                'payment_reference' => $paymentRef,
            ];
            if ($isAdmin) {
                $submitPayload['provider_reference'] = $provRef;
                $submitPayload['provider_transaction_id'] = $provTxId;
            }

            Response::success($submitPayload, $newStatus === 'completed'
                ? "{$serviceRow['name']} completed successfully."
                : "{$serviceRow['name']} submitted for processing. Track live status updates below.");
        }

        // Immediate failure: if provider NEVER accepted/charged ($accepted === false), ALWAYS refund safely.
        // Only hold non-refundable when upstream explicitly accepted/charged the request and failed upstream without refunding.
        $wasAccepted = !empty($providerRes['accepted']);
        $shouldRefund = !$wasAccepted || ($isRefundable === 1) || ($provRefunded === true);

        if ($shouldRefund) {
            $refundRes = $this->issueSingleAtomicRefund(
                $requestId,
                $provMsg ?: 'Service submission rejected by provider.',
                null,
                'refunded'
            );
            $refundConfirmed = !empty($refundRes['refunded']);
            $finalSt = $refundConfirmed ? 'refunded' : 'failed';

            $this->appendStatusHistory(
                $requestId,
                'pending',
                $finalSt,
                'provider',
                null,
                $refundConfirmed ? 'Rejected by provider and refunded automatically' : 'Rejected by provider; refund pending',
                true
            );

            $this->notifyCustomer(
                (string)$user['id'],
                $refundConfirmed ? "{$serviceRow['name']} Failed & Refunded" : "{$serviceRow['name']} Failed",
                $refundConfirmed
                    ? "Your {$serviceRow['name']} request ({$requestNumber}) could not be completed. Your wallet has been refunded."
                    : "Your {$serviceRow['name']} request ({$requestNumber}) could not be completed. Your refund is being processed.",
                'warning',
                $requestNumber,
                ['request_number' => $requestNumber, 'status' => $finalSt, 'service_name' => $serviceRow['name']]
            );

            Response::error(
                $refundConfirmed ? Security::ERR_TXN_REFUNDED : Security::ERR_TXN_REFUND_PENDING,
                502,
                [
                    'refunded' => $refundConfirmed,
                    'refund_pending' => !$refundConfirmed,
                    'refund_reference' => $refundRes['refund_reference'] ?? null,
                    'balance_after' => $refundRes['balance_after'] ?? null,
                    'request_number' => $requestNumber,
                ]
            );
        }

        // Accepted by upstream + Non-refundable rule
        $this->db->execute(
            'UPDATE modification_requests
             SET provider_reference = :pr,
                 provider_transaction_id = COALESCE(:ptx, provider_transaction_id),
                 provider_status = "failed",
                 provider_refunded = 0,
                 provider_remarks = :prem,
                 provider_response = :pres,
                 status = "failed",
                 updated_at = NOW()
             WHERE id = :id',
            [
                'pr' => $provRef,
                'ptx' => $provTxId,
                'prem' => $provMsg ?: 'Failed upstream (Non-refundable service)',
                'pres' => json_encode($providerRes['raw'] ?? $providerRes),
                'id' => $requestId,
            ]
        );
        $this->appendStatusHistory(
            $requestId,
            'pending',
            'failed',
            'provider',
            null,
            'Provider processed attempt and returned failed (Non-refundable service)',
            true
        );
        $this->notifyCustomer(
            (string)$user['id'],
            "{$serviceRow['name']} Failed",
            "Your {$serviceRow['name']} request ({$requestNumber}) failed after submission. Per service terms, {$serviceRow['name']} fees are non-refundable once processed.",
            'warning',
            $requestNumber,
            ['request_number' => $requestNumber, 'status' => 'failed', 'service_name' => $serviceRow['name']]
        );
        Response::error(
            'Submission failed after provider processing. This service is non-refundable once submitted.',
            422,
            [
                'refunded' => false,
                'is_refundable' => false,
                'request_number' => $requestNumber,
            ]
        );
    }

    /**
     * GET /api/additional-services/history
     */
    public function history(Request $request): void
    {
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $user = Auth::requireAuth($request);
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $serviceKey = trim((string)$request->query('service_key', 'all'));
        $search = trim((string)$request->query('search', ''));
        $limit = min(100, max(1, (int)$request->query('limit', 40)));

        $where = 'WHERE user_id = :uid AND identity_type = "ADDITIONAL" ';
        $params = ['uid' => $user['id']];

        if ($status !== '' && $status !== 'all') {
            $where .= 'AND status = :st ';
            $params['st'] = $status;
        }
        if ($serviceKey !== '' && $serviceKey !== 'all') {
            $where .= 'AND service_key = :sk ';
            $params['sk'] = $serviceKey;
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
                $ph = ':aid_' . $idx;
                $phs[] = $ph;
                $idParams['aid_' . $idx] = $id;
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
     * GET /api/additional-services/:id/status
     */
    public function requestStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (id = :id1 OR request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (!$isAdmin && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to service request.');
        }

        Response::success(['request' => $this->formatRequestRow($row, $isAdmin)]);
    }

    private function syncProviderStatusForRow(array $row, ?string $actorId = null): array
    {
        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            return ['updated' => false, 'message' => 'This request is handled via manual processing and cannot be polled against external providers.', 'row' => $row];
        }

        $lookupRef = trim((string)($row['provider_reference'] ?: $row['payment_reference']));
        $lookupTxId = trim((string)($row['provider_transaction_id'] ?? ''));
        if ($lookupRef === '' && $lookupTxId === '') {
            return ['updated' => false, 'message' => 'No provider reference or transaction_id attached.', 'row' => $row];
        }

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            return ['updated' => false, 'message' => Security::ERR_PROVIDER_AUTH, 'row' => $row];
        }

        $res = $adapter->checkStatus($lookupRef, (string)($row['service_key'] ?? ''), $lookupTxId !== '' ? $lookupTxId : null);
        $rawStatus = strtolower(trim((string)($res['status'] ?? $res['data']['status'] ?? '')));
        $remarks = trim((string)($res['message'] ?? $res['remarks'] ?? $res['data']['remarks'] ?? $res['data']['admin_note'] ?? $res['data']['message'] ?? ''));
        $resolvedTxId = trim((string)($res['provider_transaction_id'] ?? $res['transaction_id'] ?? $res['data']['transaction_id'] ?? $lookupTxId));
        $provRefundedVal = array_key_exists('provider_refunded', $res) && $res['provider_refunded'] !== null
            ? ($res['provider_refunded'] ? 1 : 0)
            : null;
        $provRefundedAmt = (float)($res['provider_refunded_amount'] ?? 0);

        if ($rawStatus === '' && empty($res['success'])) {
            return ['updated' => false, 'message' => Security::ERR_PROVIDER_UNAVAILABLE, 'row' => $row];
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
            } elseif ($rawStatus === 'refunded' || in_array($rawStatus, ['failed', 'rejected', 'declined', 'cancelled', 'canceled', 'error'], true)) {
                $newStatus = $rawStatus === 'failed' ? 'failed' : 'rejected';
            }
        }

        $refundInfo = null;
        $rowIsRefundable = !array_key_exists('is_refundable', $row) || (int)$row['is_refundable'] === 1;
        $shouldRefund = in_array($newStatus, ['failed', 'rejected'], true)
            && empty($row['refund_reference'])
            && ($rowIsRefundable || $provRefundedVal === 1 || $rawStatus === 'refunded');

        if (!$isTerminal && $shouldRefund) {
            $refundInfo = $this->issueSingleAtomicRefund(
                (string)$row['id'],
                $remarks ?: 'Provider marked request as ' . $newStatus,
                $actorId,
                'refunded'
            );
            $newStatus = !empty($refundInfo['refunded']) ? 'refunded' : 'failed';
            $this->db->execute(
                'UPDATE modification_requests SET provider_transaction_id = COALESCE(NULLIF(:ptx, ""), provider_transaction_id), provider_refunded = COALESCE(:pref, provider_refunded), provider_refunded_amount = CASE WHEN :prefa > 0 THEN :prefa2 ELSE provider_refunded_amount END WHERE id = :id',
                ['ptx' => $resolvedTxId, 'pref' => $provRefundedVal, 'prefa' => $provRefundedAmt, 'prefa2' => $provRefundedAmt, 'id' => $row['id']]
            );
        } elseif (!$isTerminal) {
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     provider_status = :pst,
                     provider_transaction_id = COALESCE(NULLIF(:ptx, ""), provider_transaction_id),
                     provider_refunded = COALESCE(:pref, provider_refunded),
                     provider_refunded_amount = CASE WHEN :prefa > 0 THEN :prefa2 ELSE provider_refunded_amount END,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     provider_response = :pres,
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id AND status NOT IN ("completed", "refunded")',
                [
                    'st' => $newStatus,
                    'pst' => $rawStatus ?: $row['provider_status'],
                    'ptx' => $resolvedTxId,
                    'pref' => $provRefundedVal,
                    'prefa' => $provRefundedAmt,
                    'prefa2' => $provRefundedAmt,
                    'prem' => $remarks,
                    'pres' => json_encode($res),
                    'st2' => $newStatus,
                    'id' => $row['id'],
                ]
            );
        } elseif ($resolvedTxId !== '' && empty($row['provider_transaction_id'])) {
            $this->db->execute('UPDATE modification_requests SET provider_transaction_id = :ptx WHERE id = :id', ['ptx' => $resolvedTxId, 'id' => $row['id']]);
        }

        if ($newStatus === 'completed' || $prevStatus === 'completed') {
            $freshForDoc = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;
            ResultDocumentService::syncFromProviderPayload($this->db, 'modification', $freshForDoc, $res, $adapter->getAuthHeaders());
        }

        $updatedRow = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;

        if ($newStatus !== $prevStatus) {
            $safeRemarks = $remarks !== '' ? Security::sanitizeCustomerError($remarks, '') : '';
            $this->appendStatusHistory(
                (string)$row['id'],
                $prevStatus,
                $newStatus,
                'provider',
                $actorId,
                $safeRemarks !== '' ? $safeRemarks : 'Status synchronized to ' . strtoupper(str_replace('_', ' ', $newStatus)),
                true
            );
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['service_name']} Update: " . strtoupper(str_replace('_', ' ', $newStatus)),
                $newStatus === 'completed'
                    ? "Great news! Your {$row['service_name']} request ({$row['request_number']}) is completed." . (!empty($updatedRow['result_document_id']) ? ' Official PDF document ready to download.' : '')
                    : ($newStatus === 'refunded'
                        ? "Your {$row['service_name']} request ({$row['request_number']}) could not be completed and ₦" . number_format((float)$row['customer_price'], 2) . " has been refunded."
                        : "Update on {$row['request_number']} ({$row['service_name']}): " . ($safeRemarks ?: "Status changed to {$newStatus}.")),
                $newStatus === 'completed' ? 'success' : (in_array($newStatus, ['query_required', 'refunded', 'failed', 'rejected'], true) ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
            try {
                $refEngine = new ReferralEngineService($this->db);
                $srcRef = (string)($row['payment_reference'] ?: $row['request_number']);
                if ($newStatus === 'completed') {
                    $refEngine->recordQualifyingTransaction([
                        'user_id' => (string)$row['user_id'],
                        'service_category' => 'additional_services',
                        'service_key' => (string)$row['service_key'],
                        'source_reference' => $srcRef,
                        'gross_amount' => (float)$row['customer_price'],
                        'wholesale_cost' => (float)$row['provider_cost'],
                        'gateway_fee' => 0.0,
                    ]);
                } elseif ($newStatus === 'refunded') {
                    $refEngine->reverseRewardsForSource($srcRef, 'Additional service refunded on provider poll', $actorId);
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
     * POST /api/additional-services/:id/poll
     */
    public function pollStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isStaff = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (id = :id1 OR request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (!$isStaff && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to service request.');
        }

        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Manual processing orders cannot be polled against external providers.', 422);
        }

        $sync = $this->syncProviderStatusForRow($row, $isStaff ? (string)$user['id'] : null);

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($sync['row'], $isStaff),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    /**
     * POST /api/additional-services/:id/submit-info
     */
    public function submitAdditionalInfo(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE id = :id AND user_id = :uid AND identity_type = "ADDITIONAL" LIMIT 1',
            ['id' => $id, 'uid' => $user['id']]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        SchemaSync::syncManualFulfilmentPhase5Schema($this->db);

        if ($row['status'] !== 'query_required') {
            Response::error('Additional information can only be submitted when status is Query / Info Required.', 422);
        }

        $deadlineRaw = trim((string)($row['clarification_deadline'] ?? ''));
        if ($deadlineRaw !== '') {
            $deadlineTs = strtotime($deadlineRaw);
            if ($deadlineTs !== false && $deadlineTs < time()) {
                Response::error('The clarification submission deadline has passed.', 422);
            }
        }

        $existingFields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        if (($existingFields['query_review_status'] ?? '') === 'submitted_for_admin_review') {
            Response::error('Your clarification is already queued for administrator review.', 409);
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

        $now = date('Y-m-d H:i:s');
        $existingFields['query_review_status'] = 'submitted_for_admin_review';
        $existingFields['customer_query_responded_at'] = $now;
        if ($note !== '') {
            $existingFields['customer_query_response'] = $note;
        }

        $existingDocs = $this->decodeJsonColumn($row['supporting_documents'] ?? null, []);
        $attachedDocMeta = [];
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
                $docEntry = [
                    'id' => $dr['id'],
                    'doc_key' => str_replace('additional_', '', (string)$dr['document_type']),
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_size' => (int)($dr['file_size'] ?? 0),
                    'file_url' => '/api/additional-services/document/' . $dr['id'],
                ];
                $attachedDocMeta[] = ['id' => $dr['id'], 'original_name' => $dr['original_name']];
                if (!in_array($dr['id'], $existingDocIds, true)) {
                    $existingDocs[] = $docEntry;
                }
            }
        }

        $infoHistory = $this->decodeJsonColumn($row['additional_info_history'] ?? null, []);
        $infoHistory[] = [
            'id' => Security::generateUuid(),
            'submitted_at' => $now,
            'note' => $note,
            'documents' => $attachedDocMeta,
            'review_state' => 'submitted_for_admin_review',
        ];

        $this->db->execute(
            'UPDATE modification_requests SET submitted_fields = :sf, supporting_documents = :sd, additional_info_history = :aih, updated_at = NOW() WHERE id = :id',
            ['sf' => json_encode($existingFields), 'sd' => json_encode($existingDocs), 'aih' => json_encode($infoHistory), 'id' => $row['id']]
        );

        $this->appendStatusHistory(
            (string)$row['id'],
            (string)$row['status'],
            (string)$row['status'],
            'customer',
            (string)$user['id'],
            $note !== '' ? 'Customer clarification submitted: ' . mb_substr($note, 0, 220) : 'Customer submitted clarification document(s)',
            true
        );

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'services',
            'action' => 'CUSTOMER_ADDITIONAL_SERVICE_QUERY_RESPONDED',
            'service_type' => $row['service_key'] ?? 'additional_services',
            'reference' => $row['request_number'] ?? $row['id'],
            'status' => 'processing',
            'metadata' => [
                'review_state' => 'submitted_for_admin_review',
                'documents_attached' => count($attachedDocMeta),
            ],
        ]);

        try {
            $notifyIds = [];
            $assignedId = trim((string)($row['assigned_to'] ?? $row['claimed_by'] ?? ''));
            if ($assignedId !== '') {
                $notifyIds[] = $assignedId;
            }
            $adminRow = $this->db->fetchOne('SELECT id FROM users WHERE role IN ("superadmin", "admin") ORDER BY created_at ASC LIMIT 1');
            if ($adminRow && !in_array((string)$adminRow['id'], $notifyIds, true)) {
                $notifyIds[] = (string)$adminRow['id'];
            }
            foreach ($notifyIds as $nUid) {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, "info", 0, "#manual-fulfilment", NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $nUid,
                        'title' => 'Additional Info Submitted: ' . ($row['request_number'] ?? $row['id']),
                        'msg' => 'Customer submitted additional clarification/documents for ' . ($row['service_name'] ?? 'service request') . ' (' . ($row['request_number'] ?? $row['id']) . '). Administrator review required.',
                    ]
                );
            }
        } catch (Throwable) {
        }

        $updated = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]);
        Response::success([
            'review_state' => 'submitted_for_admin_review',
            'request' => $updated ? $this->formatRequestRow($updated, false) : null,
        ], 'Additional clarification submitted and queued for administrator review.');
    }

    /**
     * Reusable webhook processor called by ModificationController::webhook or directly by /api/additional-services/webhook.
     */
    public function handleWebhookPayload(array $body, ?array $preloadedRow = null): array
    {
        $ref = trim((string)($body['reference'] ?? $body['data']['reference'] ?? $body['request_id'] ?? $body['data']['request_id'] ?? ''));
        $txId = trim((string)($body['transaction_id'] ?? $body['data']['transaction_id'] ?? ''));

        $row = $preloadedRow;
        if (!$row) {
            if ($ref !== '' && $txId !== '') {
                $row = $this->db->fetchOne(
                    'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (provider_reference = :r1 OR payment_reference = :r2 OR request_number = :r3 OR provider_transaction_id = :tx1) LIMIT 1',
                    ['r1' => $ref, 'r2' => $ref, 'r3' => $ref, 'tx1' => $txId]
                );
            } elseif ($ref !== '') {
                $row = $this->db->fetchOne(
                    'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (provider_reference = :r1 OR payment_reference = :r2 OR request_number = :r3 OR provider_transaction_id = :r4) LIMIT 1',
                    ['r1' => $ref, 'r2' => $ref, 'r3' => $ref, 'r4' => $ref]
                );
            } elseif ($txId !== '') {
                $row = $this->db->fetchOne(
                    'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (provider_transaction_id = :tx1 OR provider_reference = :tx2) LIMIT 1',
                    ['tx1' => $txId, 'tx2' => $txId]
                );
            }
        }
        if (!$row) {
            return ['matched' => false, 'processed' => false];
        }

        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            return [
                'matched' => true,
                'processed' => false,
                'status' => (string)$row['status'],
                'record_id' => $row['id'],
                'message' => 'Internal manual order ignores external webhooks.',
            ];
        }

        $adapter = new TwoSureVerifyAdapter();
        $prevStatus = (string)$row['status'];
        $isTerminal = in_array($prevStatus, ['completed', 'refunded'], true);
        if ($isTerminal) {
            if ($txId !== '' && empty($row['provider_transaction_id'])) {
                $this->db->execute('UPDATE modification_requests SET provider_transaction_id = :ptx WHERE id = :id', ['ptx' => $txId, 'id' => $row['id']]);
            }
            if ($prevStatus === 'completed' && empty($row['result_document_id'])) {
                ResultDocumentService::syncFromProviderPayload($this->db, 'modification', $row, $body, $adapter->getAuthHeaders());
            }
            return ['matched' => true, 'processed' => false, 'status' => $prevStatus, 'record_id' => $row['id']];
        }

        $statusRaw = strtolower(trim((string)($body['status'] ?? $body['data']['status'] ?? '')));
        $remarks = trim((string)($body['message'] ?? $body['remarks'] ?? $body['data']['remarks'] ?? $body['data']['admin_note'] ?? ''));
        $rawRefunded = $body['refunded'] ?? $body['data']['refunded'] ?? null;
        $provRefundedVal = $rawRefunded !== null ? (filter_var($rawRefunded, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ? 1 : 0) : null;
        $provRefundedAmt = is_numeric($body['refund_amount'] ?? $body['data']['refund_amount'] ?? null)
            ? (float)($body['refund_amount'] ?? $body['data']['refund_amount'])
            : 0.0;

        $newStatus = $prevStatus;
        if (in_array($statusRaw, ['completed', 'complete', 'approved', 'success', 'successful', 'done', 'delivered'], true)) {
            $newStatus = 'completed';
        } elseif (in_array($statusRaw, ['processing', 'in_progress', 'in-progress', 'reviewing'], true)) {
            $newStatus = 'processing';
        } elseif (in_array($statusRaw, ['query', 'query_required', 'info_required', 'action_required'], true)) {
            $newStatus = 'query_required';
        } elseif ($statusRaw === 'refunded' || in_array($statusRaw, ['failed', 'rejected', 'declined', 'error'], true)) {
            $newStatus = $statusRaw === 'failed' ? 'failed' : 'rejected';
        }

        $rowIsRefundable = !array_key_exists('is_refundable', $row) || (int)$row['is_refundable'] === 1;
        $shouldRefund = in_array($newStatus, ['failed', 'rejected'], true)
            && empty($row['refund_reference'])
            && ($rowIsRefundable || $provRefundedVal === 1 || $statusRaw === 'refunded');

        if ($shouldRefund) {
            $refundRes = $this->issueSingleAtomicRefund((string)$row['id'], $remarks ?: 'Provider webhook reported failure', null, 'refunded');
            $newStatus = !empty($refundRes['refunded']) ? 'refunded' : 'failed';
            $this->db->execute(
                'UPDATE modification_requests SET provider_transaction_id = COALESCE(NULLIF(:ptx, ""), provider_transaction_id), provider_refunded = COALESCE(:pref, provider_refunded), provider_refunded_amount = CASE WHEN :prefa > 0 THEN :prefa2 ELSE provider_refunded_amount END WHERE id = :id',
                ['ptx' => $txId, 'pref' => $provRefundedVal, 'prefa' => $provRefundedAmt, 'prefa2' => $provRefundedAmt, 'id' => $row['id']]
            );
        } else {
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     provider_status = COALESCE(NULLIF(:pst, ""), provider_status),
                     provider_transaction_id = COALESCE(NULLIF(:ptx, ""), provider_transaction_id),
                     provider_refunded = COALESCE(:pref, provider_refunded),
                     provider_refunded_amount = CASE WHEN :prefa > 0 THEN :prefa2 ELSE provider_refunded_amount END,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     provider_response = :pres,
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id AND status NOT IN ("completed", "refunded")',
                [
                    'st' => $newStatus,
                    'pst' => $statusRaw,
                    'ptx' => $txId,
                    'pref' => $provRefundedVal,
                    'prefa' => $provRefundedAmt,
                    'prefa2' => $provRefundedAmt,
                    'prem' => $remarks,
                    'pres' => json_encode($body),
                    'st2' => $newStatus,
                    'id' => $row['id'],
                ]
            );
        }

        if ($newStatus === 'completed') {
            $freshForDoc = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;
            $docSync = ResultDocumentService::syncFromProviderPayload($this->db, 'modification', $freshForDoc, $body, $adapter->getAuthHeaders());
            if (empty($docSync['document']) && (!empty($row['provider_reference']) || $txId !== '' || !empty($row['provider_transaction_id']))) {
                $polled = $adapter->checkStatus(
                    (string)($row['provider_reference'] ?? ''),
                    (string)($row['service_key'] ?? ''),
                    $txId !== '' ? $txId : ($row['provider_transaction_id'] ?? null)
                );
                if (!empty($polled)) {
                    ResultDocumentService::syncFromProviderPayload($this->db, 'modification', $freshForDoc, $polled, $adapter->getAuthHeaders());
                }
            }
        }

        $updatedRow = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]) ?: $row;
        if ($newStatus !== $prevStatus) {
            $safeRemarks = $remarks !== '' ? Security::sanitizeCustomerError($remarks, '') : '';
            $this->appendStatusHistory(
                (string)$row['id'],
                $prevStatus,
                $newStatus,
                'provider',
                null,
                $safeRemarks !== '' ? $safeRemarks : 'Webhook status update: ' . strtoupper(str_replace('_', ' ', $newStatus)),
                true
            );
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['service_name']} Status: " . strtoupper(str_replace('_', ' ', $newStatus)),
                $newStatus === 'completed'
                    ? "Great news! Your {$row['service_name']} request ({$row['request_number']}) has been completed." . (!empty($updatedRow['result_document_id']) ? ' Your official PDF result is now ready.' : '')
                    : "Update on request {$row['request_number']} ({$row['service_name']}): " . ($safeRemarks ?: "Status changed to {$newStatus}."),
                $newStatus === 'completed' ? 'success' : (in_array($newStatus, ['refunded', 'query_required', 'failed', 'rejected'], true) ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
        }

        return ['matched' => true, 'processed' => true, 'status' => $newStatus, 'record_id' => $row['id']];
    }

    /**
     * POST /api/additional-services/webhook
     */
    public function webhook(Request $request): void
    {
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $rawInput = file_get_contents('php://input') ?: '';
        $sigHeader = trim((string)(
            $request->header('x-2sureverify-signature')
            ?: $request->header('x-webhook-signature')
            ?: $request->header('x-signature')
            ?: ''
        ));
        $authHeader = trim((string)($request->header('authorization') ?: ''));

        $adapter = new TwoSureVerifyAdapter();
        $sigCheck = $adapter->verifyWebhookSignature($rawInput, $sigHeader, $authHeader);
        if (empty($sigCheck['valid'])) {
            Security::logPrivateError('AdditionalWebhookRejected', (string)($sigCheck['reason'] ?? 'Invalid signature'), [
                'ip' => Security::resolveClientIp(),
            ]);
            Response::unauthorized('Invalid or missing webhook signature.');
        }

        $body = $request->getBody();
        if (empty($body) && $rawInput !== '') {
            $decoded = json_decode($rawInput, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        }

        $deliveryId = trim((string)(
            $request->header('x-delivery-id')
            ?: $request->header('x-webhook-id')
            ?: $body['delivery_id']
            ?: $body['data']['delivery_id']
            ?: $body['event_id']
            ?: ''
        ));
        if ($deliveryId !== '') {
            try {
                $existingDelivery = $this->db->fetchOne(
                    'SELECT id, status_received FROM identity_webhook_deliveries WHERE delivery_id = :did LIMIT 1',
                    ['did' => $deliveryId]
                );
                if ($existingDelivery) {
                    Response::success([
                        'processed' => false,
                        'duplicate_delivery' => true,
                        'delivery_id' => $deliveryId,
                        'status' => $existingDelivery['status_received'] ?? null,
                    ], 'Duplicate webhook delivery safely ignored.');
                }
            } catch (Throwable) {
            }
        }

        $res = $this->handleWebhookPayload($body, null);
        if (empty($res['matched'])) {
            Response::notFound('No matching additional service request found.');
        }

        if ($deliveryId !== '') {
            try {
                $this->db->execute(
                    'INSERT IGNORE INTO identity_webhook_deliveries
                        (id, delivery_id, provider_id, reference, transaction_id, event_type, status_received, payload_hash, domain, record_id, created_at)
                     VALUES (:id, :did, "2sureverify", :ref, :tx, :ev, :st, :ph, "additional", :rid, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'did' => $deliveryId,
                        'ref' => $body['reference'] ?? $body['data']['reference'] ?? null,
                        'tx' => $body['transaction_id'] ?? $body['data']['transaction_id'] ?? null,
                        'ev' => $body['event'] ?? $body['event_type'] ?? null,
                        'st' => $body['status'] ?? $body['data']['status'] ?? null,
                        'ph' => hash('sha256', $rawInput),
                        'rid' => $res['record_id'] ?? null,
                    ]
                );
            } catch (Throwable) {
            }
        }

        Response::success($res);
    }

    // =========================================================================
    // ADMIN OPERATIONS (Scoped strictly to identity_type = "ADDITIONAL")
    // =========================================================================

    public function adminList(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $status = strtolower(trim((string)$request->query('status', 'all')));
        $serviceKey = trim((string)$request->query('service_key', 'all'));
        $search = trim((string)$request->query('search', ''));
        $page = max(1, (int)$request->query('page', 1));
        $limit = min(100, max(10, (int)$request->query('limit', 25)));
        $offset = ($page - 1) * $limit;

        $where = 'WHERE mr.identity_type = "ADDITIONAL" ';
        $params = [];

        if ($status !== '' && $status !== 'all') {
            $where .= 'AND mr.status = :st ';
            $params['st'] = $status;
        }
        if ($serviceKey !== '' && $serviceKey !== 'all') {
            $where .= 'AND mr.service_key = :sk ';
            $params['sk'] = $serviceKey;
        }
        if ($search !== '') {
            $where .= 'AND (mr.request_number LIKE :q1 OR mr.service_name LIKE :q2 OR mr.masked_identifier LIKE :q3 OR mr.payment_reference LIKE :q4 OR mr.provider_reference LIKE :q5 OR mr.provider_transaction_id LIKE :q8 OR u.full_name LIKE :q6 OR u.email LIKE :q7) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
            $params['q4'] = $like;
            $params['q5'] = $like;
            $params['q6'] = $like;
            $params['q7'] = $like;
            $params['q8'] = $like;
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

        $statsRow = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_all,
                SUM(CASE WHEN status IN ("pending", "under_review", "assigned") THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "processing" THEN 1 ELSE 0 END) as processing_count,
                SUM(CASE WHEN status = "query_required" THEN 1 ELSE 0 END) as query_count,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status IN ("failed", "rejected") THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = "refunded" THEN 1 ELSE 0 END) as refunded_count,
                COALESCE(SUM(CASE WHEN status = "completed" THEN customer_price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN status = "completed" THEN CASE WHEN COALESCE(fulfilment_mode, "provider_async") = "internal_manual" OR COALESCE(provider_id, "") = "hambak_manual" THEN COALESCE(internal_fulfilment_cost, 0) ELSE COALESCE(provider_cost, 0) END ELSE 0 END), 0) as total_provider_cost,
                COALESCE(SUM(CASE WHEN status = "completed" THEN customer_price - (CASE WHEN COALESCE(fulfilment_mode, "provider_async") = "internal_manual" OR COALESCE(provider_id, "") = "hambak_manual" THEN COALESCE(internal_fulfilment_cost, 0) ELSE COALESCE(provider_cost, 0) END) ELSE 0 END), 0) as total_margin
             FROM modification_requests
             WHERE identity_type = "ADDITIONAL"'
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

    public function adminStaffList(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $rows = $this->db->fetchAll(
            'SELECT id, full_name, email, role FROM users WHERE role IN ("support", "staff", "manager", "admin", "superadmin") AND status = "active" ORDER BY full_name ASC'
        );
        Response::success(['staff' => $rows ?: []]);
    }

    public function adminDetail(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.identity_type = "ADDITIONAL" AND (mr.id = :id1 OR mr.request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (!Auth::canAccessManualRecord($admin, $row)) {
            Response::forbidden('You are not authorized to access this order.');
        }

        Response::success(['request' => $this->formatRequestRow($row, true)]);
    }

    public function adminPollStatus(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.identity_type = "ADDITIONAL" AND (mr.id = :id1 OR mr.request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (!Auth::canAccessManualRecord($admin, $row)) {
            Response::forbidden('You are not authorized to access this order.');
        }

        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Manual processing orders cannot be polled against external providers.', 422);
        }

        $sync = $this->syncProviderStatusForRow($row, (string)$admin['id']);
        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $sync['row'];

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($fresh, true),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    public function adminUpdateRequest(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id AND identity_type = "ADDITIONAL" LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Internal manual orders must be transitioned through the Manual Fulfilment Desk workflow.', 422);
        }
        if (!Auth::hasPermission($admin, 'services')) {
            Response::forbidden('Access denied. Missing required services permission.');
        }

        $allowedStatuses = ['pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded'];
        $targetStatus = strtolower(trim((string)($body['status'] ?? $row['status'])));
        if (!in_array($targetStatus, $allowedStatuses, true)) {
            Response::error('Invalid target status specified.', 422);
        }

        $remarks = array_key_exists('provider_remarks', $body) ? trim((string)$body['provider_remarks']) : (string)($row['provider_remarks'] ?? '');
        $adminNotes = array_key_exists('admin_notes', $body) ? trim((string)$body['admin_notes']) : (string)($row['admin_notes'] ?? '');
        $requestedCorrections = array_key_exists('requested_corrections', $body) ? trim((string)$body['requested_corrections']) : (string)($row['requested_corrections'] ?? '');
        $etaText = array_key_exists('estimated_completion_text', $body) ? trim((string)$body['estimated_completion_text']) : (string)($row['estimated_completion_text'] ?? '');
        $rowIsRefundable = !array_key_exists('is_refundable', $row) || (int)$row['is_refundable'] === 1;
        $triggerRefund = array_key_exists('trigger_refund', $body) ? (bool)$body['trigger_refund'] : $rowIsRefundable;

        $prevStatus = (string)$row['status'];
        if ($prevStatus === 'completed' && in_array($targetStatus, ['failed', 'rejected', 'refunded'], true)) {
            Response::error('Completed requests cannot be marked failed or refunded.', 422);
        }

        $refundRes = null;
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
            $submittedFields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
            if ($targetStatus === 'query_required') {
                $submittedFields['query_review_status'] = 'awaiting_customer_response';
                if ($requestedCorrections === '' && $remarks !== '') {
                    $requestedCorrections = $remarks;
                }
            } elseif (in_array($targetStatus, ['processing', 'completed', 'under_review', 'assigned'], true) && !empty($submittedFields['query_review_status'])) {
                $submittedFields['query_review_status'] = 'approved';
            }

            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st,
                     submitted_fields = :sf,
                     provider_remarks = :prem,
                     admin_notes = :anotes,
                     requested_corrections = :reqcorr,
                     estimated_completion_text = :eta,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     completed_at = CASE WHEN :st2 = "completed" AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'st' => $targetStatus,
                    'sf' => json_encode($submittedFields),
                    'prem' => $remarks,
                    'anotes' => $adminNotes,
                    'reqcorr' => $requestedCorrections !== '' ? $requestedCorrections : null,
                    'eta' => $etaText,
                    'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'],
                    'st2' => $targetStatus,
                    'id' => $id,
                ]
            );
        }

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $id]
        );
        $finalStatus = (string)($fresh['status'] ?? $targetStatus);

        if ($finalStatus !== $prevStatus || $remarks !== (string)($row['provider_remarks'] ?? '')) {
            $this->appendStatusHistory(
                (string)$id,
                $prevStatus,
                $finalStatus,
                'admin',
                (string)$admin['id'],
                $remarks !== '' ? $remarks : 'Administrator updated request status to ' . strtoupper(str_replace('_', ' ', $finalStatus)),
                true
            );
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['service_name']} Update: " . strtoupper(str_replace('_', ' ', $finalStatus)),
                "Your {$row['service_name']} request ({$row['request_number']}) status is now " . strtoupper(str_replace('_', ' ', $finalStatus)) . '.' . (!empty($refundRes['refunded']) ? ' Wallet refund has been issued.' : '') . ($remarks ? " Remarks: {$remarks}" : ''),
                $finalStatus === 'completed' ? 'success' : (in_array($finalStatus, ['query_required', 'refunded', 'failed', 'rejected'], true) ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $finalStatus, 'service_name' => $row['service_name']]
            );
        }

        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_SERVICE_UPDATED', [
            'request_id' => $id,
            'request_number' => $row['request_number'],
            'previous_status' => $prevStatus,
            'new_status' => $finalStatus,
            'refunded' => !empty($refundRes['refunded']),
        ], $request);

        Response::success([
            'request' => $fresh ? $this->formatRequestRow($fresh, true) : null,
            'refund' => $refundRes,
        ], 'Service request updated.');
    }

    public function adminAssign(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (id = :id1 OR request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            if (!Auth::hasPermission($admin, 'manual_fulfilment.assign')) {
                Response::forbidden('Access denied. Missing required manual_fulfilment.assign permission.');
            }
            $prevAssignee = trim((string)($row['assigned_to'] ?? $row['claimed_by'] ?? ''));
            $reqAssignee = trim((string)($body['staff_id'] ?? $body['assigned_to'] ?? ''));
            if ($prevAssignee !== '' && $prevAssignee !== $reqAssignee && !Auth::isManualFulfilmentSupervisor($admin)) {
                Response::forbidden('Only a supervisor or manager can reassign an already-assigned manual order.');
            }
        }

        $staffId = trim((string)($body['staff_id'] ?? $body['assigned_to'] ?? ''));
        $staffName = null;
        if ($staffId !== '') {
            $staffRow = $this->db->fetchOne(
                'SELECT id, full_name, email FROM users WHERE id = :sid AND role IN ("support", "staff", "manager", "admin", "superadmin") AND status = "active" LIMIT 1',
                ['sid' => $staffId]
            );
            if (!$staffRow) {
                Response::error('Selected staff assignee was not found or is inactive.', 422);
            }
            $staffName = (string)($staffRow['full_name'] ?: $staffRow['email']);
        }

        $prevStatus = (string)$row['status'];
        $transitionToAssigned = ($staffId !== '') && in_array($prevStatus, ['pending', 'under_review'], true) && (!array_key_exists('set_assigned_status', $body) || (bool)$body['set_assigned_status']);
        $newStatus = $transitionToAssigned ? 'assigned' : $prevStatus;

        $this->db->execute(
            'UPDATE modification_requests
             SET assigned_to = :ato,
                 assigned_staff_name = :aname,
                 assigned_at = CASE WHEN :ato2 IS NOT NULL THEN NOW() ELSE NULL END,
                 status = :st,
                 updated_at = NOW()
             WHERE id = :id',
            ['ato' => $staffId !== '' ? $staffId : null, 'aname' => $staffName, 'ato2' => $staffId !== '' ? $staffId : null, 'st' => $newStatus, 'id' => $row['id']]
        );

        $this->appendStatusHistory((string)$row['id'], $prevStatus, $newStatus, 'admin', (string)$admin['id'], $staffId !== '' ? "Assigned to staff officer: {$staffName}" : 'Staff assignment cleared', false);
        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_ASSIGNED', ['request_id' => $row['id'], 'assigned_to' => $staffId ?: null], $request);

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        );
        Response::success(['request' => $fresh ? $this->formatRequestRow($fresh, true) : null], $staffId !== '' ? "Assigned to {$staffName}." : 'Assignment cleared.');
    }

    public function adminUpdateChecklist(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (id = :id1 OR request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (!Auth::canAccessManualRecord($admin, $row)) {
            Response::forbidden('You are not authorized to update this order checklist.');
        }
        if (FulfilmentRouterService::isInternalManualOrder($row) && !Auth::hasPermission($admin, 'manual_fulfilment.process')) {
            Response::forbidden('Access denied. Missing required manual_fulfilment.process permission.');
        }

        $rawChecklist = $body['checklist'] ?? [];
        if (!is_array($rawChecklist)) {
            Response::error('Invalid document checklist payload.', 422);
        }

        $normalized = [];
        $reviewerLabel = (string)($admin['full_name'] ?? $admin['email'] ?? $admin['id']);
        $now = date('Y-m-d H:i:s');
        $allowedStates = ['pending', 'verified', 'rejected', 'needs_reupload'];

        foreach ($rawChecklist as $docKey => $entry) {
            $k = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)$docKey) ?? '';
            if ($k === '' || !is_array($entry)) {
                continue;
            }
            $st = strtolower(trim((string)($entry['status'] ?? 'pending')));
            if (!in_array($st, $allowedStates, true)) {
                $st = 'pending';
            }
            $normalized[$k] = [
                'status' => $st,
                'note' => trim((string)($entry['note'] ?? '')),
                'reviewed_by' => $reviewerLabel,
                'reviewed_at' => $now,
            ];
        }

        $this->db->execute(
            'UPDATE modification_requests SET document_review_checklist = :chk, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW() WHERE id = :id',
            ['chk' => json_encode($normalized), 'rby' => $reviewerLabel, 'id' => $row['id']]
        );

        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_CHECKLIST_UPDATED', ['request_id' => $row['id'], 'checklist_count' => count($normalized)], $request);

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        );
        Response::success(['request' => $fresh ? $this->formatRequestRow($fresh, true) : null], 'Document verification checklist saved.');
    }

    public function adminReviewInfo(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (id = :id1 OR request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (!Auth::canAccessManualRecord($admin, $row)) {
            Response::forbidden('You are not authorized to review clarifications for this order.');
        }
        if (FulfilmentRouterService::isInternalManualOrder($row) && !Auth::hasPermission($admin, 'manual_fulfilment.process')) {
            Response::forbidden('Access denied. Missing required manual_fulfilment.process permission.');
        }

        $decision = strtolower(trim((string)($body['decision'] ?? $body['action'] ?? '')));
        if (!in_array($decision, ['approve', 'request_more', 'reject'], true)) {
            Response::error('Invalid clarification review decision. Use approve, request_more, or reject.', 422);
        }

        $remarks = trim((string)($body['remarks'] ?? $body['requested_corrections'] ?? $body['note'] ?? ''));
        $prevStatus = (string)$row['status'];
        if (in_array($prevStatus, ['completed', 'refunded'], true)) {
            Response::error('Terminal request cannot be modified.', 422);
        }

        $submittedFields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        $infoHistory = $this->decodeJsonColumn($row['additional_info_history'] ?? null, []);
        if (!empty($infoHistory)) {
            $lastIdx = count($infoHistory) - 1;
            $infoHistory[$lastIdx]['review_state'] = $decision === 'approve' ? 'approved' : ($decision === 'request_more' ? 'needs_more_correction' : 'rejected');
            $infoHistory[$lastIdx]['reviewed_at'] = date('Y-m-d H:i:s');
            if ($remarks !== '') {
                $infoHistory[$lastIdx]['admin_feedback'] = $remarks;
            }
        }

        $refundRes = null;
        if ($decision === 'approve') {
            $targetStatus = strtolower(trim((string)($body['next_status'] ?? 'processing')));
            if (!in_array($targetStatus, ['under_review', 'assigned', 'processing'], true)) {
                $targetStatus = 'processing';
            }
            $submittedFields['query_review_status'] = 'approved';
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = :st, submitted_fields = :sf, additional_info_history = :aih, requested_corrections = NULL,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks), reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = :id',
                ['st' => $targetStatus, 'sf' => json_encode($submittedFields), 'aih' => json_encode($infoHistory), 'prem' => $remarks, 'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'], 'id' => $row['id']]
            );
            $this->appendStatusHistory((string)$row['id'], $prevStatus, $targetStatus, 'admin', (string)$admin['id'], $remarks ?: 'Clarification approved by administrator.', true);
            $this->notifyCustomer((string)$row['user_id'], "{$row['service_name']} Clarification Approved", "Your clarification for {$row['request_number']} was approved and processing has resumed.", 'success', (string)$row['request_number']);
        } elseif ($decision === 'request_more') {
            if ($remarks === '') {
                Response::error('Please specify what corrections or missing documents the customer should submit.', 422);
            }
            $submittedFields['query_review_status'] = 'awaiting_customer_response';
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = "query_required", submitted_fields = :sf, additional_info_history = :aih, requested_corrections = :reqcorr, provider_remarks = :prem, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = :id',
                ['sf' => json_encode($submittedFields), 'aih' => json_encode($infoHistory), 'reqcorr' => $remarks, 'prem' => $remarks, 'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'], 'id' => $row['id']]
            );
            $this->appendStatusHistory((string)$row['id'], $prevStatus, 'query_required', 'admin', (string)$admin['id'], 'Further correction requested: ' . $remarks, true);
            $this->notifyCustomer((string)$row['user_id'], "{$row['service_name']} Further Correction Needed", "Action required on {$row['request_number']}: {$remarks}", 'warning', (string)$row['request_number']);
        } else {
            $rowIsRefundable = !array_key_exists('is_refundable', $row) || (int)$row['is_refundable'] === 1;
            $rejectReason = $remarks ?: 'Clarification rejected by administrator';
            if ($rowIsRefundable) {
                $refundRes = $this->issueSingleAtomicRefund((string)$row['id'], $rejectReason, (string)$admin['id'], 'refunded');
                $finalSt = !empty($refundRes['refunded']) ? 'refunded' : 'rejected';
            } else {
                $this->db->execute(
                    'UPDATE modification_requests SET status = "rejected", provider_remarks = :prem, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW() WHERE id = :id',
                    ['prem' => $rejectReason, 'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'], 'id' => $row['id']]
                );
                $finalSt = 'rejected';
            }
            $submittedFields['query_review_status'] = 'rejected';
            $this->db->execute('UPDATE modification_requests SET submitted_fields = :sf, additional_info_history = :aih WHERE id = :id', ['sf' => json_encode($submittedFields), 'aih' => json_encode($infoHistory), 'id' => $row['id']]);
            $this->appendStatusHistory((string)$row['id'], $prevStatus, $finalSt, 'admin', (string)$admin['id'], $rejectReason, true);
            $this->notifyCustomer((string)$row['user_id'], "{$row['service_name']} Rejected", "Your request ({$row['request_number']}) was rejected ({$rejectReason})." . (!empty($refundRes['refunded']) ? ' Wallet refund issued.' : ''), 'warning', (string)$row['request_number']);
        }

        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_CLARIFICATION_REVIEWED', ['request_id' => $row['id'], 'decision' => $decision], $request);
        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        );
        Response::success(['request' => $fresh ? $this->formatRequestRow($fresh, true) : null, 'refund' => $refundRes], 'Clarification review recorded.');
    }

    public function adminRetryResultFetch(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.identity_type = "ADDITIONAL" AND (mr.id = :id1 OR mr.request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }
        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Manual processing orders receive PDF results from processing staff rather than upstream provider fetch.', 422);
        }

        $sync = $this->syncProviderStatusForRow($row, (string)$admin['id']);
        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $sync['row'];

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($fresh, true),
        ], !empty($fresh['result_document_id'])
            ? 'Official result document retrieved and stored securely.'
            : ($sync['message'] ?? 'Provider checked; no PDF document returned yet.'));
    }

    public function adminUploadResultDocument(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE identity_type = "ADDITIONAL" AND (id = :id1 OR request_number = :id2) LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Service request not found.');
        }

        $isManualOrder = FulfilmentRouterService::isInternalManualOrder($row);
        if ($isManualOrder) {
            if (!Auth::hasPermission($admin, 'manual_fulfilment.upload_result')) {
                Response::forbidden('Access denied. Missing required manual_fulfilment.upload_result permission.');
            }
            if (!Auth::canAccessManualRecord($admin, $row)) {
                Response::forbidden('You are not authorized to upload a result for this manual order.');
            }
            SchemaSync::syncManualFulfilmentPhase5Schema($this->db);
        } elseif (!Auth::hasPermission($admin, 'services')) {
            Response::forbidden('Access denied. Missing required services permission.');
        }

        $file = $_FILES['file'] ?? $_FILES['result_pdf'] ?? [];
        $trackingId = trim((string)($request->input('tracking_id', '')));
        $remarks = trim((string)($request->input('provider_remarks', '')));
        $markCompleted = !$isManualOrder && in_array((string)$request->input('mark_completed', '1'), ['1', 'true', 'yes'], true);
        $notifyCustomerFlag = !$isManualOrder && in_array((string)$request->input('notify_customer', '1'), ['1', 'true', 'yes'], true);

        $doc = ResultDocumentService::storeAdminUploadedPdf($this->db, 'modification', $row, $file, (string)$admin['id'], $trackingId !== '' ? $trackingId : null);

        $prevStatus = (string)$row['status'];
        if ($isManualOrder) {
            $this->db->execute(
                'UPDATE modification_requests
                 SET result_verification_status = "pending_verification",
                     result_verified_by = NULL,
                     result_verified_at = NULL,
                     result_verification_notes = NULL,
                     awaiting_admin_review = 1,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     updated_at = NOW()
                 WHERE id = :id',
                ['prem' => $remarks, 'id' => $row['id']]
            );
        } elseif ($markCompleted && $prevStatus !== 'refunded') {
            $this->db->execute(
                'UPDATE modification_requests SET status = "completed", provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks), reviewed_by = :rby, reviewed_at = NOW(), completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = :id AND status != "refunded"',
                ['prem' => $remarks, 'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'], 'id' => $row['id']]
            );
        } elseif ($remarks !== '') {
            $this->db->execute('UPDATE modification_requests SET provider_remarks = :prem, updated_at = NOW() WHERE id = :id', ['prem' => $remarks, 'id' => $row['id']]);
        }

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $row;

        $this->appendStatusHistory((string)$row['id'], $prevStatus, (string)($fresh['status'] ?? $prevStatus), 'admin', (string)$admin['id'], $remarks ?: 'Official result PDF uploaded by administrator', true);
        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_RESULT_UPLOADED', ['request_id' => $row['id'], 'document_id' => $doc['id']], $request);

        if ($notifyCustomerFlag) {
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['service_name']} Result Ready",
                "Your official result document for {$row['service_name']} ({$row['request_number']}) is now available to preview and download.",
                'success',
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $fresh['status'] ?? 'completed', 'service_name' => $row['service_name']]
            );
        }

        Response::success(['request' => $this->formatRequestRow($fresh, true)], 'Official result document uploaded and linked to request.');
    }

    public function adminServices(Request $request): void
    {
        Auth::requirePermission($request, 'services');
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $rows = $this->db->fetchAll(
            'SELECT s.*, c.code as category_code
             FROM service_catalogue s
             JOIN service_categories c ON c.id = s.category_id
             WHERE c.code = "additional_services"
             ORDER BY s.selling_price ASC, s.name ASC'
        );

        $services = [];
        foreach ($rows as $row) {
            if (TwoSureVerifyAdapter::getAdditionalMappingSpec((string)($row['service_key'] ?? '')) !== null) {
                $services[] = $this->formatServiceRow($row, true);
            }
        }

        Response::success([
            'services' => $services,
            'unverified_services' => self::getUnverifiedServiceNotices(),
        ]);
    }

    public function adminUpdateService(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $key = trim((string)($params['key'] ?? ''));
        $body = $request->getBody();

        $existing = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code FROM service_catalogue s JOIN service_categories c ON c.id = s.category_id WHERE s.service_key = :sk AND c.code = "additional_services" LIMIT 1',
            ['sk' => $key]
        );
        if (!$existing) {
            Response::notFound('Additional service not found.');
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
        $isManual = strtolower((string)($existing['fulfilment_mode'] ?? '')) === 'internal_manual'
            || strtolower((string)($existing['provider_id'] ?? '')) === 'hambak_manual';

        foreach (['fulfilment_mode', 'internal_manual_eligible', 'sla_hours', 'provider_schema_verified'] as $protectedField) {
            if (array_key_exists($protectedField, $body)) {
                $incomingVal = is_bool($body[$protectedField]) ? ($body[$protectedField] ? '1' : '0') : trim((string)$body[$protectedField]);
                $existingVal = is_bool($existing[$protectedField] ?? null) ? (!empty($existing[$protectedField]) ? '1' : '0') : trim((string)($existing[$protectedField] ?? ''));
                if ($incomingVal !== '' && $incomingVal !== $existingVal) {
                    Response::error('Protected routing field (' . $protectedField . ') must be configured through the Unified Service Routing panel.', 422);
                }
            }
        }

        if (isset($body['wholesale_cost'])) {
            $reqWholesale = max(0.0, (float)$body['wholesale_cost']);
            if ($isManual) {
                if (abs($reqWholesale - (float)$existing['wholesale_cost']) >= 0.01) {
                    Response::error('External wholesale_cost cannot be overwritten on an internal_manual service.', 422);
                }
            } else {
                $updates[] = 'wholesale_cost = :wc';
                $dbParams['wc'] = $reqWholesale;
            }
        }
        if (isset($body['internal_fulfilment_cost'])) {
            $updates[] = 'internal_fulfilment_cost = :ifc';
            $dbParams['ifc'] = max(0.0, (float)$body['internal_fulfilment_cost']);
        }
        if (isset($body['is_active']) || isset($body['enabled'])) {
            $active = isset($body['is_active']) ? (bool)$body['is_active'] : (bool)$body['enabled'];
            $updates[] = 'is_active = :act';
            $dbParams['act'] = $active ? 1 : 0;
        }
        if (isset($body['is_refundable'])) {
            $updates[] = 'is_refundable = :ir';
            $dbParams['ir'] = (bool)$body['is_refundable'] ? 1 : 0;
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
            $reqEp = trim((string)$body['endpoint']);
            $existingEp = trim((string)($existing['endpoint'] ?? ''));
            if ($isManual) {
                if ($reqEp !== $existingEp) {
                    Response::error('External provider endpoint cannot be modified on an internal_manual service.', 422);
                }
            } else {
                $updates[] = 'endpoint = :ep';
                $dbParams['ep'] = $reqEp;
            }
        }
        if (array_key_exists('provider_id', $body) && trim((string)$body['provider_id']) !== '') {
            $reqProvRaw = trim((string)$body['provider_id']);
            $reqProv = strtolower($reqProvRaw);
            $existingProv = strtolower(trim((string)($existing['provider_id'] ?? '')));
            if ($reqProv !== $existingProv) {
                if ($isManual || in_array($reqProv, ['hambak_manual', 'internal_manual'], true)) {
                    Response::error('Fulfilment mode and HAMBAK MANUAL routing must be configured through the Unified Service Routing panel.', 422);
                }
                $updates[] = 'provider_id = :pid';
                $dbParams['pid'] = $reqProvRaw;
            }
        }

        $targetSelling = isset($dbParams['sp']) ? (float)$dbParams['sp'] : (float)$existing['selling_price'];
        $targetWholesale = isset($dbParams['wc']) ? (float)$dbParams['wc'] : (float)$existing['wholesale_cost'];
        $targetInternalCost = isset($dbParams['ifc']) ? (float)$dbParams['ifc'] : (float)($existing['internal_fulfilment_cost'] ?? 0);
        $costFloor = $isManual ? $targetInternalCost : $targetWholesale;
        $costLabel = $isManual ? 'internal fulfilment cost' : 'wholesale cost';

        if ($targetSelling < $costFloor) {
            Response::error('Customer selling price cannot be lower than ' . $costLabel . '.', 422);
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $this->db->execute('UPDATE service_catalogue SET ' . implode(', ', $updates) . ' WHERE id = :id', $dbParams);
        }

        $fresh = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code FROM service_catalogue s JOIN service_categories c ON c.id = s.category_id WHERE s.id = :id LIMIT 1',
            ['id' => $existing['id']]
        );
        if ($fresh) {
            $freshIsManual = strtolower((string)($fresh['fulfilment_mode'] ?? '')) === 'internal_manual'
                || strtolower((string)($fresh['provider_id'] ?? '')) === 'hambak_manual';
            if (!$freshIsManual) {
                SchemaSync::syncProviderServiceMapping($this->db, (string)($fresh['provider_id'] ?? '2sureverify'), $key, (string)($fresh['endpoint'] ?? ''), (float)($fresh['wholesale_cost'] ?? 0), !empty($fresh['is_active']) ? 1 : 0);
            }
        }

        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_SERVICE_CONFIG_UPDATED', [
            'service_key' => $key,
            'selling_price' => $targetSelling,
            'wholesale_cost' => $targetWholesale,
            'internal_fulfilment_cost' => $targetInternalCost,
            'fulfilment_mode' => $fresh['fulfilment_mode'] ?? null,
        ], $request);
        Response::success(['service' => $fresh ? $this->formatServiceRow($fresh, true) : null], 'Service configuration updated.');
    }

    public function adminSyncCatalog(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncAdditionalServicesCatalog($this->db, true);

        $adapter = new TwoSureVerifyAdapter();
        $updated = 0;
        if ($adapter->hasCredentials()) {
            $srvRes = $adapter->getServicesCatalog();
            $list = $srvRes['data'] ?? $srvRes['services'] ?? [];
            if (is_array($list) && !empty($list['services']) && is_array($list['services'])) {
                $list = $list['services'];
            }
            if (!empty($srvRes['success']) && is_array($list)) {
                $localRows = $this->db->fetchAll(
                    'SELECT s.id, s.service_key, s.endpoint, s.provider_id, COALESCE(s.fulfilment_mode, "provider_async") AS fulfilment_mode
                     FROM service_catalogue s
                     JOIN service_categories c ON c.id = s.category_id
                     WHERE c.code = "additional_services"
                       AND COALESCE(s.fulfilment_mode, "provider_async") <> "internal_manual"
                       AND COALESCE(s.provider_id, "") <> "hambak_manual"'
                );
                foreach ($list as $k => $entry) {
                    if (!is_array($entry)) {
                        continue;
                    }
                    $ep = strtolower(trim((string)($entry['endpoint'] ?? $entry['url'] ?? '')));
                    $sk = strtolower(trim((string)($entry['service_key'] ?? $entry['key'] ?? $entry['code'] ?? (is_string($k) ? $k : ''))));
                    $price = $entry['price'] ?? $entry['cost'] ?? $entry['amount'] ?? null;
                    if (!is_numeric($price) || (float)$price <= 0) {
                        continue;
                    }
                    foreach ($localRows as $lr) {
                        $localEp = strtolower(trim((string)$lr['endpoint']));
                        $localSk = strtolower(trim((string)$lr['service_key']));
                        if (($sk !== '' && $sk === $localSk) || ($ep !== '' && basename($ep) === basename($localEp))) {
                            $newWc = (float)$price;
                            $this->db->execute(
                                'UPDATE service_catalogue
                                 SET wholesale_cost = :wc,
                                     selling_price = CASE WHEN selling_price < :wc_chk THEN :wc_floor ELSE selling_price END,
                                     updated_at = NOW()
                                 WHERE id = :id
                                   AND COALESCE(fulfilment_mode, "provider_async") <> "internal_manual"
                                   AND COALESCE(provider_id, "") <> "hambak_manual"',
                                ['wc' => $newWc, 'wc_chk' => $newWc, 'wc_floor' => round($newWc + max(250.0, $newWc * 0.25), -1), 'id' => $lr['id']]
                            );
                            $updated++;
                        }
                    }
                }
            }
        }

        try {
            $this->db->execute(
                'UPDATE provider_service_mappings psm
                 INNER JOIN service_catalogue s ON s.service_key = psm.service_key AND s.provider_id = psm.provider_id
                 SET psm.provider_endpoint = s.endpoint,
                     psm.wholesale_cost = s.wholesale_cost,
                     psm.is_active = s.is_active
                 WHERE COALESCE(s.fulfilment_mode, "provider_async") <> "internal_manual"
                   AND COALESCE(s.provider_id, "") <> "hambak_manual"'
            );
        } catch (Throwable) {
        }

        $this->recordAudit($admin, 'ADMIN_ADDITIONAL_CATALOG_SYNCED', ['updated_services' => $updated], $request);
        Response::success(['updated_services' => $updated], "Synchronized additional services catalog ({$updated} wholesale updates).");
    }
}
