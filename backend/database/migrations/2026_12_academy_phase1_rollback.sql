-- HAMBAK TECH ACADEMY — PHASE 1 ROLLBACK SCRIPT
-- Safe rollback: restores canonical enum compatibility without deleting existing HTDA/2026/0001, HTDA/2026/0002, or user accounts.

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
   SET status = 'info_requested'
 WHERE status = 'information_requested';

UPDATE academy_applications
   SET status = 'pending'
 WHERE status = 'under_review';

UPDATE academy_applications
   SET status = 'rejected'
 WHERE status = 'withdrawn';

ALTER TABLE academy_applications
    MODIFY COLUMN status ENUM(
        'pending',
        'approved',
        'rejected',
        'info_requested',
        'enrolled'
    ) NOT NULL DEFAULT 'pending';

-- Note: academy_application_events and academy_account_invitations can be dropped only if full Phase 1 removal is intended:
-- DROP TABLE IF EXISTS academy_account_invitations;
-- DROP TABLE IF EXISTS academy_application_events;
