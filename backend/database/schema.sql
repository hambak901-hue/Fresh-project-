-- ==============================================================================
-- HAMBAKTECH ENTERPRISE PORTAL - COMPLETE NORMALIZED MYSQL / MARIADB SCHEMA
-- Target Environment: cPanel Shared Hosting (MySQL 8.0+ / MariaDB 10.5+)
-- Designed for Phase 1 Foundation & System Architecture
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- 1. ROLES
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. PERMISSIONS
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `module` VARCHAR(50) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_module_action` (`module`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. ROLE_PERMISSIONS (Pivot)
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. USERS
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `phone_number` VARCHAR(32) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `user_type` ENUM('customer', 'admin', 'superadmin') NOT NULL DEFAULT 'customer',
  `status` ENUM('active', 'inactive', 'suspended', 'banned') NOT NULL DEFAULT 'active',
  `two_factor_enabled` TINYINT(1) DEFAULT 0,
  `two_factor_secret` VARCHAR(255) NULL,
  `email_verified_at` TIMESTAMP NULL,
  `phone_verified_at` TIMESTAMP NULL,
  `last_login_at` TIMESTAMP NULL,
  `last_login_ip` VARCHAR(45) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_phone` (`phone_number`),
  INDEX `idx_users_type_status` (`user_type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. USER_ROLES (Pivot)
CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. CUSTOMER_PROFILES
CREATE TABLE IF NOT EXISTS `customer_profiles` (
  `user_id` BIGINT UNSIGNED PRIMARY KEY,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `middle_name` VARCHAR(100) NULL,
  `avatar_url` VARCHAR(255) NULL,
  `address` TEXT NULL,
  `city` VARCHAR(100) NULL,
  `state` VARCHAR(100) NULL,
  `country` VARCHAR(100) DEFAULT 'Nigeria',
  `referral_code` VARCHAR(50) NOT NULL UNIQUE,
  `referred_by_id` BIGINT UNSIGNED NULL,
  `pricing_tier_id` INT UNSIGNED DEFAULT 1,
  `kyc_tier` TINYINT UNSIGNED DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`referred_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_referral_code` (`referral_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. ADMIN_ACCOUNTS
CREATE TABLE IF NOT EXISTS `admin_accounts` (
  `user_id` BIGINT UNSIGNED PRIMARY KEY,
  `department` VARCHAR(100) NULL,
  `super_admin_level` TINYINT UNSIGNED DEFAULT 1,
  `allowed_ips` TEXT NULL,
  `can_manage_finances` TINYINT(1) DEFAULT 0,
  `can_manage_kyc` TINYINT(1) DEFAULT 1,
  `can_manage_services` TINYINT(1) DEFAULT 1,
  `can_view_logs` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. WALLETS
CREATE TABLE IF NOT EXISTS `wallets` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `balance` DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  `ledger_balance` DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  `locked_balance` DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'NGN',
  `status` ENUM('active', 'frozen', 'restricted') NOT NULL DEFAULT 'active',
  `version` BIGINT UNSIGNED NOT NULL DEFAULT 0, -- Optimistic locking
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. WALLET_LEDGER (Double-Entry Immutable Accounting)
CREATE TABLE IF NOT EXISTS `wallet_ledger` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `transaction_reference` VARCHAR(100) NOT NULL,
  `entry_type` ENUM('credit', 'debit') NOT NULL,
  `amount` DECIMAL(15, 4) NOT NULL,
  `balance_before` DECIMAL(15, 4) NOT NULL,
  `balance_after` DECIMAL(15, 4) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT,
  INDEX `idx_ledger_wallet` (`wallet_id`, `created_at`),
  INDEX `idx_ledger_reference` (`transaction_reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. TRANSACTIONS
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reference` VARCHAR(100) NOT NULL UNIQUE,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('credit', 'debit') NOT NULL,
  `category` ENUM('wallet_funding', 'nin_verification', 'bvn_verification', 'data_purchase', 'airtime_topup', 'cable_subscription', 'electricity_bill', 'academy_enrollment', 'store_purchase', 'refund', 'manual_adjustment') NOT NULL,
  `amount` DECIMAL(15, 4) NOT NULL,
  `fee` DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
  `balance_before` DECIMAL(15, 4) NOT NULL,
  `balance_after` DECIMAL(15, 4) NOT NULL,
  `payment_method` VARCHAR(50) DEFAULT 'wallet',
  `gateway` VARCHAR(50) NULL,
  `gateway_reference` VARCHAR(100) NULL,
  `status` ENUM('pending', 'successful', 'failed', 'reversed', 'cancelled') NOT NULL DEFAULT 'pending',
  `metadata` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`),
  INDEX `idx_txn_user_status` (`user_id`, `status`),
  INDEX `idx_txn_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. SERVICE_CATEGORIES
CREATE TABLE IF NOT EXISTS `service_categories` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `icon` VARCHAR(100) NULL,
  `description` VARCHAR(255) NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. SERVICE_CATALOGUE
CREATE TABLE IF NOT EXISTS `service_catalogue` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT UNSIGNED NOT NULL,
  `service_code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `service_type` ENUM('identity_nin', 'identity_bvn', 'telecom_data', 'telecom_airtime', 'bill_cable', 'bill_electricity', 'academy', 'digital_store') NOT NULL,
  `description` TEXT NULL,
  `form_fields_schema` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. PROVIDERS
CREATE TABLE IF NOT EXISTS `providers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `provider_code` VARCHAR(50) NOT NULL UNIQUE, -- '2sureverify', 'veripine', 'ulamadata', 'vtpass'
  `name` VARCHAR(100) NOT NULL,
  `category` ENUM('identity', 'telecom', 'bills', 'sms') NOT NULL,
  `base_url` VARCHAR(255) NOT NULL,
  `balance` DECIMAL(15, 2) DEFAULT 0.00,
  `currency` VARCHAR(10) DEFAULT 'NGN',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `priority` INT NOT NULL DEFAULT 1,
  `failover_provider_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. PROVIDER_CREDENTIALS (Encrypted Storage)
CREATE TABLE IF NOT EXISTS `provider_credentials` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `provider_id` INT UNSIGNED NOT NULL,
  `environment` ENUM('sandbox', 'production') NOT NULL DEFAULT 'production',
  `api_key_encrypted` TEXT NOT NULL,
  `public_key_encrypted` TEXT NULL,
  `secret_key_encrypted` TEXT NULL,
  `custom_headers` JSON NULL,
  `extra_params` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. PROVIDER_SERVICE_MAPPINGS
CREATE TABLE IF NOT EXISTS `provider_service_mappings` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `service_id` INT UNSIGNED NOT NULL,
  `provider_id` INT UNSIGNED NOT NULL,
  `provider_service_code` VARCHAR(100) NOT NULL,
  `provider_plan_id` VARCHAR(100) NULL,
  `cost_price` DECIMAL(10, 2) NOT NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`service_id`) REFERENCES `service_catalogue`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uk_provider_service` (`service_id`, `provider_id`, `provider_service_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. CUSTOMER_SELLING_PRICES (Tiered Pricing: 1=Standard, 2=Reseller, 3=API/Partner)
CREATE TABLE IF NOT EXISTS `customer_selling_prices` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `service_id` INT UNSIGNED NOT NULL,
  `tier_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `selling_price` DECIMAL(10, 2) NOT NULL,
  `discount_percentage` DECIMAL(5, 2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`service_id`) REFERENCES `service_catalogue`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uk_service_tier` (`service_id`, `tier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. ORDERS
CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(100) NOT NULL UNIQUE,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `service_id` INT UNSIGNED NOT NULL,
  `provider_id` INT UNSIGNED NOT NULL,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `recipient` VARCHAR(100) NOT NULL, -- Phone number, NIN, Meter number, etc.
  `cost_price` DECIMAL(10, 2) NOT NULL,
  `selling_price` DECIMAL(10, 2) NOT NULL,
  `profit` DECIMAL(10, 2) NOT NULL,
  `provider_reference` VARCHAR(100) NULL,
  `provider_response` JSON NULL,
  `status` ENUM('pending', 'processing', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  `error_message` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`service_id`) REFERENCES `service_catalogue`(`id`),
  FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`),
  FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`),
  INDEX `idx_order_user` (`user_id`, `created_at`),
  INDEX `idx_order_recipient` (`recipient`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. PAYMENT_GATEWAYS
CREATE TABLE IF NOT EXISTS `payment_gateways` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(50) NOT NULL UNIQUE, -- 'flutterwave', 'paystack', 'moniepoint_bank'
  `name` VARCHAR(100) NOT NULL,
  `fee_type` ENUM('flat', 'percentage') DEFAULT 'percentage',
  `fee_value` DECIMAL(6, 2) DEFAULT 1.40,
  `fee_cap` DECIMAL(10, 2) DEFAULT 2000.00,
  `is_active` TINYINT(1) DEFAULT 1,
  `credentials` JSON NULL,
  `webhook_secret` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. MANUAL_FUNDING_REQUESTS
CREATE TABLE IF NOT EXISTS `manual_funding_requests` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `bank_name` VARCHAR(100) NOT NULL,
  `account_number` VARCHAR(50) NOT NULL,
  `sender_name` VARCHAR(100) NOT NULL,
  `payment_proof_url` VARCHAR(255) NULL,
  `bank_reference` VARCHAR(100) NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `rejection_reason` VARCHAR(255) NULL,
  `reviewed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. KYC_RECORDS
CREATE TABLE IF NOT EXISTS `kyc_records` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `tier_requested` TINYINT UNSIGNED NOT NULL,
  `id_type` ENUM('nin', 'bvn', 'voters_card', 'drivers_license', 'international_passport') NOT NULL,
  `id_number` VARCHAR(100) NOT NULL,
  `document_front_url` VARCHAR(255) NOT NULL,
  `document_back_url` VARCHAR(255) NULL,
  `selfie_url` VARCHAR(255) NOT NULL,
  `utility_bill_url` VARCHAR(255) NULL,
  `status` ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  `rejection_notes` TEXT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`),
  INDEX `idx_kyc_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `body` TEXT NOT NULL,
  `type` ENUM('info', 'success', 'warning', 'danger', 'announcement') DEFAULT 'info',
  `action_url` VARCHAR(255) NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_notif_user_read` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. MESSAGES (Support Tickets & Helpdesk)
CREATE TABLE IF NOT EXISTS `messages` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_number` VARCHAR(50) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `sender_type` ENUM('customer', 'admin', 'system') NOT NULL,
  `status` ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
  `attachment_url` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_ticket` (`ticket_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. WEBSITE_CONTENT (CMS & Marketing Pages)
CREATE TABLE IF NOT EXISTS `website_content` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `page_slug` VARCHAR(100) NOT NULL,
  `section_key` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255) NULL,
  `subtitle` TEXT NULL,
  `content_json` JSON NULL,
  `is_published` TINYINT(1) DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_page_section` (`page_slug`, `section_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. SYSTEM_SETTINGS
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(100) PRIMARY KEY,
  `setting_group` ENUM('general', 'branding', 'smtp', 'security', 'pricing', 'providers') NOT NULL DEFAULT 'general',
  `setting_value` TEXT NOT NULL,
  `value_type` ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  `description` VARCHAR(255) NULL,
  `is_public` TINYINT(1) DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. AUDIT_LOGS
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NULL,
  `user_email` VARCHAR(191) NULL,
  `event` VARCHAR(100) NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `details` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_event` (`event`),
  INDEX `idx_audit_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
