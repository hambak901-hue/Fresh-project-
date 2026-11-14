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
use HambakTech\Controllers\SupportController;
use HambakTech\Controllers\SettingsController;
use HambakTech\Controllers\NotificationController;
use HambakTech\Controllers\AcademyController;
use HambakTech\Controllers\ModificationController;

$request = new Request();
$router = new Router();

// -----------------------------------------------------------------------------
// 1. SYSTEM, CPANEL & SCHEMA SYNC
// -----------------------------------------------------------------------------
$router->get('/api/health', [SystemController::class, 'health']);
$router->get('/api/system/status', [SystemController::class, 'status']);
$router->get('/api/system/settings', [SystemController::class, 'settings']);
$router->get('/api/system/rates', [SystemController::class, 'rates']);
$router->get('/api/system/audit-logs', [AdminController::class, 'auditLogs']);
$router->post('/api/system/test-smtp', [SystemController::class, 'testSmtp']);
$router->post('/api/system/sync-schema', [SystemController::class, 'syncSchema']);
$router->get('/api/system/init-database', [SystemController::class, 'initDatabase']);
$router->get('/api/cpanel/diagnostics', [SystemController::class, 'cpanelDiagnostics']);
$router->get('/api/cpanel/info', [SystemController::class, 'cpanelInfo']);
$router->post('/api/cpanel/test-sftp', [SystemController::class, 'testSftp']);
$router->get('/api/cpanel/export-package', [SystemController::class, 'exportPackage']);

// -----------------------------------------------------------------------------
// 2. CMS & BRANDING
// -----------------------------------------------------------------------------
$router->get('/api/cms/public-data', [CmsController::class, 'publicData']);
$router->get('/api/cms/public-content', [CmsController::class, 'publicData']);
$router->get('/api/cms/public', [CmsController::class, 'publicData']);
$router->get('/api/cms/admin', [CmsController::class, 'adminData']);
$router->post('/api/cms/branding', [CmsController::class, 'updateBranding']);
$router->put('/api/cms/branding', [CmsController::class, 'updateBranding']);
$router->post('/api/cms/sections', [CmsController::class, 'updateSections']);
$router->put('/api/cms/sections', [CmsController::class, 'updateSections']);
$router->post('/api/cms/visibility', [CmsController::class, 'updateVisibility']);
$router->put('/api/cms/visibility', [CmsController::class, 'updateVisibility']);
$router->put('/api/cms/page-visibility', [CmsController::class, 'updateVisibility']);
$router->post('/api/cms/announcements', [CmsController::class, 'saveAnnouncement']);
$router->put('/api/cms/announcements/:id', [CmsController::class, 'updateAnnouncement']);
$router->delete('/api/cms/announcements/:id', [CmsController::class, 'deleteAnnouncement']);
$router->post('/api/cms/faqs', [CmsController::class, 'saveFaq']);
$router->put('/api/cms/faqs/:id', [CmsController::class, 'updateFaq']);
$router->delete('/api/cms/faqs/:id', [CmsController::class, 'deleteFaq']);
$router->post('/api/cms/navigation', [CmsController::class, 'updateNavigation']);
$router->put('/api/cms/navigation', [CmsController::class, 'updateNavigation']);
$router->post('/api/cms/contact', [CmsController::class, 'contact']);

// -----------------------------------------------------------------------------
// 3. AUTHENTICATION & USER PROFILE
// -----------------------------------------------------------------------------
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->post('/api/auth/register', [AuthController::class, 'register']);
$router->post('/api/auth/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/api/auth/verify-otp', [AuthController::class, 'verifyOtp']);
$router->post('/api/auth/reset-password', [AuthController::class, 'resetPassword']);
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

// Aliases for Wallet Admin (Pending fundings, Approve, Reject, Adjust Balance, Reports)
$router->get('/api/wallet/admin/pending-fundings', [AdminController::class, 'manualFundingRequests']);
$router->get('/api/wallet/admin/financial-reports', [AdminController::class, 'financialReports']);
$router->post('/api/wallet/admin/approve-funding/:id', [AdminController::class, 'approveFunding']);
$router->post('/api/wallet/admin/reject-funding/:id', [AdminController::class, 'rejectFunding']);
$router->post('/api/wallet/admin/adjust-balance', [AdminController::class, 'creditDebitUser']);

