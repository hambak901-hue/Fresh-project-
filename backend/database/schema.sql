-- ==============================================================================
-- HAMBAKTECH ENTERPRISE PORTAL — HIGH RELIABILITY PRODUCTION DATABASE SCHEMA
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- Storage Engine: InnoDB (Full ACID, Row-Level Locking, Foreign Key Constraints)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS support_replies;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS academy_courses;
DROP TABLE IF EXISTS store_items;
DROP TABLE IF EXISTS dashboard_modules;
DROP TABLE IF EXISTS navigation_menus;
DROP TABLE IF EXISTS faqs;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS website_branding;
DROP TABLE IF EXISTS cms_sections;
DROP TABLE IF EXISTS cms_pages;
DROP TABLE IF EXISTS sms_configs;
DROP TABLE IF EXISTS smtp_configs;
DROP TABLE IF EXISTS sms_templates;
DROP TABLE IF EXISTS email_templates;
DROP TABLE IF EXISTS customer_messages;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS kyc_submissions;
DROP TABLE IF EXISTS bulk_sms_records;
DROP TABLE IF EXISTS airtime_swap_configs;
DROP TABLE IF EXISTS exam_packages;
DROP TABLE IF EXISTS electricity_discos;
DROP TABLE IF EXISTS cable_packages;
DROP TABLE IF EXISTS data_pin_denominations;
DROP TABLE IF EXISTS airtime_pin_denominations;
DROP TABLE IF EXISTS telecom_orders;
DROP TABLE IF EXISTS telecom_plans;
DROP TABLE IF EXISTS verification_records;
DROP TABLE IF EXISTS provider_logs;
DROP TABLE IF EXISTS provider_service_mappings;
DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS service_catalogue;
DROP TABLE IF EXISTS service_categories;
DROP TABLE IF EXISTS manual_funding_requests;
DROP TABLE IF EXISTS payment_records;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS wallet_ledger;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS staff_accounts;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS system_settings;
SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 1. ROLES & PERMISSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
    role_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. USERS & PROFILES
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(191) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    role ENUM('customer', 'admin', 'superadmin') NOT NULL DEFAULT 'customer',
    wallet_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    kyc_status ENUM('unverified', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'unverified',
    tier INT NOT NULL DEFAULT 1,
    referral_code VARCHAR(50) NOT NULL UNIQUE,
    status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    avatar_url VARCHAR(500) NULL,
    transaction_pin_hash VARCHAR(255) NULL,
    email_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_role (role),
    INDEX idx_user_status (status),
    INDEX idx_user_phone (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_profiles (
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
    CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_nin (nin),
    INDEX idx_user_bvn (bvn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_accounts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    department VARCHAR(100) NOT NULL,
    access_level ENUM('analyst', 'manager', 'executive', 'superadmin') NOT NULL DEFAULT 'analyst',
    can_fund_wallets TINYINT(1) NOT NULL DEFAULT 0,
    can_modify_rates TINYINT(1) NOT NULL DEFAULT 0,
    can_suspend_users TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. FINANCIAL INTEGRITY: WALLETS & IMMUTABLE LEDGER
-- -----------------------------------------------------------------------------
CREATE TABLE wallets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
    ledger_version BIGINT NOT NULL DEFAULT 0,
    status ENUM('active', 'frozen', 'closed') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_wallet_non_negative CHECK (balance >= 0.00),
    CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_wallet_balance (balance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wallet_ledger (
    id VARCHAR(36) PRIMARY KEY,
    wallet_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    entry_type ENUM('CREDIT', 'DEBIT') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    reference VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ledger_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_ledger_user_created (user_id, created_at),
    INDEX idx_ledger_ref (reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transactions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type ENUM('credit', 'debit') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    reference VARCHAR(100) NOT NULL UNIQUE,
    idempotency_key VARCHAR(100) NULL UNIQUE,
    gateway ENUM('flutterwave', 'paystack', 'manual_transfer', 'internal') NOT NULL DEFAULT 'internal',
    status ENUM('successful', 'pending', 'failed') NOT NULL DEFAULT 'pending',
    description TEXT NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tx_user_status (user_id, status),
    INDEX idx_tx_category (category),
    INDEX idx_tx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_records (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    gateway VARCHAR(50) NOT NULL,
    reference VARCHAR(100) NOT NULL UNIQUE,
    amount DECIMAL(15, 2) NOT NULL,
    fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'successful', 'failed', 'abandoned') NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP NULL,
    raw_response JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_payment_ref (reference),
    INDEX idx_payment_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_funding_requests (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    payment_reference VARCHAR(100) NULL,
    payment_date DATE NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
    depositor_name VARCHAR(191) NOT NULL,
    remarks TEXT NULL,
    teller_proof_url VARCHAR(500) NULL,
    proof_filename VARCHAR(255) NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    admin_notes TEXT NULL,
    reviewed_by VARCHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_manual_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_manual_status (status),
    INDEX idx_manual_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_virtual_accounts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL DEFAULT 'flutterwave',
    order_ref VARCHAR(100) NOT NULL UNIQUE,
    flw_ref VARCHAR(100) NULL,
    account_number VARCHAR(30) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_status ENUM('active', 'inactive', 'pending_approval') NOT NULL DEFAULT 'pending_approval',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_va_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_va_account (account_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. SERVICE CATALOGUE & PROVIDER MANAGEMENT
-- -----------------------------------------------------------------------------
CREATE TABLE service_categories (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'Cpu',
    display_order INT NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE providers (
    id VARCHAR(50) PRIMARY KEY, -- e.g. '2sureverify', 'veripine', 'ulamadata', 'vtpass', 'paystack'
    name VARCHAR(100) NOT NULL,
    provider_type ENUM('identity', 'telecom', 'payment') NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) NULL,
    secret_key VARCHAR(255) NULL,
    public_key VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    timeout_seconds INT NOT NULL DEFAULT 30,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    last_ping_status ENUM('operational', 'error', 'untested') NOT NULL DEFAULT 'untested',
    last_ping_latency INT NULL,
    last_ping_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_catalogue (
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
    slip_type_supported TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cat_category FOREIGN KEY (category_id) REFERENCES service_categories(id),
    CONSTRAINT fk_cat_provider FOREIGN KEY (provider_id) REFERENCES providers(id),
    INDEX idx_service_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE provider_service_mappings (
    id VARCHAR(36) PRIMARY KEY,
    provider_id VARCHAR(50) NOT NULL,
    service_key VARCHAR(100) NOT NULL,
    provider_endpoint VARCHAR(255) NOT NULL,
    provider_plan_code VARCHAR(100) NULL,
    wholesale_cost DECIMAL(15, 2) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_psm_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    INDEX idx_psm_lookup (service_key, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE provider_logs (
    id VARCHAR(36) PRIMARY KEY,
    provider_id VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'POST',
    status_code INT NOT NULL,
    request_body LONGTEXT NULL,
    response_body LONGTEXT NULL,
    latency_ms INT NOT NULL DEFAULT 0,
    reference VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pl_provider (provider_id),
    INDEX idx_pl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE verification_records (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,
    service_key VARCHAR(100) NULL,
    search_value VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    cost DECIMAL(15, 2) NOT NULL,
    provider_cost DECIMAL(15, 2) NULL,
    status ENUM('completed', 'failed', 'pending') NOT NULL DEFAULT 'pending',
    reference VARCHAR(100) NULL UNIQUE,
    slip_type VARCHAR(50) NULL,
    has_slip TINYINT(1) NOT NULL DEFAULT 0,
    result_data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_vr_user (user_id),
    INDEX idx_vr_search (search_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. TELECOMMUNICATIONS SUITE
-- -----------------------------------------------------------------------------
CREATE TABLE telecom_plans (
    id VARCHAR(36) PRIMARY KEY,
    provider_plan_id VARCHAR(50) NOT NULL,
    network ENUM('MTN', 'AIRTEL', 'GLO', '9MOBILE') NOT NULL,
    name VARCHAR(100) NOT NULL,
    size VARCHAR(50) NOT NULL,
    plan_type ENUM('SME', 'Corporate', 'Gifting', 'Direct') NOT NULL DEFAULT 'SME',
    validity VARCHAR(50) NOT NULL DEFAULT '30 Days',
    wholesale_cost DECIMAL(15, 2) NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    provider_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_telecom_network (network, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE telecom_orders (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    service_type ENUM('data', 'airtime', 'airtime_pin', 'airtime_swap', 'cable', 'data_pin', 'bulksms', 'electricity', 'exam') NOT NULL,
    network VARCHAR(50) NULL,
    phone VARCHAR(30) NULL,
    plan VARCHAR(100) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    cost_price DECIMAL(15, 2) NOT NULL,
    profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    provider_id VARCHAR(50) NOT NULL,
    provider_ref VARCHAR(100) NOT NULL,
    status ENUM('successful', 'pending', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_to_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_to_user (user_id),
    INDEX idx_to_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE airtime_pin_denominations (
    id VARCHAR(36) PRIMARY KEY,
    network ENUM('MTN', 'AIRTEL', 'GLO', '9MOBILE') NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    wholesale_cost DECIMAL(10, 2) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE data_pin_denominations (
    id VARCHAR(36) PRIMARY KEY,
    network ENUM('MTN', 'AIRTEL', 'GLO', '9MOBILE') NOT NULL,
    name VARCHAR(100) NOT NULL,
    size VARCHAR(50) NOT NULL,
    wholesale_cost DECIMAL(10, 2) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cable_packages (
    id VARCHAR(36) PRIMARY KEY,
    provider ENUM('dstv', 'gotv', 'startimes', 'showmax') NOT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL,
    channels INT NOT NULL DEFAULT 0,
    wholesale_cost DECIMAL(15, 2) NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE electricity_discos (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    minimum_amount DECIMAL(15, 2) NOT NULL DEFAULT 500.00,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_packages (
    id VARCHAR(36) PRIMARY KEY,
    exam_name ENUM('WAEC', 'NECO', 'NABTEB', 'JAMB') NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    wholesale_cost DECIMAL(15, 2) NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE airtime_swap_configs (
    id VARCHAR(36) PRIMARY KEY,
    network ENUM('MTN', 'AIRTEL', 'GLO', '9MOBILE') NOT NULL UNIQUE,
    conversion_rate_percent DECIMAL(5, 2) NOT NULL DEFAULT 80.00,
    merchant_phone VARCHAR(30) NOT NULL,
    ussd_code VARCHAR(100) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bulk_sms_records (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(20) NOT NULL,
    recipients_count INT NOT NULL,
    recipients_sample TEXT NOT NULL,
    message TEXT NOT NULL,
    pages INT NOT NULL DEFAULT 1,
    units_charged DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    status ENUM('DELIVERED', 'PENDING', 'FAILED') NOT NULL DEFAULT 'DELIVERED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bsms_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. KYC & VERIFICATION REPOSITORY
-- -----------------------------------------------------------------------------
CREATE TABLE kyc_submissions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    id_type VARCHAR(50) NOT NULL,
    id_number VARCHAR(100) NOT NULL,
    doc_url VARCHAR(500) NULL,
    status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
    review_notes TEXT NULL,
    reviewed_by VARCHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_kyc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. MESSAGING & NOTIFICATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(191) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'alert') NOT NULL DEFAULT 'info',
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    action_link VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_messages (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL, -- or 'all'
    title VARCHAR(191) NOT NULL,
    category ENUM('service', 'system', 'security', 'billing') NOT NULL DEFAULT 'system',
    body TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    reference VARCHAR(100) NULL,
    action_label VARCHAR(50) NULL,
    action_link VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_templates (
    id VARCHAR(36) PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    category ENUM('Auth', 'Wallet', 'Transactions', 'Services', 'Security', 'Admin') NOT NULL DEFAULT 'Auth',
    subject VARCHAR(255) NOT NULL,
    html_body LONGTEXT NOT NULL,
    description TEXT NULL,
    variables JSON NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sms_templates (
    id VARCHAR(36) PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    variables JSON NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE smtp_configs (
    id VARCHAR(36) PRIMARY KEY,
    host VARCHAR(191) NOT NULL,
    port INT NOT NULL DEFAULT 587,
    username VARCHAR(191) NOT NULL,
    password VARCHAR(255) NULL,
    encryption ENUM('tls', 'ssl', 'none') NOT NULL DEFAULT 'tls',
    sender_email VARCHAR(191) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    reply_to VARCHAR(191) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_tested_at TIMESTAMP NULL,
    last_test_status ENUM('operational', 'error', 'untested') NOT NULL DEFAULT 'untested',
    logs JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sms_configs (
    id VARCHAR(36) PRIMARY KEY,
    provider ENUM('termii', 'bulksms_nigeria', 'twilio', 'custom_webhook') NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    sender_id VARCHAR(20) NOT NULL,
    route ENUM('generic', 'dnd', 'whatsapp') NOT NULL DEFAULT 'generic',
    webhook_url VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    balance_units INT NOT NULL DEFAULT 0,
    logs JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. CMS & PUBLIC WEBSITE MANAGEMENT
-- -----------------------------------------------------------------------------
CREATE TABLE cms_pages (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(191) NOT NULL,
    content LONGTEXT NULL,
    meta_title VARCHAR(255) NULL,
    meta_description TEXT NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cms_sections (
    id VARCHAR(36) PRIMARY KEY,
    section_key VARCHAR(50) NOT NULL UNIQUE,
    section_data JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE website_branding (
    id VARCHAR(36) PRIMARY KEY,
    company_name VARCHAR(191) NOT NULL,
    tagline VARCHAR(255) NULL,
    logo_url VARCHAR(500) NULL,
    favicon_url VARCHAR(500) NULL,
    primary_color VARCHAR(20) NOT NULL DEFAULT '#10b981',
    secondary_color VARCHAR(20) NOT NULL DEFAULT '#0284c7',
    font_family VARCHAR(50) NOT NULL DEFAULT 'Plus Jakarta Sans',
    support_phone VARCHAR(50) NOT NULL,
    support_email VARCHAR(191) NOT NULL,
    office_address TEXT NOT NULL,
    whatsapp_number VARCHAR(50) NOT NULL,
    social_links JSON NULL,
    footer_text TEXT NULL,
    copyright_text VARCHAR(255) NULL,
    seo_title VARCHAR(255) NULL,
    seo_description TEXT NULL,
    seo_keywords TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO website_branding (id, company_name, tagline, logo_url, favicon_url, primary_color, secondary_color, font_family, support_phone, support_email, office_address, whatsapp_number, social_links, footer_text, copyright_text, seo_title, seo_description, seo_keywords)
VALUES ('brand_default_001', 'HambakTech Enterprise', 'Sovereign VTU, Telecom & Identity Verification', '/logo.svg', '/favicon.ico', '#10b981', '#0284c7', 'Plus Jakarta Sans', '+234 803 000 1122', 'support@hambaktech.com.ng', 'Lagos, Nigeria', '+2348030001122', '{"whatsapp":"https://wa.me/2348030001122"}', 'Nigeria\'s premier digital infrastructure platform for official identity verification, wholesale telecom vending, and automated digital payments.', '© 2026 Hambak Technologies Enterprise. All Rights Reserved.', 'HambakTech Enterprise Portal', 'All-in-one Nigerian VTU, identity verification (NIN/BVN), telecom, payments, academy, and digital services platform for HambakTech.', 'VTU, NIN, BVN, Telecom, Data, Airtime, Nigeria')
ON DUPLICATE KEY UPDATE company_name=VALUES(company_name);


CREATE TABLE announcements (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category ENUM('update', 'maintenance', 'offer', 'security', 'general') NOT NULL DEFAULT 'general',
    is_pinned TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('published', 'draft') NOT NULL DEFAULT 'published',
    author VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_anc_status_pinned (status, is_pinned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faqs (
    id VARCHAR(36) PRIMARY KEY,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE navigation_menus (
    id VARCHAR(36) PRIMARY KEY,
    menu_key VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL,
    page_key VARCHAR(50) NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dashboard_modules (
    id VARCHAR(36) PRIMARY KEY,
    module_key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    icon VARCHAR(50) NOT NULL,
    status ENUM('active', 'coming_soon', 'disabled') NOT NULL DEFAULT 'active',
    is_visible TINYINT(1) NOT NULL DEFAULT 1,
    coming_soon_message VARCHAR(255) NULL,
    display_order INT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 9. STORE & ACADEMY MODULES
-- -----------------------------------------------------------------------------
CREATE TABLE store_items (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    description TEXT NULL,
    image_url VARCHAR(500) NULL,
    status ENUM('active', 'draft', 'out_of_stock') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE academy_courses (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(191) NOT NULL,
    level VARCHAR(50) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    modules_count INT NOT NULL DEFAULT 1,
    price DECIMAL(15, 2) NOT NULL,
    description TEXT NULL,
    status ENUM('draft', 'enrolling', 'active') NOT NULL DEFAULT 'enrolling',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 10. SUPPORT & HELP CENTRE
-- -----------------------------------------------------------------------------
CREATE TABLE support_tickets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
    status ENUM('open', 'pending', 'resolved', 'closed') NOT NULL DEFAULT 'open',
    department VARCHAR(50) NOT NULL DEFAULT 'General',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_st_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_replies (
    id VARCHAR(36) PRIMARY KEY,
    ticket_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    is_staff TINYINT(1) NOT NULL DEFAULT 0,
    message TEXT NOT NULL,
    attachment_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sr_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 11. SYSTEM SETTINGS & AUDIT LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE system_settings (
    id VARCHAR(36) PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value LONGTEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    description TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE slip_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    demo_image_url VARCHAR(500) NULL,
    description TEXT NULL,
    supported_service VARCHAR(100) DEFAULT 'all_nin',
    is_active TINYINT(1) DEFAULT 1,
    display_order INT DEFAULT 1,
    badge VARCHAR(50) NULL,
    watermark_text VARCHAR(100) DEFAULT 'DEMO SPECIMEN - SAMPLE PREVIEW ONLY',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_security_rules (
    id VARCHAR(50) PRIMARY KEY,
    service_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    require_pin TINYINT(1) DEFAULT 1,
    min_tier INT DEFAULT 1,
    max_daily_limit DECIMAL(15, 2) DEFAULT 500000.00,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
