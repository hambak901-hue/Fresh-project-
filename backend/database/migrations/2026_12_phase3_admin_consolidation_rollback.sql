-- ============================================================================
-- HAMBAK TECH — PHASE 3 ROLLBACK MIGRATION
-- Reverses ONLY the Phase 3 additive schema column and composite indexes.
-- Preserves all customer accounts, wallets, transactions, audit logs,
-- modification status history, BVN types, service catalogue, and orders.
-- ============================================================================

DROP PROCEDURE IF EXISTS `hambak_phase3_drop_col`;
DROP PROCEDURE IF EXISTS `hambak_phase3_drop_idx`;

DELIMITER $$
CREATE PROCEDURE `hambak_phase3_drop_col`(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64)
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM `INFORMATION_SCHEMA`.`COLUMNS`
        WHERE `TABLE_SCHEMA` = DATABASE()
          AND `TABLE_NAME` = p_table
          AND `COLUMN_NAME` = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP COLUMN `', p_column, '`');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

CREATE PROCEDURE `hambak_phase3_drop_idx`(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64)
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM `INFORMATION_SCHEMA`.`STATISTICS`
        WHERE `TABLE_SCHEMA` = DATABASE()
          AND `TABLE_NAME` = p_table
          AND `INDEX_NAME` = p_index
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL `hambak_phase3_drop_idx`('modification_requests', 'idx_mod_req_type_status_created');
CALL `hambak_phase3_drop_idx`('enrolment_orders', 'idx_enr_ord_sk_status_created');
CALL `hambak_phase3_drop_idx`('provider_logs', 'idx_prov_logs_prov_created');

CALL `hambak_phase3_drop_col`('enrolment_orders', 'additional_info_history');

DROP PROCEDURE IF EXISTS `hambak_phase3_drop_col`;
DROP PROCEDURE IF EXISTS `hambak_phase3_drop_idx`;