// -----------------------------------------------------------------------------
// 5. IDENTITY VERIFICATION (NIN & BVN)
// -----------------------------------------------------------------------------
$router->get('/api/verification/services', [VerificationController::class, 'services']);
$router->post('/api/verification/verify', [VerificationController::class, 'verify']);
$router->get('/api/verification/history', [VerificationController::class, 'history']);
$router->get('/api/verification/slip-templates', [VerificationController::class, 'slipTemplates']);
$router->get('/api/verification/banks', [VerificationController::class, 'banks']);
$router->get('/api/verification/banks/modification', [VerificationController::class, 'modificationBanks']);
$router->get('/api/verification/banks/enrollment', [VerificationController::class, 'enrollmentBanks']);
$router->get('/api/verification/status/:ref', [VerificationController::class, 'checkStatus']);
$router->get('/api/verification/recover', [VerificationController::class, 'recover']);
$router->get('/api/verification/record/:id', [VerificationController::class, 'getRecord']);
$router->get('/api/verification/record/:id/pdf', [VerificationController::class, 'downloadPdf']);

// -----------------------------------------------------------------------------
// 5B. MANUAL NIN & BVN MODIFICATIONS (STAGE 3)
// -----------------------------------------------------------------------------
$router->get('/api/modifications/services', [ModificationController::class, 'services']);
$router->get('/api/modifications/bvn-types', [ModificationController::class, 'bvnTypes']);
$router->post('/api/modifications/upload-document', [ModificationController::class, 'uploadDocument']);
$router->get('/api/modifications/document/:id', [ModificationController::class, 'getDocument']);
$router->post('/api/modifications/submit', [ModificationController::class, 'submit']);
$router->get('/api/modifications/history', [ModificationController::class, 'history']);
$router->get('/api/modifications/:id/status', [ModificationController::class, 'requestStatus']);
$router->post('/api/modifications/:id/poll', [ModificationController::class, 'pollStatus']);
$router->post('/api/modifications/:id/submit-info', [ModificationController::class, 'submitAdditionalInfo']);
$router->post('/api/modifications/webhook', [ModificationController::class, 'webhook']);

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
$router->post('/api/telecom/webhook/ulamadata', [TelecomController::class, 'webhook']);
$router->post('/api/telecom/webhook/vtpass', [TelecomController::class, 'vtpassWebhook']);
$router->get('/api/telecom/orders', [TelecomController::class, 'orders']);
$router->get('/api/telecom/history', [TelecomController::class, 'orders']);
$router->get('/api/telecom/verify/:ref', [TelecomController::class, 'verifyTransaction']);
$router->get('/api/telecom/providers', [TelecomController::class, 'providers']);
$router->post('/api/telecom/providers/switch', [TelecomController::class, 'switchProvider']);

// -----------------------------------------------------------------------------
// 7. CUSTOMER PORTAL & KYC STATUS
// -----------------------------------------------------------------------------
$router->get('/api/customer/dashboard', [CustomerController::class, 'dashboard']);
$router->get('/api/customer/summary', [CustomerController::class, 'summary']);
$router->put('/api/customer/profile', [AuthController::class, 'updateProfile']);
$router->put('/api/customer/password', [AuthController::class, 'changePassword']);
$router->put('/api/customer/pin', [CustomerController::class, 'updatePin']);
$router->post('/api/customer/verify-pin', [AuthController::class, 'verifyPin']);
$router->put('/api/customer/preferences', [CustomerController::class, 'updatePreferences']);
$router->post('/api/customer/kyc', [CustomerController::class, 'submitKyc']);
$router->post('/api/customer/kyc-submit', [CustomerController::class, 'submitKyc']);
$router->post('/api/customer/manual-funding', [WalletController::class, 'manualFunding']);
$router->get('/api/customer/notifications', [CustomerController::class, 'notifications']);
$router->post('/api/customer/notifications/:id/read', [CustomerController::class, 'markNotificationRead']);
$router->put('/api/customer/notifications/:id/read', [CustomerController::class, 'markNotificationRead']);
$router->put('/api/customer/notifications/read-all', [CustomerController::class, 'markAllNotificationsRead']);
$router->get('/api/customer/statement', [WalletController::class, 'statement']);
$router->post('/api/customer/upload', [CustomerController::class, 'uploadDocument']);
$router->get('/api/customer/document/:id', [CustomerController::class, 'getDocument']);
$router->get('/api/customer/store', [CustomerController::class, 'storeItems']);
$router->get('/api/customer/academy', [AcademyController::class, 'customerAcademy']);
$router->post('/api/customer/academy/apply', [AcademyController::class, 'customerApply']);
$router->get('/api/customer/reports', [CustomerController::class, 'reports']);
$router->get('/api/customer/messages', [CustomerController::class, 'messages']);
$router->put('/api/customer/messages/:id/read', [CustomerController::class, 'markMessageRead']);

