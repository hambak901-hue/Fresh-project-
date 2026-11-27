-- ==============================================================================
-- HAMBAK TECH & SERVICES — Unified Service Routing & Fulfilment Engine (Phase 2)
-- Additive, Backward-Compatible, Idempotent Preparation Migration (REVISED)
-- Target Engine: MySQL 8.0+ / MariaDB 10.11+ (InnoDB, utf8mb4_unicode_ci)
--
-- IMPORTANT SAFETY GUARANTEES:
--   1. Does NOT modify selling_price, wholesale_cost, wallets, ledger,
--      accounting, provider API keys/credentials, order statuses, payment_reference,
--      service_catalogue.is_active, or existing service_catalogue.provider_id.
--   2. Does NOT overwrite form_schema, required_fields, or required_documents.
--   3. Preserves all existing providers.provider_type ENUM values dynamically.
--   4. Registers 'hambak_manual' strictly with is_active = 0 (fail-closed) and
--      never uses INSERT IGNORE.
--   5. Uses routing_initialized_at / schema_initialized_at markers so repeated
--      executions never overwrite administrator routing or schema edits.
--   6. Classifies historical orders strictly from concrete upstream evidence;
--      leaves ambiguous records NULL and marks non-terminal pending rows with
--      routing_legacy_review = 1.
--   7. Keeps internal_manual_eligible = 0 across all 39 SKUs and verifies
--      provider schemas strictly per (provider_id, service_key).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Single-statement helper routine for fail-loud SIGNAL SQLSTATE '45000'
--    (Single statement with no internal semicolons; works without DELIMITER)
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _hambak_phase2_abort;
CREATE PROCEDURE _hambak_phase2_abort(IN msg VARCHAR(128))
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;

-- ------------------------------------------------------------------------------
-- 1. Dynamically extend providers.provider_type ENUM (preserving all existing
--    values, nullability, and default) & strictly register 'hambak_manual'
-- ------------------------------------------------------------------------------
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
SET @pt_is_string := IF(
    LOWER(TRIM(COALESCE(@pt_col_type, ''))) LIKE '%char%'
    OR LOWER(TRIM(COALESCE(@pt_col_type, ''))) LIKE '%text%',
    1,
    0
);

