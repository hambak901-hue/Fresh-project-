-- =============================================================================
-- HAMBAK TECH & SERVICES — PHASE 1: PRODUCTION SAFETY, SECURITY & FINANCIAL FIXES
-- File: 2026_12_phase1_security_financial_upgrade.sql
-- Non-destructive, idempotent & reversible SQL migration.
-- Preserves all historical customer accounts, wallets, transactions, and orders.
-- =============================================================================

-- 1. Issue A: Close Transaction PIN bypass on NIN & BVN verification rules
UPDATE `service_security_rules`
SET `require_pin` = 1,
    `requires_pin` = 1,
    `updated_by` = 'phase1_security_upgrade',
    `updated_at` = NOW()
WHERE `service_key` IN ('nin_v1', 'nin_v2', 'bvn_v1');

-- 2. Issue B: Fix negative margin on bvn_modification in service_catalogue
-- Live wholesale_cost is 14000.00; commercial bank customer price is 17500.00 (+3500 margin).
UPDATE `service_catalogue`
SET `selling_price` = 17500.00,
    `updated_at` = NOW()
WHERE `service_key` = 'bvn_modification'
  AND `selling_price` < `wholesale_cost`;

-- 3. Issue C: Reconcile legacy bvn_modification_banks with authoritative modification_bvn_types
UPDATE `bvn_modification_banks` b
INNER JOIN `modification_bvn_types` t
    ON UPPER(b.`enrollment_type`) = UPPER(t.`enrollment_type`)
SET b.`bank_name` = t.`label`,
    b.`provider_cost` = t.`wholesale_cost`,
    b.`customer_price` = t.`selling_price`,
    b.`is_active` = t.`is_active`,
    b.`updated_at` = NOW();

-- Disable legacy ACCESS BANK entry that is absent from live 2SureVerify BVN bank catalog (preserve row for history)
UPDATE `bvn_modification_banks`
SET `is_active` = 0,
    `updated_at` = NOW()
WHERE UPPER(`enrollment_type`) = 'ACCESS BANK';

-- 4. Issue H: Fix Special NIN Slip template slip_code mismatch (ninPremium -> ninSpecial)
UPDATE `slip_templates`
SET `slip_code` = 'ninSpecial',
    `updated_at` = NOW()
WHERE `id` = 'tpl_859bb83f'
  AND `slip_code` = 'ninPremium';
