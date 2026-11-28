-- ==============================================================================
-- HAMBAK TECH & SERVICES — HAMBAK MANUAL Fulfilment Backend (Phase 5B)
-- Safe Pre-Operational Rollback Migration
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+ (InnoDB, utf8mb4_unicode_ci)
--
-- SAFETY DESIGN:
--   - Refuses to drop Phase 5 tables/columns if live Phase 5 operational data
--     exists (notes, assignment history, verification status history, result
--     verification sign-offs, clarification deadlines, or cancelled orders).
--   - Uses procedure-free TEMPORARY TABLE CHECK constraint guards.
-- ==============================================================================

SET @tbl_vsh  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_status_history');
SET @tbl_mfn  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manual_fulfilment_notes');
SET @tbl_mfah := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manual_fulfilment_assignment_history');
SET @tbl_mr   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');
SET @tbl_eo   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders');
SET @tbl_vr   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records');

SET @has_vsh := 0;
SET @sql := IF(@tbl_vsh > 0, 'SELECT COUNT(*) INTO @has_vsh FROM verification_status_history', 'SELECT 0 INTO @has_vsh');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_mfn := 0;
SET @sql := IF(@tbl_mfn > 0, 'SELECT COUNT(*) INTO @has_mfn FROM manual_fulfilment_notes', 'SELECT 0 INTO @has_mfn');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_mfah := 0;
SET @sql := IF(@tbl_mfah > 0, 'SELECT COUNT(*) INTO @has_mfah FROM manual_fulfilment_assignment_history', 'SELECT 0 INTO @has_mfah');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_mr_p5 := 0;
SET @mr_c_p5 := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(
    @tbl_mr > 0 AND @mr_c_p5 > 0,
    "SELECT COUNT(*) INTO @has_mr_p5 FROM modification_requests WHERE status = 'cancelled' OR assigned_by IS NOT NULL OR assignment_accepted_at IS NOT NULL OR result_verified_by IS NOT NULL OR result_verification_status <> 'none' OR clarification_deadline IS NOT NULL OR cancelled_at IS NOT NULL",
    'SELECT 0 INTO @has_mr_p5'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_eo_p5 := 0;
SET @eo_c_p5 := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(
    @tbl_eo > 0 AND @eo_c_p5 > 0,
    "SELECT COUNT(*) INTO @has_eo_p5 FROM enrolment_orders WHERE status = 'cancelled' OR assigned_by IS NOT NULL OR assignment_accepted_at IS NOT NULL OR result_verified_by IS NOT NULL OR result_verification_status <> 'none' OR clarification_deadline IS NOT NULL OR cancelled_at IS NOT NULL",
    'SELECT 0 INTO @has_eo_p5'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_vr_p5 := 0;
SET @vr_c_p5 := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(
    @tbl_vr > 0 AND @vr_c_p5 > 0,
    "SELECT COUNT(*) INTO @has_vr_p5 FROM verification_records WHERE status = 'cancelled' OR assigned_by IS NOT NULL OR assigned_to IS NOT NULL OR assignment_accepted_at IS NOT NULL OR refunded_at IS NOT NULL OR result_verified_by IS NOT NULL OR result_verification_status <> 'none' OR clarification_deadline IS NOT NULL OR cancelled_at IS NOT NULL",
    'SELECT 0 INTO @has_vr_p5'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TEMPORARY TABLE IF EXISTS _hambak_p5_rb_guard;
CREATE TEMPORARY TABLE _hambak_p5_rb_guard (
    ok TINYINT NOT NULL,
    CONSTRAINT Phase5_ROLLBACK_ABORTED_live_operational_data_exists CHECK (ok = 1)
) ENGINE=InnoDB;
INSERT INTO _hambak_p5_rb_guard (ok)
SELECT 0 FROM DUAL
WHERE (@has_vsh > 0 OR @has_mfn > 0 OR @has_mfah > 0 OR @has_mr_p5 > 0 OR @has_eo_p5 > 0 OR @has_vr_p5 > 0);
DROP TEMPORARY TABLE IF EXISTS _hambak_p5_rb_guard;

-- ------------------------------------------------------------------------------
-- 1. Drop Phase 5 Indexes & Columns on verification_records
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_result_verif');
SET @sql := IF(@tbl_vr > 0 AND @idx > 0, 'DROP INDEX idx_vr_result_verif ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_assigned_status');
SET @sql := IF(@tbl_vr > 0 AND @idx > 0, 'DROP INDEX idx_vr_assigned_status ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'cancellation_reason');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN cancellation_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'cancelled_by');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN cancelled_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'cancelled_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN cancelled_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'clarification_deadline');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN clarification_deadline', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verification_notes');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_verification_notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verification_status');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_verification_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verified_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_verified_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_verified_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'supporting_documents');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN supporting_documents', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN refunded_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'reviewed_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN reviewed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'reviewed_by');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN reviewed_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assignment_accepted_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN assignment_accepted_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN assigned_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_staff_name');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN assigned_staff_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_to');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN assigned_to', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'assigned_by');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN assigned_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 2. Drop Phase 5 Indexes & Columns on enrolment_orders
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_result_verif');
SET @sql := IF(@tbl_eo > 0 AND @idx > 0, 'DROP INDEX idx_eo_result_verif ON enrolment_orders', 'SELECT 1');
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
    @tbl_eo > 0 AND @eo_status_col IS NOT NULL AND @eo_status_col LIKE '%cancelled%',
    "ALTER TABLE enrolment_orders MODIFY COLUMN status ENUM('pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending'",
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'cancellation_reason');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN cancellation_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'cancelled_by');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN cancelled_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'cancelled_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN cancelled_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'clarification_deadline');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN clarification_deadline', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verification_notes');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN result_verification_notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verification_status');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN result_verification_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verified_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN result_verified_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN result_verified_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assignment_accepted_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN assignment_accepted_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assigned_by');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN assigned_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3. Drop Phase 5 Indexes & Columns on modification_requests
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_result_verif');
SET @sql := IF(@tbl_mr > 0 AND @idx > 0, 'DROP INDEX idx_mr_result_verif ON modification_requests', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_assigned_status');
SET @sql := IF(@tbl_mr > 0 AND @idx > 0, 'DROP INDEX idx_mr_assigned_status ON modification_requests', 'SELECT 1');
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
    @tbl_mr > 0 AND @mr_status_col IS NOT NULL AND @mr_status_col LIKE '%cancelled%',
    "ALTER TABLE modification_requests MODIFY COLUMN status ENUM('pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending'",
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'cancellation_reason');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN cancellation_reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'cancelled_by');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN cancelled_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'cancelled_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN cancelled_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'clarification_deadline');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN clarification_deadline', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verification_notes');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN result_verification_notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verification_status');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN result_verification_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verified_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN result_verified_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'result_verified_by');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN result_verified_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assignment_accepted_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN assignment_accepted_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_by');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN assigned_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 4. Drop Phase 5 Tables (only reached if empty)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS manual_fulfilment_assignment_history;
DROP TABLE IF EXISTS manual_fulfilment_notes;
DROP TABLE IF EXISTS verification_status_history;
