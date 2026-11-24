<?php
/**
 * @file SettingsController.php
 * Unified Global Settings Management Controller
 * Reconciles and manages all 22 required administration categories with MySQL persistence.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Core\SchemaSync;
use HambakTech\Services\MfaService;
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;

class SettingsController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
        SchemaSync::syncSecurityAndReferralSchema($this->db);
    }

    /**
     * 1. GET /api/admin/settings/all
     * Retrieves all comprehensive platform settings categories from MySQL
     */
    public function getAllSettings(Request $request): void
    {
        Auth::requirePermission($request, 'settings');

        $rows = $this->db->fetchAll('SELECT setting_key, setting_value, category, description, updated_at FROM system_settings');
        $settingsMap = [];
        foreach ($rows as $r) {
            $val = $r['setting_value'];
            // Auto JSON decode if structured
            $decoded = json_decode($val, true);
            $settingsMap[$r['setting_key']] = (json_last_error() === JSON_ERROR_NONE) ? $decoded : $val;
        }

        // Complete 22 Settings Sections with intelligent defaults
        $fullSettings = [
            // 1. General settings
            'general' => $settingsMap['general_settings'] ?? [
                'site_name' => 'HAMBAKTECH',
                'site_tagline' => 'Where Technology Meets Services',
                'maintenance_mode' => false,
                'default_currency' => 'NGN',
                'currency_symbol' => '₦',
                'timezone' => 'Africa/Lagos (GMT+1)',
            ],

            // 2. Company settings
            'company' => $settingsMap['company_settings'] ?? [
                'company_name' => 'HAMBAK TECH & SERVICES',
                'registration_number' => 'BN 9284726',
                'founded_year' => '2024',
                'official_email' => 'info@hambaktech.com.ng',
                'support_email' => 'support@hambaktech.com.ng',
                'whatsapp_phone' => '09155104724',
                'business_phone' => '08147837664',
                'official_phone' => '09127469686',
                'headquarters_address' => 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
            ],

            // 3. Branding
            'branding' => $settingsMap['branding_settings'] ?? [
                'primary_color' => '#1d4ed8',
                'secondary_color' => '#0f172a',
                'accent_color' => '#d97706',
                'logo_url' => '/logo.png',
                'favicon_url' => '/logo.png',
                'typography' => 'Plus Jakarta Sans, sans-serif',
            ],

            // 4. Website settings
            'website' => $settingsMap['website_settings'] ?? [
                'enable_registration' => true,
                'enable_guest_rates_calculator' => true,
                'enable_announcements_ticker' => true,
                'meta_title' => 'HAMBAKTECH | Digital Services, Telecom VTU & Digital Training Academy',
                'meta_description' => 'HAMBAK TECH & SERVICES — Digital identity verification, telecom data & airtime VTU, bill payments, and HAMBAKTECH Digital Training Academy.',
            ],

            // 5. Landing page
            'landing_page' => $settingsMap['landing_page_settings'] ?? [
                'hero_badge' => 'HAMBAK TECH & SERVICES • BN 9284726',
                'hero_headline' => 'Where Technology Meets Practical Digital Services & Training',
                'hero_subheadline' => 'Instant identity verification support, telecom data & airtime VTU, utility bill payments, and hands-on ICT & software training from Lekki, Lagos State.',
                'primary_cta_text' => 'Create Free Account',
                'secondary_cta_text' => 'Explore Digital Academy',
            ],

            // 6. Customer dashboard settings
            'customer_dashboard' => $settingsMap['customer_dashboard_settings'] ?? [
                'enable_nin_services' => true,
                'enable_telecom_vtu' => true,
                'enable_wallet_transfers' => true,
                'enable_virtual_accounts' => true,
                'enable_store_module' => false,
                'enable_academy_module' => false,
            ],

            // 7. Admin dashboard settings
            'admin_dashboard' => array_merge([
                'require_2fa_for_root' => false,
                'session_timeout_minutes' => 60,
                'audit_log_retention_days' => 90,
                'auto_refresh_interval_sec' => 30,
            ], is_array($settingsMap['admin_dashboard_settings'] ?? null) ? $settingsMap['admin_dashboard_settings'] : []),

            // 8. Authentication
            'auth' => array_merge([
                'allow_customer_registration' => true,
                'require_email_verification' => true,
                'min_password_length' => 8,
                'max_failed_attempts' => 5,
                'lockout_duration_minutes' => 15,
            ], is_array($settingsMap['auth_settings'] ?? null) ? $settingsMap['auth_settings'] : []),

            // 9. Security
            'security' => Auth::getSecuritySettings(),

            // 10. KYC
            'kyc' => array_merge([
                'tier1_daily_limit' => 20000,
                'tier2_daily_limit' => 100000,
                'tier3_daily_limit' => 1000000,
                'auto_approval_enabled' => true,
                'require_proof_of_address_for_tier3' => true,
            ], is_array($settingsMap['kyc_settings'] ?? null) ? $settingsMap['kyc_settings'] : []),

            // 11. Wallet
            'wallet' => (function () use ($settingsMap) {
                $w = array_merge([
                    'min_funding_amount' => 100,
                    'max_funding_amount' => 500000,
                ], is_array($settingsMap['wallet_settings'] ?? null) ? $settingsMap['wallet_settings'] : []);
                unset($w['manual_funding_enabled'], $w['bank_name'], $w['bank_account_number'], $w['bank_account_name']);
                return $w;
            })(),

            // 12. Payment gateways
            'payment_gateways' => (function () use ($settingsMap) {
                $pg = array_merge([
                    'active_gateway' => 'paystack',
                    'enable_paystack' => true,
                    'paystack_charge_percent' => 1.5,
                    'enable_paystack_dva' => false,
                    'dva_rollout_mode' => 'paused',
                    'dva_test_user_emails' => '',
                    'dva_require_bvn' => true,
                    'dva_auto_provision_on_register' => true,
                    'dva_auto_provision_on_wallet_open' => true,
                    'paystack_dva_preferred_bank' => 'wema-bank',
                    'dva_fee_bearer' => 'customer',
                ], is_array($settingsMap['payment_gateways_settings'] ?? null) ? $settingsMap['payment_gateways_settings'] : []);
                unset($pg['enable_flutterwave'], $pg['flutterwave_charge_percent'], $pg['enable_bank_transfer']);
                $pg['active_gateway'] = 'paystack';
                return $pg;
            })(),

            // 13. Provider integration
            'provider_integration' => (function () use ($settingsMap) {
                $stored = is_array($settingsMap['provider_integration_settings'] ?? null)
                    ? $settingsMap['provider_integration_settings']
                    : [];
                $liveActive = strtolower(trim((string)($settingsMap['active_verification_provider'] ?? '')));
                $defaultRow = null;
                try {
                    $defaultRow = $this->db->fetchOne('SELECT id FROM providers WHERE provider_type IN ("identity", "verification") AND is_default = 1 AND is_active = 1 LIMIT 1');
                } catch (\Throwable) {
                }
                $primaryIdentity = ($defaultRow && !empty($defaultRow['id']))
                    ? strtolower((string)$defaultRow['id'])
                    : (in_array($liveActive, ['2sureverify', 'veripine'], true)
                        ? $liveActive
                        : strtolower(trim((string)($stored['primary_identity_provider'] ?? '2sureverify'))));
                if (!in_array($primaryIdentity, ['2sureverify', 'veripine'], true)) {
                    $primaryIdentity = '2sureverify';
                }
                $fallbackIdentity = $primaryIdentity === '2sureverify' ? 'veripine' : '2sureverify';
                $liveTelecom = strtolower(trim((string)($settingsMap['active_telecom_provider'] ?? ($stored['primary_telecom_provider'] ?? 'ulamadata'))));
                return array_merge([
                    'primary_identity_provider' => $primaryIdentity,
                    'fallback_identity_provider' => $fallbackIdentity,
                    'primary_telecom_provider' => $liveTelecom ?: 'ulamadata',
                    'fallback_telecom_provider' => ($liveTelecom === 'vtpass' ? 'ulamadata' : 'vtpass'),
                    'auto_failover_enabled' => true,
                    'request_timeout_seconds' => 30,
                ], $stored, [
                    'primary_identity_provider' => $primaryIdentity,
                    'fallback_identity_provider' => $stored['fallback_identity_provider'] ?? $fallbackIdentity,
                    'primary_telecom_provider' => $liveTelecom ?: ($stored['primary_telecom_provider'] ?? 'ulamadata'),
                ]);
            })(),

            // 14. Service pricing
            'service_pricing' => $settingsMap['service_pricing_settings'] ?? [
                'nin_standard_slip_price' => 200,
                'nin_premium_pvc_price' => 500,
                'bvn_verification_price' => 250,
                'mtn_sme_1gb_price' => 270,
                'airtel_1gb_price' => 290,
                'glo_1gb_price' => 260,
                'nine_mobile_1gb_price' => 250,
            ],

            // 15. Transactions
            'transactions' => $settingsMap['transactions_settings'] ?? [
                'auto_refund_failed_verifications' => true,
                'auto_refund_failed_telecom' => true,
                'generate_downloadable_receipts' => true,
                'receipt_prefix' => 'HT-REC-',
            ],

            // 16. SMTP
            'smtp' => $settingsMap['smtp_settings'] ?? [
                'smtp_host' => 'mail.hambaktech.com.ng',
                'smtp_port' => 465,
                'smtp_secure' => true,
                'smtp_user' => 'support@hambaktech.com.ng',
                'from_email' => 'support@hambaktech.com.ng',
                'from_name' => 'HambakTech Support',
            ],

            // 17. Email templates
            'email_templates' => $settingsMap['email_templates_settings'] ?? [
                'welcome_email_enabled' => true,
                'funding_receipt_email_enabled' => true,
                'kyc_status_email_enabled' => true,
                'security_alert_email_enabled' => true,
            ],

            // 18. SMS
            'sms' => $settingsMap['sms_settings'] ?? [
                'sms_sender_id' => 'HAMBAKTECH',
                'enable_transaction_sms' => false,
                'enable_otp_sms' => false,
                'sms_rate_per_unit' => 4.5,
            ],

            // 19. Notifications
            'notifications' => $settingsMap['notifications_settings'] ?? [
                'enable_dashboard_alerts' => true,
                'sound_alerts_enabled' => true,
                'marketing_announcements_enabled' => true,
            ],

            // 20. Upload settings
            'upload' => $settingsMap['upload_settings'] ?? [
                'max_file_size_mb' => 5,
                'allowed_extensions' => ['jpg', 'jpeg', 'png', 'pdf'],
                'upload_directory' => 'storage/uploads',
                'sanitize_filenames' => true,
            ],

            // 21. API settings
            'api' => $settingsMap['api_settings'] ?? [
                'rate_limit_requests_per_minute' => 120,
                'enable_webhook_dispatch' => true,
                'signature_verification_strict' => true,
                'cors_allowed_origins' => '*',
            ],

            // 22. System configuration
            'system_config' => $settingsMap['system_config_settings'] ?? [
                'cpanel_server' => 'Production Core Cluster',
                'environment' => 'production',
                'php_version' => PHP_VERSION,
                'version' => '2.8.0-STAGE8',
                'database_engine' => 'MySQL 8.0 / InnoDB',
            ],

            // 23. Referral & Rewards Engine
            'referral' => (new ReferralEngineService($this->db))->getConfig(),

            // 24. Transaction PIN Policy
            'pin_policy' => (new PinSecurityService($this->db))->getPolicy(),

            // 25. Multi-Factor Authentication Policy
            'mfa' => (new MfaService($this->db))->getPolicy(),
        ];

        Response::success([
            'settings' => $fullSettings,
            'categories' => array_keys($fullSettings),
        ]);
    }

    /**
     * 2. POST /api/admin/settings/update
     * Atomically saves any category of settings to MySQL system_settings table
     */
    public function updateSettings(Request $request): void
    {
        $rawCategory = trim((string)$request->input('category', 'general'));
        $aliasMap = [
            'authentication' => 'auth',
            'pricing' => 'service_pricing',
            'uploads' => 'upload',
            'api_settings' => 'api',
            'system_maintenance' => 'system_config',
            'providers' => 'provider_integration',
        ];
        $category = $aliasMap[$rawCategory] ?? $rawCategory;
        $superAdminCategories = [
            'security', 'auth', 'admin_dashboard', 'api', 'provider_integration', 'providers',
            'smtp', 'payment_gateways', 'system_config', 'pin_policy', 'mfa', 'referral',
        ];
        if (in_array($category, $superAdminCategories, true)) {
            $admin = Auth::requireSuperAdmin($request);
        } else {
            $admin = Auth::requirePermission($request, 'settings');
        }
        $settingsData = $request->input('values') ?? $request->input('data') ?? $request->input('settings', []);

        if (empty($settingsData) || !is_array($settingsData)) {
            Response::error('Invalid settings payload provided.', 422);
        }

        // Enforce server-side clamping on security/PIN/MFA/referral parameters
        if ($category === 'security') {
            $settingsData = array_merge(Auth::getSecuritySettings(), $settingsData);
            $custTimeout = max(15, min(10080, (int)($settingsData['session_timeout_minutes'] ?? $settingsData['customer_session_timeout_minutes'] ?? 1440)));
            $maxFail = max(3, min(15, (int)($settingsData['login_max_attempts'] ?? $settingsData['max_failed_login_attempts'] ?? 5)));
            $bindUa = (bool)($settingsData['bind_user_agent'] ?? $settingsData['bind_session_user_agent'] ?? true);
            $settingsData['session_timeout_minutes'] = $custTimeout;
            $settingsData['customer_session_timeout_minutes'] = $custTimeout;
            $settingsData['admin_session_timeout_minutes'] = max(5, min(720, (int)($settingsData['admin_session_timeout_minutes'] ?? 60)));
            $settingsData['login_max_attempts'] = $maxFail;
            $settingsData['max_failed_login_attempts'] = $maxFail;
            $settingsData['login_lockout_minutes'] = max(5, min(240, (int)($settingsData['login_lockout_minutes'] ?? 15)));
            $settingsData['bind_user_agent'] = $bindUa;
            $settingsData['bind_session_user_agent'] = $bindUa;
            $settingsData['pin_max_attempts'] = max(3, min(10, (int)($settingsData['pin_max_attempts'] ?? 5)));
            $settingsData['pin_lockout_minutes'] = max(5, min(120, (int)($settingsData['pin_lockout_minutes'] ?? 15)));
        } elseif ($category === 'pin_policy') {
            $curPin = (new PinSecurityService($this->db))->getPolicy();
            $settingsData = array_merge($curPin, $settingsData);
            $settingsData['pin_length'] = max(4, min(6, (int)($settingsData['pin_length'] ?? 4)));
            $settingsData['pin_max_attempts'] = max(3, min(10, (int)($settingsData['pin_max_attempts'] ?? 5)));
            $settingsData['pin_lockout_minutes'] = max(5, min(120, (int)($settingsData['pin_lockout_minutes'] ?? 15)));
        } elseif ($category === 'mfa') {
            $curMfa = (new MfaService($this->db))->getPolicy();
            $settingsData = array_merge($curMfa, $settingsData);
            $enfSuper = (bool)($settingsData['enforce_mfa_for_superadmin'] ?? $settingsData['require_mfa_for_superadmin'] ?? false);
            $enfAdmin = (bool)($settingsData['enforce_mfa_for_admin'] ?? $settingsData['require_mfa_for_admin'] ?? false);
            $allowCust = (bool)($settingsData['allow_customer_mfa'] ?? $settingsData['allow_customer_mfa_opt_in'] ?? true);
            $settingsData['enforce_mfa_for_superadmin'] = $enfSuper;
            $settingsData['require_mfa_for_superadmin'] = $enfSuper;
            $settingsData['enforce_mfa_for_admin'] = $enfAdmin;
            $settingsData['require_mfa_for_admin'] = $enfAdmin;
            $settingsData['allow_customer_mfa'] = $allowCust;
            $settingsData['allow_customer_mfa_opt_in'] = $allowCust;
            $settingsData['otp_expiry_minutes'] = max(3, min(30, (int)($settingsData['otp_expiry_minutes'] ?? 10)));
            $settingsData['totp_issuer'] = trim((string)($settingsData['totp_issuer'] ?? 'HAMBAKTECH')) ?: 'HAMBAKTECH';
        } elseif ($category === 'referral') {
            $curRef = (new ReferralEngineService($this->db))->getConfig();
            $settingsData = array_merge($curRef, $settingsData);
            $settingsData['trigger_mode'] = ReferralEngineService::normalizeTriggerMode((string)($settingsData['trigger_mode'] ?? 'first_qualifying_transaction'));
            $settingsData['min_withdrawal_naira'] = max(500.0, (float)($settingsData['min_withdrawal_naira'] ?? 2000));
            $settingsData['max_withdrawal_naira'] = max((float)$settingsData['min_withdrawal_naira'], (float)($settingsData['max_withdrawal_naira'] ?? 100000));
            $settingsData['max_rewards_per_referee'] = max(1, min(100, (int)($settingsData['max_rewards_per_referee'] ?? 1)));
        } elseif ($category === 'wallet') {
            unset($settingsData['manual_funding_enabled'], $settingsData['bank_name'], $settingsData['bank_account_number'], $settingsData['bank_account_name']);
        } elseif ($category === 'payment_gateways') {
            unset($settingsData['enable_flutterwave'], $settingsData['flutterwave_charge_percent'], $settingsData['enable_bank_transfer']);
            $settingsData['active_gateway'] = 'paystack';
            $settingsData['enable_paystack_dva'] = array_key_exists('enable_paystack_dva', $settingsData) ? (bool)$settingsData['enable_paystack_dva'] : false;
            $rolloutMode = strtolower(trim((string)($settingsData['dva_rollout_mode'] ?? 'paused')));
            $settingsData['dva_rollout_mode'] = in_array($rolloutMode, ['testing_allowlist', 'all_eligible', 'paused'], true)
                ? $rolloutMode
                : 'paused';
            $rawTestEmails = (string)($settingsData['dva_test_user_emails'] ?? '');
            $cleanEmails = [];
            foreach (preg_split('/[\s,;]+/', $rawTestEmails) ?: [] as $em) {
                $emLower = strtolower(trim((string)$em));
                if ($emLower !== '' && filter_var($emLower, FILTER_VALIDATE_EMAIL)) {
                    $cleanEmails[] = $emLower;
                }
            }
            $settingsData['dva_test_user_emails'] = implode(', ', array_values(array_unique($cleanEmails)));
            $settingsData['dva_require_bvn'] = array_key_exists('dva_require_bvn', $settingsData) ? (bool)$settingsData['dva_require_bvn'] : true;
            $settingsData['dva_auto_provision_on_register'] = array_key_exists('dva_auto_provision_on_register', $settingsData) ? (bool)$settingsData['dva_auto_provision_on_register'] : true;
            $settingsData['dva_auto_provision_on_wallet_open'] = array_key_exists('dva_auto_provision_on_wallet_open', $settingsData) ? (bool)$settingsData['dva_auto_provision_on_wallet_open'] : true;
            $bankPref = strtolower(trim((string)($settingsData['paystack_dva_preferred_bank'] ?? 'wema-bank')));
            $settingsData['paystack_dva_preferred_bank'] = preg_match('/^[a-z0-9-]{2,60}$/', $bankPref) ? $bankPref : 'wema-bank';
            $feeBearer = strtolower(trim((string)($settingsData['dva_fee_bearer'] ?? 'customer')));
            $settingsData['dva_fee_bearer'] = in_array($feeBearer, ['customer', 'merchant'], true) ? $feeBearer : 'customer';
        }

        $settingKey = $category . '_settings';
        $jsonValue = json_encode($settingsData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        // Upsert into system_settings MySQL table
        $id = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, :skey, :val, :cat, :desc, NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, category = :cat2, updated_at = NOW()',
            [
                'id' => $id,
                'skey' => $settingKey,
                'val' => $jsonValue,
                'cat' => $category,
                'desc' => "Configuration for {$category}",
                'val2' => $jsonValue,
                'cat2' => $category,
            ]
        );

        // Mirror key settings to top-level keys for direct runtime lookup
        if ($category === 'payment_gateways' && isset($settingsData['active_gateway'])) {
            $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "active_payment_gateway", :v, "payments", NOW())', ['v' => (string)$settingsData['active_gateway']]);
        }
        if ($category === 'providers') {
            $category = 'provider_integration';
        }
        if ($category === 'provider_integration') {
            $primaryId = strtolower(trim((string)($settingsData['primary_identity_provider'] ?? $settingsData['active_verification_provider'] ?? '')));
            if (in_array($primaryId, ['2sureverify', 'veripine'], true)) {
                $settingsData['primary_identity_provider'] = $primaryId;
                if (empty($settingsData['fallback_identity_provider']) || $settingsData['fallback_identity_provider'] === $primaryId) {
                    $settingsData['fallback_identity_provider'] = $primaryId === '2sureverify' ? 'veripine' : '2sureverify';
                }
                $jsonValue = json_encode($settingsData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                $this->db->execute(
                    'UPDATE system_settings SET setting_value = :v1, updated_at = NOW() WHERE setting_key = :k1',
                    ['v1' => $jsonValue, 'k1' => 'provider_integration_settings']
                );
                $this->db->execute(
                    'INSERT INTO system_settings (id, setting_key, setting_value, category, updated_at)
                     VALUES ("set_act_verif", "active_verification_provider", :v1, "providers", NOW())
                     ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                    ['v1' => $primaryId, 'v2' => $primaryId]
                );
                $this->db->execute(
                    'UPDATE providers SET is_default = CASE WHEN id = :id1 THEN 1 ELSE 0 END, is_active = CASE WHEN id = :id2 THEN 1 ELSE is_active END WHERE provider_type IN ("identity", "verification")',
                    ['id1' => $primaryId, 'id2' => $primaryId]
                );
                $this->db->execute(
                    'UPDATE service_catalogue SET provider_id = :pid, updated_at = NOW() WHERE service_key LIKE "nin\_%" OR service_key LIKE "phone\_%" OR service_key LIKE "demo\_%" OR service_key LIKE "bvn\_%" OR service_key = "vnin_verification"',
                    ['pid' => $primaryId]
                );
            }
            $primaryTel = strtolower(trim((string)($settingsData['primary_telecom_provider'] ?? $settingsData['active_telecom_provider'] ?? '')));
            if (in_array($primaryTel, ['ulamadata', 'vtpass'], true)) {
                $this->db->execute(
                    'INSERT INTO system_settings (id, setting_key, setting_value, category, updated_at)
                     VALUES ("set_act_tel", "active_telecom_provider", :v1, "providers", NOW())
                     ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                    ['v1' => $primaryTel, 'v2' => $primaryTel]
                );
                $this->db->execute(
                    'UPDATE providers SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE provider_type = "telecom"',
                    ['id' => $primaryTel]
                );
            }
        }

        // Audit log (redact secrets, explicitly capture Paystack DVA configuration updates)
        $auditAction = $category === 'payment_gateways' ? 'PAYSTACK_DVA_SETTINGS_UPDATED' : 'SETTINGS_UPDATED';
        $auditDetails = ['category' => $category];
        if ($category === 'payment_gateways') {
            $auditDetails['enable_paystack'] = !empty($settingsData['enable_paystack']);
            $auditDetails['enable_paystack_dva'] = !empty($settingsData['enable_paystack_dva']);
            $auditDetails['dva_rollout_mode'] = $settingsData['dva_rollout_mode'] ?? 'paused';
            $auditDetails['preferred_bank'] = $settingsData['paystack_dva_preferred_bank'] ?? 'wema-bank';
            $auditDetails['fee_bearer'] = $settingsData['dva_fee_bearer'] ?? 'customer';
            $auditDetails['dva_require_bvn'] = !empty($settingsData['dva_require_bvn']);
        }
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, :act, :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $admin['id'],
                'email' => $admin['email'],
                'act' => $auditAction,
                'details' => json_encode($auditDetails, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'category' => $category,
            'updated' => count($settingsData),
        ], "Settings for {$category} saved to MySQL database successfully.");
    }
}
