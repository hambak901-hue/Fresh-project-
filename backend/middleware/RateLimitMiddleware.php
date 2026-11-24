<?php
declare(strict_types=1);

namespace HambakTech\Middleware;

use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;

/**
 * Tiered File-based Rate Limiter for cPanel runtime (prevents abusive burst traffic & brute force).
 */
class RateLimitMiddleware
{
    public static function handle(Request $request): void
    {
        $method = strtoupper($request->getMethod());
        if ($method === 'OPTIONS') {
            return;
        }

        $path = strtolower(rtrim($request->getPath(), '/') ?: '/');
        if (str_starts_with($path, '/backend')) {
            $path = substr($path, strlen('/backend')) ?: '/';
        }

        // Exempt lightweight health probe from tight throttling
        if ($path === '/api/health') {
            return;
        }

        [$tier, $limit, $window] = self::resolveTier($method, $path);
        $ip = Security::resolveClientIp();

        $cacheDir = sys_get_temp_dir() . '/hambak_rate_limits';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0750, true);
        }

        $key = hash('sha256', $ip . '|' . $tier);
        $file = $cacheDir . '/' . $key . '.json';
        $now = time();

        $data = ['count' => 0, 'reset' => $now + $window];

        $fp = @fopen($file, 'c+');
        if ($fp !== false) {
            if (@flock($fp, LOCK_EX)) {
                $raw = stream_get_contents($fp);
                $parsed = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
                if (is_array($parsed) && isset($parsed['reset']) && (int)$parsed['reset'] > $now) {
                    $data = [
                        'count' => (int)($parsed['count'] ?? 0),
                        'reset' => (int)$parsed['reset'],
                    ];
                }
                $data['count']++;
                ftruncate($fp, 0);
                rewind($fp);
                fwrite($fp, json_encode($data));
                fflush($fp);
                @flock($fp, LOCK_UN);
            }
            @fclose($fp);
        } else {
            // Fallback if temp lock unavailable
            if (file_exists($file)) {
                $parsed = json_decode((string)@file_get_contents($file), true);
                if (is_array($parsed) && isset($parsed['reset']) && (int)$parsed['reset'] > $now) {
                    $data = $parsed;
                }
            }
            $data['count'] = (int)($data['count'] ?? 0) + 1;
            @file_put_contents($file, json_encode($data), LOCK_EX);
        }

        $remaining = max(0, $limit - (int)$data['count']);
        $retryAfter = max(1, (int)$data['reset'] - $now);

        header('X-RateLimit-Tier: ' . $tier);
        header('X-RateLimit-Limit: ' . $limit);
        header('X-RateLimit-Remaining: ' . $remaining);
        header('X-RateLimit-Reset: ' . (int)$data['reset']);

        if ((int)$data['count'] > $limit) {
            header('Retry-After: ' . $retryAfter);
            Response::error(
                'Too many requests. Please slow down and try again shortly.',
                429,
                [
                    'tier' => $tier,
                    'retry_after' => $retryAfter,
                ],
                'RATE_LIMIT_EXCEEDED'
            );
        }
    }

    /**
     * @return array{0: string, 1: int, 2: int}
     */
    private static function resolveTier(string $method, string $path): array
    {
        $authStrictPaths = [
            '/api/auth/login',
            '/api/auth/register',
            '/api/auth/forgot-password',
            '/api/auth/reset-password',
            '/api/auth/verify-email',
            '/api/auth/resend-verification',
            '/api/auth/resend-otp',
            '/api/security/pin/reset-otp',
            '/api/security/pin/reset-confirm',
        ];
        if (in_array($path, $authStrictPaths, true)) {
            return ['auth_strict', 20, 60];
        }

        if ($method === 'POST' && (
            str_starts_with($path, '/api/verification/') ||
            str_starts_with($path, '/api/modifications/submit') ||
            str_starts_with($path, '/api/enrolment/submit') ||
            str_starts_with($path, '/api/telecom/vend') ||
            str_starts_with($path, '/api/telecom/purchase') ||
            str_starts_with($path, '/api/telecom/bulksms') ||
            str_starts_with($path, '/api/wallet/fund') ||
            str_starts_with($path, '/api/wallet/paystack') ||
            str_starts_with($path, '/api/wallet/flutterwave')
        )) {
            return ['transactional_write', 40, 60];
        }

        return ['general_api', 180, 60];
    }
}
