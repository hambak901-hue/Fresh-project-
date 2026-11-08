<?php
/**
 * HambakTech Enterprise - Security, Sanitization & Masking Engine
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Security
{
    /**
     * Hash password using strong standard BCRYPT with cost 12
     */
    public static function hashPassword(string $plainText): string
    {
        return password_hash($plainText, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /**
     * Verify plain text against stored hash
     */
    public static function verifyPassword(string $plainText, string $hash): bool
    {
        return password_verify($plainText, $hash);
    }

    /**
     * Clean and sanitize input strings
     */
    public static function sanitizeString(string $input): string
    {
        return trim(strip_tags($input));
    }

    /**
     * Escape output for HTML injection prevention
     */
    public static function escapeHtml(string $input): string
    {
        return htmlspecialchars($input, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Generate cryptographic CSRF token
     */
    public static function generateCsrfToken(): string
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
        return $token;
    }

    /**
     * Validate CSRF token against active session
     */
    public static function validateCsrfToken(?string $token): bool
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        if (empty($token) || empty($_SESSION['csrf_token'])) {
            return false;
        }
        return hash_equals($_SESSION['csrf_token'], $token);
    }

    /**
     * Mask sensitive identity credentials (NIN, BVN, phone)
     * e.g., "12345678901" -> "123*****901"
     */
    public static function maskIdentifier(string $value, int $visibleStart = 3, int $visibleEnd = 3): string
    {
        $len = strlen($value);
        if ($len <= ($visibleStart + $visibleEnd)) {
            return str_repeat('*', $len);
        }
        $start = substr($value, 0, $visibleStart);
        $end = substr($value, -$visibleEnd);
        $masked = str_repeat('*', max(3, $len - $visibleStart - $visibleEnd));
        return $start . $masked . $end;
    }

    /**
     * Strip private provider costs and credentials before sending catalogue to customers
     */
    public static function sanitizeServiceCatalogue(array $services): array
    {
        return array_map(function ($item) {
            unset($item['cost_price']);
            unset($item['provider_id']);
            unset($item['provider_service_code']);
            unset($item['provider_credentials']);
            return $item;
        }, $services);
    }
}
