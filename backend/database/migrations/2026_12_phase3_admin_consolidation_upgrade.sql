-- ============================================================================
-- HAMBAK TECH — PHASE 3 NON-DESTRUCTIVE ADMIN CONSOLIDATION UPGRADE MIGRATION
-- Enrolment Clarification History, Modification Status History,
-- Provider Service Mapping Backfill, BVN Type Sync & Reporting/Filter Indexes.
-- Reversible, MySQL 8.0+ Safe (INFORMATION_SCHEMA conditional DDL).
-- Zero destructive DROP / TRUNCATE / DELETE statements on live records.
-- ============================================================================

-- 1. Ensure modification_status_history table exists (canonical Stage 3 timeline)
CREATE TABLE IF NOT EXISTS `modification_status_history` (
    `id` VARCHAR(36) NOT NULL PRIMARY KEY,
    `request_id` VARCHAR(36) NOT NULL,
    `previous_status` VARCHAR(40) NULL,
    `new_status` VARCHAR(40) NOT NULL,
    `actor_type` ENUM('customer', 'provider', 'admin', 'system') NOT NULL DEFAULT 'system',
    `actor_id` VARCHAR(36) NULL,
    `remarks` TEXT NULL,
    `is_customer_visible` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_mod_hist_req` (`request_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Helper procedures for safe idempotent ADD COLUMN / ADD INDEX on MySQL 8.x
DROP PROCEDURE IF EXISTS `hambak_phase3_add_col`;
DROP PROCEDURE IF EXISTS `hambak_phase3_add_idx`;

DELIMITER $$
CREATE PROCEDURE `hambak_phase3_add_col`(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM `INFORMATION_SCHEMA`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE()
          AND `TABLE_NAME` = p_table
          AND `COLUMN_NAME` = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

CREATE PROCEDURE `hambak_phase3_add_idx`(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64),
    IN p_columns VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM `INFORMATION_SCHEMA`.`STATISTICS`
        WHERE `TABLE_SCHEMA` = DATABASE()
          AND `TABLE_NAME` = p_table
          AND `INDEX_NAME` = p_index
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

-- 3. Add enrolment_orders.additional_info_history for customer <-> admin clarification loop
CALL `hambak_phase3_add_col`('enrolment_orders', 'additional_info_history', 'JSON NULL AFTER `result_retrieved_at`');

-- 4. Add composite filter & reporting indexes for Phase 3 admin consoles
CALL `hambak_phase3_add_idx`('modification_requests', 'idx_mod_req_type_status_created', '`identity_type`, `status`, `created_at`');
CALL `hambak_phase3_add_idx`('enrolment_orders', 'idx_enr_ord_sk_status_created', '`service_key`, `status`, `created_at`');
CALL `hambak_phase3_add_idx`('provider_logs', 'idx_prov_logs_prov_created', '`provider_id`, `status_code`, `created_at`');

DROP PROCEDURE IF EXISTS `hambak_phase3_add_col`;
DROP PROCEDURE IF EXISTS `hambak_phase3_add_idx`;

-- 5. Idempotently backfill provider_service_mappings from authoritative service_catalogue
INSERT INTO `provider_service_mappings`
    (`id`, `provider_id`, `service_key`, `provider_endpoint`, `provider_plan_code`, `wholesale_cost`, `is_active`)
SELECT
    UUID(),
    s.`provider_id`,
    s.`service_key`,
    s.`endpoint`,
    NULL,
    s.`wholesale_cost`,
    s.`is_active`
FROM `service_catalogue` s
WHERE NOT EXISTS (
    SELECT 1
    FROM `provider_service_mappings` psm
    WHERE psm.`service_key` = s.`service_key`
);

-- Keep existing provider_service_mappings aligned with service_catalogue
UPDATE `provider_service_mappings` psm
INNER JOIN `service_catalogue` s ON s.`service_key` = psm.`service_key`
SET psm.`provider_id` = s.`provider_id`,
    psm.`provider_endpoint` = s.`endpoint`,
    psm.`wholesale_cost` = s.`wholesale_cost`,
    psm.`is_active` = s.`is_active`;

-- 6. Safely reconcile modification_bvn_types <-> bvn_modification_banks
-- Strictly preserve ACCESS BANK is_active = 0 (legacy inactive entry).
UPDATE `bvn_modification_banks` b
INNER JOIN `modification_bvn_types` t
    ON UPPER(b.`enrollment_type`) = UPPER(t.`enrollment_type`)
SET b.`bank_name` = t.`label`,
    b.`provider_cost` = t.`wholesale_cost`,
    b.`customer_price` = t.`selling_price`,
    b.`is_active` = CASE
        WHEN UPPER(b.`enrollment_type`) = 'ACCESS BANK' THEN 0
        ELSE t.`is_active`
    END,
    b.`updated_at` = NOW();

INSERT INTO `bvn_modification_banks`
    (`enrollment_type`, `bank_name`, `provider_cost`, `customer_price`, `is_active`, `display_order`)
SELECT
    t.`enrollment_type`,
    t.`label`,
    t.`wholesale_cost`,
    t.`selling_price`,
    CASE WHEN UPPER(t.`enrollment_type`) = 'ACCESS BANK' THEN 0 ELSE t.`is_active` END,
    50
FROM `modification_bvn_types` t
WHERE NOT EXISTS (
    SELECT 1
    FROM `bvn_modification_banks` b
    WHERE UPPER(b.`enrollment_type`) = UPPER(t.`enrollment_type`)
);

INSERT INTO `modification_bvn_types`
    (`id`, `enrollment_type`, `label`, `wholesale_cost`, `selling_price`, `is_active`, `provider_synced_at`)
SELECT
    CONCAT('bvnt_', SUBSTRING(MD5(LOWER(b.`enrollment_type`)), 1, 12)),
    b.`enrollment_type`,
    b.`bank_name`,
    b.`provider_cost`,
    b.`customer_price`,
    CASE WHEN UPPER(b.`enrollment_type`) = 'ACCESS BANK' THEN 0 ELSE b.`is_active` END,
    NULL
FROM `bvn_modification_banks` b
WHERE NOT EXISTS (
    SELECT 1
    FROM `modification_bvn_types` t
    WHERE UPPER(t.`enrollment_type`) = UPPER(b.`enrollment_type`)
);
