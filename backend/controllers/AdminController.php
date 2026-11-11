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
     * -------------------------------------------------------------------------
     * STAGE 8: MULTIPLE PROVIDER ARCHITECTURE
     * -------------------------------------------------------------------------
     */
    public function providers(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $providers = $this->db->fetchAll('SELECT * FROM providers ORDER BY provider_type ASC, name ASC');
        foreach ($providers as &$p) {
            $p['is_active'] = (bool)$p['is_active'];
            $p['is_default'] = (bool)$p['is_default'];
            $p['balance'] = (float)$p['balance'];
            // Mask keys partially for UI display
            if (!empty($p['api_key'])) {
                $p['api_key_masked'] = substr($p['api_key'], 0, 4) . '••••••••' . substr($p['api_key'], -4);
            }
        }
        Response::success(['providers' => $providers]);
    }

    public function updateProvider(Request $request, array $params): void
    {
        Auth::requireRole($request, ['superadmin']);
        $id = $params['id'] ?? '';
        $name = trim((string)$request->input('name', ''));
        $baseUrl = trim((string)$request->input('base_url', ''));
        $apiKey = trim((string)$request->input('api_key', ''));
        $timeout = (int)$request->input('timeout_seconds', 30);
        $isDefault = (bool)$request->input('is_default', false);

        $existing = $this->db->fetchOne('SELECT * FROM providers WHERE id = :id', ['id' => $id]);
        if (!$existing) {
            Response::notFound('Provider not found.');
        }

        $this->db->execute(
            'UPDATE providers SET 
                name = IF(:n != "", :n2, name),
                base_url = IF(:u != "", :u2, base_url),
                api_key = IF(:k != "", :k2, api_key),
                timeout_seconds = :t,
                is_default = :def,
                updated_at = NOW()
             WHERE id = :id',
            [
                'n' => $name, 'n2' => $name,
                'u' => $baseUrl, 'u2' => $baseUrl,
                'k' => $apiKey, 'k2' => $apiKey,
                't' => $timeout,
                'def' => $isDefault ? 1 : 0,
                'id' => $id,
            ]
        );

        Response::success(null, "Provider '{$id}' settings updated successfully.");
    }

    public function toggleProvider(Request $request, array $params): void
    {
        Auth::requireRole($request, ['superadmin']);
        $id = $params['id'] ?? '';
        $existing = $this->db->fetchOne('SELECT is_active FROM providers WHERE id = :id', ['id' => $id]);
        if (!$existing) {
            Response::notFound('Provider not found.');
        }
        $newStatus = $existing['is_active'] ? 0 : 1;
        $this->db->execute('UPDATE providers SET is_active = :s, updated_at = NOW() WHERE id = :id', ['s' => $newStatus, 'id' => $id]);
        Response::success(['is_active' => (bool)$newStatus], "Provider '{$id}' status toggled.");
    }

    public function testProviderConnection(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $provider = $this->db->fetchOne('SELECT * FROM providers WHERE id = :id', ['id' => $id]);
        if (!$provider) {
            Response::notFound('Provider not found.');
        }

        $start = microtime(true);
        $status = 'operational';
        $message = 'Endpoint reachable and responsive';

        $ch = curl_init($provider['base_url']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $latency = (int)round((microtime(true) - $start) * 1000);
        if ($httpCode === 0) {
            $status = 'error';
            $message = 'Connection timed out or network error';
        }

        $this->db->execute(
            'UPDATE providers SET last_ping_status = :st, last_ping_latency = :lat, last_ping_at = NOW() WHERE id = :id',
            ['st' => $status, 'lat' => $latency, 'id' => $id]
        );

        Response::success([
            'provider' => $id,
            'status' => $status,
            'latency_ms' => $latency,
            'http_code' => $httpCode,
            'message' => $message,
        ]);
    }

    public function assignProviderToService(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $serviceKey = (string)$request->input('service_key', '');
        $providerId = (string)$request->input('provider_id', '');

        if (empty($serviceKey) || empty($providerId)) {
            Response::error('service_key and provider_id are required.', 422);
        }

        $this->db->execute(
            'UPDATE service_catalogue SET provider_id = :p, updated_at = NOW() WHERE service_key = :k',
            ['p' => $providerId, 'k' => $serviceKey]
        );

        Response::success(null, "Service '{$serviceKey}' assigned to provider '{$providerId}'.");
    }

    public function updateServicePrice(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $serviceKey = (string)$request->input('service_key', '');
        $sellingPrice = (float)$request->input('selling_price', 0);
        $enabled = (bool)$request->input('enabled', true);

        if (empty($serviceKey)) {
            Response::error('service_key is required.', 422);
        }

        $this->db->execute(
            'UPDATE service_catalogue SET selling_price = :prc, is_active = :act, updated_at = NOW() WHERE service_key = :k',
            ['prc' => $sellingPrice, 'act' => $enabled ? 1 : 0, 'k' => $serviceKey]
        );

        Response::success(null, "Service pricing for '{$serviceKey}' updated to ₦{$sellingPrice}.");
    }

    /**
     * -------------------------------------------------------------------------
     * STAGE 8: DEDICATED SUPPORT DESK
     * -------------------------------------------------------------------------
     */
    public function supportTickets(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $status = (string)$request->query('status', '');
        $priority = (string)$request->query('priority', '');
        $search = (string)$request->query('search', '');

        $sql = 'SELECT t.id, t.user_id, t.subject, t.priority, t.status, t.department, t.created_at, t.updated_at,
                       u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone,
                       (SELECT COUNT(*) FROM support_replies r WHERE r.ticket_id = t.id) as reply_count
                FROM support_tickets t
                LEFT JOIN users u ON u.id = t.user_id
                WHERE 1=1 ';
        $params = [];

        if (!empty($status)) {
            $sql .= 'AND t.status = :st ';
            $params['st'] = $status;
        }
        if (!empty($priority)) {
            $sql .= 'AND t.priority = :pr ';
            $params['pr'] = $priority;
        }
        if (!empty($search)) {
            $sql .= 'AND (t.subject LIKE :srch OR u.email LIKE :srch2 OR u.full_name LIKE :srch3) ';
            $params['srch'] = "%{$search}%";
            $params['srch2'] = "%{$search}%";
            $params['srch3'] = "%{$search}%";
        }

        $sql .= 'ORDER BY t.updated_at DESC LIMIT 100';
        $tickets = $this->db->fetchAll($sql, $params);

        Response::success(['tickets' => $tickets]);
    }

    public function supportTicketDetail(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $ticketId = $params['id'] ?? '';

        $ticket = $this->db->fetchOne(
            'SELECT t.*, u.full_name as customer_name, u.email as customer_email, u.phone_number as customer_phone,
                    u.tier as customer_tier, w.balance as customer_balance
             FROM support_tickets t
             LEFT JOIN users u ON u.id = t.user_id
             LEFT JOIN wallets w ON w.user_id = t.user_id
             WHERE t.id = :id',
            ['id' => $ticketId]
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

    public function replySupportTicket(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $ticketId = $params['id'] ?? '';
        $message = trim((string)$request->input('message', ''));
        $newStatus = (string)$request->input('status', 'resolved');

        if (empty($message)) {
            Response::error('Message cannot be empty.', 422);
        }

        $ticket = $this->db->fetchOne('SELECT user_id, subject FROM support_tickets WHERE id = :id', ['id' => $ticketId]);
        if (!$ticket) {
            Response::notFound('Ticket not found.');
        }

        $replyId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO support_replies (id, ticket_id, user_id, is_staff, message, created_at)
             VALUES (:id, :tid, :uid, 1, :msg, NOW())',
            [
                'id' => $replyId,
                'tid' => $ticketId,
                'uid' => $admin['id'],
                'msg' => $message,
            ]
        );

        $this->db->execute(
            'UPDATE support_tickets SET status = :st, updated_at = NOW() WHERE id = :id',
            ['st' => in_array($newStatus, ['open', 'pending', 'resolved', 'closed'], true) ? $newStatus : 'resolved', 'id' => $ticketId]
        );

        // Notify customer
        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, :title, :msg, "info", 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $ticket['user_id'],
                'title' => "Support Ticket Update: {$ticket['subject']}",
                'msg' => "Support staff replied: " . substr($message, 0, 100) . '...',
            ]
        );

        Response::success(null, 'Reply sent to customer and ticket status updated.');
    }

    public function updateSupportStatus(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $ticketId = $params['id'] ?? '';
        $status = (string)$request->input('status', 'resolved');
        $priority = (string)$request->input('priority', '');

        $this->db->execute(
            'UPDATE support_tickets SET 
                status = IF(:st != "", :st2, status),
                priority = IF(:pr != "", :pr2, priority),
                updated_at = NOW()
             WHERE id = :id',
            [
                'st' => $status, 'st2' => $status,
                'pr' => $priority, 'pr2' => $priority,
                'id' => $ticketId,
            ]
        );

        Response::success(null, 'Ticket status updated.');
    }

    /**
     * -------------------------------------------------------------------------
     * STAGE 8: DEDICATED KYC ADMINISTRATION
     * -------------------------------------------------------------------------
     */
    public function kycPending(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $status = (string)$request->query('status', 'pending');

        $rows = $this->db->fetchAll(
            'SELECT k.id, k.user_id, k.id_type, k.id_number, k.doc_url, k.status, k.rejection_reason, k.created_at,
                    u.full_name, u.email, u.phone_number, u.tier, u.wallet_balance
             FROM kyc_submissions k
             LEFT JOIN users u ON u.id = k.user_id
             WHERE k.status = :st
             ORDER BY k.created_at DESC LIMIT 100',
            ['st' => $status]
        );

        Response::success(['submissions' => $rows]);
    }

    public function reviewKyc(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $action = strtolower((string)$request->input('action', 'approve')); // 'approve' | 'reject'
        $tier = (int)$request->input('tier', 2);
        $reason = trim((string)$request->input('rejection_reason', ''));

        $sub = $this->db->fetchOne('SELECT * FROM kyc_submissions WHERE id = :id', ['id' => $id]);
        if (!$sub) {
            Response::notFound('KYC submission not found.');
        }

        if ($action === 'approve') {
            $this->db->execute(
                'UPDATE kyc_submissions SET status = "verified", updated_at = NOW() WHERE id = :id',
                ['id' => $id]
            );
            $this->db->execute(
                'UPDATE users SET kyc_status = "verified", tier = :t, updated_at = NOW() WHERE id = :uid',
                ['t' => $tier, 'uid' => $sub['user_id']]
            );

            // Notify user
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "KYC Verified!", :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $sub['user_id'],
                    'msg' => "Congratulations! Your identity has been verified. Your daily transaction limit is now upgraded to Tier {$tier}.",
                ]
            );

            Response::success(null, "KYC approved and upgraded to Tier {$tier}.");
        } else {
            $this->db->execute(
                'UPDATE kyc_submissions SET status = "rejected", rejection_reason = :r, updated_at = NOW() WHERE id = :id',
                ['r' => $reason ?: 'Document could not be verified. Please provide clear legal ID.', 'id' => $id]
            );
            $this->db->execute(
                'UPDATE users SET kyc_status = "rejected", updated_at = NOW() WHERE id = :uid',
                ['uid' => $sub['user_id']]
            );

            // Notify user
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "KYC Verification Update", :msg, "warning", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $sub['user_id'],
                    'msg' => "Your KYC verification could not be approved. Reason: {$reason}. Please re-submit valid identification.",
                ]
            );

            Response::success(null, "KYC submission rejected with feedback dispatched to customer.");
        }
    }

    /**
     * -------------------------------------------------------------------------
     * STAGE 8: DEDICATED NOTIFICATIONS ADMINISTRATION
     * -------------------------------------------------------------------------
     */
    public function notificationsBroadcast(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $title = trim((string)$request->input('title', ''));
        $message = trim((string)$request->input('message', ''));
        $target = (string)$request->input('target', 'all'); // 'all' | 'tier2' | 'single'
        $targetEmail = (string)$request->input('target_email', '');
        $type = (string)$request->input('type', 'info');

        if (empty($title) || empty($message)) {
            Response::error('Title and message are required.', 422);
        }

        $userIds = [];
        if ($target === 'single' && !empty($targetEmail)) {
            $u = $this->db->fetchOne('SELECT id FROM users WHERE email = :e', ['e' => $targetEmail]);
            if ($u) $userIds[] = $u['id'];
        } else {
            $sql = 'SELECT id FROM users WHERE status = "active" ';
            if ($target === 'tier2') $sql .= 'AND tier >= 2 ';
            $users = $this->db->fetchAll($sql);
            $userIds = array_column($users, 'id');
        }

        $dispatched = 0;
        foreach ($userIds as $uid) {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, :title, :msg, :type, 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $uid,
                    'title' => $title,
                    'msg' => $message,
                    'type' => $type,
                ]
            );
            $dispatched++;
        }

        Response::success(['dispatched_count' => $dispatched], "Notification successfully broadcast to {$dispatched} customer accounts.");
    }

    /**
     * -------------------------------------------------------------------------
     * STAGE 8: REPORTS & ANALYTICS ADMINISTRATION
     * -------------------------------------------------------------------------
     */
    public function reportsAnalytics(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        // 1. Transaction Breakdown
        $txByCategory = $this->db->fetchAll(
            'SELECT category, COUNT(*) as count, SUM(amount) as volume,
                    SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_count,
                    SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_count
             FROM transactions
             GROUP BY category ORDER BY volume DESC'
        );

        // 2. Telecom Breakdown
        $telecomStats = $this->db->fetchAll(
            'SELECT service_type, COUNT(*) as orders, SUM(amount) as revenue, SUM(cost_price) as provider_cost, SUM(profit) as profit
             FROM telecom_orders
             WHERE status = "successful"
             GROUP BY service_type'
        );

        // 3. Verification Breakdown
        $vrfStats = $this->db->fetchAll(
            'SELECT type, COUNT(*) as checks, SUM(cost) as revenue, SUM(provider_cost) as provider_cost,
                    SUM(cost - provider_cost) as profit
             FROM verification_records
             WHERE status = "completed"
             GROUP BY type'
        );

        // 4. Wallet Float and Solvency
        $walletFloat = $this->db->fetchOne('SELECT SUM(balance) as total_customer_float, COUNT(*) as total_wallets FROM wallets');
        $providerFloat = $this->db->fetchOne('SELECT SUM(balance) as total_provider_float FROM providers');

        Response::success([
            'generated_at' => date('c'),
            'transaction_breakdown' => $txByCategory,
            'telecom_analytics' => $telecomStats,
            'verification_analytics' => $vrfStats,
            'float_solvency' => [
                'total_customer_float' => (float)($walletFloat['total_customer_float'] ?? 0),
                'total_provider_float' => (float)($providerFloat['total_provider_float'] ?? 0),
                'solvency_ratio' => ((float)($walletFloat['total_customer_float'] ?? 0)) > 0 
                    ? round(((float)($providerFloat['total_provider_float'] ?? 0) / (float)($walletFloat['total_customer_float'] ?? 1)) * 100, 2)
                    : 100.0,
            ],
        ]);
    }

    /**
     * -------------------------------------------------------------------------
     * STAGE 8: GLOBAL SETTINGS RECONCILIATION
     * -------------------------------------------------------------------------
     */
    public function getSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $rows = $this->db->fetchAll('SELECT setting_key, setting_value, category, description FROM system_settings');
        $settings = [];
        foreach ($rows as $r) {
            $cat = $r['category'] ?: 'general';
            $val = $r['setting_value'];
            // Auto decode JSON if applicable
            $decoded = json_decode($val, true);
            $settings[$cat][$r['setting_key']] = ($decoded !== null && is_array($decoded)) ? $decoded : $val;
        }

        Response::success(['settings' => $settings]);
    }

    public function saveSettings(Request $request): void
    {
        Auth::requireRole($request, ['superadmin']);
        $category = (string)$request->input('category', 'general');
        $payload = $request->input('settings', []);

        if (!is_array($payload)) {
            Response::error('Settings payload must be an object of key-value pairs.', 422);
        }

        foreach ($payload as $key => $val) {
            $strVal = is_array($val) ? json_encode($val) : (string)$val;
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                 VALUES (:id, :k, :v, :cat, :k)
                 ON DUPLICATE KEY UPDATE setting_value = :v_dup, category = :cat_dup, updated_at = NOW()',
                [
                    'id' => 'set_' . substr(md5($key), 0, 16),
                    'k' => $key,
                    'v' => $strVal,
                    'cat' => $category,
                    'v_dup' => $strVal,
                    'cat_dup' => $category,
                ]
            );
        }

        Response::success(null, "Settings for category '{$category}' saved successfully to MySQL.");
    }
}
