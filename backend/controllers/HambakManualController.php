<?php
/**
 * @file HambakManualController.php
 * Unified Service Routing Configuration & HAMBAK MANUAL Fulfilment Desk Controller (Phase 3)
 *
 * Enforces strict RBAC separation:
 *   - routing_config     -> service routing modes, cost/SLA configuration, immutable audit logs
 *   - manual_fulfilment  -> HAMBAK MANUAL operations desk (claim, assign, checklist, clarification,
 *                           official PDF/result upload, senior completion sign-off, atomic refund)
 *
 * Strictly scopes HAMBAK MANUAL queues to immutable order-level `fulfilment_mode = 'internal_manual'`
 * orders across: modification_requests (NIN/BVN/ADDITIONAL), enrolment_orders, and verification_records.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Services\FootprintService;
use HambakTech\Services\FulfilmentRouterService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Services\ResultDocumentService;
use HambakTech\Services\WalletService;
use Throwable;

class HambakManualController
{
    public const VALID_DOMAINS = [
        'nin_modification',
        'bvn_modification',
        'additional_service',
        'enrolment',
        'verification',
    ];

    public const SENIOR_APPROVAL_ROLES = ['manager', 'admin', 'superadmin'];

    private Database $db;
    private FulfilmentRouterService $routerService;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->routerService = new FulfilmentRouterService($this->db);
        $this->walletService = new WalletService($this->db);
    }

    // =========================================================================
    // A. SERVICE ROUTING CONFIGURATION (RBAC: routing_config)
    // =========================================================================

    /**
     * GET /api/admin/routing/services
     */
    public function routingServices(Request $request): void
    {
        Auth::requirePermission($request, 'routing_config');
        $data = $this->routerService->listServicesWithRouting();
        Response::success($data);
    }

    /**
     * PUT /api/admin/routing/services/:key
     */
    public function updateServiceRouting(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'routing_config');
        $key = trim((string)($params['key'] ?? ''));
        $body = $request->getBody();

        $res = $this->routerService->updateServiceRouting(
            $key,
            is_array($body) ? $body : [],
            $actor,
            Security::resolveClientIp()
        );

        if (empty($res['ok'])) {
            Response::error((string)($res['message'] ?? 'Unable to update routing configuration.'), (int)($res['code'] ?? 422));
        }

        FootprintService::record([
            'user_id' => $actor['id'],
            'user_email' => $actor['email'] ?? null,
            'user_name' => $actor['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_SERVICE_ROUTING_UPDATED',
            'service_type' => $key,
            'reference' => $key,
            'status' => 'successful',
            'metadata' => [
                'fulfilment_mode' => $res['service']['fulfilment_mode'] ?? null,
                'provider_id' => $res['service']['provider_id'] ?? null,
                'reason' => $body['reason'] ?? null,
            ],
        ]);

        Response::success([
            'service' => $res['service'] ?? null,
        ], (string)($res['message'] ?? 'Service routing updated.'));
    }

    /**
     * GET /api/admin/routing/audit-logs
     */
    public function routingAuditLogs(Request $request): void
    {
        Auth::requirePermission($request, 'routing_config');
        $logs = $this->routerService->listRoutingAuditLogs([
            'service_key' => $request->query('service_key', ''),
            'limit' => $request->query('limit', 60),
        ]);
        Response::success(['logs' => $logs]);
    }

    // =========================================================================
    // B. HAMBAK MANUAL FULFILMENT DESK (RBAC: manual_fulfilment)
    // =========================================================================

    /**
     * GET /api/admin/manual-fulfilment/orders
     * Unified across modification_requests, enrolment_orders, and verification_records
     * strictly filtered by order-level fulfilment_mode = 'internal_manual'.
     */
    public function orders(Request $request): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $queue = strtolower(trim((string)$request->query('queue', 'all_manual')));
        $domainFilter = strtolower(trim((string)$request->query('domain', 'all')));
        $search = trim((string)$request->query('search', ''));
        $assignedTo = trim((string)$request->query('assigned_to', 'all'));
        $limit = min(200, max(10, (int)$request->query('limit', 100)));

        $allItems = $this->fetchAllManualOrders($actor);

        $queueCounts = [
            'all_manual' => 0,
            'unclaimed' => 0,
            'my_claimed' => 0,
            'in_progress' => 0,
            'awaiting_clarification' => 0,
            'awaiting_completion_review' => 0,
            'sla_breached' => 0,
            'completed' => 0,
            'rejected_refunded' => 0,
        ];

        $domainCounts = [
            'all' => 0,
            'nin_modification' => 0,
            'bvn_modification' => 0,
            'additional_service' => 0,
            'enrolment' => 0,
            'verification' => 0,
        ];

        $filtered = [];
        $actorId = (string)($actor['id'] ?? '');

        foreach ($allItems as $item) {
            $queueCounts['all_manual']++;
            $dom = (string)$item['domain'];
            $domainCounts['all']++;
            if (isset($domainCounts[$dom])) {
                $domainCounts[$dom]++;
            }

            if ($this->matchesQueue($item, 'unclaimed', $actorId)) {
                $queueCounts['unclaimed']++;
            }
            if ($this->matchesQueue($item, 'my_claimed', $actorId)) {
                $queueCounts['my_claimed']++;
            }
            if ($this->matchesQueue($item, 'in_progress', $actorId)) {
                $queueCounts['in_progress']++;
            }
            if ($this->matchesQueue($item, 'awaiting_clarification', $actorId)) {
                $queueCounts['awaiting_clarification']++;
            }
            if ($this->matchesQueue($item, 'awaiting_completion_review', $actorId)) {
                $queueCounts['awaiting_completion_review']++;
            }
            if ($this->matchesQueue($item, 'sla_breached', $actorId)) {
                $queueCounts['sla_breached']++;
            }
            if ($this->matchesQueue($item, 'completed', $actorId)) {
                $queueCounts['completed']++;
            }
            if ($this->matchesQueue($item, 'rejected_refunded', $actorId)) {
                $queueCounts['rejected_refunded']++;
            }

            if ($domainFilter !== '' && $domainFilter !== 'all' && $dom !== $domainFilter) {
                continue;
            }
            if ($queue !== '' && $queue !== 'all_manual' && !$this->matchesQueue($item, $queue, $actorId)) {
                continue;
            }
            if ($assignedTo !== '' && $assignedTo !== 'all') {
                if ($assignedTo === 'unassigned') {
                    if (!empty($item['claimed_by']) || !empty($item['assigned_to'])) {
                        continue;
                    }
                } elseif ((string)($item['claimed_by'] ?? $item['assigned_to'] ?? '') !== $assignedTo) {
                    continue;
                }
            }
            if ($search !== '') {
                $haystack = strtolower(implode(' ', [
                    (string)$item['reference_number'],
                    (string)$item['service_name'],
                    (string)$item['service_key'],
                    (string)$item['customer_name'],
                    (string)$item['customer_email'],
                    (string)$item['masked_identifier'],
                ]));
                if (!str_contains($haystack, strtolower($search))) {
                    continue;
                }
            }

            $filtered[] = $item;
        }

        $totalMatched = count($filtered);
        $sliced = array_slice($filtered, 0, $limit);

        $staffList = $this->fetchManualStaffList();

        Response::success([
            'orders' => $sliced,
            'total_matched' => $totalMatched,
            'queue_counts' => $queueCounts,
            'domain_counts' => $domainCounts,
            'staff_members' => $staffList,
            'can_approve_completion' => in_array(strtolower((string)($actor['role'] ?? '')), self::SENIOR_APPROVAL_ROLES, true),
        ]);
    }

    /**
     * GET /api/admin/manual-fulfilment/orders/:domain/:id
     */
    public function orderDetail(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, true);
        Response::success([
            'order' => $loaded['dto'],
            'staff_members' => $this->fetchManualStaffList(),
            'can_approve_completion' => in_array(strtolower((string)($actor['role'] ?? '')), self::SENIOR_APPROVAL_ROLES, true),
        ]);
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/claim
     */
    public function claimOrder(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();
        $action = strtolower(trim((string)($body['action'] ?? 'claim')));

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $actorId = (string)$actor['id'];
        $actorName = (string)($actor['full_name'] ?: $actor['email'] ?: $actorId);
        $status = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($status, ['completed', 'refunded', 'rejected', 'failed'], true)) {
            Response::error('Terminal orders cannot be claimed or unclaimed.', 422);
        }

        if ($action === 'unclaim') {
            $isSenior = in_array(strtolower((string)($actor['role'] ?? '')), self::SENIOR_APPROVAL_ROLES, true);
            $currentClaimed = (string)($row['claimed_by'] ?? '');
            if ($currentClaimed !== '' && $currentClaimed !== $actorId && !$isSenior) {
                Response::forbidden('Only the claiming officer or a senior supervisor can release this claim.');
            }
            if ($table === 'verification_records') {
                $this->db->execute(
                    'UPDATE verification_records SET claimed_by = NULL, claimed_at = NULL, updated_at = NOW() WHERE id = :id',
                    ['id' => $recordId]
                );
            } else {
                $this->db->execute(
                    "UPDATE `{$table}` SET claimed_by = NULL, claimed_at = NULL, assigned_to = NULL, assigned_staff_name = NULL, assigned_at = NULL, updated_at = NOW() WHERE id = :id",
                    ['id' => $recordId]
                );
            }
            $this->appendDomainHistory($domain, $recordId, $status, $status, 'admin', $actorId, "Claim released by {$actorName}", false);
            $this->recordAudit($actor, 'MANUAL_ORDER_UNCLAIMED', ['domain' => $domain, 'record_id' => $recordId], $request);
            $fresh = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $fresh['dto']], 'Order claim released back to the pool.');
        }

        $nextStatus = $status === 'pending' ? 'under_review' : $status;
        if ($table === 'verification_records') {
            $affected = $this->db->execute(
                'UPDATE verification_records
                 SET claimed_by = :cid,
                     claimed_at = COALESCE(claimed_at, NOW()),
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id AND (claimed_by IS NULL OR claimed_by = :cid2)',
                ['cid' => $actorId, 'st' => $nextStatus, 'id' => $recordId, 'cid2' => $actorId]
            );
        } else {
            $affected = $this->db->execute(
                "UPDATE `{$table}`
                 SET claimed_by = :cid,
                     claimed_at = COALESCE(claimed_at, NOW()),
                     assigned_to = COALESCE(assigned_to, :cid_a),
                     assigned_staff_name = COALESCE(assigned_staff_name, :aname),
                     assigned_at = COALESCE(assigned_at, NOW()),
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id AND (claimed_by IS NULL OR claimed_by = :cid2)",
                [
                    'cid' => $actorId,
                    'cid_a' => $actorId,
                    'aname' => $actorName,
                    'st' => $nextStatus,
                    'id' => $recordId,
                    'cid2' => $actorId,
                ]
            );
        }

        if ($affected === 0) {
            $reloaded = $this->loadManualOrder($domain, $recordId, false);
            if (!empty($reloaded['row']['claimed_by']) && $reloaded['row']['claimed_by'] !== $actorId) {
                Response::error('This order has already been claimed by another operator.', 409);
            }
        }

        $historyNote = $nextStatus !== $status
            ? 'Order moved to ' . strtoupper(str_replace('_', ' ', $nextStatus))
            : 'Order claimed internally';
        $this->appendDomainHistory($domain, $recordId, $status, $nextStatus, 'admin', $actorId, $historyNote, $nextStatus !== $status);
        $this->recordAudit($actor, 'MANUAL_ORDER_CLAIMED', ['domain' => $domain, 'record_id' => $recordId, 'reference' => $loaded['dto']['reference_number']], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], "Order claimed by {$actorName}.");
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/assign
     */
    public function assignOrder(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, ['completed', 'refunded', 'rejected', 'failed'], true)) {
            Response::error('Terminal orders cannot be reassigned.', 422);
        }

        $staffId = trim((string)($body['staff_id'] ?? $body['assigned_to'] ?? ''));
        $staffName = null;
        if ($staffId !== '') {
            $staffRow = $this->db->fetchOne(
                'SELECT id, full_name, email, role FROM users WHERE id = :sid AND role IN ("support", "staff", "manager", "admin", "superadmin") AND status = "active" LIMIT 1',
                ['sid' => $staffId]
            );
            if (!$staffRow) {
                Response::error('Selected staff operator was not found or is inactive.', 422);
            }
            $staffName = (string)($staffRow['full_name'] ?: $staffRow['email']);
        }

        $nextStatus = ($staffId !== '' && in_array($prevStatus, ['pending', 'under_review'], true)) ? 'assigned' : $prevStatus;

        if ($table === 'verification_records') {
            $this->db->execute(
                'UPDATE verification_records
                 SET claimed_by = :cid,
                     claimed_at = CASE WHEN :cid2 IS NOT NULL THEN NOW() ELSE NULL END,
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'cid' => $staffId !== '' ? $staffId : null,
                    'cid2' => $staffId !== '' ? $staffId : null,
                    'st' => $nextStatus,
                    'id' => $recordId,
                ]
            );
        } else {
            $this->db->execute(
                "UPDATE `{$table}`
                 SET claimed_by = :cid,
                     claimed_at = CASE WHEN :cid2 IS NOT NULL THEN NOW() ELSE NULL END,
                     assigned_to = :ato,
                     assigned_staff_name = :aname,
                     assigned_at = CASE WHEN :ato2 IS NOT NULL THEN NOW() ELSE NULL END,
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id",
                [
                    'cid' => $staffId !== '' ? $staffId : null,
                    'cid2' => $staffId !== '' ? $staffId : null,
                    'ato' => $staffId !== '' ? $staffId : null,
                    'aname' => $staffName,
                    'ato2' => $staffId !== '' ? $staffId : null,
                    'st' => $nextStatus,
                    'id' => $recordId,
                ]
            );
        }

        $this->appendDomainHistory(
            $domain,
            $recordId,
            $prevStatus,
            $nextStatus,
            'admin',
            (string)$actor['id'],
            $staffId !== '' ? "Assigned to HAMBAK officer: {$staffName}" : 'Staff assignment cleared',
            false
        );
        $this->recordAudit($actor, 'MANUAL_ORDER_ASSIGNED', ['domain' => $domain, 'record_id' => $recordId, 'assigned_to' => $staffId ?: null], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], $staffId !== '' ? "Assigned to {$staffName}." : 'Assignment cleared.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/checklist
     */
    public function updateChecklist(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];

        $rawChecklist = $body['checklist'] ?? [];
        if (!is_array($rawChecklist)) {
            Response::error('Invalid document verification checklist payload.', 422);
        }

        $normalized = [];
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
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

        if ($table === 'verification_records') {
            $this->db->execute(
                'UPDATE verification_records SET document_review_checklist = :chk, updated_at = NOW() WHERE id = :id',
                ['chk' => json_encode($normalized), 'id' => $recordId]
            );
        } else {
            $this->db->execute(
                "UPDATE `{$table}` SET document_review_checklist = :chk, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW() WHERE id = :id",
                ['chk' => json_encode($normalized), 'rby' => $reviewerLabel, 'id' => $recordId]
            );
        }

        $this->recordAudit($actor, 'MANUAL_ORDER_CHECKLIST_UPDATED', ['domain' => $domain, 'record_id' => $recordId, 'items' => count($normalized)], $request);
        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], 'Verification checklist updated.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/request-clarification
     */
    public function requestClarification(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, ['completed', 'refunded', 'rejected', 'failed'], true)) {
            Response::error('Cannot request clarification on a terminal order.', 422);
        }

        $message = trim((string)($body['requested_corrections'] ?? $body['message'] ?? $body['remarks'] ?? ''));
        if (strlen($message) < 5) {
            Response::error('Please specify clear correction/clarification instructions for the customer (minimum 5 characters).', 422);
        }

        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $submittedFields = $this->decodeJson($row['submitted_fields'] ?? null, []);
        $submittedFields['query_review_status'] = 'awaiting_customer_response';

        if ($table === 'verification_records') {
            $resultData = $this->decodeJson($row['result_data'] ?? null, []);
            $resultData['query_review_status'] = 'awaiting_customer_response';
            $this->db->execute(
                'UPDATE verification_records
                 SET status = "query_required",
                     awaiting_admin_review = 0,
                     requested_corrections = :rc,
                     provider_remarks = :pr,
                     result_data = :rd,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'rc' => $message,
                    'pr' => $message,
                    'rd' => json_encode($resultData),
                    'id' => $recordId,
                ]
            );
        } else {
            $this->db->execute(
                "UPDATE `{$table}`
                 SET status = 'query_required',
                     awaiting_admin_review = 0,
                     submitted_fields = :sf,
                     requested_corrections = :rc,
                     provider_remarks = :pr,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = :id",
                [
                    'sf' => json_encode($submittedFields),
                    'rc' => $message,
                    'pr' => $message,
                    'rby' => $reviewerLabel,
                    'id' => $recordId,
                ]
            );
        }

        $refNum = $loaded['dto']['reference_number'];
        $serviceName = $loaded['dto']['service_name'];
        $this->appendDomainHistory($domain, $recordId, $prevStatus, 'query_required', 'admin', (string)$actor['id'], 'Clarification requested: ' . $message, true);
        $this->notifyCustomer(
            (string)$row['user_id'],
            "{$serviceName}: Action Required",
            "Clarification or updated document(s) are required for {$refNum}: {$message}",
            'warning',
            $refNum,
            ['reference_number' => $refNum, 'domain' => $domain, 'status' => 'query_required']
        );
        $this->recordAudit($actor, 'MANUAL_ORDER_CLARIFICATION_REQUESTED', ['domain' => $domain, 'record_id' => $recordId, 'message' => $message], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], 'Clarification request sent to customer.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/review-clarification
     */
    public function reviewClarification(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, ['completed', 'refunded'], true)) {
            Response::error('Terminal orders cannot be modified.', 422);
        }

        $decision = strtolower(trim((string)($body['decision'] ?? $body['action'] ?? '')));
        if (!in_array($decision, ['approve', 'request_more', 'reject'], true)) {
            Response::error('Invalid decision. Expected approve, request_more, or reject.', 422);
        }

        $remarks = trim((string)($body['remarks'] ?? $body['requested_corrections'] ?? $body['note'] ?? ''));
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $infoHistory = $this->decodeJson($row['additional_info_history'] ?? null, []);
        if (!empty($infoHistory)) {
            $lastIdx = count($infoHistory) - 1;
            $infoHistory[$lastIdx]['review_state'] = $decision === 'approve' ? 'approved' : ($decision === 'request_more' ? 'needs_more_correction' : 'rejected');
            $infoHistory[$lastIdx]['reviewed_at'] = date('Y-m-d H:i:s');
            if ($remarks !== '') {
                $infoHistory[$lastIdx]['admin_feedback'] = $remarks;
            }
        }

        $refundRes = null;
        $refNum = $loaded['dto']['reference_number'];
        $serviceName = $loaded['dto']['service_name'];

        if ($decision === 'approve') {
            $nextStatus = strtolower(trim((string)($body['next_status'] ?? 'processing')));
            if (!in_array($nextStatus, ['under_review', 'assigned', 'processing'], true)) {
                $nextStatus = 'processing';
            }

            if ($table === 'verification_records') {
                $rd = $this->decodeJson($row['result_data'] ?? null, []);
                $rd['query_review_status'] = 'approved';
                $this->db->execute(
                    'UPDATE verification_records
                     SET status = :st, additional_info_history = :aih, requested_corrections = NULL,
                         provider_remarks = COALESCE(NULLIF(:pr, ""), provider_remarks), result_data = :rd, updated_at = NOW()
                     WHERE id = :id',
                    ['st' => $nextStatus, 'aih' => json_encode($infoHistory), 'pr' => $remarks, 'rd' => json_encode($rd), 'id' => $recordId]
                );
            } else {
                $sf = $this->decodeJson($row['submitted_fields'] ?? null, []);
                $sf['query_review_status'] = 'approved';
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = :st, submitted_fields = :sf, additional_info_history = :aih, requested_corrections = NULL,
                         provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks), reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                     WHERE id = :id",
                    ['st' => $nextStatus, 'sf' => json_encode($sf), 'aih' => json_encode($infoHistory), 'pr' => $remarks, 'rby' => $reviewerLabel, 'id' => $recordId]
                );
            }
            $this->appendDomainHistory($domain, $recordId, $prevStatus, $nextStatus, 'admin', (string)$actor['id'], $remarks ?: 'Clarification approved', true);
            $this->notifyCustomer((string)$row['user_id'], "{$serviceName} Clarification Approved", "Your clarification for {$refNum} was approved and processing has resumed.", 'success', $refNum);
        } elseif ($decision === 'request_more') {
            if (strlen($remarks) < 5) {
                Response::error('Please specify what further corrections are needed.', 422);
            }
            if ($table === 'verification_records') {
                $rd = $this->decodeJson($row['result_data'] ?? null, []);
                $rd['query_review_status'] = 'awaiting_customer_response';
                $this->db->execute(
                    'UPDATE verification_records
                     SET status = "query_required", additional_info_history = :aih, requested_corrections = :rc, provider_remarks = :pr, result_data = :rd, updated_at = NOW()
                     WHERE id = :id',
                    ['aih' => json_encode($infoHistory), 'rc' => $remarks, 'pr' => $remarks, 'rd' => json_encode($rd), 'id' => $recordId]
                );
            } else {
                $sf = $this->decodeJson($row['submitted_fields'] ?? null, []);
                $sf['query_review_status'] = 'awaiting_customer_response';
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = 'query_required', submitted_fields = :sf, additional_info_history = :aih, requested_corrections = :rc, provider_remarks = :pr, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                     WHERE id = :id",
                    ['sf' => json_encode($sf), 'aih' => json_encode($infoHistory), 'rc' => $remarks, 'pr' => $remarks, 'rby' => $reviewerLabel, 'id' => $recordId]
                );
            }
            $this->appendDomainHistory($domain, $recordId, $prevStatus, 'query_required', 'admin', (string)$actor['id'], 'Further correction requested: ' . $remarks, true);
            $this->notifyCustomer((string)$row['user_id'], "{$serviceName}: Further Correction Needed", "Update required on {$refNum}: {$remarks}", 'warning', $refNum);
        } else {
            $rejectReason = $remarks !== '' ? $remarks : 'Order could not be completed after clarification review';
            $refundRes = $this->rejectAndRefundManualOrder($domain, $row, $table, $actor, $rejectReason, true, [
                'additional_info_history' => json_encode($infoHistory),
            ]);
            if (!empty($refundRes['error'])) {
                Response::error((string)$refundRes['error'], (int)($refundRes['code'] ?? 422));
            }
            if (empty($refundRes['already_terminal'])) {
                $finalSt = !empty($refundRes['refunded']) ? 'refunded' : 'rejected';
                $this->appendDomainHistory($domain, $recordId, $prevStatus, $finalSt, 'admin', (string)$actor['id'], $rejectReason, true);
            }
        }

        $this->recordAudit($actor, 'MANUAL_ORDER_CLARIFICATION_REVIEWED', ['domain' => $domain, 'record_id' => $recordId, 'decision' => $decision], $request);
        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto'], 'refund' => $refundRes], 'Clarification review recorded.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/status
     * Handles intermediate transitions, submission for senior completion review, and rejections/refunds.
     * Direct transition to `completed` MUST go through `approveCompletion`!
     */
    public function updateStatus(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, ['completed', 'refunded'], true)) {
            Response::error('Completed or refunded orders are terminal and cannot be transitioned via status update.', 422);
        }

        $targetStatus = strtolower(trim((string)($body['status'] ?? '')));
        $submitForReview = !empty($body['submit_for_completion_review']) || $targetStatus === 'awaiting_completion_review';

        if ($targetStatus === 'completed' && !$submitForReview) {
            Response::error('Manual fulfilment orders cannot skip senior sign-off. Submit for completion review or use Approve & Complete.', 422);
        }

        $remarks = trim((string)($body['provider_remarks'] ?? $body['remarks'] ?? ''));
        $adminNotes = array_key_exists('admin_notes', $body) ? trim((string)$body['admin_notes']) : (string)($row['admin_notes'] ?? '');
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $refundRes = null;

        if ($submitForReview) {
            $nextSt = in_array($prevStatus, ['pending', 'under_review', 'assigned'], true) ? 'processing' : $prevStatus;
            if ($table === 'verification_records') {
                $this->db->execute(
                    'UPDATE verification_records
                     SET status = :st,
                         awaiting_admin_review = 1,
                         provider_remarks = COALESCE(NULLIF(:pr, ""), provider_remarks),
                         admin_notes = :an,
                         updated_at = NOW()
                     WHERE id = :id',
                    ['st' => $nextSt, 'pr' => $remarks, 'an' => $adminNotes, 'id' => $recordId]
                );
            } else {
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = :st,
                         awaiting_admin_review = 1,
                         provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks),
                         admin_notes = :an,
                         reviewed_by = :rby,
                         reviewed_at = NOW(),
                         updated_at = NOW()
                     WHERE id = :id",
                    ['st' => $nextSt, 'pr' => $remarks, 'an' => $adminNotes, 'rby' => $reviewerLabel, 'id' => $recordId]
                );
            }
            $this->appendDomainHistory($domain, $recordId, $prevStatus, $nextSt, 'admin', (string)$actor['id'], 'Submitted for senior completion sign-off' . ($remarks ? ": {$remarks}" : ''), false);
            $this->recordAudit($actor, 'MANUAL_ORDER_SUBMITTED_FOR_REVIEW', ['domain' => $domain, 'record_id' => $recordId], $request);
            $fresh = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $fresh['dto']], 'Order queued for senior completion sign-off.');
        }

        if (in_array($targetStatus, ['rejected', 'failed', 'refunded'], true)) {
            if (strlen($remarks !== '' ? $remarks : $adminNotes) < 4) {
                Response::error('Please provide a clear rejection/failure reason before rejecting and refunding this order.', 422);
            }
            $reasonText = $remarks !== '' ? $remarks : $adminNotes;
            $triggerRefund = !array_key_exists('trigger_refund', $body) || !empty($body['trigger_refund']);
            $extraRejectCols = $adminNotes !== '' ? ['admin_notes' => $adminNotes] : [];
            $refundRes = $this->rejectAndRefundManualOrder($domain, $row, $table, $actor, $reasonText, $triggerRefund, $extraRejectCols);
            if (!empty($refundRes['error'])) {
                Response::error((string)$refundRes['error'], (int)($refundRes['code'] ?? 422));
            }
            if (empty($refundRes['already_terminal'])) {
                $finalSt = !empty($refundRes['refunded']) ? 'refunded' : 'rejected';
                $this->appendDomainHistory($domain, $recordId, $prevStatus, $finalSt, 'admin', (string)$actor['id'], $reasonText, true);
                $this->recordAudit($actor, 'MANUAL_ORDER_REJECTED', ['domain' => $domain, 'record_id' => $recordId, 'refunded' => !empty($refundRes['refunded'])], $request);
            }
            $fresh = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $fresh['dto'], 'refund' => $refundRes], !empty($refundRes['refunded']) ? 'Order rejected and refunded to customer wallet.' : 'Order marked rejected.');
        }

        $allowedIntermediate = ['pending', 'under_review', 'assigned', 'processing', 'query_required'];
        if (!in_array($targetStatus, $allowedIntermediate, true)) {
            Response::error('Unsupported target status for manual order.', 422);
        }

        if ($table === 'verification_records') {
            $this->db->execute(
                'UPDATE verification_records
                 SET status = :st,
                     awaiting_admin_review = 0,
                     provider_remarks = COALESCE(NULLIF(:pr, ""), provider_remarks),
                     admin_notes = :an,
                     updated_at = NOW()
                 WHERE id = :id',
                ['st' => $targetStatus, 'pr' => $remarks, 'an' => $adminNotes, 'id' => $recordId]
            );
        } else {
            $this->db->execute(
                "UPDATE `{$table}`
                 SET status = :st,
                     awaiting_admin_review = 0,
                     provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks),
                     admin_notes = :an,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = :id",
                ['st' => $targetStatus, 'pr' => $remarks, 'an' => $adminNotes, 'rby' => $reviewerLabel, 'id' => $recordId]
            );
        }

        if ($targetStatus !== $prevStatus || $remarks !== '') {
            $this->appendDomainHistory(
                $domain,
                $recordId,
                $prevStatus,
                $targetStatus,
                'admin',
                (string)$actor['id'],
                $remarks !== '' ? $remarks : 'Status updated to ' . strtoupper(str_replace('_', ' ', $targetStatus)),
                true
            );
            $refNum = $loaded['dto']['reference_number'];
            $serviceName = $loaded['dto']['service_name'];
            $this->notifyCustomer(
                (string)$row['user_id'],
                "{$serviceName} Update: " . strtoupper(str_replace('_', ' ', $targetStatus)),
                "Your {$serviceName} order ({$refNum}) is now " . strtoupper(str_replace('_', ' ', $targetStatus)) . '.' . ($remarks ? " Note: {$remarks}" : ''),
                $targetStatus === 'query_required' ? 'warning' : 'info',
                $refNum
            );
        }

        $this->recordAudit($actor, 'MANUAL_ORDER_STATUS_UPDATED', ['domain' => $domain, 'record_id' => $recordId, 'from' => $prevStatus, 'to' => $targetStatus], $request);
        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], 'Order status updated.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/upload-result
     * Uploads official PDF result and stages awaiting_admin_review = 1 for senior completion sign-off.
     */
    public function uploadResultDocument(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if ($prevStatus === 'refunded') {
            Response::error('Cannot attach result documents to a refunded order.', 422);
        }

        $file = $_FILES['file'] ?? $_FILES['result_pdf'] ?? [];
        $trackingId = trim((string)($request->input('tracking_id', '')));
        $remarks = trim((string)($request->input('provider_remarks', $request->input('remarks', ''))));
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);

        $storageDomain = match ($domain) {
            'enrolment' => 'enrolment',
            'verification' => 'verification',
            default => 'modification',
        };

        $doc = ResultDocumentService::storeAdminUploadedPdf(
            $this->db,
            $storageDomain,
            $row,
            $file,
            (string)$actor['id'],
            $trackingId !== '' ? $trackingId : null
        );

        $nextStatus = in_array($prevStatus, ['pending', 'under_review', 'assigned'], true) ? 'processing' : $prevStatus;
        $stageReview = $prevStatus === 'completed' ? 0 : 1;

        if ($table === 'verification_records') {
            $this->db->execute(
                'UPDATE verification_records
                 SET status = :st,
                     awaiting_admin_review = :aar,
                     provider_remarks = COALESCE(NULLIF(:pr, ""), provider_remarks),
                     updated_at = NOW()
                 WHERE id = :id',
                ['st' => $nextStatus, 'aar' => $stageReview, 'pr' => $remarks, 'id' => $recordId]
            );
        } else {
            $this->db->execute(
                "UPDATE `{$table}`
                 SET status = :st,
                     awaiting_admin_review = :aar,
                     provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks),
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = :id",
                ['st' => $nextSt = $nextStatus, 'aar' => $stageReview, 'pr' => $remarks, 'rby' => $reviewerLabel, 'id' => $recordId]
            );
        }

        $this->appendDomainHistory(
            $domain,
            $recordId,
            $prevStatus,
            $nextStatus,
            'admin',
            (string)$actor['id'],
            'Official result PDF uploaded' . ($stageReview ? ' and staged for senior completion sign-off' : '') . ($remarks ? ": {$remarks}" : ''),
            false
        );

        $this->recordAudit($actor, 'MANUAL_ORDER_RESULT_UPLOADED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'document_id' => $doc['id'],
            'staged_for_review' => (bool)$stageReview,
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success([
            'order' => $fresh['dto'],
            'document' => $doc,
        ], $stageReview
            ? 'Official PDF uploaded and staged for senior completion sign-off.'
            : 'Official PDF result updated on completed order.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/approve-completion
     * Dual-control final sign-off endpoint (manager / admin / superadmin only).
     */
    public function approveCompletion(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'manual_fulfilment');
        if (!in_array(strtolower((string)($actor['role'] ?? '')), self::SENIOR_APPROVAL_ROLES, true)) {
            Response::forbidden('Senior manager, admin, or superadmin authority is required to approve manual fulfilment completion.');
        }

        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, ['refunded', 'rejected', 'failed'], true)) {
            Response::error('Rejected or refunded orders cannot be approved for completion.', 422);
        }
        if ($prevStatus === 'completed' && empty($row['awaiting_admin_review'])) {
            $freshAlready = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $freshAlready['dto']], 'Order is already approved and completed.');
        }

        $verificationNote = trim((string)($body['verification_note'] ?? $body['provider_remarks'] ?? $body['remarks'] ?? ''));
        $trackingId = trim((string)($body['tracking_id'] ?? $body['provider_tracking_id'] ?? ''));
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $actorId = (string)$actor['id'];

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $verificationNote,
            $trackingId,
            $reviewerLabel,
            $actorId
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }

            $curStatus = strtolower((string)($lockedRow['status'] ?? 'pending'));
            if (in_array($curStatus, ['refunded', 'rejected', 'failed'], true)) {
                return ['error' => 'Rejected or refunded orders cannot be approved for completion.', 'code' => 422];
            }
            if ($curStatus === 'completed' && empty($lockedRow['awaiting_admin_review'])) {
                return ['already_completed' => true, 'row' => $lockedRow, 'prev_status' => $curStatus];
            }

            $hasDoc = !empty($lockedRow['result_document_id']);
            $hasVerificationPayload = $domain === 'verification'
                && !empty($lockedRow['result_data'])
                && strlen((string)$lockedRow['result_data']) > 10;

            if (!$hasDoc && !$hasVerificationPayload && strlen($verificationNote) < 5) {
                return [
                    'error' => 'Completion proof required: upload an official PDF result document first or enter a detailed verification note (minimum 5 characters).',
                    'code' => 422,
                ];
            }

            if ($table === 'verification_records') {
                $this->db->execute(
                    'UPDATE verification_records
                     SET status = "completed",
                         awaiting_admin_review = 0,
                         completion_approved_by = :cab,
                         completion_approved_at = NOW(),
                         has_slip = CASE WHEN result_document_id IS NOT NULL THEN 1 ELSE has_slip END,
                         provider_remarks = COALESCE(NULLIF(:pr, ""), provider_remarks),
                         completed_at = COALESCE(completed_at, NOW()),
                         updated_at = NOW()
                     WHERE id = :id',
                    ['cab' => $actorId, 'pr' => $verificationNote, 'id' => $recordId]
                );
            } else {
                $extraSql = '';
                $paramsSql = [
                    'cab' => $actorId,
                    'pr' => $verificationNote,
                    'rby' => $reviewerLabel,
                    'id' => $recordId,
                ];
                if ($trackingId !== '') {
                    $extraSql .= ', provider_tracking_id = :trk';
                    $paramsSql['trk'] = $trackingId;
                }
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = 'completed',
                         awaiting_admin_review = 0,
                         completion_approved_by = :cab,
                         completion_approved_at = NOW(),
                         provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks),
                         reviewed_by = :rby,
                         reviewed_at = NOW(),
                         completed_at = COALESCE(completed_at, NOW()),
                         updated_at = NOW()
                         {$extraSql}
                     WHERE id = :id",
                    $paramsSql
                );
            }

            $this->appendDomainHistory(
                $domain,
                $recordId,
                $curStatus,
                'completed',
                'admin',
                $actorId,
                'Approved and completed' . ($verificationNote !== '' ? ": {$verificationNote}" : ''),
                true
            );

            return [
                'already_completed' => false,
                'row' => $lockedRow,
                'has_doc' => $hasDoc,
                'prev_status' => $curStatus,
            ];
        });

        if (!empty($txResult['error'])) {
            Response::error((string)$txResult['error'], (int)($txResult['code'] ?? 422));
        }

        if (!empty($txResult['already_completed'])) {
            $freshAlready = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $freshAlready['dto']], 'Order is already approved and completed.');
        }

        $row = $txResult['row'];
        $hasDoc = !empty($txResult['has_doc']);
        $refNum = $loaded['dto']['reference_number'];
        $serviceName = $loaded['dto']['service_name'];
        $customerPrice = (float)$loaded['dto']['customer_price'];
        $internalCost = (float)$loaded['dto']['internal_fulfilment_cost'];

        $this->notifyCustomer(
            (string)$row['user_id'],
            "{$serviceName} Completed",
            "Great news! Your {$serviceName} order ({$refNum}) has been completed." . ($hasDoc ? ' Your official PDF result is now ready to preview and download.' : ($verificationNote !== '' ? " Details: {$verificationNote}" : '')),
            'success',
            $refNum,
            ['reference_number' => $refNum, 'domain' => $domain, 'status' => 'completed']
        );

        try {
            $refCategory = match ($domain) {
                'nin_modification' => 'nin_modification',
                'bvn_modification' => 'bvn_modification',
                'additional_service' => 'additional_services',
                'enrolment' => 'enrolment',
                'verification' => str_contains(strtolower((string)$row['service_key']), 'bvn') ? 'bvn_verification' : 'nin_verification',
            };
            $srcRef = (string)($row['payment_reference'] ?? $row['reference'] ?? $refNum);
            (new ReferralEngineService($this->db))->recordQualifyingTransaction([
                'user_id' => (string)$row['user_id'],
                'service_category' => $refCategory,
                'service_key' => (string)$row['service_key'],
                'source_reference' => $srcRef,
                'gross_amount' => $customerPrice,
                'wholesale_cost' => $internalCost,
                'gateway_fee' => 0.0,
            ]);
        } catch (Throwable) {
        }

        FootprintService::record([
            'user_id' => $actorId,
            'user_email' => $actor['email'] ?? null,
            'user_name' => $actor['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'MANUAL_ORDER_COMPLETION_APPROVED',
            'service_type' => (string)$row['service_key'],
            'reference' => $refNum,
            'provider' => 'hambak_manual',
            'status' => 'successful',
            'amount' => $customerPrice,
            'metadata' => [
                'domain' => $domain,
                'internal_fulfilment_cost' => $internalCost,
                'has_result_document' => $hasDoc,
            ],
        ]);
        $this->recordAudit($actor, 'MANUAL_ORDER_COMPLETION_APPROVED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'reference_number' => $refNum,
            'has_result_document' => $hasDoc,
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], 'Manual fulfilment order approved and marked completed.');
    }

    /**
     * GET /api/admin/manual-fulfilment/orders/:domain/:id/history
     */
    public function orderHistory(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'manual_fulfilment');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, true);
        Response::success([
            'history' => $loaded['dto']['status_history'] ?? [],
            'additional_info_history' => $loaded['dto']['additional_info_history'] ?? [],
        ]);
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    private function fetchAllManualOrders(array $actor): array
    {
        $items = [];

        // 1. modification_requests (NIN, BVN, ADDITIONAL)
        try {
            $mrRows = $this->db->fetchAll(
                'SELECT mr.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name
                 FROM modification_requests mr
                 LEFT JOIN users u ON u.id = mr.user_id
                 LEFT JOIN users uc ON uc.id = mr.claimed_by
                 LEFT JOIN users uap ON uap.id = mr.completion_approved_by
                 WHERE mr.fulfilment_mode = "internal_manual"
                    OR mr.provider_id = "hambak_manual"
                 ORDER BY mr.created_at DESC
                 LIMIT 400'
            );
            foreach ($mrRows as $r) {
                $itype = strtoupper((string)($r['identity_type'] ?? 'NIN'));
                $dom = $itype === 'BVN' ? 'bvn_modification' : ($itype === 'ADDITIONAL' ? 'additional_service' : 'nin_modification');
                $items[] = $this->formatUnifiedOrder($dom, $r, false);
            }
        } catch (Throwable) {
        }

        // 2. enrolment_orders
        try {
            $eoRows = $this->db->fetchAll(
                'SELECT eo.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name
                 FROM enrolment_orders eo
                 LEFT JOIN users u ON u.id = eo.user_id
                 LEFT JOIN users uc ON uc.id = eo.claimed_by
                 LEFT JOIN users uap ON uap.id = eo.completion_approved_by
                 WHERE eo.fulfilment_mode = "internal_manual"
                    OR eo.provider_id = "hambak_manual"
                 ORDER BY eo.created_at DESC
                 LIMIT 250'
            );
            foreach ($eoRows as $r) {
                $items[] = $this->formatUnifiedOrder('enrolment', $r, false);
            }
        } catch (Throwable) {
        }

        // 3. verification_records (note: uses `provider` column)
        try {
            $vrRows = $this->db->fetchAll(
                'SELECT vr.*, sc.name AS service_name, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name
                 FROM verification_records vr
                 LEFT JOIN service_catalogue sc ON sc.service_key = vr.service_key
                 LEFT JOIN users u ON u.id = vr.user_id
                 LEFT JOIN users uc ON uc.id = vr.claimed_by
                 LEFT JOIN users uap ON uap.id = vr.completion_approved_by
                 WHERE vr.fulfilment_mode = "internal_manual"
                    OR vr.provider = "hambak_manual"
                 ORDER BY vr.created_at DESC
                 LIMIT 250'
            );
            foreach ($vrRows as $r) {
                $items[] = $this->formatUnifiedOrder('verification', $r, false);
            }
        } catch (Throwable) {
        }

        // Sort: SLA-breached active orders first, then awaiting review, then newest created_at
        usort($items, static function (array $a, array $b): int {
            $aTerm = in_array($a['status'], ['completed', 'refunded', 'rejected', 'failed'], true) ? 1 : 0;
            $bTerm = in_array($b['status'], ['completed', 'refunded', 'rejected', 'failed'], true) ? 1 : 0;
            if ($aTerm !== $bTerm) {
                return $aTerm <=> $bTerm;
            }
            if ((int)$a['sla_breached'] !== (int)$b['sla_breached']) {
                return (int)$b['sla_breached'] <=> (int)$a['sla_breached'];
            }
            return strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? ''));
        });

        return $items;
    }

    private function loadManualOrder(string $domain, string $id, bool $withDetails = true): array
    {
        if (!in_array($domain, self::VALID_DOMAINS, true)) {
            Response::error('Invalid manual fulfilment domain.', 422);
        }

        $table = $this->tableForDomain($domain);
        if ($domain === 'enrolment') {
            $row = $this->db->fetchOne(
                'SELECT eo.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name
                 FROM enrolment_orders eo
                 LEFT JOIN users u ON u.id = eo.user_id
                 LEFT JOIN users uc ON uc.id = eo.claimed_by
                 LEFT JOIN users uap ON uap.id = eo.completion_approved_by
                 WHERE eo.id = :id1 OR eo.order_number = :id2
                 LIMIT 1',
                ['id1' => $id, 'id2' => $id]
            );
        } elseif ($domain === 'verification') {
            $row = $this->db->fetchOne(
                'SELECT vr.*, sc.name AS service_name, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name
                 FROM verification_records vr
                 LEFT JOIN service_catalogue sc ON sc.service_key = vr.service_key
                 LEFT JOIN users u ON u.id = vr.user_id
                 LEFT JOIN users uc ON uc.id = vr.claimed_by
                 LEFT JOIN users uap ON uap.id = vr.completion_approved_by
                 WHERE vr.id = :id1 OR vr.reference = :id2
                 LIMIT 1',
                ['id1' => $id, 'id2' => $id]
            );
        } else {
            $row = $this->db->fetchOne(
                'SELECT mr.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name
                 FROM modification_requests mr
                 LEFT JOIN users u ON u.id = mr.user_id
                 LEFT JOIN users uc ON uc.id = mr.claimed_by
                 LEFT JOIN users uap ON uap.id = mr.completion_approved_by
                 WHERE mr.id = :id1 OR mr.request_number = :id2
                 LIMIT 1',
                ['id1' => $id, 'id2' => $id]
            );
        }

        if (!$row) {
            Response::notFound('Manual fulfilment order not found.');
        }
        if (!FulfilmentRouterService::isInternalManualOrder($row)) {
            Response::error('This order is not routed to HAMBAK Internal Manual Fulfilment.', 422);
        }

        return [
            'table' => $table,
            'row' => $row,
            'dto' => $this->formatUnifiedOrder($domain, $row, $withDetails),
        ];
    }

    private function formatUnifiedOrder(string $domain, array $row, bool $withDetails = true): array
    {
        $isVerification = ($domain === 'verification');
        $isEnrolment = ($domain === 'enrolment');

        $reference = (string)($row['request_number'] ?? $row['order_number'] ?? $row['reference'] ?? $row['id']);
        $customerPrice = (float)($row['customer_price'] ?? $row['cost'] ?? 0);
        $internalCost = (float)($row['internal_fulfilment_cost'] ?? 0);
        if ($internalCost <= 0 && !empty($row['routing_snapshot'])) {
            $snap = FulfilmentRouterService::extractOrderRoutingSnapshot($row);
            $internalCost = (float)($snap['internal_fulfilment_cost'] ?? 0);
        }

        $status = strtolower(trim((string)($row['status'] ?? 'pending')));
        $slaDueAt = $row['sla_due_at'] ?? null;
        $isTerminal = in_array($status, ['completed', 'refunded', 'rejected', 'failed'], true);
        $slaRemainingMin = null;
        $slaBreached = false;
        if ($slaDueAt) {
            $dueTs = strtotime((string)$slaDueAt);
            if ($dueTs !== false) {
                $diffMin = (int)floor(($dueTs - time()) / 60);
                $slaRemainingMin = $diffMin;
                $slaBreached = (!$isTerminal && $diffMin < 0);
            }
        }

        $fields = $isVerification
            ? $this->decodeJson($row['result_data'] ?? null, [])
            : $this->decodeJson($row['submitted_fields'] ?? null, []);
        $docs = $isVerification ? [] : $this->decodeJson($row['supporting_documents'] ?? null, []);
        $checklist = $this->decodeJson($row['document_review_checklist'] ?? null, []);
        $infoHistory = $this->decodeJson($row['additional_info_history'] ?? null, []);

        $maskedIdentifier = (string)($row['masked_identifier'] ?? $row['applicant_name'] ?? '');
        if ($maskedIdentifier === '' && !empty($row['search_value'])) {
            $sv = (string)$row['search_value'];
            $maskedIdentifier = strlen($sv) > 6 ? (substr($sv, 0, 3) . '****' . substr($sv, -3)) : $sv;
        }

        $storageDomain = $isEnrolment ? 'enrolment' : ($isVerification ? 'verification' : 'modification');
        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $row, $storageDomain, true);
        if ($domain === 'additional_service' && !empty($resultMeta['result_document'])) {
            $resultMeta['result_document']['preview_url'] = '/api/additional-services/' . $row['id'] . '/result-document';
            $resultMeta['result_document']['download_url'] = '/api/additional-services/' . $row['id'] . '/result-document?download=1';
        }

        $statusHistory = $withDetails ? $this->loadStatusHistory($domain, (string)$row['id'], $row) : [];

        return array_merge([
            'id' => (string)$row['id'],
            'domain' => $domain,
            'reference_number' => $reference,
            'service_key' => (string)($row['service_key'] ?? ''),
            'service_name' => (string)($row['service_name'] ?? $row['service_key'] ?? 'Manual Service'),
            'customer_id' => (string)($row['user_id'] ?? ''),
            'customer_name' => (string)($row['customer_name'] ?? 'Customer'),
            'customer_email' => (string)($row['customer_email'] ?? ''),
            'customer_phone' => (string)($row['customer_phone'] ?? ''),
            'masked_identifier' => $maskedIdentifier,
            'status' => $status,
            'fulfilment_mode' => 'internal_manual',
            'provider_id' => (string)($row['provider_id'] ?? $row['provider'] ?? 'hambak_manual'),
            'customer_price' => round($customerPrice, 2),
            'internal_fulfilment_cost' => round($internalCost, 2),
            'net_margin' => round($customerPrice - $internalCost, 2),
            'is_refundable' => !array_key_exists('is_refundable', $row) || !empty($row['is_refundable']),
            'refund_reference' => $row['refund_reference'] ?? null,
            'sla_due_at' => $slaDueAt,
            'sla_remaining_minutes' => $slaRemainingMin,
            'sla_breached' => $slaBreached,
            'claimed_by' => $row['claimed_by'] ?? null,
            'claimed_by_name' => $row['claimed_by_name'] ?? null,
            'claimed_at' => $row['claimed_at'] ?? null,
            'assigned_to' => $row['assigned_to'] ?? ($row['claimed_by'] ?? null),
            'assigned_staff_name' => $row['assigned_staff_name'] ?? ($row['claimed_by_name'] ?? null),
            'awaiting_admin_review' => !empty($row['awaiting_admin_review']),
            'completion_approved_by' => $row['completion_approved_by'] ?? null,
            'completion_approved_by_name' => $row['completion_approved_by_name'] ?? null,
            'completion_approved_at' => $row['completion_approved_at'] ?? null,
            'requested_corrections' => $row['requested_corrections'] ?? null,
            'query_review_status' => $fields['query_review_status'] ?? null,
            'provider_remarks' => $row['provider_remarks'] ?? null,
            'admin_notes' => $row['admin_notes'] ?? null,
            'submitted_fields' => $withDetails ? $fields : [],
            'supporting_documents' => $docs,
            'document_review_checklist' => is_array($checklist) ? $checklist : [],
            'additional_info_history' => $infoHistory,
            'status_history' => $statusHistory,
            'routing_snapshot' => $withDetails ? FulfilmentRouterService::extractOrderRoutingSnapshot($row) : null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'completed_at' => $row['completed_at'] ?? null,
        ], $resultMeta);
    }

    private function matchesQueue(array $item, string $queue, string $actorId): bool
    {
        $st = (string)$item['status'];
        $isTerminal = in_array($st, ['completed', 'refunded', 'rejected', 'failed'], true);

        return match ($queue) {
            'unclaimed' => empty($item['claimed_by']) && in_array($st, ['pending', 'under_review', 'assigned', 'processing'], true),
            'my_claimed' => ((string)($item['claimed_by'] ?? '') === $actorId) && !$isTerminal,
            'in_progress' => in_array($st, ['under_review', 'assigned', 'processing'], true) && empty($item['awaiting_admin_review']),
            'awaiting_clarification' => $st === 'query_required',
            'awaiting_completion_review' => (!empty($item['awaiting_admin_review']) || $st === 'awaiting_completion_review') && !$isTerminal,
            'sla_breached' => !empty($item['sla_breached']),
            'completed' => $st === 'completed',
            'rejected_refunded' => in_array($st, ['rejected', 'refunded', 'failed'], true),
            default => true,
        };
    }

    private function rejectAndRefundManualOrder(
        string $domain,
        array $row,
        string $table,
        array $actor,
        string $reason,
        bool $triggerRefund,
        array $extraColumns = []
    ): array {
        $recordId = (string)$row['id'];
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $actorId = (string)$actor['id'];

        $txOutcome = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $reviewerLabel,
            $actorId,
            $reason,
            $triggerRefund,
            $extraColumns
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }

            $curStatus = strtolower((string)($lockedRow['status'] ?? 'pending'));
            if ($curStatus === 'completed') {
                return ['error' => 'Completed orders cannot be rejected or refunded through manual queue.', 'code' => 422];
            }

            $refNum = (string)($lockedRow['request_number'] ?? $lockedRow['order_number'] ?? $lockedRow['reference'] ?? $recordId);
            $paymentRef = (string)($lockedRow['payment_reference'] ?? $lockedRow['reference'] ?? $refNum);
            $amount = (float)($lockedRow['customer_price'] ?? $lockedRow['cost'] ?? 0);
            $isRefundable = !array_key_exists('is_refundable', $lockedRow) || !empty($lockedRow['is_refundable']);

            $refundRef = trim((string)($lockedRow['refund_reference'] ?? ''));
            $canonicalRefundRef = 'REFUND_' . $paymentRef;
            $legacyManualRefundRef = 'MREF_' . $refNum;

            // If already refunded or already recorded under either refund reference format, stay idempotent
            $existingRefundTx = $this->db->fetchOne(
                'SELECT reference, balance_after FROM transactions WHERE user_id = :uid AND reference IN (:r1, :r2) AND status = "successful" LIMIT 1 FOR UPDATE',
                ['uid' => (string)$lockedRow['user_id'], 'r1' => $canonicalRefundRef, 'r2' => $legacyManualRefundRef]
            );
            if ($existingRefundTx) {
                $refundRef = (string)$existingRefundTx['reference'];
            }

            if ($curStatus === 'refunded' || ($curStatus === 'rejected' && $refundRef !== '')) {
                return [
                    'already_terminal' => true,
                    'refunded' => $curStatus === 'refunded' || $refundRef !== '',
                    'refund_reference' => $refundRef !== '' ? $refundRef : null,
                    'balance_after' => $existingRefundTx ? (float)$existingRefundTx['balance_after'] : null,
                    'row' => $lockedRow,
                    'ref_num' => $refNum,
                    'payment_ref' => $paymentRef,
                    'amount' => $amount,
                ];
            }

            $refunded = false;
            $balanceAfter = $existingRefundTx ? (float)$existingRefundTx['balance_after'] : null;

            if ($refundRef !== '') {
                $refunded = true;
            } elseif ($triggerRefund && $isRefundable && $amount > 0) {
                $refundRef = $canonicalRefundRef;
                $res = $this->walletService->attemptConfirmedRefund(
                    (string)$lockedRow['user_id'],
                    $amount,
                    'refund',
                    $refundRef,
                    "Refund for rejected manual order {$refNum}: {$reason}",
                    ['domain' => $domain, 'record_id' => $recordId, 'actor_id' => $actorId]
                );
                $refunded = !empty($res['confirmed']);
                $balanceAfter = $res['balance_after'] ?? null;
                if (!$refunded) {
                    $refundRef = '';
                }
            }

            $finalStatus = $refunded ? 'refunded' : 'rejected';
            $extraSet = '';
            $extraParams = [];
            if (array_key_exists('admin_notes', $extraColumns)) {
                $extraSet .= ', admin_notes = :ex_an';
                $extraParams['ex_an'] = $extraColumns['admin_notes'];
            }
            if ($table !== 'verification_records' && array_key_exists('additional_info_history', $extraColumns)) {
                $extraSet .= ', additional_info_history = :ex_aih';
                $extraParams['ex_aih'] = $extraColumns['additional_info_history'];
            }

            if ($table === 'verification_records') {
                if (array_key_exists('additional_info_history', $extraColumns)) {
                    $extraSet .= ', additional_info_history = :ex_aih';
                    $extraParams['ex_aih'] = $extraColumns['additional_info_history'];
                }
                $this->db->execute(
                    "UPDATE verification_records
                     SET status = :st,
                         awaiting_admin_review = 0,
                         provider_remarks = :pr,
                         refund_reference = CASE WHEN :rr <> '' THEN :rr2 ELSE refund_reference END,
                         updated_at = NOW()
                         {$extraSet}
                     WHERE id = :id AND status NOT IN ('completed', 'refunded')",
                    array_merge([
                        'st' => $finalStatus,
                        'pr' => $reason,
                        'rr' => $refunded ? $refundRef : '',
                        'rr2' => $refunded ? $refundRef : '',
                        'id' => $recordId,
                    ], $extraParams)
                );
            } else {
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = :st,
                         awaiting_admin_review = 0,
                         provider_remarks = :pr,
                         reviewed_by = :rby,
                         reviewed_at = NOW(),
                         refund_reference = CASE WHEN :rr <> '' THEN :rr2 ELSE refund_reference END,
                         refunded_at = CASE WHEN :rf = 1 AND refunded_at IS NULL THEN NOW() ELSE refunded_at END,
                         updated_at = NOW()
                         {$extraSet}
                     WHERE id = :id AND status NOT IN ('completed', 'refunded')",
                    array_merge([
                        'st' => $finalStatus,
                        'pr' => $reason,
                        'rby' => $reviewerLabel,
                        'rr' => $refunded ? $refundRef : '',
                        'rr2' => $refunded ? $refundRef : '',
                        'rf' => $refunded ? 1 : 0,
                        'id' => $recordId,
                    ], $extraParams)
                );
            }

            return [
                'already_terminal' => false,
                'refunded' => $refunded,
                'refund_reference' => $refunded ? $refundRef : null,
                'balance_after' => $balanceAfter,
                'final_status' => $finalStatus,
                'row' => $lockedRow,
                'ref_num' => $refNum,
                'payment_ref' => $paymentRef,
                'amount' => $amount,
            ];
        });

        if (!empty($txOutcome['error'])) {
            return $txOutcome;
        }
        if (!empty($txOutcome['already_terminal'])) {
            return [
                'already_terminal' => true,
                'refunded' => !empty($txOutcome['refunded']),
                'refund_reference' => $txOutcome['refund_reference'],
                'balance_after' => $txOutcome['balance_after'],
            ];
        }

        $refunded = !empty($txOutcome['refunded']);
        $refundRef = $txOutcome['refund_reference'];
        $finalStatus = (string)$txOutcome['final_status'];
        $lockedRow = $txOutcome['row'];
        $refNum = (string)$txOutcome['ref_num'];
        $paymentRef = (string)$txOutcome['payment_ref'];
        $amount = (float)$txOutcome['amount'];

        if ($refunded) {
            try {
                (new ReferralEngineService($this->db))->reverseRewardsForSource($paymentRef, 'Manual order rejected/refunded: ' . $reason, $actorId);
            } catch (Throwable) {
            }
        }

        $serviceName = (string)($lockedRow['service_name'] ?? $lockedRow['service_key'] ?? 'Service');
        $this->notifyCustomer(
            (string)$lockedRow['user_id'],
            "{$serviceName} " . ($refunded ? 'Rejected & Refunded' : 'Rejected'),
            "Your {$serviceName} order ({$refNum}) could not be completed ({$reason})." . ($refunded ? ' ₦' . number_format($amount, 2) . ' has been refunded to your wallet.' : ''),
            'warning',
            $refNum,
            ['reference_number' => $refNum, 'domain' => $domain, 'status' => $finalStatus]
        );

        return [
            'already_terminal' => false,
            'refunded' => $refunded,
            'refund_reference' => $refundRef,
            'balance_after' => $txOutcome['balance_after'],
        ];
    }

    private function loadStatusHistory(string $domain, string $recordId, array $row): array
    {
        try {
            if ($domain === 'enrolment') {
                return $this->db->fetchAll(
                    'SELECT id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at
                     FROM enrolment_status_history WHERE order_id = :rid ORDER BY created_at ASC',
                    ['rid' => $recordId]
                );
            }
            if ($domain === 'verification') {
                $rd = $this->decodeJson($row['result_data'] ?? null, []);
                return is_array($rd['manual_timeline'] ?? null) ? $rd['manual_timeline'] : [];
            }
            return $this->db->fetchAll(
                'SELECT id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at
                 FROM modification_status_history WHERE request_id = :rid ORDER BY created_at ASC',
                ['rid' => $recordId]
            );
        } catch (Throwable) {
            return [];
        }
    }

    private function appendDomainHistory(
        string $domain,
        string $recordId,
        ?string $prevStatus,
        string $newStatus,
        string $actorType,
        ?string $actorId,
        ?string $remarks,
        bool $isCustomerVisible
    ): void {
        try {
            if ($domain === 'enrolment') {
                $this->db->execute(
                    'INSERT INTO enrolment_status_history (id, order_id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at)
                     VALUES (:id, :oid, :prev, :newst, :atype, :aid, :rem, :vis, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'oid' => $recordId,
                        'prev' => $prevStatus,
                        'newst' => $newStatus,
                        'atype' => $actorType,
                        'aid' => $actorId,
                        'rem' => $remarks,
                        'vis' => $isCustomerVisible ? 1 : 0,
                    ]
                );
            } elseif ($domain === 'verification') {
                $vr = $this->db->fetchOne('SELECT result_data FROM verification_records WHERE id = :id LIMIT 1', ['id' => $recordId]);
                $rd = $this->decodeJson($vr['result_data'] ?? null, []);
                if (!is_array($rd['manual_timeline'] ?? null)) {
                    $rd['manual_timeline'] = [];
                }
                $rd['manual_timeline'][] = [
                    'id' => Security::generateUuid(),
                    'previous_status' => $prevStatus,
                    'new_status' => $newStatus,
                    'actor_type' => $actorType,
                    'actor_id' => $actorId,
                    'remarks' => $remarks,
                    'is_customer_visible' => $isCustomerVisible,
                    'created_at' => date('Y-m-d H:i:s'),
                ];
                $this->db->execute('UPDATE verification_records SET result_data = :rd WHERE id = :id', [
                    'rd' => json_encode($rd),
                    'id' => $recordId,
                ]);
            } else {
                $this->db->execute(
                    'INSERT INTO modification_status_history (id, request_id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at)
                     VALUES (:id, :rid, :prev, :newst, :atype, :aid, :rem, :vis, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'rid' => $recordId,
                        'prev' => $prevStatus,
                        'newst' => $newStatus,
                        'atype' => $actorType,
                        'aid' => $actorId,
                        'rem' => $remarks,
                        'vis' => $isCustomerVisible ? 1 : 0,
                    ]
                );
            }
        } catch (Throwable) {
        }
    }

    private function fetchManualStaffList(): array
    {
        try {
            return $this->db->fetchAll(
                'SELECT id, full_name, email, role FROM users WHERE role IN ("support", "staff", "manager", "admin", "superadmin") AND status = "active" ORDER BY full_name ASC'
            ) ?: [];
        } catch (Throwable) {
            return [];
        }
    }

    private function tableForDomain(string $domain): string
    {
        return match ($domain) {
            'enrolment' => 'enrolment_orders',
            'verification' => 'verification_records',
            default => 'modification_requests',
        };
    }

    private function notifyCustomer(string $userId, string $title, string $message, string $type, string $ref, array $meta = []): void
    {
        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                 VALUES (:id, :uid, :title, :msg, :type, 0, :link, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => $title,
                    'msg' => $message,
                    'type' => in_array($type, ['info', 'success', 'warning', 'error'], true) ? $type : 'info',
                    'link' => '#orders?ref=' . urlencode($ref),
                ]
            );
        } catch (Throwable) {
        }
    }

    private function recordAudit(array $actor, string $action, array $details, ?Request $request = null): void
    {
        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, action, ip_address, details) VALUES (:id, :uid, :act, :ip, :det)',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $actor['id'] ?? null,
                    'act' => $action,
                    'ip' => $request ? Security::resolveClientIp() : null,
                    'det' => json_encode($details),
                ]
            );
        } catch (Throwable) {
        }
    }

    private function decodeJson(mixed $raw, mixed $fallback = []): mixed
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return $fallback;
    }
}
