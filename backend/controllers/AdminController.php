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
use HambakTech\Core\SchemaSync;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Services\DashboardConfigService;
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
        SchemaSync::syncSecurityAndReferralSchema($this->db);
    }

    private function hydrateCustomerRow(string $customerId): ?array
    {
        try {
            $row = $this->db->fetchOne(
                'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.assigned_dashboard, u.assigned_permissions, u.wallet_balance,
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

        $roleNorm = DashboardConfigService::normalizeRole((string)($row['role'] ?? 'customer'));
        $row['role'] = $roleNorm;
        $row['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey($row['assigned_dashboard'] ?? null, $roleNorm);
        $decodedPerms = is_string($row['assigned_permissions'] ?? null) ? json_decode($row['assigned_permissions'], true) : [];
        $row['permissions'] = ($roleNorm === 'superadmin')
            ? ['*']
            : (!empty($decodedPerms) && is_array($decodedPerms) ? $decodedPerms : DashboardConfigService::getDefaultPermissionsForRole($roleNorm));
        unset($row['assigned_permissions']);
        $row['wallet_balance'] = (float)($row['live_balance'] ?? $row['wallet_balance'] ?? 0);
        $row['tier'] = (int)($row['tier'] ?? 1);
        $row['kyc_level'] = (int)($row['kyc_level'] ?? $row['tier']);
        $row['email_verified'] = (bool)($row['email_verified'] ?? false);
        $createdTs = !empty($row['created_at']) ? strtotime((string)$row['created_at']) : false;
        $row['is_new'] = $createdTs !== false && $createdTs >= (time() - 72 * 3600);
        unset($row['live_balance']);

        $kycIdRows = $this->db->fetchAll(
            'SELECT id FROM kyc_submissions WHERE user_id = :uid ORDER BY created_at DESC',
            ['uid' => $customerId]
        );
        $kycRows = [];
        if (!empty($kycIdRows)) {
            $kycIds = array_values(array_filter(array_column($kycIdRows, 'id')));
            if (!empty($kycIds)) {
                $phList = [];
                $kParams = [];
                foreach ($kycIds as $kIdx => $kId) {
                    $phList[] = ':kid_' . $kIdx;
                    $kParams['kid_' . $kIdx] = $kId;
                }
                $kycRows = $this->db->fetchAll(
                    'SELECT * FROM kyc_submissions WHERE id IN (' . implode(', ', $phList) . ')',
                    $kParams
                );
                $kMap = array_flip($kycIds);
                usort($kycRows, static fn($a, $b) => ($kMap[$a['id']] ?? PHP_INT_MAX) <=> ($kMap[$b['id']] ?? PHP_INT_MAX));
            }
        }
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
        $actor = Auth::requireRole($request, Auth::CONSOLE_ROLES);
        $isSuperActor = ($actor['role'] === 'superadmin') || in_array('*', $actor['permissions'] ?? [], true);
        $canCustomers = $isSuperActor || Auth::hasPermission($actor, 'customers');
        $canKyc = $isSuperActor || Auth::hasPermission($actor, 'kyc') || $canCustomers;
        $canWallet = $isSuperActor || Auth::hasPermission($actor, 'wallet');
        $canFinance = $isSuperActor || Auth::hasPermission($actor, 'accounting') || Auth::hasPermission($actor, 'reports') || $canWallet;
        $canServices = $isSuperActor || Auth::hasPermission($actor, 'services') || Auth::hasPermission($actor, 'settings');
        $canPrinting = $isSuperActor || Auth::hasPermission($actor, 'printing') || Auth::hasPermission($actor, 'printing_pricing');

        // 1. User Metrics
        $userStats = $this->db->fetchOne(
            'SELECT 
                SUM(CASE WHEN role IN ("customer", "student", "agent") THEN 1 ELSE 0 END) as total_customers,
                SUM(CASE WHEN status = "active" AND role IN ("customer", "student", "agent") THEN 1 ELSE 0 END) as active_customers,
                SUM(CASE WHEN status = "suspended" AND role IN ("customer", "student", "agent") THEN 1 ELSE 0 END) as suspended_customers,
                SUM(CASE WHEN role IN ("support", "staff", "manager", "admin", "superadmin") THEN 1 ELSE 0 END) as total_staff,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today_registrations,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND kyc_status = "pending" THEN 1 ELSE 0 END) as pending_kyc_users
             FROM users'
        );

        $pendingKycSubRow = $this->db->fetchOne(
            'SELECT COUNT(*) as count FROM kyc_submissions WHERE status = "pending"'
        );
        $pendingKycCount = max((int)($pendingKycSubRow['count'] ?? 0), (int)($userStats['pending_kyc_users'] ?? 0));

        // 2. Financial Metrics (exclude internal console/admin wallets from customer float liability)
        $walletStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(w.balance), 0) as total_wallet_balances 
             FROM wallets w
             INNER JOIN users u ON u.id = w.user_id
             WHERE w.status = "active" AND u.role IN ("customer", "student", "agent")'
        );

        $txStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(CASE WHEN type = "credit" AND category = "funding" AND status = "successful" THEN amount ELSE 0 END), 0) as total_wallet_funding,
                COALESCE(SUM(CASE WHEN type = "credit" AND (category = "manual_adjustment" OR reference LIKE "REFUND_%") AND status = "successful" THEN amount ELSE 0 END), 0) as total_refunds,
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

        // 4. Verification, Modification & Enrolment Revenue & Wholesale Cost
        $vrfStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(cost), 0) as vrf_revenue,
                COALESCE(SUM(provider_cost), 0) as vrf_wholesale
             FROM verification_records 
             WHERE status = "completed"'
        );
        $modOverview = ['rev' => 0.0, 'cost' => 0.0];
        try {
            $mr = $this->db->fetchOne('SELECT COALESCE(SUM(customer_price), 0) as rev, COALESCE(SUM(provider_cost), 0) as cost FROM modification_requests WHERE status = "completed"');
            if ($mr) {
                $modOverview = ['rev' => (float)$mr['rev'], 'cost' => (float)$mr['cost']];
            }
        } catch (Throwable) {
        }
        $enrOverview = ['rev' => 0.0, 'cost' => 0.0];
        try {
            $er = $this->db->fetchOne('SELECT COALESCE(SUM(customer_price), 0) as rev, COALESCE(SUM(provider_cost), 0) as cost FROM enrolment_orders WHERE status = "completed"');
            if ($er) {
                $enrOverview = ['rev' => (float)$er['rev'], 'cost' => (float)$er['cost']];
            }
        } catch (Throwable) {
        }

        $pendingFundingCount = (int)$this->db->fetchOne(
            'SELECT COUNT(*) as count FROM manual_funding_requests WHERE status = "pending"'
        )['count'];

        $pendingFundings = $this->db->fetchAll(
            'SELECT m.*, u.full_name, u.email, u.phone_number,
                    COALESCE(w.balance, u.wallet_balance, 0) as current_balance,
                    m.payment_reference as reference
             FROM manual_funding_requests m
             LEFT JOIN users u ON u.id = m.user_id
             LEFT JOIN wallets w ON w.user_id = m.user_id
             WHERE m.status = "pending"
             ORDER BY m.created_at DESC LIMIT 5'
        );
        foreach ($pendingFundings as &$pf) {
            $amt = (float)($pf['amount'] ?? 0);
            $curBal = (float)($pf['current_balance'] ?? 0);
            $pf['amount'] = $amt;
            $pf['description'] = $pf['remarks'] ?: ("Manual bank transfer deposit to {$pf['bank_name']}");
            $pf['customer'] = [
                'id' => $pf['user_id'] ?? '',
                'full_name' => $pf['full_name'] ?: ($pf['depositor_name'] ?: 'Customer'),
                'email' => $pf['email'] ?: '',
                'phone_number' => $pf['phone_number'] ?: '',
                'current_balance' => $curBal,
            ];
            $pf['metadata'] = [
                'sender_name' => $pf['depositor_name'] ?: ($pf['full_name'] ?: 'Customer'),
                'bank_name' => $pf['bank_name'] ?: 'Moniepoint MFB',
                'account_number' => preg_replace('/\s+/', '', (string)($pf['account_number'] ?? '5210741634')) ?: '5210741634',
                'payment_date' => $pf['payment_date'] ?: '',
                'payment_method' => $pf['payment_method'] ?: 'Bank Transfer',
                'customer_remarks' => $pf['remarks'] ?: '',
                'payment_proof_url' => $pf['teller_proof_url'] ?: '',
                'proof_filename' => $pf['proof_filename'] ?: '',
            ];
        }
        unset($pf);

        // 5. Recent Registrations & Orders
        $recentUsers = $this->db->fetchAll(
            'SELECT u.id, u.full_name, u.email, u.phone_number, u.role, u.assigned_dashboard, COALESCE(w.balance, u.wallet_balance, 0) as wallet_balance,
                    u.kyc_status, u.tier, u.status, u.created_at 
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE u.role IN ("customer", "student", "agent") 
             ORDER BY u.created_at DESC LIMIT 8'
        );
        foreach ($recentUsers as &$ru) {
            $ru['wallet_balance'] = (float)$ru['wallet_balance'];
            $ru['tier'] = (int)($ru['tier'] ?? 1);
            $ruRole = DashboardConfigService::normalizeRole((string)($ru['role'] ?? 'customer'));
            $ru['role'] = $ruRole;
            $ru['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey($ru['assigned_dashboard'] ?? null, $ruRole);
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
        $identityWholesale = (float)($vrfStats['vrf_wholesale'] ?? 0) + (float)$modOverview['cost'] + (float)$enrOverview['cost'];
        $identityRevenue = (float)($vrfStats['vrf_revenue'] ?? 0) + (float)$modOverview['rev'] + (float)$enrOverview['rev'];
        $totalExpenditure = (float)($orderStats['provider_expenditure'] ?? 0) + $identityWholesale;
        $grossProfit = (float)($orderStats['gross_profit'] ?? 0) + ($identityRevenue - $identityWholesale);

        $printingSummary = null;
        if ($canPrinting) {
            try {
                $pr = $this->db->fetchOne(
                    'SELECT
                        COUNT(*) as total_orders,
                        SUM(CASE WHEN status IN ("Pending Review", "Under Review", "Awaiting Quotation") THEN 1 ELSE 0 END) as pending_review,
                        SUM(CASE WHEN status IN ("Quotation Sent", "Awaiting Payment") THEN 1 ELSE 0 END) as awaiting_payment,
                        SUM(CASE WHEN status IN ("Payment Confirmed", "Processing", "On Hold") THEN 1 ELSE 0 END) as processing,
                        SUM(CASE WHEN status IN ("Ready for Collection", "Ready for Dispatch", "Out for Delivery") THEN 1 ELSE 0 END) as ready_or_transit,
                        SUM(CASE WHEN status = "Completed" THEN 1 ELSE 0 END) as completed
                     FROM printing_orders'
                );
                if ($pr) {
                    $printingSummary = [
                        'total_orders' => (int)($pr['total_orders'] ?? 0),
                        'pending_review' => (int)($pr['pending_review'] ?? 0),
                        'awaiting_payment' => (int)($pr['awaiting_payment'] ?? 0),
                        'processing' => (int)($pr['processing'] ?? 0),
                        'ready_or_transit' => (int)($pr['ready_or_transit'] ?? 0),
                        'completed' => (int)($pr['completed'] ?? 0),
                    ];
                }
            } catch (Throwable) {
            }
        }

        $totalCustomersVal = $canCustomers ? (int)($userStats['total_customers'] ?? 0) : 0;
        $activeCustomersVal = $canCustomers ? (int)($userStats['active_customers'] ?? 0) : 0;
        $suspendedCustomersVal = $canCustomers ? (int)($userStats['suspended_customers'] ?? 0) : 0;
        $todayRegVal = $canCustomers ? (int)($userStats['today_registrations'] ?? 0) : 0;
        $pendingKycVal = $canKyc ? $pendingKycCount : 0;
        $walletFloatVal = $canFinance ? (float)($walletStats['total_wallet_balances'] ?? 0) : 0.0;
        $walletFundingVal = $canFinance ? (float)($txStats['total_wallet_funding'] ?? 0) : 0.0;
        $refundsVal = $canFinance ? (float)($txStats['total_refunds'] ?? 0) : 0.0;
        $salesVal = $canFinance ? $totalSales : 0.0;
        $expenditureVal = $canFinance ? $totalExpenditure : 0.0;
        $profitVal = $canFinance ? $grossProfit : 0.0;
        $succTxVal = $canFinance ? (int)($txStats['successful_transactions'] ?? 0) : 0;
        $pendTxVal = $canFinance ? (int)($txStats['pending_transactions'] ?? 0) : 0;
        $failTxVal = $canFinance ? (int)($txStats['failed_transactions'] ?? 0) : 0;
        $pendFundVal = $canWallet ? $pendingFundingCount : 0;

        $metrics = [
            'total_users' => $totalCustomersVal,
            'total_customers' => $totalCustomersVal,
            'totalCustomers' => $totalCustomersVal,
            'active_customers' => $activeCustomersVal,
            'activeCustomers' => $activeCustomersVal,
            'suspended_customers' => $suspendedCustomersVal,
            'suspendedCustomers' => $suspendedCustomersVal,
            'total_staff' => ($isSuperActor || Auth::hasPermission($actor, 'staff')) ? (int)($userStats['total_staff'] ?? 0) : 0,
            'totalStaff' => ($isSuperActor || Auth::hasPermission($actor, 'staff')) ? (int)($userStats['total_staff'] ?? 0) : 0,
            'today_registrations' => $todayRegVal,
            'todayRegistrations' => $todayRegVal,
            'pending_kyc_count' => $pendingKycVal,
            'pendingKycCount' => $pendingKycVal,
            'total_wallet_balances' => $walletFloatVal,
            'totalWalletBalances' => $walletFloatVal,
            'total_wallet_funding' => $walletFundingVal,
            'totalWalletFunding' => $walletFundingVal,
            'total_refunds' => $refundsVal,
            'totalRefunds' => $refundsVal,
            'total_service_sales' => $salesVal,
            'totalServiceSales' => $salesVal,
            'provider_expenditure' => $expenditureVal,
            'providerExpenditure' => $expenditureVal,
            'gross_profit' => $profitVal,
            'grossProfit' => $profitVal,
            'successful_transactions' => $succTxVal,
            'successfulTransactions' => $succTxVal,
            'pending_transactions' => $pendTxVal,
            'pendingTransactions' => $pendTxVal,
            'failed_transactions' => $failTxVal,
            'failedTransactions' => $failTxVal,
            'pending_funding_approvals' => $pendFundVal,
            'pendingFundingApprovals' => $pendFundVal,
        ];

        $scopedRegistrations = $canCustomers ? $recentUsers : [];
        $scopedFundings = $canWallet ? $pendingFundings : [];
        $scopedOrders = $canFinance ? $recentOrders : [];
        $scopedProviders = $canServices ? $providers : [];

        Response::success([
            'metrics' => $metrics,
            'stats' => $metrics,
            'recent_registrations' => $scopedRegistrations,
            'recentRegistrations' => $scopedRegistrations,
            'pending_fundings' => $scopedFundings,
            'pendingFundings' => $scopedFundings,
            'recent_orders' => $scopedOrders,
            'providers' => $scopedProviders,
            'printing_summary' => $printingSummary,
            'printingSummary' => $printingSummary,
        ]);
    }

    public function customers(Request $request): void
    {
        Auth::requirePermission($request, 'customers');

        $search = trim((string)$request->query('search', ''));
        $status = trim((string)$request->query('status', ''));
        $tier = trim((string)$request->query('tier', ''));
        $kycStatus = trim((string)$request->query('kyc_status', ''));
        $roleFilter = strtolower(trim((string)$request->query('role', '')));
        $includeAll = (string)$request->query('include_all', '') === '1' || $roleFilter === 'all';
        $filter = trim((string)$request->query('filter', ''));
        $limit = min(250, max(1, (int)$request->query('limit', 150)));

        $params = [];
        if ($roleFilter === 'all' || $roleFilter === 'all_users' || $includeAll) {
            $where = 'WHERE 1=1 ';
        } elseif ($roleFilter !== '' && in_array($roleFilter, DashboardConfigService::ALL_ROLES, true)) {
            $where = 'WHERE u.role = :rfilter ';
            $params['rfilter'] = $roleFilter;
        } else {
            $where = 'WHERE u.role IN ("customer", "student", "agent") ';
        }

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
            if ($kycStatus === 'approved' || $kycStatus === 'verified') {
                $where .= 'AND u.kyc_status IN ("verified", "approved") ';
            } else {
                $where .= 'AND u.kyc_status = :ks ';
                $params['ks'] = $kycStatus;
            }
        }

        if ($filter === 'new') {
            $where .= 'AND u.created_at >= DATE_SUB(NOW(), INTERVAL 72 HOUR) ';
        }

        try {
            $sql = 'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.assigned_dashboard, u.assigned_permissions, u.wallet_balance, 
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
            $rRole = DashboardConfigService::normalizeRole((string)($r['role'] ?? 'customer'));
            $r['role'] = $rRole;
            $r['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey($r['assigned_dashboard'] ?? null, $rRole);
            $decodedPerms = is_string($r['assigned_permissions'] ?? null) ? json_decode($r['assigned_permissions'], true) : [];
            $r['permissions'] = ($rRole === 'superadmin')
                ? ['*']
                : (!empty($decodedPerms) && is_array($decodedPerms) ? $decodedPerms : DashboardConfigService::getDefaultPermissionsForRole($rRole));
            unset($r['assigned_permissions']);
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
                SUM(CASE WHEN role IN ("customer", "student", "agent") THEN 1 ELSE 0 END) as total,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND status = "active" THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND status = "suspended" THEN 1 ELSE 0 END) as suspended,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND kyc_status = "pending" THEN 1 ELSE 0 END) as pending_kyc,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND kyc_status IN ("verified", "approved") THEN 1 ELSE 0 END) as verified_kyc,
                SUM(CASE WHEN role IN ("customer", "student", "agent") AND created_at >= DATE_SUB(NOW(), INTERVAL 72 HOUR) THEN 1 ELSE 0 END) as new_registrations,
                COUNT(*) as all_accounts,
                SUM(CASE WHEN role = "student" THEN 1 ELSE 0 END) as students,
                SUM(CASE WHEN role = "agent" THEN 1 ELSE 0 END) as agents,
                SUM(CASE WHEN role IN ("support", "staff", "manager", "admin", "superadmin") THEN 1 ELSE 0 END) as console_accounts
             FROM users'
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
                'all_accounts' => (int)($summary['all_accounts'] ?? count($rows)),
                'students' => (int)($summary['students'] ?? 0),
                'agents' => (int)($summary['agents'] ?? 0),
                'console_accounts' => (int)($summary['console_accounts'] ?? 0),
            ],
        ]);
    }

    public function updateCustomerStatus(Request $request, array $params): void
    {
        $admin = Auth::requirePermission($request, 'customers');
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

        if (in_array(strtolower((string)$existing['role']), ['admin', 'superadmin'], true) && $admin['role'] !== 'superadmin') {
            Response::forbidden('Only a Super Admin can modify an administrator account.');
        }
        if ($customerId === $admin['id'] && $newStatus === 'suspended') {
            Response::forbidden('You cannot suspend your own active administrator account.');
        }
        if (strtolower((string)$existing['role']) === 'superadmin' && $newStatus === 'suspended') {
            $activeSupers = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM users WHERE role = "superadmin" AND status = "active" AND id != :id', ['id' => $customerId]);
            if ((int)($activeSupers['cnt'] ?? 0) < 1) {
                Response::forbidden('At least one active Super Admin account must remain on the platform.');
            }
        }

        $explicitTier = $request->input('tier');
        $newTier = ($explicitTier !== null && $explicitTier !== '') ? max(1, min(3, (int)$explicitTier)) : (int)($existing['tier'] ?? 1);

        $this->db->execute(
            'UPDATE users SET status = :st, tier = :tier, updated_at = NOW() WHERE id = :id',
            ['st' => $newStatus, 'tier' => $newTier, 'id' => $customerId]
        );

        if ($newStatus === 'suspended') {
            Auth::revokeAllUserSessions($customerId, 'account_suspended', true);
        }

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
        $admin = Auth::requirePermission($request, 'wallet');
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
        if (in_array(strtolower((string)$targetUser['role']), ['admin', 'superadmin'], true) && $admin['role'] !== 'superadmin') {
            Response::forbidden('Only a Super Admin can adjust privileged administrator wallets.');
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
        Auth::requirePermission($request, 'wallet');

        $statusFilter = strtolower(trim((string)$request->query('status', 'pending')));
        if (!in_array($statusFilter, ['pending', 'approved', 'rejected', 'all'], true)) {
            $statusFilter = 'pending';
        }

        $whereClause = $statusFilter === 'all' ? '' : 'WHERE m.status = :st ';
        $idParams = $statusFilter === 'all' ? [] : ['st' => $statusFilter];

        $idRows = $this->db->fetchAll(
            "SELECT id FROM manual_funding_requests m {$whereClause}ORDER BY FIELD(m.status, \"pending\", \"approved\", \"rejected\"), m.created_at DESC LIMIT 100",
            $idParams
        );
        $rows = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $inParams = [];
                foreach ($ids as $idx => $idVal) {
                    $ph = ':mf_' . $idx;
                    $placeholders[] = $ph;
                    $inParams['mf_' . $idx] = $idVal;
                }
                $rows = $this->db->fetchAll(
                    'SELECT m.*, u.full_name, u.email, u.phone_number,
                            COALESCE(w.balance, u.wallet_balance, 0) as current_balance,
                            m.payment_reference as reference,
                            "credit" as type,
                            "manual_transfer" as gateway
                     FROM manual_funding_requests m
                     LEFT JOIN users u ON u.id = m.user_id
                     LEFT JOIN wallets w ON w.user_id = m.user_id
                     WHERE m.id IN (' . implode(', ', $placeholders) . ')',
                    $inParams
                );
                $orderMap = array_flip($ids);
                usort($rows, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }

        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
            $curBal = (float)($r['current_balance'] ?? 0);
            $r['description'] = $r['remarks'] ?: ("Manual bank transfer deposit to {$r['bank_name']}");
            $r['customer'] = [
                'id' => $r['user_id'] ?? '',
                'full_name' => $r['full_name'] ?: ($r['depositor_name'] ?: 'Customer'),
                'email' => $r['email'] ?: '',
                'phone_number' => $r['phone_number'] ?: '',
                'current_balance' => $curBal,
            ];
            $r['metadata'] = [
                'sender_name' => $r['depositor_name'] ?: ($r['full_name'] ?: 'Customer'),
                'bank_name' => $r['bank_name'] ?: 'Moniepoint MFB',
                'account_number' => preg_replace('/\s+/', '', (string)($r['account_number'] ?? '5210741634')) ?: '5210741634',
                'payment_date' => $r['payment_date'] ?: '',
                'payment_method' => $r['payment_method'] ?: 'Bank Transfer',
                'customer_remarks' => $r['remarks'] ?: '',
                'payment_proof_url' => $r['teller_proof_url'] ?: '',
                'proof_filename' => $r['proof_filename'] ?: '',
            ];
        }
        unset($r);

        Response::success([
            'requests' => $rows,
            'pending' => $rows,
            'count' => count($rows),
            'status' => $statusFilter,
        ]);
    }

    public function approveFunding(Request $request, array $params, ?string $forcedAction = null): void
    {
        $admin = Auth::requirePermission($request, 'wallet');
        $requestId = $params['id'] ?? '';
        $action = strtolower((string)($forcedAction ?? $request->input('action', 'approve'))); // approve or reject
        $reason = trim((string)$request->input('reason', 'Receipt verification could not be validated with receiving bank records'));

        $reference = 'MAN_CRED_' . strtoupper(str_replace('-', '', (string)$requestId));

        $outcome = $this->db->withTransaction(function (Database $db) use ($requestId, $action, $reason, $admin, $reference) {
            $req = $db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id FOR UPDATE', ['id' => $requestId]);
            if (!$req) {
                return ['error' => 'Funding request not found.', 'code' => 404];
            }
            if ($req['status'] !== 'pending') {
                return ['error' => "Request already {$req['status']}. Duplicate decision prevented.", 'code' => 400];
            }

            $amount = (float)$req['amount'];
            $custRef = $req['payment_reference'] ?: ('REQ_' . substr((string)$req['id'], 0, 8));

            if ($action === 'approve') {
                $existingLedger = $db->fetchOne('SELECT id FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $reference]);
                if ($existingLedger) {
                    return ['error' => 'Duplicate credit prevented for this manual funding request.', 'code' => 409];
                }

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

                $db->execute(
                    'UPDATE manual_funding_requests 
                     SET status = "approved", reviewed_by = :admin, reviewed_at = NOW(), admin_notes = :notes 
                     WHERE id = :id',
                    ['admin' => $admin['id'], 'notes' => 'Approved by ' . $admin['email'], 'id' => $requestId]
                );

                $db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, "Funding Approved", :msg, "success", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $req['user_id'],
                        'msg' => "Your manual transfer deposit of ₦" . number_format($amount, 2) . " (Ref: {$custRef}) has been verified and credited to your wallet balance.",
                    ]
                );

                $updatedReq = $db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
                return [
                    'ok' => true,
                    'action' => 'approve',
                    'req' => $req,
                    'updatedReq' => $updatedReq,
                    'txResult' => $txResult,
                    'amount' => $amount,
                    'custRef' => $custRef,
                ];
            }

            $db->execute(
                'UPDATE manual_funding_requests 
                 SET status = "rejected", reviewed_by = :admin, reviewed_at = NOW(), admin_notes = :reason 
                 WHERE id = :id',
                ['admin' => $admin['id'], 'reason' => $reason, 'id' => $requestId]
            );

            $db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Funding Request Rejected", :msg, "alert", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $req['user_id'],
                    'msg' => "Your manual deposit request for ₦" . number_format($amount, 2) . " (Ref: {$custRef}) was rejected. Reason: {$reason}",
                ]
            );

            $updatedReq = $db->fetchOne('SELECT * FROM manual_funding_requests WHERE id = :id', ['id' => $requestId]);
            return [
                'ok' => true,
                'action' => 'reject',
                'req' => $req,
                'updatedReq' => $updatedReq,
                'amount' => $amount,
                'custRef' => $custRef,
            ];
        });

        if (!empty($outcome['error'])) {
            Response::error($outcome['error'], (int)($outcome['code'] ?? 400));
            return;
        }

        $req = $outcome['req'];
        $amount = (float)$outcome['amount'];
        $custRef = (string)$outcome['custRef'];

        // Notify customer via HAMBAKTECH Notifications (notification@hambaktech.com.ng)
        try {
            $cust = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :uid', ['uid' => $req['user_id']]);
            if ($cust && !empty($cust['email'])) {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($cust['full_name'] ?: 'Valued Customer'), ENT_QUOTES, 'UTF-8');
                $amtFmt = '₦' . number_format($amount, 2);
                if ($outcome['action'] === 'approve') {
                    $balFmt = '₦' . number_format((float)($outcome['txResult']['balance_after'] ?? 0), 2);
                    $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                        . "<h2 style='margin:0 0 12px;color:#059669;'>Manual Funding Approved: {$amtFmt}</h2>"
                        . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                        . "<p style='color:#334155;'>Your bank transfer deposit of <strong>{$amtFmt}</strong> (Ref: <code>{$custRef}</code>) has been verified and credited to your wallet.</p>"
                        . "<p style='color:#334155;'><strong>New Wallet Balance:</strong> {$balFmt}</p>"
                        . "<p style='color:#64748b;font-size:12px;margin-top:20px;'>Need assistance? Reply to this email to reach HAMBAKTECH Support.</p></div>";
                    $mailer->send((string)$cust['email'], (string)($cust['full_name'] ?: 'Customer'), "Wallet Funding Approved ({$amtFmt}) — HAMBAKTECH", $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'MANUAL_FUNDING_APPROVED_EMAIL']);
                } else {
                    $safeReason = htmlspecialchars($reason, ENT_QUOTES, 'UTF-8');
                    $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                        . "<h2 style='margin:0 0 12px;color:#dc2626;'>Manual Funding Request Declined</h2>"
                        . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                        . "<p style='color:#334155;'>Your manual transfer submission for <strong>{$amtFmt}</strong> (Ref: <code>{$custRef}</code>) could not be approved.</p>"
                        . "<p style='color:#334155;'><strong>Reason:</strong> {$safeReason}</p>"
                        . "<p style='color:#64748b;font-size:12px;margin-top:20px;'>If you have proof of debit, reply to this email or open a Support ticket.</p></div>";
                    $mailer->send((string)$cust['email'], (string)($cust['full_name'] ?: 'Customer'), "Manual Funding Update ({$amtFmt}) — HAMBAKTECH", $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'MANUAL_FUNDING_REJECTED_EMAIL']);
                }
            }
        } catch (Throwable) {
        }

        if ($outcome['action'] === 'approve') {
            try {
                (new \HambakTech\Services\AccountingService($this->db))->syncWebsiteTransactions();
            } catch (Throwable) {
            }

            $txResult = $outcome['txResult'];
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
                'request' => $outcome['updatedReq'],
                'status' => 'approved',
                'amount' => $amount,
                'balance_after' => (float)$txResult['balance_after'],
                'userBalance' => (float)$txResult['balance_after'],
                'transaction' => $txObj,
            ], "Manual funding request approved and ₦{$amount} credited to customer.");
        } else {
            Response::success([
                'request_id' => $requestId,
                'request' => $outcome['updatedReq'],
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
        $request->setBody(array_merge($request->getBody(), ['action' => 'reject']));
        $this->approveFunding($request, $params);
    }

    /**
     * Financial Ledger Reversals
     */
    public function reverseTransaction(Request $request): void
    {
        $admin = Auth::requireSuperAdmin($request);
        $txId = trim((string)$request->input('transaction_id', ''));
        $reason = trim((string)$request->input('reason', ''));

        if ($txId === '') {
            Response::error('Transaction ID required.', 422);
        }
        if ($reason === '' || mb_strlen($reason) < 4) {
            Response::error('A reversal reason (at least 4 characters) is required.', 422);
        }

        try {
            $txRow = $this->db->fetchOne('SELECT id, type, reference, category FROM transactions WHERE id = :id LIMIT 1', ['id' => $txId]);
            $res = $this->walletService->reverseTransaction($txId, $admin['id'], $reason);
            if ($txRow && ($txRow['type'] ?? '') === 'debit' && !empty($txRow['reference'])) {
                try {
                    (new ReferralEngineService($this->db))->reverseRewardsForSource(
                        (string)$txRow['reference'],
                        'Admin transaction reversal: ' . $reason,
                        (string)$admin['id']
                    );
                } catch (Throwable) {
                }
            }
            Response::success($res, 'Transaction reversed and ledger updated successfully.');
        } catch (Throwable $e) {
            $msg = $e->getMessage();
            $code = str_contains($msg, 'not found') ? 404 : (str_contains($msg, 'already been') ? 409 : 422);
            Response::error($msg, $code);
        }
    }

    /**
     * Financial Reports & Treasury Aggregates
     */
    public function financialReports(Request $request): void
    {
        Auth::requirePermission($request, 'reports');

        $fundingStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(CASE WHEN type = "credit" AND category = "funding" AND status = "successful" THEN amount ELSE 0 END), 0) as total_funding,
                COALESCE(SUM(CASE WHEN type = "credit" AND category = "funding" AND gateway = "paystack" AND status = "successful" THEN amount ELSE 0 END), 0) as paystack_funding,
                COALESCE(SUM(CASE WHEN type = "credit" AND category = "funding" AND gateway = "flutterwave" AND status = "successful" THEN amount ELSE 0 END), 0) as flutterwave_funding,
                COALESCE(SUM(CASE WHEN type = "credit" AND category = "funding" AND gateway = "manual_transfer" AND status = "successful" THEN amount ELSE 0 END), 0) as manual_funding,
                COALESCE(SUM(CASE WHEN type = "credit" AND status = "successful" AND (reference LIKE "REFUND_%" OR category IN ("refund", "modification_refund", "enrolment_refund", "printing_refund")) THEN amount ELSE 0 END), 0) as total_refunds,
                COUNT(CASE WHEN type = "credit" AND status = "successful" AND (reference LIKE "REFUND_%" OR category IN ("refund", "modification_refund", "enrolment_refund", "printing_refund")) THEN 1 END) as count_refunds,
                COALESCE(SUM(CASE WHEN status = "successful" AND (category = "reversal" OR reference LIKE "REV_%") THEN amount ELSE 0 END), 0) as total_reversals,
                COUNT(CASE WHEN status = "successful" AND (category = "reversal" OR reference LIKE "REV_%") THEN 1 END) as count_reversals,
                COALESCE(SUM(CASE WHEN type = "credit" AND category = "manual_adjustment" AND reference NOT LIKE "REFUND_%" AND status = "successful" THEN amount ELSE 0 END), 0) as manual_adjustments,
                COALESCE(SUM(CASE WHEN type = "debit" AND category = "manual_adjustment" AND status = "successful" THEN amount ELSE 0 END), 0) as manual_adjustment_debits,
                COUNT(CASE WHEN type = "credit" AND category = "funding" AND status = "successful" THEN 1 END) as count_funding
             FROM transactions'
        );

        $telecomAgg = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(amount), 0) as telecom_sales,
                COALESCE(SUM(cost_price), 0) as telecom_cost,
                COALESCE(SUM(profit), 0) as telecom_profit
             FROM telecom_orders WHERE status = "successful"'
        );

        $vrfAgg = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(cost), 0) as vrf_sales,
                COALESCE(SUM(provider_cost), 0) as vrf_cost
             FROM verification_records WHERE status = "completed"'
        );
        $modAgg = ['sales' => 0.0, 'cost' => 0.0];
        try {
            $r = $this->db->fetchOne('SELECT COALESCE(SUM(customer_price), 0) as s, COALESCE(SUM(provider_cost), 0) as c FROM modification_requests WHERE status = "completed"');
            if ($r) {
                $modAgg = ['sales' => (float)$r['s'], 'cost' => (float)$r['c']];
            }
        } catch (Throwable) {
        }
        $enrAgg = ['sales' => 0.0, 'cost' => 0.0];
        try {
            $r = $this->db->fetchOne('SELECT COALESCE(SUM(customer_price), 0) as s, COALESCE(SUM(provider_cost), 0) as c FROM enrolment_orders WHERE status = "completed"');
            if ($r) {
                $enrAgg = ['sales' => (float)$r['s'], 'cost' => (float)$r['c']];
            }
        } catch (Throwable) {
        }

        // Strictly exclude internal admin/console wallets from Customer Wallet Float Liability
        $floatStats = $this->db->fetchOne(
            'SELECT 
                COALESCE(SUM(w.balance), 0) as total_customer_float,
                COUNT(*) as total_customers
             FROM wallets w
             INNER JOIN users u ON u.id = w.user_id
             WHERE w.status = "active" AND u.role IN ("customer", "student", "agent")'
        );

        $recon = ['wallets_total' => 0.0, 'users_total' => 0.0, 'drift' => 0.0, 'is_balanced' => true];
        try {
            $rRow = $this->db->fetchOne(
                'SELECT
                    (SELECT COALESCE(SUM(balance), 0) FROM wallets) as wallets_total,
                    (SELECT COALESCE(SUM(wallet_balance), 0) FROM users) as users_total'
            );
            if ($rRow) {
                $wt = (float)$rRow['wallets_total'];
                $ut = (float)$rRow['users_total'];
                $drift = round($wt - $ut, 2);
                $recon = [
                    'wallets_total' => $wt,
                    'users_total' => $ut,
                    'drift' => $drift,
                    'is_balanced' => abs($drift) < 0.01,
                ];
            }
        } catch (Throwable) {
        }

        $telecomSales = (float)($telecomAgg['telecom_sales'] ?? 0);
        $telecomCost = (float)($telecomAgg['telecom_cost'] ?? 0);
        $telecomProfit = (float)($telecomAgg['telecom_profit'] ?? 0);

        $identitySales = (float)($vrfAgg['vrf_sales'] ?? 0) + $modAgg['sales'] + $enrAgg['sales'];
        $identityCost = (float)($vrfAgg['vrf_cost'] ?? 0) + $modAgg['cost'] + $enrAgg['cost'];

        $totalSales = $telecomSales + $identitySales;
        $totalExpenditure = $telecomCost + $identityCost;
        $grossProfit = $telecomProfit + ($identitySales - $identityCost);
        $profitMargin = $totalSales > 0 ? round(($grossProfit / $totalSales) * 100, 2) : 0;

        $dvaStats = ['gross' => 0.0, 'fees' => 0.0, 'net' => 0.0, 'count' => 0, 'assigned_accounts' => 0];
        try {
            $dvaRow = $this->db->fetchOne(
                'SELECT
                    COUNT(CASE WHEN settlement_status = "settled" THEN 1 END) as cnt,
                    COALESCE(SUM(CASE WHEN settlement_status = "settled" THEN gross_amount ELSE 0 END), 0) as gross_sum,
                    COALESCE(SUM(CASE WHEN settlement_status = "settled" THEN paystack_fee ELSE 0 END), 0) as fee_sum,
                    COALESCE(SUM(CASE WHEN settlement_status = "settled" THEN net_credit_amount ELSE 0 END), 0) as net_sum
                 FROM paystack_dva_settlements'
            );
            $vaCountRow = $this->db->fetchOne(
                'SELECT COUNT(*) as cnt FROM customer_virtual_accounts WHERE provider = "paystack" AND assignment_status = "assigned" AND account_status = "active"'
            );
            if ($dvaRow) {
                $dvaStats = [
                    'gross' => (float)($dvaRow['gross_sum'] ?? 0),
                    'fees' => (float)($dvaRow['fee_sum'] ?? 0),
                    'net' => (float)($dvaRow['net_sum'] ?? 0),
                    'count' => (int)($dvaRow['cnt'] ?? 0),
                    'assigned_accounts' => (int)($vaCountRow['cnt'] ?? 0),
                ];
            }
        } catch (Throwable) {
        }

        Response::success([
            'reports' => [
                'funding' => [
                    'totalFunding' => (float)($fundingStats['total_funding'] ?? 0),
                    'paystackFunding' => (float)($fundingStats['paystack_funding'] ?? 0),
                    'paystackDvaNet' => $dvaStats['net'],
                    'paystackDvaGross' => $dvaStats['gross'],
                    'paystackDvaFees' => $dvaStats['fees'],
                    'paystackDvaCount' => $dvaStats['count'],
                    'paystackDvaAccounts' => $dvaStats['assigned_accounts'],
                    'flutterwaveFunding' => (float)($fundingStats['flutterwave_funding'] ?? 0),
                    'manualFunding' => (float)($fundingStats['manual_funding'] ?? 0),
                    'totalRefunds' => (float)($fundingStats['total_refunds'] ?? 0),
                    'refundsCount' => (int)($fundingStats['count_refunds'] ?? 0),
                    'totalReversals' => (float)($fundingStats['total_reversals'] ?? 0),
                    'reversalsCount' => (int)($fundingStats['count_reversals'] ?? 0),
                    'manualAdjustments' => (float)($fundingStats['manual_adjustments'] ?? 0),
                    'manualAdjustmentDebits' => (float)($fundingStats['manual_adjustment_debits'] ?? 0),
                    'fundingTransactionsCount' => (int)($fundingStats['count_funding'] ?? 0),
                ],
                'sales' => [
                    'totalServiceSales' => $totalSales,
                    'telecomSales' => $telecomSales,
                    'identityVerificationSales' => $identitySales,
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
                    'ledgerReconciliation' => $recon,
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

        $bank = trim((string)$request->input('bank', 'Moniepoint MFB')) ?: 'Moniepoint MFB';
        $accountNumber = preg_replace('/\s+/', '', trim((string)$request->input('account_number', '5210741634'))) ?: '5210741634';
        $accountName = trim((string)$request->input('account_name', 'Hambaktech_Services')) ?: 'Hambaktech_Services';

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

        // Keep wallet_settings JSON and accounting BANK_MAIN in sync
        try {
            $wRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "wallet_settings" LIMIT 1');
            $wCfg = ($wRow && !empty($wRow['setting_value'])) ? (json_decode((string)$wRow['setting_value'], true) ?: []) : [];
            $wCfg['bank_name'] = $bank;
            $wCfg['bank_account_number'] = $accountNumber;
            $wCfg['bank_account_name'] = $accountName;
            $wJson = json_encode($wCfg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (UUID(), "wallet_settings", :v, "wallet", "Configuration for wallet", NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                ['v' => $wJson, 'v2' => $wJson]
            );
            $this->db->execute(
                'UPDATE accounting_accounts SET bank_name = :b, account_number = :a WHERE account_code = "BANK_MAIN"',
                ['b' => $bank, 'a' => $accountNumber]
            );
        } catch (Throwable) {
        }

        Response::success([
            'bank' => $bank,
            'accountNumber' => $accountNumber,
            'accountName' => $accountName,
        ], 'Bank transfer instructions updated successfully.');
    }

    private function maskEmailForReport(?string $email): string
    {
        $clean = trim((string)$email);
        if ($clean === '' || !str_contains($clean, '@')) {
            return $clean ?: 'system';
        }
        [$local, $domain] = explode('@', $clean, 2);
        $prefix = strlen($local) > 2 ? substr($local, 0, 2) : substr($local, 0, 1);
        return $prefix . '***@' . $domain;
    }

    private function csvSafeCell($value): string
    {
        if (is_bool($value)) {
            $value = $value ? 'true' : 'false';
        } elseif (is_array($value) || is_object($value)) {
            $value = json_encode($value);
        }
        $str = (string)($value ?? '');
        if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            $str = "'" . $str;
        }
        return $str;
    }

    /**
     * All 12 Detailed System Reports (with global start_date/end_date filtering & CSV export)
     */
    public function detailedReports(Request $request): void
    {
        Auth::requirePermission($request, 'reports');

        $rawStart = trim((string)$request->query('start_date', ''));
        $rawEnd = trim((string)$request->query('end_date', ''));
        $startDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawStart) ? $rawStart : '';
        $endDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawEnd) ? $rawEnd : '';

        $buildRange = static function (string $col, string $prefix) use ($startDate, $endDate): array {
            $sql = '';
            $params = [];
            if ($startDate !== '') {
                $sql .= " AND {$col} >= :{$prefix}_s";
                $params["{$prefix}_s"] = $startDate . ' 00:00:00';
            }
            if ($endDate !== '') {
                $sql .= " AND {$col} <= :{$prefix}_e";
                $params["{$prefix}_e"] = $endDate . ' 23:59:59';
            }
            return ['sql' => $sql, 'params' => $params];
        };

        // 1. Customer Report
        $custRange = $buildRange('created_at', 'cust');
        $customerSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_customers,
                SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active_customers,
                SUM(CASE WHEN status = "suspended" THEN 1 ELSE 0 END) as suspended_customers,
                SUM(CASE WHEN kyc_status IN ("verified", "approved") THEN 1 ELSE 0 END) as verified_customers,
                SUM(CASE WHEN kyc_status NOT IN ("verified", "approved") THEN 1 ELSE 0 END) as unverified_customers,
                SUM(CASE WHEN tier >= 2 THEN 1 ELSE 0 END) as tier2_plus_customers,
                COALESCE(SUM(wallet_balance), 0) as total_customer_balance
             FROM users WHERE role IN ("customer", "student", "agent")' . $custRange['sql'],
            $custRange['params']
        );

        // 2. Transaction Report (strict separation of funding credits vs refunds vs service debits)
        $txRange = $buildRange('created_at', 'tx');
        $txSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(amount), 0) as total_volume,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_count,
                COALESCE(SUM(CASE WHEN status = "successful" THEN amount ELSE 0 END), 0) as successful_volume,
                COALESCE(SUM(CASE WHEN status = "successful" AND type = "credit" AND category = "funding" THEN amount ELSE 0 END), 0) as credit_funding_volume,
                COALESCE(SUM(CASE WHEN status = "successful" AND type = "credit" AND (reference LIKE "REFUND_%" OR category IN ("refund", "modification_refund", "enrolment_refund", "printing_refund")) THEN amount ELSE 0 END), 0) as refund_credit_volume,
                SUM(CASE WHEN status = "successful" AND type = "credit" AND (reference LIKE "REFUND_%" OR category IN ("refund", "modification_refund", "enrolment_refund", "printing_refund")) THEN 1 ELSE 0 END) as refund_count,
                COALESCE(SUM(CASE WHEN status = "successful" AND (category = "reversal" OR reference LIKE "REV_%") THEN amount ELSE 0 END), 0) as reversal_volume,
                SUM(CASE WHEN status = "successful" AND (category = "reversal" OR reference LIKE "REV_%") THEN 1 ELSE 0 END) as reversal_count,
                COALESCE(SUM(CASE WHEN status = "successful" AND type = "credit" AND category = "manual_adjustment" AND reference NOT LIKE "REFUND_%" THEN amount ELSE 0 END), 0) as manual_adjustment_credit_volume,
                COALESCE(SUM(CASE WHEN status = "successful" AND type = "debit" AND category = "manual_adjustment" THEN amount ELSE 0 END), 0) as manual_adjustment_debit_volume,
                COALESCE(SUM(CASE WHEN status = "successful" AND type = "debit" THEN amount ELSE 0 END), 0) as debit_sales_volume
             FROM transactions WHERE 1=1' . $txRange['sql'],
            $txRange['params']
        );

        $txCatRange = $buildRange('created_at', 'txc');
        $txCategories = $this->db->fetchAll(
            'SELECT category, type, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume 
             FROM transactions WHERE status = "successful"' . $txCatRange['sql'] . ' 
             GROUP BY category, type ORDER BY volume DESC',
            $txCatRange['params']
        );

        // 3. Wallet Report
        $walRange = $buildRange('created_at', 'wal');
        $walletSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_wallets,
                COALESCE(SUM(balance), 0) as system_float,
                COALESCE(AVG(balance), 0) as average_balance,
                COALESCE(MAX(balance), 0) as highest_balance,
                SUM(CASE WHEN balance < 0 THEN 1 ELSE 0 END) as negative_wallets
             FROM wallets WHERE 1=1' . $walRange['sql'],
            $walRange['params']
        );
        try {
            $reconRow = $this->db->fetchOne(
                'SELECT
                    (SELECT COALESCE(SUM(balance), 0) FROM wallets) as wallets_total,
                    (SELECT COALESCE(SUM(wallet_balance), 0) FROM users) as users_total'
            );
            if ($reconRow && is_array($walletSummary)) {
                $wt = (float)$reconRow['wallets_total'];
                $ut = (float)$reconRow['users_total'];
                $walletSummary['ledger_reconciliation'] = [
                    'wallets_total' => $wt,
                    'users_total' => $ut,
                    'drift' => round($wt - $ut, 2),
                    'is_balanced' => abs($wt - $ut) < 0.01,
                ];
            }
        } catch (Throwable) {
        }

        // 4. Payment Report (combined online payment_records + manual_funding_requests)
        $payOnlineRange = $buildRange('created_at', 'pr');
        $onlineGatewayRows = $this->db->fetchAll(
            'SELECT 
                COALESCE(NULLIF(LOWER(gateway), ""), "online") as gateway,
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN status = "successful" THEN amount ELSE 0 END), 0) as settled_amount,
                COALESCE(SUM(amount), 0) as total_amount,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_count
             FROM payment_records WHERE 1=1' . $payOnlineRange['sql'] . '
             GROUP BY COALESCE(NULLIF(LOWER(gateway), ""), "online")',
            $payOnlineRange['params']
        );

        $manPayRange = $buildRange('created_at', 'mp');
        $manualPayRow = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN status = "approved" THEN amount ELSE 0 END), 0) as settled_amount,
                COALESCE(SUM(amount), 0) as total_amount,
                SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as successful_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as failed_count
             FROM manual_funding_requests WHERE 1=1' . $manPayRange['sql'],
            $manPayRange['params']
        );

        $gatewayStats = $onlineGatewayRows;
        if ((int)($manualPayRow['transaction_count'] ?? 0) > 0) {
            $gatewayStats[] = [
                'gateway' => 'manual_transfer',
                'transaction_count' => (int)$manualPayRow['transaction_count'],
                'settled_amount' => (float)$manualPayRow['settled_amount'],
                'total_amount' => (float)$manualPayRow['total_amount'],
                'successful_count' => (int)$manualPayRow['successful_count'],
                'pending_count' => (int)$manualPayRow['pending_count'],
                'failed_count' => (int)$manualPayRow['failed_count'],
            ];
        }

        // 5. Identity Service Report (Verification + Modification + Enrolment, completed revenue/wholesale only)
        $vrfRange = $buildRange('created_at', 'vrf');
        $ninSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_requests,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_requests,
                COALESCE(SUM(CASE WHEN status = "completed" THEN cost ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN status = "completed" THEN provider_cost ELSE 0 END), 0) as total_wholesale_cost
             FROM verification_records WHERE 1=1' . $vrfRange['sql'],
            $vrfRange['params']
        );

        $ninServiceBreakdown = $this->db->fetchAll(
            'SELECT 
                COALESCE(service_key, type) as service_code,
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN status = "completed" THEN cost ELSE 0 END), 0) as revenue,
                COALESCE(SUM(CASE WHEN status = "completed" THEN provider_cost ELSE 0 END), 0) as wholesale_cost,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed
             FROM verification_records WHERE 1=1' . $vrfRange['sql'] . ' 
             GROUP BY COALESCE(service_key, type) ORDER BY count DESC',
            $vrfRange['params']
        );

        $modStats = ['completed_requests' => 0, 'total_revenue' => 0.0, 'total_wholesale_cost' => 0.0];
        try {
            $modRange = $buildRange('created_at', 'mod');
            $modRow = $this->db->fetchOne(
                'SELECT 
                    SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_requests,
                    COALESCE(SUM(CASE WHEN status = "completed" THEN customer_price ELSE 0 END), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN status = "completed" THEN provider_cost ELSE 0 END), 0) as total_wholesale_cost
                 FROM modification_requests WHERE 1=1' . $modRange['sql'],
                $modRange['params']
            );
            if ($modRow) {
                $modStats = [
                    'completed_requests' => (int)($modRow['completed_requests'] ?? 0),
                    'total_revenue' => (float)($modRow['total_revenue'] ?? 0),
                    'total_wholesale_cost' => (float)($modRow['total_wholesale_cost'] ?? 0),
                ];
            }
        } catch (Throwable) {
        }

        $enrStats = ['completed_requests' => 0, 'total_revenue' => 0.0, 'total_wholesale_cost' => 0.0];
        try {
            $enrRange = $buildRange('created_at', 'enr');
            $enrRow = $this->db->fetchOne(
                'SELECT 
                    SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_requests,
                    COALESCE(SUM(CASE WHEN status = "completed" THEN customer_price ELSE 0 END), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN status = "completed" THEN provider_cost ELSE 0 END), 0) as total_wholesale_cost
                 FROM enrolment_orders WHERE 1=1' . $enrRange['sql'],
                $enrRange['params']
            );
            if ($enrRow) {
                $enrStats = [
                    'completed_requests' => (int)($enrRow['completed_requests'] ?? 0),
                    'total_revenue' => (float)($enrRow['total_revenue'] ?? 0),
                    'total_wholesale_cost' => (float)($enrRow['total_wholesale_cost'] ?? 0),
                ];
            }
        } catch (Throwable) {
        }

        // 6. Telecom Report (completed/successful orders only for revenue, cost, profit)
        $telRange = $buildRange('created_at', 'tel');
        $telecomSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_orders,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_orders,
                COALESCE(SUM(CASE WHEN status = "successful" THEN amount ELSE 0 END), 0) as total_sales,
                COALESCE(SUM(CASE WHEN status = "successful" THEN cost_price ELSE 0 END), 0) as total_cost,
                COALESCE(SUM(CASE WHEN status = "successful" THEN profit ELSE 0 END), 0) as gross_profit
             FROM telecom_orders WHERE 1=1' . $telRange['sql'],
            $telRange['params']
        );

        $telecomNetworks = $this->db->fetchAll(
            'SELECT 
                network,
                COUNT(*) as orders_count,
                COALESCE(SUM(amount), 0) as sales,
                COALESCE(SUM(cost_price), 0) as cost,
                COALESCE(SUM(profit), 0) as profit
             FROM telecom_orders 
             WHERE status = "successful"' . $telRange['sql'] . '
             GROUP BY network',
            $telRange['params']
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

        // 8. Profit Report (true completed service sales & wholesale COGS across all 4 vertical lines)
        $telecomRevenue = (float)($telecomSummary['total_sales'] ?? 0);
        $telecomCost = (float)($telecomSummary['total_cost'] ?? 0);
        $telecomProfit = (float)($telecomSummary['gross_profit'] ?? 0);

        $vrfRevenue = (float)($ninSummary['total_revenue'] ?? 0);
        $vrfCost = (float)($ninSummary['total_wholesale_cost'] ?? 0);
        $modRevenue = (float)$modStats['total_revenue'];
        $modCost = (float)$modStats['total_wholesale_cost'];
        $enrRevenue = (float)$enrStats['total_revenue'];
        $enrCost = (float)$enrStats['total_wholesale_cost'];

        $identityTotalRevenue = $vrfRevenue + $modRevenue + $enrRevenue;
        $ninCost = $vrfCost + $modCost + $enrCost;
        $identityProfit = $identityTotalRevenue - $ninCost;

        $totalServiceRevenue = $telecomRevenue + $identityTotalRevenue;
        $totalExpenditure = $telecomCost + $ninCost;
        $totalGrossProfit = $telecomProfit + $identityProfit;
        $marginPercent = $totalServiceRevenue > 0 ? round(($totalGrossProfit / $totalServiceRevenue) * 100, 2) : 0;

        // 9. Manual Funding Report
        $manRange = $buildRange('created_at', 'man');
        $manualFundingSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected_count,
                COALESCE(SUM(CASE WHEN status = "approved" THEN amount ELSE 0 END), 0) as approved_amount
             FROM manual_funding_requests WHERE 1=1' . $manRange['sql'],
            $manRange['params']
        );

        // 10. KYC Report (normalized submissions + account-level users KYC visibility)
        $kycRange = $buildRange('created_at', 'kyc');
        $kycSummary = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_submissions,
                SUM(CASE WHEN status IN ("verified", "approved") THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "info_requested" THEN 1 ELSE 0 END) as info_requested_count,
                SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN COALESCE(target_level, CASE WHEN id_type = "nin" THEN 1 WHEN id_type = "bvn" THEN 2 ELSE 2 END) = 1 THEN 1 ELSE 0 END) as tier1_count,
                SUM(CASE WHEN COALESCE(target_level, 2) = 2 THEN 1 ELSE 0 END) as tier2_count,
                SUM(CASE WHEN COALESCE(target_level, 2) >= 3 THEN 1 ELSE 0 END) as tier3_count
             FROM kyc_submissions WHERE 1=1' . $kycRange['sql'],
            $kycRange['params']
        ) ?: [];
        $kycUsersOverview = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_accounts,
                SUM(CASE WHEN kyc_status IN ("verified", "approved") THEN 1 ELSE 0 END) as verified_users,
                SUM(CASE WHEN kyc_status = "pending" THEN 1 ELSE 0 END) as pending_users,
                SUM(CASE WHEN kyc_status NOT IN ("verified", "approved", "pending") THEN 1 ELSE 0 END) as unverified_users,
                SUM(CASE WHEN tier >= 2 THEN 1 ELSE 0 END) as tier2_plus_users
             FROM users WHERE role IN ("customer", "student", "agent")' . $custRange['sql'],
            $custRange['params']
        ) ?: [];
        $kycSummary['users_kyc_overview'] = [
            'total_accounts' => (int)($kycUsersOverview['total_accounts'] ?? 0),
            'verified_users' => (int)($kycUsersOverview['verified_users'] ?? 0),
            'pending_users' => (int)($kycUsersOverview['pending_users'] ?? 0),
            'unverified_users' => (int)($kycUsersOverview['unverified_users'] ?? 0),
            'tier2_plus_users' => (int)($kycUsersOverview['tier2_plus_users'] ?? 0),
        ];

        // 11. Staff Activity Report (masked user emails)
        $audRange = $buildRange('created_at', 'aud');
        $staffActivitySummary = $this->db->fetchOne(
            'SELECT COUNT(*) as total_logs FROM audit_logs WHERE 1=1' . $audRange['sql'],
            $audRange['params']
        );
        $rawLogs = $this->db->fetchAll(
            'SELECT id, user_email as entity, action, ip_address, created_at 
             FROM audit_logs WHERE 1=1' . $audRange['sql'] . ' ORDER BY created_at DESC LIMIT 25',
            $audRange['params']
        );
        $recentLogs = array_map(function (array $row) {
            $row['entity'] = $this->maskEmailForReport($row['entity'] ?? '');
            return $row;
        }, $rawLogs);

        $staffBreakdownRaw = $this->db->fetchAll(
            'SELECT COALESCE(NULLIF(user_email, ""), "system") as actor, COUNT(*) as actions_count, MAX(created_at) as last_active
             FROM audit_logs WHERE 1=1' . $audRange['sql'] . '
             GROUP BY COALESCE(NULLIF(user_email, ""), "system")
             ORDER BY actions_count DESC LIMIT 15',
            $audRange['params']
        );
        $staffBreakdown = array_map(function (array $row) {
            $row['actor'] = $this->maskEmailForReport($row['actor'] ?? '');
            $row['actions_count'] = (int)($row['actions_count'] ?? 0);
            return $row;
        }, $staffBreakdownRaw);

        // 12. Referral Growth & ROI Report
        $referralReport = (new ReferralEngineService($this->db))->getReferralGrowthReport([
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);

        $reportsPayload = [
            'generated_at' => date('c'),
            'date_range' => ['start_date' => $startDate ?: null, 'end_date' => $endDate ?: null],
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
                'modification_summary' => $modStats,
                'enrolment_summary' => $enrStats,
            ],
            'telecom_report' => [
                'summary' => $telecomSummary,
                'networks' => $telecomNetworks,
            ],
            'provider_expenditure_report' => [
                'telecom_cost' => $telecomCost,
                'nin_wholesale_cost' => $ninCost,
                'identity_wholesale_cost' => $ninCost,
                'total_cost' => $totalExpenditure,
                'providers' => $providerExpenditures,
            ],
            'profit_report' => [
                'total_revenue' => $totalServiceRevenue,
                'funding_credits_volume' => (float)($txSummary['credit_funding_volume'] ?? 0),
                'refund_credits_volume' => (float)($txSummary['refund_credit_volume'] ?? 0),
                'debit_sales_volume' => (float)($txSummary['debit_sales_volume'] ?? 0),
                'total_expenditure' => $totalExpenditure,
                'gross_profit' => $totalGrossProfit,
                'margin_percent' => $marginPercent,
                'telecom_profit' => $telecomProfit,
                'nin_profit' => $identityProfit,
                'modification_revenue' => $modRevenue,
                'enrolment_revenue' => $enrRevenue,
            ],
            'manual_funding_report' => $manualFundingSummary,
            'kyc_report' => $kycSummary,
            'staff_activity_report' => [
                'total_audit_events' => (int)($staffActivitySummary['total_logs'] ?? 0),
                'recent_events' => $recentLogs,
                'staff_breakdown' => $staffBreakdown,
            ],
            'referral_growth_report' => $referralReport,
        ];

        $format = strtolower(trim((string)$request->query('format', 'json')));
        if ($format === 'csv') {
            $reportKey = trim((string)$request->query('report', 'all'));
            $filename = 'hambaktech_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $reportKey) . '_' . date('Ymd_His') . '.csv';
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: no-store, no-cache, must-revalidate');

            $out = fopen('php://output', 'wb');
            fprintf($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Report', 'Section', 'Metric / Record', 'Value / Detail 1', 'Detail 2', 'Detail 3', 'Timestamp']);

            $emitKey = function (string $key, $section) use ($out, &$emitKey) {
                if (!is_array($section)) {
                    fputcsv($out, [$this->csvSafeCell($key), 'summary', 'value', $this->csvSafeCell($section), '', '', '']);
                    return;
                }
                if (array_is_list($section)) {
                    foreach ($section as $idx => $item) {
                        if (is_array($item)) {
                            $cols = array_values($item);
                            fputcsv($out, [
                                $this->csvSafeCell($key),
                                'row_' . ($idx + 1),
                                $this->csvSafeCell($cols[0] ?? ''),
                                $this->csvSafeCell($cols[1] ?? ''),
                                $this->csvSafeCell($cols[2] ?? ''),
                                $this->csvSafeCell($cols[3] ?? ''),
                                $this->csvSafeCell($cols[4] ?? ''),
                            ]);
                        }
                    }
                    return;
                }
                foreach ($section as $k => $v) {
                    if (is_array($v)) {
                        $emitKey("{$key}.{$k}", $v);
                    } else {
                        fputcsv($out, [$this->csvSafeCell($key), 'summary', $this->csvSafeCell($k), $this->csvSafeCell($v), '', '', '']);
                    }
                }
            };

            if ($reportKey !== 'all' && array_key_exists($reportKey, $reportsPayload)) {
                $emitKey($reportKey, $reportsPayload[$reportKey]);
            } else {
                foreach ($reportsPayload as $rKey => $rVal) {
                    if ($rKey === 'generated_at' || $rKey === 'date_range') {
                        continue;
                    }
                    $emitKey($rKey, $rVal);
                }
            }
            fclose($out);
            exit;
        }

        Response::success(['reports' => $reportsPayload]);
    }

    // =========================================================================
    // 12. CUSTOMER MANAGEMENT (DETAILED VIEWS & ACTIONS)
    // =========================================================================
    public function customerDetail(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'customers');
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
            'SELECT id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at 
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
            if (is_string($t['metadata'] ?? null) && $t['metadata'] !== '') {
                $decodedMeta = json_decode($t['metadata'], true);
                $t['metadata'] = is_array($decodedMeta) ? $decodedMeta : null;
            }
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

        $kycIdRows = $this->db->fetchAll(
            'SELECT id FROM kyc_submissions WHERE user_id = :uid ORDER BY created_at DESC',
            ['uid' => $customerId]
        );
        $kycSubmissions = [];
        if (!empty($kycIdRows)) {
            $kycIds = array_values(array_filter(array_column($kycIdRows, 'id')));
            if (!empty($kycIds)) {
                $phList = [];
                $kParams = [];
                foreach ($kycIds as $kIdx => $kId) {
                    $phList[] = ':kid_' . $kIdx;
                    $kParams['kid_' . $kIdx] = $kId;
                }
                $kycSubmissions = $this->db->fetchAll(
                    'SELECT * FROM kyc_submissions WHERE id IN (' . implode(', ', $phList) . ')',
                    $kParams
                );
                $kMap = array_flip($kycIds);
                usort($kycSubmissions, static fn($a, $b) => ($kMap[$a['id']] ?? PHP_INT_MAX) <=> ($kMap[$b['id']] ?? PHP_INT_MAX));
            }
        }
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
        $admin = Auth::requirePermission($request, 'customers');
        $customerId = $params['id'] ?? '';
        $body = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM users WHERE id = :id', ['id' => $customerId]);
        if (!$existing) {
            Response::error('Customer not found.', 404);
            return;
        }
        if (in_array(strtolower((string)$existing['role']), ['admin', 'superadmin'], true) && $admin['role'] !== 'superadmin') {
            Response::forbidden('Only a Super Admin can update an administrator account.');
        }

        $fullName = isset($body['full_name']) ? trim((string)$body['full_name']) : null;
        $email = isset($body['email']) ? strtolower(trim((string)$body['email'])) : null;
        $phoneNumber = isset($body['phone_number']) ? trim((string)$body['phone_number']) : null;
        $tier = isset($body['tier']) ? max(1, min(3, (int)$body['tier'])) : null;
        $kycStatus = isset($body['kyc_status']) ? strtolower(trim((string)$body['kyc_status'])) : null;
        $status = isset($body['status']) ? strtolower(trim((string)$body['status'])) : null;
        $newPassword = isset($body['new_password']) ? (string)$body['new_password'] : '';
        $requestedRole = isset($body['role']) ? strtolower(trim((string)$body['role'])) : null;
        $requestedDashboard = isset($body['assigned_dashboard']) ? strtolower(trim((string)$body['assigned_dashboard'])) : null;

        $address = $body['address'] ?? $body['residential_address'] ?? null;
        $state = $body['state'] ?? null;
        $lga = $body['lga'] ?? null;
        $dob = $body['date_of_birth'] ?? $body['dob'] ?? null;
        $nin = isset($body['nin']) ? preg_replace('/\D/', '', (string)$body['nin']) : null;
        $bvn = isset($body['bvn']) ? preg_replace('/\D/', '', (string)$body['bvn']) : null;
        $bio = $body['bio'] ?? null;

        $updates = [];
        $paramsDb = ['id' => $customerId];

        $existingRoleNorm = DashboardConfigService::normalizeRole((string)$existing['role']);
        if ($requestedRole !== null && $requestedRole !== '' && $requestedRole !== $existingRoleNorm) {
            if (!in_array($requestedRole, DashboardConfigService::ALL_ROLES, true)) {
                Response::error('Invalid role specified.', 422);
            }
            if ((Auth::isConsoleRole($existingRoleNorm) || Auth::isConsoleRole($requestedRole)) && $admin['role'] !== 'superadmin') {
                Response::forbidden('Only a Super Admin can assign or modify internal staff or administrator roles.');
            }
            if ($customerId === $admin['id'] && $existingRoleNorm === 'superadmin' && $requestedRole !== 'superadmin') {
                Response::forbidden('You cannot demote your own Super Admin account.');
            }
            if ($existingRoleNorm === 'superadmin' && $requestedRole !== 'superadmin') {
                $activeSupers = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM users WHERE role = "superadmin" AND status = "active" AND id != :id', ['id' => $customerId]);
                if ((int)($activeSupers['cnt'] ?? 0) < 1) {
                    Response::forbidden('At least one active Super Admin account must remain on the platform.');
                }
            }
            $updates[] = 'role = :roleVal';
            $paramsDb['roleVal'] = $requestedRole;
            if ($requestedDashboard === null || $requestedDashboard === '') {
                $requestedDashboard = DashboardConfigService::normalizeDashboardKey(null, $requestedRole);
            }
            if ($requestedRole === 'superadmin') {
                $updates[] = 'assigned_permissions = :permsVal';
                $paramsDb['permsVal'] = json_encode(['*']);
            } elseif (Auth::isConsoleRole($requestedRole)) {
                $updates[] = 'assigned_permissions = :permsVal';
                $paramsDb['permsVal'] = json_encode(DashboardConfigService::getDefaultPermissionsForRole($requestedRole));
            } else {
                $updates[] = 'assigned_permissions = :permsVal';
                $paramsDb['permsVal'] = json_encode([]);
            }
        }

        if ($requestedDashboard !== null && $requestedDashboard !== '') {
            if ($admin['role'] !== 'superadmin') {
                Response::forbidden('Only a Super Admin can change assigned dashboards.');
            }
            if (!in_array($requestedDashboard, DashboardConfigService::DASHBOARD_KEYS, true)) {
                Response::error('Invalid assigned dashboard.', 422);
            }
            $updates[] = 'assigned_dashboard = :dashVal';
            $paramsDb['dashVal'] = $requestedDashboard;
        }

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
            $phoneNorm = ReferralEngineService::normalizePhone($phoneNumber);
            if ($phoneNorm !== '') {
                $dupPhone = $this->db->fetchOne(
                    'SELECT id FROM users WHERE (phone_number = :p OR phone_normalized = :pn) AND id != :id',
                    ['p' => $phoneNumber, 'pn' => $phoneNorm, 'id' => $customerId]
                );
                if ($dupPhone) {
                    Response::error('Another account already uses this phone number.', 409);
                }
            }
            $updates[] = 'phone_number = :pn';
            $paramsDb['pn'] = $phoneNumber;
            $updates[] = 'phone_normalized = :pnorm';
            $paramsDb['pnorm'] = $phoneNorm ?: null;
        }
        if ($tier !== null) {
            $updates[] = 'tier = :tr';
            $paramsDb['tr'] = $tier;
        }
        if ($kycStatus !== null && in_array($kycStatus, ['unverified', 'pending', 'verified', 'approved', 'rejected'], true)) {
            $updates[] = 'kyc_status = :ks';
            $paramsDb['ks'] = ($kycStatus === 'approved') ? 'verified' : $kycStatus;
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
            if ($status === 'suspended' || $newPassword !== '' || isset($paramsDb['roleVal']) || isset($paramsDb['dashVal'])) {
                Auth::revokeAllUserSessions($customerId, $status === 'suspended' ? 'account_suspended' : 'admin_account_security_update', true);
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
        $admin = Auth::requirePermission($request, 'customers');
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
            $db->execute(
                'DELETE FROM wallet_ledger WHERE user_id = :uid1 OR wallet_id IN (SELECT id FROM wallets WHERE user_id = :uid2)',
                ['uid1' => $customerId, 'uid2' => $customerId]
            );
            $db->execute('DELETE FROM wallets WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM customer_virtual_accounts WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM payment_records WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM bulk_sms_records WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM customer_messages WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM user_profiles WHERE user_id = :uid', ['uid' => $customerId]);
            $db->execute('DELETE FROM notifications WHERE user_id = :uid', ['uid' => $customerId]);
            foreach (['user_sessions', 'mfa_challenges', 'user_mfa_configs', 'pin_reset_requests', 'referral_balances', 'referral_points_ledger', 'referral_withdrawals'] as $tbl) {
                try {
                    $db->execute("DELETE FROM {$tbl} WHERE user_id = :uid", ['uid' => $customerId]);
                } catch (Throwable) {
                }
            }
            try {
                $db->execute('DELETE FROM referral_rewards WHERE referrer_user_id = :u1 OR referred_user_id = :u2', ['u1' => $customerId, 'u2' => $customerId]);
                $db->execute('DELETE FROM referrals WHERE referrer_user_id = :u1 OR referred_user_id = :u2', ['u1' => $customerId, 'u2' => $customerId]);
            } catch (Throwable) {
            }
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
        $admin = Auth::requirePermission($request, 'wallet');
        $customerId = $params['id'] ?? ($request->input('user_id') ?? '');
        $type = strtolower((string)$request->input('type', 'credit'));
        $amount = (float)$request->input('amount', 0);
        $reason = trim((string)$request->input('reason', 'Administrative Balance Adjustment'));

        if (empty($customerId) || $amount <= 0) {
            Response::error('Valid customer ID and positive amount required.', 422);
            return;
        }

        $targetUser = $this->db->fetchOne('SELECT id, role FROM users WHERE id = :id LIMIT 1', ['id' => $customerId]);
        if (!$targetUser) {
            Response::error('Customer not found.', 404);
            return;
        }
        if (in_array(strtolower((string)$targetUser['role']), ['admin', 'superadmin'], true) && $admin['role'] !== 'superadmin') {
            Response::forbidden('Only a Super Admin can adjust privileged administrator wallets.');
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
        $admin = Auth::requirePermission($request, 'kyc');
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

        try {
            if (!empty($existing['email'])) {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($existing['full_name'] ?: 'Customer'), ENT_QUOTES, 'UTF-8');
                $safeNotes = htmlspecialchars($notes, ENT_QUOTES, 'UTF-8');
                $subject = $status === 'verified' ? "KYC Tier {$tier} Approved — HAMBAKTECH" : 'KYC Verification Update — HAMBAKTECH';
                $color = $status === 'verified' ? '#059669' : '#d97706';
                $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    . "<h2 style='margin:0 0 12px;color:{$color};'>" . ($status === 'verified' ? "KYC Level {$tier} Approved" : 'KYC Status Updated: ' . strtoupper($status)) . "</h2>"
                    . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                    . "<p style='color:#334155;'>" . ($status === 'verified' ? "Your Identity & KYC verification has been approved and your account is active at Level {$tier}." : "Your KYC status has been updated to <strong>" . strtoupper($status) . "</strong>.") . "</p>"
                    . "<p style='color:#475569;font-size:13px;'><strong>Reviewer Notes:</strong> {$safeNotes}</p></div>";
                $mailer->send((string)$existing['email'], (string)($existing['full_name'] ?: 'Customer'), $subject, $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'KYC_DECISION_EMAIL']);
            }
        } catch (Throwable) {
        }

        $updated = $this->hydrateCustomerRow($customerId);
        Response::success(['customer' => $updated], "Customer KYC status updated to {$status}");
    }

    public function notifyCustomer(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'customers');
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
        Auth::requirePermission($request, 'services');

        // 1. Fetch system pricing & routing settings
        $settingsRows = $this->db->fetchAll('SELECT setting_key, setting_value FROM system_settings WHERE category IN ("pricing", "payment", "general", "telecom", "identity", "providers")');
        $settings = [
            'nin_fee' => 200,
            'bvn_fee' => 250,
            'mtn_sme_1gb' => 270,
            'airtel_1gb' => 290,
            'glo_1gb' => 260,
            'nine_mobile_1gb' => 250,
            'airtime_discount_percent' => \HambakTech\Controllers\TelecomController::readAirtimeDiscountPercent($this->db),
            'data_default_markup_percent' => 15,
            'active_verification_provider' => '2sureverify',
            'bvn_primary_provider' => '2sureverify',
            'bvn_fallback_provider' => 'veripine',
            'bvn_auto_fallback' => true,
            'identity_auto_fallback' => true,
            'active_telecom_provider' => 'ulamadata',
            'active_payment_gateway' => 'paystack',
        ];
        foreach ($settingsRows as $sr) {
            $val = $sr['setting_value'];
            if (in_array($sr['setting_key'], ['bvn_auto_fallback', 'identity_auto_fallback'], true)) {
                $val = filter_var($val, FILTER_VALIDATE_BOOLEAN);
            } elseif (is_numeric($val)) {
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requireSuperAdmin($request);
        $b = $request->getBody();

        foreach ($b as $k => $v) {
            $storeVal = is_bool($v) ? ($v ? '1' : '0') : (string)$v;
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                 VALUES (:id, :k, :v, "providers", "Active provider routing")
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                [
                    'id' => Security::generateUuid(),
                    'k' => (string)$k,
                    'v' => $storeVal,
                    'v2' => $storeVal,
                ]
            );
        }

        $primaryIdentity = strtolower(trim((string)($b['active_verification_provider'] ?? $b['primary_identity_provider'] ?? $b['primaryProviderId'] ?? '')));
        if (in_array($primaryIdentity, ['2sureverify', 'veripine'], true)) {
            $this->syncIdentityProviderState($primaryIdentity);
        }

        $bvnPrimary = strtolower(trim((string)($b['bvn_primary_provider'] ?? '')));
        if (in_array($bvnPrimary, ['2sureverify', 'veripine'], true)) {
            $this->db->execute(
                'UPDATE service_catalogue SET provider_id = :pid, updated_at = NOW() WHERE service_key IN ("bvn_v1", "bvn_v2", "bvn_v3", "bvn_retrieval")',
                ['pid' => $bvnPrimary]
            );
        }

        Response::success(['routing' => $b], 'Provider routing configuration updated successfully');
    }

    private function syncIdentityProviderState(string $primaryId): void
    {
        $fallbackId = $primaryId === '2sureverify' ? 'veripine' : '2sureverify';
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_act_verif", "active_verification_provider", :v1, "providers", "Active Verification Provider")
             ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
            ['v1' => $primaryId, 'v2' => $primaryId]
        );
        $this->db->execute(
            'UPDATE providers SET is_default = CASE WHEN id = :id1 THEN 1 ELSE 0 END, is_active = CASE WHEN id = :id2 THEN 1 ELSE is_active END WHERE provider_type IN ("identity", "verification")',
            ['id1' => $primaryId, 'id2' => $primaryId]
        );
        $this->db->execute(
            'UPDATE service_catalogue SET provider_id = :pid, updated_at = NOW() WHERE (processing_type = "instant" OR processing_type IS NULL) AND (service_key LIKE "nin\_%" OR service_key LIKE "phone\_%" OR service_key LIKE "demo\_%" OR service_key LIKE "bvn\_%" OR service_key = "vnin_verification") AND service_key NOT IN ("bvn_modification", "bvn_enroll_adult", "bvn_enroll_child")',
            ['pid' => $primaryId]
        );

        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "provider_integration_settings"');
            $existing = ($row && !empty($row['setting_value'])) ? (json_decode((string)$row['setting_value'], true) ?: []) : [];
            $merged = array_merge([
                'primary_telecom_provider' => 'ulamadata',
                'fallback_telecom_provider' => 'vtpass',
                'auto_failover_enabled' => true,
                'request_timeout_seconds' => 30,
            ], $existing, [
                'primary_identity_provider' => $primaryId,
                'fallback_identity_provider' => $fallbackId,
            ]);
            $jsonVal = json_encode($merged, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, "provider_integration_settings", :v1, "provider_integration", "Configuration for provider_integration", NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'v1' => $jsonVal, 'v2' => $jsonVal]
            );
        } catch (Throwable) {
        }
    }

    public function verificationServices(Request $request): void
    {
        Auth::requirePermission($request, 'services');
        \HambakTech\Core\SchemaSync::syncModificationCatalog($this->db);
        \HambakTech\Core\SchemaSync::syncEnrolmentCatalog($this->db);

        $rows = $this->db->fetchAll(
            'SELECT s.service_key as `key`, s.name, s.selling_price as price, s.wholesale_cost, 
                    s.provider_id as provider, s.endpoint as endpoint, s.is_active,
                    s.processing_type, s.manual_label, s.estimated_turnaround,
                    COALESCE(c.code, c.name, "nin_verification") as category, c.name as category_name
             FROM service_catalogue s
             LEFT JOIN service_categories c ON c.id = s.category_id
             ORDER BY c.display_order ASC, s.selling_price ASC'
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
        Auth::requirePermission($request, 'services');
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

        $existingRow = $this->db->fetchOne(
            'SELECT selling_price, wholesale_cost FROM service_catalogue WHERE service_key = :k LIMIT 1',
            ['k' => $key]
        );
        if (!$existingRow) {
            Response::notFound('Verification service not found.');
        }

        $targetSelling = $paramsDb['spr'] ?? ($paramsDb['pr'] ?? (float)$existingRow['selling_price']);
        $targetWholesale = $paramsDb['wc'] ?? (float)$existingRow['wholesale_cost'];
        if ((float)$targetSelling < (float)$targetWholesale) {
            Response::error(
                'Customer selling price (₦' . number_format((float)$targetSelling, 2) . ') cannot be lower than wholesale cost (₦' . number_format((float)$targetWholesale, 2) . ').',
                422
            );
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
        Auth::requirePermission($request, 'services');
        \HambakTech\Core\SchemaSync::syncModificationCatalog($this->db);
        \HambakTech\Core\SchemaSync::syncEnrolmentCatalog($this->db);

        $adapter = new \HambakTech\Adapters\Verification\TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Response::success(['updatedCount' => 0], '2SureVerify API credentials not configured on this server; local wholesale catalog verified.');
        }

        $res = $adapter->getServicesCatalog();
        $list = $res['data'] ?? $res['services'] ?? [];
        $updatedCount = 0;

        if (!empty($res['success']) && is_array($list)) {
            $localRows = $this->db->fetchAll('SELECT id, service_key, endpoint FROM service_catalogue');
            foreach ($list as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $ep = strtolower(trim((string)($entry['endpoint'] ?? $entry['url'] ?? '')));
                $sk = strtolower(trim((string)($entry['service_key'] ?? $entry['key'] ?? $entry['code'] ?? '')));
                $price = $entry['price'] ?? $entry['cost'] ?? $entry['amount'] ?? null;
                if (!is_numeric($price) || (float)$price <= 0) {
                    continue;
                }
                foreach ($localRows as $lr) {
                    $localEp = strtolower((string)$lr['endpoint']);
                    $localSk = strtolower((string)$lr['service_key']);
                    if (($ep !== '' && (str_contains($ep, basename($localEp)) || $ep === $localEp)) || ($sk !== '' && $sk === $localSk)) {
                        $this->db->execute(
                            'UPDATE service_catalogue SET wholesale_cost = :wc, updated_at = NOW() WHERE id = :id',
                            ['wc' => (float)$price, 'id' => $lr['id']]
                        );
                        $updatedCount++;
                    }
                }
            }
        }

        Response::success(
            ['updatedCount' => $updatedCount],
            $updatedCount > 0
                ? "Synchronized {$updatedCount} wholesale tariffs from live 2SureVerify catalog."
                : 'Checked live 2SureVerify catalog; wholesale tariffs are already up to date.'
        );
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
        Auth::requirePermission($request, 'services');
        $providers = $this->db->fetchAll('SELECT * FROM providers ORDER BY provider_type ASC, is_default DESC, name ASC');
        $primaryId = '2sureverify';
        foreach ($providers as &$p) {
            if (!empty($p['is_default']) && in_array($p['provider_type'] ?? '', ['identity', 'verification'], true)) {
                $primaryId = $p['id'];
            }
            $p = $this->sanitizeProviderRow($p);
        }

        $routing = [
            'active_verification_provider' => $primaryId,
            'bvn_primary_provider' => $primaryId,
            'bvn_fallback_provider' => $primaryId === '2sureverify' ? 'veripine' : '2sureverify',
            'bvn_auto_fallback' => true,
            'identity_auto_fallback' => true,
        ];
        try {
            $rRows = $this->db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("active_verification_provider", "bvn_primary_provider", "bvn_fallback_provider", "bvn_auto_fallback", "identity_auto_fallback")'
            );
            foreach ($rRows as $rr) {
                $k = (string)$rr['setting_key'];
                $v = (string)$rr['setting_value'];
                if (in_array($k, ['bvn_auto_fallback', 'identity_auto_fallback'], true)) {
                    $routing[$k] = filter_var($v, FILTER_VALIDATE_BOOLEAN);
                } elseif ($v !== '') {
                    $routing[$k] = $v;
                }
            }
        } catch (Throwable) {
        }

        Response::success([
            'primaryProviderId' => $primaryId,
            'providers' => $providers,
            'routing' => $routing,
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
                $this->syncIdentityProviderState(strtolower($id));
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
        Auth::requireSuperAdmin($request);
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
        Auth::requirePermission($request, 'services');
        // Two-step deferred ID fetch prevents MySQL SQLSTATE[HY001]: 1038 Out of sort memory on LONGTEXT blobs
        $idRows = $this->db->fetchAll('SELECT id FROM provider_logs ORDER BY created_at DESC LIMIT 100');
        $logs = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $lid) {
                    $ph = ':pl_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['pl_' . $idx] = $lid;
                }
                $logs = $this->db->fetchAll(
                    'SELECT id, provider_id, provider_id AS provider, endpoint, method, status_code,
                            LEFT(request_body, 8000) as request_body,
                            LEFT(response_body, 8000) as response_body,
                            latency_ms, reference, created_at
                     FROM provider_logs
                     WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                foreach ($logs as &$logRow) {
                    $logRow['provider'] = (string)($logRow['provider'] ?? $logRow['provider_id'] ?? 'unknown');
                    $logRow['endpoint'] = Security::sanitizeProviderUrl((string)($logRow['endpoint'] ?? ''));
                    if (isset($logRow['request_body']) && $logRow['request_body'] !== null) {
                        $logRow['request_body'] = Security::sanitizeProviderLogPayload($logRow['request_body'], 4000);
                    }
                    if (isset($logRow['response_body']) && $logRow['response_body'] !== null) {
                        $logRow['response_body'] = Security::sanitizeProviderLogPayload($logRow['response_body'], 4000);
                    }
                }
                unset($logRow);
                $orderMap = array_flip($ids);
                usort($logs, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }
        Response::success(['logs' => $logs]);
    }

    // =========================================================================
    // 14. SLIP TEMPLATES & NIN SLIP MANAGEMENT
    // =========================================================================
    public function slipTemplates(Request $request): void
    {
        Auth::requirePermission($request, 'services');
        VerificationController::ensureSlipSchemaAndDefaults($this->db);

        $rows = $this->db->fetchAll('SELECT * FROM slip_templates ORDER BY display_order ASC, name ASC');
        $templates = array_map([VerificationController::class, 'formatSlipRow'], $rows);

        Response::success(['templates' => $templates]);
    }

    public function uploadSlipSpecimen(Request $request): void
    {
        Auth::requirePermission($request, 'services');

        $decoded = null;
        $ext = null;

        // 1. Check multipart file upload first
        if (!empty($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            $tmpPath = $_FILES['file']['tmp_name'];
            $size = (int)($_FILES['file']['size'] ?? 0);
            if ($size <= 0 || $size > 5 * 1024 * 1024) {
                Response::error('Specimen image must be under 5MB.', 422);
            }
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = $finfo ? strtolower((string)finfo_file($finfo, $tmpPath)) : '';
            if ($finfo) {
                finfo_close($finfo);
            }
            $allowedMimes = [
                'image/png' => 'png',
                'image/jpeg' => 'jpg',
                'image/jpg' => 'jpg',
                'image/webp' => 'webp',
            ];
            if (!isset($allowedMimes[$mime])) {
                Response::error('Unsupported image format. Please upload a PNG, JPG, JPEG, or WebP file.', 422);
            }
            $ext = $allowedMimes[$mime];
            $decoded = file_get_contents($tmpPath);
        } else {
            // 2. Base64 data URI upload
            $fileData = (string)($request->input('file_data') ?? $request->input('file_base64') ?? '');
            if (!preg_match('/^data:([a-zA-Z0-9\/\+.-]+);base64,(.+)$/s', $fileData, $matches)) {
                Response::error('Please choose a valid PNG, JPG, JPEG, or WebP specimen image.', 422);
            }
            $mime = strtolower($matches[1]);
            $allowedMimes = [
                'image/png' => 'png',
                'image/jpeg' => 'jpg',
                'image/jpg' => 'jpg',
                'image/webp' => 'webp',
            ];
            if (!isset($allowedMimes[$mime])) {
                Response::error('Unsupported image format. Please upload a PNG, JPG, JPEG, or WebP file.', 422);
            }
            $decoded = base64_decode($matches[2], true);
            if ($decoded === false) {
                Response::error('Could not decode uploaded image data.', 422);
            }
            if (strlen($decoded) > 5 * 1024 * 1024) {
                Response::error('Specimen image exceeds the 5MB maximum limit.', 422);
            }
            $ext = $allowedMimes[$mime];
        }

        if ($decoded === false || $decoded === null || $ext === null) {
            Response::error('Failed to process uploaded specimen image.', 422);
        }

        $parentUploads = dirname(HAMBAKTECH_ROOT) . '/uploads';
        $uploadDir = is_dir($parentUploads)
            ? ($parentUploads . '/slips')
            : (HAMBAKTECH_ROOT . '/uploads/slips');
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            Response::error('Failed to initialize server upload directory.', 500);
        }

        $safeFilename = 'specimen_' . time() . '_' . substr(md5(uniqid('', true)), 0, 8) . '.' . $ext;
        $targetPath = $uploadDir . '/' . $safeFilename;
        if (file_put_contents($targetPath, $decoded) === false) {
            Response::error('Failed to store uploaded specimen image.', 500);
        }

        Response::success([
            'url' => '/uploads/slips/' . $safeFilename,
            'filename' => $safeFilename,
        ], 'Specimen image uploaded successfully.');
    }

    public function saveSlipTemplate(Request $request, array $params = []): void
    {
        Auth::requirePermission($request, 'services');
        VerificationController::ensureSlipSchemaAndDefaults($this->db);

        $id = trim((string)($params['id'] ?? $request->input('id', '')));
        $body = $request->getBody();

        if (empty($id)) {
            $id = 'tpl_' . strtolower(bin2hex(random_bytes(4)));
        }

        $existing = $this->db->fetchOne('SELECT * FROM slip_templates WHERE id = :id LIMIT 1', ['id' => $id]);

        $name = array_key_exists('name', $body) ? trim((string)$body['name']) : ($existing['name'] ?? 'Slip Template');
        if ($name === '') {
            Response::error('Slip name cannot be empty.', 422);
        }

        $slipCode = array_key_exists('slip_code', $body)
            ? (trim((string)$body['slip_code']) ?: null)
            : ($existing['slip_code'] ?? null);
        $category = array_key_exists('category', $body)
            ? strtoupper(trim((string)$body['category']))
            : ($existing['category'] ?? 'NIN');
        $price = array_key_exists('price', $body)
            ? ($body['price'] === '' || $body['price'] === null ? null : max(0.0, (float)$body['price']))
            : (isset($existing['price']) && $existing['price'] !== null ? (float)$existing['price'] : null);
        $demoImg = array_key_exists('demo_image_url', $body)
            ? trim((string)$body['demo_image_url'])
            : ($existing['demo_image_url'] ?? '/assets/aistudio/IMG_0483_23e1a1e1.png');
        $description = array_key_exists('description', $body)
            ? trim((string)$body['description'])
            : ($existing['description'] ?? '');
        $supportedService = array_key_exists('supported_service', $body)
            ? trim((string)$body['supported_service'])
            : ($existing['supported_service'] ?? 'all_nin');
        $isActive = array_key_exists('is_active', $body)
            ? (filter_var($body['is_active'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
            : (int)($existing['is_active'] ?? 1);
        $displayOrder = array_key_exists('display_order', $body)
            ? max(0, (int)$body['display_order'])
            : (int)($existing['display_order'] ?? 1);
        $isRecommended = array_key_exists('is_recommended', $body)
            ? (filter_var($body['is_recommended'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
            : (int)($existing['is_recommended'] ?? 0);
        $badge = array_key_exists('badge', $body)
            ? (trim((string)$body['badge']) ?: null)
            : ($existing['badge'] ?? null);
        if ($isRecommended && empty($badge)) {
            $badge = 'Recommended';
        }
        $watermark = array_key_exists('watermark_text', $body)
            ? (trim((string)$body['watermark_text']) ?: 'SAMPLE SPECIMEN')
            : ($existing['watermark_text'] ?? 'SAMPLE SPECIMEN');

        $this->db->execute(
            'INSERT INTO slip_templates
             (id, slip_code, name, category, price, demo_image_url, description, supported_service, is_active, display_order, is_recommended, badge, watermark_text)
             VALUES
             (:id, :scode, :name, :cat, :price, :img, :desc, :sup, :act, :ord, :rec, :bdg, :wmark)
             ON DUPLICATE KEY UPDATE
                slip_code = VALUES(slip_code),
                name = VALUES(name),
                category = VALUES(category),
                price = VALUES(price),
                demo_image_url = VALUES(demo_image_url),
                description = VALUES(description),
                supported_service = VALUES(supported_service),
                is_active = VALUES(is_active),
                display_order = VALUES(display_order),
                is_recommended = VALUES(is_recommended),
                badge = VALUES(badge),
                watermark_text = VALUES(watermark_text)',
            [
                'id' => $id,
                'scode' => $slipCode,
                'name' => $name,
                'cat' => $category,
                'price' => $price,
                'img' => $demoImg,
                'desc' => $description,
                'sup' => $supportedService,
                'act' => $isActive,
                'ord' => $displayOrder,
                'rec' => $isRecommended,
                'bdg' => $badge,
                'wmark' => $watermark,
            ]
        );

        $row = $this->db->fetchOne('SELECT * FROM slip_templates WHERE id = :id', ['id' => $id]);
        Response::success([
            'template' => $row ? VerificationController::formatSlipRow($row) : null,
        ], 'Slip template saved successfully');
    }

    public function deleteSlipTemplate(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'services');
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM slip_templates WHERE id = :id', ['id' => $id]);
        Response::success(null, 'Slip template deleted');
    }

    // =========================================================================
    // 15. DIGITAL UTILITIES (CABLE & DISCO)
    // =========================================================================
    public function digitalServices(Request $request): void
    {
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
        $this->db->execute('DELETE FROM cable_packages WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Cable package deleted');
    }

    public function saveElectricityDisco(Request $request, array $params = []): void
    {
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
        $this->db->execute('DELETE FROM electricity_discos WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Electricity disco deleted');
    }

    // =========================================================================
    // 16. HARDWARE STORE & AGENCY ACADEMY
    // =========================================================================
    public function store(Request $request): void
    {
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
        $this->db->execute('DELETE FROM store_items WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Store product deleted');
    }

    public function academy(Request $request): void
    {
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
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
        Auth::requirePermission($request, 'services');
        $this->db->execute('DELETE FROM academy_courses WHERE id = :id', ['id' => $params['id'] ?? '']);
        Response::success(null, 'Academy course deleted');
    }

    public function reportsSettings(Request $request): void
    {
        Auth::requirePermission($request, 'reports');
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
        Auth::requirePermission($request, 'settings');
        $row = $this->db->fetchOne('SELECT * FROM smtp_configs LIMIT 1');
        $cfgFile = __DIR__ . '/../config/config.php';
        $baseCfg = file_exists($cfgFile) ? require $cfgFile : [];
        $mailDefaults = $baseCfg['mail'] ?? [];

        $logs = [];
        try {
            $emailLogIds = $this->db->fetchAll('SELECT id FROM email_logs ORDER BY created_at DESC LIMIT 30');
            if (!empty($emailLogIds)) {
                $ids = array_values(array_filter(array_column($emailLogIds, 'id')));
                if (!empty($ids)) {
                    $placeholders = [];
                    $idParams = [];
                    foreach ($ids as $idx => $eid) {
                        $ph = ':el_' . $idx;
                        $placeholders[] = $ph;
                        $idParams['el_' . $idx] = $eid;
                    }
                    $logs = $this->db->fetchAll(
                        'SELECT * FROM email_logs WHERE id IN (' . implode(', ', $placeholders) . ')',
                        $idParams
                    );
                    $orderMap = array_flip($ids);
                    usort($logs, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
                }
            }
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
        Auth::requirePermission($request, 'settings');
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
        $sslOptions = [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'allow_self_signed' => false,
            'peer_name' => $host,
        ];
        $context = stream_context_create([
            'ssl' => $sslOptions,
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
            if ($ehloOk && $enc === 'tls') {
                @fwrite($socket, "STARTTLS\r\n");
                $startTlsResp = $readSmtp($socket);
                if ($startTlsResp['code'] === 220) {
                    foreach ($sslOptions as $optKey => $optVal) {
                        stream_context_set_option($socket, 'ssl', $optKey, $optVal);
                    }
                    $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
                    if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                        $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                    }
                    if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                        $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
                    }
                    $tlsOk = @stream_socket_enable_crypto($socket, true, $cryptoMethod);
                    if (!$tlsOk) {
                        $ehloOk = false;
                        $lastStep = 'SMTP STARTTLS certificate verification failed';
                    } else {
                        @fwrite($socket, "EHLO hambaktech.com.ng\r\n");
                        $ehlo2 = $readSmtp($socket);
                        $ehloOk = ($ehlo2['code'] === 250);
                        $lastStep = $ehlo2['text'];
                    }
                } else {
                    $ehloOk = false;
                    $lastStep = 'STARTTLS rejected: ' . $startTlsResp['text'];
                }
            }
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
        Auth::requirePermission($request, 'settings');
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
    // 20. STAFF & RBAC PERMISSIONS + ROLE CATALOG / DASHBOARD ASSIGNMENT
    // =========================================================================
    public function rolesCatalog(Request $request): void
    {
        $actor = Auth::requireAnyPermission($request, ['customers', 'staff', 'settings']);
        Response::success([
            'roles' => DashboardConfigService::getRolesCatalog(),
            'dashboards' => DashboardConfigService::getDashboardsCatalog(),
            'permissions' => DashboardConfigService::ALLOWED_PERMISSIONS,
            'permission_modules' => DashboardConfigService::ALLOWED_PERMISSIONS,
            'can_assign_console_roles' => ($actor['role'] === 'superadmin'),
            'can_assign_superadmin' => ($actor['role'] === 'superadmin'),
        ]);
    }

    public function assignCustomerRole(Request $request, array $params): void
    {
        $super = Auth::requireAnyPermission($request, ['customers', 'staff']);
        $userId = trim((string)($params['id'] ?? ''));
        $newRole = strtolower(trim((string)$request->input('role', '')));
        $rawDashboard = strtolower(trim((string)$request->input('assigned_dashboard', '')));
        $rawPerms = $request->input('permissions', $request->input('assigned_permissions', null));

        if ($userId === '' || !in_array($newRole, DashboardConfigService::ALL_ROLES, true)) {
            Response::error('Valid user ID and role are required.', 422);
        }

        $targetDashboard = DashboardConfigService::normalizeDashboardKey($rawDashboard !== '' ? $rawDashboard : null, $newRole);
        if (!in_array($targetDashboard, DashboardConfigService::DASHBOARD_KEYS, true)) {
            Response::error('Invalid assigned dashboard selected.', 422);
        }

        $existing = $this->db->fetchOne('SELECT id, email, full_name, role, status, assigned_dashboard, assigned_permissions FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
        if (!$existing) {
            Response::notFound('User account not found.');
        }

        $currentRole = DashboardConfigService::normalizeRole((string)$existing['role']);
        if ((Auth::isConsoleRole($currentRole) || Auth::isConsoleRole($newRole)) && $super['role'] !== 'superadmin') {
            Response::forbidden('Only a Super Admin can assign or modify internal staff or administrator roles.');
        }

        if ($userId === $super['id'] && $currentRole === 'superadmin' && $newRole !== 'superadmin') {
            Response::forbidden('You cannot demote your own active Super Admin account.');
        }

        if ($currentRole === 'superadmin' && $newRole !== 'superadmin') {
            $activeSupers = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM users WHERE role = "superadmin" AND status = "active" AND id != :id', ['id' => $userId]);
            if ((int)($activeSupers['cnt'] ?? 0) < 1) {
                Response::forbidden('At least one active Super Admin account must remain on the platform.');
            }
        }

        if ($newRole === 'superadmin') {
            $cleanPerms = ['*'];
        } elseif (Auth::isConsoleRole($newRole)) {
            if (is_array($rawPerms)) {
                $cleanPerms = array_values(array_intersect(DashboardConfigService::ALLOWED_PERMISSIONS, array_map('strval', $rawPerms)));
            } elseif ($newRole === $currentRole && is_string($existing['assigned_permissions'] ?? null)) {
                $decoded = json_decode((string)$existing['assigned_permissions'], true);
                $cleanPerms = is_array($decoded) ? $decoded : DashboardConfigService::getDefaultPermissionsForRole($newRole);
            } else {
                $cleanPerms = DashboardConfigService::getDefaultPermissionsForRole($newRole);
            }
        } else {
            $cleanPerms = [];
        }
        $permsJson = json_encode($cleanPerms);

        $this->db->withTransaction(function (Database $db) use ($userId, $newRole, $targetDashboard, $permsJson) {
            $db->execute(
                'UPDATE users SET role = :r, assigned_dashboard = :d, assigned_permissions = :p, updated_at = NOW() WHERE id = :id',
                ['r' => $newRole, 'd' => $targetDashboard, 'p' => $permsJson, 'id' => $userId]
            );
            $db->execute(
                'INSERT INTO user_profiles (user_id, assigned_permissions, created_at, updated_at)
                 VALUES (:uid, :p1, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE assigned_permissions = :p2, updated_at = NOW()',
                ['uid' => $userId, 'p1' => $permsJson, 'p2' => $permsJson]
            );
        });

        Auth::revokeAllUserSessions($userId, 'role_or_dashboard_reassigned', true);

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "ROLE_DASHBOARD_ASSIGNED", :det, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $super['id'],
                'email' => $super['email'],
                'det' => json_encode([
                    'target_user_id' => $userId,
                    'previous_role' => $existing['role'],
                    'new_role' => $newRole,
                    'assigned_dashboard' => $targetDashboard,
                    'permissions' => $cleanPerms,
                ]),
                'ip' => $request->getIp(),
            ]
        );

        try {
            if (!empty($existing['email'])) {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($existing['full_name'] ?: 'User'), ENT_QUOTES, 'UTF-8');
                $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    . "<h2 style='margin:0 0 12px;color:#0f172a;'>Account Role & Workspace Updated</h2>"
                    . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                    . "<p style='color:#334155;'>Your HAMBAKTECH account role is now <strong>" . strtoupper($newRole) . "</strong> with access to the <strong>" . strtoupper($targetDashboard) . " Dashboard</strong>.</p>"
                    . "<p style='color:#475569;font-size:13px;'>For your security, please sign in again on your next visit to activate your updated workspace permissions.</p></div>";
                $mailer->send((string)$existing['email'], (string)($existing['full_name'] ?: 'User'), 'HAMBAKTECH Access Role Updated', $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'ROLE_REASSIGN_EMAIL']);
            }
        } catch (Throwable) {
        }

        $updated = $this->hydrateCustomerRow($userId);
        Response::success([
            'customer' => $updated,
            'user' => $updated,
            'role' => $newRole,
            'assigned_dashboard' => $targetDashboard,
            'permissions' => $cleanPerms,
        ], "Role updated to {$newRole} ({$targetDashboard} dashboard). Existing sessions revoked.");
    }

    public function staff(Request $request): void
    {
        Auth::requirePermission($request, 'staff');
        $staff = $this->db->fetchAll(
            'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.assigned_dashboard, u.kyc_status, u.tier, u.status,
                    u.assigned_permissions, u.mfa_enabled, u.last_login_at, u.created_at,
                    p.assigned_permissions AS profile_permissions
             FROM users u
             LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE u.role IN ("support", "staff", "manager", "admin", "superadmin")
             ORDER BY FIELD(u.role, "superadmin", "admin", "manager", "staff", "support"), u.full_name ASC'
        );

        foreach ($staff as &$s) {
            $r = strtolower(trim((string)($s['role'] ?? 'staff')));
            $perms = [];
            foreach ([$s['assigned_permissions'] ?? null, $s['profile_permissions'] ?? null] as $raw) {
                if (is_string($raw) && $raw !== '') {
                    $decoded = json_decode($raw, true);
                    if (is_array($decoded)) {
                        $perms = $decoded;
                        break;
                    }
                }
            }
            $r = DashboardConfigService::normalizeRole($r);
            $s['role'] = $r;
            if ($r === 'superadmin') {
                $perms = ['*'];
            } elseif (empty($perms)) {
                $perms = DashboardConfigService::getDefaultPermissionsForRole($r);
            }
            $s['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey($s['assigned_dashboard'] ?? null, $r);
            $s['permissions'] = array_values(array_unique($perms));
            $s['mfa_enabled'] = (bool)($s['mfa_enabled'] ?? false);
            unset($s['assigned_permissions'], $s['profile_permissions']);
        }

        Response::success(['staff' => $staff]);
    }

    public function createStaff(Request $request): void
    {
        $super = Auth::requireSuperAdmin($request);
        $fullName = trim((string)$request->input('full_name', ''));
        $email = trim(strtolower((string)$request->input('email', '')));
        $password = (string)$request->input('password', '');
        $phone = trim((string)$request->input('phone_number', '')) ?: '+2348000000000';
        $role = strtolower(trim((string)$request->input('role', 'staff')));
        $rawDashboard = strtolower(trim((string)$request->input('assigned_dashboard', '')));
        $rawPerms = $request->input('permissions', $request->input('assigned_permissions', null));

        if (empty($fullName) || empty($email) || empty($password)) {
            Response::error('Name, email, and password are required.', 422);
            return;
        }
        if (strlen($password) < 8) {
            Response::error('Staff password must be at least 8 characters long.', 422);
            return;
        }

        $phoneNorm = ReferralEngineService::normalizePhone($phone);
        $existing = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email', ['email' => $email]);
        if ($existing) {
            Response::error('A user with this email already exists.', 409);
            return;
        }

        $dbRole = in_array($role, Auth::CONSOLE_ROLES, true) ? $role : 'staff';
        $assignedDashboard = DashboardConfigService::normalizeDashboardKey($rawDashboard !== '' ? $rawDashboard : null, $dbRole);

        $cleanPerms = DashboardConfigService::getDefaultPermissionsForRole($dbRole);
        if (is_array($rawPerms)) {
            $filtered = array_values(array_intersect(DashboardConfigService::ALLOWED_PERMISSIONS, array_map('strval', $rawPerms)));
            if (!empty($filtered)) {
                $cleanPerms = $filtered;
            }
        }
        if ($dbRole === 'superadmin') {
            $cleanPerms = ['*'];
        }
        $permsJson = json_encode($cleanPerms);

        $id = Security::generateUuid();
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $refCode = (new ReferralEngineService($this->db))->generateUniqueCode('STF', 6);

        $this->db->withTransaction(function (Database $db) use ($id, $email, $hash, $fullName, $phone, $phoneNorm, $dbRole, $assignedDashboard, $refCode, $permsJson) {
            $db->execute(
                'INSERT INTO users (id, email, password_hash, full_name, phone_number, phone_normalized, role, assigned_dashboard, wallet_balance, kyc_status, tier, kyc_level, referral_code, assigned_permissions, status, email_verified, token_version, created_at)
                 VALUES (:id, :email, :hash, :name, :phone, :pnorm, :role, :dash, 0.00, "verified", 3, 3, :ref, :perms, "active", 1, 1, NOW())',
                [
                    'id' => $id,
                    'email' => $email,
                    'hash' => $hash,
                    'name' => $fullName,
                    'phone' => $phone,
                    'pnorm' => $phoneNorm ?: null,
                    'role' => $dbRole,
                    'dash' => $assignedDashboard,
                    'ref' => $refCode,
                    'perms' => $permsJson,
                ]
            );
            $db->execute(
                'INSERT INTO user_profiles (user_id, assigned_permissions, created_at, updated_at)
                 VALUES (:uid, :perms, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE assigned_permissions = :perms2, updated_at = NOW()',
                ['uid' => $id, 'perms' => $permsJson, 'perms2' => $permsJson]
            );
            $db->execute(
                'INSERT IGNORE INTO wallets (id, user_id, balance, currency, ledger_version, status, created_at)
                 VALUES (:wid, :uid, 0.00, "NGN", 0, "active", NOW())',
                ['wid' => Security::generateUuid(), 'uid' => $id]
            );
        });

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "STAFF_CREATED", :det, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $super['id'],
                'email' => $super['email'],
                'det' => json_encode(['staff_id' => $id, 'staff_email' => $email, 'role' => $dbRole, 'assigned_dashboard' => $assignedDashboard, 'permissions' => $cleanPerms]),
                'ip' => $request->getIp(),
            ]
        );

        try {
            $mailer = new MailService();
            $safeName = htmlspecialchars($fullName, ENT_QUOTES, 'UTF-8');
            $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                . "<h2 style='margin:0 0 12px;color:#0f172a;'>Staff Account Provisioned</h2>"
                . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                . "<p style='color:#334155;'>A HAMBAKTECH staff/console account has been created for <strong>{$email}</strong> with role <strong>" . strtoupper($dbRole) . "</strong> ({$assignedDashboard} workspace).</p>"
                . "<p style='color:#475569;font-size:13px;'>Sign in at <a href='https://hambaktech.com.ng/#login'>https://hambaktech.com.ng</a> using the credentials provided by your administrator.</p></div>";
            $mailer->send($email, $fullName, 'Welcome to HAMBAKTECH Operations Team', $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'STAFF_ONBOARDING_EMAIL']);
        } catch (Throwable) {
        }

        $row = $this->db->fetchOne('SELECT id, email, full_name, phone_number, role, assigned_dashboard, status, assigned_permissions FROM users WHERE id = :id', ['id' => $id]);
        if ($row) {
            $row['permissions'] = $cleanPerms;
            unset($row['assigned_permissions']);
        }
        Response::success(['staff' => $row], "Staff member {$fullName} created successfully", 201);
    }

    public function updateStaff(Request $request, array $params): void
    {
        $super = Auth::requireSuperAdmin($request);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $existing = $this->db->fetchOne('SELECT id, email, full_name, role, assigned_dashboard, status, assigned_permissions FROM users WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$existing) {
            Response::notFound('Staff account not found.');
        }

        if ($id === $super['id'] && (
            (isset($body['status']) && $body['status'] === 'suspended') ||
            (isset($body['role']) && $body['role'] !== 'superadmin')
        )) {
            Response::forbidden('You cannot demote or suspend your own active Super Admin account.');
        }

        if (($existing['role'] ?? '') === 'superadmin' && (
            (isset($body['status']) && $body['status'] === 'suspended') ||
            (isset($body['role']) && $body['role'] !== 'superadmin')
        )) {
            $activeSupers = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM users WHERE role = "superadmin" AND status = "active" AND id != :id', ['id' => $id]);
            if ((int)($activeSupers['cnt'] ?? 0) < 1) {
                Response::forbidden('At least one active Super Admin account must remain on the platform.');
            }
        }

        $updates = [];
        $paramsDb = ['id' => $id];
        $securitySensitiveChanged = false;

        if (isset($body['role']) && in_array(strtolower((string)$body['role']), DashboardConfigService::ALL_ROLES, true)) {
            $newRole = strtolower((string)$body['role']);
            if ($newRole !== $existing['role']) {
                $securitySensitiveChanged = true;
            }
            $updates[] = 'role = :r';
            $paramsDb['r'] = $newRole;
            if (!isset($body['assigned_dashboard'])) {
                $updates[] = 'assigned_dashboard = :dash_auto';
                $paramsDb['dash_auto'] = DashboardConfigService::normalizeDashboardKey(null, $newRole);
            }
        }
        if (isset($body['assigned_dashboard']) && in_array(strtolower((string)$body['assigned_dashboard']), DashboardConfigService::DASHBOARD_KEYS, true)) {
            $newDash = strtolower((string)$body['assigned_dashboard']);
            if ($newDash !== ($existing['assigned_dashboard'] ?? '')) {
                $securitySensitiveChanged = true;
            }
            $updates[] = 'assigned_dashboard = :dash';
            $paramsDb['dash'] = $newDash;
        }
        if (isset($body['status']) && in_array($body['status'], ['active', 'suspended'], true)) {
            if ($body['status'] !== $existing['status']) {
                $securitySensitiveChanged = true;
            }
            $updates[] = 'status = :st';
            $paramsDb['st'] = $body['status'];
        }
        if (!empty($body['full_name'])) {
            $updates[] = 'full_name = :fn';
            $paramsDb['fn'] = trim((string)$body['full_name']);
        }
        if (!empty($body['phone_number'])) {
            $updates[] = 'phone_number = :pn';
            $paramsDb['pn'] = trim((string)$body['phone_number']);
            $updates[] = 'phone_normalized = :pnorm';
            $paramsDb['pnorm'] = ReferralEngineService::normalizePhone((string)$body['phone_number']) ?: null;
        }

        $rawPerms = $body['permissions'] ?? ($body['assigned_permissions'] ?? null);
        $cleanPerms = null;
        if (is_array($rawPerms)) {
            $effectiveRole = $paramsDb['r'] ?? $existing['role'];
            $cleanPerms = ($effectiveRole === 'superadmin')
                ? ['*']
                : array_values(array_intersect(DashboardConfigService::ALLOWED_PERMISSIONS, array_map('strval', $rawPerms)));
            $permsJson = json_encode($cleanPerms);
            $updates[] = 'assigned_permissions = :perms';
            $paramsDb['perms'] = $permsJson;
            $securitySensitiveChanged = true;
        }

        if (!empty($updates)) {
            $updates[] = 'updated_at = NOW()';
            $this->db->execute('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id', $paramsDb);
            if ($cleanPerms !== null) {
                $this->db->execute(
                    'INSERT INTO user_profiles (user_id, assigned_permissions, created_at, updated_at)
                     VALUES (:uid, :perms, NOW(), NOW())
                     ON DUPLICATE KEY UPDATE assigned_permissions = :perms2, updated_at = NOW()',
                    ['uid' => $id, 'perms' => json_encode($cleanPerms), 'perms2' => json_encode($cleanPerms)]
                );
            }
            if ($securitySensitiveChanged) {
                Auth::revokeAllUserSessions($id, 'staff_role_or_permissions_updated', true);
            }
        }

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "STAFF_UPDATED", :det, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $super['id'],
                'email' => $super['email'],
                'det' => json_encode(['staff_id' => $id, 'staff_email' => $existing['email'], 'changes' => array_keys($body)]),
                'ip' => $request->getIp(),
            ]
        );

        $updated = $this->db->fetchOne('SELECT id, email, full_name, phone_number, role, assigned_dashboard, status, assigned_permissions FROM users WHERE id = :id', ['id' => $id]);
        if ($updated) {
            $rNorm = DashboardConfigService::normalizeRole((string)$updated['role']);
            $updated['role'] = $rNorm;
            $decoded = is_string($updated['assigned_permissions'] ?? null) ? json_decode($updated['assigned_permissions'], true) : [];
            $updated['permissions'] = ($rNorm === 'superadmin') ? ['*'] : ((is_array($decoded) && !empty($decoded)) ? $decoded : DashboardConfigService::getDefaultPermissionsForRole($rNorm));
            $updated['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey($updated['assigned_dashboard'] ?? null, $rNorm);
            unset($updated['assigned_permissions']);
        }
        Response::success(['staff' => $updated], 'Staff account updated');
    }

    // =========================================================================
    // 21. AUDIT LOGS
    // =========================================================================
    public function auditLogs(Request $request): void
    {
        Auth::requirePermission($request, 'audit');
        $search = trim((string)$request->query('search', ''));
        $action = trim((string)$request->query('action', ''));
        $limit = min(200, max(1, (int)$request->query('limit', 50)));

        $whereSql = 'WHERE 1=1 ';
        $params = [];

        if (!empty($search)) {
            $whereSql .= 'AND (user_email LIKE :s1 OR action LIKE :s2 OR ip_address LIKE :s3) ';
            $params['s1'] = "%{$search}%";
            $params['s2'] = "%{$search}%";
            $params['s3'] = "%{$search}%";
        }
        if (!empty($action) && $action !== 'all') {
            $whereSql .= 'AND action = :act ';
            $params['act'] = $action;
        }

        $idRows = $this->db->fetchAll(
            'SELECT id FROM audit_logs ' . $whereSql . 'ORDER BY created_at DESC LIMIT ' . (int)$limit,
            $params
        );
        $logs = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $aid) {
                    $ph = ':al_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['al_' . $idx] = $aid;
                }
                $logs = $this->db->fetchAll(
                    'SELECT * FROM audit_logs WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($logs, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }

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
        Auth::requirePermission($request, 'kyc');
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
        $whereSql = '';
        if (!empty($conds)) {
            $whereSql = 'WHERE ' . implode(' AND ', $conds) . ' ';
        }

        $idRows = $this->db->fetchAll(
            'SELECT k.id FROM kyc_submissions k LEFT JOIN users u ON u.id = k.user_id ' . $whereSql . 'ORDER BY k.created_at DESC LIMIT 100',
            $params
        );
        $rows = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $kid) {
                    $ph = ':kyc_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['kyc_' . $idx] = $kid;
                }
                $rows = $this->db->fetchAll(
                    'SELECT k.*, u.full_name as user_name, u.email as user_email, u.phone_number,
                            COALESCE(u.kyc_level, u.tier, 1) as current_tier
                     FROM kyc_submissions k
                     LEFT JOIN users u ON u.id = k.user_id
                     WHERE k.id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($rows, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }
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
        Auth::requirePermission($request, 'kyc');
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
        $admin = Auth::requirePermission($request, 'kyc');
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
            // Best-effort automatic Paystack DVA provisioning when customer reaches KYC Tier 2+
            try {
                $promotedUser = $this->db->fetchOne('SELECT * FROM users WHERE id = :uid LIMIT 1', ['uid' => $sub['user_id']]);
                if ($promotedUser && !empty($promotedUser['email_verified'])) {
                    (new WalletController())->requestPaystackDvaForUser($promotedUser);
                }
            } catch (Throwable) {
            }
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

        try {
            $cust = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :uid', ['uid' => $sub['user_id']]);
            if ($cust && !empty($cust['email'])) {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($cust['full_name'] ?: 'Valued Customer'), ENT_QUOTES, 'UTF-8');
                $safeMsg = htmlspecialchars($notifMsg, ENT_QUOTES, 'UTF-8');
                $color = ($action === 'approve') ? '#059669' : (($action === 'request_info') ? '#d97706' : '#dc2626');
                $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    . "<h2 style='margin:0 0 12px;color:{$color};'>{$notifTitle}</h2>"
                    . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                    . "<p style='color:#334155;'>{$safeMsg}</p>"
                    . "<p style='color:#64748b;font-size:12px;margin-top:20px;'>Log into your HAMBAKTECH portal under Identity &amp; KYC for details.</p></div>";
                $mailer->send((string)$cust['email'], (string)($cust['full_name'] ?: 'Customer'), "{$notifTitle} — HAMBAKTECH", $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'KYC_SUBMISSION_REVIEW_EMAIL']);
            }
        } catch (Throwable) {
        }

        $updated = $this->db->fetchOne('SELECT * FROM kyc_submissions WHERE id = :id', ['id' => $id]);
        Response::success(['submission' => $updated], "KYC submission marked as {$newStatus}");
    }

    public function autoVerifyKycSubmission(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'kyc');
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
        $providerName = strtolower(trim((string)($activeSetting['setting_value'] ?? '2sureverify')));
        $veripine = new VeripineAdapter();
        $twosure = new TwoSureVerifyAdapter();
        $order = ($providerName === 'veripine') ? ['veripine', '2sureverify'] : ['2sureverify', 'veripine'];

        $providerRes = null;
        foreach ($order as $candProv) {
            if ($candProv === '2sureverify' && $twosure->hasCredentials()) {
                $attempt = $twosure->verify(
                    $nin !== '' ? 'api/v1/nin_v1.php' : 'api/v1/bvn_v1.php',
                    $nin !== '' ? ['nin' => $nin, 'slip_type' => 'ninStandard'] : ['bvn' => $bvn, 'slip_type' => 'bvnBasic']
                );
            } elseif ($candProv === 'veripine' && $veripine->hasCredentials()) {
                $attempt = $veripine->verify(
                    $nin !== '' ? '/nin-verification' : '/bvn-verification',
                    $nin !== '' ? ['nin' => $nin] : ['bvn' => $bvn]
                );
            } else {
                continue;
            }
            $isAttemptOk = !empty($attempt['success']) || (($attempt['status'] ?? '') === 'success');
            if ($isAttemptOk) {
                $providerName = $candProv;
                $providerRes = $attempt;
                break;
            }
            $providerRes = $providerRes ?? $attempt;
        }

        $isOk = is_array($providerRes) && (!empty($providerRes['success']) || (($providerRes['status'] ?? '') === 'success'));
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
        Auth::requirePermission($request, 'security');
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
                ['sec_nin', 'nin_v1', 'NIN Verification Standard', 'identity', 1, 1, 100000.00, 1],
                ['sec_nin_v2', 'nin_v2', 'NIN Verification V2', 'identity', 1, 1, 100000.00, 1],
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
        $admin = Auth::requireSuperAdmin($request);
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

        // 1. Create an encrypted AES-256-GCM database backup first (never plaintext SQL)
        require_once HAMBAKTECH_ROOT . '/database/backup.php';
        $backupDir = HAMBAKTECH_ROOT . '/storage/backups';
        \HambakTech\Database\BackupManager::ensureBackupDirProtection($backupDir);
        $backupFilename = 'hambaktech_backup_pre_cleanup_' . date('Ymd_His') . '.sql.enc';
        $backupFile = $backupDir . '/' . $backupFilename;

        try {
            $bm = new \HambakTech\Database\BackupManager($this->db->getPdo());
            $ok = $bm->backup($backupFile, (string)$admin['email']);
            if (!$ok) {
                Response::error('Unable to write encrypted pre-cleanup backup. Cleanup aborted for safety.', 500);
                return;
            }
        } catch (Throwable $e) {
            Response::error('Encrypted backup creation failed (' . $e->getMessage() . '). Cleanup aborted for safety.', 500);
            return;
        }

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
            $this->db->execute(
                "DELETE FROM wallet_ledger WHERE user_id IN ($placeholders) OR wallet_id IN (SELECT id FROM wallets WHERE user_id IN ($placeholders))",
                array_merge($testUserIds, $testUserIds)
            );
            $this->db->execute("DELETE FROM wallets WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM manual_funding_requests WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM telecom_orders WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM verification_records WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM kyc_submissions WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM customer_virtual_accounts WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM payment_records WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM bulk_sms_records WHERE user_id IN ($placeholders)", $testUserIds);
            $this->db->execute("DELETE FROM customer_messages WHERE user_id IN ($placeholders)", $testUserIds);
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
        Auth::requirePermission($request, 'audit');
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

        $idRows = $this->db->fetchAll(
            "SELECT id FROM activity_footprints WHERE {$whereClause} ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}",
            $params
        );
        $rows = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $fid) {
                    $ph = ':fp_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['fp_' . $idx] = $fid;
                }
                $rows = $this->db->fetchAll(
                    'SELECT * FROM activity_footprints WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($rows, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }

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
        Auth::requirePermission($request, 'audit');
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

        $recentIdRows = $this->db->fetchAll('SELECT id FROM activity_footprints ORDER BY created_at DESC LIMIT 6');
        $recent = [];
        if (!empty($recentIdRows)) {
            $ids = array_values(array_filter(array_column($recentIdRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $fid) {
                    $ph = ':fpr_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['fpr_' . $idx] = $fid;
                }
                $recent = $this->db->fetchAll(
                    'SELECT * FROM activity_footprints WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($recent, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }
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
        Auth::requirePermission($request, 'audit');
        FootprintService::ensureTable();

        $category = trim((string)$request->query('category', ''));
        $status = trim((string)$request->query('status', ''));
        $search = trim((string)$request->query('search', ''));
        $startDate = trim((string)$request->query('start_date', ''));
        $endDate = trim((string)$request->query('end_date', ''));

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
        $exportIdRows = $this->db->fetchAll(
            "SELECT id FROM activity_footprints WHERE {$whereClause} ORDER BY created_at DESC LIMIT 2000",
            $params
        );
        $rows = [];
        if (!empty($exportIdRows)) {
            $ids = array_values(array_filter(array_column($exportIdRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $fid) {
                    $ph = ':fpe_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['fpe_' . $idx] = $fid;
                }
                $rows = $this->db->fetchAll(
                    'SELECT id, created_at, category, action, user_email, user_name, service_type, reference, provider, status, amount, ip_address, device_info, browser_info, error_message
                     FROM activity_footprints
                     WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($rows, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }

        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        $sanitizeCsv = static function (mixed $val): string {
            $str = (string)($val ?? '');
            if ($str !== '' && preg_match('/^[=+\-@\t\r]/', $str) === 1) {
                return "'" . $str;
            }
            return $str;
        };

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="hambaktech_footprints_' . date('Ymd_His') . '.csv"');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['ID', 'Timestamp', 'Category', 'Action', 'User Email', 'User Name', 'Service Type', 'Reference', 'Provider', 'Status', 'Amount (NGN)', 'IP Address', 'Device', 'Browser', 'Error']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $sanitizeCsv($r['id']),
                $sanitizeCsv($r['created_at']),
                $sanitizeCsv($r['category']),
                $sanitizeCsv($r['action']),
                $sanitizeCsv($r['user_email'] ?? 'N/A'),
                $sanitizeCsv($r['user_name'] ?? 'N/A'),
                $sanitizeCsv($r['service_type'] ?? 'N/A'),
                $sanitizeCsv($r['reference'] ?? 'N/A'),
                $sanitizeCsv($r['provider'] ?? 'N/A'),
                $sanitizeCsv($r['status']),
                $sanitizeCsv($r['amount'] ?? '0.00'),
                $sanitizeCsv($r['ip_address'] ?? 'N/A'),
                $sanitizeCsv($r['device_info'] ?? 'N/A'),
                $sanitizeCsv($r['browser_info'] ?? 'N/A'),
                $sanitizeCsv($r['error_message'] ?? ''),
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
        $admin = Auth::requirePermission($request, 'customers');

        $fullName = trim((string)$request->input('full_name', ''));
        $email = strtolower(trim((string)$request->input('email', '')));
        $phone = trim((string)($request->input('phone_number') ?? $request->input('phone', '')));
        $role = strtolower(trim((string)$request->input('role', 'customer')));
        $status = strtolower(trim((string)$request->input('status', 'active')));
        $tier = max(1, min(3, (int)$request->input('tier', 1)));
        $password = (string)$request->input('password', '');
        $initialBalance = max(0, (float)$request->input('initial_balance', 0));
        $notifyCustomer = (bool)$request->input('notify_customer', true);
        $referredByCode = strtoupper(trim((string)($request->input('referral_code') ?? $request->input('referred_by', ''))));
        $campaignCode = strtoupper(trim((string)$request->input('campaign_code', '')));

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

        if (!in_array($role, DashboardConfigService::ALL_ROLES, true)) {
            $role = 'customer';
        }
        if (in_array($role, Auth::CONSOLE_ROLES, true) && $admin['role'] !== 'superadmin') {
            Response::forbidden('Only a Super Admin can assign console or administrator roles.');
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
        if (in_array($role, ['customer', 'agent', 'student'], true) && $tier >= 2 && !$hasIdentityDocs) {
            Response::error('Providing Tier 2+ verified status requires an 11-digit NIN/BVN or official ID number.', 422);
        }

        // Duplicate checks including canonical normalized phone number
        $phoneNorm = ReferralEngineService::normalizePhone($phone);
        $existingEmail = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email', ['email' => $email]);
        if ($existingEmail) {
            Response::error('An account with this email address already exists.', 409);
        }

        $existingPhone = $this->db->fetchOne(
            'SELECT id FROM users WHERE phone_number = :phone OR (phone_normalized IS NOT NULL AND phone_normalized = :pnorm)',
            ['phone' => $phone, 'pnorm' => $phoneNorm ?: '__none__']
        );
        if ($existingPhone) {
            Response::error('An account with this phone number already exists.', 409);
        }

        $passwordAutoGenerated = empty($password);
        $effectivePassword = $passwordAutoGenerated ? bin2hex(random_bytes(32)) : $password;
        $setupOtp = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $setupToken = bin2hex(random_bytes(24));

        $refEngine = new ReferralEngineService($this->db);
        $userId = Security::generateUuid();
        $kycId = Security::generateUuid();
        $dbRole = $role;
        $rawDashboard = strtolower(trim((string)$request->input('assigned_dashboard', '')));
        $assignedDashboard = DashboardConfigService::normalizeDashboardKey($rawDashboard !== '' ? $rawDashboard : null, $dbRole);
        $rawPerms = $request->input('permissions', $request->input('assigned_permissions', null));
        if ($dbRole === 'superadmin') {
            $cleanPerms = ['*'];
        } elseif ($admin['role'] === 'superadmin' && is_array($rawPerms)) {
            $cleanPerms = array_values(array_intersect(DashboardConfigService::ALLOWED_PERMISSIONS, array_map('strval', $rawPerms)));
        } elseif (Auth::isConsoleRole($dbRole)) {
            $cleanPerms = DashboardConfigService::getDefaultPermissionsForRole($dbRole);
        } else {
            $cleanPerms = [];
        }
        $assignedPermsJson = json_encode($cleanPerms);
        $dbStatus = ($status === 'suspended') ? 'suspended' : 'active';
        $emailVerified = ($status === 'active') ? 1 : 0;
        $kycStatus = ($tier >= 2) ? 'verified' : ($hasIdentityDocs ? 'pending' : 'unverified');
        $passwordHash = Security::hashPassword($effectivePassword);
        $referralCode = $refEngine->generateUniqueCode();

        $this->db->withTransaction(function (Database $db) use (
            $userId, $kycId, $email, $passwordHash, $fullName, $phone, $phoneNorm, $dbRole, $assignedDashboard, $assignedPermsJson, $dbStatus, $tier, $kycStatus,
            $referralCode, $emailVerified, $initialBalance, $admin,
            $dateOfBirth, $residentialAddress, $state, $lga, $nin, $bvn, $idType, $idNumber
        ) {
            // 1. Create User
            $db->execute(
                'INSERT INTO users (id, email, password_hash, full_name, phone_number, phone_normalized, role, assigned_dashboard, assigned_permissions, kyc_status, tier, referral_code, status, email_verified, created_at)
                 VALUES (:id, :email, :pass, :name, :phone, :pnorm, :role, :dash, :perms, :ks, :tier, :ref, :st, :ev, NOW())',
                [
                    'id' => $userId,
                    'email' => $email,
                    'pass' => $passwordHash,
                    'name' => $fullName,
                    'phone' => $phone,
                    'pnorm' => $phoneNorm ?: null,
                    'role' => $dbRole,
                    'dash' => $assignedDashboard,
                    'perms' => $assignedPermsJson,
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

        // 6B. Optional referral attribution for admin-created customer
        if ($referredByCode !== '' && $dbRole === 'customer') {
            try {
                $refEngine->bindReferralOnSignup(
                    $userId,
                    $email,
                    $phone,
                    $referredByCode,
                    'admin_create',
                    $campaignCode !== '' ? $campaignCode : null,
                    $request->getIp(),
                    (string)($request->header('User-Agent') ?? '')
                );
            } catch (Throwable $e) {
                error_log('[createCustomer Referral Bind Error] ' . $e->getMessage());
            }
        }

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
            $mailService->send($adminEmail, 'Administrator', "[HAMBAKTECH] New Customer Provisioned (KYC Level {$tier}): {$fullName}", $adminAlertHtml, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'ADMIN_NEW_CUSTOMER_ALERT']);
        } catch (Throwable $e) {
            error_log('[createCustomer Admin Email Error] ' . $e->getMessage());
        }

        // Create one-time password setup token (valid 24 hours) whenever password wasn't explicitly set, or to allow immediate self-service password setup without exposing plaintext passwords
        $setupTokenPersisted = false;
        try {
            $this->db->execute('DELETE FROM password_resets WHERE email = :email', ['email' => strtolower($email)]);
            $this->db->execute(
                'INSERT INTO password_resets (id, email, otp_code, token, attempts, is_used, expires_at, created_at)
                 VALUES (:id, :email, :otp, :tok, 0, 0, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())',
                [
                    'id' => Security::generateUuid(),
                    'email' => strtolower($email),
                    'otp' => $setupOtp,
                    'tok' => $setupToken,
                ]
            );
            $setupTokenPersisted = true;
        } catch (Throwable $e) {
            error_log('[createCustomer Password Setup Token Error] ' . $e->getMessage());
        }

        if ($notifyCustomer) {
            try {
                $mailService = new MailService();
                $safeCustomerName = htmlspecialchars($fullName, ENT_QUOTES, 'UTF-8');
                $credentialNoticeHtml = $passwordAutoGenerated
                    ? "<p style='margin: 8px 0;'>For your security, temporary passwords are never emailed in plaintext.</p>
                       <p style='margin: 4px 0;'><strong>One-Time Password Setup Code (valid 24h):</strong> <code style='background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;'>{$setupOtp}</code></p>
                       <p style='font-size: 13px; color: #334155;'>Open the portal sign-in page, click <strong>Forgot / Set Password</strong>, enter your email and the 6-digit setup code above to choose your private password.</p>"
                    : "<p style='margin: 8px 0;'>Your account password was configured during onboarding. Please sign in and update your password immediately if needed.</p>";
                $body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;'>
                    <h2 style='color: #1d4ed8;'>Welcome to HAMBAKTECH Enterprise</h2>
                    <p>Dear <strong>{$safeCustomerName}</strong>,</p>
                    <p>Your enterprise customer account has been created by our administration team.</p>
                    <div style='background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;'>
                        <p style='margin: 4px 0;'><strong>Login Email:</strong> {$email}</p>
                        {$credentialNoticeHtml}
                        <p style='margin: 4px 0;'><strong>Account Tier:</strong> KYC Level {$tier} ({$kycStatus})</p>
                        <p style='margin: 4px 0;'><strong>Initial Wallet Balance:</strong> ₦" . number_format($initialBalance, 2) . "</p>
                    </div>
                    <p><a href='https://hambaktech.com.ng/#login' style='display: inline-block; padding: 10px 20px; background: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;'>Open HambakTech Portal</a></p>
                    <p style='font-size: 12px; color: #64748b; margin-top: 24px;'>Never share your password or setup code with anyone.</p>
                </div>";
                $mailService->send($email, $fullName, 'Welcome to HAMBAKTECH — Complete Your Account Setup', $body, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'ADMIN_CUSTOMER_WELCOME_EMAIL']);
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
            ['created_email' => $email, 'role' => $dbRole, 'tier' => $tier, 'kyc_status' => $kycStatus, 'password_setup_token_issued' => $setupTokenPersisted],
            $request->getIp()
        );

        $created = $this->hydrateCustomerRow($userId);
        if ($created) {
            $created['password_setup_required'] = $passwordAutoGenerated;
            $created['setup_token_issued'] = $setupTokenPersisted;
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
        $admin = Auth::requirePermission($request, 'cms');

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
        $admin = Auth::requirePermission($request, 'cms');

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


    /**
     * GET /api/admin/dashboard-configs
     */
    public function dashboardConfigs(Request $request): void
    {
        Auth::requireAnyPermission($request, ['settings', 'staff']);
        Response::success([
            'configs' => DashboardConfigService::listAllConfigs($this->db),
            'dashboards' => DashboardConfigService::getDashboardsCatalog(),
            'roles' => DashboardConfigService::getRolesCatalog(),
        ]);
    }

    /**
     * PUT /api/admin/dashboard-configs/:role
     */
    public function saveDashboardConfigDraft(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'settings');
        $key = DashboardConfigService::normalizeDashboardKey((string)($params['role'] ?? 'customer'), 'customer');
        $body = $request->getBody();
        $payload = isset($body['config']) && is_array($body['config']) ? $body['config'] : $body;

        $record = DashboardConfigService::saveDraft($this->db, $key, $payload, (string)$actor['email']);

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "DASHBOARD_CONFIG_DRAFT_SAVED", :meta, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $actor['id'],
                'email' => $actor['email'],
                'meta' => json_encode(['dashboard_key' => $key]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'record' => $record,
            'configs' => DashboardConfigService::listAllConfigs($this->db),
        ], "Draft configuration saved for {$record['name']}.");
    }

    /**
     * POST /api/admin/dashboard-configs/:role/publish
     */
    public function publishDashboardConfig(Request $request, array $params): void
    {
        $actor = Auth::requirePermission($request, 'settings');
        $key = DashboardConfigService::normalizeDashboardKey((string)($params['role'] ?? 'customer'), 'customer');
        $body = $request->getBody();
        $optionalPayload = isset($body['config']) && is_array($body['config']) ? $body['config'] : (isset($body['modules']) ? $body : null);

        $record = DashboardConfigService::publish($this->db, $key, (string)$actor['email'], $optionalPayload);

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "DASHBOARD_CONFIG_PUBLISHED", :meta, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $actor['id'],
                'email' => $actor['email'],
                'meta' => json_encode(['dashboard_key' => $key]),
                'ip' => $request->getIp(),
            ]
        );
        FootprintService::record(
            'admin',
            'DASHBOARD_CONFIG_PUBLISHED',
            $actor,
            'dashboard_management',
            $key,
            null,
            'successful',
            null,
            null,
            ['dashboard_key' => $key],
            $request->getIp()
        );

        Response::success([
            'record' => $record,
            'configs' => DashboardConfigService::listAllConfigs($this->db),
        ], "{$record['name']} published live to users.");
    }

    /**
     * GET|POST /api/admin/dashboard-preview
     * Allows admin/superadmin to safely preview any role dashboard without changing accounts or credentials.
     */
    public function previewDashboard(Request $request): void
    {
        $actor = Auth::requireAuth($request);
        if (!in_array($actor['role'] ?? '', ['admin', 'superadmin'], true) && !Auth::hasPermission($actor, 'settings') && !Auth::hasPermission($actor, 'staff')) {
            Response::forbidden('Administrative preview permission required.');
        }
        $rawTarget = (string)($request->input('dashboard') ?? $request->input('role') ?? $request->query('dashboard') ?? $request->query('role') ?? 'customer');
        $mode = strtolower(trim((string)($request->input('mode') ?? $request->query('mode') ?? 'published')));
        if ($mode !== 'draft') {
            $mode = 'published';
        }

        $targetRole = DashboardConfigService::normalizeRole($rawTarget);
        $targetDashboard = DashboardConfigService::normalizeDashboardKey($rawTarget, $targetRole);
        $config = DashboardConfigService::getConfig($this->db, $targetDashboard, $mode);

        $academyPreview = null;
        if ($targetDashboard === 'student') {
            try {
                \HambakTech\Services\AcademyService::ensureSeeded($this->db);
                $courses = $this->db->fetchAll('SELECT id, title, category, level, duration, price FROM academy_courses WHERE status != "draft" ORDER BY display_order ASC LIMIT 6');
                $sampleStudent = $this->db->fetchOne('SELECT student_id, full_name, academic_status, enrollment_date, id_card_issued_at FROM academy_students ORDER BY created_at DESC LIMIT 1');
                $coursesCountRow = $this->db->fetchOne('SELECT COUNT(*) as c FROM academy_courses WHERE status != "draft"');
                $enrollCountRow = $this->db->fetchOne('SELECT COUNT(*) as c FROM academy_students');
                $sampleStudents = $this->db->fetchAll('SELECT student_id, full_name, academic_status, enrollment_date, id_card_issued_at FROM academy_students ORDER BY created_at DESC LIMIT 3');
                $academyPreview = [
                    'courses_count' => (int)($coursesCountRow['c'] ?? count($courses)),
                    'enrollments_count' => (int)($enrollCountRow['c'] ?? count($sampleStudents)),
                    'courses' => $courses,
                    'sample_student' => $sampleStudent ?: null,
                    'sample_students' => $sampleStudents,
                ];
            } catch (Throwable) {
            }
        }

        $meta = ['target_role' => $targetRole, 'target_dashboard' => $targetDashboard, 'mode' => $mode];
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "ADMIN_DASHBOARD_PREVIEW", :meta, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $actor['id'],
                'email' => $actor['email'],
                'meta' => json_encode($meta),
                'ip' => $request->getIp(),
            ]
        );
        FootprintService::record(
            'admin',
            'ADMIN_DASHBOARD_PREVIEW',
            $actor,
            'dashboard_preview',
            $targetDashboard,
            null,
            'successful',
            null,
            null,
            $meta,
            $request->getIp()
        );

        $previewPayload = [
            'target_role' => $targetRole,
            'target_dashboard' => $targetDashboard,
            'category' => $config['category'] ?? (in_array($targetDashboard, ['customer', 'student', 'agent'], true) ? 'portal' : 'console'),
            'mode' => $mode,
            'config' => $config,
            'academy_preview' => $academyPreview,
        ];
        Response::success(array_merge([
            'preview' => $previewPayload,
        ], $previewPayload));
    }
}
