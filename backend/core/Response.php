<?php
/**
 * @file Response.php
 * Standardized JSON API Response Engine with CORS Headers and HTTP Status Handlers
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Response
{
    public static function json(mixed $data, int $status = 200, array $headers = []): void
    {
        // Set CORS & Security Headers
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Idempotency-Key');
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('X-XSS-Protection: 1; mode=block');

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
