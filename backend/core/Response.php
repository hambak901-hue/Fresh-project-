<?php
/**
 * HambakTech Enterprise - Standard REST API Response Formatter
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Response
{
    public static function json(
        mixed $data = null,
        int $statusCode = 200,
        string $message = 'Success',
        bool $success = true,
        array $errors = []
    ): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=UTF-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-CSRF-Token');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

        echo json_encode([
            'success' => $success,
            'message' => $message,
            'statusCode' => $statusCode,
            'data' => $data,
            'errors' => $errors,
            'timestamp' => date('c'),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function success(mixed $data = null, string $message = 'Operation successful', int $code = 200): void
    {
        self::json($data, $code, $message, true);
    }

    public static function error(string $message = 'An error occurred', int $code = 400, array $errors = []): void
    {
        self::json(null, $code, $message, false, $errors);
    }

    public static function unauthorized(string $message = 'Authentication required'): void
    {
        self::json(null, 401, $message, false);
    }

    public static function forbidden(string $message = 'Insufficient permissions for this action'): void
    {
        self::json(null, 403, $message, false);
    }

    public static function notFound(string $message = 'Requested resource not found'): void
    {
        self::json(null, 404, $message, false);
    }
}
