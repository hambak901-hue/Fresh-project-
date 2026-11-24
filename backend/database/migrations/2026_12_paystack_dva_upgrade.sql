-- ============================================================================
-- HAMBAK TECH & SERVICES — Paystack Dedicated Virtual Accounts (DVA) Upgrade
-- Non-destructive, idempotent MySQL 8.x migration.
-- Preserves all existing customer_virtual_accounts rows, wallets, and ledger history.
-- ============================================================================

-- 1. Conditionally extend `customer_virtual_accounts` for Paystack DVA fields
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'paystack_customer_code');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN paystack_customer_code VARCHAR(100) NULL AFTER provider', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'dedicated_account_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN dedicated_account_id BIGINT NULL AFTER paystack_customer_code', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'bank_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN bank_id INT NULL AFTER bank_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'bank_slug');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN bank_slug VARCHAR(80) NULL AFTER bank_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'account_name');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN account_name VARCHAR(191) NULL AFTER account_number', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'currency');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT ''NGN'' AFTER bank_slug', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'kyc_validation_status');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN kyc_validation_status ENUM(''unverified'', ''pending'', ''verified'', ''failed'') NOT NULL DEFAULT ''unverified'' AFTER account_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'assignment_status');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN assignment_status ENUM(''not_requested'', ''pending'', ''assigned'', ''failed'', ''deactivated'') NOT NULL DEFAULT ''not_requested'' AFTER kyc_validation_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'failure_reason');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN failure_reason TEXT NULL AFTER assignment_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'total_inflow');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN total_inflow DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER failure_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'last_funding_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN last_funding_at DATETIME NULL AFTER total_inflow', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'raw_assignment_payload');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN raw_assignment_payload JSON NULL AFTER last_funding_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'updated_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Indexes for fast webhook account resolution
SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND INDEX_NAME = 'idx_va_paystack_customer');
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD INDEX idx_va_paystack_customer (paystack_customer_code)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND INDEX_NAME = 'idx_va_dedicated_id');
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD INDEX idx_va_dedicated_id (dedicated_account_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Create `paystack_dva_settlements` for gross, charge, net credit & replay protection
CREATE TABLE IF NOT EXISTS paystack_dva_settlements (
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
    net_credit_amount DECIMAL(15, 2) NOT NULL,
    fee_bearer ENUM('customer', 'merchant') NOT NULL DEFAULT 'customer',
    currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
    sender_bank VARCHAR(120) NULL,
    sender_account_name VARCHAR(191) NULL,
    sender_account_number_masked VARCHAR(40) NULL,
    session_id VARCHAR(120) NULL,
    settlement_status ENUM('settled', 'under_review', 'failed') NOT NULL DEFAULT 'settled',
    wallet_transaction_id VARCHAR(36) NULL,
    raw_payload JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dva_settle_user (user_id, created_at),
    INDEX idx_dva_settle_acc (account_number),
    INDEX idx_dva_settle_status (settlement_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
