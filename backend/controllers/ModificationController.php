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
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Services\ResultDocumentService;
use HambakTech\Services\FulfilmentRouterService;
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
        $catCode = strtolower(trim((string)($row['category_code'] ?? $row['category'] ?? '')));
        $serviceKey = (string)($row['service_key'] ?? $row['key'] ?? '');
        $skLower = strtolower($serviceKey);
        if ($catCode !== '') {
            $identityType = ($catCode === 'bvn_modification') ? 'BVN' : 'NIN';
        } else {
            $identityType = ($skLower === 'bvn_modification' || str_starts_with($skLower, 'bvn_mod'))
                ? 'BVN'
                : 'NIN';
        }

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
            'category' => $catCode ?: ($identityType === 'BVN' ? 'bvn_modification' : 'nin_modification'),
            'identity_type' => $identityType,
            'name' => (string)($row['name'] ?? ''),
            'description' => (string)($row['description'] ?? ''),
            'selling_price' => $selling,
            'price' => $selling,
            'is_active' => (bool)($row['is_active'] ?? true),
            'enabled' => (bool)($row['is_active'] ?? true),
            'processing_type' => (string)($row['processing_type'] ?? 'manual'),
            'fulfilment_mode' => $fulfilmentMode,
            'sla_hours' => $slaHours,
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
            $formatted['internal_fulfilment_cost'] = $internalCost;
            $effectiveCost = $fulfilmentMode === 'internal_manual' ? $internalCost : $wholesale;
            $formatted['profit'] = round($selling - $effectiveCost, 2);
            $formatted['margin_percent'] = $selling > 0 ? round((($selling - $effectiveCost) / $selling) * 100, 1) : 0.0;
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
        $internalFulfilmentCost = (float)($row['internal_fulfilment_cost'] ?? 0);
        $fulfilmentMode = strtolower(trim((string)($row['fulfilment_mode'] ?? '')));
        if (!in_array($fulfilmentMode, FulfilmentRouterService::VALID_MODES, true)) {
            $fulfilmentMode = FulfilmentRouterService::isInternalManualOrder($row) ? 'internal_manual' : 'provider_async';
        }
        $effectiveCost = $fulfilmentMode === 'internal_manual' ? $internalFulfilmentCost : $providerCost;
        $profit = (float)($row['profit'] ?? ($customerPrice - $effectiveCost));

        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $row, 'modification', $isAdmin);
        $infoHistory = $this->decodeJsonColumn($row['additional_info_history'] ?? null, []);
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
        $isRefundable = array_key_exists('is_refundable', $row) ? (bool)(int)$row['is_refundable'] : true;

        $item = array_merge([
            'id' => (string)($row['id'] ?? ''),
            'request_number' => (string)($row['request_number'] ?? ''),
            'user_id' => (string)($row['user_id'] ?? ''),
            'identity_type' => (string)($row['identity_type'] ?? 'NIN'),
            'service_key' => (string)($row['service_key'] ?? ''),
            'service_name' => (string)($row['service_name'] ?? ''),
            'masked_identifier' => (string)($row['masked_identifier'] ?? ''),
            'submitted_fields' => $fields,
            'supporting_documents' => $docs,
            'document_review_checklist' => is_array($checklist) ? $checklist : [],
            'enrollment_type' => $row['enrollment_type'] ?? null,
            'customer_price' => $customerPrice,
            'is_refundable' => $isRefundable,
            'fulfilment_mode' => $fulfilmentMode,
            'sla_due_at' => $row['sla_due_at'] ?? null,
            'awaiting_admin_review' => !empty($row['awaiting_admin_review']),
            'payment_reference' => (string)($row['payment_reference'] ?? ''),
            'refund_reference' => $row['refund_reference'] ?? null,
            'provider_remarks' => $row['provider_remarks'] ?? null,
            'requested_corrections' => $row['requested_corrections'] ?? null,
            'estimated_completion_text' => (string)($row['estimated_completion_text'] ?? 'Manual Processing'),
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
            $item['assigned_to'] = $row['assigned_to'] ?? null;
            $item['assigned_staff_name'] = $row['assigned_staff_name'] ?? null;
            $item['assigned_at'] = $row['assigned_at'] ?? null;
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
            $item['completion_approved_by'] = $row['completion_approved_by'] ?? null;
            $item['completion_approved_at'] = $row['completion_approved_at'] ?? null;
            $item['provider_response'] = $this->decodeJsonColumn($row['provider_response'] ?? null, []);
        } else {
            // Strip internal provider references, costs, and sanitize remarks for customer responses
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
                $rawData = $res['data'] ?? $res['banks'] ?? $res['enrollment_types'] ?? [];
                if (is_array($rawData) && !empty($rawData['banks']) && is_array($rawData['banks'])) {
                    $rawData = $rawData['banks'];
                } elseif (is_array($rawData) && !empty($rawData['enrollment_types']) && is_array($rawData['enrollment_types'])) {
                    $rawData = $rawData['enrollment_types'];
                }

                $normalizedEntries = [];
                if (is_array($rawData)) {
                    foreach ($rawData as $k => $v) {
                        if (is_array($v)) {
                            $typeCode = trim((string)($v['enrollment_type'] ?? $v['bank_code'] ?? $v['code'] ?? $v['name'] ?? $v['bank_name'] ?? (is_string($k) ? $k : '')));
                            $label = trim((string)($v['label'] ?? $v['name'] ?? $v['bank_name'] ?? $v['enrollment_type'] ?? $typeCode));
                            $rawPrice = $v['price'] ?? $v['cost'] ?? $v['amount'] ?? 0;
                            if ($typeCode !== '') {
                                $normalizedEntries[] = ['code' => $typeCode, 'label' => $label, 'price' => is_numeric($rawPrice) ? (float)$rawPrice : 0.0];
                            }
                        } elseif (is_string($k) && (is_numeric($v) || is_string($v))) {
                            $typeCode = trim($k);
                            if ($typeCode !== '') {
                                $normalizedEntries[] = [
                                    'code' => $typeCode,
                                    'label' => $typeCode,
                                    'price' => is_numeric($v) ? (float)$v : 0.0,
                                ];
                            }
                        } elseif (is_string($v) && trim($v) !== '') {
                            $typeCode = trim($v);
                            $normalizedEntries[] = ['code' => $typeCode, 'label' => $typeCode, 'price' => 0.0];
                        }
                    }
                }

                if (!empty($res['success']) && !empty($normalizedEntries)) {
                    foreach ($normalizedEntries as $entry) {
                        $typeCode = $entry['code'];
                        $label = $entry['label'];
                        $wholesale = (float)$entry['price'];
                        // Default sensible customer markup only for newly discovered rows; preserve admin overrides
                        $defaultSelling = $wholesale > 0 ? max($wholesale, round($wholesale + max(2500.0, $wholesale * 0.25), -2)) : 17500.0;
                        $rowId = 'bvnt_' . substr(md5(strtolower($typeCode)), 0, 12);

                        $exists = $this->db->fetchOne(
                            'SELECT id, selling_price, is_active FROM modification_bvn_types WHERE enrollment_type = :et LIMIT 1',
                            ['et' => $typeCode]
                        );
                        $effectiveSelling = $defaultSelling;
                        $isAccessLegacy = strtoupper($typeCode) === 'ACCESS BANK';
                        $targetActive = $isAccessLegacy ? 0 : ($exists ? (int)($exists['is_active'] ?? 1) : 1);
                        if (!$exists) {
                            $this->db->execute(
                                'INSERT INTO modification_bvn_types (id, enrollment_type, label, wholesale_cost, selling_price, is_active, provider_synced_at)
                                 VALUES (:id, :et, :lbl, :wc, :sp, :act, NOW())',
                                [
                                    'id' => $rowId,
                                    'et' => $typeCode,
                                    'lbl' => $label,
                                    'wc' => $wholesale,
                                    'sp' => $defaultSelling,
                                    'act' => $targetActive,
                                ]
                            );
                        } else {
                            $existingSp = (float)$exists['selling_price'];
                            $effectiveSelling = ($existingSp <= 0 || ($wholesale > 0 && $existingSp < $wholesale)) && $defaultSelling > 0
                                ? $defaultSelling
                                : $existingSp;
                            $this->db->execute(
                                'UPDATE modification_bvn_types
                                 SET label = :lbl, wholesale_cost = :wc, selling_price = :sp, provider_synced_at = NOW(), updated_at = NOW()
                                 WHERE id = :id',
                                [
                                    'lbl' => $label,
                                    'wc' => $wholesale > 0 ? $wholesale : 0.0,
                                    'sp' => $effectiveSelling,
                                    'id' => $exists['id'],
                                ]
                            );
                        }

                        // Keep legacy bvn_modification_banks synchronized with authoritative modification_bvn_types (preserving ACCESS BANK inactive)
                        try {
                            $this->db->execute(
                                'INSERT INTO bvn_modification_banks (enrollment_type, bank_name, provider_cost, customer_price, is_active, display_order)
                                 VALUES (:et, :bn, :pc, :cp, :act, 50)
                                 ON DUPLICATE KEY UPDATE
                                    bank_name = VALUES(bank_name),
                                    provider_cost = VALUES(provider_cost),
                                    customer_price = VALUES(customer_price),
                                    is_active = CASE WHEN UPPER(enrollment_type) = "ACCESS BANK" THEN 0 ELSE VALUES(is_active) END,
                                    updated_at = NOW()',
                                [
                                    'et' => $typeCode,
                                    'bn' => $label,
                                    'pc' => $wholesale > 0 ? $wholesale : 0.0,
                                    'cp' => $effectiveSelling,
                                    'act' => $targetActive,
                                ]
                            );
                        } catch (Throwable) {
                        }
                    }
                    $liveSynced = true;
                    $syncMessage = 'Synchronized live BVN modification enrollment types.';
                    $existingRows = $this->db->fetchAll('SELECT * FROM modification_bvn_types ORDER BY label ASC');
                } else {
                    $syncMessage = (string)($res['message'] ?? 'Provider did not return BVN modification types.');
                }
            } else {
                Security::logPrivateError('ModificationBvnTypes', 'Verification gateway credentials not configured on host.');
                $syncMessage = Security::ERR_PROVIDER_AUTH;
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
            $refundConfirmed = false;
            if ($existingTx) {
                $balanceAfter = (float)$existingTx['balance_after'];
                $refundConfirmed = true;
            } elseif ($amount > 0) {
                try {
                    $creditRes = $this->walletService->credit(
                        (string)$req['user_id'],
                        $amount,
                        'modification_refund',
                        $refundRef,
                        "Refund for {$req['identity_type']} modification {$req['request_number']}",
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
                    Security::logPrivateError('ModificationRefund', $refundEx, [
                        'modification_request_id' => $req['id'],
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

        $syncNote = $isAdmin
            ? $syncRes['message']
            : (!empty($syncRes['message']) ? $this->sanitizeCustomerError((string)$syncRes['message']) : '');

        Response::success([
            'bvn_types' => $items,
            'count' => count($items),
            'live_synced' => $syncRes['live_synced'],
            'sync_note' => $syncNote,
        ]);
    }

    /**
     * POST /api/modifications/upload-document
     */
    public function uploadDocument(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $docKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('doc_key', 'supporting_doc')) ?: 'supporting_doc';
        $serviceKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('service_key', ''));

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Please attach a valid supporting document file.', 422);
        }

        // Resolve admin-configured document rules when service_key & doc_key match
        $maxSizeMb = 5;
        $configuredFormats = ['JPG', 'PNG', 'WEBP', 'PDF'];
        if ($serviceKey !== '') {
            $srv = $this->db->fetchOne(
                'SELECT s.required_documents FROM service_catalogue s
                 JOIN service_categories c ON c.id = s.category_id
                 WHERE s.service_key = :sk AND c.code IN ("nin_modification", "bvn_modification")
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

        $isStaff = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
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
     * GET /api/modifications/:id/result-document
     */
    public function downloadResultDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $forceDownload = in_array((string)$request->query('download', ''), ['1', 'true', 'yes'], true);
        ResultDocumentService::streamResultDocument($this->db, $user, 'modification', $id, $forceDownload);
    }

    /**
     * POST /api/modifications/submit
     * Validates all inputs, documents, consent, PIN, and idempotency BEFORE debiting wallet.
     */
    public function submit(Request $request): void
    {
        SchemaSync::syncModificationCatalog($this->db);

        $user = Auth::requireVerifiedEmail($request);
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

        $pinService = new PinSecurityService($this->db);
        $pinService->requireValidPin($userRow, $body, 'identity_modification', $serviceKey);

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
            } else {
                $activeBvnCountRow = $this->db->fetchOne('SELECT COUNT(*) as cnt FROM modification_bvn_types WHERE is_active = 1');
                if ($activeBvnCountRow && (int)$activeBvnCountRow['cnt'] > 0) {
                    Response::error('Selected BVN enrollment bank / type is invalid or currently disabled.', 422);
                }
            }
        }

        if ($customerPrice <= 0) {
            Response::error('Service pricing is not yet configured. Please contact support.', 422);
        }

        // 7. Unified Routing Check BEFORE touching wallet
        $routerService = new FulfilmentRouterService($this->db);
        $route = $routerService->resolveRoute($serviceKey);
        if (!$route) {
            Response::error('Service routing configuration could not be loaded.', 503);
        }

        $isManualRoute = (($route['fulfilment_mode'] ?? '') === 'internal_manual');
        if ($isManualRoute) {
            $check = $routerService->canRouteManual($route);
            if (empty($check['allowed'])) {
                Security::logPrivateError('ModificationRouting', (string)($check['reason'] ?? 'Manual routing rejected'), ['service_key' => $serviceKey]);
                Response::error((string)($check['customer_message'] ?? 'This service is temporarily unavailable.'), (int)($check['code'] ?? 503));
            }
        } else {
            $check = $routerService->canDispatchExternal($route);
            if (empty($check['allowed'])) {
                Security::logPrivateError('ModificationRouting', (string)($check['reason'] ?? 'External dispatch rejected'), ['service_key' => $serviceKey]);
                Response::error((string)($check['customer_message'] ?? Security::ERR_PROVIDER_UNAVAILABLE), (int)($check['code'] ?? 503));
            }
        }

        $orderMeta = $routerService->buildOrderRoutingMetadata($route);

        // 8. Atomic Wallet Debit + Persist modification_requests inside a single DB transaction
        $requestId = Security::generateUuid();
        $requestNumber = 'MOD-' . $serviceDomain . '-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $paymentRef = 'MODPAY_' . date('YmdHis') . '_' . strtoupper(bin2hex(random_bytes(4)));
        $categorySlug = $serviceDomain === 'BVN' ? 'bvn_modification' : 'nin_modification';
        $etaText = (string)(!empty($serviceRow['estimated_turnaround']) ? $serviceRow['estimated_turnaround'] : '3 – 10 Business Days');
        $endpoint = (string)$orderMeta['endpoint'];
        $providerId = (string)$orderMeta['provider_id'];
        $persistedCost = $isManualRoute ? (float)$orderMeta['internal_fulfilment_cost'] : $expectedWholesale;
        $initialProfit = max(0.0, round($customerPrice - $persistedCost, 2));

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
                $isManualRoute,
                $expectedWholesale,
                $initialProfit,
                $providerId,
                $endpoint,
                $idempotencyKey,
                $etaText,
                $orderMeta
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
                        'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                    ]
                );

                try {
                    $db->execute(
                        'INSERT INTO modification_requests
                         (id, request_number, user_id, identity_type, service_key, service_name, masked_identifier, submitted_fields, supporting_documents, enrollment_type,
                          customer_price, provider_cost, internal_fulfilment_cost, profit, provider_id, endpoint,
                          fulfilment_mode, routing_snapshot, sla_due_at,
                          payment_reference, idempotency_key, estimated_completion_text, status, created_at)
                         VALUES
                         (:id, :rno, :uid, :itype, :sk, :snm, :mid, :sfields, :sdocs, :etype,
                          :cprice, :pcost, :icost, :profit, :pid, :ep,
                          :fmode, :rsnap, :sladue,
                          :pref, :ikey, :eta, "pending", NOW())',
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
                            'pcost' => $isManualRoute ? 0.00 : $expectedWholesale,
                            'icost' => $orderMeta['internal_fulfilment_cost'],
                            'profit' => $initialProfit,
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
                            'pcost' => $isManualRoute ? 0.00 : $expectedWholesale,
                            'profit' => $initialProfit,
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

        // 8B. Internal Manual Path: Queue directly for HAMBAK MANUAL desk without calling external APIs
        if ($isManualRoute) {
            $this->appendStatusHistory(
                $requestId,
                null,
                'pending',
                'customer',
                (string)$user['id'],
                'Request submitted to HAMBAK MANUAL fulfilment queue',
                true
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'MODIFICATION_MANUAL_SUBMITTED',
                'service_type' => $serviceKey,
                'reference' => $requestNumber,
                'provider' => 'hambak_manual',
                'status' => 'pending',
                'amount' => $customerPrice,
                'metadata' => [
                    'identity_type' => $serviceDomain,
                    'payment_reference' => $paymentRef,
                    'fulfilment_mode' => 'internal_manual',
                    'sla_due_at' => $orderMeta['sla_due_at'],
                ],
            ]);

            $this->notifyCustomer(
                (string)$user['id'],
                "{$serviceDomain} Modification Queued",
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
            ], "{$serviceRow['name']} queued with our fulfilment desk. You can track live status updates in your request tracker.");
            return;
        }

        // 9. Dispatch to 2SureVerify via explicit parameter & file mapping registry (keeps secrets in-memory only)
        $routerService->acquireDispatchLock('modification_requests', $requestId);
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
        $routerService->releaseDispatchLock(
            'modification_requests',
            $requestId,
            empty($providerRes['success']) && empty($providerRes['pending']) ? (string)($providerRes['message'] ?? '') : null
        );

        // 10. Evaluate provider response: PENDING MUST STAY PENDING & NEVER AUTO-REFUND!
        $provRef = (string)($providerRes['reference'] ?? $paymentRef);
        $provTxId = !empty($providerRes['provider_transaction_id']) ? (string)$providerRes['provider_transaction_id'] : null;
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

            $this->appendStatusHistory(
                $requestId,
                null,
                $newStatus,
                'customer',
                (string)$user['id'],
                $newStatus === 'completed' ? 'Submitted and completed immediately' : 'Request submitted for manual processing',
                true
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

            if ($newStatus === 'completed') {
                try {
                    (new ReferralEngineService($this->db))->recordQualifyingTransaction([
                        'user_id' => (string)$user['id'],
                        'service_category' => $serviceDomain === 'BVN' ? 'bvn_modification' : 'nin_modification',
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
                'pending' => true,
                'status' => $newStatus,
                'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                'sla_due_at' => $orderMeta['sla_due_at'],
                'balance_after' => $debitResult['balance_after'] ?? null,
                'newBalance' => $debitResult['balance_after'] ?? null,
                'payment_reference' => $paymentRef,
            ];
            if ($isAdmin) {
                $submitPayload['provider_reference'] = $provRef;
            }

            Response::success($submitPayload, "{$serviceRow['name']} submitted for manual processing. You can track live status updates in your request tracker.");
        }

        // 11. Confirmed immediate provider rejection/failure -> issue AT MOST ONE atomic refund
        $refundRes = $this->issueSingleAtomicRefund(
            $requestId,
            $provMsg ?: 'Modification submission rejected by provider.',
            null,
            'refunded'
        );
        $refundConfirmed = !empty($refundRes['refunded']);

        $this->appendStatusHistory(
            $requestId,
            'pending',
            $refundConfirmed ? 'refunded' : 'failed',
            'provider',
            null,
            $refundConfirmed ? 'Rejected by provider and refunded automatically' : 'Rejected by provider; refund pending',
            true
        );

        Security::logPrivateError('ModificationSubmitFailed', $provMsg ?: 'Provider rejected modification request', [
            'user_id' => $user['id'],
            'service_key' => $serviceKey,
            'request_number' => $requestNumber,
            'provider' => $providerId,
            'refund_confirmed' => $refundConfirmed,
        ]);

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'service',
            'action' => $refundConfirmed ? 'MODIFICATION_SUBMIT_FAILED_REFUNDED' : 'MODIFICATION_SUBMIT_FAILED',
            'service_type' => $serviceKey,
            'reference' => $requestNumber,
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
            $refundConfirmed ? "{$serviceDomain} Modification Failed & Refunded" : "{$serviceDomain} Modification Failed",
            $refundConfirmed
                ? "Your {$serviceRow['name']} request ({$requestNumber}) could not be accepted. Your wallet has been refunded."
                : "Your {$serviceRow['name']} request ({$requestNumber}) could not be accepted. Your refund is being processed.",
            'warning',
            $requestNumber,
            ['request_number' => $requestNumber, 'status' => $refundConfirmed ? 'refunded' : 'failed', 'service_name' => $serviceRow['name']]
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

        $where = 'WHERE user_id = :uid AND identity_type IN ("NIN", "BVN") ';
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
        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            return ['updated' => false, 'message' => 'This request is fulfilled internally by HAMBAK MANUAL and cannot be polled against external providers.', 'row' => $row];
        }

        $lookupRef = trim((string)($row['provider_reference'] ?: $row['payment_reference']));
        $lookupTxId = trim((string)($row['provider_transaction_id'] ?? ''));
        if ($lookupRef === '' && $lookupTxId === '') {
            return ['updated' => false, 'message' => 'No provider reference or transaction_id attached to this request.', 'row' => $row];
        }

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Security::logPrivateError('ModificationPollStatus', 'Live provider credentials not configured on host', [
                'request_id' => $row['id'] ?? null,
            ]);
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
            Security::logPrivateError('ModificationPollStatus', $remarks ?: 'Empty status response', [
                'request_id' => $row['id'] ?? null,
            ]);
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
                $newStatus = 'rejected';
            }
        }

        $refundInfo = null;
        $rowIsRefundable = !array_key_exists('is_refundable', $row) || (int)$row['is_refundable'] === 1;
        if (!$isTerminal && in_array($newStatus, ['failed', 'rejected'], true) && empty($row['refund_reference']) && $rowIsRefundable) {
            $refundInfo = $this->issueSingleAtomicRefund(
                (string)$row['id'],
                $remarks ?: 'Provider marked request as ' . $newStatus,
                $actorId,
                'refunded'
            );
            $newStatus = !empty($refundInfo['refunded']) ? 'refunded' : 'failed';
            if ($resolvedTxId !== '' || $provRefundedVal !== null) {
                $this->db->execute(
                    'UPDATE modification_requests SET provider_transaction_id = COALESCE(NULLIF(:ptx, ""), provider_transaction_id), provider_refunded = COALESCE(:pref, provider_refunded), provider_refunded_amount = CASE WHEN :prefa > 0 THEN :prefa2 ELSE provider_refunded_amount END WHERE id = :id',
                    ['ptx' => $resolvedTxId, 'pref' => $provRefundedVal, 'prefa' => $provRefundedAmt, 'prefa2' => $provRefundedAmt, 'id' => $row['id']]
                );
            }
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
            $this->db->execute(
                'UPDATE modification_requests SET provider_transaction_id = :ptx WHERE id = :id',
                ['ptx' => $resolvedTxId, 'id' => $row['id']]
            );
        }

        // Sync official provider PDF / tracking ID / details on completed or newly completed records (recovering missing docs safely)
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
            $titleMap = [
                'processing' => "{$row['identity_type']} Modification In Processing",
                'query_required' => "{$row['identity_type']} Modification: Additional Info Requested",
                'completed' => "{$row['identity_type']} Modification Completed",
                'refunded' => "{$row['identity_type']} Modification Rejected & Refunded",
                'failed' => "{$row['identity_type']} Modification Failed",
            ];
            $msgMap = [
                'processing' => "Your {$row['service_name']} request ({$row['request_number']}) is now actively processing." . ($safeRemarks ? " Note: {$safeRemarks}" : ''),
                'query_required' => "Action required for {$row['request_number']}: " . ($safeRemarks ?: 'Please submit additional requested details/documents.'),
                'completed' => "Great news! Your {$row['service_name']} request ({$row['request_number']}) has been completed." . (!empty($updatedRow['result_document_id']) ? ' Your official PDF result is now ready in your portal.' : ($safeRemarks ? " Details: {$safeRemarks}" : '')),
                'refunded' => "Your {$row['service_name']} request ({$row['request_number']}) was not approved and ₦" . number_format((float)$row['customer_price'], 2) . " has been refunded to your wallet.",
                'failed' => "Your {$row['service_name']} request ({$row['request_number']}) could not be completed. Your refund is being processed.",
            ];
            $this->notifyCustomer(
                (string)$row['user_id'],
                $titleMap[$newStatus] ?? 'Modification Status Updated',
                $msgMap[$newStatus] ?? "Status changed to {$newStatus}.",
                $newStatus === 'completed' ? 'success' : (in_array($newStatus, ['query_required', 'refunded', 'failed'], true) ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
            try {
                $refEngine = new ReferralEngineService($this->db);
                $srcRef = (string)($row['payment_reference'] ?: $row['request_number']);
                if ($newStatus === 'completed') {
                    $refEngine->recordQualifyingTransaction([
                        'user_id' => (string)$row['user_id'],
                        'service_category' => ($row['identity_type'] ?? 'NIN') === 'BVN' ? 'bvn_modification' : 'nin_modification',
                        'service_key' => (string)$row['service_key'],
                        'source_reference' => $srcRef,
                        'gross_amount' => (float)$row['customer_price'],
                        'wholesale_cost' => (float)$row['provider_cost'],
                        'gateway_fee' => 0.0,
                    ]);
                } elseif ($newStatus === 'refunded') {
                    $refEngine->reverseRewardsForSource($srcRef, 'Modification status refunded on provider poll', $actorId);
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
     * POST /api/modifications/:id/poll
     */
    public function pollStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $isStaff = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Modification request not found.');
        }
        if (!$isStaff && $row['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to modification request.');
        }

        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Internal manual orders are processed by the HAMBAK MANUAL fulfilment desk and cannot be polled against external providers.', 422);
        }

        $sync = $this->syncProviderStatusForRow($row, $isStaff ? (string)$user['id'] : null);

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($sync['row'], $isStaff),
            'refund' => $sync['refund'] ?? null,
        ], $sync['message']);
    }

    /**
     * POST /api/modifications/:id/submit-info
     * Honest local/admin-review workflow: 2SureVerify has no upstream resubmit endpoint.
     * Records clarification history and queues the request for HAMBAK administrator review without falsely claiming upstream submission.
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

        $existingFields = $this->decodeJsonColumn($row['submitted_fields'] ?? null, []);
        if (($existingFields['query_review_status'] ?? '') === 'submitted_for_admin_review') {
            Response::error('Additional clarification has already been submitted and is currently queued for HAMBAK administrator review.', 409);
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
                    'doc_key' => str_replace('modification_', '', (string)$dr['document_type']),
                    'original_name' => $dr['original_name'],
                    'mime_type' => $dr['mime_type'],
                    'file_size' => (int)($dr['file_size'] ?? 0),
                    'file_url' => '/api/modifications/document/' . $dr['id'],
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
            'UPDATE modification_requests
             SET submitted_fields = :sf,
                 supporting_documents = :sd,
                 additional_info_history = :aih,
                 updated_at = NOW()
             WHERE id = :id',
            [
                'sf' => json_encode($existingFields),
                'sd' => json_encode($existingDocs),
                'aih' => json_encode($infoHistory),
                'id' => $row['id'],
            ]
        );

        $this->appendStatusHistory(
            (string)$row['id'],
            (string)$row['status'],
            (string)$row['status'],
            'customer',
            (string)$user['id'],
            $note !== '' ? 'Customer clarification submitted: ' . mb_substr($note, 0, 220) : 'Customer submitted requested clarification document(s)',
            true
        );

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'services',
            'action' => 'CUSTOMER_MODIFICATION_QUERY_RESPONDED',
            'service_type' => $row['service_key'] ?? 'modification',
            'reference' => $row['request_number'] ?? $row['id'],
            'status' => 'processing',
            'metadata' => [
                'review_state' => 'submitted_for_admin_review',
                'documents_attached' => count($attachedDocMeta),
            ],
        ]);

        // Notify staff / support desk inbox if configured
        try {
            $adminRow = $this->db->fetchOne('SELECT id FROM users WHERE role IN ("superadmin", "admin") ORDER BY created_at ASC LIMIT 1');
            if ($adminRow) {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, "info", 0, "#modifications", NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $adminRow['id'],
                        'title' => 'Customer Clarification Submitted: ' . ($row['request_number'] ?? $row['id']),
                        'msg' => 'Customer submitted additional clarification/documents for modification request ' . ($row['request_number'] ?? $row['id']) . '. Manual administrator review required.',
                    ]
                );
            }
        } catch (Throwable) {
        }

        $updated = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $row['id']]);
        Response::success([
            'review_state' => 'submitted_for_admin_review',
            'request' => $updated ? $this->formatRequestRow($updated, false) : null,
        ], 'Additional clarification submitted and queued for HAMBAK administrator review.');
    }

    /**
     * POST /api/modifications/webhook
     * Idempotent webhook receiver for 2SureVerify async status updates (routes enrolment refs automatically).
     */
    public function webhook(Request $request): void
    {
        SchemaSync::syncModificationCatalog($this->db);

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
            Security::logPrivateError('ModificationWebhookRejected', (string)($sigCheck['reason'] ?? 'Invalid webhook signature'), [
                'ip' => Security::resolveClientIp(),
                'configured' => (bool)($sigCheck['configured'] ?? false),
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
        $ref = trim((string)($body['reference'] ?? $body['data']['reference'] ?? $body['request_id'] ?? $body['data']['request_id'] ?? ''));
        $txId = trim((string)($body['transaction_id'] ?? $body['data']['transaction_id'] ?? ''));
        $eventType = trim((string)($body['event'] ?? $body['event_type'] ?? ''));
        $statusRaw = strtolower(trim((string)($body['status'] ?? $body['data']['status'] ?? '')));

        if ($deliveryId !== '') {
            try {
                $existingDelivery = $this->db->fetchOne(
                    'SELECT id, status_received, domain, record_id FROM identity_webhook_deliveries WHERE delivery_id = :did LIMIT 1',
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

        if ($ref === '' && $txId === '') {
            Response::error('Reference or transaction_id missing in webhook payload.', 422);
        }

        $row = null;
        if ($ref !== '' && $txId !== '') {
            $row = $this->db->fetchOne(
                'SELECT * FROM modification_requests WHERE provider_reference = :r1 OR payment_reference = :r2 OR request_number = :r3 OR provider_transaction_id = :tx1 LIMIT 1',
                ['r1' => $ref, 'r2' => $ref, 'r3' => $ref, 'tx1' => $txId]
            );
        } elseif ($ref !== '') {
            $row = $this->db->fetchOne(
                'SELECT * FROM modification_requests WHERE provider_reference = :r1 OR payment_reference = :r2 OR request_number = :r3 OR provider_transaction_id = :r4 LIMIT 1',
                ['r1' => $ref, 'r2' => $ref, 'r3' => $ref, 'r4' => $ref]
            );
        } else {
            $row = $this->db->fetchOne(
                'SELECT * FROM modification_requests WHERE provider_transaction_id = :tx1 OR provider_reference = :tx2 LIMIT 1',
                ['tx1' => $txId, 'tx2' => $txId]
            );
        }

        $recordDelivery = function (string $domain, ?string $recordId) use ($deliveryId, $ref, $txId, $eventType, $statusRaw, $rawInput): void {
            if ($deliveryId === '') {
                return;
            }
            try {
                $this->db->execute(
                    'INSERT IGNORE INTO identity_webhook_deliveries
                        (id, delivery_id, provider_id, reference, transaction_id, event_type, status_received, payload_hash, domain, record_id, created_at)
                     VALUES (:id, :did, "2sureverify", :ref, :tx, :ev, :st, :ph, :dom, :rid, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'did' => $deliveryId,
                        'ref' => $ref !== '' ? $ref : null,
                        'tx' => $txId !== '' ? $txId : null,
                        'ev' => $eventType !== '' ? $eventType : null,
                        'st' => $statusRaw !== '' ? $statusRaw : null,
                        'ph' => hash('sha256', $rawInput),
                        'dom' => $domain,
                        'rid' => $recordId,
                    ]
                );
            } catch (Throwable) {
            }
        };

        if (!$row) {
            $enrolmentController = new EnrolmentController();
            $enrRes = $enrolmentController->handleWebhookPayload($body);
            if (!empty($enrRes['matched'])) {
                $recordDelivery('enrolment', (string)($enrRes['record_id'] ?? null));
                Response::success($enrRes);
            }
            Response::notFound('No matching modification, additional service, or enrolment record found for reference/transaction_id.');
        }

        // Delegate ADDITIONAL service records cleanly to AdditionalServicesController
        if (strtoupper((string)($row['identity_type'] ?? '')) === 'ADDITIONAL') {
            $addCtrl = new AdditionalServicesController();
            $addRes = $addCtrl->handleWebhookPayload($body, $row);
            $recordDelivery('additional', (string)$row['id']);
            Response::success($addRes);
        }

        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            $recordDelivery('modification', (string)$row['id']);
            Response::success(['processed' => false, 'status' => $row['status'], 'message' => 'Internal manual orders ignore external provider webhooks.']);
        }

        $prevStatus = (string)$row['status'];
        $isTerminal = in_array($prevStatus, ['completed', 'refunded'], true);

        if ($isTerminal) {
            if ($txId !== '' && empty($row['provider_transaction_id'])) {
                $this->db->execute('UPDATE modification_requests SET provider_transaction_id = :ptx WHERE id = :id', ['ptx' => $txId, 'id' => $row['id']]);
            }
            if ($prevStatus === 'completed' && empty($row['result_document_id'])) {
                ResultDocumentService::syncFromProviderPayload($this->db, 'modification', $row, $body, $adapter->getAuthHeaders());
            }
            $recordDelivery('modification', (string)$row['id']);
            Response::success(['processed' => false, 'status' => $prevStatus, 'message' => 'Terminal state preserved.']);
        }

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
            $newStatus = 'rejected';
        }

        $rowIsRefundable = !array_key_exists('is_refundable', $row) || (int)$row['is_refundable'] === 1;
        if (in_array($newStatus, ['failed', 'rejected'], true) && empty($row['refund_reference']) && $rowIsRefundable) {
            $refundRes = $this->issueSingleAtomicRefund((string)$row['id'], $remarks ?: 'Provider webhook reported failure', null, 'refunded');
            $newStatus = !empty($refundRes['refunded']) ? 'refunded' : 'failed';
            if ($txId !== '' || $provRefundedVal !== null) {
                $this->db->execute(
                    'UPDATE modification_requests SET provider_transaction_id = COALESCE(NULLIF(:ptx, ""), provider_transaction_id), provider_refunded = COALESCE(:pref, provider_refunded), provider_refunded_amount = CASE WHEN :prefa > 0 THEN :prefa2 ELSE provider_refunded_amount END WHERE id = :id',
                    ['ptx' => $txId, 'pref' => $provRefundedVal, 'prefa' => $provRefundedAmt, 'prefa2' => $provRefundedAmt, 'id' => $row['id']]
                );
            }
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
            // If webhook omitted base64 PDF file, poll per-service status endpoint using reference & transaction_id
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

        $recordDelivery('modification', (string)$row['id']);
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
            $completedNote = !empty($updatedRow['result_document_id'])
                ? ' Your official PDF result is now ready to view and download in your portal.'
                : ($safeRemarks ?: 'Status changed to completed.');
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['identity_type']} Modification Status: " . strtoupper(str_replace('_', ' ', $newStatus)),
                $newStatus === 'completed'
                    ? "Great news! Your {$row['service_name']} request ({$row['request_number']}) has been completed.{$completedNote}"
                    : "Update on request {$row['request_number']} ({$row['service_name']}): " . ($safeRemarks ?: "Status changed to {$newStatus}."),
                $newStatus === 'completed' ? 'success' : ($newStatus === 'refunded' || $newStatus === 'query_required' ? 'warning' : 'info'),
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $newStatus, 'service_name' => $row['service_name']]
            );
            try {
                $refEngine = new ReferralEngineService($this->db);
                $srcRef = (string)($row['payment_reference'] ?: $row['request_number']);
                if ($newStatus === 'completed') {
                    $refEngine->recordQualifyingTransaction([
                        'user_id' => (string)$row['user_id'],
                        'service_category' => ($row['identity_type'] ?? 'NIN') === 'BVN' ? 'bvn_modification' : 'nin_modification',
                        'service_key' => (string)$row['service_key'],
                        'source_reference' => $srcRef,
                        'gross_amount' => (float)$row['customer_price'],
                        'wholesale_cost' => (float)$row['provider_cost'],
                        'gateway_fee' => 0.0,
                    ]);
                } elseif ($newStatus === 'refunded') {
                    $refEngine->reverseRewardsForSource($srcRef, 'Modification refunded via webhook');
                }
            } catch (Throwable) {
            }
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
        Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        SchemaSync::syncModificationCatalog($this->db);

        $identityType = strtoupper(trim((string)$request->query('identity_type', 'ALL')));
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $serviceKey = trim((string)$request->query('service_key', 'all'));
        $providerId = trim((string)$request->query('provider_id', 'all'));
        $rawFrom = trim((string)$request->query('date_from', ''));
        $rawTo = trim((string)$request->query('date_to', ''));
        $dateFrom = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawFrom) ? $rawFrom : '';
        $dateTo = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawTo) ? $rawTo : '';
        $search = trim((string)$request->query('search', ''));
        $page = max(1, (int)$request->query('page', 1));
        $limit = min(100, max(10, (int)$request->query('limit', 25)));
        $offset = ($page - 1) * $limit;

        $where = 'WHERE mr.identity_type IN ("NIN", "BVN") ';
        $params = [];

        if (in_array($identityType, ['NIN', 'BVN'], true)) {
            $where .= 'AND mr.identity_type = :itype ';
            $params['itype'] = $identityType;
        }
        if ($status !== '' && $status !== 'all') {
            $where .= 'AND mr.status = :st ';
            $params['st'] = $status;
        }
        if ($serviceKey !== '' && $serviceKey !== 'all') {
            $where .= 'AND mr.service_key = :sk ';
            $params['sk'] = $serviceKey;
        }
        if ($providerId !== '' && $providerId !== 'all') {
            $where .= 'AND mr.provider_id = :pid ';
            $params['pid'] = $providerId;
        }
        if ($dateFrom !== '') {
            $where .= 'AND mr.created_at >= :df ';
            $params['df'] = $dateFrom . ' 00:00:00';
        }
        if ($dateTo !== '') {
            $where .= 'AND mr.created_at <= :dt ';
            $params['dt'] = $dateTo . ' 23:59:59';
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

        // Summary KPI counts strictly scoped to NIN & BVN modifications
        $statsRow = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_all,
                SUM(CASE WHEN identity_type = "NIN" THEN 1 ELSE 0 END) as nin_count,
                SUM(CASE WHEN identity_type = "BVN" THEN 1 ELSE 0 END) as bvn_count,
                SUM(CASE WHEN status IN ("pending", "under_review", "assigned") THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "processing" THEN 1 ELSE 0 END) as processing_count,
                SUM(CASE WHEN status = "query_required" THEN 1 ELSE 0 END) as query_count,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status IN ("failed", "rejected") THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = "refunded" THEN 1 ELSE 0 END) as refunded_count,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN customer_price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN CASE WHEN COALESCE(fulfilment_mode, "provider_async") = "internal_manual" OR COALESCE(provider_id, "") = "hambak_manual" THEN COALESCE(internal_fulfilment_cost, 0) ELSE COALESCE(provider_cost, 0) END ELSE 0 END), 0) as total_provider_cost,
                COALESCE(SUM(CASE WHEN status != "refunded" THEN customer_price - (CASE WHEN COALESCE(fulfilment_mode, "provider_async") = "internal_manual" OR COALESCE(provider_id, "") = "hambak_manual" THEN COALESCE(internal_fulfilment_cost, 0) ELSE COALESCE(provider_cost, 0) END) ELSE 0 END), 0) as total_margin
             FROM modification_requests
             WHERE identity_type IN ("NIN", "BVN")'
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
        Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
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
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
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

        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Internal manual orders are processed by HAMBAK MANUAL and cannot be polled against external providers.', 422);
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
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::notFound('Modification request not found.');
        }

        $allowedStatuses = ['pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded'];
        $targetStatus = strtolower(trim((string)($body['status'] ?? $row['status'])));
        if (!in_array($targetStatus, $allowedStatuses, true)) {
            Response::error('Invalid target status specified.', 422);
        }

        $remarks = array_key_exists('provider_remarks', $body) ? trim((string)$body['provider_remarks']) : (string)($row['provider_remarks'] ?? '');
        $adminNotes = array_key_exists('admin_notes', $body) ? trim((string)$body['admin_notes']) : (string)($row['admin_notes'] ?? '');
        $requestedCorrections = array_key_exists('requested_corrections', $body)
            ? trim((string)$body['requested_corrections'])
            : (string)($row['requested_corrections'] ?? '');
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
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id LIMIT 1',
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
        }

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
        $this->recordAudit($admin, 'ADMIN_MODIFICATION_UPDATED', [
            'request_id' => $id,
            'request_number' => $row['request_number'],
            'previous_status' => $prevStatus,
            'new_status' => $finalStatus,
            'refunded' => !empty($refundRes['refunded']),
        ], $request);

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

        try {
            $refEngine = new ReferralEngineService($this->db);
            $srcRef = (string)($row['payment_reference'] ?: $row['request_number']);
            if ($finalStatus === 'completed' && $prevStatus !== 'completed') {
                $refEngine->recordQualifyingTransaction([
                    'user_id' => (string)$row['user_id'],
                    'service_category' => ($row['identity_type'] ?? 'NIN') === 'BVN' ? 'bvn_modification' : 'nin_modification',
                    'service_key' => (string)$row['service_key'],
                    'source_reference' => $srcRef,
                    'gross_amount' => (float)$row['customer_price'],
                    'wholesale_cost' => (float)$row['provider_cost'],
                    'gateway_fee' => 0.0,
                ]);
            } elseif (in_array($finalStatus, ['refunded', 'rejected', 'failed'], true)) {
                $refEngine->reverseRewardsForSource($srcRef, 'Modification marked ' . $finalStatus . ' by admin', (string)$admin['id']);
            }
        } catch (Throwable) {
        }

        Response::success([
            'request' => $fresh ? $this->formatRequestRow($fresh, true) : null,
            'refund' => $refundRes,
        ], 'Modification request updated successfully.');
    }

    /**
     * POST /api/admin/modifications/:id/retry-result
     * Explicitly retries fetching an official provider PDF/result details from 2SureVerify without altering terminal completed status.
     */
    public function adminRetryResultFetch(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
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
        if (FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('Internal manual orders receive PDF results directly from HAMBAK MANUAL staff rather than upstream provider fetch.', 422);
        }

        $sync = $this->syncProviderStatusForRow($row, (string)$admin['id']);
        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $sync['row'];

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_MODIFICATION_RESULT_RETRY',
            'service_type' => $row['service_key'],
            'reference' => $row['request_number'],
            'status' => !empty($fresh['result_document_id']) ? 'successful' : 'processing',
            'metadata' => [
                'has_result_document' => !empty($fresh['result_document_id']),
                'result_retrieval_status' => $fresh['result_retrieval_status'] ?? null,
            ],
        ]);

        Response::success([
            'updated' => $sync['updated'],
            'request' => $this->formatRequestRow($fresh, true),
        ], !empty($fresh['result_document_id'])
            ? 'Provider result document retrieved and saved securely.'
            : ($sync['message'] ?? 'Provider checked; no PDF document attached upstream yet.'));
    }

    /**
     * POST /api/admin/modifications/:id/result-document
     * Uploads an official PDF manually sourced from the provider portal (strictly stored as admin_uploaded, is_provider_issued = 0).
     */
    public function adminUploadResultDocument(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));

        $row = $this->db->fetchOne(
            'SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1',
            ['id1' => $id, 'id2' => $id]
        );
        if (!$row) {
            Response::notFound('Modification request not found.');
        }

        $file = $_FILES['file'] ?? $_FILES['result_pdf'] ?? [];
        $trackingId = trim((string)($request->input('tracking_id', '')));
        $remarks = trim((string)($request->input('provider_remarks', '')));
        $markCompleted = in_array((string)$request->input('mark_completed', '1'), ['1', 'true', 'yes'], true);
        $notifyCustomerFlag = in_array((string)$request->input('notify_customer', '1'), ['1', 'true', 'yes'], true);

        $doc = ResultDocumentService::storeAdminUploadedPdf(
            $this->db,
            'modification',
            $row,
            $file,
            (string)$admin['id'],
            $trackingId !== '' ? $trackingId : null
        );

        $prevStatus = (string)$row['status'];
        if ($markCompleted && $prevStatus !== 'refunded') {
            $this->db->execute(
                'UPDATE modification_requests
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
                'UPDATE modification_requests SET provider_remarks = :prem, updated_at = NOW() WHERE id = :id',
                ['prem' => $remarks, 'id' => $row['id']]
            );
        }

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr
             LEFT JOIN users u ON u.id = mr.user_id
             WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        ) ?: $row;

        $this->appendStatusHistory(
            (string)$row['id'],
            $prevStatus,
            (string)($fresh['status'] ?? $prevStatus),
            'admin',
            (string)$admin['id'],
            $remarks !== '' ? $remarks : 'Official result PDF document uploaded by administrator',
            true
        );

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_MODIFICATION_RESULT_UPLOADED',
            'service_type' => $row['service_key'],
            'reference' => $row['request_number'],
            'status' => 'successful',
            'metadata' => [
                'document_id' => $doc['id'],
                'document_source' => 'admin_uploaded',
                'is_provider_issued' => false,
                'tracking_id' => $trackingId !== '' ? $trackingId : null,
            ],
        ]);
        $this->recordAudit($admin, 'ADMIN_MODIFICATION_RESULT_UPLOADED', [
            'request_id' => $row['id'],
            'request_number' => $row['request_number'],
            'document_id' => $doc['id'],
            'mark_completed' => $markCompleted,
        ], $request);

        if ($notifyCustomerFlag) {
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['identity_type']} Modification Result Ready",
                "Your official result document for {$row['service_name']} ({$row['request_number']}) is now available to preview and download in your dashboard.",
                'success',
                (string)$row['request_number'],
                ['request_number' => $row['request_number'], 'status' => $fresh['status'] ?? 'completed', 'service_name' => $row['service_name']]
            );
        }

        Response::success([
            'request' => $this->formatRequestRow($fresh, true),
        ], 'Official result document uploaded (Admin-Uploaded) and linked to request.');
    }

    /**
     * GET /api/admin/modifications/services
     */
    public function adminServices(Request $request): void
    {
        Auth::requirePermission($request, 'services');
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
        $admin = Auth::requirePermission($request, 'services');
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
        $isManual = strtolower((string)($existing['fulfilment_mode'] ?? '')) === 'internal_manual'
            || strtolower((string)($existing['provider_id'] ?? '')) === 'hambak_manual';

        if (isset($body['wholesale_cost'])) {
            $updates[] = 'wholesale_cost = :wc';
            $dbParams['wc'] = max(0.0, (float)$body['wholesale_cost']);
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
        $targetInternalCost = isset($dbParams['ifc']) ? (float)$dbParams['ifc'] : (float)($existing['internal_fulfilment_cost'] ?? 0);
        $costFloor = $isManual ? $targetInternalCost : $targetWholesale;
        $costLabel = $isManual ? 'internal fulfilment cost' : 'wholesale cost';

        if ($targetSelling < $costFloor) {
            Response::error(
                'Customer selling price (₦' . number_format($targetSelling, 2) . ') cannot be lower than ' . $costLabel . ' (₦' . number_format($costFloor, 2) . ').',
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

        if ($fresh) {
            $freshIsManual = strtolower((string)($fresh['fulfilment_mode'] ?? '')) === 'internal_manual'
                || strtolower((string)($fresh['provider_id'] ?? '')) === 'hambak_manual';
            if (!$freshIsManual) {
                SchemaSync::syncProviderServiceMapping(
                    $this->db,
                    (string)($fresh['provider_id'] ?? '2sureverify'),
                    $key,
                    (string)($fresh['endpoint'] ?? ''),
                    (float)($fresh['wholesale_cost'] ?? 0),
                    !empty($fresh['is_active']) ? 1 : 0
                );
            }
        }

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
        $this->recordAudit($admin, 'ADMIN_MODIFICATION_SERVICE_UPDATED', [
            'service_key' => $key,
            'selling_price' => $targetSelling,
            'wholesale_cost' => $targetWholesale,
            'internal_fulfilment_cost' => $targetInternalCost,
            'fulfilment_mode' => $fresh['fulfilment_mode'] ?? null,
            'is_active' => $fresh ? (bool)$fresh['is_active'] : null,
        ], $request);

        Response::success([
            'service' => $fresh ? $this->formatServiceRow($fresh, true) : null,
        ], 'Modification service configuration saved.');
    }

    /**
     * GET /api/admin/modifications/bvn-types
     */
    public function adminBvnTypes(Request $request): void
    {
        Auth::requirePermission($request, 'services');
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
     * POST /api/admin/modifications/bvn-types
     */
    public function adminCreateBvnType(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncModificationCatalog($this->db);

        $body = $request->getBody();
        $enrollmentType = strtoupper(trim((string)($body['enrollment_type'] ?? $body['bank_code'] ?? $body['name'] ?? '')));
        $label = trim((string)($body['label'] ?? $body['bank_name'] ?? $enrollmentType));
        $wholesale = isset($body['wholesale_cost']) ? max(0.0, (float)$body['wholesale_cost']) : 0.0;
        $selling = isset($body['selling_price']) ? max(0.0, (float)$body['selling_price']) : 0.0;
        $isActive = array_key_exists('is_active', $body) ? ((bool)$body['is_active'] ? 1 : 0) : 1;

        if ($enrollmentType === '' || strlen($enrollmentType) < 2) {
            Response::error('Valid BVN enrollment_type is required.', 422);
        }
        if ($selling <= 0) {
            Response::error('Customer selling price must be greater than zero.', 422);
        }
        if ($selling < $wholesale) {
            Response::error(
                'Customer selling price (₦' . number_format($selling, 2) . ') cannot be lower than wholesale cost (₦' . number_format($wholesale, 2) . ').',
                422
            );
        }

        $duplicate = $this->db->fetchOne(
            'SELECT id FROM modification_bvn_types WHERE UPPER(enrollment_type) = :et LIMIT 1',
            ['et' => $enrollmentType]
        );
        if ($duplicate) {
            Response::error('This BVN enrollment type already exists.', 409);
        }

        $id = 'bvnt_' . substr(md5(strtolower($enrollmentType)), 0, 12);
        $this->db->execute(
            'INSERT INTO modification_bvn_types (id, enrollment_type, label, wholesale_cost, selling_price, is_active, created_at, updated_at)
             VALUES (:id, :et, :lbl, :wc, :sp, :act, NOW(), NOW())',
            [
                'id' => $id,
                'et' => $enrollmentType,
                'lbl' => $label,
                'wc' => $wholesale,
                'sp' => $selling,
                'act' => $isActive,
            ]
        );

        try {
            $this->db->execute(
                'INSERT INTO bvn_modification_banks (enrollment_type, bank_name, provider_cost, customer_price, is_active, display_order)
                 VALUES (:et, :bn, :pc, :cp, :act, 50)
                 ON DUPLICATE KEY UPDATE
                    bank_name = VALUES(bank_name),
                    provider_cost = VALUES(provider_cost),
                    customer_price = VALUES(customer_price),
                    is_active = VALUES(is_active),
                    updated_at = NOW()',
                [
                    'et' => $enrollmentType,
                    'bn' => $label,
                    'pc' => $wholesale,
                    'cp' => $selling,
                    'act' => $isActive,
                ]
            );
        } catch (Throwable) {
        }

        $this->recordAudit($admin, 'ADMIN_BVN_TYPE_CREATED', [
            'id' => $id,
            'enrollment_type' => $enrollmentType,
            'label' => $label,
            'wholesale_cost' => $wholesale,
            'selling_price' => $selling,
            'is_active' => (bool)$isActive,
        ], $request);

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
        ], 'BVN enrollment type created successfully.', 201);
    }

    /**
     * PUT /api/admin/modifications/bvn-types/:id
     */
    public function adminUpdateBvnType(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'services');
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

        if ($selling < $wholesale) {
            Response::error(
                'Customer selling price (₦' . number_format($selling, 2) . ') cannot be lower than wholesale cost (₦' . number_format($wholesale, 2) . ').',
                422
            );
        }

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

        try {
            $this->db->execute(
                'INSERT INTO bvn_modification_banks (enrollment_type, bank_name, provider_cost, customer_price, is_active, display_order)
                 VALUES (:et, :bn, :pc, :cp, :act, 50)
                 ON DUPLICATE KEY UPDATE
                    bank_name = VALUES(bank_name),
                    provider_cost = VALUES(provider_cost),
                    customer_price = VALUES(customer_price),
                    is_active = VALUES(is_active),
                    updated_at = NOW()',
                [
                    'et' => (string)$existing['enrollment_type'],
                    'bn' => $label,
                    'pc' => $wholesale,
                    'cp' => $selling,
                    'act' => $isActive,
                ]
            );
        } catch (Throwable) {
        }

        $this->recordAudit($admin, 'ADMIN_BVN_TYPE_UPDATED', [
            'id' => $id,
            'enrollment_type' => $existing['enrollment_type'],
            'label' => $label,
            'wholesale_cost' => $wholesale,
            'selling_price' => $selling,
            'is_active' => (bool)$isActive,
        ], $request);

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
        $admin = Auth::requirePermission($request, 'services');
        SchemaSync::syncModificationCatalog($this->db, true);

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Response::error('2SureVerify API key is not configured on this server. Local catalog schema was verified, but live provider tariffs require API credentials.', 503);
        }

        $updatedServices = 0;
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
                 WHERE c.code IN ("nin_modification", "bvn_modification")
                   AND COALESCE(s.fulfilment_mode, "provider_async") <> "internal_manual"
                   AND COALESCE(s.provider_id, "") <> "hambak_manual"'
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
                        $newWc = (float)$price;
                        $this->db->execute(
                            'UPDATE service_catalogue
                             SET wholesale_cost = :wc,
                                 selling_price = CASE WHEN selling_price < :wc_chk THEN :wc_floor ELSE selling_price END,
                                 updated_at = NOW()
                             WHERE id = :id
                               AND COALESCE(fulfilment_mode, "provider_async") <> "internal_manual"
                               AND COALESCE(provider_id, "") <> "hambak_manual"',
                            [
                                'wc' => $newWc,
                                'wc_chk' => $newWc,
                                'wc_floor' => round($newWc + max(1500.0, $newWc * 0.20), -2),
                                'id' => $lr['id'],
                            ]
                        );
                        $updatedServices++;
                    }
                }
            }
        }

        $bvnRes = $this->syncOrFetchBvnTypes(true);

        // Keep composite (provider_id, service_key) mappings synchronized without touching internal_manual rows
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
        $this->recordAudit($admin, 'ADMIN_MODIFICATION_CATALOG_SYNCED', [
            'updated_services' => $updatedServices,
            'bvn_types_count' => count($bvnRes['rows'] ?? []),
            'bvn_live_synced' => $bvnRes['live_synced'] ?? false,
        ], $request);

        Response::success([
            'updated_services' => $updatedServices,
            'bvn_types_count' => count($bvnRes['rows'] ?? []),
            'bvn_live_synced' => $bvnRes['live_synced'] ?? false,
            'sync_note' => $bvnRes['message'] ?? '',
        ], "Synchronized {$updatedServices} service wholesale tariffs and " . count($bvnRes['rows'] ?? []) . ' BVN enrollment types.');
    }

    /**
     * GET /api/admin/modifications/staff
     * Lightweight staff list for operator assignment dropdown (scoped to 'services' permission).
     */
    public function adminStaffList(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $rows = $this->db->fetchAll(
            'SELECT id, full_name, email, role
             FROM users
             WHERE role IN ("support", "staff", "manager", "admin", "superadmin")
               AND status = "active"
             ORDER BY full_name ASC'
        );
        Response::success(['staff' => $rows ?: []]);
    }

    /**
     * POST /api/admin/modifications/:id/assign
     */
    public function adminAssign(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1', ['id1' => $id, 'id2' => $id]);
        if (!$row) {
            Response::notFound('Request record not found.');
        }

        $staffId = trim((string)($body['staff_id'] ?? $body['assigned_to'] ?? ''));
        $staffName = null;
        if ($staffId !== '') {
            $staffRow = $this->db->fetchOne(
                'SELECT id, full_name, email, role FROM users WHERE id = :sid AND role IN ("support", "staff", "manager", "admin", "superadmin") AND status = "active" LIMIT 1',
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
            [
                'ato' => $staffId !== '' ? $staffId : null,
                'aname' => $staffName,
                'ato2' => $staffId !== '' ? $staffId : null,
                'st' => $newStatus,
                'id' => $row['id'],
            ]
        );

        $this->appendStatusHistory(
            (string)$row['id'],
            $prevStatus,
            $newStatus,
            'admin',
            (string)$admin['id'],
            $staffId !== '' ? "Assigned to staff officer: {$staffName}" : 'Staff assignment cleared',
            false
        );

        $this->recordAudit($admin, 'ADMIN_REQUEST_ASSIGNED', [
            'request_id' => $row['id'],
            'request_number' => $row['request_number'],
            'assigned_to' => $staffId !== '' ? $staffId : null,
            'assigned_staff_name' => $staffName,
        ], $request);

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        );
        Response::success(['request' => $fresh ? $this->formatRequestRow($fresh, true) : null], $staffId !== '' ? "Assigned to {$staffName}." : 'Assignment cleared.');
    }

    /**
     * POST /api/admin/modifications/:id/checklist
     */
    public function adminUpdateChecklist(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1', ['id1' => $id, 'id2' => $id]);
        if (!$row) {
            Response::notFound('Request record not found.');
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
            [
                'chk' => json_encode($normalized),
                'rby' => $reviewerLabel,
                'id' => $row['id'],
            ]
        );

        $this->recordAudit($admin, 'ADMIN_DOCUMENT_CHECKLIST_UPDATED', [
            'request_id' => $row['id'],
            'request_number' => $row['request_number'],
            'checklist_count' => count($normalized),
        ], $request);

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        );
        Response::success(['request' => $fresh ? $this->formatRequestRow($fresh, true) : null], 'Document verification checklist saved.');
    }

    /**
     * POST /api/admin/modifications/:id/review-info
     * Explicit admin review decision for customer clarification / re-submitted docs: approve | request_more | reject
     */
    public function adminReviewInfo(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $row = $this->db->fetchOne('SELECT * FROM modification_requests WHERE id = :id1 OR request_number = :id2 LIMIT 1', ['id1' => $id, 'id2' => $id]);
        if (!$row) {
            Response::notFound('Request record not found.');
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
            $infoHistory[$lastIdx]['review_state'] = $decision === 'approve'
                ? 'approved'
                : ($decision === 'request_more' ? 'needs_more_correction' : 'rejected');
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
                 SET status = :st,
                     submitted_fields = :sf,
                     additional_info_history = :aih,
                     requested_corrections = NULL,
                     provider_remarks = COALESCE(NULLIF(:prem, ""), provider_remarks),
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'st' => $targetStatus,
                    'sf' => json_encode($submittedFields),
                    'aih' => json_encode($infoHistory),
                    'prem' => $remarks,
                    'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'],
                    'id' => $row['id'],
                ]
            );
            $this->appendStatusHistory((string)$row['id'], $prevStatus, $targetStatus, 'admin', (string)$admin['id'], $remarks ?: 'Clarification approved by administrator; resumed processing.', true);
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['identity_type']} Clarification Approved",
                "Your additional information for {$row['request_number']} ({$row['service_name']}) was verified and approved. Processing has resumed.",
                'success',
                (string)$row['request_number']
            );
        } elseif ($decision === 'request_more') {
            if ($remarks === '') {
                Response::error('Please specify what corrections or missing documents the customer should re-submit.', 422);
            }
            $submittedFields['query_review_status'] = 'awaiting_customer_response';
            $this->db->execute(
                'UPDATE modification_requests
                 SET status = "query_required",
                     submitted_fields = :sf,
                     additional_info_history = :aih,
                     requested_corrections = :reqcorr,
                     provider_remarks = :prem,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'sf' => json_encode($submittedFields),
                    'aih' => json_encode($infoHistory),
                    'reqcorr' => $remarks,
                    'prem' => $remarks,
                    'rby' => $admin['full_name'] ?? $admin['email'] ?? $admin['id'],
                    'id' => $row['id'],
                ]
            );
            $this->appendStatusHistory((string)$row['id'], $prevStatus, 'query_required', 'admin', (string)$admin['id'], 'Further correction requested: ' . $remarks, true);
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['identity_type']} Further Correction Needed",
                "Please provide updated information for {$row['request_number']}: {$remarks}",
                'warning',
                (string)$row['request_number']
            );
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
            $this->db->execute(
                'UPDATE modification_requests SET submitted_fields = :sf, additional_info_history = :aih WHERE id = :id',
                ['sf' => json_encode($submittedFields), 'aih' => json_encode($infoHistory), 'id' => $row['id']]
            );
            $this->appendStatusHistory((string)$row['id'], $prevStatus, $finalSt, 'admin', (string)$admin['id'], $rejectReason, true);
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$row['identity_type']} Request Rejected",
                "Your {$row['service_name']} request ({$row['request_number']}) was rejected ({$rejectReason})." . (!empty($refundRes['refunded']) ? ' Your wallet has been refunded.' : ''),
                'warning',
                (string)$row['request_number']
            );
        }

        $this->recordAudit($admin, 'ADMIN_CLARIFICATION_REVIEWED', [
            'request_id' => $row['id'],
            'request_number' => $row['request_number'],
            'decision' => $decision,
            'remarks' => $remarks,
            'refunded' => !empty($refundRes['refunded']),
        ], $request);

        $fresh = $this->db->fetchOne(
            'SELECT mr.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM modification_requests mr LEFT JOIN users u ON u.id = mr.user_id WHERE mr.id = :id LIMIT 1',
            ['id' => $row['id']]
        );
        Response::success([
            'request' => $fresh ? $this->formatRequestRow($fresh, true) : null,
            'refund' => $refundRes,
        ], 'Clarification review recorded.');
    }
}
