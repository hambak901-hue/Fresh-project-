-- ============================================================================
-- HAMBAK TECH — PHASE 2 ROLLBACK MIGRATION
-- Reverses ONLY the Phase 2 result delivery schema additions.
-- Does NOT touch customer accounts, wallets, transactions, modification requests,
-- enrolment orders, verification records, or historical payments.
-- ============================================================================

DROP PROCEDURE IF EXISTS `hambak_phase2_drop_col`;
DELIMITER $$
CREATE PROCEDURE `hambak_phase2_drop_col`(
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
DELIMITER ;

CALL `hambak_phase2_drop_col`('modification_requests', 'additional_info_history');
CALL `hambak_phase2_drop_col`('modification_requests', 'result_retrieved_at');
CALL `hambak_phase2_drop_col`('modification_requests', 'result_retrieval_error');
CALL `hambak_phase2_drop_col`('modification_requests', 'result_retrieval_status');
CALL `hambak_phase2_drop_col`('modification_requests', 'result_payload');
CALL `hambak_phase2_drop_col`('modification_requests', 'provider_tracking_id');
CALL `hambak_phase2_drop_col`('modification_requests', 'result_source');
CALL `hambak_phase2_drop_col`('modification_requests', 'result_document_id');

CALL `hambak_phase2_drop_col`('enrolment_orders', 'result_retrieved_at');
CALL `hambak_phase2_drop_col`('enrolment_orders', 'result_retrieval_error');
CALL `hambak_phase2_drop_col`('enrolment_orders', 'result_retrieval_status');
CALL `hambak_phase2_drop_col`('enrolment_orders', 'result_payload');
CALL `hambak_phase2_drop_col`('enrolment_orders', 'provider_tracking_id');
CALL `hambak_phase2_drop_col`('enrolment_orders', 'result_source');
CALL `hambak_phase2_drop_col`('enrolment_orders', 'result_document_id');

DROP PROCEDURE IF EXISTS `hambak_phase2_drop_col`;

DROP TABLE IF EXISTS `identity_result_documents`;
