<?php
declare(strict_types=1);

namespace Hambak\Middleware;

use Hambak\Core\Request;

/**
 * Cross-Origin Resource Sharing (CORS) Middleware
 */
class CorsMiddleware
{
    public static function handle(Request $request): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        // Set CORS headers safely compliant with W3C credentials specification
        if (!empty($origin)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
        } else {
            header('Access-Control-Allow-Origin: *');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Idempotency-Key');
        header('Access-Control-Max-Age: 86400');

        if ($request->getMethod() === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
