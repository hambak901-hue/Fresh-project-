<?php
/**
 * @file config.php
 * Production Configuration for HambakTech Enterprise Portal
 * Standard PHP 8.2+ Architecture
 */

declare(strict_types=1);

// Prevent direct script execution if not via entry point
if (!defined('HAMBAKTECH_ROOT')) {
    define('HAMBAKTECH_ROOT', dirname(__DIR__));
}

// Environment Detection
$envFile = dirname(HAMBAKTECH_ROOT) . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $val = trim($parts[1]);
            // Strip quotes
            $val = trim($val, '"\'');
            if (!getenv($key)) {
                putenv("{$key}={$val}");
                $_ENV[$key] = $val;
            }
        }
    }
}

return [
    'app' => [
        'name' => getenv('APP_NAME') ?: 'HambakTech Enterprise',
        'env' => getenv('APP_ENV') ?: 'production',
        'debug' => getenv('APP_DEBUG') === 'true',
        'url' => getenv('APP_URL') ?: 'https://hambaktech.com.ng',
        'timezone' => 'Africa/Lagos',
        'version' => '2.5.0-STAGE2',
    ],
    'security' => [
        'jwt_secret' => getenv('JWT_SECRET') ?: '',
        'jwt_expiry' => 86400 * 7, // 7 days
        'hash_cost' => 12,
        'salt' => getenv('APP_SALT') ?: '',
    ],
    'database' => [
        'driver' => 'mysql',
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int)(getenv('DB_PORT') ?: 3306),
        'database' => getenv('DB_DATABASE') ?: 'hambaktech_db',
        'username' => getenv('DB_USERNAME') ?: 'hambaktech_user',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
        'collation' => 'utf8mb4_unicode_ci',
    ],
    'providers' => [
        '2sureverify' => [
            'base_url' => 'https://2sureverify.com',
            'api_key' => getenv('SUREVERIFY_API_KEY') ?: '',
            'timeout' => 30,
        ],
        'veripine' => [
            'base_url' => 'https://api.veripine.com/v1',
            'api_key' => getenv('VERIPINE_API_KEY') ?: '',
            'timeout' => 30,
        ],
        'ulamadata' => [
            'base_url' => 'https://ulamadata.com',
            'api_key' => getenv('ULAMADATA_API_KEY') ?: '',
            'timeout' => 30,
        ],
        'vtpass' => [
            'base_url' => 'https://api-service.vtpass.com/api',
            'api_key' => getenv('VTPASS_API_KEY') ?: '',
            'public_key' => getenv('VTPASS_PUBLIC_KEY') ?: '',
            'secret_key' => getenv('VTPASS_SECRET_KEY') ?: '',
            'timeout' => 30,
        ],
        'paystack' => [
            'public_key' => getenv('PAYSTACK_PUBLIC_KEY') ?: '',
            'secret_key' => getenv('PAYSTACK_SECRET_KEY') ?: '',
            'base_url' => 'https://api.paystack.co',
        ],
        'flutterwave' => [
            'public_key' => getenv('FLUTTERWAVE_PUBLIC_KEY') ?: '',
            'secret_key' => getenv('FLUTTERWAVE_SECRET_KEY') ?: '',
            'encryption_key' => getenv('FLUTTERWAVE_ENCRYPTION_KEY') ?: '',
        ],
    ],
    'mail' => [
        'host' => getenv('SMTP_HOST') ?: 'mail.hambaktech.com.ng',
        'fallback_host' => 'lon110.truehost.cloud',
        'port' => (int)(getenv('SMTP_PORT') ?: 465),
        'fallback_port' => 587,
        'secure' => true,
        'user' => getenv('SMTP_USER') ?: 'support@hambaktech.com.ng',
        'info_user' => 'info@hambaktech.com.ng',
        'from_name' => 'HambakTech Support',
        'from_email' => 'support@hambaktech.com.ng',
        'webmail_url' => 'http://www.hambaktech.com.ng/webmail',
        'incoming_server' => 'mail.hambaktech.com.ng',
        'imap_port' => 993,
        'pop3_port' => 995,
    ],
    'cpanel' => [
        'server_name' => 'LON110',
        'server_ip' => '51.89.153.183',
        'sftp_host' => '51.89.153.183',
        'sftp_port' => 1624,
        'sftp_user' => getenv('CPANEL_SFTP_USER') ?: 'qfqzpeqx',
        'sftp_pass' => getenv('CPANEL_SFTP_PASS') ?: '2h9PAQk[kE[t96',
        'nameservers' => [
            'ns1.cloudoon.com (57.128.250.247)',
            'ns2.cloudoon.net (49.12.105.164)',
            'ns3.cloudoon.org (158.69.211.95)',
        ],
    ],
];
