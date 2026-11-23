-- HAMBAK TECH ACADEMY — PHASE 1: CORE APPLICATION, ADMISSION & STUDENT ACCOUNT INTEGRATION
-- Target: MySQL 8.0+ (Non-destructive, Additive, Idempotent)
-- Preserves all existing users, HTDA/2026/0001, HTDA/2026/0002, existing applications, courses, wallets, and transactions.
-- Rollback script: 2026_12_academy_phase1_rollback.sql

-- 1. Create Immutable Application Status & Transition Audit History Table
CREATE TABLE IF NOT EXISTS academy_application_events (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    from_status VARCHAR(64) NULL,
    to_status VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_user_id VARCHAR(36) NULL,
    actor_name VARCHAR(191) NOT NULL DEFAULT 'System',
    actor_role VARCHAR(50) NOT NULL DEFAULT 'system',
    notes TEXT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_aae_app (application_id, created_at),
    INDEX idx_aae_status (to_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create Expiring Hashed Account Invitation Tokens Table (No Plaintext Passwords)
CREATE TABLE IF NOT EXISTS academy_account_invitations (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    email VARCHAR(191) NOT NULL,
    full_name VARCHAR(191) NOT NULL,
    phone VARCHAR(32) NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_user_id VARCHAR(36) NULL,
    status ENUM('pending', 'accepted', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_aai_token (token_hash),
    INDEX idx_aai_email (email),
    INDEX idx_aai_app (application_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Safely Migrate academy_applications.status Enum & Add Phase 1 Workflow Columns
ALTER TABLE academy_applications
    MODIFY COLUMN status ENUM(
        'pending',
        'under_review',
        'info_requested',
        'information_requested',
        'approved',
        'rejected',
        'enrolled',
        'withdrawn'
    ) NOT NULL DEFAULT 'pending';

UPDATE academy_applications
   SET status = 'information_requested'
 WHERE status = 'info_requested';

ALTER TABLE academy_applications
    MODIFY COLUMN status ENUM(
        'pending',
        'under_review',
        'information_requested',
        'approved',
        'rejected',
        'enrolled',
        'withdrawn'
    ) NOT NULL DEFAULT 'pending';

-- Additive Columns (MySQL 8.0+ IF NOT EXISTS / safe procedure wrapper)
DROP PROCEDURE IF EXISTS hambak_academy_phase1_migrate;
DELIMITER $$
CREATE PROCEDURE hambak_academy_phase1_migrate()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'applicant_response') THEN
        ALTER TABLE academy_applications ADD COLUMN applicant_response TEXT NULL AFTER info_request_message;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'applicant_responded_at') THEN
        ALTER TABLE academy_applications ADD COLUMN applicant_responded_at DATETIME NULL AFTER applicant_response;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'resubmission_count') THEN
        ALTER TABLE academy_applications ADD COLUMN resubmission_count INT NOT NULL DEFAULT 0 AFTER applicant_responded_at;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'resubmit_token_hash') THEN
        ALTER TABLE academy_applications ADD COLUMN resubmit_token_hash VARCHAR(64) NULL AFTER resubmission_count;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'resubmit_token_expires_at') THEN
        ALTER TABLE academy_applications ADD COLUMN resubmit_token_expires_at DATETIME NULL AFTER resubmit_token_hash;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'enrollment_requirements_met') THEN
        ALTER TABLE academy_applications ADD COLUMN enrollment_requirements_met TINYINT(1) NOT NULL DEFAULT 0 AFTER resubmit_token_expires_at;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'enrollment_exception') THEN
        ALTER TABLE academy_applications ADD COLUMN enrollment_exception TINYINT(1) NOT NULL DEFAULT 0 AFTER enrollment_requirements_met;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'enrollment_exception_reason') THEN
        ALTER TABLE academy_applications ADD COLUMN enrollment_exception_reason TEXT NULL AFTER enrollment_exception;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'enrollment_exception_by') THEN
        ALTER TABLE academy_applications ADD COLUMN enrollment_exception_by VARCHAR(36) NULL AFTER enrollment_exception_reason;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'enrolled_at') THEN
        ALTER TABLE academy_applications ADD COLUMN enrolled_at DATETIME NULL AFTER enrollment_exception_by;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'enrolled_by') THEN
        ALTER TABLE academy_applications ADD COLUMN enrolled_by VARCHAR(36) NULL AFTER enrolled_at;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'withdrawn_at') THEN
        ALTER TABLE academy_applications ADD COLUMN withdrawn_at DATETIME NULL AFTER enrolled_by;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'withdrawal_reason') THEN
        ALTER TABLE academy_applications ADD COLUMN withdrawal_reason TEXT NULL AFTER withdrawn_at;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'account_link_status') THEN
        ALTER TABLE academy_applications ADD COLUMN account_link_status ENUM('unlinked', 'invited', 'linked') NOT NULL DEFAULT 'unlinked' AFTER withdrawal_reason;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_applications' AND column_name = 'deleted_at') THEN
        ALTER TABLE academy_applications ADD COLUMN deleted_at DATETIME NULL AFTER account_link_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_students' AND column_name = 'withdrawn_at') THEN
        ALTER TABLE academy_students ADD COLUMN withdrawn_at DATETIME NULL AFTER academic_status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_students' AND column_name = 'withdrawal_reason') THEN
        ALTER TABLE academy_students ADD COLUMN withdrawal_reason TEXT NULL AFTER withdrawn_at;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'academy_students' AND column_name = 'deleted_at') THEN
        ALTER TABLE academy_students ADD COLUMN deleted_at DATETIME NULL AFTER withdrawal_reason;
    END IF;
END$$
DELIMITER ;
CALL hambak_academy_phase1_migrate();
DROP PROCEDURE IF EXISTS hambak_academy_phase1_migrate;

-- 4. Reconcile Legacy Active Students (e.g. HTDA/2026/0001, HTDA/2026/0002)
UPDATE academy_applications a
INNER JOIN academy_students s ON s.application_id = a.id
   SET a.status = 'enrolled',
       a.enrollment_requirements_met = 1,
       a.enrolled_at = COALESCE(a.enrolled_at, s.id_card_issued_at, s.created_at, NOW())
 WHERE a.status = 'approved'
   AND s.academic_status IN ('active', 'graduated')
   AND s.deleted_at IS NULL;

-- Reconcile linked user indicators cleanly
UPDATE academy_applications
   SET account_link_status = 'linked'
 WHERE user_id IS NOT NULL AND user_id != '' AND account_link_status != 'linked';

-- Insert baseline migration event for applications with no prior audit trail
INSERT INTO academy_application_events (id, application_id, from_status, to_status, action, actor_user_id, actor_name, actor_role, notes, metadata_json, created_at)
SELECT UUID(), a.id, NULL, a.status, 'baseline_sync', NULL, 'System Migration', 'system',
       'Phase 1 baseline state synchronized from existing production record.',
       JSON_OBJECT('application_ref', a.application_ref, 'course_id', a.course_id),
       COALESCE(a.updated_at, a.created_at, NOW())
  FROM academy_applications a
 WHERE NOT EXISTS (
     SELECT 1 FROM academy_application_events e WHERE e.application_id = a.id
 );
