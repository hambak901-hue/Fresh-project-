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
}
