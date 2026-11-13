<?php
/**
 * @file CustomerController.php
 * Customer Dashboard Aggregator, Security, KYC, Documents, Store, Academy & Messages Controller
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\AnnouncementEmailService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;
use HambakTech\Adapters\Verification\VeripineAdapter;

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

        $emailSvc = new AnnouncementEmailService($this->db);
        $emailSvc->ensureSchema();
        $rawAnnouncements = $this->db->fetchAll(
            'SELECT id, title, content, category, target_audience, target_user_id, is_pinned, status, created_at
             FROM announcements
             WHERE status = "published"
             ORDER BY is_pinned DESC, created_at DESC LIMIT 20'
        );
        $announcements = array_slice(
            array_values(array_filter($rawAnnouncements, fn($a) => AnnouncementEmailService::isVisibleToUser($a, $user))),
            0,
            3
        );

        Response::success([
            'wallet' => $summary,
            'recent_transactions' => $recentTransactions,
            'recent_orders' => $recentOrders,
            'notifications' => $notifications,
            'announcements' => $announcements,
        ]);
    }

    /**
     * GET /api/customer/summary
     */
    public function summary(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $walletSummary = $this->walletService->getSummary($user['id']);

        $ordersCountRow = $this->db->fetchOne(
            'SELECT COUNT(*) as cnt FROM telecom_orders WHERE user_id = :uid',
            ['uid' => $user['id']]
        );
        $verifCountRow = $this->db->fetchOne(
            'SELECT COUNT(*) as cnt FROM verification_records WHERE user_id = :uid',
            ['uid' => $user['id']]
        );
        $unreadRow = $this->db->fetchOne(
            'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = :uid AND is_read = 0',
            ['uid' => $user['id']]
        );

        $recentTxns = $this->db->fetchAll(
            'SELECT id, type, amount, category, reference, status, description, created_at
             FROM transactions
             WHERE user_id = :uid
             ORDER BY created_at DESC LIMIT 8',
            ['uid' => $user['id']]
        );

        $recentActivities = [];
        foreach ($recentTxns as $tx) {
            $recentActivities[] = [
                'id' => $tx['id'],
                'category' => (string)($tx['category'] ?? 'wallet'),
                'type' => (string)($tx['type'] ?? 'debit'),
                'title' => (string)($tx['description'] ?: ucfirst((string)$tx['category'])),
                'amount' => (float)$tx['amount'],
                'status' => (string)($tx['status'] ?? 'successful'),
                'timestamp' => (string)$tx['created_at'],
            ];
        }

        $recentOrders = $this->db->fetchAll(
            'SELECT id, service_type, service_type as service, network, phone, phone as recipient, plan, amount, status, created_at
             FROM telecom_orders
             WHERE user_id = :uid
             ORDER BY created_at DESC LIMIT 8',
            ['uid' => $user['id']]
        );
        foreach ($recentOrders as &$o) {
            $o['amount'] = (float)$o['amount'];
        }

        $recentVerifications = $this->db->fetchAll(
            'SELECT id, type, service_key, search_value, cost, status, reference, slip_type, has_slip, created_at
             FROM verification_records
             WHERE user_id = :uid
             ORDER BY created_at DESC LIMIT 8',
            ['uid' => $user['id']]
        );
        foreach ($recentVerifications as &$v) {
            $v['cost'] = (float)$v['cost'];
            $v['has_slip'] = (bool)$v['has_slip'];
        }

        $notifications = $this->db->fetchAll(
            'SELECT id, title, message, type, is_read as `read`, action_link, created_at
             FROM notifications
             WHERE user_id = :uid
             ORDER BY created_at DESC LIMIT 15',
            ['uid' => $user['id']]
        );
        foreach ($notifications as &$n) {
            $n['read'] = (bool)$n['read'];
        }

        $emailSvcSummary = new AnnouncementEmailService($this->db);
        $emailSvcSummary->ensureSchema();
        $rawAnnouncements = $this->db->fetchAll(
            'SELECT id, title, content, category, target_audience, target_user_id, is_pinned, status, created_at
             FROM announcements
             WHERE status = "published"
             ORDER BY is_pinned DESC, created_at DESC LIMIT 20'
        );
        $announcements = array_slice(
            array_values(array_filter($rawAnnouncements, fn($a) => AnnouncementEmailService::isVisibleToUser($a, $user))),
            0,
            5
        );

        $bankName = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_bank"');
        $accNum = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_account_number"');
        $accName = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_account_name"');

        Response::success([
            'user' => $user,
            'metrics' => [
                'wallet_balance' => (float)$walletSummary['balance'],
                'total_transactions' => (int)$walletSummary['total_transactions'],
                'successful_transactions' => (int)$walletSummary['successful_count'],
                'pending_transactions' => (int)$walletSummary['pending_count'],
                'failed_transactions' => (int)$walletSummary['failed_count'],
                'total_funded' => (float)$walletSummary['total_funded'],
                'total_spent' => (float)$walletSummary['total_spent'],
                'total_orders' => (int)($ordersCountRow['cnt'] ?? 0),
                'total_verifications' => (int)($verifCountRow['cnt'] ?? 0),
                'unread_notifications_count' => (int)($unreadRow['cnt'] ?? 0),
            ],
            'recent_activities' => $recentActivities,
            'recent_orders' => $recentOrders,
            'recent_verifications' => $recentVerifications,
            'notifications' => $notifications,
            'announcements' => $announcements,
            'bank_details' => [
                'bank' => $bankName['setting_value'] ?? 'Moniepoint MFB',
                'accountNumber' => $accNum['setting_value'] ?? '5210471634',
                'accountName' => $accName['setting_value'] ?? 'Hambaktech_Services',
            ],
        ]);
    }

    /**
     * PUT /api/customer/pin
     */
    public function updatePin(Request $request): void
    {
        $authController = new AuthController();
        $authController->setPin($request);
    }

    /**
     * PUT /api/customer/preferences
     */
    public function updatePreferences(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $notifPrefs = $request->input('notification_preferences');
        $secSettings = $request->input('security_settings');

        $existing = $this->db->fetchOne(
            'SELECT notification_preferences, security_settings FROM user_profiles WHERE user_id = :uid',
            ['uid' => $user['id']]
        );

        $curNotif = !empty($existing['notification_preferences']) ? (json_decode((string)$existing['notification_preferences'], true) ?: []) : [];
        $curSec = !empty($existing['security_settings']) ? (json_decode((string)$existing['security_settings'], true) ?: []) : [];

        $mergedNotif = is_array($notifPrefs) ? array_merge($curNotif, $notifPrefs) : $curNotif;
        $mergedSec = is_array($secSettings) ? array_merge($curSec, $secSettings) : $curSec;

        $this->db->execute(
            'INSERT INTO user_profiles (user_id, notification_preferences, security_settings, updated_at)
             VALUES (:uid, :np, :ss, NOW())
             ON DUPLICATE KEY UPDATE notification_preferences = :np2, security_settings = :ss2, updated_at = NOW()',
            [
                'uid' => $user['id'],
                'np' => json_encode($mergedNotif),
                'ss' => json_encode($mergedSec),
                'np2' => json_encode($mergedNotif),
                'ss2' => json_encode($mergedSec),
            ]
        );

        $updated = Auth::user($request);
        Response::success(['user' => $updated], 'Preferences updated successfully.');
    }

    public function submitKyc(Request $request): void
    {
        $this->submitKycFull($request);
    }

    /**
     * GET /api/kyc/status
     */
    public function kycStatus(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $level = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);

        $tierCatalog = [
            1 => [
                'level' => 1,
                'name' => 'Tier 1 — Starter Identity',
                'daily_limit' => 50000,
                'description' => 'Basic email and phone verified wallet for airtime, data & standard VTU purchases.',
                'allowed_services' => ['airtime', 'data', 'cable', 'electricity', 'exam', 'nin_verification'],
            ],
            2 => [
                'level' => 2,
                'name' => 'Tier 2 — Verified Enterprise Agent',
                'daily_limit' => 500000,
                'description' => 'NIN/BVN verified tier enabling higher transaction volume, identity modifications & store orders.',
                'allowed_services' => ['airtime', 'data', 'cable', 'electricity', 'exam', 'nin_verification', 'bvn_verification', 'nin_modification', 'store', 'academy'],
            ],
            3 => [
                'level' => 3,
                'name' => 'Tier 3 — Sovereign Merchant',
                'daily_limit' => 5000000,
                'description' => 'Full identity & address verified tier with dedicated virtual account eligibility and maximum limits.',
                'allowed_services' => ['all'],
            ],
        ];

        $activeSubmission = null;
        try {
            $activeSubmission = $this->db->fetchOne(
                'SELECT * FROM kyc_submissions WHERE user_id = :uid ORDER BY COALESCE(submitted_at, created_at) DESC LIMIT 1',
                ['uid' => $user['id']]
            );
            if ($activeSubmission) {
                if (!empty($activeSubmission['automated_verification_result']) && is_string($activeSubmission['automated_verification_result'])) {
                    $decodedAuto = json_decode($activeSubmission['automated_verification_result'], true);
                    if (is_array($decodedAuto)) {
                        unset($decodedAuto['provider'], $decodedAuto['provider_id'], $decodedAuto['provider_cost'], $decodedAuto['endpoint'], $decodedAuto['api_url'], $decodedAuto['raw_error']);
                    }
                    $activeSubmission['automated_verification_result'] = $decodedAuto;
                }
                if (!empty($activeSubmission['review_history']) && is_string($activeSubmission['review_history'])) {
                    $activeSubmission['review_history'] = json_decode($activeSubmission['review_history'], true);
                }
                unset($activeSubmission['provider'], $activeSubmission['provider_id']);
            }
        } catch (Throwable) {
        }

        $va = null;
        try {
            $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid', ['uid' => $user['id']]);
        } catch (Throwable) {
        }

        $rules = [];
        try {
            $rules = $this->db->fetchAll('SELECT * FROM service_security_rules WHERE is_active = 1 ORDER BY name ASC');
            foreach ($rules as &$r) {
                $r['service_name'] = $r['service_name'] ?: $r['name'];
                $r['requires_pin'] = (bool)($r['requires_pin'] ?? $r['require_pin'] ?? true);
                $r['require_pin'] = $r['requires_pin'];
                $r['min_kyc_level'] = (int)($r['min_kyc_level'] ?? $r['min_tier'] ?? 1);
                $r['min_tier'] = $r['min_kyc_level'];
                $r['daily_limit'] = (float)($r['daily_limit'] ?? $r['max_daily_limit'] ?? 500000);
                $r['max_daily_limit'] = $r['daily_limit'];
            }
        } catch (Throwable) {
        }

        Response::success([
            'user' => $user,
            'level_info' => $tierCatalog[$level] ?? $tierCatalog[1],
            'active_submission' => $activeSubmission,
            'virtual_account' => $va ?: null,
            'rules' => $rules,
        ]);
    }

    /**
     * POST /api/kyc/submit & POST /api/customer/kyc-submit
     */
    public function submitKycFull(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $targetLevel = max(2, min(3, (int)$request->input('target_level', 2)));
        $fullLegalName = trim((string)$request->input('full_legal_name', $user['full_name'] ?? ''));
        $dob = trim((string)$request->input('date_of_birth', ''));
        $phone = trim((string)$request->input('phone_number', $user['phone_number'] ?? ''));
        $email = trim((string)$request->input('email', $user['email'] ?? ''));
        $resAddress = trim((string)($request->input('residential_address') ?? $request->input('address', '')));
        $state = trim((string)$request->input('state', ''));
        $lga = trim((string)$request->input('lga', ''));
        $nin = preg_replace('/\D/', '', (string)$request->input('nin', ''));
        $bvn = preg_replace('/\D/', '', (string)$request->input('bvn', ''));
        $idType = strtoupper(trim((string)$request->input('id_type', !empty($bvn) ? 'BVN' : 'NIN')));
        $idNumber = trim((string)$request->input('id_number', $nin ?: $bvn));
        $idDocUrl = trim((string)($request->input('id_document_url') ?? $request->input('doc_url', '')));
        $selfieUrl = trim((string)$request->input('selfie_url', ''));
        $poaUrl = trim((string)$request->input('proof_of_address_url', ''));
        $consent = (bool)$request->input('consent_obtained', true);
        $autoVerify = (bool)$request->input('auto_verify', false);

        if (empty($idNumber) && empty($nin) && empty($bvn)) {
            Response::error('Identification number (NIN or BVN) is required.', 422);
        }

        if ($idType === 'NIN' && empty($nin)) {
            $nin = preg_replace('/\D/', '', $idNumber);
        }
        if ($idType === 'BVN' && empty($bvn)) {
            $bvn = preg_replace('/\D/', '', $idNumber);
        }

        $kycId = Security::generateUuid();
        $status = 'pending';
        $instantVerified = false;
        $verifRef = null;
        $autoResult = null;

        // Genuine live provider check only if auto_verify is requested AND an upstream identity provider is configured
        if ($autoVerify && ($nin || $bvn)) {
            try {
                $veripine = new VeripineAdapter();
                $twoSure = new TwoSureVerifyAdapter();
                if ($veripine->hasCredentials()) {
                    $endpoint = $nin ? '/nin-verification' : '/bvn-verification';
                    $payload = $nin ? ['nin' => $nin] : ['bvn' => $bvn];
                    $res = $veripine->verify($endpoint, $payload);
                    if (!empty($res['success'])) {
                        $verifRef = $res['reference'] ?? null;
                        $autoResult = $res['data'] ?? $res;
                        if (is_array($autoResult)) {
                            unset($autoResult['provider'], $autoResult['provider_id'], $autoResult['provider_cost'], $autoResult['raw_error']);
                        }
                        $status = 'verified';
                        $instantVerified = true;
                    } else {
                        $autoResult = ['error' => $res['message'] ?? 'Automated verification check returned failure'];
                    }
                } else {
                    $endpoint = $nin ? 'verify-nin' : 'verify-bvn';
                    $payload = $nin ? ['nin' => $nin] : ['bvn' => $bvn];
                    $res = $twoSure->verify($endpoint, $payload);
                    if (!empty($res['success']) && empty($res['is_simulated'])) {
                        $verifRef = $res['reference'] ?? null;
                        $autoResult = $res['data'] ?? $res;
                        if (is_array($autoResult)) {
                            unset($autoResult['provider'], $autoResult['provider_id'], $autoResult['provider_cost'], $autoResult['raw_error']);
                        }
                        $status = 'verified';
                        $instantVerified = true;
                    } else {
                        $autoResult = ['error' => $res['message'] ?? 'Automated verification unavailable'];
                    }
                }
            } catch (Throwable $e) {
                $autoResult = ['error' => $e->getMessage()];
            }
        }

        $historyEntry = [[
            'action' => 'submitted',
            'status' => $status,
            'by' => $user['full_name'] ?? $user['email'],
            'notes' => $instantVerified ? 'Submitted and verified via live identity gateway.' : 'Submitted for compliance review.',
            'timestamp' => date('c'),
        ]];

        try {
            $this->db->execute(
                'INSERT INTO kyc_submissions
                 (id, user_id, target_level, verification_method, verification_reference, full_legal_name, date_of_birth,
                  phone_number, email, residential_address, state, lga, nin, bvn, id_type, id_number, doc_url,
                  id_document_url, selfie_url, proof_of_address_url, consent_obtained, consent_timestamp,
                  automated_verification_result, status, review_history, submitted_at, created_at)
                 VALUES
                 (:id, :uid, :lvl, :meth, :vref, :fname, :dob,
                  :phone, :email, :addr, :state, :lga, :nin, :bvn, :itype, :inum, :doc,
                  :idoc, :selfie, :poa, :cons, NOW(),
                  :autores, :st, :hist, NOW(), NOW())',
                [
                    'id' => $kycId,
                    'uid' => $user['id'],
                    'lvl' => $targetLevel,
                    'meth' => strtolower($idType),
                    'vref' => $verifRef,
                    'fname' => $fullLegalName,
                    'dob' => $dob ?: null,
                    'phone' => $phone,
                    'email' => $email,
                    'addr' => $resAddress,
                    'state' => $state,
                    'lga' => $lga,
                    'nin' => $nin ?: null,
                    'bvn' => $bvn ?: null,
                    'itype' => $idType,
                    'inum' => $idNumber,
                    'doc' => $idDocUrl,
                    'idoc' => $idDocUrl,
                    'selfie' => $selfieUrl ?: null,
                    'poa' => $poaUrl ?: null,
                    'cons' => $consent ? 1 : 0,
                    'autores' => $autoResult ? json_encode($autoResult) : null,
                    'st' => $status,
                    'hist' => json_encode($historyEntry),
                ]
            );
        } catch (Throwable) {
            $this->db->execute(
                'INSERT INTO kyc_submissions (id, user_id, id_type, id_number, doc_url, status, created_at)
                 VALUES (:id, :uid, :type, :num, :doc, :st, NOW())',
                [
                    'id' => $kycId,
                    'uid' => $user['id'],
                    'type' => $idType,
                    'num' => $idNumber,
                    'doc' => $idDocUrl,
                    'st' => $status,
                ]
            );
        }

        // Update user KYC status/tier if verified or pending
        if ($instantVerified) {
            try {
                $this->db->execute(
                    'UPDATE users SET kyc_status = "verified", tier = GREATEST(tier, :lvl), kyc_level = GREATEST(kyc_level, :lvl2), updated_at = NOW() WHERE id = :id',
                    ['lvl' => $targetLevel, 'lvl2' => $targetLevel, 'id' => $user['id']]
                );
            } catch (Throwable) {
                $this->db->execute(
                    'UPDATE users SET kyc_status = "verified", tier = GREATEST(tier, :lvl), updated_at = NOW() WHERE id = :id',
                    ['lvl' => $targetLevel, 'id' => $user['id']]
                );
            }
        } else {
            $this->db->execute(
                'UPDATE users SET kyc_status = "pending", updated_at = NOW() WHERE id = :id',
                ['id' => $user['id']]
            );
        }

        // Sync user_profiles
        try {
            $this->db->execute(
                'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, date_of_birth, updated_at)
                 VALUES (:uid, :nin, :bvn, :addr, :st, :lga, :dob, NOW())
                 ON DUPLICATE KEY UPDATE
                    nin = COALESCE(NULLIF(:nin2, ""), nin),
                    bvn = COALESCE(NULLIF(:bvn2, ""), bvn),
                    address = COALESCE(NULLIF(:addr2, ""), address),
                    state = COALESCE(NULLIF(:st2, ""), state),
                    lga = COALESCE(NULLIF(:lga2, ""), lga),
                    date_of_birth = COALESCE(NULLIF(:dob2, ""), date_of_birth),
                    updated_at = NOW()',
                [
                    'uid' => $user['id'],
                    'nin' => $nin ?: null,
                    'bvn' => $bvn ?: null,
                    'addr' => $resAddress ?: null,
                    'st' => $state ?: null,
                    'lga' => $lga ?: null,
                    'dob' => $dob ?: null,
                    'nin2' => $nin,
                    'bvn2' => $bvn,
                    'addr2' => $resAddress,
                    'st2' => $state,
                    'lga2' => $lga,
                    'dob2' => $dob,
                ]
            );
        } catch (Throwable) {
        }

        // Notify administrators
        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, NULL, :title, :msg, "info", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'title' => "KYC Submission: {$fullLegalName} (Tier {$targetLevel})",
                    'msg' => "Customer {$fullLegalName} submitted {$idType} KYC upgrade request. Status: {$status}.",
                ]
            );
        } catch (Throwable) {
        }

        $submission = $this->db->fetchOne('SELECT * FROM kyc_submissions WHERE id = :id', ['id' => $kycId]);
        if ($submission && !empty($submission['automated_verification_result']) && is_string($submission['automated_verification_result'])) {
            $decodedAuto = json_decode($submission['automated_verification_result'], true);
            if (is_array($decodedAuto)) {
                unset($decodedAuto['provider'], $decodedAuto['provider_id'], $decodedAuto['provider_cost'], $decodedAuto['raw_error']);
            }
            $submission['automated_verification_result'] = $decodedAuto;
        }
        $refreshedUser = Auth::user($request);

        Response::success([
            'submission_id' => $kycId,
            'submission' => $submission,
            'user' => $refreshedUser,
            'instant_verified' => $instantVerified,
            'verification_reference' => $verifRef,
        ], $instantVerified
            ? 'Your KYC submission was verified and your account tier has been upgraded!'
            : 'KYC submission received and queued for compliance review.');
    }

    /**
     * POST /api/kyc/authorize-purchase
     */
    public function authorizePurchase(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $serviceKey = trim((string)$request->input('service_key', ''));
        $amount = (float)$request->input('amount', 0);
        $pin = trim((string)$request->input('pin', ''));

        if (empty($serviceKey)) {
            Response::error('Service key is required for authorization.', 422);
        }

        $rule = null;
        try {
            $rule = $this->db->fetchOne(
                'SELECT * FROM service_security_rules WHERE service_key = :sk AND is_active = 1',
                ['sk' => $serviceKey]
            );
        } catch (Throwable) {
        }

        if (!$rule) {
            $rule = [
                'id' => 'default_' . $serviceKey,
                'service_key' => $serviceKey,
                'service_name' => ucwords(str_replace('_', ' ', $serviceKey)),
                'requires_pin' => true,
                'min_kyc_level' => 1,
                'daily_limit' => 500000.0,
            ];
        } else {
            $rule['service_name'] = $rule['service_name'] ?: $rule['name'];
            $rule['requires_pin'] = (bool)($rule['requires_pin'] ?? $rule['require_pin'] ?? true);
            $rule['min_kyc_level'] = (int)($rule['min_kyc_level'] ?? $rule['min_tier'] ?? 1);
            $rule['daily_limit'] = (float)($rule['daily_limit'] ?? $rule['max_daily_limit'] ?? 500000);
        }

        $userLevel = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        if ($userLevel < (int)$rule['min_kyc_level']) {
            Response::error("KYC Tier {$rule['min_kyc_level']} is required for this service. Please complete your Identity & KYC verification.", 403);
        }

        if ($amount > 0 && $amount > (float)$rule['daily_limit']) {
            Response::error("Transaction amount exceeds the service daily limit of ₦" . number_format((float)$rule['daily_limit'], 2) . ".", 403);
        }

        // Check PIN if required
        if (!empty($rule['requires_pin'])) {
            $pinRow = $this->db->fetchOne('SELECT transaction_pin_hash FROM users WHERE id = :id', ['id' => $user['id']]);
            $hash = $pinRow['transaction_pin_hash'] ?? null;
            if (empty($hash)) {
                Response::error('Transaction PIN not configured. Please set a 4-digit PIN under Security & PIN.', 400);
            }
            if (empty($pin) || !Security::verifyPin($pin, $hash)) {
                Response::error('Invalid transaction PIN.', 401);
            }
        }

        // Check wallet balance
        $summary = $this->walletService->getSummary($user['id']);
        $balance = (float)$summary['balance'];
        if ($amount > 0 && $balance < $amount) {
            Response::error('Insufficient wallet balance. Available: ₦' . number_format($balance, 2), 400);
        }

        Response::success([
            'authorized' => true,
            'balance_remaining' => max(0, $balance - $amount),
            'service_rule' => $rule,
        ], 'Transaction authorized.');
    }

    /**
     * GET /api/kyc/virtual-account
     */
    public function virtualAccount(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $currentLevel = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $va = null;
        try {
            $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid', ['uid' => $user['id']]);
        } catch (Throwable) {
        }

        Response::success([
            'virtual_account' => $va ?: null,
            'eligible' => $currentLevel >= 2,
            'required_level' => 2,
            'current_level' => $currentLevel,
            'message' => $va
                ? 'Dedicated virtual account active.'
                : ($currentLevel >= 2
                    ? 'You are eligible for virtual account provisioning. Dedicated NGN accounts are currently provisioned once regulatory partner onboarding finishes.'
                    : 'Upgrade to KYC Tier 2 to become eligible for a dedicated NGN virtual bank account.'),
        ]);
    }

    /**
     * POST /api/customer/upload
     */
    public function uploadDocument(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $docType = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$request->input('document_type', 'kyc_document')) ?: 'kyc_document';

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Valid file upload is required.', 422);
        }

        $file = $_FILES['file'];
        if ((int)$file['size'] > 5 * 1024 * 1024) {
            Response::error('Uploaded file must not exceed 5MB.', 422);
        }

        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Invalid file format. Allowed: JPG, PNG, WEBP, PDF.', 422);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!in_array($mime, $allowedMimes, true)) {
            Response::error('File content validation failed.', 422);
        }

        $storageDir = dirname(__DIR__) . '/storage/uploads';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
            @file_put_contents($storageDir . '/.htaccess', "Deny from all\n");
        }

        $docId = Security::generateUuid();
        $storedName = $docType . '_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $destPath = $storageDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to securely store uploaded document.', 500);
        }

        $fileUrl = '/api/customer/document/' . $docId;

        try {
            $this->db->execute(
                'INSERT INTO uploaded_documents (id, user_id, document_type, original_name, stored_name, mime_type, file_size, file_path, file_url, created_at)
                 VALUES (:id, :uid, :dtype, :oname, :sname, :mime, :sz, :fpath, :furl, NOW())',
                [
                    'id' => $docId,
                    'uid' => $user['id'],
                    'dtype' => $docType,
                    'oname' => (string)$file['name'],
                    'sname' => $storedName,
                    'mime' => $mime,
                    'sz' => (int)$file['size'],
                    'fpath' => $destPath,
                    'furl' => $fileUrl,
                ]
            );
        } catch (Throwable) {
        }

        Response::success([
            'id' => $docId,
            'file_url' => $fileUrl,
            'file_name' => (string)$file['name'],
        ], 'Document uploaded securely.');
    }

    /**
     * GET /api/customer/document/:id
     */
    public function getDocument(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $docId = trim((string)($params['id'] ?? ''));

        $doc = $this->db->fetchOne('SELECT * FROM uploaded_documents WHERE id = :id', ['id' => $docId]);
        if (!$doc) {
            Response::notFound('Document not found.');
        }

        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        if (!$isAdmin && $doc['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to document.');
        }

        $path = $doc['file_path'];
        if (!file_exists($path)) {
            Response::notFound('Document file missing on storage.');
        }

        header('Content-Type: ' . ($doc['mime_type'] ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . basename((string)$doc['original_name']) . '"');
        readfile($path);
        exit;
    }

    /**
     * GET /api/customer/store
     */
    public function storeItems(Request $request): void
    {
        Auth::requireAuth($request);
        $items = [];
        try {
            $items = $this->db->fetchAll('SELECT * FROM store_items WHERE status != "draft" ORDER BY created_at DESC');
            foreach ($items as &$item) {
                $item['price'] = (float)$item['price'];
                $item['stock'] = (int)$item['stock'];
            }
        } catch (Throwable) {
        }

        $settingRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "store_settings"');
        $settings = $settingRow ? (json_decode((string)$settingRow['setting_value'], true) ?: []) : [];

        Response::success([
            'items' => $items,
            'settings' => array_merge([
                'store_enabled' => true,
                'shipping_fee' => 2500,
                'free_shipping_threshold' => 100000,
                'support_phone' => '09127469686',
                'whatsapp_number' => '09155104724',
                'notice' => 'Hardware orders ship nationwide within 24–72 business hours.',
            ], $settings),
        ]);
    }

    /**
     * GET /api/customer/academy
     */
    public function academyCourses(Request $request): void
    {
        $ctrl = new \HambakTech\Controllers\AcademyController();
        $ctrl->customerAcademy($request);
    }

    /**
     * GET /api/customer/reports
     */
    public function reports(Request $request): void
    {
        $user = Auth::requireAuth($request);

        $txStats = $this->db->fetchOne(
            'SELECT
                COUNT(*) as total_txns,
                COALESCE(SUM(CASE WHEN type = "credit" AND status = "successful" THEN amount ELSE 0 END), 0) as total_credits,
                COALESCE(SUM(CASE WHEN type = "debit" AND status = "successful" THEN amount ELSE 0 END), 0) as total_debits
             FROM transactions WHERE user_id = :uid',
            ['uid' => $user['id']]
        );

        $telecomBreakdown = $this->db->fetchAll(
            'SELECT service_type as category, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
             FROM telecom_orders WHERE user_id = :uid AND status = "successful"
             GROUP BY service_type',
            ['uid' => $user['id']]
        );
        $verifStats = $this->db->fetchOne(
            'SELECT COUNT(*) as count, COALESCE(SUM(cost), 0) as volume
             FROM verification_records WHERE user_id = :uid AND status = "completed"',
            ['uid' => $user['id']]
        );

        $monthlySeries = $this->db->fetchAll(
            'SELECT DATE_FORMAT(created_at, "%Y-%m") as month,
                    COALESCE(SUM(CASE WHEN type = "credit" AND status = "successful" THEN amount ELSE 0 END), 0) as funded,
                    COALESCE(SUM(CASE WHEN type = "debit" AND status = "successful" THEN amount ELSE 0 END), 0) as spent
             FROM transactions WHERE user_id = :uid
             GROUP BY DATE_FORMAT(created_at, "%Y-%m")
             ORDER BY month DESC LIMIT 6',
            ['uid' => $user['id']]
        );

        $settingRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "reports_settings"');
        $settings = $settingRow ? (json_decode((string)$settingRow['setting_value'], true) ?: []) : [];

        Response::success([
            'settings' => array_merge([
                'csv_export_enabled' => true,
                'pdf_statement_enabled' => true,
                'retention_days' => 365,
            ], $settings),
            'analytics' => [
                'total_transactions' => (int)($txStats['total_txns'] ?? 0),
                'total_funded' => (float)($txStats['total_credits'] ?? 0),
                'total_spent' => (float)($txStats['total_debits'] ?? 0),
                'verifications_count' => (int)($verifStats['count'] ?? 0),
                'verifications_volume' => (float)($verifStats['volume'] ?? 0),
                'telecom_breakdown' => $telecomBreakdown,
                'monthly_series' => array_reverse($monthlySeries),
            ],
        ]);
    }

    /**
     * GET /api/customer/messages
     */
    public function messages(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $messages = [];
        try {
            $messages = $this->db->fetchAll(
                'SELECT * FROM customer_messages
                 WHERE user_id = :uid OR user_id = "all" OR user_id IS NULL
                 ORDER BY created_at DESC LIMIT 100',
                ['uid' => $user['id']]
            );
        } catch (Throwable) {
        }

        // Also include recent broadcasts targeting this user or all
        try {
            $broadcasts = $this->db->fetchAll(
                'SELECT id, title, message, type, status, created_at FROM broadcasts
                 WHERE (user_id = :uid OR target_role IN ("all", :role))
                 ORDER BY created_at DESC LIMIT 30',
                ['uid' => $user['id'], 'role' => $user['role'] ?? 'customer']
            );
            $existingIds = array_column($messages, 'id');
            foreach ($broadcasts as $b) {
                if (!in_array($b['id'], $existingIds, true)) {
                    $messages[] = [
                        'id' => $b['id'],
                        'user_id' => $user['id'],
                        'title' => $b['title'],
                        'message' => $b['message'],
                        'type' => $b['type'] ?: 'broadcast',
                        'is_read' => 0,
                        'created_at' => $b['created_at'],
                    ];
                }
            }
        } catch (Throwable) {
        }

        $unread = 0;
        foreach ($messages as &$m) {
            $m['is_read'] = (bool)($m['is_read'] ?? false);
            $m['read'] = $m['is_read'];
            if (!$m['is_read']) {
                $unread++;
            }
        }

        Response::success([
            'count' => count($messages),
            'unreadCount' => $unread,
            'messages' => $messages,
        ]);
    }

    /**
     * PUT /api/customer/messages/:id/read
     */
    public function markMessageRead(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = $params['id'] ?? '';
        try {
            $this->db->execute(
                'UPDATE customer_messages SET is_read = 1 WHERE id = :id AND (user_id = :uid OR user_id = "all")',
                ['id' => $id, 'uid' => $user['id']]
            );
        } catch (Throwable) {
        }
        Response::success(null, 'Message marked as read.');
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
        $unread = 0;
        foreach ($notifications as &$n) {
            $n['read'] = (bool)$n['read'];
            if (!$n['read']) {
                $unread++;
            }
        }
        Response::success([
            'notifications' => $notifications,
            'unread_count' => $unread,
        ]);
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

    /**
     * PUT /api/customer/notifications/read-all
     */
    public function markAllNotificationsRead(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $this->db->execute(
            'UPDATE notifications SET is_read = 1 WHERE user_id = :uid',
            ['uid' => $user['id']]
        );
        Response::success(null, 'All notifications marked as read');
    }

    public function tickets(Request $request): void
    {
        $support = new SupportController();
        $support->customerTickets($request);
    }

    public function createTicket(Request $request): void
    {
        $support = new SupportController();
        $support->createTicket($request);
    }

    public function ticketDetail(Request $request, array $params): void
    {
        $support = new SupportController();
        $support->getTicketDetails($request, $params);
    }

    public function replyTicket(Request $request, array $params): void
    {
        $support = new SupportController();
        $support->replyTicket($request, $params);
    }
}
