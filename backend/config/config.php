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

// Environment Detection - Check multiple standard paths (including cPanel home directory)
$possibleEnvFiles = array_filter([
    getenv('ENV_FILE') ?: null,
    getenv('HOME') ? rtrim((string)getenv('HOME'), '/') . '/.env' : null,
    dirname(HAMBAKTECH_ROOT, 3) . '/.env',
    dirname(HAMBAKTECH_ROOT, 2) . '/.env',
    dirname(HAMBAKTECH_ROOT) . '/.env',
    HAMBAKTECH_ROOT . '/.env',
    (isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== '') ? dirname($_SERVER['DOCUMENT_ROOT']) . '/.env' : null,
    (isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== '') ? $_SERVER['DOCUMENT_ROOT'] . '/.env' : null,
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__) . '/.env',
]);

foreach ($possibleEnvFiles as $envFile) {
    if (!empty($envFile) && file_exists($envFile)) {
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
                $val = trim($val, '"\'');
                if (!getenv($key)) {
                    putenv("{$key}={$val}");
                    $_ENV[$key] = $val;
                }
            }
        }
        break;
    }
}

return [
    'app' => [
        'name' => getenv('APP_NAME') ?: 'HambakTech Enterprise',
        'env' => getenv('APP_ENV') ?: 'production',
        'debug' => getenv('APP_DEBUG') === 'true',
        'url' => getenv('APP_URL') ?: 'https://hambaktech.com.ng',
        'timezone' => 'Africa/Lagos',
        'version' => '2.8.0-STAGE8',
    ],
    'security' => [
        'jwt_secret' => getenv('JWT_SECRET') ?: '',
        'jwt_expiry' => 86400 * 7, // 7 days
        'hash_cost' => 12,
        'salt' => getenv('APP_SALT') ?: '',
    ],
    'database' => [
        'driver' => 'mysql',
        'host' => getenv('DB_HOST') ?: 'localhost',
        'port' => (int)(getenv('DB_PORT') ?: 3306),
        'database' => getenv('DB_NAME') ?: (getenv('DB_DATABASE') ?: ''),
        'username' => getenv('DB_USER') ?: (getenv('DB_USERNAME') ?: ''),
        'password' => getenv('DB_PASSWORD') ?: (getenv('DB_PASS') ?: ''),
        'charset' => 'utf8mb4',
        'collation' => 'utf8mb4_unicode_ci',
    ],
    'providers' => [
        '2sureverify' => [
            'base_url' => getenv('TWOSUREVERIFY_BASE_URL') ?: 'https://2sureverify.com',
            'api_key' => getenv('TWOSUREVERIFY_API_KEY') ?: (getenv('SUREVERIFY_API_KEY') ?: ''),
            'timeout' => 30,
        ],
        'veripine' => [
            'base_url' => getenv('VERIPINE_BASE_URL') ?: 'https://veripine.com/api',
            'api_key' => getenv('VERIPINE_API_KEY') ?: '',
            'timeout' => 30,
        ],
        'ulamadata' => [
            'base_url' => getenv('ULAMADATA_BASE_URL') ?: 'https://www.ulamadata.ng',
            'api_key' => getenv('ULAMADATA_API_KEY') ?: '',
            'timeout' => 30,
        ],
        'vtpass' => [
            'env' => getenv('VTPASS_ENV') ?: 'live',
            'base_url' => getenv('VTPASS_API_BASE_URL') ?: (getenv('VTPASS_BASE_URL') ?: ((getenv('VTPASS_ENV') === 'sandbox') ? 'https://sandbox.vtpass.com/api' : 'https://api-service.vtpass.com/api')),
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
            'secret_hash' => getenv('FLUTTERWAVE_SECRET_HASH') ?: (getenv('FLW_SECRET_HASH') ?: (getenv('FLUTTERWAVE_WEBHOOK_SECRET') ?: '')),
            'base_url' => 'https://api.flutterwave.com/v3',
        ],
    ],
    'mail' => [
        'host' => getenv('SMTP_HOST') ?: 'mail.hambaktech.com.ng',
        'fallback_host' => 'lon110.truehost.cloud',
        'port' => (int)(getenv('SMTP_PORT') ?: 465),
        'fallback_port' => 587,
        'encryption' => getenv('SMTP_ENCRYPTION') ?: (((int)(getenv('SMTP_PORT') ?: 465) === 465) ? 'ssl' : 'tls'),
        'secure' => true,
        'user' => getenv('SMTP_USERNAME') ?: (getenv('SMTP_USER') ?: 'support@hambaktech.com.ng'),
        'password' => getenv('SMTP_PASSWORD') ?: (getenv('SMTP_PASS') ?: ''),
        'info_user' => 'info@hambaktech.com.ng',
        'from_name' => getenv('SMTP_FROM_NAME') ?: 'HambakTech Support',
        'from_email' => getenv('SMTP_FROM') ?: 'support@hambaktech.com.ng',
        'webmail_url' => 'http://www.hambaktech.com.ng/webmail',
        'incoming_server' => 'mail.hambaktech.com.ng',
        'imap_port' => 993,
        'pop3_port' => 995,
    ],
    'cpanel' => [
        'server_name' => getenv('CPANEL_SERVER_NAME') ?: '',
        'server_ip' => getenv('CPANEL_SERVER_IP') ?: '',
        'sftp_host' => getenv('CPANEL_SFTP_HOST') ?: '',
        'sftp_user' => getenv('CPANEL_SFTP_USER') ?: '',
        'sftp_pass' => getenv('CPANEL_SFTP_PASS') ?: '',
    ],
];