// Public Digital Training Academy & Student Verification Routes
$router->get('/api/academy/public', [AcademyController::class, 'publicOverview']);
$router->post('/api/academy/apply', [AcademyController::class, 'apply']);
$router->get('/api/academy/application-status', [AcademyController::class, 'applicationStatus']);
$router->get('/api/academy/verify', [AcademyController::class, 'verifyStudent']);
$router->get('/api/academy/verify/:student_id', [AcademyController::class, 'verifyStudent']);

// Customer KYC & Purchase Authorization
$router->get('/api/kyc/status', [CustomerController::class, 'kycStatus']);
$router->post('/api/kyc/submit', [CustomerController::class, 'submitKycFull']);
$router->post('/api/kyc/authorize-purchase', [CustomerController::class, 'authorizePurchase']);
$router->get('/api/kyc/virtual-account', [CustomerController::class, 'virtualAccount']);

// -----------------------------------------------------------------------------
// 8. SUPER ADMIN CONSOLE & OPERATIONS
// -----------------------------------------------------------------------------
// Overview & Metrics
$router->get('/api/admin/overview', [AdminController::class, 'overview']);

// Customers Management
$router->get('/api/admin/customers', [AdminController::class, 'customers']);
$router->get('/api/admin/customers/:id', [AdminController::class, 'customerDetail']);
$router->put('/api/admin/customers/:id', [AdminController::class, 'updateCustomer']);
$router->post('/api/admin/customers/:id/status', [AdminController::class, 'updateCustomerStatus']);
$router->post('/api/admin/customers/:id/wallet-adjust', [AdminController::class, 'customerWalletAdjust']);
$router->post('/api/admin/customers/:id/kyc', [AdminController::class, 'reviewCustomerKyc']);
$router->post('/api/admin/customers/:id/notify', [AdminController::class, 'notifyCustomer']);
$router->post('/api/admin/customers/adjust-balance', [AdminController::class, 'creditDebitUser']);
$router->post('/api/admin/customers/create', [AdminController::class, 'createCustomer']);
$router->delete('/api/admin/customers/:id', [AdminController::class, 'deleteCustomer']);

// Funding Approvals
$router->get('/api/admin/funding-requests', [AdminController::class, 'manualFundingRequests']);
$router->get('/api/admin/manual-funding/queue', [AdminController::class, 'manualFundingRequests']);
$router->get('/api/admin/funding/pending', [AdminController::class, 'manualFundingRequests']);
$router->post('/api/admin/funding/:id/approve', [AdminController::class, 'approveFunding']);
$router->post('/api/admin/funding/:id/reject', [AdminController::class, 'rejectFunding']);
$router->post('/api/admin/funding-requests/:id/action', [AdminController::class, 'approveFunding']);
$router->post('/api/admin/funding-requests/:id/approve', [AdminController::class, 'approveFunding']);
$router->post('/api/admin/funding-requests/:id/reject', [AdminController::class, 'rejectFunding']);

