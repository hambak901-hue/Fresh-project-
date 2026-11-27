-- ==============================================================================
-- HAMBAK TECH & SERVICES — Unified Service Routing & Fulfilment Engine (Phase 2)
-- Pre-Implementation Safe Rollback Script (REVISED)
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+
--
-- DISTINCTION BETWEEN PRE-IMPLEMENTATION ROLLBACK AND OPERATIONAL ROLLBACK:
--   - THIS SCRIPT IS A PHASE 2 PRE-IMPLEMENTATION ROLLBACK ONLY.
--     It is intended strictly to revert Phase 2 preparation schema/metadata
--     BEFORE Phase 3 routing execution or administrator routing/schema edits
--     have taken place.
--   - IT IS NOT AN OPERATIONAL ROLLBACK. Once live routing snapshots, SLA
--     deadlines, internal_manual orders/configurations, admin routing edits,
--     internal costs, manual eligibility flags, or provider schema sign-offs
--     exist, dropping Phase 2 columns would destroy operational audit data.
--   - Therefore, Section 1 inspects all affected tables BEFORE any DDL drop
--     and ABORTS (SIGNAL SQLSTATE '45000') if ANY operational/admin-edited
--     routing data is detected. Operational rollback requires exporting routing
--     snapshots, reverting active services to provider modes via admin/SOP,
--     and preserving historical audit columns rather than dropping them.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Single-statement helper routine for fail-loud SIGNAL SQLSTATE '45000'
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _hambak_phase2_abort;
CREATE PROCEDURE _hambak_phase2_abort(IN msg VARCHAR(128))
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;

-- ------------------------------------------------------------------------------
-- 1. Operational Data Safety Guard (ABORT BEFORE ANY DROP IF DATA EXISTS)
-- ------------------------------------------------------------------------------
SET @live_hits := 0;
SET @tmp_cnt := 0;

-- 1A. service_catalogue operational / admin-edited checks
SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE fulfilment_mode = ''internal_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE internal_fulfilment_cost > 0', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_manual_eligible');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE internal_manual_eligible = 1', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_at');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE routing_updated_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_by');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE routing_updated_by IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'provider_id');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1B. provider_service_mappings human schema sign-off & hambak_manual checks
SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_at');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM provider_service_mappings WHERE schema_verified_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_by');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM provider_service_mappings WHERE schema_verified_by IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'provider_id');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM provider_service_mappings WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1C. modification_requests populated routing / SLA / internal_manual checks
SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE routing_snapshot IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE sla_due_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE fulfilment_mode = ''internal_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'provider_id');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1D. enrolment_orders populated routing / SLA / internal_manual checks
SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE routing_snapshot IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE sla_due_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE fulfilment_mode = ''internal_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'provider_id');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1E. verification_records populated routing / SLA / internal_manual checks
SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE routing_snapshot IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE sla_due_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@has_col > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE fulfilment_mode = ''internal_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1F. providers: active hambak_manual check
SET @hm_active := (SELECT COUNT(*) FROM providers WHERE id = 'hambak_manual' AND is_active = 1);
SET @live_hits := @live_hits + COALESCE(@hm_active, 0);

