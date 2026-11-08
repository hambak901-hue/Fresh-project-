<?php
/**
 * HambakTech Enterprise - Production Configuration (PHP 8.2+)
 * Designed for cPanel Shared Hosting (TrueHost LON110)
 */

declare(strict_types=1);

// Prevent direct script access if needed
if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__));
}

return [
    'app' => [
        'name' => 'HambakTech Enterprise Portal',
        'env' => getenv('APP_ENV') ?: 'production',
        'debug' => (getenv('APP_DEBUG') ?: 'false') === 'true',
        'url' => getenv('APP_URL') ?: 'https://hambaktech.com.ng',
        'jwt_secret' => getenv('JWT_SECRET') ?: 'hambaktech_jwt_super_secure_key_lon110_2026_x',
        'jwt_expiry' => 86400 * 7, // 7 days
    ],

    'database' => [
        'host' => getenv('DB_HOST') ?: 'localhost',
        'port' => (int)(getenv('DB_PORT') ?: 3306),
        'database' => getenv('DB_DATABASE') ?: 'qfqzpeqx_hambakdb',
        'username' => getenv('DB_USERNAME') ?: 'qfqzpeqx_dbuser',
        'password' => getenv('DB_PASSWORD') ?: '2h9PAQk[kE[t96',
        'charset' => 'utf8mb4',
    ],

    // Identity Verification Multi-Provider Credentials
    'verification' => [
        'default_provider' => '2sureverify',
        'providers' => [
            '2sureverify' => [
                'api_key' => getenv('SUREVERIFY_API_KEY') ?: '664469ea92436a4c7ff997281a32a742dcd84f9a5e6603f0',
                'base_url' => 'https://api.2sureverify.com/api',
            ],
            'veripine' => [
                'api_key' => getenv('VERIPINE_API_KEY') ?: 'ninbvn_6443d1d6279df9af26b60dc4',
                'base_url' => 'https://api.veripine.com/v1',
            ],
        ],
    ],

    // Telecom & VTU Multi-Provider Credentials
    'telecom' => [
        'default_provider' => 'ulamadata',
        'providers' => [
            'ulamadata' => [
                'api_key' => getenv('ULAMADATA_API_KEY') ?: '7aOkA4OzIF6xfuUIXbvk7ByxVGH0U5gSNy1OfpYb',
                'base_url' => 'https://ulamadata.com/api',
            ],
            'vtpass' => [
                'api_key' => getenv('VTPASS_API_KEY') ?: 'c0eb1581608e693f07a44b1e21b44b3a',
                'public_key' => getenv('VTPASS_PUBLIC_KEY') ?: 'PK_70323b6a3fb2a9935cb088d504dba889827c54d65c5',
                'secret_key' => getenv('VTPASS_SECRET_KEY') ?: 'SK_49251b696102fd8cc7cb0b4577ea754b2a403aa504e',
                'base_url' => 'https://api-service.vtpass.com/api',
            ],
        ],
    ],

    // Payment Gateways
    'payments' => [
        'flutterwave' => [
            'client_id' => getenv('FLUTTERWAVE_CLIENT_ID') ?: 'ee617da5-060b-40cd-b96a-19d83465caf2',
            'secret_key' => getenv('FLUTTERWAVE_SECRET_KEY') ?: 'EA7eW5ufUhixy8kZTnMePGAOp3rD1PwyWHKwc77cPWppzXQIJu1apqziDHzEUHaEYWeZsbskFrjwK',
            'encryption_key' => getenv('FLUTTERWAVE_ENCRYPTION_KEY') ?: 'JeILcT6i0ctrr4JRKOZyZUQ+XBBV3RJKpkdLmwOzKQY=',
        ],
        'moniepoint_bank' => [
            'bank' => 'Moniepoint MFB',
            'account_name' => 'Hambak Technologies Enterprise',
            'account_number' => '8210492817',
        ],
    ],

    // TrueHost LON110 Mail Server
    'mail' => [
        'host' => getenv('SMTP_HOST') ?: 'lon110.truehost.cloud',
        'port' => (int)(getenv('SMTP_PORT') ?: 587),
        'encryption' => getenv('SMTP_ENCRYPTION') ?: 'tls',
        'username' => getenv('SMTP_USER') ?: 'notifications@hambaktech.com.ng',
        'password' => getenv('SMTP_PASS') ?: 'Hamohullah19@..',
        'from_name' => 'HambakTech Enterprise',
        'from_address' => 'notifications@hambaktech.com.ng',
        'support_email' => 'support@hambaktech.com.ng',
    ],

    // cPanel Server Attributes
    'cpanel' => [
        'server_name' => 'LON110',
        'server_ip' => '51.89.153.183',
        'sftp_port' => 1624,
        'sftp_user' => 'qfqzpeqx',
    ],
];
