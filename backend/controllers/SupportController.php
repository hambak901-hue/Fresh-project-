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

        Response::success(['tickets' => $tickets]);
    }

    /**
     * 2. POST /api/support/tickets (Create customer ticket)
     */
    public function createTicket(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $subject = trim((string)$request->input('subject', ''));
        $department = trim((string)$request->input('department', 'General Support'));
        $priority = strtolower(trim((string)$request->input('priority', 'medium')));
        $message = trim((string)$request->input('message', ''));
        $attachmentUrl = (string)$request->input('attachment_url', '');

        if (empty($subject) || empty($message)) {
            Response::error('Subject and message are required to open a support ticket.', 422);
        }

        if (!in_array($priority, ['low', 'medium', 'high', 'urgent'], true)) {
            $priority = 'medium';
        }

        $ticketId = 'TCK-' . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 8));

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
                'details' => json_encode(['ticket_id' => $ticketId, 'subject' => $subject, 'priority' => $priority]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success(['ticket_id' => $ticketId, 'ticketId' => $ticketId], 'Support ticket created successfully. Our team will review shortly.', 201);
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

        $replies = $this->db->fetchAll(
            'SELECT r.*, u.full_name as author_name, u.role as author_role
             FROM support_replies r
             JOIN users u ON u.id = r.user_id
             WHERE r.ticket_id = :tid
             ORDER BY r.created_at ASC',
            ['tid' => $ticketId]
        );

        foreach ($replies as &$r) {
            $r['is_staff'] = (bool)$r['is_staff'];
        }

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

        // Update ticket status
        $newStatus = $isAdmin ? 'pending' : 'open'; // If admin replies -> pending customer; if customer replies -> open
        $this->db->execute(
            'UPDATE support_tickets SET status = :st, updated_at = NOW() WHERE id = :tid',
            ['st' => $newStatus, 'tid' => $ticketId]
        );

        // If staff replied, send dashboard notification to customer
        if ($isAdmin && $ticket['user_id'] !== $user['id']) {
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

        Response::success(['reply_id' => $replyId], 'Reply added successfully.');
    }

    /**
     * 5. GET /api/admin/support/tickets (Admin ticket queue)
     */
    public function adminTickets(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $status = $request->query('status', '');
        $priority = $request->query('priority', '');
        $search = $request->query('search', '');

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

        if (!empty($search)) {
            $sql .= 'AND (t.subject LIKE :q OR t.id LIKE :q OR u.full_name LIKE :q OR u.email LIKE :q) ';
            $params['q'] = '%' . $search . '%';
        }

        $sql .= 'ORDER BY FIELD(t.priority, "urgent", "high", "medium", "low"), t.updated_at DESC LIMIT 100';

        $tickets = $this->db->fetchAll($sql, $params);

        // Metrics
        $counts = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = "open" THEN 1 ELSE 0 END) as `open`,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as `pending`,
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
                'resolved' => (int)($counts['resolved'] ?? 0),
                'closed' => (int)($counts['closed'] ?? 0),
                'urgent' => (int)($counts['urgent'] ?? 0),
            ],
        ]);
    }

    /**
     * 6. PUT /api/admin/support/tickets/:id/status (Update ticket status)
     */
    public function updateStatus(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $ticketId = $params['id'] ?? '';
        $status = strtolower(trim((string)$request->input('status', 'resolved')));

        if (!in_array($status, ['open', 'pending', 'resolved', 'closed'], true)) {
            Response::error('Invalid ticket status.', 422);
        }

        $this->db->execute(
            'UPDATE support_tickets SET status = :st, updated_at = NOW() WHERE id = :tid',
            ['st' => $status, 'tid' => $ticketId]
        );

        Response::success(['status' => $status], "Ticket {$ticketId} marked as {$status}.");
    }
}
