-- ============================================================================
-- HAMBAK TECH & SERVICES — Paystack Dedicated Virtual Accounts (Phase 4)
-- Automatic Transfer Detection, Quarantine, Reversal & Reconciliation Schema
-- Non-destructive, idempotent MySQL 8.x migration.
-- ============================================================================

-- 1. Extend `paystack_dva_settlements` ENUM to support disputed & reversed states
SET @enum_has_reversed := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'paystack_dva_settlements'
      AND COLUMN_NAME = 'settlement_status'
      AND COLUMN_TYPE LIKE '%reversed%'
);
SET @sql := IF(
    @enum_has_reversed = 0,
    'ALTER TABLE paystack_dva_settlements MODIFY COLUMN settlement_status ENUM(''settled'', ''under_review'', ''failed'', ''disputed'', ''reversed'') NOT NULL DEFAULT ''settled''',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Add Phase 4 fee separation, quarantine, and reversal/dispute tracking columns
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'customer_borne_fee');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER paystack_fee', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'merchant_borne_fee');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN merchant_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER customer_borne_fee', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'net_settlement_amount');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN net_settlement_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER net_credit_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'fee_confirmed');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN fee_confirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER fee_bearer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'quarantine_reason');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN quarantine_reason VARCHAR(120) NULL AFTER settlement_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'reversal_transaction_id');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN reversal_transaction_id VARCHAR(36) NULL AFTER wallet_transaction_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'reversal_reference');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN reversal_reference VARCHAR(120) NULL AFTER reversal_transaction_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'reversal_reason');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN reversal_reason VARCHAR(255) NULL AFTER reversal_reference', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'dispute_status');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN dispute_status VARCHAR(60) NULL AFTER reversal_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'dispute_reference');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN dispute_reference VARCHAR(120) NULL AFTER dispute_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'settled_at');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN settled_at DATETIME NULL AFTER dispute_reference', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'reversed_at');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN reversed_at DATETIME NULL AFTER settled_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'resolved_by');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN resolved_by VARCHAR(36) NULL AFTER reversed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'resolved_at');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN resolved_at DATETIME NULL AFTER resolved_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paystack_dva_settlements' AND COLUMN_NAME = 'updated_at');
SET @sql := IF(@c = 0, 'ALTER TABLE paystack_dva_settlements ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Backfill historical settlement fee breakdown & net settlement safely
UPDATE paystack_dva_settlements
   SET fee_confirmed = CASE WHEN settlement_status = 'settled' THEN 1 ELSE fee_confirmed END,
       customer_borne_fee = CASE WHEN fee_bearer = 'customer' AND customer_borne_fee = 0 AND paystack_fee > 0 THEN paystack_fee ELSE customer_borne_fee END,
       merchant_borne_fee = CASE WHEN fee_bearer = 'merchant' AND merchant_borne_fee = 0 AND paystack_fee > 0 THEN paystack_fee ELSE merchant_borne_fee END,
       net_settlement_amount = CASE WHEN net_settlement_amount = 0 AND gross_amount > 0 THEN GREATEST(0.00, gross_amount - paystack_fee) ELSE net_settlement_amount END,
       settled_at = CASE WHEN settlement_status = 'settled' AND settled_at IS NULL THEN created_at ELSE settled_at END;

-- 4. Add customer_borne_fee to `accounting_entries` so Paystack expected balance never overstates customer-borne fees
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_entries' AND COLUMN_NAME = 'customer_borne_fee');
SET @sql := IF(@c = 0, 'ALTER TABLE accounting_entries ADD COLUMN customer_borne_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER fee_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
