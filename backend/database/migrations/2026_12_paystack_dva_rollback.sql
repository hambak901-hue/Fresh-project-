-- ============================================================================
-- HAMBAK TECH & SERVICES — Paystack Dedicated Virtual Accounts (DVA) Rollback
-- Safely disables DVA feature flags and preserves all ledger/settlement records.
-- Does NOT drop customer_virtual_accounts or transactions/wallets tables.
-- ============================================================================

-- To revert without losing any financial/audit trail:
-- 1. Disable Paystack DVA in system_settings (handled safely at application tier).
-- 2. Mark active Paystack DVA accounts as deactivated locally if rolling back:
UPDATE customer_virtual_accounts
   SET account_status = 'inactive',
       assignment_status = 'deactivated',
       updated_at = NOW()
 WHERE provider = 'paystack'
   AND account_status = 'active';
