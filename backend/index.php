<?php
/**
 * @file index.php
 * Master API Entry Point & Front Controller for HambakTech Enterprise Portal
 * Standard PHP 8.2+ Architecture
 */

declare(strict_types=1);

namespace HambakTech;

define('HAMBAKTECH_ROOT', __DIR__);
require_once __DIR__ . '/core/autoload.php';

use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Router;

use HambakTech\Controllers\AuthController;
use HambakTech\Controllers\WalletController;
use HambakTech\Controllers\VerificationController;
use HambakTech\Controllers\TelecomController;
use HambakTech\Controllers\AdminController;
use HambakTech\Controllers\CmsController;
use HambakTech\Controllers\CustomerController;
use HambakTech\Controllers\SystemController;

$request = new Request();
$router = new Router();

// -----------------------------------------------------------------------------
// 1. SYSTEM & HEALTH
// -----------------------------------------------------------------------------
$router->get('/api/health', [SystemController::class, 'health']);
$router->get('/api/system/settings', [SystemController::class, 'settings']);
$router->get('/api/cpanel/diagnostics', [SystemController::class, 'cpanelDiagnostics']);

// -----------------------------------------------------------------------------
// 2. CMS & BRANDING
// -----------------------------------------------------------------------------
$router->get('/api/cms/public-data', [CmsController::class, 'publicData']);
$router->post('/api/cms/branding', [CmsController::class, 'updateBranding']);
$router->post('/api/cms/sections', [CmsController::class, 'updateSections']);
$router->post('/api/cms/announcements', [CmsController::class, 'saveAnnouncement']);

// -----------------------------------------------------------------------------
// 3. AUTHENTICATION & USER PROFILE
// -----------------------------------------------------------------------------
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->post('/api/auth/register', [AuthController::class, 'register']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->put('/api/auth/profile', [AuthController::class, 'updateProfile']);
$router->post('/api/auth/change-password', [AuthController::class, 'changePassword']);
$router->post('/api/auth/set-pin', [AuthController::class, 'setPin']);
$router->post('/api/auth/verify-pin', [AuthController::class, 'verifyPin']);

// -----------------------------------------------------------------------------
// 4. FINANCIAL WALLET & SETTLEMENT
// -----------------------------------------------------------------------------
$router->get('/api/wallet/summary', [WalletController::class, 'summary']);
$router->get('/api/wallet/transactions', [WalletController::class, 'transactions']);
$router->post('/api/wallet/fund/initiate', [WalletController::class, 'initiateFunding']);
$router->post('/api/wallet/fund/verify', [WalletController::class, 'verifyFunding']);
$router->post('/api/wallet/manual-funding', [WalletController::class, 'manualFunding']);

// -----------------------------------------------------------------------------
// 5. IDENTITY VERIFICATION (NIN & BVN)
// -----------------------------------------------------------------------------
$router->get('/api/verification/services', [VerificationController::class, 'services']);
$router->post('/api/verification/verify', [VerificationController::class, 'verify']);
$router->get('/api/verification/history', [VerificationController::class, 'history']);
$router->get('/api/verification/banks', [VerificationController::class, 'banks']);

// -----------------------------------------------------------------------------
// 6. TELECOMMUNICATIONS (DATA, AIRTIME, BILLS)
// -----------------------------------------------------------------------------
$router->get('/api/telecom/plans', [TelecomController::class, 'plans']);
$router->post('/api/telecom/data', [TelecomController::class, 'purchaseData']);
$router->post('/api/telecom/airtime', [TelecomController::class, 'topupAirtime']);
$router->post('/api/telecom/electricity', [TelecomController::class, 'vendElectricity']);
$router->post('/api/telecom/cable', [TelecomController::class, 'renewCable']);
$router->get('/api/telecom/orders', [TelecomController::class, 'orders']);

// -----------------------------------------------------------------------------
// 7. CUSTOMER PORTAL
// -----------------------------------------------------------------------------
$router->get('/api/customer/dashboard', [CustomerController::class, 'dashboard']);
$router->post('/api/customer/kyc', [CustomerController::class, 'submitKyc']);
$router->get('/api/customer/notifications', [CustomerController::class, 'notifications']);
$router->post('/api/customer/notifications/:id/read', [CustomerController::class, 'markNotificationRead']);

// -----------------------------------------------------------------------------
// 8. SUPER ADMIN CONSOLE
// -----------------------------------------------------------------------------
$router->get('/api/admin/overview', [AdminController::class, 'overview']);
$router->get('/api/admin/customers', [AdminController::class, 'customers']);
$router->post('/api/admin/customers/:id/status', [AdminController::class, 'updateCustomerStatus']);
$router->post('/api/admin/customers/adjust-balance', [AdminController::class, 'creditDebitUser']);
$router->get('/api/admin/funding-requests', [AdminController::class, 'manualFundingRequests']);
$router->post('/api/admin/funding-requests/:id/action', [AdminController::class, 'approveFunding']);

// Dispatch Request
$router->dispatch($request);
