-- ============================================================================
-- HAMBAK TECH — PHASE 2 NON-DESTRUCTIVE UPGRADE MIGRATION
-- Official NIN/BVN Result Document Delivery, Provider Sync & ninSpecial Parity
-- Reversible, MySQL 8.0+ Safe (INFORMATION_SCHEMA conditional DDL)
-- Zero destructive DROP / TRUNCATE / DELETE statements on live records.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `identity_result_documents` (
    `id` VARCHAR(36) NOT NULL PRIMARY KEY,
    `domain` ENUM('modification', 'enrolment', 'verification') NOT NULL,
    `record_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `document_source` ENUM('provider_base64', 'provider_url', 'provider_binary', 'admin_uploaded') NOT NULL,
    `is_provider_issued` TINYINT(1) NOT NULL DEFAULT 1,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    `file_size` INT NOT NULL DEFAULT 0,
    `sha256_hash` VARCHAR(64) NOT NULL,
    `provider_document_ref` VARCHAR(150) NULL,
    `provider_reference` VARCHAR(150) NULL,
    `tracking_id` VARCHAR(150) NULL,
    `uploaded_by` VARCHAR(36) NULL,
    `retrieval_status` ENUM('ready', 'pending', 'failed', 'unavailable') NOT NULL DEFAULT 'ready',
    `retrieval_error` TEXT NULL,
    `retrieved_at` DATETIME NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_ird_domain_record` (`domain`, `record_id`),
    INDEX `idx_ird_user` (`user_id`),
    INDEX `idx_ird_sha256` (`sha256_hash`),
    INDEX `idx_ird_tracking` (`tracking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Helper procedure (dropped at end) for safe idempotent ADD COLUMN on MySQL 8.x
DROP PROCEDURE IF EXISTS `hambak_phase2_add_col`;
DELIMITER $$
CREATE PROCEDURE `hambak_phase2_add_col`(
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
DELIMITER ;

-- Modification requests Phase 2 result delivery & clarification columns
CALL `hambak_phase2_add_col`('modification_requests', 'result_document_id', 'VARCHAR(36) NULL AFTER `provider_response`');
CALL `hambak_phase2_add_col`('modification_requests', 'result_source', 'VARCHAR(32) NULL AFTER `result_document_id`');
CALL `hambak_phase2_add_col`('modification_requests', 'provider_tracking_id', 'VARCHAR(150) NULL AFTER `result_source`');
CALL `hambak_phase2_add_col`('modification_requests', 'result_payload', 'JSON NULL AFTER `provider_tracking_id`');
CALL `hambak_phase2_add_col`('modification_requests', 'result_retrieval_status', 'VARCHAR(32) NULL AFTER `result_payload`');
CALL `hambak_phase2_add_col`('modification_requests', 'result_retrieval_error', 'TEXT NULL AFTER `result_retrieval_status`');
CALL `hambak_phase2_add_col`('modification_requests', 'result_retrieved_at', 'DATETIME NULL AFTER `result_retrieval_error`');
CALL `hambak_phase2_add_col`('modification_requests', 'additional_info_history', 'JSON NULL AFTER `result_retrieved_at`');

-- Enrolment orders Phase 2 result delivery columns
CALL `hambak_phase2_add_col`('enrolment_orders', 'result_document_id', 'VARCHAR(36) NULL AFTER `provider_response`');
CALL `hambak_phase2_add_col`('enrolment_orders', 'result_source', 'VARCHAR(32) NULL AFTER `result_document_id`');
CALL `hambak_phase2_add_col`('enrolment_orders', 'provider_tracking_id', 'VARCHAR(150) NULL AFTER `result_source`');
CALL `hambak_phase2_add_col`('enrolment_orders', 'result_payload', 'JSON NULL AFTER `provider_tracking_id`');
CALL `hambak_phase2_add_col`('enrolment_orders', 'result_retrieval_status', 'VARCHAR(32) NULL AFTER `result_payload`');
CALL `hambak_phase2_add_col`('enrolment_orders', 'result_retrieval_error', 'TEXT NULL AFTER `result_retrieval_status`');
CALL `hambak_phase2_add_col`('enrolment_orders', 'result_retrieved_at', 'DATETIME NULL AFTER `result_retrieval_error`');

DROP PROCEDURE IF EXISTS `hambak_phase2_add_col`;

-- Ensure ninSpecial template exists non-destructively (never overwrites existing admin edits)
INSERT IGNORE INTO `slip_templates`
    (`id`, `slip_code`, `name`, `category`, `price`, `demo_image_url`, `description`, `supported_service`, `is_active`, `display_order`, `is_recommended`, `badge`, `watermark_text`)
VALUES
    ('tpl_nin_special', 'ninSpecial', 'Special Slip', 'NIN', 550.00, '/assets/aistudio/IMG_0603_1ff5c6a0.jpeg', 'Official Special NIN Slip PDF issued via 2SureVerify.', 'all_nin', 1, 6, 0, 'Special Slip', 'DEMO SPECIMEN - SAMPLE PREVIEW ONLY');
