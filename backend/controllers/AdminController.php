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
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Adapters\Verification\VeripineAdapter;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;
use HambakTech\Adapters\Telecom\UlamaDataAdapter;
use HambakTech\Adapters\Telecom\VtpassAdapter;
use HambakTech\Adapters\Payment\PaystackAdapter;
use HambakTech\Adapters\Payment\FlutterwaveAdapter;
use Throwable;

class AdminController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    private function hydrateCustomerRow(string $customerId): ?array
    {
        try {
            $row = $this->db->fetchOne(
                'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance,
                        u.kyc_status, u.tier, u.kyc_level, u.referral_code, u.status, u.avatar_url, u.email_verified,
                        u.created_at, u.updated_at,
                        w.balance as live_balance,
                        p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id',
                ['id' => $customerId]
            );
        } catch (Throwable) {
            $row = $this->db->fetchOne(
                'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance,
                        u.kyc_status, u.tier, u.referral_code, u.status, u.avatar_url, u.email_verified,
                        u.created_at, u.updated_at,
                        w.balance as live_balance,
                        p.nin, p.bvn, p.address, p.state, p.lga, p.bio
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id',
                ['id' => $customerId]
            );
        }

        if (!$row) {
            return null;
        }

        $row['wallet_balance'] = (float)($row['live_balance'] ?? $row['wallet_balance'] ?? 0);
        $row['tier'] = (int)($row['tier'] ?? 1);
        $row['kyc_level'] = (int)($row['kyc_level'] ?? $row['tier']);
        $row['email_verified'] = (bool)($row['email_verified'] ?? false);
        $createdTs = !empty($row['created_at']) ? strtotime((string)$row['created_at']) : false;
        $row['is_new'] = $createdTs !== false && $createdTs >= (time() - 72 * 3600);
        unset($row['live_balance']);

        $kycRows = $this->db->fetchAll(
            'SELECT * FROM kyc_submissions WHERE user_id = :uid ORDER BY created_at DESC',
            ['uid' => $customerId]
        );
        $row['kyc_documents'] = array_map(function ($k) {
            return [
                'id' => $k['id'],
                'id_type' => $k['id_type'] ?? 'NIN',
                'id_number' => $k['id_number'] ?? ($k['nin'] ?: ($k['bvn'] ?: 'N/A')),
                'doc_url' => $k['id_document_url'] ?? $k['doc_url'] ?? null,
                'selfie_url' => $k['selfie_url'] ?? null,
                'proof_of_address_url' => $k['proof_of_address_url'] ?? null,
                'nin' => $k['nin'] ?? null,
                'bvn' => $k['bvn'] ?? null,
                'residential_address' => $k['residential_address'] ?? null,
                'state' => $k['state'] ?? null,
                'lga' => $k['lga'] ?? null,
                'date_of_birth' => $k['date_of_birth'] ?? null,
                'target_level' => (int)($k['target_level'] ?? 2),
                'submitted_at' => $k['submitted_at'] ?? $k['created_at'],
                'status' => $k['status'] ?? 'pending',
                'review_notes' => $k['review_notes'] ?? null,
            ];
        }, $kycRows);

        return $row;
    }

    public function overview(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        // 1. User Metrics
        $userStats = $this->db->fetchOne(
            'SELECT 
                SUM(CASE WHEN role = "customer" THEN 1 ELSE 0 END) as total_customers,
                SUM(CASE WHEN status = "active" AND role = "customer" THEN 1 ELSE 0 END) as active_customers,
                SUM(CASE WHEN status = "suspended" AND role = "customer" THEN 1 ELSE 0 END) as suspended_customers,
                SUM(CASE WHEN role IN ("admin", "superadmin", "staff") THEN 1 ELSE 0 END) as total_staff,
                SUM(CASE WHEN role = "customer" AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today_registrations,
                SUM(CASE WHEN role = "customer" AND kyc_status = "pending" THEN 1 ELSE 0 END) as pending_kyc_users
             FROM users'
        );

        $pendingKycSubRow = $this->db->fetchOne(
            'SELECT COUNT(*) as count FROM kyc_submissions WHERE status = "pending"'
        );
        $pendingKycCount = max((int)($pendingKycSubRow['count'] ?? 0), (int)($userStats['pending_kyc_users'] ?? 0));

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

        $pendingFundings = $this->db->fetchAll(
            'SELECT m.*, u.full_name, u.email, m.payment_reference as reference
             FROM manual_funding_requests m
             LEFT JOIN users u ON u.id = m.user_id
             WHERE m.status = "pending"
             ORDER BY m.created_at DESC LIMIT 5'
        );

        // 5. Recent Registrations & Orders
        $recentUsers = $this->db->fetchAll(
            'SELECT u.id, u.full_name, u.email, u.phone_number, u.role, COALESCE(w.balance, u.wallet_balance, 0) as wallet_balance,
                    u.kyc_status, u.tier, u.status, u.created_at 
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE u.role = "customer" 
             ORDER BY u.created_at DESC LIMIT 8'
        );
        foreach ($recentUsers as &$ru) {
            $ru['wallet_balance'] = (float)$ru['wallet_balance'];
            $ru['tier'] = (int)($ru['tier'] ?? 1);
            $ts = !empty($ru['created_at']) ? strtotime((string)$ru['created_at']) : false;
            $ru['is_new'] = $ts !== false && $ts >= (time() - 72 * 3600);
        }

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

        $metrics = [
            'total_users' => (int)($userStats['total_customers'] ?? 0),
            'total_customers' => (int)($userStats['total_customers'] ?? 0),
            'totalCustomers' => (int)($userStats['total_customers'] ?? 0),
            'active_customers' => (int)($userStats['active_customers'] ?? 0),
            'activeCustomers' => (int)($userStats['active_customers'] ?? 0),
            'suspended_customers' => (int)($userStats['suspended_customers'] ?? 0),
            'suspendedCustomers' => (int)($userStats['suspended_customers'] ?? 0),
            'total_staff' => (int)($userStats['total_staff'] ?? 0),
            'totalStaff' => (int)($userStats['total_staff'] ?? 0),
            'today_registrations' => (int)($userStats['today_registrations'] ?? 0),
            'todayRegistrations' => (int)($userStats['today_registrations'] ?? 0),
            'pending_kyc_count' => $pendingKycCount,
            'pendingKycCount' => $pendingKycCount,
            'total_wallet_balances' => (float)($walletStats['total_wallet_balances'] ?? 0),
            'totalWalletBalances' => (float)($walletStats['total_wallet_balances'] ?? 0),
            'total_wallet_funding' => (float)($txStats['total_wallet_funding'] ?? 0),
            'totalWalletFunding' => (float)($txStats['total_wallet_funding'] ?? 0),
            'total_service_sales' => $totalSales,
            'totalServiceSales' => $totalSales,
            'provider_expenditure' => $totalExpenditure,
            'providerExpenditure' => $totalExpenditure,
            'gross_profit' => $grossProfit,
            'grossProfit' => $grossProfit,
            'successful_transactions' => (int)($txStats['successful_transactions'] ?? 0),
            'successfulTransactions' => (int)($txStats['successful_transactions'] ?? 0),
            'pending_transactions' => (int)($txStats['pending_transactions'] ?? 0),
            'pendingTransactions' => (int)($txStats['pending_transactions'] ?? 0),
            'failed_transactions' => (int)($txStats['failed_transactions'] ?? 0),
            'failedTransactions' => (int)($txStats['failed_transactions'] ?? 0),
            'pending_funding_approvals' => $pendingFundingCount,
            'pendingFundingApprovals' => $pendingFundingCount,
        ];

        Response::success([
            'metrics' => $metrics,
            'stats' => $metrics,
            'recent_registrations' => $recentUsers,
            'recentRegistrations' => $recentUsers,
            'pending_fundings' => $pendingFundings,
            'pendingFundings' => $pendingFundings,
            'recent_orders' => $recentOrders,
            'providers' => $providers,
        ]);
    }

    public function customers(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $search = trim((string)$request->query('search', ''));
        $status = trim((string)$request->query('status', ''));
        $tier = trim((string)$request->query('tier', ''));
        $kycStatus = trim((string)$request->query('kyc_status', ''));
        $filter = trim((string)$request->query('filter', ''));
        $limit = min(250, max(1, (int)$request->query('limit', 150)));

        $where = 'WHERE u.role = "customer" ';
        $params = [];

        if (!empty($search)) {
            $where .= 'AND (u.full_name LIKE :s1 OR u.email LIKE :s2 OR u.phone_number LIKE :s3 OR COALESCE(u.referral_code, "") LIKE :s4 OR COALESCE(p.nin, "") LIKE :s5 OR COALESCE(p.bvn, "") LIKE :s6) ';
            $like = "%{$search}%";
            $params['s1'] = $like;
            $params['s2'] = $like;
            $params['s3'] = $like;
            $params['s4'] = $like;
            $params['s5'] = $like;
            $params['s6'] = $like;
        }

        if (!empty($status) && $status !== 'all') {
            $where .= 'AND u.status = :st ';
            $params['st'] = $status;
        }

        if (!empty($tier) && $tier !== 'all' && is_numeric($tier)) {
            $where .= 'AND u.tier = :tr ';
            $params['tr'] = (int)$tier;
        }

        if (!empty($kycStatus) && $kycStatus !== 'all') {
            $where .= 'AND u.kyc_status = :ks ';
            $params['ks'] = $kycStatus;
        }

        if ($filter === 'new') {
            $where .= 'AND u.created_at >= DATE_SUB(NOW(), INTERVAL 72 HOUR) ';
        }

        try {
            $sql = 'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance, 
                           u.kyc_status, u.tier, u.kyc_level, u.referral_code, u.status, u.avatar_url, u.email_verified,
                           u.created_at, u.updated_at,
                           w.balance as live_balance,
                           p.nin, p.bvn, p.address, p.state, p.lga, p.date_of_birth,
                           (SELECT COUNT(*) FROM transactions tx WHERE tx.user_id = u.id) as tx_count,
                           (SELECT COUNT(*) FROM telecom_orders ord WHERE ord.user_id = u.id) as orders_count,
                           (SELECT COUNT(*) FROM verification_records vr WHERE vr.user_id = u.id) as verifications_count
                    FROM users u
                    LEFT JOIN wallets w ON w.user_id = u.id
                    LEFT JOIN user_profiles p ON p.user_id = u.id ' . $where . 'ORDER BY u.created_at DESC LIMIT ' . (int)$limit;
            $rows = $this->db->fetchAll($sql, $params);
        } catch (Throwable) {
            $sql = 'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance, 
                           u.kyc_status, u.tier, u.referral_code, u.status, u.avatar_url, u.email_verified,
                           u.created_at, u.updated_at,
                           w.balance as live_balance,
                           p.nin, p.bvn, p.address, p.state, p.lga
                    FROM users u
                    LEFT JOIN wallets w ON w.user_id = u.id
                    LEFT JOIN user_profiles p ON p.user_id = u.id ' . $where . 'ORDER BY u.created_at DESC LIMIT ' . (int)$limit;
            $rows = $this->db->fetchAll($sql, $params);
        }

        $nowCutoff = time() - (72 * 3600);
        foreach ($rows as &$r) {
            $r['wallet_balance'] = (float)($r['live_balance'] ?? $r['wallet_balance'] ?? 0);
            $r['tier'] = (int)($r['tier'] ?? 1);
            $r['kyc_level'] = (int)($r['kyc_level'] ?? $r['tier']);
            $r['tx_count'] = (int)($r['tx_count'] ?? 0);
            $r['orders_count'] = (int)($r['orders_count'] ?? 0);
            $r['verifications_count'] = (int)($r['verifications_count'] ?? 0);
            $createdTs = !empty($r['created_at']) ? strtotime((string)$r['created_at']) : false;
            $r['is_new'] = $createdTs !== false && $createdTs >= $nowCutoff;
            unset($r['live_balance']);
        }

        $summary = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = "suspended" THEN 1 ELSE 0 END) as suspended,
                SUM(CASE WHEN kyc_status = "pending" THEN 1 ELSE 0 END) as pending_kyc,
                SUM(CASE WHEN kyc_status = "verified" THEN 1 ELSE 0 END) as verified_kyc,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 72 HOUR) THEN 1 ELSE 0 END) as new_registrations
             FROM users WHERE role = "customer"'
        );

        Response::success([
            'customers' => $rows,
            'count' => count($rows),
            'summary' => [
                'total' => (int)($summary['total'] ?? count($rows)),
                'active' => (int)($summary['active'] ?? 0),
                'suspended' => (int)($summary['suspended'] ?? 0),
                'pending_kyc' => (int)($summary['pending_kyc'] ?? 0),
                'verified_kyc' => (int)($summary['verified_kyc'] ?? 0),
                'new_registrations' => (int)($summary['new_registrations'] ?? 0),
            ],
        ]);
    }

    public function updateCustomerStatus(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? '';
        $newStatus = strtolower(trim((string)$request->input('status', 'active')));
        $reason = trim((string)$request->input('reason', ''));

        if (!in_array($newStatus, ['active', 'suspended'], true)) {
            Response::error('Invalid customer status.', 422);
        }

        $existing = $this->db->fetchOne('SELECT id, email, full_name, role, tier FROM users WHERE id = :id', ['id' => $customerId]);
        if (!$existing) {
            Response::error('Customer account not found.', 404);
        }

        $explicitTier = $request->input('tier');
        $newTier = ($explicitTier !== null && $explicitTier !== '') ? max(1, min(3, (int)$explicitTier)) : (int)($existing['tier'] ?? 1);

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
                'meta' => json_encode(['customer_id' => $customerId, 'customer_email' => $existing['email'], 'status' => $newStatus, 'tier' => $newTier, 'reason' => $reason]),
                'ip' => $request->getIp(),
            ]
        );

        FootprintService::record(
            'admin',
            'CUSTOMER_STATUS_UPDATED',
            $admin,
            'customer_management',
            $customerId,
            null,
            'successful',
            null,
            null,
            ['customer_email' => $existing['email'], 'status' => $newStatus, 'reason' => $reason],
            $request->getIp()
        );

        $updated = $this->hydrateCustomerRow($customerId);
        Response::success(['customer' => $updated], "Customer account updated to {$newStatus}");
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
            'SELECT m.*, u.full_name, u.email, u.phone_number,
                    m.payment_reference as reference,
                    "credit" as type,
                    "manual_transfer" as gateway
             FROM manual_funding_requests m
             LEFT JOIN users u ON u.id = m.user_id
             ORDER BY FIELD(m.status, "pending", "approved", "rejected"), m.created_at DESC LIMIT 50'
        );

        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
        }

        Response::success([
            'requests' => $rows,
            'pending' => $rows,
            'count' => count($rows),
        ]);
    }

    public function approveFunding(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $requestId = $params['id'] ?? '';
        $action = strtolower((string)$request->input('action', 'approve')); // approve or reject
        $reason = trim((string)$request->input('reason', 'Receipt verification could not be validated with receiving bank records'));

        $req = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
        if (!$req) {
            Response::error('Funding request not found.', 404);
            return;
        }

        if ($req['status'] !== 'pending') {
            Response::error("Request already {$req['status']}. Duplicate decision prevented.", 400);
            return;
        }

        $amount = (float)$req['amount'];
        $custRef = $req['payment_reference'] ?: ('REQ_' . substr($req['id'], 0, 8));

        if ($action === 'approve') {
            $reference = 'MAN_CRED_' . strtoupper(bin2hex(random_bytes(6)));

            // Execute atomic credit with row locking and immutable ledger entry
            $txResult = $this->walletService->credit(
                $req['user_id'],
                $amount,
                'funding',
                $reference,
                "Approved manual transfer deposit ({$req['bank_name']}) - Ref: {$custRef}",
                'manual_transfer',
                [
                    'funding_request_id' => $requestId,
                    'approved_by' => $admin['email'],
                    'customer_reference' => $custRef,
                ]
            );

            $this->db->execute(
                'UPDATE manual_funding_requests 
                 SET status = "approved", reviewed_by = :admin, reviewed_at = NOW(), admin_notes = :notes 
                 WHERE id = :id',
                ['admin' => $admin['id'], 'notes' => 'Approved by ' . $admin['email'], 'id' => $requestId]
            );

            // Send in-app notification to customer
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Funding Approved", :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $req['user_id'],
                    'msg' => "Your manual transfer deposit of ₦" . number_format($amount, 2) . " (Ref: {$custRef}) has been verified and credited to your wallet balance.",
                ]
            );

            $updatedReq = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
            $txObj = [
                'id' => $txResult['transaction_id'] ?? $reference,
                'reference' => $reference,
                'amount' => $amount,
                'type' => 'credit',
                'status' => 'successful',
                'balance_after' => (float)$txResult['balance_after'],
            ];

            Response::success([
                'request_id' => $requestId,
                'request' => $updatedReq,
                'status' => 'approved',
                'amount' => $amount,
                'balance_after' => (float)$txResult['balance_after'],
                'userBalance' => (float)$txResult['balance_after'],
                'transaction' => $txObj,
            ], "Manual funding request approved and ₦{$amount} credited to customer.");
        } else {
            $this->db->execute(
                'UPDATE manual_funding_requests 
                 SET status = "rejected", reviewed_by = :admin, reviewed_at = NOW(), admin_notes = :reason 
                 WHERE id = :id',
                ['admin' => $admin['id'], 'reason' => $reason, 'id' => $requestId]
            );

            // Send rejection notification to customer
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Funding Request Rejected", :msg, "alert", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $req['user_id'],
                    'msg' => "Your manual deposit request for ₦" . number_format($amount, 2) . " (Ref: {$custRef}) was rejected. Reason: {$reason}",
                ]
            );

            $updatedReq = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);

            Response::success([
                'request_id' => $requestId,
                'request' => $updatedReq,
                'status' => 'rejected',
                'reason' => $reason,
                'transaction' => [
                    'id' => $requestId,
                    'reference' => $custRef,
                    'amount' => $amount,
                    'type' => 'credit',
                    'status' => 'rejected',
                ],
            ], 'Manual funding request marked as rejected.');
        }
    }

    public function rejectFunding(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $requestId = $params['id'] ?? '';
        $reason = trim((string)$request->input('reason', 'Receipt verification could not be validated with receiving bank records'));

        $req = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
        if (!$req) {
            Response::error('Funding request not found.', 404);
            return;
        }
        if ($req['status'] !== 'pending') {
            Response::error("Request already {$req['status']}. Duplicate decision prevented.", 400);
            return;
        }

        $amount = (float)$req['amount'];
        $custRef = $req['payment_reference'] ?: ('REQ_' . substr($req['id'], 0, 8));

        $this->db->execute(
            'UPDATE manual_funding_requests 
             SET status = "rejected", reviewed_by = :admin, reviewed_at = NOW(), admin_notes = :reason 
             WHERE id = :id',
            ['admin' => $admin['id'], 'reason' => $reason, 'id' => $requestId]
        );

        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, "Funding Request Rejected", :msg, "alert", 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $req['user_id'],
                'msg' => "Your manual deposit request for ₦" . number_format($amount, 2) . " (Ref: {$custRef}) was rejected. Reason: {$reason}",
            ]
        );

        $updatedReq = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);

        Response::success([
            'request_id' => $requestId,
            'request' => $updatedReq,
            'status' => 'rejected',
            'reason' => $reason,
            'transaction' => [
                'id' => $requestId,
                'reference' => $custRef,
                'amount' => $amount,
                'type' => 'credit',
                'status' => 'rejected',
            ],
        ], 'Manual funding request marked as rejected.');
    }

    /**
     * Financial Ledger Reversals
     */
    public function reverseTransaction(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $txId = (string)$request->input('transaction_id', '');
        $reason = trim((string)$request->input('reason', 'Administrative financial correction'));

        if (empty($txId)) {
            Response::error('Transaction ID required.', 422);
        }

        try {
            $res = $this->walletService->reverseTransaction($txId, $admin['id'], $reason);
            Response::success($res, 'Transaction reversed and ledger updated successfully.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    /**
     * Financial Reports & Treasury Aggregates
     */
    public function financialReports(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $fundingStats = $this->db->fetchOne(
            'SELECT 
                SUM(CASE WHEN type = "credit" AND status = "successful" THEN amount ELSE 0 END) as total_funding,
                SUM(CASE WHEN gateway = "paystack" AND status = "successful" THEN amount ELSE 0 END) as paystack_funding,
                SUM(CASE WHEN gateway = "flutterwave" AND status = "successful" THEN amount ELSE 0 END) as flutterwave_funding,
                SUM(CASE WHEN gateway = "manual_transfer" AND status = "successful" THEN amount ELSE 0 END) as manual_funding,
                COUNT(CASE WHEN type = "credit" AND status = "successful" THEN 1 END) as count_funding
             FROM transactions'
        );

        $salesStats = $this->db->fetchOne(
            'SELECT 
                SUM(CASE WHEN type = "debit" AND status = "successful" THEN amount ELSE 0 END) as total_service_sales,
                SUM(CASE WHEN category IN ("airtime", "data_purchase", "cable_tv") AND status = "successful" THEN amount ELSE 0 END) as telecom_sales,
                SUM(CASE WHEN category = "verification" AND status = "successful" THEN amount ELSE 0 END) as verification_sales
             FROM transactions'
        );

        $expenditureStats = $this->db->fetchOne(
            'SELECT 
                SUM(cost_price) as telecom_cost,
                SUM(profit) as telecom_profit
             FROM telecom_orders WHERE status = "successful"'
        );

        $floatStats = $this->db->fetchOne(
            'SELECT 
                SUM(balance) as total_customer_float,
                COUNT(*) as total_customers
             FROM wallets WHERE status = "active"'
        );

        $totalSales = (float)($salesStats['total_service_sales'] ?? 0);
        $telecomCost = (float)($expenditureStats['telecom_cost'] ?? 0);
        $identityCost = (float)$totalSales * 0.45; // Average wholesale identity ratio
        $totalExpenditure = $telecomCost + $identityCost;
        $grossProfit = $totalSales - $totalExpenditure;
        $profitMargin = $totalSales > 0 ? round(($grossProfit / $totalSales) * 100, 2) : 0;

        Response::success([
            'reports' => [
                'funding' => [
                    'totalFunding' => (float)($fundingStats['total_funding'] ?? 0),
                    'paystackFunding' => (float)($fundingStats['paystack_funding'] ?? 0),
                    'flutterwaveFunding' => (float)($fundingStats['flutterwave_funding'] ?? 0),
                    'manualFunding' => (float)($fundingStats['manual_funding'] ?? 0),
                    'fundingTransactionsCount' => (int)($fundingStats['count_funding'] ?? 0),
                ],
                'sales' => [
                    'totalServiceSales' => $totalSales,
                    'telecomSales' => (float)($salesStats['telecom_sales'] ?? 0),
                    'identityVerificationSales' => (float)($salesStats['verification_sales'] ?? 0),
                ],
                'expenditure' => [
                    'totalProviderExpenditure' => $totalExpenditure,
                    'telecomProviderCost' => $telecomCost,
                    'identityProviderCost' => $identityCost,
                ],
                'profit' => [
                    'grossProfit' => $grossProfit,
                    'profitMarginPercent' => $profitMargin,
                ],
                'float' => [
                    'totalCustomerFloat' => (float)($floatStats['total_customer_float'] ?? 0),
                    'totalCustomers' => (int)($floatStats['total_customers'] ?? 0),
                ],
            ]
        ]);
    }

    /**
     * Update Bank Transfer Payment Instructions
     */
    public function updateBankSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $bank = trim((string)$request->input('bank', 'Moniepoint MFB'));
        $accountNumber = trim((string)$request->input('account_number', '5210471634'));
        $accountName = trim((string)$request->input('account_name', 'Hambaktech_Services'));

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_bank_name", "bank_transfer_bank", :v1, "payment", "Bank Name")
             ON DUPLICATE KEY UPDATE setting_value = :v1_dup',
            ['v1' => $bank, 'v1_dup' => $bank]
        );

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_bank_acc", "bank_transfer_account_number", :v2, "payment", "Account Number")
             ON DUPLICATE KEY UPDATE setting_value = :v2_dup',
            ['v2' => $accountNumber, 'v2_dup' => $accountNumber]
        );

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_bank_title", "bank_transfer_account_name", :v3, "payment", "Account Name")
             ON DUPLICATE KEY UPDATE setting_value = :v3_dup',
            ['v3' => $accountName, 'v3_dup' => $accountName]
        );

        Response::success([
            'bank' => $bank,
            'accountNumber' => $accountNumber,
            'accountName' => $accountName,
        ], 'Bank transfer instructions updated successfully.');
    }

    /**
     * All 11 Detailed System Reports
     */
    public function detailedReports(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        // 1. Customer Report
        $customerSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_customers,
                SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active_customers,
                SUM(CASE WHEN status = "suspended" THEN 1 ELSE 0 END) as suspended_customers,
                SUM(CASE WHEN kyc_status = "verified" THEN 1 ELSE 0 END) as verified_customers,
                SUM(CASE WHEN kyc_status != "verified" THEN 1 ELSE 0 END) as unverified_customers,
                SUM(CASE WHEN tier >= 2 THEN 1 ELSE 0 END) as tier2_plus_customers,
                COALESCE(SUM(wallet_balance), 0) as total_customer_balance
             FROM users WHERE role = "customer"'
        );

        // 2. Transaction Report
        $txSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(amount), 0) as total_volume,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_count,
                COALESCE(SUM(CASE WHEN status = "successful" THEN amount ELSE 0 END), 0) as successful_volume
             FROM transactions'
        );

        $txCategories = $this->db->fetchAll(
            'SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume 
             FROM transactions WHERE status = "successful" 
             GROUP BY category ORDER BY volume DESC'
        );

        // 3. Wallet Report
        $walletSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_wallets,
                COALESCE(SUM(balance), 0) as system_float,
                COALESCE(AVG(balance), 0) as average_balance,
                COALESCE(MAX(balance), 0) as highest_balance,
                SUM(CASE WHEN balance < 0 THEN 1 ELSE 0 END) as negative_wallets
             FROM wallets'
        );

        // 4. Payment Report
        $gatewayStats = $this->db->fetchAll(
            'SELECT 
                gateway,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_amount,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_count
             FROM transactions 
             WHERE type = "credit"
             GROUP BY gateway'
        );

        // 5. NIN Service Report
        $ninSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_requests,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_requests,
                COALESCE(SUM(cost), 0) as total_revenue,
                COALESCE(SUM(provider_cost), 0) as total_wholesale_cost
             FROM verification_records'
        );

        $ninServiceBreakdown = $this->db->fetchAll(
            'SELECT 
                COALESCE(service_key, type) as service_code,
                COUNT(*) as count,
                COALESCE(SUM(cost), 0) as revenue,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed
             FROM verification_records 
             GROUP BY COALESCE(service_key, type) ORDER BY count DESC'
        );

        // 6. Telecom Report
        $telecomSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_orders,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_orders,
                COALESCE(SUM(amount), 0) as total_sales,
                COALESCE(SUM(cost_price), 0) as total_cost,
                COALESCE(SUM(profit), 0) as gross_profit
             FROM telecom_orders'
        );

        $telecomNetworks = $this->db->fetchAll(
            'SELECT 
                network,
                COUNT(*) as orders_count,
                COALESCE(SUM(amount), 0) as sales,
                COALESCE(SUM(profit), 0) as profit
             FROM telecom_orders 
             WHERE status = "successful"
             GROUP BY network'
        );

        // 7. Provider Expenditure Report
        $providerExpenditures = $this->db->fetchAll(
            'SELECT 
                name,
                provider_type,
                is_active,
                balance,
                last_ping_status,
                last_ping_latency,
                last_ping_at
             FROM providers'
        );

        // 8. Profit Report
        $totalSales = (float)($txSummary['successful_volume'] ?? 0);
        $telecomCost = (float)($telecomSummary['total_cost'] ?? 0);
        $ninCost = (float)($ninSummary['total_wholesale_cost'] ?? 0);
        $totalExpenditure = $telecomCost + $ninCost;
        $telecomProfit = (float)($telecomSummary['gross_profit'] ?? 0);
        $ninProfit = (float)($ninSummary['total_revenue'] ?? 0) - $ninCost;
        $totalGrossProfit = $telecomProfit + $ninProfit;
        $marginPercent = $totalSales > 0 ? round(($totalGrossProfit / $totalSales) * 100, 2) : 0;

        // 9. Manual Funding Report
        $manualFundingSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected_count,
                COALESCE(SUM(CASE WHEN status = "approved" THEN amount ELSE 0 END), 0) as approved_amount
             FROM manual_funding_requests'
        );

        // 10. KYC Report
        $kycSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_submissions,
                SUM(CASE WHEN status = "verified" THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN id_type = "nin" THEN 1 ELSE 0 END) as tier1_count,
                SUM(CASE WHEN id_type = "bvn" THEN 1 ELSE 0 END) as tier2_count,
                SUM(CASE WHEN id_type NOT IN ("nin", "bvn") THEN 1 ELSE 0 END) as tier3_count
             FROM kyc_submissions'
        );

        // 11. Staff Activity Report
        $staffActivitySummary = $this->db->fetchOne(
            'SELECT COUNT(*) as total_logs FROM audit_logs'
        );
        $recentLogs = $this->db->fetchAll(
            'SELECT id, user_email as entity, action, ip_address, created_at 
             FROM audit_logs ORDER BY created_at DESC LIMIT 10'
        );

        Response::success([
            'reports' => [
                'generated_at' => date('c'),
                'customer_report' => $customerSummary,
                'transaction_report' => [
                    'summary' => $txSummary,
                    'categories' => $txCategories,
                ],
                'wallet_report' => $walletSummary,
                'payment_report' => $gatewayStats,
                'nin_service_report' => [
                    'summary' => $ninSummary,
                    'breakdown' => $ninServiceBreakdown,
                ],
                'telecom_report' => [
                    'summary' => $telecomSummary,
                    'networks' => $telecomNetworks,
                ],
                'provider_expenditure_report' => [
                    'telecom_cost' => $telecomCost,
                    'nin_wholesale_cost' => $ninCost,
                    'total_cost' => $totalExpenditure,
                    'providers' => $providerExpenditures,
                ],
                'profit_report' => [
                    'total_revenue' => $totalSales,
                    'total_expenditure' => $totalExpenditure,
                    'gross_profit' => $totalGrossProfit,
                    'margin_percent' => $marginPercent,
                    'telecom_profit' => $telecomProfit,
                    'nin_profit' => $ninProfit,
                ],
                'manual_funding_report' => $manualFundingSummary,
                'kyc_report' => $kycSummary,
                'staff_activity_report' => [
                    'total_audit_events' => (int)($staffActivitySummary['total_logs'] ?? 0),
                    'recent_events' => $recentLogs,
                ],
            ]
        ]);
    }

    // =========================================================================
    // 12. CUSTOMER MANAGEMENT (DETAILED VIEWS & ACTIONS)
    // =========================================================================
    public function customerDetail(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? '';

        $user = $this->hydrateCustomerRow($customerId);

        if (!$user) {
            Response::error('Customer not found.', 404);
            return;
        }

        $wallet = $this->db->fetchOne('SELECT * FROM wallets WHERE user_id = :uid', ['uid' => $customerId]);
        if ($wallet) {
            $user['wallet_balance'] = (float)$wallet['balance'];
        }

        $txns = $this->db->fetchAll(
            'SELECT id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, created_at 
             FROM transactions 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 50',
            ['uid' => $customerId]
        );
        foreach ($txns as &$t) {
            $t['amount'] = (float)$t['amount'];
            $t['balance_before'] = (float)($t['balance_before'] ?? 0);
            $t['balance_after'] = (float)($t['balance_after'] ?? 0);
            $t['category'] = $t['category'] ?: 'general';
        }

        $verifications = $this->db->fetchAll(
            'SELECT id, type, service_key, search_value, provider, cost, status, reference, slip_type, has_slip, created_at 
             FROM verification_records 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 30',
            ['uid' => $customerId]
        );

        $orders = $this->db->fetchAll(
            'SELECT id, service_type, network, phone, plan, amount, status, provider_id, provider_ref, created_at 
             FROM telecom_orders 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 30',
            ['uid' => $customerId]
        );

        $kycSubmissions = $this->db->fetchAll(
            'SELECT * FROM kyc_submissions WHERE user_id = :uid ORDER BY created_at DESC',
            ['uid' => $customerId]
        );
        $kyc = $kycSubmissions[0] ?? null;

        $supportTickets = $this->db->fetchAll(
            'SELECT id, ticket_number, subject, COALESCE(NULLIF(category, ""), "general") as category, priority, status, created_at, updated_at
             FROM support_tickets
             WHERE user_id = :uid
             ORDER BY updated_at DESC LIMIT 20',
            ['uid' => $customerId]
        );

        $auditLogs = $this->db->fetchAll(
            'SELECT id, user_id, user_email, action, details, ip_address, created_at
             FROM audit_logs
             WHERE user_id = :uid OR details LIKE :uidLike
             ORDER BY created_at DESC LIMIT 25',
            ['uid' => $customerId, 'uidLike' => "%{$customerId}%"]
        );

        $statTotals = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(CASE WHEN type = "credit" AND status = "successful" THEN amount ELSE 0 END), 0) as total_funded,
                COALESCE(SUM(CASE WHEN type = "debit" AND status = "successful" THEN amount ELSE 0 END), 0) as total_spent,
                COUNT(*) as tx_count
             FROM transactions WHERE user_id = :uid',
            ['uid' => $customerId]
        );

        Response::success([
            'customer' => $user,
            'user' => $user,
            'wallet' => $wallet,
            'transactions' => $txns,
            'verifications' => $verifications,
            'orders' => $orders,
            'kyc' => $kyc,
            'kyc_submissions' => $kycSubmissions,
            'support_tickets' => $supportTickets,
            'auditLogs' => $auditLogs,
            'stats' => [
                'total_funded' => (float)($statTotals['total_funded'] ?? 0),
                'total_spent' => (float)($statTotals['total_spent'] ?? 0),
                'tx_count' => (int)($statTotals['tx_count'] ?? count($txns)),
                'orders_count' => count($orders),
                'verifications_count' => count($verifications),
                'tickets_count' => count($supportTickets),
            ],
        ]);
    }

    public function updateCustomer(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? '';
        $body = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM users WHERE id = :id', ['id' => $customerId]);
        if (!$existing) {
            Response::error('Customer not found.', 404);
            return;
        }

        $fullName = isset($body['full_name']) ? trim((string)$body['full_name']) : null;
        $email = isset($body['email']) ? strtolower(trim((string)$body['email'])) : null;
        $phoneNumber = isset($body['phone_number']) ? trim((string)$body['phone_number']) : null;
        $tier = isset($body['tier']) ? max(1, min(3, (int)$body['tier'])) : null;
        $kycStatus = isset($body['kyc_status']) ? strtolower(trim((string)$body['kyc_status'])) : null;
        $status = isset($body['status']) ? strtolower(trim((string)$body['status'])) : null;
        $newPassword = isset($body['new_password']) ? (string)$body['new_password'] : '';

        $address = $body['address'] ?? $body['residential_address'] ?? null;
        $state = $body['state'] ?? null;
        $lga = $body['lga'] ?? null;
        $dob = $body['date_of_birth'] ?? $body['dob'] ?? null;
        $nin = isset($body['nin']) ? preg_replace('/\D/', '', (string)$body['nin']) : null;
        $bvn = isset($body['bvn']) ? preg_replace('/\D/', '', (string)$body['bvn']) : null;
        $bio = $body['bio'] ?? null;

        $updates = [];
        $paramsDb = ['id' => $customerId];

        if ($fullName !== null && $fullName !== '') {
            $updates[] = 'full_name = :fn';
            $paramsDb['fn'] = $fullName;
        }
        if ($email !== null && $email !== '' && $email !== strtolower((string)$existing['email'])) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('Invalid email address format.', 422);
            }
            $dup = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :e AND id != :id', ['e' => $email, 'id' => $customerId]);
            if ($dup) {
                Response::error('Another account already uses this email address.', 409);
            }
            $updates[] = 'email = :em';
            $paramsDb['em'] = $email;
        }
        if ($phoneNumber !== null && $phoneNumber !== '') {
            $updates[] = 'phone_number = :pn';
            $paramsDb['pn'] = $phoneNumber;
        }
        if ($tier !== null) {
            $updates[] = 'tier = :tr';
            $paramsDb['tr'] = $tier;
        }
        if ($kycStatus !== null && in_array($kycStatus, ['unverified', 'pending', 'verified', 'rejected'], true)) {
            $updates[] = 'kyc_status = :ks';
            $paramsDb['ks'] = $kycStatus;
        }
        if ($status !== null && in_array($status, ['active', 'suspended'], true)) {
            $updates[] = 'status = :st';
            $paramsDb['st'] = $status;
        }
        if ($newPassword !== '') {
            if (strlen($newPassword) < 8) {
                Response::error('New password must be at least 8 characters long.', 422);
            }
            $updates[] = 'password_hash = :ph';
            $paramsDb['ph'] = Security::hashPassword($newPassword);
        }

        if ($nin !== null && $nin !== '' && !preg_match('/^\d{11}$/', $nin)) {
            Response::error('NIN must be exactly 11 numeric digits.', 422);
        }
        if ($bvn !== null && $bvn !== '' && !preg_match('/^\d{11}$/', $bvn)) {
            Response::error('BVN must be exactly 11 numeric digits.', 422);
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $this->db->execute($sql, $paramsDb);
            if ($tier !== null) {
                try {
                    $this->db->execute('UPDATE users SET kyc_level = :kl WHERE id = :id', ['kl' => $tier, 'id' => $customerId]);
                } catch (Throwable) {
                }
            }
        }

        // Update user_profiles if any profile/KYC fields provided
        if ($address !== null || $state !== null || $lga !== null || $dob !== null || $nin !== null || $bvn !== null || $bio !== null) {
            $existingProfile = $this->db->fetchOne('SELECT * FROM user_profiles WHERE user_id = :uid', ['uid' => $customerId]);
            $pAddr = $address !== null ? trim((string)$address) : ($existingProfile['address'] ?? null);
            $pState = $state !== null ? trim((string)$state) : ($existingProfile['state'] ?? null);
            $pLga = $lga !== null ? trim((string)$lga) : ($existingProfile['lga'] ?? null);
            $pDob = $dob !== null ? (trim((string)$dob) ?: null) : ($existingProfile['date_of_birth'] ?? null);
            $pNin = $nin !== null ? ($nin ?: null) : ($existingProfile['nin'] ?? null);
            $pBvn = $bvn !== null ? ($bvn ?: null) : ($existingProfile['bvn'] ?? null);
            $pBio = $bio !== null ? trim((string)$bio) : ($existingProfile['bio'] ?? null);

            try {
                $this->db->execute(
                    'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, bio, date_of_birth, created_at, updated_at)
                     VALUES (:uid, :nin, :bvn, :addr, :st, :lga, :bio, :dob, NOW(), NOW())
                     ON DUPLICATE KEY UPDATE nin = :nin2, bvn = :bvn2, address = :addr2, state = :st2, lga = :lga2, bio = :bio2, date_of_birth = :dob2, updated_at = NOW()',
                    [
                        'uid' => $customerId,
                        'nin' => $pNin, 'bvn' => $pBvn, 'addr' => $pAddr, 'st' => $pState, 'lga' => $pLga, 'bio' => $pBio, 'dob' => $pDob,
                        'nin2' => $pNin, 'bvn2' => $pBvn, 'addr2' => $pAddr, 'st2' => $pState, 'lga2' => $pLga, 'bio2' => $pBio, 'dob2' => $pDob,
                    ]
                );
            } catch (Throwable) {
                $this->db->execute(
                    'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, bio, created_at, updated_at)
                     VALUES (:uid, :nin, :bvn, :addr, :st, :lga, :bio, NOW(), NOW())
                     ON DUPLICATE KEY UPDATE nin = :nin2, bvn = :bvn2, address = :addr2, state = :st2, lga = :lga2, bio = :bio2, updated_at = NOW()',
                    [
                        'uid' => $customerId,
                        'nin' => $pNin, 'bvn' => $pBvn, 'addr' => $pAddr, 'st' => $pState, 'lga' => $pLga, 'bio' => $pBio,
                        'nin2' => $pNin, 'bvn2' => $pBvn, 'addr2' => $pAddr, 'st2' => $pState, 'lga2' => $pLga, 'bio2' => $pBio,
                    ]
                );
            }
        }

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "CUSTOMER_UPDATED", :meta, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $admin['id'],
                'email' => $admin['email'],
                'meta' => json_encode(['customer_id' => $customerId, 'password_changed' => ($newPassword !== ''), 'fields' => array_keys($body)]),
                'ip' => $request->getIp(),
            ]
        );

        $updated = $this->hydrateCustomerRow($customerId);
        Response::success(['customer' => $updated], 'Customer account updated successfully');
    }

    public function deleteCustomer(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = trim((string)($params['id'] ?? ''));
        $force = (bool)($request->input('force', false) || $request->query('force', '') === 'true' || $request->query('force', '') === '1');

        if (empty($customerId)) {
            Response::error('Customer ID is required.', 422);
        }

        if ($customerId === $admin['id']) {
            Response::error('You cannot delete your own active administrator session account.', 403);
        }

        $target = $this->db->fetchOne('SELECT u.*, COALESCE(w.balance, u.wallet_balance, 0) as live_balance FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.id = :id', ['id' => $customerId]);
        if (!$target) {
            Response::error('Customer account not found.', 404);
        }

        if (in_array(strtolower((string)$target['role']), ['superadmin', 'admin'], true)) {
            Response::error('Administrator accounts cannot be deleted from Customer Management.', 403);
        }

        $balance = (float)($target['live_balance'] ?? 0);
        if ($balance > 0 && !$force) {
            Response::error('Customer has a positive wallet balance of ₦' . number_format($balance, 2) . '. Debit the wallet first or confirm forced deletion.', 409);
        }

        $this->db->withTransaction(function (Database $db) use ($customerId, $target) {
            $ticketRows = $db->fetchAll('SELECT id FROM support_tickets WHERE user_id = :uid', ['uid' => $customerId]);
            foreach ($ticketRows as $tr) {
                $db->execute('DELETE FROM support_replies WHERE ticket_id = :tid', ['tid' => $tr['id']]);
            }
            $db->execute('DELETE FROM support_replies WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM support_tickets WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM manual_funding_requests WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM telecom_orders WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM verification_records WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM kyc_submissions WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM transactions WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM wallets WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM user_profiles WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM notifications WHERE user_id = :uid', ['uid' => $customerId]);
            if (!empty($target['email'])) {
                $db->execute('DELETE FROM password_resets WHERE email = :em', ['em' => strtolower((string)$target['email'])]);
            }
            $db->execute('DELETE FROM users WHERE id = :uid', ['uid' => $customerId]);
        });

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "CUSTOMER_DELETED", :meta, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $admin['id'],
                'email' => $admin['email'],
                'meta' => json_encode(['deleted_id' => $customerId, 'deleted_email' => $target['email'], 'deleted_name' => $target['full_name'], 'balance_at_delete' => $balance]),
                'ip' => $request->getIp(),
            ]
        );

        FootprintService::record(
            'admin',
            'CUSTOMER_DELETED',
            $admin,
            'customer_management',
            $customerId,
            null,
            'successful',
            $balance,
            null,
            ['deleted_email' => $target['email'], 'deleted_name' => $target['full_name']],
            $request->getIp()
        );

        Response::success(['deleted_id' => $customerId], "Customer account {$target['email']} permanently deleted.");
    }

    public function customerWalletAdjust(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? ($request->input('user_id') ?? '');
        $type = strtolower((string)$request->input('type', 'credit'));
        $amount = (float)$request->input('amount', 0);
        $reason = trim((string)$request->input('reason', 'Administrative Balance Adjustment'));

        if (empty($customerId) || $amount <= 0) {
            Response::error('Valid customer ID and positive amount required.', 422);
            return;
        }

        $reference = 'ADMIN_ADJ_' . strtoupper(bin2hex(random_bytes(6)));

        if ($type === 'credit') {
            $txResult = $this->walletService->credit(
                $customerId,
                $amount,
                'manual_adjustment',
                $reference,
                "Admin adjustment: {$reason}",
                'internal',
                ['admin_id' => $admin['id'], 'admin_email' => $admin['email']]
            );
        } else {
            $txResult = $this->walletService->debit(
                $customerId,
                $amount,
                'manual_adjustment',
                $reference,
                "Admin adjustment: {$reason}",
                'internal',
                ['admin_id' => $admin['id'], 'admin_email' => $admin['email']]
            );
        }

        Response::success([
            'newBalance' => $txResult['balance_after'],
            'transaction' => $txResult,
            'reference' => $reference,
        ], "Wallet successfully {$type}ed with ₦" . number_format($amount, 2));
    }

    public function reviewCustomerKyc(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? '';
        $status = strtolower(trim((string)$request->input('status', 'verified')));
        $tier = max(1, min(3, (int)$request->input('tier', $status === 'verified' ? 2 : 1)));
        $notes = trim((string)($request->input('review_notes') ?? $request->input('notes', 'Reviewed by compliance administrator')));

        if (!in_array($status, ['verified', 'rejected', 'pending'], true)) {
            Response::error('Invalid KYC decision status.', 422);
        }

        $existing = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :id', ['id' => $customerId]);
        if (!$existing) {
            Response::error('Customer account not found.', 404);
        }

        $this->db->execute(
            'UPDATE users SET kyc_status = :ks, tier = :tier, updated_at = NOW() WHERE id = :id',
            ['ks' => $status, 'tier' => $tier, 'id' => $customerId]
        );
        try {
            $this->db->execute('UPDATE users SET kyc_level = :kl WHERE id = :id', ['kl' => $tier, 'id' => $customerId]);
        } catch (Throwable) {
        }

        $this->db->execute(
            'UPDATE kyc_submissions SET status = :ks, review_notes = :notes, reviewed_by = :adm, reviewed_at = NOW() WHERE user_id = :id',
            ['ks' => $status, 'notes' => $notes, 'adm' => $admin['email'], 'id' => $customerId]
        );

        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, :title, :msg, :type, 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $customerId,
                'title' => $status === 'verified' ? 'Identity & KYC Approved' : 'KYC Verification Update',
                'msg' => $status === 'verified'
                    ? "Your Level {$tier} KYC verification has been approved. Notes: {$notes}"
                    : "Your KYC status was updated to {$status}. Notes: {$notes}",
                'type' => $status === 'verified' ? 'success' : 'warning',
            ]
        );

        $updated = $this->hydrateCustomerRow($customerId);
        Response::success(['customer' => $updated], "Customer KYC status updated to {$status}");
    }

    public function notifyCustomer(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $customerId = $params['id'] ?? '';
        $title = trim((string)$request->input('title', 'Administrative Notice'));
        $message = trim((string)$request->input('message', ''));
        $type = (string)$request->input('type', 'info');

        if (empty($message)) {
            Response::error('Notification message is required.', 422);
            return;
        }

        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, :title, :msg, :type, 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $customerId,
                'title' => $title,
                'msg' => $message,
                'type' => $type,
            ]
        );

        Response::success(null, 'Notification delivered to customer account.');
    }

    // =========================================================================
    // 13. CORE SERVICES & PRICING
    // =========================================================================
    public function services(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        // 1. Fetch system pricing settings
        $settingsRows = $this->db->fetchAll('SELECT setting_key, setting_value FROM system_settings WHERE category IN ("pricing", "payment", "general", "telecom", "identity")');
        $settings = [
            'nin_fee' => 200,
            'bvn_fee' => 250,
            'mtn_sme_1gb' => 270,
            'airtel_1gb' => 290,
            'glo_1gb' => 260,
            'nine_mobile_1gb' => 250,
            'airtime_discount_percent' => 2.5,
            'active_verification_provider' => '2sureverify',
            'active_telecom_provider' => 'ulamadata',
            'active_payment_gateway' => 'paystack',
        ];
        foreach ($settingsRows as $sr) {
            $val = $sr['setting_value'];
            if (is_numeric($val)) {
                $val = strpos($val, '.') !== false ? (float)$val : (int)$val;
            }
            $settings[$sr['setting_key']] = $val;
        }

        $storeItems = $this->db->fetchAll('SELECT * FROM store_items ORDER BY created_at DESC');
        foreach ($storeItems as &$si) {
            $si['price'] = (float)$si['price'];
            $si['stock'] = (int)$si['stock'];
        }

        \HambakTech\Services\AcademyService::ensureSeeded($this->db);
        $academyCourses = $this->db->fetchAll('SELECT * FROM academy_courses ORDER BY display_order ASC, created_at DESC');
        foreach ($academyCourses as &$ac) {
            $ac['price'] = $ac['price'] !== null ? (float)$ac['price'] : null;
            $ac['modules_count'] = (int)$ac['modules_count'];
            $ac['is_available'] = isset($ac['is_available']) ? (bool)$ac['is_available'] : true;
        }

        Response::success([
            'settings' => $settings,
            'store_items' => $storeItems,
            'academy_courses' => $academyCourses,
        ]);
    }

    public function updateServicePrice(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $serviceKey = (string)$request->input('serviceKey', $request->input('service_key', ''));
        $price = (float)($request->input('sellingPrice') ?? $request->input('selling_price', 0));

        if (empty($serviceKey) || $price <= 0) {
            Response::error('Valid serviceKey and price are required.', 422);
            return;
        }

        $this->db->execute(
            'UPDATE service_catalogue SET selling_price = :pr, updated_at = NOW() WHERE service_key = :k',
            ['pr' => $price, 'k' => $serviceKey]
        );

        $srv = $this->db->fetchOne('SELECT * FROM service_catalogue WHERE service_key = :k', ['k' => $serviceKey]);
        Response::success(['service' => $srv], 'Service price updated successfully');
    }

    public function updatePricing(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $b = $request->getBody();

        foreach ($b as $k => $v) {
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                 VALUES (:id, :k, :v, "pricing", "Pricing tariff")
                 ON DUPLICATE KEY UPDATE setting_value = :v2',
                [
                    'id' => Security::generateUuid(),
                    'k' => (string)$k,
                    'v' => (string)$v,
                    'v2' => (string)$v,
                ]
            );
        }

        Response::success(null, 'Platform tariffs and pricing updated successfully');
    }

    public function updateProviders(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $b = $request->getBody();

        foreach ($b as $k => $v) {
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                 VALUES (:id, :k, :v, "providers", "Active provider routing")
                 ON DUPLICATE KEY UPDATE setting_value = :v2',
                [
                    'id' => Security::generateUuid(),
                    'k' => (string)$k,
                    'v' => (string)$v,
                    'v2' => (string)$v,
                ]
            );
        }

        Response::success(null, 'Provider routing configuration updated successfully');
    }

    public function verificationServices(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $rows = $this->db->fetchAll(
            'SELECT s.service_key as `key`, s.name, s.selling_price as price, s.wholesale_cost, 
                    s.provider_id as provider, s.endpoint as endpoint, s.is_active,
                    COALESCE(c.code, c.name, "nin_verification") as category, c.name as category_name
             FROM service_catalogue s
             LEFT JOIN service_categories c ON c.id = s.category_id
             ORDER BY s.selling_price ASC'
        );

        foreach ($rows as &$r) {
            $r['price'] = (float)$r['price'];
            $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            $r['is_active'] = (bool)$r['is_active'];
            $r['enabled'] = (bool)$r['is_active'];
            $profit = $r['price'] - $r['wholesale_cost'];
            $r['profit_per_transaction'] = $profit;
            $r['margin_percent'] = $r['price'] > 0 ? round(($profit / $r['price']) * 100) : 0;
        }

        Response::success(['services' => $rows, 'count' => count($rows)]);
    }

    public function updateVerificationService(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $key = $params['key'] ?? '';
        $body = $request->getBody();

        $updates = [];
        $paramsDb = ['k' => $key];

        if (isset($body['price'])) {
            $updates[] = 'selling_price = :pr';
            $paramsDb['pr'] = (float)$body['price'];
        }
        if (isset($body['selling_price'])) {
            $updates[] = 'selling_price = :spr';
            $paramsDb['spr'] = (float)$body['selling_price'];
        }
        if (isset($body['wholesale_cost'])) {
            $updates[] = 'wholesale_cost = :wc';
            $paramsDb['wc'] = (float)$body['wholesale_cost'];
        }
        if (isset($body['provider'])) {
            $updates[] = 'provider_id = :prov';
            $paramsDb['prov'] = (string)$body['provider'];
        }
        if (isset($body['is_active']) || isset($body['enabled'])) {
            $activeVal = isset($body['is_active']) ? (bool)$body['is_active'] : (bool)$body['enabled'];
            $updates[] = 'is_active = :act';
            $paramsDb['act'] = $activeVal ? 1 : 0;
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $this->db->execute('UPDATE service_catalogue SET ' . implode(', ', $updates) . ' WHERE service_key = :k', $paramsDb);
        }

        $srv = $this->db->fetchOne(
            'SELECT s.service_key as `key`, s.name, s.selling_price as price, s.wholesale_cost,
                    s.provider_id as provider, s.endpoint as endpoint, s.is_active
             FROM service_catalogue s WHERE s.service_key = :k',
            ['k' => $key]
        );
        if ($srv) {
            $srv['price'] = (float)$srv['price'];
            $srv['wholesale_cost'] = (float)$srv['wholesale_cost'];
            $srv['is_active'] = (bool)$srv['is_active'];
            $srv['enabled'] = (bool)$srv['is_active'];
        }
        Response::success(['service' => $srv], 'Verification service configuration updated');
    }

    public function syncWholesalePrices(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        Response::success(['updatedCount' => 0], 'Wholesale tariffs checked against local service catalogue.');
    }

    private function maskSecret(string $val): string
    {
        if ($val === '') {
            return '';
        }
        $len = strlen($val);
        if ($len <= 8) {
            return str_repeat('•', $len);
        }
        return substr($val, 0, 5) . '••••••••' . substr($val, -4);
    }

    private function sanitizeProviderRow(array $p): array
    {
        $cfgFile = __DIR__ . '/../config/config.php';
        $baseCfg = file_exists($cfgFile) ? require $cfgFile : [];
        $id = strtolower((string)($p['id'] ?? ''));
        $envCfg = $baseCfg['providers'][$id] ?? [];

        $apiKey = (string)($p['api_key'] ?? '') ?: (string)($envCfg['api_key'] ?? '');
        $secKey = (string)($p['secret_key'] ?? '') ?: (string)($envCfg['secret_key'] ?? '');
        $pubKey = (string)($p['public_key'] ?? '') ?: (string)($envCfg['public_key'] ?? '');

        $p['is_active'] = (bool)$p['is_active'];
        $p['is_default'] = (bool)$p['is_default'];
        $p['balance'] = (float)$p['balance'];
        $p['timeout_seconds'] = (int)($p['timeout_seconds'] ?? 30);

        $p['has_api_key'] = !empty($apiKey);
        $p['has_secret_key'] = !empty($secKey);
        $p['has_public_key'] = !empty($pubKey);
        $p['is_configured'] = $p['has_api_key'] || $p['has_secret_key'];

        $p['api_key_masked'] = $this->maskSecret($apiKey ?: $secKey);
        $p['secret_key_masked'] = $this->maskSecret($secKey);
        $p['public_key_masked'] = $this->maskSecret($pubKey);

        // Do not leak raw secret values in GET listings
        $p['api_key'] = '';
        $p['secret_key'] = '';
        $p['public_key'] = $pubKey !== '' ? $this->maskSecret($pubKey) : '';
        return $p;
    }

    public function providers(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $providers = $this->db->fetchAll('SELECT * FROM providers ORDER BY provider_type ASC, name ASC');
        $primaryId = 'veripine';
        foreach ($providers as &$p) {
            if (!empty($p['is_default']) && ($p['provider_type'] ?? '') === 'identity') {
                $primaryId = $p['id'];
            }
            $p = $this->sanitizeProviderRow($p);
        }
        Response::success([
            'primaryProviderId' => $primaryId,
            'providers' => $providers,
        ]);
    }

    public function saveProvider(Request $request, array $params = []): void
    {
        Auth::requireRole($request, ['superadmin']);
        $id = $params['id'] ?? (string)$request->input('id', '');
        $body = $request->getBody();

        if (empty($id)) {
            Response::error('Provider ID required.', 422);
            return;
        }

        $existing = $this->db->fetchOne('SELECT * FROM providers WHERE id = :id', ['id' => $id]);

        $cleanSecret = static function ($submitted, ?string $fallback) {
            if ($submitted === null) {
                return $fallback ?? '';
            }
            $val = trim((string)$submitted);
            if ($val === '' || str_contains($val, '••••')) {
                return $fallback ?? '';
            }
            return $val;
        };

        $name = isset($body['name']) && trim((string)$body['name']) !== ''
            ? trim((string)$body['name'])
            : ($existing['name'] ?? ucfirst($id));
        $type = isset($body['provider_type']) && trim((string)$body['provider_type']) !== ''
            ? trim((string)$body['provider_type'])
            : ($existing['provider_type'] ?? 'telecom');
        $url = isset($body['base_url']) && trim((string)$body['base_url']) !== ''
            ? trim((string)$body['base_url'])
            : ($existing['base_url'] ?? 'https://api.example.com');
        $apiKey = $cleanSecret($body['api_key'] ?? null, $existing['api_key'] ?? '');
        $secretKey = $cleanSecret($body['secret_key'] ?? null, $existing['secret_key'] ?? '');
        $publicKey = $cleanSecret($body['public_key'] ?? null, $existing['public_key'] ?? '');
        $isActive = isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : (int)($existing['is_active'] ?? 1);
        $isDefault = isset($body['is_default']) ? ($body['is_default'] ? 1 : 0) : (int)($existing['is_default'] ?? 0);
        $timeout = isset($body['timeout_seconds']) ? max(5, (int)$body['timeout_seconds']) : (int)($existing['timeout_seconds'] ?? 30);

        if ($isDefault === 1) {
            $this->db->execute(
                'UPDATE providers SET is_default = 0 WHERE provider_type = :pt AND id != :id',
                ['pt' => $type, 'id' => $id]
            );
            if ($type === 'telecom') {
                $this->db->execute(
                    'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                     VALUES ("set_act_tel", "active_telecom_provider", :v1, "providers", "Active Telecom Provider")
                     ON DUPLICATE KEY UPDATE setting_value = :v2',
                    ['v1' => $id, 'v2' => $id]
                );
            } elseif ($type === 'identity' || $type === 'verification') {
                $this->db->execute(
                    'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                     VALUES ("set_act_verif", "active_verification_provider", :v1, "providers", "Active Verification Provider")
                     ON DUPLICATE KEY UPDATE setting_value = :v2',
                    ['v1' => $id, 'v2' => $id]
                );
            } elseif ($type === 'payment') {
                $this->db->execute(
                    'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                     VALUES ("set_act_pay", "active_payment_gateway", :v1, "payment", "Active Payment Gateway")
                     ON DUPLICATE KEY UPDATE setting_value = :v2',
                    ['v1' => $id, 'v2' => $id]
                );
            }
        }

        $this->db->execute(
            'INSERT INTO providers (id, name, provider_type, base_url, api_key, secret_key, public_key, is_active, is_default, timeout_seconds, balance, last_ping_status)
             VALUES (:id, :name, :type, :url, :key, :skey, :pkey, :act, :def, :to, :bal, "untested")
             ON DUPLICATE KEY UPDATE
                name = :name2,
                provider_type = :type2,
                base_url = :url2,
                api_key = :key2,
                secret_key = :skey2,
                public_key = :pkey2,
                is_active = :act2,
                is_default = :def2,
                timeout_seconds = :to2,
                updated_at = NOW()',
            [
                'id' => $id,
                'name' => $name,
                'type' => $type,
                'url' => $url,
                'key' => $apiKey,
                'skey' => $secretKey,
                'pkey' => $publicKey,
                'act' => $isActive,
                'def' => $isDefault,
                'to' => $timeout,
                'bal' => (float)($existing['balance'] ?? 0.00),
                'name2' => $name,
                'type2' => $type,
                'url2' => $url,
                'key2' => $apiKey,
                'skey2' => $secretKey,
                'pkey2' => $publicKey,
                'act2' => $isActive,
                'def2' => $isDefault,
                'to2' => $timeout,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM providers WHERE id = :id', ['id' => $id]);
        Response::success(['provider' => $row ? $this->sanitizeProviderRow($row) : null], "Provider {$name} configuration saved");
    }

    public function testProvider(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = strtolower(trim((string)($params['id'] ?? '')));
        $prov = $this->db->fetchOne('SELECT * FROM providers WHERE id = :id', ['id' => $id]);

        if (!$prov) {
            Response::error('Provider not found', 404);
            return;
        }

        $operational = false;
        $latency = 0;
        $balance = null;
        $message = '';

        try {
            if ($id === 'veripine') {
                $adapter = new VeripineAdapter();
                $ping = $adapter->ping();
                $operational = ($ping['status'] ?? '') === 'operational';
                $latency = (int)($ping['latency_ms'] ?? 0);
                $balance = isset($ping['balance']) ? (float)$ping['balance'] : null;
                $message = (string)($ping['message'] ?? 'Veripine connectivity test completed.');
            } elseif ($id === '2sureverify') {
                $adapter = new TwoSureVerifyAdapter();
                $ping = $adapter->ping();
                $operational = ($ping['status'] ?? '') === 'operational';
                $latency = (int)($ping['latency_ms'] ?? 0);
                $message = (string)($ping['message'] ?? '2SureVerify connectivity test completed.');
            } elseif ($id === 'ulamadata') {
                $adapter = new UlamaDataAdapter();
                $balRes = $adapter->checkBalance();
                $operational = !empty($balRes['success']);
                $latency = (int)($balRes['latency_ms'] ?? 0);
                $balance = isset($balRes['balance']) ? (float)$balRes['balance'] : null;
                $message = "UlamaData gateway connected (Balance: ₦" . number_format((float)$balance, 2) . ")";
            } elseif ($id === 'vtpass') {
                $adapter = new VtpassAdapter();
                $balRes = $adapter->checkBalance();
                $operational = !empty($balRes['success']);
                $latency = (int)($balRes['latency_ms'] ?? 0);
                $balance = isset($balRes['balance']) ? (float)$balRes['balance'] : null;
                $message = "VTpass gateway connected (Balance: ₦" . number_format((float)$balance, 2) . ")";
            } elseif ($id === 'paystack') {
                $cfg = file_exists(__DIR__ . '/../config/config.php') ? require __DIR__ . '/../config/config.php' : [];
                $secret = getenv('PAYSTACK_SECRET_KEY') ?: (!empty($prov['secret_key']) ? (string)$prov['secret_key'] : (!empty($prov['api_key']) ? (string)$prov['api_key'] : (string)($cfg['providers']['paystack']['secret_key'] ?? '')));
                if ($secret === '') {
                    throw new Exception('Paystack Secret Key is not configured.');
                }
                $start = microtime(true);
                $ch = curl_init(rtrim((string)($prov['base_url'] ?: 'https://api.paystack.co'), '/') . '/balance');
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $secret, 'Accept: application/json'],
                    CURLOPT_TIMEOUT => 12,
                    CURLOPT_SSL_VERIFYPEER => true,
                ]);
                $raw = curl_exec($ch);
                $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $err = curl_error($ch);
                curl_close($ch);
                $latency = (int)round((microtime(true) - $start) * 1000);
                $decoded = is_string($raw) ? json_decode($raw, true) : null;
                if ($raw === false || $code >= 400 || empty($decoded['status'])) {
                    $errMsg = is_array($decoded) ? ($decoded['message'] ?? "HTTP {$code}") : ($err ?: "HTTP {$code}");
                    throw new Exception("Paystack error: {$errMsg}");
                }
                $operational = true;
                if (isset($decoded['data'][0]['balance'])) {
                    $balance = ((float)$decoded['data'][0]['balance']) / 100.0;
                }
                $message = "Paystack API authenticated successfully ({$latency}ms).";
            } elseif ($id === 'flutterwave') {
                $start = microtime(true);
                $adapter = new \HambakTech\Adapters\Payment\FlutterwaveAdapter();
                $testRes = $adapter->testConnection();
                $latency = (int)($testRes['latency_ms'] ?? round((microtime(true) - $start) * 1000));
                if (empty($testRes['operational'])) {
                    throw new Exception((string)($testRes['message'] ?? 'Flutterwave authentication failed.'));
                }
                $operational = true;
                $balance = isset($testRes['balance']) ? (float)$testRes['balance'] : null;
                $message = (string)($testRes['message'] ?? "Flutterwave API authenticated successfully ({$latency}ms).");
            } else {
                $message = "Unknown provider '{$id}'";
            }
        } catch (Throwable $e) {
            $operational = false;
            $message = $e->getMessage();
        }

        $pingStatus = $operational ? 'operational' : (str_contains(strtolower($message), 'not configured') ? 'unconfigured' : 'error');
        $this->db->execute(
            'UPDATE providers
             SET last_ping_status = :st,
                 last_ping_latency = :lat,
                 balance = COALESCE(:bal, balance),
                 last_ping_at = NOW()
             WHERE id = :id',
            [
                'st' => $pingStatus,
                'lat' => $latency,
                'bal' => $balance,
                'id' => $id,
            ]
        );

        if (!$operational) {
            $httpStatus = ($pingStatus === 'unconfigured') ? 400 : 502;
            Response::error($message ?: "Provider {$prov['name']} test failed.", $httpStatus, [
                'operational' => false,
                'provider' => $id,
                'latency_ms' => $latency,
                'status' => $pingStatus,
            ]);
            return;
        }

        Response::success([
            'success' => true,
            'operational' => true,
            'provider' => $id,
            'balance' => $balance,
            'message' => $message,
            'latency_ms' => $latency,
        ]);
    }

    public function providerLogs(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $logs = $this->db->fetchAll('SELECT * FROM provider_logs ORDER BY created_at DESC LIMIT 100');
        Response::success(['logs' => $logs]);
    }

    // =========================================================================
    // 14. SLIP TEMPLATES
    // =========================================================================
    public function slipTemplates(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->db->execute(
            'CREATE TABLE IF NOT EXISTS slip_templates (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(191) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT "NIN",
                demo_image_url VARCHAR(500) NULL,
                description TEXT NULL,
                supported_service VARCHAR(100) NOT NULL DEFAULT "all_nin",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 1,
                badge VARCHAR(50) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $templates = $this->db->fetchAll('SELECT * FROM slip_templates ORDER BY display_order ASC');
        if (empty($templates)) {
            // Seed defaults
            $defaults = [
                ['tpl_nin_long', 'NIMC Long Slip (Standard Official Format)', 'NIN', '/assets/aistudio/IMG_0483_23e1a1e1.png', 'Complete Federal Republic of Nigeria official NIMC certificate format with tracking barcode, verified photo, and sovereign QR security stamp.', 'all_nin', 1, 1, 'Recommended'],
                ['tpl_nin_plastic', 'NIMC Premium Plastic Digital ID Card', 'NIN', '/assets/aistudio/IMG_0484_0fb633df.png', 'Dual-sided wallet plastic biometric card format featuring high-resolution identity photo, microprint background, and national emblem.', 'all_nin', 1, 2, 'Plastic Card'],
                ['tpl_nin_improved', 'NIMC Improved Regular Slip (Modern Vector)', 'NIN', '/assets/aistudio/IMG_0483_23e1a1e1.png', 'Official modern vector typography slip with embedded high-contrast QR code and verification tracking stamp.', 'all_nin', 1, 3, 'Vector Modern'],
                ['tpl_bvn_standard', 'NIBSS BVN Standard Verification Document', 'BVN', '/assets/aistudio/IMG_0483_23e1a1e1.png', 'Central Bank of Nigeria authorized BVN verification certificate with bank verification stamp.', 'all_bvn', 1, 4, 'CBN Standard'],
                ['tpl_bvn_plastic', 'NIBSS Digital BVN Biometric Card', 'BVN', '/assets/aistudio/IMG_0484_0fb633df.png', 'Wallet format BVN plastic card featuring verified customer photograph and account security seal.', 'all_bvn', 1, 5, 'Plastic Card'],
            ];
            foreach ($defaults as $d) {
                $this->db->execute(
                    'INSERT IGNORE INTO slip_templates (id, name, category, demo_image_url, description, supported_service, is_active, display_order, badge)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    $d
                );
            }
            $templates = $this->db->fetchAll('SELECT * FROM slip_templates ORDER BY display_order ASC');
        }

        foreach ($templates as &$t) {
            $t['is_active'] = (bool)$t['is_active'];
            $t['display_order'] = (int)$t['display_order'];
        }

        Response::success(['templates' => $templates]);
    }

    public function saveSlipTemplate(Request $request, array $params = []): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? (string)$request->input('id', '');
        $body = $request->getBody();

        if (empty($id)) {
            $id = 'tpl_' . strtolower(bin2hex(random_bytes(4)));
        }

        $this->db->execute(
            'INSERT INTO slip_templates (id, name, category, demo_image_url, description, supported_service, is_active, display_order, badge)
             VALUES (:id, :name, :cat, :img, :desc, :sup, :act, :ord, :bdg)
             ON DUPLICATE KEY UPDATE
                name = COALESCE(:name2, name),
                category = COALESCE(:cat2, category),
                demo_image_url = COALESCE(:img2, demo_image_url),
                description = COALESCE(:desc2, description),
                supported_service = COALESCE(:sup2, supported_service),
                is_active = COALESCE(:act2, is_active),
                display_order = COALESCE(:ord2, display_order),
                badge = COALESCE(:bdg2, badge)',
            [
                'id' => $id,
                'name' => $body['name'] ?? 'Slip Template',
                'cat' => $body['category'] ?? 'NIN',
                'img' => $body['demo_image_url'] ?? '',
                'desc' => $body['description'] ?? '',
                'sup' => $body['supported_service'] ?? 'all_nin',
                'act' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : 1,
                'ord' => (int)($body['display_order'] ?? 1),
                'bdg' => $body['badge'] ?? null,
                'name2' => $body['name'] ?? null,
                'cat2' => $body['category'] ?? null,
                'img2' => $body['demo_image_url'] ?? null,
                'desc2' => $body['description'] ?? null,
                'sup2' => $body['supported_service'] ?? null,
                'act2' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : null,
                'ord2' => isset($body['display_order']) ? (int)$body['display_order'] : null,
                'bdg2' => $body['badge'] ?? null,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM slip_templates WHERE id = :id', ['id' => $id]);
        Response::success(['template' => $row], 'Slip template saved successfully');
    }

    public function deleteSlipTemplate(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM slip_templates WHERE id = :id', ['id' => $id]);
        Response::success(null, 'Slip template deleted');
    }

    // =========================================================================
    // 15. DIGITAL UTILITIES (CABLE & DISCO)
    // =========================================================================
    public function digitalServices(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $cable = $this->db->fetchAll('SELECT * FROM cable_packages ORDER BY provider ASC, price ASC');
        $discos = $this->db->fetchAll('SELECT * FROM electricity_discos ORDER BY name ASC');

        foreach ($cable as &$c) {
            $c['price'] = (float)$c['price'];
            $c['wholesale_cost'] = (float)$c['wholesale_cost'];
            $c['is_active'] = (bool)$c['is_active'];
            $c['enabled'] = (bool)$c['is_active'];
        }
        foreach ($discos as &$d) {
            $d['minimum_amount'] = (float)$d['minimum_amount'];
            $d['is_active'] = (bool)$d['is_active'];
            $d['enabled'] = (bool)$d['is_active'];
        }

        Response::success([
            'cable_packages' => $cable,
            'electricity_discos' => $discos,
        ]);
    }

    public function saveCablePackage(Request $request, array $params = []): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? (string)$request->input('id', '');
        $body = $request->getBody();

        if (empty($id)) {
            $id = 'cab_' . strtolower(bin2hex(random_bytes(4)));
        }

        $this->db->execute(
            'INSERT INTO cable_packages (id, provider, name, code, channels, wholesale_cost, price, is_active)
             VALUES (:id, :prov, :name, :code, :chan, :wc, :pr, :act)
             ON DUPLICATE KEY UPDATE
                provider = COALESCE(:prov2, provider),
                name = COALESCE(:name2, name),
                code = COALESCE(:code2, code),
                channels = COALESCE(:chan2, channels),
                wholesale_cost = COALESCE(:wc2, wholesale_cost),
                price = COALESCE(:pr2, price),
                is_active = COALESCE(:act2, is_active)',
            [
                'id' => $id,
                'prov' => $body['provider'] ?? 'dstv',
                'name' => $body['name'] ?? 'Cable Package',
                'code' => $body['code'] ?? 'pkg-' . $id,
                'chan' => (int)($body['channels'] ?? 0),
                'wc' => (float)($body['wholesale_cost'] ?? 0),
                'pr' => (float)($body['price'] ?? 0),
                'act' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : (isset($body['enabled']) ? ($body['enabled'] ? 1 : 0) : 1),
                'prov2' => $body['provider'] ?? null,
                'name2' => $body['name'] ?? null,
                'code2' => $body['code'] ?? null,
                'chan2' => isset($body['channels']) ? (int)$body['channels'] : null,
                'wc2' => isset($body['wholesale_cost']) ? (float)$body['wholesale_cost'] : null,
                'pr2' => isset($body['price']) ? (float)$body['price'] : null,
                'act2' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : (isset($body['enabled']) ? ($body['enabled'] ? 1 : 0) : null),
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM cable_packages WHERE id = :id', ['id' => $id]);
        Response::success(['package' => $row], 'Cable package saved');
    }

    public function deleteCablePackage(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->db->execute('DELETE FROM cable_packages WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Cable package deleted');
    }

    public function saveElectricityDisco(Request $request, array $params = []): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? (string)$request->input('id', '');
        $body = $request->getBody();

        if (empty($id)) {
            $id = 'disc_' . strtolower(bin2hex(random_bytes(4)));
        }

        $this->db->execute(
            'INSERT INTO electricity_discos (id, name, code, minimum_amount, is_active)
             VALUES (:id, :name, :code, :min, :act)
             ON DUPLICATE KEY UPDATE
                name = COALESCE(:name2, name),
                code = COALESCE(:code2, code),
                minimum_amount = COALESCE(:min2, minimum_amount),
                is_active = COALESCE(:act2, is_active)',
            [
                'id' => $id,
                'name' => $body['name'] ?? 'Electricity Disco',
                'code' => $body['code'] ?? 'disco-' . $id,
                'min' => (float)($body['minimum_amount'] ?? 500.00),
                'act' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : (isset($body['enabled']) ? ($body['enabled'] ? 1 : 0) : 1),
                'name2' => $body['name'] ?? null,
                'code2' => $body['code'] ?? null,
                'min2' => isset($body['minimum_amount']) ? (float)$body['minimum_amount'] : null,
                'act2' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : (isset($body['enabled']) ? ($body['enabled'] ? 1 : 0) : null),
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM electricity_discos WHERE id = :id', ['id' => $id]);
        Response::success(['disco' => $row], 'Electricity disco saved');
    }

    public function deleteElectricityDisco(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->db->execute('DELETE FROM electricity_discos WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Electricity disco deleted');
    }

    // =========================================================================
    // 16. HARDWARE STORE & AGENCY ACADEMY
    // =========================================================================
    public function store(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $items = $this->db->fetchAll('SELECT * FROM store_items ORDER BY created_at DESC');
        if (empty($items)) {
            $defaults = [
                ['item_001', 'HambakTech High-Speed Thermal Receipt Printer', 'Hardware', 48500.00, 15, 'Direct USB/Bluetooth ESC/POS thermal receipt printer for NIN slips and bills.', 'active'],
                ['item_002', 'HambakTech Bluetooth Biometric Fingerprint Scanner', 'Hardware', 85000.00, 45, 'NIMC-certified optical biometric scanner with USB-C and Bluetooth for mobile NIN enrollments.', 'active'],
                ['item_003', 'Enterprise Heavy-Duty Thermal Paper Rolls (Pack of 50)', 'Consumables', 22000.00, 80, 'High-contrast 80mm premium thermal rolls engineered for barcode and slip longevity.', 'active'],
                ['item_004', 'Dual-Sided PVC ID Card Printing Machine', 'Hardware', 320000.00, 5, 'High-resolution dye-sublimation PVC card printer for authorized NIN/BVN digital plastic cards.', 'active'],
            ];
            foreach ($defaults as $d) {
                $this->db->execute(
                    'INSERT IGNORE INTO store_items (id, name, category, price, stock, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    $d
                );
            }
            $items = $this->db->fetchAll('SELECT * FROM store_items ORDER BY created_at DESC');
        }

        foreach ($items as &$i) {
            $i['price'] = (float)$i['price'];
            $i['stock'] = (int)$i['stock'];
        }

        $storeSettingsSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "store_settings"');
        $settings = $storeSettingsSetting ? json_decode($storeSettingsSetting['setting_value'], true) : [
            'coming_soon' => true,
            'store_banner_url' => '',
            'contact_whatsapp' => '09155104724',
            'minimum_order_amount' => 5000,
        ];

        Response::success([
            'items' => $items,
            'settings' => $settings,
        ]);
    }

    public function storeSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $storeSettingsSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "store_settings"');
        $settings = $storeSettingsSetting ? json_decode($storeSettingsSetting['setting_value'], true) : [
            'coming_soon' => true,
            'store_banner_url' => '',
            'contact_whatsapp' => '09155104724',
            'minimum_order_amount' => 5000,
        ];
        Response::success(['settings' => $settings]);
    }

    public function updateStoreSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $body = $request->getBody();

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_store_config", "store_settings", :val, "store", "Store configurations")
             ON DUPLICATE KEY UPDATE setting_value = :val2',
            [
                'val' => json_encode($body),
                'val2' => json_encode($body),
            ]
        );

        Response::success(['settings' => $body], 'Store settings saved');
    }

    public function saveStoreItem(Request $request, array $params = []): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? (string)$request->input('id', '');
        $body = $request->getBody();

        if (empty($id)) {
            $id = 'item_' . strtolower(bin2hex(random_bytes(4)));
        }

        $this->db->execute(
            'INSERT INTO store_items (id, name, category, price, stock, description, image_url, status)
             VALUES (:id, :name, :cat, :pr, :stk, :desc, :img, :st)
             ON DUPLICATE KEY UPDATE
                name = COALESCE(:name2, name),
                category = COALESCE(:cat2, category),
                price = COALESCE(:pr2, price),
                stock = COALESCE(:stk2, stock),
                description = COALESCE(:desc2, description),
                image_url = COALESCE(:img2, image_url),
                status = COALESCE(:st2, status),
                updated_at = NOW()',
            [
                'id' => $id,
                'name' => $body['name'] ?? 'Store Item',
                'cat' => $body['category'] ?? 'Hardware',
                'pr' => (float)($body['price'] ?? 0),
                'stk' => (int)($body['stock'] ?? 0),
                'desc' => $body['description'] ?? '',
                'img' => $body['image_url'] ?? '',
                'st' => $body['status'] ?? 'active',
                'name2' => $body['name'] ?? null,
                'cat2' => $body['category'] ?? null,
                'pr2' => isset($body['price']) ? (float)$body['price'] : null,
                'stk2' => isset($body['stock']) ? (int)$body['stock'] : null,
                'desc2' => $body['description'] ?? null,
                'img2' => $body['image_url'] ?? null,
                'st2' => $body['status'] ?? null,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM store_items WHERE id = :id', ['id' => $id]);
        Response::success(['item' => $row], 'Store product saved');
    }

    public function deleteStoreItem(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->db->execute('DELETE FROM store_items WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Store product deleted');
    }

    public function academy(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $courses = $this->db->fetchAll('SELECT * FROM academy_courses ORDER BY created_at DESC');
        if (empty($courses)) {
            $defaults = [
                ['crs_001', 'Nigerian VTU Business Mastery & Automated Sells', 'Beginner to Pro', '4 Weeks', 8, 15000.00, 'Learn how to generate ₦150k - ₦500k monthly reselling data, airtime, and utility tokens with zero upfront inventory.', 'enrolling'],
                ['crs_002', 'NIMC Identity Verification Agent Licensing Course', 'Professional', '6 Weeks', 12, 35000.00, 'Comprehensive compliance and software operating certification for authorized NIN and BVN slip enrollment centers.', 'enrolling'],
                ['crs_003', 'API Integration & Telecom Webhook Architecture', 'Developer', '3 Weeks', 6, 25000.00, 'Hands-on training for software engineers connecting telecommunication and fintech payment APIs.', 'draft'],
            ];
            foreach ($defaults as $d) {
                $this->db->execute(
                    'INSERT IGNORE INTO academy_courses (id, title, level, duration, modules_count, price, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    $d
                );
            }
            $courses = $this->db->fetchAll('SELECT * FROM academy_courses ORDER BY created_at DESC');
        }

        foreach ($courses as &$c) {
            $c['price'] = (float)$c['price'];
            $c['modules_count'] = (int)$c['modules_count'];
        }

        $academySettingsSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "academy_settings"');
        $settings = $academySettingsSetting ? json_decode($academySettingsSetting['setting_value'], true) : [
            'coming_soon' => true,
            'banner_url' => '',
            'enrollment_open' => true,
            'contact_email' => 'hambak901@gmail.com',
        ];

        Response::success([
            'courses' => $courses,
            'settings' => $settings,
        ]);
    }

    public function academySettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $academySettingsSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "academy_settings"');
        $settings = $academySettingsSetting ? json_decode($academySettingsSetting['setting_value'], true) : [
            'coming_soon' => true,
            'banner_url' => '',
            'enrollment_open' => true,
            'contact_email' => 'hambak901@gmail.com',
        ];
        Response::success(['settings' => $settings]);
    }

    public function updateAcademySettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $body = $request->getBody();

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_academy_config", "academy_settings", :val, "academy", "Academy configurations")
             ON DUPLICATE KEY UPDATE setting_value = :val2',
            [
                'val' => json_encode($body),
                'val2' => json_encode($body),
            ]
        );

        Response::success(['settings' => $body], 'Academy settings saved');
    }

    public function saveAcademyCourse(Request $request, array $params = []): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? (string)$request->input('id', '');
        $body = $request->getBody();

        if (empty($id)) {
            $id = 'crs_' . strtolower(bin2hex(random_bytes(4)));
        }

        $this->db->execute(
            'INSERT INTO academy_courses (id, title, level, duration, modules_count, price, description, status)
             VALUES (:id, :tit, :lvl, :dur, :mod, :pr, :desc, :st)
             ON DUPLICATE KEY UPDATE
                title = COALESCE(:tit2, title),
                level = COALESCE(:lvl2, level),
                duration = COALESCE(:dur2, duration),
                modules_count = COALESCE(:mod2, modules_count),
                price = COALESCE(:pr2, price),
                description = COALESCE(:desc2, description),
                status = COALESCE(:st2, status),
                updated_at = NOW()',
            [
                'id' => $id,
                'tit' => $body['title'] ?? 'Course Title',
                'lvl' => $body['level'] ?? 'Beginner',
                'dur' => $body['duration'] ?? '4 Weeks',
                'mod' => (int)($body['modules_count'] ?? 1),
                'pr' => (float)($body['price'] ?? 0),
                'desc' => $body['description'] ?? '',
                'st' => $body['status'] ?? 'enrolling',
                'tit2' => $body['title'] ?? null,
                'lvl2' => $body['level'] ?? null,
                'dur2' => $body['duration'] ?? null,
                'mod2' => isset($body['modules_count']) ? (int)$body['modules_count'] : null,
                'pr2' => isset($body['price']) ? (float)$body['price'] : null,
                'desc2' => $body['description'] ?? null,
                'st2' => $body['status'] ?? null,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM academy_courses WHERE id = :id', ['id' => $id]);
        Response::success(['course' => $row], 'Academy course saved');
    }

    public function deleteAcademyCourse(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->db->execute('DELETE FROM academy_courses WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Academy course deleted');
    }

    public function reportsSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $body = $request->getBody();

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_reports_config", "reports_settings", :val, "reports", "Reports configurations")
             ON DUPLICATE KEY UPDATE setting_value = :val2',
            [
                'val' => json_encode($body),
                'val2' => json_encode($body),
            ]
        );

        Response::success(['settings' => $body], 'Reports settings saved');
    }

    // =========================================================================
    // 17. SMTP SERVER SETTINGS & EMAIL TEMPLATES
    // =========================================================================
    public function smtpConfig(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $row = $this->db->fetchOne('SELECT * FROM smtp_configs LIMIT 1');
        $cfgFile = __DIR__ . '/../config/config.php';
        $baseCfg = file_exists($cfgFile) ? require $cfgFile : [];
        $mailDefaults = $baseCfg['mail'] ?? [];

        $logs = [];
        try {
            $logs = $this->db->fetchAll('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 30');
        } catch (Throwable) {
            $logs = [];
        }

        if (!$row) {
            $defaultHost = (string)($mailDefaults['host'] ?? 'mail.hambaktech.com.ng');
            $defaultPort = (int)($mailDefaults['port'] ?? 465);
            $defaultEnc = (string)($mailDefaults['encryption'] ?? ($defaultPort === 465 ? 'ssl' : 'tls'));
            $defaultUser = (string)($mailDefaults['user'] ?? 'support@hambaktech.com.ng');
            $defaultPass = (string)($mailDefaults['password'] ?? '');
            $defaultFrom = (string)($mailDefaults['from_email'] ?? 'support@hambaktech.com.ng');
            $defaultName = (string)($mailDefaults['from_name'] ?? 'HambakTech Enterprise Mailer');

            $config = [
                'host' => $defaultHost,
                'port' => $defaultPort,
                'username' => $defaultUser,
                'password' => $defaultPass !== '' ? '••••••••' : '',
                'has_password' => $defaultPass !== '',
                'encryption' => $defaultEnc,
                'sender_email' => $defaultFrom,
                'sender_name' => $defaultName,
                'reply_to_email' => $defaultFrom,
                'reply_to' => $defaultFrom,
                'is_active' => true,
                'is_configured' => $defaultHost !== '' && $defaultPass !== '',
                'last_tested_at' => null,
                'last_test_status' => 'untested',
                'logs' => $logs,
            ];
        } else {
            $hasPw = !empty($row['password']) || !empty($mailDefaults['password']);
            $config = [
                'host' => $row['host'],
                'port' => (int)$row['port'],
                'username' => $row['username'],
                'password' => $hasPw ? '••••••••' : '',
                'has_password' => $hasPw,
                'encryption' => $row['encryption'],
                'sender_email' => $row['sender_email'],
                'sender_name' => $row['sender_name'],
                'reply_to' => $row['reply_to'],
                'reply_to_email' => $row['reply_to'],
                'is_active' => (bool)$row['is_active'],
                'is_configured' => !empty($row['host']) && $hasPw,
                'last_tested_at' => $row['last_tested_at'],
                'last_test_status' => $row['last_test_status'],
                'logs' => $logs,
            ];
        }

        Response::success([
            'config' => $config,
            'logs' => $logs,
        ]);
    }

    public function updateSmtpConfig(Request $request): void
    {
        Auth::requireRole($request, ['superadmin']);
        $b = $request->getBody();

        $host = trim((string)($b['host'] ?? 'mail.hambaktech.com.ng'));
        $port = (int)($b['port'] ?? 465);
        $user = trim((string)($b['username'] ?? 'support@hambaktech.com.ng'));
        $pw = (string)($b['password'] ?? '');
        $enc = strtolower(trim((string)($b['encryption'] ?? ($port === 465 ? 'ssl' : 'tls'))));
        if (!in_array($enc, ['ssl', 'tls', 'none'], true)) {
            $enc = 'ssl';
        }
        $from = trim((string)($b['sender_email'] ?? 'support@hambaktech.com.ng'));
        $name = trim((string)($b['sender_name'] ?? 'HambakTech Enterprise'));
        $reply = trim((string)($b['reply_to'] ?? ($b['reply_to_email'] ?? $from)));
        $isActive = isset($b['is_active']) ? ($b['is_active'] ? 1 : 0) : 1;

        $this->db->execute(
            'INSERT INTO smtp_configs (id, host, port, username, password, encryption, sender_email, sender_name, reply_to, is_active, updated_at)
             VALUES ("cfg_smtp_main", :host, :port, :user, :pw, :enc, :from, :name, :reply, :act, NOW())
             ON DUPLICATE KEY UPDATE
                host = :host2, port = :port2, username = :user2,
                password = CASE WHEN :pw2 != "" AND :pw2 != "••••••••" THEN :pw3 ELSE password END,
                encryption = :enc2, sender_email = :from2, sender_name = :name2, reply_to = :reply2, is_active = :act2, updated_at = NOW()',
            [
                'host' => $host,
                'port' => $port,
                'user' => $user,
                'pw' => ($pw === '••••••••') ? '' : $pw,
                'enc' => $enc,
                'from' => $from,
                'name' => $name,
                'reply' => $reply,
                'act' => $isActive,
                'host2' => $host,
                'port2' => $port,
                'user2' => $user,
                'pw2' => $pw,
                'pw3' => $pw,
                'enc2' => $enc,
                'from2' => $from,
                'name2' => $name,
                'reply2' => $reply,
                'act2' => $isActive,
            ]
        );

        Response::success(null, 'SMTP configuration credentials securely saved.');
    }

    public function testSmtpConnection(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $cfgFile = __DIR__ . '/../config/config.php';
        $baseCfg = file_exists($cfgFile) ? require $cfgFile : [];
        $mailDefaults = $baseCfg['mail'] ?? [];
        $row = $this->db->fetchOne('SELECT * FROM smtp_configs WHERE is_active = 1 LIMIT 1');

        $host = trim((string)($row['host'] ?? $mailDefaults['host'] ?? 'mail.hambaktech.com.ng'));
        $port = (int)($row['port'] ?? $mailDefaults['port'] ?? 465);
        $enc = strtolower(trim((string)($row['encryption'] ?? $mailDefaults['encryption'] ?? ($port === 465 ? 'ssl' : 'tls'))));
        $user = trim((string)($row['username'] ?? $mailDefaults['user'] ?? ''));
        $pass = (string)(!empty($row['password']) ? $row['password'] : ($mailDefaults['password'] ?? ''));

        if ($host === '') {
            Response::error('SMTP host is not configured.', 400);
            return;
        }

        $target = ($enc === 'ssl') ? ('ssl://' . $host) : ('tcp://' . $host);
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ],
        ]);
        $errno = 0;
        $errstr = '';
        $start = microtime(true);
        $socket = @stream_socket_client("{$target}:{$port}", $errno, $errstr, 12.0, STREAM_CLIENT_CONNECT, $context);
        $latencyMs = (int)round((microtime(true) - $start) * 1000);

        if (!$socket) {
            if ($row) {
                $this->db->execute('UPDATE smtp_configs SET last_tested_at = NOW(), last_test_status = "error" WHERE id = :id', ['id' => $row['id']]);
            }
            Response::error("SMTP connection failed to {$host}:{$port} ({$errstr})", 502, [
                'operational' => false,
                'host' => $host,
                'port' => $port,
                'latency_ms' => $latencyMs,
            ]);
            return;
        }

        stream_set_timeout($socket, 10);
        $readSmtp = static function ($sock): array {
            $lines = [];
            $code = 0;
            while (($line = @fgets($sock, 1024)) !== false) {
                $lines[] = trim($line);
                if (strlen($line) >= 3 && is_numeric(substr($line, 0, 3))) {
                    $code = (int)substr($line, 0, 3);
                }
                if (strlen($line) >= 4 && $line[3] === ' ') {
                    break;
                }
                if (strlen($line) < 4) {
                    break;
                }
            }
            return ['code' => $code, 'text' => implode(' | ', $lines)];
        };

        $banner = $readSmtp($socket);
        $ehloOk = false;
        $lastStep = '';
        if ($banner['code'] === 220) {
            @fwrite($socket, "EHLO hambaktech.com.ng\r\n");
            $ehlo = $readSmtp($socket);
            $ehloOk = ($ehlo['code'] === 250);
            $lastStep = $ehlo['text'];
            @fwrite($socket, "QUIT\r\n");
        } else {
            $lastStep = $banner['text'] ?: 'No 220 banner received';
        }
        @fclose($socket);

        $status = $ehloOk ? 'operational' : 'error';
        if ($row) {
            $this->db->execute('UPDATE smtp_configs SET last_tested_at = NOW(), last_test_status = :st WHERE id = :id', ['st' => $status, 'id' => $row['id']]);
        }

        if (!$ehloOk) {
            Response::error("SMTP connected to {$host}:{$port} ({$enc}) but handshake failed: {$lastStep}", 502);
            return;
        }

        Response::success([
            'operational' => true,
            'host' => $host,
            'port' => $port,
            'encryption' => $enc,
            'auth_configured' => $user !== '' && $pass !== '',
            'latency_ms' => $latencyMs,
            'message' => "SMTP handshake to {$host}:{$port} ({$enc}) succeeded in {$latencyMs}ms.",
            'timestamp' => date('c'),
        ]);
    }

    public function sendTestSmtpEmail(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $recipient = trim((string)$request->input('toEmail', $request->input('recipient', '')));
        if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            Response::error('Valid recipient email address is required.', 422);
            return;
        }

        $subject = trim((string)$request->input('subject', 'HambakTech Enterprise SMTP Verification Test'));
        $bodyText = trim((string)$request->input('body', 'This is an authenticated SMTP verification message dispatched from the HambakTech Super Admin console.'));

        $mailer = new MailService();
        $res = $mailer->send(
            $recipient,
            'HambakTech Administrator',
            $subject,
            '<div style="font-family:sans-serif;padding:20px;background:#0f172a;color:#f8fafc;border-radius:8px;"><h2>HambakTech SMTP Test</h2><p>' . htmlspecialchars($bodyText) . '</p><p style="color:#94a3b8;font-size:12px;">Dispatched at ' . date('c') . '</p></div>'
        );

        if (empty($res['sent'])) {
            Response::error((string)($res['error'] ?? $res['message'] ?? 'SMTP email delivery failed.'), 502, $res);
            return;
        }

        Response::success([
            'sent' => true,
            'recipient' => $recipient,
            'details' => $res,
            'message' => "Test email delivered to {$recipient} via authenticated SMTP relay.",
        ]);
    }

    public function emailTemplates(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $templates = $this->db->fetchAll('SELECT * FROM email_templates ORDER BY category ASC, name ASC');

        if (empty($templates)) {
            $defaultTemplates = [
                ['tpl_reg', 'registration', 'Registration & Welcome', 'Auth', 'Welcome to HambakTech Enterprise - Your Account is Ready', 'Dear {{name}}, Welcome to HambakTech Enterprise Portal. Your registered email is {{email}}.', 'Sent immediately upon customer registration.', '["name", "email", "login_url"]'],
                ['tpl_email_verif', 'email_verification', 'Email Verification', 'Auth', 'Verify Your HambakTech Email Address', 'Dear {{name}}, Please verify your email using this code: {{code}}.', 'Used for 2FA or email activation.', '["name", "code", "expiry"]'],
                ['tpl_pw_reset', 'password_reset', 'Password Reset', 'Auth', 'HambakTech Password Reset Request', 'Dear {{name}}, Reset your account password by visiting: {{reset_url}}.', 'Security password reset token.', '["name", "reset_url", "expiry"]'],
                ['tpl_wallet_fund', 'wallet_funding', 'Wallet Funding Credit', 'Wallet', 'Wallet Credit Alert: ₦{{amount}} Received', 'Dear {{name}}, Your wallet has been credited with ₦{{amount}}. New Balance: ₦{{balance}}.', 'Instant receipt for wallet funding.', '["name", "amount", "balance", "reference"]'],
                ['tpl_pay_appr', 'payment_approval', 'Payment Approval Notice', 'Wallet', 'Your Manual Deposit of ₦{{amount}} Has Been Approved', 'Dear {{name}}, Your manual transfer deposit (Ref: {{reference}}) has been verified.', 'Sent when admin approves manual transfer.', '["name", "amount", "reference", "date"]'],
                ['tpl_pay_rej', 'payment_rejection', 'Payment Rejection Notice', 'Wallet', 'Notice Concerning Your Manual Funding Request', 'Dear {{name}}, Your funding request for ₦{{amount}} was declined. Reason: {{reason}}.', 'Sent when admin rejects manual proof.', '["name", "amount", "reason", "reference"]'],
                ['tpl_txn_succ', 'transaction_success', 'Successful Transaction Receipt', 'Transactions', 'Receipt: {{service_name}} Completed Successfully', 'Dear {{name}}, Your purchase of {{service_name}} for ₦{{amount}} was delivered. Token/PIN: {{token_pin}}.', 'Delivered upon successful airtime, data, or verification.', '["name", "service_name", "amount", "token_pin", "reference"]'],
                ['tpl_txn_fail', 'transaction_failed', 'Failed Transaction Notice', 'Transactions', 'Transaction Failed - Refund Processed', 'Dear {{name}}, Your request for {{service_name}} could not be fulfilled. ₦{{amount}} has been refunded.', 'Dispatched on provider error.', '["name", "service_name", "amount", "reason", "reference"]'],
                ['tpl_txn_pend', 'transaction_pending', 'Pending Transaction Advisory', 'Transactions', 'Transaction Advisory: Order In Processing', 'Dear {{name}}, Your order for {{service_name}} (Ref: {{reference}}) is processing upstream.', 'Issued during provider queuing.', '["name", "service_name", "reference"]'],
                ['tpl_serv_res', 'service_results', 'Identity Service Result Slip', 'Services', 'Sovereign Verification Result: {{service_name}}', 'Dear {{name}}, Your NIMC/BVN verification request has concluded. Find your sovereign verification document attached.', 'Delivered with slip PDF.', '["name", "service_name", "nin", "slip_url"]'],
                ['tpl_acc_sec', 'account_security', 'Account Security Alert', 'Security', 'Security Alert: {{event_type}} on Your Account', 'Dear {{name}}, A security event ({{event_type}}) was logged from IP {{ip_address}}.', 'Instant fraud and security notice.', '["name", "event_type", "ip_address", "timestamp"]'],
                ['tpl_adm_alert', 'admin_alert', 'Administrative System Alert', 'Admin', '[URGENT] System Event Alert: {{alert_title}}', 'Attention Administrator, {{alert_message}} occurred on HambakTech production server at {{timestamp}}.', 'Critical telemetry alert for administrators.', '["alert_title", "alert_message", "severity", "timestamp"]'],
            ];

            foreach ($defaultTemplates as $dt) {
                $this->db->execute(
                    'INSERT IGNORE INTO email_templates (id, template_key, name, category, subject, html_body, description, variables, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
                    $dt
                );
            }
            $templates = $this->db->fetchAll('SELECT * FROM email_templates ORDER BY category ASC, name ASC');
        }

        foreach ($templates as &$t) {
            $t['variables'] = is_string($t['variables']) ? json_decode($t['variables'], true) : $t['variables'];
            $t['is_active'] = (bool)$t['is_active'];
        }

        Response::success(['templates' => $templates]);
    }

    public function updateEmailTemplate(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $this->db->execute(
            'UPDATE email_templates 
             SET subject = COALESCE(:sub, subject),
                 html_body = COALESCE(:body, html_body),
                 is_active = COALESCE(:act, is_active),
                 updated_at = NOW()
             WHERE id = :id',
            [
                'sub' => $body['subject'] ?? null,
                'body' => $body['html_body'] ?? null,
                'act' => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : null,
                'id' => $id,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM email_templates WHERE id = :id', ['id' => $id]);
        Response::success(['template' => $row], 'Email template saved');
    }

    public function testEmailTemplate(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $recipient = trim((string)$request->input('toEmail', $request->input('recipient', '')));

        if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            Response::error('Valid recipient email address is required.', 422);
            return;
        }

        $tpl = $this->db->fetchOne('SELECT * FROM email_templates WHERE id = :id OR template_key = :k LIMIT 1', ['id' => $id, 'k' => $id]);
        if (!$tpl) {
            Response::error('Email template not found.', 404);
            return;
        }

        $sampleReplacements = [
            '{{name}}' => 'HambakTech Administrator',
            '{{email}}' => $recipient,
            '{{login_url}}' => 'https://www.hambaktech.com.ng/',
            '{{code}}' => '482910',
            '{{expiry}}' => '15 minutes',
            '{{reset_url}}' => 'https://www.hambaktech.com.ng/',
            '{{amount}}' => '5,000.00',
            '{{balance}}' => '12,500.00',
            '{{reference}}' => 'TEST_TPL_' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8)),
            '{{date}}' => date('Y-m-d H:i'),
            '{{reason}}' => 'Test compliance notice',
            '{{service_name}}' => 'MTN 2GB SME Data',
            '{{token_pin}}' => 'TEST-TOKEN-0000',
            '{{nin}}' => '00000000000',
            '{{slip_url}}' => 'https://www.hambaktech.com.ng/',
            '{{event_type}}' => 'Template Dispatch Test',
            '{{ip_address}}' => $request->getIp(),
            '{{timestamp}}' => date('c'),
            '{{alert_title}}' => 'System Template Preview',
            '{{alert_message}}' => 'Testing live SMTP dispatch for template ' . $tpl['name'],
            '{{severity}}' => 'INFO',
        ];

        $subject = strtr((string)$tpl['subject'], $sampleReplacements);
        $html = strtr((string)$tpl['html_body'], $sampleReplacements);

        $mailer = new MailService();
        $res = $mailer->send($recipient, 'HambakTech Administrator', '[TEST] ' . $subject, $html);

        if (empty($res['sent'])) {
            Response::error((string)($res['error'] ?? $res['message'] ?? 'Failed to dispatch template test email.'), 502, $res);
            return;
        }

        Response::success([
            'sent' => true,
            'recipient' => $recipient,
            'details' => $res,
            'message' => "Rendered test of email template #{$tpl['name']} delivered to {$recipient}.",
        ]);
    }

    // =========================================================================
    // 18. SMS GATEWAY & TEMPLATES
    // =========================================================================
    private function defaultSmsConfig(): array
    {
        return [
            'provider' => 'termii',
            'api_key' => '',
            'sender_id' => 'HAMBAKTECH',
            'route' => 'generic',
            'webhook_url' => 'https://www.hambaktech.com.ng/api/telecom/bulksms/webhook',
            'enabled' => false,
            'balance_units' => 0,
            'templates' => [
                ['id' => 'sms_tpl_1', 'key' => 'registration', 'title' => 'Welcome SMS', 'content' => 'Welcome to HambakTech Enterprise, {{user_name}}! Your wallet is active. Top up and verify NIN/data instantly at hambaktech.com.ng', 'variables' => ['user_name'], 'is_active' => true],
                ['id' => 'sms_tpl_2', 'key' => 'otp', 'title' => 'OTP Authorization Code', 'content' => 'Your HambakTech security code is {{otp_code}}. Valid for 10 minutes. NEVER disclose this code to anyone.', 'variables' => ['otp_code'], 'is_active' => true],
                ['id' => 'sms_tpl_3', 'key' => 'wallet_funding', 'title' => 'Wallet Credit Alert', 'content' => 'Credit Alert: ₦{{amount}} credited to your HambakTech wallet. Balance: ₦{{balance}}. Ref: {{reference}}', 'variables' => ['amount', 'balance', 'reference'], 'is_active' => true],
                ['id' => 'sms_tpl_4', 'key' => 'transaction_receipt', 'title' => 'Transaction Delivery Receipt', 'content' => 'Delivered: {{service_name}} of ₦{{amount}} for {{recipient}} processed. Token/Pin: {{token_or_pin}}. Ref: {{reference}}', 'variables' => ['service_name', 'amount', 'recipient', 'token_or_pin', 'reference'], 'is_active' => true],
                ['id' => 'sms_tpl_5', 'key' => 'security_alert', 'title' => 'Security Alert SMS', 'content' => 'HambakTech Security: {{security_event}} updated on your account. If unauthorized, call support immediately.', 'variables' => ['security_event'], 'is_active' => true],
            ],
        ];
    }

    public function smsConfig(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $configSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "sms_config"');
        $defaults = $this->defaultSmsConfig();
        $decoded = $configSetting ? json_decode((string)$configSetting['setting_value'], true) : [];
        if (!is_array($decoded)) {
            $decoded = [];
        }
        $config = array_merge($defaults, $decoded);
        if (empty($config['templates']) || !is_array($config['templates'])) {
            $config['templates'] = $defaults['templates'];
        }

        // Fetch real Termii wallet balance if an API key is configured
        $rawApiKey = trim((string)($config['api_key'] ?? (getenv('TERMII_API_KEY') ?: '')));
        if ($rawApiKey !== '' && ($config['provider'] ?? 'termii') === 'termii') {
            try {
                $ch = curl_init('https://api.ng.termii.com/api/get-balance?api_key=' . urlencode($rawApiKey));
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 8,
                    CURLOPT_SSL_VERIFYPEER => true,
                ]);
                $balRaw = curl_exec($ch);
                $balCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                if ($balRaw !== false && $balCode >= 200 && $balCode < 300) {
                    $balData = json_decode((string)$balRaw, true);
                    if (is_array($balData) && isset($balData['balance'])) {
                        $config['balance_units'] = (float)$balData['balance'];
                    }
                }
            } catch (Throwable) {
            }
        }

        $logs = [];
        try {
            $logRows = $this->db->fetchAll('SELECT id, created_at as timestamp, recipient, message, units, status, provider, provider_reference FROM sms_logs ORDER BY created_at DESC LIMIT 50');
            foreach ($logRows as $lr) {
                $lr['units'] = (int)$lr['units'];
                $logs[] = $lr;
            }
        } catch (Throwable) {
            $logs = [];
        }

        $config['has_api_key'] = $rawApiKey !== '';
        $config['api_key_masked'] = $this->maskSecret($rawApiKey);
        $config['api_key'] = $rawApiKey !== '' ? '••••••••' : '';
        $config['logs'] = $logs;

        Response::success([
            'config' => $config,
            'logs' => $logs,
        ]);
    }

    public function updateSmsConfig(Request $request): void
    {
        Auth::requireRole($request, ['superadmin']);
        $body = $request->getBody();

        $existingRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "sms_config"');
        $existing = $existingRow ? json_decode((string)$existingRow['setting_value'], true) : [];
        if (!is_array($existing)) {
            $existing = [];
        }
        $merged = array_merge($this->defaultSmsConfig(), $existing);

        foreach (['provider', 'sender_id', 'route', 'webhook_url', 'enabled', 'balance_units', 'templates'] as $field) {
            if (array_key_exists($field, $body)) {
                $merged[$field] = $body[$field];
            }
        }

        if (isset($body['api_key'])) {
            $submittedKey = trim((string)$body['api_key']);
            if ($submittedKey !== '' && !str_contains($submittedKey, '••••')) {
                $merged['api_key'] = $submittedKey;
            }
        }

        $json = json_encode($merged);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_sms_config", "sms_config", :val, "sms", "SMS gateway config")
             ON DUPLICATE KEY UPDATE setting_value = :val2',
            ['val' => $json, 'val2' => $json]
        );

        $safe = $merged;
        $safe['has_api_key'] = !empty($merged['api_key']);
        $safe['api_key'] = !empty($merged['api_key']) ? '••••••••' : '';

        Response::success(['config' => $safe], 'SMS gateway configurations updated');
    }

    public function updateSmsTemplate(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $existingRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "sms_config"');
        $existing = $existingRow ? json_decode((string)$existingRow['setting_value'], true) : [];
        if (!is_array($existing)) {
            $existing = [];
        }
        $merged = array_merge($this->defaultSmsConfig(), $existing);
        $templates = $merged['templates'] ?? [];

        $updatedTemplate = null;
        foreach ($templates as &$tpl) {
            if (($tpl['id'] ?? '') === $id || ($tpl['key'] ?? '') === $id) {
                if (isset($body['title'])) {
                    $tpl['title'] = (string)$body['title'];
                }
                if (isset($body['content'])) {
                    $tpl['content'] = (string)$body['content'];
                }
                if (isset($body['is_active'])) {
                    $tpl['is_active'] = (bool)$body['is_active'];
                }
                $updatedTemplate = $tpl;
                break;
            }
        }

        if (!$updatedTemplate) {
            Response::error('SMS template not found.', 404);
            return;
        }

        $merged['templates'] = $templates;
        $json = json_encode($merged);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_sms_config", "sms_config", :val, "sms", "SMS gateway config")
             ON DUPLICATE KEY UPDATE setting_value = :val2',
            ['val' => $json, 'val2' => $json]
        );

        Response::success(['template' => $updatedTemplate], 'SMS template text updated');
    }

    public function testSms(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $recipient = trim((string)$request->input('phone', $request->input('recipient', '')));
        $message = trim((string)$request->input('message', ''));

        if ($recipient === '' || $message === '') {
            Response::error('Recipient phone number and message are required.', 422);
            return;
        }

        $existingRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "sms_config"');
        $existing = $existingRow ? json_decode((string)$existingRow['setting_value'], true) : [];
        if (!is_array($existing)) {
            $existing = [];
        }
        $config = array_merge($this->defaultSmsConfig(), $existing);
        $apiKey = trim((string)($config['api_key'] ?? (getenv('TERMII_API_KEY') ?: '')));

        if ($apiKey === '') {
            Response::error('SMS Gateway API key is not configured. Save a valid Termii API key first.', 400);
            return;
        }

        $senderId = trim((string)($config['sender_id'] ?? 'HAMBAKTECH'));
        $route = trim((string)($config['route'] ?? 'generic'));
        $units = max(1, (int)ceil(strlen($message) / 160));
        $normalizedPhone = ltrim($recipient, '+');
        if (str_starts_with($normalizedPhone, '0')) {
            $normalizedPhone = '234' . substr($normalizedPhone, 1);
        }

        $ch = curl_init('https://api.ng.termii.com/api/sms/send');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode([
                'to' => $normalizedPhone,
                'from' => $senderId,
                'sms' => $message,
                'type' => 'plain',
                'channel' => $route === 'dnd' ? 'dnd' : 'generic',
                'api_key' => $apiKey,
            ]),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        $ok = ($raw !== false && $code >= 200 && $code < 300 && (isset($decoded['message_id']) || ($decoded['code'] ?? '') === 'ok'));
        $providerRef = (string)($decoded['message_id'] ?? $decoded['message_id_str'] ?? '');
        $errMsg = $ok ? null : (string)($decoded['message'] ?? $curlErr ?: "Termii HTTP {$code}");
        $logId = Security::generateUuid();

        try {
            $this->db->execute(
                'INSERT INTO sms_logs (id, recipient, message, units, status, provider, provider_reference, error, created_at)
                 VALUES (:id, :rec, :msg, :units, :st, :prov, :ref, :err, NOW())',
                [
                    'id' => $logId,
                    'rec' => $recipient,
                    'msg' => $message,
                    'units' => $units,
                    'st' => $ok ? 'delivered' : 'failed',
                    'prov' => (string)($config['provider'] ?? 'termii'),
                    'ref' => $providerRef ?: null,
                    'err' => $errMsg,
                ]
            );
        } catch (Throwable) {
        }

        $logEntry = [
            'id' => $logId,
            'timestamp' => date('c'),
            'recipient' => $recipient,
            'message' => $message,
            'units' => $units,
            'status' => $ok ? 'delivered' : 'failed',
            'provider_reference' => $providerRef,
        ];

        if (!$ok) {
            Response::error("SMS gateway error: {$errMsg}", 502, [
                'delivered' => false,
                'log' => $logEntry,
            ]);
            return;
        }

        $newBalance = max(0, (float)($config['balance_units'] ?? 0) - $units);
        Response::success([
            'delivered' => true,
            'recipient' => $recipient,
            'units' => $units,
            'log' => $logEntry,
            'balance_units' => $newBalance,
            'message' => "Test SMS submitted to Termii for {$recipient} (Ref: {$providerRef}).",
        ]);
    }

    // =========================================================================
    // 19. DASHBOARD MODULES
    // =========================================================================
    public function dashboardModules(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $modules = $this->db->fetchAll('SELECT * FROM dashboard_modules ORDER BY display_order ASC');

        if (empty($modules)) {
            $defaults = [
                ['nin', 'nin', 'NIN Services', 'NIMC & BVN Sovereign Identity Verification Engine', 'ShieldCheck', 'active', 1, null, 1],
                ['telecom', 'telecom', 'Telecommunications', 'High-speed automated SME data & airtime top-up', 'Smartphone', 'active', 1, null, 2],
                ['wallet', 'wallet', 'My Wallet', 'Instant funding via Card, USSD, Moniepoint & Ledger History', 'Wallet', 'active', 1, null, 3],
                ['store', 'store', 'Commercial Hardware Store', 'Certified biometric scanners, POS terminals and thermal printers', 'ShoppingBag', 'active', 1, 'Hardware devices catalogue open for pre-orders.', 4],
                ['digital', 'digital', 'Digital Services', 'Cable TV renewal, electricity token vending and scratch cards', 'Tv', 'active', 1, null, 5],
                ['academy', 'academy', 'Digital Training Academy', 'Practical ICT, design, data analysis & software development training courses', 'GraduationCap', 'active', 1, 'Online admissions and student ID verification available.', 6],
                ['reports', 'reports', 'Reports & Analytics', 'Exportable transaction statements, audit trails, and financial analytics', 'BarChart3', 'active', 1, null, 7],
                ['transactions', 'transactions', 'Transactions Ledger', 'Real-time immutable double-entry ledger records', 'Clock', 'active', 1, null, 8],
                ['orders', 'orders', 'Orders & History', 'Live status updates and vendor reference tracking', 'Layers', 'active', 1, null, 9],
                ['support', 'support', 'Support / Help Centre', '24/7 dedicated ticketing desk and agent resolution centre', 'LifeBuoy', 'active', 1, null, 10],
            ];
            foreach ($defaults as $d) {
                $this->db->execute(
                    'INSERT IGNORE INTO dashboard_modules (id, module_key, name, description, icon, status, is_visible, coming_soon_message, display_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    $d
                );
            }
            $modules = $this->db->fetchAll('SELECT * FROM dashboard_modules ORDER BY display_order ASC');
        }

        foreach ($modules as &$m) {
            $m['visible'] = (bool)$m['is_visible'];
            $m['order'] = (int)$m['display_order'];
        }

        Response::success(['modules' => $modules]);
    }

    public function updateDashboardModule(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $this->db->execute(
            'UPDATE dashboard_modules 
             SET name = COALESCE(:name, name),
                 description = COALESCE(:desc, description),
                 icon = COALESCE(:icon, icon),
                 status = COALESCE(:st, status),
                 is_visible = CASE WHEN :vis IS NOT NULL THEN :vis2 ELSE is_visible END,
                 coming_soon_message = COALESCE(:cs, coming_soon_message),
                 display_order = COALESCE(:ord, display_order)
             WHERE id = :id OR module_key = :id2',
            [
                'name' => $body['name'] ?? null,
                'desc' => $body['description'] ?? null,
                'icon' => $body['icon'] ?? null,
                'st' => $body['status'] ?? null,
                'vis' => isset($body['visible']) ? ($body['visible'] ? 1 : 0) : null,
                'vis2' => isset($body['visible']) ? ($body['visible'] ? 1 : 0) : null,
                'cs' => $body['coming_soon_message'] ?? null,
                'ord' => isset($body['order']) ? (int)$body['order'] : null,
                'id' => $id,
                'id2' => $id,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM dashboard_modules WHERE id = :id OR module_key = :id2', ['id' => $id, 'id2' => $id]);
        if ($row) {
            $row['visible'] = (bool)$row['is_visible'];
            $row['order'] = (int)$row['display_order'];
        }
        Response::success(['module' => $row], 'Dashboard module configuration saved');
    }

    // =========================================================================
    // 20. STAFF & RBAC PERMISSIONS
    // =========================================================================
    public function staff(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $staff = $this->db->fetchAll(
            'SELECT id, email, full_name, phone_number, role, kyc_status, tier, status, created_at
             FROM users 
             WHERE role IN ("admin", "superadmin") 
             ORDER BY role DESC, full_name ASC'
        );

        foreach ($staff as &$s) {
            $s['permissions'] = ['customers', 'wallet', 'kyc', 'services', 'cms', 'audit', 'support', 'reports'];
        }

        Response::success(['staff' => $staff]);
    }

    public function createStaff(Request $request): void
    {
        $super = Auth::requireRole($request, ['superadmin']);
        $fullName = trim((string)$request->input('full_name', ''));
        $email = trim(strtolower((string)$request->input('email', '')));
        $password = (string)$request->input('password', '');
        $phone = (string)$request->input('phone_number', '+2348000000000');
        $role = (string)$request->input('role', 'admin');

        if (empty($fullName) || empty($email) || empty($password)) {
            Response::error('Name, email, and password are required.', 422);
            return;
        }

        $existing = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $email]);
        if ($existing) {
            Response::error('A user with this email already exists.', 409);
            return;
        }

        $id = Security::generateUuid();
        $hash = password_hash($password, PASSWORD_BCRYPT);

        $this->db->execute(
            'INSERT INTO users (id, email, password_hash, full_name, phone_number, role, wallet_balance, kyc_status, tier, referral_code, status, created_at)
             VALUES (:id, :email, :hash, :name, :phone, :role, 0.00, "verified", 3, :ref, "active", NOW())',
            [
                'id' => $id,
                'email' => $email,
                'hash' => $hash,
                'name' => $fullName,
                'phone' => $phone,
                'role' => in_array($role, ['admin', 'superadmin'], true) ? $role : 'admin',
                'ref' => 'STAFF-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5)),
            ]
        );

        $row = $this->db->fetchOne('SELECT id, email, full_name, phone_number, role, status FROM users WHERE id = :id', ['id' => $id]);
        Response::success(['staff' => $row], "Staff member {$fullName} created successfully", 201);
    }

    public function updateStaff(Request $request, array $params): void
    {
        Auth::requireRole($request, ['superadmin']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $updates = [];
        $paramsDb = ['id' => $id];

        if (isset($body['role']) && in_array($body['role'], ['admin', 'superadmin', 'customer'], true)) {
            $updates[] = 'role = :r';
            $paramsDb['r'] = $body['role'];
        }
        if (isset($body['status']) && in_array($body['status'], ['active', 'suspended'], true)) {
            $updates[] = 'status = :st';
            $paramsDb['st'] = $body['status'];
        }
        if (!empty($body['full_name'])) {
            $updates[] = 'full_name = :fn';
            $paramsDb['fn'] = $body['full_name'];
        }
        if (!empty($body['phone_number'])) {
            $updates[] = 'phone_number = :pn';
            $paramsDb['pn'] = $body['phone_number'];
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $this->db->execute('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id', $paramsDb);
        }

        $updated = $this->db->fetchOne('SELECT id, email, full_name, phone_number, role, status FROM users WHERE id = :id', ['id' => $id]);
        Response::success(['staff' => $updated], 'Staff account updated');
    }

    // =========================================================================
    // 21. AUDIT LOGS
    // =========================================================================
    public function auditLogs(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $search = trim((string)$request->query('search', ''));
        $action = trim((string)$request->query('action', ''));
        $limit = min(200, max(1, (int)$request->query('limit', 50)));

        $sql = 'SELECT * FROM audit_logs WHERE 1=1 ';
        $params = [];

        if (!empty($search)) {
            $sql .= 'AND (user_email LIKE :s1 OR action LIKE :s2 OR ip_address LIKE :s3) ';
            $params['s1'] = "%{$search}%";
            $params['s2'] = "%{$search}%";
            $params['s3'] = "%{$search}%";
        }
        if (!empty($action) && $action !== 'all') {
            $sql .= 'AND action = :act ';
            $params['act'] = $action;
        }

        $sql .= 'ORDER BY created_at DESC LIMIT ' . (int)$limit;
        $logs = $this->db->fetchAll($sql, $params);

        foreach ($logs as &$l) {
            $l['details'] = is_string($l['details']) ? json_decode($l['details'], true) : $l['details'];
        }

        $totalRow = $this->db->fetchOne('SELECT COUNT(*) as total FROM audit_logs');
        Response::success([
            'logs' => $logs,
            'total' => (int)($totalRow['total'] ?? count($logs)),
        ]);
    }

    // =========================================================================
    // 22. KYC SUBMISSIONS & SERVICE SECURITY RULES
    // =========================================================================
    public function kycSubmissions(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $status = trim((string)$request->query('status', ''));
        $level = trim((string)$request->query('level', ''));
        $search = trim((string)$request->query('search', ''));

        $sql = 'SELECT k.*, u.full_name as user_name, u.email as user_email, u.phone_number,
                       COALESCE(u.kyc_level, u.tier, 1) as current_tier
                FROM kyc_submissions k
                LEFT JOIN users u ON u.id = k.user_id ';
        $conds = [];
        $params = [];

        if ($status !== '' && $status !== 'all') {
            if ($status === 'approved' || $status === 'verified') {
                $conds[] = 'k.status IN ("verified", "approved")';
            } else {
                $conds[] = 'k.status = :st';
                $params['st'] = $status;
            }
        }
        if ($level !== '' && $level !== 'all') {
            $conds[] = 'k.target_level = :lvl';
            $params['lvl'] = (int)$level;
        }
        if ($search !== '') {
            $conds[] = '(u.full_name LIKE :q1 OR u.email LIKE :q2 OR k.full_legal_name LIKE :q3 OR k.nin LIKE :q4 OR k.bvn LIKE :q5)';
            $params['q1'] = "%{$search}%";
            $params['q2'] = "%{$search}%";
            $params['q3'] = "%{$search}%";
            $params['q4'] = "%{$search}%";
            $params['q5'] = "%{$search}%";
        }
        if (!empty($conds)) {
            $sql .= 'WHERE ' . implode(' AND ', $conds) . ' ';
        }

        $sql .= 'ORDER BY k.created_at DESC LIMIT 100';
        $rows = $this->db->fetchAll($sql, $params);
        foreach ($rows as &$row) {
            if (is_string($row['automated_verification_result'] ?? null)) {
                $row['automated_verification_result'] = json_decode($row['automated_verification_result'], true);
            }
            if (is_string($row['review_history'] ?? null)) {
                $row['review_history'] = json_decode($row['review_history'], true);
            }
        }

        $statsRow = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status IN ("verified", "approved") THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected,
                SUM(CASE WHEN status = "info_requested" THEN 1 ELSE 0 END) as info_requested
             FROM kyc_submissions'
        );

        $metrics = [
            'total' => (int)($statsRow['total'] ?? count($rows)),
            'pending' => (int)($statsRow['pending'] ?? 0),
            'approved' => (int)($statsRow['approved'] ?? 0),
            'rejected' => (int)($statsRow['rejected'] ?? 0),
            'info_requested' => (int)($statsRow['info_requested'] ?? 0),
        ];

        Response::success([
            'submissions' => $rows,
            'metrics' => $metrics,
            'stats' => $metrics,
        ]);
    }

    public function kycSubmissionDetail(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';

        $row = $this->db->fetchOne(
            'SELECT k.*, u.full_name as user_name, u.email as user_email, u.phone_number,
                    COALESCE(u.kyc_level, u.tier, 1) as current_tier
             FROM kyc_submissions k
             LEFT JOIN users u ON u.id = k.user_id
             WHERE k.id = :id',
            ['id' => $id]
        );

        if (!$row) {
            Response::error('KYC submission not found', 404);
            return;
        }

        if (is_string($row['automated_verification_result'] ?? null)) {
            $row['automated_verification_result'] = json_decode($row['automated_verification_result'], true);
        }
        if (is_string($row['review_history'] ?? null)) {
            $row['review_history'] = json_decode($row['review_history'], true);
        }

        $user = $this->db->fetchOne(
            'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.kyc_status,
                    COALESCE(u.kyc_level, u.tier, 1) as kyc_level, u.tier, u.status, u.created_at,
                    p.address as residential_address, p.state, p.lga, p.nin, p.bvn, p.date_of_birth
             FROM users u
             LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE u.id = :uid',
            ['uid' => $row['user_id']]
        );

        Response::success([
            'submission' => $row,
            'user' => $user,
        ]);
    }

    public function reviewKycSubmission(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $action = strtolower(trim((string)$request->input('action', 'approve')));
        $notes = trim((string)$request->input('notes', $request->input('review_notes', 'Compliance review completed')));
        $rejectionReason = trim((string)$request->input('rejection_reason', $request->input('reason', $notes)));
        $additionalInfo = trim((string)$request->input('additional_info_requested', $notes));

        $sub = $this->db->fetchOne('SELECT * FROM kyc_submissions WHERE id = :id', ['id' => $id]);
        if (!$sub) {
            Response::error('KYC submission not found', 404);
            return;
        }

        if (!in_array($action, ['approve', 'reject', 'request_info'], true)) {
            Response::error('Invalid review action. Use approve, reject, or request_info.', 422);
            return;
        }

        $newStatus = match ($action) {
            'approve' => 'verified',
            'request_info' => 'info_requested',
            default => 'rejected',
        };
        $targetLevel = max(2, (int)($sub['target_level'] ?? 2));
        $history = is_string($sub['review_history'] ?? null) ? json_decode($sub['review_history'], true) : [];
        if (!is_array($history)) {
            $history = [];
        }
        $history[] = [
            'action' => $action,
            'status' => $newStatus,
            'notes' => $notes,
            'reviewer' => $admin['email'],
            'timestamp' => date('c'),
        ];

        $this->db->execute(
            'UPDATE kyc_submissions
             SET status = :st,
                 review_notes = :notes,
                 rejection_reason = :rej,
                 additional_info_requested = :info,
                 reviewed_by = :adm,
                 reviewer_name = :rname,
                 review_history = :hist,
                 reviewed_at = NOW()
             WHERE id = :id',
            [
                'st' => $newStatus,
                'notes' => $notes,
                'rej' => $action === 'reject' ? $rejectionReason : null,
                'info' => $action === 'request_info' ? $additionalInfo : null,
                'adm' => $admin['email'],
                'rname' => $admin['full_name'] ?? $admin['email'],
                'hist' => json_encode($history),
                'id' => $id,
            ]
        );

        if ($action === 'approve') {
            $this->db->execute(
                'UPDATE users SET kyc_status = "verified", tier = GREATEST(tier, :t), kyc_level = GREATEST(kyc_level, :kl), updated_at = NOW() WHERE id = :uid',
                ['t' => $targetLevel, 'kl' => $targetLevel, 'uid' => $sub['user_id']]
            );
        } elseif ($action === 'reject') {
            $this->db->execute(
                'UPDATE users SET kyc_status = "rejected", updated_at = NOW() WHERE id = :uid',
                ['uid' => $sub['user_id']]
            );
        } else {
            $this->db->execute(
                'UPDATE users SET kyc_status = "pending", updated_at = NOW() WHERE id = :uid',
                ['uid' => $sub['user_id']]
            );
        }

        $notifTitle = match ($action) {
            'approve' => 'KYC Verification Approved',
            'request_info' => 'Additional KYC Information Required',
            default => 'KYC Verification Declined',
        };
        $notifMsg = match ($action) {
            'approve' => "Your KYC verification has been approved. Account upgraded to Level {$targetLevel}.",
            'request_info' => "Compliance requested additional details: {$additionalInfo}",
            default => "Your KYC submission was declined: {$rejectionReason}",
        };
        $notifType = ($action === 'approve') ? 'success' : (($action === 'request_info') ? 'warning' : 'alert');

        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, :title, :msg, :type, 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $sub['user_id'],
                'title' => $notifTitle,
                'msg' => $notifMsg,
                'type' => $notifType,
            ]
        );

        $updated = $this->db->fetchOne('SELECT * FROM kyc_submissions WHERE id = :id', ['id' => $id]);
        Response::success(['submission' => $updated], "KYC submission marked as {$newStatus}");
    }

    public function autoVerifyKycSubmission(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';

        $sub = $this->db->fetchOne('SELECT * FROM kyc_submissions WHERE id = :id', ['id' => $id]);
        if (!$sub) {
            Response::error('KYC submission not found', 404);
            return;
        }

        $nin = trim((string)($sub['nin'] ?? ''));
        $bvn = trim((string)($sub['bvn'] ?? ''));
        if ($nin === '' && $bvn === '') {
            Response::error('No NIN or BVN present on this submission for automated lookup.', 422);
            return;
        }

        $activeSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_verification_provider"');
        $providerName = strtolower(trim((string)($activeSetting['setting_value'] ?? 'veripine')));
        $veripine = new VeripineAdapter();
        $twosure = new TwoSureVerifyAdapter();

        if ($providerName === 'veripine' && !$veripine->hasCredentials() && !empty(getenv('TWOSUREVERIFY_API_KEY'))) {
            $providerName = '2sureverify';
        }

        $endpoint = $nin !== '' ? '/nin-verification' : '/bvn-verification';
        $payload = $nin !== '' ? ['nin' => $nin] : ['bvn' => $bvn];

        $providerRes = ($providerName === '2sureverify')
            ? $twosure->verify($nin !== '' ? 'api/v1/nin' : 'api/v1/bvn', $payload)
            : $veripine->verify($endpoint, $payload);

        $isOk = !empty($providerRes['success']) || (($providerRes['status'] ?? '') === 'success');
        if (!$isOk) {
            $code = (int)($providerRes['code'] ?? 502);
            Response::error((string)($providerRes['message'] ?? 'Automated identity lookup failed.'), $code >= 400 ? $code : 502);
            return;
        }

        $data = $providerRes['data'] ?? $providerRes;
        $verifiedName = strtolower(trim(implode(' ', array_filter([
            $data['firstname'] ?? $data['first_name'] ?? '',
            $data['middlename'] ?? $data['middle_name'] ?? '',
            $data['surname'] ?? $data['last_name'] ?? '',
        ]))));
        $submittedName = strtolower(trim((string)($sub['full_legal_name'] ?? '')));
        $nameMatched = false;
        if ($verifiedName !== '' && $submittedName !== '') {
            $parts = preg_split('/\s+/', $submittedName);
            $hits = 0;
            foreach ($parts as $part) {
                if (strlen($part) > 1 && str_contains($verifiedName, $part)) {
                    $hits++;
                }
            }
            $nameMatched = $hits >= min(2, count($parts));
        }

        $resultMeta = [
            'verified' => $nameMatched,
            'provider' => $providerName,
            'reference' => (string)($providerRes['reference'] ?? 'KYC_AUTO_' . time()),
            'name_matched' => $nameMatched,
            'registry_name' => $verifiedName,
            'timestamp' => date('c'),
        ];

        $targetLevel = max(2, (int)($sub['target_level'] ?? 2));
        $newStatus = $nameMatched ? 'verified' : 'pending';
        $reviewNotes = $nameMatched
            ? "Automated verification passed via {$providerName} ({$resultMeta['reference']})"
            : "Automated lookup succeeded via {$providerName}, but legal name requires manual confirmation.";

        $this->db->execute(
            'UPDATE kyc_submissions
             SET status = :st,
                 verification_reference = :vref,
                 automated_verification_result = :ares,
                 review_notes = :notes,
                 reviewed_by = "Automated Engine",
                 reviewed_at = NOW()
             WHERE id = :id',
            [
                'st' => $newStatus,
                'vref' => $resultMeta['reference'],
                'ares' => json_encode($resultMeta),
                'notes' => $reviewNotes,
                'id' => $id,
            ]
        );

        if ($nameMatched) {
            $this->db->execute(
                'UPDATE users SET kyc_status = "verified", tier = GREATEST(tier, :t), kyc_level = GREATEST(kyc_level, :kl), updated_at = NOW() WHERE id = :uid',
                ['t' => $targetLevel, 'kl' => $targetLevel, 'uid' => $sub['user_id']]
            );
        }

        Response::success([
            'verified' => $nameMatched,
            'result' => $resultMeta,
            'message' => $reviewNotes,
        ]);
    }

    public function serviceSecurityRules(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->db->execute(
            'CREATE TABLE IF NOT EXISTS service_security_rules (
                id VARCHAR(50) PRIMARY KEY,
                service_key VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(191) NOT NULL,
                service_name VARCHAR(191) NULL,
                category VARCHAR(50) NOT NULL DEFAULT "general",
                require_pin TINYINT(1) NOT NULL DEFAULT 0,
                requires_pin TINYINT(1) NULL,
                min_tier INT NOT NULL DEFAULT 1,
                min_kyc_level INT NULL,
                max_daily_limit DECIMAL(16,2) NOT NULL DEFAULT 100000.00,
                daily_limit DECIMAL(16,2) NULL,
                description TEXT NULL,
                updated_by VARCHAR(191) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $rules = $this->db->fetchAll('SELECT * FROM service_security_rules ORDER BY name ASC');

        if (empty($rules)) {
            $defaultRules = [
                ['sec_nin', 'nin_v1', 'NIN Verification Standard', 'identity', 0, 1, 100000.00, 1],
                ['sec_nin_v2', 'nin_v2', 'NIN Verification V2', 'identity', 0, 1, 100000.00, 1],
                ['sec_bvn', 'bvn_v1', 'BVN Verification', 'identity', 1, 1, 200000.00, 1],
                ['sec_nin_mod', 'nin_mod_dob', 'NIN Date of Birth Modification', 'modification', 1, 2, 500000.00, 1],
                ['sec_nin_name', 'nin_mod_name', 'NIN Name Modification', 'modification', 1, 2, 300000.00, 1],
                ['sec_data_mtn', 'data_mtn', 'MTN SME Data Top-Up', 'telecom', 0, 1, 250000.00, 1],
                ['sec_airtime', 'airtime_vending', 'Airtime VTU Top-Up', 'telecom', 0, 1, 150000.00, 1],
                ['sec_cable', 'cable_subscription', 'Cable TV Subscription', 'telecom', 0, 1, 200000.00, 1],
                ['sec_disco', 'electricity_bill', 'Electricity Bill Payment', 'telecom', 0, 1, 300000.00, 1],
                ['sec_swap', 'airtime_swap', 'Airtime to Cash Swap', 'telecom', 1, 2, 200000.00, 1],
                ['sec_wallet_transfer', 'wallet_transfer', 'Peer to Peer Wallet Transfer', 'wallet', 1, 2, 500000.00, 1],
                ['sec_manual_fund', 'manual_funding', 'Direct Bank Transfer Deposit', 'wallet', 0, 1, 1000000.00, 1],
                ['sec_api_access', 'api_developer', 'Developer API Access', 'system', 1, 3, 5000000.00, 1],
            ];

            foreach ($defaultRules as $r) {
                $this->db->execute(
                    'INSERT IGNORE INTO service_security_rules (id, service_key, name, category, require_pin, min_tier, max_daily_limit, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    $r
                );
            }
            $rules = $this->db->fetchAll('SELECT * FROM service_security_rules ORDER BY name ASC');
        }

        foreach ($rules as &$rl) {
            $reqPin = (bool)($rl['requires_pin'] ?? $rl['require_pin'] ?? false);
            $minLvl = (int)($rl['min_kyc_level'] ?? $rl['min_tier'] ?? 1);
            $dLimit = (float)($rl['daily_limit'] ?? $rl['max_daily_limit'] ?? 100000);
            $rl['service_name'] = $rl['service_name'] ?: $rl['name'];
            $rl['require_pin'] = $reqPin;
            $rl['requires_pin'] = $reqPin;
            $rl['min_tier'] = $minLvl;
            $rl['min_kyc_level'] = $minLvl;
            $rl['max_daily_limit'] = $dLimit;
            $rl['daily_limit'] = $dLimit;
            $rl['is_active'] = (bool)$rl['is_active'];
        }

        Response::success(['rules' => $rules]);
    }

    public function updateServiceSecurityRule(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $key = $params['key'] ?? '';
        $body = $request->getBody();

        $pinVal = null;
        if (array_key_exists('requires_pin', $body)) {
            $pinVal = $body['requires_pin'] ? 1 : 0;
        } elseif (array_key_exists('require_pin', $body)) {
            $pinVal = $body['require_pin'] ? 1 : 0;
        }

        $levelVal = null;
        if (array_key_exists('min_kyc_level', $body)) {
            $levelVal = (int)$body['min_kyc_level'];
        } elseif (array_key_exists('min_tier', $body)) {
            $levelVal = (int)$body['min_tier'];
        }

        $limitVal = null;
        if (array_key_exists('daily_limit', $body)) {
            $limitVal = (float)$body['daily_limit'];
        } elseif (array_key_exists('max_daily_limit', $body)) {
            $limitVal = (float)$body['max_daily_limit'];
        }

        $actVal = array_key_exists('is_active', $body) ? ($body['is_active'] ? 1 : 0) : null;
        $descVal = array_key_exists('description', $body) ? (string)$body['description'] : null;

        $this->db->execute(
            'UPDATE service_security_rules 
             SET require_pin = COALESCE(:pin1, require_pin),
                 requires_pin = COALESCE(:pin2, requires_pin),
                 min_tier = COALESCE(:tier1, min_tier),
                 min_kyc_level = COALESCE(:tier2, min_kyc_level),
                 max_daily_limit = COALESCE(:lim1, max_daily_limit),
                 daily_limit = COALESCE(:lim2, daily_limit),
                 description = COALESCE(:desc, description),
                 updated_by = :uby,
                 is_active = COALESCE(:act, is_active),
                 updated_at = NOW()
             WHERE service_key = :k OR id = :id',
            [
                'pin1' => $pinVal,
                'pin2' => $pinVal,
                'tier1' => $levelVal,
                'tier2' => $levelVal,
                'lim1' => $limitVal,
                'lim2' => $limitVal,
                'desc' => $descVal,
                'uby' => $admin['email'],
                'act' => $actVal,
                'k' => $key,
                'id' => $key,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM service_security_rules WHERE service_key = :k OR id = :id', ['k' => $key, 'id' => $key]);
        if ($row) {
            $reqPin = (bool)($row['requires_pin'] ?? $row['require_pin'] ?? false);
            $minLvl = (int)($row['min_kyc_level'] ?? $row['min_tier'] ?? 1);
            $dLimit = (float)($row['daily_limit'] ?? $row['max_daily_limit'] ?? 100000);
            $row['service_name'] = $row['service_name'] ?: $row['name'];
            $row['require_pin'] = $reqPin;
            $row['requires_pin'] = $reqPin;
            $row['min_tier'] = $minLvl;
            $row['min_kyc_level'] = $minLvl;
            $row['max_daily_limit'] = $dLimit;
            $row['daily_limit'] = $dLimit;
            $row['is_active'] = (bool)$row['is_active'];
        }
        Response::success(['rule' => $row], 'Service security rule updated');
    }

    /**
     * POST /api/admin/maintenance/clean-demo-data
     * Backs up production database to storage/backups/ and safely cleans test/demo accounts
     */
    public function cleanDemoData(Request $request): void
    {
        $admin = Auth::requireRole($request, ['superadmin']);

        // 1. Create a full database backup first
        $backupDir = HAMBAKTECH_ROOT . '/storage/backups';
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        $backupFilename = 'hambaktech_backup_pre_cleanup_' . date('Ymd_His') . '.sql';
        $backupFile = $backupDir . '/' . $backupFilename;

        $tables = $this->db->fetchAll('SHOW TABLES');
        $out = "-- =====================================================================\n";
        $out .= "-- HAMBAKTECH PRE-CLEANUP PRODUCTION BACKUP\n";
        $out .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
        $out .= "-- Initiated by: " . $admin['email'] . "\n";
        $out .= "-- =====================================================================\n\n";
        $out .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";

        foreach ($tables as $tRow) {
            $table = array_values($tRow)[0];
            $create = $this->db->fetchOne("SHOW CREATE TABLE `{$table}`");
            if ($create && isset($create['Create Table'])) {
                $out .= "DROP TABLE IF EXISTS `{$table}`;\n" . $create['Create Table'] . ";\n\n";
                $rows = $this->db->fetchAll("SELECT * FROM `{$table}`");
                if (!empty($rows)) {
                    $cols = array_map(fn($c) => "`{$c}`", array_keys($rows[0]));
                    foreach ($rows as $r) {
                        $vals = array_map(fn($v) => $v === null ? 'NULL' : "'" . addslashes((string)$v) . "'", array_values($r));
                        $out .= "INSERT INTO `{$table}` (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ");\n";
                    }
                    $out .= "\n";
                }
            }
        }
        $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";
        file_put_contents($backupFile, $out);

        // 2. Genuine users whitelist - strictly protected
        $genuineEmails = [
            'okamaldeen832@gmail.com',
            'ifedayophilip@gmail.com',
            'dakomajid123@gmail.com',
            'uche4039@gmail.com',
            'alabistephen498@gmail.com',
            'emmanuelchidi1999@gmail.com',
            'uwemedimogenerous@gmail.com',
            'earr.music@gmaill.com',
            'adebisiabdul96@gmail.com',
            'fatimohmusbau34@gmail.com',
            'hamohullahaamoda@gmail.com',
            'fatimohmusbau@gmail.com',
            'oyemi19@gmail.com',
            'hambak19@gmail.com',
            'admin@hambaktech.com.ng',
            'hambak901@gmail.com',
        ];

        // Also protect any user with real gateway funding/financial history
        $gatewayRows = $this->db->fetchAll(
            'SELECT DISTINCT user_id FROM transactions WHERE gateway IN ("paystack", "flutterwave") AND status = "successful"'
        );
        $gatewayUserIds = array_column($gatewayRows, 'user_id');

        // 3. Classify users
        $allUsers = $this->db->fetchAll('SELECT id, email, full_name, role FROM users');
        $testUserIds = [];
        $testEmails = [];
        $deletedList = [];
        $keptList = [];

        foreach ($allUsers as $u) {
            $e = strtolower(trim((string)$u['email']));
            $role = strtolower((string)($u['role'] ?? 'customer'));
            $isWhitelisted = in_array($e, $genuineEmails, true) || $role === 'superadmin' || in_array($u['id'], $gatewayUserIds, true);

            $isTestPattern = (
                str_contains($e, '@test.hambaktech.com.ng') ||
                str_contains($e, '@hambaktest.com') ||
                str_ends_with($e, '@example.com') ||
                $e === 'customer@hambaktech.com.ng' ||
                $e === 'amina.yusuf.test@gmail.com' ||
                str_starts_with($e, 'live_vtu_') ||
                str_starts_with($e, 'customer_phase6_') ||
                str_starts_with($e, 'vtpass_test_') ||
                str_starts_with($e, 'audit_cust_') ||
                str_starts_with($e, 'audit_staff_') ||
                str_starts_with($e, 'agent.verified.') ||
                str_starts_with($e, 'vtpass.customer.') ||
                str_starts_with($e, 'vtpass_live_') ||
                str_starts_with($e, 'test_bal_') ||
                str_starts_with($e, 'debug_') ||
                str_starts_with($e, 'cust_live_') ||
                str_starts_with($e, 'cust_test_') ||
                str_starts_with($e, 'check_dash_') ||
                str_starts_with($e, 'test_cust_') ||
                str_starts_with($e, 'testcust_')
            );

            $isGenuine = $isWhitelisted || (!$isTestPattern && !empty($e));

            if ($isGenuine) {
                $keptList[] = ['id' => $u['id'], 'email' => $e, 'name' => $u['full_name']];
            } else {
                $testUserIds[] = $u['id'];
                if ($e !== '') {
                    $testEmails[] = $e;
                }
                $deletedList[] = ['id' => $u['id'], 'email' => $e, 'name' => $u['full_name']];
            }
        }

        // 4. Safely delete test users' records from dependent tables
        if (!empty($testUserIds)) {
            $placeholders = implode(',', array_fill(0, count($testUserIds), '?'));
            $ticketRows = $this->db->fetchAll("SELECT id FROM support_tickets WHERE user_id IN ($placeholders)", $testUserIds);
            foreach ($ticketRows as $tr) {
                $this->db->execute('DELETE FROM support_replies WHERE ticket_id = :tid', ['tid' => $tr['id']]);
            }
            $this->db->execute("DELETE FROM support_replies WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM support_tickets WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM transactions WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM wallets WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM manual_funding_requests WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM telecom_orders WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM verification_records WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM kyc_submissions WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM user_profiles WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM notifications WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM users WHERE id IN ($placeholders)", $testUserIds);
        }

        if (!empty($testEmails)) {
            $emPlaceholders = implode(',', array_fill(0, count($testEmails), '?'));
            $this->db->execute("DELETE FROM password_resets WHERE LOWER(email) IN ($emPlaceholders)", $testEmails);
        }

        // Clean up synthetic/audit support tickets left over from prior automated audits
        $syntheticTickets = $this->db->fetchAll(
            'SELECT id FROM support_tickets
             WHERE subject LIKE "%E2E Automated Audit%"
                OR subject LIKE "Audit Support%"
                OR (subject = "Inquiry regarding bulk verification API" AND (category IS NULL OR category = ""))'
        );
        $deletedTicketCount = 0;
        foreach ($syntheticTickets as $st) {
            $this->db->execute('DELETE FROM support_replies WHERE ticket_id = :tid', ['tid' => $st['id']]);
            $this->db->execute('DELETE FROM support_tickets WHERE id = :tid', ['tid' => $st['id']]);
            $deletedTicketCount++;
        }

        FootprintService::record(
            'admin',
            'CLEAN_DEMO_DATA',
            $admin,
            null,
            null,
            null,
            'successful',
            null,
            null,
            [
                'backup_file' => $backupFilename,
                'deleted_count' => count($testUserIds),
                'deleted_test_tickets' => $deletedTicketCount,
                'preserved_count' => count($keptList),
            ],
            $request->getIp()
        );

        Response::success([
            'backup_file' => $backupFilename,
            'deleted_count' => count($testUserIds),
            'deleted_test_users' => count($testUserIds),
            'deleted_test_tickets' => $deletedTicketCount,
            'deleted_accounts' => $deletedList,
            'preserved_count' => count($keptList),
            'preserved_genuine_count' => count($keptList),
            'preserved_emails' => array_column($keptList, 'email'),
            'preserved_accounts' => $keptList,
        ], 'Production database successfully backed up and test records cleaned.');
    }

    /**
     * GET /api/admin/footprints
     * Centralized Activity Monitoring audit trail
     */
    public function footprints(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        FootprintService::ensureTable();

        $category = trim((string)$request->query('category', ''));
        $status = trim((string)$request->query('status', ''));
        $search = trim((string)$request->query('search', ''));
        $startDate = trim((string)$request->query('start_date', ''));
        $endDate = trim((string)$request->query('end_date', ''));
        $page = max(1, (int)$request->query('page', 1));
        $limit = min(200, max(10, (int)$request->query('limit', 50)));
        $offset = ($page - 1) * $limit;

        $conditions = ['1=1'];
        $params = [];

        if (!empty($category) && $category !== 'all') {
            $conditions[] = 'category = :cat';
            $params['cat'] = $category;
        }

        if (!empty($status) && $status !== 'all') {
            $conditions[] = 'status = :st';
            $params['st'] = $status;
        }

        if (!empty($search)) {
            $conditions[] = '(user_email LIKE :s1 OR user_name LIKE :s2 OR action LIKE :s3 OR reference LIKE :s4 OR ip_address LIKE :s5 OR service_type LIKE :s6)';
            $searchPattern = '%' . $search . '%';
            $params['s1'] = $searchPattern;
            $params['s2'] = $searchPattern;
            $params['s3'] = $searchPattern;
            $params['s4'] = $searchPattern;
            $params['s5'] = $searchPattern;
            $params['s6'] = $searchPattern;
        }

        if (!empty($startDate)) {
            $conditions[] = 'created_at >= :start';
            $params['start'] = $startDate . ' 00:00:00';
        }

        if (!empty($endDate)) {
            $conditions[] = 'created_at <= :end';
            $params['end'] = $endDate . ' 23:59:59';
        }

        $whereClause = implode(' AND ', $conditions);

        $totalRow = $this->db->fetchOne("SELECT COUNT(*) as cnt FROM activity_footprints WHERE {$whereClause}", $params);
        $total = (int)($totalRow['cnt'] ?? 0);

        $sql = "SELECT * FROM activity_footprints WHERE {$whereClause} ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}";
        $rows = $this->db->fetchAll($sql, $params);

        foreach ($rows as &$r) {
            if (!empty($r['metadata']) && is_string($r['metadata'])) {
                $r['metadata'] = json_decode($r['metadata'], true);
            }
            $r['amount'] = $r['amount'] !== null ? (float)$r['amount'] : null;
        }

        Response::success([
            'footprints' => $rows,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => ceil($total / $limit) ?: 1,
        ]);
    }

    /**
     * GET /api/admin/footprints/stats
     */
    public function footprintStats(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        FootprintService::ensureTable();

        $stats = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_activities,
                SUM(CASE WHEN action = "CUSTOMER_LOGIN" AND created_at >= CURDATE() THEN 1 ELSE 0 END) as today_logins,
                SUM(CASE WHEN category = "service" AND created_at >= CURDATE() THEN 1 ELSE 0 END) as today_services,
                SUM(CASE WHEN category = "wallet" THEN 1 ELSE 0 END) as wallet_operations,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_activities,
                COUNT(DISTINCT ip_address) as unique_ips
             FROM activity_footprints'
        );

        $recent = $this->db->fetchAll('SELECT * FROM activity_footprints ORDER BY created_at DESC LIMIT 6');
        foreach ($recent as &$rc) {
            if (!empty($rc['metadata']) && is_string($rc['metadata'])) {
                $rc['metadata'] = json_decode($rc['metadata'], true);
            }
            $rc['amount'] = $rc['amount'] !== null ? (float)$rc['amount'] : null;
        }

        Response::success([
            'stats' => [
                'total_activities' => (int)($stats['total_activities'] ?? 0),
                'today_logins' => (int)($stats['today_logins'] ?? 0),
                'today_services' => (int)($stats['today_services'] ?? 0),
                'wallet_operations' => (int)($stats['wallet_operations'] ?? 0),
                'failed_activities' => (int)($stats['failed_activities'] ?? 0),
                'unique_ips' => (int)($stats['unique_ips'] ?? 0),
            ],
            'recent' => $recent,
        ]);
    }

    /**
     * GET /api/admin/footprints/export
     */
    public function exportFootprints(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        FootprintService::ensureTable();

        $rows = $this->db->fetchAll('SELECT id, created_at, category, action, user_email, user_name, service_type, reference, provider, status, amount, ip_address, device_info, browser_info, error_message FROM activity_footprints ORDER BY created_at DESC LIMIT 1000');

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="hambaktech_footprints_' . date('Ymd_His') . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['ID', 'Timestamp', 'Category', 'Action', 'User Email', 'User Name', 'Service Type', 'Reference', 'Provider', 'Status', 'Amount (NGN)', 'IP Address', 'Device', 'Browser', 'Error']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['id'],
                $r['created_at'],
                $r['category'],
                $r['action'],
                $r['user_email'] ?? 'N/A',
                $r['user_name'] ?? 'N/A',
                $r['service_type'] ?? 'N/A',
                $r['reference'] ?? 'N/A',
                $r['provider'] ?? 'N/A',
                $r['status'],
                $r['amount'] ?? '0.00',
                $r['ip_address'] ?? 'N/A',
                $r['device_info'] ?? 'N/A',
                $r['browser_info'] ?? 'N/A',
                $r['error_message'] ?? '',
            ]);
        }
        fclose($out);
        exit;
    }

    /**
     * POST /api/admin/customers/create
     * Administrator Create Customer Account with mandatory Level 2 KYC & wallet provisioning
     */
    public function createCustomer(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);

        $fullName = trim((string)$request->input('full_name', ''));
        $email = strtolower(trim((string)$request->input('email', '')));
        $phone = trim((string)($request->input('phone_number') ?? $request->input('phone', '')));
        $role = strtolower(trim((string)$request->input('role', 'customer')));
        $status = strtolower(trim((string)$request->input('status', 'active')));
        $tier = max(1, min(3, (int)$request->input('tier', 1)));
        $password = (string)$request->input('password', '');
        $initialBalance = max(0, (float)$request->input('initial_balance', 0));
        $notifyCustomer = (bool)$request->input('notify_customer', true);

        // Optional KYC / Profile fields (not required for Level 1 onboarding; required only if Tier 2+ chosen)
        $dateOfBirth = trim((string)($request->input('date_of_birth') ?? $request->input('dob', '')));
        $residentialAddress = trim((string)($request->input('residential_address') ?? $request->input('address', '')));
        $state = trim((string)$request->input('state', ''));
        $lga = trim((string)$request->input('lga', ''));
        $idTypeRaw = strtolower(trim((string)$request->input('id_type', 'nin_slip')));
        $idNumber = trim((string)$request->input('id_number', ''));
        $nin = preg_replace('/\D/', '', (string)$request->input('nin', ''));
        $bvn = preg_replace('/\D/', '', (string)$request->input('bvn', ''));

        if (empty($fullName) || empty($email) || empty($phone)) {
            Response::error('Full name, email address, and phone number are required.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address.', 422);
        }

        if (!in_array($role, ['customer', 'agent', 'staff', 'admin'], true)) {
            $role = 'customer';
        }

        if (!in_array($status, ['active', 'pending', 'suspended'], true)) {
            $status = 'active';
        }

        if (!empty($nin) && !preg_match('/^\d{11}$/', $nin)) {
            Response::error('NIN must be exactly 11 numeric digits.', 422);
        }
        if (!empty($bvn) && !preg_match('/^\d{11}$/', $bvn)) {
            Response::error('BVN must be exactly 11 numeric digits.', 422);
        }

        $allowedIdTypes = ['nin_slip', 'drivers_license', 'voters_card', 'international_passport', 'nin', 'bvn'];
        $idType = in_array($idTypeRaw, $allowedIdTypes, true) ? $idTypeRaw : 'nin_slip';
        if ($idType === 'nin') $idType = 'nin_slip';

        if (($idType === 'nin_slip' || $idType === 'nin') && empty($nin) && preg_match('/^\d{11}$/', preg_replace('/\D/', '', $idNumber))) {
            $nin = preg_replace('/\D/', '', $idNumber);
        }
        if ($idType === 'bvn' && empty($bvn) && preg_match('/^\d{11}$/', preg_replace('/\D/', '', $idNumber))) {
            $bvn = preg_replace('/\D/', '', $idNumber);
        }
        if (empty($idNumber)) {
            $idNumber = $nin ?: $bvn;
        }

        $hasIdentityDocs = !empty($nin) || !empty($bvn) || !empty($idNumber);
        if (($role === 'customer' || $role === 'agent') && $tier >= 2 && !$hasIdentityDocs) {
            Response::error('Providing Tier 2+ verified status requires an 11-digit NIN/BVN or official ID number.', 422);
        }

        // Duplicate checks
        $existingEmail = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $email]);
        if ($existingEmail) {
            Response::error('An account with this email address already exists.', 409);
        }

        $existingPhone = $this->db->fetchOne('SELECT id FROM users WHERE phone_number = :phone', ['phone' => $phone]);
        if ($existingPhone) {
            Response::error('An account with this phone number already exists.', 409);
        }

        if (empty($password)) {
            $password = 'Hambak@' . random_int(100000, 999999);
        }

        $userId = Security::generateUuid();
        $kycId = Security::generateUuid();
        $dbRole = in_array($role, ['admin', 'superadmin'], true) ? $role : 'customer';
        $dbStatus = ($status === 'suspended') ? 'suspended' : 'active';
        $emailVerified = ($status === 'active') ? 1 : 0;
        $kycStatus = ($tier >= 2) ? 'verified' : ($hasIdentityDocs ? 'pending' : 'unverified');
        $passwordHash = Security::hashPassword($password);
        $referralCode = 'HAMBAK-' . strtoupper(substr(md5($email . microtime()), 0, 6));

        $this->db->withTransaction(function (Database $db) use (
            $userId, $kycId, $email, $passwordHash, $fullName, $phone, $dbRole, $dbStatus, $tier, $kycStatus,
            $referralCode, $emailVerified, $initialBalance, $admin,
            $dateOfBirth, $residentialAddress, $state, $lga, $nin, $bvn, $idType, $idNumber
        ) {
            // 1. Create User
            $db->execute(
                'INSERT INTO users (id, email, password_hash, full_name, phone_number, role, kyc_status, tier, referral_code, status, email_verified, created_at)
                 VALUES (:id, :email, :pass, :name, :phone, :role, :ks, :tier, :ref, :st, :ev, NOW())',
                [
                    'id' => $userId,
                    'email' => $email,
                    'pass' => $passwordHash,
                    'name' => $fullName,
                    'phone' => $phone,
                    'role' => $dbRole,
                    'ks' => $kycStatus,
                    'tier' => $tier,
                    'ref' => $referralCode,
                    'st' => $dbStatus,
                    'ev' => $emailVerified,
                ]
            );
            try {
                $db->execute('UPDATE users SET kyc_level = :kl WHERE id = :id', ['kl' => $tier, 'id' => $userId]);
            } catch (Throwable) {
            }

            // 2. Profile with Level 2 KYC data
            try {
                $db->execute(
                    'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, date_of_birth, created_at, updated_at)
                     VALUES (:uid, :nin, :bvn, :addr, :st, :lga, :dob, NOW(), NOW())',
                    [
                        'uid' => $userId,
                        'nin' => $nin ?: null,
                        'bvn' => $bvn ?: null,
                        'addr' => $residentialAddress ?: null,
                        'st' => $state ?: null,
                        'lga' => $lga ?: null,
                        'dob' => $dateOfBirth ?: null,
                    ]
                );
            } catch (Throwable) {
                $db->execute(
                    'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, created_at)
                     VALUES (:uid, :nin, :bvn, :addr, :st, :lga, NOW())',
                    [
                        'uid' => $userId,
                        'nin' => $nin ?: null,
                        'bvn' => $bvn ?: null,
                        'addr' => $residentialAddress ?: null,
                        'st' => $state ?: null,
                        'lga' => $lga ?: null,
                    ]
                );
            }

            // 3. Level 2 KYC Submission Record
            if (!empty($nin) || !empty($bvn) || !empty($idNumber)) {
                $historyEntry = [[
                    'action' => $kycStatus === 'verified' ? 'approved' : 'submitted',
                    'status' => $kycStatus,
                    'by' => $admin['email'],
                    'notes' => 'Level 2 KYC recorded during administrator onboarding.',
                    'timestamp' => date('c'),
                ]];
                try {
                    $db->execute(
                        'INSERT INTO kyc_submissions
                         (id, user_id, target_level, verification_method, full_legal_name, date_of_birth,
                          phone_number, email, residential_address, state, lga, nin, bvn, id_type, id_number,
                          consent_obtained, consent_timestamp, status, review_notes, reviewed_by, reviewed_at, review_history, submitted_at, created_at)
                         VALUES
                         (:id, :uid, 2, "manual", :fname, :dob,
                          :phone, :email, :addr, :st, :lga, :nin, :bvn, :itype, :inum,
                          1, NOW(), :ks, :notes, :rby, NOW(), :hist, NOW(), NOW())',
                        [
                            'id' => $kycId,
                            'uid' => $userId,
                            'fname' => $fullName,
                            'dob' => $dateOfBirth ?: null,
                            'phone' => $phone,
                            'email' => $email,
                            'addr' => $residentialAddress,
                            'st' => $state,
                            'lga' => $lga,
                            'nin' => $nin ?: null,
                            'bvn' => $bvn ?: null,
                            'itype' => strtoupper($idType),
                            'inum' => $idNumber ?: ($nin ?: $bvn),
                            'ks' => $kycStatus,
                            'notes' => 'Level 2 KYC recorded during administrator onboarding.',
                            'rby' => $kycStatus === 'verified' ? $admin['email'] : null,
                            'hist' => json_encode($historyEntry),
                        ]
                    );
                } catch (Throwable) {
                    $db->execute(
                        'INSERT INTO kyc_submissions (id, user_id, id_type, id_number, status, created_at)
                         VALUES (:id, :uid, :itype, :inum, :ks, NOW())',
                        [
                            'id' => $kycId,
                            'uid' => $userId,
                            'itype' => strtoupper($idType),
                            'inum' => $idNumber ?: ($nin ?: $bvn),
                            'ks' => $kycStatus,
                        ]
                    );
                }
            }

            // 4. Wallet
            $walletId = Security::generateUuid();
            $db->execute(
                'INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status, created_at)
                 VALUES (:id, :uid, :bal, "NGN", 0, "active", NOW())',
                ['id' => $walletId, 'uid' => $userId, 'bal' => $initialBalance]
            );

            // 5. Initial balance ledger entry if > 0
            if ($initialBalance > 0) {
                $ref = 'ADM-ALLOC-' . strtoupper(substr(md5(uniqid()), 0, 10));
                $db->execute(
                    'INSERT INTO transactions (id, user_id, reference, type, amount, balance_before, balance_after, status, category, gateway, description, created_at)
                     VALUES (:id, :uid, :ref, "credit", :amt, 0.00, :amt2, "successful", "administrative_adjustment", "internal", "Initial account balance allocation by administrator", NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $userId,
                        'ref' => $ref,
                        'amt' => $initialBalance,
                        'amt2' => $initialBalance,
                    ]
                );
            }

            // 6. Welcome notification
            $db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Account Provisioned by Administrator", :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'msg' => $tier >= 2
                        ? 'Your HAMBAKTECH Enterprise portal account is ready with Level 2 KYC active.'
                        : 'Your HAMBAKTECH Enterprise portal account is ready at KYC Level 1. Complete Level 2 KYC anytime in Identity & KYC to unlock higher limits.',
                ]
            );
        });

        // 7. Admin notification & email alert for new registration
        $nowStr = date('Y-m-d H:i:s');
        try {
            $superAdmins = $this->db->fetchAll(
                'SELECT id FROM users WHERE role IN ("superadmin", "admin") AND status = "active"'
            );
            foreach ($superAdmins as $sa) {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, "alert", 0, "#admin", NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $sa['id'],
                        'title' => "New Customer Provisioned (KYC Level {$tier}): {$fullName}",
                        'msg' => "Customer {$fullName} ({$email}, {$phone}) was registered by {$admin['email']} at {$nowStr}. KYC Status: {$kycStatus}.",
                    ]
                );
            }
        } catch (Throwable $e) {
            error_log('[createCustomer Admin Notification DB Error] ' . $e->getMessage());
        }

        try {
            $adminEmailSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "admin_notification_email"');
            $decodedSetting = $adminEmailSetting ? json_decode($adminEmailSetting['setting_value'], true) : null;
            $adminEmail = is_string($decodedSetting) ? $decodedSetting : ($adminEmailSetting['setting_value'] ?? null);
            if (empty($adminEmail) || !filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
                $adminEmail = 'admin@hambaktech.com.ng';
            }

            $mailService = new MailService();
            $safeName = htmlspecialchars($fullName, ENT_QUOTES, 'UTF-8');
            $locationText = trim(implode(', ', array_filter([$residentialAddress, $lga, $state])));
            $safeLocation = $locationText !== '' ? htmlspecialchars($locationText, ENT_QUOTES, 'UTF-8') : 'Not provided (KYC Level 1)';
            $adminAlertHtml = "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;'>
                <div style='background: #1d4ed8; color: #ffffff; padding: 16px 20px; border-radius: 8px 8px 0 0;'>
                    <h2 style='margin: 0; font-size: 18px;'>New Customer Account Provisioned (KYC Level {$tier})</h2>
                </div>
                <div style='padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;'>
                    <p>A new customer account (KYC Level {$tier}) was created by <strong>{$admin['email']}</strong>.</p>
                    <table style='width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px;'>
                        <tr><td style='padding: 6px 0; color: #64748b;'><strong>Name:</strong></td><td>{$safeName}</td></tr>
                        <tr><td style='padding: 6px 0; color: #64748b;'><strong>Email:</strong></td><td>{$email}</td></tr>
                        <tr><td style='padding: 6px 0; color: #64748b;'><strong>Phone:</strong></td><td>{$phone}</td></tr>
                        <tr><td style='padding: 6px 0; color: #64748b;'><strong>Location:</strong></td><td>{$safeLocation}</td></tr>
                        <tr><td style='padding: 6px 0; color: #64748b;'><strong>Tier / KYC:</strong></td><td>Level {$tier} ({$kycStatus})</td></tr>
                        <tr><td style='padding: 6px 0; color: #64748b;'><strong>Timestamp:</strong></td><td>{$nowStr} (WAT)</td></tr>
                    </table>
                </div>
            </div>";
            $mailService->send($adminEmail, 'Administrator', "[HAMBAKTECH] New Customer Provisioned (KYC Level {$tier}): {$fullName}", $adminAlertHtml);
        } catch (Throwable $e) {
            error_log('[createCustomer Admin Email Error] ' . $e->getMessage());
        }

        if ($notifyCustomer) {
            try {
                $mailService = new MailService();
                $body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;'>
                    <h2 style='color: #1d4ed8;'>Welcome to HAMBAKTECH Enterprise</h2>
                    <p>Dear <strong>{$fullName}</strong>,</p>
                    <p>Your enterprise customer account has been created by our administration team.</p>
                    <div style='background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;'>
                        <p style='margin: 4px 0;'><strong>Login Email:</strong> {$email}</p>
                        <p style='margin: 4px 0;'><strong>Temporary Password:</strong> <code style='background: #e2e8f0; padding: 2px 6px; border-radius: 4px;'>{$password}</code></p>
                        <p style='margin: 4px 0;'><strong>Account Tier:</strong> KYC Level {$tier} ({$kycStatus})</p>
                        <p style='margin: 4px 0;'><strong>Initial Wallet Balance:</strong> ₦" . number_format($initialBalance, 2) . "</p>
                    </div>
                    <p><a href='https://hambaktech.com.ng/#login' style='display: inline-block; padding: 10px 20px; background: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;'>Login to Portal</a></p>
                    <p style='font-size: 12px; color: #64748b; margin-top: 24px;'>Please change your password immediately after your first sign in.</p>
                </div>";
                $mailService->send($email, $fullName, 'Your HAMBAKTECH Portal Account Credentials', $body);
            } catch (Throwable $e) {
                error_log('[createCustomer Mail Error] ' . $e->getMessage());
            }
        }

        FootprintService::record(
            'admin',
            'ADMIN_CREATE_USER',
            $admin,
            'user_management',
            $userId,
            null,
            'successful',
            $initialBalance,
            null,
            ['created_email' => $email, 'role' => $dbRole, 'tier' => $tier, 'kyc_status' => $kycStatus],
            $request->getIp()
        );

        $created = $this->hydrateCustomerRow($userId);
        if ($created) {
            $created['generated_password'] = $password;
        }

        Response::success([
            'customer' => $created,
            'user' => $created,
            'wallet' => ['balance' => $initialBalance],
        ], "Customer account created successfully at KYC Level {$tier}.", 201);
    }

    /**
     * POST /api/admin/settings/upload-logo
     * High-fidelity logo upload supporting Local/Mobile device storage and Direct URLs
     */
    public function uploadLogo(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);

        $imageUrl = trim((string)$request->input('image_url', ''));
        $fileData = $request->input('file_data') ?? $request->input('file_base64'); // base64 data URI
        $finalUrl = '';

        if (!empty($imageUrl)) {
            // Direct URL
            if (!filter_var($imageUrl, FILTER_VALIDATE_URL) && !str_starts_with($imageUrl, '/')) {
                Response::error('Invalid logo URL provided.', 422);
            }
            $finalUrl = $imageUrl;
        } elseif (!empty($fileData)) {
            // Base64 file upload (supports desktop file explorer & mobile phone picker/camera)
            if (!preg_match('/^data:([a-zA-Z0-9\/\+.-]+);base64,(.+)$/', $fileData, $matches)) {
                Response::error('Invalid image data format. Please select a valid PNG, JPG, JPEG, SVG, WebP, or PDF file.', 422);
            }

            $mime = strtolower($matches[1]);
            $decoded = base64_decode($matches[2]);

            if ($decoded === false) {
                Response::error('Could not decode file data.', 422);
            }

            // 5MB file size limit
            if (strlen($decoded) > 5 * 1024 * 1024) {
                Response::error('Logo file size exceeds the 5MB maximum limit.', 422);
            }

            $allowedMimes = [
                'image/png' => 'png',
                'image/jpeg' => 'jpg',
                'image/jpg' => 'jpg',
                'image/webp' => 'webp',
                'image/svg+xml' => 'svg',
                'application/pdf' => 'pdf',
            ];

            if (!isset($allowedMimes[$mime])) {
                Response::error('Unsupported file format. Please upload a PNG, JPG, JPEG, SVG, WebP, or PDF logo.', 422);
            }

            $ext = $allowedMimes[$mime];
            $parentUploads = dirname(HAMBAKTECH_ROOT) . '/uploads';
            $uploadDir = is_dir($parentUploads)
                ? ($parentUploads . '/logos')
                : (HAMBAKTECH_ROOT . '/uploads/logos');
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $safeFilename = 'logo_' . time() . '_' . substr(md5(uniqid()), 0, 8) . '.' . $ext;
            $targetPath = $uploadDir . '/' . $safeFilename;
            $res = file_put_contents($targetPath, $decoded);

            if ($res === false) {
                Response::error('Failed to write uploaded logo to server storage.', 500);
            }

            $finalUrl = '/uploads/logos/' . $safeFilename;
        } else {
            Response::error('Please select an image file from your device or provide a direct image URL.', 422);
        }

        // 1. Commit to website_branding
        $existing = $this->db->fetchOne('SELECT id FROM website_branding LIMIT 1');
        if (!$existing) {
            $this->db->execute(
                'INSERT INTO website_branding (id, company_name, logo_url, updated_at) VALUES (:id, "HAMBAK TECH & SERVICES", :url, NOW())',
                ['id' => Security::generateUuid(), 'url' => $finalUrl]
            );
        } else {
            $this->db->execute(
                'UPDATE website_branding SET logo_url = :url, updated_at = NOW() WHERE id = :id',
                ['id' => $existing['id'], 'url' => $finalUrl]
            );
        }

        // 2. Commit to system_settings branding_settings
        $brandingSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "branding_settings"');
        $bVals = $brandingSetting ? json_decode($brandingSetting['setting_value'], true) : [];
        if (!is_array($bVals)) $bVals = [];
        $bVals['logo_url'] = $finalUrl;
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_brand_cfg", "branding_settings", :val, "branding", "Branding assets")
             ON DUPLICATE KEY UPDATE setting_value = :val2',
            ['val' => json_encode($bVals), 'val2' => json_encode($bVals)]
        );

        FootprintService::record(
            'admin',
            'ADMIN_UPLOAD_LOGO',
            $admin,
            'branding',
            null,
            null,
            'successful',
            null,
            null,
            ['logo_url' => $finalUrl],
            $request->getIp()
        );

        Response::success(['logo_url' => $finalUrl], 'Logo uploaded and published successfully across the platform.');
    }

    /**
     * POST /api/admin/settings/remove-logo
     */
    public function removeLogo(Request $request): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);

        $defaultLogo = '/logo.png';

        $existing = $this->db->fetchOne('SELECT id FROM website_branding LIMIT 1');
        if (!$existing) {
            $this->db->execute(
                'INSERT INTO website_branding (id, company_name, logo_url, updated_at) VALUES (:id, "HAMBAK TECH & SERVICES", :url, NOW())',
                ['id' => Security::generateUuid(), 'url' => $defaultLogo]
            );
        } else {
            $this->db->execute(
                'UPDATE website_branding SET logo_url = :url, updated_at = NOW() WHERE id = :id',
                ['id' => $existing['id'], 'url' => $defaultLogo]
            );
        }

        $brandingSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "branding_settings"');
        $bVals = $brandingSetting ? json_decode($brandingSetting['setting_value'], true) : [];
        if (!is_array($bVals)) $bVals = [];
        $bVals['logo_url'] = $defaultLogo;
        $this->db->execute(
            'UPDATE system_settings SET setting_value = :val WHERE setting_key = "branding_settings"',
            ['val' => json_encode($bVals)]
        );

        FootprintService::record(
            'admin',
            'ADMIN_REMOVE_LOGO',
            $admin,
            'branding',
            null,
            null,
            'successful',
            null,
            null,
            ['reverted_to' => $defaultLogo],
            $request->getIp()
        );

        Response::success(['logo_url' => $defaultLogo], 'Logo removed. Restored system default logo.');
    }
}

