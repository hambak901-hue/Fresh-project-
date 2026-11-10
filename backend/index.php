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
$router->get('/api/system/init-database', [SystemController::class, 'initDatabase']);

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
$router->get('/api/wallet/statement', [WalletController::class, 'statement']);
$router->get('/api/wallet/gateways', [WalletController::class, 'gateways']);
$router->post('/api/wallet/admin/gateways/switch', [WalletController::class, 'switchGateway']);
$router->post('/api/wallet/fund/initiate', [WalletController::class, 'initiateFunding']);
$router->post('/api/wallet/paystack/initialize', [WalletController::class, 'initiateFunding']);
$router->post('/api/wallet/flutterwave/initialize', [WalletController::class, 'initiateFunding']);
$router->post('/api/wallet/fund/verify', [WalletController::class, 'verifyFunding']);
$router->post('/api/wallet/paystack/verify', [WalletController::class, 'verifyFunding']);
$router->post('/api/wallet/flutterwave/verify', [WalletController::class, 'verifyFunding']);
$router->post('/api/wallet/paystack/webhook', [WalletController::class, 'paystackWebhook']);
$router->post('/api/wallet/flutterwave/webhook', [WalletController::class, 'flutterwaveWebhook']);
$router->post('/api/wallet/manual-funding', [WalletController::class, 'manualFunding']);
$router->get('/api/wallet/receipt/:filename', [WalletController::class, 'getReceipt']);
$router->get('/api/wallet/virtual-account', [WalletController::class, 'virtualAccount']);

// -----------------------------------------------------------------------------
// 5. IDENTITY VERIFICATION (NIN & BVN)
// -----------------------------------------------------------------------------
$router->get('/api/verification/services', [VerificationController::class, 'services']);
$router->post('/api/verification/verify', [VerificationController::class, 'verify']);
$router->get('/api/verification/history', [VerificationController::class, 'history']);
$router->get('/api/verification/banks', [VerificationController::class, 'banks']);

// -----------------------------------------------------------------------------
// 6. TELECOMMUNICATIONS (DATA, AIRTIME, BILLS, PINS, EXAMS, SWAP, BULKSMS)
// -----------------------------------------------------------------------------
$router->get('/api/telecom/plans', [TelecomController::class, 'plans']);
$router->post('/api/telecom/plans/sync', [TelecomController::class, 'syncPlans']);
$router->post('/api/telecom/data', [TelecomController::class, 'purchaseData']);
$router->post('/api/telecom/purchase-data', [TelecomController::class, 'purchaseData']);
$router->post('/api/telecom/airtime', [TelecomController::class, 'topupAirtime']);
$router->post('/api/telecom/purchase-airtime', [TelecomController::class, 'topupAirtime']);
$router->get('/api/telecom/airtime-pins/denominations', [TelecomController::class, 'airtimePinDenominations']);
$router->post('/api/telecom/airtime-pin', [TelecomController::class, 'vendAirtimePin']);
$router->post('/api/telecom/purchase-airtime-pin', [TelecomController::class, 'vendAirtimePin']);
$router->get('/api/telecom/data-pins/denominations', [TelecomController::class, 'dataPinDenominations']);
$router->post('/api/telecom/data-pin', [TelecomController::class, 'vendDataPin']);
$router->post('/api/telecom/purchase-data-pin', [TelecomController::class, 'vendDataPin']);
$router->get('/api/telecom/airtime-swap/config', [TelecomController::class, 'airtimeSwapConfig']);
$router->post('/api/telecom/airtime-swap', [TelecomController::class, 'processAirtimeSwap']);
$router->get('/api/telecom/cable-packages', [TelecomController::class, 'cablePackages']);
$router->get('/api/telecom/cable/validate', [TelecomController::class, 'validateSmartcard']);
$router->post('/api/telecom/verify-smartcard', [TelecomController::class, 'validateSmartcard']);
$router->post('/api/telecom/cable/subscribe', [TelecomController::class, 'renewCable']);
$router->post('/api/telecom/purchase-cable', [TelecomController::class, 'renewCable']);
$router->get('/api/telecom/electricity-discos', [TelecomController::class, 'electricityDiscos']);
$router->get('/api/telecom/electricity/validate', [TelecomController::class, 'validateMeter']);
$router->post('/api/telecom/verify-meter', [TelecomController::class, 'validateMeter']);
$router->post('/api/telecom/electricity/pay', [TelecomController::class, 'vendElectricity']);
$router->post('/api/telecom/purchase-electricity', [TelecomController::class, 'vendElectricity']);
$router->get('/api/telecom/exam-packages', [TelecomController::class, 'examPackages']);
$router->post('/api/telecom/exam/purchase', [TelecomController::class, 'vendExamPin']);
$router->post('/api/telecom/purchase-exam-pin', [TelecomController::class, 'vendExamPin']);
$router->post('/api/telecom/bulksms', [TelecomController::class, 'sendBulkSms']);
$router->post('/api/telecom/send-bulksms', [TelecomController::class, 'sendBulkSms']);
$router->post('/api/telecom/webhook', [TelecomController::class, 'webhook']);
$router->get('/api/telecom/orders', [TelecomController::class, 'orders']);
$router->get('/api/telecom/history', [TelecomController::class, 'orders']);
$router->get('/api/telecom/verify/:ref', [TelecomController::class, 'verifyTransaction']);
$router->get('/api/telecom/providers', [TelecomController::class, 'providers']);

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
$router->get('/api/admin/financial-reports', [AdminController::class, 'financialReports']);
$router->post('/api/admin/transactions/reverse', [AdminController::class, 'reverseTransaction']);
$router->post('/api/admin/bank-settings', [AdminController::class, 'updateBankSettings']);

// Dispatch Request
$router->dispatch($request);
