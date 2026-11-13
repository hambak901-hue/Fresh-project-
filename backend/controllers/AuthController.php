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
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use Throwable;

class AuthController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
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

        // Map alias hambak901 to hambak901@gmail.com
        if ($email === 'hambak901' || $email === 'hambak') {
            $email = 'hambak901@gmail.com';
        }

        try {
            $user = $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth,
                        p.notification_preferences, p.security_settings
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

        if (!$user) {
            FootprintService::record('security', 'LOGIN_FAILED', null, null, null, null, 'failed', null, 'User identifier not found', ['identifier' => $inputIdent], $request->getIp());
            Response::error('Invalid email or password.', 401);
        }

        if ($user['status'] === 'suspended') {
            FootprintService::record('security', 'LOGIN_BLOCKED_SUSPENDED', ['id' => $user['id'], 'email' => $user['email']], null, null, null, 'failed', null, 'Account is suspended', null, $request->getIp());
            Response::error('Your account is currently suspended. Please contact HambakTech Enterprise Support.', 403);
        }

        if (!Security::verifyPassword($password, $user['password_hash'], $user['email'])) {
            FootprintService::record('security', 'LOGIN_FAILED', ['id' => $user['id'], 'email' => $user['email']], null, null, null, 'failed', null, 'Invalid password attempt', null, $request->getIp());
            Response::error('Invalid email or password.', 401);
        }

        // Seamlessly upgrade legacy or non-standard hash to modern Bcrypt
        if (!str_starts_with($user['password_hash'], '$2y$12$')) {
            $newHash = Security::hashPassword($password);
            $this->db->execute('UPDATE users SET password_hash = :hash WHERE id = :id', ['hash' => $newHash, 'id' => $user['id']]);
        }

        $token = Auth::generateToken($user);
        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        if (isset($user['notification_preferences']) && is_string($user['notification_preferences'])) {
            $user['notification_preferences'] = json_decode($user['notification_preferences'], true);
        }
        if (isset($user['security_settings']) && is_string($user['security_settings'])) {
            $user['security_settings'] = json_decode($user['security_settings'], true);
        }
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance']);

        // Log audit event and activity footprint
        FootprintService::record(
            'auth',
            'CUSTOMER_LOGIN',
            ['id' => $user['id'], 'email' => $user['email'], 'full_name' => $user['full_name'] ?? 'User'],
            null,
            null,
            null,
            'successful',
            null,
            null,
            ['role' => $user['role']],
            $request->getIp()
        );

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "USER_LOGIN", :details, :ip, NOW())',
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
            'token' => $token,
        ], 'Login successful');
    }

    public function register(Request $request): void
    {
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

        if (empty($email) || empty($password) || empty($fullName) || empty($phoneNumber)) {
            Response::error('Full name, email, phone number, and password are required.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address.', 422);
        }

        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters long.', 422);
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

        $hasIdentitySubmission = !empty($nin) || !empty($bvn) || !empty($idNumber);
        if (empty($idNumber) && ($nin || $bvn)) {
            $idNumber = $nin ?: $bvn;
        }
        $initialKycStatus = $hasIdentitySubmission ? 'pending' : 'unverified';

        $existing = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $email]);
        if ($existing) {
            Response::error('An account with this email address already exists. Please log in.', 409);
        }

        $userId = Security::generateUuid();
        $kycId = Security::generateUuid();
        $referralCode = 'HAMBAK-' . strtoupper(substr(md5($email . microtime()), 0, 6));
        $passwordHash = Security::hashPassword($password);

        $this->db->withTransaction(function (Database $db) use (
            $userId, $kycId, $email, $passwordHash, $fullName, $phoneNumber, $referralCode,
            $dateOfBirth, $residentialAddress, $state, $lga, $nin, $bvn, $idType, $idNumber,
            $hasIdentitySubmission, $initialKycStatus
        ) {
            // 1. Create User at KYC Level 1 (Tier 1 Basic Profile)
            $db->execute(
                'INSERT INTO users (id, email, password_hash, full_name, phone_number, role, kyc_status, tier, referral_code, status, created_at)
                 VALUES (:id, :email, :pass, :name, :phone, "customer", :ks, 1, :ref, "active", NOW())',
                [
                    'id' => $userId,
                    'email' => $email,
                    'pass' => $passwordHash,
                    'name' => $fullName,
                    'phone' => $phoneNumber,
                    'ks' => $initialKycStatus,
                    'ref' => $referralCode,
                ]
            );

            try {
                $db->execute('UPDATE users SET kyc_level = 1 WHERE id = :id', ['id' => $userId]);
            } catch (Throwable) {
            }

            // 2. Create User Profile row (Level 1 starter profile; optional fields saved if supplied)
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

        // 6. Admin Registration Notification & Email Dispatch
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

        // 7. Record Activity Footprint
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
            ['phone' => $phoneNumber, 'state' => $state ?: null, 'lga' => $lga ?: null, 'referral_code' => $referralCode, 'kyc_level' => 1, 'kyc_status' => $initialKycStatus],
            $request->getIp()
        );

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

        $token = Auth::generateToken($user);
        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? 1);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance']);

        Response::success([
            'user' => $user,
            'token' => $token,
        ], 'Account created at KYC Level 1. Welcome to HAMBAKTECH!', 201);
    }

    public function me(Request $request): void
    {
        $user = Auth::requireAuth($request);
        Response::success(['user' => $user]);
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

        Response::success(null, 'Password updated successfully');
    }

    public function setPin(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $pin = trim((string)($request->input('pin') ?? $request->input('newPin') ?? $request->input('new_pin', '')));
        $currentPin = trim((string)($request->input('current_pin') ?? $request->input('currentPin', '')));

        if (!preg_match('/^[0-9]{4}$/', $pin)) {
            Response::error('Transaction PIN must be exactly 4 digits.', 422);
        }

        $row = $this->db->fetchOne('SELECT transaction_pin_hash FROM users WHERE id = :id', ['id' => $currentUser['id']]);
        $existingHash = $row['transaction_pin_hash'] ?? null;
        if (!empty($existingHash)) {
            if (empty($currentPin) || !Security::verifyPin($currentPin, $existingHash)) {
                Response::error('Invalid current transaction PIN.', 401);
            }
        }

        $pinHash = Security::hashPin($pin);
        $this->db->execute(
            'UPDATE users SET transaction_pin_hash = :hash, updated_at = NOW() WHERE id = :id',
            ['hash' => $pinHash, 'id' => $currentUser['id']]
        );

        Response::success(['has_transaction_pin' => true], 'Transaction PIN updated successfully');
    }

    public function verifyPin(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $pin = trim((string)$request->input('pin', ''));

        if (!preg_match('/^[0-9]{4}$/', $pin)) {
            Response::error('Transaction PIN must be exactly 4 digits.', 422);
        }

        $row = $this->db->fetchOne('SELECT transaction_pin_hash FROM users WHERE id = :id', ['id' => $currentUser['id']]);
        $hash = $row['transaction_pin_hash'] ?? null;

        if (!$hash) {
            Response::error('No transaction PIN configured. Please set your 4-digit PIN first.', 400);
        }

        if (!Security::verifyPin($pin, $hash)) {
            Response::error('Invalid transaction PIN.', 401);
        }

        Response::success(['valid' => true, 'verified' => true], 'Transaction PIN verified');
    }

    /**
     * POST /api/auth/forgot-password
     * Dispatches secure 6-digit OTP code and reset token
     */
    public function forgotPassword(Request $request): void
    {
        $inputEmail = strtolower(trim((string)$request->input('email', '')));
        if ($inputEmail === 'hambak901' || $inputEmail === 'hambak') {
            $inputEmail = 'hambak901@gmail.com';
        }
        $phoneDigits = preg_replace('/[^0-9]/', '', $inputEmail);

        $user = $this->db->fetchOne(
            'SELECT id, email, full_name, role, status FROM users 
             WHERE LOWER(email) = :email 
                OR phone_number = :ident 
                OR (:phone != "" AND REPLACE(REPLACE(REPLACE(phone_number, " ", ""), "-", ""), "+234", "0") = :phone)
             ORDER BY (role = "superadmin") DESC, created_at ASC LIMIT 1',
            [
                'email' => $inputEmail,
                'ident' => $inputEmail,
                'phone' => $phoneDigits,
            ]
        );

        if (!$user) {
            Response::error('No registered account was found with this email address or phone number.', 404);
        }

        $email = strtolower($user['email']);

        if ($user['status'] === 'suspended') {
            Response::error('This account is currently suspended. Please contact enterprise support.', 403);
        }

        // Generate 6-digit OTP code and secure reset token
        $otp = str_pad((string)mt_rand(100000, 999999), 6, '0', STR_PAD_LEFT);
        $resetToken = bin2hex(random_bytes(24));
        $resetId = Security::generateUuid();

        // Invalidate prior unused tokens
        $this->db->execute('DELETE FROM password_resets WHERE email = :email', ['email' => $email]);

        // Insert new reset OTP with 15-minute validity
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

        // Dispatch OTP via MailService
        $mailService = new \HambakTech\Services\MailService();
        $mailResult = $mailService->sendPasswordResetOtp($email, (string)($user['full_name'] ?? 'Customer'), $otp, $resetToken);

        Response::success([
            'email' => $email,
            'token' => $resetToken,
            'expires_in_minutes' => 15,
            'delivery' => $mailResult,
        ], 'A 6-digit verification code has been dispatched to your email address.');
    }

    /**
     * POST /api/auth/verify-otp
     * Validates 6-digit verification code
     */
    public function verifyOtp(Request $request): void
    {
        $email = strtolower(trim((string)$request->input('email', '')));
        if ($email === 'hambak901' || $email === 'hambak') {
            $email = 'hambak901@gmail.com';
        }
        $otp = trim((string)$request->input('otp_code', $request->input('otp', '')));

        if (empty($email) || empty($otp)) {
            Response::error('Email address and 6-digit verification code are required.', 422);
        }

        $record = $this->db->fetchOne(
            'SELECT id, email, otp_code, token, attempts, is_used, expires_at 
             FROM password_resets 
             WHERE email = :email AND is_used = 0 
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
        if ($email === 'hambak901' || $email === 'hambak') {
            $email = 'hambak901@gmail.com';
        }
        $otp = trim((string)$request->input('otp_code', $request->input('otp', '')));
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
                'SELECT id, token, expires_at FROM password_resets WHERE email = :email AND otp_code = :otp AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
                ['email' => $email, 'otp' => $otp]
            );
        } elseif (!empty($token)) {
            $record = $this->db->fetchOne(
                'SELECT id, token, expires_at FROM password_resets WHERE email = :email AND token = :tok AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
                ['email' => $email, 'tok' => $token]
            );
        }

        if (!$record) {
            Response::error('Invalid or expired password reset authorization. Please request a new code.', 400);
        }

        if (strtotime($record['expires_at']) < time()) {
            Response::error('Reset session has expired. Please request a new code.', 400);
        }

        // Hash new password using standard Bcrypt
        $newHash = Security::hashPassword($newPassword);

        // Update user password and clear reset state
        $this->db->execute(
            'UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE email = :email',
            ['hash' => $newHash, 'email' => $email]
        );

        $this->db->execute('UPDATE password_resets SET is_used = 1 WHERE id = :id', ['id' => $record['id']]);

        // Fetch refreshed user record
        $user = $this->db->fetchOne(
            'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                    w.balance as live_balance 
             FROM users u 
             LEFT JOIN wallets w ON w.user_id = u.id 
             WHERE u.email = :email',
            ['email' => $email]
        );

        $jwtToken = Auth::generateToken($user);
        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance']);

        // Log audit event
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "PASSWORD_RESET_SUCCESS", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'email' => $email,
                'details' => json_encode(['role' => $user['role']]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'user' => $user,
            'token' => $jwtToken,
        ], 'Your password has been reset successfully. You are now logged in.');
    }
}
