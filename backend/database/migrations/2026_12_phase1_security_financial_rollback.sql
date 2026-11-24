-- =============================================================================
-- HAMBAK TECH & SERVICES — PHASE 1 ROLLBACK SCRIPT
-- File: 2026_12_phase1_security_financial_rollback.sql
-- Reverts Phase 1 configuration changes if an emergency rollback is needed.
-- =============================================================================

-- 1. Revert service_security_rules PIN flags to pre-Phase-1 values
UPDATE `service_security_rules`
SET `require_pin` = 0,
    `requires_pin` = NULL,
    `updated_by` = 'phase1_rollback',
    `updated_at` = NOW()
WHERE `service_key` IN ('nin_v1', 'nin_v2');

UPDATE `service_security_rules`
SET `require_pin` = 0,
    `requires_pin` = 0,
    `updated_by` = 'phase1_rollback',
    `updated_at` = NOW()
WHERE `service_key` = 'bvn_v1';

-- 2. Revert bvn_modification selling_price to pre-Phase-1 value
UPDATE `service_catalogue`
SET `selling_price` = 12000.00,
    `updated_at` = NOW()
WHERE `service_key` = 'bvn_modification';

-- 3. Revert bvn_modification_banks to pre-Phase-1 commercial prices & status
UPDATE `bvn_modification_banks`
SET `customer_price` = 18000.00,
    `is_active` = 1,
    `updated_at` = NOW()
WHERE UPPER(`enrollment_type`) != 'AGENCY';

-- 4. Revert Special Slip slip_code
UPDATE `slip_templates`
SET `slip_code` = 'ninPremium',
    `updated_at` = NOW()
WHERE `id` = 'tpl_859bb83f';
