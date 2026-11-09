<?php
/**
 * @file AdminController.php
 * Super Administrator Global Management Controller
 * Real-time financial analytics, customer registry, staff RBAC, and gateway management
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Exception;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;

class AdminController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    public function overview(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        // 1. User Metrics
        $userStats = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_customers,
                SUM(CASE WHEN status = "active" AND role = "customer" THEN 1 ELSE 0 END) as active_customers,
                SUM(CASE WHEN status = "suspended" THEN 1 ELSE 0 END) as suspended_customers,
                SUM(CASE WHEN role = "customer" AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today_registrations
             FROM users'
        );

        // 2. Financial Metrics
        $walletStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(balance), 0) as total_wallet_balances 
             FROM wallets'
        );

        $txStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(CASE WHEN type = "credit" AND status = "successful" THEN amount ELSE 0 END), 0) as total_wallet_funding,
                COALESCE(SUM(CASE WHEN type = "debit" AND status = "successful" THEN amount ELSE 0 END), 0) as total_service_sales,
                COUNT(CASE WHEN status = "successful" THEN 1 END) as successful_transactions,
                COUNT(CASE WHEN status = "pending" THEN 1 END) as pending_transactions,
                COUNT(CASE WHEN status = "failed" THEN 1 END) as failed_transactions
             FROM transactions'
        );

        // 3. Telecom Order Profits
        $orderStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(cost_price), 0) as provider_expenditure,
                COALESCE(SUM(profit), 0) as gross_profit
             FROM telecom_orders 
             WHERE status = "successful"'
        );

        // 4. Verification Revenue & Wholesale Cost
        $vrfStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(cost), 0) as vrf_revenue,
                COALESCE(SUM(provider_cost), 0) as vrf_wholesale
             FROM verification_records 
             WHERE status = "completed"'
        );

        $pendingFundingCount = (int)$this->db->fetchOne(
            'SELECT COUNT(*) as count FROM manual_funding_requests WHERE status = "pending"'
        )['count'];

        // 5. Recent Registrations & Orders
        $recentUsers = $this->db->fetchAll(
            'SELECT id, full_name, email, phone_number, role, wallet_balance, kyc_status, status, created_at 
             FROM users 
             WHERE role = "customer" 
             ORDER BY created_at DESC LIMIT 5'
        );

        $recentOrders = $this->db->fetchAll(
            'SELECT o.id, u.full_name as customer_name, o.service_type, o.plan, o.amount, o.status, o.created_at
             FROM telecom_orders o
             LEFT JOIN users u ON u.id = o.user_id
             ORDER BY o.created_at DESC LIMIT 5'
        );

        // 6. Provider Operational Status
        $providers = $this->db->fetchAll(
            'SELECT id, name, provider_type, is_active, is_default, balance, last_ping_status, last_ping_latency, last_ping_at 
             FROM providers'
        );

        $totalSales = (float)($txStats['total_service_sales'] ?? 0);
        $totalExpenditure = (float)($orderStats['provider_expenditure'] ?? 0) + (float)($vrfStats['vrf_wholesale'] ?? 0);
        $grossProfit = (float)($orderStats['gross_profit'] ?? 0) + ((float)($vrfStats['vrf_revenue'] ?? 0) - (float)($vrfStats['vrf_wholesale'] ?? 0));

        Response::success([
            'metrics' => [
                'total_customers' => (int)($userStats['total_customers'] ?? 0),
                'active_customers' => (int)($userStats['active_customers'] ?? 0),
                'suspended_customers' => (int)($userStats['suspended_customers'] ?? 0),
                'total_wallet_balances' => (float)($walletStats['total_wallet_balances'] ?? 0),
                'total_wallet_funding' => (float)($txStats['total_wallet_funding'] ?? 0),
                'total_service_sales' => $totalSales,
                'provider_expenditure' => $totalExpenditure,
                'gross_profit' => $grossProfit,
                'successful_transactions' => (int)($txStats['successful_transactions'] ?? 0),
                'pending_transactions' => (int)($txStats['pending_transactions'] ?? 0),
                'failed_transactions' => (int)($txStats['failed_transactions'] ?? 0),
                'pending_funding_approvals' => $pendingFundingCount,
            ],
            'recent_registrations' => $recentUsers,
            'recent_orders' => $recentOrders,
            'providers' => $providers,
        ]);
    }

    public function customers(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $search = trim((string)$request->query('search', ''));
        $status = (string)$request->query('status', '');
        $limit = min(100, max(1, (int)$request->query('limit', 50)));

        $sql = 'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance, 
                       u.kyc_status, u.tier, u.status, u.created_at,
                       w.balance as live_balance,
                       p.nin, p.bvn, p.state
                FROM users u
                LEFT JOIN wallets w ON w.user_id = u.id
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE u.role = "customer" ';
        $params = [];

        if (!empty($search)) {
            $sql .= 'AND (u.full_name LIKE :s1 OR u.email LIKE :s2 OR u.phone_number LIKE :s3) ';
            $params['s1'] = "%{$search}%";
            $params['s2'] = "%{$search}%";
            $params['s3'] = "%{$search}%";
        }

        if (!empty($status)) {
            $sql .= 'AND u.status = :st ';
            $params['st'] = $status;
        }

        $sql .= 'ORDER BY u.created_at DESC LIMIT ' . (int)$limit;

        $rows = $this->db->fetchAll($sql, $params);
        foreach ($rows as &$r) {
            $r['wallet_balance'] = (float)($r['live_balance'] ?? $r['wallet_balance'] ?? 0);
            unset($r['live_balance']);
        }

        Response::success(['customers' => $rows]);
    }

    public function updateCustomerStatus(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? '';
        $newStatus = (string)$request->input('status', 'active');
        $newTier = (int)$request->input('tier', 1);

        if (!in_array($newStatus, ['active', 'suspended'], true)) {
            Response::error('Invalid customer status.', 422);
        }

        $this->db->execute(
            'UPDATE users SET status = :st, tier = :tier, updated_at = NOW() WHERE id = :id',
            ['st' => $newStatus, 'tier' => $newTier, 'id' => $customerId]
        );

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "CUSTOMER_STATUS_UPDATED", :meta, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $admin['id'],
                'email' => $admin['email'],
                'meta' => json_encode(['customer_id' => $customerId, 'status' => $newStatus, 'tier' => $newTier]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success(null, "Customer account updated to {$newStatus}");
    }

    public function creditDebitUser(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = (string)$request->input('user_id', '');
        $type = strtolower((string)$request->input('type', 'credit'));
        $amount = (float)$request->input('amount', 0);
        $reason = trim((string)$request->input('reason', 'Administrative Balance Adjustment'));

        if (empty($customerId) || $amount <= 0) {
            Response::error('User ID and positive adjustment amount are required.', 422);
        }

        $targetUser = $this->db->fetchOne('SELECT * FROM users WHERE id = :id', ['id' => $customerId]);
        if (!$targetUser) {
            Response::error('Customer not found.', 404);
        }

        $reference = 'ADMIN_ADJ_' . strtoupper(bin2hex(random_bytes(6)));

        if ($type === 'credit') {
            $res = $this->walletService->credit(
                $customerId,
                $amount,
                'manual_adjustment',
                $reference,
                "Admin adjustment: {$reason}",
                'internal',
                ['admin_id' => $admin['id'], 'admin_email' => $admin['email']]
            );
        } else {
            $res = $this->walletService->debit(
                $customerId,
                $amount,
                'manual_adjustment',
                $reference,
                "Admin adjustment: {$reason}",
                'internal',
                ['admin_id' => $admin['id'], 'admin_email' => $admin['email']]
            );
        }

        Response::success($res, "Customer wallet successfully {$type}ed with ₦{$amount}");
    }

    public function manualFundingRequests(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $rows = $this->db->fetchAll(
            'SELECT m.*, u.full_name, u.email, u.phone_number
             FROM manual_funding_requests m
             LEFT JOIN users u ON u.id = m.user_id
             ORDER BY m.created_at DESC LIMIT 50'
        );

        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
        }

        Response::success(['requests' => $rows]);
    }

    public function approveFunding(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $requestId = $params['id'] ?? '';
        $action = (string)$request->input('action', 'approve'); // approve or reject

        $req = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
        if (!$req) {
            Response::error('Funding request not found.', 404);
        }

        if ($req['status'] !== 'pending') {
            Response::error("Request already {$req['status']}.", 400);
        }

        if ($action === 'approve') {
            $amount = (float)$req['amount'];
            $reference = 'MAN_CRED_' . strtoupper(bin2hex(random_bytes(6)));

            // Execute atomic credit with row locking
            $this->walletService->credit(
                $req['user_id'],
                $amount,
                'funding',
                $reference,
                "Approved manual transfer deposit ({$req['bank_name']})",
                'manual_transfer',
                ['funding_request_id' => $requestId]
            );

            $this->db->execute(
                'UPDATE manual_funding_requests 
                 SET status = "approved", reviewed_by = :admin, reviewed_at = NOW() 
                 WHERE id = :id',
                ['admin' => $admin['id'], 'id' => $requestId]
            );

            // Send in-app notification to customer
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Manual Deposit Approved", :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $req['user_id'],
                    'msg' => "Your manual transfer deposit of ₦" . number_format($amount, 2) . " has been verified and credited to your wallet balance.",
                ]
            );

            Response::success(null, "Manual funding request approved and ₦{$amount} credited to customer.");
        } else {
            $this->db->execute(
                'UPDATE manual_funding_requests 
                 SET status = "rejected", reviewed_by = :admin, reviewed_at = NOW() 
                 WHERE id = :id',
                ['admin' => $admin['id'], 'id' => $requestId]
            );

            Response::success(null, 'Manual funding request marked as rejected.');
        }
    }
}