// Reports & Financial Settlements
$router->get('/api/admin/financial-reports', [AdminController::class, 'financialReports']);
$router->get('/api/admin/reports', [AdminController::class, 'detailedReports']);
$router->get('/api/admin/reports/detailed', [AdminController::class, 'detailedReports']);
$router->get('/api/admin/reports/settings', [AdminController::class, 'reportsSettings']);
$router->put('/api/admin/reports/settings', [AdminController::class, 'reportsSettings']);
$router->post('/api/admin/transactions/reverse', [AdminController::class, 'reverseTransaction']);
$router->post('/api/admin/bank-settings', [AdminController::class, 'updateBankSettings']);

// Core Services, Pricing, Wholesale & Providers
$router->get('/api/admin/services', [AdminController::class, 'services']);
$router->post('/api/admin/services/update-price', [AdminController::class, 'updateServicePrice']);
$router->put('/api/admin/services/update-price', [AdminController::class, 'updateServicePrice']);
$router->put('/api/admin/services/pricing', [AdminController::class, 'updatePricing']);
$router->put('/api/admin/services/providers', [AdminController::class, 'updateProviders']);
$router->get('/api/admin/services/verification', [AdminController::class, 'verificationServices']);
$router->put('/api/admin/services/verification/:key', [AdminController::class, 'updateVerificationService']);
$router->post('/api/admin/services/verification/sync-wholesale', [AdminController::class, 'syncWholesalePrices']);

// Admin NIN & BVN Modification Operations (Stage 3)
$router->get('/api/admin/modifications', [ModificationController::class, 'adminList']);
$router->get('/api/admin/modifications/services', [ModificationController::class, 'adminServices']);
$router->put('/api/admin/modifications/services/:key', [ModificationController::class, 'adminUpdateService']);
$router->get('/api/admin/modifications/bvn-types', [ModificationController::class, 'adminBvnTypes']);
$router->put('/api/admin/modifications/bvn-types/:id', [ModificationController::class, 'adminUpdateBvnType']);
$router->post('/api/admin/modifications/sync-catalog', [ModificationController::class, 'adminSyncCatalog']);
$router->get('/api/admin/modifications/:id', [ModificationController::class, 'adminDetail']);
$router->post('/api/admin/modifications/:id/poll', [ModificationController::class, 'adminPollStatus']);
$router->post('/api/admin/modifications/:id/update', [ModificationController::class, 'adminUpdateRequest']);

// Store & Academy aliases under /api/admin/services/*
$router->post('/api/admin/services/store', [AdminController::class, 'saveStoreItem']);
$router->put('/api/admin/services/store/:id', [AdminController::class, 'saveStoreItem']);
$router->delete('/api/admin/services/store/:id', [AdminController::class, 'deleteStoreItem']);
$router->post('/api/admin/services/academy', [AdminController::class, 'saveAcademyCourse']);
$router->put('/api/admin/services/academy/:id', [AdminController::class, 'saveAcademyCourse']);
$router->delete('/api/admin/services/academy/:id', [AdminController::class, 'deleteAcademyCourse']);

// Provider Gateways & Logs
$router->get('/api/admin/providers', [AdminController::class, 'providers']);
$router->post('/api/admin/providers', [AdminController::class, 'saveProvider']);
$router->put('/api/admin/providers/:id', [AdminController::class, 'saveProvider']);
$router->post('/api/admin/providers/:id/test', [AdminController::class, 'testProvider']);
$router->get('/api/admin/providers/logs', [AdminController::class, 'providerLogs']);

// Identity Slip Templates
$router->get('/api/admin/slip-templates', [AdminController::class, 'slipTemplates']);
$router->post('/api/admin/slip-templates/upload-specimen', [AdminController::class, 'uploadSlipSpecimen']);
$router->post('/api/admin/slip-templates', [AdminController::class, 'saveSlipTemplate']);
$router->put('/api/admin/slip-templates/:id', [AdminController::class, 'saveSlipTemplate']);
$router->delete('/api/admin/slip-templates/:id', [AdminController::class, 'deleteSlipTemplate']);

