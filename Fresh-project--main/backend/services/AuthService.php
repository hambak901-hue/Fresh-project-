<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Auth;
use Hambak\Core\Database;
use Hambak\Services\EmailService;
use InvalidArgumentException;
use PDO;
use RuntimeException;

/**
 * Authentication Business Logic Service
 */
class AuthService
{
    private Database $db;
    private Auth $auth;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->auth = new Auth();
    }

    public function register(array $data, string $ip, string $ua): array
    {
        $email = strtolower(trim($data['email'] ?? ''));
        $password = (string)($data['password'] ?? '');
        $firstName = trim($data['firstName'] ?? '');
        $lastName = trim($data['lastName'] ?? '');
        $phoneNumber = trim($data['phoneNumber'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid email address format');
        }
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('Password must be at least 8 characters');
        }
        if (empty($firstName) || empty($lastName)) {
            throw new InvalidArgumentException('First name and last name are required');
        }

        $conn = $this->db->getConnection();

        // Check existing user
        $checkStmt = $conn->prepare('SELECT `id` FROM `User` WHERE `email` = :email LIMIT 1');
        $checkStmt->execute([':email' => $email]);
        if ($checkStmt->fetch()) {
            throw new InvalidArgumentException('An account with this email address already exists');
        }

        $userId = 'usr-' . bin2hex(random_bytes(16));
        $passwordHash = $this->auth->hashPassword($password);

        $this->db->beginTransaction();
        try {
            // 1. Insert User
            $userStmt = $conn->prepare(
                'INSERT INTO `User` (`id`, `email`, `passwordHash`, `firstName`, `lastName`, `phoneNumber`, `status`, `twoFactorEnabled`, `emailVerified`, `phoneVerified`, `createdAt`, `updatedAt`)
                 VALUES (:id, :email, :passwordHash, :firstName, :lastName, :phone, \'ACTIVE\', 0, 0, 0, NOW(3), NOW(3))'
            );
            $userStmt->execute([
                ':id'           => $userId,
                ':email'        => $email,
                ':passwordHash' => $passwordHash,
                ':firstName'    => $firstName,
                ':lastName'     => $lastName,
                ':phone'        => $phoneNumber ?: null,
            ]);

            // 2. Assign CUSTOMER Role
            $roleStmt = $conn->prepare('SELECT `id` FROM `Role` WHERE `name` = \'CUSTOMER\' LIMIT 1');
            $roleStmt->execute();
            $roleId = $roleStmt->fetchColumn() ?: 'role-customer';

            $urStmt = $conn->prepare(
                'INSERT INTO `UserRole` (`id`, `userId`, `roleId`, `createdAt`)
                 VALUES (:id, :userId, :roleId, NOW(3))'
            );
            $urStmt->execute([
                ':id'     => 'ur-' . bin2hex(random_bytes(16)),
                ':userId' => $userId,
                ':roleId' => $roleId,
            ]);

            // 3. Initialize Customer Profile with NDPA 2023 terms acceptance
            $termsVersion = !empty($data['termsAcceptedVersion']) ? (string)$data['termsAcceptedVersion'] : 'v1.0';
            $profileStmt = $conn->prepare(
                'INSERT INTO `CustomerProfile` (`id`, `userId`, `termsAcceptedVersion`, `termsAcceptedAt`, `createdAt`, `updatedAt`)
                 VALUES (:id, :userId, :termsVer, NOW(3), NOW(3), NOW(3))'
            );
            $profileStmt->execute([
                ':id'       => 'cp-' . bin2hex(random_bytes(16)),
                ':userId'   => $userId,
                ':termsVer' => $termsVersion,
            ]);

            // 4. Initialize Wallet (zero kobo balance)
            $walletStmt = $conn->prepare(
                'INSERT INTO `Wallet` (`id`, `userId`, `balanceKobo`, `ledgerBalanceKobo`, `isLocked`, `currency`, `createdAt`, `updatedAt`)
                 VALUES (:id, :userId, 0, 0, 0, \'NGN\', NOW(3), NOW(3))'
            );
            $walletStmt->execute([
                ':id'     => 'wal-' . bin2hex(random_bytes(16)),
                ':userId' => $userId,
            ]);

            // 5. Create Email Verification token
            $rawVerificationToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $rawVerificationToken);
            $evStmt = $conn->prepare("
                INSERT INTO `EmailVerification` (`id`, `userId`, `tokenHash`, `expiresAt`, `createdAt`)
                VALUES (:id, :uid, :th, DATE_ADD(NOW(3), INTERVAL 24 HOUR), NOW(3))
            ");
            $evStmt->execute([
                ':id' => 'ev-' . bin2hex(random_bytes(16)),
                ':uid' => $userId,
                ':th' => $tokenHash,
            ]);

            // 6. In-App Notification
            $notifStmt = $conn->prepare("
                INSERT INTO `Notification` (`id`, `userId`, `title`, `message`, `type`, `status`, `createdAt`, `updatedAt`)
                VALUES (:id, :uid, 'Welcome to HambakTech', 'Thank you for registering. Please check your inbox to verify your email address.', 'SECURITY', 'UNREAD', NOW(3), NOW(3))
            ");
            $notifStmt->execute([
                ':id' => 'notif-' . bin2hex(random_bytes(16)),
                ':uid' => $userId,
            ]);

            $this->db->commit();

            // 7. Dispatch Transactional Welcome Email (post-commit, non-blocking)
            try {
                $appUrl = getenv('APP_URL') ?: 'https://hambaktech.com.ng';
                $verificationUrl = $appUrl . '/verify-email?token=' . $rawVerificationToken;
                EmailService::getInstance()->sendTemplate($email, 'WELCOME_VERIFICATION', [
                    'firstName' => $firstName,
                    'lastName' => $lastName,
                    'email' => $email,
                    'verificationUrl' => $verificationUrl,
                ]);
            } catch (\Throwable) {
                // Delivery audited in CommunicationDelivery
            }

            // Create session
            $token = $this->auth->createSession($userId, $ip, $ua);

            return [
                'token' => $token,
                'user'  => [
                    'id'          => $userId,
                    'email'       => $email,
                    'firstName'   => $firstName,
                    'lastName'    => $lastName,
                    'phoneNumber' => $phoneNumber,
                    'role'        => 'customer',
                    'roles'       => ['CUSTOMER'],
                    'emailVerified' => false,
                ],
                'verificationToken' => $rawVerificationToken,
            ];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw new RuntimeException('Failed to create account: ' . $e->getMessage());
        }
    }

    private function ensureFailedLoginTable(PDO $conn): void
    {
        try {
            $conn->exec("
                CREATE TABLE IF NOT EXISTS `FailedLoginAttempt` (
                    `id` VARCHAR(191) NOT NULL PRIMARY KEY,
                    `identifier` VARCHAR(191) NOT NULL,
                    `ipAddress` VARCHAR(45) NOT NULL,
                    `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                    INDEX `idx_failed_login_ident` (`identifier`, `attemptedAt`),
                    INDEX `idx_failed_login_ip` (`ipAddress`, `attemptedAt`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (\Throwable) {
            // Table creation non-blocking
        }
    }

    public function login(string $email, string $password, string $ip, string $ua): array
    {
        $email = strtolower(trim($email));
        $conn = $this->db->getConnection();
        $this->ensureFailedLoginTable($conn);

        $audit = AuditService::getInstance();

        // 1. Brute-Force & Lockout check: 5 attempts within 15 minutes
        try {
            $checkStmt = $conn->prepare("
                SELECT COUNT(*) FROM `FailedLoginAttempt`
                WHERE (`identifier` = :email OR `ipAddress` = :ip)
                  AND `attemptedAt` > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)
            ");
            $checkStmt->execute([':email' => $email, ':ip' => $ip]);
            $failedAttempts = (int)$checkStmt->fetchColumn();

            if ($failedAttempts >= 5) {
                $audit->logSecurityEvent(
                    'ACCOUNT_LOCKOUT_TRIGGERED',
                    'HIGH',
                    null,
                    [
                        'targetEmail'    => $email,
                        'failedAttempts' => $failedAttempts,
                        'reason'         => 'Repeated failed login attempts',
                    ],
                    $ip,
                    $ua
                );
                throw new \RuntimeException('Account temporarily locked due to repeated failed login attempts. Please try again in 15 minutes.');
            }
        } catch (\RuntimeException $e) {
            throw $e;
        } catch (\Throwable) {
            // Non-fatal if table check fails
        }

        try {
            $stmt = $conn->prepare(
                'SELECT `id`, `email`, `passwordHash`, `firstName`, `lastName`, `phoneNumber`, `status`, `twoFactorEnabled`, `emailVerified`, `mustChangePassword`
                 FROM `User`
                 WHERE LOWER(`email`) = :email OR `phoneNumber` = :phone
                 LIMIT 1'
            );
            $stmt->execute([':email' => $email, ':phone' => $email]);
            $user = $stmt->fetch();
        } catch (\Throwable) {
            $stmt = $conn->prepare(
                'SELECT `id`, `email`, `passwordHash`, `firstName`, `lastName`, `phoneNumber`, `status`, `twoFactorEnabled`, `emailVerified`
                 FROM `User`
                 WHERE LOWER(`email`) = :email OR `phoneNumber` = :phone
                 LIMIT 1'
            );
            $stmt->execute([':email' => $email, ':phone' => $email]);
            $user = $stmt->fetch();
        }

        // Check password validity
        $isPasswordValid = ($user && $this->auth->verifyPassword($password, $user['passwordHash']));

        if (!$isPasswordValid) {
            // Record failed attempt
            try {
                $insFail = $conn->prepare("
                    INSERT INTO `FailedLoginAttempt` (`id`, `identifier`, `ipAddress`, `attemptedAt`)
                    VALUES (:id, :ident, :ip, NOW(3))
                ");
                $insFail->execute([
                    ':id'    => 'fla-' . bin2hex(random_bytes(16)),
                    ':ident' => $email,
                    ':ip'    => $ip,
                ]);
            } catch (\Throwable) {}

            // Determine if target is a privileged account
            $isPrivileged = false;
            if ($user) {
                $rStmt = $conn->prepare("
                    SELECT r.`name` FROM `UserRole` ur
                    JOIN `Role` r ON ur.`roleId` = r.`id`
                    WHERE ur.`userId` = :uid AND r.`name` IN ('SUPER_ADMIN', 'ADMIN')
                ");
                $rStmt->execute([':uid' => $user['id']]);
                $isPrivileged = (bool)$rStmt->fetchColumn();
            }

            if ($isPrivileged) {
                $audit->logSecurityEvent(
                    'FAILED_PRIVILEGED_AUTHENTICATION',
                    'HIGH',
                    $user['id'] ?? null,
                    [
                        'targetEmail' => $email,
                        'reason'      => 'Invalid password for administrator account',
                    ],
                    $ip,
                    $ua
                );
            } else {
                $audit->logSecurityEvent(
                    'FAILED_LOGIN_ATTEMPT',
                    'LOW',
                    $user['id'] ?? null,
                    [
                        'targetEmail' => $email,
                        'reason'      => 'Invalid credentials',
                    ],
                    $ip,
                    $ua
                );
            }

            throw new InvalidArgumentException('Invalid email address or password');
        }

        if ($user['status'] !== 'ACTIVE') {
            throw new InvalidArgumentException('Your account is currently ' . strtolower($user['status']));
        }

        // Clear failed attempts on successful authentication
        try {
            $clrStmt = $conn->prepare("DELETE FROM `FailedLoginAttempt` WHERE `identifier` = :email OR `ipAddress` = :ip");
            $clrStmt->execute([':email' => $email, ':ip' => $ip]);
        } catch (\Throwable) {}

        // Update last login
        $upd = $conn->prepare('UPDATE `User` SET `lastLoginAt` = NOW(3) WHERE `id` = :id');
        $upd->execute([':id' => $user['id']]);

        // Create session
        $token = $this->auth->createSession($user['id'], $ip, $ua);

        // Fetch roles
        $rolesStmt = $conn->prepare(
            'SELECT r.`name`
             FROM `UserRole` ur
             JOIN `Role` r ON ur.`roleId` = r.`id`
             WHERE ur.`userId` = :userId'
        );
        $rolesStmt->execute([':userId' => $user['id']]);
        $roles = $rolesStmt->fetchAll(PDO::FETCH_COLUMN);

        unset($user['passwordHash']);
        $user['roles'] = $roles;

        $primaryRole = 'customer';
        $normalizedRoles = array_map('strtoupper', $roles);
        if (in_array('SUPER_ADMIN', $normalizedRoles, true)) {
            $primaryRole = 'super_admin';
            // Audit Super Admin login
            $audit->log(
                'SUPER_ADMIN_LOGIN_SUCCESS',
                'AUTH',
                $user['id'],
                'User',
                $user['id'],
                ['email' => $user['email'], 'authority' => 'SUPER_ADMIN'],
                'SUCCESS',
                $ip
            );
            $audit->logSecurityEvent(
                'SUPER_ADMIN_LOGIN_SUCCESS',
                'LOW',
                $user['id'],
                ['email' => $user['email'], 'authority' => 'SUPER_ADMIN'],
                $ip,
                $ua
            );
        } elseif (in_array('ADMIN', $normalizedRoles, true)) {
            $primaryRole = 'admin';
            $audit->log(
                'ADMIN_LOGIN_SUCCESS',
                'AUTH',
                $user['id'],
                'User',
                $user['id'],
                ['email' => $user['email'], 'authority' => 'ADMIN'],
                'SUCCESS',
                $ip
            );
        } elseif (in_array('CUSTOMER_SERVICE', $normalizedRoles, true)) {
            $primaryRole = 'customer_service';
        } elseif (in_array('STAFF', $normalizedRoles, true)) {
            $primaryRole = 'staff';
        } elseif (in_array('STUDENT', $normalizedRoles, true)) {
            $primaryRole = 'student';
        }
        $user['role'] = $primaryRole;
        $user['mustChangePassword'] = (bool)($user['mustChangePassword'] ?? false);

        return [
            'token'              => $token,
            'user'               => $user,
            'mustChangePassword' => (bool)($user['mustChangePassword'] ?? false),
        ];
    }
}
