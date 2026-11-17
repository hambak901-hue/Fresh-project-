<?php
/**
 * @file Response.php
 * Standardized JSON API Response Engine with Hardened CORS & Security Headers
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Response
{
    private static function resolveAllowedOrigin(): string
    {
        $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($origin === '') {
            return '';
        }

        $defaults = [
            'https://hambaktech.com.ng',
            'https://www.hambaktech.com.ng',
            'http://hambaktech.com.ng',
            'http://www.hambaktech.com.ng',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
        ];

        $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
        if ($host !== '') {
            $defaults[] = 'https://' . $host;
            $defaults[] = 'http://' . $host;
        }

        $envOrigins = trim((string)(getenv('CORS_ALLOWED_ORIGINS') ?: ''));
        if ($envOrigins !== '') {
            foreach (explode(',', $envOrigins) as $eo) {
                $clean = trim($eo);
                if ($clean !== '') {
                    $defaults[] = $clean;
                }
            }
        }

        // Allow AI Studio / preview sandbox subdomains if served over HTTPS in dev previews
        $allowed = array_unique($defaults);
        if (in_array($origin, $allowed, true)) {
            return $origin;
        }

        // Optional runtime list from MySQL system_settings
        try {
            $db = Database::getInstance();
            $row = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "security_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $cfg = json_decode((string)$row['setting_value'], true);
                if (is_array($cfg) && !empty($cfg['allowed_cors_origins']) && is_array($cfg['allowed_cors_origins'])) {
                    foreach ($cfg['allowed_cors_origins'] as $o) {
                        $oStr = trim((string)$o);
                        if ($oStr === '*') {
                            return $origin;
                        }
                        if ($oStr !== '' && strcasecmp($oStr, $origin) === 0) {
                            return $origin;
                        }
                    }
                }
            }
        } catch (\Throwable) {
        }

        // Fallback for local/same-host requests whose Origin matches server host
        $parsedOriginHost = parse_url($origin, PHP_URL_HOST);
        $serverHostNoPort = explode(':', $host)[0] ?? '';
        if ($parsedOriginHost && $serverHostNoPort !== '' && strcasecmp((string)$parsedOriginHost, $serverHostNoPort) === 0) {
            return $origin;
        }

        return '';
    }

    public static function json(mixed $data, int $status = 200, array $headers = []): void
    {
        $allowedOrigin = self::resolveAllowedOrigin();
        if ($allowedOrigin !== '') {
            header("Access-Control-Allow-Origin: {$allowedOrigin}");
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Idempotency-Key');
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');

        foreach ($headers as $k => $v) {
            header("{$k}: {$v}");
        }

        http_response_code($status);
        try {
            echo json_encode(
                $data,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR
            );
        } catch (\Throwable $e) {
            error_log('[Response JSON Encode Error]: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'status' => 'error',
                'message' => 'Failed to encode server response.',
            ]);
        }
        exit;
    }

    public static function success(mixed $data = null, string $message = 'Operation successful', int $status = 200): void
    {
        $payload = [
            'success' => true,
            'status' => 'success',
            'message' => $message,
            'data' => $data,
            'timestamp' => date('c'),
        ];

        // Hoist associative array keys to top-level for backwards compatibility
        if (is_array($data) && !array_is_list($data)) {
            foreach ($data as $k => $v) {
                if (!isset($payload[$k])) {
                    $payload[$k] = $v;
                }
            }
        }

        self::json($payload, $status);
    }

    public static function error(string $message, int $status = 400, mixed $errors = null, ?string $code = null): void
    {
        $payload = [
            'success' => false,
            'status' => 'error',
            'message' => $message,
            'timestamp' => date('c'),
        ];

        if ($code !== null) {
            $payload['code'] = $code;
        }

        if ($errors !== null) {
            $payload['errors'] = $errors;
        }

        self::json($payload, $status);
    }

    public static function unauthorized(string $message = 'Unauthorized. Valid authentication token required.'): void
    {
        self::error($message, 401, null, 'UNAUTHORIZED');
    }

    public static function forbidden(string $message = 'Forbidden. Insufficient permissions.'): void
    {
        self::error($message, 403, null, 'FORBIDDEN');
    }

    public static function notFound(string $message = 'Resource not found.'): void
    {
        self::error($message, 404, null, 'NOT_FOUND');
    }
}
