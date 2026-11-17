-- ==============================================================================
-- HAMBAKTECH — ADDITIVE PRODUCTION MIGRATION (REFERRAL, PIN & SECURITY UPGRADE)
-- Safe & Idempotent: Zero DROP statements; preserves all existing live records.
-- Target: MySQL 8.0+ / MariaDB 10.6+
-- ==============================================================================

-- 1. Safe additive columns on users (execute only missing columns if running manually on older MySQL < 8.0.29,
-- or prefer running POST /api/system/sync-schema which checks INFORMATION_SCHEMA.COLUMNS automatically).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS kyc_level INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(32) NULL,
    ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS assigned_permissions TEXT NULL,
    ADD COLUMN IF NOT EXISTS referred_by_user_id VARCHAR(36) NULL,
    ADD COLUMN IF NOT EXISTS referral_source VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS referral_campaign_code VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS referral_bound_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pin_locked_until DATETIME NULL,
    ADD COLUMN IF NOT EXISTS pin_set_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS pin_updated_by_admin_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mfa_method VARCHAR(24) NOT NULL DEFAULT 'email_otp',
    ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) NULL;

-- 2. Security, Session, Brute-Force Lockout, MFA & PIN Recovery Tables
CREATE TABLE IF NOT EXISTS user_sessions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
    id VARCHAR(36) PRIMARY KEY,
    identifier VARCHAR(191) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    last_attempt_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_la_ident_ip (identifier, ip_address),
    INDEX idx_la_locked (locked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfa_challenges (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    challenge_token VARCHAR(128) NOT NULL UNIQUE,
    method ENUM('email_otp', 'totp') NOT NULL DEFAULT 'email_otp',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_mfa_configs (
    user_id VARCHAR(36) PRIMARY KEY,
    totp_secret_encrypted TEXT NULL,
    totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
    email_otp_enabled TINYINT(1) NOT NULL DEFAULT 0,
    recovery_codes_hash JSON NULL,
    enabled_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pin_reset_requests (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Referral, Rewards, Points & Bank Withdrawal Tables
CREATE TABLE IF NOT EXISTS referral_campaigns (
    id VARCHAR(36) PRIMARY KEY,
    campaign_code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    reward_mode VARCHAR(32) NOT NULL DEFAULT 'fixed',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_tiers (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referrals (
    id VARCHAR(36) PRIMARY KEY,
    referrer_user_id VARCHAR(36) NOT NULL,
    referred_user_id VARCHAR(36) NOT NULL UNIQUE,
    referral_code_used VARCHAR(64) NOT NULL,
    attribution_channel VARCHAR(32) NOT NULL DEFAULT 'referral_link',
    campaign_code VARCHAR(64) NULL,
    risk_fingerprint VARCHAR(128) NULL,
    signup_ip VARCHAR(45) NULL,
    status ENUM('registered', 'qualified', 'flagged', 'blocked') NOT NULL DEFAULT 'registered',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_balances (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_rewards (
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
    reward_mode VARCHAR(32) NOT NULL DEFAULT 'fixed',
    reward_cash DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    reward_points INT NOT NULL DEFAULT 0,
    status ENUM('pending', 'available', 'reversed', 'rejected', 'paid_out', 'skipped') NOT NULL DEFAULT 'pending',
    status_reason TEXT NULL,
    settles_at DATETIME NULL,
    settled_at DATETIME NULL,
    reversed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_rr_referrer (referrer_user_id, status),
    INDEX idx_rr_referred (referred_user_id),
    INDEX idx_rr_settle (status, settles_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_points_ledger (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entry_type ENUM('CREDIT', 'DEBIT', 'REVERSAL') NOT NULL,
    points INT NOT NULL,
    balance_before INT NOT NULL DEFAULT 0,
    balance_after INT NOT NULL DEFAULT 0,
    reference VARCHAR(120) NOT NULL UNIQUE,
    naira_value DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    conversion_rate DECIMAL(15, 4) NOT NULL DEFAULT 1.0000,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rpl_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id VARCHAR(36) PRIMARY KEY,
    withdrawal_number VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(36) NOT NULL,
    bank_name VARCHAR(120) NOT NULL,
    account_number VARCHAR(30) NOT NULL,
    account_name VARCHAR(191) NOT NULL,
    gross_amount DECIMAL(15, 2) NOT NULL,
    fee_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    net_amount DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_audit_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed Default Starter Referral Tiers (Idempotent)
INSERT IGNORE INTO referral_tiers
    (id, tier_key, name, min_qualified_referrals, min_referred_volume, reward_multiplier, bonus_cash, bonus_points, reseller_only, display_order, is_active)
VALUES
    ('tier_bronze', 'bronze', 'Bronze Starter', 0, 0.00, 1.0000, 0.00, 0, 0, 1, 1),
    ('tier_silver', 'silver', 'Silver Partner', 5, 10000.00, 1.1500, 250.00, 50, 0, 2, 1),
    ('tier_gold', 'gold', 'Gold Ambassador', 15, 50000.00, 1.3000, 750.00, 150, 0, 3, 1),
    ('tier_platinum', 'platinum', 'Platinum Leader', 40, 150000.00, 1.5000, 2000.00, 400, 0, 4, 1);
