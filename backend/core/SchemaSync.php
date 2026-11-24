<?php
/**
 * @file SchemaSync.php
 * Idempotent Production MySQL Schema Synchronizer
 * Ensures all required tables and columns exist without dropping data.
 */

declare(strict_types=1);

namespace HambakTech\Core;

use Throwable;

class SchemaSync
{
    public static function sync(Database $db): array
    {
        $applied = [];
        $errors = [];

        $tableDefinitions = [
            'roles' => 'CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                slug VARCHAR(50) NOT NULL UNIQUE,
                description TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'permissions' => 'CREATE TABLE IF NOT EXISTS permissions (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                slug VARCHAR(100) NOT NULL UNIQUE,
                module VARCHAR(50) NOT NULL,
                description TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'role_permissions' => 'CREATE TABLE IF NOT EXISTS role_permissions (
                role_id VARCHAR(36) NOT NULL,
                permission_id VARCHAR(36) NOT NULL,
                PRIMARY KEY (role_id, permission_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'users' => 'CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(191) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(191) NOT NULL,
                phone_number VARCHAR(30) NOT NULL,
                role VARCHAR(32) NOT NULL DEFAULT "customer",
                assigned_dashboard VARCHAR(32) NULL,
                wallet_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                kyc_status ENUM("unverified", "pending", "verified", "rejected") NOT NULL DEFAULT "unverified",
                tier INT NOT NULL DEFAULT 1,
                referral_code VARCHAR(50) NOT NULL UNIQUE,
                status ENUM("active", "suspended") NOT NULL DEFAULT "active",
                avatar_url VARCHAR(500) NULL,
                transaction_pin_hash VARCHAR(255) NULL,
                email_verified TINYINT(1) NOT NULL DEFAULT 0,
                email_verification_required TINYINT(1) NOT NULL DEFAULT 0,
                email_verified_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_role (role),
                INDEX idx_user_status (status),
                INDEX idx_user_phone (phone_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'user_profiles' => 'CREATE TABLE IF NOT EXISTS user_profiles (
                user_id VARCHAR(36) PRIMARY KEY,
                nin VARCHAR(20) NULL,
                bvn VARCHAR(20) NULL,
                address TEXT NULL,
                state VARCHAR(100) NULL,
                lga VARCHAR(100) NULL,
                bio TEXT NULL,
                notification_preferences JSON NULL,
                security_settings JSON NULL,
                assigned_permissions JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_nin (nin),
                INDEX idx_user_bvn (bvn)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'password_resets' => 'CREATE TABLE IF NOT EXISTS password_resets (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(191) NOT NULL,
                otp_code VARCHAR(10) NOT NULL,
                token VARCHAR(100) NOT NULL,
                attempts INT DEFAULT 0,
                is_used TINYINT(1) DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pr_email (email),
                INDEX idx_pr_token (token),
                INDEX idx_pr_otp (email, otp_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'staff_accounts' => 'CREATE TABLE IF NOT EXISTS staff_accounts (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL UNIQUE,
                department VARCHAR(100) NOT NULL,
                access_level ENUM("analyst", "manager", "executive", "superadmin") NOT NULL DEFAULT "analyst",
                can_fund_wallets TINYINT(1) NOT NULL DEFAULT 0,
                can_modify_rates TINYINT(1) NOT NULL DEFAULT 0,
                can_suspend_users TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'wallets' => 'CREATE TABLE IF NOT EXISTS wallets (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL UNIQUE,
                balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                currency VARCHAR(10) NOT NULL DEFAULT "NGN",
                ledger_version BIGINT NOT NULL DEFAULT 0,
                status ENUM("active", "frozen", "closed") NOT NULL DEFAULT "active",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_wallet_balance (balance)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'wallet_ledger' => 'CREATE TABLE IF NOT EXISTS wallet_ledger (
                id VARCHAR(36) PRIMARY KEY,
                wallet_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                entry_type ENUM("CREDIT", "DEBIT") NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                balance_before DECIMAL(15, 2) NOT NULL,
                balance_after DECIMAL(15, 2) NOT NULL,
                reference VARCHAR(100) NOT NULL UNIQUE,
                category VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ledger_user_created (user_id, created_at),
                INDEX idx_ledger_ref (reference)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'transactions' => 'CREATE TABLE IF NOT EXISTS transactions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                type ENUM("credit", "debit") NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                balance_before DECIMAL(15, 2) NOT NULL,
                balance_after DECIMAL(15, 2) NOT NULL,
                category VARCHAR(50) NOT NULL,
                reference VARCHAR(100) NOT NULL UNIQUE,
                idempotency_key VARCHAR(100) NULL UNIQUE,
                gateway ENUM("flutterwave", "paystack", "manual_transfer", "internal") NOT NULL DEFAULT "internal",
                status ENUM("successful", "pending", "failed") NOT NULL DEFAULT "pending",
                description TEXT NOT NULL,
                metadata JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_tx_user_status (user_id, status),
                INDEX idx_tx_category (category),
                INDEX idx_tx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'payment_records' => 'CREATE TABLE IF NOT EXISTS payment_records (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                gateway VARCHAR(50) NOT NULL,
                reference VARCHAR(100) NOT NULL UNIQUE,
                amount DECIMAL(15, 2) NOT NULL,
                fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                status ENUM("pending", "successful", "failed", "abandoned") NOT NULL DEFAULT "pending",
                paid_at TIMESTAMP NULL,
                raw_response JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_payment_ref (reference),
                INDEX idx_payment_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'manual_funding_requests' => 'CREATE TABLE IF NOT EXISTS manual_funding_requests (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                bank_name VARCHAR(100) NOT NULL,
                account_number VARCHAR(50) NOT NULL,
                payment_reference VARCHAR(100) NULL,
                payment_date DATE NULL,
                payment_method VARCHAR(50) NOT NULL DEFAULT "Bank Transfer",
                depositor_name VARCHAR(191) NOT NULL,
                remarks TEXT NULL,
                teller_proof_url VARCHAR(500) NULL,
                proof_filename VARCHAR(255) NULL,
                status ENUM("pending", "approved", "rejected") NOT NULL DEFAULT "pending",
                admin_notes TEXT NULL,
                reviewed_by VARCHAR(36) NULL,
                reviewed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_manual_status (status),
                INDEX idx_manual_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'service_categories' => 'CREATE TABLE IF NOT EXISTS service_categories (
                id VARCHAR(36) PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description TEXT NULL,
                icon VARCHAR(50) NOT NULL DEFAULT "Cpu",
                display_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'providers' => 'CREATE TABLE IF NOT EXISTS providers (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                provider_type ENUM("identity", "telecom", "payment") NOT NULL,
                base_url VARCHAR(255) NOT NULL,
                api_key VARCHAR(255) NULL,
                secret_key VARCHAR(255) NULL,
                public_key VARCHAR(255) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                is_default TINYINT(1) NOT NULL DEFAULT 0,
                timeout_seconds INT NOT NULL DEFAULT 30,
                balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                last_ping_status ENUM("operational", "error", "untested", "unconfigured") NOT NULL DEFAULT "untested",
                last_ping_latency INT NULL,
                last_ping_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'service_catalogue' => 'CREATE TABLE IF NOT EXISTS service_catalogue (
                id VARCHAR(36) PRIMARY KEY,
                category_id VARCHAR(36) NOT NULL,
                service_key VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(191) NOT NULL,
                description TEXT NULL,
                provider_id VARCHAR(50) NOT NULL,
                endpoint VARCHAR(255) NOT NULL,
                wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                required_fields JSON NOT NULL,
                processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant",
                manual_label VARCHAR(80) NULL DEFAULT "Manual Processing",
                estimated_turnaround VARCHAR(150) NULL,
                required_documents JSON NULL,
                form_schema JSON NULL,
                supported_notes TEXT NULL,
                slip_type_supported TINYINT(1) NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_service_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'provider_service_mappings' => 'CREATE TABLE IF NOT EXISTS provider_service_mappings (
                id VARCHAR(36) PRIMARY KEY,
                provider_id VARCHAR(50) NOT NULL,
                service_key VARCHAR(100) NOT NULL,
                provider_endpoint VARCHAR(255) NOT NULL,
                provider_plan_code VARCHAR(100) NULL,
                wholesale_cost DECIMAL(15, 2) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                INDEX idx_psm_lookup (service_key, is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'provider_logs' => 'CREATE TABLE IF NOT EXISTS provider_logs (
                id VARCHAR(36) PRIMARY KEY,
                provider_id VARCHAR(50) NOT NULL,
                endpoint VARCHAR(255) NOT NULL,
                method VARCHAR(10) NOT NULL DEFAULT "POST",
                status_code INT NOT NULL,
                request_body LONGTEXT NULL,
                response_body LONGTEXT NULL,
                latency_ms INT NOT NULL DEFAULT 0,
                reference VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pl_provider (provider_id),
                INDEX idx_pl_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'verification_records' => 'CREATE TABLE IF NOT EXISTS verification_records (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                type VARCHAR(50) NOT NULL,
                service_key VARCHAR(100) NULL,
                search_value VARCHAR(100) NOT NULL,
                provider VARCHAR(50) NOT NULL,
                cost DECIMAL(15, 2) NOT NULL,
                provider_cost DECIMAL(15, 2) NULL,
                status ENUM("completed", "failed", "pending") NOT NULL DEFAULT "pending",
                reference VARCHAR(100) NULL UNIQUE,
                slip_type VARCHAR(50) NULL,
                has_slip TINYINT(1) NOT NULL DEFAULT 0,
                idempotency_key VARCHAR(120) NULL,
                result_data JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_vr_user (user_id),
                INDEX idx_vr_search (search_value),
                INDEX idx_vr_idemp (user_id, idempotency_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'telecom_plans' => 'CREATE TABLE IF NOT EXISTS telecom_plans (
                id VARCHAR(36) PRIMARY KEY,
                provider_plan_id VARCHAR(50) NOT NULL,
                network ENUM("MTN", "AIRTEL", "GLO", "9MOBILE") NOT NULL,
                network_id INT NULL,
                name VARCHAR(150) NOT NULL,
                size VARCHAR(50) NOT NULL,
                plan_type VARCHAR(100) NOT NULL DEFAULT "SME",
                validity VARCHAR(50) NOT NULL DEFAULT "30 Days",
                wholesale_cost DECIMAL(15, 2) NOT NULL,
                price DECIMAL(15, 2) NOT NULL,
                pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup",
                fixed_price DECIMAL(15, 2) NULL,
                markup_percent DECIMAL(8, 2) NULL,
                discount_percent DECIMAL(8, 2) NULL,
                admin_price_locked TINYINT(1) NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                provider_id VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_telecom_network (network, is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'telecom_orders' => 'CREATE TABLE IF NOT EXISTS telecom_orders (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                service_type ENUM("data", "airtime", "airtime_pin", "airtime_swap", "cable", "data_pin", "bulksms", "electricity", "exam") NOT NULL,
                network VARCHAR(50) NULL,
                phone VARCHAR(30) NULL,
                plan VARCHAR(100) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                cost_price DECIMAL(15, 2) NOT NULL,
                profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                provider_id VARCHAR(50) NOT NULL,
                provider_ref VARCHAR(100) NOT NULL,
                idempotency_key VARCHAR(100) NULL,
                status ENUM("successful", "pending", "failed", "refunded") NOT NULL DEFAULT "pending",
                metadata JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_to_user (user_id),
                INDEX idx_to_status (status),
                INDEX idx_to_idem (user_id, idempotency_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'airtime_pin_denominations' => 'CREATE TABLE IF NOT EXISTS airtime_pin_denominations (
                id VARCHAR(36) PRIMARY KEY,
                provider_plan_id INT NULL,
                network ENUM("MTN", "AIRTEL", "GLO", "9MOBILE") NOT NULL,
                network_id INT NULL,
                value DECIMAL(10, 2) NOT NULL,
                wholesale_cost DECIMAL(10, 2) NOT NULL,
                api_discount DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
                available_stock INT NOT NULL DEFAULT 0,
                max_quantity INT NOT NULL DEFAULT 50,
                price DECIMAL(10, 2) NOT NULL,
                pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup",
                fixed_price DECIMAL(15, 2) NULL,
                markup_percent DECIMAL(8, 2) NULL,
                discount_percent DECIMAL(8, 2) NULL,
                admin_price_locked TINYINT(1) NOT NULL DEFAULT 0,
                provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'data_pin_denominations' => 'CREATE TABLE IF NOT EXISTS data_pin_denominations (
                id VARCHAR(36) PRIMARY KEY,
                provider_plan_id INT NULL,
                network ENUM("MTN", "AIRTEL", "GLO", "9MOBILE") NOT NULL,
                network_id INT NULL,
                name VARCHAR(150) NOT NULL,
                size VARCHAR(50) NOT NULL,
                validity VARCHAR(50) NOT NULL DEFAULT "30 Days",
                plan_type VARCHAR(100) NULL,
                wholesale_cost DECIMAL(10, 2) NOT NULL,
                available_stock INT NOT NULL DEFAULT 0,
                max_quantity INT NOT NULL DEFAULT 50,
                price DECIMAL(10, 2) NOT NULL,
                pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup",
                fixed_price DECIMAL(15, 2) NULL,
                markup_percent DECIMAL(8, 2) NULL,
                discount_percent DECIMAL(8, 2) NULL,
                admin_price_locked TINYINT(1) NOT NULL DEFAULT 0,
                provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'telecom_vouchers' => 'CREATE TABLE IF NOT EXISTS telecom_vouchers (
                id VARCHAR(36) PRIMARY KEY,
                order_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                service_type ENUM("airtime_pin", "data_pin") NOT NULL,
                network VARCHAR(30) NOT NULL,
                denomination_label VARCHAR(80) NOT NULL,
                face_value DECIMAL(15, 2) NULL,
                pin_code VARCHAR(120) NOT NULL,
                serial_number VARCHAR(120) NOT NULL,
                load_code VARCHAR(100) NULL,
                check_balance_code VARCHAR(100) NULL,
                card_name VARCHAR(120) NULL,
                voucher_index INT NOT NULL DEFAULT 1,
                provider_ref VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_order_voucher_idx (order_id, voucher_index),
                UNIQUE KEY uniq_pin_serial_pair (service_type, network, pin_code, serial_number),
                INDEX idx_tv_user (user_id),
                INDEX idx_tv_order (order_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'cable_packages' => 'CREATE TABLE IF NOT EXISTS cable_packages (
                id VARCHAR(36) PRIMARY KEY,
                provider ENUM("dstv", "gotv", "startimes", "showmax") NOT NULL,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(100) NOT NULL,
                channels INT NOT NULL DEFAULT 0,
                wholesale_cost DECIMAL(15, 2) NOT NULL,
                price DECIMAL(15, 2) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'electricity_discos' => 'CREATE TABLE IF NOT EXISTS electricity_discos (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50) NOT NULL UNIQUE,
                minimum_amount DECIMAL(15, 2) NOT NULL DEFAULT 500.00,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'exam_packages' => 'CREATE TABLE IF NOT EXISTS exam_packages (
                id VARCHAR(36) PRIMARY KEY,
                exam_name ENUM("WAEC", "NECO", "NABTEB", "JAMB") NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT NULL,
                wholesale_cost DECIMAL(15, 2) NOT NULL,
                price DECIMAL(15, 2) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'airtime_swap_configs' => 'CREATE TABLE IF NOT EXISTS airtime_swap_configs (
                id VARCHAR(36) PRIMARY KEY,
                network ENUM("MTN", "AIRTEL", "GLO", "9MOBILE") NOT NULL UNIQUE,
                conversion_rate_percent DECIMAL(5, 2) NOT NULL DEFAULT 80.00,
                merchant_phone VARCHAR(30) NOT NULL,
                ussd_code VARCHAR(100) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'bulk_sms_records' => 'CREATE TABLE IF NOT EXISTS bulk_sms_records (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                sender_id VARCHAR(20) NOT NULL,
                recipients_count INT NOT NULL,
                recipients_sample TEXT NOT NULL,
                message TEXT NOT NULL,
                pages INT NOT NULL DEFAULT 1,
                units_charged DECIMAL(10, 2) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                status ENUM("DELIVERED", "PENDING", "FAILED") NOT NULL DEFAULT "DELIVERED",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'kyc_submissions' => 'CREATE TABLE IF NOT EXISTS kyc_submissions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                id_type VARCHAR(50) NOT NULL DEFAULT "NIN",
                id_number VARCHAR(100) NOT NULL DEFAULT "",
                doc_url VARCHAR(500) NULL,
                status ENUM("pending", "verified", "approved", "rejected", "info_requested") NOT NULL DEFAULT "pending",
                review_notes TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_kyc_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'notifications' => 'CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(191) NOT NULL,
                message TEXT NOT NULL,
                type ENUM("info", "success", "warning", "alert", "security") NOT NULL DEFAULT "info",
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                action_link VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notif_user_read (user_id, is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'customer_messages' => 'CREATE TABLE IF NOT EXISTS customer_messages (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(191) NOT NULL,
                category ENUM("service", "system", "security", "billing") NOT NULL DEFAULT "system",
                body TEXT NOT NULL,
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                reference VARCHAR(100) NULL,
                action_label VARCHAR(50) NULL,
                action_link VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_cm_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'email_templates' => 'CREATE TABLE IF NOT EXISTS email_templates (
                id VARCHAR(36) PRIMARY KEY,
                template_key VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                category ENUM("Auth", "Wallet", "Transactions", "Services", "Security", "Admin") NOT NULL DEFAULT "Auth",
                subject VARCHAR(255) NOT NULL,
                html_body LONGTEXT NOT NULL,
                description TEXT NULL,
                variables JSON NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'sms_templates' => 'CREATE TABLE IF NOT EXISTS sms_templates (
                id VARCHAR(36) PRIMARY KEY,
                template_key VARCHAR(100) NOT NULL UNIQUE,
                title VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                variables JSON NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'sms_configs' => 'CREATE TABLE IF NOT EXISTS sms_configs (
                id VARCHAR(36) PRIMARY KEY,
                provider ENUM("termii", "bulksms_nigeria", "twilio", "custom_webhook") NOT NULL,
                api_key VARCHAR(255) NOT NULL,
                sender_id VARCHAR(20) NOT NULL,
                route ENUM("generic", "dnd", "whatsapp") NOT NULL DEFAULT "generic",
                webhook_url VARCHAR(255) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                balance_units INT NOT NULL DEFAULT 0,
                logs JSON NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'cms_pages' => 'CREATE TABLE IF NOT EXISTS cms_pages (
                id VARCHAR(36) PRIMARY KEY,
                slug VARCHAR(100) NOT NULL UNIQUE,
                title VARCHAR(191) NOT NULL,
                content LONGTEXT NULL,
                meta_title VARCHAR(255) NULL,
                meta_description TEXT NULL,
                is_published TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'cms_sections' => 'CREATE TABLE IF NOT EXISTS cms_sections (
                id VARCHAR(36) PRIMARY KEY,
                section_key VARCHAR(50) NOT NULL UNIQUE,
                section_data JSON NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'website_branding' => 'CREATE TABLE IF NOT EXISTS website_branding (
                id VARCHAR(36) PRIMARY KEY,
                company_name VARCHAR(191) NOT NULL,
                short_brand_name VARCHAR(100) NULL DEFAULT "HAMBAKTECH",
                tagline VARCHAR(255) NULL,
                logo_url VARCHAR(500) NULL,
                favicon_url VARCHAR(500) NULL,
                primary_color VARCHAR(20) NOT NULL DEFAULT "#1d4ed8",
                secondary_color VARCHAR(20) NOT NULL DEFAULT "#0f172a",
                font_family VARCHAR(50) NOT NULL DEFAULT "Plus Jakarta Sans",
                support_phone VARCHAR(50) NOT NULL,
                business_phone VARCHAR(50) NULL DEFAULT "08147837664",
                support_email VARCHAR(191) NOT NULL,
                info_email VARCHAR(191) NULL DEFAULT "info@hambaktech.com.ng",
                office_address TEXT NOT NULL,
                whatsapp_number VARCHAR(50) NOT NULL,
                business_reg_number VARCHAR(100) NULL DEFAULT "BN 9284726",
                founded_year VARCHAR(20) NULL DEFAULT "2024",
                social_links JSON NULL,
                footer_text TEXT NULL,
                copyright_text VARCHAR(255) NULL,
                seo_title VARCHAR(255) NULL,
                seo_description TEXT NULL,
                seo_keywords TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'announcements' => 'CREATE TABLE IF NOT EXISTS announcements (
                id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                category ENUM("update", "maintenance", "offer", "security", "general") NOT NULL DEFAULT "general",
                target_audience VARCHAR(64) NOT NULL DEFAULT "all_customers",
                target_user_id VARCHAR(36) NULL,
                is_pinned TINYINT(1) NOT NULL DEFAULT 0,
                status ENUM("published", "draft") NOT NULL DEFAULT "published",
                author VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_anc_status_pinned (status, is_pinned)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'faqs' => 'CREATE TABLE IF NOT EXISTS faqs (
                id VARCHAR(36) PRIMARY KEY,
                category VARCHAR(50) NOT NULL DEFAULT "general",
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                display_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'navigation_menus' => 'CREATE TABLE IF NOT EXISTS navigation_menus (
                id VARCHAR(36) PRIMARY KEY,
                menu_key VARCHAR(50) NOT NULL UNIQUE,
                label VARCHAR(100) NOT NULL,
                page_key VARCHAR(50) NOT NULL,
                display_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'dashboard_modules' => 'CREATE TABLE IF NOT EXISTS dashboard_modules (
                id VARCHAR(36) PRIMARY KEY,
                module_key VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                icon VARCHAR(50) NOT NULL,
                status ENUM("active", "coming_soon", "disabled") NOT NULL DEFAULT "active",
                is_visible TINYINT(1) NOT NULL DEFAULT 1,
                coming_soon_message VARCHAR(255) NULL,
                display_order INT NOT NULL DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'system_settings' => 'CREATE TABLE IF NOT EXISTS system_settings (
                id VARCHAR(36) PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value LONGTEXT NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT "general",
                description TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'audit_logs' => 'CREATE TABLE IF NOT EXISTS audit_logs (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NULL,
                user_email VARCHAR(191) NULL,
                action VARCHAR(100) NOT NULL,
                details JSON NULL,
                ip_address VARCHAR(50) NULL,
                user_agent VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_audit_created (created_at),
                INDEX idx_audit_action (action)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'customer_virtual_accounts' => 'CREATE TABLE IF NOT EXISTS customer_virtual_accounts (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL UNIQUE,
                provider VARCHAR(50) NOT NULL DEFAULT "paystack",
                paystack_customer_code VARCHAR(100) NULL,
                dedicated_account_id BIGINT NULL,
                order_ref VARCHAR(100) NOT NULL UNIQUE,
                flw_ref VARCHAR(100) NULL,
                account_number VARCHAR(30) NOT NULL DEFAULT "",
                account_name VARCHAR(191) NULL,
                bank_name VARCHAR(100) NOT NULL DEFAULT "",
                bank_id INT NULL,
                bank_slug VARCHAR(80) NULL,
                bank_code VARCHAR(50) NULL,
                currency VARCHAR(10) NOT NULL DEFAULT "NGN",
                account_status ENUM("active", "inactive", "pending_approval") NOT NULL DEFAULT "pending_approval",
                kyc_validation_status ENUM("unverified", "pending", "verified", "failed") NOT NULL DEFAULT "unverified",
                dva_consent TINYINT(1) NOT NULL DEFAULT 0,
                dva_consent_at DATETIME NULL,
                assignment_status ENUM("not_requested", "pending", "assigned", "failed", "deactivated") NOT NULL DEFAULT "not_requested",
                provisioning_status ENUM("not_requested", "awaiting_customer_info", "pending_identification", "processing", "active", "failed", "suspended", "deactivated", "under_review") NOT NULL DEFAULT "not_requested",
                failure_reason TEXT NULL,
                error_code VARCHAR(80) NULL,
                total_inflow DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                assigned_at DATETIME NULL,
                last_synced_at DATETIME NULL,
                last_funding_at DATETIME NULL,
                raw_assignment_payload JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_va_account (account_number),
                INDEX idx_va_paystack_customer (paystack_customer_code),
                INDEX idx_va_dedicated_id (dedicated_account_id),
                INDEX idx_va_prov_status (provisioning_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'paystack_dva_settlements' => 'CREATE TABLE IF NOT EXISTS paystack_dva_settlements (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NULL,
                virtual_account_id VARCHAR(36) NULL,
                paystack_reference VARCHAR(120) NOT NULL UNIQUE,
                paystack_transaction_id BIGINT NULL,
                dedicated_account_id BIGINT NULL,
                account_number VARCHAR(30) NOT NULL,
                paystack_customer_code VARCHAR(100) NULL,
                gross_amount DECIMAL(15, 2) NOT NULL,
                paystack_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                merchant_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_credit_amount DECIMAL(15, 2) NOT NULL,
                net_settlement_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                fee_bearer ENUM("customer", "merchant") NOT NULL DEFAULT "customer",
                fee_confirmed TINYINT(1) NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT "NGN",
                sender_bank VARCHAR(120) NULL,
                sender_account_name VARCHAR(191) NULL,
                sender_account_number_masked VARCHAR(40) NULL,
                session_id VARCHAR(120) NULL,
                settlement_status ENUM("settled", "under_review", "failed", "disputed", "reversed") NOT NULL DEFAULT "settled",
                quarantine_reason VARCHAR(120) NULL,
                wallet_transaction_id VARCHAR(36) NULL,
                reversal_transaction_id VARCHAR(36) NULL,
                reversal_reference VARCHAR(120) NULL,
                reversal_reason VARCHAR(255) NULL,
                dispute_status VARCHAR(60) NULL,
                dispute_reference VARCHAR(120) NULL,
                settled_at DATETIME NULL,
                reversed_at DATETIME NULL,
                resolved_by VARCHAR(36) NULL,
                resolved_at DATETIME NULL,
                raw_payload JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_dva_settle_user (user_id, created_at),
                INDEX idx_dva_settle_acc (account_number),
                INDEX idx_dva_settle_status (settlement_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'broadcasts' => 'CREATE TABLE IF NOT EXISTS broadcasts (
                id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(191) NOT NULL,
                message TEXT NOT NULL,
                channel VARCHAR(32) NOT NULL DEFAULT "in_app",
                type VARCHAR(32) NOT NULL DEFAULT "info",
                target_role VARCHAR(32) NOT NULL DEFAULT "all",
                user_id VARCHAR(36) NULL,
                recipient_count INT NOT NULL DEFAULT 0,
                sent_by VARCHAR(36) NULL,
                sent_by_name VARCHAR(191) NULL,
                status VARCHAR(32) NOT NULL DEFAULT "sent",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'email_logs' => 'CREATE TABLE IF NOT EXISTS email_logs (
                id VARCHAR(36) PRIMARY KEY,
                recipient VARCHAR(191) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT "sent",
                error TEXT NULL,
                host VARCHAR(191) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_el_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'sms_logs' => 'CREATE TABLE IF NOT EXISTS sms_logs (
                id VARCHAR(36) PRIMARY KEY,
                recipient VARCHAR(64) NOT NULL,
                message TEXT NOT NULL,
                units INT NOT NULL DEFAULT 1,
                status VARCHAR(32) NOT NULL DEFAULT "pending",
                provider VARCHAR(50) NOT NULL DEFAULT "termii",
                provider_reference VARCHAR(120) NULL,
                error TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sl_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'uploaded_documents' => 'CREATE TABLE IF NOT EXISTS uploaded_documents (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                document_type VARCHAR(64) NOT NULL DEFAULT "kyc_document",
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                file_size INT NOT NULL DEFAULT 0,
                file_path VARCHAR(500) NOT NULL,
                file_url VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ud_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'store_items' => 'CREATE TABLE IF NOT EXISTS store_items (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(191) NOT NULL,
                category VARCHAR(100) NOT NULL,
                price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                stock INT NOT NULL DEFAULT 0,
                description TEXT NULL,
                image_url VARCHAR(500) NULL,
                status ENUM("active", "draft", "out_of_stock") NOT NULL DEFAULT "active",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'academy_courses' => 'CREATE TABLE IF NOT EXISTS academy_courses (
                id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(191) NOT NULL,
                category VARCHAR(100) NULL DEFAULT "Digital Skills",
                level VARCHAR(50) NOT NULL,
                duration VARCHAR(50) NOT NULL,
                modules_count INT NOT NULL DEFAULT 1,
                price DECIMAL(15, 2) NULL DEFAULT NULL,
                description TEXT NULL,
                curriculum_outline TEXT NULL,
                is_available TINYINT(1) NOT NULL DEFAULT 1,
                admission_start_date DATE NULL,
                admission_end_date DATE NULL,
                display_order INT NOT NULL DEFAULT 1,
                status ENUM("draft", "enrolling", "active") NOT NULL DEFAULT "enrolling",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'academy_applications' => 'CREATE TABLE IF NOT EXISTS academy_applications (
                id VARCHAR(36) PRIMARY KEY,
                application_ref VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NULL,
                course_id VARCHAR(36) NOT NULL,
                full_name VARCHAR(191) NOT NULL,
                email VARCHAR(191) NOT NULL,
                phone VARCHAR(32) NOT NULL,
                date_of_birth DATE NOT NULL,
                age_at_submission INT NOT NULL DEFAULT 18,
                gender VARCHAR(24) NOT NULL,
                address TEXT NOT NULL,
                state VARCHAR(64) NOT NULL,
                lga VARCHAR(64) NOT NULL,
                qualification VARCHAR(120) NULL,
                study_mode VARCHAR(32) NOT NULL DEFAULT "physical",
                preferred_schedule VARCHAR(32) NOT NULL DEFAULT "weekday",
                guardian_name VARCHAR(191) NULL,
                guardian_phone VARCHAR(32) NULL,
                guardian_address TEXT NULL,
                guardian_relationship VARCHAR(64) NULL,
                emergency_contact_name VARCHAR(191) NULL,
                emergency_contact_phone VARCHAR(32) NULL,
                passport_url TEXT NULL,
                status ENUM("pending", "approved", "rejected", "info_requested", "enrolled") NOT NULL DEFAULT "pending",
                admin_notes TEXT NULL,
                info_request_message TEXT NULL,
                reviewed_by VARCHAR(191) NULL,
                reviewed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_aa_email (email),
                INDEX idx_aa_user (user_id),
                INDEX idx_aa_status (status),
                INDEX idx_aa_course (course_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'academy_students' => 'CREATE TABLE IF NOT EXISTS academy_students (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(64) NOT NULL UNIQUE,
                application_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NULL,
                course_id VARCHAR(36) NOT NULL,
                full_name VARCHAR(191) NOT NULL,
                email VARCHAR(191) NOT NULL,
                phone VARCHAR(32) NOT NULL,
                photo_url TEXT NULL,
                enrollment_date DATE NOT NULL,
                completion_date DATE NULL,
                academic_status ENUM("active", "graduated", "suspended", "withdrawn") NOT NULL DEFAULT "active",
                id_card_issued_at DATETIME NULL,
                qr_token VARCHAR(128) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_as_user (user_id),
                INDEX idx_as_course (course_id),
                INDEX idx_as_app (application_id),
                INDEX idx_as_status (academic_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'smtp_configs' => 'CREATE TABLE IF NOT EXISTS smtp_configs (
                id VARCHAR(36) PRIMARY KEY,
                host VARCHAR(191) NOT NULL,
                port INT NOT NULL DEFAULT 465,
                username VARCHAR(191) NOT NULL,
                password VARCHAR(255) NULL,
                encryption ENUM("tls", "ssl", "none") NOT NULL DEFAULT "ssl",
                sender_email VARCHAR(191) NOT NULL,
                sender_name VARCHAR(100) NOT NULL,
                reply_to VARCHAR(191) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                last_tested_at TIMESTAMP NULL,
                last_test_status ENUM("operational", "error", "untested") NOT NULL DEFAULT "untested",
                logs JSON NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'slip_templates' => 'CREATE TABLE IF NOT EXISTS slip_templates (
                id VARCHAR(50) PRIMARY KEY,
                slip_code VARCHAR(64) NULL,
                name VARCHAR(191) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT "NIN",
                price DECIMAL(15, 2) NULL,
                demo_image_url VARCHAR(500) NULL,
                description TEXT NULL,
                supported_service VARCHAR(100) NOT NULL DEFAULT "all_nin",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 1,
                is_recommended TINYINT(1) NOT NULL DEFAULT 0,
                badge VARCHAR(50) NULL,
                watermark_text VARCHAR(100) DEFAULT "DEMO SPECIMEN - SAMPLE PREVIEW ONLY",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'service_security_rules' => 'CREATE TABLE IF NOT EXISTS service_security_rules (
                id VARCHAR(50) PRIMARY KEY,
                service_key VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                service_name VARCHAR(191) NULL,
                category VARCHAR(50) NOT NULL DEFAULT "general",
                require_pin TINYINT(1) DEFAULT 1,
                requires_pin TINYINT(1) NULL,
                min_tier INT DEFAULT 1,
                min_kyc_level INT NULL,
                max_daily_limit DECIMAL(16, 2) DEFAULT 500000.00,
                daily_limit DECIMAL(16, 2) NULL,
                description TEXT NULL,
                updated_by VARCHAR(191) NULL,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'support_tickets' => 'CREATE TABLE IF NOT EXISTS support_tickets (
                id VARCHAR(36) PRIMARY KEY,
                ticket_number VARCHAR(64) NULL,
                user_id VARCHAR(36) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                category VARCHAR(64) NULL DEFAULT "general",
                priority ENUM("low", "medium", "high", "urgent") NOT NULL DEFAULT "medium",
                status ENUM("open", "pending", "in_progress", "waiting_customer", "resolved", "closed") NOT NULL DEFAULT "open",
                department VARCHAR(50) NOT NULL DEFAULT "General",
                assigned_to VARCHAR(100) NULL,
                order_id VARCHAR(64) NULL,
                description TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_st_user (user_id),
                INDEX idx_st_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'support_replies' => 'CREATE TABLE IF NOT EXISTS support_replies (
                id VARCHAR(36) PRIMARY KEY,
                ticket_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                is_staff TINYINT(1) NOT NULL DEFAULT 0,
                is_internal_note TINYINT(1) NOT NULL DEFAULT 0,
                message TEXT NOT NULL,
                attachment_url VARCHAR(500) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sr_ticket (ticket_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'announcement_email_deliveries' => 'CREATE TABLE IF NOT EXISTS announcement_email_deliveries (
                id VARCHAR(36) PRIMARY KEY,
                announcement_id VARCHAR(64) NOT NULL,
                announcement_source VARCHAR(32) NOT NULL DEFAULT "announcement",
                user_id VARCHAR(36) NULL,
                recipient_email VARCHAR(191) NOT NULL,
                recipient_name VARCHAR(191) NULL,
                status ENUM("pending", "sent", "failed", "skipped") NOT NULL DEFAULT "pending",
                message_id VARCHAR(255) NULL,
                error_message TEXT NULL,
                attempts INT NOT NULL DEFAULT 1,
                sent_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_ann_email (announcement_id, recipient_email),
                INDEX idx_aed_ann_status (announcement_id, status),
                INDEX idx_aed_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'modification_requests' => 'CREATE TABLE IF NOT EXISTS modification_requests (
                id VARCHAR(36) PRIMARY KEY,
                request_number VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                identity_type ENUM("NIN", "BVN") NOT NULL,
                service_key VARCHAR(100) NOT NULL,
                service_name VARCHAR(191) NOT NULL,
                masked_identifier VARCHAR(40) NOT NULL,
                submitted_fields JSON NOT NULL,
                supporting_documents JSON NULL,
                enrollment_type VARCHAR(150) NULL,
                customer_price DECIMAL(15, 2) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                endpoint VARCHAR(150) NOT NULL,
                payment_reference VARCHAR(120) NOT NULL UNIQUE,
                refund_reference VARCHAR(120) NULL UNIQUE,
                idempotency_key VARCHAR(120) NULL,
                provider_reference VARCHAR(120) NULL,
                provider_status VARCHAR(64) NULL,
                provider_remarks TEXT NULL,
                provider_response JSON NULL,
                admin_notes TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at DATETIME NULL,
                estimated_completion_text VARCHAR(150) NULL,
                status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                completed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mr_user (user_id),
                INDEX idx_mr_type_status (identity_type, status),
                INDEX idx_mr_prov_ref (provider_reference),
                INDEX idx_mr_idemp (user_id, idempotency_key),
                INDEX idx_mr_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'modification_bvn_types' => 'CREATE TABLE IF NOT EXISTS modification_bvn_types (
                id VARCHAR(64) PRIMARY KEY,
                enrollment_type VARCHAR(150) NOT NULL UNIQUE,
                label VARCHAR(191) NOT NULL,
                wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                provider_synced_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'enrolment_orders' => 'CREATE TABLE IF NOT EXISTS enrolment_orders (
                id VARCHAR(36) PRIMARY KEY,
                order_number VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                enrolment_type ENUM("NIN_ADULT", "NIN_CHILD", "NIN_ARRANGEMENT", "BVN_ENROLMENT", "BVN_ARRANGEMENT") NOT NULL DEFAULT "NIN_ADULT",
                identity_domain ENUM("NIN", "BVN") NOT NULL DEFAULT "NIN",
                service_key VARCHAR(100) NOT NULL,
                service_name VARCHAR(191) NOT NULL,
                applicant_name VARCHAR(191) NOT NULL,
                applicant_phone_masked VARCHAR(40) NULL,
                submitted_fields JSON NOT NULL,
                supporting_documents JSON NULL,
                customer_price DECIMAL(15, 2) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                endpoint VARCHAR(150) NOT NULL,
                payment_reference VARCHAR(120) NOT NULL UNIQUE,
                refund_reference VARCHAR(120) NULL UNIQUE,
                idempotency_key VARCHAR(120) NULL,
                provider_reference VARCHAR(120) NULL,
                provider_status VARCHAR(64) NULL,
                provider_remarks TEXT NULL,
                provider_response JSON NULL,
                admin_notes TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at DATETIME NULL,
                estimated_completion_text VARCHAR(150) NULL,
                status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                completed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_eo_user (user_id),
                INDEX idx_eo_domain_status (identity_domain, status),
                INDEX idx_eo_prov_ref (provider_reference),
                INDEX idx_eo_idemp (user_id, idempotency_key),
                INDEX idx_eo_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'enrolment_sample_documents' => 'CREATE TABLE IF NOT EXISTS enrolment_sample_documents (
                id VARCHAR(36) PRIMARY KEY,
                service_key VARCHAR(100) NOT NULL,
                title VARCHAR(191) NOT NULL,
                description TEXT NULL,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                file_size INT NOT NULL DEFAULT 0,
                file_path VARCHAR(500) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(36) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_esd_skey (service_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'identity_result_documents' => 'CREATE TABLE IF NOT EXISTS identity_result_documents (
                id VARCHAR(36) PRIMARY KEY,
                domain ENUM("modification", "enrolment", "verification") NOT NULL,
                record_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                document_source ENUM("provider_base64", "provider_url", "provider_binary", "admin_uploaded") NOT NULL,
                is_provider_issued TINYINT(1) NOT NULL DEFAULT 1,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                mime_type VARCHAR(100) NOT NULL DEFAULT "application/pdf",
                file_size INT NOT NULL DEFAULT 0,
                sha256_hash VARCHAR(64) NOT NULL,
                provider_document_ref VARCHAR(150) NULL,
                provider_reference VARCHAR(150) NULL,
                tracking_id VARCHAR(150) NULL,
                uploaded_by VARCHAR(36) NULL,
                retrieval_status ENUM("ready", "pending", "failed", "unavailable") NOT NULL DEFAULT "ready",
                retrieval_error TEXT NULL,
                retrieved_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ird_domain_record (domain, record_id),
                INDEX idx_ird_user (user_id),
                INDEX idx_ird_sha256 (sha256_hash),
                INDEX idx_ird_tracking (tracking_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tableDefinitions as $name => $sql) {
            try {
                $db->execute($sql);
                $applied[] = "table:{$name}";
            } catch (Throwable $e) {
                $errors[] = "table:{$name} => " . $e->getMessage();
            }
        }

        // Column checks via INFORMATION_SCHEMA
        $columnAlterations = [
            'users' => [
                'assigned_dashboard' => 'ADD COLUMN assigned_dashboard VARCHAR(32) NULL AFTER role',
                'kyc_level' => 'ADD COLUMN kyc_level INT NOT NULL DEFAULT 1',
                'phone_normalized' => 'ADD COLUMN phone_normalized VARCHAR(32) NULL',
                'token_version' => 'ADD COLUMN token_version INT NOT NULL DEFAULT 1',
                'assigned_permissions' => 'ADD COLUMN assigned_permissions TEXT NULL',
                'referred_by_user_id' => 'ADD COLUMN referred_by_user_id VARCHAR(36) NULL',
                'referral_source' => 'ADD COLUMN referral_source VARCHAR(64) NULL',
                'referral_campaign_code' => 'ADD COLUMN referral_campaign_code VARCHAR(64) NULL',
                'referral_bound_at' => 'ADD COLUMN referral_bound_at DATETIME NULL',
                'pin_failed_attempts' => 'ADD COLUMN pin_failed_attempts INT NOT NULL DEFAULT 0',
                'pin_locked_until' => 'ADD COLUMN pin_locked_until DATETIME NULL',
                'pin_set_at' => 'ADD COLUMN pin_set_at DATETIME NULL',
                'pin_updated_by_admin_at' => 'ADD COLUMN pin_updated_by_admin_at DATETIME NULL',
                'mfa_enabled' => 'ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0',
                'mfa_method' => 'ADD COLUMN mfa_method VARCHAR(24) NOT NULL DEFAULT "email_otp"',
                'last_login_at' => 'ADD COLUMN last_login_at DATETIME NULL',
                'last_login_ip' => 'ADD COLUMN last_login_ip VARCHAR(45) NULL',
            ],
            'user_profiles' => [
                'date_of_birth' => 'ADD COLUMN date_of_birth VARCHAR(32) NULL',
                'notification_preferences' => 'ADD COLUMN notification_preferences JSON NULL',
                'security_settings' => 'ADD COLUMN security_settings JSON NULL',
                'assigned_permissions' => 'ADD COLUMN assigned_permissions JSON NULL',
            ],
            'manual_funding_requests' => [
                'payment_reference' => 'ADD COLUMN payment_reference VARCHAR(120) NULL',
                'payment_date' => 'ADD COLUMN payment_date VARCHAR(32) NULL',
                'payment_method' => 'ADD COLUMN payment_method VARCHAR(64) NOT NULL DEFAULT "Bank Transfer"',
                'remarks' => 'ADD COLUMN remarks TEXT NULL',
                'proof_filename' => 'ADD COLUMN proof_filename VARCHAR(255) NULL',
                'admin_notes' => 'ADD COLUMN admin_notes TEXT NULL',
                'reviewed_by' => 'ADD COLUMN reviewed_by VARCHAR(100) NULL',
                'reviewed_at' => 'ADD COLUMN reviewed_at DATETIME NULL',
            ],
            'kyc_submissions' => [
                'target_level' => 'ADD COLUMN target_level INT NOT NULL DEFAULT 2',
                'verification_method' => 'ADD COLUMN verification_method VARCHAR(50) DEFAULT "nin"',
                'verification_reference' => 'ADD COLUMN verification_reference VARCHAR(120) NULL',
                'full_legal_name' => 'ADD COLUMN full_legal_name VARCHAR(191) NULL',
                'date_of_birth' => 'ADD COLUMN date_of_birth VARCHAR(32) NULL',
                'phone_number' => 'ADD COLUMN phone_number VARCHAR(32) NULL',
                'email' => 'ADD COLUMN email VARCHAR(191) NULL',
                'residential_address' => 'ADD COLUMN residential_address TEXT NULL',
                'state' => 'ADD COLUMN state VARCHAR(64) NULL',
                'lga' => 'ADD COLUMN lga VARCHAR(64) NULL',
                'nin' => 'ADD COLUMN nin VARCHAR(20) NULL',
                'bvn' => 'ADD COLUMN bvn VARCHAR(20) NULL',
                'id_document_url' => 'ADD COLUMN id_document_url TEXT NULL',
                'selfie_url' => 'ADD COLUMN selfie_url TEXT NULL',
                'proof_of_address_url' => 'ADD COLUMN proof_of_address_url TEXT NULL',
                'consent_obtained' => 'ADD COLUMN consent_obtained TINYINT(1) DEFAULT 0',
                'consent_timestamp' => 'ADD COLUMN consent_timestamp DATETIME NULL',
                'automated_verification_result' => 'ADD COLUMN automated_verification_result JSON NULL',
                'rejection_reason' => 'ADD COLUMN rejection_reason TEXT NULL',
                'additional_info_requested' => 'ADD COLUMN additional_info_requested TEXT NULL',
                'reviewer_name' => 'ADD COLUMN reviewer_name VARCHAR(191) NULL',
                'review_history' => 'ADD COLUMN review_history JSON NULL',
                'submitted_at' => 'ADD COLUMN submitted_at DATETIME NULL',
                'doc_url' => 'ADD COLUMN doc_url TEXT NULL',
                'review_notes' => 'ADD COLUMN review_notes TEXT NULL',
                'reviewed_by' => 'ADD COLUMN reviewed_by VARCHAR(100) NULL',
                'reviewed_at' => 'ADD COLUMN reviewed_at DATETIME NULL',
            ],
            'service_security_rules' => [
                'service_name' => 'ADD COLUMN service_name VARCHAR(191) NULL',
                'requires_pin' => 'ADD COLUMN requires_pin TINYINT(1) NULL',
                'min_kyc_level' => 'ADD COLUMN min_kyc_level INT NULL',
                'daily_limit' => 'ADD COLUMN daily_limit DECIMAL(16, 2) NULL',
                'description' => 'ADD COLUMN description TEXT NULL',
                'updated_by' => 'ADD COLUMN updated_by VARCHAR(191) NULL',
                'updated_at' => 'ADD COLUMN updated_at DATETIME NULL',
            ],
            'support_tickets' => [
                'ticket_number' => 'ADD COLUMN ticket_number VARCHAR(64) NULL',
                'category' => 'ADD COLUMN category VARCHAR(64) NULL',
                'assigned_to' => 'ADD COLUMN assigned_to VARCHAR(100) NULL',
                'order_id' => 'ADD COLUMN order_id VARCHAR(64) NULL',
                'description' => 'ADD COLUMN description TEXT NULL',
            ],
            'support_replies' => [
                'is_internal_note' => 'ADD COLUMN is_internal_note TINYINT(1) NOT NULL DEFAULT 0',
            ],
            'telecom_plans' => [
                'updated_at' => 'ADD COLUMN updated_at DATETIME NULL',
            ],
            'website_branding' => [
                'short_brand_name' => 'ADD COLUMN short_brand_name VARCHAR(100) NULL DEFAULT "HAMBAKTECH"',
                'business_reg_number' => 'ADD COLUMN business_reg_number VARCHAR(100) NULL DEFAULT "BN 9284726"',
                'founded_year' => 'ADD COLUMN founded_year VARCHAR(20) NULL DEFAULT "2024"',
                'business_phone' => 'ADD COLUMN business_phone VARCHAR(50) NULL DEFAULT "08147837664"',
                'info_email' => 'ADD COLUMN info_email VARCHAR(191) NULL DEFAULT "info@hambaktech.com.ng"',
            ],
            'academy_courses' => [
                'category' => 'ADD COLUMN category VARCHAR(100) NULL DEFAULT "Digital Skills"',
                'curriculum_outline' => 'ADD COLUMN curriculum_outline TEXT NULL',
                'is_available' => 'ADD COLUMN is_available TINYINT(1) NOT NULL DEFAULT 1',
                'admission_start_date' => 'ADD COLUMN admission_start_date DATE NULL',
                'admission_end_date' => 'ADD COLUMN admission_end_date DATE NULL',
                'display_order' => 'ADD COLUMN display_order INT NOT NULL DEFAULT 1',
            ],
            'announcements' => [
                'target_audience' => 'ADD COLUMN target_audience VARCHAR(64) NOT NULL DEFAULT "all_customers"',
                'target_user_id' => 'ADD COLUMN target_user_id VARCHAR(36) NULL',
            ],
            'slip_templates' => [
                'slip_code' => 'ADD COLUMN slip_code VARCHAR(64) NULL',
                'price' => 'ADD COLUMN price DECIMAL(15, 2) NULL',
                'is_recommended' => 'ADD COLUMN is_recommended TINYINT(1) NOT NULL DEFAULT 0',
                'watermark_text' => 'ADD COLUMN watermark_text VARCHAR(100) DEFAULT "SAMPLE SPECIMEN"',
            ],
            'verification_records' => [
                'idempotency_key' => 'ADD COLUMN idempotency_key VARCHAR(120) NULL',
            ],
            'service_catalogue' => [
                'processing_type' => 'ADD COLUMN processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant"',
                'manual_label' => 'ADD COLUMN manual_label VARCHAR(80) NULL DEFAULT "Manual Processing"',
                'estimated_turnaround' => 'ADD COLUMN estimated_turnaround VARCHAR(150) NULL',
                'required_documents' => 'ADD COLUMN required_documents JSON NULL',
                'form_schema' => 'ADD COLUMN form_schema JSON NULL',
                'supported_notes' => 'ADD COLUMN supported_notes TEXT NULL',
            ],
            'modification_requests' => [
                'enrollment_type' => 'ADD COLUMN enrollment_type VARCHAR(150) NULL',
                'profit' => 'ADD COLUMN profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00',
                'endpoint' => 'ADD COLUMN endpoint VARCHAR(150) NOT NULL DEFAULT ""',
                'refund_reference' => 'ADD COLUMN refund_reference VARCHAR(120) NULL',
                'provider_response' => 'ADD COLUMN provider_response JSON NULL',
                'result_document_id' => 'ADD COLUMN result_document_id VARCHAR(36) NULL',
                'result_source' => 'ADD COLUMN result_source VARCHAR(32) NULL',
                'provider_tracking_id' => 'ADD COLUMN provider_tracking_id VARCHAR(150) NULL',
                'result_payload' => 'ADD COLUMN result_payload JSON NULL',
                'result_retrieval_status' => 'ADD COLUMN result_retrieval_status VARCHAR(32) NULL',
                'result_retrieval_error' => 'ADD COLUMN result_retrieval_error TEXT NULL',
                'result_retrieved_at' => 'ADD COLUMN result_retrieved_at DATETIME NULL',
                'additional_info_history' => 'ADD COLUMN additional_info_history JSON NULL',
                'reviewed_by' => 'ADD COLUMN reviewed_by VARCHAR(100) NULL',
                'reviewed_at' => 'ADD COLUMN reviewed_at DATETIME NULL',
                'estimated_completion_text' => 'ADD COLUMN estimated_completion_text VARCHAR(150) NULL',
            ],
            'enrolment_orders' => [
                'result_document_id' => 'ADD COLUMN result_document_id VARCHAR(36) NULL',
                'result_source' => 'ADD COLUMN result_source VARCHAR(32) NULL',
                'provider_tracking_id' => 'ADD COLUMN provider_tracking_id VARCHAR(150) NULL',
                'result_payload' => 'ADD COLUMN result_payload JSON NULL',
                'result_retrieval_status' => 'ADD COLUMN result_retrieval_status VARCHAR(32) NULL',
                'result_retrieval_error' => 'ADD COLUMN result_retrieval_error TEXT NULL',
                'result_retrieved_at' => 'ADD COLUMN result_retrieved_at DATETIME NULL',
            ],
            'customer_virtual_accounts' => [
                'paystack_customer_code' => 'ADD COLUMN paystack_customer_code VARCHAR(100) NULL AFTER provider',
                'dedicated_account_id' => 'ADD COLUMN dedicated_account_id BIGINT NULL AFTER paystack_customer_code',
                'bank_id' => 'ADD COLUMN bank_id INT NULL AFTER bank_name',
                'bank_slug' => 'ADD COLUMN bank_slug VARCHAR(80) NULL AFTER bank_id',
                'account_name' => 'ADD COLUMN account_name VARCHAR(191) NULL AFTER account_number',
                'currency' => 'ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT "NGN" AFTER bank_slug',
                'kyc_validation_status' => 'ADD COLUMN kyc_validation_status ENUM("unverified", "pending", "verified", "failed") NOT NULL DEFAULT "unverified" AFTER account_status',
                'assignment_status' => 'ADD COLUMN assignment_status ENUM("not_requested", "pending", "assigned", "failed", "deactivated") NOT NULL DEFAULT "not_requested" AFTER kyc_validation_status',
                'failure_reason' => 'ADD COLUMN failure_reason TEXT NULL AFTER assignment_status',
                'total_inflow' => 'ADD COLUMN total_inflow DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER failure_reason',
                'last_funding_at' => 'ADD COLUMN last_funding_at DATETIME NULL AFTER total_inflow',
                'raw_assignment_payload' => 'ADD COLUMN raw_assignment_payload JSON NULL AFTER last_funding_at',
                'updated_at' => 'ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
            ],
        ];

        foreach ($columnAlterations as $table => $cols) {
            foreach ($cols as $col => $alterClause) {
                try {
                    $exists = $db->fetchOne(
                        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tbl AND COLUMN_NAME = :col',
                        ['tbl' => $table, 'col' => $col]
                    );
                    if (!$exists) {
                        $db->execute("ALTER TABLE `{$table}` {$alterClause}");
                        $applied[] = "col:{$table}.{$col}";
                    }
                } catch (Throwable $e) {
                    $errors[] = "col:{$table}.{$col} => " . $e->getMessage();
                }
            }
        }

        // Enum updates
        $enumUpdates = [
            'users.role' => 'ALTER TABLE users MODIFY COLUMN role VARCHAR(32) NOT NULL DEFAULT "customer"',
            'kyc_submissions.status' => 'ALTER TABLE kyc_submissions MODIFY COLUMN status ENUM("pending", "verified", "approved", "rejected", "info_requested") NOT NULL DEFAULT "pending"',
            'support_tickets.status' => 'ALTER TABLE support_tickets MODIFY COLUMN status ENUM("open", "pending", "in_progress", "waiting_customer", "resolved", "closed") NOT NULL DEFAULT "open"',
            'providers.last_ping_status' => 'ALTER TABLE providers MODIFY COLUMN last_ping_status ENUM("operational", "error", "untested", "unconfigured") NOT NULL DEFAULT "untested"',
            'academy_courses.price' => 'ALTER TABLE academy_courses MODIFY COLUMN price DECIMAL(15, 2) NULL DEFAULT NULL',
            'notifications.type' => 'ALTER TABLE notifications MODIFY COLUMN type ENUM("info", "success", "warning", "alert", "security") NOT NULL DEFAULT "info"',
        ];
        foreach ($enumUpdates as $key => $sql) {
            try {
                $db->execute($sql);
                $applied[] = "enum:{$key}";
            } catch (Throwable $e) {
                $errors[] = "enum:{$key} => " . $e->getMessage();
            }
        }

        // Backfill users.kyc_level from tier where needed
        try {
            $db->execute('UPDATE users SET kyc_level = tier WHERE kyc_level = 1 AND tier > 1');
        } catch (Throwable $e) {
            $errors[] = 'backfill:kyc_level => ' . $e->getMessage();
        }

        // Ensure standard providers exist in providers table (without writing fake keys)
        $twoSureUrl = rtrim((string)preg_replace('#/api/v1/?$#i', '', (string)(getenv('TWOSUREVERIFY_BASE_URL') ?: 'https://2sureverify.com')), '/');
        $providers = [
            ['2sureverify', '2SureVerify Identity API', 'identity', $twoSureUrl ?: 'https://2sureverify.com', 1, 1],
            ['veripine', 'Veripine Identity API', 'identity', getenv('VERIPINE_BASE_URL') ?: 'https://veripine.com/api', 1, 0],
            ['ulamadata', 'UlamaData VTU Gateway', 'telecom', getenv('ULAMADATA_BASE_URL') ?: 'https://www.ulamadata.ng', 1, 1],
            ['vtpass', 'VTpass Enterprise VTU', 'telecom', getenv('VTPASS_API_BASE_URL') ?: (getenv('VTPASS_BASE_URL') ?: ((getenv('VTPASS_ENV') === 'sandbox') ? 'https://sandbox.vtpass.com/api' : 'https://api-service.vtpass.com/api')), 1, 0],
            ['paystack', 'Paystack Checkout', 'payment', 'https://api.paystack.co', 1, 1],
            ['flutterwave', 'Flutterwave Gateway', 'payment', 'https://api.flutterwave.com/v3', 1, 0],
        ];
        foreach ($providers as $p) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO providers (id, name, provider_type, base_url, is_active, is_default, timeout_seconds, last_ping_status)
                     VALUES (?, ?, ?, ?, ?, ?, 30, "untested")',
                    $p
                );
            } catch (Throwable $e) {
                $errors[] = "provider:{$p[0]} => " . $e->getMessage();
            }
        }

        // Seed core roles, categories, verification catalogue, utilities, and baseline settings if missing (idempotent)
        try {
            $db->execute(
                'INSERT IGNORE INTO roles (id, name, slug, description) VALUES
                 ("rol_superadmin", "Super Administrator", "superadmin", "Global system authority with unrestricted access"),
                 ("rol_admin", "Administrator", "admin", "Management authority over services, customers, and transactions"),
                 ("rol_manager", "Operations Manager", "manager", "Operations management console across customers, wallets, KYC, and reports"),
                 ("rol_staff", "Internal Staff", "staff", "Operational staff console access with scoped permissions"),
                 ("rol_support", "Support Specialist", "support", "Customer Support Centre and KYC desk specialist"),
                 ("rol_agent", "Commercial Agent / Reseller", "agent", "High-volume VTU, identity, and reseller portal workspace"),
                 ("rol_student", "Academy Student", "student", "HAMBAKTECH Digital Training Academy student portal workspace"),
                 ("rol_customer", "Customer", "customer", "Standard portal customer with digital wallet and identity access")'
            );
            $db->execute(
                'INSERT IGNORE INTO service_categories (id, code, name, icon, display_order, is_active) VALUES
                 ("cat_nin", "nin_verification", "NIN Verification", "ShieldCheck", 1, 1),
                 ("cat_bvn", "bvn_verification", "BVN Verification", "CreditCard", 2, 1),
                 ("cat_mod", "nin_modification", "NIN Modification", "Edit3", 3, 1),
                 ("cat_bvn_mod", "bvn_modification", "BVN Modification", "UserCog", 4, 1),
                 ("cat_prs", "personalisation", "Personalisation", "UserCheck", 5, 1),
                 ("cat_enr", "enrolment", "Enrolment", "FilePlus", 6, 1),
                 ("cat_add", "additional_services", "Additional Services", "Layers", 7, 1)'
            );
            $db->execute(
                'INSERT IGNORE INTO service_catalogue (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active) VALUES
                 ("srv_nin_v1", "cat_nin", "nin_v1", "NIN Verification (V1 Standard)", "Direct NIMC lookup with slip style selection (ninBasic, ninStandard, ninPremium, ninVnin, ninSpecial).", "2sureverify", "/api/v1/nin_v1.php", 85.00, 200.00, "[\"nin\", \"slip_type\"]", 1, 1),
                 ("srv_nin_v2", "cat_nin", "nin_v2", "NIN Verification (V2 Multi-Tier)", "Multi-tier NIN verification with tier selection (basic, standard, premium, regular, vnin, vip).", "2sureverify", "/api/v1/nin_v2.php", 95.00, 220.00, "[\"nin\", \"tier\"]", 0, 1),
                 ("srv_nin_v3", "cat_nin", "nin_v3", "NIN Verification (V3 5-Version Selector)", "5 independent upstream verification versions with custom slip styling.", "2sureverify", "/api/v1/nin_v3.php", 97.00, 250.00, "[\"nin\", \"tier\", \"slip_type\"]", 1, 1),
                 ("srv_phone_v1", "cat_nin", "phone_v1", "Phone Verification (V1)", "Locate linked NIN record using registered Nigerian SIM card.", "2sureverify", "/api/v1/phone_v1.php", 85.00, 200.00, "[\"phone\", \"slip_type\"]", 1, 1),
                 ("srv_phone_v2", "cat_nin", "phone_v2", "Phone Verification (V2 Multi-Tier)", "Phone to NIN matching across basic, standard, premium and VIP tiers.", "2sureverify", "/api/v1/phone_v2.php", 95.00, 220.00, "[\"phone\", \"tier\"]", 0, 1),
                 ("srv_phone_v3", "cat_nin", "phone_v3", "Phone Verification (V3 5-Version)", "5-version phone to NIN resolution with slip generation.", "2sureverify", "/api/v1/phone_v3.php", 102.00, 250.00, "[\"phone\", \"tier\", \"slip_type\"]", 1, 1),
                 ("srv_demo_v1", "cat_nin", "demo_v1", "Demographic Verification (V1)", "Search and confirm NIN matching name, birth date, and gender.", "2sureverify", "/api/v1/demo_v1.php", 90.00, 200.00, "[\"firstname\", \"lastname\", \"dob\", \"gender\", \"slip_type\"]", 1, 1),
                 ("srv_demo_v2", "cat_nin", "demo_v2", "Demographic Verification (V2)", "Multi-tier demographic match search.", "2sureverify", "/api/v1/demo_v2.php", 95.00, 220.00, "[\"firstname\", \"lastname\", \"dob\", \"gender\", \"tier\"]", 0, 1),
                 ("srv_demo_v3", "cat_nin", "demo_v3", "Demographic Verification (V3)", "Extended demographic matching with slip generation.", "2sureverify", "/api/v1/demo_v3.php", 97.00, 250.00, "[\"firstname\", \"lastname\", \"dob\", \"gender\", \"tier\", \"slip_type\"]", 1, 1),
                 ("srv_vnin", "cat_nin", "vnin_verification", "Virtual NIN (VNIN) Verification", "Verify enterprise 16-character virtual NIN or generate verifiable record.", "2sureverify", "/api/v1/nin_v2.php", 95.00, 200.00, "[\"nin\"]", 0, 1),
                 ("srv_bvn_v1", "cat_bvn", "bvn_v1", "BVN Verification (V1 Standard)", "Bank Verification Number validation with slip choice (bvnBasic, bvnAdvanced, plasticBvn).", "2sureverify", "/api/v1/bvn_v1.php", 85.00, 250.00, "[\"bvn\", \"slip_type\"]", 1, 1),
                 ("srv_bvn_v2", "cat_bvn", "bvn_v2", "BVN Verification (V2)", "Standard Central Bank of Nigeria BVN biometric record check.", "2sureverify", "/api/v1/bvn_v2.php", 85.00, 250.00, "[\"bvn\"]", 0, 1),
                 ("srv_bvn_v3", "cat_bvn", "bvn_v3", "BVN Verification (V3 Multi-Version)", "5-version BVN biometric query with document printing.", "2sureverify", "/api/v1/bvn_v3.php", 85.00, 250.00, "[\"bvn\", \"tier\", \"slip_type\"]", 1, 1),
                 ("srv_bvn_ret", "cat_bvn", "bvn_retrieval", "BVN Retrieval by Phone", "Retrieve 11-digit BVN using phone number and registered names.", "2sureverify", "/api/v1/bvn_retrieval.php", 700.00, 1200.00, "[\"first_name\", \"last_name\", \"phone\", \"slip_type\"]", 1, 1)'
            );
            $planCount = (int)($db->fetchOne('SELECT COUNT(*) as cnt FROM telecom_plans')['cnt'] ?? 0);
            if ($planCount === 0) {
                $db->execute(
                    'INSERT IGNORE INTO telecom_plans (id, provider_plan_id, network, name, size, plan_type, validity, wholesale_cost, price, is_active, provider_id) VALUES
                     ("plan_mtn_500mb", "101", "MTN", "MTN SME 500MB", "500MB", "SME", "30 Days", 135.00, 160.00, 1, "ulamadata"),
                     ("plan_mtn_1gb", "102", "MTN", "MTN SME 1GB", "1GB", "SME", "30 Days", 270.00, 310.00, 1, "ulamadata"),
                     ("plan_mtn_2gb", "103", "MTN", "MTN SME 2GB", "2GB", "SME", "30 Days", 540.00, 620.00, 1, "ulamadata"),
                     ("plan_mtn_3gb", "104", "MTN", "MTN SME 3GB", "3GB", "SME", "30 Days", 810.00, 930.00, 1, "ulamadata"),
                     ("plan_mtn_5gb", "105", "MTN", "MTN SME 5GB", "5GB", "SME", "30 Days", 1350.00, 1550.00, 1, "ulamadata"),
                     ("plan_mtn_10gb", "106", "MTN", "MTN SME 10GB", "10GB", "SME", "30 Days", 2700.00, 3100.00, 1, "ulamadata"),
                     ("plan_air_1gb", "201", "AIRTEL", "Airtel Corporate 1GB", "1GB", "Corporate", "30 Days", 290.00, 340.00, 1, "ulamadata"),
                     ("plan_air_2gb", "202", "AIRTEL", "Airtel Corporate 2GB", "2GB", "Corporate", "30 Days", 580.00, 680.00, 1, "ulamadata"),
                     ("plan_air_5gb", "203", "AIRTEL", "Airtel Corporate 5GB", "5GB", "Corporate", "30 Days", 1450.00, 1700.00, 1, "ulamadata"),
                     ("plan_glo_1gb", "301", "GLO", "Glo Corporate 1GB", "1GB", "Corporate", "30 Days", 260.00, 300.00, 1, "ulamadata"),
                     ("plan_glo_2gb", "302", "GLO", "Glo Corporate 2GB", "2GB", "Corporate", "30 Days", 520.00, 600.00, 1, "ulamadata"),
                     ("plan_glo_5gb", "303", "GLO", "Glo Corporate 5GB", "5GB", "Corporate", "30 Days", 1300.00, 1500.00, 1, "ulamadata"),
                     ("plan_9mob_1gb", "401", "9MOBILE", "9mobile SME 1GB", "1GB", "SME", "30 Days", 250.00, 290.00, 1, "ulamadata"),
                     ("plan_9mob_2gb", "402", "9MOBILE", "9mobile SME 2GB", "2GB", "SME", "30 Days", 500.00, 580.00, 1, "ulamadata")'
                );
            }
            $db->execute(
                'INSERT IGNORE INTO electricity_discos (id, name, code, minimum_amount, is_active) VALUES
                 ("disc_ikj", "Ikeja Electric (IKEDC)", "ikeja-electric", 500.00, 1),
                 ("disc_ekd", "Eko Electric (EKEDC)", "eko-electric", 500.00, 1),
                 ("disc_abj", "Abuja Electric (AEDC)", "abuja-electric", 500.00, 1),
                 ("disc_kan", "Kano Electric (KEDCO)", "kano-electric", 500.00, 1),
                 ("disc_por", "Port Harcourt Electric (PHED)", "portharcourt-electric", 500.00, 1),
                 ("disc_iba", "Ibadan Electric (IBEDC)", "ibadan-electric", 500.00, 1)'
            );
            $db->execute(
                'INSERT IGNORE INTO cable_packages (id, provider, name, code, channels, wholesale_cost, price, is_active) VALUES
                 ("cab_dstv_jin", "dstv", "DStv Yanga", "dstv-yanga", 85, 4100.00, 4200.00, 1),
                 ("cab_dstv_cnf", "dstv", "DStv Confam", "dstv-confam", 105, 7300.00, 7400.00, 1),
                 ("cab_dstv_cpt", "dstv", "DStv Compact", "dstv-compact", 130, 12400.00, 12500.00, 1),
                 ("cab_gotv_sml", "gotv", "GOtv Smallie", "gotv-smallie", 35, 1200.00, 1300.00, 1),
                 ("cab_gotv_jin", "gotv", "GOtv Jinja", "gotv-jinja", 45, 2600.00, 2700.00, 1),
                 ("cab_gotv_jli", "gotv", "GOtv Jolli", "gotv-jolli", 65, 3850.00, 3950.00, 1),
                 ("cab_gotv_max", "gotv", "GOtv Max", "gotv-max", 75, 5600.00, 5700.00, 1),
                 ("cab_star_nov", "startimes", "StarTimes Nova", "startimes-nova", 40, 1400.00, 1500.00, 1),
                 ("cab_star_bas", "startimes", "StarTimes Basic", "startimes-basic", 60, 2500.00, 2600.00, 1),
                 ("cab_star_cls", "startimes", "StarTimes Classic", "startimes-classic", 80, 3700.00, 3800.00, 1)'
            );
            $db->execute(
                'INSERT IGNORE INTO exam_packages (id, exam_name, name, description, wholesale_cost, price, is_active) VALUES
                 ("exm_waec", "WAEC", "WAEC Result Checker PIN", "Direct e-PIN scratch card for checking WASSCE results.", 3300.00, 3600.00, 1),
                 ("exm_neco", "NECO", "NECO Result Checker Token", "Official NECO token for SSCE results validation.", 1150.00, 1300.00, 1),
                 ("exm_jamb", "JAMB", "JAMB UTME Registration Profile Code", "E-facility profile code and exam registration PIN.", 4500.00, 4800.00, 1),
                 ("exm_nabteb", "NABTEB", "NABTEB Result Checker Card", "Official NABTEB National Technical Certificate PIN.", 1350.00, 1500.00, 1)'
            );
            $db->execute(
                'INSERT IGNORE INTO airtime_swap_configs (id, network, conversion_rate_percent, merchant_phone, ussd_code, is_active) VALUES
                 ("swp_mtn", "MTN", 82.00, "+2348147837664", "*600*08147837664*AMOUNT*PIN#", 1),
                 ("swp_airtel", "AIRTEL", 80.00, "+2348147837664", "*432*1*08147837664*AMOUNT*PIN#", 1),
                 ("swp_glo", "GLO", 75.00, "+2348147837664", "*131*08147837664*AMOUNT*PIN#", 1),
                 ("swp_9mobile", "9MOBILE", 75.00, "+2348147837664", "*223*PIN*AMOUNT*08147837664#", 1)'
            );
            $db->execute(
                'INSERT IGNORE INTO system_settings (id, setting_key, setting_value, category, description) VALUES
                 ("set_bank_name", "bank_transfer_bank", "Moniepoint MFB", "payment", "Official receiving bank name for customer manual funding"),
                 ("set_bank_acc", "bank_transfer_account_number", "5210741634", "payment", "Official Moniepoint account number for bank transfer deposits"),
                 ("set_bank_title", "bank_transfer_account_name", "HAMBAKTECH_SERVICES", "payment", "Official beneficiary account name for bank transfer deposits"),
                 ("set_active_gateway", "active_payment_gateway", "paystack", "payment", "Active default online payment gateway"),
                 ("set_act_verif", "active_verification_provider", "2sureverify", "providers", "Active Primary Identity Verification Provider"),
                 ("set_bvn_primary", "bvn_primary_provider", "2sureverify", "providers", "Primary BVN Verification Provider"),
                 ("set_bvn_fallback", "bvn_fallback_provider", "veripine", "providers", "Fallback BVN Verification Provider"),
                 ("set_bvn_auto_fb", "bvn_auto_fallback", "1", "providers", "Enable Automatic BVN Provider Failover"),
                 ("set_id_auto_fb", "identity_auto_fallback", "1", "providers", "Enable Automatic Identity Provider Failover"),
                 ("set_act_tel", "active_telecom_provider", "ulamadata", "providers", "Active Telecom VTU Provider")'
            );
            $db->execute(
                'INSERT IGNORE INTO slip_templates (id, slip_code, name, category, price, demo_image_url, description, supported_service, is_active, display_order, is_recommended, badge, watermark_text)
                 VALUES ("tpl_nin_special", "ninSpecial", "Special Slip", "NIN", 550.00, "/assets/aistudio/IMG_0603_1ff5c6a0.jpeg", "Official Special NIN Slip PDF issued via 2SureVerify.", "all_nin", 1, 6, 0, "Special Slip", "DEMO SPECIMEN - SAMPLE PREVIEW ONLY")'
            );
        } catch (Throwable $e) {
            $errors[] = 'seed_defaults => ' . $e->getMessage();
        }


        // Ensure Stage 3 modification categories and catalog metadata exist
        try {
            $modSync = self::syncModificationCatalog($db);
            $applied = array_merge($applied, $modSync['applied'] ?? []);
            $errors = array_merge($errors, $modSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncModificationCatalog => ' . $e->getMessage();
        }

        // Ensure Stage 4 enrolment tables and verified NIN Enrolment services exist
        try {
            $enrSync = self::syncEnrolmentCatalog($db);
            $applied = array_merge($applied, $enrSync['applied'] ?? []);
            $errors = array_merge($errors, $enrSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncEnrolmentCatalog => ' . $e->getMessage();
        }

        // Ensure Stage 5 Referral, Rewards, Compulsory PIN & Session/MFA Security tables exist
        try {
            $secRefSync = self::syncSecurityAndReferralSchema($db, true);
            $applied = array_merge($applied, $secRefSync['applied'] ?? []);
            $errors = array_merge($errors, $secRefSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncSecurityAndReferralSchema => ' . $e->getMessage();
        }

        // Ensure Phase 2 Printing & Document Services tables and default catalog exist (idempotent)
        try {
            $printSync = self::syncPrintingModuleSchema($db, true);
            $applied = array_merge($applied, $printSync['applied'] ?? []);
            $errors = array_merge($errors, $printSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncPrintingModuleSchema => ' . $e->getMessage();
        }

        return [
            'applied_count' => count($applied),
            'applied' => $applied,
            'errors' => $errors,
        ];
    }

    public static function syncPaystackDvaSchema(Database $db, bool $force = false): void
    {
        static $synced = false;
        if ($synced && !$force) {
            return;
        }
        $synced = true;

        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS paystack_dva_settlements (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NULL,
                    virtual_account_id VARCHAR(36) NULL,
                    paystack_reference VARCHAR(120) NOT NULL UNIQUE,
                    paystack_transaction_id BIGINT NULL,
                    dedicated_account_id BIGINT NULL,
                    account_number VARCHAR(30) NOT NULL,
                    paystack_customer_code VARCHAR(100) NULL,
                    gross_amount DECIMAL(15, 2) NOT NULL,
                    paystack_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    merchant_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    net_credit_amount DECIMAL(15, 2) NOT NULL,
                    net_settlement_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    fee_bearer ENUM("customer", "merchant") NOT NULL DEFAULT "customer",
                    fee_confirmed TINYINT(1) NOT NULL DEFAULT 0,
                    currency VARCHAR(10) NOT NULL DEFAULT "NGN",
                    sender_bank VARCHAR(120) NULL,
                    sender_account_name VARCHAR(191) NULL,
                    sender_account_number_masked VARCHAR(40) NULL,
                    session_id VARCHAR(120) NULL,
                    settlement_status ENUM("settled", "under_review", "failed", "disputed", "reversed") NOT NULL DEFAULT "settled",
                    quarantine_reason VARCHAR(120) NULL,
                    wallet_transaction_id VARCHAR(36) NULL,
                    reversal_transaction_id VARCHAR(36) NULL,
                    reversal_reference VARCHAR(120) NULL,
                    reversal_reason VARCHAR(255) NULL,
                    dispute_status VARCHAR(60) NULL,
                    dispute_reference VARCHAR(120) NULL,
                    settled_at DATETIME NULL,
                    reversed_at DATETIME NULL,
                    resolved_by VARCHAR(36) NULL,
                    resolved_at DATETIME NULL,
                    raw_payload JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_dva_settle_user (user_id, created_at),
                    INDEX idx_dva_settle_acc (account_number),
                    INDEX idx_dva_settle_status (settlement_status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            try {
                $statusCol = $db->fetchOne(
                    'SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "paystack_dva_settlements" AND COLUMN_NAME = "settlement_status"'
                );
                if ($statusCol && !str_contains((string)($statusCol['COLUMN_TYPE'] ?? ''), 'reversed')) {
                    $db->execute(
                        'ALTER TABLE `paystack_dva_settlements` MODIFY COLUMN settlement_status ENUM("settled", "under_review", "failed", "disputed", "reversed") NOT NULL DEFAULT "settled"'
                    );
                }
            } catch (Throwable) {
            }

            $settleCols = [
                'customer_borne_fee' => 'ADD COLUMN customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER paystack_fee',
                'merchant_borne_fee' => 'ADD COLUMN merchant_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER customer_borne_fee',
                'net_settlement_amount' => 'ADD COLUMN net_settlement_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER net_credit_amount',
                'fee_confirmed' => 'ADD COLUMN fee_confirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER fee_bearer',
                'quarantine_reason' => 'ADD COLUMN quarantine_reason VARCHAR(120) NULL AFTER settlement_status',
                'reversal_transaction_id' => 'ADD COLUMN reversal_transaction_id VARCHAR(36) NULL AFTER wallet_transaction_id',
                'reversal_reference' => 'ADD COLUMN reversal_reference VARCHAR(120) NULL AFTER reversal_transaction_id',
                'reversal_reason' => 'ADD COLUMN reversal_reason VARCHAR(255) NULL AFTER reversal_reference',
                'dispute_status' => 'ADD COLUMN dispute_status VARCHAR(60) NULL AFTER reversal_reason',
                'dispute_reference' => 'ADD COLUMN dispute_reference VARCHAR(120) NULL AFTER dispute_status',
                'settled_at' => 'ADD COLUMN settled_at DATETIME NULL AFTER dispute_reference',
                'reversed_at' => 'ADD COLUMN reversed_at DATETIME NULL AFTER settled_at',
                'resolved_by' => 'ADD COLUMN resolved_by VARCHAR(36) NULL AFTER reversed_at',
                'resolved_at' => 'ADD COLUMN resolved_at DATETIME NULL AFTER resolved_by',
                'updated_at' => 'ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
            ];
            foreach ($settleCols as $col => $alterClause) {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "paystack_dva_settlements" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE `paystack_dva_settlements` {$alterClause}");
                }
            }
            try {
                $db->execute(
                    'UPDATE paystack_dva_settlements
                        SET fee_confirmed = CASE WHEN settlement_status = "settled" THEN 1 ELSE fee_confirmed END,
                            customer_borne_fee = CASE WHEN fee_bearer = "customer" AND customer_borne_fee = 0 AND paystack_fee > 0 THEN paystack_fee ELSE customer_borne_fee END,
                            merchant_borne_fee = CASE WHEN fee_bearer = "merchant" AND merchant_borne_fee = 0 AND paystack_fee > 0 THEN paystack_fee ELSE merchant_borne_fee END,
                            net_settlement_amount = CASE WHEN net_settlement_amount = 0 AND gross_amount > 0 THEN GREATEST(0.00, gross_amount - paystack_fee) ELSE net_settlement_amount END,
                            settled_at = CASE WHEN settlement_status = "settled" AND settled_at IS NULL THEN created_at ELSE settled_at END'
                );
            } catch (Throwable) {
            }

            $vaCols = [
                'paystack_customer_code' => 'ADD COLUMN paystack_customer_code VARCHAR(100) NULL AFTER provider',
                'dedicated_account_id' => 'ADD COLUMN dedicated_account_id BIGINT NULL AFTER paystack_customer_code',
                'bank_id' => 'ADD COLUMN bank_id INT NULL AFTER bank_name',
                'bank_slug' => 'ADD COLUMN bank_slug VARCHAR(80) NULL AFTER bank_id',
                'bank_code' => 'ADD COLUMN bank_code VARCHAR(50) NULL AFTER bank_slug',
                'account_name' => 'ADD COLUMN account_name VARCHAR(191) NULL AFTER account_number',
                'currency' => 'ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT "NGN" AFTER bank_code',
                'kyc_validation_status' => 'ADD COLUMN kyc_validation_status ENUM("unverified", "pending", "verified", "failed") NOT NULL DEFAULT "unverified" AFTER account_status',
                'dva_consent' => 'ADD COLUMN dva_consent TINYINT(1) NOT NULL DEFAULT 0 AFTER kyc_validation_status',
                'dva_consent_at' => 'ADD COLUMN dva_consent_at DATETIME NULL AFTER dva_consent',
                'assignment_status' => 'ADD COLUMN assignment_status ENUM("not_requested", "pending", "assigned", "failed", "deactivated") NOT NULL DEFAULT "not_requested" AFTER dva_consent_at',
                'provisioning_status' => 'ADD COLUMN provisioning_status ENUM("not_requested", "awaiting_customer_info", "pending_identification", "processing", "active", "failed", "suspended", "deactivated", "under_review") NOT NULL DEFAULT "not_requested" AFTER assignment_status',
                'failure_reason' => 'ADD COLUMN failure_reason TEXT NULL AFTER provisioning_status',
                'error_code' => 'ADD COLUMN error_code VARCHAR(80) NULL AFTER failure_reason',
                'total_inflow' => 'ADD COLUMN total_inflow DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER error_code',
                'assigned_at' => 'ADD COLUMN assigned_at DATETIME NULL AFTER total_inflow',
                'last_synced_at' => 'ADD COLUMN last_synced_at DATETIME NULL AFTER assigned_at',
                'last_funding_at' => 'ADD COLUMN last_funding_at DATETIME NULL AFTER last_synced_at',
                'raw_assignment_payload' => 'ADD COLUMN raw_assignment_payload JSON NULL AFTER last_funding_at',
                'updated_at' => 'ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
            ];

            foreach ($vaCols as $col => $alterClause) {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "customer_virtual_accounts" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE `customer_virtual_accounts` {$alterClause}");
                }
            }

            // Backfill canonical provisioning_status from existing Phase 1 assignment_status rows safely
            try {
                $db->execute(
                    'UPDATE customer_virtual_accounts
                        SET provisioning_status = CASE
                                WHEN provider = "paystack" AND assignment_status = "assigned" AND account_status = "active" AND account_number != "" THEN "active"
                                WHEN assignment_status = "pending" THEN "processing"
                                WHEN assignment_status = "failed" THEN "failed"
                                WHEN assignment_status = "deactivated" THEN "deactivated"
                                ELSE provisioning_status
                            END,
                            assigned_at = CASE
                                WHEN assigned_at IS NULL AND assignment_status = "assigned" AND account_status = "active" AND account_number != "" THEN COALESCE(updated_at, created_at)
                                ELSE assigned_at
                            END,
                            bank_code = COALESCE(NULLIF(bank_code, ""), bank_slug)
                      WHERE provisioning_status = "not_requested"'
                );
            } catch (Throwable) {
            }

            // Ensure user_profiles stores DVA consent & optional bank code cleanly
            $upCols = [
                'dva_consent' => 'ADD COLUMN dva_consent TINYINT(1) NOT NULL DEFAULT 0',
                'dva_consent_at' => 'ADD COLUMN dva_consent_at DATETIME NULL',
                'dva_bank_code' => 'ADD COLUMN dva_bank_code VARCHAR(30) NULL',
                'dva_bank_account_last4' => 'ADD COLUMN dva_bank_account_last4 VARCHAR(10) NULL',
            ];
            foreach ($upCols as $col => $alterClause) {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "user_profiles" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE `user_profiles` {$alterClause}");
                }
            }
        } catch (Throwable) {
        }
    }

    public static function syncModificationCatalog(Database $db, bool $force = false): array
    {
        static $synced = false;
        if ($synced && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $synced = true;

        $applied = [];
        $errors = [];

        // 1. Ensure Stage 3 service_catalogue metadata columns exist even outside full sync()
        $catCols = [
            'processing_type' => 'ADD COLUMN processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant"',
            'manual_label' => 'ADD COLUMN manual_label VARCHAR(80) NULL DEFAULT "Manual Processing"',
            'estimated_turnaround' => 'ADD COLUMN estimated_turnaround VARCHAR(150) NULL',
            'required_documents' => 'ADD COLUMN required_documents JSON NULL',
            'form_schema' => 'ADD COLUMN form_schema JSON NULL',
            'supported_notes' => 'ADD COLUMN supported_notes TEXT NULL',
        ];
        foreach ($catCols as $col => $clause) {
            try {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_catalogue" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE service_catalogue {$clause}");
                    $applied[] = "col:service_catalogue.{$col}";
                }
            } catch (Throwable $e) {
                $errors[] = "col:service_catalogue.{$col} => " . $e->getMessage();
            }
        }

        // 2. Ensure modification_requests & modification_bvn_types tables exist
        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS modification_requests (
                    id VARCHAR(36) PRIMARY KEY,
                    request_number VARCHAR(64) NOT NULL UNIQUE,
                    user_id VARCHAR(36) NOT NULL,
                    identity_type ENUM("NIN", "BVN") NOT NULL,
                    service_key VARCHAR(100) NOT NULL,
                    service_name VARCHAR(191) NOT NULL,
                    masked_identifier VARCHAR(40) NOT NULL,
                    submitted_fields JSON NOT NULL,
                    supporting_documents JSON NULL,
                    enrollment_type VARCHAR(150) NULL,
                    customer_price DECIMAL(15, 2) NOT NULL,
                    provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                    endpoint VARCHAR(150) NOT NULL,
                    payment_reference VARCHAR(120) NOT NULL UNIQUE,
                    refund_reference VARCHAR(120) NULL UNIQUE,
                    idempotency_key VARCHAR(120) NULL,
                    provider_reference VARCHAR(120) NULL,
                    provider_status VARCHAR(64) NULL,
                    provider_remarks TEXT NULL,
                    provider_response JSON NULL,
                    admin_notes TEXT NULL,
                    reviewed_by VARCHAR(100) NULL,
                    reviewed_at DATETIME NULL,
                    estimated_completion_text VARCHAR(150) NULL,
                    status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                    completed_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_mr_user (user_id),
                    INDEX idx_mr_type_status (identity_type, status),
                    INDEX idx_mr_prov_ref (provider_reference),
                    INDEX idx_mr_idemp (user_id, idempotency_key),
                    INDEX idx_mr_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $db->execute(
                'CREATE TABLE IF NOT EXISTS modification_bvn_types (
                    id VARCHAR(64) PRIMARY KEY,
                    enrollment_type VARCHAR(150) NOT NULL UNIQUE,
                    label VARCHAR(191) NOT NULL,
                    wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    provider_synced_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $db->execute(
                'CREATE TABLE IF NOT EXISTS identity_result_documents (
                    id VARCHAR(36) PRIMARY KEY,
                    domain ENUM("modification", "enrolment", "verification") NOT NULL,
                    record_id VARCHAR(36) NOT NULL,
                    user_id VARCHAR(36) NOT NULL,
                    document_source ENUM("provider_base64", "provider_url", "provider_binary", "admin_uploaded") NOT NULL,
                    is_provider_issued TINYINT(1) NOT NULL DEFAULT 1,
                    original_name VARCHAR(255) NOT NULL,
                    stored_name VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500) NOT NULL,
                    mime_type VARCHAR(100) NOT NULL DEFAULT "application/pdf",
                    file_size INT NOT NULL DEFAULT 0,
                    sha256_hash VARCHAR(64) NOT NULL,
                    provider_document_ref VARCHAR(150) NULL,
                    provider_reference VARCHAR(150) NULL,
                    tracking_id VARCHAR(150) NULL,
                    uploaded_by VARCHAR(36) NULL,
                    retrieval_status ENUM("ready", "pending", "failed", "unavailable") NOT NULL DEFAULT "ready",
                    retrieval_error TEXT NULL,
                    retrieved_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_ird_domain_record (domain, record_id),
                    INDEX idx_ird_user (user_id),
                    INDEX idx_ird_sha256 (sha256_hash),
                    INDEX idx_ird_tracking (tracking_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $modResultCols = [
                'result_document_id' => 'ADD COLUMN result_document_id VARCHAR(36) NULL',
                'result_source' => 'ADD COLUMN result_source VARCHAR(32) NULL',
                'provider_tracking_id' => 'ADD COLUMN provider_tracking_id VARCHAR(150) NULL',
                'result_payload' => 'ADD COLUMN result_payload JSON NULL',
                'result_retrieval_status' => 'ADD COLUMN result_retrieval_status VARCHAR(32) NULL',
                'result_retrieval_error' => 'ADD COLUMN result_retrieval_error TEXT NULL',
                'result_retrieved_at' => 'ADD COLUMN result_retrieved_at DATETIME NULL',
                'additional_info_history' => 'ADD COLUMN additional_info_history JSON NULL',
            ];
            foreach ($modResultCols as $col => $clause) {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "modification_requests" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE modification_requests {$clause}");
                    $applied[] = "col:modification_requests.{$col}";
                }
            }
        } catch (Throwable $e) {
            $errors[] = 'mod_tables => ' . $e->getMessage();
        }

        // 3. Ensure strict separate service categories exist
        try {
            $db->execute(
                'INSERT INTO service_categories (id, code, name, icon, display_order, is_active)
                 VALUES
                 ("cat_mod", "nin_modification", "NIN Modification", "Edit3", 3, 1),
                 ("cat_bvn_mod", "bvn_modification", "BVN Modification", "UserCog", 4, 1)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), code=VALUES(code)'
            );
        } catch (Throwable $e) {
            $errors[] = 'mod_categories => ' . $e->getMessage();
        }

        // 4. Normalize legacy _pass service_keys -> _auth cleanly without duplicate collision
        $legacyMap = [
            'second_nin_mod_name_pass' => ['new_key' => 'second_nin_mod_name_auth', 'endpoint' => '/api/v1/second_nin_mod_name_auth.php', 'wholesale' => 10000.00],
            'second_nin_mod_phone_pass' => ['new_key' => 'second_nin_mod_phone_auth', 'endpoint' => '/api/v1/second_nin_mod_phone_auth.php', 'wholesale' => 10000.00],
        ];
        foreach ($legacyMap as $oldKey => $cfg) {
            try {
                $oldRow = $db->fetchOne('SELECT id FROM service_catalogue WHERE service_key = :ok LIMIT 1', ['ok' => $oldKey]);
                $newRow = $db->fetchOne('SELECT id FROM service_catalogue WHERE service_key = :nk LIMIT 1', ['nk' => $cfg['new_key']]);
                if ($oldRow && !$newRow) {
                    $db->execute(
                        'UPDATE service_catalogue SET service_key = :nk, endpoint = :ep, wholesale_cost = :wc WHERE id = :id',
                        ['nk' => $cfg['new_key'], 'ep' => $cfg['endpoint'], 'wc' => $cfg['wholesale'], 'id' => $oldRow['id']]
                    );
                    $applied[] = "renamed:{$oldKey}->" . $cfg['new_key'];
                } elseif ($oldRow && $newRow) {
                    $db->execute('DELETE FROM service_catalogue WHERE id = :id', ['id' => $oldRow['id']]);
                }
            } catch (Throwable $e) {
                $errors[] = "legacy:{$oldKey} => " . $e->getMessage();
            }
        }

        // Common document descriptors (with accepted formats, size limits, and configurable provider multipart keys)
        $docNinSlip = ['key' => 'nin_slip', 'provider_file_param' => 'nin_slip', 'label' => 'Current NIN Slip / Proof of NIN', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Clear JPG, PNG, WEBP or PDF copy of your existing NIN slip or NIMC tracking slip.'];
        $docAffidavit = ['key' => 'affidavit', 'provider_file_param' => 'affidavit', 'label' => 'Sworn Court Affidavit', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Official court affidavit supporting the requested identity correction.'];
        $docNewspaper = ['key' => 'newspaper_pub', 'provider_file_param' => 'newspaper_pub', 'label' => 'Newspaper Change of Name Publication', 'required' => false, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Recognised Nigerian newspaper publication showing old and new names (if applicable).'];
        $docBirthCert = ['key' => 'birth_certificate', 'provider_file_param' => 'birth_certificate', 'label' => 'Birth Certificate / Declaration of Age', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'NPC Birth Certificate, Hospital Birth Record, or Sworn Declaration of Age.'];
        $docUtilityBill = ['key' => 'address_proof', 'provider_file_param' => 'address_proof', 'label' => 'Proof of Residential Address', 'required' => false, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Recent utility bill, tenancy agreement, or government-issued proof of residence.'];
        $docMedicalOrAff = ['key' => 'gender_proof', 'provider_file_param' => 'gender_proof', 'label' => 'Supporting Affidavit / Medical Letter', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Sworn affidavit or official supporting document confirming correct gender.'];
        $docPassport = ['key' => 'passport_photo', 'provider_file_param' => 'passport_photo', 'label' => 'Recent Passport Photograph', 'required' => false, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Clear white-background passport photograph of the applicant.'];
        $docBvnPrintout = ['key' => 'bvn_slip', 'provider_file_param' => 'bvn_slip', 'label' => 'BVN Enrollment / Bank Slip', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Existing BVN printout or bank confirmation showing BVN & account details.'];
        $docGovId = ['key' => 'valid_id', 'provider_file_param' => 'valid_id', 'label' => 'Valid Government-Issued ID', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'NIN Slip, International Passport, Voter\'s Card, or Driver\'s Licence.'];

        // Field helpers (standardized `help_text` + configurable `provider_param`)
        $fldNin = ['key' => 'nin', 'provider_param' => 'nin', 'label' => '11-Digit NIN Number', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter 11-digit NIN', 'help_text' => 'Enter the applicant\'s existing 11-digit National Identification Number without spaces.'];
        $fldFirst = ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'New First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ibrahim', 'help_text' => 'Must match supporting court affidavit / ID exactly.'];
        $fldMiddle = ['key' => 'middle_name', 'provider_param' => 'middle_name', 'label' => 'New Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Musa', 'help_text' => 'Leave blank if no middle name is to be added or changed.'];
        $fldLast = ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'New Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Adeyemi', 'help_text' => 'Must match supporting court affidavit / ID exactly.'];
        $fldPhone = ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'New Registered Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => 'e.g., 08031234567', 'help_text' => 'Active 11-digit Nigerian mobile number registered in the applicant\'s name.'];
        $fldDob = ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Correct Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Select the exact date shown on the NPC birth certificate or sworn declaration of age.'];
        $fldEmail = ['key' => 'email', 'provider_param' => 'email', 'label' => 'NIMC Account Email', 'type' => 'email', 'required' => true, 'placeholder' => 'registered@example.com', 'help_text' => 'Email linked to the applicant\'s NIMC self-service account.'];
        $fldPass = ['key' => 'password', 'provider_param' => 'password', 'label' => 'NIMC Self-Service Password', 'type' => 'password', 'required' => true, 'placeholder' => 'Enter self-service password', 'help_text' => 'Used solely for immediate modification submission and never stored in plain text.'];
        $fldReason = ['key' => 'reason', 'provider_param' => 'reason', 'label' => 'Reason / Supporting Explanation', 'type' => 'textarea', 'required' => false, 'placeholder' => 'Briefly describe why this modification is requested', 'help_text' => 'Optional context for manual verification officers reviewing your request.'];

        $ninModCatalog = [
            [
                'id' => 'srv_mod_name',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_name',
                'name' => 'NIN Name Modification',
                'description' => 'Manual NIMC correction of first name, middle name, or surname on your National Identification Number record.',
                'endpoint' => '/api/v1/nin_mod_name.php',
                'wholesale_cost' => 4000.00,
                'selling_price' => 6000.00,
                'estimated_turnaround' => '2 – 7 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Ensure new names exactly match your Court Affidavit and Newspaper Publication where applicable.',
                'required_fields' => ['nin', 'first_name', 'last_name'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldReason],
            ],
            [
                'id' => 'srv_mod_phone',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_phone',
                'name' => 'NIN Phone Number Modification',
                'description' => 'Manual update of the registered telephone number linked to your NIMC NIN profile.',
                'endpoint' => '/api/v1/nin_mod_phone.php',
                'wholesale_cost' => 4000.00,
                'selling_price' => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Provided 11-digit phone number must be active and registered in Nigeria.',
                'required_fields' => ['nin', 'phone'],
                'required_documents' => [$docNinSlip, $docPassport],
                'form_schema' => [$fldNin, $fldPhone, ['key' => 'previous_phone', 'provider_param' => 'previous_phone', 'label' => 'Previous Linked Phone (Optional)', 'type' => 'tel', 'required' => false, 'maxLength' => 11, 'placeholder' => '080...', 'help_text' => 'Previous phone number originally tied to the NIN profile, if known.'], $fldReason],
            ],
            [
                'id' => 'srv_mod_addr',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_address',
                'name' => 'NIN Address Modification',
                'description' => 'Manual update of residential street address, State of Residence, and LGA on NIMC registry.',
                'endpoint' => '/api/v1/nin_mod_address.php',
                'wholesale_cost' => 4000.00,
                'selling_price' => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Provide complete residential house number, street, town, LGA, and State.',
                'required_fields' => ['nin', 'address', 'state', 'lga'],
                'required_documents' => [$docNinSlip, $docUtilityBill],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'address', 'provider_param' => 'address', 'label' => 'New Residential Address', 'type' => 'textarea', 'required' => true, 'placeholder' => 'House number, street name, town/city', 'help_text' => 'Include plot/house number, street name, and landmark/town.'],
                    ['key' => 'state', 'provider_param' => 'state', 'label' => 'New State of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Lagos', 'help_text' => 'Nigerian State matching your updated residential address.'],
                    ['key' => 'lga', 'provider_param' => 'lga', 'label' => 'New Local Government Area (LGA)', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ikeja', 'help_text' => 'Local Government Area within the selected State of residence.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_dob',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_dob',
                'name' => 'NIN Date of Birth Modification',
                'description' => 'Manual NIMC Date of Birth modification requiring verified birth certificate and sworn court affidavit.',
                'endpoint' => '/api/v1/nin_mod_dob.php',
                'wholesale_cost' => 53000.00,
                'selling_price' => 65000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC validation)',
                'supported_notes' => 'Date of Birth modification undergoes strict NIMC compliance scrutiny; ensure supporting documents are clear and authentic.',
                'required_fields' => ['nin', 'dob'],
                'required_documents' => [$docNinSlip, $docBirthCert, $docAffidavit],
                'form_schema' => [
                    $fldNin,
                    $fldDob,
                    ['key' => 'current_dob', 'provider_param' => 'current_dob', 'label' => 'Currently Registered DOB (Optional)', 'type' => 'date', 'required' => false, 'help_text' => 'Optional: date of birth currently showing on your existing NIN record.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_dob_name',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_dob_name',
                'name' => 'NIN Name & DOB Modification',
                'description' => 'Combined manual NIMC modification for correcting both full names and Date of Birth together.',
                'endpoint' => '/api/v1/nin_mod_dob_name.php',
                'wholesale_cost' => 58000.00,
                'selling_price' => 72000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC validation)',
                'supported_notes' => 'Upload both your birth record and court affidavit supporting the combined name + DOB correction.',
                'required_fields' => ['nin', 'first_name', 'last_name', 'dob'],
                'required_documents' => [$docNinSlip, $docBirthCert, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldDob, $fldReason],
            ],
            [
                'id' => 'srv_mod_name_phone',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_name_phone',
                'name' => 'NIN Name & Phone Modification',
                'description' => 'Combined manual modification to update applicant full names and registered phone number simultaneously.',
                'endpoint' => '/api/v1/nin_mod_name_phone.php',
                'wholesale_cost' => 8000.00,
                'selling_price' => 12000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Saves time when both name spelling and linked phone number require update.',
                'required_fields' => ['nin', 'first_name', 'last_name', 'phone'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldPhone, $fldReason],
            ],
            [
                'id' => 'srv_mod_gender',
                'category_id' => 'cat_mod',
                'service_key' => 'gender_modification',
                'name' => 'NIN Gender Modification',
                'description' => 'Manual correction of gender classification on your NIMC National Identification record.',
                'endpoint' => '/api/v1/gender_modification.php',
                'wholesale_cost' => 5000.00,
                'selling_price' => 7500.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Requires court affidavit or supporting identification document matching the corrected gender.',
                'required_fields' => ['nin', 'gender'],
                'required_documents' => [$docNinSlip, $docMedicalOrAff, $docPassport],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'gender', 'provider_param' => 'gender', 'label' => 'Correct Gender', 'type' => 'select', 'required' => true, 'help_text' => 'Select the corrected biological gender as stated in your supporting affidavit.', 'options' => [['value' => 'Male', 'label' => 'Male'], ['value' => 'Female', 'label' => 'Female']]],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_susp',
                'category_id' => 'cat_mod',
                'service_key' => 'suspended_modification',
                'name' => 'Suspended NIN Modification',
                'description' => 'Manual compliance remediation and modification request for flagged or suspended NIN profiles.',
                'endpoint' => '/api/v1/suspended_modification.php',
                'wholesale_cost' => 23000.00,
                'selling_price' => 30000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC compliance review)',
                'supported_notes' => 'Include NIMC tracking ID (if available) and clear explanation of what triggered the suspension.',
                'required_fields' => ['nin', 'tracking_id'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docPassport],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'tracking_id', 'provider_param' => 'tracking_id', 'label' => 'NIMC Tracking ID', 'type' => 'text', 'required' => true, 'placeholder' => 'Enter NIMC tracking ID from slip', 'help_text' => '15-character NIMC enrollment/tracking ID printed on your original slip.'],
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'Registered First Name', 'type' => 'text', 'required' => false, 'placeholder' => 'First name on NIN record', 'help_text' => 'First name currently associated with the suspended NIN profile.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Registered Surname', 'type' => 'text', 'required' => false, 'placeholder' => 'Surname on NIN record', 'help_text' => 'Surname currently associated with the suspended NIN profile.'],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Contact Phone Number', 'type' => 'tel', 'required' => false, 'maxLength' => 11, 'placeholder' => '08031234567', 'help_text' => 'Reachable 11-digit mobile number for remediation updates.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_bvn_gen',
                'category_id' => 'cat_mod',
                'service_key' => 'bvn_generated_modification',
                'name' => 'BVN-Generated NIN Modification',
                'description' => 'Manual upgrade and biodata correction for NIN numbers auto-generated via BVN linkage.',
                'endpoint' => '/api/v1/bvn_generated_modification.php',
                'wholesale_cost' => 22000.00,
                'selling_price' => 28000.00,
                'estimated_turnaround' => '5 – 12 Business Days (Subject to NIMC clearance)',
                'supported_notes' => 'Both the 11-digit NIN and linked 11-digit BVN are required to process BVN-generated NIN upgrades.',
                'required_fields' => ['nin', 'bvn'],
                'required_documents' => [$docNinSlip, $docBvnPrintout, $docAffidavit],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'bvn', 'provider_param' => 'bvn', 'label' => 'Linked 11-Digit BVN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter linked 11-digit BVN', 'help_text' => 'Provide the 11-digit BVN that generated the NIN record.'],
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'First Name (As on BVN)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Ibrahim', 'help_text' => 'First name matching your BVN printout and affidavit.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Surname (As on BVN)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Adeyemi', 'help_text' => 'Surname matching your BVN printout and affidavit.'],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Phone Number Linked to BVN', 'type' => 'tel', 'required' => false, 'maxLength' => 11, 'placeholder' => '08031234567', 'help_text' => 'Active 11-digit Nigerian phone number tied to the BVN.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_child',
                'category_id' => 'cat_mod',
                'service_key' => 'child_modification',
                'name' => 'Child NIN Modification',
                'description' => 'Manual update of child / minor NIN identity details with verified parental or guardian NIN consent.',
                'endpoint' => '/api/v1/child_modification.php',
                'wholesale_cost' => 13000.00,
                'selling_price' => 18000.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Parent or legal guardian 11-digit NIN and child birth certificate are mandatory.',
                'required_fields' => ['nin', 'parent_nin'],
                'required_documents' => [$docNinSlip, $docBirthCert, ['key' => 'parent_nin_slip', 'provider_file_param' => 'parent_nin_slip', 'label' => 'Parent / Guardian NIN Slip', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Copy of the parent or legal guardian\'s NIN slip.']],
                'form_schema' => [
                    ['key' => 'nin', 'provider_param' => 'nin', 'label' => 'Child 11-Digit NIN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter child 11-digit NIN', 'help_text' => 'Minor/child\'s existing 11-digit National Identification Number.'],
                    ['key' => 'parent_nin', 'provider_param' => 'parent_nin', 'label' => 'Parent / Guardian 11-Digit NIN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter parent 11-digit NIN', 'help_text' => 'Authorizing parent or legal guardian\'s 11-digit NIN.'],
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'Child First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'Child first name', 'help_text' => 'Corrected or verified first name of the child as on birth record.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Child Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'Child surname', 'help_text' => 'Corrected or verified surname of the child.'],
                    ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Child Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Verified date of birth on the child\'s NPC birth certificate.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_overage',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_over_age',
                'name' => 'Over-Age NIN Modification',
                'description' => 'Manual NIMC Date of Birth / age bracket modification across age tiers (5–9, 10–15, 15–20 years variance).',
                'endpoint' => '/api/v1/nin_over_age.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC verification)',
                'supported_notes' => 'Select the exact age difference bracket and upload an official NPC birth record + court affidavit.',
                'required_fields' => ['nin', 'age_range', 'dob'],
                'required_documents' => [$docNinSlip, $docBirthCert, $docAffidavit],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'age_range', 'provider_param' => 'age_range', 'label' => 'Age Variance Bracket', 'type' => 'select', 'required' => true, 'help_text' => 'Choose the year difference between the currently registered DOB and the corrected DOB.', 'options' => [
                        ['value' => '5-9', 'label' => '5 – 9 Years Adjustment'],
                        ['value' => '10-15', 'label' => '10 – 15 Years Adjustment'],
                        ['value' => '15-20', 'label' => '15 – 20 Years Adjustment'],
                    ]],
                    $fldDob,
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_sec_name',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_name',
                'name' => 'Second NIN Name Mod (No Email/Pass)',
                'description' => 'Second-time NIN name modification processed manually without requiring prior NIMC self-service email/password login.',
                'endpoint' => '/api/v1/second_nin_mod_name.php',
                'wholesale_cost' => 70000.00,
                'selling_price' => 85000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC approval)',
                'supported_notes' => 'Designed for applicants who have already used their first NIMC name modification slot and lack self-service login credentials.',
                'required_fields' => ['nin', 'first_name', 'last_name'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldReason],
            ],
            [
                'id' => 'srv_mod_sec_phone',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_phone',
                'name' => 'Second NIN Phone Mod (No Email/Pass)',
                'description' => 'Second-time NIN telephone number modification without prior NIMC self-service login credentials.',
                'endpoint' => '/api/v1/second_nin_mod_phone.php',
                'wholesale_cost' => 18000.00,
                'selling_price' => 25000.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC approval)',
                'supported_notes' => 'Use this option if you cannot access the NIMC email/password previously attached to the NIN.',
                'required_fields' => ['nin', 'phone'],
                'required_documents' => [$docNinSlip, $docPassport],
                'form_schema' => [$fldNin, $fldPhone, $fldReason],
            ],
            [
                'id' => 'srv_mod_sec_name_pass',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_name_auth',
                'name' => 'Second NIN Name Mod (With Email/Pass)',
                'description' => 'Authenticated second-time NIN name modification using your active NIMC self-service email and password.',
                'endpoint' => '/api/v1/second_nin_mod_name_auth.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Password is transmitted only during request submission and immediately masked from storage logs.',
                'required_fields' => ['nin', 'first_name', 'last_name', 'email', 'password'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldEmail, $fldPass, $fldReason],
            ],
            [
                'id' => 'srv_mod_sec_phone_pass',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_phone_auth',
                'name' => 'Second NIN Phone Mod (With Email/Pass)',
                'description' => 'Authenticated second-time NIN phone number modification using your active NIMC self-service email and password.',
                'endpoint' => '/api/v1/second_nin_mod_phone_auth.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Password is transmitted only during request submission and immediately masked from storage logs.',
                'required_fields' => ['nin', 'phone', 'email', 'password'],
                'required_documents' => [$docNinSlip, $docPassport],
                'form_schema' => [$fldNin, $fldPhone, $fldEmail, $fldPass, $fldReason],
            ],
        ];

        $bvnModService = [
            'id' => 'srv_mod_bvn_mod',
            'category_id' => 'cat_bvn_mod',
            'service_key' => 'bvn_modification',
            'name' => 'BVN Modification Service',
            'description' => 'Manual update and correction of NIBSS Bank Verification Number (BVN) records across supported banks and enrollment institutions.',
            'endpoint' => '/api/v1/bvn_modification.php',
            'wholesale_cost' => 14000.00,
            'selling_price' => 17500.00,
            'estimated_turnaround' => '3 – 10 Business Days (Depending on enrollment bank)',
            'supported_notes' => 'Final price dynamically reflects your selected Bank / Enrollment Type. Never submit NIN requests under BVN Modification.',
            'required_fields' => ['bvn', 'enrollment_type', 'field_to_modify', 'new_value'],
            'required_documents' => [$docBvnPrintout, $docGovId, $docAffidavit],
            'form_schema' => [
                ['key' => 'bvn', 'provider_param' => 'bvn', 'label' => '11-Digit BVN Number', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter 11-digit BVN', 'help_text' => 'Applicant\'s existing 11-digit NIBSS Bank Verification Number.'],
                ['key' => 'enrollment_type', 'provider_param' => 'enrollment_type', 'label' => 'Enrollment Bank / Channel Type', 'type' => 'bvn_enrollment_type', 'required' => true, 'placeholder' => 'Select enrollment bank / type', 'help_text' => 'Customer price updates automatically based on the selected enrollment bank.'],
                ['key' => 'field_to_modify', 'provider_param' => 'field_to_modify', 'label' => 'Information Field to Modify', 'type' => 'select', 'required' => true, 'help_text' => 'Choose the BVN attribute that needs correction.', 'options' => [
                    ['value' => 'name', 'label' => 'Full Name (First / Middle / Surname)'],
                    ['value' => 'dob', 'label' => 'Date of Birth'],
                    ['value' => 'phone', 'label' => 'Phone Number'],
                    ['value' => 'address', 'label' => 'Residential Address'],
                    ['value' => 'gender', 'label' => 'Gender'],
                    ['value' => 'name_and_dob', 'label' => 'Name & Date of Birth'],
                ]],
                ['key' => 'old_value', 'provider_param' => 'old_value', 'label' => 'Current Value on BVN Record', 'type' => 'text', 'required' => false, 'placeholder' => 'Existing value currently shown on BVN', 'help_text' => 'Optional reference showing what is currently on the bank\'s BVN record.'],
                ['key' => 'new_value', 'provider_param' => 'new_value', 'label' => 'Correct New Value Requested', 'type' => 'text', 'required' => true, 'conditional_on' => ['field' => 'field_to_modify', 'values' => ['', 'name', 'phone', 'address', 'gender', 'name_and_dob']], 'placeholder' => 'Exact corrected name, phone, address, or gender', 'help_text' => 'Enter the exact corrected spelling/value matching your valid government ID.'],
                ['key' => 'new_dob', 'provider_param' => 'dob', 'label' => 'Corrected Date of Birth', 'type' => 'date', 'required' => true, 'conditional_on' => ['field' => 'field_to_modify', 'values' => ['dob', 'name_and_dob']], 'help_text' => 'Exact Date of Birth from your NPC birth certificate or valid passport.'],
                ['key' => 'email', 'provider_param' => 'email', 'label' => 'Customer Contact Email (Optional)', 'type' => 'email', 'required' => false, 'placeholder' => 'applicant@example.com', 'help_text' => 'Notification email for bank BVN verification updates.'],
                ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Contact Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => '080...', 'help_text' => 'Reachable 11-digit Nigerian mobile number for follow-up.'],
                $fldReason,
            ],
        ];

        $allMods = array_merge($ninModCatalog, [$bvnModService]);
        foreach ($allMods as $srv) {
            try {
                $existing = $db->fetchOne('SELECT id, category_id, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes FROM service_catalogue WHERE service_key = :sk LIMIT 1', ['sk' => $srv['service_key']]);
                if (!$existing) {
                    $db->execute(
                        'INSERT INTO service_catalogue
                         (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes)
                         VALUES
                         (:id, :cat, :sk, :nm, :desc, "2sureverify", :ep, :wc, :sp, :rf, 0, 1, "manual", "Manual Processing", :eta, :rdocs, :fschema, :notes)',
                        [
                            'id' => $srv['id'],
                            'cat' => $srv['category_id'],
                            'sk' => $srv['service_key'],
                            'nm' => $srv['name'],
                            'desc' => $srv['description'],
                            'ep' => $srv['endpoint'],
                            'wc' => $srv['wholesale_cost'],
                            'sp' => $srv['selling_price'],
                            'rf' => json_encode($srv['required_fields']),
                            'eta' => $srv['estimated_turnaround'],
                            'rdocs' => json_encode($srv['required_documents']),
                            'fschema' => json_encode($srv['form_schema']),
                            'notes' => $srv['supported_notes'],
                        ]
                    );
                    $applied[] = 'mod_insert:' . $srv['service_key'];
                } else {
                    // Preserve admin-edited selling_price, is_active, wholesale_cost; backfill missing Stage 3 metadata & normalize schemas
                    $updCols = ['processing_type = "manual"'];
                    $updParams = ['id' => $existing['id']];
                    if ($existing['category_id'] !== $srv['category_id']) {
                        $updCols[] = 'category_id = :cat';
                        $updParams['cat'] = $srv['category_id'];
                    }
                    if (empty($existing['manual_label'])) {
                        $updCols[] = 'manual_label = :ml';
                        $updParams['ml'] = 'Manual Processing';
                    }
                    if (empty($existing['estimated_turnaround'])) {
                        $updCols[] = 'estimated_turnaround = :eta';
                        $updParams['eta'] = $srv['estimated_turnaround'];
                    }

                    // Normalize/upgrade existing required_documents metadata
                    $curDocs = is_string($existing['required_documents'] ?? null)
                        ? json_decode((string)$existing['required_documents'], true)
                        : ($existing['required_documents'] ?? null);
                    if (empty($curDocs) || !is_array($curDocs)) {
                        $updCols[] = 'required_documents = :rdocs';
                        $updParams['rdocs'] = json_encode($srv['required_documents']);
                    } else {
                        $docChanged = false;
                        $srvDocMap = [];
                        foreach ($srv['required_documents'] as $sd) {
                            $srvDocMap[$sd['key']] = $sd;
                        }
                        foreach ($curDocs as &$cd) {
                            if (!is_array($cd)) continue;
                            $dk = (string)($cd['key'] ?? '');
                            $defDoc = $srvDocMap[$dk] ?? null;
                            if (empty($cd['provider_file_param'])) {
                                $cd['provider_file_param'] = $defDoc['provider_file_param'] ?? $dk;
                                $docChanged = true;
                            }
                            if (empty($cd['accepted_formats'])) {
                                $cd['accepted_formats'] = $defDoc['accepted_formats'] ?? ['JPG', 'PNG', 'WEBP', 'PDF'];
                                $docChanged = true;
                            }
                            if (empty($cd['max_size_mb'])) {
                                $cd['max_size_mb'] = $defDoc['max_size_mb'] ?? 5;
                                $docChanged = true;
                            }
                        }
                        unset($cd);
                        if ($docChanged) {
                            $updCols[] = 'required_documents = :rdocs';
                            $updParams['rdocs'] = json_encode(array_values($curDocs));
                        }
                    }

                    // Normalize/upgrade existing form_schema metadata ('helper' -> 'help_text', provider_param, conditional new_dob)
                    $curSchema = is_string($existing['form_schema'] ?? null)
                        ? json_decode((string)$existing['form_schema'], true)
                        : ($existing['form_schema'] ?? null);
                    if (empty($curSchema) || !is_array($curSchema)) {
                        $updCols[] = 'form_schema = :fschema';
                        $updParams['fschema'] = json_encode($srv['form_schema']);
                    } else {
                        $schemaChanged = false;
                        $srvFieldMap = [];
                        foreach ($srv['form_schema'] as $sf) {
                            $srvFieldMap[$sf['key']] = $sf;
                        }
                        $seenKeys = [];
                        $legacyBvnUpgrade = false;
                        foreach ($curSchema as &$cf) {
                            if (!is_array($cf)) continue;
                            $fk = (string)($cf['key'] ?? '');
                            $seenKeys[$fk] = true;
                            $defFld = $srvFieldMap[$fk] ?? null;
                            if (isset($cf['helper']) && empty($cf['help_text'])) {
                                $cf['help_text'] = $cf['helper'];
                                unset($cf['helper']);
                                $schemaChanged = true;
                            } elseif (empty($cf['help_text']) && !empty($defFld['help_text'])) {
                                $cf['help_text'] = $defFld['help_text'];
                                $schemaChanged = true;
                            }
                            if (empty($cf['provider_param'])) {
                                $cf['provider_param'] = $defFld['provider_param'] ?? $fk;
                                $schemaChanged = true;
                            }
                            if (!empty($defFld['maxLength']) && empty($cf['maxLength'])) {
                                $cf['maxLength'] = $defFld['maxLength'];
                                $schemaChanged = true;
                            }
                            if ($srv['service_key'] === 'bvn_modification' && $fk === 'new_value' && empty($cf['conditional_on']) && !empty($defFld['conditional_on'])) {
                                $cf['conditional_on'] = $defFld['conditional_on'];
                                $cf['placeholder'] = $defFld['placeholder'] ?? ($cf['placeholder'] ?? '');
                                $schemaChanged = true;
                                $legacyBvnUpgrade = true;
                            }
                        }
                        unset($cf);
                        if ($legacyBvnUpgrade && empty($seenKeys['new_dob']) && !empty($srvFieldMap['new_dob'])) {
                            $curSchema[] = $srvFieldMap['new_dob'];
                            $schemaChanged = true;
                        }
                        if ($schemaChanged) {
                            $updCols[] = 'form_schema = :fschema';
                            $updParams['fschema'] = json_encode(array_values($curSchema));
                        }
                    }

                    if (empty($existing['supported_notes'])) {
                        $updCols[] = 'supported_notes = :notes';
                        $updParams['notes'] = $srv['supported_notes'];
                    }
                    if (count($updCols) > 1 || ($existing['processing_type'] ?? '') !== 'manual') {
                        $db->execute(
                            'UPDATE service_catalogue SET ' . implode(', ', $updCols) . ' WHERE id = :id',
                            $updParams
                        );
                        $applied[] = 'mod_backfill:' . $srv['service_key'];
                    }
                }
            } catch (Throwable $e) {
                $errors[] = 'mod_srv:' . $srv['service_key'] . ' => ' . $e->getMessage();
            }
        }

        return ['applied' => $applied, 'errors' => $errors];
    }

    public static function syncEnrolmentCatalog(Database $db, bool $force = false): array
    {
        static $enrSynced = false;
        if ($enrSynced && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $enrSynced = true;

        $applied = [];
        $errors = [];

        // 1. Ensure Stage 4 metadata columns on service_catalogue exist
        $catCols = [
            'processing_type' => 'ADD COLUMN processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant"',
            'manual_label' => 'ADD COLUMN manual_label VARCHAR(80) NULL DEFAULT "Manual Processing"',
            'estimated_turnaround' => 'ADD COLUMN estimated_turnaround VARCHAR(150) NULL',
            'required_documents' => 'ADD COLUMN required_documents JSON NULL',
            'form_schema' => 'ADD COLUMN form_schema JSON NULL',
            'supported_notes' => 'ADD COLUMN supported_notes TEXT NULL',
        ];
        foreach ($catCols as $col => $clause) {
            try {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_catalogue" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE service_catalogue {$clause}");
                    $applied[] = "col:service_catalogue.{$col}";
                }
            } catch (Throwable $e) {
                $errors[] = "col:service_catalogue.{$col} => " . $e->getMessage();
            }
        }

        // 2. Ensure Stage 4 enrolment tables exist
        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS enrolment_orders (
                    id VARCHAR(36) PRIMARY KEY,
                    order_number VARCHAR(64) NOT NULL UNIQUE,
                    user_id VARCHAR(36) NOT NULL,
                    enrolment_type ENUM("NIN_ADULT", "NIN_CHILD", "NIN_ARRANGEMENT", "BVN_ENROLMENT", "BVN_ARRANGEMENT") NOT NULL DEFAULT "NIN_ADULT",
                    identity_domain ENUM("NIN", "BVN") NOT NULL DEFAULT "NIN",
                    service_key VARCHAR(100) NOT NULL,
                    service_name VARCHAR(191) NOT NULL,
                    applicant_name VARCHAR(191) NOT NULL,
                    applicant_phone_masked VARCHAR(40) NULL,
                    submitted_fields JSON NOT NULL,
                    supporting_documents JSON NULL,
                    customer_price DECIMAL(15, 2) NOT NULL,
                    provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                    endpoint VARCHAR(150) NOT NULL,
                    payment_reference VARCHAR(120) NOT NULL UNIQUE,
                    refund_reference VARCHAR(120) NULL UNIQUE,
                    idempotency_key VARCHAR(120) NULL,
                    provider_reference VARCHAR(120) NULL,
                    provider_status VARCHAR(64) NULL,
                    provider_remarks TEXT NULL,
                    provider_response JSON NULL,
                    admin_notes TEXT NULL,
                    reviewed_by VARCHAR(100) NULL,
                    reviewed_at DATETIME NULL,
                    estimated_completion_text VARCHAR(150) NULL,
                    status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                    completed_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_eo_user (user_id),
                    INDEX idx_eo_domain_status (identity_domain, status),
                    INDEX idx_eo_prov_ref (provider_reference),
                    INDEX idx_eo_idemp (user_id, idempotency_key),
                    INDEX idx_eo_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $db->execute(
                'CREATE TABLE IF NOT EXISTS enrolment_sample_documents (
                    id VARCHAR(36) PRIMARY KEY,
                    service_key VARCHAR(100) NOT NULL,
                    title VARCHAR(191) NOT NULL,
                    description TEXT NULL,
                    original_name VARCHAR(255) NOT NULL,
                    stored_name VARCHAR(255) NOT NULL,
                    mime_type VARCHAR(100) NOT NULL,
                    file_size INT NOT NULL DEFAULT 0,
                    file_path VARCHAR(500) NOT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_by VARCHAR(36) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_esd_skey (service_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $enrResultCols = [
                'result_document_id' => 'ADD COLUMN result_document_id VARCHAR(36) NULL',
                'result_source' => 'ADD COLUMN result_source VARCHAR(32) NULL',
                'provider_tracking_id' => 'ADD COLUMN provider_tracking_id VARCHAR(150) NULL',
                'result_payload' => 'ADD COLUMN result_payload JSON NULL',
                'result_retrieval_status' => 'ADD COLUMN result_retrieval_status VARCHAR(32) NULL',
                'result_retrieval_error' => 'ADD COLUMN result_retrieval_error TEXT NULL',
                'result_retrieved_at' => 'ADD COLUMN result_retrieved_at DATETIME NULL',
            ];
            foreach ($enrResultCols as $col => $clause) {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "enrolment_orders" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE enrolment_orders {$clause}");
                    $applied[] = "col:enrolment_orders.{$col}";
                }
            }
        } catch (Throwable $e) {
            $errors[] = 'enr_tables => ' . $e->getMessage();
        }

        // 3. Ensure Enrolment category exists
        try {
            $db->execute(
                'INSERT INTO service_categories (id, code, name, icon, display_order, is_active)
                 VALUES ("cat_enr", "enrolment", "Enrolment", "FilePlus", 6, 1)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), code = VALUES(code)'
            );
        } catch (Throwable $e) {
            $errors[] = 'enr_category => ' . $e->getMessage();
        }

        // 4. Confirmed 2SureVerify NIN Enrolment services (explicitly NIN Enrolment despite "bvn" in endpoint filenames)
        $docPassportAdult = [
            'key' => 'passport_photo',
            'provider_file_param' => 'passport_photo',
            'label' => 'Applicant White-Background Passport Photograph',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP'],
            'max_size_mb' => 5,
            'description' => 'Clear recent colour passport photograph on a plain white background (face centred, no glasses/headgear unless religious).',
        ];
        $docValidIdAdult = [
            'key' => 'valid_id',
            'provider_file_param' => 'valid_id',
            'label' => 'Supporting Identification / Birth Record',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Birth Certificate, Sworn Declaration of Age, International Passport, Voter\'s Card, or Driver\'s Licence.',
        ];
        $docAddressProof = [
            'key' => 'address_proof',
            'provider_file_param' => 'address_proof',
            'label' => 'Proof of Address / Utility Bill (Optional)',
            'required' => false,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Optional recent utility bill or tenancy document confirming residential address.',
        ];

        $docPassportChild = [
            'key' => 'passport_photo',
            'provider_file_param' => 'passport_photo',
            'label' => 'Child White-Background Passport Photograph',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP'],
            'max_size_mb' => 5,
            'description' => 'Clear recent passport photograph of the child on a plain white background.',
        ];
        $docBirthCertChild = [
            'key' => 'birth_certificate',
            'provider_file_param' => 'birth_certificate',
            'label' => 'Child NPC Birth Certificate / Hospital Birth Record',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Official National Population Commission (NPC) birth certificate or hospital birth record for the child.',
        ];
        $docParentNinSlip = [
            'key' => 'parent_nin_slip',
            'provider_file_param' => 'parent_nin_slip',
            'label' => 'Parent / Legal Guardian NIN Slip',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Clear copy of the authorizing parent or legal guardian\'s valid NIN slip.',
        ];

        $enrolmentServices = [
            [
                'id' => 'srv_enr_nin_adult',
                'category_id' => 'cat_enr',
                'service_key' => 'bvn_enroll_adult',
                'name' => 'NIN Enrolment (Adult)',
                'description' => 'Manual National Identification Number (NIN) enrolment processing for adult applicants (16 years and above) with verified biodata and supporting identification.',
                'endpoint' => '/api/v1/bvn_enroll_adult.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Manual Processing)',
                'supported_notes' => "Ensure applicant full names, date of birth, and state/LGA match supporting birth/identity documents exactly.\nThis is a Manual Processing NIN Enrolment request — status remains Pending until completed.",
                'required_fields' => ['first_name', 'last_name', 'dob', 'gender', 'phone', 'marital_status', 'state_of_origin', 'lga_of_origin', 'residence_address', 'residence_state', 'residence_lga'],
                'required_documents' => [$docPassportAdult, $docValidIdAdult, $docAddressProof],
                'form_schema' => [
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ibrahim', 'help_text' => 'Applicant legal first name matching supporting identification.'],
                    ['key' => 'middle_name', 'provider_param' => 'middle_name', 'label' => 'Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Musa', 'help_text' => 'Leave blank if the applicant has no middle name.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Adeyemi', 'help_text' => 'Applicant legal surname / family name.'],
                    ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Adult applicant date of birth (16 years and above).'],
                    ['key' => 'gender', 'provider_param' => 'gender', 'label' => 'Gender', 'type' => 'select', 'required' => true, 'help_text' => 'Applicant biological gender.', 'options' => [['value' => 'Male', 'label' => 'Male'], ['value' => 'Female', 'label' => 'Female']]],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Active Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => 'e.g., 08031234567', 'help_text' => '11-digit Nigerian mobile number reachable for enrolment updates.'],
                    ['key' => 'email', 'provider_param' => 'email', 'label' => 'Contact Email Address (Optional)', 'type' => 'email', 'required' => false, 'placeholder' => 'applicant@example.com', 'help_text' => 'Optional email address for NIN tracking and digital slip notification.'],
                    ['key' => 'marital_status', 'provider_param' => 'marital_status', 'label' => 'Marital Status', 'type' => 'select', 'required' => true, 'help_text' => 'Current marital status of the adult applicant.', 'options' => [['value' => 'Single', 'label' => 'Single'], ['value' => 'Married', 'label' => 'Married'], ['value' => 'Divorced', 'label' => 'Divorced'], ['value' => 'Widowed', 'label' => 'Widowed']]],
                    ['key' => 'state_of_origin', 'provider_param' => 'state_of_origin', 'label' => 'State of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Kano', 'help_text' => 'Applicant indigene state of origin.'],
                    ['key' => 'lga_of_origin', 'provider_param' => 'lga_of_origin', 'label' => 'LGA of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Nassarawa', 'help_text' => 'Local Government Area of origin.'],
                    ['key' => 'residence_address', 'provider_param' => 'residence_address', 'label' => 'Residential Street Address', 'type' => 'text', 'required' => true, 'placeholder' => 'House no., street name, area', 'help_text' => 'Full current residential address in Nigeria.'],
                    ['key' => 'residence_state', 'provider_param' => 'residence_state', 'label' => 'State of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Lagos', 'help_text' => 'State where the applicant currently resides.'],
                    ['key' => 'residence_lga', 'provider_param' => 'residence_lga', 'label' => 'LGA of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ikeja', 'help_text' => 'Local Government Area of current residence.'],
                    ['key' => 'town', 'provider_param' => 'town', 'label' => 'Town / City (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Ikeja', 'help_text' => 'Town or city of residence.'],
                    ['key' => 'notes', 'provider_param' => 'notes', 'label' => 'Additional Processing Notes (Optional)', 'type' => 'textarea', 'required' => false, 'placeholder' => 'Any helpful context for our NIN enrolment team', 'help_text' => 'Optional notes or scheduling details.'],
                ],
            ],
            [
                'id' => 'srv_enr_nin_child',
                'category_id' => 'cat_enr',
                'service_key' => 'bvn_enroll_child',
                'name' => 'NIN Enrolment (Child)',
                'description' => 'Manual National Identification Number (NIN) enrolment processing for minors / children under 16 years linked to a verified parent or legal guardian NIN.',
                'endpoint' => '/api/v1/bvn_enroll_child.php',
                'wholesale_cost' => 8000.00,
                'selling_price' => 12000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Manual Processing)',
                'supported_notes' => "Child NIN Enrolment requires a valid 11-digit Parent / Legal Guardian NIN and NPC Birth Certificate.\nThis is a Manual Processing NIN Enrolment request — status remains Pending until completed.",
                'required_fields' => ['first_name', 'last_name', 'dob', 'gender', 'parent_nin', 'parent_name', 'parent_relationship', 'phone', 'state_of_origin', 'lga_of_origin', 'residence_address', 'residence_state', 'residence_lga'],
                'required_documents' => [$docPassportChild, $docBirthCertChild, $docParentNinSlip],
                'form_schema' => [
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'Child First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Amina', 'help_text' => 'Child legal first name matching NPC birth certificate.'],
                    ['key' => 'middle_name', 'provider_param' => 'middle_name', 'label' => 'Child Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Bello', 'help_text' => 'Leave blank if the child has no middle name.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Child Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Yusuf', 'help_text' => 'Child family surname matching parent record.'],
                    ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Child Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Exact Date of Birth printed on the child\'s birth certificate (under 18 years).'],
                    ['key' => 'gender', 'provider_param' => 'gender', 'label' => 'Child Gender', 'type' => 'select', 'required' => true, 'help_text' => 'Child biological gender.', 'options' => [['value' => 'Male', 'label' => 'Male'], ['value' => 'Female', 'label' => 'Female']]],
                    ['key' => 'parent_nin', 'provider_param' => 'parent_nin', 'label' => 'Parent / Guardian 11-Digit NIN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter 11-digit parent NIN', 'help_text' => 'Active 11-digit NIN of the authorizing parent or legal guardian.'],
                    ['key' => 'parent_name', 'provider_param' => 'parent_name', 'label' => 'Parent / Guardian Full Name', 'type' => 'text', 'required' => true, 'placeholder' => 'Full name as on Parent NIN slip', 'help_text' => 'Exact full name of the parent or legal guardian.'],
                    ['key' => 'parent_relationship', 'provider_param' => 'parent_relationship', 'label' => 'Relationship to Child', 'type' => 'select', 'required' => true, 'help_text' => 'Authorizing guardian relationship.', 'options' => [['value' => 'Father', 'label' => 'Father'], ['value' => 'Mother', 'label' => 'Mother'], ['value' => 'Legal Guardian', 'label' => 'Legal Guardian']]],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Parent / Guardian Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => 'e.g., 08031234567', 'help_text' => '11-digit Nigerian mobile number of the parent/guardian.'],
                    ['key' => 'email', 'provider_param' => 'email', 'label' => 'Parent / Guardian Email (Optional)', 'type' => 'email', 'required' => false, 'placeholder' => 'parent@example.com', 'help_text' => 'Optional email address for status notifications.'],
                    ['key' => 'state_of_origin', 'provider_param' => 'state_of_origin', 'label' => 'State of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Kaduna', 'help_text' => 'Child state of origin.'],
                    ['key' => 'lga_of_origin', 'provider_param' => 'lga_of_origin', 'label' => 'LGA of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Zaria', 'help_text' => 'Child Local Government Area of origin.'],
                    ['key' => 'residence_address', 'provider_param' => 'residence_address', 'label' => 'Residential Street Address', 'type' => 'text', 'required' => true, 'placeholder' => 'House no., street name, area', 'help_text' => 'Full current residential address where the child lives.'],
                    ['key' => 'residence_state', 'provider_param' => 'residence_state', 'label' => 'State of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Abuja FCT', 'help_text' => 'State of current residence.'],
                    ['key' => 'residence_lga', 'provider_param' => 'residence_lga', 'label' => 'LGA of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., AMAC', 'help_text' => 'LGA of current residence.'],
                    ['key' => 'notes', 'provider_param' => 'notes', 'label' => 'Additional Processing Notes (Optional)', 'type' => 'textarea', 'required' => false, 'placeholder' => 'Any helpful context for our child NIN enrolment team', 'help_text' => 'Optional notes for manual verification officers.'],
                ],
            ],
        ];

        foreach ($enrolmentServices as $srv) {
            try {
                $existing = $db->fetchOne(
                    'SELECT id, category_id, name, provider_id, endpoint, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes FROM service_catalogue WHERE service_key = :sk LIMIT 1',
                    ['sk' => $srv['service_key']]
                );
                if (!$existing) {
                    $db->execute(
                        'INSERT INTO service_catalogue
                         (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes)
                         VALUES
                         (:id, :cat, :sk, :nm, :desc, "2sureverify", :ep, :wc, :sp, :rf, 0, 1, "manual", "Manual Processing", :eta, :rdocs, :fschema, :notes)',
                        [
                            'id' => $srv['id'],
                            'cat' => $srv['category_id'],
                            'sk' => $srv['service_key'],
                            'nm' => $srv['name'],
                            'desc' => $srv['description'],
                            'ep' => $srv['endpoint'],
                            'wc' => $srv['wholesale_cost'],
                            'sp' => $srv['selling_price'],
                            'rf' => json_encode($srv['required_fields']),
                            'eta' => $srv['estimated_turnaround'],
                            'rdocs' => json_encode($srv['required_documents']),
                            'fschema' => json_encode($srv['form_schema']),
                            'notes' => $srv['supported_notes'],
                        ]
                    );
                    $applied[] = 'enr_insert:' . $srv['service_key'];
                } else {
                    // Preserve admin-edited selling_price, is_active, wholesale_cost, form_schema, required_documents, and instructions;
                    // strictly enforce category_id = cat_enr, provider_id = 2sureverify, endpoint, processing_type = manual, and non-BVN NIN naming if miscategorized
                    $updCols = ['processing_type = "manual"', 'provider_id = "2sureverify"', 'endpoint = :ep'];
                    $updParams = ['id' => $existing['id'], 'ep' => $srv['endpoint']];

                    if ($existing['category_id'] !== 'cat_enr') {
                        $updCols[] = 'category_id = "cat_enr"';
                    }
                    if (stripos((string)($existing['name'] ?? ''), 'bvn') !== false || empty($existing['name'])) {
                        $updCols[] = 'name = :nm';
                        $updParams['nm'] = $srv['name'];
                    }
                    if (empty($existing['manual_label'])) {
                        $updCols[] = 'manual_label = "Manual Processing"';
                    }
                    if (empty($existing['estimated_turnaround'])) {
                        $updCols[] = 'estimated_turnaround = :eta';
                        $updParams['eta'] = $srv['estimated_turnaround'];
                    }
                    if (empty($existing['supported_notes'])) {
                        $updCols[] = 'supported_notes = :notes';
                        $updParams['notes'] = $srv['supported_notes'];
                    }
                    $curDocs = is_string($existing['required_documents'] ?? null)
                        ? json_decode((string)$existing['required_documents'], true)
                        : ($existing['required_documents'] ?? null);
                    if (empty($curDocs) || !is_array($curDocs)) {
                        $updCols[] = 'required_documents = :rdocs';
                        $updParams['rdocs'] = json_encode($srv['required_documents']);
                    }
                    $curSchema = is_string($existing['form_schema'] ?? null)
                        ? json_decode((string)$existing['form_schema'], true)
                        : ($existing['form_schema'] ?? null);
                    if (empty($curSchema) || !is_array($curSchema)) {
                        $updCols[] = 'form_schema = :fschema';
                        $updParams['fschema'] = json_encode($srv['form_schema']);
                    }
                    if (count($updCols) > 3 || ($existing['processing_type'] ?? '') !== 'manual' || ($existing['category_id'] ?? '') !== 'cat_enr') {
                        $db->execute(
                            'UPDATE service_catalogue SET ' . implode(', ', $updCols) . ' WHERE id = :id',
                            $updParams
                        );
                        $applied[] = 'enr_backfill:' . $srv['service_key'];
                    }
                }
            } catch (Throwable $e) {
                $errors[] = 'enr_srv:' . $srv['service_key'] . ' => ' . $e->getMessage();
            }
        }

        $accSync = self::syncAccountingSchema($db, true);
        $applied = array_merge($applied, $accSync['applied'] ?? []);
        $errors = array_merge($errors, $accSync['errors'] ?? []);

        return ['applied' => $applied, 'errors' => $errors];
    }

    public static function syncSecurityAndReferralSchema(Database $db, bool $force = false): array
    {
        static $syncedSecRef = false;
        if ($syncedSecRef && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $syncedSecRef = true;

        $applied = [];
        $errors = [];

        try {
            $roleCol = $db->fetchOne('SHOW COLUMNS FROM users LIKE "role"');
            if ($roleCol && stripos((string)($roleCol['Type'] ?? ''), 'enum') !== false) {
                $db->execute('ALTER TABLE users MODIFY COLUMN role VARCHAR(32) NOT NULL DEFAULT "customer"');
                $applied[] = 'col:users.role_varchar';
            }
        } catch (Throwable $e) {
            $errors[] = 'col:users.role => ' . $e->getMessage();
        }

        $userCols = [
            'assigned_dashboard' => 'ADD COLUMN assigned_dashboard VARCHAR(32) NULL AFTER role',
            'email_verification_required' => 'ADD COLUMN email_verification_required TINYINT(1) NOT NULL DEFAULT 0 AFTER email_verified',
            'email_verified_at' => 'ADD COLUMN email_verified_at DATETIME NULL AFTER email_verification_required',
            'kyc_level' => 'ADD COLUMN kyc_level INT NOT NULL DEFAULT 1',
            'phone_normalized' => 'ADD COLUMN phone_normalized VARCHAR(32) NULL',
            'token_version' => 'ADD COLUMN token_version INT NOT NULL DEFAULT 1',
            'assigned_permissions' => 'ADD COLUMN assigned_permissions TEXT NULL',
            'referred_by_user_id' => 'ADD COLUMN referred_by_user_id VARCHAR(36) NULL',
            'referral_source' => 'ADD COLUMN referral_source VARCHAR(64) NULL',
            'referral_campaign_code' => 'ADD COLUMN referral_campaign_code VARCHAR(64) NULL',
            'referral_bound_at' => 'ADD COLUMN referral_bound_at DATETIME NULL',
            'pin_failed_attempts' => 'ADD COLUMN pin_failed_attempts INT NOT NULL DEFAULT 0',
            'pin_locked_until' => 'ADD COLUMN pin_locked_until DATETIME NULL',
            'pin_set_at' => 'ADD COLUMN pin_set_at DATETIME NULL',
            'pin_updated_by_admin_at' => 'ADD COLUMN pin_updated_by_admin_at DATETIME NULL',
            'mfa_enabled' => 'ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0',
            'mfa_method' => 'ADD COLUMN mfa_method VARCHAR(24) NOT NULL DEFAULT "email_otp"',
            'last_login_at' => 'ADD COLUMN last_login_at DATETIME NULL',
            'last_login_ip' => 'ADD COLUMN last_login_ip VARCHAR(45) NULL',
        ];
        foreach ($userCols as $col => $clause) {
            try {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "users" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE users {$clause}");
                    $applied[] = "col:users.{$col}";
                }
            } catch (Throwable $e) {
                $errors[] = "col:users.{$col} => " . $e->getMessage();
            }
        }

        // Safe backfill for phone_normalized (canonical 2348XXXXXXXXX / digits)
        try {
            $db->execute(
                'UPDATE users SET phone_normalized = CASE
                    WHEN REGEXP_REPLACE(phone_number, "[^0-9]", "") LIKE "0%" AND CHAR_LENGTH(REGEXP_REPLACE(phone_number, "[^0-9]", "")) = 11
                        THEN CONCAT("234", SUBSTRING(REGEXP_REPLACE(phone_number, "[^0-9]", ""), 2))
                    WHEN CHAR_LENGTH(REGEXP_REPLACE(phone_number, "[^0-9]", "")) = 10
                        THEN CONCAT("234", REGEXP_REPLACE(phone_number, "[^0-9]", ""))
                    ELSE REGEXP_REPLACE(phone_number, "[^0-9]", "")
                 END
                 WHERE (phone_normalized IS NULL OR phone_normalized = "") AND phone_number IS NOT NULL AND phone_number != ""'
            );
        } catch (Throwable) {
            // Fallback for MySQL 5.7/MariaDB without REGEXP_REPLACE
            try {
                $rows = $db->fetchAll('SELECT id, phone_number FROM users WHERE (phone_normalized IS NULL OR phone_normalized = "") AND phone_number IS NOT NULL LIMIT 500');
                foreach ($rows as $r) {
                    $digits = preg_replace('/\D/', '', (string)($r['phone_number'] ?? '')) ?? '';
                    if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
                        $digits = '234' . substr($digits, 1);
                    } elseif (strlen($digits) === 10) {
                        $digits = '234' . $digits;
                    }
                    if ($digits !== '') {
                        $db->execute('UPDATE users SET phone_normalized = :pn WHERE id = :id', ['pn' => $digits, 'id' => $r['id']]);
                    }
                }
            } catch (Throwable) {
            }
        }

        $tables = [
            'user_sessions' => 'CREATE TABLE IF NOT EXISTS user_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                jti VARCHAR(64) NOT NULL UNIQUE,
                token_version INT NOT NULL DEFAULT 1,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                device_label VARCHAR(120) NULL,
                is_revoked TINYINT(1) NOT NULL DEFAULT 0,
                revoked_reason VARCHAR(120) NULL,
                revoked_at DATETIME NULL,
                last_seen_at DATETIME NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_us_user (user_id, is_revoked),
                INDEX idx_us_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'login_attempts' => 'CREATE TABLE IF NOT EXISTS login_attempts (
                id VARCHAR(36) PRIMARY KEY,
                identifier VARCHAR(191) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                attempt_count INT NOT NULL DEFAULT 0,
                locked_until DATETIME NULL,
                last_attempt_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_la_ident_ip (identifier, ip_address),
                INDEX idx_la_locked (locked_until)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'mfa_challenges' => 'CREATE TABLE IF NOT EXISTS mfa_challenges (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                challenge_token VARCHAR(128) NOT NULL UNIQUE,
                method ENUM("email_otp", "totp") NOT NULL DEFAULT "email_otp",
                otp_hash VARCHAR(255) NULL,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                is_verified TINYINT(1) NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mfa_user (user_id, is_verified),
                INDEX idx_mfa_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'user_mfa_configs' => 'CREATE TABLE IF NOT EXISTS user_mfa_configs (
                user_id VARCHAR(36) PRIMARY KEY,
                totp_secret_encrypted TEXT NULL,
                totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
                email_otp_enabled TINYINT(1) NOT NULL DEFAULT 0,
                recovery_codes_hash JSON NULL,
                enabled_at DATETIME NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'pin_reset_requests' => 'CREATE TABLE IF NOT EXISTS pin_reset_requests (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                email VARCHAR(191) NOT NULL,
                otp_hash VARCHAR(255) NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                is_used TINYINT(1) NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_prr_user (user_id, is_used),
                INDEX idx_prr_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_campaigns' => 'CREATE TABLE IF NOT EXISTS referral_campaigns (
                id VARCHAR(36) PRIMARY KEY,
                campaign_code VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                description TEXT NULL,
                reward_mode VARCHAR(32) NOT NULL DEFAULT "fixed",
                reward_value DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                points_bonus INT NOT NULL DEFAULT 0,
                min_spend DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                budget_cap DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                spent_budget DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                starts_at DATETIME NULL,
                ends_at DATETIME NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(36) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rc_active (is_active, starts_at, ends_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_tiers' => 'CREATE TABLE IF NOT EXISTS referral_tiers (
                id VARCHAR(36) PRIMARY KEY,
                tier_key VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                min_qualified_referrals INT NOT NULL DEFAULT 0,
                min_referred_volume DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_multiplier DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
                bonus_cash DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                bonus_points INT NOT NULL DEFAULT 0,
                reseller_only TINYINT(1) NOT NULL DEFAULT 0,
                display_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referrals' => 'CREATE TABLE IF NOT EXISTS referrals (
                id VARCHAR(36) PRIMARY KEY,
                referrer_user_id VARCHAR(36) NOT NULL,
                referred_user_id VARCHAR(36) NOT NULL UNIQUE,
                referral_code_used VARCHAR(64) NOT NULL,
                attribution_channel VARCHAR(32) NOT NULL DEFAULT "referral_link",
                campaign_code VARCHAR(64) NULL,
                risk_fingerprint VARCHAR(128) NULL,
                signup_ip VARCHAR(45) NULL,
                status ENUM("registered", "qualified", "flagged", "blocked") NOT NULL DEFAULT "registered",
                flag_reason TEXT NULL,
                qualifying_tx_count INT NOT NULL DEFAULT 0,
                qualifying_spend_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_earned_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                qualified_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ref_referrer (referrer_user_id, status),
                INDEX idx_ref_campaign (campaign_code),
                INDEX idx_ref_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_balances' => 'CREATE TABLE IF NOT EXISTS referral_balances (
                user_id VARCHAR(36) PRIMARY KEY,
                pending_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                available_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reserved_for_withdrawal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                transferred_to_wallet_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_withdrawn DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reversed_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                points_balance INT NOT NULL DEFAULT 0,
                points_redeemed_total INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_rewards' => 'CREATE TABLE IF NOT EXISTS referral_rewards (
                id VARCHAR(36) PRIMARY KEY,
                referrer_user_id VARCHAR(36) NOT NULL,
                referred_user_id VARCHAR(36) NOT NULL,
                referral_id VARCHAR(36) NULL,
                campaign_code VARCHAR(64) NULL,
                service_category VARCHAR(64) NOT NULL,
                service_key VARCHAR(100) NULL,
                source_reference VARCHAR(120) NOT NULL UNIQUE,
                gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                gateway_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_margin DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_mode VARCHAR(32) NOT NULL DEFAULT "fixed",
                reward_cash DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_points INT NOT NULL DEFAULT 0,
                status ENUM("pending", "available", "reversed", "rejected", "paid_out", "skipped") NOT NULL DEFAULT "pending",
                status_reason TEXT NULL,
                settles_at DATETIME NULL,
                settled_at DATETIME NULL,
                reversed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rr_referrer (referrer_user_id, status),
                INDEX idx_rr_referred (referred_user_id),
                INDEX idx_rr_settle (status, settles_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_points_ledger' => 'CREATE TABLE IF NOT EXISTS referral_points_ledger (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                entry_type ENUM("CREDIT", "DEBIT", "REVERSAL") NOT NULL,
                points INT NOT NULL,
                balance_before INT NOT NULL DEFAULT 0,
                balance_after INT NOT NULL DEFAULT 0,
                reference VARCHAR(120) NOT NULL UNIQUE,
                naira_value DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                conversion_rate DECIMAL(15, 4) NOT NULL DEFAULT 1.0000,
                description VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_rpl_user (user_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_withdrawals' => 'CREATE TABLE IF NOT EXISTS referral_withdrawals (
                id VARCHAR(36) PRIMARY KEY,
                withdrawal_number VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                bank_name VARCHAR(120) NOT NULL,
                account_number VARCHAR(30) NOT NULL,
                account_name VARCHAR(191) NOT NULL,
                gross_amount DECIMAL(15, 2) NOT NULL,
                fee_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_amount DECIMAL(15, 2) NOT NULL,
                status ENUM("pending", "approved", "processing", "paid", "rejected", "failed", "cancelled") NOT NULL DEFAULT "pending",
                idempotency_key VARCHAR(120) NULL,
                payment_reference VARCHAR(120) NULL,
                receipt_url VARCHAR(500) NULL,
                admin_note TEXT NULL,
                rejection_reason TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at DATETIME NULL,
                paid_by VARCHAR(100) NULL,
                paid_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rw_user (user_id, status),
                INDEX idx_rw_status (status, created_at),
                INDEX idx_rw_idemp (user_id, idempotency_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_audit_logs' => 'CREATE TABLE IF NOT EXISTS referral_audit_logs (
                id VARCHAR(36) PRIMARY KEY,
                actor_user_id VARCHAR(36) NULL,
                actor_email VARCHAR(191) NULL,
                target_user_id VARCHAR(36) NULL,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(64) NOT NULL,
                entity_id VARCHAR(64) NULL,
                details JSON NULL,
                ip_address VARCHAR(45) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ral_action (action, created_at),
                INDEX idx_ral_target (target_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'role_dashboard_configs' => 'CREATE TABLE IF NOT EXISTS role_dashboard_configs (
                dashboard_key VARCHAR(64) PRIMARY KEY,
                category ENUM("portal", "console") NOT NULL DEFAULT "portal",
                draft_config JSON NOT NULL,
                published_config JSON NOT NULL,
                has_unpublished_changes TINYINT(1) NOT NULL DEFAULT 0,
                updated_by VARCHAR(100) NULL,
                published_by VARCHAR(100) NULL,
                published_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'email_verifications' => 'CREATE TABLE IF NOT EXISTS email_verifications (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                email VARCHAR(191) NOT NULL,
                token_hash VARCHAR(128) NOT NULL,
                code_hash VARCHAR(128) NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                is_used TINYINT(1) NOT NULL DEFAULT 0,
                used_at DATETIME NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ev_user (user_id, is_used),
                INDEX idx_ev_email (email, is_used),
                INDEX idx_ev_token (token_hash),
                INDEX idx_ev_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tables as $name => $ddl) {
            try {
                $db->execute($ddl);
                $applied[] = "table:{$name}";
            } catch (Throwable $e) {
                $errors[] = "table:{$name} => " . $e->getMessage();
            }
        }

        // Seed starter referral tiers cleanly (idempotent)
        $defaultTiers = [
            ['tier_bronze', 'bronze', 'Bronze Starter', 0, 0.00, 1.0000, 0.00, 0, 0, 1],
            ['tier_silver', 'silver', 'Silver Partner', 5, 10000.00, 1.1500, 250.00, 50, 0, 2],
            ['tier_gold', 'gold', 'Gold Ambassador', 15, 50000.00, 1.3000, 750.00, 150, 0, 3],
            ['tier_platinum', 'platinum', 'Platinum Leader', 40, 150000.00, 1.5000, 2000.00, 400, 0, 4],
        ];
        foreach ($defaultTiers as $t) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO referral_tiers
                     (id, tier_key, name, min_qualified_referrals, min_referred_volume, reward_multiplier, bonus_cash, bonus_points, reseller_only, display_order, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
                    $t
                );
            } catch (Throwable) {
            }
        }

        // Seed default configurable settings ONLY if missing (never overwrite existing Admin values)
        $defaultSettingConfigs = [
            'referral_settings' => [
                'category' => 'referral',
                'description' => 'HAMBAKTECH Referral, Rewards, Points, Conversion & Withdrawal Rules',
                'value' => [
                    'enabled' => true,
                    'program_name' => 'HAMBAKTECH Partner & Referral Program',
                    'code_prefix' => 'HAMBAK',
                    'code_length' => 6,
                    'reward_mode' => 'fixed', // fixed, percent_of_spend, percent_of_margin, milestone, points, campaign, tier, hybrid
                    'trigger_mode' => 'first_qualifying_transaction', // signup_verified, first_qualifying_transaction, every_qualifying_transaction
                    'flat_reward_naira' => 100.00,
                    'percent_of_spend' => 1.5,
                    'percent_of_margin' => 15.0,
                    'points_per_qualifying_tx' => 50,
                    'points_per_1000_naira' => 25,
                    'point_value_naira' => 1.00,
                    'min_qualifying_spend' => 500.00,
                    'min_net_margin_naira' => 10.00,
                    'protect_negative_margin' => true,
                    'settlement_hold_hours' => 24,
                    'monthly_reward_cap_naira' => 50000.00,
                    'max_rewards_per_referee' => 1,
                    'qualifying_services' => [
                        'data' => true,
                        'airtime' => true,
                        'airtime_pin' => true,
                        'data_pin' => true,
                        'cable' => true,
                        'electricity' => true,
                        'exam_pin' => true,
                        'bulksms' => true,
                        'nin_verification' => true,
                        'bvn_verification' => true,
                        'nin_modification' => true,
                        'bvn_modification' => true,
                        'enrolment' => true,
                    ],
                    'wallet_conversion_enabled' => true,
                    'min_wallet_conversion_naira' => 500.00,
                    'min_points_conversion' => 100,
                    'wallet_conversion_fee_naira' => 0.00,
                    'withdrawal_enabled' => true,
                    'min_withdrawal_naira' => 2000.00,
                    'max_withdrawal_naira' => 100000.00,
                    'daily_withdrawal_limit_naira' => 100000.00,
                    'withdrawal_fee_type' => 'flat', // flat | percent
                    'withdrawal_fee_value' => 50.00,
                    'require_kyc_level_for_withdrawal' => 1,
                    'block_self_referral' => true,
                    'block_same_ip_signup' => true,
                    'max_signups_per_ip_24h' => 3,
                    'notify_email_on_reward' => true,
                    'notify_email_on_withdrawal' => true,
                    'terms_summary' => 'Earn rewards when friends sign up using your referral code and complete qualifying transactions above the minimum spend threshold. Rewards enter a settlement hold window before becoming available for instant wallet conversion or bank withdrawal.',
                    'whatsapp_share_template' => 'Join HAMBAKTECH for instant Data, Airtime, Bills & Identity Services using my referral link: {referral_link} (Code: {referral_code})',
                ],
            ],
            'pin_policy_settings' => [
                'category' => 'security',
                'description' => 'Compulsory Transaction PIN Activation & Server Enforcement Policy',
                'value' => [
                    'enforce_transaction_pin' => true,
                    'require_pin_activation_for_all_customers' => true,
                    'pin_length' => 4, // 4, 5, or 6
                    'allow_weak_pins' => false,
                    'pin_max_attempts' => 5,
                    'pin_lockout_minutes' => 15,
                    'otp_reset_expiry_minutes' => 15,
                    'protected_categories' => [
                        'telecom_data' => true,
                        'telecom_airtime' => true,
                        'telecom_pins' => true,
                        'telecom_swap' => true,
                        'telecom_bills' => true,
                        'telecom_bulksms' => true,
                        'identity_verification' => true,
                        'identity_modification' => true,
                        'identity_enrolment' => true,
                        'referral_wallet_conversion' => true,
                        'referral_withdrawal' => true,
                    ],
                ],
            ],
            'mfa_settings' => [
                'category' => 'security',
                'description' => 'Multi-Factor Authentication Policy for Admins and Customers',
                'value' => [
                    'require_mfa_for_superadmin' => false,
                    'require_mfa_for_admin' => false,
                    'allow_customer_mfa_opt_in' => true,
                    'default_mfa_method' => 'email_otp',
                    'otp_expiry_minutes' => 10,
                    'max_otp_attempts' => 5,
                ],
            ],
            'security_settings' => [
                'category' => 'security',
                'description' => 'Platform Session, Login Brute-Force & CORS Security Settings',
                'value' => [
                    'enforce_transaction_pin' => true,
                    'pin_max_attempts' => 5,
                    'pin_lockout_minutes' => 15,
                    'jwt_expiry_days' => 7,
                    'admin_session_timeout_minutes' => 60,
                    'customer_session_timeout_minutes' => 10080,
                    'max_failed_login_attempts' => 5,
                    'login_lockout_minutes' => 15,
                    'ip_rate_limiting_enabled' => true,
                    'bind_session_user_agent' => true,
                    'allowed_cors_origins' => ['https://hambaktech.com.ng', 'https://www.hambaktech.com.ng'],
                ],
            ],
        ];

        foreach ($defaultSettingConfigs as $sKey => $cfg) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                     VALUES (:id, :skey, :val, :cat, :desc, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'skey' => $sKey,
                        'val' => json_encode($cfg['value'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                        'cat' => $cfg['category'],
                        'desc' => $cfg['description'],
                    ]
                );
            } catch (Throwable $e) {
                $errors[] = "setting:{$sKey} => " . $e->getMessage();
            }
        }

        return ['applied' => $applied, 'errors' => $errors];
    }

    public static function syncAccountingSchema(Database $db, bool $force = false): array
    {
        static $syncedAcc = false;
        if ($syncedAcc && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $syncedAcc = true;

        $applied = [];
        $errors = [];

        $tables = [
            'accounting_accounts' => 'CREATE TABLE IF NOT EXISTS accounting_accounts (
                id VARCHAR(36) PRIMARY KEY,
                account_code VARCHAR(50) NOT NULL UNIQUE,
                account_name VARCHAR(120) NOT NULL,
                account_type ENUM("cash", "pos", "bank", "gateway", "liability") NOT NULL,
                bank_name VARCHAR(100) NULL,
                account_number VARCHAR(50) NULL,
                opening_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                opening_date DATE NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_entries' => 'CREATE TABLE IF NOT EXISTS accounting_entries (
                id VARCHAR(36) PRIMARY KEY,
                entry_number VARCHAR(64) NOT NULL UNIQUE,
                entry_date DATE NOT NULL,
                occurred_at DATETIME NOT NULL,
                occurred_lagos DATETIME NOT NULL,
                source_origin ENUM("website", "physical", "expense", "income", "inventory", "reconciliation", "adjustment") NOT NULL,
                source_table VARCHAR(64) NULL,
                source_id VARCHAR(64) NULL,
                entry_category VARCHAR(64) NOT NULL,
                service_domain VARCHAR(64) NOT NULL DEFAULT "general",
                title VARCHAR(191) NOT NULL,
                description TEXT NULL,
                reference VARCHAR(120) NULL,
                gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                revenue_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                cost_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                fee_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                expense_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_profit_impact DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                wallet_liability_delta DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                payment_channel VARCHAR(50) NOT NULL DEFAULT "wallet",
                account_code VARCHAR(50) NULL,
                reconciliation_status ENUM("unreconciled", "reconciled", "flagged", "na") NOT NULL DEFAULT "na",
                reconciliation_id VARCHAR(36) NULL,
                customer_id VARCHAR(36) NULL,
                customer_name VARCHAR(191) NULL,
                staff_user_id VARCHAR(36) NULL,
                staff_name VARCHAR(191) NULL,
                is_reversed TINYINT(1) NOT NULL DEFAULT 0,
                reversal_of_entry_id VARCHAR(36) NULL,
                reversed_by VARCHAR(36) NULL,
                reversed_at DATETIME NULL,
                metadata JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_acc_source (source_table, source_id, entry_category),
                INDEX idx_ae_date (entry_date),
                INDEX idx_ae_occurred_at (occurred_at),
                INDEX idx_ae_origin_cat (source_origin, entry_category),
                INDEX idx_ae_domain (service_domain),
                INDEX idx_ae_channel (payment_channel, account_code),
                INDEX idx_ae_ref (reference),
                INDEX idx_ae_reconcile (reconciliation_status, entry_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_physical_sales' => 'CREATE TABLE IF NOT EXISTS accounting_physical_sales (
                id VARCHAR(36) PRIMARY KEY,
                receipt_number VARCHAR(64) NOT NULL UNIQUE,
                sale_date DATE NOT NULL,
                occurred_at DATETIME NOT NULL,
                customer_name VARCHAR(191) NULL,
                customer_phone VARCHAR(30) NULL,
                service_category VARCHAR(64) NOT NULL,
                service_name VARCHAR(191) NOT NULL,
                description TEXT NULL,
                quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
                unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                direct_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                inventory_item_id VARCHAR(36) NULL,
                inventory_qty_used DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                payment_mode ENUM("cash", "pos", "transfer", "split") NOT NULL DEFAULT "cash",
                cash_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                pos_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                transfer_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                pos_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                pos_rrn VARCHAR(100) NULL,
                bank_reference VARCHAR(120) NULL,
                attendant_user_id VARCHAR(36) NULL,
                attendant_name VARCHAR(191) NULL,
                status ENUM("completed", "voided", "refunded") NOT NULL DEFAULT "completed",
                void_reason TEXT NULL,
                voided_by VARCHAR(36) NULL,
                voided_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_aps_date (sale_date, status),
                INDEX idx_aps_cat (service_category),
                INDEX idx_aps_staff (attendant_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_expenses_income' => 'CREATE TABLE IF NOT EXISTS accounting_expenses_income (
                id VARCHAR(36) PRIMARY KEY,
                voucher_number VARCHAR(64) NOT NULL UNIQUE,
                record_type ENUM("expense", "other_income") NOT NULL,
                entry_date DATE NOT NULL,
                occurred_at DATETIME NOT NULL,
                category VARCHAR(64) NOT NULL,
                title VARCHAR(191) NOT NULL,
                description TEXT NULL,
                party_name VARCHAR(191) NULL,
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                fee_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                payment_method ENUM("cash", "pos", "bank_transfer", "wallet", "other") NOT NULL DEFAULT "cash",
                account_code VARCHAR(50) NULL,
                reference VARCHAR(120) NULL,
                attachment_note VARCHAR(255) NULL,
                recorded_by VARCHAR(36) NULL,
                recorded_by_name VARCHAR(191) NULL,
                status ENUM("active", "voided") NOT NULL DEFAULT "active",
                void_reason TEXT NULL,
                voided_by VARCHAR(36) NULL,
                voided_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_aei_date (entry_date, record_type, status),
                INDEX idx_aei_cat (category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_inventory_items' => 'CREATE TABLE IF NOT EXISTS accounting_inventory_items (
                id VARCHAR(36) PRIMARY KEY,
                sku VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(191) NOT NULL,
                category VARCHAR(64) NOT NULL DEFAULT "consumable",
                unit_label VARCHAR(40) NOT NULL DEFAULT "pcs",
                current_stock DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                reorder_level DECIMAL(12, 2) NOT NULL DEFAULT 5.00,
                average_unit_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                default_selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                supplier_name VARCHAR(191) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_aii_active (is_active, category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_inventory_movements' => 'CREATE TABLE IF NOT EXISTS accounting_inventory_movements (
                id VARCHAR(36) PRIMARY KEY,
                item_id VARCHAR(36) NOT NULL,
                movement_type ENUM("purchase", "sale_deduction", "usage", "adjustment_in", "adjustment_out", "wastage") NOT NULL,
                quantity_delta DECIMAL(12, 2) NOT NULL,
                unit_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                selling_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                stock_before DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                stock_after DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                payment_method VARCHAR(32) NULL,
                account_code VARCHAR(50) NULL,
                supplier_name VARCHAR(191) NULL,
                reference VARCHAR(120) NULL,
                notes TEXT NULL,
                recorded_by VARCHAR(36) NULL,
                recorded_by_name VARCHAR(191) NULL,
                entry_date DATE NOT NULL,
                occurred_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_aim_item (item_id, entry_date),
                INDEX idx_aim_type (movement_type, entry_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_reconciliations' => 'CREATE TABLE IF NOT EXISTS accounting_reconciliations (
                id VARCHAR(36) PRIMARY KEY,
                reconcile_number VARCHAR(64) NOT NULL UNIQUE,
                reconcile_date DATE NOT NULL,
                account_code VARCHAR(50) NOT NULL,
                channel_name VARCHAR(100) NOT NULL,
                opening_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                expected_inflow DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                expected_outflow DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                expected_fees DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                expected_closing DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                actual_counted DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                variance_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                status ENUM("balanced", "shortage", "surplus", "pending_review", "approved") NOT NULL DEFAULT "balanced",
                notes TEXT NULL,
                submitted_by VARCHAR(36) NULL,
                submitted_by_name VARCHAR(191) NULL,
                approved_by VARCHAR(36) NULL,
                approved_by_name VARCHAR(191) NULL,
                approved_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ar_date_acc (reconcile_date, account_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'accounting_report_logs' => 'CREATE TABLE IF NOT EXISTS accounting_report_logs (
                id VARCHAR(36) PRIMARY KEY,
                report_key VARCHAR(120) NOT NULL UNIQUE,
                report_type ENUM("daily_midday", "manual_preview", "manual_send") NOT NULL DEFAULT "daily_midday",
                lagos_report_date DATE NOT NULL,
                prev_day_date DATE NOT NULL,
                cutoff_time_lagos VARCHAR(20) NOT NULL DEFAULT "11:59:59",
                recipients TEXT NOT NULL,
                status ENUM("sent", "failed", "skipped") NOT NULL DEFAULT "sent",
                error_message TEXT NULL,
                summary_snapshot JSON NULL,
                triggered_by VARCHAR(64) NOT NULL DEFAULT "cron",
                sent_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_arl_date (lagos_report_date, report_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tables as $name => $ddl) {
            try {
                $db->execute($ddl);
                $applied[] = "table:{$name}";
            } catch (Throwable $e) {
                $errors[] = "table:{$name} => " . $e->getMessage();
            }
        }

        try {
            $cbfExists = $db->fetchOne(
                'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "accounting_entries" AND COLUMN_NAME = "customer_borne_fee"'
            );
            if (!$cbfExists) {
                $db->execute('ALTER TABLE `accounting_entries` ADD COLUMN customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER fee_amount');
                $applied[] = 'col:accounting_entries.customer_borne_fee';
            }
        } catch (Throwable $e) {
            $errors[] = 'col:accounting_entries.customer_borne_fee => ' . $e->getMessage();
        }

        // Seed standard operating accounts idempotently
        $defaultAccounts = [
            ['acc_cash_drawer', 'CASH_DRAWER', 'Physical Office Cash Drawer', 'cash', 'Office Safe / Till', 'CASH-01'],
            ['acc_pos_terminal', 'POS_TERMINAL', 'Office POS Terminal', 'pos', 'Moniepoint / OPay POS', 'POS-01'],
            ['acc_bank_main', 'BANK_MAIN', 'HambakTech Business Bank Account', 'bank', 'Moniepoint MFB', '5210741634'],
            ['acc_paystack', 'GATEWAY_PAYSTACK', 'Paystack Online Settlement', 'gateway', 'Paystack', 'PAYSTACK'],
            ['acc_flutterwave', 'GATEWAY_FLUTTERWAVE', 'Flutterwave Online Settlement', 'gateway', 'Flutterwave', 'FLUTTERWAVE'],
            ['acc_wallet_liab', 'LIABILITY_CUSTOMER_WALLETS', 'Customer Wallet Liabilities Pool', 'liability', 'Platform Wallets', 'LIAB-WALLET'],
        ];
        foreach ($defaultAccounts as $acc) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO accounting_accounts
                     (id, account_code, account_name, account_type, bank_name, account_number, opening_balance, opening_date, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, 0.00, "2026-01-01", 1)',
                    $acc
                );
            } catch (Throwable) {
            }
        }

        // Seed default accounting configuration without overwriting admin changes
        try {
            $adminEmail = 'admin@hambaktech.com.ng';
            try {
                $genRow = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key IN ("general_settings", "admin_notification_email") LIMIT 1');
                if ($genRow && !empty($genRow['setting_value'])) {
                    $decodedGen = json_decode((string)$genRow['setting_value'], true);
                    if (is_array($decodedGen) && !empty($decodedGen['admin_notification_email'])) {
                        $adminEmail = (string)$decodedGen['admin_notification_email'];
                    } elseif (filter_var($genRow['setting_value'], FILTER_VALIDATE_EMAIL)) {
                        $adminEmail = (string)$genRow['setting_value'];
                    }
                }
            } catch (Throwable) {
            }

            $defaultAccountingConfig = [
                'business_currency' => 'NGN',
                'timezone' => 'Africa/Lagos',
                'daily_email_enabled' => true,
                'daily_email_hour_lagos' => 12,
                'daily_email_minute_lagos' => 0,
                'daily_email_cutoff_time' => '11:59',
                'daily_email_recipients' => [$adminEmail],
                'report_sections' => [
                    'executive_kpis' => true,
                    'previous_day_final' => true,
                    'today_morning_midday' => true,
                    'website_service_breakdown' => true,
                    'physical_business_sales' => true,
                    'wallet_liability_summary' => true,
                    'expenses_and_other_income' => true,
                    'cash_pos_bank_reconciliation' => true,
                    'low_stock_alerts' => true,
                    'refunds_and_exceptions' => true,
                ],
                'pos_fee_percent' => 0.50,
                'pos_fee_cap' => 100.00,
                'paystack_fee_percent' => 1.50,
                'paystack_flat_fee' => 100.00,
                'paystack_flat_threshold' => 2500.00,
                'paystack_fee_cap' => 2000.00,
                'flutterwave_fee_percent' => 1.40,
                'flutterwave_fee_cap' => 2000.00,
                'low_stock_alert_default' => 5,
                'variance_alert_threshold' => 500.00,
                'restrict_reversals_to_superadmin' => true,
                'restrict_config_to_superadmin' => true,
                'exclude_internal_admin_wallets_from_liability' => true,
                'auto_sync_on_dashboard_load' => true,
                'cron_secret_token' => bin2hex(random_bytes(16)),
            ];

            $db->execute(
                'INSERT IGNORE INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, "accounting_settings", :val, "accounting", "HAMBAKTECH Integrated Business Management & Accounting Configuration", NOW())',
                [
                    'id' => Security::generateUuid(),
                    'val' => json_encode($defaultAccountingConfig, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ]
            );
        } catch (Throwable $e) {
            $errors[] = 'setting:accounting_settings => ' . $e->getMessage();
        }

        return ['applied' => $applied, 'errors' => $errors];
    }

    /**
     * Phase 2: Printing & Document Services Module Schema & Catalog Seeder (Idempotent)
     */
    public static function syncPrintingModuleSchema(Database $db, bool $force = false): array
    {
        static $synced = false;
        if ($synced && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $synced = true;

        $applied = [];
        $errors = [];

        $tables = [
            'printing_service_categories' => 'CREATE TABLE IF NOT EXISTS printing_service_categories (
                id VARCHAR(36) PRIMARY KEY,
                category_key VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                description TEXT NULL,
                icon VARCHAR(50) NOT NULL DEFAULT "Printer",
                pricing_mode ENUM("per_page", "photocopy", "banner_area", "per_card", "photo_unit", "custom_quote") NOT NULL DEFAULT "per_page",
                measurement_method ENUM("per_page", "per_copy", "per_sq_ft", "per_linear_ft", "per_card", "per_photo", "manual") NOT NULL DEFAULT "per_page",
                unit_label VARCHAR(50) NOT NULL DEFAULT "page",
                base_rate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                bw_rate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                color_rate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                min_quantity INT NOT NULL DEFAULT 1,
                urgent_fee_type ENUM("flat", "percent") NOT NULL DEFAULT "percent",
                urgent_fee_value DECIMAL(15, 2) NOT NULL DEFAULT 25.00,
                paper_sizes JSON NULL,
                size_rates JSON NULL,
                finishing_options JSON NULL,
                bulk_discounts JSON NULL,
                field_schema JSON NULL,
                requires_manual_quote TINYINT(1) NOT NULL DEFAULT 1,
                internal_cost_estimate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_psc_active (is_active, display_order)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'printing_delivery_zones' => 'CREATE TABLE IF NOT EXISTS printing_delivery_zones (
                id VARCHAR(36) PRIMARY KEY,
                zone_key VARCHAR(64) NOT NULL UNIQUE,
                destination_group VARCHAR(120) NOT NULL,
                lga_lcda VARCHAR(150) NOT NULL,
                towns_covered TEXT NULL,
                pricing_mode ENUM("fixed", "manual_quote", "free") NOT NULL DEFAULT "fixed",
                fixed_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                free_delivery_enabled TINYINT(1) NOT NULL DEFAULT 0,
                free_delivery_min_order DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                estimated_eta VARCHAR(100) NULL DEFAULT "Same Day / Next Business Day",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_pdz_active (is_active, display_order)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'printing_orders' => 'CREATE TABLE IF NOT EXISTS printing_orders (
                id VARCHAR(36) PRIMARY KEY,
                order_reference VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                customer_name VARCHAR(191) NOT NULL,
                customer_email VARCHAR(191) NOT NULL,
                customer_phone VARCHAR(40) NOT NULL,
                category_key VARCHAR(64) NOT NULL,
                category_name VARCHAR(150) NOT NULL,
                service_title VARCHAR(191) NOT NULL,
                status ENUM(
                    "Pending Review",
                    "Under Review",
                    "Awaiting Quotation",
                    "Quotation Sent",
                    "Awaiting Payment",
                    "Payment Confirmed",
                    "Processing",
                    "On Hold",
                    "Ready for Collection",
                    "Ready for Dispatch",
                    "Out for Delivery",
                    "Completed",
                    "Rejected",
                    "Cancelled",
                    "Refunded"
                ) NOT NULL DEFAULT "Pending Review",
                specs JSON NULL,
                uploaded_files JSON NULL,
                quantity INT NOT NULL DEFAULT 1,
                color_mode ENUM("bw", "color", "mixed", "full_color") NOT NULL DEFAULT "bw",
                paper_size VARCHAR(80) NULL,
                width_ft DECIMAL(10, 2) NULL,
                height_ft DECIMAL(10, 2) NULL,
                sq_ft DECIMAL(12, 2) NULL,
                finishing_requirements JSON NULL,
                is_urgent TINYINT(1) NOT NULL DEFAULT 0,
                special_instructions TEXT NULL,
                estimated_printing_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                printing_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                finishing_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                urgent_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                delivery_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                deposit_enabled TINYINT(1) NOT NULL DEFAULT 0,
                deposit_percent DECIMAL(6, 2) NOT NULL DEFAULT 50.00,
                deposit_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                required_initial_payment DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                balance_due DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                payment_status ENUM("unpaid", "deposit_paid", "partially_paid", "paid", "refunded") NOT NULL DEFAULT "unpaid",
                delivery_payment_status ENUM("not_applicable", "pending", "paid", "free_authorized") NOT NULL DEFAULT "not_applicable",
                quote_notes TEXT NULL,
                quote_sent_at DATETIME NULL,
                quote_responded_at DATETIME NULL,
                quote_decision ENUM("pending", "approved", "declined") NOT NULL DEFAULT "pending",
                quote_decline_reason TEXT NULL,
                collection_method ENUM("office_collection", "paid_delivery") NOT NULL DEFAULT "office_collection",
                delivery_zone_id VARCHAR(36) NULL,
                delivery_recipient_name VARCHAR(191) NULL,
                delivery_recipient_phone VARCHAR(40) NULL,
                delivery_destination VARCHAR(120) NULL,
                delivery_lga_lcda VARCHAR(150) NULL,
                delivery_town VARCHAR(150) NULL,
                delivery_address TEXT NULL,
                delivery_landmark VARCHAR(255) NULL,
                free_delivery_authorized TINYINT(1) NOT NULL DEFAULT 0,
                dispatch_confirmed TINYINT(1) NOT NULL DEFAULT 0,
                dispatch_confirmed_by VARCHAR(36) NULL,
                dispatch_confirmed_by_name VARCHAR(191) NULL,
                dispatch_confirmed_at DATETIME NULL,
                tracking_note TEXT NULL,
                assigned_staff_id VARCHAR(36) NULL,
                assigned_staff_name VARCHAR(191) NULL,
                internal_production_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                internal_notes TEXT NULL,
                due_date DATE NULL,
                completed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_po_user (user_id, created_at),
                INDEX idx_po_status (status, created_at),
                INDEX idx_po_cat (category_key),
                INDEX idx_po_staff (assigned_staff_id),
                INDEX idx_po_pay (payment_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'printing_order_status_history' => 'CREATE TABLE IF NOT EXISTS printing_order_status_history (
                id VARCHAR(36) PRIMARY KEY,
                order_id VARCHAR(36) NOT NULL,
                from_status VARCHAR(64) NULL,
                to_status VARCHAR(64) NOT NULL,
                actor_id VARCHAR(36) NULL,
                actor_name VARCHAR(191) NOT NULL,
                actor_role VARCHAR(50) NOT NULL DEFAULT "system",
                note TEXT NULL,
                metadata JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_posh_order (order_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'printing_order_messages' => 'CREATE TABLE IF NOT EXISTS printing_order_messages (
                id VARCHAR(36) PRIMARY KEY,
                order_id VARCHAR(36) NOT NULL,
                sender_id VARCHAR(36) NOT NULL,
                sender_name VARCHAR(191) NOT NULL,
                sender_role VARCHAR(50) NOT NULL DEFAULT "customer",
                message TEXT NOT NULL,
                attachment_url VARCHAR(500) NULL,
                is_internal TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pom_order (order_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'printing_payments' => 'CREATE TABLE IF NOT EXISTS printing_payments (
                id VARCHAR(36) PRIMARY KEY,
                order_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                reference VARCHAR(100) NOT NULL UNIQUE,
                payment_scope ENUM("full", "deposit", "balance", "delivery") NOT NULL DEFAULT "full",
                gateway ENUM("wallet", "paystack", "flutterwave", "manual_transfer", "cash", "pos") NOT NULL DEFAULT "wallet",
                amount DECIMAL(15, 2) NOT NULL,
                status ENUM("pending", "confirmed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                proof_url VARCHAR(500) NULL,
                payer_name VARCHAR(191) NULL,
                bank_reference VARCHAR(120) NULL,
                remarks TEXT NULL,
                confirmed_by VARCHAR(36) NULL,
                confirmed_by_name VARCHAR(191) NULL,
                confirmed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pp_order (order_id, status),
                INDEX idx_pp_user (user_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tables as $name => $ddl) {
            try {
                $db->execute($ddl);
                $applied[] = "table:{$name}";
            } catch (Throwable $e) {
                $errors[] = "table:{$name} => " . $e->getMessage();
            }
        }

        try {
            $hasCol = $db->fetchOne('SHOW COLUMNS FROM role_dashboard_configs LIKE "has_unpublished_changes"');
            if (!$hasCol) {
                $db->execute('ALTER TABLE role_dashboard_configs ADD COLUMN has_unpublished_changes TINYINT(1) NOT NULL DEFAULT 0 AFTER published_config');
                $applied[] = 'col:role_dashboard_configs.has_unpublished_changes';
            }
            $hasCreated = $db->fetchOne('SHOW COLUMNS FROM role_dashboard_configs LIKE "created_at"');
            if (!$hasCreated) {
                $db->execute('ALTER TABLE role_dashboard_configs ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER published_at');
                $applied[] = 'col:role_dashboard_configs.created_at';
            }
        } catch (Throwable $e) {
            $errors[] = 'col:role_dashboard_configs => ' . $e->getMessage();
        }

        // Register module in dashboard_modules idempotently
        try {
            $db->execute(
                'INSERT IGNORE INTO dashboard_modules
                 (id, module_key, name, description, icon, status, is_visible, coming_soon_message, display_order)
                 VALUES ("mod_printing", "printing", "Printing & Document Services", "Document printing, photocopying, large-format banners, plastic ID cards, photo printing & Lagos delivery.", "Printer", "active", 1, NULL, 7)'
            );
            $applied[] = 'module:printing';
        } catch (Throwable $e) {
            $errors[] = 'module:printing => ' . $e->getMessage();
        }

        // Seed 6 default configurable printing service categories (idempotent)
        $categories = [
            [
                'id' => 'pcat_doc',
                'category_key' => 'doc_printing',
                'name' => 'Document & Paper Printing',
                'description' => 'Examination papers, school documents, report sheets, business documents, company forms, office materials, political materials & commercial printing.',
                'icon' => 'FileText',
                'pricing_mode' => 'per_page',
                'measurement_method' => 'per_page',
                'unit_label' => 'page',
                'base_rate' => 50.00,
                'bw_rate' => 50.00,
                'color_rate' => 150.00,
                'min_quantity' => 1,
                'urgent_fee_type' => 'percent',
                'urgent_fee_value' => 25.00,
                'paper_sizes' => json_encode(['A4 (Standard)', 'A3 (Large)', 'A5 (Half Page)', 'Letter', 'Legal / Foolscap', 'Custom Paper Stock']),
                'size_rates' => json_encode(['A4 (Standard)' => 1.0, 'A3 (Large)' => 2.2, 'A5 (Half Page)' => 0.85, 'Letter' => 1.0, 'Legal / Foolscap' => 1.25, 'Custom Paper Stock' => 1.5]),
                'finishing_options' => json_encode([
                    ['code' => 'stapling', 'label' => 'Corner / Booklet Stapling', 'fee' => 200],
                    ['code' => 'spiral_binding', 'label' => 'Spiral Binding', 'fee' => 600],
                    ['code' => 'thermal_binding', 'label' => 'Thermal / Perfect Binding', 'fee' => 1200],
                    ['code' => 'lamination', 'label' => 'Lamination (Protective Gloss/Matte)', 'fee' => 300],
                    ['code' => 'double_sided', 'label' => 'Double-Sided (Duplex) Layout', 'fee' => 0],
                    ['code' => 'numbering_perforation', 'label' => 'Serial Numbering / Perforation', 'fee' => 1500],
                ]),
                'bulk_discounts' => json_encode([
                    ['min_qty' => 100, 'discount_percent' => 10, 'label' => '100+ pages: 10% off'],
                    ['min_qty' => 500, 'discount_percent' => 18, 'label' => '500+ pages: 18% off'],
                    ['min_qty' => 2000, 'discount_percent' => 25, 'label' => '2,000+ pages: 25% off'],
                ]),
                'field_schema' => json_encode([
                    ['key' => 'document_purpose', 'label' => 'Document Type / Purpose', 'type' => 'select', 'required' => true, 'options' => ['Examination Papers', 'School Documents / Report Sheets', 'Business Documents & Proposals', 'Company Forms / Invoices', 'Office Materials', 'Political / Campaign Materials', 'General Commercial Printing']],
                    ['key' => 'page_count', 'label' => 'Pages per Copy', 'type' => 'number', 'required' => true, 'default' => 1],
                    ['key' => 'paper_weight', 'label' => 'Paper Stock / Weight', 'type' => 'select', 'required' => false, 'options' => ['80gsm Bond (Standard)', '100gsm Conquerer / Office', '135gsm Art Paper', '250gsm Glossy Card', '300gsm Matte Card']],
                ]),
                'requires_manual_quote' => 1,
                'internal_cost_estimate' => 25.00,
                'display_order' => 1,
            ],
            [
                'id' => 'pcat_copy',
                'category_key' => 'photocopying',
                'name' => 'Photocopying',
                'description' => 'Fast, crisp photocopying for personal, educational, office & commercial multi-page documents.',
                'icon' => 'Copy',
                'pricing_mode' => 'photocopy',
                'measurement_method' => 'per_copy',
                'unit_label' => 'copy',
                'base_rate' => 30.00,
                'bw_rate' => 30.00,
                'color_rate' => 120.00,
                'min_quantity' => 5,
                'urgent_fee_type' => 'percent',
                'urgent_fee_value' => 20.00,
                'paper_sizes' => json_encode(['A4 (Standard)', 'A3 (Enlarged)', 'Foolscap / Legal']),
                'size_rates' => json_encode(['A4 (Standard)' => 1.0, 'A3 (Enlarged)' => 2.0, 'Foolscap / Legal' => 1.2]),
                'finishing_options' => json_encode([
                    ['code' => 'collating', 'label' => 'Set Collating & Sorting', 'fee' => 300],
                    ['code' => 'stapling', 'label' => 'Document Stapling', 'fee' => 200],
                    ['code' => 'spiral_binding', 'label' => 'Spiral Binding', 'fee' => 600],
                ]),
                'bulk_discounts' => json_encode([
                    ['min_qty' => 200, 'discount_percent' => 12, 'label' => '200+ copies: 12% off'],
                    ['min_qty' => 1000, 'discount_percent' => 22, 'label' => '1,000+ copies: 22% off'],
                ]),
                'field_schema' => json_encode([
                    ['key' => 'document_purpose', 'label' => 'Photocopy Category', 'type' => 'select', 'required' => true, 'options' => ['Personal Document', 'Educational / Handouts', 'Office / Administrative Pack', 'Commercial Bulk Pack']],
                    ['key' => 'page_count', 'label' => 'Original Pages to Copy', 'type' => 'number', 'required' => true, 'default' => 1],
                ]),
                'requires_manual_quote' => 1,
                'internal_cost_estimate' => 15.00,
                'display_order' => 2,
            ],
            [
                'id' => 'pcat_banner',
                'category_key' => 'banner_large_format',
                'name' => 'Banner & Large-Format Printing',
                'description' => 'High-resolution flex, SAV vinyl, roll-up stands, advertising, event, school & organisational banners priced per configurable foot basis.',
                'icon' => 'Maximize2',
                'pricing_mode' => 'banner_area',
                'measurement_method' => 'per_sq_ft',
                'unit_label' => 'sq.ft',
                'base_rate' => 650.00,
                'bw_rate' => 500.00,
                'color_rate' => 650.00,
                'min_quantity' => 1,
                'urgent_fee_type' => 'percent',
                'urgent_fee_value' => 30.00,
                'paper_sizes' => json_encode(['Flex Banner (Standard 440gsm)', 'SAV Self-Adhesive Sticker', 'Backlit / Billboard Vinyl', 'Reflective Banner', 'Roll-Up Stand Print']),
                'size_rates' => json_encode(['Flex Banner (Standard 440gsm)' => 1.0, 'SAV Self-Adhesive Sticker' => 1.35, 'Backlit / Billboard Vinyl' => 1.6, 'Reflective Banner' => 1.85, 'Roll-Up Stand Print' => 1.5]),
                'finishing_options' => json_encode([
                    ['code' => 'eyelets', 'label' => 'Metal Eyelets (Grommets)', 'fee' => 800],
                    ['code' => 'wood_pocket', 'label' => 'Top & Bottom Pipe/Wood Pockets', 'fee' => 1000],
                    ['code' => 'hemming', 'label' => 'Reinforced Edge Hemming', 'fee' => 700],
                    ['code' => 'wooden_frame', 'label' => 'Wooden Mounting Frame', 'fee' => 4500],
                    ['code' => 'rollup_hardware', 'label' => 'Broad-Base Aluminum Roll-Up Stand', 'fee' => 28000],
                ]),
                'bulk_discounts' => json_encode([
                    ['min_qty' => 5, 'discount_percent' => 8, 'label' => '5+ banners: 8% off'],
                    ['min_qty' => 15, 'discount_percent' => 15, 'label' => '15+ banners: 15% off'],
                ]),
                'field_schema' => json_encode([
                    ['key' => 'banner_purpose', 'label' => 'Banner Category', 'type' => 'select', 'required' => true, 'options' => ['Business Advertising', 'Promotional Campaign', 'Event / Wedding / Celebration', 'School / Church / Organisation', 'Political / Outdoor Signage']],
                    ['key' => 'width_ft', 'label' => 'Width (Feet)', 'type' => 'number', 'required' => true, 'default' => 4],
                    ['key' => 'height_ft', 'label' => 'Height (Feet)', 'type' => 'number', 'required' => true, 'default' => 3],
                ]),
                'requires_manual_quote' => 1,
                'internal_cost_estimate' => 350.00,
                'display_order' => 3,
            ],
            [
                'id' => 'pcat_idcard',
                'category_key' => 'plastic_id_cards',
                'name' => 'Plastic ID Cards',
                'description' => 'Durable thermal-printed PVC plastic ID cards for staff, students, schools, companies & membership organisations.',
                'icon' => 'CreditCard',
                'pricing_mode' => 'per_card',
                'measurement_method' => 'per_card',
                'unit_label' => 'card',
                'base_rate' => 1500.00,
                'bw_rate' => 1200.00,
                'color_rate' => 1500.00,
                'min_quantity' => 1,
                'urgent_fee_type' => 'flat',
                'urgent_fee_value' => 2500.00,
                'paper_sizes' => json_encode(['CR80 Standard PVC (Double-Sided)', 'CR80 Standard PVC (Single-Sided)', 'Smart RFID / Proximity Card']),
                'size_rates' => json_encode(['CR80 Standard PVC (Double-Sided)' => 1.0, 'CR80 Standard PVC (Single-Sided)' => 0.85, 'Smart RFID / Proximity Card' => 1.6]),
                'finishing_options' => json_encode([
                    ['code' => 'lanyard_plain', 'label' => 'Plain Neck Lanyard + Casing', 'fee' => 500],
                    ['code' => 'lanyard_branded', 'label' => 'Branded Printed Lanyard + Holder', 'fee' => 1200],
                    ['code' => 'qr_barcode', 'label' => 'Variable QR / Barcode Data Encoding', 'fee' => 1000],
                ]),
                'bulk_discounts' => json_encode([
                    ['min_qty' => 20, 'discount_percent' => 10, 'label' => '20+ cards: 10% off'],
                    ['min_qty' => 50, 'discount_percent' => 20, 'label' => '50+ cards: 20% off'],
                    ['min_qty' => 200, 'discount_percent' => 30, 'label' => '200+ cards: 30% off'],
                ]),
                'field_schema' => json_encode([
                    ['key' => 'card_audience', 'label' => 'ID Card Type', 'type' => 'select', 'required' => true, 'options' => ['Staff / Corporate ID Card', 'Student / School ID Card', 'Organisation / Membership Card', 'Visitor / Event Pass']],
                    ['key' => 'double_sided', 'label' => 'Print Sides', 'type' => 'select', 'required' => true, 'options' => ['Double-Sided (Front & Back)', 'Single-Sided (Front Only)']],
                ]),
                'requires_manual_quote' => 1,
                'internal_cost_estimate' => 650.00,
                'display_order' => 4,
            ],
            [
                'id' => 'pcat_photo',
                'category_key' => 'photo_image_printing',
                'name' => 'Photo & Image Printing',
                'description' => 'Studio-grade passport photographs, general glossy/matte photos & high-clarity image prints.',
                'icon' => 'Image',
                'pricing_mode' => 'photo_unit',
                'measurement_method' => 'per_photo',
                'unit_label' => 'print',
                'base_rate' => 500.00,
                'bw_rate' => 400.00,
                'color_rate' => 500.00,
                'min_quantity' => 1,
                'urgent_fee_type' => 'flat',
                'urgent_fee_value' => 1000.00,
                'paper_sizes' => json_encode(['Passport Pack (4 Copies / Sheet)', '4x6 inches (Standard Photo)', '5x7 inches (Portrait)', '8x10 inches (Frame Size)', 'A4 Photo Paper Sheet']),
                'size_rates' => json_encode(['Passport Pack (4 Copies / Sheet)' => 1.2, '4x6 inches (Standard Photo)' => 1.0, '5x7 inches (Portrait)' => 1.6, '8x10 inches (Frame Size)' => 2.8, 'A4 Photo Paper Sheet' => 3.0]),
                'finishing_options' => json_encode([
                    ['code' => 'photo_lamination', 'label' => 'Crystal Photo Lamination', 'fee' => 400],
                    ['code' => 'frame_mounting', 'label' => 'Classic Wall Frame Mounting', 'fee' => 3500],
                    ['code' => 'background_cleanup', 'label' => 'Passport White/Blue Background Retouch', 'fee' => 500],
                ]),
                'bulk_discounts' => json_encode([
                    ['min_qty' => 25, 'discount_percent' => 10, 'label' => '25+ prints: 10% off'],
                    ['min_qty' => 100, 'discount_percent' => 20, 'label' => '100+ prints: 20% off'],
                ]),
                'field_schema' => json_encode([
                    ['key' => 'photo_type', 'label' => 'Photo Service Type', 'type' => 'select', 'required' => true, 'options' => ['Passport Photographs', 'General Photographs', 'Event / Studio Images', 'Graphic Artwork / Flyer Photo Print']],
                    ['key' => 'paper_finish', 'label' => 'Paper Finish', 'type' => 'select', 'required' => false, 'options' => ['High Gloss Photo Paper', 'Silky Matte Photo Paper', 'Luster Pro Paper']],
                ]),
                'requires_manual_quote' => 1,
                'internal_cost_estimate' => 200.00,
                'display_order' => 5,
            ],
            [
                'id' => 'pcat_custom',
                'category_key' => 'custom_print_quote',
                'name' => 'Custom & Special Printing Request',
                'description' => 'Manual quotation requests for flyers, receipt books, branded souvenirs, packaging, calendars, letterheads or special jobs.',
                'icon' => 'Sparkles',
                'pricing_mode' => 'custom_quote',
                'measurement_method' => 'manual',
                'unit_label' => 'job',
                'base_rate' => 0.00,
                'bw_rate' => 0.00,
                'color_rate' => 0.00,
                'min_quantity' => 1,
                'urgent_fee_type' => 'percent',
                'urgent_fee_value' => 25.00,
                'paper_sizes' => json_encode(['Custom Specification (Reviewed Manually)']),
                'size_rates' => json_encode(['Custom Specification (Reviewed Manually)' => 1.0]),
                'finishing_options' => json_encode([
                    ['code' => 'design_assistance', 'label' => 'Pre-Press Layout / Artwork Formatting', 'fee' => 2500],
                    ['code' => 'special_packaging', 'label' => 'Protective Carton Packaging', 'fee' => 1500],
                ]),
                'bulk_discounts' => json_encode([]),
                'field_schema' => json_encode([
                    ['key' => 'custom_item_type', 'label' => 'Requested Printing Product', 'type' => 'text', 'required' => true],
                ]),
                'requires_manual_quote' => 1,
                'internal_cost_estimate' => 0.00,
                'display_order' => 6,
            ],
        ];

        foreach ($categories as $c) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO printing_service_categories
                     (id, category_key, name, description, icon, pricing_mode, measurement_method, unit_label, base_rate, bw_rate, color_rate, min_quantity, urgent_fee_type, urgent_fee_value, paper_sizes, size_rates, finishing_options, bulk_discounts, field_schema, requires_manual_quote, internal_cost_estimate, is_active, display_order)
                     VALUES (:id, :category_key, :name, :description, :icon, :pricing_mode, :measurement_method, :unit_label, :base_rate, :bw_rate, :color_rate, :min_quantity, :urgent_fee_type, :urgent_fee_value, :paper_sizes, :size_rates, :finishing_options, :bulk_discounts, :field_schema, :requires_manual_quote, :internal_cost_estimate, 1, :display_order)',
                    $c
                );
                $applied[] = 'print_cat:' . $c['category_key'];
            } catch (Throwable $e) {
                $errors[] = 'print_cat:' . $c['category_key'] . ' => ' . $e->getMessage();
            }
        }

        // Seed configurable Lagos delivery zones (idempotent)
        $zones = [
            ['pzone_office_nearby', 'lagos_ibejulekki', 'Ibeju-Lekki & Sangotedo Axis', 'Ibeju-Lekki LGA / Lekki LCDA', 'Sangotedo, Abijo, Awoyaya, Lakowe, Bogije, Elemoro, Ibeju', 'fixed', 2000.00, 1, 50000.00, 'Same Day (2–5 hrs)', 1],
            ['pzone_etiosa', 'lagos_etiosa', 'Lekki, Ajah & Eti-Osa Axis', 'Eti-Osa LGA / Eti-Osa East LCDA', 'Ajah, Badore, Chevron, Lekki Phase 1, Ikate, Victoria Island, Ikoyi', 'fixed', 3500.00, 1, 75000.00, 'Same Day / Next Business Day', 2],
            ['pzone_island', 'lagos_island', 'Lagos Island Commercial Axis', 'Lagos Island LGA / East LCDA', 'Marina, CMS, Broad Street, Obalende, Idumota', 'fixed', 4000.00, 0, 0.00, 'Next Business Day', 3],
            ['pzone_mainland', 'lagos_mainland', 'Central Mainland (Yaba, Surulere, Ikeja)', 'Lagos Mainland / Surulere / Ikeja LGA', 'Yaba, Ebute Metta, Surulere, Ikeja, Maryland, Anthony, Gbagada', 'fixed', 4500.00, 0, 0.00, 'Next Business Day', 4],
            ['pzone_west', 'lagos_west', 'Alimosho, Agege, Oshodi & Amuwo Axis', 'Alimosho / Agege / Oshodi-Isolo / Amuwo-Odofin LGA', 'Egbeda, Idimu, Ikotun, Ipaja, Agege, Oshodi, Festac, Mile 2', 'fixed', 5500.00, 0, 0.00, '1–2 Business Days', 5],
            ['pzone_outskirts', 'lagos_outskirts', 'Ikorodu, Epe, Badagry & Custom Freight', 'Ikorodu / Epe / Badagry / Other Lagos LGAs', 'Ikorodu, Epe Town, Badagry, Bulk Bulk/Palletised School Deliveries', 'manual_quote', 0.00, 0, 0.00, 'Confirmed on Quotation', 6],
        ];
        foreach ($zones as $z) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO printing_delivery_zones
                     (id, zone_key, destination_group, lga_lcda, towns_covered, pricing_mode, fixed_fee, free_delivery_enabled, free_delivery_min_order, estimated_eta, is_active, display_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                    $z
                );
                $applied[] = 'print_zone:' . $z[1];
            } catch (Throwable $e) {
                $errors[] = 'print_zone:' . $z[1] . ' => ' . $e->getMessage();
            }
        }

        // Seed default printing module settings cleanly
        try {
            $defaultPrintSettings = [
                'office_collection_title' => 'HambakTech Main Office Collection Centre',
                'office_collection_address' => 'HambakTech Services Hub, Sangotedo / Ajah Corridor, Lagos State, Nigeria',
                'office_collection_hours' => 'Monday – Saturday, 8:30 AM – 6:00 PM',
                'printing_support_phone' => '09127469686',
                'printing_support_whatsapp' => '09155104724',
                'printing_support_email' => 'support@hambaktech.com.ng',
                'allow_deposit_default' => false,
                'default_deposit_percent' => 50,
                'max_upload_mb' => 15,
                'allowed_file_types' => ['PDF', 'DOC', 'DOCX', 'JPG', 'JPEG', 'PNG', 'WEBP', 'TIFF', 'CDR', 'AI', 'PSD', 'ZIP'],
                'collection_notice' => 'Office collection is completely free (₦0 delivery fee). Wait for your "Ready for Collection" notification before coming to pick up.',
                'delivery_notice' => 'Paid delivery operates across Lagos LGAs & LCDAs. Delivery fees are billed separately from printing charges and confirmed before dispatch.',
            ];
            $db->execute(
                'INSERT IGNORE INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, "printing_settings", :val, "printing", "Printing & Document Services Office Collection, Deposit & Delivery Settings", NOW())',
                [
                    'id' => Security::generateUuid(),
                    'val' => json_encode($defaultPrintSettings, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ]
            );
        } catch (Throwable $e) {
            $errors[] = 'setting:printing_settings => ' . $e->getMessage();
        }

        return ['applied' => $applied, 'errors' => $errors];
    }
}