SET @pt_invalid := IF(@pt_col_type IS NULL OR (@pt_is_enum = 0 AND @pt_is_string = 0), 1, 0);
SET @abort_msg := 'Phase 2 abort: providers.provider_type missing or unsupported type.';
SET @sql := IF(@pt_invalid = 1, 'CALL _hambak_phase2_abort(@abort_msg)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @pt_null_sql := IF(@pt_nullable = 'NO', ' NOT NULL', ' NULL');
SET @pt_def_sql := IF(@pt_default IS NOT NULL, CONCAT(' DEFAULT ', QUOTE(@pt_default)), '');
SET @pt_new_enum := IF(
    @pt_is_enum = 1 AND @pt_has_internal = 0,
    CONCAT(LEFT(TRIM(@pt_col_type), CHAR_LENGTH(TRIM(@pt_col_type)) - 1), ',''internal'')'),
    NULL
);

SET @sql := IF(
    @pt_is_enum = 1 AND @pt_has_internal = 0,
    CONCAT('ALTER TABLE providers MODIFY COLUMN provider_type ', @pt_new_enum, @pt_null_sql, @pt_def_sql),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Fail loudly if 'hambak_manual' exists with any provider_type other than 'internal'
SET @hm_conflict := (
    SELECT COUNT(*)
    FROM providers
    WHERE id = 'hambak_manual'
      AND LOWER(COALESCE(provider_type, '')) <> 'internal'
);
SET @abort_msg := 'Phase 2 abort: providers.id=hambak_manual exists with non-internal type.';
SET @sql := IF(@hm_conflict > 0, 'CALL _hambak_phase2_abort(@abort_msg)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Insert strictly without INSERT IGNORE, defaulting is_active = 0 and is_default = 0
SET @hm_exists := (
    SELECT COUNT(*)
    FROM providers
    WHERE id = 'hambak_manual'
);
SET @sql := IF(
    @hm_exists = 0,
    'INSERT INTO providers (id, name, provider_type, base_url, api_key, secret_key, public_key, is_active, is_default, timeout_seconds, balance, last_ping_status) VALUES (''hambak_manual'', ''HAMBAK Internal Fulfilment Desk'', ''internal'', ''internal://hambak-manual'', NULL, NULL, NULL, 0, 0, 0, 0.00, ''untested'')',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 2A. Add Unified Routing, Eligibility, Cost & Initialization Columns to
--     service_catalogue (internal_fulfilment_cost is kept strictly separate
--     from provider wholesale_cost)
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

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_initialized_at');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN routing_initialized_at DATETIME NULL', 'SELECT 1');
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
-- 2B. Add Provider-Specific Schema Verification Columns to
--     provider_service_mappings (per (provider_id, service_key) tracking)
-- ------------------------------------------------------------------------------
SET @tbl_psm := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified');
SET @sql := IF(@tbl_psm > 0 AND @col = 0, 'ALTER TABLE provider_service_mappings ADD COLUMN schema_verified TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_at');
SET @sql := IF(@tbl_psm > 0 AND @col = 0, 'ALTER TABLE provider_service_mappings ADD COLUMN schema_verified_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_by');
SET @sql := IF(@tbl_psm > 0 AND @col = 0, 'ALTER TABLE provider_service_mappings ADD COLUMN schema_verified_by VARCHAR(36) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verification_notes');
SET @sql := IF(@tbl_psm > 0 AND @col = 0, 'ALTER TABLE provider_service_mappings ADD COLUMN schema_verification_notes TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_initialized_at');
SET @sql := IF(@tbl_psm > 0 AND @col = 0, 'ALTER TABLE provider_service_mappings ADD COLUMN schema_initialized_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND INDEX_NAME = 'idx_psm_verified');
SET @sql := IF(@tbl_psm > 0 AND @idx = 0, 'CREATE INDEX idx_psm_verified ON provider_service_mappings (provider_id, service_key, schema_verified)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3A. Idempotent Provider-Specific Schema Verification Backfill on
--     provider_service_mappings (stamps schema_initialized_at = NOW(); only
--     verifies 2sureverify rows whose payloads match official 2SureVerify docs;
--     keeps veripine, modifications, and bvn_retrieval at schema_verified = 0)
-- ------------------------------------------------------------------------------
SET @sql := IF(
    @tbl_psm > 0,
    'UPDATE provider_service_mappings
     SET
         schema_verified = CASE
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_v1'', ''nin_v2'', ''nin_v3'',
                 ''phone_v1'', ''phone_v2'', ''phone_v3'',
                 ''demo_v1'', ''demo_v2'', ''demo_v3'',
                 ''vnin_verification'',
                 ''bvn_v1'', ''bvn_v2'', ''bvn_v3'',
                 ''bvn_enroll_adult'', ''bvn_enroll_child'',
                 ''ipe_clearance'', ''nin_validation'', ''modification_clearance'',
                 ''npc_attestation'', ''nin_delinking'',
                 ''nin_personalization'', ''nin_personalization_2''
             ) THEN 1
             ELSE 0
         END,
         schema_verification_notes = CASE
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_v1'', ''nin_v2'', ''nin_v3'',
                 ''phone_v1'', ''phone_v2'', ''phone_v3'',
                 ''demo_v1'', ''demo_v2'', ''demo_v3'',
                 ''vnin_verification'',
                 ''bvn_v1'', ''bvn_v2'', ''bvn_v3''
             ) THEN ''2SureVerify instant verification schema verified against official docs.''
             WHEN provider_id = ''2sureverify'' AND service_key IN (''bvn_enroll_adult'', ''bvn_enroll_child'')
                 THEN ''2SureVerify enrolment payload verified against official docs.''
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''ipe_clearance'', ''nin_validation'', ''modification_clearance'',
                 ''npc_attestation'', ''nin_delinking'',
                 ''nin_personalization'', ''nin_personalization_2''
             ) THEN ''2SureVerify additional service endpoint schema verified against official docs.''
             WHEN provider_id = ''2sureverify'' AND service_key = ''bvn_retrieval''
                 THEN ''UNVERIFIED / PROTOCOL MISMATCH: 2SureVerify /api/v1/bvn_retrieval.php is async (pending=true), while VerificationController dispatches synchronously.''
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_mod_name'', ''nin_mod_phone'', ''nin_mod_address'', ''nin_mod_dob'',
                 ''nin_mod_dob_name'', ''nin_mod_name_phone'', ''gender_modification'',
                 ''suspended_modification'', ''bvn_generated_modification'', ''child_modification'',
                 ''nin_over_age'', ''second_nin_mod_name'', ''second_nin_mod_phone'',
                 ''second_nin_mod_name_auth'', ''second_nin_mod_phone_auth'', ''bvn_modification''
             ) THEN ''UNVERIFIED PROVIDER SCHEMA: TwoSureVerifyAdapter and live form_schema diverge from 2SureVerify api_docs.php.''
             ELSE CONCAT(''UNVERIFIED PROVIDER SCHEMA: provider_id='', provider_id, '' has not undergone per-provider schema verification for '', service_key, ''.'')
         END,
         schema_initialized_at = NOW()
     WHERE schema_initialized_at IS NULL
       AND schema_verified_at IS NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 3B. Idempotent Phase 2 Baseline Backfill for service_catalogue
--     - Filters WHERE routing_initialized_at IS NULL AND routing_updated_at IS NULL
--     - Stamps routing_initialized_at = NOW() on every initialized row
--     - Leaves routing_updated_at & routing_updated_by NULL for admin changes
--     - Marks provider_schema_verified = 1 ONLY when provider_id = ''2sureverify''
--       AND SKU is verified (never blindly marks Veripine/other providers verified)
--     - Keeps internal_manual_eligible = 0 across ALL SKUs (fail-closed)
-- ------------------------------------------------------------------------------

-- 3B-1. Verified Instant NIN & BVN Verification SKUs (Not eligible for manual desk)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_instant',
    sla_hours = NULL,
    internal_manual_eligible = 0,
    provider_schema_verified = CASE WHEN provider_id = '2sureverify' THEN 1 ELSE 0 END,
    eligibility_notes = CASE
        WHEN provider_id = '2sureverify'
            THEN 'Instant real-time registry verification via verified 2SureVerify API; not eligible for internal_manual fulfilment.'
        ELSE CONCAT('Instant verification assigned to unverified provider_id=', provider_id, '; provider_schema_verified=0 and internal_manual_eligible=0.')
    END,
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL
  AND service_key IN (
      'nin_v1', 'nin_v2', 'nin_v3',
      'phone_v1', 'phone_v2', 'phone_v3',
      'demo_v1', 'demo_v2', 'demo_v3',
      'vnin_verification',
      'bvn_v1', 'bvn_v2', 'bvn_v3'
  );

-- 3B-2. BVN Retrieval by Phone (Flagged: 2SureVerify endpoint is async; controller runs sync)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_instant',
    sla_hours = 24,
    internal_manual_eligible = 0,
    provider_schema_verified = 0,
    eligibility_notes = 'PROTOCOL MISMATCH: 2SureVerify /api/v1/bvn_retrieval.php is async (pending=true), while VerificationController dispatches synchronously. Needs async support or Veripine /bvn-phone verification in Phase 3.',
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL
  AND service_key = 'bvn_retrieval';

-- 3B-3. Enrolment SKUs (Fail-closed: internal_manual_eligible = 0 until admin confirms authorization)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = 120,
    internal_manual_eligible = 0,
    provider_schema_verified = CASE WHEN provider_id = '2sureverify' THEN 1 ELSE 0 END,
    eligibility_notes = CASE
        WHEN provider_id = '2sureverify'
            THEN '2SureVerify enrolment payload verified; internal_manual_eligible defaults to 0 (fail-closed) until administrator confirms documented NIMC/agent authorization and SOP.'
        ELSE CONCAT('Enrolment SKU assigned to unverified provider_id=', provider_id, '; provider_schema_verified=0 and internal_manual_eligible=0.')
    END,
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL
  AND service_key IN ('bvn_enroll_adult', 'bvn_enroll_child');

-- 3B-4. Additional Services (Fail-closed: internal_manual_eligible = 0 until admin confirms authorization)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = CASE WHEN service_key = 'npc_attestation' THEN 168 ELSE 48 END,
    internal_manual_eligible = 0,
    provider_schema_verified = CASE WHEN provider_id = '2sureverify' THEN 1 ELSE 0 END,
    eligibility_notes = CASE
        WHEN provider_id = '2sureverify'
            THEN '2SureVerify endpoint schema verified; internal_manual_eligible defaults to 0 (fail-closed) until administrator confirms documented authorization and operational SOP.'
        ELSE CONCAT('Additional service assigned to unverified provider_id=', provider_id, '; provider_schema_verified=0 and internal_manual_eligible=0.')
    END,
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL
  AND service_key IN ('ipe_clearance', 'nin_validation', 'modification_clearance', 'npc_attestation', 'nin_delinking');

-- 3B-5. Additional Services (Non-refundable Automated Tracking Lookups)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = 24,
    internal_manual_eligible = 0,
    provider_schema_verified = CASE WHEN provider_id = '2sureverify' THEN 1 ELSE 0 END,
    eligibility_notes = CASE
        WHEN provider_id = '2sureverify'
            THEN '2SureVerify non-refundable NIMC personalisation lookup; requires NIMC system access (internal_manual disabled pending confirmed licensed NIMC agent access).'
        ELSE CONCAT('Personalisation lookup assigned to unverified provider_id=', provider_id, '; provider_schema_verified=0 and internal_manual_eligible=0.')
    END,
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL
  AND service_key IN ('nin_personalization', 'nin_personalization_2');

-- 3B-6. All 16 Modification SKUs (Keep current provider_async behavior; block verified flag & fail-close internal_manual_eligible = 0)
UPDATE service_catalogue
SET
    fulfilment_mode = 'provider_async',
    sla_hours = 168,
    internal_manual_eligible = 0,
    provider_schema_verified = 0,
    eligibility_notes = CASE
        WHEN service_key = 'bvn_modification'
            THEN 'UNVERIFIED PROVIDER SCHEMA (bvn_modification diverges from 2SureVerify method/fields); internal_manual_eligible defaults to 0 pending NIBSS/bank authorization and admin sign-off.'
        ELSE 'UNVERIFIED PROVIDER SCHEMA: TwoSureVerifyAdapter and live form_schema diverge from 2SureVerify api_docs.php (provider_schema_verified=0); internal_manual_eligible defaults to 0 pending legal/operational authorization sign-off.'
    END,
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL
  AND service_key IN (
      'nin_mod_name', 'nin_mod_phone', 'nin_mod_address', 'nin_mod_dob',
      'nin_mod_dob_name', 'nin_mod_name_phone', 'gender_modification',
      'suspended_modification', 'bvn_generated_modification', 'child_modification',
      'nin_over_age', 'second_nin_mod_name', 'second_nin_mod_phone',
      'second_nin_mod_name_auth', 'second_nin_mod_phone_auth', 'bvn_modification'
  );

-- 3B-7. Fail-closed catch-all for any unforeseen production SKUs not in the 39 baseline list
UPDATE service_catalogue
SET
    fulfilment_mode = CASE WHEN processing_type = 'manual' THEN 'provider_async' ELSE 'provider_instant' END,
    sla_hours = CASE WHEN processing_type = 'manual' THEN 168 ELSE NULL END,
    internal_manual_eligible = 0,
    provider_schema_verified = 0,
    eligibility_notes = 'Unclassified SKU initialized fail-closed (internal_manual_eligible=0, provider_schema_verified=0) pending admin schema and authorization review.',
    routing_initialized_at = NOW()
WHERE routing_initialized_at IS NULL
  AND routing_updated_at IS NULL;

-- ------------------------------------------------------------------------------
-- 4. Add Order Provenance, Routing Snapshot & SLA Columns to Order Tables
--    (Preserves NULL on ambiguous legacy rows; never alters status/cost/ledger)
-- ------------------------------------------------------------------------------

-- 4A. modification_requests
SET @tbl_mr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'fulfilment_mode');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN fulfilment_mode VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_snapshot');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN routing_snapshot JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'sla_due_at');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN sla_due_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_legacy_review');
SET @sql := IF(@tbl_mr > 0 AND @col = 0, 'ALTER TABLE modification_requests ADD COLUMN routing_legacy_review TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_fulfilment');
SET @sql := IF(@tbl_mr > 0 AND @idx = 0, 'CREATE INDEX idx_mr_fulfilment ON modification_requests (fulfilment_mode, status)', 'SELECT 1');
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
-- 5. Evidence-Based Legacy Order Provenance Classification (NEVER guesses)
--    - verification_records: ONLY classifies provable instant completed rows
--      with verified instant service_key, known provider, and non-empty JSON
--      result_data. Strictly excludes bvn_retrieval, pending, failed, and NULL
--      service_key; marks ambiguous pending rows routing_legacy_review = 1.
--    - modification_requests & enrolment_orders: ONLY classifies provider_async
--      when provider_id is external ('2sureverify','veripine'), provider_reference
--      is non-empty and not LOCAL_%, AND genuine upstream dispatch proof exists
--      (provider_transaction_id, provider_status, or non-empty provider_response).
--      Ambiguous rows retain fulfilment_mode = NULL; non-terminal ambiguous rows
--      receive routing_legacy_review = 1.
-- ------------------------------------------------------------------------------

