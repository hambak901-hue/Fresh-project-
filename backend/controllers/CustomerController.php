<?php
/**
 * @file CustomerController.php
 * Customer Dashboard Aggregator & KYC Controller
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;

class CustomerController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    public function dashboard(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $summary = $this->walletService->getSummary($user['id']);

        $recentTransactions = $this->db->fetchAll(
            'SELECT id, type, amount, category, reference, status, description, created_at
             FROM transactions 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 5',
            ['uid' => $user['id']]
        );
        foreach ($recentTransactions as &$tx) {
            $tx['amount'] = (float)$tx['amount'];
        }

        $recentOrders = $this->db->fetchAll(
            'SELECT id, service_type, plan, amount, status, created_at
             FROM telecom_orders 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 5',
            ['uid' => $user['id']]
        );
        foreach ($recentOrders as &$ord) {
            $ord['amount'] = (float)$ord['amount'];
        }

        $notifications = $this->db->fetchAll(
            'SELECT id, title, message, type, is_read as `read`, created_at 
             FROM notifications 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 10',
            ['uid' => $user['id']]
        );
        foreach ($notifications as &$n) {
            $n['read'] = (bool)$n['read'];
        }

        $announcements = $this->db->fetchAll(
            'SELECT id, title, content, category, is_pinned, created_at 
             FROM announcements 
             WHERE status = "published" 
             ORDER BY is_pinned DESC, created_at DESC LIMIT 3'
        );

        Response::success([
            'wallet' => $summary,
            'recent_transactions' => $recentTransactions,
            'recent_orders' => $recentOrders,
            'notifications' => $notifications,
            'announcements' => $announcements,
        ]);
    }

    public function submitKyc(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $idType = (string)$request->input('id_type', 'NIN');
        $idNumber = trim((string)$request->input('id_number', ''));
        $docUrl = (string)$request->input('doc_url', '');

        if (empty($idNumber)) {
            Response::error('Identification number is required.', 422);
        }

        $kycId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO kyc_submissions (id, user_id, id_type, id_number, doc_url, status, created_at)
             VALUES (:id, :uid, :type, :num, :doc, "pending", NOW())',
            [
                'id' => $kycId,
                'uid' => $user['id'],
                'type' => $idType,
                'num' => $idNumber,
                'doc' => $docUrl,
            ]
        );

        $this->db->execute(
            'UPDATE users SET kyc_status = "pending", updated_at = NOW() WHERE id = :id',
            ['id' => $user['id']]
        );

        if ($idType === 'NIN') {
            $this->db->execute(
                'UPDATE user_profiles SET nin = :num WHERE user_id = :uid',
                ['num' => $idNumber, 'uid' => $user['id']]
            );
        } elseif ($idType === 'BVN') {
            $this->db->execute(
                'UPDATE user_profiles SET bvn = :num WHERE user_id = :uid',
                ['num' => $idNumber, 'uid' => $user['id']]
            );
        }

        Response::success([
            'submission_id' => $kycId,
            'status' => 'pending',
        ], 'KYC documents submitted successfully. Verification takes 15-30 minutes.');
    }

    public function notifications(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $notifications = $this->db->fetchAll(
            'SELECT id, title, message, type, is_read as `read`, action_link, created_at 
             FROM notifications 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 50',
            ['uid' => $user['id']]
        );
        foreach ($notifications as &$n) {
            $n['read'] = (bool)$n['read'];
        }
        Response::success(['notifications' => $notifications]);
    }

    public function markNotificationRead(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $notifId = $params['id'] ?? '';
        $this->db->execute(
            'UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :uid',
            ['id' => $notifId, 'uid' => $user['id']]
        );
        Response::success(null, 'Notification marked as read');
    }

    public function tickets(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $tickets = $this->db->fetchAll(
            'SELECT t.id, t.subject, t.priority, t.status, t.department, t.created_at, t.updated_at,
                    (SELECT COUNT(*) FROM support_replies r WHERE r.ticket_id = t.id) as reply_count
             FROM support_tickets t
             WHERE t.user_id = :uid
             ORDER BY t.updated_at DESC',
            ['uid' => $user['id']]
        );
        Response::success(['tickets' => $tickets]);
    }

    public function createTicket(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $subject = trim((string)$request->input('subject', ''));
        $department = (string)$request->input('department', 'General Support');
        $priority = (string)$request->input('priority', 'medium');
        $message = trim((string)$request->input('message', ''));

        if (empty($subject) || empty($message)) {
            Response::error('Subject and message are required.', 422);
        }

        $ticketId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO support_tickets (id, user_id, subject, priority, status, department, created_at, updated_at)
             VALUES (:id, :uid, :subj, :pri, "open", :dept, NOW(), NOW())',
            [
                'id' => $ticketId,
                'uid' => $user['id'],
                'subj' => $subject,
                'pri' => in_array($priority, ['low', 'medium', 'high', 'urgent'], true) ? $priority : 'medium',
                'dept' => $department,
            ]
        );

        $replyId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO support_replies (id, ticket_id, user_id, is_staff, message, created_at)
             VALUES (:id, :tid, :uid, 0, :msg, NOW())',
            [
                'id' => $replyId,
                'tid' => $ticketId,
                'uid' => $user['id'],
                'msg' => $message,
            ]
        );

        Response::success(['ticket_id' => $ticketId], 'Support ticket submitted successfully. Support team will respond shortly.', 201);
    }

    public function ticketDetail(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ticketId = $params['id'] ?? '';

        $ticket = $this->db->fetchOne(
            'SELECT * FROM support_tickets WHERE id = :id AND user_id = :uid',
            ['id' => $ticketId, 'uid' => $user['id']]
        );

        if (!$ticket) {
            Response::notFound('Ticket not found.');
        }

        $replies = $this->db->fetchAll(
            'SELECT r.id, r.user_id, r.is_staff, r.message, r.attachment_url, r.created_at,
                    u.full_name as author_name, u.role as author_role
             FROM support_replies r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE r.ticket_id = :tid
             ORDER BY r.created_at ASC',
            ['tid' => $ticketId]
        );

        foreach ($replies as &$rep) {
            $rep['is_staff'] = (bool)$rep['is_staff'];
        }

        Response::success([
            'ticket' => $ticket,
            'replies' => $replies,
        ]);
    }

    public function replyTicket(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ticketId = $params['id'] ?? '';
        $message = trim((string)$request->input('message', ''));

        if (empty($message)) {
            Response::error('Message cannot be empty.', 422);
        }

        $ticket = $this->db->fetchOne('SELECT id FROM support_tickets WHERE id = :id AND user_id = :uid', ['id' => $ticketId, 'uid' => $user['id']]);
        if (!$ticket) {
            Response::notFound('Ticket not found.');
        }

        $replyId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO support_replies (id, ticket_id, user_id, is_staff, message, created_at)
             VALUES (:id, :tid, :uid, 0, :msg, NOW())',
            [
                'id' => $replyId,
                'tid' => $ticketId,
                'uid' => $user['id'],
                'msg' => $message,
            ]
        );

        $this->db->execute(
            'UPDATE support_tickets SET status = "pending", updated_at = NOW() WHERE id = :id',
            ['id' => $ticketId]
        );

        Response::success(null, 'Reply posted successfully.');
    }
}
