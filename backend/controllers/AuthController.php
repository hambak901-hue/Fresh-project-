<?php
/**
 * @file AuthController.php
 * Authentication and User Account Management Controller
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Core\SchemaSync;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Services\MfaService;
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Services\AcademyService;
use HambakTech\Services\DashboardConfigService;
use RuntimeException;
use Throwable;

class AuthController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
        SchemaSync::syncSecurityAndReferralSchema($this->db);
    }

    public function login(Request $request): void
    {
        $inputIdent = trim((string)$request->input('email', $request->input('identifier', '')));
        $password = (string)$request->input('password', '');

        if (empty($inputIdent) || empty($password)) {
            Response::error('Email/phone and password are required.', 422);
        }

        $email = strtolower($inputIdent);
        $phoneDigits = preg_replace('/[^0-9]/', '', $inputIdent);
        $normPhone = ReferralEngineService::normalizePhone($inputIdent);
        $ip = $request->getIp();

        // Enforce brute-force lockout protection on identifier or IP
        $secCfg = Auth::getSecuritySettings();
        $maxLoginAttempts = max(3, (int)($secCfg['login_max_attempts'] ?? 5));
        $lockoutMins = max(5, (int)($secCfg['login_lockout_minutes'] ?? 15));
        try {
            $lockRow = $this->db->fetchOne(
                'SELECT attempt_count, locked_until FROM login_attempts
                 WHERE identifier = :ident AND ip_address = :ip LIMIT 1',
                ['ident' => $email, 'ip' => $ip]
            );
            if ($lockRow && !empty($lockRow['locked_until']) && strtotime((string)$lockRow['locked_until']) > time()) {
                $minsLeft = max(1, (int)ceil((strtotime((string)$lockRow['locked_until']) - time()) / 60));
                Response::error(
                    "Too many unsuccessful sign-in attempts. For your security, login is temporarily locked for {$minsLeft} minute(s).",
                    429,
                    ['locked_minutes' => $minsLeft],
                    'LOGIN_RATE_LIMITED'
                );
            }
        } catch (Throwable) {
        }

        try {
            $user = $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth,
                        p.notification_preferences, p.security_settings, p.assigned_permissions AS profile_permissions
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE LOWER(u.email) = :email
                    OR u.phone_number = :ident
                    OR (:nphone != "" AND u.phone_normalized = :nphone2)
                    OR (:phone != "" AND REPLACE(REPLACE(REPLACE(u.phone_number, " ", ""), "-", ""), "+234", "0") = :phone)
                 ORDER BY (u.role = "superadmin") DESC, u.created_at ASC LIMIT 1',
                [
                    'email' => $email,
                    'ident' => $inputIdent,
                    'nphone' => $normPhone,
                    'nphone2' => $normPhone,
                    'phone' => $phoneDigits,
                ]
            );
        } catch (Throwable) {
            $user = $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE LOWER(u.email) = :email
                    OR u.phone_number = :ident
                    OR (:phone != "" AND REPLACE(REPLACE(REPLACE(u.phone_number, " ", ""), "-", ""), "+234", "0") = :phone)
                 ORDER BY (u.role = "superadmin") DESC, u.created_at ASC LIMIT 1',
                [
                    'email' => $email,
                    'ident' => $inputIdent,
                    'phone' => $phoneDigits,
                ]
            );
        }

        $recordAttempt = function (bool $ok) use ($email, $ip, $maxLoginAttempts, $lockoutMins): void {
            try {
                if ($ok) {
                    $this->db->execute(
                        'DELETE FROM login_attempts WHERE identifier = :ident AND ip_address = :ip',
                        ['ident' => substr($email, 0, 190), 'ip' => $ip]
                    );
                    return;
                }
                $existing = $this->db->fetchOne(
                    'SELECT id, attempt_count, last_attempt_at FROM login_attempts WHERE identifier = :ident AND ip_address = :ip LIMIT 1',
                    ['ident' => substr($email, 0, 190), 'ip' => $ip]
                );
                $stale = $existing && !empty($existing['last_attempt_at']) && strtotime((string)$existing['last_attempt_at']) < (time() - ($lockoutMins * 60));
                $nextCount = (!$existing || $stale) ? 1 : ((int)$existing['attempt_count'] + 1);
                $lockedUntil = $nextCount >= $maxLoginAttempts ? date('Y-m-d H:i:s', time() + ($lockoutMins * 60)) : null;

                if ($existing) {
                    $this->db->execute(
                        'UPDATE login_attempts SET attempt_count = :cnt, locked_until = :lu, last_attempt_at = NOW() WHERE id = :id',
                        ['cnt' => $nextCount, 'lu' => $lockedUntil, 'id' => $existing['id']]
                    );
                } else {
                    $this->db->execute(
                        'INSERT INTO login_attempts (id, identifier, ip_address, attempt_count, locked_until, last_attempt_at, created_at)
                         VALUES (:id, :ident, :ip, :cnt, :lu, NOW(), NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'ident' => substr($email, 0, 190),
                            'ip' => $ip,
                            'cnt' => $nextCount,
                            'lu' => $lockedUntil,
                        ]
                    );
                }
            } catch (Throwable) {
            }
        };

        if (!$user) {
            $recordAttempt(false);
            FootprintService::record('security', 'LOGIN_FAILED', null, null, null, null, 'failed', null, 'User identifier not found', ['identifier' => $inputIdent], $ip);
            Response::error('Invalid email or password.', 401);
        }

        $accountStatus = strtolower(trim((string)($user['status'] ?? 'active')));
        if ($accountStatus === 'suspended') {
            $recordAttempt(false);
            FootprintService::record('security', 'LOGIN_BLOCKED_SUSPENDED', ['id' => $user['id'], 'email' => $user['email']], null, null, null, 'failed', null, 'Account is suspended', null, $ip);
            Response::error('Your account is currently suspended. Please contact HambakTech Enterprise Support.', 403);
        }
        if ($accountStatus !== 'active') {
            $recordAttempt(false);
            FootprintService::record('security', 'LOGIN_BLOCKED_INACTIVE', ['id' => $user['id'], 'email' => $user['email']], null, null, null, 'failed', null, 'Account is ' . $accountStatus, null, $ip);
            Response::error('Your account is currently inactive. Please contact HambakTech Enterprise Support.', 403);
        }

        if (!Security::verifyPassword($password, $user['password_hash'], $user['email'])) {
            $recordAttempt(false);
            FootprintService::record('security', 'LOGIN_FAILED', ['id' => $user['id'], 'email' => $user['email']], null, null, null, 'failed', null, 'Invalid password attempt', null, $ip);
            Response::error('Invalid email or password.', 401);
        }

        // Record successful password authentication
        $recordAttempt(true);

        // Seamlessly upgrade legacy or non-standard hash to modern Bcrypt
        if (!str_starts_with($user['password_hash'], '$2y$12$')) {
            $newHash = Security::hashPassword($password);
            $this->db->execute('UPDATE users SET password_hash = :hash WHERE id = :id', ['hash' => $newHash, 'id' => $user['id']]);
        }

        // Check MFA requirement before issuing full session JWT
        $mfaService = new MfaService($this->db);
        $requiredMfaMethod = $mfaService->getRequiredMethodForUser($user);
        if ($requiredMfaMethod !== null) {
            $challenge = $mfaService->createChallenge(
                $user,
                $requiredMfaMethod,
                $ip,
                (string)($request->header('User-Agent') ?? '')
            );
            FootprintService::record(
                'auth',
                'MFA_CHALLENGE_ISSUED',
                ['id' => $user['id'], 'email' => $user['email'], 'full_name' => $user['full_name'] ?? 'User'],
                null,
                null,
                null,
                'pending',
                null,
                null,
                ['method' => $requiredMfaMethod, 'role' => $user['role']],
                $ip
            );
            Response::success([
                'mfa_required' => true,
                'challenge' => $challenge,
            ], 'Multi-factor verification required to complete login.');
            return;
        }

        $this->db->execute('UPDATE users SET last_login_at = NOW(), last_login_ip = :ip WHERE id = :id', [
            'ip' => $ip,
            'id' => $user['id'],
        ]);

        // Reconcile any unlinked Academy applications/students once email is verified (preserves non-customer roles)
        if (!empty($user['email_verified'])) {
            $reconcileRes = AcademyService::reconcileUserAcademyLinks($this->db, (string)$user['id'], (string)$user['email'], true);
            if (!empty($reconcileRes['role_upgraded'])) {
                $user['role'] = 'student';
                $user['assigned_dashboard'] = 'student';
            }
        }

        $token = Auth::generateToken($user, $request);
        $pinService = new PinSecurityService($this->db);

        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        $user['email_verified'] = (bool)($user['email_verified'] ?? false);
        $user['email_verification_required'] = (bool)($user['email_verification_required'] ?? false);
        $user['mfa_enabled'] = (bool)($user['mfa_enabled'] ?? false);
        $user['pin_is_locked'] = !empty($user['pin_locked_until']) && strtotime((string)$user['pin_locked_until']) > time();
        if (isset($user['notification_preferences']) && is_string($user['notification_preferences'])) {
            $user['notification_preferences'] = json_decode($user['notification_preferences'], true);
        }
        if (isset($user['security_settings']) && is_string($user['security_settings'])) {
            $user['security_settings'] = json_decode($user['security_settings'], true);
        }
        $perms = [];
        $hasExplicitPerms = false;
        foreach ([$user['assigned_permissions'] ?? null, $user['profile_permissions'] ?? null] as $rawP) {
            if (is_string($rawP) && trim($rawP) !== '') {
                $dp = json_decode($rawP, true);
                if (is_array($dp)) {
                    $perms = $dp;
                    $hasExplicitPerms = true;
                    break;
                }
            } elseif (is_array($rawP)) {
                $perms = $rawP;
                $hasExplicitPerms = true;
                break;
            }
        }
        $normalizedRole = DashboardConfigService::normalizeRole((string)($user['role'] ?? 'customer'));
        $user['role'] = $normalizedRole;
        $user['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey(
            $user['assigned_dashboard'] ?? null,
            $normalizedRole
        );

        if ($normalizedRole === 'superadmin') {
            $perms = ['*'];
        } elseif (!$hasExplicitPerms && Auth::isConsoleRole($normalizedRole)) {
            $perms = DashboardConfigService::getDefaultPermissionsForRole($normalizedRole);
        }
        $user['permissions'] = array_values(array_unique($perms));
        $user['dashboard_config'] = DashboardConfigService::getConfig($this->db, (string)$user['assigned_dashboard'], 'published');
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance'], $user['assigned_permissions'], $user['profile_permissions']);

        $loginAction = match ($normalizedRole) {
            'superadmin' => 'SUPERADMIN_LOGIN',
            'admin' => 'ADMIN_LOGIN',
            'manager' => 'MANAGER_LOGIN',
            'support' => 'SUPPORT_LOGIN',
            'staff' => 'STAFF_LOGIN',
            'student' => 'STUDENT_LOGIN',
            'agent' => 'AGENT_LOGIN',
            default => 'CUSTOMER_LOGIN',
        };

        // Log audit event and activity footprint
        FootprintService::record(
            'auth',
            $loginAction,
            ['id' => $user['id'], 'email' => $user['email'], 'full_name' => $user['full_name'] ?? 'User'],
            null,
            null,
            null,
            'successful',
            null,
            null,
            ['role' => $user['role']],
            $ip
        );

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "USER_LOGIN", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'email' => $user['email'],
                'details' => json_encode(['role' => $user['role']]),
                'ip' => $ip,
            ]
        );

        Response::success([
            'user' => $user,
            'token' => $token,
            'pin_policy' => $pinService->getPublicPolicy(),
        ], 'Login successful');
    }

    public function register(Request $request): void
    {
        $authCfg = [];
        $webCfg = [];
        try {
            $rows = $this->db->fetchAll('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("auth_settings", "website_settings")');
            foreach ($rows as $sr) {
                $dec = json_decode((string)$sr['setting_value'], true);
                if (is_array($dec)) {
                    if ($sr['setting_key'] === 'auth_settings') $authCfg = $dec;
                    if ($sr['setting_key'] === 'website_settings') $webCfg = $dec;
                }
            }
        } catch (Throwable) {
        }

        if ((array_key_exists('allow_customer_registration', $authCfg) && !$authCfg['allow_customer_registration']) ||
            (array_key_exists('enable_registration', $webCfg) && !$webCfg['enable_registration'])) {
            Response::error('New customer registration is temporarily disabled by administrators.', 403);
        }

        $minPasswordLength = max(6, min(32, (int)($authCfg['min_password_length'] ?? 8)));

        $email = strtolower(trim((string)$request->input('email', '')));
        $password = (string)$request->input('password', '');
        $fullName = trim((string)$request->input('full_name', ''));
        $phoneNumber = trim((string)($request->input('phone_number') ?? $request->input('phone', '')));

        // Optional profile / KYC upgrade fields (not required for Level 1 registration)
        $dateOfBirth = trim((string)($request->input('date_of_birth') ?? $request->input('dob', '')));
        $residentialAddress = trim((string)($request->input('residential_address') ?? $request->input('address', '')));
        $state = trim((string)$request->input('state', ''));
        $lga = trim((string)$request->input('lga', ''));
        $idTypeRaw = strtolower(trim((string)$request->input('id_type', '')));
        $idNumber = trim((string)$request->input('id_number', ''));
        $nin = preg_replace('/\D/', '', (string)$request->input('nin', ''));
        $bvn = preg_replace('/\D/', '', (string)$request->input('bvn', ''));
        $dvaConsent = filter_var($request->input('dva_consent', false), FILTER_VALIDATE_BOOLEAN);
        $dvaBankCode = trim((string)($request->input('bank_code') ?? $request->input('dva_bank_code', '')));
        $dvaBankAccountNo = preg_replace('/\D/', '', (string)($request->input('bank_account_number') ?? $request->input('account_number', '')));
        $dvaLast4 = strlen($dvaBankAccountNo) >= 4 ? substr($dvaBankAccountNo, -4) : null;

        if (empty($email) || empty($password) || empty($fullName) || empty($phoneNumber)) {
            Response::error('Full name, email, phone number, and password are required.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address.', 422);
        }

        if (strlen($password) < $minPasswordLength) {
            Response::error("Password must be at least {$minPasswordLength} characters long.", 422);
        }

        if (!empty($nin) && !preg_match('/^\d{11}$/', $nin)) {
            Response::error('NIN must be exactly 11 numeric digits.', 422);
        }
        if (!empty($bvn) && !preg_match('/^\d{11}$/', $bvn)) {
            Response::error('BVN must be exactly 11 numeric digits.', 422);
        }
        if ($bvn !== '') {
            $dupBvn = $this->db->fetchOne('SELECT user_id FROM user_profiles WHERE bvn = :bvn LIMIT 1', ['bvn' => $bvn]);
            if ($dupBvn) {
                Response::error('This BVN is already linked to an existing HambakTech account.', 409);
            }
        }

        $allowedIdTypes = ['nin_slip', 'drivers_license', 'voters_card', 'international_passport', 'nin', 'bvn'];
        $idType = in_array($idTypeRaw, $allowedIdTypes, true) ? $idTypeRaw : 'nin_slip';
        if ($idType === 'nin') $idType = 'nin_slip';

        $hasIdentitySubmission = !empty($nin) || !empty($bvn) || !empty($idNumber);
        if (empty($idNumber) && ($nin || $bvn)) {
            $idNumber = $nin ?: $bvn;
        }
        $initialKycStatus = $hasIdentitySubmission ? 'pending' : 'unverified';

        $existing = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]);
        if ($existing) {
            Response::error('An account with this email address already exists. Please log in.', 409);
        }

        $phoneNormalized = ReferralEngineService::normalizePhone($phoneNumber);
        if ($phoneNormalized !== '') {
            $existingPhone = $this->db->fetchOne(
                'SELECT id FROM users WHERE phone_normalized = :pn OR phone_number = :raw LIMIT 1',
                ['pn' => $phoneNormalized, 'raw' => $phoneNumber]
            );
            if ($existingPhone) {
                Response::error('An account with this phone number already exists. Please log in.', 409);
            }
        }

        $referralService = new ReferralEngineService($this->db);
        $pinService = new PinSecurityService($this->db);

        $inputRefCode = strtoupper(trim((string)($request->input('referral_code') ?? $request->input('referred_by') ?? $request->input('ref', ''))));
        $inputCampaignCode = strtoupper(trim((string)($request->input('campaign_code') ?? $request->input('campaign', ''))));
        $attributionChannel = trim((string)($request->input('referral_channel', $inputCampaignCode !== '' ? 'campaign' : 'referral_link')));

        $userId = Security::generateUuid();
        $kycId = Security::generateUuid();
        $referralCode = $referralService->generateUniqueCode();
        $passwordHash = Security::hashPassword($password);

        $this->db->withTransaction(function (Database $db) use (
            $userId, $kycId, $email, $passwordHash, $fullName, $phoneNumber, $phoneNormalized, $referralCode,
            $dateOfBirth, $residentialAddress, $state, $lga, $nin, $bvn, $idType, $idNumber,
            $hasIdentitySubmission, $initialKycStatus, $dvaConsent, $dvaBankCode, $dvaLast4
        ) {
            // 1. Create User at KYC Level 1 (Tier 1 Basic Profile) — always role=customer, email verification required
            try {
                $db->execute(
                    'INSERT INTO users (id, email, password_hash, full_name, phone_number, phone_normalized, role, assigned_dashboard, kyc_status, tier, referral_code, status, email_verified, email_verification_required, created_at)
                     VALUES (:id, :email, :pass, :name, :phone, :pnorm, "customer", "customer", :ks, 1, :ref, "active", 0, 1, NOW())',
                    [
                        'id' => $userId,
                        'email' => $email,
                        'pass' => $passwordHash,
                        'name' => $fullName,
                        'phone' => $phoneNumber,
                        'pnorm' => $phoneNormalized ?: null,
                        'ks' => $initialKycStatus,
                        'ref' => $referralCode,
                    ]
                );
            } catch (Throwable) {
                $db->execute(
                    'INSERT INTO users (id, email, password_hash, full_name, phone_number, phone_normalized, role, kyc_status, tier, referral_code, status, email_verified, created_at)
                     VALUES (:id, :email, :pass, :name, :phone, :pnorm, "customer", :ks, 1, :ref, "active", 0, NOW())',
                    [
                        'id' => $userId,
                        'email' => $email,
                        'pass' => $passwordHash,
                        'name' => $fullName,
                        'phone' => $phoneNumber,
                        'pnorm' => $phoneNormalized ?: null,
                        'ks' => $initialKycStatus,
                        'ref' => $referralCode,
                    ]
                );
            }

            try {
                $db->execute('UPDATE users SET kyc_level = 1, email_verified = 0, email_verification_required = 1 WHERE id = :id', ['id' => $userId]);
            } catch (Throwable) {
            }

            // 2. Create User Profile row (Level 1 starter profile; optional fields + DVA consent saved if supplied)
            try {
                $db->execute(
                    'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, date_of_birth, dva_consent, dva_consent_at, dva_bank_code, dva_bank_account_last4, created_at, updated_at)
                     VALUES (:uid, :nin, :bvn, :addr, :st, :lga, :dob, :dcons, CASE WHEN :dcons2 = 1 THEN NOW() ELSE NULL END, :dbcode, :dlast4, NOW(), NOW())',
                    [
                        'uid' => $userId,
                        'nin' => $nin ?: null,
                        'bvn' => $bvn ?: null,
                        'addr' => $residentialAddress ?: null,
                        'st' => $state ?: null,
                        'lga' => $lga ?: null,
                        'dob' => $dateOfBirth ?: null,
                        'dcons' => $dvaConsent ? 1 : 0,
                        'dcons2' => $dvaConsent ? 1 : 0,
                        'dbcode' => $dvaBankCode ?: null,
                        'dlast4' => $dvaLast4,
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

            // 3. Only create a Level 2 KYC submission if optional identity documents were explicitly supplied
            if ($hasIdentitySubmission) {
                $historyEntry = [[
                    'action' => 'submitted',
                    'status' => 'pending',
                    'by' => $fullName,
                    'notes' => 'Optional identity details submitted during registration.',
                    'timestamp' => date('c'),
                ]];
                try {
                    $db->execute(
                        'INSERT INTO kyc_submissions
                         (id, user_id, target_level, verification_method, full_legal_name, date_of_birth,
                          phone_number, email, residential_address, state, lga, nin, bvn, id_type, id_number,
                          consent_obtained, consent_timestamp, status, review_history, submitted_at, created_at)
                         VALUES
                         (:id, :uid, 2, "manual", :fname, :dob,
                          :phone, :email, :addr, :st, :lga, :nin, :bvn, :itype, :inum,
                          1, NOW(), "pending", :hist, NOW(), NOW())',
                        [
                            'id' => $kycId,
                            'uid' => $userId,
                            'fname' => $fullName,
                            'dob' => $dateOfBirth ?: null,
                            'phone' => $phoneNumber,
                            'email' => $email,
                            'addr' => $residentialAddress ?: null,
                            'st' => $state ?: null,
                            'lga' => $lga ?: null,
                            'nin' => $nin ?: null,
                            'bvn' => $bvn ?: null,
                            'itype' => strtoupper($idType),
                            'inum' => $idNumber,
                            'hist' => json_encode($historyEntry),
                        ]
                    );
                } catch (Throwable) {
                    $db->execute(
                        'INSERT INTO kyc_submissions (id, user_id, id_type, id_number, status, created_at)
                         VALUES (:id, :uid, :itype, :inum, "pending", NOW())',
                        [
                            'id' => $kycId,
                            'uid' => $userId,
                            'itype' => strtoupper($idType),
                            'inum' => $idNumber,
                        ]
                    );
                }
            }

            // 4. Create Wallet
            $walletId = Security::generateUuid();
            $db->execute(
                'INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status, created_at)
                 VALUES (:id, :uid, 0.00, "NGN", 0, "active", NOW())',
                ['id' => $walletId, 'uid' => $userId]
            );

            // 5. Welcome Notification
            $notifId = Security::generateUuid();
            $db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Welcome to HAMBAKTECH!", "Your KYC Level 1 account and NGN digital wallet are ready. You can upgrade to Level 2 KYC anytime in Identity & KYC to unlock higher limits.", "success", 0, NOW())',
                ['id' => $notifId, 'uid' => $userId]
            );
        });

        // 6. Bind Referral Attribution (Self-referral & anti-fraud protected)
        $referralBinding = null;
        if ($inputRefCode !== '') {
            try {
                $referralBinding = $referralService->bindReferralOnSignup(
                    $userId,
                    $email,
                    $phoneNumber,
                    $inputRefCode,
                    $attributionChannel,
                    $inputCampaignCode !== '' ? $inputCampaignCode : null,
                    $request->getIp(),
                    (string)($request->header('User-Agent') ?? '')
                );
            } catch (Throwable $e) {
                error_log('[Referral Bind Error] ' . $e->getMessage());
            }
        }

        // 7. Admin Registration Notification & Email Dispatch
        $nowStr = date('Y-m-d H:i:s');
        try {
            $dupCheck = $this->db->fetchOne(
                'SELECT id FROM notifications WHERE title LIKE "New Customer Registration%" AND message LIKE :m AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1',
                ['m' => "%{$email}%"]
            );
            if (!$dupCheck) {
                $superAdmins = $this->db->fetchAll(
                    'SELECT id, email, full_name FROM users WHERE role IN ("superadmin", "admin") AND status = "active"'
                );
                foreach ($superAdmins as $sa) {
                    $this->db->execute(
                        'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                         VALUES (:id, :uid, :title, :msg, "alert", 0, "#admin", NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $sa['id'],
                            'title' => "New Customer Registration (KYC Level 1): {$fullName}",
                            'msg' => "Customer {$fullName} ({$email}, {$phoneNumber}) registered on KYC Level 1 at {$nowStr}.",
                        ]
                    );
                }
            }
        } catch (Throwable $e) {
            error_log('[Registration Admin Notification DB Error] ' . $e->getMessage());
        }

        try {
            // Fetch configurable administrator email from system_settings
            $adminEmailSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "admin_notification_email"');
            $decodedSetting = $adminEmailSetting ? json_decode($adminEmailSetting['setting_value'], true) : null;
            $adminEmail = is_string($decodedSetting) ? $decodedSetting : ($adminEmailSetting['setting_value'] ?? null);
            if (empty($adminEmail) || !filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
                $adminEmail = 'admin@hambaktech.com.ng';
            }

            $safeName = htmlspecialchars($fullName, ENT_QUOTES, 'UTF-8');
            $locationText = trim(implode(', ', array_filter([$residentialAddress, $lga, $state])));
            $safeLocation = $locationText !== '' ? htmlspecialchars($locationText, ENT_QUOTES, 'UTF-8') : 'Not provided (KYC Level 1)';
            $kycLabel = $hasIdentitySubmission ? 'Level 1 Registered (Level 2 Docs Pending Review)' : 'Level 1 — Basic Profile (No ID Docs Submitted Yet)';

            $mailService = new MailService();
            $mailBody = "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;'>
                <div style='background: #1d4ed8; color: #ffffff; padding: 16px 20px; border-radius: 8px 8px 0 0;'>
                    <h2 style='margin: 0; font-size: 18px;'>New Customer Registration (KYC Level 1)</h2>
                </div>
                <div style='padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;'>
                    <p>A new customer has created an account on HAMBAKTECH starting at KYC Level 1.</p>
                    <table style='width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;'>
                        <tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 0; color: #64748b;'><strong>Customer Name:</strong></td><td style='padding: 8px 0; font-weight: bold;'>{$safeName}</td></tr>
                        <tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 0; color: #64748b;'><strong>Email Address:</strong></td><td style='padding: 8px 0;'>{$email}</td></tr>
                        <tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 0; color: #64748b;'><strong>Phone Number:</strong></td><td style='padding: 8px 0;'>{$phoneNumber}</td></tr>
                        <tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 0; color: #64748b;'><strong>Location:</strong></td><td style='padding: 8px 0;'>{$safeLocation}</td></tr>
                        <tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 0; color: #64748b;'><strong>Registration Time:</strong></td><td style='padding: 8px 0;'>{$nowStr} (WAT)</td></tr>
                        <tr style='border-bottom: 1px solid #f1f5f9;'><td style='padding: 8px 0; color: #64748b;'><strong>KYC Level / Status:</strong></td><td style='padding: 8px 0;'><span style='color: #1d4ed8; font-weight: bold;'>{$kycLabel}</span></td></tr>
                        <tr><td style='padding: 8px 0; color: #64748b;'><strong>IP Address:</strong></td><td style='padding: 8px 0;'>{$request->getIp()}</td></tr>
                    </table>
                    <p><a href='https://hambaktech.com.ng/#admin' style='display: inline-block; padding: 10px 20px; background: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;'>View in Admin Console</a></p>
                </div>
            </div>";
            $mailService->send($adminEmail, 'Administrator', "[HAMBAKTECH] New Customer Registration (KYC Level 1): {$fullName}", $mailBody);
        } catch (Throwable $e) {
            error_log('[Registration Admin Email Error] ' . $e->getMessage());
        }

        // 8. Record Activity Footprint
        FootprintService::record(
            'auth',
            'CUSTOMER_REGISTRATION',
            ['id' => $userId, 'email' => $email, 'full_name' => $fullName],
            'kyc_level_1',
            $userId,
            null,
            'successful',
            null,
            null,
            ['phone' => $phoneNumber, 'state' => $state ?: null, 'lga' => $lga ?: null, 'referral_code' => $referralCode, 'referred_by' => $referralBinding['referral_code_used'] ?? null, 'kyc_level' => 1, 'kyc_status' => $initialKycStatus],
            $request->getIp()
        );

        // 8B. Generate and dispatch Email Verification Token + 6-digit OTP
        $verificationDispatch = ['sent' => false, 'expires_in_minutes' => 60];
        try {
            $verificationDispatch = $this->issueEmailVerification($userId, $email, $fullName, false);
        } catch (Throwable $e) {
            Security::logPrivateError('EmailVerificationRegister', $e, ['user_id' => $userId, 'email' => $email]);
        }

        try {
            $user = $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id',
                ['id' => $userId]
            );
        } catch (Throwable) {
            $user = $this->db->fetchOne('SELECT * FROM users WHERE id = :id', ['id' => $userId]);
        }

        $token = Auth::generateToken($user, $request);
        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? 1);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        $user['email_verified'] = (bool)($user['email_verified'] ?? false);
        $user['email_verification_required'] = (bool)($user['email_verification_required'] ?? true);
        $user['mfa_enabled'] = false;
        $user['pin_is_locked'] = false;
        $user['role'] = 'customer';
        $user['assigned_dashboard'] = 'customer';
        $user['permissions'] = [];
        $user['dashboard_config'] = DashboardConfigService::getConfig($this->db, 'customer', 'published');
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance']);

        // 8C. Evaluate DVA readiness & auto-provision if eligible (non-blocking)
        $virtualAccountState = null;
        try {
            $walletCtrl = new WalletController();
            $dvaRes = $walletCtrl->autoProvisionDvaIfEligible($user, [
                'bvn' => $bvn,
                'bank_code' => $dvaBankCode,
                'account_number' => $dvaBankAccountNo,
            ]);
            $virtualAccountState = $dvaRes['payload'] ?? $walletCtrl->buildVirtualAccountPayloadForUser($user, false, false);
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackDvaRegisterHook', $e, ['user_id' => $userId]);
        }

        $verificationSent = !empty($verificationDispatch['sent']);
        $registerMessage = $verificationSent
            ? 'Account created! Please enter the 6-digit verification code or click the link sent to your email to verify your account.'
            : 'Account created! We could not send your verification email right now. Please tap Resend Verification Code to try again.';

        Response::success([
            'user' => $user,
            'token' => $token,
            'pin_policy' => $pinService->getPublicPolicy(),
            'referral_bound' => $referralBinding !== null,
            'email_verification_required' => true,
            'verification_sent' => $verificationSent,
            'verification_expires_in_minutes' => (int)($verificationDispatch['expires_in_minutes'] ?? 60),
            'cooldown_seconds' => $verificationSent ? 60 : 0,
            'virtual_account_state' => $virtualAccountState,
        ], $registerMessage, 201);
    }

    public function me(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $user['dashboard_config'] = DashboardConfigService::getConfig(
            $this->db,
            (string)($user['assigned_dashboard'] ?? $user['role'] ?? 'customer'),
            'published'
        );
        $pinService = new PinSecurityService($this->db);
        Response::success([
            'user' => $user,
            'dashboard_config' => $user['dashboard_config'],
            'pin_policy' => $pinService->getPublicPolicy(),
        ]);
    }

    public function updateProfile(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $fullName = trim((string)$request->input('full_name', $currentUser['full_name']));
        $phone = trim((string)$request->input('phone_number', $currentUser['phone_number']));
        $address = (string)($request->input('address') ?? $request->input('residential_address', $currentUser['address'] ?? ''));
        $state = (string)$request->input('state', $currentUser['state'] ?? '');
        $lga = (string)$request->input('lga', $currentUser['lga'] ?? '');
        $bio = (string)$request->input('bio', $currentUser['bio'] ?? '');
        $dob = (string)($request->input('date_of_birth') ?? $request->input('dob', $currentUser['date_of_birth'] ?? ''));
        $avatarUrl = (string)$request->input('avatar_url', $currentUser['avatar_url'] ?? '');

        $this->db->execute(
            'UPDATE users SET full_name = :name, phone_number = :phone, avatar_url = :avatar, updated_at = NOW() WHERE id = :id',
            ['name' => $fullName, 'phone' => $phone, 'avatar' => $avatarUrl, 'id' => $currentUser['id']]
        );

        try {
            $this->db->execute(
                'INSERT INTO user_profiles (user_id, address, state, lga, bio, date_of_birth, updated_at)
                 VALUES (:uid, :addr, :state, :lga, :bio, :dob, NOW())
                 ON DUPLICATE KEY UPDATE address = :addr2, state = :state2, lga = :lga2, bio = :bio2, date_of_birth = :dob2, updated_at = NOW()',
                [
                    'uid' => $currentUser['id'],
                    'addr' => $address,
                    'state' => $state,
                    'lga' => $lga,
                    'bio' => $bio,
                    'dob' => $dob ?: null,
                    'addr2' => $address,
                    'state2' => $state,
                    'lga2' => $lga,
                    'bio2' => $bio,
                    'dob2' => $dob ?: null,
                ]
            );
        } catch (Throwable) {
            $this->db->execute(
                'INSERT INTO user_profiles (user_id, address, state, lga, bio, updated_at)
                 VALUES (:uid, :addr, :state, :lga, :bio, NOW())
                 ON DUPLICATE KEY UPDATE address = :addr2, state = :state2, lga = :lga2, bio = :bio2, updated_at = NOW()',
                [
                    'uid' => $currentUser['id'],
                    'addr' => $address,
                    'state' => $state,
                    'lga' => $lga,
                    'bio' => $bio,
                    'addr2' => $address,
                    'state2' => $state,
                    'lga2' => $lga,
                    'bio2' => $bio,
                ]
            );
        }

        $updated = Auth::user($request);
        Response::success(['user' => $updated], 'Profile updated successfully');
    }

    public function changePassword(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $currentPass = (string)$request->input('current_password', '');
        $newPass = (string)$request->input('new_password', '');

        if (empty($currentPass) || empty($newPass)) {
            Response::error('Current password and new password are required.', 422);
        }

        $row = $this->db->fetchOne('SELECT password_hash FROM users WHERE id = :id', ['id' => $currentUser['id']]);
        if (!Security::verifyPassword($currentPass, $row['password_hash'])) {
            Response::error('Incorrect current password.', 400);
        }

        if (strlen($newPass) < 8) {
            Response::error('New password must be at least 8 characters.', 422);
        }

        $newHash = Security::hashPassword($newPass);
        $this->db->execute(
            'UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id',
            ['hash' => $newHash, 'id' => $currentUser['id']]
        );

        // Invalidate existing sessions after password rotation and issue a fresh token for current device
        Auth::revokeAllUserSessions((string)$currentUser['id'], 'password_changed', true);
        $freshUser = $this->db->fetchOne('SELECT * FROM users WHERE id = :id LIMIT 1', ['id' => $currentUser['id']]) ?: $currentUser;
        $freshToken = Auth::generateToken($freshUser, $request);

        Response::success(['token' => $freshToken], 'Password updated successfully');
    }

    public function setPin(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $pin = trim((string)($request->input('pin') ?? $request->input('newPin') ?? $request->input('new_pin', '')));
        $currentPin = trim((string)($request->input('current_pin') ?? $request->input('currentPin', '')));

        try {
            $pinService = new PinSecurityService($this->db);
            $res = $pinService->setOrUpdatePin(
                (string)$currentUser['id'],
                $pin,
                $currentPin !== '' ? $currentPin : null,
                true
            );
            FootprintService::record('security', 'TRANSACTION_PIN_UPDATED', $currentUser, null, null, null, 'successful', null, null, [], $request->getIp());
            Response::success($res, 'Transaction PIN activated successfully');
        } catch (Throwable $e) {
            Security::logPrivateError('AuthSetPin', $e, ['user_id' => $currentUser['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to update your transaction PIN right now.'), 422);
        }
    }

    public function verifyPin(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $pin = trim((string)$request->input('pin', ''));
        $pinService = new PinSecurityService($this->db);
        $pinService->requireValidPin($currentUser, ['transaction_pin' => $pin], 'verify_check');
        Response::success(['valid' => true, 'verified' => true], 'Transaction PIN verified');
    }

    /**
     * POST /api/auth/forgot-password
     * Dispatches secure 6-digit OTP code without leaking whether account exists (anti-enumeration).
     */
    public function forgotPassword(Request $request): void
    {
        $inputEmail = strtolower(trim((string)$request->input('email', '')));
        $phoneDigits = preg_replace('/[^0-9]/', '', $inputEmail);
        $normPhone = ReferralEngineService::normalizePhone($inputEmail);
        $neutralMsg = 'If a registered account matches the provided contact details, a 6-digit verification code has been dispatched.';

        if ($inputEmail === '') {
            Response::error('Please provide an email address or registered phone number.', 422);
        }

        $user = $this->db->fetchOne(
            'SELECT id, email, full_name, role, status FROM users 
             WHERE LOWER(email) = :email 
                OR phone_number = :ident 
                OR (:nphone != "" AND phone_normalized = :nphone2)
                OR (:phone != "" AND REPLACE(REPLACE(REPLACE(phone_number, " ", ""), "-", ""), "+234", "0") = :phone)
             ORDER BY (role = "superadmin") DESC, created_at ASC LIMIT 1',
            [
                'email' => $inputEmail,
                'ident' => $inputEmail,
                'nphone' => $normPhone,
                'nphone2' => $normPhone,
                'phone' => $phoneDigits,
            ]
        );

        if (!$user || ($user['status'] ?? 'active') === 'suspended') {
            Response::success(['expires_in_minutes' => 15], $neutralMsg);
            return;
        }

        $email = strtolower($user['email']);
        $otp = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $resetToken = bin2hex(random_bytes(24));
        $resetId = Security::generateUuid();

        $this->db->execute('DELETE FROM password_resets WHERE LOWER(email) = LOWER(:email)', ['email' => $email]);

        $this->db->execute(
            'INSERT INTO password_resets (id, email, otp_code, token, attempts, is_used, expires_at, created_at)
             VALUES (:id, :email, :otp, :tok, 0, 0, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW())',
            [
                'id' => $resetId,
                'email' => $email,
                'otp' => $otp,
                'tok' => $resetToken,
            ]
        );

        try {
            $mailService = new MailService();
            $mailService->sendPasswordResetOtp($email, (string)($user['full_name'] ?? 'Customer'), $otp, $resetToken);
        } catch (Throwable $e) {
            error_log('[ForgotPassword Mail Error] ' . $e->getMessage());
        }

        Response::success([
            'expires_in_minutes' => 15,
        ], $neutralMsg);
    }

    /**
     * POST /api/auth/verify-otp
     * Validates 6-digit verification code
     */
    public function verifyOtp(Request $request): void
    {
        $email = strtolower(trim((string)$request->input('email', '')));
        $otp = preg_replace('/\s+/', '', trim((string)$request->input('otp_code', $request->input('otp', ''))));

        if (empty($email) || empty($otp)) {
            Response::error('Email address and 6-digit verification code are required.', 422);
        }

        $record = $this->db->fetchOne(
            'SELECT id, email, otp_code, token, attempts, is_used, expires_at 
             FROM password_resets 
             WHERE LOWER(email) = LOWER(:email) AND is_used = 0 
             ORDER BY created_at DESC LIMIT 1',
            ['email' => $email]
        );

        if (!$record) {
            Response::error('No active password reset request found. Please request a new verification code.', 404);
        }

        if (strtotime($record['expires_at']) < time()) {
            Response::error('Verification code has expired. Please request a new one.', 400);
        }

        if ((int)$record['attempts'] >= 5) {
            Response::error('Too many incorrect verification attempts. Please request a fresh code.', 429);
        }

        if ($record['otp_code'] !== $otp) {
            $this->db->execute('UPDATE password_resets SET attempts = attempts + 1 WHERE id = :id', ['id' => $record['id']]);
            Response::error('Invalid verification code. Please check and try again.', 400);
        }

        Response::success([
            'valid' => true,
            'email' => $email,
            'token' => $record['token'],
        ], 'Verification code verified successfully. You may now enter your new password.');
    }

    /**
     * POST /api/auth/reset-password
     * Resets account password and issues authenticated session
     */
    public function resetPassword(Request $request): void
    {
        $email = strtolower(trim((string)$request->input('email', '')));
        $otp = preg_replace('/\s+/', '', trim((string)$request->input('otp_code', $request->input('otp', ''))));
        $token = trim((string)$request->input('token', ''));
        $newPassword = (string)$request->input('new_password', $request->input('password', ''));

        if (empty($email) || empty($newPassword)) {
            Response::error('Email and new password are required.', 422);
        }

        if (strlen($newPassword) < 8) {
            Response::error('New password must be at least 8 characters long.', 422);
        }

        // Validate via either OTP or Token
        $record = null;
        if (!empty($otp)) {
            $record = $this->db->fetchOne(
                'SELECT id, email, token, expires_at FROM password_resets WHERE LOWER(email) = LOWER(:email) AND otp_code = :otp AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
                ['email' => $email, 'otp' => $otp]
            );
        } elseif (!empty($token)) {
            $record = $this->db->fetchOne(
                'SELECT id, email, token, expires_at FROM password_resets WHERE LOWER(email) = LOWER(:email) AND token = :tok AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
                ['email' => $email, 'tok' => $token]
            );
        }

        if (!$record) {
            Response::error('Invalid or expired password reset authorization. Please request a new code.', 400);
        }

        if (strtotime($record['expires_at']) < time()) {
            Response::error('Reset session has expired. Please request a new code.', 400);
        }

        $targetUser = $this->db->fetchOne(
            'SELECT id, email, status FROM users WHERE LOWER(email) = LOWER(:email) ORDER BY (role = "superadmin") DESC, created_at ASC LIMIT 1',
            ['email' => $email]
        );
        if (!$targetUser) {
            Response::error('Account not found for this email address.', 404);
        }

        // Hash new password using standard Bcrypt
        $newHash = Security::hashPassword($newPassword);

        // Update user password and clear reset state + failed login lockouts
        $this->db->execute(
            'UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id',
            ['hash' => $newHash, 'id' => $targetUser['id']]
        );

        $this->db->execute('UPDATE password_resets SET is_used = 1 WHERE id = :id', ['id' => $record['id']]);
        try {
            $this->db->execute('DELETE FROM login_attempts WHERE LOWER(identifier) = LOWER(:ident)', ['ident' => substr($email, 0, 190)]);
        } catch (Throwable) {
        }

        // Revoke all previously issued sessions before issuing fresh session token
        Auth::revokeAllUserSessions((string)$targetUser['id'], 'password_reset', true);
        try {
            $user = $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance as live_balance, p.assigned_permissions AS profile_permissions
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id LIMIT 1',
                ['id' => $targetUser['id']]
            );
        } catch (Throwable) {
            $user = $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance as live_balance
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 WHERE u.id = :id LIMIT 1',
                ['id' => $targetUser['id']]
            );
        }

        $jwtToken = Auth::generateToken($user, $request);
        $pinService = new PinSecurityService($this->db);

        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        $user['email_verified'] = (bool)($user['email_verified'] ?? false);
        $user['email_verification_required'] = (bool)($user['email_verification_required'] ?? false);
        $user['mfa_enabled'] = (bool)($user['mfa_enabled'] ?? false);
        $user['pin_is_locked'] = false;
        $perms = [];
        $hasExplicitPerms = false;
        foreach ([$user['assigned_permissions'] ?? null, $user['profile_permissions'] ?? null] as $rawP) {
            if (is_string($rawP) && trim($rawP) !== '') {
                $dp = json_decode($rawP, true);
                if (is_array($dp)) {
                    $perms = $dp;
                    $hasExplicitPerms = true;
                    break;
                }
            } elseif (is_array($rawP)) {
                $perms = $rawP;
                $hasExplicitPerms = true;
                break;
            }
        }
        $normalizedRole = DashboardConfigService::normalizeRole((string)($user['role'] ?? 'customer'));
        $user['role'] = $normalizedRole;
        $user['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey(
            $user['assigned_dashboard'] ?? null,
            $normalizedRole
        );
        if ($normalizedRole === 'superadmin') {
            $perms = ['*'];
        } elseif (!$hasExplicitPerms && Auth::isConsoleRole($normalizedRole)) {
            $perms = DashboardConfigService::getDefaultPermissionsForRole($normalizedRole);
        }
        $user['permissions'] = array_values(array_unique($perms));
        $user['dashboard_config'] = DashboardConfigService::getConfig($this->db, (string)$user['assigned_dashboard'], 'published');
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance'], $user['assigned_permissions'], $user['profile_permissions']);

        // Log audit event
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "PASSWORD_RESET_SUCCESS", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'email' => $user['email'],
                'details' => json_encode(['role' => $user['role']]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'user' => $user,
            'token' => $jwtToken,
            'pin_policy' => $pinService->getPublicPolicy(),
        ], 'Your password has been reset successfully. You are now logged in.');
    }

    private function issueEmailVerification(string $userId, string $email, string $fullName, bool $enforceCooldown = false): array
    {
        $cleanEmail = strtolower(trim($email));
        $expiryMinutes = 60;

        if ($enforceCooldown) {
            $recent = $this->db->fetchOne(
                'SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds
                 FROM email_verifications
                 WHERE user_id = :uid AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)
                 ORDER BY created_at DESC LIMIT 1',
                ['uid' => $userId]
            );
            if ($recent && $recent['elapsed_seconds'] !== null) {
                $elapsed = max(0, (int)$recent['elapsed_seconds']);
                $waitSeconds = max(1, 60 - $elapsed);
                Response::error(
                    "Please wait {$waitSeconds} second(s) before requesting another verification email.",
                    429,
                    ['retry_after_seconds' => $waitSeconds],
                    'VERIFICATION_COOLDOWN'
                );
            }
        }

        $recordId = Security::generateUuid();
        $rawToken = bin2hex(random_bytes(32));
        $otpCode = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $tokenHash = hash('sha256', $rawToken);
        $codeHash = hash('sha256', $otpCode);

        $this->db->execute(
            'INSERT INTO email_verifications
             (id, user_id, email, token_hash, code_hash, attempts, max_attempts, is_used, expires_at, created_at)
             VALUES (:id, :uid, :email, :th, :ch, 0, 5, 0, DATE_ADD(NOW(), INTERVAL 60 MINUTE), NOW())',
            [
                'id' => $recordId,
                'uid' => $userId,
                'email' => $cleanEmail,
                'th' => $tokenHash,
                'ch' => $codeHash,
            ]
        );

        $sent = false;
        $mailRes = [];
        try {
            $mailService = new MailService();
            $mailRes = $mailService->sendEmailVerification($cleanEmail, $fullName, $otpCode, $rawToken, $expiryMinutes);
            $sent = !empty($mailRes['sent']);
        } catch (Throwable $e) {
            Security::logPrivateError('EmailVerificationMail', $e, ['user_id' => $userId, 'email' => $cleanEmail]);
        }

        if ($sent) {
            // Invalidate prior unused tokens only once the fresh email was dispatched
            $this->db->execute(
                'UPDATE email_verifications SET is_used = 1 WHERE user_id = :uid AND is_used = 0 AND id != :rid',
                ['uid' => $userId, 'rid' => $recordId]
            );
        } else {
            // Remove undelivered record so customer is not locked out for 60s and prior active codes remain intact
            try {
                $this->db->execute('DELETE FROM email_verifications WHERE id = :id', ['id' => $recordId]);
            } catch (Throwable) {
            }
            Security::logPrivateError(
                'EmailVerificationDispatchFailed',
                (string)($mailRes['error'] ?? 'SMTP delivery failed'),
                ['user_id' => $userId, 'email' => $cleanEmail]
            );
        }

        return [
            'sent' => $sent,
            'expires_in_minutes' => $expiryMinutes,
        ];
    }

    /**
     * GET / POST /api/auth/verify-email
     * Verifies user's email address via secure 32-byte link token or 6-digit OTP code.
     */
    public function verifyEmail(Request $request): void
    {
        $token = trim((string)($request->input('token') ?? $request->query('token', '')));
        $otp = trim((string)($request->input('otp_code') ?? $request->input('otp') ?? $request->input('code') ?? $request->query('code', '')));
        $email = strtolower(trim((string)($request->input('email') ?? $request->query('email', ''))));

        $authUser = Auth::user($request);
        if ($email === '' && $authUser) {
            $email = strtolower((string)($authUser['email'] ?? ''));
        }

        if ($token === '' && ($otp === '' || $email === '')) {
            Response::error('Please provide a valid verification token or both email and 6-digit code.', 422);
        }

        $record = null;
        if ($token !== '') {
            $tokenHash = hash('sha256', $token);
            $record = $this->db->fetchOne(
                'SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_left
                 FROM email_verifications WHERE token_hash = :th ORDER BY created_at DESC LIMIT 1',
                ['th' => $tokenHash]
            );
        } else {
            $record = $this->db->fetchOne(
                'SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_left
                 FROM email_verifications WHERE LOWER(email) = :email AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
                ['email' => $email]
            );
            if (!$record) {
                $record = $this->db->fetchOne(
                    'SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_left
                     FROM email_verifications WHERE LOWER(email) = :email ORDER BY created_at DESC LIMIT 1',
                    ['email' => $email]
                );
            }
        }

        // Handle idempotent re-clicks if user is already verified
        if (!$record && $email !== '') {
            $existingUser = $this->db->fetchOne('SELECT id, email_verified FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]);
            if ($existingUser && !empty($existingUser['email_verified'])) {
                $refreshed = $this->loadSanitizedAuthUser((string)$existingUser['id']);
                Response::success([
                    'verified' => true,
                    'already_verified' => true,
                    'user' => $refreshed,
                ], 'Your email address is already verified.');
            }
        }

        if (!$record) {
            Response::error('Invalid or expired verification link/code. Please request a new verification email.', 400);
        }

        $targetUser = $this->db->fetchOne('SELECT id, email, full_name, role, email_verified FROM users WHERE id = :id LIMIT 1', ['id' => $record['user_id']]);
        if (!$targetUser) {
            Response::error('Account not found.', 404);
        }

        if (!empty($targetUser['email_verified'])) {
            $this->db->execute('UPDATE email_verifications SET is_used = 1, used_at = COALESCE(used_at, NOW()) WHERE user_id = :uid AND is_used = 0', ['uid' => $targetUser['id']]);
            $refreshed = $this->loadSanitizedAuthUser((string)$targetUser['id']);
            Response::success([
                'verified' => true,
                'already_verified' => true,
                'user' => $refreshed,
            ], 'Your email address is already verified.');
        }

        $attempts = (int)($record['attempts'] ?? 0);
        $maxAttempts = max(1, (int)($record['max_attempts'] ?? 5));
        $secondsLeft = (int)($record['seconds_left'] ?? 0);

        if ($secondsLeft <= 0 && empty($record['used_at'])) {
            if ((int)($record['is_used'] ?? 0) === 0) {
                $this->db->execute('UPDATE email_verifications SET is_used = 1 WHERE id = :id', ['id' => $record['id']]);
            }
            Response::error('Verification link/code has expired. Please request a new verification email.', 400, ['expired' => true, 'can_resend' => true], 'VERIFICATION_EXPIRED');
        }

        if ($attempts >= $maxAttempts) {
            if ((int)($record['is_used'] ?? 0) === 0) {
                $this->db->execute('UPDATE email_verifications SET is_used = 1 WHERE id = :id', ['id' => $record['id']]);
            }
            Response::error('Maximum verification attempts exceeded. Please request a new verification code.', 429, ['attempts_remaining' => 0, 'can_resend' => true], 'VERIFICATION_ATTEMPTS_EXCEEDED');
        }

        if ((int)($record['is_used'] ?? 0) === 1) {
            Response::error('This verification link or code has already been used. Please request a new one if needed.', 400, ['can_resend' => true], 'VERIFICATION_ALREADY_USED');
        }

        $matched = false;
        if ($token !== '') {
            $matched = hash_equals((string)$record['token_hash'], hash('sha256', $token));
        } else {
            $matched = hash_equals((string)$record['code_hash'], hash('sha256', $otp));
        }

        if (!$matched) {
            $nextAttempts = $attempts + 1;
            $remaining = max(0, $maxAttempts - $nextAttempts);
            if ($remaining <= 0) {
                $this->db->execute('UPDATE email_verifications SET attempts = :cnt, is_used = 1 WHERE id = :id', ['cnt' => $nextAttempts, 'id' => $record['id']]);
                Response::error('Maximum verification attempts exceeded. Please request a new verification code.', 429, ['attempts_remaining' => 0, 'can_resend' => true], 'VERIFICATION_ATTEMPTS_EXCEEDED');
            }
            $this->db->execute('UPDATE email_verifications SET attempts = :cnt WHERE id = :id', ['cnt' => $nextAttempts, 'id' => $record['id']]);
            Response::error("Invalid verification code. {$remaining} attempt(s) remaining.", 400, ['attempts_remaining' => $remaining], 'INVALID_VERIFICATION_CODE');
        }

        $this->db->execute(
            'UPDATE email_verifications SET is_used = 1, used_at = NOW() WHERE user_id = :uid AND is_used = 0',
            ['uid' => $targetUser['id']]
        );
        $this->db->execute(
            'UPDATE users SET email_verified = 1, email_verified_at = NOW(), updated_at = NOW() WHERE id = :id',
            ['id' => $targetUser['id']]
        );

        // Automatically reconcile any unlinked Academy applications/students submitted with this email
        AcademyService::reconcileUserAcademyLinks($this->db, (string)$targetUser['id'], (string)$targetUser['email'], true);

        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Email Verified Successfully", "Your email address has been verified. All wallet funding, identity verification, and VTU services are now unlocked.", "success", 0, NOW())',
                ['id' => Security::generateUuid(), 'uid' => $targetUser['id']]
            );
        } catch (Throwable) {
        }

        FootprintService::record(
            'auth',
            'EMAIL_VERIFIED',
            ['id' => $targetUser['id'], 'email' => $targetUser['email'], 'full_name' => $targetUser['full_name'] ?? 'User'],
            null,
            null,
            null,
            'successful',
            null,
            null,
            [],
            $request->getIp()
        );

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "EMAIL_VERIFIED", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $targetUser['id'],
                'email' => $targetUser['email'],
                'details' => json_encode(['method' => $token !== '' ? 'link_token' : 'otp_code']),
                'ip' => $request->getIp(),
            ]
        );

        $refreshed = $this->loadSanitizedAuthUser((string)$targetUser['id']);
        $freshJwt = Auth::generateToken($refreshed, $request);

        $virtualAccountState = null;
        try {
            $walletCtrl = new WalletController();
            $dvaRes = $walletCtrl->autoProvisionDvaIfEligible($refreshed);
            $virtualAccountState = $dvaRes['payload'] ?? $walletCtrl->buildVirtualAccountPayloadForUser($refreshed, false, false);
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackDvaVerifyEmailHook', $e, ['user_id' => $targetUser['id']]);
        }

        Response::success([
            'verified' => true,
            'user' => $refreshed,
            'token' => $freshJwt,
            'virtual_account_state' => $virtualAccountState,
        ], 'Email verified successfully! Full portal access is now active.');
    }

    /**
     * POST /api/auth/resend-verification
     */
    public function resendVerification(Request $request): void
    {
        $authUser = Auth::user($request);
        $email = strtolower(trim((string)($request->input('email') ?? ($authUser['email'] ?? ''))));

        if ($email === '') {
            Response::error('Email address is required.', 422);
        }

        $targetUser = $authUser
            ? $this->db->fetchOne('SELECT id, email, full_name, status, email_verified FROM users WHERE id = :id LIMIT 1', ['id' => $authUser['id']])
            : $this->db->fetchOne('SELECT id, email, full_name, status, email_verified FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]);

        if (!$targetUser) {
            Response::success([
                'sent' => true,
                'expires_in_minutes' => 60,
            ], 'If an unverified account exists for this email address, a verification email has been sent.');
            return;
        }

        if (($targetUser['status'] ?? 'active') === 'suspended') {
            Response::error('Your account is currently suspended. Please contact support.', 403);
        }

        if (!empty($targetUser['email_verified'])) {
            Response::success([
                'verified' => true,
                'already_verified' => true,
            ], 'Your email address is already verified.');
            return;
        }

        $dispatch = $this->issueEmailVerification(
            (string)$targetUser['id'],
            (string)$targetUser['email'],
            (string)($targetUser['full_name'] ?? 'Customer'),
            true
        );

        if (empty($dispatch['sent'])) {
            Response::error(
                'We could not send your verification email at this time. Please try again shortly, or contact support if the issue persists.',
                503,
                ['sent' => false, 'can_retry' => true],
                'EMAIL_DELIVERY_FAILED'
            );
        }

        Response::success([
            'sent' => true,
            'expires_in_minutes' => (int)($dispatch['expires_in_minutes'] ?? 60),
            'cooldown_seconds' => 60,
        ], 'A fresh verification code and link have been sent to your email address.');
    }

    private function loadSanitizedAuthUser(string $userId): array
    {
        try {
            $user = $this->db->fetchOne(
                'SELECT u.id, u.email, u.full_name, u.phone_number, u.phone_normalized, u.role, u.assigned_dashboard, u.wallet_balance,
                        u.kyc_status, u.kyc_level, u.tier, u.referral_code, u.referred_by_user_id, u.referral_source,
                        u.referral_campaign_code, u.referral_bound_at, u.status, u.avatar_url,
                        u.email_verified, u.email_verification_required, u.email_verified_at, u.token_version,
                        u.mfa_enabled, u.mfa_method, u.last_login_at, u.created_at, u.updated_at,
                        (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_wallet_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth,
                        p.notification_preferences, p.security_settings
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id LIMIT 1',
                ['id' => $userId]
            );
        } catch (Throwable) {
            $user = $this->db->fetchOne('SELECT * FROM users WHERE id = :id LIMIT 1', ['id' => $userId]) ?: [];
        }
        $normalizedRole = DashboardConfigService::normalizeRole((string)($user['role'] ?? 'customer'));
        $user['role'] = $normalizedRole;
        $user['assigned_dashboard'] = DashboardConfigService::normalizeDashboardKey($user['assigned_dashboard'] ?? null, $normalizedRole);
        $user['wallet_balance'] = (float)($user['live_wallet_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        $user['email_verified'] = (bool)($user['email_verified'] ?? false);
        $user['email_verification_required'] = (bool)($user['email_verification_required'] ?? false);
        $user['mfa_enabled'] = (bool)($user['mfa_enabled'] ?? false);
        $user['pin_is_locked'] = false;
        $user['permissions'] = $normalizedRole === 'superadmin' ? ['*'] : (Auth::isConsoleRole($normalizedRole) ? DashboardConfigService::getDefaultPermissionsForRole($normalizedRole) : []);
        $user['dashboard_config'] = DashboardConfigService::getConfig($this->db, (string)$user['assigned_dashboard'], 'published');
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance']);
        return $user;
    }
}
