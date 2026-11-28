<?php
/**
 * @file HambakManualController.php
 * Unified Service Routing Configuration & HAMBAK MANUAL Fulfilment Desk Controller (Phase 5B)
 *
 * Enforces strict RBAC separation:
 *   - routing_config           -> service routing modes, cost/SLA configuration, immutable audit logs
 *   - manual_fulfilment.*      -> HAMBAK MANUAL operations desk (queue, claim, assign, accept/decline,
 *                                 private internal notes, checklist, structured clarification,
 *                                 result PDF upload, independent verification, senior completion approval,
 *                                 rejection/refund, cancellation)
 *
 * Strictly scopes HAMBAK MANUAL queues to immutable order-level `fulfilment_mode = 'internal_manual'`
 * orders across: modification_requests (NIN/BVN/ADDITIONAL), enrolment_orders, and verification_records.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Hambak\Services\EmailService;
use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\SchemaSync;
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

    public const TERMINAL_STATUSES = [
        'completed',
        'refunded',
        'rejected',
        'failed',
        'cancelled',
    ];

    public const ALLOWED_TRANSITIONS = [
        'pending'        => ['under_review', 'assigned', 'processing', 'query_required'],
        'under_review'   => ['pending', 'assigned', 'processing', 'query_required'],
        'assigned'       => ['pending', 'under_review', 'processing', 'query_required'],
        'processing'     => ['under_review', 'assigned', 'query_required'],
        'query_required' => ['under_review', 'assigned', 'processing'],
    ];

    public const NOTE_CATEGORIES = [
        'general',
        'document_review',
        'verification',
        'clarification',
        'escalation',
        'supervision',
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

    private function ensureManualSchema(): void
    {
        SchemaSync::syncManualFulfilmentPhase5Schema($this->db);
    }

    // =========================================================================
    // A. SERVICE ROUTING CONFIGURATION (RBAC: routing_config) — PRESERVED
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

    /**
     * GET /api/admin/routing/provider-mappings
     */
    public function providerMappings(Request $request): void
    {
        Auth::requirePermission($request, 'routing_config');
        $data = $this->routerService->listProviderMappings([
            'service_key' => $request->query('service_key', ''),
            'provider_id' => $request->query('provider_id', ''),
        ]);
        Response::success($data);
    }

    /**
     * POST /api/admin/routing/provider-mappings
     */
    public function createProviderMapping(Request $request): void
    {
        $actor = Auth::requirePermission($request, 'routing_config');
        $body = $request->getBody();
        $res = $this->routerService->saveProviderMapping(
            null,
            is_array($body) ? $body : [],
            $actor,
            Security::resolveClientIp()
        );
        if (empty($res['ok'])) {
            Response::error((string)($res['message'] ?? 'Unable to create provider service mapping.'), (int)($res['code'] ?? 422));
        }

        FootprintService::record([
            'user_id' => $actor['id'],
            'user_email' => $actor['email'] ?? null,
            'user_name' => $actor['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_PROVIDER_MAPPING_CREATED',
            'service_type' => (string)($res['mapping']['service_key'] ?? ''),
            'reference' => (string)($res['mapping']['id'] ?? ''),
            'status' => 'successful',
        ]);

        Response::success([
            'mapping' => $res['mapping'] ?? null,
        ], (string)($res['message'] ?? 'Provider mapping created.'));
    }

    /**
     * PUT /api/admin/routing/provider-mappings/:id
     */
    public function updateProviderMapping(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'routing_config');
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();
        $res = $this->routerService->saveProviderMapping(
            $id,
            is_array($body) ? $body : [],
            $actor,
            Security::resolveClientIp()
        );
        if (empty($res['ok'])) {
            Response::error((string)($res['message'] ?? 'Unable to update provider service mapping.'), (int)($res['code'] ?? 422));
        }

        FootprintService::record([
            'user_id' => $actor['id'],
            'user_email' => $actor['email'] ?? null,
            'user_name' => $actor['full_name'] ?? null,
            'category' => 'admin',
            'action' => 'ADMIN_PROVIDER_MAPPING_UPDATED',
            'service_type' => (string)($res['mapping']['service_key'] ?? ''),
            'reference' => $id,
            'status' => 'successful',
        ]);

        Response::success([
            'mapping' => $res['mapping'] ?? null,
        ], (string)($res['message'] ?? 'Provider mapping updated.'));
    }

    /**
     * DELETE /api/admin/routing/provider-mappings/:id
     */
    public function deleteProviderMapping(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'routing_config');
        $id = trim((string)($params['id'] ?? ''));
        $res = $this->routerService->deleteProviderMapping(
            $id,
            $actor,
            Security::resolveClientIp()
        );
        if (empty($res['ok'])) {
            Response::error((string)($res['message'] ?? 'Unable to delete provider service mapping.'), (int)($res['code'] ?? 422));
        }

        Response::success(null, (string)($res['message'] ?? 'Provider mapping deleted.'));
    }

    // =========================================================================
    // B. HAMBAK MANUAL FULFILMENT DESK (PHASE 5B GRANULAR RBAC)
    // =========================================================================

    /**
     * GET /api/admin/manual-fulfilment/orders
     * Supports pagination, search, filtering, sorting, and all Phase 5B work queue views.
     */
    public function orders(Request $request): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.view');

        $queue = strtolower(trim((string)$request->query('queue', 'all_manual')));
        $domainFilter = strtolower(trim((string)$request->query('domain', 'all')));
        $statusFilter = strtolower(trim((string)$request->query('status', 'all')));
        $serviceKeyFilter = strtolower(trim((string)$request->query('service_key', '')));
        $slaStateFilter = strtolower(trim((string)$request->query('sla_state', 'all')));
        $search = trim((string)$request->query('search', ''));
        $assignedTo = trim((string)$request->query('assigned_to', 'all'));
        $sortBy = strtolower(trim((string)$request->query('sort_by', 'priority')));
        $sortDir = strtolower(trim((string)$request->query('sort_dir', 'desc')));
        if (!in_array($sortDir, ['asc', 'desc'], true)) {
            $sortDir = 'desc';
        }

        $page = max(1, (int)$request->query('page', 1));
        $limit = min(200, max(1, (int)$request->query('limit', 100)));
        $offset = ($page - 1) * $limit;

        $allItems = $this->fetchAllManualOrders($actor);

        $queueCounts = [
            'all_manual' => 0,
            'unassigned' => 0,
            'unclaimed' => 0,
            'assigned' => 0,
            'my_claimed' => 0,
            'awaiting_document_review' => 0,
            'processing' => 0,
            'in_progress' => 0,
            'awaiting_clarification' => 0,
            'awaiting_customer_info' => 0,
            'awaiting_result_verification' => 0,
            'awaiting_completion_review' => 0,
            'awaiting_completion_approval' => 0,
            'sla_breached' => 0,
            'completed' => 0,
            'rejected' => 0,
            'rejected_refunded' => 0,
            'cancelled' => 0,
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

            foreach (array_keys($queueCounts) as $qKey) {
                if ($qKey === 'all_manual') {
                    continue;
                }
                if ($this->matchesQueue($item, $qKey, $actorId)) {
                    $queueCounts[$qKey]++;
                }
            }

            if ($domainFilter !== '' && $domainFilter !== 'all' && $dom !== $domainFilter) {
                continue;
            }
            if ($statusFilter !== '' && $statusFilter !== 'all' && strtolower((string)$item['status']) !== $statusFilter) {
                continue;
            }
            if ($serviceKeyFilter !== '' && strtolower((string)$item['service_key']) !== $serviceKeyFilter) {
                continue;
            }
            if ($slaStateFilter === 'breached' && empty($item['sla_breached'])) {
                continue;
            }
            if ($slaStateFilter === 'within_sla' && !empty($item['sla_breached'])) {
                continue;
            }
            if ($queue !== '' && $queue !== 'all_manual' && !$this->matchesQueue($item, $queue, $actorId)) {
                continue;
            }
            if ($assignedTo !== '' && $assignedTo !== 'all') {
                $effAssignee = trim((string)($item['assigned_to'] ?? $item['claimed_by'] ?? ''));
                if ($assignedTo === 'unassigned') {
                    if ($effAssignee !== '') {
                        continue;
                    }
                } elseif ($assignedTo === 'me') {
                    if ($effAssignee !== $actorId && (string)($item['claimed_by'] ?? '') !== $actorId) {
                        continue;
                    }
                } elseif ($effAssignee !== $assignedTo && (string)($item['claimed_by'] ?? '') !== $assignedTo) {
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
                    (string)($item['assigned_staff_name'] ?? ''),
                ]));
                if (!str_contains($haystack, strtolower($search))) {
                    continue;
                }
            }

            $filtered[] = $item;
        }

        usort($filtered, function (array $a, array $b) use ($sortBy, $sortDir): int {
            if ($sortBy === 'priority') {
                $aTerm = in_array($a['status'], self::TERMINAL_STATUSES, true) ? 1 : 0;
                $bTerm = in_array($b['status'], self::TERMINAL_STATUSES, true) ? 1 : 0;
                if ($aTerm !== $bTerm) {
                    return $aTerm <=> $bTerm;
                }
                if ((int)$a['sla_breached'] !== (int)$b['sla_breached']) {
                    return (int)$b['sla_breached'] <=> (int)$a['sla_breached'];
                }
                return strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? ''));
            }

            $cmp = match ($sortBy) {
                'updated_at' => strcmp((string)($a['updated_at'] ?? ''), (string)($b['updated_at'] ?? '')),
                'sla_due_at' => strcmp((string)($a['sla_due_at'] ?? '9999-12-31'), (string)($b['sla_due_at'] ?? '9999-12-31')),
                'status' => strcmp((string)($a['status'] ?? ''), (string)($b['status'] ?? '')),
                'customer_price' => ((float)$a['customer_price']) <=> ((float)$b['customer_price']),
                default => strcmp((string)($a['created_at'] ?? ''), (string)($b['created_at'] ?? '')),
            };
            return $sortDir === 'asc' ? $cmp : -$cmp;
        });

        $totalMatched = count($filtered);
        $sliced = array_slice($filtered, $offset, $limit);
        $staffList = $this->fetchManualStaffList();

        Response::success([
            'orders' => $sliced,
            'total_matched' => $totalMatched,
            'pagination' => [
                'total' => $totalMatched,
                'page' => $page,
                'limit' => $limit,
                'offset' => $offset,
                'total_pages' => max(1, (int)ceil($totalMatched / $limit)),
            ],
            'queue_counts' => $queueCounts,
            'domain_counts' => $domainCounts,
            'staff_members' => $staffList,
            'can_approve_completion' => $this->canApproveCompletion($actor),
        ]);
    }

    /**
     * GET /api/admin/manual-fulfilment/orders/:domain/:id
     */
    public function orderDetail(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.view');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, false);
        $this->assertOrderAccess($actor, $loaded['row']);
        $dto = $this->formatUnifiedOrder($domain, $loaded['row'], true);

        Response::success([
            'order' => $dto,
            'staff_members' => $this->fetchManualStaffList(),
            'can_approve_completion' => $this->canApproveCompletion($actor),
        ]);
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/claim
     * Atomic claim / unclaim with SELECT ... FOR UPDATE concurrency guard and assignment history.
     */
    public function claimOrder(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $body = $request->getBody();
        $action = strtolower(trim((string)($body['action'] ?? 'claim')));

        if (in_array($action, ['unclaim', 'release'], true)) {
            $actor = Auth::requireAnyPermission($request, [
                'manual_fulfilment.claim',
                'manual_fulfilment.assign',
                'manual_fulfilment.manage',
            ]);
        } else {
            $actor = Auth::requirePermission($request, 'manual_fulfilment.claim');
        }

        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $loaded = $this->loadManualOrder($domain, $id, false);
        $table = $loaded['table'];
        $recordId = (string)$loaded['row']['id'];
        $actorId = (string)$actor['id'];
        $actorName = (string)($actor['full_name'] ?: $actor['email'] ?: $actorId);
        $reason = trim((string)($body['reason'] ?? ''));

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $actor,
            $actorId,
            $actorName,
            $action,
            $reason
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }
            if (!FulfilmentRouterService::isInternalManualOrder($lockedRow)) {
                return ['error' => 'This order is not routed to HAMBAK Internal Manual Fulfilment.', 'code' => 422];
            }

            $status = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if (in_array($status, self::TERMINAL_STATUSES, true)) {
                return ['error' => 'Terminal orders cannot be claimed or released.', 'code' => 422];
            }

            $prevAssignee = trim((string)($lockedRow['assigned_to'] ?? $lockedRow['claimed_by'] ?? ''));
            $isSupervisor = Auth::isManualFulfilmentSupervisor($actor);

            if (in_array($action, ['unclaim', 'release'], true)) {
                if ($prevAssignee !== '' && $prevAssignee !== $actorId && !$isSupervisor) {
                    return ['error' => 'Only the assigned operator or a senior supervisor can release this assignment.', 'code' => 403];
                }
                $nextStatus = $status === 'assigned' ? 'pending' : $status;
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET claimed_by = NULL,
                         claimed_at = NULL,
                         assigned_by = NULL,
                         assigned_to = NULL,
                         assigned_staff_name = NULL,
                         assigned_at = NULL,
                         assignment_accepted_at = NULL,
                         status = :st,
                         updated_at = NOW()
                     WHERE id = :id",
                    ['st' => $nextStatus, 'id' => $recordId]
                );

                $this->recordAssignmentHistory(
                    $domain,
                    $recordId,
                    'released',
                    $prevAssignee !== '' ? $prevAssignee : null,
                    null,
                    null,
                    $actorId,
                    $actorName,
                    $reason !== '' ? $reason : 'Assignment released back to queue'
                );
                $this->appendDomainHistory($domain, $recordId, $status, $nextStatus, 'admin', $actorId, "Assignment released by {$actorName}", false);

                return ['action' => 'released', 'prev_status' => $status, 'next_status' => $nextStatus];
            }

            $existingClaimed = trim((string)($lockedRow['claimed_by'] ?? ''));
            $existingAssigned = trim((string)($lockedRow['assigned_to'] ?? ''));
            if (($existingClaimed !== '' && $existingClaimed !== $actorId) || ($existingAssigned !== '' && $existingAssigned !== $actorId)) {
                return ['error' => 'This order is already claimed or assigned to another staff operator.', 'code' => 409];
            }

            $nextStatus = $status === 'pending' ? 'assigned' : $status;
            $this->db->execute(
                "UPDATE `{$table}`
                 SET claimed_by = :cid,
                     claimed_at = COALESCE(claimed_at, NOW()),
                     assigned_by = COALESCE(assigned_by, :aby),
                     assigned_to = :ato,
                     assigned_staff_name = :aname,
                     assigned_at = COALESCE(assigned_at, NOW()),
                     assignment_accepted_at = COALESCE(assignment_accepted_at, NOW()),
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id",
                [
                    'cid' => $actorId,
                    'aby' => $actorId,
                    'ato' => $actorId,
                    'aname' => $actorName,
                    'st' => $nextStatus,
                    'id' => $recordId,
                ]
            );

            $this->recordAssignmentHistory(
                $domain,
                $recordId,
                'claimed',
                $prevAssignee !== '' ? $prevAssignee : null,
                $actorId,
                $actorName,
                $actorId,
                $actorName,
                $reason !== '' ? $reason : 'Claimed from manual queue'
            );
            $historyNote = $nextStatus !== $status
                ? 'Order claimed and assigned to operator'
                : 'Order claimed internally';
            $this->appendDomainHistory($domain, $recordId, $status, $nextStatus, 'admin', $actorId, $historyNote, $nextStatus !== $status);

            return ['action' => 'claimed', 'prev_status' => $status, 'next_status' => $nextStatus];
        });

        if (!empty($txResult['error'])) {
            Response::error((string)$txResult['error'], (int)($txResult['code'] ?? 422));
        }

        $auditAction = $txResult['action'] === 'released' ? 'MANUAL_ORDER_UNCLAIMED' : 'MANUAL_ORDER_CLAIMED';
        $this->recordAudit($actor, $auditAction, [
            'domain' => $domain,
            'record_id' => $recordId,
            'reference' => $loaded['dto']['reference_number'],
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(
            ['order' => $fresh['dto']],
            $txResult['action'] === 'released' ? 'Order assignment released back to the pool.' : "Order claimed by {$actorName}."
        );
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/assign
     * Assigns or reassigns an order inside a row lock. Reassignment requires supervisor privilege.
     */
    public function assignOrder(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.assign');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $table = $loaded['table'];
        $recordId = (string)$loaded['row']['id'];
        $actorId = (string)$actor['id'];
        $actorName = (string)($actor['full_name'] ?: $actor['email'] ?: $actorId);
        $staffId = trim((string)($body['staff_id'] ?? $body['assigned_to'] ?? ''));
        $reason = trim((string)($body['reason'] ?? ''));

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

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $actor,
            $actorId,
            $actorName,
            $staffId,
            $staffName,
            $reason
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }

            $prevStatus = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if (in_array($prevStatus, self::TERMINAL_STATUSES, true)) {
                return ['error' => 'Terminal orders cannot be reassigned.', 'code' => 422];
            }

            $prevAssignee = trim((string)($lockedRow['assigned_to'] ?? $lockedRow['claimed_by'] ?? ''));
            $isSupervisor = Auth::isManualFulfilmentSupervisor($actor);
            if ($prevAssignee !== '' && $prevAssignee !== $staffId && !$isSupervisor) {
                return [
                    'error' => 'Only a supervisor or manager can reassign an order that is already assigned or claimed.',
                    'code' => 403,
                ];
            }

            if ($staffId === '') {
                $nextStatus = $prevStatus === 'assigned' ? 'pending' : $prevStatus;
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET claimed_by = NULL,
                         claimed_at = NULL,
                         assigned_by = NULL,
                         assigned_to = NULL,
                         assigned_staff_name = NULL,
                         assigned_at = NULL,
                         assignment_accepted_at = NULL,
                         status = :st,
                         updated_at = NOW()
                     WHERE id = :id",
                    ['st' => $nextStatus, 'id' => $recordId]
                );
                $this->recordAssignmentHistory(
                    $domain,
                    $recordId,
                    'released',
                    $prevAssignee !== '' ? $prevAssignee : null,
                    null,
                    null,
                    $actorId,
                    $actorName,
                    $reason !== '' ? $reason : 'Assignment cleared by supervisor'
                );
                $this->appendDomainHistory($domain, $recordId, $prevStatus, $nextStatus, 'admin', $actorId, 'Staff assignment cleared', false);
                return ['cleared' => true, 'next_status' => $nextStatus];
            }

            $isReassign = ($prevAssignee !== '' && $prevAssignee !== $staffId);
            $nextStatus = in_array($prevStatus, ['pending', 'under_review'], true) ? 'assigned' : $prevStatus;
            $this->db->execute(
                "UPDATE `{$table}`
                 SET claimed_by = :cid,
                     claimed_at = COALESCE(claimed_at, NOW()),
                     assigned_by = :aby,
                     assigned_to = :ato,
                     assigned_staff_name = :aname,
                     assigned_at = NOW(),
                     assignment_accepted_at = NULL,
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id",
                [
                    'cid' => $staffId,
                    'aby' => $actorId,
                    'ato' => $staffId,
                    'aname' => $staffName,
                    'st' => $nextStatus,
                    'id' => $recordId,
                ]
            );

            $this->recordAssignmentHistory(
                $domain,
                $recordId,
                $isReassign ? 'reassigned' : 'assigned',
                $prevAssignee !== '' ? $prevAssignee : null,
                $staffId,
                $staffName,
                $actorId,
                $actorName,
                $reason !== '' ? $reason : ($isReassign ? "Reassigned to {$staffName}" : "Assigned to {$staffName}")
            );
            $this->appendDomainHistory(
                $domain,
                $recordId,
                $prevStatus,
                $nextStatus,
                'admin',
                $actorId,
                ($isReassign ? "Reassigned to HAMBAK officer: {$staffName}" : "Assigned to HAMBAK officer: {$staffName}"),
                false
            );

            return ['cleared' => false, 'reassigned' => $isReassign, 'next_status' => $nextStatus];
        });

        if (!empty($txResult['error'])) {
            Response::error((string)$txResult['error'], (int)($txResult['code'] ?? 422));
        }

        if (empty($txResult['cleared']) && $staffId !== '' && $staffId !== $actorId) {
            $refNum = $loaded['dto']['reference_number'];
            $svcName = $loaded['dto']['service_name'];
            $this->notifyStaffUser(
                $staffId,
                "Manual Order Assigned: {$refNum}",
                "{$actorName} assigned {$svcName} ({$refNum}) to you. Please accept or review in the Manual Fulfilment Desk.",
                '#manual-fulfilment'
            );
        }

        $this->recordAudit($actor, !empty($txResult['reassigned']) ? 'MANUAL_ORDER_REASSIGNED' : 'MANUAL_ORDER_ASSIGNED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'assigned_by' => $actorId,
            'assigned_to' => $staffId ?: null,
            'reason' => $reason ?: null,
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(
            ['order' => $fresh['dto']],
            $staffId !== '' ? "Assigned to {$staffName}." : 'Assignment cleared.'
        );
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/accept
     * Allows the assigned staff member to formally accept or decline an assignment.
     */
    public function acceptOrder(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.claim');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $decision = strtolower(trim((string)($body['decision'] ?? $body['action'] ?? 'accept')));
        if (!in_array($decision, ['accept', 'decline'], true)) {
            Response::error('Invalid assignment decision. Expected accept or decline.', 422);
        }
        $reason = trim((string)($body['reason'] ?? ''));
        if ($decision === 'decline' && strlen($reason) < 3) {
            Response::error('Please provide a brief reason before declining an assigned application.', 422);
        }

        $loaded = $this->loadManualOrder($domain, $id, false);
        $table = $loaded['table'];
        $recordId = (string)$loaded['row']['id'];
        $actorId = (string)$actor['id'];
        $actorName = (string)($actor['full_name'] ?: $actor['email'] ?: $actorId);

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $actor,
            $actorId,
            $actorName,
            $decision,
            $reason
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }
            $status = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if (in_array($status, self::TERMINAL_STATUSES, true)) {
                return ['error' => 'Terminal orders cannot be accepted or declined.', 'code' => 422];
            }

            $assignedTo = trim((string)($lockedRow['assigned_to'] ?? ''));
            $claimedBy = trim((string)($lockedRow['claimed_by'] ?? ''));
            $isSupervisor = Auth::isManualFulfilmentSupervisor($actor);

            if ($assignedTo === '' && $claimedBy === '') {
                return ['error' => 'Order is not currently assigned. Claim it first.', 'code' => 422];
            }
            if ($assignedTo !== $actorId && $claimedBy !== $actorId && !$isSupervisor) {
                return ['error' => 'Only the assigned operator can accept or decline this assignment.', 'code' => 403];
            }

            if ($decision === 'accept') {
                $nextStatus = in_array($status, ['pending', 'assigned'], true) ? 'under_review' : $status;
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET assignment_accepted_at = COALESCE(assignment_accepted_at, NOW()),
                         status = :st,
                         updated_at = NOW()
                     WHERE id = :id",
                    ['st' => $nextStatus, 'id' => $recordId]
                );
                $this->recordAssignmentHistory($domain, $recordId, 'accepted', $assignedTo ?: $claimedBy, $actorId, $actorName, $actorId, $actorName, $reason ?: 'Assignment accepted');
                $this->appendDomainHistory($domain, $recordId, $status, $nextStatus, 'admin', $actorId, "Assignment accepted by {$actorName}", $nextStatus !== $status);
                return ['decision' => 'accept'];
            }

            $nextStatus = 'pending';
            $this->db->execute(
                "UPDATE `{$table}`
                 SET claimed_by = NULL,
                     claimed_at = NULL,
                     assigned_by = NULL,
                     assigned_to = NULL,
                     assigned_staff_name = NULL,
                     assigned_at = NULL,
                     assignment_accepted_at = NULL,
                     status = :st,
                     updated_at = NOW()
                 WHERE id = :id",
                ['st' => $nextStatus, 'id' => $recordId]
            );
            $this->recordAssignmentHistory($domain, $recordId, 'declined', $assignedTo ?: $claimedBy, null, null, $actorId, $actorName, $reason);
            $this->appendDomainHistory($domain, $recordId, $status, $nextStatus, 'admin', $actorId, "Assignment declined by {$actorName}: {$reason}", false);

            return ['decision' => 'decline', 'assigned_by' => $lockedRow['assigned_by'] ?? null];
        });

        if (!empty($txResult['error'])) {
            Response::error((string)$txResult['error'], (int)($txResult['code'] ?? 422));
        }

        if ($txResult['decision'] === 'decline' && !empty($txResult['assigned_by']) && $txResult['assigned_by'] !== $actorId) {
            $refNum = $loaded['dto']['reference_number'];
            $this->notifyStaffUser(
                (string)$txResult['assigned_by'],
                "Assignment Declined: {$refNum}",
                "{$actorName} declined assignment of {$refNum}: {$reason}. The order returned to the unassigned queue.",
                '#manual-fulfilment'
            );
        }

        $this->recordAudit($actor, $txResult['decision'] === 'accept' ? 'MANUAL_ORDER_ACCEPTED' : 'MANUAL_ORDER_DECLINED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'reason' => $reason ?: null,
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(
            ['order' => $fresh['dto']],
            $txResult['decision'] === 'accept' ? 'Assignment accepted.' : 'Assignment declined and returned to queue.'
        );
    }

    /**
     * GET /api/admin/manual-fulfilment/orders/:domain/:id/notes
     */
    public function listInternalNotes(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.view');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, false);
        $this->assertOrderAccess($actor, $loaded['row']);

        $notes = $this->fetchInternalNotes($domain, (string)$loaded['row']['id']);
        Response::success(['notes' => $notes]);
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/notes
     */
    public function addInternalNote(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requireAnyPermission($request, [
            'manual_fulfilment.process',
            'manual_fulfilment.query',
            'manual_fulfilment.verify_result',
            'manual_fulfilment.approve',
            'manual_fulfilment.manage',
        ]);
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $this->assertOrderAccess($actor, $loaded['row']);

        $content = trim((string)($body['content'] ?? $body['note'] ?? ''));
        if (strlen($content) < 2) {
            Response::error('Internal note content must be at least 2 characters.', 422);
        }
        $category = strtolower(trim((string)($body['category'] ?? 'general')));
        if (!in_array($category, self::NOTE_CATEGORIES, true)) {
            $category = 'general';
        }

        $recordId = (string)$loaded['row']['id'];
        $refNum = $loaded['dto']['reference_number'];
        $note = $this->insertInternalNote($domain, $recordId, $refNum, $actor, $category, $content);

        $this->recordAudit($actor, 'MANUAL_ORDER_INTERNAL_NOTE_ADDED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'category' => $category,
        ], $request);

        Response::success([
            'note' => $note,
            'notes' => $this->fetchInternalNotes($domain, $recordId),
        ], 'Private internal note recorded.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/checklist
     */
    public function updateChecklist(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.process');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $status = strtolower(trim((string)($row['status'] ?? 'pending')));
        if (in_array($status, self::TERMINAL_STATUSES, true)) {
            Response::error('Document review checklists cannot be altered on terminal orders.', 422);
        }

        $rawChecklist = $body['checklist'] ?? [];
        if (!is_array($rawChecklist)) {
            Response::error('Invalid document verification checklist payload.', 422);
        }

        $normalized = [];
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $now = date('Y-m-d H:i:s');
        $allowedStates = ['pending', 'verified', 'rejected', 'needs_reupload'];
        $rejectedSummaries = [];

        foreach ($rawChecklist as $docKey => $entry) {
            $k = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)$docKey) ?? '';
            if ($k === '' || !is_array($entry)) {
                continue;
            }
            $st = strtolower(trim((string)($entry['status'] ?? 'pending')));
            if (!in_array($st, $allowedStates, true)) {
                $st = 'pending';
            }
            $note = trim((string)($entry['note'] ?? ''));
            if (in_array($st, ['rejected', 'needs_reupload'], true) && strlen($note) < 3) {
                Response::error("Please provide a rejection/re-upload reason for document '{$k}'.", 422);
            }
            if (in_array($st, ['rejected', 'needs_reupload'], true)) {
                $rejectedSummaries[] = "{$k} ({$st}): {$note}";
            }
            $normalized[$k] = [
                'status' => $st,
                'note' => $note,
                'reviewed_by' => $reviewerLabel,
                'reviewed_at' => $now,
            ];
        }

        $this->db->execute(
            "UPDATE `{$table}` SET document_review_checklist = :chk, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW() WHERE id = :id",
            ['chk' => json_encode($normalized), 'rby' => $reviewerLabel, 'id' => $recordId]
        );

        if (!empty($rejectedSummaries)) {
            $this->insertInternalNote(
                $domain,
                $recordId,
                $loaded['dto']['reference_number'],
                $actor,
                'document_review',
                'Document check flagged issues: ' . implode('; ', $rejectedSummaries)
            );
        }

        $this->recordAudit($actor, 'MANUAL_ORDER_CHECKLIST_UPDATED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'items' => count($normalized),
            'flagged' => count($rejectedSummaries),
        ], $request);
        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], 'Verification checklist updated.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/request-clarification
     */
    public function requestClarification(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.query');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, self::TERMINAL_STATUSES, true)) {
            Response::error('Cannot request clarification on a terminal order.', 422);
        }

        $title = trim((string)($body['title'] ?? 'Additional Information Required'));
        $explanation = trim((string)($body['explanation'] ?? $body['requested_corrections'] ?? $body['message'] ?? $body['remarks'] ?? ''));
        if (strlen($explanation) < 5) {
            Response::error('Please specify clear correction/clarification instructions for the customer (minimum 5 characters).', 422);
        }

        $requiredInfo = [];
        if (is_array($body['required_information'] ?? null)) {
            foreach ($body['required_information'] as $ri) {
                $clean = trim((string)$ri);
                if ($clean !== '') {
                    $requiredInfo[] = $clean;
                }
            }
        }
        $docRequirements = [];
        if (is_array($body['document_requirements'] ?? null)) {
            foreach ($body['document_requirements'] as $dr) {
                if (is_string($dr) && trim($dr) !== '') {
                    $docRequirements[] = trim($dr);
                } elseif (is_array($dr) && (!empty($dr['label']) || !empty($dr['key']))) {
                    $docRequirements[] = [
                        'key' => preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($dr['key'] ?? 'query_doc')),
                        'label' => trim((string)($dr['label'] ?? $dr['key'])),
                        'required' => !isset($dr['required']) || !empty($dr['required']),
                    ];
                }
            }
        }

        $deadlineRaw = trim((string)($body['submission_deadline'] ?? $body['clarification_deadline'] ?? ''));
        $deadlineSql = null;
        if ($deadlineRaw !== '') {
            $ts = strtotime($deadlineRaw);
            if ($ts === false || $ts <= time()) {
                Response::error('Clarification submission_deadline must be a valid future date/time.', 422);
            }
            $deadlineSql = date('Y-m-d H:i:s', $ts);
        }

        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $clarificationObj = [
            'title' => $title,
            'explanation' => $explanation,
            'required_information' => $requiredInfo,
            'document_requirements' => $docRequirements,
            'submission_deadline' => $deadlineSql,
            'requested_at' => date('Y-m-d H:i:s'),
            'requested_by_id' => (string)$actor['id'],
            'requested_by_name' => $reviewerLabel,
        ];

        $submittedFields = $this->decodeJson($row['submitted_fields'] ?? null, []);
        $submittedFields['query_review_status'] = 'awaiting_customer_response';
        $submittedFields['clarification_request'] = $clarificationObj;

        if ($table === 'verification_records') {
            $resultData = $this->decodeJson($row['result_data'] ?? null, []);
            $resultData['query_review_status'] = 'awaiting_customer_response';
            $resultData['clarification_request'] = $clarificationObj;
            $this->db->execute(
                'UPDATE verification_records
                 SET status = "query_required",
                     awaiting_admin_review = 0,
                     requested_corrections = :rc,
                     provider_remarks = :pr,
                     clarification_deadline = :cdl,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     result_data = :rd,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'rc' => $explanation,
                    'pr' => $explanation,
                    'cdl' => $deadlineSql,
                    'rby' => $reviewerLabel,
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
                     clarification_deadline = :cdl,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = :id",
                [
                    'sf' => json_encode($submittedFields),
                    'rc' => $explanation,
                    'pr' => $explanation,
                    'cdl' => $deadlineSql,
                    'rby' => $reviewerLabel,
                    'id' => $recordId,
                ]
            );
        }

        $refNum = $loaded['dto']['reference_number'];
        $serviceName = $loaded['dto']['service_name'];
        $this->appendDomainHistory($domain, $recordId, $prevStatus, 'query_required', 'admin', (string)$actor['id'], 'Clarification requested: ' . $explanation, true);
        $this->insertInternalNote(
            $domain,
            $recordId,
            $refNum,
            $actor,
            'clarification',
            "Clarification requested ({$title}): {$explanation}" . ($deadlineSql ? " [Deadline: {$deadlineSql}]" : '')
        );

        $deadlineNote = $deadlineSql ? " Please respond before {$deadlineSql}." : '';
        $this->notifyCustomer(
            (string)$row['user_id'],
            "{$serviceName}: {$title}",
            "Clarification or updated document(s) are required for {$refNum}: {$explanation}{$deadlineNote}",
            'warning',
            $refNum,
            ['reference_number' => $refNum, 'domain' => $domain, 'status' => 'query_required']
        );
        $this->sendCustomerEmail(
            (string)$row['user_id'],
            "Action Required: {$serviceName} ({$refNum})",
            "Clarification Required for Your Request",
            "Our processing team needs additional information for your <strong>" . htmlspecialchars($serviceName, ENT_QUOTES, 'UTF-8') . "</strong> order (<strong>" . htmlspecialchars($refNum, ENT_QUOTES, 'UTF-8') . "</strong>).",
            [
                'Reference' => $refNum,
                'Request Title' => $title,
                'Details' => $explanation,
                'Deadline' => $deadlineSql ?: 'As soon as possible',
            ]
        );
        $this->recordAudit($actor, 'MANUAL_ORDER_CLARIFICATION_REQUESTED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'title' => $title,
            'deadline' => $deadlineSql,
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto']], 'Clarification request sent to customer.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/review-clarification
     */
    public function reviewClarification(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.query');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $decision = strtolower(trim((string)($body['decision'] ?? $body['action'] ?? '')));
        if (!in_array($decision, ['approve', 'request_more', 'reject'], true)) {
            Response::error('Invalid decision. Expected approve, request_more, or reject.', 422);
        }
        if ($decision === 'reject' && !Auth::hasPermission($actor, 'manual_fulfilment.reject')) {
            Response::forbidden("Access denied. Missing required 'manual_fulfilment.reject' permission.");
        }

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));

        if (in_array($prevStatus, self::TERMINAL_STATUSES, true)) {
            Response::error('Terminal orders cannot be modified.', 422);
        }

        $remarks = trim((string)($body['remarks'] ?? $body['requested_corrections'] ?? $body['note'] ?? ''));
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $infoHistory = $this->decodeJson($row['additional_info_history'] ?? null, []);
        if (!empty($infoHistory)) {
            $lastIdx = count($infoHistory) - 1;
            $infoHistory[$lastIdx]['review_state'] = $decision === 'approve' ? 'approved' : ($decision === 'request_more' ? 'needs_more_correction' : 'rejected');
            $infoHistory[$lastIdx]['reviewed_at'] = date('Y-m-d H:i:s');
            $infoHistory[$lastIdx]['reviewed_by'] = $reviewerLabel;
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
                         clarification_deadline = NULL,
                         provider_remarks = COALESCE(NULLIF(:pr, ""), provider_remarks),
                         reviewed_by = :rby, reviewed_at = NOW(), result_data = :rd, updated_at = NOW()
                     WHERE id = :id',
                    ['st' => $nextStatus, 'aih' => json_encode($infoHistory), 'pr' => $remarks, 'rby' => $reviewerLabel, 'rd' => json_encode($rd), 'id' => $recordId]
                );
            } else {
                $sf = $this->decodeJson($row['submitted_fields'] ?? null, []);
                $sf['query_review_status'] = 'approved';
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = :st, submitted_fields = :sf, additional_info_history = :aih, requested_corrections = NULL,
                         clarification_deadline = NULL,
                         provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks), reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                     WHERE id = :id",
                    ['st' => $nextStatus, 'sf' => json_encode($sf), 'aih' => json_encode($infoHistory), 'pr' => $remarks, 'rby' => $reviewerLabel, 'id' => $recordId]
                );
            }
            $this->appendDomainHistory($domain, $recordId, $prevStatus, $nextStatus, 'admin', (string)$actor['id'], $remarks ?: 'Clarification approved', true);
            $this->insertInternalNote($domain, $recordId, $refNum, $actor, 'clarification', 'Customer clarification approved.' . ($remarks ? " Remarks: {$remarks}" : ''));
            $this->notifyCustomer((string)$row['user_id'], "{$serviceName} Clarification Approved", "Your clarification for {$refNum} was approved and processing has resumed.", 'success', $refNum);
        } elseif ($decision === 'request_more') {
            if (strlen($remarks) < 5) {
                Response::error('Please specify what further corrections are needed.', 422);
            }
            $deadlineRaw = trim((string)($body['submission_deadline'] ?? $body['clarification_deadline'] ?? ''));
            $deadlineSql = null;
            if ($deadlineRaw !== '') {
                $ts = strtotime($deadlineRaw);
                if ($ts === false || $ts <= time()) {
                    Response::error('Clarification submission_deadline must be a valid future date/time.', 422);
                }
                $deadlineSql = date('Y-m-d H:i:s', $ts);
            }

            if ($table === 'verification_records') {
                $rd = $this->decodeJson($row['result_data'] ?? null, []);
                $rd['query_review_status'] = 'awaiting_customer_response';
                $this->db->execute(
                    'UPDATE verification_records
                     SET status = "query_required", additional_info_history = :aih, requested_corrections = :rc,
                         provider_remarks = :pr, clarification_deadline = :cdl,
                         reviewed_by = :rby, reviewed_at = NOW(), result_data = :rd, updated_at = NOW()
                     WHERE id = :id',
                    ['aih' => json_encode($infoHistory), 'rc' => $remarks, 'pr' => $remarks, 'cdl' => $deadlineSql, 'rby' => $reviewerLabel, 'rd' => json_encode($rd), 'id' => $recordId]
                );
            } else {
                $sf = $this->decodeJson($row['submitted_fields'] ?? null, []);
                $sf['query_review_status'] = 'awaiting_customer_response';
                $this->db->execute(
                    "UPDATE `{$table}`
                     SET status = 'query_required', submitted_fields = :sf, additional_info_history = :aih, requested_corrections = :rc,
                         provider_remarks = :pr, clarification_deadline = :cdl, reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                     WHERE id = :id",
                    ['sf' => json_encode($sf), 'aih' => json_encode($infoHistory), 'rc' => $remarks, 'pr' => $remarks, 'cdl' => $deadlineSql, 'rby' => $reviewerLabel, 'id' => $recordId]
                );
            }
            $this->appendDomainHistory($domain, $recordId, $prevStatus, 'query_required', 'admin', (string)$actor['id'], 'Further correction requested: ' . $remarks, true);
            $this->insertInternalNote($domain, $recordId, $refNum, $actor, 'clarification', 'Further clarification requested: ' . $remarks);
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
                $this->insertInternalNote($domain, $recordId, $refNum, $actor, 'clarification', 'Order rejected after clarification review: ' . $rejectReason);
            }
        }

        $this->recordAudit($actor, 'MANUAL_ORDER_CLARIFICATION_REVIEWED', ['domain' => $domain, 'record_id' => $recordId, 'decision' => $decision], $request);
        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(['order' => $fresh['dto'], 'refund' => $refundRes], 'Clarification review recorded.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/status
     * Enforces strict state-transition matrix inside a DB transaction with row lock.
     * Direct transition to `completed` MUST go through `approveCompletion`!
     */
    public function updateStatus(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.process');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $targetStatus = strtolower(trim((string)($body['status'] ?? '')));
        $submitForReview = !empty($body['submit_for_completion_review']) || $targetStatus === 'awaiting_completion_review';

        if ($targetStatus === 'completed' && !$submitForReview) {
            Response::error('Manual fulfilment orders cannot skip senior sign-off. Submit for completion review or use Approve & Complete.', 422);
        }

        $remarks = trim((string)($body['provider_remarks'] ?? $body['remarks'] ?? ''));
        $hasAdminNotesInput = is_array($body) && array_key_exists('admin_notes', $body);
        $adminNotes = $hasAdminNotesInput ? trim((string)$body['admin_notes']) : (string)($row['admin_notes'] ?? '');
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);

        if (in_array($targetStatus, ['rejected', 'failed', 'refunded'], true)) {
            if (!Auth::hasPermission($actor, 'manual_fulfilment.reject')) {
                Response::forbidden("Access denied. Missing required 'manual_fulfilment.reject' permission.");
            }
            $reasonText = $remarks !== '' ? $remarks : $adminNotes;
            if (strlen($reasonText) < 4) {
                Response::error('Please provide a clear rejection/failure reason before rejecting this order.', 422);
            }
            $triggerRefund = !array_key_exists('trigger_refund', $body) || !empty($body['trigger_refund']);
            $extraRejectCols = $hasAdminNotesInput ? ['admin_notes' => $adminNotes] : [];
            $refundRes = $this->rejectAndRefundManualOrder($domain, $row, $table, $actor, $reasonText, $triggerRefund, $extraRejectCols);
            if (!empty($refundRes['error'])) {
                Response::error((string)$refundRes['error'], (int)($refundRes['code'] ?? 422));
            }
            if (empty($refundRes['already_terminal'])) {
                $finalSt = !empty($refundRes['refunded']) ? 'refunded' : 'rejected';
                $this->appendDomainHistory($domain, $recordId, (string)$row['status'], $finalSt, 'admin', (string)$actor['id'], $reasonText, true);
                $this->insertInternalNote($domain, $recordId, $loaded['dto']['reference_number'], $actor, 'general', 'Order rejected: ' . $reasonText);
                $this->recordAudit($actor, 'MANUAL_ORDER_REJECTED', ['domain' => $domain, 'record_id' => $recordId, 'refunded' => !empty($refundRes['refunded'])], $request);
            }
            $fresh = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $fresh['dto'], 'refund' => $refundRes], !empty($refundRes['refunded']) ? 'Order rejected and refunded to customer wallet.' : 'Order marked rejected.');
        }

        if ($targetStatus === 'cancelled') {
            if (!Auth::hasPermission($actor, 'manual_fulfilment.cancel')) {
                Response::forbidden("Access denied. Missing required 'manual_fulfilment.cancel' permission.");
            }
            $cancelReason = $remarks !== '' ? $remarks : ($adminNotes !== '' ? $adminNotes : 'Cancelled by processing desk');
            if (strlen($cancelReason) < 4) {
                Response::error('Please provide a clear cancellation reason (minimum 4 characters).', 422);
            }
            $cancelRes = $this->performAdminCancellation($domain, $row, $table, $actor, $cancelReason, true);
            if (!empty($cancelRes['error'])) {
                Response::error((string)$cancelRes['error'], (int)($cancelRes['code'] ?? 422));
            }
            $fresh = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $fresh['dto'], 'refund' => $cancelRes['refund'] ?? null], 'Order cancelled.');
        }

        if ($targetStatus === 'query_required' && !Auth::hasPermission($actor, 'manual_fulfilment.query')) {
            Response::forbidden("Access denied. Missing required 'manual_fulfilment.query' permission.");
        }

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $actor,
            $reviewerLabel,
            $targetStatus,
            $submitForReview,
            $remarks,
            $adminNotes
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }

            $prevStatus = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if (in_array($prevStatus, self::TERMINAL_STATUSES, true)) {
                return ['error' => 'Terminal orders cannot be transitioned via status update.', 'code' => 422];
            }

            if ($submitForReview) {
                $verifSt = strtolower(trim((string)($lockedRow['result_verification_status'] ?? 'none')));
                if (!empty($lockedRow['result_document_id']) && $verifSt !== 'verified') {
                    return [
                        'error' => 'Attached official result PDF must pass independent result verification (verified) before senior completion sign-off.',
                        'code' => 422,
                    ];
                }
                $nextSt = in_array($prevStatus, ['pending', 'under_review', 'assigned'], true) ? 'processing' : $prevStatus;
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
                $this->appendDomainHistory($domain, $recordId, $prevStatus, $nextSt, 'admin', (string)$actor['id'], 'Submitted for senior completion sign-off' . ($remarks ? ": {$remarks}" : ''), false);
                return ['mode' => 'submit_review', 'prev' => $prevStatus, 'next' => $nextSt];
            }

            $allowedIntermediate = ['pending', 'under_review', 'assigned', 'processing', 'query_required'];
            if (!in_array($targetStatus, $allowedIntermediate, true)) {
                return ['error' => 'Unsupported target status for manual order.', 'code' => 422];
            }
            if ($targetStatus !== $prevStatus) {
                $allowedNext = self::ALLOWED_TRANSITIONS[$prevStatus] ?? [];
                if (!in_array($targetStatus, $allowedNext, true)) {
                    return ['error' => "Invalid workflow status transition from '{$prevStatus}' to '{$targetStatus}'.", 'code' => 422];
                }
            }

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

            return ['mode' => 'transition', 'prev' => $prevStatus, 'next' => $targetStatus];
        });

        if (!empty($txResult['error'])) {
            Response::error((string)$txResult['error'], (int)($txResult['code'] ?? 422));
        }

        if ($txResult['mode'] === 'submit_review') {
            $this->recordAudit($actor, 'MANUAL_ORDER_SUBMITTED_FOR_REVIEW', ['domain' => $domain, 'record_id' => $recordId], $request);
            $fresh = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $fresh['dto']], 'Order queued for senior completion sign-off.');
        }

        $prevStatus = (string)$txResult['prev'];
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
     * Uploads official PDF result and enters result_verification_status = 'pending_verification' (maker-checker).
     */
    public function uploadResultDocument(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.upload_result');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower(trim((string)($row['status'] ?? 'pending')));

        if (in_array($prevStatus, self::TERMINAL_STATUSES, true)) {
            Response::error('Cannot upload result documents for completed, rejected, refunded, or cancelled orders.', 422);
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

        $this->db->execute(
            "UPDATE `{$table}`
             SET status = :st,
                 awaiting_admin_review = 0,
                 result_verification_status = 'pending_verification',
                 result_verified_by = NULL,
                 result_verified_at = NULL,
                 result_verification_notes = NULL,
                 provider_remarks = COALESCE(NULLIF(:pr, ''), provider_remarks),
                 reviewed_by = :rby,
                 reviewed_at = NOW(),
                 updated_at = NOW()
             WHERE id = :id",
            [
                'st' => $nextStatus,
                'pr' => $remarks,
                'rby' => $reviewerLabel,
                'id' => $recordId,
            ]
        );

        $refNum = $loaded['dto']['reference_number'];
        $this->appendDomainHistory(
            $domain,
            $recordId,
            $prevStatus,
            $nextStatus,
            'admin',
            (string)$actor['id'],
            'Official result PDF uploaded and queued for independent verification' . ($remarks ? ": {$remarks}" : ''),
            false
        );
        $this->insertInternalNote(
            $domain,
            $recordId,
            $refNum,
            $actor,
            'verification',
            "Result PDF uploaded ({$doc['original_name']}) and placed in awaiting_result_verification." . ($remarks ? " Note: {$remarks}" : '')
        );

        $this->recordAudit($actor, 'MANUAL_ORDER_RESULT_UPLOADED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'document_id' => $doc['id'],
            'result_verification_status' => 'pending_verification',
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success([
            'order' => $fresh['dto'],
            'document' => $doc,
        ], 'Official PDF uploaded and queued for independent result verification.');
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/verify-result
     * Independent checker step (maker-checker): verifies or rejects uploaded result document before completion approval.
     */
    public function verifyResult(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.verify_result');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $decisionRaw = strtolower(trim((string)($body['decision'] ?? $body['status'] ?? '')));
        $decision = match ($decisionRaw) {
            'approve', 'approved', 'verify', 'verified' => 'verified',
            'reject', 'rejected', 'decline', 'declined' => 'rejected',
            default => '',
        };
        if ($decision === '') {
            Response::error('Invalid result verification decision. Expected verify/approve or reject.', 422);
        }
        $notes = trim((string)($body['notes'] ?? $body['verification_notes'] ?? $body['remarks'] ?? ''));
        if ($decision === 'rejected' && strlen($notes) < 4) {
            Response::error('Please provide clear rejection notes explaining what must be corrected (minimum 4 characters).', 422);
        }

        $loaded = $this->loadManualOrder($domain, $id, false);
        $this->assertOrderAccess($actor, $loaded['row']);
        $table = $loaded['table'];
        $recordId = (string)$loaded['row']['id'];
        $actorId = (string)$actor['id'];
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actorId);
        $isSuperAdmin = strtolower((string)($actor['role'] ?? '')) === 'superadmin';

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $actorId,
            $reviewerLabel,
            $isSuperAdmin,
            $decision,
            $notes
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }
            $curStatus = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if (in_array($curStatus, self::TERMINAL_STATUSES, true)) {
                return ['error' => 'Result verification cannot run on terminal orders.', 'code' => 422];
            }

            $docId = trim((string)($lockedRow['result_document_id'] ?? ''));
            $hasPayload = ($domain === 'verification' && !empty($lockedRow['result_data']) && strlen((string)$lockedRow['result_data']) > 10);
            if ($docId === '' && !$hasPayload) {
                return ['error' => 'No result document or verification payload has been uploaded yet.', 'code' => 422];
            }

            $uploaderId = $this->resolveResultUploaderId($docId, $lockedRow);
            if ($uploaderId !== '' && $uploaderId === $actorId && !$isSuperAdmin) {
                return [
                    'error' => 'Maker-checker control: the staff member who uploaded this result cannot verify their own upload.',
                    'code' => 403,
                ];
            }

            $awaitingCompletion = ($decision === 'verified') ? 1 : 0;
            $this->db->execute(
                "UPDATE `{$table}`
                 SET result_verification_status = :rvs,
                     result_verified_by = :rvb,
                     result_verified_at = NOW(),
                     result_verification_notes = :rvn,
                     awaiting_admin_review = :aar,
                     updated_at = NOW()
                 WHERE id = :id",
                [
                    'rvs' => $decision,
                    'rvb' => $actorId,
                    'rvn' => $notes !== '' ? $notes : ($decision === 'verified' ? "Verified by {$reviewerLabel}" : 'Rejected during verification'),
                    'aar' => $awaitingCompletion,
                    'id' => $recordId,
                ]
            );

            $this->appendDomainHistory(
                $domain,
                $recordId,
                $curStatus,
                $curStatus,
                'admin',
                $actorId,
                $decision === 'verified'
                    ? 'Result verified and staged for senior completion approval' . ($notes !== '' ? ": {$notes}" : '')
                    : "Result verification rejected: {$notes}",
                false
            );

            return [
                'decision' => $decision,
                'uploader_id' => $uploaderId,
                'assigned_to' => $lockedRow['assigned_to'] ?? $lockedRow['claimed_by'] ?? null,
            ];
        });

        if (!empty($txResult['error'])) {
            Response::error((string)$txResult['error'], (int)($txResult['code'] ?? 422));
        }

        $refNum = $loaded['dto']['reference_number'];
        $this->insertInternalNote(
            $domain,
            $recordId,
            $refNum,
            $actor,
            'verification',
            $decision === 'verified'
                ? 'Result independently verified and ready for senior completion approval.' . ($notes ? " Notes: {$notes}" : '')
                : "Result verification rejected: {$notes}"
        );

        if ($decision === 'rejected') {
            $notifyTarget = (string)($txResult['uploader_id'] ?: ($txResult['assigned_to'] ?? ''));
            if ($notifyTarget !== '' && $notifyTarget !== $actorId) {
                $this->notifyStaffUser(
                    $notifyTarget,
                    "Result Verification Rejected: {$refNum}",
                    "{$reviewerLabel} rejected the uploaded result for {$refNum}: {$notes}. Please review and upload a corrected result PDF.",
                    '#manual-fulfilment'
                );
            }
        }

        $this->recordAudit($actor, $decision === 'verified' ? 'MANUAL_ORDER_RESULT_VERIFIED' : 'MANUAL_ORDER_RESULT_REJECTED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'notes' => $notes ?: null,
        ], $request);

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(
            ['order' => $fresh['dto']],
            $decision === 'verified'
                ? 'Result verified and forwarded for senior completion approval.'
                : 'Result rejected and returned to operator for correction.'
        );
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/approve-completion
     * Dual-control final sign-off endpoint (requires manual_fulfilment.approve + senior role).
     */
    public function approveCompletion(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.approve');
        if (!$this->canApproveCompletion($actor)) {
            Response::forbidden('Senior manager, admin, or superadmin authority is required to approve manual fulfilment completion.');
        }

        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $table = $loaded['table'];
        $recordId = (string)$row['id'];
        $prevStatus = strtolower(trim((string)($row['status'] ?? 'pending')));

        if (in_array($prevStatus, ['refunded', 'rejected', 'failed', 'cancelled'], true)) {
            Response::error('Rejected, cancelled, or refunded orders cannot be approved for completion.', 422);
        }
        if ($prevStatus === 'completed' && empty($row['awaiting_admin_review'])) {
            $freshAlready = $this->loadManualOrder($domain, $recordId, true);
            Response::success(['order' => $freshAlready['dto']], 'Order is already approved and completed.');
        }

        $verificationNote = trim((string)($body['verification_note'] ?? $body['provider_remarks'] ?? $body['remarks'] ?? ''));
        $trackingId = trim((string)($body['tracking_id'] ?? $body['provider_tracking_id'] ?? ''));
        $reviewerLabel = (string)($actor['full_name'] ?: $actor['email'] ?: $actor['id']);
        $actorId = (string)$actor['id'];
        $isSuperAdmin = strtolower((string)($actor['role'] ?? '')) === 'superadmin';

        $txResult = $this->db->withTransaction(function () use (
            $domain,
            $table,
            $recordId,
            $verificationNote,
            $trackingId,
            $reviewerLabel,
            $actorId,
            $isSuperAdmin
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }

            $curStatus = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if (in_array($curStatus, ['refunded', 'rejected', 'failed', 'cancelled'], true)) {
                return ['error' => 'Rejected, cancelled, or refunded orders cannot be approved for completion.', 'code' => 422];
            }
            if ($curStatus === 'completed' && empty($lockedRow['awaiting_admin_review'])) {
                return ['already_completed' => true, 'row' => $lockedRow, 'prev_status' => $curStatus];
            }

            $docId = trim((string)($lockedRow['result_document_id'] ?? ''));
            $hasDoc = $docId !== '';
            $hasVerificationPayload = $domain === 'verification'
                && !empty($lockedRow['result_data'])
                && strlen((string)$lockedRow['result_data']) > 10;

            if (!$hasDoc && !$hasVerificationPayload && strlen($verificationNote) < 5) {
                return [
                    'error' => 'Completion proof required: upload an official PDF result document first or enter a detailed verification note (minimum 5 characters).',
                    'code' => 422,
                ];
            }

            if ($hasDoc) {
                $rvs = strtolower(trim((string)($lockedRow['result_verification_status'] ?? 'none')));
                if ($rvs !== 'verified') {
                    return [
                        'error' => 'Result verification required: the uploaded official PDF must pass independent verification before completion approval.',
                        'code' => 422,
                    ];
                }
                $uploaderId = $this->resolveResultUploaderId($docId, $lockedRow);
                if ($uploaderId !== '' && $uploaderId === $actorId && !$isSuperAdmin) {
                    return [
                        'error' => 'Maker-checker control: the staff member who uploaded the result document cannot issue final completion approval.',
                        'code' => 403,
                    ];
                }
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
                         reviewed_by = :rby,
                         reviewed_at = NOW(),
                         completed_at = COALESCE(completed_at, NOW()),
                         updated_at = NOW()
                     WHERE id = :id',
                    ['cab' => $actorId, 'pr' => $verificationNote, 'rby' => $reviewerLabel, 'id' => $recordId]
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

        $this->insertInternalNote(
            $domain,
            $recordId,
            $refNum,
            $actor,
            'supervision',
            'Final completion approved.' . ($verificationNote !== '' ? " Note: {$verificationNote}" : '')
        );

        $this->notifyCustomer(
            (string)$row['user_id'],
            "{$serviceName} Completed",
            "Great news! Your {$serviceName} order ({$refNum}) has been completed." . ($hasDoc ? ' Your official PDF result is now ready to preview and download.' : ($verificationNote !== '' ? " Details: {$verificationNote}" : '')),
            'success',
            $refNum,
            ['reference_number' => $refNum, 'domain' => $domain, 'status' => 'completed']
        );
        $this->sendCustomerEmail(
            (string)$row['user_id'],
            "Completed: {$serviceName} ({$refNum})",
            "Your Request Has Been Completed",
            "Your <strong>" . htmlspecialchars($serviceName, ENT_QUOTES, 'UTF-8') . "</strong> order (<strong>" . htmlspecialchars($refNum, ENT_QUOTES, 'UTF-8') . "</strong>) is now complete."
                . ($hasDoc ? ' Log in to your portal to preview and download your official PDF result.' : ''),
            [
                'Reference' => $refNum,
                'Service' => $serviceName,
                'Status' => 'Completed',
                'Official PDF Attached' => $hasDoc ? 'Yes' : 'No',
            ]
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
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/reject
     * Dedicated rejection + idempotent atomic refund endpoint.
     */
    public function rejectOrder(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.reject');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $reason = trim((string)($body['reason'] ?? $body['remarks'] ?? $body['provider_remarks'] ?? ''));
        if (strlen($reason) < 4) {
            Response::error('Please provide a clear rejection reason (minimum 4 characters).', 422);
        }
        $triggerRefund = !array_key_exists('trigger_refund', $body) || !empty($body['trigger_refund']);
        $extra = [];
        if (array_key_exists('admin_notes', $body)) {
            $extra['admin_notes'] = trim((string)$body['admin_notes']);
        }

        $recordId = (string)$row['id'];
        $prevStatus = strtolower((string)($row['status'] ?? 'pending'));
        $refundRes = $this->rejectAndRefundManualOrder($domain, $row, $loaded['table'], $actor, $reason, $triggerRefund, $extra);
        if (!empty($refundRes['error'])) {
            Response::error((string)$refundRes['error'], (int)($refundRes['code'] ?? 422));
        }

        if (empty($refundRes['already_terminal'])) {
            $finalSt = !empty($refundRes['refunded']) ? 'refunded' : 'rejected';
            $this->appendDomainHistory($domain, $recordId, $prevStatus, $finalSt, 'admin', (string)$actor['id'], $reason, true);
            $this->insertInternalNote($domain, $recordId, $loaded['dto']['reference_number'], $actor, 'general', "Order rejected ({$finalSt}): {$reason}");
            $this->recordAudit($actor, 'MANUAL_ORDER_REJECTED', [
                'domain' => $domain,
                'record_id' => $recordId,
                'refunded' => !empty($refundRes['refunded']),
                'reason' => $reason,
            ], $request);
        }

        $fresh = $this->loadManualOrder($domain, $recordId, true);
        Response::success(
            ['order' => $fresh['dto'], 'refund' => $refundRes],
            !empty($refundRes['refunded']) ? 'Order rejected and refunded to customer wallet.' : 'Order marked rejected.'
        );
    }

    /**
     * POST /api/admin/manual-fulfilment/orders/:domain/:id/cancel
     * Staff/admin cancellation with atomic refund safeguard.
     */
    public function cancelOrderAdmin(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.cancel');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        $loaded = $this->loadManualOrder($domain, $id, false);
        $row = $loaded['row'];
        $this->assertOrderAccess($actor, $row);
        $this->assertMutatorAllowed($actor, $row);

        $reason = trim((string)($body['reason'] ?? $body['cancellation_reason'] ?? $body['remarks'] ?? ''));
        if (strlen($reason) < 4) {
            Response::error('Please provide a clear cancellation reason (minimum 4 characters).', 422);
        }
        $triggerRefund = !array_key_exists('trigger_refund', $body) || !empty($body['trigger_refund']);

        $cancelRes = $this->performAdminCancellation($domain, $row, $loaded['table'], $actor, $reason, $triggerRefund);
        if (!empty($cancelRes['error'])) {
            Response::error((string)$cancelRes['error'], (int)($cancelRes['code'] ?? 422));
        }

        $fresh = $this->loadManualOrder($domain, (string)$row['id'], true);
        Response::success(
            ['order' => $fresh['dto'], 'refund' => $cancelRes['refund'] ?? null],
            !empty($cancelRes['refund']['refunded']) ? 'Order cancelled and refunded to customer wallet.' : 'Order cancelled.'
        );
    }

    /**
     * POST /api/manual-orders/:domain/:id/cancel
     * Customer-initiated cancellation — strictly allowed ONLY while pending AND unassigned.
     */
    public function cancelOrderCustomer(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $user = Auth::requireAuth($request);
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();

        if (!in_array($domain, self::VALID_DOMAINS, true)) {
            Response::error('Invalid service order domain.', 422);
        }

        $table = $this->tableForDomain($domain);
        $numCol = match ($domain) {
            'enrolment' => 'order_number',
            'verification' => 'reference',
            default => 'request_number',
        };
        $reason = trim((string)($body['reason'] ?? 'Cancelled by customer before processing started'));
        if ($reason === '') {
            $reason = 'Cancelled by customer before processing started';
        }
        $userId = (string)$user['id'];

        $txOutcome = $this->db->withTransaction(function () use ($domain, $table, $numCol, $id, $userId, $reason): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE (id = :id1 OR `{$numCol}` = :id2) LIMIT 1 FOR UPDATE",
                ['id1' => $id, 'id2' => $id]
            );
            if (!$lockedRow || (string)($lockedRow['user_id'] ?? '') !== $userId) {
                return ['error' => 'Service order not found.', 'code' => 404];
            }
            if (!FulfilmentRouterService::isInternalManualOrder($lockedRow)) {
                return ['error' => 'Only manual-processing orders can be cancelled through this endpoint.', 'code' => 422];
            }

            $curStatus = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if ($curStatus === 'cancelled') {
                return [
                    'already_cancelled' => true,
                    'row' => $lockedRow,
                    'refund_reference' => $lockedRow['refund_reference'] ?? null,
                ];
            }
            if ($curStatus !== 'pending') {
                return [
                    'error' => 'This order can no longer be cancelled because processing has already started.',
                    'code' => 409,
                ];
            }
            if (!empty($lockedRow['assigned_to']) || !empty($lockedRow['claimed_by'])) {
                return [
                    'error' => 'This order has already been assigned to a processing officer and cannot be self-cancelled.',
                    'code' => 409,
                ];
            }

            $recordId = (string)$lockedRow['id'];
            $refNum = (string)($lockedRow[$numCol] ?? $recordId);
            $paymentRef = (string)($lockedRow['payment_reference'] ?? $lockedRow['reference'] ?? $refNum);
            $amount = (float)($lockedRow['customer_price'] ?? $lockedRow['cost'] ?? 0);
            $isRefundable = !array_key_exists('is_refundable', $lockedRow) || !empty($lockedRow['is_refundable']);

            $refundRef = trim((string)($lockedRow['refund_reference'] ?? ''));
            $canonicalRefundRef = 'REFUND_' . $paymentRef;
            $existingRefundTx = $this->db->fetchOne(
                'SELECT reference, balance_after FROM transactions WHERE user_id = :uid AND reference IN (:r1, :r2) AND status = "successful" LIMIT 1 FOR UPDATE',
                ['uid' => $userId, 'r1' => $canonicalRefundRef, 'r2' => 'MREF_' . $refNum]
            );
            if ($existingRefundTx) {
                $refundRef = (string)$existingRefundTx['reference'];
            }

            $refunded = $refundRef !== '';
            $balanceAfter = $existingRefundTx ? (float)$existingRefundTx['balance_after'] : null;

            if (!$refunded && $isRefundable && $amount > 0) {
                $refundRef = $canonicalRefundRef;
                $res = $this->walletService->attemptConfirmedRefund(
                    $userId,
                    $amount,
                    'refund',
                    $refundRef,
                    "Customer cancellation refund for {$refNum}",
                    ['domain' => $domain, 'record_id' => $recordId, 'cancelled_by' => 'customer']
                );
                $refunded = !empty($res['confirmed']);
                $balanceAfter = $res['balance_after'] ?? null;
                if (!$refunded) {
                    $refundRef = '';
                }
            }

            $this->db->execute(
                "UPDATE `{$table}`
                 SET status = 'cancelled',
                     awaiting_admin_review = 0,
                     cancelled_at = NOW(),
                     cancelled_by = :cby,
                     cancellation_reason = :creason,
                     refund_reference = CASE WHEN :rr <> '' THEN :rr2 ELSE refund_reference END,
                     refunded_at = CASE WHEN :rf = 1 AND refunded_at IS NULL THEN NOW() ELSE refunded_at END,
                     updated_at = NOW()
                 WHERE id = :id AND status = 'pending'",
                [
                    'cby' => $userId,
                    'creason' => $reason,
                    'rr' => $refunded ? $refundRef : '',
                    'rr2' => $refunded ? $refundRef : '',
                    'rf' => $refunded ? 1 : 0,
                    'id' => $recordId,
                ]
            );

            $this->appendDomainHistory($domain, $recordId, $curStatus, 'cancelled', 'customer', $userId, 'Cancelled by customer: ' . $reason, true);

            return [
                'already_cancelled' => false,
                'row' => $lockedRow,
                'record_id' => $recordId,
                'ref_num' => $refNum,
                'payment_ref' => $paymentRef,
                'amount' => $amount,
                'refunded' => $refunded,
                'refund_reference' => $refunded ? $refundRef : null,
                'balance_after' => $balanceAfter,
            ];
        });

        if (!empty($txOutcome['error'])) {
            Response::error((string)$txOutcome['error'], (int)($txOutcome['code'] ?? 422));
        }

        if (!empty($txOutcome['already_cancelled'])) {
            Response::success([
                'status' => 'cancelled',
                'refund_reference' => $txOutcome['refund_reference'],
            ], 'Order is already cancelled.');
        }

        $refNum = (string)$txOutcome['ref_num'];
        if (!empty($txOutcome['refunded'])) {
            try {
                (new ReferralEngineService($this->db))->reverseRewardsForSource(
                    (string)$txOutcome['payment_ref'],
                    'Customer cancelled manual order: ' . $reason,
                    $userId
                );
            } catch (Throwable) {
            }
        }

        $svcName = (string)($txOutcome['row']['service_name'] ?? $txOutcome['row']['service_key'] ?? 'Service');
        $this->notifyCustomer(
            $userId,
            "{$svcName} Cancelled",
            "Your {$svcName} order ({$refNum}) has been cancelled." . (!empty($txOutcome['refunded']) ? ' ₦' . number_format((float)$txOutcome['amount'], 2) . ' has been refunded to your wallet.' : ''),
            'info',
            $refNum
        );
        FootprintService::record([
            'user_id' => $userId,
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'services',
            'action' => 'CUSTOMER_MANUAL_ORDER_CANCELLED',
            'service_type' => (string)($txOutcome['row']['service_key'] ?? $domain),
            'reference' => $refNum,
            'provider' => 'hambak_manual',
            'status' => 'cancelled',
            'amount' => (float)$txOutcome['amount'],
        ]);

        Response::success([
            'status' => 'cancelled',
            'reference_number' => $refNum,
            'refunded' => !empty($txOutcome['refunded']),
            'refund_reference' => $txOutcome['refund_reference'],
            'balance_after' => $txOutcome['balance_after'],
        ], !empty($txOutcome['refunded']) ? 'Order cancelled and refunded to your wallet.' : 'Order cancelled.');
    }

    /**
     * GET /api/admin/manual-fulfilment/orders/:domain/:id/history
     */
    public function orderHistory(Request $request, array $params): void
    {
        $this->ensureManualSchema();
        $actor = Auth::requirePermission($request, 'manual_fulfilment.view');
        $domain = strtolower(trim((string)($params['domain'] ?? '')));
        $id = trim((string)($params['id'] ?? ''));

        $loaded = $this->loadManualOrder($domain, $id, false);
        $this->assertOrderAccess($actor, $loaded['row']);
        $dto = $this->formatUnifiedOrder($domain, $loaded['row'], true);

        Response::success([
            'history' => $dto['status_history'] ?? [],
            'additional_info_history' => $dto['additional_info_history'] ?? [],
            'assignment_history' => $dto['assignment_history'] ?? [],
        ]);
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    private function canApproveCompletion(array $actor): bool
    {
        return in_array(strtolower(trim((string)($actor['role'] ?? ''))), self::SENIOR_APPROVAL_ROLES, true)
            && Auth::hasPermission($actor, 'manual_fulfilment.approve');
    }

    private function assertOrderAccess(array $actor, array $row): void
    {
        if (!Auth::canAccessManualRecord($actor, $row)) {
            Response::forbidden('Access denied. This manual application is not assigned to you.');
        }
    }

    private function assertMutatorAllowed(array $actor, array $row): void
    {
        if (Auth::isManualFulfilmentSupervisor($actor)) {
            return;
        }
        $uid = (string)($actor['id'] ?? '');
        $assignedTo = trim((string)($row['assigned_to'] ?? ''));
        $claimedBy = trim((string)($row['claimed_by'] ?? ''));
        if (($assignedTo !== '' || $claimedBy !== '') && $assignedTo !== $uid && $claimedBy !== $uid) {
            Response::forbidden('This order is assigned to another staff member. Only the assigned operator or a supervisor can perform this action.');
        }
    }

    private function resolveResultUploaderId(string $docId, array $lockedRow): string
    {
        if ($docId !== '') {
            try {
                $docRow = $this->db->fetchOne(
                    'SELECT uploaded_by FROM identity_result_documents WHERE id = :id LIMIT 1',
                    ['id' => $docId]
                );
                if ($docRow && !empty($docRow['uploaded_by'])) {
                    return trim((string)$docRow['uploaded_by']);
                }
            } catch (Throwable) {
            }
        }
        return '';
    }

    private function fetchAllManualOrders(array $actor): array
    {
        $items = [];

        // 1. modification_requests (NIN, BVN, ADDITIONAL)
        try {
            $mrRows = $this->db->fetchAll(
                'SELECT mr.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name,
                        uab.full_name AS assigned_by_name, urv.full_name AS result_verified_by_name
                 FROM modification_requests mr
                 LEFT JOIN users u ON u.id = mr.user_id
                 LEFT JOIN users uc ON uc.id = mr.claimed_by
                 LEFT JOIN users uap ON uap.id = mr.completion_approved_by
                 LEFT JOIN users uab ON uab.id = mr.assigned_by
                 LEFT JOIN users urv ON urv.id = mr.result_verified_by
                 WHERE mr.fulfilment_mode = "internal_manual"
                    OR mr.provider_id = "hambak_manual"
                 ORDER BY mr.created_at DESC
                 LIMIT 400'
            );
            foreach ($mrRows as $r) {
                if (!Auth::canAccessManualRecord($actor, $r)) {
                    continue;
                }
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
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name,
                        uab.full_name AS assigned_by_name, urv.full_name AS result_verified_by_name
                 FROM enrolment_orders eo
                 LEFT JOIN users u ON u.id = eo.user_id
                 LEFT JOIN users uc ON uc.id = eo.claimed_by
                 LEFT JOIN users uap ON uap.id = eo.completion_approved_by
                 LEFT JOIN users uab ON uab.id = eo.assigned_by
                 LEFT JOIN users urv ON urv.id = eo.result_verified_by
                 WHERE eo.fulfilment_mode = "internal_manual"
                    OR eo.provider_id = "hambak_manual"
                 ORDER BY eo.created_at DESC
                 LIMIT 250'
            );
            foreach ($eoRows as $r) {
                if (!Auth::canAccessManualRecord($actor, $r)) {
                    continue;
                }
                $items[] = $this->formatUnifiedOrder('enrolment', $r, false);
            }
        } catch (Throwable) {
        }

        // 3. verification_records (note: uses `provider` column)
        try {
            $vrRows = $this->db->fetchAll(
                'SELECT vr.*, sc.name AS service_name, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name,
                        uab.full_name AS assigned_by_name, urv.full_name AS result_verified_by_name
                 FROM verification_records vr
                 LEFT JOIN service_catalogue sc ON sc.service_key = vr.service_key
                 LEFT JOIN users u ON u.id = vr.user_id
                 LEFT JOIN users uc ON uc.id = vr.claimed_by
                 LEFT JOIN users uap ON uap.id = vr.completion_approved_by
                 LEFT JOIN users uab ON uab.id = vr.assigned_by
                 LEFT JOIN users urv ON urv.id = vr.result_verified_by
                 WHERE vr.fulfilment_mode = "internal_manual"
                    OR vr.provider = "hambak_manual"
                 ORDER BY vr.created_at DESC
                 LIMIT 250'
            );
            foreach ($vrRows as $r) {
                if (!Auth::canAccessManualRecord($actor, $r)) {
                    continue;
                }
                $items[] = $this->formatUnifiedOrder('verification', $r, false);
            }
        } catch (Throwable) {
        }

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
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name,
                        uab.full_name AS assigned_by_name, urv.full_name AS result_verified_by_name
                 FROM enrolment_orders eo
                 LEFT JOIN users u ON u.id = eo.user_id
                 LEFT JOIN users uc ON uc.id = eo.claimed_by
                 LEFT JOIN users uap ON uap.id = eo.completion_approved_by
                 LEFT JOIN users uab ON uab.id = eo.assigned_by
                 LEFT JOIN users urv ON urv.id = eo.result_verified_by
                 WHERE eo.id = :id1 OR eo.order_number = :id2
                 LIMIT 1',
                ['id1' => $id, 'id2' => $id]
            );
        } elseif ($domain === 'verification') {
            $row = $this->db->fetchOne(
                'SELECT vr.*, sc.name AS service_name, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name,
                        uab.full_name AS assigned_by_name, urv.full_name AS result_verified_by_name
                 FROM verification_records vr
                 LEFT JOIN service_catalogue sc ON sc.service_key = vr.service_key
                 LEFT JOIN users u ON u.id = vr.user_id
                 LEFT JOIN users uc ON uc.id = vr.claimed_by
                 LEFT JOIN users uap ON uap.id = vr.completion_approved_by
                 LEFT JOIN users uab ON uab.id = vr.assigned_by
                 LEFT JOIN users urv ON urv.id = vr.result_verified_by
                 WHERE vr.id = :id1 OR vr.reference = :id2
                 LIMIT 1',
                ['id1' => $id, 'id2' => $id]
            );
        } else {
            $row = $this->db->fetchOne(
                'SELECT mr.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                        uc.full_name AS claimed_by_name, uap.full_name AS completion_approved_by_name,
                        uab.full_name AS assigned_by_name, urv.full_name AS result_verified_by_name
                 FROM modification_requests mr
                 LEFT JOIN users u ON u.id = mr.user_id
                 LEFT JOIN users uc ON uc.id = mr.claimed_by
                 LEFT JOIN users uap ON uap.id = mr.completion_approved_by
                 LEFT JOIN users uab ON uab.id = mr.assigned_by
                 LEFT JOIN users urv ON urv.id = mr.result_verified_by
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
        $isTerminal = in_array($status, self::TERMINAL_STATUSES, true);
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
        $docs = $this->decodeJson($row['supporting_documents'] ?? null, []);
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
        $internalNotes = $withDetails ? $this->fetchInternalNotes($domain, (string)$row['id']) : [];
        $assignmentHistory = $withDetails ? $this->fetchAssignmentHistory($domain, (string)$row['id']) : [];

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
            'assigned_by' => $row['assigned_by'] ?? null,
            'assigned_by_name' => $row['assigned_by_name'] ?? null,
            'assigned_to' => $row['assigned_to'] ?? ($row['claimed_by'] ?? null),
            'assigned_staff_name' => $row['assigned_staff_name'] ?? ($row['claimed_by_name'] ?? null),
            'assigned_at' => $row['assigned_at'] ?? null,
            'assignment_accepted_at' => $row['assignment_accepted_at'] ?? null,
            'awaiting_admin_review' => !empty($row['awaiting_admin_review']),
            'result_verification_status' => strtolower((string)($row['result_verification_status'] ?? 'none')),
            'result_verified_by' => $row['result_verified_by'] ?? null,
            'result_verified_by_name' => $row['result_verified_by_name'] ?? null,
            'result_verified_at' => $row['result_verified_at'] ?? null,
            'result_verification_notes' => $row['result_verification_notes'] ?? null,
            'completion_approved_by' => $row['completion_approved_by'] ?? null,
            'completion_approved_by_name' => $row['completion_approved_by_name'] ?? null,
            'completion_approved_at' => $row['completion_approved_at'] ?? null,
            'requested_corrections' => $row['requested_corrections'] ?? null,
            'clarification_deadline' => $row['clarification_deadline'] ?? null,
            'clarification_request' => $fields['clarification_request'] ?? null,
            'query_review_status' => $fields['query_review_status'] ?? null,
            'provider_remarks' => $row['provider_remarks'] ?? null,
            'admin_notes' => $row['admin_notes'] ?? null,
            'cancelled_at' => $row['cancelled_at'] ?? null,
            'cancelled_by' => $row['cancelled_by'] ?? null,
            'cancellation_reason' => $row['cancellation_reason'] ?? null,
            'submitted_fields' => $withDetails ? $fields : [],
            'supporting_documents' => $docs,
            'document_review_checklist' => is_array($checklist) ? $checklist : [],
            'additional_info_history' => $infoHistory,
            'status_history' => $statusHistory,
            'internal_notes' => $internalNotes,
            'assignment_history' => $assignmentHistory,
            'routing_snapshot' => $withDetails ? FulfilmentRouterService::extractOrderRoutingSnapshot($row) : null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'completed_at' => $row['completed_at'] ?? null,
        ], $resultMeta);
    }

    private function matchesQueue(array $item, string $queue, string $actorId): bool
    {
        $st = (string)$item['status'];
        $verifSt = strtolower((string)($item['result_verification_status'] ?? 'none'));
        $isTerminal = in_array($st, self::TERMINAL_STATUSES, true);
        $hasAssignee = !empty($item['assigned_to']) || !empty($item['claimed_by']);
        $isMine = ((string)($item['assigned_to'] ?? '') === $actorId) || ((string)($item['claimed_by'] ?? '') === $actorId);

        $docs = is_array($item['supporting_documents'] ?? null) ? $item['supporting_documents'] : [];
        $chk = is_array($item['document_review_checklist'] ?? null) ? $item['document_review_checklist'] : [];
        $hasPendingDocReview = false;
        if (!empty($docs)) {
            $verifiedCount = 0;
            foreach ($chk as $entry) {
                if (is_array($entry) && strtolower((string)($entry['status'] ?? '')) === 'verified') {
                    $verifiedCount++;
                }
            }
            if ($verifiedCount < count($docs)) {
                $hasPendingDocReview = true;
            }
        }

        return match ($queue) {
            'unassigned', 'unclaimed' => !$hasAssignee && !$isTerminal,
            'assigned' => $hasAssignee && !$isTerminal,
            'my_claimed' => $isMine && !$isTerminal,
            'awaiting_document_review' => !$isTerminal
                && empty($item['awaiting_admin_review'])
                && $verifSt !== 'pending_verification'
                && in_array($st, ['pending', 'under_review', 'assigned'], true)
                && ($st === 'under_review' || $hasPendingDocReview),
            'processing', 'in_progress' => in_array($st, ['under_review', 'assigned', 'processing'], true)
                && empty($item['awaiting_admin_review'])
                && $verifSt !== 'pending_verification',
            'awaiting_clarification', 'awaiting_customer_info' => $st === 'query_required',
            'awaiting_result_verification' => !$isTerminal && $verifSt === 'pending_verification',
            'awaiting_completion_review', 'awaiting_completion_approval' => !$isTerminal
                && (!empty($item['awaiting_admin_review']) || $st === 'awaiting_completion_review' || $verifSt === 'verified'),
            'sla_breached' => !empty($item['sla_breached']),
            'completed' => $st === 'completed',
            'rejected', 'rejected_refunded' => in_array($st, ['rejected', 'refunded', 'failed'], true),
            'cancelled' => $st === 'cancelled',
            default => true,
        };
    }

    private function performAdminCancellation(
        string $domain,
        array $row,
        string $table,
        array $actor,
        string $reason,
        bool $triggerRefund = true
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
            $triggerRefund
        ): array {
            $lockedRow = $this->db->fetchOne(
                "SELECT * FROM `{$table}` WHERE id = :id LIMIT 1 FOR UPDATE",
                ['id' => $recordId]
            );
            if (!$lockedRow) {
                return ['error' => 'Manual fulfilment order not found.', 'code' => 404];
            }

            $curStatus = strtolower(trim((string)($lockedRow['status'] ?? 'pending')));
            if ($curStatus === 'cancelled') {
                return ['already_cancelled' => true, 'refunded' => !empty($lockedRow['refund_reference']), 'refund_reference' => $lockedRow['refund_reference'] ?? null];
            }
            if (in_array($curStatus, ['completed', 'refunded', 'rejected', 'failed'], true)) {
                return ['error' => 'Completed, rejected, or refunded orders cannot be cancelled.', 'code' => 422];
            }

            $refNum = (string)($lockedRow['request_number'] ?? $lockedRow['order_number'] ?? $lockedRow['reference'] ?? $recordId);
            $paymentRef = (string)($lockedRow['payment_reference'] ?? $lockedRow['reference'] ?? $refNum);
            $amount = (float)($lockedRow['customer_price'] ?? $lockedRow['cost'] ?? 0);
            $isRefundable = !array_key_exists('is_refundable', $lockedRow) || !empty($lockedRow['is_refundable']);

            $refundRef = trim((string)($lockedRow['refund_reference'] ?? ''));
            $canonicalRefundRef = 'REFUND_' . $paymentRef;
            $existingRefundTx = $this->db->fetchOne(
                'SELECT reference, balance_after FROM transactions WHERE user_id = :uid AND reference IN (:r1, :r2) AND status = "successful" LIMIT 1 FOR UPDATE',
                ['uid' => (string)$lockedRow['user_id'], 'r1' => $canonicalRefundRef, 'r2' => 'MREF_' . $refNum]
            );
            if ($existingRefundTx) {
                $refundRef = (string)$existingRefundTx['reference'];
            }

            $refunded = $refundRef !== '';
            $balanceAfter = $existingRefundTx ? (float)$existingRefundTx['balance_after'] : null;

            if (!$refunded && $triggerRefund && $isRefundable && $amount > 0) {
                $refundRef = $canonicalRefundRef;
                $res = $this->walletService->attemptConfirmedRefund(
                    (string)$lockedRow['user_id'],
                    $amount,
                    'refund',
                    $refundRef,
                    "Refund for cancelled manual order {$refNum}: {$reason}",
                    ['domain' => $domain, 'record_id' => $recordId, 'actor_id' => $actorId]
                );
                $refunded = !empty($res['confirmed']);
                $balanceAfter = $res['balance_after'] ?? null;
                if (!$refunded) {
                    $refundRef = '';
                }
            }

            $this->db->execute(
                "UPDATE `{$table}`
                 SET status = 'cancelled',
                     awaiting_admin_review = 0,
                     cancelled_at = NOW(),
                     cancelled_by = :cby,
                     cancellation_reason = :creason,
                     provider_remarks = :pr,
                     reviewed_by = :rby,
                     reviewed_at = NOW(),
                     refund_reference = CASE WHEN :rr <> '' THEN :rr2 ELSE refund_reference END,
                     refunded_at = CASE WHEN :rf = 1 AND refunded_at IS NULL THEN NOW() ELSE refunded_at END,
                     updated_at = NOW()
                 WHERE id = :id AND status NOT IN ('completed', 'refunded', 'rejected', 'cancelled')",
                [
                    'cby' => $actorId,
                    'creason' => $reason,
                    'pr' => $reason,
                    'rby' => $reviewerLabel,
                    'rr' => $refunded ? $refundRef : '',
                    'rr2' => $refunded ? $refundRef : '',
                    'rf' => $refunded ? 1 : 0,
                    'id' => $recordId,
                ]
            );

            $this->appendDomainHistory($domain, $recordId, $curStatus, 'cancelled', 'admin', $actorId, $reason, true);

            return [
                'already_cancelled' => false,
                'row' => $lockedRow,
                'ref_num' => $refNum,
                'payment_ref' => $paymentRef,
                'amount' => $amount,
                'refunded' => $refunded,
                'refund_reference' => $refunded ? $refundRef : null,
                'balance_after' => $balanceAfter,
            ];
        });

        if (!empty($txOutcome['error'])) {
            return $txOutcome;
        }
        if (!empty($txOutcome['already_cancelled'])) {
            return ['refund' => ['already_terminal' => true, 'refunded' => !empty($txOutcome['refunded']), 'refund_reference' => $txOutcome['refund_reference']]];
        }

        $refNum = (string)$txOutcome['ref_num'];
        $refunded = !empty($txOutcome['refunded']);
        if ($refunded) {
            try {
                (new ReferralEngineService($this->db))->reverseRewardsForSource((string)$txOutcome['payment_ref'], 'Manual order cancelled: ' . $reason, $actorId);
            } catch (Throwable) {
            }
        }

        $this->insertInternalNote($domain, $recordId, $refNum, $actor, 'general', 'Order cancelled: ' . $reason);
        $svcName = (string)($txOutcome['row']['service_name'] ?? $txOutcome['row']['service_key'] ?? 'Service');
        $this->notifyCustomer(
            (string)$txOutcome['row']['user_id'],
            "{$svcName} Cancelled",
            "Your {$svcName} order ({$refNum}) has been cancelled ({$reason})." . ($refunded ? ' ₦' . number_format((float)$txOutcome['amount'], 2) . ' has been refunded to your wallet.' : ''),
            'warning',
            $refNum
        );
        $this->sendCustomerEmail(
            (string)$txOutcome['row']['user_id'],
            "Order Cancelled: {$svcName} ({$refNum})",
            "Service Order Cancelled",
            "Your <strong>" . htmlspecialchars($svcName, ENT_QUOTES, 'UTF-8') . "</strong> order (<strong>" . htmlspecialchars($refNum, ENT_QUOTES, 'UTF-8') . "</strong>) has been cancelled.",
            [
                'Reference' => $refNum,
                'Reason' => $reason,
                'Refund Status' => $refunded ? 'Refunded ₦' . number_format((float)$txOutcome['amount'], 2) . ' to wallet' : 'Not applicable',
            ]
        );
        $this->recordAudit($actor, 'MANUAL_ORDER_CANCELLED', [
            'domain' => $domain,
            'record_id' => $recordId,
            'refunded' => $refunded,
            'reason' => $reason,
        ]);

        return [
            'refund' => [
                'already_terminal' => false,
                'refunded' => $refunded,
                'refund_reference' => $txOutcome['refund_reference'],
                'balance_after' => $txOutcome['balance_after'],
            ],
        ];
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
            if (in_array($curStatus, ['completed', 'cancelled'], true)) {
                return ['error' => 'Completed or cancelled orders cannot be rejected or refunded through manual queue.', 'code' => 422];
            }

            $refNum = (string)($lockedRow['request_number'] ?? $lockedRow['order_number'] ?? $lockedRow['reference'] ?? $recordId);
            $paymentRef = (string)($lockedRow['payment_reference'] ?? $lockedRow['reference'] ?? $refNum);
            $amount = (float)($lockedRow['customer_price'] ?? $lockedRow['cost'] ?? 0);
            $isRefundable = !array_key_exists('is_refundable', $lockedRow) || !empty($lockedRow['is_refundable']);

            $refundRef = trim((string)($lockedRow['refund_reference'] ?? ''));
            $canonicalRefundRef = 'REFUND_' . $paymentRef;
            $legacyManualRefundRef = 'MREF_' . $refNum;

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
            if (array_key_exists('additional_info_history', $extraColumns)) {
                $extraSet .= ', additional_info_history = :ex_aih';
                $extraParams['ex_aih'] = $extraColumns['additional_info_history'];
            }

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
                 WHERE id = :id AND status NOT IN ('completed', 'refunded', 'cancelled')",
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
        $this->sendCustomerEmail(
            (string)$lockedRow['user_id'],
            "{$serviceName} Update ({$refNum})",
            $refunded ? "Order Rejected & Refunded" : "Order Rejected",
            "Your <strong>" . htmlspecialchars($serviceName, ENT_QUOTES, 'UTF-8') . "</strong> order (<strong>" . htmlspecialchars($refNum, ENT_QUOTES, 'UTF-8') . "</strong>) could not be completed.",
            [
                'Reference' => $refNum,
                'Reason' => $reason,
                'Refund Status' => $refunded ? 'Refunded ₦' . number_format($amount, 2) . ' to wallet' : 'Not refunded',
            ]
        );

        return [
            'already_terminal' => false,
            'refunded' => $refunded,
            'refund_reference' => $refundRef,
            'balance_after' => $txOutcome['balance_after'],
        ];
    }

    private function fetchInternalNotes(string $domain, string $recordId): array
    {
        try {
            return $this->db->fetchAll(
                'SELECT id, domain, record_id, reference_number, author_id, author_name, category, content, created_at
                 FROM manual_fulfilment_notes
                 WHERE domain = :dom AND record_id = :rid
                 ORDER BY created_at DESC',
                ['dom' => $domain, 'rid' => $recordId]
            ) ?: [];
        } catch (Throwable) {
            return [];
        }
    }

    private function insertInternalNote(
        string $domain,
        string $recordId,
        string $referenceNumber,
        array $actor,
        string $category,
        string $content
    ): array {
        $noteId = Security::generateUuid();
        $authorId = (string)($actor['id'] ?? '');
        $authorName = (string)($actor['full_name'] ?: $actor['email'] ?: $authorId);
        $cat = in_array($category, self::NOTE_CATEGORIES, true) ? $category : 'general';
        $now = date('Y-m-d H:i:s');

        try {
            $this->db->execute(
                'INSERT INTO manual_fulfilment_notes
                 (id, domain, record_id, reference_number, author_id, author_name, category, content, created_at)
                 VALUES (:id, :dom, :rid, :ref, :aid, :aname, :cat, :cnt, NOW())',
                [
                    'id' => $noteId,
                    'dom' => $domain,
                    'rid' => $recordId,
                    'ref' => $referenceNumber,
                    'aid' => $authorId,
                    'aname' => $authorName,
                    'cat' => $cat,
                    'cnt' => $content,
                ]
            );
        } catch (Throwable) {
        }

        return [
            'id' => $noteId,
            'domain' => $domain,
            'record_id' => $recordId,
            'reference_number' => $referenceNumber,
            'author_id' => $authorId,
            'author_name' => $authorName,
            'category' => $cat,
            'content' => $content,
            'created_at' => $now,
        ];
    }

    private function fetchAssignmentHistory(string $domain, string $recordId): array
    {
        try {
            return $this->db->fetchAll(
                'SELECT id, domain, record_id, action, previous_assignee_id, new_assignee_id, new_assignee_name, actor_id, actor_name, reason, created_at
                 FROM manual_fulfilment_assignment_history
                 WHERE domain = :dom AND record_id = :rid
                 ORDER BY created_at DESC',
                ['dom' => $domain, 'rid' => $recordId]
            ) ?: [];
        } catch (Throwable) {
            return [];
        }
    }

    private function recordAssignmentHistory(
        string $domain,
        string $recordId,
        string $action,
        ?string $previousAssigneeId,
        ?string $newAssigneeId,
        ?string $newAssigneeName,
        string $actorId,
        string $actorName,
        ?string $reason = null
    ): void {
        try {
            $this->db->execute(
                'INSERT INTO manual_fulfilment_assignment_history
                 (id, domain, record_id, action, previous_assignee_id, new_assignee_id, new_assignee_name, actor_id, actor_name, reason, created_at)
                 VALUES (:id, :dom, :rid, :act, :prev, :newid, :newname, :aid, :aname, :rsn, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'dom' => $domain,
                    'rid' => $recordId,
                    'act' => $action,
                    'prev' => $previousAssigneeId,
                    'newid' => $newAssigneeId,
                    'newname' => $newAssigneeName,
                    'aid' => $actorId,
                    'aname' => $actorName,
                    'rsn' => $reason,
                ]
            );
        } catch (Throwable) {
        }
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
                $rows = $this->db->fetchAll(
                    'SELECT id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at
                     FROM verification_status_history WHERE record_id = :rid ORDER BY created_at ASC',
                    ['rid' => $recordId]
                );
                if (!empty($rows)) {
                    return $rows;
                }
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
                $this->db->execute(
                    'INSERT INTO verification_status_history (id, record_id, previous_status, new_status, actor_type, actor_id, remarks, is_customer_visible, created_at)
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

    private function notifyStaffUser(string $userId, string $title, string $message, string $actionLink): void
    {
        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                 VALUES (:id, :uid, :title, :msg, "info", 0, :link, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => $title,
                    'msg' => $message,
                    'link' => $actionLink,
                ]
            );
        } catch (Throwable) {
        }
    }

    private function sendCustomerEmail(string $userId, string $subject, string $heading, string $leadHtml, array $rows = []): void
    {
        try {
            $u = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
            $email = trim((string)($u['email'] ?? ''));
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return;
            }
            $name = htmlspecialchars((string)($u['full_name'] ?: 'Customer'), ENT_QUOTES, 'UTF-8');
            $detailsHtml = '';
            $textLines = [$heading, '', strip_tags($leadHtml), ''];
            if (!empty($rows)) {
                $detailsHtml .= '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">';
                foreach ($rows as $label => $val) {
                    $safeL = htmlspecialchars((string)$label, ENT_QUOTES, 'UTF-8');
                    $safeV = htmlspecialchars((string)$val, ENT_QUOTES, 'UTF-8');
                    $detailsHtml .= "<tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:38%;\">{$safeL}</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:600;\">{$safeV}</td></tr>";
                    $textLines[] = "{$label}: {$val}";
                }
                $detailsHtml .= '</table>';
            }
            $safeHeading = htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
            $html = "<h2 style=\"margin:0 0 12px;color:#0f172a;font-size:20px;\">{$safeHeading}</h2>"
                . "<p style=\"margin:0 0 12px;color:#334155;\">Hello {$name},</p>"
                . "<p style=\"margin:0 0 14px;color:#334155;\">{$leadHtml}</p>"
                . $detailsHtml
                . "<p style=\"margin:16px 0 0;color:#475569;font-size:13px;\">Log in to your customer portal to view full progress and updates.</p>";

            EmailService::getInstance()->sendTransactionalEmail($email, $subject, $html, implode("\n", $textLines));
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
