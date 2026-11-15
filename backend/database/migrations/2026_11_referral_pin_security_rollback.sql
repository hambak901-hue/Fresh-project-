-- ==============================================================================
-- HAMBAKTECH — SAFE ROLLBACK SCRIPT (REFERRAL, PIN & SECURITY UPGRADE)
-- Preserves all legacy wallets, wallet_ledger, transactions, and customer data.
-- Execute ONLY if reverting the upgrade after restoring pre-upgrade code files.
-- ==============================================================================

-- Step 1: Soft-disable feature flags in system_settings (non-destructive rollback)
UPDATE system_settings
SET setting_value = JSON_SET(setting_value, '$.enabled', false), updated_at = NOW()
WHERE setting_key = 'referral_settings';

UPDATE system_settings
SET setting_value = JSON_SET(setting_value, '$.require_pin_activation_for_all_customers', false), updated_at = NOW()
WHERE setting_key = 'pin_policy_settings';

-- Step 2 (Optional Hard Schema Cleanup — run ONLY if no audit retention is needed):
-- DROP TABLE IF EXISTS referral_audit_logs;
-- DROP TABLE IF EXISTS referral_withdrawals;
-- DROP TABLE IF EXISTS referral_points_ledger;
-- DROP TABLE IF EXISTS referral_rewards;
-- DROP TABLE IF EXISTS referral_balances;
-- DROP TABLE IF EXISTS referrals;
-- DROP TABLE IF EXISTS referral_tiers;
-- DROP TABLE IF EXISTS referral_campaigns;
-- DROP TABLE IF EXISTS pin_reset_requests;
-- DROP TABLE IF EXISTS user_mfa_configs;
-- DROP TABLE IF EXISTS mfa_challenges;
-- DROP TABLE IF EXISTS login_attempts;
-- DROP TABLE IF EXISTS user_sessions;
