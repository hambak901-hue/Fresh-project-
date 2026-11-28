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
-- 0. Cleanup any stale helper procedure (No stored procedure is created so an
--    abort NEVER leaves _hambak_phase2_abort behind in INFORMATION_SCHEMA)
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _hambak_phase2_abort;

-- ------------------------------------------------------------------------------
-- 1. Operational Data Safety Guard (ABORT BEFORE ANY DROP IF DATA EXISTS)
-- ------------------------------------------------------------------------------
SET @live_hits := 0;
SET @tmp_cnt := 0;

-- 1A. service_catalogue operational / admin-edited checks (covers all 9 Phase 2
--     columns + provider_id='hambak_manual' + batch timestamp integrity)
SET @has_sc_fm    := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'fulfilment_mode');
SET @has_sc_cost  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_fulfilment_cost');
SET @has_sc_sla   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'sla_hours');
SET @has_sc_elig  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'internal_manual_eligible');
SET @has_sc_psv   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'provider_schema_verified');
SET @has_sc_notes := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'eligibility_notes');
SET @has_sc_init  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_initialized_at');
SET @has_sc_uat   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_at');
SET @has_sc_uby   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'routing_updated_by');

SET @sql := IF(@has_sc_cost > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE internal_fulfilment_cost <> 0', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@has_sc_elig > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE internal_manual_eligible <> 0', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@has_sc_uat > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE routing_updated_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@has_sc_uby > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE routing_updated_by IS NOT NULL AND TRIM(routing_updated_by) <> ''''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := 'SELECT COUNT(*) INTO @tmp_cnt FROM service_catalogue WHERE provider_id = ''hambak_manual''';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- Protect fulfilment_mode against any override (internal_manual or baseline drift)
SET @sql := IF(
    @has_sc_fm > 0,
    'SELECT COUNT(*) INTO @tmp_cnt
     FROM service_catalogue
     WHERE fulfilment_mode = ''internal_manual''
        OR fulfilment_mode <> (
            CASE
                WHEN service_key IN (''nin_v1'',''nin_v2'',''nin_v3'',''phone_v1'',''phone_v2'',''phone_v3'',''demo_v1'',''demo_v2'',''demo_v3'',''vnin_verification'',''bvn_v1'',''bvn_v2'',''bvn_v3'')
                    THEN ''provider_instant''
                WHEN service_key = ''bvn_retrieval''
                    THEN CASE
                        WHEN provider_id = ''2sureverify'' AND LOWER(COALESCE(endpoint, '''')) LIKE ''%bvn_retrieval%'' THEN ''provider_async''
                        WHEN processing_type = ''manual'' THEN ''provider_async''
                        ELSE ''provider_instant''
                    END
                WHEN service_key IN (
                    ''bvn_enroll_adult'',''bvn_enroll_child'',
                    ''ipe_clearance'',''nin_validation'',''modification_clearance'',''npc_attestation'',''nin_delinking'',
                    ''nin_personalization'',''nin_personalization_2'',
                    ''nin_mod_name'',''nin_mod_phone'',''nin_mod_address'',''nin_mod_dob'',
                    ''nin_mod_dob_name'',''nin_mod_name_phone'',''gender_modification'',
                    ''suspended_modification'',''bvn_generated_modification'',''child_modification'',
                    ''nin_over_age'',''second_nin_mod_name'',''second_nin_mod_phone'',
                    ''second_nin_mod_name_auth'',''second_nin_mod_phone_auth'',''bvn_modification''
                ) THEN ''provider_async''
                ELSE CASE WHEN processing_type = ''manual'' THEN ''provider_async'' ELSE ''provider_instant'' END
            END
        )',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- Protect sla_hours against admin edits (even if routing_updated_at is NULL)
SET @sql := IF(
    @has_sc_sla > 0,
    'SELECT COUNT(*) INTO @tmp_cnt
     FROM service_catalogue
     WHERE NOT (
         sla_hours <=> (
             CASE
                 WHEN service_key IN (''nin_v1'',''nin_v2'',''nin_v3'',''phone_v1'',''phone_v2'',''phone_v3'',''demo_v1'',''demo_v2'',''demo_v3'',''vnin_verification'',''bvn_v1'',''bvn_v2'',''bvn_v3'')
                     THEN NULL
                 WHEN service_key IN (''bvn_retrieval'',''nin_personalization'',''nin_personalization_2'')
                     THEN 24
                 WHEN service_key IN (''ipe_clearance'',''nin_validation'',''modification_clearance'',''nin_delinking'')
                     THEN 48
                 WHEN service_key IN (''bvn_enroll_adult'',''bvn_enroll_child'')
                     THEN 120
                 WHEN service_key IN (
                     ''npc_attestation'',
                     ''nin_mod_name'',''nin_mod_phone'',''nin_mod_address'',''nin_mod_dob'',
                     ''nin_mod_dob_name'',''nin_mod_name_phone'',''gender_modification'',
                     ''suspended_modification'',''bvn_generated_modification'',''child_modification'',
                     ''nin_over_age'',''second_nin_mod_name'',''second_nin_mod_phone'',
                     ''second_nin_mod_name_auth'',''second_nin_mod_phone_auth'',''bvn_modification''
                 ) THEN 168
                 ELSE CASE WHEN processing_type = ''manual'' THEN 168 ELSE NULL END
             END
         )
     )',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- Protect provider_schema_verified against manual toggle without routing_updated_at
SET @sql := IF(
    @has_sc_psv > 0,
    'SELECT COUNT(*) INTO @tmp_cnt
     FROM service_catalogue
     WHERE provider_schema_verified <> (
         CASE
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_v1'',''nin_v2'',''nin_v3'',
                 ''phone_v1'',''phone_v2'',''phone_v3'',
                 ''demo_v1'',''demo_v2'',''demo_v3'',
                 ''vnin_verification'',
                 ''bvn_v1'',''bvn_v2'',''bvn_v3'',
                 ''bvn_enroll_adult'',''bvn_enroll_child'',
                 ''ipe_clearance'',''nin_validation'',''modification_clearance'',''npc_attestation'',''nin_delinking'',
                 ''nin_personalization'',''nin_personalization_2''
             ) THEN 1
             ELSE 0
         END
     )',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- Protect eligibility_notes against admin-entered or altered notes
SET @sql := IF(
    @has_sc_notes > 0,
    'SELECT COUNT(*) INTO @tmp_cnt
     FROM service_catalogue
     WHERE COALESCE(eligibility_notes, '''') <> (
         CASE
             WHEN service_key IN (''nin_v1'',''nin_v2'',''nin_v3'',''phone_v1'',''phone_v2'',''phone_v3'',''demo_v1'',''demo_v2'',''demo_v3'',''vnin_verification'',''bvn_v1'',''bvn_v2'',''bvn_v3'')
                 THEN CASE
                     WHEN provider_id = ''2sureverify''
                         THEN ''Instant real-time registry verification via verified 2SureVerify API; not eligible for internal_manual fulfilment.''
                     ELSE CONCAT(''Instant verification assigned to unverified provider_id='', provider_id, ''; provider_schema_verified=0 and internal_manual_eligible=0.'')
                 END
             WHEN service_key = ''bvn_retrieval''
                 THEN CASE
                     WHEN provider_id = ''2sureverify'' AND LOWER(COALESCE(endpoint, '''')) LIKE ''%bvn_retrieval%''
                         THEN ''ASYNC PROTOCOL: 2SureVerify /api/v1/bvn_retrieval.php is asynchronous (pending=true; status via bvn_retrieval_status.php or status.php / webhook). Classified provider_async without modifying provider, endpoint, or prices; VerificationController lacks async handler (provider_schema_verified=0, internal_manual_eligible=0, no auto-fallback).''
                     ELSE CONCAT(''UNVERIFIED BVN RETRIEVAL CONFIG: provider_id='', provider_id, '', endpoint='', endpoint, ''; provider_schema_verified=0 and internal_manual_eligible=0.'')
                 END
             WHEN service_key IN (''bvn_enroll_adult'',''bvn_enroll_child'')
                 THEN CASE
                     WHEN provider_id = ''2sureverify''
                         THEN ''2SureVerify enrolment payload verified; internal_manual_eligible defaults to 0 (fail-closed) until administrator confirms documented NIMC/agent authorization and SOP.''
                     ELSE CONCAT(''Enrolment SKU assigned to unverified provider_id='', provider_id, ''; provider_schema_verified=0 and internal_manual_eligible=0.'')
                 END
             WHEN service_key IN (''ipe_clearance'',''nin_validation'',''modification_clearance'',''npc_attestation'',''nin_delinking'')
                 THEN CASE
                     WHEN provider_id = ''2sureverify''
                         THEN ''2SureVerify endpoint schema verified; internal_manual_eligible defaults to 0 (fail-closed) until administrator confirms documented authorization and operational SOP.''
                     ELSE CONCAT(''Additional service assigned to unverified provider_id='', provider_id, ''; provider_schema_verified=0 and internal_manual_eligible=0.'')
                 END
             WHEN service_key IN (''nin_personalization'',''nin_personalization_2'')
                 THEN CASE
                     WHEN provider_id = ''2sureverify''
                         THEN ''2SureVerify non-refundable NIMC personalisation lookup; requires NIMC system access (internal_manual disabled pending confirmed licensed NIMC agent access).''
                     ELSE CONCAT(''Personalisation lookup assigned to unverified provider_id='', provider_id, ''; provider_schema_verified=0 and internal_manual_eligible=0.'')
                 END
             WHEN service_key = ''bvn_modification''
                 THEN ''UNVERIFIED PROVIDER SCHEMA (bvn_modification diverges from 2SureVerify method/fields); internal_manual_eligible defaults to 0 pending NIBSS/bank authorization and admin sign-off.''
             WHEN service_key IN (
                 ''nin_mod_name'',''nin_mod_phone'',''nin_mod_address'',''nin_mod_dob'',
                 ''nin_mod_dob_name'',''nin_mod_name_phone'',''gender_modification'',
                 ''suspended_modification'',''bvn_generated_modification'',''child_modification'',
                 ''nin_over_age'',''second_nin_mod_name'',''second_nin_mod_phone'',
                 ''second_nin_mod_name_auth'',''second_nin_mod_phone_auth''
             ) THEN ''UNVERIFIED PROVIDER SCHEMA: TwoSureVerifyAdapter and live form_schema diverge from 2SureVerify api_docs.php (provider_schema_verified=0); internal_manual_eligible defaults to 0 pending legal/operational authorization sign-off.''
             ELSE ''Unclassified SKU initialized fail-closed (internal_manual_eligible=0, provider_schema_verified=0) pending admin schema and authorization review.''
         END
     )',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- Protect routing_initialized_at against post-migration re-init batches or manual edits
SET @sql := IF(
    @has_sc_init > 0,
    'SELECT (
        SUM(CASE WHEN routing_initialized_at IS NULL THEN 1 ELSE 0 END)
        + CASE WHEN COUNT(*) > 0 AND ABS(TIMESTAMPDIFF(SECOND, MIN(routing_initialized_at), MAX(routing_initialized_at))) > 120 THEN 1 ELSE 0 END
     ) INTO @tmp_cnt FROM service_catalogue',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1B. provider_service_mappings human schema sign-off, notes, flag, timestamp & hambak_manual checks
SET @tbl_psm       := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings');
SET @has_psm_sv    := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified');
SET @has_psm_sat   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_at');
SET @has_psm_sby   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verified_by');
SET @has_psm_notes := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_verification_notes');
SET @has_psm_init  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service_mappings' AND COLUMN_NAME = 'schema_initialized_at');

SET @sql := IF(@tbl_psm > 0 AND @has_psm_sat > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM provider_service_mappings WHERE schema_verified_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_psm > 0 AND @has_psm_sby > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM provider_service_mappings WHERE schema_verified_by IS NOT NULL AND TRIM(schema_verified_by) <> ''''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_psm > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM provider_service_mappings WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(
    @tbl_psm > 0 AND @has_psm_sv > 0,
    'SELECT COUNT(*) INTO @tmp_cnt
     FROM provider_service_mappings
     WHERE schema_verified <> (
         CASE
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_v1'',''nin_v2'',''nin_v3'',
                 ''phone_v1'',''phone_v2'',''phone_v3'',
                 ''demo_v1'',''demo_v2'',''demo_v3'',
                 ''vnin_verification'',
                 ''bvn_v1'',''bvn_v2'',''bvn_v3'',
                 ''bvn_enroll_adult'',''bvn_enroll_child'',
                 ''ipe_clearance'',''nin_validation'',''modification_clearance'',
                 ''npc_attestation'',''nin_delinking'',
                 ''nin_personalization'',''nin_personalization_2''
             ) THEN 1
             ELSE 0
         END
     )',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(
    @tbl_psm > 0 AND @has_psm_notes > 0,
    'SELECT COUNT(*) INTO @tmp_cnt
     FROM provider_service_mappings
     WHERE COALESCE(schema_verification_notes, '''') <> (
         CASE
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_v1'',''nin_v2'',''nin_v3'',
                 ''phone_v1'',''phone_v2'',''phone_v3'',
                 ''demo_v1'',''demo_v2'',''demo_v3'',
                 ''vnin_verification'',
                 ''bvn_v1'',''bvn_v2'',''bvn_v3''
             ) THEN ''2SureVerify instant verification schema verified against official docs.''
             WHEN provider_id = ''2sureverify'' AND service_key IN (''bvn_enroll_adult'',''bvn_enroll_child'')
                 THEN ''2SureVerify enrolment payload verified against official docs.''
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''ipe_clearance'',''nin_validation'',''modification_clearance'',
                 ''npc_attestation'',''nin_delinking'',
                 ''nin_personalization'',''nin_personalization_2''
             ) THEN ''2SureVerify additional service endpoint schema verified against official docs.''
             WHEN provider_id = ''2sureverify'' AND service_key = ''bvn_retrieval''
                 THEN ''ASYNC PROTOCOL / CONTROLLER GAP: 2SureVerify /api/v1/bvn_retrieval.php is async (returns pending=true; requires polling/webhook), while VerificationController dispatches synchronously (schema_verified=0).''
             WHEN provider_id = ''2sureverify'' AND service_key IN (
                 ''nin_mod_name'',''nin_mod_phone'',''nin_mod_address'',''nin_mod_dob'',
                 ''nin_mod_dob_name'',''nin_mod_name_phone'',''gender_modification'',
                 ''suspended_modification'',''bvn_generated_modification'',''child_modification'',
                 ''nin_over_age'',''second_nin_mod_name'',''second_nin_mod_phone'',
                 ''second_nin_mod_name_auth'',''second_nin_mod_phone_auth'',''bvn_modification''
             ) THEN ''UNVERIFIED PROVIDER SCHEMA: TwoSureVerifyAdapter and live form_schema diverge from 2SureVerify api_docs.php.''
             ELSE CONCAT(''UNVERIFIED PROVIDER SCHEMA: provider_id='', provider_id, '' has not undergone per-provider schema verification for '', service_key, ''.'')
         END
     )',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(
    @tbl_psm > 0 AND @has_psm_init > 0,
    'SELECT (
        SUM(CASE WHEN schema_initialized_at IS NULL THEN 1 ELSE 0 END)
        + CASE WHEN COUNT(*) > 0 AND ABS(TIMESTAMPDIFF(SECOND, MIN(schema_initialized_at), MAX(schema_initialized_at))) > 120 THEN 1 ELSE 0 END
     ) INTO @tmp_cnt FROM provider_service_mappings',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- Cross-check initialization timestamp parity between service_catalogue & provider_service_mappings
SET @sql := IF(
    @tbl_psm > 0 AND @has_sc_init > 0 AND @has_psm_init > 0,
    'SELECT CASE
        WHEN (SELECT COUNT(*) FROM service_catalogue) > 0
         AND (SELECT COUNT(*) FROM provider_service_mappings) > 0
         AND ABS(TIMESTAMPDIFF(SECOND, (SELECT MIN(routing_initialized_at) FROM service_catalogue), (SELECT MAX(schema_initialized_at) FROM provider_service_mappings))) > 120
            THEN 1
        WHEN (SELECT COUNT(*) FROM service_catalogue) > 0
         AND (SELECT COUNT(*) FROM provider_service_mappings) > 0
         AND ABS(TIMESTAMPDIFF(SECOND, (SELECT MAX(routing_initialized_at) FROM service_catalogue), (SELECT MIN(schema_initialized_at) FROM provider_service_mappings))) > 120
            THEN 1
        ELSE 0
     END INTO @tmp_cnt',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1C. modification_requests (uses column provider_id)
SET @tbl_mr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests');
SET @has_mr_snap := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_snapshot');
SET @has_mr_sla  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'sla_due_at');
SET @has_mr_fm   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'fulfilment_mode');
SET @has_mr_rev  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'routing_legacy_review');
SET @has_mr_pid  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'provider_id');
SET @has_mr_tx   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'provider_transaction_id');

SET @sql := IF(@tbl_mr > 0 AND @has_mr_snap > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE routing_snapshot IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_mr > 0 AND @has_mr_sla > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE sla_due_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_mr > 0 AND @has_mr_rev > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE routing_legacy_review <> 0', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_mr > 0 AND @has_mr_pid > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @mr_proof_chk := IF(
    @has_mr_tx > 0,
    '( (provider_transaction_id IS NOT NULL AND TRIM(provider_transaction_id) <> '''')
       OR (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )',
    '( (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )'
);

SET @sql := IF(
    @tbl_mr > 0 AND @has_mr_fm > 0,
    CONCAT(
        'SELECT COUNT(*) INTO @tmp_cnt FROM modification_requests
         WHERE fulfilment_mode = ''internal_manual''
            OR (fulfilment_mode IS NOT NULL AND NOT (
                fulfilment_mode = ''provider_async''
                AND provider_id IN (''2sureverify'', ''veripine'')
                AND provider_reference IS NOT NULL
                AND TRIM(provider_reference) <> ''''
                AND provider_reference NOT LIKE ''LOCAL#_%'' ESCAPE ''#''
                AND ', @mr_proof_chk, '
            ))'
    ),
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1D. enrolment_orders (uses column provider_id)
SET @tbl_eo := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders');
SET @has_eo_snap := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_snapshot');
SET @has_eo_sla  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'sla_due_at');
SET @has_eo_fm   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'fulfilment_mode');
SET @has_eo_rev  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'routing_legacy_review');
SET @has_eo_pid  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'provider_id');
SET @has_eo_tx   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'provider_transaction_id');

SET @sql := IF(@tbl_eo > 0 AND @has_eo_snap > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE routing_snapshot IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_eo > 0 AND @has_eo_sla > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE sla_due_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_eo > 0 AND @has_eo_rev > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE routing_legacy_review <> 0', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_eo > 0 AND @has_eo_pid > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders WHERE provider_id = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @eo_proof_chk := IF(
    @has_eo_tx > 0,
    '( (provider_transaction_id IS NOT NULL AND TRIM(provider_transaction_id) <> '''')
       OR (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )',
    '( (provider_status IS NOT NULL AND TRIM(provider_status) <> '''')
       OR (provider_response IS NOT NULL AND JSON_VALID(provider_response) = 1 AND JSON_LENGTH(provider_response) > 0) )'
);

SET @sql := IF(
    @tbl_eo > 0 AND @has_eo_fm > 0,
    CONCAT(
        'SELECT COUNT(*) INTO @tmp_cnt FROM enrolment_orders
         WHERE fulfilment_mode = ''internal_manual''
            OR (fulfilment_mode IS NOT NULL AND NOT (
                fulfilment_mode = ''provider_async''
                AND provider_id IN (''2sureverify'', ''veripine'')
                AND provider_reference IS NOT NULL
                AND TRIM(provider_reference) <> ''''
                AND provider_reference NOT LIKE ''LOCAL#_%'' ESCAPE ''#''
                AND ', @eo_proof_chk, '
            ))'
    ),
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1E. verification_records (NOTE: uses column `provider`, NOT `provider_id`)
SET @tbl_vr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records');
SET @has_vr_snap := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_snapshot');
SET @has_vr_sla  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'sla_due_at');
SET @has_vr_fm   := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'fulfilment_mode');
SET @has_vr_rev  := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'routing_legacy_review');
SET @has_vr_prov := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verification_records' AND COLUMN_NAME = 'provider');

SET @sql := IF(@tbl_vr > 0 AND @has_vr_snap > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE routing_snapshot IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_vr > 0 AND @has_vr_sla > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE sla_due_at IS NOT NULL', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_vr > 0 AND @has_vr_rev > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE routing_legacy_review <> 0', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(@tbl_vr > 0 AND @has_vr_prov > 0, 'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records WHERE provider = ''hambak_manual''', 'SELECT 0 INTO @tmp_cnt');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

SET @sql := IF(
    @tbl_vr > 0 AND @has_vr_fm > 0,
    'SELECT COUNT(*) INTO @tmp_cnt FROM verification_records
     WHERE fulfilment_mode = ''internal_manual''
        OR (fulfilment_mode IS NOT NULL AND NOT (
            fulfilment_mode = ''provider_instant''
            AND status = ''completed''
            AND provider IN (''2sureverify'', ''veripine'')
            AND service_key IN (
                ''nin_v1'',''nin_v2'',''nin_v3'',
                ''phone_v1'',''phone_v2'',''phone_v3'',
                ''demo_v1'',''demo_v2'',''demo_v3'',
                ''vnin_verification'',
                ''bvn_v1'',''bvn_v2'',''bvn_v3''
            )
            AND result_data IS NOT NULL
            AND JSON_VALID(result_data) = 1
            AND JSON_LENGTH(result_data) > 0
        ))',
    'SELECT 0 INTO @tmp_cnt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @live_hits := @live_hits + COALESCE(@tmp_cnt, 0);

-- 1F. providers: active/configured hambak_manual or unexpected internal providers
SET @hm_ops := (
    SELECT COUNT(*)
    FROM providers
    WHERE (
        id = 'hambak_manual'
        AND (
            is_active = 1
            OR is_default = 1
            OR balance <> 0
            OR (api_key IS NOT NULL AND TRIM(api_key) <> '')
            OR (secret_key IS NOT NULL AND TRIM(secret_key) <> '')
            OR (public_key IS NOT NULL AND TRIM(public_key) <> '')
        )
    )
    OR (LOWER(COALESCE(provider_type, '')) = 'internal' AND id <> 'hambak_manual')
);
SET @live_hits := @live_hits + COALESCE(@hm_ops, 0);

-- Procedure-free abort via TEMPORARY TABLE CHECK constraint:
--   When @live_hits > 0, INSERT violates CHECK and aborts execution BEFORE
--   any DROP runs, leaving ZERO permanent tables or _hambak_phase2_abort routine.
DROP TEMPORARY TABLE IF EXISTS _hambak_p2_rb_guard;
CREATE TEMPORARY TABLE _hambak_p2_rb_guard (
    ok TINYINT NOT NULL,
    CONSTRAINT Rollback_ABORTED_operational_or_admin_metadata_exists CHECK (ok = 1)
) ENGINE=InnoDB;
INSERT INTO _hambak_p2_rb_guard (ok) SELECT 0 FROM DUAL WHERE @live_hits > 0;
DROP TEMPORARY TABLE IF EXISTS _hambak_p2_rb_guard;

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
-- 6. Final Cleanup Assurance (No temporary tables or stored procedures remain)
-- ------------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS _hambak_p2_rb_guard;
DROP PROCEDURE IF EXISTS _hambak_phase2_abort;
