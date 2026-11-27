-- ==============================================================================
-- HAMBAK TECH & SERVICES — Unified Service Routing & Fulfilment Engine (Phase 2)
-- Safe, Idempotent Non-Destructive Rollback Script
-- Reverses Phase 2 schema additions without touching customer data, balances,
-- ledger entries, selling_price, wholesale_cost, or order statuses.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Drop Phase 2 Indexes (if present)
-- ------------------------------------------------------------------------------
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
-- 2. Drop Phase 2 Order Provenance & SLA Columns (if present)
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
-- 3. Drop Phase 2 Routing & Eligibility Columns from service_catalogue (if present)
-- ------------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_by');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN routing_updated_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_at');
SET @sql := IF(@col > 0, 'ALTER TABLE service_catalogue DROP COLUMN routing_updated_at', 'SELECT 1');
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
-- 4. Safely Remove Internal Desk Provider Row & Narrow ENUM Only If Unreferenced
-- ------------------------------------------------------------------------------
SET @ref_sc := (SELECT COUNT(*) FROM service_catalogue WHERE provider_id = 'hambak_manual');
SET @ref_psm := (SELECT COUNT(*) FROM provider_service_mappings WHERE provider_id = 'hambak_manual');
SET @sql := IF(@ref_sc = 0 AND @ref_psm = 0, 'DELETE FROM providers WHERE id = ''hambak_manual'' AND provider_type = ''internal''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @rem_internal := (SELECT COUNT(*) FROM providers WHERE provider_type = 'internal');
SET @sql := IF(@rem_internal = 0, 'ALTER TABLE providers MODIFY COLUMN provider_type ENUM(''identity'', ''telecom'', ''payment'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
