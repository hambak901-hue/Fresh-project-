<?php
/**
 * @file SupportController.php
 * Enterprise Support & Help Centre Controller
 * Real-time customer ticketing, staff assignment, internal notes, attachments, and status tracking
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Exception;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;

class SupportController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function normalizeTicketRow(array $ticket): array
    {
        $rawCat = trim((string)($ticket['category'] ?? ''));
        if ($rawCat === '') {
            $rawDept = strtolower(trim((string)($ticket['department'] ?? '')));
            if ($rawDept !== '' && $rawDept !== 'general support') {
                $rawCat = preg_replace('/[^a-z0-9]+/', '_', $rawDept) ?: 'general';
            } else {
                $rawCat = 'general';
            }
        }
        $ticket['category'] = $rawCat;
        $ticket['department'] = trim((string)($ticket['department'] ?? '')) ?: 'General Support';
        $ticket['priority'] = strtolower(trim((string)($ticket['priority'] ?? ''))) ?: 'medium';
        $ticket['status'] = strtolower(trim((string)($ticket['status'] ?? ''))) ?: 'open';
        $ticket['subject'] = trim((string)($ticket['subject'] ?? '')) ?: 'Support Inquiry';
        return $ticket;
    }

    /**
     * 1. GET /api/support/tickets (Customer tickets)
     */
    public function customerTickets(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $tickets = $this->db->fetchAll(
            'SELECT t.*, 
                    (SELECT COUNT(*) FROM support_replies r WHERE r.ticket_id = t.id) as reply_count,
                    (SELECT r.created_at FROM support_replies r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) as last_reply_at
             FROM support_tickets t
             WHERE t.user_id = :uid
             ORDER BY t.updated_at DESC',
            ['uid' => $user['id']]
        );

        foreach ($tickets as &$t) {
            $t = $this->normalizeTicketRow($t);
        }

        Response::success(['tickets' => $tickets]);
    }

    /**
     * 2. POST /api/support/tickets (Create customer ticket)
     */
    public function createTicket(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $subject = trim((string)$request->input('subject', ''));
        $category = trim((string)$request->input('category', 'general'));
        $department = trim((string)$request->input('department', $category ?: 'General Support'));
        $priority = strtolower(trim((string)$request->input('priority', 'medium')));
        $message = trim((string)$request->input('message', $request->input('description', '')));
        $attachmentUrl = (string)$request->input('attachment_url', '');

        if (empty($subject) || empty($message)) {
            Response::error('Subject and message are required to open a support ticket.', 422);
        }

        if (!in_array($priority, ['low', 'medium', 'high', 'urgent'], true)) {
            $priority = 'medium';
        }

        $ticketId = 'TCK-' . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 8));

        try {
            $this->db->execute(
                'INSERT INTO support_tickets (id, ticket_number, user_id, subject, category, priority, status, department, description, created_at, updated_at)
                 VALUES (:id, :tnum, :uid, :sub, :cat, :prio, "open", :dept, :desc, NOW(), NOW())',
                [
                    'id' => $ticketId,
                    'tnum' => $ticketId,
                    'uid' => $user['id'],
                    'sub' => $subject,
                    'cat' => $category ?: 'general',
                    'prio' => $priority,
                    'dept' => $department,
                    'desc' => $message,
                ]
            );
        } catch (Exception) {
            $this->db->execute(
                'INSERT INTO support_tickets (id, user_id, subject, priority, status, department, created_at, updated_at)
                 VALUES (:id, :uid, :sub, :prio, "open", :dept, NOW(), NOW())',
                [
                    'id' => $ticketId,
                    'uid' => $user['id'],
                    'sub' => $subject,
                    'prio' => $priority,
                    'dept' => $department,
                ]
            );
        }

        $replyId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO support_replies (id, ticket_id, user_id, is_staff, message, attachment_url, created_at)
             VALUES (:id, :tid, :uid, 0, :msg, :att, NOW())',
            [
                'id' => $replyId,
                'tid' => $ticketId,
                'uid' => $user['id'],
                'msg' => $message,
                'att' => !empty($attachmentUrl) ? $attachmentUrl : null,
            ]
        );

        // Notify admins in audit logs
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "SUPPORT_TICKET_OPENED", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'email' => $user['email'],
                'details' => json_encode(['ticket_id' => $ticketId, 'subject' => $subject, 'category' => $category, 'priority' => $priority]),
                'ip' => $request->getIp(),
            ]
        );

        $ticket = $this->db->fetchOne('SELECT * FROM support_tickets WHERE id = :id', ['id' => $ticketId]);
        if ($ticket) {
            $ticket = $this->normalizeTicketRow($ticket);
        }
        Response::success([
            'ticket' => $ticket,
            'ticket_id' => $ticketId,
            'ticketId' => $ticketId,
            'ticket_reference' => $ticketId,
        ], 'Support ticket created successfully. Our team will review shortly.', 201);
    }

    /**
     * 3. GET /api/support/tickets/:id (Ticket conversation)
     */
    public function getTicketDetails(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ticketId = $params['id'] ?? '';
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $ticket = $this->db->fetchOne(
            'SELECT t.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM support_tickets t
             JOIN users u ON u.id = t.user_id
             WHERE t.id = :tid',
            ['tid' => $ticketId]
        );

        if (!$ticket) {
            Response::error('Support ticket not found.', 404);
        }

        // Customer access check
        if (!$isAdmin && $ticket['user_id'] !== $user['id']) {
            Response::error('Unauthorized access to this support ticket.', 403);
        }

        $sql = 'SELECT r.*, u.full_name as author_name, u.role as author_role
                FROM support_replies r
                JOIN users u ON u.id = r.user_id
                WHERE r.ticket_id = :tid ';
        if (!$isAdmin) {
            $sql .= 'AND (r.is_internal_note IS NULL OR r.is_internal_note = 0) ';
        }
        $sql .= 'ORDER BY r.created_at ASC';

        try {
            $replies = $this->db->fetchAll($sql, ['tid' => $ticketId]);
        } catch (Exception) {
            $replies = $this->db->fetchAll(
                'SELECT r.*, u.full_name as author_name, u.role as author_role
                 FROM support_replies r
                 JOIN users u ON u.id = r.user_id
                 WHERE r.ticket_id = :tid
                 ORDER BY r.created_at ASC',
                ['tid' => $ticketId]
            );
        }

        foreach ($replies as &$r) {
            $r['is_staff'] = (bool)$r['is_staff'];
            $r['is_internal_note'] = (bool)($r['is_internal_note'] ?? false);
        }

        $ticket = $this->normalizeTicketRow($ticket);

        Response::success([
            'ticket' => $ticket,
            'replies' => $replies,
        ]);
    }

    /**
     * 4. POST /api/support/tickets/:id/reply (Reply to ticket)
     */
    public function replyTicket(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ticketId = $params['id'] ?? '';
        $message = trim((string)$request->input('message', ''));
        $attachmentUrl = (string)$request->input('attachment_url', '');
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $isInternalNote = $isAdmin && (bool)$request->input('is_internal_note', false);
        $requestedStatus = strtolower(trim((string)$request->input('status', '')));

        if (empty($message)) {
            Response::error('Message cannot be empty.', 422);
        }

        $ticket = $this->db->fetchOne('SELECT * FROM support_tickets WHERE id = :tid', ['tid' => $ticketId]);
        if (!$ticket) {
            Response::error('Support ticket not found.', 404);
        }

        if (!$isAdmin && $ticket['user_id'] !== $user['id']) {
            Response::error('Unauthorized access to this support ticket.', 403);
        }

        $replyId = Security::generateUuid();
        $isStaff = $isAdmin ? 1 : 0;

        try {
            $this->db->execute(
                'INSERT INTO support_replies (id, ticket_id, user_id, is_staff, is_internal_note, message, attachment_url, created_at)
                 VALUES (:id, :tid, :uid, :staff, :note, :msg, :att, NOW())',
                [
                    'id' => $replyId,
                    'tid' => $ticketId,
                    'uid' => $user['id'],
                    'staff' => $isStaff,
                    'note' => $isInternalNote ? 1 : 0,
                    'msg' => $message,
                    'att' => !empty($attachmentUrl) ? $attachmentUrl : null,
                ]
            );
        } catch (Exception) {
            $this->db->execute(
                'INSERT INTO support_replies (id, ticket_id, user_id, is_staff, message, attachment_url, created_at)
                 VALUES (:id, :tid, :uid, :staff, :msg, :att, NOW())',
                [
                    'id' => $replyId,
                    'tid' => $ticketId,
                    'uid' => $user['id'],
                    'staff' => $isStaff,
                    'msg' => $message,
                    'att' => !empty($attachmentUrl) ? $attachmentUrl : null,
                ]
            );
        }

        // Update ticket status if not merely an internal note (or if status explicitly requested)
        $allowedStatuses = ['open', 'pending', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
        if (!empty($requestedStatus) && in_array($requestedStatus, $allowedStatuses, true)) {
            $newStatus = $requestedStatus;
        } elseif ($isInternalNote) {
            $newStatus = $ticket['status'];
        } else {
            $newStatus = $isAdmin ? 'waiting_customer' : 'open';
        }

        try {
            $this->db->execute(
                'UPDATE support_tickets SET status = :st, updated_at = NOW() WHERE id = :tid',
                ['st' => $newStatus, 'tid' => $ticketId]
            );
        } catch (Exception) {
            $fallbackStatus = ($newStatus === 'waiting_customer') ? 'pending' : $newStatus;
            $this->db->execute(
                'UPDATE support_tickets SET status = :st, updated_at = NOW() WHERE id = :tid',
                ['st' => $fallbackStatus, 'tid' => $ticketId]
            );
        }

        // If staff posted a customer-visible reply, notify customer
        if ($isAdmin && !$isInternalNote && $ticket['user_id'] !== $user['id']) {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, :title, :msg, "info", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $ticket['user_id'],
                    'title' => "Support Update on Ticket {$ticketId}",
                    'msg' => "A support agent replied to your ticket '{$ticket['subject']}': " . substr($message, 0, 100) . '...',
                ]
            );
        }

        $replyRow = $this->db->fetchOne(
            'SELECT r.*, u.full_name as author_name, u.role as author_role
             FROM support_replies r
             JOIN users u ON u.id = r.user_id
             WHERE r.id = :rid',
            ['rid' => $replyId]
        );
        if ($replyRow) {
            $replyRow['is_staff'] = (bool)$replyRow['is_staff'];
            $replyRow['is_internal_note'] = (bool)($replyRow['is_internal_note'] ?? false);
        }

        Response::success([
            'reply_id' => $replyId,
            'reply' => $replyRow,
            'status' => $newStatus,
        ], $isInternalNote ? 'Internal staff note recorded.' : 'Reply added successfully.');
    }

    /**
     * 5. GET /api/admin/support/tickets (Admin ticket queue)
     */
    public function adminTickets(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $status = (string)$request->query('status', '');
        $priority = (string)$request->query('priority', '');
        $category = (string)$request->query('category', '');
        $search = trim((string)$request->query('search', ''));

        $sql = 'SELECT t.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone,
                       (SELECT COUNT(*) FROM support_replies r WHERE r.ticket_id = t.id) as reply_count,
                       (SELECT r.created_at FROM support_replies r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) as last_reply_at
                FROM support_tickets t
                JOIN users u ON u.id = t.user_id
                WHERE 1=1 ';
        $params = [];

        if (!empty($status) && $status !== 'all') {
            $sql .= 'AND t.status = :st ';
            $params['st'] = $status;
        }

        if (!empty($priority) && $priority !== 'all') {
            $sql .= 'AND t.priority = :prio ';
            $params['prio'] = $priority;
        }

        if (!empty($category) && $category !== 'all') {
            $sql .= 'AND (t.category = :cat OR t.department = :dept) ';
            $params['cat'] = $category;
            $params['dept'] = $category;
        }

        if (!empty($search)) {
            $sql .= 'AND (t.subject LIKE :q1 OR t.id LIKE :q2 OR COALESCE(t.ticket_number, "") LIKE :q3 OR u.full_name LIKE :q4 OR u.email LIKE :q5) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
            $params['q4'] = $like;
            $params['q5'] = $like;
        }

        $sql .= 'ORDER BY FIELD(t.priority, "urgent", "high", "medium", "low"), t.updated_at DESC LIMIT 100';

        $tickets = $this->db->fetchAll($sql, $params);
        foreach ($tickets as &$t) {
            $t = $this->normalizeTicketRow($t);
        }

        // Metrics
        $counts = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = "open" THEN 1 ELSE 0 END) as `open`,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as `pending`,
                SUM(CASE WHEN status = "in_progress" THEN 1 ELSE 0 END) as `in_progress`,
                SUM(CASE WHEN status IN ("waiting_customer", "pending") THEN 1 ELSE 0 END) as `waiting_customer`,
                SUM(CASE WHEN status = "resolved" THEN 1 ELSE 0 END) as `resolved`,
                SUM(CASE WHEN status = "closed" THEN 1 ELSE 0 END) as `closed`,
                SUM(CASE WHEN priority = "urgent" AND status != "closed" THEN 1 ELSE 0 END) as `urgent`
             FROM support_tickets'
        );

        Response::success([
            'tickets' => $tickets,
            'metrics' => [
                'total' => (int)($counts['total'] ?? 0),
                'open' => (int)($counts['open'] ?? 0),
                'pending' => (int)($counts['pending'] ?? 0),
                'in_progress' => (int)($counts['in_progress'] ?? 0),
                'waiting_customer' => (int)($counts['waiting_customer'] ?? 0),
                'resolved' => (int)($counts['resolved'] ?? 0),
                'closed' => (int)($counts['closed'] ?? 0),
                'urgent' => (int)($counts['urgent'] ?? 0),
            ],
        ]);
    }

    /**
     * 6. PUT/POST /api/admin/support/tickets/:id/status (Update ticket status/priority/assignee)
     */
    public function updateStatus(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $ticketId = $params['id'] ?? '';
        $status = $request->input('status');
        $priority = $request->input('priority');
        $assignedTo = $request->input('assigned_to');

        $sets = ['updated_at = NOW()'];
        $sqlParams = ['tid' => $ticketId];

        if ($status !== null && $status !== '') {
            $statusNorm = strtolower(trim((string)$status));
            if (!in_array($statusNorm, ['open', 'pending', 'in_progress', 'waiting_customer', 'resolved', 'closed'], true)) {
                Response::error('Invalid ticket status.', 422);
            }
            $sets[] = 'status = :st';
            $sqlParams['st'] = $statusNorm;
        }

        if ($priority !== null && $priority !== '') {
            $prioNorm = strtolower(trim((string)$priority));
            if (!in_array($prioNorm, ['low', 'medium', 'high', 'urgent'], true)) {
                Response::error('Invalid ticket priority.', 422);
            }
            $sets[] = 'priority = :prio';
            $sqlParams['prio'] = $prioNorm;
        }

        if ($assignedTo !== null) {
            $sets[] = 'assigned_to = :assignee';
            $sqlParams['assignee'] = (string)$assignedTo;
        }

        try {
            $this->db->execute(
                'UPDATE support_tickets SET ' . implode(', ', $sets) . ' WHERE id = :tid',
                $sqlParams
            );
        } catch (Exception $e) {
            if (isset($sqlParams['st']) && in_array($sqlParams['st'], ['in_progress', 'waiting_customer'], true)) {
                $sqlParams['st'] = 'pending';
                $this->db->execute(
                    'UPDATE support_tickets SET status = :st, updated_at = NOW() WHERE id = :tid',
                    ['st' => $sqlParams['st'], 'tid' => $ticketId]
                );
            } else {
                throw $e;
            }
        }

        Response::success([
            'status' => $sqlParams['st'] ?? null,
            'priority' => $sqlParams['prio'] ?? null,
        ], "Ticket {$ticketId} updated successfully.");
    }

    /**
     * 7. DELETE /api/admin/support/tickets/:id (Delete support ticket & replies)
     */
    public function deleteTicket(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $ticketId = trim((string)($params['id'] ?? ''));

        $ticket = $this->db->fetchOne('SELECT id, subject FROM support_tickets WHERE id = :tid', ['tid' => $ticketId]);
        if (!$ticket) {
            Response::error('Support ticket not found.', 404);
        }

        $this->db->execute('DELETE FROM support_replies WHERE ticket_id = :tid', ['tid' => $ticketId]);
        $this->db->execute('DELETE FROM support_tickets WHERE id = :tid', ['tid' => $ticketId]);

        Response::success(['deleted_id' => $ticketId], "Support ticket {$ticketId} removed.");
    }
}