// Digital Services (Cable & Discos)
$router->get('/api/admin/digital-services', [AdminController::class, 'digitalServices']);
$router->post('/api/admin/digital-services/cable-package', [AdminController::class, 'saveCablePackage']);
$router->put('/api/admin/digital-services/cable-package/:id', [AdminController::class, 'saveCablePackage']);
$router->delete('/api/admin/digital-services/cable-package/:id', [AdminController::class, 'deleteCablePackage']);
$router->post('/api/admin/digital-services/disco', [AdminController::class, 'saveElectricityDisco']);
$router->put('/api/admin/digital-services/disco/:id', [AdminController::class, 'saveElectricityDisco']);
$router->delete('/api/admin/digital-services/disco/:id', [AdminController::class, 'deleteElectricityDisco']);

// Hardware Store & Settings
$router->get('/api/admin/store', [AdminController::class, 'store']);
$router->get('/api/admin/store/settings', [AdminController::class, 'storeSettings']);
$router->put('/api/admin/store/settings', [AdminController::class, 'updateStoreSettings']);
$router->post('/api/admin/store/item', [AdminController::class, 'saveStoreItem']);
$router->put('/api/admin/store/item/:id', [AdminController::class, 'saveStoreItem']);
$router->delete('/api/admin/store/item/:id', [AdminController::class, 'deleteStoreItem']);

// Agency Academy & Settings (Stage 2 Complete Digital Training Academy)
$router->get('/api/admin/academy', [AcademyController::class, 'adminOverview']);
$router->get('/api/admin/academy/settings', [AcademyController::class, 'getSettings']);
$router->put('/api/admin/academy/settings', [AcademyController::class, 'updateSettings']);
$router->post('/api/admin/academy/course', [AcademyController::class, 'saveCourse']);
$router->put('/api/admin/academy/course/:id', [AcademyController::class, 'saveCourse']);
$router->delete('/api/admin/academy/course/:id', [AcademyController::class, 'deleteCourse']);
$router->get('/api/admin/academy/applications', [AcademyController::class, 'applications']);
$router->delete('/api/admin/academy/applications/:id', [AcademyController::class, 'deleteApplication']);
$router->post('/api/admin/academy/applications/:id/review', [AcademyController::class, 'reviewApplication']);
$router->get('/api/admin/academy/students', [AcademyController::class, 'students']);
$router->put('/api/admin/academy/students/:id', [AcademyController::class, 'updateStudent']);

// SMTP Server & Email Delivery
$router->get('/api/admin/smtp', [AdminController::class, 'smtpConfig']);
$router->put('/api/admin/smtp', [AdminController::class, 'updateSmtpConfig']);
$router->post('/api/admin/smtp', [AdminController::class, 'updateSmtpConfig']);
$router->post('/api/admin/smtp/test-connection', [AdminController::class, 'testSmtpConnection']);
$router->post('/api/admin/smtp/send-test', [AdminController::class, 'sendTestSmtpEmail']);

// Email Templates
$router->get('/api/admin/email-templates', [AdminController::class, 'emailTemplates']);
$router->put('/api/admin/email-templates/:id', [AdminController::class, 'updateEmailTemplate']);
$router->post('/api/admin/email-templates/:id/test', [AdminController::class, 'testEmailTemplate']);

// SMS Gateway & Templates
$router->get('/api/admin/sms-config', [AdminController::class, 'smsConfig']);
$router->put('/api/admin/sms-config', [AdminController::class, 'updateSmsConfig']);
$router->post('/api/admin/sms-config', [AdminController::class, 'updateSmsConfig']);
$router->put('/api/admin/sms-config/template/:id', [AdminController::class, 'updateSmsTemplate']);
$router->post('/api/admin/sms-config/test', [AdminController::class, 'testSms']);

// Dashboard Modules Configuration
$router->get('/api/admin/dashboard-modules', [AdminController::class, 'dashboardModules']);
$router->put('/api/admin/dashboard-modules/:id', [AdminController::class, 'updateDashboardModule']);