-- 5A. verification_records
SET @sql := IF(
    @tbl_vr > 0,
    'UPDATE verification_records
     SET fulfilment_mode = ''provider_instant''
     WHERE fulfilment_mode IS NULL
       AND status = ''completed''
       AND provider IN (''2sureverify'', ''veripine'')
       AND service_key IN (
           ''nin_v1'', ''nin_v2'', ''nin_v3'',
           ''phone_v1'', ''phone_v2'', ''phone_v3'',
           ''demo_v1'', ''demo_v2'', ''demo_v3'',
           ''vnin_verification'',
           ''bvn_v1'', ''bvn_v2'', ''bvn_v3''
       )
       AND result_data IS NOT NULL
       AND JSON_VALID(result_data) = 1
       AND JSON_LENGTH(result_data) > 0',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @tbl_vr > 0,
    'UPDATE verification_records
     SET routing_legacy_review = 1
     WHERE fulfilment_mode IS NULL
       AND routing_legacy_review = 0
       AND status = ''pending''',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5B. modification_requests (handles both Phase-4 and base schema.sql column sets)
SET @mr_has_tx := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'modification_requests'
      AND COLUMN_NAME = 'provider_transaction_id'
);

SET @mr_proof_expr := IF(
    @mr_has_tx > 0,
    '( (provider_transaction_id IS NOT NULL AND TRIM(provider_transaction_id) <> '''')
       OR (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )',
    '( (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )'
);

