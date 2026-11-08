<?php
/**
 * HambakTech Enterprise - Production API Front Controller (PHP 8.2+)
 * Entry point for cPanel shared hosting (TrueHost LON110)
 */

declare(strict_types=1);

define('APP_ROOT', __DIR__);

// Autoload core files
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/core/Response.php';
require_once __DIR__ . '/core/Security.php';
require_once __DIR__ . '/core/Auth.php';
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/adapters/verification/VerificationAdapterInterface.php';
require_once __DIR__ . '/adapters/telecom/TelecomAdapterInterface.php';
require_once __DIR__ . '/adapters/payment/PaymentGatewayInterface.php';

use HambakTech\Core\Response;
use HambakTech\Core\Router;
use HambakTech\Core\Auth;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;
use HambakTech\Adapters\Verification\VeripineAdapter;
use HambakTech\Adapters\Telecom\UlamaDataAdapter;
use HambakTech\Adapters\Telecom\VTpassAdapter;
use HambakTech\Adapters\Payment\FlutterwaveAdapter;

$router = new Router();
$config = require __DIR__ . '/config/config.php';

// Root health & status
$router->get('/health', function () use ($config) {
    Response::success([
        'status' => 'ONLINE',
        'runtime' => 'PHP ' . PHP_VERSION,
        'server' => $config['cpanel']['server_name'] . ' (cPanel Shared Hosting)',
        'app' => $config['app']['name'],
        'timestamp' => date('c'),
    ], 'HambakTech PHP 8.2 Production Backend Active');
});

// GET /api/system/status
$router->get('/system/status', function () use ($config) {
    Response::success([
        'status' => 'ONLINE',
        'runtime' => 'PHP ' . PHP_VERSION,
        'phase' => '01 Project Foundation and System Architecture',
        'credentials' => [
            'veripine' => ['configured' => true, 'keyMasked' => 'ninbvn_644...b60dc4'],
            'sureverify' => ['configured' => true, 'keyMasked' => '664469ea...6603f0'],
            'ulamaData' => ['configured' => true, 'keyMasked' => '7aOkA4Oz...1OfpYb'],
            'vtpass' => [
                'configured' => true,
                'apiKeyMasked' => 'c0eb1581...',
                'publicKeyMasked' => 'PK_70323...',
                'secretKeyMasked' => 'SK_49251...',
            ],
            'flutterwave' => [
                'configured' => true,
                'clientIdMasked' => 'ee617da5...',
                'secretKeyMasked' => 'EA7eW5uf...',
                'encryptionKeyConfigured' => true,
            ],
            'smtpMail' => [
                'configured' => true,
                'host' => 'lon110.truehost.cloud',
                'port' => 587,
                'user' => 'notifications@hambaktech.com.ng',
                'supportEmail' => 'support@hambaktech.com.ng',
            ],
            'cpanel' => [
                'serverName' => 'LON110',
                'serverIp' => '51.89.153.183',
                'sftpHost' => '51.89.153.183',
                'sftpPort' => 1624,
                'sftpUser' => 'qfqzpeqx',
                'nameservers' => [
                    'ns1.cloudoon.com (57.128.250.247)',
                    'ns2.cloudoon.net (49.12.105.164)',
                    'ns3.cloudoon.org (158.69.211.95)',
                ],
            ],
        ],
    ]);
});

// GET /api/services/catalogue (Public catalogue with private costs stripped)
$router->get('/services/catalogue', function () {
    $services = [
        ['id' => 'nin_standard', 'name' => 'NIN Standard Verification', 'type' => 'identity', 'selling_price' => 250.00],
        ['id' => 'bvn_standard', 'name' => 'BVN Biometric Verification', 'type' => 'identity', 'selling_price' => 350.00],
        ['id' => 'mtn_sme_1gb', 'name' => 'MTN SME 1.0GB (30 Days)', 'type' => 'telecom', 'selling_price' => 270.00],
        ['id' => 'airtel_cg_1gb', 'name' => 'Airtel Corporate 1.0GB', 'type' => 'telecom', 'selling_price' => 290.00],
        ['id' => 'glo_cg_1gb', 'name' => 'Glo Corporate 1.0GB', 'type' => 'telecom', 'selling_price' => 260.00],
    ];
    Response::success($services);
});

// Dispatch request
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$router->dispatch($method, $uri);
