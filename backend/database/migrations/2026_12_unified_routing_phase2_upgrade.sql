-- ==============================================================================
-- HAMBAK TECH & SERVICES — Unified Service Routing & Fulfilment Engine (Phase 2)
-- Additive, Backward-Compatible, Idempotent Preparation Migration
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+ (InnoDB, utf8mb4_unicode_ci)
--
-- IMPORTANT SAFETY GUARANTEES:
--   1. Does NOT modify selling_price, wholesale_cost, is_active, or provider API keys.
--   2. Does NOT overwrite form_schema, required_fields, or required_documents.
--   3. Does NOT flip any active service to internal_manual or alter order statuses.
--   4. Marks all 16 unverified modification schemas provider_schema_verified = 0.
--   5. Safe to run repeatedly; checks INFORMATION_SCHEMA before every DDL change.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend providers.provider_type ENUM and register internal desk provider
--    (Required to satisfy service_catalogue.fk_cat_provider -> providers(id))
-- ------------------------------------------------------------------------------
SET @prov_type_has_internal := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'providers'
      AND COLUMN_NAME = 'provider_type'
      AND COLUMN_TYPE LIKE '%''internal''%'
);
SET @sql := IF(
    @prov_type_has_internal = 0,
    'ALTER TABLE providers MODIFY COLUMN provider_type ENUM(''identity'', ''telecom'', ''payment'', ''internal'') NOT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO providers
    (id, name, provider_type, base_url, api_key, secret_key, public_key, is_active, is_default, timeout_seconds, balance, last_ping_status)
VALUES
    ('hambak_manual', 'HAMBAK Internal Fulfilment Desk', 'internal', 'internal://hambak-manual', NULL, NULL, NULL, 1, 0, 0, 0.00, 'operational');

-- ------------------------------------------------------------------------------
-- 2. Add Unified Routing, Eligibility & Internal Cost Metadata to service_catalogue
--    (internal_fulfilment_cost is kept strictly separate from provider wholesale_cost)
-- ------------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN fulfilment_mode ENUM(''provider_instant'', ''provider_async'', ''internal_manual'') NOT NULL DEFAULT ''provider_instant''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN internal_fulfilment_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'sla_hours');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN sla_hours INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_manual_eligible');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN internal_manual_eligible TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'provider_schema_verified');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN provider_schema_verified TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'eligibility_notes');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN eligibility_notes TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_at');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN routing_updated_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_by');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN routing_updated_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND INDEX_NAME = 'idx_sc_fulfilment');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_sc_fulfilment ON service_catalogue (fulfilment_mode, is_active)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND INDEX_NAME = 'idx_sc_routing_eligible');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_sc_routing_eligible ON service_catalogue (internal_manual_eligible, provider_schema_verified, is_active)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3. Non-destructive Phase 2 Baseline Backfill for service_catalogue
--    Only initializes rows where routing_updated_at IS NULL so prior admin
--    routing decisions are never overwritten on re-execution.
-- ------------------------------------------------------------------------------

-- 3A. Verified Instant NIN & BVN Verification SKUs (Not eligible for manual desk)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_instant',
    sla_hours = NULL,
    internal_manual_eligible = 0,
    provider_schema_verified = 1,
    eligibility_notes = 'Instant real-time registry verification via verified provider API; not eligible for internal_manual fulfilment.'
WHERE routing_updated_at IS NULL
  AND service_key IN (
      'nin_v1', 'nin_v2', 'nin_v3',
      'phone_v1', 'phone_v2', 'phone_v3',
      'demo_v1', 'demo_v2', 'demo_v3',
      'vnin_verification',
      'bvn_v1', 'bvn_v2', 'bvn_v3'
  );

-- 3B. BVN Retrieval by Phone (Flagged: 2SureVerify endpoint is async; controller runs sync)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_instant',
    sla_hours = 24,
    internal_manual_eligible = 0,
    provider_schema_verified = 0,
    eligibility_notes = 'PROTOCOL MISMATCH: 2SureVerify /api/v1/bvn_retrieval.php is async (pending=true), while VerificationController dispatches synchronously. Needs async support or Veripine /bvn-phone verification in Phase 3.'
WHERE routing_updated_at IS NULL
  AND service_key = 'bvn_retrieval';

-- 3C. Verified Enrolment SKUs (Provider Async verified; Internal Manual eligible)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = 120,
    internal_manual_eligible = 1,
    provider_schema_verified = 1,
    eligibility_notes = '2SureVerify enrolment payload verified; eligible for provider_async or authorized HAMBAK NIN enrolment desk (internal_manual).'
WHERE routing_updated_at IS NULL
  AND service_key IN ('bvn_enroll_adult', 'bvn_enroll_child');

-- 3D. Verified Additional Services (Refundable / Desk-assist eligible)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = CASE WHEN service_key = 'npc_attestation' THEN 168 ELSE 48 END,
    internal_manual_eligible = 1,
    provider_schema_verified = 1,
    eligibility_notes = '2SureVerify endpoint schema verified; eligible for provider_async or authorized HAMBAK specialist fulfilment desk.'