SET @abort_msg := 'Rollback ABORTED: operational routing/SLA/admin/schema data exists. Export/remediate first.';
SET @sql := IF(@live_hits > 0, 'CALL _hambak_phase2_abort(@abort_msg)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 2. Drop Phase 2 Indexes (if present)
-- ------------------------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND INDEX_NAME = 'idx_psm_verified');
SET @sql := IF(@idx > 0, 'DROP INDEX idx_psm_verified ON provider_service_mappings', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_fulfilment');
SET @sql := IF(@idx > 0, 'DROP INDEX idx_vr_fulfilment ON verification_records', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_fulfilment');
SET @sql := IF(@idx > 0, 'DROP INDEX idx_eo_fulfilment ON enrolment_orders', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_fulfilment');
SET @sql := IF(@idx > 0, 'DROP INDEX idx_mr_fulfilment ON modification_requests', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND INDEX_NAME = 'idx_sc_routing_eligible');
SET @sql := IF(@idx > 0, 'DROP INDEX idx_sc_routing_eligible ON service_catalogue', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND INDEX_NAME = 'idx_sc_fulfilment');
SET @sql := IF(@idx > 0, 'DROP INDEX idx_sc_fulfilment ON service_catalogue', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3. Drop Phase 2 Order Provenance & SLA Columns (if present)
-- ------------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@col > 0, 'ALTER TABLE verification_records DROP COLUMN routing_legacy_review', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@col > 0, 'ALTER TABLE verification_records DROP COLUMN sla_due_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@col > 0, 'ALTER TABLE verification_records DROP COLUMN routing_snapshot', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@col > 0, 'ALTER TABLE verification_records DROP COLUMN fulfilment_mode', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN routing_legacy_review', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN sla_due_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN routing_snapshot', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@col > 0, 'ALTER TABLE enrolment_orders DROP COLUMN fulfilment_mode', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@col > 0, 'ALTER TABLE modification_requests DROP COLUMN routing_legacy_review', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@col > 0, 'ALTER TABLE modification_requests DROP COLUMN sla_due_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@col > 0, 'ALTER TABLE modification_requests DROP COLUMN routing_snapshot', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@col > 0, 'ALTER TABLE modification_requests DROP COLUMN fulfilment_mode', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 4. Drop Phase 2 Columns from provider_service_mappings & service_catalogue
-- ------------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_initialized_at');
SET @sql := IF(@col > 0, 'ALTER TABLE provider_service_mappings DROP COLUMN schema_initialized_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verification_notes');
SET @sql := IF(@col > 0, 'ALTER TABLE provider_service_mappings DROP COLUMN schema_verification_notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_by');
SET @sql := IF(@col > 0, 'ALTER TABLE provider_service_mappings DROP COLUMN schema_verified_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_at');
SET @sql := IF(@col > 0, 'ALTER TABLE provider_service_mappings DROP COLUMN schema_verified_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified');
SET @sql := IF(@col > 0, 'ALTER TABLE provider_service_mappings DROP COLUMN schema_verified', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_by');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN routing_updated_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_at');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN routing_updated_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_initialized_at');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN routing_initialized_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'eligibility_notes');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN eligibility_notes', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'provider_schema_verified');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN provider_schema_verified', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_manual_eligible');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN internal_manual_eligible', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'sla_hours');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN sla_hours', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN internal_fulfilment_cost', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN fulfilment_mode', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 5. Safely Remove Inactive Internal Desk Row & Dynamically Narrow ENUM
--    (Preserves all pre-existing provider_type ENUM values dynamically)
-- ------------------------------------------------------------------------------
SET @ref_sc := (SELECT COUNT(*) FROM service_catalogue WHERE provider_id = 'hambak_manual');
SET @tbl_psm := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings');
SET @ref_psm := 0;
SET @sql := IF(@tbl_psm > 0, 'SELECT COUNT(*) INTO @ref_psm FROM provider_service_mappings WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @ref_psm');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(
    @ref_sc = 0 AND @ref_psm = 0,
    'DELETE FROM providers WHERE id = ''hambak_manual'' AND provider_type = ''internal'' AND is_active = 0',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @rem_internal := (SELECT COUNT(*) FROM providers WHERE LOWER(COALESCE(provider_type, '')) = 'internal');

SET @pt_col_type := NULL;
SET @pt_nullable := NULL;
SET @pt_default  := NULL;
SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  INTO @pt_col_type, @pt_nullable, @pt_default
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'providers'
  AND COLUMN_NAME = 'provider_type'
LIMIT 1;

SET @pt_is_enum := IF(LOWER(TRIM(COALESCE(@pt_col_type, ''))) LIKE 'enum(%)', 1, 0);
SET @pt_has_internal := IF(LOCATE('''internal''', LOWER(COALESCE(@pt_col_type, ''))) > 0, 1, 0);
SET @pt_null_sql := IF(@pt_nullable = 'NO', ' NOT NULL', ' NULL');
SET @pt_def_sql := IF(@pt_default IS NOT NULL AND LOWER(@pt_default) <> 'internal', CONCAT(' DEFAULT ', QUOTE(@pt_default)), '');

SET @pt_restored_enum := IF(
    @pt_is_enum = 1 AND @pt_has_internal = 1,
    IF(
        LOCATE(',''internal''', @pt_col_type) > 0,
        REPLACE(@pt_col_type, ',''internal''', ''),
        REPLACE(@pt_col_type, '''internal'',', '')
    ),
    NULL
);

SET @sql := IF(
    @rem_internal = 0 AND @pt_is_enum = 1 AND @pt_has_internal = 1 AND LOCATE('''', COALESCE(@pt_restored_enum, '')) > 0,
    CONCAT('ALTER TABLE providers MODIFY COLUMN provider_type ', @pt_restored_enum, @pt_null_sql, @pt_def_sql),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 6. Cleanup Temporary Helper Procedure
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _hambak_phase2_abort;
