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

class SettingsController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * 1. GET /api/admin/settings/all
     * Retrieves all 22 comprehensive platform settings categories from MySQL
     */
    public function getAllSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

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
                'site_name' => 'HambakTech Enterprise Portal',
                'site_tagline' => 'Automated Identity Verification & Digital Utilities',
                'maintenance_mode' => false,
                'default_currency' => 'NGN',
                'currency_symbol' => '₦',
                'timezone' => 'Africa/Lagos (GMT+1)',
            ],

            // 2. Company settings
            'company' => $settingsMap['company_settings'] ?? [
                'company_name' => 'Hambak Technologies Enterprise',
                'registration_number' => 'RC-1928472',
                'tax_id' => 'TIN-98210492',
                'official_email' => 'support@hambaktech.com.ng',
                'official_phone' => '+234 803 000 1122',
                'headquarters_address' => 'Plot 14 Commercial Avenue, Ikeja, Lagos, Nigeria',
            ],

            // 3. Branding
            'branding' => $settingsMap['branding_settings'] ?? [
                'primary_color' => '#10b981',
                'secondary_color' => '#6366f1',
                'accent_color' => '#f59e0b',
                'logo_url' => '',
                'favicon_url' => '',
                'typography' => 'Inter, sans-serif',
            ],

            // 4. Website settings
            'website' => $settingsMap['website_settings'] ?? [
                'enable_registration' => true,
                'enable_guest_rates_calculator' => true,
                'enable_announcements_ticker' => true,
                'meta_title' => 'HambakTech Enterprise | NIN Slip, BVN & Telecom Infrastructure',
                'meta_description' => 'Automate NIMC sovereign identity slip generation, Central Bank BVN verification, MTN SME data vending, and utility bill clearing.',
            ],

            // 5. Landing page
            'landing_page' => $settingsMap['landing_page_settings'] ?? [
                'hero_badge' => "Nigeria's Leading Digital Services Infrastructure",
                'hero_headline' => 'Instant Identity Verification, Telecom Bundles & Digital Payments',
                'hero_subheadline' => 'Automate NIMC NIN slips, BVN lookups, MTN & Airtel SME data vending, and utility bill clearing with enterprise 99.98% uptime.',
                'primary_cta_text' => 'Get Started Free',
                'secondary_cta_text' => 'Explore Solutions',
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
            'admin_dashboard' => $settingsMap['admin_dashboard_settings'] ?? [
                'require_2fa_for_root' => false,
                'session_timeout_minutes' => 60,
                'audit_log_retention_days' => 90,
                'auto_refresh_interval_sec' => 30,
            ],

            // 8. Authentication
            'auth' => $settingsMap['auth_settings'] ?? [
                'allow_customer_registration' => true,
                'require_email_verification' => false,
                'min_password_length' => 8,
                'max_failed_attempts' => 5,
                'lockout_duration_minutes' => 15,
            ],

            // 9. Security
            'security' => $settingsMap['security_settings'] ?? [
                'enforce_transaction_pin' => true,
                'pin_max_attempts' => 3,
                'pin_lockout_minutes' => 15,
                'jwt_expiry_days' => 7,
                'ip_rate_limiting_enabled' => true,
            ],

            // 10. KYC
            'kyc' => $settingsMap['kyc_settings'] ?? [
                'tier1_daily_limit' => 20000,
                'tier2_daily_limit' => 100000,
                'tier3_daily_limit' => 1000000,
                'auto_approval_enabled' => true,
                'require_proof_of_address_for_tier3' => true,
            ],

            // 11. Wallet
            'wallet' => $settingsMap['wallet_settings'] ?? [
                'min_funding_amount' => 100,
                'max_funding_amount' => 500000,
                'manual_funding_enabled' => true,
                'bank_name' => 'Moniepoint MFB',
                'bank_account_number' => '5210471634',
                'bank_account_name' => 'Hambaktech_Services',
            ],

            // 12. Payment gateways
            'payment_gateways' => $settingsMap['payment_gateways_settings'] ?? [
                'active_gateway' => 'paystack',
                'enable_paystack' => true,
                'enable_flutterwave' => false,
                'enable_bank_transfer' => true,
                'paystack_charge_percent' => 1.5,
                'flutterwave_charge_percent' => 1.4,
            ],

            // 13. Provider integration
            'provider_integration' => $settingsMap['provider_integration_settings'] ?? [
                'primary_identity_provider' => 'veripine',
                'fallback_identity_provider' => '2sureverify',
                'primary_telecom_provider' => 'ulamadata',
                'fallback_telecom_provider' => 'vtpass',
                'auto_failover_enabled' => true,
                'request_timeout_seconds' => 30,
            ],

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
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $category = trim((string)$request->input('category', 'general'));
        $settingsData = $request->input('values') ?? $request->input('data') ?? $request->input('settings', []);

        if (empty($settingsData) || !is_array($settingsData)) {
            Response::error('Invalid settings payload provided.', 422);
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
        if ($category === 'wallet' && isset($settingsData['bank_name'])) {
            $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "bank_transfer_bank", :v, "wallet", NOW())', ['v' => (string)$settingsData['bank_name']]);
            $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "bank_transfer_account_number", :v, "wallet", NOW())', ['v' => (string)($settingsData['bank_account_number'] ?? '5210471634')]);
            $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "bank_transfer_account_name", :v, "wallet", NOW())', ['v' => (string)($settingsData['bank_account_name'] ?? 'Hambaktech_Services')]);
        }
        if ($category === 'payment_gateways' && isset($settingsData['active_gateway'])) {
            $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "active_payment_gateway", :v, "payments", NOW())', ['v' => (string)$settingsData['active_gateway']]);
        }
        if ($category === 'provider_integration') {
            if (!empty($settingsData['primary_telecom_provider'])) {
                $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "active_telecom_provider", :v, "telecom", NOW())', ['v' => (string)$settingsData['primary_telecom_provider']]);
            }
            if (!empty($settingsData['primary_identity_provider'])) {
                $this->db->execute('REPLACE INTO system_settings (id, setting_key, setting_value, category, updated_at) VALUES (UUID(), "active_verification_provider", :v, "identity", NOW())', ['v' => (string)$settingsData['primary_identity_provider']]);
            }
        }

        // Audit log
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "SETTINGS_UPDATED", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $admin['id'],
                'email' => $admin['email'],
                'details' => json_encode(['category' => $category]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'category' => $category,
            'updated' => count($settingsData),
        ], "Settings for {$category} saved to MySQL database successfully.");
    }
}
