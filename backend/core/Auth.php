<?php
/**
 * @file Auth.php
 * JWT Generation, Token Validation & Role-Based Access Control
 */

declare(strict_types=1);

namespace HambakTech\Core;

use Exception;

class Auth
{
    private static function getSecret(): string
    {
        $config = require __DIR__ . '/../config/config.php';
        return $config['security']['jwt_secret'];
    }

    public static function generateToken(array $user): string
    {
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode([
            'sub' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'full_name' => $user['full_name'],
            'iat' => time(),
            'exp' => time() + (86400 * 7), // 7 days
        ]);

        $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
        $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
        $signature = hash_hmac('sha256', "{$base64UrlHeader}.{$base64UrlPayload}", self::getSecret(), true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

        return "{$base64UrlHeader}.{$base64UrlPayload}.{$base64UrlSignature}";
    }

    public static function verifyToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$base64UrlHeader, $base64UrlPayload, $base64UrlSignature] = $parts;

        $signature = hash_hmac('sha256', "{$base64UrlHeader}.{$base64UrlPayload}", self::getSecret(), true);
        $expectedSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

        if (!hash_equals($expectedSignature, $base64UrlSignature)) {
            return null;
        }

        $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $base64UrlPayload)), true);
        if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
            return null;
        }

        return $payload;
    }

    public static function user(Request $request): ?array
    {
        $token = $request->getBearerToken();
        if (!$token) {
            return null;
        }

        $payload = self::verifyToken($token);
        if (!$payload || !isset($payload['sub'])) {
            return null;
        }

        $db = Database::getInstance();
        $user = $db->fetchOne(
            'SELECT u.id, u.email, u.full_name, u.phone_number, u.role, u.wallet_balance, 
                    u.kyc_status, u.tier, u.referral_code, u.status, u.avatar_url, 
                    u.email_verified, u.created_at, u.updated_at,
                    w.balance AS live_wallet_balance,
                    p.nin, p.bvn, p.address, p.state, p.lga, p.bio
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE u.id = :id AND u.status = "active"',
            ['id' => $payload['sub']]
        );

        if (!$user) {
            return null;
        }

        // Standardize wallet balance
        $user['wallet_balance'] = (float)($user['live_wallet_balance'] ?? $user['wallet_balance'] ?? 0);
        return $user;
    }

    public static function requireAuth(Request $request): array
    {
        $user = self::user($request);
        if (!$user) {
            Response::unauthorized('Authentication required to access this resource.');
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
}
