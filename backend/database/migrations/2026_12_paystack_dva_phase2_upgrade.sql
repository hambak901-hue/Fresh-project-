-- ============================================================================
-- HAMBAK TECH & SERVICES — Paystack Dedicated Virtual Accounts (Phase 2)
-- Non-destructive, idempotent MySQL 8.x migration.
-- Preserves all existing customer_virtual_accounts, wallets, and ledger history.
-- ============================================================================

-- 1. Extend `customer_virtual_accounts` with Phase 2 provisioning lifecycle columns
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'bank_code');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN bank_code VARCHAR(50) NULL AFTER bank_slug', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'dva_consent');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN dva_consent TINYINT(1) NOT NULL DEFAULT 0 AFTER kyc_validation_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'dva_consent_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN dva_consent_at DATETIME NULL AFTER dva_consent', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'provisioning_status');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN provisioning_status ENUM(''not_requested'', ''awaiting_customer_info'', ''pending_identification'', ''processing'', ''active'', ''failed'', ''suspended'', ''deactivated'', ''under_review'') NOT NULL DEFAULT ''not_requested'' AFTER assignment_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'error_code');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN error_code VARCHAR(80) NULL AFTER failure_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'assigned_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN assigned_at DATETIME NULL AFTER total_inflow', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND COLUMN_NAME = 'last_synced_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD COLUMN last_synced_at DATETIME NULL AFTER assigned_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_virtual_accounts' AND INDEX_NAME = 'idx_va_prov_status');
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE customer_virtual_accounts ADD INDEX idx_va_prov_status (provisioning_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Extend `user_profiles` for customer DVA consent & bank identification metadata
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'dva_consent');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE user_profiles ADD COLUMN dva_consent TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'dva_consent_at');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE user_profiles ADD COLUMN dva_consent_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'dva_bank_code');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE user_profiles ADD COLUMN dva_bank_code VARCHAR(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'dva_bank_account_last4');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE user_profiles ADD COLUMN dva_bank_account_last4 VARCHAR(10) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Backfill canonical provisioning_status from existing rows
UPDATE customer_virtual_accounts
   SET provisioning_status = CASE
           WHEN provider = 'paystack' AND assignment_status = 'assigned' AND account_status = 'active' AND account_number != '' THEN 'active'
           WHEN assignment_status = 'pending' THEN 'processing'
           WHEN assignment_status = 'failed' THEN 'failed'
           WHEN assignment_status = 'deactivated' THEN 'deactivated'
           ELSE provisioning_status
       END,
       assigned_at = CASE
           WHEN assigned_at IS NULL AND assignment_status = 'assigned' AND account_status = 'active' AND account_number != '' THEN COALESCE(updated_at, created_at)
           ELSE assigned_at
       END,
       bank_code = COALESCE(NULLIF(bank_code, ''), bank_slug)
 WHERE provisioning_status = 'not_requested';
