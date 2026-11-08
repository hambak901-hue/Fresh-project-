<?php
/**
 * HambakTech Enterprise - Authentication & Role-Based Access Control (RBAC)
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Auth
{
    private static function getSecret(): string
    {
        $config = require dirname(__DIR__) . '/config/config.php';
        return $config['app']['jwt_secret'];
    }

    /**
     * Generate signed base64 HMAC-SHA256 Token
     */
    public static function createToken(array $payload, int $expirySeconds = 604800): string
    {
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload['exp'] = time() + $expirySeconds;
        $payload['iat'] = time();

        $base64Header = rtrim(strtr(base64_encode($header), '+/', '-_'), '=');
        $base64Payload = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');

        $signature = hash_hmac('sha256', "$base64Header.$base64Payload", self::getSecret(), true);
        $base64Signature = rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');

        return "$base64Header.$base64Payload.$base64Signature";
    }

    /**
     * Decode and verify signature of token
     */
    public static function verifyToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$base64Header, $base64Payload, $base64Signature] = $parts;

        $expectedSig = hash_hmac('sha256', "$base64Header.$base64Payload", self::getSecret(), true);
        $expectedBase64Sig = rtrim(strtr(base64_encode($expectedSig), '+/', '-_'), '=');

        if (!hash_equals($expectedBase64Sig, $base64Signature)) {
            return null;
        }

        $payload = json_decode(base64_decode(strtr($base64Payload, '-_', '+/')), true);
        if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
            return null; // Expired or malformed
        }

        return $payload;
    }

    /**
     * Extract token from request Authorization header
     */
    public static function getBearerToken(): ?string
    {
        $headers = null;
        if (isset($_SERVER['Authorization'])) {
            $headers = trim($_SERVER['Authorization']);
        } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers = trim($_SERVER['HTTP_AUTHORIZATION']);
        } elseif (function_exists('apache_request_headers')) {
            $requestHeaders = apache_request_headers();
            $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
            if (isset($requestHeaders['Authorization'])) {
                $headers = trim($requestHeaders['Authorization']);
            }
        }

        if (!empty($headers) && preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
            return $matches[1];
        }

        return null;
    }

    /**
     * Enforce authentication and return decoded claims
     */
    public static function authenticate(): array
    {
        $token = self::getBearerToken();
        if (!$token) {
            Response::unauthorized('Authentication token missing from request headers');
        }

        $payload = self::verifyToken($token);
        if (!$payload) {
            Response::unauthorized('Invalid or expired authentication session');
        }

        return $payload;
    }

    /**
     * Enforce specific roles (e.g. 'superadmin', 'admin')
     */
    public static function requireRole(string|array $allowedRoles): array
    {
        $user = self::authenticate();
        $roles = is_array($allowedRoles) ? $allowedRoles : [$allowedRoles];

        if (!in_array($user['role'] ?? '', $roles, true)) {
            Response::forbidden('Access restricted to: ' . implode(', ', $roles));
        }

        return $user;
    }
}
