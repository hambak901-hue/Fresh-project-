<?php
declare(strict_types=1);

/**
 * HambakTech Smart Digital Platform — Production Environment Loader
 * Authoritative loader for .env configuration outside public web root.
 * Target: cPanel (PHP 8.1+ / MySQL 8.x) & Local Development
 */

(function () {
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;

    // Documented hierarchy for production .env location:
    // 1. Explicit ENV_FILE if passed by process manager
    // 2. /home/qfqzpeqx/.env (Authoritative cPanel location outside public_html)
    // 3. Workspace root .env (Local development)
    // 4. Backend root .env
    // NOTE: /public_html/.env is intentionally excluded to guarantee secrets never reside in web root.
    $candidateEnvFiles = array_filter([
        getenv('ENV_FILE') ?: null,
        '/home/qfqzpeqx/.env',
        '/home/qfqzpeqx/hambaktech_env/.env',
        dirname(__DIR__, 2) . '/.env',
        dirname(__DIR__) . '/.env',
    ]);

    foreach ($candidateEnvFiles as $envFile) {
        if (file_exists($envFile) && is_readable($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }
                if (str_contains($line, '=')) {
                    [$key, $value] = explode('=', $line, 2);
                    $key = trim($key);
                    $value = trim($value, " \t\n\r\0\x0B\"'");
                    if (!getenv($key)) {
                        putenv("{$key}={$value}");
                    }
                    if (!isset($_ENV[$key])) {
                        $_ENV[$key] = $value;
                    }
                    if (!isset($_SERVER[$key])) {
                        $_SERVER[$key] = $value;
                    }
                }
            }
            break;
        }
    }
})();