WHERE routing_updated_at IS NULL
  AND service_key IN ('ipe_clearance', 'nin_validation', 'modification_clearance', 'npc_attestation', 'nin_delinking');

-- 3E. Verified Additional Services (Non-refundable Automated Tracking Lookups)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = 24,
    internal_manual_eligible = 0,
    provider_schema_verified = 1,
    eligibility_notes = '2SureVerify non-refundable NIMC personalisation lookup; requires NIMC system access (internal_manual disabled by default unless licensed NIMC agent access is confirmed).'
WHERE routing_updated_at IS NULL
  AND service_key IN ('nin_personalization', 'nin_personalization_2');

-- 3F. All 16 Modification SKUs (Keep current provider_async behavior; block verified flag until Phase 3 schema remediation)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = 168,
    internal_manual_eligible = CASE
        WHEN service_key = 'bvn_modification' THEN 0
        ELSE 1
    END,
    provider_schema_verified = 0,
    eligibility_notes = CASE
        WHEN service_key = 'bvn_modification' THEN 'UNVERIFIED PROVIDER SCHEMA (bvn_modification diverges from 2SureVerify method/fields); internal_manual defaults to 0 unless HAMBAK holds NIBSS/bank BVN modification accreditation.'
        ELSE 'UNVERIFIED PROVIDER SCHEMA: TwoSureVerifyAdapter and live form_schema diverge from 2SureVerify api_docs.php; provider_schema_verified=0 until Phase 3 remediation. Eligible for internal_manual where authorized.'
    END
WHERE routing_updated_at IS NULL
  AND service_key IN (
      'nin_mod_name', 'nin_mod_phone', 'nin_mod_address', 'nin_mod_dob',
      'nin_mod_dob_name', 'nin_mod_name_phone', 'gender_modification',
      'suspended_modification', 'bvn_generated_modification', 'child_modification',
      'nin_over_age', 'second_nin_mod_name', 'second_nin_mod_phone',
      'second_nin_mod_name_auth', 'second_nin_mod_phone_auth', 'bvn_modification'
  );

-- ------------------------------------------------------------------------------
-- 4. Add Order Provenance, Routing Snapshot & SLA Columns to Order Tables
--    (Preserves NULL on ambiguous legacy rows; never alters status/cost/ledger)
-- ------------------------------------------------------------------------------

-- 4A. modification_requests
SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@tbl > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN fulfilment_mode VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@tbl > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN routing_snapshot JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@tbl > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN sla_due_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@tbl > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN routing_legacy_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_fulfilment');
SET @sql := IF(@tbl > 0 AND @idx = 0, 'CREATE INDEX idx_mr_fulfilment ON modification_requests (fulfilment_mode, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4B. enrolment_orders
SET @tbl_eo := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders');
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN fulfilment_mode VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN routing_snapshot JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN sla_due_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@tbl_eo > 0 AND @col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN routing_legacy_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_fulfilment');
SET @sql := IF(@tbl_eo > 0 AND @idx = 0, 'CREATE INDEX idx_eo_fulfilment ON enrolment_orders (fulfilment_mode, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4C. verification_records
SET @tbl_vr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records');
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN fulfilment_mode VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN routing_snapshot JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN sla_due_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@tbl_vr > 0 AND @col = 0, 'ALTER TABLE verification_records ADD COLUMN routing_legacy_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND INDEX_NAME = 'idx_vr_fulfilment');
SET @sql := IF(@tbl_vr > 0 AND @idx = 0, 'CREATE INDEX idx_vr_fulfilment ON verification_records (fulfilment_mode, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 5. Safe Legacy Order Provenance Tagging
--    - Only tags fulfilment_mode = 'provider_async' where upstream provider
--      reference/transaction/response already exists.
--    - Ambiguous legacy non-terminal orders keep fulfilment_mode = NULL and get
--      routing_legacy_review = 1 so existing workflows continue untouched.
-- ------------------------------------------------------------------------------
UPDATE verification_records
SET fulfilment_mode = 'provider_instant'
WHERE fulfilment_mode IS NULL;

UPDATE modification_requests
SET fulfilment_mode = 'provider_async'
WHERE fulfilment_mode IS NULL
  AND (
      (provider_reference IS NOT NULL AND provider_reference <> '')
      OR (provider_transaction_id IS NOT NULL AND provider_transaction_id <> '')
      OR provider_response IS NOT NULL
  );

UPDATE modification_requests
SET routing_legacy_review = 1
WHERE fulfilment_mode IS NULL
  AND routing_legacy_review = 0
  AND status IN ('pending', 'under_review', 'assigned', 'processing', 'query_required');

UPDATE enrolment_orders
SET fulfilment_mode = 'provider_async'
WHERE fulfilment_mode IS NULL
  AND (
      (provider_reference IS NOT NULL AND provider_reference <> '')
      OR (provider_transaction_id IS NOT NULL AND provider_transaction_id <> '')
      OR provider_response IS NOT NULL
  );

UPDATE enrolment_orders
SET routing_legacy_review = 1
WHERE fulfilment_mode IS NULL
  AND routing_legacy_review = 0
  AND status IN ('pending', 'under_review', 'assigned', 'processing', 'query_required');
