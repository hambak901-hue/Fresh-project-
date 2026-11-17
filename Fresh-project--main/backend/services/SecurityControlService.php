<?php
/**
 * @file SecurityControlService.php
 * Centralized Enterprise Security Enforcement Engine:
 * - Server-backed Session Tracking, Idle Timeouts, Concurrent Limits & Revocation
 * - Super Admin & Admin MFA (Email OTP + RFC 6238 TOTP Authenticator)
 * - Persistent Brute-Force Lockouts (Login, OTP, Transaction PIN) & API Rate Limiting
 * - Granular RBAC & Target Protection Against Privilege Escalation
 * - Security Events Telemetry & Login Alert Notifications
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use Throwable;

class SecurityControlService
{
    private static bool $schemaEnsured = false;

    public const DEFAULT_POLICIES = [
        'require_mfa_for_superadmin' => true,
        'require_mfa_for_admin' => false,
        'admin_session_timeout_minutes' => 60,
        'customer_session_timeout_minutes' => 120,
        'jwt_expiry_days' => 7,
        'max_concurrent_sessions_admin' => 3,
        'max_concurrent_sessions_customer' => 5,
        'max_failed_attempts' => 5,
        'lockout_duration_minutes' => 15,
        'pin_max_attempts' => 3,
        'pin_lockout_minutes' => 30,
        'min_password_length' => 8,
        'require_uppercase' => false,
        'require_number' => false,
        'require_special' => false,
        'strict_ip_whitelist_enabled' => false,
        'allowed_admin_ips' => '',
        'rate_limit_requests_per_minute' => 120,
        'ip_rate_limiting_enabled' => true,
        'login_alerts_enabled' => true,
        'superadmin_login_alerts' => true,
        'enforce_transaction_pin' => true,
        'emergency_lockdown' => false,
    ];

    public const ADMIN_PERMISSION_SCOPES = [
        'customers',
        'wallet',
        'kyc',
        'services',
        'cms',
        'audit',
        'support',
        'reports',
        'staff',
        'security',
    ];

    public static function ensureSchema(Database $db): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;

        $tables = [
            'user_sessions' => 'CREATE TABLE IF NOT EXISTS user_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                token_jti VARCHAR(64) NOT NULL UNIQUE,
                user_role VARCHAR(32) NOT NULL DEFAULT "customer",
                ip_address VARCHAR(64) NOT NULL DEFAULT "",
                user_agent VARCHAR(512) NULL,
                device_label VARCHAR(120) NULL,
                last_active_at DATETIME NOT NULL,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NULL,
                revoke_reason VARCHAR(120) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_us_user (user_id),
                INDEX idx_us_active (user_id, revoked_at, expires_at),
                INDEX idx_us_jti (token_jti)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'mfa_challenges' => 'CREATE TABLE IF NOT EXISTS mfa_challenges (
                id VARCHAR(36) PRIMARY KEY,
                challenge_token_hash VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                email VARCHAR(191) NOT NULL,
                channel ENUM("email_otp", "totp") NOT NULL DEFAULT "email_otp",
                code_hash VARCHAR(64) NOT NULL DEFAULT "",
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                expires_at DATETIME NOT NULL,
                verified_at DATETIME NULL,
                ip_address VARCHAR(64) NULL,
                user_agent VARCHAR(512) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mfa_user (user_id),
                INDEX idx_mfa_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'security_attempts' => 'CREATE TABLE IF NOT EXISTS security_attempts (
                id VARCHAR(64) PRIMARY KEY,
                scope VARCHAR(32) NOT NULL,
                identifier VARCHAR(191) NOT NULL,
                ip_address VARCHAR(64) NULL,
                attempts INT NOT NULL DEFAULT 0,
                window_started_at DATETIME NOT NULL,
                last_attempt_at DATETIME NOT NULL,
                locked_until DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_sa_scope_ident (scope, identifier),
                INDEX idx_sa_locked (locked_until)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'security_events' => 'CREATE TABLE IF NOT EXISTS security_events (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NULL,
                user_email VARCHAR(191) NULL,
                user_role VARCHAR(32) NULL,
                event_type VARCHAR(80) NOT NULL,
                severity ENUM("info", "warning", "high", "critical") NOT NULL DEFAULT "info",
                ip_address VARCHAR(64) NULL,
                user_agent VARCHAR(512) NULL,
                endpoint VARCHAR(255) NULL,
                details JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_se_created (created_at),
                INDEX idx_se_type (event_type),
                INDEX idx_se_severity (severity),
                INDEX idx_se_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tables as $sql) {
            try {
                $db->execute($sql);
            } catch (Throwable) {
            }
        }

        $alters = [
            ['password_resets', 'otp_verified', 'ALTER TABLE password_resets ADD COLUMN otp_verified TINYINT(1) NOT NULL DEFAULT 0'],
            ['users', 'mfa_enabled', 'ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0'],
            ['users', 'totp_secret', 'ALTER TABLE users ADD COLUMN totp_secret VARCHAR(128) NULL'],
            ['users', 'totp_enabled', 'ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0'],
        ];

        foreach ($alters as [$table, $col, $alterSql]) {
            try {
                $exists = $db->fetchOne("SHOW COLUMNS FROM `{$table}` LIKE :col", ['col' => $col]);
                if (!$exists) {
                    $db->execute($alterSql);
                }
            } catch (Throwable) {
            }
        }
    }

    public static function getPolicies(Database $db): array
    {
        self::ensureSchema($db);
        $policies = self::DEFAULT_POLICIES;

        try {
            $rows = $db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (
                    "admin_dashboard_settings",
                    "auth_settings",
                    "authentication_settings",
                    "security_settings",
                    "api_settings",
                    "api_settings_settings",
                    "security_control_policies"
                )'
            );

            $parsed = [];
            foreach ($rows as $row) {
                $decoded = json_decode((string)$row['setting_value'], true);
                if (is_array($decoded)) {
                    $parsed[$row['setting_key']] = $decoded;
                }
            }

            $sources = [
                $parsed['admin_dashboard_settings'] ?? [],
                $parsed['auth_settings'] ?? [],
                $parsed['authentication_settings'] ?? [],
                $parsed['security_settings'] ?? [],
                $parsed['api_settings'] ?? [],
                $parsed['api_settings_settings'] ?? [],
                $parsed['security_control_policies'] ?? [],
            ];

            foreach ($sources as $src) {
                if (!is_array($src)) {
                    continue;
                }
                if (array_key_exists('require_2fa_for_root', $src)) {
                    $policies['require_mfa_for_superadmin'] = filter_var($src['require_2fa_for_root'], FILTER_VALIDATE_BOOLEAN);
                }
                if (array_key_exists('require_mfa_for_superadmin', $src)) {
                    $policies['require_mfa_for_superadmin'] = filter_var($src['require_mfa_for_superadmin'], FILTER_VALIDATE_BOOLEAN);
                }
                if (array_key_exists('require_mfa_for_admin', $src)) {
                    $policies['require_mfa_for_admin'] = filter_var($src['require_mfa_for_admin'], FILTER_VALIDATE_BOOLEAN);
                }
                if (isset($src['session_timeout_minutes']) && is_numeric($src['session_timeout_minutes'])) {
                    $policies['admin_session_timeout_minutes'] = max(5, min(1440, (int)$src['session_timeout_minutes']));
                }
                if (isset($src['admin_session_timeout_minutes']) && is_numeric($src['admin_session_timeout_minutes'])) {
                    $policies['admin_session_timeout_minutes'] = max(5, min(1440, (int)$src['admin_session_timeout_minutes']));
                }
                if (isset($src['customer_session_timeout_minutes']) && is_numeric($src['customer_session_timeout_minutes'])) {
                    $policies['customer_session_timeout_minutes'] = max(5, min(1440, (int)$src['customer_session_timeout_minutes']));
                }
                if (isset($src['jwt_expiry_days']) && is_numeric($src['jwt_expiry_days'])) {
                    $policies['jwt_expiry_days'] = max(1, min(30, (int)$src['jwt_expiry_days']));
                }
                if (isset($src['max_concurrent_sessions_admin']) && is_numeric($src['max_concurrent_sessions_admin'])) {
                    $policies['max_concurrent_sessions_admin'] = max(1, min(20, (int)$src['max_concurrent_sessions_admin']));
                }
                if (isset($src['max_concurrent_sessions_customer']) && is_numeric($src['max_concurrent_sessions_customer'])) {
                    $policies['max_concurrent_sessions_customer'] = max(1, min(20, (int)$src['max_concurrent_sessions_customer']));
                }
                if (isset($src['max_failed_attempts']) && is_numeric($src['max_failed_attempts'])) {
                    $policies['max_failed_attempts'] = max(3, min(20, (int)$src['max_failed_attempts']));
                }
                if (isset($src['max_login_attempts']) && is_numeric($src['max_login_attempts'])) {
                    $policies['max_failed_attempts'] = max(3, min(20, (int)$src['max_failed_attempts']));
                }
                if (isset($src['lockout_duration_minutes']) && is_numeric($src['lockout_duration_minutes'])) {
                    $policies['lockout_duration_minutes'] = max(1, min(1440, (int)$src['lockout_duration_minutes']));
                }
                if (isset($src['pin_max_attempts']) && is_numeric($src['pin_max_attempts'])) {
                    $policies['pin_max_attempts'] = max(2, min(10, (int)$src['pin_max_attempts']));
                }
                if (isset($src['pin_lockout_minutes']) && is_numeric($src['pin_lockout_minutes'])) {
                    $policies['pin_lockout_minutes'] = max(1, min(1440, (int)$src['pin_lockout_minutes']));
                }
                if (isset($src['min_password_length']) && is_numeric($src['min_password_length'])) {
                    $policies['min_password_length'] = max(6, min(32, (int)$src['min_password_length']));
                }
                foreach (['require_uppercase', 'require_number', 'require_special', 'strict_ip_whitelist_enabled', 'ip_rate_limiting_enabled', 'login_alerts_enabled', 'superadmin_login_alerts', 'enforce_transaction_pin', 'emergency_lockdown'] as $boolKey) {
                    if (array_key_exists($boolKey, $src)) {
                        $policies[$boolKey] = filter_var($src[$boolKey], FILTER_VALIDATE_BOOLEAN);
                    }
                }
                if (array_key_exists('require_transaction_pin', $src)) {
                    $policies['enforce_transaction_pin'] = filter_var($src['require_transaction_pin'], FILTER_VALIDATE_BOOLEAN);
                }
                if (array_key_exists('allowed_admin_ips', $src)) {
                    $policies['allowed_admin_ips'] = trim((string)$src['allowed_admin_ips']);
                }
                if (isset($src['rate_limit_requests_per_minute']) && is_numeric($src['rate_limit_requests_per_minute'])) {
                    $policies['rate_limit_requests_per_minute'] = max(20, min(2000, (int)$src['rate_limit_requests_per_minute']));
                }
                if (isset($src['api_rate_limit_per_minute']) && is_numeric($src['api_rate_limit_per_minute'])) {
                    $policies['rate_limit_requests_per_minute'] = max(20, min(2000, (int)$src['api_rate_limit_per_minute']));
                }
            }
        } catch (Throwable) {
        }

        return $policies;
    }

    public static function isMaintenanceMode(Database $db): bool
    {
        try {
            $rows = $db->fetchAll(
                'SELECT setting_value FROM system_settings WHERE setting_key IN ("general_settings", "system_config_settings", "system_maintenance_settings")'
            );
            foreach ($rows as $row) {
                $dec = json_decode((string)$row['setting_value'], true);
                if (is_array($dec) && !empty($dec['maintenance_mode'])) {
                    return true;
                }
            }
        } catch (Throwable) {
        }
        return false;
    }

    public static function validatePasswordStrength(Database $db, string $password): ?string
    {
        $policies = self::getPolicies($db);
        $minLen = (int)($policies['min_password_length'] ?? 8);
        if (strlen($password) < $minLen) {
            return "Password must be at least {$minLen} characters long.";
        }
        if (!empty($policies['require_uppercase']) && !preg_match('/[A-Z]/', $password)) {
            return 'Password must include at least one uppercase letter.';
        }
        if (!empty($policies['require_number']) && !preg_match('/[0-9]/', $password)) {
            return 'Password must include at least one number.';
        }
        if (!empty($policies['require_special']) && !preg_match('/[^a-zA-Z0-9]/', $password)) {
            return 'Password must include at least one special character.';
        }
        return null;
    }

    public static function isIpAllowed(string $clientIp, string $csvAllowlist): bool
    {
        $raw = trim($csvAllowlist);
        if ($raw === '') {
            return true;
        }

        $entries = array_values(array_filter(array_map('trim', explode(',', $raw))));
        if (empty($entries)) {
            return true;
        }

        foreach ($entries as $entry) {
            if ($entry === '*' || $entry === $clientIp) {
                return true;
            }
            if (str_contains($entry, '/') && self::ipInCidr($clientIp, $entry)) {
                return true;
            }
        }

        return false;
    }

    private static function ipInCidr(string $ip, string $cidr): bool
    {
        [$subnet, $prefix] = explode('/', $cidr, 2);
        $ipBin = @inet_pton($ip);
        $subnetBin = @inet_pton(trim($subnet));
        if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
            return false;
        }
        $maxBits = strlen($ipBin) * 8;
        $bits = max(0, min($maxBits, (int)$prefix));
        $fullBytes = intdiv($bits, 8);
        $remBits = $bits % 8;

        if ($fullBytes > 0 && substr($ipBin, 0, $fullBytes) !== substr($subnetBin, 0, $fullBytes)) {
            return false;
        }
        if ($remBits > 0) {
            $mask = (0xFF << (8 - $remBits)) & 0xFF;
            if ((ord($ipBin[$fullBytes]) & $mask) !== (ord($subnetBin[$fullBytes]) & $mask)) {
                return false;
            }
        }
        return true;
    }

    public static function enforceRequestGuard(Request $request): void
    {
        $path = rtrim($request->getPath(), '/') ?: '/';
        if ($request->getMethod() === 'OPTIONS') {
            return;
        }

        // Fast allow health & webhooks without DB rate block issues
        if ($path === '/api/health' || $path === '/api/system/status') {
            return;
        }

        try {
            $db = Database::getInstance();
            $policies = self::getPolicies($db);
            $ip = $request->getIp();

            // 1. Per-IP API rate limit (skip external gateway webhooks from low threshold)
            $isWebhook = str_contains($path, '/webhook');
            if (!empty($policies['ip_rate_limiting_enabled']) && !$isWebhook) {
                $limit = (int)($policies['rate_limit_requests_per_minute'] ?? 120);
                // Tighter limit for auth / password recovery endpoints to stop enumeration
                if (in_array($path, ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/verify-otp', '/api/auth/reset-password', '/api/auth/mfa/verify'], true)) {
                    $limit = min($limit, 30);
                }

                $bucketKey = hash('sha256', 'ip:' . $ip . ':' . ($limit <= 30 ? 'auth' : 'api'));
                $now = date('Y-m-d H:i:s');
                $row = $db->fetchOne('SELECT id, attempts, window_started_at, locked_until FROM security_attempts WHERE scope = "rate_limit" AND identifier = :ident LIMIT 1', ['ident' => $bucketKey]);

                if ($row) {
                    if (!empty($row['locked_until']) && strtotime((string)$row['locked_until']) > time()) {
                        Response::error('Too many requests from your network. Please wait a moment before retrying.', 429);
                    }
                    $windowAge = time() - strtotime((string)$row['window_started_at']);
                    if ($windowAge >= 60) {
                        $db->execute(
                            'UPDATE security_attempts SET attempts = 1, window_started_at = :ws, last_attempt_at = :la, locked_until = NULL WHERE id = :id',
                            ['ws' => $now, 'la' => $now, 'id' => $row['id']]
                        );
                    } else {
                        $nextAttempts = (int)$row['attempts'] + 1;
                        if ($nextAttempts > $limit) {
                            $lockedUntil = date('Y-m-d H:i:s', time() + 60);
                            $db->execute(
                                'UPDATE security_attempts SET attempts = :att, last_attempt_at = :la, locked_until = :lu WHERE id = :id',
                                ['att' => $nextAttempts, 'la' => $now, 'lu' => $lockedUntil, 'id' => $row['id']]
                            );
                            self::logEvent('RATE_LIMIT_EXCEEDED', 'warning', null, $request, ['limit' => $limit, 'path' => $path]);
                            Response::error('Rate limit exceeded. Please slow down and try again in 60 seconds.', 429);
                        } else {
                            $db->execute(
                                'UPDATE security_attempts SET attempts = :att, last_attempt_at = :la WHERE id = :id',
                                ['att' => $nextAttempts, 'la' => $now, 'id' => $row['id']]
                            );
                        }
                    }
                } else {
                    $db->execute(
                        'INSERT IGNORE INTO security_attempts (id, scope, identifier, ip_address, attempts, window_started_at, last_attempt_at)
                         VALUES (:id, "rate_limit", :ident, :ip, 1, :ws, :la)',
                        ['id' => Security::generateUuid(), 'ident' => $bucketKey, 'ip' => $ip, 'ws' => $now, 'la' => $now]
                    );
                }
            }

            // 2. Emergency Lockdown / Maintenance Mode Gate (allows auth login/MFA, public status, admin, webhooks)
            $isBypassPath = $isWebhook
                || str_starts_with($path, '/api/auth/')
                || str_starts_with($path, '/api/admin/')
                || str_starts_with($path, '/api/cms/public')
                || str_starts_with($path, '/api/system/');

            if (!$isBypassPath) {
                $isLockdown = !empty($policies['emergency_lockdown']);
                $isMaint = self::isMaintenanceMode($db);
                if ($isLockdown || $isMaint) {
                    $user = Auth::user($request);
                    $role = $user['role'] ?? 'guest';
                    if ($isLockdown && $role !== 'superadmin') {
                        Response::error('Platform is temporarily in emergency security lockdown. Only Super Admin access is permitted.', 503);
                    }
                    if ($isMaint && !in_array($role, ['admin', 'superadmin'], true)) {
                        Response::error('Platform maintenance is currently in progress. Please check back shortly.', 503);
                    }
                }
            }
        } catch (Throwable) {
        }
    }

    public static function checkLockout(Database $db, string $scope, string $identifier): array
    {
        self::ensureSchema($db);
        $ident = strtolower(trim($identifier));
        if ($ident === '') {
            return ['locked' => false, 'remaining_seconds' => 0, 'attempts' => 0];
        }
        try {
            $row = $db->fetchOne(
                'SELECT attempts, locked_until FROM security_attempts WHERE scope = :sc AND identifier = :id LIMIT 1',
                ['sc' => $scope, 'id' => $ident]
            );
            if ($row && !empty($row['locked_until'])) {
                $rem = strtotime((string)$row['locked_until']) - time();
                if ($rem > 0) {
                    return ['locked' => true, 'remaining_seconds' => $rem, 'attempts' => (int)$row['attempts']];
                }
            }
            return ['locked' => false, 'remaining_seconds' => 0, 'attempts' => (int)($row['attempts'] ?? 0)];
        } catch (Throwable) {
            return ['locked' => false, 'remaining_seconds' => 0, 'attempts' => 0];
        }
    }

    public static function recordFailedAttempt(
        Database $db,
        string $scope,
        string $identifier,
        int $maxAttempts,
        int $lockMinutes,
        Request $request,
        ?array $user = null
    ): array {
        self::ensureSchema($db);
        $ident = strtolower(trim($identifier));
        $now = date('Y-m-d H:i:s');
        $attempts = 1;
        $lockedUntil = null;

        try {
            $existing = $db->fetchOne(
                'SELECT id, attempts, window_started_at, locked_until FROM security_attempts WHERE scope = :sc AND identifier = :id LIMIT 1',
                ['sc' => $scope, 'id' => $ident]
            );
            if ($existing) {
                $wasLockedAndExpired = !empty($existing['locked_until']) && strtotime((string)$existing['locked_until']) <= time();
                $windowExpired = (time() - strtotime((string)$existing['window_started_at'])) > ($lockMinutes * 60);
                $attempts = ($wasLockedAndExpired || $windowExpired) ? 1 : ((int)$existing['attempts'] + 1);
                if ($attempts >= $maxAttempts) {
                    $lockedUntil = date('Y-m-d H:i:s', time() + ($lockMinutes * 60));
                }
                $db->execute(
                    'UPDATE security_attempts
                     SET attempts = :att, ip_address = :ip, window_started_at = :ws, last_attempt_at = :la, locked_until = :lu
                     WHERE id = :id',
                    [
                        'att' => $attempts,
                        'ip' => $request->getIp(),
                        'ws' => ($wasLockedAndExpired || $windowExpired) ? $now : $existing['window_started_at'],
                        'la' => $now,
                        'lu' => $lockedUntil,
                        'id' => $existing['id'],
                    ]
                );
            } else {
                if ($attempts >= $maxAttempts) {
                    $lockedUntil = date('Y-m-d H:i:s', time() + ($lockMinutes * 60));
                }
                $db->execute(
                    'INSERT INTO security_attempts (id, scope, identifier, ip_address, attempts, window_started_at, last_attempt_at, locked_until)
                     VALUES (:id, :sc, :ident, :ip, :att, :ws, :la, :lu)',
                    [
                        'id' => Security::generateUuid(),
                        'sc' => $scope,
                        'ident' => $ident,
                        'ip' => $request->getIp(),
                        'att' => $attempts,
                        'ws' => $now,
                        'la' => $now,
                        'lu' => $lockedUntil,
                    ]
                );
            }

            if ($lockedUntil !== null) {
                $severity = ($user && in_array($user['role'] ?? '', ['superadmin', 'admin'], true)) ? 'critical' : 'high';
                self::logEvent(
                    strtoupper($scope) . '_LOCKED',
                    $severity,
                    $user,
                    $request,
                    ['identifier' => $ident, 'attempts' => $attempts, 'lock_minutes' => $lockMinutes]
                );
            }
        } catch (Throwable) {
        }

        return [
            'attempts' => $attempts,
            'remaining_attempts' => max(0, $maxAttempts - $attempts),
            'locked' => $lockedUntil !== null,
            'lock_minutes' => $lockMinutes,
        ];
    }

    public static function clearAttempts(Database $db, string $scope, string $identifier): void
    {
        try {
            $db->execute(
                'DELETE FROM security_attempts WHERE scope = :sc AND identifier = :id',
                ['sc' => $scope, 'id' => strtolower(trim($identifier))]
            );
        } catch (Throwable) {
        }
    }

    public static function parseDeviceLabel(?string $userAgent): string
    {
        $ua = trim((string)$userAgent);
        if ($ua === '') {
            return 'Unknown Device';
        }
        $browser = 'Web Client';
        if (stripos($ua, 'Edg/') !== false) $browser = 'Microsoft Edge';
        elseif (stripos($ua, 'Chrome/') !== false) $browser = 'Chrome';
        elseif (stripos($ua, 'Firefox/') !== false) $browser = 'Firefox';
        elseif (stripos($ua, 'Safari/') !== false && stripos($ua, 'Chrome') === false) $browser = 'Safari';
        elseif (stripos($ua, 'curl/') !== false) $browser = 'cURL / API Client';

        $os = 'Unknown OS';
        if (stripos($ua, 'Windows') !== false) $os = 'Windows';
        elseif (stripos($ua, 'Android') !== false) $os = 'Android';
        elseif (stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false) $os = 'iOS';
        elseif (stripos($ua, 'Mac OS') !== false || stripos($ua, 'Macintosh') !== false) $os = 'macOS';
        elseif (stripos($ua, 'Linux') !== false) $os = 'Linux';

        return "{$browser} on {$os}";
    }

    public static function createSession(Database $db, array $user, string $jti, Request $request, int $expiresAtTs): string
    {
        self::ensureSchema($db);
        $policies = self::getPolicies($db);
        $role = (string)($user['role'] ?? 'customer');
        $isAdmin = in_array($role, ['admin', 'superadmin'], true);
        $maxConcurrent = $isAdmin
            ? (int)($policies['max_concurrent_sessions_admin'] ?? 3)
            : (int)($policies['max_concurrent_sessions_customer'] ?? 5);

        $ua = substr((string)$request->header('user-agent', ''), 0, 500);
        $deviceLabel = self::parseDeviceLabel($ua);
        $sessionId = Security::generateUuid();

        try {
            $activeRows = $db->fetchAll(
                'SELECT id FROM user_sessions
                 WHERE user_id = :uid AND revoked_at IS NULL AND expires_at > NOW()
                 ORDER BY last_active_at ASC, created_at ASC',
                ['uid' => $user['id']]
            );
            $overflow = (count($activeRows) + 1) - $maxConcurrent;
            if ($overflow > 0) {
                $toRevoke = array_slice($activeRows, 0, $overflow);
                foreach ($toRevoke as $old) {
                    $db->execute(
                        'UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = "concurrent_limit" WHERE id = :id',
                        ['id' => $old['id']]
                    );
                }
            }

            $db->execute(
                'INSERT INTO user_sessions (id, user_id, token_jti, user_role, ip_address, user_agent, device_label, last_active_at, expires_at, created_at)
                 VALUES (:id, :uid, :jti, :role, :ip, :ua, :dev, NOW(), :exp, NOW())',
                [
                    'id' => $sessionId,
                    'uid' => $user['id'],
                    'jti' => $jti,
                    'role' => $role,
                    'ip' => $request->getIp(),
                    'ua' => $ua,
                    'dev' => $deviceLabel,
                    'exp' => date('Y-m-d H:i:s', $expiresAtTs),
                ]
            );
        } catch (Throwable) {
        }

        return $sessionId;
    }

    public static function validateAndTouchSession(Database $db, string $jti, array $user, Request $request): ?array
    {
        self::ensureSchema($db);
        if ($jti === '') {
            return null;
        }

        $sess = $db->fetchOne(
            'SELECT * FROM user_sessions WHERE token_jti = :jti AND user_id = :uid LIMIT 1',
            ['jti' => $jti, 'uid' => $user['id']]
        );
        if (!$sess) {
            return null;
        }
        if (!empty($sess['revoked_at'])) {
            return null;
        }
        if (strtotime((string)$sess['expires_at']) <= time()) {
            $db->execute('UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = "expired" WHERE id = :id', ['id' => $sess['id']]);
            return null;
        }

        $policies = self::getPolicies($db);
        $role = (string)($user['role'] ?? 'customer');
        $isAdmin = in_array($role, ['admin', 'superadmin'], true);

        // Enforce emergency lockdown immediately across existing sessions (except Super Admin)
        if (!empty($policies['emergency_lockdown']) && $role !== 'superadmin') {
            return null;
        }

        // Enforce idle timeout
        $idleMinutes = $isAdmin
            ? (int)($policies['admin_session_timeout_minutes'] ?? 60)
            : (int)($policies['customer_session_timeout_minutes'] ?? 120);
        $lastActiveTs = strtotime((string)$sess['last_active_at']);
        if ($lastActiveTs > 0 && (time() - $lastActiveTs) > ($idleMinutes * 60)) {
            $db->execute(
                'UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = "idle_timeout" WHERE id = :id',
                ['id' => $sess['id']]
            );
            self::logEvent('SESSION_IDLE_EXPIRED', 'info', $user, $request, ['session_id' => $sess['id'], 'idle_minutes' => $idleMinutes]);
            return null;
        }

        // Enforce admin IP allowlist if turned on
        if ($isAdmin && !empty($policies['strict_ip_whitelist_enabled'])) {
            $clientIp = $request->getIp();
            if (!self::isIpAllowed($clientIp, (string)($policies['allowed_admin_ips'] ?? ''))) {
                self::logEvent('ADMIN_IP_BLOCKED', 'critical', $user, $request, ['blocked_ip' => $clientIp]);
                return null;
            }
        }

        // Update activity timestamp at most once per 30s to avoid hot writes
        if ($lastActiveTs <= 0 || (time() - $lastActiveTs) >= 30) {
            try {
                $db->execute('UPDATE user_sessions SET last_active_at = NOW(), ip_address = :ip WHERE id = :id', [
                    'ip' => $request->getIp(),
                    'id' => $sess['id'],
                ]);
            } catch (Throwable) {
            }
        }

        return $sess;
    }

    public static function revokeSessionByJti(Database $db, string $jti, string $reason = 'logout'): void
    {
        if ($jti === '') {
            return;
        }
        try {
            $db->execute(
                'UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = :r WHERE token_jti = :jti AND revoked_at IS NULL',
                ['r' => $reason, 'jti' => $jti]
            );
        } catch (Throwable) {
        }
    }

    public static function revokeAllUserSessions(Database $db, string $userId, string $reason = 'security_action', ?string $exceptJti = null): int
    {
        self::ensureSchema($db);
        try {
            if ($exceptJti) {
                $countRow = $db->fetchOne(
                    'SELECT COUNT(*) as c FROM user_sessions WHERE user_id = :uid AND token_jti != :jti AND revoked_at IS NULL',
                    ['uid' => $userId, 'jti' => $exceptJti]
                );
                $db->execute(
                    'UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = :r WHERE user_id = :uid AND token_jti != :jti AND revoked_at IS NULL',
                    ['r' => $reason, 'uid' => $userId, 'jti' => $exceptJti]
                );
                return (int)($countRow['c'] ?? 0);
            }
            $countRow = $db->fetchOne(
                'SELECT COUNT(*) as c FROM user_sessions WHERE user_id = :uid AND revoked_at IS NULL',
                ['uid' => $userId]
            );
            $db->execute(
                'UPDATE user_sessions SET revoked_at = NOW(), revoke_reason = :r WHERE user_id = :uid AND revoked_at IS NULL',
                ['r' => $reason, 'uid' => $userId]
            );
            return (int)($countRow['c'] ?? 0);
        } catch (Throwable) {
            return 0;
        }
    }

    // =========================================================================
    // MFA (EMAIL OTP + RFC 6238 TOTP AUTHENTICATOR)
    // =========================================================================
    public static function shouldRequireMfa(Database $db, array $user): bool
    {
        $policies = self::getPolicies($db);
        $role = (string)($user['role'] ?? 'customer');

        if ($role === 'superadmin' && !empty($policies['require_mfa_for_superadmin'])) {
            return true;
        }
        if ($role === 'admin' && !empty($policies['require_mfa_for_admin'])) {
            return true;
        }
        if (!empty($user['totp_enabled']) && !empty($user['totp_secret'])) {
            return true;
        }
        if (!empty($user['mfa_enabled'])) {
            return true;
        }
        $secSettings = is_string($user['security_settings'] ?? null)
            ? json_decode((string)$user['security_settings'], true)
            : ($user['security_settings'] ?? []);
        if (is_array($secSettings) && !empty($secSettings['two_factor_enabled'])) {
            return true;
        }
        return false;
    }

    public static function createMfaChallenge(Database $db, array $user, Request $request): array
    {
        self::ensureSchema($db);
        $hasTotp = !empty($user['totp_enabled']) && !empty($user['totp_secret']);
        $channel = $hasTotp ? 'totp' : 'email_otp';

        $challengeToken = bin2hex(random_bytes(24));
        $challengeHash = hash('sha256', $challengeToken);
        $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $codeHash = hash('sha256', $otp);

        // Invalidate previous unverified challenges for this user
        $db->execute('DELETE FROM mfa_challenges WHERE user_id = :uid AND verified_at IS NULL', ['uid' => $user['id']]);

        $db->execute(
            'INSERT INTO mfa_challenges (id, challenge_token_hash, user_id, email, channel, code_hash, attempts, max_attempts, expires_at, ip_address, user_agent, created_at)
             VALUES (:id, :cth, :uid, :email, :ch, :chash, 0, 5, DATE_ADD(NOW(), INTERVAL 10 MINUTE), :ip, :ua, NOW())',
            [
                'id' => Security::generateUuid(),
                'cth' => $challengeHash,
                'uid' => $user['id'],
                'email' => strtolower((string)$user['email']),
                'ch' => $channel,
                'chash' => $codeHash,
                'ip' => $request->getIp(),
                'ua' => substr((string)$request->header('user-agent', ''), 0, 500),
            ]
        );

        $emailDispatched = false;
        if (!$hasTotp) {
            $emailDispatched = self::dispatchMfaEmail((string)$user['email'], (string)($user['full_name'] ?? 'Administrator'), $otp, $request);
        }

        self::logEvent(
            'MFA_CHALLENGE_ISSUED',
            in_array($user['role'] ?? '', ['superadmin', 'admin'], true) ? 'warning' : 'info',
            $user,
            $request,
            ['channel' => $channel, 'email_dispatched' => $emailDispatched]
        );

        return [
            'mfa_required' => true,
            'challenge_token' => $challengeToken,
            'mfa_channel' => $channel,
            'mfa_methods' => $hasTotp ? ['totp', 'email_otp'] : ['email_otp'],
            'masked_email' => self::maskEmail((string)$user['email']),
            'expires_in_seconds' => 600,
            'role' => $user['role'] ?? 'customer',
        ];
    }

    public static function dispatchMfaEmail(string $email, string $name, string $otp, Request $request): bool
    {
        try {
            $mailer = new MailService();
            $safeName = htmlspecialchars($name ?: 'Account Holder', ENT_QUOTES, 'UTF-8');
            $safeOtp = htmlspecialchars($otp, ENT_QUOTES, 'UTF-8');
            $ip = htmlspecialchars($request->getIp(), ENT_QUOTES, 'UTF-8');
            $timeStr = date('Y-m-d H:i:s') . ' WAT';
            $html = "
            <div style='font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;'>
                <div style='background:#0f172a; color:#ffffff; padding:18px 22px; border-radius:8px 8px 0 0;'>
                    <h2 style='margin:0; font-size:17px;'>HAMBAKTECH Multi-Factor Verification</h2>
                </div>
                <div style='padding:22px; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 8px 8px; color:#1e293b;'>
                    <p style='margin-top:0;'>Hello <strong>{$safeName}</strong>,</p>
                    <p>Use the 6-digit verification code below to complete your sign-in:</p>
                    <div style='margin:22px 0; text-align:center;'>
                        <span style='display:inline-block; background:#eff6ff; border:2px solid #2563eb; border-radius:10px; padding:12px 28px; font-family:monospace; font-size:28px; font-weight:800; letter-spacing:8px; color:#1e40af;'>{$safeOtp}</span>
                    </div>
                    <p style='font-size:12px; color:#64748b;'>Request IP: <strong>{$ip}</strong> &bull; Time: {$timeStr}</p>
                    <p style='font-size:12px; color:#dc2626;'>Valid for 10 minutes. If you did not initiate this sign-in, change your password immediately and contact security support.</p>
                </div>
            </div>";
            $res = $mailer->send($email, $name, 'HambakTech Security Verification Code: ' . $otp, $html, null, ['audit_action' => 'MFA_OTP_DISPATCHED']);
            return !empty($res['sent']);
        } catch (Throwable) {
            return false;
        }
    }

    public static function maskEmail(string $email): string
    {
        $parts = explode('@', $email, 2);
        if (count($parts) !== 2) {
            return '***';
        }
        [$local, $domain] = $parts;
        $prefix = substr($local, 0, min(2, strlen($local)));
        return $prefix . str_repeat('*', max(3, strlen($local) - 2)) . '@' . $domain;
    }

    public static function generateTotpSecret(int $length = 16): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = '';
        for ($i = 0; $i < $length; $i++) {
            $secret .= $alphabet[random_int(0, 31)];
        }
        return $secret;
    }

    public static function getTotpProvisioningUri(string $email, string $secret, string $issuer = 'HambakTech'): string
    {
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $email)
            . '?secret=' . rawurlencode($secret)
            . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=6&period=30';
    }

    public static function verifyTotpCode(string $base32Secret, string $code, int $discrepancy = 1): bool
    {
        $cleanCode = preg_replace('/\s+/', '', $code);
        if (!preg_match('/^\d{6}$/', (string)$cleanCode)) {
            return false;
        }
        $secretKey = self::base32Decode($base32Secret);
        if ($secretKey === '') {
            return false;
        }
        $currentTimeSlice = (int)floor(time() / 30);
        for ($i = -$discrepancy; $i <= $discrepancy; $i++) {
            $calc = self::computeTotpSlice($secretKey, $currentTimeSlice + $i);
            if (hash_equals($calc, (string)$cleanCode)) {
                return true;
            }
        }
        return false;
    }

    private static function computeTotpSlice(string $secretKey, int $timeSlice): string
    {
        $time = pack('N*', 0) . pack('N*', $timeSlice);
        $hmac = hash_hmac('sha1', $time, $secretKey, true);
        $offset = ord(substr($hmac, -1)) & 0x0F;
        $hashPart = substr($hmac, $offset, 4);
        $value = unpack('N', $hashPart)[1] & 0x7FFFFFFF;
        return str_pad((string)($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    private static function base32Decode(string $secret): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = strtoupper(trim($secret));
        $secret = str_replace('=', '', $secret);
        if ($secret === '') {
            return '';
        }
        $binary = '';
        foreach (str_split($secret) as $char) {
            $pos = strpos($alphabet, $char);
            if ($pos === false) {
                return '';
            }
            $binary .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($binary, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }
        return $out;
    }

    // =========================================================================
    // TRANSACTION PIN LOCKOUT & RULE ENFORCEMENT
    // =========================================================================
    public static function verifyTransactionPin(
        Database $db,
        array $user,
        string $pin,
        string $serviceKey,
        Request $request,
        bool $enforceIfConfigured = true
    ): void {
        self::ensureSchema($db);
        $policies = self::getPolicies($db);
        $pinMaxAttempts = (int)($policies['pin_max_attempts'] ?? 3);
        $pinLockMinutes = (int)($policies['pin_lockout_minutes'] ?? 30);

        $lockState = self::checkLockout($db, 'pin', (string)$user['id']);
        if ($lockState['locked']) {
            $mins = max(1, (int)ceil($lockState['remaining_seconds'] / 60));
            Response::error("Transaction PIN temporarily locked due to repeated invalid attempts. Try again in {$mins} minute(s) or contact support.", 429);
        }

        $ruleRequiresPin = false;
        try {
            $rule = $db->fetchOne(
                'SELECT require_pin, requires_pin FROM service_security_rules WHERE service_key = :sk AND is_active = 1 LIMIT 1',
                ['sk' => $serviceKey]
            );
            if ($rule) {
                $ruleRequiresPin = (bool)($rule['requires_pin'] ?? $rule['require_pin'] ?? false);
            }
        } catch (Throwable) {
        }

        $row = $db->fetchOne('SELECT transaction_pin_hash FROM users WHERE id = :id LIMIT 1', ['id' => $user['id']]);
        $pinHash = (string)($row['transaction_pin_hash'] ?? '');
        $hasPin = $pinHash !== '';
        $mustCheck = ($ruleRequiresPin && !empty($policies['enforce_transaction_pin'])) || ($enforceIfConfigured && $hasPin) || ($pin !== '');

        if (!$mustCheck) {
            return;
        }

        if (!$hasPin) {
            Response::error('Please set your 4-digit Transaction PIN in Account Security Settings before completing this transaction.', 403, ['pin_setup_required' => true]);
        }

        if ($pin === '' || !preg_match('/^\d{4}$/', $pin)) {
            Response::error('Please enter your 4-digit Transaction PIN to authorize this transaction.', 422, ['requires_pin' => true]);
        }

        if (!Security::verifyPin($pin, $pinHash)) {
            $fail = self::recordFailedAttempt($db, 'pin', (string)$user['id'], $pinMaxAttempts, $pinLockMinutes, $request, $user);
            self::logEvent('TRANSACTION_PIN_FAILED', 'warning', $user, $request, ['service_key' => $serviceKey, 'attempts' => $fail['attempts']]);
            if ($fail['locked']) {
                Response::error("Too many incorrect Transaction PIN attempts. Transactions locked for {$pinLockMinutes} minutes.", 429);
            }
            $rem = $fail['remaining_attempts'];
            Response::error("Invalid 4-digit Transaction PIN. {$rem} attempt(s) remaining before temporary lockout.", 401);
        }

        self::clearAttempts($db, 'pin', (string)$user['id']);
    }

    // =========================================================================
    // GRANULAR RBAC & PRIVILEGE ESCALATION GUARDS
    // =========================================================================
    public static function requireSuperAdmin(Request $request): array
    {
        $user = Auth::requireAuth($request);
        if (($user['role'] ?? '') !== 'superadmin') {
            $db = Database::getInstance();
            self::logEvent('UNAUTHORIZED_SUPERADMIN_ATTEMPT', 'critical', $user, $request, [
                'path' => $request->getPath(),
                'method' => $request->getMethod(),
            ]);
            Response::forbidden('Access denied. This security control requires Super Admin privileges.');
        }
        return $user;
    }

    public static function getUserPermissions(Database $db, array $user): array
    {
        $role = (string)($user['role'] ?? 'customer');
        if ($role === 'superadmin') {
            return self::ADMIN_PERMISSION_SCOPES;
        }
        if ($role !== 'admin') {
            return [];
        }
        try {
            $prof = $db->fetchOne('SELECT assigned_permissions FROM user_profiles WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
            if ($prof && array_key_exists('assigned_permissions', $prof) && $prof['assigned_permissions'] !== null && $prof['assigned_permissions'] !== '') {
                $decoded = is_string($prof['assigned_permissions'])
                    ? json_decode($prof['assigned_permissions'], true)
                    : $prof['assigned_permissions'];
                if (is_array($decoded)) {
                    return array_values(array_unique(array_map('strval', $decoded)));
                }
            }
        } catch (Throwable) {
        }
        // Safe non-privileged default for legacy admins before explicit assignment
        return ['customers', 'wallet', 'kyc', 'services', 'cms', 'audit', 'support', 'reports'];
    }

    public static function requireAdminPermission(Request $request, string $scope): array
    {
        $user = Auth::requireRole($request, ['admin', 'superadmin']);
        if (($user['role'] ?? '') === 'superadmin') {
            return $user;
        }
        $db = Database::getInstance();
        $perms = self::getUserPermissions($db, $user);
        if (!in_array($scope, $perms, true) && !in_array('*', $perms, true)) {
            self::logEvent('RBAC_PERMISSION_DENIED', 'high', $user, $request, [
                'required_scope' => $scope,
                'path' => $request->getPath(),
            ]);
            Response::forbidden("Access denied. Missing '{$scope}' permission scope.");
        }
        return $user;
    }

    public static function assertCanManageTargetUser(array $actor, array $target, Request $request): void
    {
        $actorRole = (string)($actor['role'] ?? 'customer');
        $targetRole = (string)($target['role'] ?? 'customer');

        if ($actorRole !== 'superadmin' && in_array($targetRole, ['admin', 'superadmin'], true)) {
            $db = Database::getInstance();
            self::logEvent('PRIVILEGE_ESCALATION_ATTEMPT', 'critical', $actor, $request, [
                'target_user_id' => $target['id'] ?? null,
                'target_role' => $targetRole,
                'path' => $request->getPath(),
            ]);
            Response::forbidden('Ordinary administrators cannot modify, suspend, reset, or adjust staff or Super Admin accounts.');
        }

        if ($targetRole === 'superadmin' && ($actor['id'] ?? '') !== ($target['id'] ?? '')) {
            $db = Database::getInstance();
            self::logEvent('SUPERADMIN_CROSS_MODIFY_BLOCKED', 'critical', $actor, $request, [
                'target_user_id' => $target['id'] ?? null,
                'path' => $request->getPath(),
            ]);
            Response::forbidden('Peer Super Admin accounts cannot be altered from customer management controls.');
        }
    }

    // =========================================================================
    // SECURITY TELEMETRY & LOGIN ALERTS
    // =========================================================================
    public static function logEvent(
        string $eventType,
        string $severity,
        ?array $user,
        Request $request,
        array $details = []
    ): void {
        try {
            $db = Database::getInstance();
            self::ensureSchema($db);
            $db->execute(
                'INSERT INTO security_events (id, user_id, user_email, user_role, event_type, severity, ip_address, user_agent, endpoint, details, created_at)
                 VALUES (:id, :uid, :email, :role, :etype, :sev, :ip, :ua, :ep, :det, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $user['id'] ?? null,
                    'email' => $user['email'] ?? ($details['email'] ?? null),
                    'role' => $user['role'] ?? null,
                    'etype' => substr($eventType, 0, 80),
                    'sev' => in_array($severity, ['info', 'warning', 'high', 'critical'], true) ? $severity : 'info',
                    'ip' => $request->getIp(),
                    'ua' => substr((string)$request->header('user-agent', ''), 0, 500),
                    'ep' => substr($request->getMethod() . ' ' . $request->getPath(), 0, 250),
                    'det' => json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ]
            );
        } catch (Throwable) {
        }
    }

    public static function maybeSendLoginAlert(Database $db, array $user, Request $request, bool $mfaUsed = false): void
    {
        try {
            $policies = self::getPolicies($db);
            $role = (string)($user['role'] ?? 'customer');
            $isSuper = ($role === 'superadmin');
            $ip = $request->getIp();

            if ($isSuper && empty($policies['superadmin_login_alerts'])) {
                return;
            }
            if (!$isSuper && empty($policies['login_alerts_enabled'])) {
                return;
            }

            // For non-superadmins, alert if IP has not successfully logged in within 30 days
            $knownIp = false;
            if (!$isSuper) {
                $prev = $db->fetchOne(
                    'SELECT id FROM user_sessions WHERE user_id = :uid AND ip_address = :ip AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 1',
                    ['uid' => $user['id'], 'ip' => $ip]
                );
                $knownIp = (bool)$prev;
            }

            if ($isSuper || !$knownIp) {
                $device = self::parseDeviceLabel($request->header('user-agent', ''));
                $safeName = htmlspecialchars((string)($user['full_name'] ?? 'Account Holder'), ENT_QUOTES, 'UTF-8');
                $safeIp = htmlspecialchars($ip, ENT_QUOTES, 'UTF-8');
                $safeDev = htmlspecialchars($device, ENT_QUOTES, 'UTF-8');
                $safeRole = htmlspecialchars(strtoupper($role), ENT_QUOTES, 'UTF-8');
                $mfaBadge = $mfaUsed ? 'Verified with MFA' : 'Password Authenticated';
                $timeStr = date('Y-m-d H:i:s') . ' WAT';

                $mailer = new MailService();
                $html = "
                <div style='font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;'>
                    <div style='background:#0f172a; color:#ffffff; padding:16px 22px; border-radius:8px 8px 0 0;'>
                        <h2 style='margin:0; font-size:17px;'>Security Alert: New Sign-In Detected</h2>
                    </div>
                    <div style='padding:22px; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 8px 8px; color:#1e293b;'>
                        <p style='margin-top:0;'>Hello <strong>{$safeName}</strong>,</p>
                        <p>A sign-in occurred on your HAMBAKTECH ({$safeRole}) account:</p>
                        <table style='width:100%; border-collapse:collapse; font-size:13px; margin:14px 0;'>
                            <tr><td style='padding:6px 0; color:#64748b;'>Device / Browser:</td><td style='padding:6px 0; font-weight:bold;'>{$safeDev}</td></tr>
                            <tr><td style='padding:6px 0; color:#64748b;'>IP Address:</td><td style='padding:6px 0; font-family:monospace;'>{$safeIp}</td></tr>
                            <tr><td style='padding:6px 0; color:#64748b;'>Verification:</td><td style='padding:6px 0;'>{$mfaBadge}</td></tr>
                            <tr><td style='padding:6px 0; color:#64748b;'>Timestamp:</td><td style='padding:6px 0;'>{$timeStr}</td></tr>
                        </table>
                        <p style='font-size:12px; color:#dc2626;'>If this was not you, revoke all active sessions immediately and change your password.</p>
                    </div>
                </div>";
                $subject = $isSuper
                    ? '[SECURITY ALERT] Super Admin Sign-In Detected'
                    : '[HambakTech Security] New Sign-In From ' . $ip;
                $mailer->send((string)$user['email'], (string)($user['full_name'] ?? 'User'), $subject, $html, null, ['audit_action' => 'LOGIN_ALERT_SENT']);
            }
        } catch (Throwable) {
        }
    }
}
