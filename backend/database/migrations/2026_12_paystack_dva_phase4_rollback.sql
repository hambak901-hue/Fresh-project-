-- ============================================================================
-- HAMBAK TECH & SERVICES — Paystack DVA Phase 4 Safe Rollback
-- Non-destructive: keeps all historical wallet, ledger, and settlement rows intact.
-- Disables live DVA provisioning/processing via system_settings policy pause only.
-- ============================================================================

UPDATE system_settings
   SET setting_value = JSON_SET(COALESCE(NULLIF(setting_value, ''), '{}'), '$.dva_rollout_mode', 'paused', '$.enable_paystack_dva', false),
       updated_at = NOW()
 WHERE setting_key = 'payment_gateways_settings';
