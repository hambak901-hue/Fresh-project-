-- ==============================================================================
-- HAMBAK TECH & SERVICES — Unified Service Routing & Fulfilment Engine (Phase 3)
-- Idempotent Upgrade Migration (Routing Engine, Audit Logs, Dispatch Locks,
-- HAMBAK MANUAL Operational Queue & provider_service_mappings Composite Key)
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+ (InnoDB, utf8mb4_unicode_ci)
--
-- IMPORTANT SAFETY GUARANTEES:
--   1. Requires Phase 2 columns on service_catalogue (aborts cleanly if missing).
--   2. Preserves all existing balances, transactions, order statuses, and API keys.
--   3. Safely migrates provider_service_mappings single-column unique index on
--      service_key to composite (provider_id, service_key) without deleting rows.
--   4. Adds idempotent dispatch lock, claim lock, completion sign-off, SLA, and
--      internal_fulfilment_cost columns across modification_requests,
--      enrolment_orders, and verification_records.
-- ==============================================================================

DROP PROCEDURE IF EXISTS _hambak_phase3_abort;

-- ------------------------------------------------------------------------------
-- 0. Verify Phase 2 Prerequisite Exists on service_catalogue
-- ------------------------------------------------------------------------------
SET @p2_cols := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'service_catalogue'
      AND COLUMN_NAME IN ('fulfilment_mode', 'internal_fulfilment_cost', 'internal_manual_eligible', 'provider_schema_verified')
);

DROP TEMPORARY TABLE IF EXISTS _hambak_p3_up_guard;
CREATE TEMPORARY TABLE _hambak_p3_up_guard (
    ok TINYINT NOT NULL,
    CONSTRAINT Phase3_ABORTED_phase2_migration_required CHECK (ok = 1)
) ENGINE=InnoDB;
INSERT INTO _hambak_p3_up_guard (ok) SELECT 0 FROM DUAL WHERE @p2_cols < 4;
DROP TEMPORARY TABLE IF EXISTS _hambak_p3_up_guard;

-- ------------------------------------------------------------------------------
-- 1. Create service_routing_audit_logs Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_routing_audit_logs (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    service_id VARCHAR(36) NULL,
    service_key VARCHAR(80) NOT NULL,
    previous_mode VARCHAR(32) NULL,
    new_mode VARCHAR(32) NOT NULL,
    previous_provider_id VARCHAR(50) NULL,
    new_provider_id VARCHAR(50) NULL,
    previous_internal_eligible TINYINT(1) NOT NULL DEFAULT 0,
    new_internal_eligible TINYINT(1) NOT NULL DEFAULT 0,
    previous_schema_verified TINYINT(1) NOT NULL DEFAULT 0,
    new_schema_verified TINYINT(1) NOT NULL DEFAULT 0,
    previous_wholesale_cost DECIMAL(15, 2) NULL,
    new_wholesale_cost DECIMAL(15, 2) NULL,
    previous_internal_cost DECIMAL(15, 2) NULL,
    new_internal_cost DECIMAL(15, 2) NULL,
    previous_sla_hours INT NULL,
    new_sla_hours INT NULL,
    reason TEXT NOT NULL,
    actor_user_id VARCHAR(36) NULL,
    actor_email VARCHAR(191) NULL,
    actor_name VARCHAR(191) NULL,
    actor_role VARCHAR(40) NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sral_service (service_key, created_at),
    INDEX idx_sral_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Migrate provider_service_mappings to Composite (provider_id, service_key)
--    Without Deleting Any Existing Rows
-- ------------------------------------------------------------------------------
SET @tbl_psm := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings');

-- Find any single-column UNIQUE index on service_key alone (and not PRIMARY)
SET @single_sk_uq := (
    SELECT s.INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE()
      AND s.TABLE_NAME = 'provider_service_mappings'
      AND s.NON_UNIQUE = 0
      AND s.INDEX_NAME <> 'PRIMARY'
    GROUP BY s.INDEX_NAME
    HAVING COUNT(*) = 1 AND MAX(s.COLUMN_NAME) = 'service_key'
    LIMIT 1
);

SET @sql := IF(
    @tbl_psm > 0 AND @single_sk_uq IS NOT NULL AND @single_sk_uq <> '',
    CONCAT('ALTER TABLE provider_service_mappings DROP INDEX `', REPLACE(@single_sk_uq, '`', '``'), '`'),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Check if a composite unique index on (provider_id, service_key) already exists
SET @has_comp_uq := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'provider_service_mappings'
          AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 2
           AND SUM(CASE WHEN SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'provider_id' THEN 1 ELSE 0 END) = 1
           AND SUM(CASE WHEN SEQ_IN_INDEX = 2 AND COLUMN_NAME = 'service_key' THEN 1 ELSE 0 END) = 1
    ) t
);

SET @has_comp_idx := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'provider_service_mappings'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) >= 2
           AND SUM(CASE WHEN SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'provider_id' THEN 1 ELSE 0 END) = 1
           AND SUM(CASE WHEN SEQ_IN_INDEX = 2 AND COLUMN_NAME = 'service_key' THEN 1 ELSE 0 END) = 1
    ) t
);

