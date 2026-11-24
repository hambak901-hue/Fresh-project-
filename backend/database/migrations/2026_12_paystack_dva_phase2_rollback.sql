-- ============================================================================
-- HAMBAK TECH & SERVICES — Paystack DVA Phase 2 Safe Rollback
-- Non-destructive rollback: disables automated rollout without dropping
-- existing assigned virtual accounts, wallets, or ledger history.
-- ============================================================================

UPDATE customer_virtual_accounts
   SET provisioning_status = 'not_requested'
 WHERE provider = 'paystack'
   AND provisioning_status = 'awaiting_customer_info';
