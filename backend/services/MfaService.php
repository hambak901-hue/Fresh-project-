<?php
/**
 * @file MfaService.php
 * Multi-Factor Authentication Engine (Email OTP + RFC-6238 TOTP Authenticator + Recovery Codes)
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Database;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\SchemaSync;

class MfaService
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
            'require_mfa_for_superadmin' => false,
            'require_mfa_for_admin' => false,
            'allow_customer_mfa_opt_in' => true,
            'default_mfa_method' => 'email_otp',
            'otp_expiry_minutes' => 10,
            'max_otp_attempts' => 5,
        ];

        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "mfa_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $cfg = json_decode((string)$row['setting_value'], true);
                if (is_array($cfg)) {
                    $defaults = array_merge($defaults, $cfg);
                }
            }
            // Bridge legacy admin_dashboard_settings.require_2fa_for_root
            $admRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "admin_dashboard_settings" LIMIT 1');
            if ($admRow && !empty($admRow['setting_value'])) {
                $adm = json_decode((string)$admRow['setting_value'], true);
                if (is_array($adm) && !empty($adm['require_2fa_for_root'])) {
                    $defaults['require_mfa_for_superadmin'] = true;
                }
            }
        } catch (\Throwable) {
        }

        $defaults['otp_expiry_minutes'] = max(3, min(30, (int)$defaults['otp_expiry_minutes']));
        $defaults['max_otp_attempts'] = max(3, min(10, (int)$defaults['max_otp_attempts']));
        return $defaults;
    }

    public function getRequiredMethodForUser(array $user): ?string
    {
        $policy = $this->getPolicy();
        $role = (string)($user['role'] ?? 'customer');
        $mfaConfig = $this->db->fetchOne('SELECT * FROM user_mfa_configs WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);

        $totpEnabled = !empty($mfaConfig['totp_enabled']);
        $emailEnabled = !empty($mfaConfig['email_otp_enabled']) || !empty($user['mfa_enabled']);

        $requiredByRole = ($role === 'superadmin' && !empty($policy['require_mfa_for_superadmin']))
            || ($role === 'admin' && !empty($policy['require_mfa_for_admin']));

        if (!$totpEnabled && !$emailEnabled && !$requiredByRole) {
            return null;
        }

        if ($totpEnabled) {
            return 'totp';
        }
        return 'email_otp';
    }

    public function createChallenge(array $user, string $method, string $ip = '', string $ua = ''): array
    {
        $policy = $this->getPolicy();
        $expMin = (int)$policy['otp_expiry_minutes'];
        $maxAtt = (int)$policy['max_otp_attempts'];

        $challengeToken = bin2hex(random_bytes(32));
        $otpHash = null;
        $expiresAt = date('Y-m-d H:i:s', time() + ($expMin * 60));

        // Clear older unverified challenges for user
        $this->db->execute('UPDATE mfa_challenges SET is_verified = 1 WHERE user_id = :uid AND is_verified = 0', ['uid' => $user['id']]);

        if ($method === 'email_otp') {
            $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $otpHash = password_hash($code, PASSWORD_BCRYPT, ['cost' => 10]);

            try {
                $mail = new MailService();
                $html = "<p>Hello " . htmlspecialchars((string)($user['full_name'] ?? 'User')) . ",</p>
                         <p>Your HAMBAKTECH security login verification code is:</p>
                         <p style='font-size:22px;font-weight:bold;letter-spacing:4px;'>{$code}</p>
                         <p>Expires in {$expMin} minutes. If you did not attempt this sign-in, change your password immediately.</p>";
                $mail->send((string)$user['email'], (string)($user['full_name'] ?? 'User'), 'HAMBAKTECH Sign-In Verification Code', $html);
            } catch (\Throwable) {
            }
        }

        $this->db->execute(
            'INSERT INTO mfa_challenges (id, user_id, challenge_token, method, otp_hash, attempts, max_attempts, ip_address, user_agent, is_verified, expires_at, created_at)
             VALUES (:id, :uid, :tok, :meth, :oh, 0, :ma, :ip, :ua, 0, :exp, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'tok' => $challengeToken,
                'meth' => $method,
                'oh' => $otpHash,
                'ma' => $maxAtt,
                'ip' => substr($ip, 0, 45),
                'ua' => substr($ua, 0, 255),
                'exp' => $expiresAt,
            ]
        );

        $parts = explode('@', (string)$user['email']);
        $maskedEmail = substr($parts[0] ?? 'u', 0, 2) . '***@' . ($parts[1] ?? '');

        return [
            'mfa_required' => true,
            'challenge_token' => $challengeToken,
            'method' => $method,
            'masked_email' => $maskedEmail,
            'expires_in_minutes' => $expMin,
        ];
    }

    public function verifyChallenge(string $challengeToken, string $code): array
    {
        $row = $this->db->fetchOne('SELECT * FROM mfa_challenges WHERE challenge_token = :tok LIMIT 1', ['tok' => trim($challengeToken)]);
        if (!$row || (int)$row['is_verified'] === 1 || strtotime((string)$row['expires_at']) < time()) {
            Response::error('MFA verification session is invalid or has expired. Please sign in again.', 401, null, 'MFA_EXPIRED');
        }

        $cleanCode = preg_replace('/\s+/', '', trim($code)) ?? '';
        if ($cleanCode === '') {
            Response::error('Please enter your 6-digit verification code or recovery code.', 422);
        }

        $verified = false;
        if ($row['method'] === 'totp') {
            $cfg = $this->db->fetchOne('SELECT totp_secret_encrypted, recovery_codes_hash FROM user_mfa_configs WHERE user_id = :uid LIMIT 1', ['uid' => $row['user_id']]);
            if ($cfg && !empty($cfg['totp_secret_encrypted'])) {
                $secret = $this->decryptSecret((string)$cfg['totp_secret_encrypted']);
                $verified = self::verifyTotp($secret, $cleanCode, 1);
                if (!$verified && !empty($cfg['recovery_codes_hash'])) {
                    $verified = $this->consumeRecoveryCode((string)$row['user_id'], $cleanCode, (string)$cfg['recovery_codes_hash']);
                }
            }
        } else {
            if (!empty($row['otp_hash']) && password_verify($cleanCode, (string)$row['otp_hash'])) {
                $verified = true;
            }
        }

        if (!$verified) {
            $att = ((int)$row['attempts']) + 1;
            $exhausted = $att >= (int)$row['max_attempts'] ? 1 : 0;
            $this->db->execute(
                'UPDATE mfa_challenges SET attempts = :att, is_verified = :iv WHERE id = :id',
                ['att' => $att, 'iv' => $exhausted, 'id' => $row['id']]
            );
            $rem = max(0, (int)$row['max_attempts'] - $att);
            Response::error($exhausted ? 'Too many failed MFA attempts. Please sign in again.' : "Invalid verification code. {$rem} attempt(s) left.", 401);
        }

        $this->db->execute('UPDATE mfa_challenges SET is_verified = 1 WHERE id = :id', ['id' => $row['id']]);
        return $row;
    }

    public function getStatus(string $userId): array
    {
        $policy = $this->getPolicy();
        $user = $this->db->fetchOne('SELECT id, email, role, mfa_enabled, mfa_method FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
        $cfg = $this->db->fetchOne('SELECT totp_enabled, email_otp_enabled, enabled_at, recovery_codes_hash FROM user_mfa_configs WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        $recoveryLeft = 0;
        if ($cfg && !empty($cfg['recovery_codes_hash'])) {
            $arr = json_decode((string)$cfg['recovery_codes_hash'], true);
            if (is_array($arr)) {
                $recoveryLeft = count($arr);
            }
        }
        return [
            'mfa_enabled' => !empty($user['mfa_enabled']) || !empty($cfg['totp_enabled']) || !empty($cfg['email_otp_enabled']),
            'totp_enabled' => !empty($cfg['totp_enabled']),
            'email_otp_enabled' => !empty($cfg['email_otp_enabled']) || (!empty($user['mfa_enabled']) && empty($cfg['totp_enabled'])),
            'recovery_codes_remaining' => $recoveryLeft,
            'policy' => $policy,
        ];
    }

    public function beginTotpSetup(string $userId, string $email): array
    {
        $secret = self::generateBase32Secret(20);
        $enc = $this->encryptSecret($secret);
        $this->db->execute(
            'INSERT INTO user_mfa_configs (user_id, totp_secret_encrypted, totp_enabled, updated_at)
             VALUES (:uid, :sec, 0, NOW())
             ON DUPLICATE KEY UPDATE totp_secret_encrypted = :sec2, updated_at = NOW()',
            ['uid' => $userId, 'sec' => $enc, 'sec2' => $enc]
        );
        $issuer = rawurlencode('HAMBAKTECH');
        $account = rawurlencode($email);
        return [
            'secret' => $secret,
            'otpauth_uri' => "otpauth://totp/{$issuer}:{$account}?secret={$secret}&issuer={$issuer}&digits=6&period=30",
        ];
    }

    public function confirmTotpSetup(string $userId, string $code): array
    {
        $cfg = $this->db->fetchOne('SELECT * FROM user_mfa_configs WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        if (!$cfg || empty($cfg['totp_secret_encrypted'])) {
            Response::error('Please generate a TOTP setup secret first.', 400);
        }
        $secret = $this->decryptSecret((string)$cfg['totp_secret_encrypted']);
        if (!self::verifyTotp($secret, trim($code), 1)) {
            Response::error('Invalid authenticator code. Check your device clock and try again.', 422);
        }

        $plainRecovery = [];
        $hashedRecovery = [];
        for ($i = 0; $i < 8; $i++) {
            $rc = strtoupper(bin2hex(random_bytes(4)));
            $plainRecovery[] = $rc;
            $hashedRecovery[] = password_hash($rc, PASSWORD_BCRYPT, ['cost' => 10]);
        }

        $this->db->withTransaction(function (Database $db) use ($userId, $hashedRecovery) {
            $db->execute(
                'UPDATE user_mfa_configs SET totp_enabled = 1, recovery_codes_hash = :rc, enabled_at = NOW() WHERE user_id = :uid',
                ['rc' => json_encode($hashedRecovery), 'uid' => $userId]
            );
            $db->execute('UPDATE users SET mfa_enabled = 1, mfa_method = "totp" WHERE id = :uid', ['uid' => $userId]);
        });

        return [
            'totp_enabled' => true,
            'recovery_codes' => $plainRecovery,
        ];
    }

    public function setEmailOtpEnabled(string $userId, bool $enabled): array
    {
        $this->db->execute(
            'INSERT INTO user_mfa_configs (user_id, email_otp_enabled, enabled_at, updated_at)
             VALUES (:uid, :en, NOW(), NOW())
             ON DUPLICATE KEY UPDATE email_otp_enabled = :en2, updated_at = NOW()',
            ['uid' => $userId, 'en' => $enabled ? 1 : 0, 'en2' => $enabled ? 1 : 0]
        );
        $cfg = $this->db->fetchOne('SELECT totp_enabled, email_otp_enabled FROM user_mfa_configs WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        $any = !empty($cfg['totp_enabled']) || !empty($cfg['email_otp_enabled']);
        $method = !empty($cfg['totp_enabled']) ? 'totp' : 'email_otp';
        $this->db->execute(
            'UPDATE users SET mfa_enabled = :mfa, mfa_method = :meth WHERE id = :uid',
            ['mfa' => $any ? 1 : 0, 'meth' => $method, 'uid' => $userId]
        );
        return $this->getStatus($userId);
    }

    public function disableAllMfa(string $userId): array
    {
        $this->db->execute('UPDATE user_mfa_configs SET totp_enabled = 0, email_otp_enabled = 0, totp_secret_encrypted = NULL, recovery_codes_hash = NULL WHERE user_id = :uid', ['uid' => $userId]);
        $this->db->execute('UPDATE users SET mfa_enabled = 0, mfa_method = "email_otp" WHERE id = :uid', ['uid' => $userId]);
        return $this->getStatus($userId);
    }

    private function consumeRecoveryCode(string $userId, string $code, string $jsonHashes): bool
    {
        $hashes = json_decode($jsonHashes, true);
        if (!is_array($hashes)) {
            return false;
        }
        $clean = strtoupper(trim($code));
        foreach ($hashes as $idx => $h) {
            if (is_string($h) && password_verify($clean, $h)) {
                unset($hashes[$idx]);
                $this->db->execute(
                    'UPDATE user_mfa_configs SET recovery_codes_hash = :rc WHERE user_id = :uid',
                    ['rc' => json_encode(array_values($hashes)), 'uid' => $userId]
                );
                return true;
            }
        }
        return false;
    }

    private function encryptionKey(): string
    {
        $config = require __DIR__ . '/../config/config.php';
        $raw = (string)($config['security']['jwt_secret'] ?? getenv('APP_KEY') ?: 'hambaktech-default-key');
        return hash('sha256', $raw, true);
    }

    private function encryptSecret(string $plain): string
    {
        $iv = random_bytes(16);
        $cipher = openssl_encrypt($plain, 'AES-256-CBC', $this->encryptionKey(), OPENSSL_RAW_DATA, $iv);
        return base64_encode($iv . ($cipher ?: ''));
    }

    private function decryptSecret(string $encoded): string
    {
        $raw = base64_decode($encoded, true);
        if (!$raw || strlen($raw) < 17) {
            return '';
        }
        $iv = substr($raw, 0, 16);
        $cipher = substr($raw, 16);
        return (string)(openssl_decrypt($cipher, 'AES-256-CBC', $this->encryptionKey(), OPENSSL_RAW_DATA, $iv) ?: '');
    }

    public static function generateBase32Secret(int $bytes = 20): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $raw = random_bytes($bytes);
        $bits = '';
        for ($i = 0; $i < strlen($raw); $i++) {
            $bits .= str_pad(decbin(ord($raw[$i])), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        for ($i = 0; $i < strlen($bits); $i += 5) {
            $chunk = str_pad(substr($bits, $i, 5), 5, '0', STR_PAD_RIGHT);
            $out .= $alphabet[bindec($chunk)];
        }
        return $out;
    }

    private static function base32Decode(string $secret): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $clean = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $secret) ?? '');
        $bits = '';
        for ($i = 0; $i < strlen($clean); $i++) {
            $pos = strpos($alphabet, $clean[$i]);
            if ($pos === false) continue;
            $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        for ($i = 0; $i + 8 <= strlen($bits); $i += 8) {
            $out .= chr(bindec(substr($bits, $i, 8)));
        }
        return $out;
    }

    public static function computeTotp(string $base32Secret, ?int $timestamp = null, int $period = 30, int $digits = 6): string
    {
        $key = self::base32Decode($base32Secret);
        $ts = $timestamp ?? time();
        $counter = intdiv($ts, $period);
        $binCounter = pack('N*', 0, $counter);
        $hash = hash_hmac('sha1', $binCounter, $key, true);
        $offset = ord($hash[strlen($hash) - 1]) & 0x0f;
        $truncated = ((ord($hash[$offset]) & 0x7f) << 24)
            | ((ord($hash[$offset + 1]) & 0xff) << 16)
            | ((ord($hash[$offset + 2]) & 0xff) << 8)
            | (ord($hash[$offset + 3]) & 0xff);
        $mod = 10 ** $digits;
        return str_pad((string)($truncated % $mod), $digits, '0', STR_PAD_LEFT);
    }

    public static function verifyTotp(string $base32Secret, string $code, int $window = 1): bool
    {
        $clean = preg_replace('/\D/', '', $code) ?? '';
        if (strlen($clean) !== 6) {
            return false;
        }
        $now = time();
        for ($w = -$window; $w <= $window; $w++) {
            $candidate = self::computeTotp($base32Secret, $now + ($w * 30));
            if (hash_equals($candidate, $clean)) {
                return true;
            }
        }
        return false;
    }
}
