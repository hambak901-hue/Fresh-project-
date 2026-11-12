<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Auth;
use Hambak\Core\Database;
use Hambak\Services\AuditService;
use Hambak\Services\EmailService;
use InvalidArgumentException;
use PDO;
use RuntimeException;

/**
 * HambakTech Smart Digital Platform v1.0
 * Secure Transaction PIN Service (Argon2id + Throttling + Zero-Plaintext Storage)
 */
class PinService
{
    private static ?PinService $instance = null;
    private Database $db;
    private Auth $auth;
    private AuditService $audit;
    private EmailService $emailService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->auth = new Auth();
        $this->audit = AuditService::getInstance();
        $this->emailService = EmailService::getInstance();
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Checks if a 4-digit PIN is weak / trivial
     */
    public function isWeakPin(string $pin): bool
    {
        $weakPins = [
            '0000', '1111', '2222', '3333', '4444',
            '5555', '6666', '7777', '8888', '9999',
            '1234', '4321', '0123', '3210', '2345',
            '5432', '3456', '6543', '4567', '7654',
            '5678', '8765', '6789', '9876', '1212',
            '2121', '6969', '2580', '0852',
        ];
        return in_array($pin, $weakPins, true);
    }

    /**
     * Creates a new 4-digit transaction PIN for customer
     */
    public function createPin(string $userId, string $pin, string $ip, string $ua): array
    {
        $pin = trim($pin);
        if (!preg_match('/^\d{4}$/', $pin)) {
            throw new InvalidArgumentException('Transaction PIN must be exactly 4 numeric digits.');
        }

        if ($this->isWeakPin($pin)) {
            throw new InvalidArgumentException('PIN is too simple or common. Choose a stronger, non-sequential 4-digit PIN.');
        }

        $conn = $this->db->getConnection();
        $profileStmt = $conn->prepare('SELECT id, kycStatus, transactionPinHash FROM `CustomerProfile` WHERE `userId` = :uid LIMIT 1');
        $profileStmt->execute([':uid' => $userId]);
        $profile = $profileStmt->fetch(PDO::FETCH_ASSOC);

        if (!$profile) {
            throw new RuntimeException('Customer profile not found.');
        }

        if (!empty($profile['transactionPinHash'])) {
            throw new InvalidArgumentException('A transaction PIN is already established. Use the PIN change or reset flow.');
        }

        $pinHash = $this->auth->hashPassword($pin);

        $upd = $conn->prepare("
            UPDATE `CustomerProfile`
            SET `transactionPinHash` = :hash,
                `pinFailedAttempts` = 0,
                `pinLockedUntil` = NULL,
                `pinSetAt` = NOW(3),
                `updatedAt` = NOW(3)
            WHERE `id` = :id
        ");
        $upd->execute([
            ':hash' => $pinHash,
            ':id'   => $profile['id'],
        ]);

        $this->audit->logSecurityEvent(
            'TRANSACTION_PIN_CREATED',
            'LOW',
            $userId,
            ['action' => 'Initial transaction PIN successfully established'],
            $ip,
            $ua
        );

        // Dispatch security notification email
        try {
            $uStmt = $conn->prepare('SELECT `email`, `firstName` FROM `User` WHERE `id` = :uid LIMIT 1');
            $uStmt->execute([':uid' => $userId]);
            $usr = $uStmt->fetch(PDO::FETCH_ASSOC);
            if ($usr && !empty($usr['email'])) {
                $this->emailService->sendTemplate($usr['email'], 'TRANSACTION_PIN_CREATED', [
                    'firstName'   => $usr['firstName'] ?: 'Valued Customer',
                    'timestamp'   => date('F j, Y, g:i a'),
                    'ipAddress'   => $ip,
                    'securityUrl' => 'https://hambaktech.com.ng/portal/settings',
                ]);
            }
        } catch (\Throwable $e) {
            // Logged via CommunicationDelivery
        }

        return [
            'success' => true,
            'message' => 'Transaction PIN created successfully. Your wallet and payments are now secured.',
        ];
    }

    /**
     * Securely verifies a 4-digit transaction PIN server-side with lock-out tracking
     */
    public function verifyPin(string $userId, string $pin, string $ip, string $ua): array
    {
        $pin = trim($pin);
        if (!preg_match('/^\d{4}$/', $pin)) {
            throw new InvalidArgumentException('Transaction PIN must be exactly 4 numeric digits.');
        }

        $conn = $this->db->getConnection();
        $profileStmt = $conn->prepare('
            SELECT id, transactionPinHash, pinFailedAttempts, pinLockedUntil 
            FROM `CustomerProfile` 
            WHERE `userId` = :uid 
            LIMIT 1
        ');
        $profileStmt->execute([':uid' => $userId]);
        $profile = $profileStmt->fetch(PDO::FETCH_ASSOC);

        if (!$profile || empty($profile['transactionPinHash'])) {
            throw new InvalidArgumentException('No transaction PIN is established. Please configure your PIN first.');
        }

        // Check if currently locked
        if (!empty($profile['pinLockedUntil'])) {
            $lockedUntilTs = strtotime($profile['pinLockedUntil']);
            if ($lockedUntilTs > time()) {
                $waitMinutes = ceil(($lockedUntilTs - time()) / 60);
                $this->audit->logSecurityEvent(
                    'TRANSACTION_PIN_LOCKED_ACCESS_ATTEMPT',
                    'MEDIUM',
                    $userId,
                    ['lockedUntil' => $profile['pinLockedUntil'], 'waitMinutes' => $waitMinutes],
                    $ip,
                    $ua
                );
                throw new RuntimeException("Transaction PIN is temporarily locked due to repeated incorrect entries. Please wait {$waitMinutes} minutes or reset your PIN.");
            }
        }

        $isValid = $this->auth->verifyPassword($pin, $profile['transactionPinHash']);

        if (!$isValid) {
            $newAttempts = (int)$profile['pinFailedAttempts'] + 1;
            $lockedSql = "NULL";
            $isLockedNow = false;

            if ($newAttempts >= 5) {
                $isLockedNow = true;
                $upd = $conn->prepare("
                    UPDATE `CustomerProfile`
                    SET `pinFailedAttempts` = :attempts,
                        `pinLockedUntil` = DATE_ADD(NOW(3), INTERVAL 15 MINUTE),
                        `updatedAt` = NOW(3)
                    WHERE `id` = :id
                ");
                $upd->execute([':attempts' => $newAttempts, ':id' => $profile['id']]);

                $this->audit->logSecurityEvent(
                    'TRANSACTION_PIN_LOCKOUT_TRIGGERED',
                    'HIGH',
                    $userId,
                    ['failedAttempts' => $newAttempts, 'lockoutDurationMinutes' => 15],
                    $ip,
                    $ua
                );

                throw new RuntimeException('Incorrect PIN. Maximum attempts reached. Your PIN has been locked for 15 minutes for your security.');
            } else {
                $upd = $conn->prepare("
                    UPDATE `CustomerProfile`
                    SET `pinFailedAttempts` = :attempts,
                        `updatedAt` = NOW(3)
                    WHERE `id` = :id
                ");
                $upd->execute([':attempts' => $newAttempts, ':id' => $profile['id']]);

                $remaining = 5 - $newAttempts;
                $this->audit->logSecurityEvent(
                    'TRANSACTION_PIN_INCORRECT',
                    'LOW',
                    $userId,
                    ['attemptNumber' => $newAttempts, 'attemptsRemaining' => $remaining],
                    $ip,
                    $ua
                );

                throw new InvalidArgumentException("Incorrect transaction PIN. You have {$remaining} attempt" . ($remaining === 1 ? '' : 's') . " remaining before temporary lockout.");
            }
        }

        // On success: reset failed attempts counter
        if ((int)$profile['pinFailedAttempts'] > 0 || !empty($profile['pinLockedUntil'])) {
            $clr = $conn->prepare("
                UPDATE `CustomerProfile`
                SET `pinFailedAttempts` = 0,
                    `pinLockedUntil` = NULL,
                    `updatedAt` = NOW(3)
                WHERE `id` = :id
            ");
            $clr->execute([':id' => $profile['id']]);
        }

        return [
            'valid'    => true,
            'verified' => true,
            'success'  => true,
            'message'  => 'PIN verified successfully.',
        ];
    }

    /**
     * Changes transaction PIN with verified current PIN
     */
    public function changePin(string $userId, string $currentPin, string $newPin, string $ip, string $ua): array
    {
        // First verify current PIN
        $this->verifyPin($userId, $currentPin, $ip, $ua);

        $newPin = trim($newPin);
        if (!preg_match('/^\d{4}$/', $newPin)) {
            throw new InvalidArgumentException('New transaction PIN must be exactly 4 numeric digits.');
        }

        if ($currentPin === $newPin) {
            throw new InvalidArgumentException('New PIN must be different from your current PIN.');
        }

        if ($this->isWeakPin($newPin)) {
            throw new InvalidArgumentException('New PIN is too simple. Choose a stronger, non-sequential 4-digit PIN.');
        }

        $conn = $this->db->getConnection();
        $newHash = $this->auth->hashPassword($newPin);

        $upd = $conn->prepare("
            UPDATE `CustomerProfile`
            SET `transactionPinHash` = :hash,
                `pinFailedAttempts` = 0,
                `pinLockedUntil` = NULL,
                `pinSetAt` = NOW(3),
                `updatedAt` = NOW(3)
            WHERE `userId` = :uid
        ");
        $upd->execute([':hash' => $newHash, ':uid' => $userId]);

        $this->audit->logSecurityEvent(
            'TRANSACTION_PIN_CHANGED',
            'MEDIUM',
            $userId,
            ['action' => 'Transaction PIN modified with current PIN authorization'],
            $ip,
            $ua
        );

        return [
            'success' => true,
            'message' => 'Your transaction PIN has been changed successfully.',
        ];
    }

    /**
     * Requests OTP code to recover/reset a forgotten transaction PIN
     */
    public function requestPinReset(string $userId, string $ip, string $ua): array
    {
        $conn = $this->db->getConnection();
        $uStmt = $conn->prepare('SELECT `id`, `email`, `firstName` FROM `User` WHERE `id` = :uid LIMIT 1');
        $uStmt->execute([':uid' => $userId]);
        $user = $uStmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            throw new RuntimeException('User record not found.');
        }

        // Generate 6-digit OTP code
        $otpCode = sprintf('%06d', random_int(100000, 999999));
        $tokenHash = hash('sha256', $otpCode);

        $upd = $conn->prepare("
            UPDATE `CustomerProfile`
            SET `pinResetTokenHash` = :th,
                `pinResetExpiresAt` = DATE_ADD(NOW(3), INTERVAL 10 MINUTE),
                `updatedAt` = NOW(3)
            WHERE `userId` = :uid
        ");
        $upd->execute([':th' => $tokenHash, ':uid' => $userId]);

        // Send transactional email with OTP code using canonical template
        $this->emailService->sendTemplate(
            $user['email'],
            'TRANSACTION_PIN_RESET',
            [
                'firstName'        => $user['firstName'] ?: 'Valued Customer',
                'otpCode'          => $otpCode,
                'expiresInMinutes' => '10',
            ]
        );

        $this->audit->logSecurityEvent(
            'TRANSACTION_PIN_RESET_REQUESTED',
            'MEDIUM',
            $userId,
            ['action' => 'PIN reset OTP code dispatched to verified email'],
            $ip,
            $ua
        );

        return [
            'success' => true,
            'message' => 'A 6-digit authorization code has been sent to your registered email address.',
        ];
    }

    /**
     * Confirms PIN reset using OTP code and establishes new 4-digit PIN
     */
    public function confirmPinReset(string $userId, string $otpCode, string $newPin, string $ip, string $ua): array
    {
        $otpCode = trim($otpCode);
        $newPin = trim($newPin);

        if (!preg_match('/^\d{6}$/', $otpCode)) {
            throw new InvalidArgumentException('Authorization code must be a 6-digit number.');
        }

        if (!preg_match('/^\d{4}$/', $newPin)) {
            throw new InvalidArgumentException('New transaction PIN must be exactly 4 numeric digits.');
        }

        if ($this->isWeakPin($newPin)) {
            throw new InvalidArgumentException('New PIN is too simple. Choose a stronger, non-sequential 4-digit PIN.');
        }

        $conn = $this->db->getConnection();
        $profileStmt = $conn->prepare('
            SELECT id, pinResetTokenHash, pinResetExpiresAt 
            FROM `CustomerProfile` 
            WHERE `userId` = :uid 
            LIMIT 1
        ');
        $profileStmt->execute([':uid' => $userId]);
        $profile = $profileStmt->fetch(PDO::FETCH_ASSOC);

        if (!$profile || empty($profile['pinResetTokenHash'])) {
            throw new InvalidArgumentException('No active PIN reset request found. Please request a new code.');
        }

        if (empty($profile['pinResetExpiresAt']) || strtotime($profile['pinResetExpiresAt']) < time()) {
            throw new InvalidArgumentException('The PIN reset code has expired. Please request a new one.');
        }

        $providedHash = hash('sha256', $otpCode);
        if (!hash_equals($profile['pinResetTokenHash'], $providedHash)) {
            $this->audit->logSecurityEvent(
                'TRANSACTION_PIN_RESET_FAILED',
                'MEDIUM',
                $userId,
                ['reason' => 'Invalid OTP code'],
                $ip,
                $ua
            );
            throw new InvalidArgumentException('Invalid authorization code. Please verify and try again.');
        }

        $newHash = $this->auth->hashPassword($newPin);

        $upd = $conn->prepare("
            UPDATE `CustomerProfile`
            SET `transactionPinHash` = :hash,
                `pinFailedAttempts` = 0,
                `pinLockedUntil` = NULL,
                `pinSetAt` = NOW(3),
                `pinResetTokenHash` = NULL,
                `pinResetExpiresAt` = NULL,
                `updatedAt` = NOW(3)
            WHERE `id` = :id
        ");
        $upd->execute([':hash' => $newHash, ':id' => $profile['id']]);

        $this->audit->logSecurityEvent(
            'TRANSACTION_PIN_RESET_COMPLETED',
            'HIGH',
            $userId,
            ['action' => 'Transaction PIN successfully recovered and reset via OTP'],
            $ip,
            $ua
        );

        return [
            'success' => true,
            'message' => 'Your transaction PIN has been reset successfully. You can now authorize transactions with your new PIN.',
        ];
    }
}
