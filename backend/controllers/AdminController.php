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
        $action = strtolower((string)$request->input('action', 'approve')); // approve or reject
        $reason = trim((string)$request->input('reason', 'Receipt verification could not be validated with receiving bank records'));

        $req = $this->db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
        if (!$req) {
            Response::error('Funding request not found.', 404);
        }

        if ($req['status'] !== 'pending') {
            Response::error("Request already {$req['status']}. Duplicate decision prevented.", 400);
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

            Response::success([
                'request_id' => $requestId,
                'status' => 'approved',
                'amount' => $amount,
                'balance_after' => $txResult['balance_after'],
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

            Response::success([
                'request_id' => $requestId,
                'status' => 'rejected',
                'reason' => $reason,
            ], 'Manual funding request marked as rejected.');
        }
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
}
