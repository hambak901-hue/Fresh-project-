<?php
/**
 * @file Auth.php
 * Hardened JWT Session Engine, Token Revocation, Hijacking Protection & Granular RBAC
 */

declare(strict_types=1);

namespace HambakTech\Core;

use HambakTech\Services\DashboardConfigService;

class Auth
{
    public const CONSOLE_ROLES = ['support', 'staff', 'manager', 'admin', 'superadmin'];

    private static ?array $cachedPayload = null;
    private static ?array $cachedUser = null;
    private static ?string $cachedToken = null;

    public static function isConsoleRole(?string $role): bool
    {
        return in_array(strtolower(trim((string)$role)), self::CONSOLE_ROLES, true);
    }

    private static function getSecret(): string
    {
        $config = require __DIR__ . '/../config/config.php';
        $secret = (string)($config['security']['jwt_secret'] ?? '');
        if ($secret === '') {
            throw new \RuntimeException('JWT_SECRET is not configured in server environment.');
        }
        return $secret;
    }

    private static function base64UrlEncode(string $raw): string
    {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($raw));
    }

    private static function base64UrlDecode(string $b64u): string
    {
        $b64 = str_replace(['-', '_'], ['+', '/'], $b64u);
        $pad = strlen($b64) % 4;
        if ($pad > 0) {
            $b64 .= str_repeat('=', 4 - $pad);
        }
        return (string)base64_decode($b64, true);
    }

    public static function getSecuritySettings(): array
    {
        $defaults = [
            'enforce_transaction_pin' => true,
            'pin_max_attempts' => 5,
            'pin_lockout_minutes' => 15,
            'jwt_expiry_days' => 7,
            'session_timeout_minutes' => 1440,
            'admin_session_timeout_minutes' => 60,
            'customer_session_timeout_minutes' => 1440,
            'login_max_attempts' => 5,
            'max_failed_login_attempts' => 5,
            'login_lockout_minutes' => 15,
            'ip_rate_limiting_enabled' => true,
            'bind_user_agent' => true,
            'bind_session_user_agent' => true,
            'enforce_cors_allowlist' => false,
            'allowed_origins' => '',
        ];

        try {
            $db = Database::getInstance();
            $row = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "security_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $decoded = json_decode((string)$row['setting_value'], true);
                if (is_array($decoded)) {
                    if (array_key_exists('session_timeout_minutes', $decoded) && !array_key_exists('customer_session_timeout_minutes', $decoded)) {
                        $decoded['customer_session_timeout_minutes'] = (int)$decoded['session_timeout_minutes'];
                    } elseif (array_key_exists('customer_session_timeout_minutes', $decoded) && !array_key_exists('session_timeout_minutes', $decoded)) {
                        $decoded['session_timeout_minutes'] = (int)$decoded['customer_session_timeout_minutes'];
                    }
                    if (array_key_exists('login_max_attempts', $decoded) && !array_key_exists('max_failed_login_attempts', $decoded)) {
                        $decoded['max_failed_login_attempts'] = (int)$decoded['login_max_attempts'];
                    } elseif (array_key_exists('max_failed_login_attempts', $decoded) && !array_key_exists('login_max_attempts', $decoded)) {
                        $decoded['login_max_attempts'] = (int)$decoded['max_failed_login_attempts'];
                    }
                    if (array_key_exists('bind_user_agent', $decoded) && !array_key_exists('bind_session_user_agent', $decoded)) {
                        $decoded['bind_session_user_agent'] = (bool)$decoded['bind_user_agent'];
                    } elseif (array_key_exists('bind_session_user_agent', $decoded) && !array_key_exists('bind_user_agent', $decoded)) {
                        $decoded['bind_user_agent'] = (bool)$decoded['bind_session_user_agent'];
                    }
                    $defaults = array_merge($defaults, $decoded);
                }
            }
            // Respect admin_dashboard_settings.session_timeout_minutes if higher/configured
            $admRow = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "admin_dashboard_settings" LIMIT 1');
            if ($admRow && !empty($admRow['setting_value'])) {
                $admCfg = json_decode((string)$admRow['setting_value'], true);
                if (is_array($admCfg) && isset($admCfg['session_timeout_minutes'])) {
                    $defaults['admin_session_timeout_minutes'] = max(5, min(720, (int)$admCfg['session_timeout_minutes']));
                }
            }
        } catch (\Throwable) {
        }

        // Security floor/ceiling clamps & alias synchronization
        $custTimeout = max(15, min(10080, (int)($defaults['session_timeout_minutes'] ?? $defaults['customer_session_timeout_minutes'] ?? 1440)));
        $maxFail = max(3, min(15, (int)($defaults['login_max_attempts'] ?? $defaults['max_failed_login_attempts'] ?? 5)));
        $bindUa = (bool)($defaults['bind_user_agent'] ?? $defaults['bind_session_user_agent'] ?? true);

        $defaults['jwt_expiry_days'] = max(1, min(30, (int)$defaults['jwt_expiry_days']));
        $defaults['session_timeout_minutes'] = $custTimeout;
        $defaults['customer_session_timeout_minutes'] = $custTimeout;
        $defaults['admin_session_timeout_minutes'] = max(5, min(720, (int)$defaults['admin_session_timeout_minutes']));
        $defaults['login_max_attempts'] = $maxFail;
        $defaults['max_failed_login_attempts'] = $maxFail;
        $defaults['login_lockout_minutes'] = max(5, min(240, (int)$defaults['login_lockout_minutes']));
        $defaults['bind_user_agent'] = $bindUa;
        $defaults['bind_session_user_agent'] = $bindUa;
        $defaults['enforce_cors_allowlist'] = (bool)($defaults['enforce_cors_allowlist'] ?? false);
        $defaults['allowed_origins'] = (string)($defaults['allowed_origins'] ?? '');
        return $defaults;
    }

    private static function uaFingerprint(?string $ua): string
    {
        $raw = strtolower(trim((string)$ua));
        if ($raw === '') {
            return '';
        }
        // Normalize major browser/OS family so minor auto-updates don't needlessly break sessions while blocking cross-client theft
        $browser = 'other';
        if (str_contains($raw, 'edg/')) $browser = 'edge';
        elseif (str_contains($raw, 'opr/') || str_contains($raw, 'opera')) $browser = 'opera';
        elseif (str_contains($raw, 'chrome/')) $browser = 'chrome';
        elseif (str_contains($raw, 'firefox/')) $browser = 'firefox';
        elseif (str_contains($raw, 'safari/')) $browser = 'safari';
        elseif (str_contains($raw, 'curl') || str_contains($raw, 'python') || str_contains($raw, 'postman')) $browser = 'cli';

        $os = 'other';
        if (str_contains($raw, 'windows')) $os = 'win';
        elseif (str_contains($raw, 'android')) $os = 'android';
        elseif (str_contains($raw, 'iphone') || str_contains($raw, 'ipad')) $os = 'ios';
        elseif (str_contains($raw, 'macintosh') || str_contains($raw, 'mac os')) $os = 'mac';
        elseif (str_contains($raw, 'linux')) $os = 'linux';

        return "{$browser}|{$os}";
    }

    public static function describeDevice(?string $ua): string
    {
        $fp = self::uaFingerprint($ua);
        if ($fp === '') {
            return 'Unknown Client';
        }
        [$browser, $os] = explode('|', $fp);
        return ucfirst($browser) . ' on ' . strtoupper($os);
    }

    public static function generateToken(array $user, ?Request $request = null, ?int $ttlSeconds = null): string
    {
        $sec = self::getSecuritySettings();
        $isAdminRole = self::isConsoleRole((string)($user['role'] ?? 'customer'));

        if ($ttlSeconds === null) {
            if ($isAdminRole) {
                $ttlSeconds = max(300, (int)$sec['admin_session_timeout_minutes'] * 60);
            } else {
                $ttlSeconds = max(3600, (int)$sec['jwt_expiry_days'] * 86400);
            }
        }

        $now = time();
        $exp = $now + $ttlSeconds;
        $jti = bin2hex(random_bytes(16));
        $tokenVersion = (int)($user['token_version'] ?? 1);
        if ($tokenVersion < 1) {
            $tokenVersion = 1;
        }

        $ip = $request ? $request->getIp() : ((string)($_SERVER['REMOTE_ADDR'] ?? ''));
        $ua = $request ? (string)($request->header('User-Agent') ?? ($_SERVER['HTTP_USER_AGENT'] ?? '')) : (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
        $uaFp = self::uaFingerprint($ua);

        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode([
            'sub' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'full_name' => $user['full_name'],
            'jti' => $jti,
            'tv' => $tokenVersion,
            'uaf' => $uaFp !== '' ? hash('sha256', $uaFp) : '',
            'iat' => $now,
            'exp' => $exp,
        ]);

        $b64Header = self::base64UrlEncode((string)$header);
        $b64Payload = self::base64UrlEncode((string)$payload);
        $signature = hash_hmac('sha256', "{$b64Header}.{$b64Payload}", self::getSecret(), true);
        $b64Sig = self::base64UrlEncode($signature);

        // Persist session in user_sessions for real logout/revocation & active-session tracking
        try {
            $db = Database::getInstance();
            SchemaSync::syncSecurityAndReferralSchema($db);
            $db->execute(
                'INSERT INTO user_sessions
                 (id, user_id, jti, token_version, ip_address, user_agent, device_label, is_revoked, last_seen_at, expires_at, created_at)
                 VALUES
                 (:id, :uid, :jti, :tv, :ip, :ua, :dev, 0, NOW(), :exp, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $user['id'],
                    'jti' => $jti,
                    'tv' => $tokenVersion,
                    'ip' => substr($ip, 0, 45),
                    'ua' => substr($ua, 0, 255),
                    'dev' => self::describeDevice($ua),
                    'exp' => date('Y-m-d H:i:s', $exp),
                ]
            );
            $db->execute(
                'UPDATE users SET last_login_at = NOW(), last_login_ip = :ip WHERE id = :id',
                ['ip' => substr($ip, 0, 45), 'id' => $user['id']]
            );
        } catch (\Throwable) {
        }

        return "{$b64Header}.{$b64Payload}.{$b64Sig}";
    }

    public static function verifyToken(string $token): ?array
    {
        $parts = explode('.', trim($token));
        if (count($parts) !== 3) {
            return null;
        }

        [$b64Header, $b64Payload, $b64Sig] = $parts;
        if ($b64Header === '' || $b64Payload === '' || $b64Sig === '') {
            return null;
        }

        // Strict JWT Header check prevents `alg: none` & key-confusion attacks
        $header = json_decode(self::base64UrlDecode($b64Header), true);
        if (!is_array($header) || strtoupper((string)($header['alg'] ?? '')) !== 'HS256') {
            return null;
        }

        $signature = hash_hmac('sha256', "{$b64Header}.{$b64Payload}", self::getSecret(), true);
        $expectedSig = self::base64UrlEncode($signature);

        if (!hash_equals($expectedSig, $b64Sig)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($b64Payload), true);
        if (!is_array($payload) || !isset($payload['exp']) || (int)$payload['exp'] < time()) {
            return null;
        }

        return $payload;
    }

    public static function currentPayload(Request $request): ?array
    {
        $token = $request->getBearerToken();
        if (!$token) {
            return null;
        }
        if (self::$cachedToken === $token && self::$cachedPayload !== null) {
            return self::$cachedPayload;
        }
        $payload = self::verifyToken($token);
        if ($payload) {
            self::$cachedToken = $token;
            self::$cachedPayload = $payload;
        }
        return $payload;
    }

    public static function revokeSessionByJti(string $jti, string $reason = 'logout'): void
    {
        try {
            $db = Database::getInstance();
            $db->execute(
                'UPDATE user_sessions SET is_revoked = 1, revoked_reason = :r, revoked_at = NOW() WHERE jti = :jti',
                ['r' => substr($reason, 0, 120), 'jti' => $jti]
            );
        } catch (\Throwable) {
        }
    }

    public static function revokeAllUserSessions(string $userId, string $reason = 'revoke_all', bool $bumpVersion = true): void
    {
        try {
            $db = Database::getInstance();
            if ($bumpVersion) {
                $db->execute('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = :id', ['id' => $userId]);
            }
            $db->execute(
                'UPDATE user_sessions SET is_revoked = 1, revoked_reason = :r, revoked_at = NOW() WHERE user_id = :uid AND is_revoked = 0',
                ['r' => substr($reason, 0, 120), 'uid' => $userId]
            );
        } catch (\Throwable) {
        }
    }

    public static function user(Request $request): ?array
    {
        $token = $request->getBearerToken();
        if (!$token) {
            return null;
        }

        if (self::$cachedToken === $token && self::$cachedUser !== null) {
            return self::$cachedUser;
        }

        $payload = self::verifyToken($token);
        if (!$payload || empty($payload['sub'])) {
            return null;
        }

        $db = Database::getInstance();
        SchemaSync::syncSecurityAndReferralSchema($db);

        // Enforce server-side session revocation & hijacking checks if token carries jti
        if (!empty($payload['jti'])) {
            try {
                $session = $db->fetchOne(
                    'SELECT id, user_id, is_revoked, expires_at, last_seen_at, token_version FROM user_sessions WHERE jti = :jti LIMIT 1',
                    ['jti' => (string)$payload['jti']]
                );
                if (!$session || (int)$session['is_revoked'] === 1 || strtotime((string)$session['expires_at']) < time()) {
                    return null;
                }

                // User-Agent binding defense against stolen token replay on different client class
                $sec = self::getSecuritySettings();
                if (!empty($sec['bind_session_user_agent']) && !empty($payload['uaf'])) {
                    $curUa = (string)($request->header('User-Agent') ?? ($_SERVER['HTTP_USER_AGENT'] ?? ''));
                    $curFp = self::uaFingerprint($curUa);
                    if ($curFp !== '' && !hash_equals((string)$payload['uaf'], hash('sha256', $curFp))) {
                        self::revokeSessionByJti((string)$payload['jti'], 'ua_mismatch_suspected_hijack');
                        return null;
                    }
                }

                // Sliding idle timeout check for internal console roles
                if (self::isConsoleRole((string)($payload['role'] ?? '')) && !empty($session['last_seen_at'])) {
                    $idleMinutes = max(5, (int)($sec['admin_session_timeout_minutes'] ?? 60));
                    if ((time() - strtotime((string)$session['last_seen_at'])) > ($idleMinutes * 60)) {
                        self::revokeSessionByJti((string)$payload['jti'], 'idle_timeout');
                        return null;
                    }
                }

                // Update last_seen_at at most once per 60s to minimize writes
                $lastSeenTs = !empty($session['last_seen_at']) ? strtotime((string)$session['last_seen_at']) : 0;
                if ((time() - $lastSeenTs) >= 60) {
                    $db->execute('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = :id', ['id' => $session['id']]);
                }
            } catch (\Throwable) {
            }
        }

        try {
            $user = $db->fetchOne(
                'SELECT u.id, u.email, u.full_name, u.phone_number, u.phone_normalized, u.role, u.assigned_dashboard, u.wallet_balance, 
                        u.kyc_status, u.kyc_level, u.tier, u.referral_code, u.referred_by_user_id, u.referral_source,
                        u.referral_campaign_code, u.referral_bound_at,
                        u.status, u.avatar_url, u.email_verified, u.email_verification_required, u.email_verified_at,
                        u.token_version, u.assigned_permissions,
                        u.pin_failed_attempts, u.pin_locked_until, u.pin_set_at,
                        u.mfa_enabled, u.mfa_method, u.last_login_at, u.created_at, u.updated_at,
                        (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_wallet_balance,
                        p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth,
                        p.notification_preferences, p.security_settings, p.assigned_permissions AS profile_permissions
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id AND u.status = "active"',
                ['id' => $payload['sub']]
            );
        } catch (\Throwable $e) {
            $user = $db->fetchOne(
                'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance, 
                        u.kyc_status, u.tier, u.referral_code, u.status, u.avatar_url, 
                        u.email_verified, u.created_at, u.updated_at,
                        (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_wallet_balance,
                        p.nin, p.bvn, p.address, p.state, p.lga, p.bio,
                        p.notification_preferences, p.security_settings
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id AND u.status = "active"',
                ['id' => $payload['sub']]
            );
        }

        if (!$user) {
            return null;
        }

        // Enforce token_version match when claim is present (invalidates all old tokens immediately on password/role change)
        if (isset($payload['tv']) && isset($user['token_version']) && (int)$user['token_version'] !== (int)$payload['tv']) {
            return null;
        }

        // Standardize wallet balance, KYC level, PIN flag, email verification, and JSON preferences
        $user['wallet_balance'] = (float)($user['live_wallet_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        $user['email_verified'] = (bool)($user['email_verified'] ?? false);
        $user['email_verification_required'] = (bool)($user['email_verification_required'] ?? false);
        $user['mfa_enabled'] = (bool)($user['mfa_enabled'] ?? false);
        $user['pin_failed_attempts'] = (int)($user['pin_failed_attempts'] ?? 0);
        $user['pin_is_locked'] = !empty($user['pin_locked_until']) && strtotime((string)$user['pin_locked_until']) > time();

        if (isset($user['notification_preferences']) && is_string($user['notification_preferences'])) {
            $user['notification_preferences'] = json_decode($user['notification_preferences'], true);
        }
        if (isset($user['security_settings']) && is_string($user['security_settings'])) {
            $user['security_settings'] = json_decode($user['security_settings'], true);
        }

        $perms = [];
        $hasExplicitPerms = false;
        foreach ([$user['assigned_permissions'] ?? null, $user['profile_permissions'] ?? null] as $rawPerm) {
            if (is_string($rawPerm) && trim($rawPerm) !== '') {
                $decoded = json_decode($rawPerm, true);
                if (is_array($decoded)) {
                    $perms = $decoded;
                    $hasExplicitPerms = true;
                    break;
                }
            } elseif (is_array($rawPerm)) {
                $perms = $rawPerm;
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
        } elseif (!$hasExplicitPerms && self::isConsoleRole($normalizedRole)) {
            $perms = DashboardConfigService::getDefaultPermissionsForRole($normalizedRole);
        }
        $user['permissions'] = array_values(array_unique($perms));
        unset($user['assigned_permissions'], $user['profile_permissions']);

        self::$cachedToken = $token;
        self::$cachedPayload = $payload;
        self::$cachedUser = $user;

        return $user;
    }

    public static function hasPermission(array $user, string $permission): bool
    {
        if (($user['role'] ?? '') === 'superadmin') {
            return true;
        }
        $perms = is_array($user['permissions'] ?? null) ? $user['permissions'] : [];
        return in_array('*', $perms, true) || in_array($permission, $perms, true);
    }

    public static function isEmailVerificationPending(array $user): bool
    {
        if (self::isConsoleRole((string)($user['role'] ?? 'customer'))) {
            return false;
        }
        return !empty($user['email_verification_required']) && empty($user['email_verified']);
    }

    public static function requireAuth(Request $request): array
    {
        $user = self::user($request);
        if (!$user) {
            Response::unauthorized('Authentication required or session expired.');
        }
        return $user;
    }

    public static function requireVerifiedEmail(Request $request): array
    {
        $user = self::requireAuth($request);
        if (self::isEmailVerificationPending($user)) {
            Response::error(
                'Please verify your email address before accessing wallet funding, service transactions, or submissions.',
                403,
                ['email' => $user['email'] ?? '', 'email_verification_required' => true],
                'EMAIL_VERIFICATION_REQUIRED'
            );
        }
        return $user;
    }

    public static function requireRole(Request $request, array $allowedRoles): array
    {
        $user = self::requireAuth($request);
        if (!in_array($user['role'], $allowedRoles, true)) {
            Response::forbidden('Access denied. Administrator privileges required.');
        }
        return $user;
    }

    public static function requireSuperAdmin(Request $request): array
    {
        $user = self::requireAuth($request);
        if ($user['role'] !== 'superadmin') {
            Response::forbidden('Restricted action. Super Admin privileges are required.');
        }
        return $user;
    }

    public static function requirePermission(Request $request, string $permission, array $allowedRoles = self::CONSOLE_ROLES): array
    {
        $user = self::requireRole($request, $allowedRoles);
        if (!self::hasPermission($user, $permission)) {
            Response::forbidden("Access denied. Missing required '{$permission}' permission.");
        }
        return $user;
    }

    public static function requireAnyPermission(Request $request, array $permissions, array $allowedRoles = self::CONSOLE_ROLES): array
    {
        $user = self::requireRole($request, $allowedRoles);
        foreach ($permissions as $perm) {
            if (self::hasPermission($user, (string)$perm)) {
                return $user;
            }
        }
        Response::forbidden('Access denied. Insufficient administrative permissions for this module.');
    }
}