SET @psm_dupes := 0;
SET @sql := IF(
    @tbl_psm > 0,
    'SELECT COALESCE(SUM(cnt - 1), 0) INTO @psm_dupes FROM (SELECT COUNT(*) AS cnt FROM provider_service_mappings GROUP BY provider_id, service_key HAVING COUNT(*) > 1) d',
    'SELECT 0 INTO @psm_dupes'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @tbl_psm > 0 AND @has_comp_uq = 0 AND @psm_dupes = 0,
    'ALTER TABLE provider_service_mappings ADD UNIQUE KEY uniq_psm_provider_service (provider_id, service_key)',
    IF(
        @tbl_psm > 0 AND @has_comp_idx = 0,
        'CREATE INDEX idx_psm_provider_service ON provider_service_mappings (provider_id, service_key)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3. Add Operational Claim, Completion Review, Cost & Dispatch Lock Columns to
--    modification_requests
-- ------------------------------------------------------------------------------
SET @tbl_mr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN claimed_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'claimed_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN claimed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'awaiting_admin_review');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN awaiting_admin_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'completion_approved_by');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN completion_approved_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'completion_approved_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN completion_approved_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN internal_fulfilment_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'dispatch_locked_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN dispatch_locked_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'dispatch_attempts');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN dispatch_attempts INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'last_dispatch_error');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN last_dispatch_error TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_manual_queue');
SET @sql := IF(@tbl_mr > 0 AND @idx = 0, 'CREATE INDEX idx_mr_manual_queue ON modification_requests (fulfilment_mode, awaiting_admin_review, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_sla_due');
SET @sql := IF(@tbl_mr > 0 AND @idx = 0, 'CREATE INDEX idx_mr_sla_due ON modification_requests (fulfilment_mode, sla_due_at, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_claimed');
SET @sql := IF(@tbl_mr > 0 AND @idx = 0, 'CREATE INDEX idx_mr_claimed ON modification_requests (claimed_by, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 4. Add Operational Claim, Completion Review, Cost & Dispatch Lock Columns to
--    enrolment_orders
-- ------------------------------------------------------------------------------
SET @tbl_eo := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN claimed_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'claimed_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN claimed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'awaiting_admin_review');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN awaiting_admin_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'completion_approved_by');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN completion_approved_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'completion_approved_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN completion_approved_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN internal_fulfilment_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'dispatch_locked_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN dispatch_locked_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'dispatch_attempts');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN dispatch_attempts INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'last_dispatch_error');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN last_dispatch_error TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_manual_queue');
SET @sql := IF(@tbl_eo > 0 AND @idx = 0, 'CREATE INDEX idx_eo_manual_queue ON enrolment_orders (fulfilment_mode, awaiting_admin_review, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_sla_due');
SET @sql := IF(@tbl_eo > 0 AND @idx = 0, 'CREATE INDEX idx_eo_sla_due ON enrolment_orders (fulfilment_mode, sla_due_at, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_claimed');
SET @sql := IF(@tbl_eo > 0 AND @idx = 0, 'CREATE INDEX idx_eo_claimed ON enrolment_orders (claimed_by, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 5. Add Operational Claim, Async Tracking, Cost & Dispatch Lock Columns to
--    verification_records
-- ------------------------------------------------------------------------------
SET @tbl_vr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN claimed_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'claimed_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN claimed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'awaiting_admin_review');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN awaiting_admin_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'completion_approved_by');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN completion_approved_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'completion_approved_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN completion_approved_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN internal_fulfilment_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'dispatch_locked_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN dispatch_locked_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'dispatch_attempts');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN dispatch_attempts INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'last_dispatch_error');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN last_dispatch_error TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'admin_notes');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN admin_notes TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'requested_corrections');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN requested_corrections TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'additional_info_history');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN additional_info_history JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'document_review_checklist');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN document_review_checklist JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_document_id');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN result_document_id VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_reference');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN provider_reference VARCHAR(120) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_transaction_id');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN provider_transaction_id VARCHAR(120) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_status');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN provider_status VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_remarks');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN provider_remarks TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'refund_reference');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN refund_reference VARCHAR(120) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'completed_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN completed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'updated_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @vr_status_col := (
    SELECT LOWER(COLUMN_TYPE)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'verification_records'
      AND COLUMN_NAME = 'status'
    LIMIT 1
);
SET @sql := IF(
    @tbl_vr > 0 AND @vr_status_col IS NOT NULL AND @vr_status_col <> 'varchar(32)',
    "ALTER TABLE verification_records MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'",
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_manual_queue');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_manual_queue ON verification_records (fulfilment_mode, awaiting_admin_review, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_sla_due');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_sla_due ON verification_records (fulfilment_mode, sla_due_at, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_claimed');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_claimed ON verification_records (claimed_by, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_provider_ref');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_provider_ref ON verification_records (provider_reference, service_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TEMPORARY TABLE IF EXISTS _hambak_p3_up_guard;
DROP PROCEDURE IF EXISTS _hambak_phase3_abort;
