<?php
/**
 * @file PinSecurityService.php
 * Centralized Compulsory Transaction PIN Policy, Verification, Lockout & OTP Recovery Engine
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Database;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\SchemaSync;

class PinSecurityService
{
    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?: Database::getInstance();
        SchemaSync::syncSecurityAndReferralSchema($this->db);
    }

    public function getPolicy(): array
    {
        $defaults = [
            'enforce_transaction_pin' => true,
            'require_pin_activation_for_all_customers' => true,
            'pin_length' => 4,
            'allow_weak_pins' => false,
            'pin_max_attempts' => 5,
            'pin_lockout_minutes' => 15,
            'otp_reset_expiry_minutes' => 15,
            'protected_categories' => [
                'telecom_data' => true,
                'telecom_airtime' => true,
                'telecom_pins' => true,
                'telecom_swap' => true,
                'telecom_bills' => true,
                'telecom_bulksms' => true,
                'identity_verification' => true,
                'identity_modification' => true,
                'identity_enrolment' => true,
                'referral_wallet_conversion' => true,
                'referral_withdrawal' => true,
            ],
        ];

        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "pin_policy_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $cfg = json_decode((string)$row['setting_value'], true);
                if (is_array($cfg)) {
                    if (isset($cfg['protected_categories']) && is_array($cfg['protected_categories'])) {
                        $cfg['protected_categories'] = array_merge($defaults['protected_categories'], $cfg['protected_categories']);
                    }
                    $defaults = array_merge($defaults, $cfg);
                }
            }
            // Also honor security_settings overrides safely
            $secRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "security_settings" LIMIT 1');
            if ($secRow && !empty($secRow['setting_value'])) {
                $sec = json_decode((string)$secRow['setting_value'], true);
                if (is_array($sec)) {
                    if (array_key_exists('enforce_transaction_pin', $sec) && !isset($row)) {
                        $defaults['enforce_transaction_pin'] = (bool)$sec['enforce_transaction_pin'];
                    }
                    if (!isset($row['setting_value']) && isset($sec['pin_max_attempts'])) {
                        $defaults['pin_max_attempts'] = (int)$sec['pin_max_attempts'];
                    }
                    if (!isset($row['setting_value']) && isset($sec['pin_lockout_minutes'])) {
                        $defaults['pin_lockout_minutes'] = (int)$sec['pin_lockout_minutes'];
                    }
                }
            }
        } catch (\Throwable) {
        }

        // Enforce safe parameter floors & ceilings
        $defaults['pin_length'] = max(4, min(6, (int)$defaults['pin_length']));
        $defaults['pin_max_attempts'] = max(3, min(10, (int)$defaults['pin_max_attempts']));
        $defaults['pin_lockout_minutes'] = max(5, min(120, (int)$defaults['pin_lockout_minutes']));
        $defaults['otp_reset_expiry_minutes'] = max(5, min(60, (int)$defaults['otp_reset_expiry_minutes']));

        return $defaults;
    }

    public function getPublicPolicy(): array
    {
        $p = $this->getPolicy();
        return [
            'enforce_transaction_pin' => (bool)$p['enforce_transaction_pin'],
            'require_pin_activation_for_all_customers' => (bool)$p['require_pin_activation_for_all_customers'],
            'pin_length' => (int)$p['pin_length'],
            'allow_weak_pins' => (bool)$p['allow_weak_pins'],
            'pin_max_attempts' => (int)$p['pin_max_attempts'],
            'pin_lockout_minutes' => (int)$p['pin_lockout_minutes'],
            'protected_categories' => $p['protected_categories'],
        ];
    }

    public function validatePinFormat(string $pin, ?array $policy = null): ?string
    {
        $p = $policy ?: $this->getPolicy();
        $len = (int)$p['pin_length'];
        if (!preg_match('/^\d{' . $len . '}$/', $pin)) {
            return "Transaction PIN must be exactly {$len} numeric digits.";
        }
        return null;
    }

    public function isWeakPin(string $pin, array $user = []): ?string
    {
        $len = strlen($pin);
        if ($len === 0) {
            return 'Transaction PIN cannot be empty.';
        }

        // All identical digits (0000, 111111)
        if (count(array_unique(str_split($pin))) === 1) {
            return 'Weak PIN rejected: avoid repeating the same digit (e.g., ' . str_repeat($pin[0], $len) . ').';
        }

        // Ascending or descending sequential patterns (1234, 4321, 012345, etc.)
        $asc = '01234567890';
        $desc = '09876543210';
        if (str_contains($asc, $pin) || str_contains($desc, $pin)) {
            return 'Weak PIN rejected: sequential number patterns (like 1234 or 4321) are not allowed.';
        }

        // Repeated two-digit pairs (1212, 2323, 1010) or mirror patterns (1221, 1122)
        if ($len === 4 && ($pin[0] === $pin[2] && $pin[1] === $pin[3])) {
            return 'Weak PIN rejected: alternating pairs like 1212 are easy to guess.';
        }
        if ($len === 4 && ($pin[0] === $pin[1] && $pin[2] === $pin[3])) {
            return 'Weak PIN rejected: double-pair PINs like 1122 are not allowed.';
        }

        $commonWeak = ['2580', '0852', '2468', '1357', '1990', '1995', '2000', '2020', '2024', '2025', '2026', '12345', '54321', '123456', '654321'];
        if (in_array($pin, $commonWeak, true)) {
            return 'Weak PIN rejected: please choose a less predictable PIN combination.';
        }

        // Phone number substring check
        $phoneDigits = preg_replace('/\D/', '', (string)($user['phone_number'] ?? $user['phone_normalized'] ?? '')) ?? '';
        if (strlen($phoneDigits) >= $len && str_contains($phoneDigits, $pin)) {
            return 'Weak PIN rejected: your PIN cannot match part of your registered phone number.';
        }

        return null;
    }

    public function requiresPinForOperation(string $categoryKey, ?string $serviceKey = null): bool
    {
        $policy = $this->getPolicy();
        if (empty($policy['enforce_transaction_pin'])) {
            return false;
        }

        $catEnabled = (bool)($policy['protected_categories'][$categoryKey] ?? true);
        if (!$catEnabled) {
            return false;
        }

        if ($serviceKey !== null && $serviceKey !== '') {
            try {
                $rule = $this->db->fetchOne(
                    'SELECT require_pin, requires_pin FROM service_security_rules WHERE service_key = :sk AND is_active = 1 LIMIT 1',
                    ['sk' => $serviceKey]
                );
                if ($rule) {
                    $val = $rule['requires_pin'] ?? $rule['require_pin'] ?? 1;
                    return (bool)$val;
                }
            } catch (\Throwable) {
            }
        }

        return true;
    }

    /**
     * Centralized server-side PIN enforcement gate for all financial, telecom, verification,
     * modification, enrolment, wallet conversion, and bank withdrawal endpoints.
     */
    public function requireValidPin(array $user, array $body, string $categoryKey, ?string $serviceKey = null): void
    {
        if (!$this->requiresPinForOperation($categoryKey, $serviceKey)) {
            return;
        }

        $policy = $this->getPolicy();
        $pinLength = (int)$policy['pin_length'];
        $maxAttempts = (int)$policy['pin_max_attempts'];
        $lockoutMinutes = (int)$policy['pin_lockout_minutes'];

        $row = $this->db->fetchOne(
            'SELECT id, email, phone_number, status, transaction_pin_hash, pin_failed_attempts, pin_locked_until
             FROM users WHERE id = :id LIMIT 1',
            ['id' => $user['id']]
        );

        if (!$row || ($row['status'] ?? 'active') !== 'active') {
            Response::forbidden('Account is not active for protected operations.');
        }

        if (empty($row['transaction_pin_hash'])) {
            Response::error(
                'Compulsory Transaction PIN activation is required before performing this operation. Please set your Transaction PIN.',
                403,
                [
                    'requires_pin_setup' => true,
                    'pin_length' => $pinLength,
                ],
                'PIN_SETUP_REQUIRED'
            );
        }

        // Check temporary lockout
        if (!empty($row['pin_locked_until'])) {
            $lockedUntilTs = strtotime((string)$row['pin_locked_until']);
            if ($lockedUntilTs !== false && $lockedUntilTs > time()) {
                $remainingSec = $lockedUntilTs - time();
                $remainingMin = max(1, (int)ceil($remainingSec / 60));
                Response::error(
                    "Transaction PIN is temporarily locked due to too many incorrect attempts. Try again in {$remainingMin} minute(s) or reset via OTP.",
                    423,
                    [
                        'pin_locked' => true,
                        'locked_until' => date('c', $lockedUntilTs),
                        'remaining_seconds' => $remainingSec,
                    ],
                    'PIN_LOCKED'
                );
            }
        }

        $suppliedPin = trim((string)($body['transaction_pin'] ?? $body['pin'] ?? ''));
        if ($suppliedPin === '') {
            Response::error(
                "Please enter your {$pinLength}-digit Transaction PIN to authorize this transaction.",
                422,
                [
                    'requires_pin' => true,
                    'pin_length' => $pinLength,
                ],
                'PIN_REQUIRED'
            );
        }

        if (!Security::verifyPin($suppliedPin, (string)$row['transaction_pin_hash'])) {
            $attempts = ((int)($row['pin_failed_attempts'] ?? 0)) + 1;
            if ($attempts >= $maxAttempts) {
                $lockUntil = date('Y-m-d H:i:s', time() + ($lockoutMinutes * 60));
                $this->db->execute(
                    'UPDATE users SET pin_failed_attempts = :att, pin_locked_until = :lu WHERE id = :id',
                    ['att' => $attempts, 'lu' => $lockUntil, 'id' => $user['id']]
                );
                $this->logPinAudit($user['id'], $row['email'], $user['id'], 'PIN_LOCKED_OUT', [
                    'category' => $categoryKey,
                    'attempts' => $attempts,
                    'lockout_minutes' => $lockoutMinutes,
                ]);
                Response::error(
                    "Too many failed Transaction PIN attempts. Your PIN has been locked for {$lockoutMinutes} minutes. Use Forgot PIN to reset via OTP.",
                    423,
                    [
                        'pin_locked' => true,
                        'locked_until' => date('c', strtotime($lockUntil)),
                        'remaining_seconds' => $lockoutMinutes * 60,
                    ],
                    'PIN_LOCKED'
                );
            }

            $this->db->execute(
                'UPDATE users SET pin_failed_attempts = :att WHERE id = :id',
                ['att' => $attempts, 'id' => $user['id']]
            );
            $remaining = $maxAttempts - $attempts;
            $this->logPinAudit($user['id'], $row['email'], $user['id'], 'PIN_VERIFY_FAILED', [
                'category' => $categoryKey,
                'attempts' => $attempts,
                'remaining' => $remaining,
            ]);

            Response::error(
                "Incorrect Transaction PIN. {$remaining} attempt(s) remaining before temporary lockout.",
                401,
                [
                    'invalid_pin' => true,
                    'attempts_remaining' => $remaining,
                    'pin_length' => $pinLength,
                ],
                'INVALID_PIN'
            );
        }

        // Success: reset failure counters cleanly
        if ((int)($row['pin_failed_attempts'] ?? 0) > 0 || !empty($row['pin_locked_until'])) {
            $this->db->execute(
                'UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = :id',
                ['id' => $user['id']]
            );
        }
    }

    public function setOrUpdatePin(string $userId, string $newPin, ?string $currentPin = null, bool $requireCurrentIfSet = true): array
    {
        $policy = $this->getPolicy();
        $row = $this->db->fetchOne(
            'SELECT id, email, phone_number, phone_normalized, transaction_pin_hash, pin_failed_attempts, pin_locked_until FROM users WHERE id = :id LIMIT 1',
            ['id' => $userId]
        );
        if (!$row) {
            Response::notFound('User account not found.');
        }

        if ($formatErr = $this->validatePinFormat($newPin, $policy)) {
            Response::error($formatErr, 422);
        }
        if (empty($policy['allow_weak_pins'])) {
            if ($weakErr = $this->isWeakPin($newPin, $row)) {
                Response::error($weakErr, 422);
            }
        }

        $hasExisting = !empty($row['transaction_pin_hash']);
        if ($hasExisting && $requireCurrentIfSet) {
            // Check lockout before checking current PIN
            if (!empty($row['pin_locked_until']) && strtotime((string)$row['pin_locked_until']) > time()) {
                Response::error('Your Transaction PIN is currently locked. Please use Forgot PIN (OTP reset) or wait until lockout expires.', 423, null, 'PIN_LOCKED');
            }
            $curr = trim((string)$currentPin);
            if ($curr === '') {
                Response::error('Your current Transaction PIN is required before setting a new PIN.', 422);
            }
            if (!Security::verifyPin($curr, (string)$row['transaction_pin_hash'])) {
                Response::error('Current Transaction PIN is incorrect.', 401);
            }
            if (Security::verifyPin($newPin, (string)$row['transaction_pin_hash'])) {
                Response::error('New Transaction PIN must be different from your current PIN.', 422);
            }
        }

        $hash = Security::hashPin($newPin);
        $this->db->execute(
            'UPDATE users SET transaction_pin_hash = :h, pin_failed_attempts = 0, pin_locked_until = NULL, pin_set_at = NOW(), updated_at = NOW() WHERE id = :id',
            ['h' => $hash, 'id' => $userId]
        );

        $this->logPinAudit($userId, $row['email'], $userId, $hasExisting ? 'PIN_CHANGED' : 'PIN_ACTIVATED', [
            'pin_length' => strlen($newPin),
        ]);

        return [
            'has_transaction_pin' => true,
            'pin_length' => (int)$policy['pin_length'],
        ];
    }

    public function requestOtpReset(string $userId, string $ip = ''): array
    {
        $policy = $this->getPolicy();
        $user = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :id AND status = "active" LIMIT 1', ['id' => $userId]);
        if (!$user) {
            Response::notFound('Account not found.');
        }

        $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $otpHash = password_hash($otp, PASSWORD_BCRYPT, ['cost' => 10]);
        $expMins = (int)$policy['otp_reset_expiry_minutes'];
        $expiresAt = date('Y-m-d H:i:s', time() + ($expMins * 60));

        // Invalidate prior unused OTP requests for this user
        $this->db->execute('UPDATE pin_reset_requests SET is_used = 1 WHERE user_id = :uid AND is_used = 0', ['uid' => $userId]);

        $reqId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO pin_reset_requests (id, user_id, email, otp_hash, attempts, max_attempts, is_used, expires_at, created_at)
             VALUES (:id, :uid, :em, :oh, 0, 5, 0, :exp, NOW())',
            [
                'id' => $reqId,
                'uid' => $userId,
                'em' => $user['email'],
                'oh' => $otpHash,
                'exp' => $expiresAt,
            ]
        );

        // Deliver OTP strictly via email (never expose OTP in API response)
        try {
            $mail = new MailService();
            $subject = 'HAMBAKTECH Transaction PIN Reset OTP';
            $html = "<p>Hello " . htmlspecialchars((string)$user['full_name']) . ",</p>
                     <p>You requested to reset your Transaction PIN on HAMBAKTECH.</p>
                     <p>Your one-time verification code is: <strong style='font-size:20px;letter-spacing:3px;'>{$otp}</strong></p>
                     <p>This code expires in {$expMins} minutes. If you did not initiate this request, please secure your account password immediately.</p>";
            $mail->send((string)$user['email'], (string)($user['full_name'] ?? 'Customer'), $subject, $html);
        } catch (\Throwable) {
        }

        $this->logPinAudit($userId, $user['email'], $userId, 'PIN_OTP_RESET_REQUESTED', ['ip' => $ip]);

        $emailParts = explode('@', (string)$user['email']);
        $maskedEmail = substr($emailParts[0] ?? 'u', 0, 2) . '***@' . ($emailParts[1] ?? '');

        return [
            'sent' => true,
            'masked_email' => $maskedEmail,
            'expires_in_minutes' => $expMins,
        ];
    }

    public function confirmOtpReset(string $userId, string $otp, string $newPin): array
    {
        $policy = $this->getPolicy();
        $user = $this->db->fetchOne('SELECT id, email, phone_number, phone_normalized FROM users WHERE id = :id AND status = "active" LIMIT 1', ['id' => $userId]);
        if (!$user) {
            Response::notFound('User not found.');
        }

        $req = $this->db->fetchOne(
            'SELECT * FROM pin_reset_requests WHERE user_id = :uid AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
            ['uid' => $userId]
        );
        if (!$req || strtotime((string)$req['expires_at']) < time()) {
            Response::error('PIN reset OTP is invalid or has expired. Please request a new code.', 400);
        }

        $cleanOtp = trim($otp);
        if ($cleanOtp === '' || !password_verify($cleanOtp, (string)$req['otp_hash'])) {
            $att = ((int)$req['attempts']) + 1;
            $usedFlag = $att >= (int)$req['max_attempts'] ? 1 : 0;
            $this->db->execute(
                'UPDATE pin_reset_requests SET attempts = :att, is_used = :used WHERE id = :id',
                ['att' => $att, 'used' => $usedFlag, 'id' => $req['id']]
            );
            Response::error('Invalid OTP code provided.', 401);
        }

        if ($formatErr = $this->validatePinFormat($newPin, $policy)) {
            Response::error($formatErr, 422);
        }
        if (empty($policy['allow_weak_pins'])) {
            if ($weakErr = $this->isWeakPin($newPin, $user)) {
                Response::error($weakErr, 422);
            }
        }

        $this->db->withTransaction(function (Database $db) use ($req, $userId, $newPin) {
            $db->execute('UPDATE pin_reset_requests SET is_used = 1 WHERE id = :id', ['id' => $req['id']]);
            $db->execute(
                'UPDATE users SET transaction_pin_hash = :h, pin_failed_attempts = 0, pin_locked_until = NULL, pin_set_at = NOW(), updated_at = NOW() WHERE id = :id',
                ['h' => Security::hashPin($newPin), 'id' => $userId]
            );
        });

        $this->logPinAudit($userId, $user['email'], $userId, 'PIN_OTP_RESET_COMPLETED', []);

        return ['has_transaction_pin' => true, 'pin_length' => (int)$policy['pin_length']];
    }

    public function adminUnlockUserPin(string $targetUserId, array $admin, string $ip = ''): array
    {
        $target = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :id LIMIT 1', ['id' => $targetUserId]);
        if (!$target) {
            Response::notFound('Target user not found.');
        }

        $this->db->execute(
            'UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = NOW() WHERE id = :id',
            ['id' => $targetUserId]
        );

        $this->logPinAudit($admin['id'], $admin['email'], $targetUserId, 'ADMIN_PIN_UNLOCKED', ['ip' => $ip]);

        return ['user_id' => $targetUserId, 'email' => $target['email'], 'unlocked' => true];
    }

    public function adminResetUserPin(string $targetUserId, array $admin, string $mode = 'force_reactivate', ?string $newPin = null, string $ip = ''): array
    {
        $target = $this->db->fetchOne('SELECT id, email, full_name, phone_number, phone_normalized, role FROM users WHERE id = :id LIMIT 1', ['id' => $targetUserId]);
        if (!$target) {
            Response::notFound('Target user not found.');
        }
        if (($target['role'] ?? 'customer') === 'superadmin' && ($admin['role'] ?? '') !== 'superadmin') {
            Response::forbidden('Only a Super Admin can reset a Super Admin Transaction PIN.');
        }

        if ($mode === 'set_temporary' && $newPin !== null && trim($newPin) !== '') {
            $policy = $this->getPolicy();
            if ($formatErr = $this->validatePinFormat($newPin, $policy)) {
                Response::error($formatErr, 422);
            }
            if (empty($policy['allow_weak_pins'])) {
                if ($weakErr = $this->isWeakPin($newPin, $target)) {
                    Response::error($weakErr, 422);
                }
            }
            $this->db->execute(
                'UPDATE users SET transaction_pin_hash = :h, pin_failed_attempts = 0, pin_locked_until = NULL, pin_set_at = NOW(), pin_updated_by_admin_at = NOW(), updated_at = NOW() WHERE id = :id',
                ['h' => Security::hashPin($newPin), 'id' => $targetUserId]
            );
            $hasPin = true;
        } else {
            // Clear hash so user is forced through Compulsory PIN Activation on next action/login
            $this->db->execute(
                'UPDATE users SET transaction_pin_hash = NULL, pin_failed_attempts = 0, pin_locked_until = NULL, pin_updated_by_admin_at = NOW(), updated_at = NOW() WHERE id = :id',
                ['id' => $targetUserId]
            );
            $hasPin = false;
        }

        // Never log plaintext PIN
        $this->logPinAudit($admin['id'], $admin['email'], $targetUserId, 'ADMIN_PIN_RESET', [
            'mode' => $mode,
            'ip' => $ip,
        ]);

        try {
            $mail = new MailService();
            $msg = $hasPin
                ? 'An administrator has updated your HAMBAKTECH Transaction PIN.'
                : 'An administrator has reset your HAMBAKTECH Transaction PIN. Please activate a new PIN on your next login.';
            $mail->send((string)$target['email'], (string)($target['full_name'] ?? 'Customer'), 'HAMBAKTECH Transaction PIN Notice', "<p>Hello " . htmlspecialchars((string)$target['full_name']) . ",</p><p>{$msg}</p>");
        } catch (\Throwable) {
        }

        return ['user_id' => $targetUserId, 'has_transaction_pin' => $hasPin, 'mode' => $mode];
    }

    private function logPinAudit(?string $actorId, ?string $actorEmail, ?string $targetUserId, string $action, array $details): void
    {
        try {
            $this->db->execute(
                'INSERT INTO referral_audit_logs (id, actor_user_id, actor_email, target_user_id, action, entity_type, entity_id, details, ip_address, created_at)
                 VALUES (:id, :aid, :aem, :tuid, :act, "pin_security", :eid, :det, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'aid' => $actorId,
                    'aem' => $actorEmail,
                    'tuid' => $targetUserId,
                    'act' => $action,
                    'eid' => $targetUserId,
                    'det' => json_encode($details),
                    'ip' => (string)($details['ip'] ?? ($_SERVER['REMOTE_ADDR'] ?? '')),
                ]
            );
        } catch (\Throwable) {
        }
    }
}
