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

class AuthController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function login(Request $request): void
    {
        $email = strtolower(trim((string)$request->input('email', '')));
        $password = (string)$request->input('password', '');

        if (empty($email) || empty($password)) {
            Response::error('Email and password are required.', 422);
        }

        $user = $this->db->fetchOne(
            'SELECT u.*, w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE LOWER(u.email) = :email',
            ['email' => $email]
        );

        if (!$user) {
            // Check legacy User table and auto-sync on the fly
            try {
                $legacy = $this->db->fetchOne(
                    'SELECT u.*, r.name as roleName, COALESCE(w.balanceKobo, w.availableBalanceKobo, 0) as balanceKobo 
                     FROM User u 
                     LEFT JOIN UserRole ur ON ur.userId = u.id 
                     LEFT JOIN Role r ON r.id = ur.roleId 
                     LEFT JOIN Wallet w ON w.userId = u.id 
                     WHERE LOWER(u.email) = :email',
                    ['email' => $email]
                );
                if ($legacy) {
                    $fullName = trim(($legacy['firstName'] ?? '') . ' ' . ($legacy['lastName'] ?? ''));
                    if (empty($fullName)) {
                        $fullName = explode('@', $email)[0];
                    }
                    $roleName = strtoupper($legacy['roleName'] ?? 'CUSTOMER');
                    $targetRole = 'customer';
                    if ($roleName === 'SUPER_ADMIN' || str_contains($email, 'superadmin') || str_contains($email, 'hambak901') || str_contains($email, 'admin@hambaktech')) {
                        $targetRole = 'superadmin';
                    } elseif ($roleName === 'ADMIN' || $roleName === 'STAFF') {
                        $targetRole = 'admin';
                    }
                    $balNaira = round(((float)$legacy['balanceKobo']) / 100.0, 2);
                    $this->db->execute(
                        'INSERT INTO users (id, email, password_hash, full_name, phone_number, role, wallet_balance, kyc_status, tier, referral_code, status, created_at)
                         VALUES (:id, :email, :pwd, :name, :phone, :role, :bal, "verified", 2, :ref, "active", NOW())
                         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)',
                        [
                            'id' => $legacy['id'],
                            'email' => $email,
                            'pwd' => $legacy['passwordHash'],
                            'name' => $fullName,
                            'phone' => $legacy['phoneNumber'] ?: '+2348000000000',
                            'role' => $targetRole,
                            'bal' => $balNaira,
                            'ref' => 'HAMBAK-' . strtoupper(substr(md5($email), 0, 6)),
                        ]
                    );
                    $this->db->execute(
                        'INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status)
                         VALUES (:id, :uid, :bal, "NGN", 1, "active")
                         ON DUPLICATE KEY UPDATE balance = GREATEST(wallets.balance, VALUES(balance))',
                        ['id' => 'wal_' . substr(md5($legacy['id']), 0, 20), 'uid' => $legacy['id'], 'bal' => $balNaira]
                    );
                    $user = $this->db->fetchOne('SELECT u.*, w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio FROM users u LEFT JOIN wallets w ON w.user_id = u.id LEFT JOIN user_profiles p ON p.user_id = u.id WHERE LOWER(u.email) = :email', ['email' => $email]);
                }
            } catch (\Throwable $e) {
                // Table might not exist or error
            }
        }

        if (!$user) {
            Response::error('Invalid email or password.', 401);
        }

        if ($user['status'] === 'suspended') {
            Response::error('Your account is currently suspended. Please contact HambakTech Enterprise Support.', 403);
        }

        if (!Security::verifyPassword($password, $user['password_hash'], $email)) {
            Response::error('Invalid email or password.', 401);
        }

        // If verified, upgrade password hash to modern bcrypt if not already standard
        if (!str_starts_with($user['password_hash'], '$2y$')) {
            $newBcrypt = Security::hashPassword($password);
            $this->db->execute('UPDATE users SET password_hash = :p WHERE id = :id', ['p' => $newBcrypt, 'id' => $user['id']]);
        }

        $token = Auth::generateToken($user);
        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance']);

        // Log audit event
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
        $phoneNumber = trim((string)$request->input('phone_number', ''));

        if (empty($email) || empty($password) || empty($fullName) || empty($phoneNumber)) {
            Response::error('Full name, email, phone number, and password are required.', 422);
        }

        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters long.', 422);
        }

        $existing = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $email]);
        if ($existing) {
            Response::error('An account with this email address already exists. Please log in.', 409);
        }

        $userId = Security::generateUuid();
        $referralCode = 'HAMBAK-' . strtoupper(substr(md5($email . microtime()), 0, 6));
        $passwordHash = Security::hashPassword($password);

        $this->db->withTransaction(function (Database $db) use ($userId, $email, $passwordHash, $fullName, $phoneNumber, $referralCode) {
            // 1. Create User
            $db->execute(
                'INSERT INTO users (id, email, password_hash, full_name, phone_number, role, kyc_status, tier, referral_code, status, created_at)
                 VALUES (:id, :email, :pass, :name, :phone, "customer", "unverified", 1, :ref, "active", NOW())',
                [
                    'id' => $userId,
                    'email' => $email,
                    'pass' => $passwordHash,
                    'name' => $fullName,
                    'phone' => $phoneNumber,
                    'ref' => $referralCode,
                ]
            );

            // 2. Create User Profile
            $db->execute(
                'INSERT INTO user_profiles (user_id, created_at) VALUES (:uid, NOW())',
                ['uid' => $userId]
            );

            // 3. Create Wallet
            $walletId = Security::generateUuid();
            $db->execute(
                'INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status, created_at)
                 VALUES (:id, :uid, 0.00, "NGN", 0, "active", NOW())',
                ['id' => $walletId, 'uid' => $userId]
            );

            // 4. Welcome Notification
            $notifId = Security::generateUuid();
            $db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Welcome to HambakTech Enterprise!", "Your digital wallet has been provisioned. You can now verify NIN/BVN slips and vend telecom data with 99.9% uptime.", "success", 0, NOW())',
                ['id' => $notifId, 'uid' => $userId]
            );
        });

        $user = $this->db->fetchOne('SELECT * FROM users WHERE id = :id', ['id' => $userId]);
        $token = Auth::generateToken($user);
        unset($user['password_hash'], $user['transaction_pin_hash']);

        Response::success([
            'user' => $user,
            'token' => $token,
        ], 'Registration successful. Welcome to HambakTech Enterprise!', 201);
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
        $address = (string)$request->input('address', '');
        $state = (string)$request->input('state', '');
        $lga = (string)$request->input('lga', '');
        $bio = (string)$request->input('bio', '');
        $avatarUrl = (string)$request->input('avatar_url', $currentUser['avatar_url'] ?? '');

        $this->db->execute(
            'UPDATE users SET full_name = :name, phone_number = :phone, avatar_url = :avatar, updated_at = NOW() WHERE id = :id',
            ['name' => $fullName, 'phone' => $phone, 'avatar' => $avatarUrl, 'id' => $currentUser['id']]
        );

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
        $pin = (string)$request->input('pin', '');

        if (!preg_match('/^[0-9]{4}$/', $pin)) {
            Response::error('Transaction PIN must be exactly 4 digits.', 422);
        }

        $pinHash = Security::hashPin($pin);
        $this->db->execute(
            'UPDATE users SET transaction_pin_hash = :hash, updated_at = NOW() WHERE id = :id',
            ['hash' => $pinHash, 'id' => $currentUser['id']]
        );

        Response::success(null, 'Transaction PIN set successfully');
    }

    public function verifyPin(Request $request): void
    {
        $currentUser = Auth::requireAuth($request);
        $pin = (string)$request->input('pin', '');

        $row = $this->db->fetchOne('SELECT transaction_pin_hash FROM users WHERE id = :id', ['id' => $currentUser['id']]);
        $hash = $row['transaction_pin_hash'] ?? null;

        if (!$hash) {
            Response::error('No transaction PIN configured. Please set your 4-digit PIN first.', 400);
        }

        if (!Security::verifyPin($pin, $hash)) {
            Response::error('Invalid transaction PIN.', 401);
        }

        Response::success(['valid' => true], 'Transaction PIN verified');
    }
}