// Staff & Role-Based Access Control
$router->get('/api/admin/staff', [AdminController::class, 'staff']);
$router->post('/api/admin/staff', [AdminController::class, 'createStaff']);
$router->put('/api/admin/staff/:id', [AdminController::class, 'updateStaff']);

// Audit Trail & Activity Logs
$router->get('/api/admin/audit-logs', [AdminController::class, 'auditLogs']);

// Centralized Activity Monitoring (Footprints)
$router->get('/api/admin/footprints', [AdminController::class, 'footprints']);
$router->get('/api/admin/footprints/stats', [AdminController::class, 'footprintStats']);
$router->get('/api/admin/footprints/export', [AdminController::class, 'exportFootprints']);

// Maintenance & Demo Data Cleanup
$router->post('/api/admin/maintenance/clean-demo-data', [AdminController::class, 'cleanDemoData']);

// KYC Compliance & Service Security Rules
$router->get('/api/kyc/admin/submissions', [AdminController::class, 'kycSubmissions']);
$router->get('/api/kyc/admin/submissions/:id', [AdminController::class, 'kycSubmissionDetail']);
$router->post('/api/kyc/admin/submissions/:id/review', [AdminController::class, 'reviewKycSubmission']);
$router->post('/api/kyc/admin/submissions/:id/auto-verify', [AdminController::class, 'autoVerifyKycSubmission']);
$router->get('/api/kyc/admin/service-rules', [AdminController::class, 'serviceSecurityRules']);
$router->put('/api/kyc/admin/service-rules/:key', [AdminController::class, 'updateServiceSecurityRule']);

// Support & Help Centre Routes
$router->get('/api/support/tickets', [SupportController::class, 'customerTickets']);
$router->post('/api/support/tickets', [SupportController::class, 'createTicket']);
$router->post('/api/customer/support-ticket', [SupportController::class, 'createTicket']);
$router->get('/api/support/tickets/:id', [SupportController::class, 'getTicketDetails']);
$router->post('/api/support/tickets/:id/reply', [SupportController::class, 'replyTicket']);
$router->get('/api/admin/support/tickets', [SupportController::class, 'adminTickets']);
$router->get('/api/admin/support/tickets/:id', [SupportController::class, 'getTicketDetails']);
$router->post('/api/admin/support/tickets/:id/reply', [SupportController::class, 'replyTicket']);
$router->post('/api/admin/support/tickets/:id/status', [SupportController::class, 'updateStatus']);
$router->put('/api/admin/support/tickets/:id/status', [SupportController::class, 'updateStatus']);
$router->delete('/api/admin/support/tickets/:id', [SupportController::class, 'deleteTicket']);

// Global 22-Category Settings Routes
$router->get('/api/admin/settings', [SettingsController::class, 'getAllSettings']);
$router->post('/api/admin/settings', [SettingsController::class, 'updateSettings']);
$router->put('/api/admin/settings', [SettingsController::class, 'updateSettings']);
$router->get('/api/admin/settings/all', [SettingsController::class, 'getAllSettings']);
$router->post('/api/admin/settings/update', [SettingsController::class, 'updateSettings']);
$router->post('/api/admin/settings/upload-logo', [AdminController::class, 'uploadLogo']);
$router->post('/api/admin/settings/remove-logo', [AdminController::class, 'removeLogo']);

// Notification Administration Routes
$router->get('/api/admin/notifications/overview', [NotificationController::class, 'overview']);
$router->get('/api/admin/notifications/broadcasts', [NotificationController::class, 'listBroadcasts']);
$router->post('/api/admin/notifications/broadcast', [NotificationController::class, 'sendBroadcast']);
$router->get('/api/admin/announcements', [NotificationController::class, 'listAnnouncements']);
$router->post('/api/admin/announcements', [NotificationController::class, 'saveAnnouncement']);
$router->put('/api/admin/announcements/:id', [NotificationController::class, 'saveAnnouncement']);
$router->post('/api/admin/announcements/:id/retry-emails', [NotificationController::class, 'retryAnnouncementEmails']);
$router->delete('/api/admin/announcements/:id', [NotificationController::class, 'deleteAnnouncement']);

// Dispatch Request
$router->dispatch($request);
