<?php
declare(strict_types=1);

namespace Hambak\Middleware;

use Hambak\Core\Request;
use Hambak\Core\Response;

/**
 * File-based Rate Limiter for cPanel runtime (prevents abusive burst traffic)
 */
class RateLimitMiddleware
{
    private static int $limit = 120; // 120 requests per minute
    private static int $window = 60; // 60 seconds

    public static function handle(Request $request): void
    {
        $ip = $request->getClientIp();
        $cacheDir = sys_get_temp_dir() . '/hambak_rate_limits';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0777, true);
        }

        $hash = md5($ip);
        $file = $cacheDir . '/' . $hash . '.json';
        $now = time();

        $data = ['count' => 0, 'reset' => $now + self::$window];
        if (file_exists($file)) {
            $content = @file_get_contents($file);
            $parsed = json_decode((string)$content, true);
            if (is_array($parsed) && isset($parsed['reset']) && $parsed['reset'] > $now) {
                $data = $parsed;
            }
        }

        $data['count']++;
        @file_put_contents($file, json_encode($data));

        header('X-RateLimit-Limit: ' . self::$limit);
        header('X-RateLimit-Remaining: ' . max(0, self::$limit - $data['count']));
        header('X-RateLimit-Reset: ' . $data['reset']);

        if ($data['count'] > self::$limit) {
            Response::error('Too many requests. Please slow down.', 429, 'RATE_LIMIT_EXCEEDED');
        }
    }
}
