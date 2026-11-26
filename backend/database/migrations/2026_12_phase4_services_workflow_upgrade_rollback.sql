-- HAMBAK TECH & SERVICES — Phase 4 Services & Workflow Upgrade Rollback
-- Safe non-destructive rollback (does not drop user/financial ledger data; reverses Phase 4 additions cleanly).

DROP TABLE IF EXISTS identity_webhook_deliveries;
DROP TABLE IF EXISTS enrolment_status_history;

-- Reset any Phase 4 intermediate states before narrowing ENUMs back to original values
UPDATE modification_requests SET status = 'pending' WHERE status IN ('under_review', 'assigned');
UPDATE enrolment_orders SET status = 'pending' WHERE status IN ('under_review', 'assigned');

ALTER TABLE modification_requests
    MODIFY COLUMN status ENUM('pending', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending';

ALTER TABLE enrolment_orders
    MODIFY COLUMN status ENUM('pending', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending';
