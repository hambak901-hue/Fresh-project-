-- HAMBAK TECH & SERVICES — Phase 4 Services, Workflow, Status Polling & Webhook Hardening Migration
-- Additive and idempotent: safe to run multiple times on MySQL 5.7+ / 8.0 / MariaDB without dropping existing data.

-- 1. Widen modification_requests identity_type and status ENUMs
ALTER TABLE modification_requests
    MODIFY COLUMN identity_type ENUM('NIN', 'BVN', 'ADDITIONAL') NOT NULL,
    MODIFY COLUMN status ENUM('pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending';

-- 2. Add Phase 4 tracking, refund policy, staff assignment, checklist, and requested corrections to modification_requests
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'provider_transaction_id');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN provider_transaction_id VARCHAR(120) NULL AFTER provider_reference', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'is_refundable');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN is_refundable TINYINT(1) NOT NULL DEFAULT 1 AFTER profit', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'provider_refunded');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN provider_refunded TINYINT(1) NULL AFTER refund_reference', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'provider_refunded_amount');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN provider_refunded_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER provider_refunded', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_to');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_to VARCHAR(36) NULL AFTER reviewed_at', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_staff_name');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_staff_name VARCHAR(150) NULL AFTER assigned_to', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'assigned_at');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN assigned_at DATETIME NULL AFTER assigned_staff_name', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'document_review_checklist');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN document_review_checklist JSON NULL AFTER supporting_documents', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND COLUMN_NAME = 'requested_corrections');
SET @sql := IF(@col = 0, 'ALTER TABLE modification_requests ADD COLUMN requested_corrections TEXT NULL AFTER admin_notes', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_prov_tx');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_mr_prov_tx ON modification_requests (provider_transaction_id)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modification_requests' AND INDEX_NAME = 'idx_mr_assigned');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_mr_assigned ON modification_requests (assigned_to)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. Widen enrolment_orders status ENUM and add Phase 4 workflow columns
ALTER TABLE enrolment_orders
    MODIFY COLUMN status ENUM('pending', 'under_review', 'assigned', 'processing', 'query_required', 'completed', 'failed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending';

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'provider_transaction_id');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN provider_transaction_id VARCHAR(120) NULL AFTER provider_reference', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'is_refundable');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN is_refundable TINYINT(1) NOT NULL DEFAULT 1 AFTER profit', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'provider_refunded');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN provider_refunded TINYINT(1) NULL AFTER refund_reference', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'provider_refunded_amount');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN provider_refunded_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER provider_refunded', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assigned_to');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN assigned_to VARCHAR(36) NULL AFTER reviewed_at', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assigned_staff_name');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN assigned_staff_name VARCHAR(150) NULL AFTER assigned_to', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'assigned_at');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN assigned_at DATETIME NULL AFTER assigned_staff_name', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'document_review_checklist');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN document_review_checklist JSON NULL AFTER supporting_documents', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND COLUMN_NAME = 'requested_corrections');
SET @sql := IF(@col = 0, 'ALTER TABLE enrolment_orders ADD COLUMN requested_corrections TEXT NULL AFTER admin_notes', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_prov_tx');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_eo_prov_tx ON enrolment_orders (provider_transaction_id)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrolment_orders' AND INDEX_NAME = 'idx_eo_assigned');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_eo_assigned ON enrolment_orders (assigned_to)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4. Add is_refundable policy flag to service_catalogue
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalogue' AND COLUMN_NAME = 'is_refundable');
SET @sql := IF(@col = 0, 'ALTER TABLE service_catalogue ADD COLUMN is_refundable TINYINT(1) NOT NULL DEFAULT 1 AFTER slip_type_supported', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. Create enrolment_status_history table (full parity with modification_status_history)
CREATE TABLE IF NOT EXISTS enrolment_status_history (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    previous_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NOT NULL,
    actor_type ENUM('customer', 'provider', 'admin', 'system') NOT NULL DEFAULT 'system',
    actor_id VARCHAR(36) NULL,
    remarks TEXT NULL,
    is_customer_visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_enr_hist_order (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Create identity_webhook_deliveries for delivery_id replay deduplication
CREATE TABLE IF NOT EXISTS identity_webhook_deliveries (
    id VARCHAR(36) PRIMARY KEY,
    delivery_id VARCHAR(150) NOT NULL UNIQUE,
    provider_id VARCHAR(50) NOT NULL DEFAULT '2sureverify',
    reference VARCHAR(120) NULL,
    transaction_id VARCHAR(120) NULL,
    event_type VARCHAR(80) NULL,
    status_received VARCHAR(64) NULL,
    payload_hash VARCHAR(64) NOT NULL,
    domain VARCHAR(32) NULL,
    record_id VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_iwd_ref (reference),
    INDEX idx_iwd_tx (transaction_id),
    INDEX idx_iwd_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
