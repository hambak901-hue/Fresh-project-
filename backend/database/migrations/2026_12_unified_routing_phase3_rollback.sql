-- ==============================================================================
-- HAMBAK TECH & SERVICES — Unified Service Routing & Fulfilment Engine (Phase 3)
-- Safe Pre-Operational Rollback Migration
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+ (InnoDB, utf8mb4_unicode_ci)
--
-- SAFETY DESIGN:
--   - Refuses to drop Phase 3 columns or audit table if live Phase 3
--     operational data exists (routing audit logs, claimed orders, approval
--     sign-offs, internal_fulfilment_cost, dispatch locks, or async verification
--     tracking metadata) so live operational history cannot be silently erased.
--   - Uses procedure-free TEMPORARY TABLE CHECK constraint guards.
-- ==============================================================================

DROP PROCEDURE IF EXISTS _hambak_phase3_abort;

SET @tbl_sral := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_routing_audit_logs');
SET @tbl_mr   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');
SET @tbl_eo   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders');
SET @tbl_vr   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records');
SET @tbl_psm  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings');

SET @has_audit_logs := 0;
SET @sql := IF(@tbl_sral > 0, 'SELECT COUNT(*) INTO @has_audit_logs FROM service_routing_audit_logs', 'SELECT 0 INTO @has_audit_logs');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_mr_ops := 0;
SET @mr_c_claim := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(
    @tbl_mr > 0 AND @mr_c_claim > 0,
    'SELECT COUNT(*) INTO @has_mr_ops FROM modification_requests WHERE claimed_by IS NOT NULL OR awaiting_admin_review = 1 OR completion_approved_by IS NOT NULL OR dispatch_locked_at IS NOT NULL OR dispatch_attempts > 0 OR COALESCE(internal_fulfilment_cost, 0) > 0',
    'SELECT 0 INTO @has_mr_ops'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_eo_ops := 0;
SET @eo_c_claim := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(
    @tbl_eo > 0 AND @eo_c_claim > 0,
    'SELECT COUNT(*) INTO @has_eo_ops FROM enrolment_orders WHERE claimed_by IS NOT NULL OR awaiting_admin_review = 1 OR completion_approved_by IS NOT NULL OR dispatch_locked_at IS NOT NULL OR dispatch_attempts > 0 OR COALESCE(internal_fulfilment_cost, 0) > 0',
    'SELECT 0 INTO @has_eo_ops'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_vr_ops := 0;
SET @vr_c_claim := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(
    @tbl_vr > 0 AND @vr_c_claim > 0,
    'SELECT COUNT(*) INTO @has_vr_ops FROM verification_records WHERE claimed_by IS NOT NULL OR awaiting_admin_review = 1 OR completion_approved_by IS NOT NULL OR dispatch_locked_at IS NOT NULL OR dispatch_attempts > 0 OR COALESCE(internal_fulfilment_cost, 0) > 0 OR provider_reference IS NOT NULL OR result_document_id IS NOT NULL',
    'SELECT 0 INTO @has_vr_ops'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @vr_nonlegacy_status := 0;
SET @sql := IF(
    @tbl_vr > 0,
    "SELECT COUNT(*) INTO @vr_nonlegacy_status FROM verification_records WHERE COALESCE(status, 'pending') NOT IN ('completed', 'failed', 'pending')",
    'SELECT 0 INTO @vr_nonlegacy_status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_mr_refunded_at := 0;
SET @mr_c_ref := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(
    @tbl_mr > 0 AND @mr_c_ref > 0,
    'SELECT COUNT(*) INTO @has_mr_refunded_at FROM modification_requests WHERE refunded_at IS NOT NULL',
    'SELECT 0 INTO @has_mr_refunded_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_eo_refunded_at := 0;
SET @eo_c_ref := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(
    @tbl_eo > 0 AND @eo_c_ref > 0,
    'SELECT COUNT(*) INTO @has_eo_refunded_at FROM enrolment_orders WHERE refunded_at IS NOT NULL',
    'SELECT 0 INTO @has_eo_refunded_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TEMPORARY TABLE IF EXISTS _hambak_p3_rb_guard;
CREATE TEMPORARY TABLE _hambak_p3_rb_guard (
    ok TINYINT NOT NULL,
    CONSTRAINT Phase3_ROLLBACK_ABORTED_live_operational_data_exists CHECK (ok = 1)
) ENGINE=InnoDB;
INSERT INTO _hambak_p3_rb_guard (ok)
SELECT 0 FROM DUAL
WHERE (@has_audit_logs > 0 OR @has_mr_ops > 0 OR @has_eo_ops > 0 OR @has_vr_ops > 0 OR @vr_nonlegacy_status > 0 OR @has_mr_refunded_at > 0 OR @has_eo_refunded_at > 0);
DROP TEMPORARY TABLE IF EXISTS _hambak_p3_rb_guard;

-- ------------------------------------------------------------------------------
-- 1. Drop Phase 3 Indexes & Columns on modification_requests
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_manual_queue');
SET @sql := IF(@tbl_mr > 0 AND @idx > 0, 'DROP INDEX idx_mr_manual_queue ON modification_requests', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_sla_due');
SET @sql := IF(@tbl_mr > 0 AND @idx > 0, 'DROP INDEX idx_mr_sla_due ON modification_requests', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_claimed');
SET @sql := IF(@tbl_mr > 0 AND @idx > 0, 'DROP INDEX idx_mr_claimed ON modification_requests', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN refunded_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'last_dispatch_error');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN last_dispatch_error', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'dispatch_attempts');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN dispatch_attempts', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'dispatch_locked_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN dispatch_locked_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN internal_fulfilment_cost', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'completion_approved_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN completion_approved_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'completion_approved_by');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN completion_approved_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'awaiting_admin_review');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN awaiting_admin_review', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'claimed_at');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN claimed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(@tbl_mr > 0 AND @col > 0, 'ALTER TABLE modification_requests DROP COLUMN claimed_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 2. Drop Phase 3 Indexes & Columns on enrolment_orders
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_manual_queue');
SET @sql := IF(@tbl_eo > 0 AND @idx > 0, 'DROP INDEX idx_eo_manual_queue ON enrolment_orders', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_sla_due');
SET @sql := IF(@tbl_eo > 0 AND @idx > 0, 'DROP INDEX idx_eo_sla_due ON enrolment_orders', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_claimed');
SET @sql := IF(@tbl_eo > 0 AND @idx > 0, 'DROP INDEX idx_eo_claimed ON enrolment_orders', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN refunded_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'last_dispatch_error');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN last_dispatch_error', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'dispatch_attempts');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN dispatch_attempts', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'dispatch_locked_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN dispatch_locked_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN internal_fulfilment_cost', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'completion_approved_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN completion_approved_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'completion_approved_by');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN completion_approved_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'awaiting_admin_review');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN awaiting_admin_review', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'claimed_at');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN claimed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(@tbl_eo > 0 AND @col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN claimed_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3. Drop Phase 3 Indexes & Columns on verification_records
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_provider_ref');
SET @sql := IF(@tbl_vr > 0 AND @idx > 0, 'DROP INDEX idx_vr_provider_ref ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_claimed');
SET @sql := IF(@tbl_vr > 0 AND @idx > 0, 'DROP INDEX idx_vr_claimed ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_sla_due');
SET @sql := IF(@tbl_vr > 0 AND @idx > 0, 'DROP INDEX idx_vr_sla_due ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_manual_queue');
SET @sql := IF(@tbl_vr > 0 AND @idx > 0, 'DROP INDEX idx_vr_manual_queue ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'updated_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN updated_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'completed_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN completed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'refund_reference');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN refund_reference', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_remarks');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN provider_remarks', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_status');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN provider_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_transaction_id');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN provider_transaction_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_reference');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN provider_reference', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_retrieved_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_retrieved_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_retrieval_error');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_retrieval_error', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_retrieval_status');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_retrieval_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_payload');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_payload', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider_tracking_id');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN provider_tracking_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_source');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_source', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'result_document_id');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN result_document_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'document_review_checklist');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN document_review_checklist', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'additional_info_history');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN additional_info_history', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'requested_corrections');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN requested_corrections', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'admin_notes');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN admin_notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'last_dispatch_error');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN last_dispatch_error', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'dispatch_attempts');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN dispatch_attempts', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'dispatch_locked_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN dispatch_locked_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN internal_fulfilment_cost', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'completion_approved_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN completion_approved_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'completion_approved_by');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN completion_approved_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'awaiting_admin_review');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN awaiting_admin_review', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'claimed_at');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN claimed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'claimed_by');
SET @sql := IF(@tbl_vr > 0 AND @col > 0, 'ALTER TABLE verification_records DROP COLUMN claimed_by', 'SELECT 1');
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
    @tbl_vr > 0 AND @vr_nonlegacy_status = 0 AND @vr_status_col = 'varchar(32)',
    "ALTER TABLE verification_records MODIFY COLUMN status ENUM('completed', 'failed', 'pending') NOT NULL DEFAULT 'pending'",
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 4. Drop Phase 3 provider_service_mappings Composite Index & Audit Log Table
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND INDEX_NAME = 'uniq_psm_provider_service');
SET @sql := IF(@tbl_psm > 0 AND @idx > 0, 'DROP INDEX uniq_psm_provider_service ON provider_service_mappings', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND INDEX_NAME = 'idx_psm_provider_service');
SET @sql := IF(@tbl_psm > 0 AND @idx > 0, 'DROP INDEX idx_psm_provider_service ON provider_service_mappings', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS service_routing_audit_logs;

DROP TEMPORARY TABLE IF EXISTS _hambak_p3_rb_guard;
DROP PROCEDURE IF EXISTS _hambak_phase3_abort;
