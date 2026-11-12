<?php
/**
 * @file NotificationController.php
 * Comprehensive Notification, Broadcast & Announcement Administration Controller
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\MailService;

class NotificationController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * 1. GET /api/admin/notifications/overview
     */
    public function overview(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $stats = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_inapp,
                SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) as read_count,
                SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_count
             FROM notifications'
        );

        $announcementCount = (int)($this->db->fetchOne('SELECT COUNT(*) as c FROM announcements WHERE status = "published"')['c'] ?? 0);

        $totalBroadcasts = 0;
        $recentBroadcasts = [];
        try {
            $bCount = $this->db->fetchOne('SELECT COUNT(*) as c FROM broadcasts');
            $totalBroadcasts = (int)($bCount['c'] ?? 0);
            $recentBroadcasts = $this->db->fetchAll('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 10');
        } catch (Throwable) {
        }

        $emailLogsCount = 0;
        $recentEmailLogs = [];
        try {
            $eCount = $this->db->fetchOne('SELECT COUNT(*) as c FROM email_logs');
            $emailLogsCount = (int)($eCount['c'] ?? 0);
            $recentEmailLogs = $this->db->fetchAll('SELECT id, recipient, subject, status, "email" as channel, created_at FROM email_logs ORDER BY created_at DESC LIMIT 10');
        } catch (Throwable) {
        }

        $smsLogsCount = 0;
        $recentSmsLogs = [];
        try {
            $sCount = $this->db->fetchOne('SELECT COUNT(*) as c FROM sms_logs');
            $smsLogsCount = (int)($sCount['c'] ?? 0);
            $recentSmsLogs = $this->db->fetchAll('SELECT id, recipient, LEFT(message, 60) as subject, status, "sms" as channel, created_at FROM sms_logs ORDER BY created_at DESC LIMIT 10');
        } catch (Throwable) {
        }

        $recentLogs = array_merge($recentEmailLogs, $recentSmsLogs);
        usort($recentLogs, fn($a, $b) => strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? '')));
        $recentLogs = array_slice($recentLogs, 0, 15);

        Response::success([
            'metrics' => [
                'total_in_app' => (int)($stats['total_inapp'] ?? 0),
                'unread_in_app' => (int)($stats['unread_count'] ?? 0),
                'total_broadcasts' => $totalBroadcasts,
                'active_announcements' => $announcementCount,
                'email_logs_count' => $emailLogsCount,
                'sms_logs_count' => $smsLogsCount,
            ],
            'recent_broadcasts' => $recentBroadcasts,
            'recent_logs' => $recentLogs,
            'in_app' => [
                'total' => (int)($stats['total_inapp'] ?? 0),
                'read' => (int)($stats['read_count'] ?? 0),
                'unread' => (int)($stats['unread_count'] ?? 0),
            ],
            'announcements_count' => $announcementCount,
        ]);
    }

    /**
     * 2. GET /api/admin/notifications/broadcasts
     */
    public function listBroadcasts(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $broadcasts = [];
        try {
            $broadcasts = $this->db->fetchAll('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50');
        } catch (Throwable) {
        }

        $notifications = $this->db->fetchAll(
            'SELECT n.id, n.user_id, n.title, n.message, n.type, n.is_read, n.created_at, u.full_name as recipient_name, u.email as recipient_email
             FROM notifications n
             LEFT JOIN users u ON u.id = n.user_id
             ORDER BY n.created_at DESC LIMIT 50'
        );

        Response::success([
            'broadcasts' => $broadcasts,
            'notifications' => $notifications,
        ]);
    }

    /**
     * 3. POST /api/admin/notifications/broadcast
     */
    public function sendBroadcast(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $title = trim((string)$request->input('title', ''));
        $message = trim((string)$request->input('message', ''));
        $channel = strtolower(trim((string)$request->input('channel', 'in_app')));
        $type = trim((string)$request->input('type', 'info'));
        $targetRole = trim((string)($request->input('target_role') ?? $request->input('target_tier', 'all')));
        $specificUserId = $request->input('user_id');

        if (empty($title) || empty($message)) {
            Response::error('Title and message are required for broadcast.', 422);
        }

        if (!empty($specificUserId)) {
            $recipients = $this->db->fetchAll('SELECT id, email, full_name FROM users WHERE id = :id', ['id' => (string)$specificUserId]);
        } else {
            $sql = 'SELECT id, email, full_name FROM users WHERE status = "active"';
            $params = [];
            if ($targetRole === 'customer' || $targetRole === 'admin' || $targetRole === 'superadmin') {
                $sql .= ' AND role = :role';
                $params['role'] = $targetRole;
            } elseif (in_array($targetRole, ['1', '2', '3'], true)) {
                $sql .= ' AND role = "customer" AND tier = :tier';
                $params['tier'] = (int)$targetRole;
            } else {
                $sql .= ' AND role = "customer"';
            }
            $recipients = $this->db->fetchAll($sql, $params);
        }

        $count = 0;
        $mailService = str_contains($channel, 'email') ? new MailService() : null;

        foreach ($recipients as $u) {
            $notifId = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, :title, :msg, :type, 0, NOW())',
                [
                    'id' => $notifId,
                    'uid' => $u['id'],
                    'title' => $title,
                    'msg' => $message,
                    'type' => $type,
                ]
            );

            try {
                $this->db->execute(
                    'INSERT INTO customer_messages (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, :type, 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $u['id'],
                        'title' => $title,
                        'msg' => $message,
                        'type' => $type,
                    ]
                );
            } catch (Throwable) {
            }

            if ($mailService && !empty($u['email'])) {
                try {
                    $safeHtml = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">'
                        . '<h2 style="color:#0f172a;margin-top:0;">' . htmlspecialchars($title) . '</h2>'
                        . '<p style="color:#334155;line-height:1.6;">' . nl2br(htmlspecialchars($message)) . '</p>'
                        . '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>'
                        . '<p style="font-size:12px;color:#64748b;">HambakTech Enterprise Portal Notification</p>'
                        . '</div>';
                    $mailService->send((string)$u['email'], (string)($u['full_name'] ?? 'Customer'), $title, $safeHtml);
                } catch (Throwable) {
                }
            }
            $count++;
        }

        $broadcastId = Security::generateUuid();
        try {
            $this->db->execute(
                'INSERT INTO broadcasts (id, title, message, channel, type, target_role, user_id, recipient_count, sent_by, sent_by_name, status, created_at)
                 VALUES (:id, :title, :msg, :ch, :tp, :role, :uid, :cnt, :by, :byname, "sent", NOW())',
                [
                    'id' => $broadcastId,
                    'title' => $title,
                    'msg' => $message,
                    'ch' => $channel ?: 'in_app',
                    'tp' => $type,
                    'role' => $targetRole,
                    'uid' => $specificUserId ? (string)$specificUserId : null,
                    'cnt' => $count,
                    'by' => $admin['id'],
                    'byname' => $admin['full_name'] ?? 'Super Admin',
                ]
            );
        } catch (Throwable) {
        }

        // Audit log
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "NOTIFICATION_BROADCAST", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $admin['id'],
                'email' => $admin['email'],
                'details' => json_encode(['title' => $title, 'channel' => $channel, 'recipient_count' => $count, 'target_role' => $targetRole]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'id' => $broadcastId,
            'recipient_count' => $count,
            'dispatched_count' => $count,
            'announcement' => [
                'id' => $broadcastId,
                'title' => $title,
                'message' => $message,
                'channel' => $channel,
                'recipient_count' => $count,
            ],
        ], "Notification broadcast dispatched to {$count} account(s).");
    }

    /**
     * 4. GET /api/admin/announcements
     */
    public function listAnnouncements(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $announcements = $this->db->fetchAll(
            'SELECT * FROM announcements ORDER BY is_pinned DESC, created_at DESC'
        );

        foreach ($announcements as &$a) {
            $a['is_pinned'] = (bool)$a['is_pinned'];
            $a['is_active'] = ($a['status'] ?? 'published') === 'published';
            $a['message'] = $a['content'] ?? '';
        }

        Response::success(['announcements' => $announcements]);
    }

    /**
     * 5. POST /api/admin/announcements & PUT /api/admin/announcements/:id
     */
    public function saveAnnouncement(Request $request, array $params = []): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $id = (string)($params['id'] ?? $request->input('id', ''));
        $title = trim((string)$request->input('title', ''));
        $content = trim((string)($request->input('content') ?: $request->input('message') ?: ''));
        $category = (string)($request->input('category') ?: $request->input('type') ?: 'general');
        if (!in_array($category, ['update', 'maintenance', 'offer', 'security', 'general'], true)) {
            $category = 'general';
        }
        $isPinned = (bool)$request->input('is_pinned', false);
        $isActive = $request->input('is_active');
        $status = (string)$request->input('status', $isActive === false || $isActive === 0 ? 'draft' : 'published');

        if (empty($title) || empty($content)) {
            Response::error('Title and announcement content are required.', 422);
        }

        if (empty($id)) {
            $id = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO announcements (id, title, content, category, is_pinned, status, author, created_at, updated_at)
                 VALUES (:id, :title, :content, :cat, :pinned, :st, :author, NOW(), NOW())',
                [
                    'id' => $id,
                    'title' => $title,
                    'content' => $content,
                    'cat' => $category,
                    'pinned' => $isPinned ? 1 : 0,
                    'st' => $status,
                    'author' => $admin['full_name'] ?? 'Super Admin',
                ]
            );
        } else {
            $this->db->execute(
                'UPDATE announcements SET title = :title, content = :content, category = :cat, is_pinned = :pinned, status = :st, updated_at = NOW() WHERE id = :id',
                [
                    'id' => $id,
                    'title' => $title,
                    'content' => $content,
                    'cat' => $category,
                    'pinned' => $isPinned ? 1 : 0,
                    'st' => $status,
                ]
            );
        }

        Response::success(['id' => $id], 'Announcement saved successfully.');
    }

    /**
     * 6. DELETE /api/admin/announcements/:id
     */
    public function deleteAnnouncement(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM announcements WHERE id = :id', ['id' => $id]);
        Response::success(['id' => $id], 'Announcement removed successfully.');
    }
}
