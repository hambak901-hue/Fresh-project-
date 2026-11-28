-- ==============================================================================
-- HAMBAK TECH & SERVICES — HAMBAK MANUAL Fulfilment Backend (Phase 5B)
-- Idempotent Upgrade Migration
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+ (InnoDB, utf8mb4_unicode_ci)
--
-- SAFETY GUARANTEES:
--   1. Verifies Phase 3 columns exist before altering tables.
--   2. Preserves all existing balances, transactions, order statuses, and keys.
--   3. Safe and idempotent under strict MySQL mode (sql_mode=STRICT_TRANS_TABLES).
--   4. Adds granular assignment tracking, result verification (maker-checker),
--      clarification deadlines, cancellation metadata, verification status
--      history, private internal notes, and assignment claim history.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Verify Phase 3 Prerequisite Exists on modification_requests & verification_records
-- ------------------------------------------------------------------------------
SET @p3_cols := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
          (TABLE_NAME = 'modification_requests' AND COLUMN_NAME IN ('claimed_by', 'awaiting_admin_review', 'internal_fulfilment_cost'))
          OR
          (TABLE_NAME = 'verification_records' AND COLUMN_NAME IN ('claimed_by', 'fulfilment_mode', 'internal_fulfilment_cost'))
      )
);

DROP TEMPORARY TABLE IF EXISTS _hambak_p5_up_guard;
CREATE TEMPORARY TABLE _hambak_p5_up_guard (
    ok TINYINT NOT NULL,
    CONSTRAINT Phase5_ABORTED_phase3_migration_required CHECK (ok = 1)
) ENGINE=InnoDB;
INSERT INTO _hambak_p5_up_guard (ok) SELECT 0 FROM DUAL WHERE @p3_cols < 6;
DROP TEMPORARY TABLE IF EXISTS _hambak_p5_up_guard;

-- ------------------------------------------------------------------------------
-- 1. Create Phase 5 Operational Tables (History, Notes, Assignment History)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_status_history (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    record_id VARCHAR(36) NOT NULL,
    previous_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NOT NULL,
    actor_type ENUM('customer', 'provider', 'admin', 'system') NOT NULL DEFAULT 'system',
    actor_id VARCHAR(36) NULL,
    remarks TEXT NULL,
    is_customer_visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vsh_record (record_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manual_fulfilment_notes (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    domain VARCHAR(40) NOT NULL,
    record_id VARCHAR(36) NOT NULL,
    reference_number VARCHAR(64) NULL,
    author_id VARCHAR(36) NOT NULL,
    author_name VARCHAR(191) NOT NULL,
    category ENUM('general', 'document_review', 'verification', 'clarification', 'escalation', 'supervision') NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mfn_domain_record (domain, record_id, created_at),
    INDEX idx_mfn_author (author_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manual_fulfilment_assignment_history (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    domain VARCHAR(40) NOT NULL,
    record_id VARCHAR(36) NOT NULL,
    action ENUM('claimed', 'assigned', 'reassigned', 'accepted', 'declined', 'released') NOT NULL,
    previous_assignee_id VARCHAR(36) NULL,
    new_assignee_id VARCHAR(36) NULL,
    new_assignee_name VARCHAR(191) NULL,
    actor_id VARCHAR(36) NOT NULL,
    actor_name VARCHAR(191) NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mfah_domain_record (domain, record_id, created_at),
    INDEX idx_mfah_assignee (new_assignee_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Extend modification_requests with Phase 5 Workflow & Audit Columns
-- ------------------------------------------------------------------------------
SET @tbl_mr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_by');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_to');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_to VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_staff_name');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_staff_name VARCHAR(150) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assignment_accepted_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN assignment_accepted_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN result_verified_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verified_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN result_verified_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verification_status');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, "ALTER TABLE modification_requests ADD COLUMN result_verification_status ENUM('none', 'pending_verification', 'verified', 'rejected') NOT NULL DEFAULT 'none'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verification_notes');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN result_verification_notes TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'clarification_deadline');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN clarification_deadline DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'cancelled_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN cancelled_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'cancelled_by');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN cancelled_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'cancellation_reason');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN cancellation_reason TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @mr_status_col := (
    SELECT LOWER(COLUMN_TYPE)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'modification_requests'
      AND COLUMN_NAME = 'status'
    LIMIT 1
);
SET @sql := IF(
    @tbl_mr > 0 AND @mr_status_col IS NOT NULL AND @mr_status_col NOT LIKE '%cancelled%',
    "ALTER TABLE modification_requests MODIFY COLUMN status ENUM('pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded', 'cancelled') NOT NULL DEFAULT 'pending'",
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_assigned_status');
SET @sql := IF(@tbl_mr > 0 AND @idx = 0, 'CREATE INDEX idx_mr_assigned_status ON modification_requests (assigned_to, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_result_verif');
SET @sql := IF(@tbl_mr > 0 AND @idx = 0, 'CREATE INDEX idx_mr_result_verif ON modification_requests (result_verification_status, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3. Extend enrolment_orders with Phase 5 Workflow & Audit Columns
-- ------------------------------------------------------------------------------
SET @tbl_eo := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assigned_by');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN assigned_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assignment_accepted_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN assignment_accepted_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN result_verified_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verified_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN result_verified_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verification_status');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, "ALTER TABLE enrolment_orders ADD COLUMN result_verification_status ENUM('none', 'pending_verification', 'verified', 'rejected') NOT NULL DEFAULT 'none'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verification_notes');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN result_verification_notes TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'clarification_deadline');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN clarification_deadline DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'cancelled_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN cancelled_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'cancelled_by');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN cancelled_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'cancellation_reason');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN cancellation_reason TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @eo_status_col := (
    SELECT LOWER(COLUMN_TYPE)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrolment_orders'
      AND COLUMN_NAME = 'status'
    LIMIT 1
);
SET @sql := IF(
    @tbl_eo > 0 AND @eo_status_col IS NOT NULL AND @eo_status_col NOT LIKE '%cancelled%',
    "ALTER TABLE enrolment_orders MODIFY COLUMN status ENUM('pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded', 'cancelled') NOT NULL DEFAULT 'pending'",
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_result_verif');
SET @sql := IF(@tbl_eo > 0 AND @idx = 0, 'CREATE INDEX idx_eo_result_verif ON enrolment_orders (result_verification_status, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 4. Extend verification_records with Phase 5 Workflow & Parity Columns
-- ------------------------------------------------------------------------------
SET @tbl_vr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_by');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN assigned_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_to');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN assigned_to VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_staff_name');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN assigned_staff_name VARCHAR(150) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN assigned_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assignment_accepted_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN assignment_accepted_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'reviewed_by');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN reviewed_by VARCHAR(100) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'reviewed_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN reviewed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN refunded_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'supporting_documents');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN supporting_documents JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN result_verified_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verified_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN result_verified_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verification_status');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, "ALTER TABLE verification_records ADD COLUMN result_verification_status ENUM('none', 'pending_verification', 'verified', 'rejected') NOT NULL DEFAULT 'none'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verification_notes');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN result_verification_notes TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'clarification_deadline');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN clarification_deadline DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'cancelled_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN cancelled_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'cancelled_by');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN cancelled_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'cancellation_reason');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN cancellation_reason TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_assigned_status');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_assigned_status ON verification_records (assigned_to, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_result_verif');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_result_verif ON verification_records (result_verification_status, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