SET @sql := IF(
    @tbl_mr > 0,
    CONCAT(
        'UPDATE modification_requests
         SET fulfilment_mode = ''provider_async''
         WHERE fulfilment_mode IS NULL
           AND provider_id IN (''2sureverify'', ''veripine'')
           AND provider_reference IS NOT NULL
           AND TRIM(provider_reference) <> ''''
           AND provider_reference NOT LIKE ''LOCAL#_%'' ESCAPE ''#''
           AND ',
        @mr_proof_expr
    ),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @tbl_mr > 0,
    'UPDATE modification_requests
     SET routing_legacy_review = 1
     WHERE fulfilment_mode IS NULL
       AND routing_legacy_review = 0
       AND status IN (''pending'', ''under_review'', ''assigned'', ''processing'', ''query_required'')',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5C. enrolment_orders
SET @eo_has_tx := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enrolment_orders'
      AND COLUMN_NAME = 'provider_transaction_id'
);

SET @eo_proof_expr := IF(
    @eo_has_tx > 0,
    '( (provider_transaction_id IS NOT NULL AND TRIM(provider_transaction_id) <> '''')
       OR (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )',
    '( (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )'
);

SET @sql := IF(
    @tbl_eo > 0,
    CONCAT(
        'UPDATE enrolment_orders
         SET fulfilment_mode = ''provider_async''
         WHERE fulfilment_mode IS NULL
           AND provider_id IN (''2sureverify'', ''veripine'')
           AND provider_reference IS NOT NULL
           AND TRIM(provider_reference) <> ''''
           AND provider_reference NOT LIKE ''LOCAL#_%'' ESCAPE ''#''
           AND ',
        @eo_proof_expr
    ),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @tbl_eo > 0,
    'UPDATE enrolment_orders
     SET routing_legacy_review = 1
     WHERE fulfilment_mode IS NULL
       AND routing_legacy_review = 0
       AND status IN (''pending'', ''under_review'', ''assigned'', ''processing'', ''query_required'')',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------------------
-- 6. Cleanup Temporary Helper Procedure
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _hambak_phase2_abort;
