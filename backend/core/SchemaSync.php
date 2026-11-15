<?php
/**
 * @file SchemaSync.php
 * Idempotent Production MySQL Schema Synchronizer
 * Ensures all required tables and columns exist without dropping data.
 */

declare(strict_types=1);

namespace HambakTech\Core;

use Throwable;

class SchemaSync
{
    public static function sync(Database $db): array
    {
        $applied = [];
        $errors = [];

        $tableDefinitions = [
            'customer_virtual_accounts' => 'CREATE TABLE IF NOT EXISTS customer_virtual_accounts (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL UNIQUE,
                provider VARCHAR(50) NOT NULL DEFAULT "flutterwave",
                order_ref VARCHAR(100) NOT NULL UNIQUE,
                flw_ref VARCHAR(100) NULL,
                account_number VARCHAR(30) NOT NULL,
                bank_name VARCHAR(100) NOT NULL,
                account_status ENUM("active", "inactive", "pending_approval") NOT NULL DEFAULT "pending_approval",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_va_account (account_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'broadcasts' => 'CREATE TABLE IF NOT EXISTS broadcasts (
                id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(191) NOT NULL,
                message TEXT NOT NULL,
                channel VARCHAR(32) NOT NULL DEFAULT "in_app",
                type VARCHAR(32) NOT NULL DEFAULT "info",
                target_role VARCHAR(32) NOT NULL DEFAULT "all",
                user_id VARCHAR(36) NULL,
                recipient_count INT NOT NULL DEFAULT 0,
                sent_by VARCHAR(36) NULL,
                sent_by_name VARCHAR(191) NULL,
                status VARCHAR(32) NOT NULL DEFAULT "sent",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'email_logs' => 'CREATE TABLE IF NOT EXISTS email_logs (
                id VARCHAR(36) PRIMARY KEY,
                recipient VARCHAR(191) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT "sent",
                error TEXT NULL,
                host VARCHAR(191) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_el_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'sms_logs' => 'CREATE TABLE IF NOT EXISTS sms_logs (
                id VARCHAR(36) PRIMARY KEY,
                recipient VARCHAR(64) NOT NULL,
                message TEXT NOT NULL,
                units INT NOT NULL DEFAULT 1,
                status VARCHAR(32) NOT NULL DEFAULT "pending",
                provider VARCHAR(50) NOT NULL DEFAULT "termii",
                provider_reference VARCHAR(120) NULL,
                error TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sl_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'uploaded_documents' => 'CREATE TABLE IF NOT EXISTS uploaded_documents (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                document_type VARCHAR(64) NOT NULL DEFAULT "kyc_document",
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                file_size INT NOT NULL DEFAULT 0,
                file_path VARCHAR(500) NOT NULL,
                file_url VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ud_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'store_items' => 'CREATE TABLE IF NOT EXISTS store_items (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(191) NOT NULL,
                category VARCHAR(100) NOT NULL,
                price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                stock INT NOT NULL DEFAULT 0,
                description TEXT NULL,
                image_url VARCHAR(500) NULL,
                status ENUM("active", "draft", "out_of_stock") NOT NULL DEFAULT "active",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'academy_courses' => 'CREATE TABLE IF NOT EXISTS academy_courses (
                id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(191) NOT NULL,
                category VARCHAR(100) NULL DEFAULT "Digital Skills",
                level VARCHAR(50) NOT NULL,
                duration VARCHAR(50) NOT NULL,
                modules_count INT NOT NULL DEFAULT 1,
                price DECIMAL(15, 2) NULL DEFAULT NULL,
                description TEXT NULL,
                curriculum_outline TEXT NULL,
                is_available TINYINT(1) NOT NULL DEFAULT 1,
                admission_start_date DATE NULL,
                admission_end_date DATE NULL,
                display_order INT NOT NULL DEFAULT 1,
                status ENUM("draft", "enrolling", "active") NOT NULL DEFAULT "enrolling",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'academy_applications' => 'CREATE TABLE IF NOT EXISTS academy_applications (
                id VARCHAR(36) PRIMARY KEY,
                application_ref VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NULL,
                course_id VARCHAR(36) NOT NULL,
                full_name VARCHAR(191) NOT NULL,
                email VARCHAR(191) NOT NULL,
                phone VARCHAR(32) NOT NULL,
                date_of_birth DATE NOT NULL,
                age_at_submission INT NOT NULL DEFAULT 18,
                gender VARCHAR(24) NOT NULL,
                address TEXT NOT NULL,
                state VARCHAR(64) NOT NULL,
                lga VARCHAR(64) NOT NULL,
                qualification VARCHAR(120) NULL,
                study_mode VARCHAR(32) NOT NULL DEFAULT "physical",
                preferred_schedule VARCHAR(32) NOT NULL DEFAULT "weekday",
                guardian_name VARCHAR(191) NULL,
                guardian_phone VARCHAR(32) NULL,
                guardian_address TEXT NULL,
                guardian_relationship VARCHAR(64) NULL,
                emergency_contact_name VARCHAR(191) NULL,
                emergency_contact_phone VARCHAR(32) NULL,
                passport_url TEXT NULL,
                status ENUM("pending", "approved", "rejected", "info_requested", "enrolled") NOT NULL DEFAULT "pending",
                admin_notes TEXT NULL,
                info_request_message TEXT NULL,
                reviewed_by VARCHAR(191) NULL,
                reviewed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_aa_email (email),
                INDEX idx_aa_user (user_id),
                INDEX idx_aa_status (status),
                INDEX idx_aa_course (course_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'academy_students' => 'CREATE TABLE IF NOT EXISTS academy_students (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(64) NOT NULL UNIQUE,
                application_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NULL,
                course_id VARCHAR(36) NOT NULL,
                full_name VARCHAR(191) NOT NULL,
                email VARCHAR(191) NOT NULL,
                phone VARCHAR(32) NOT NULL,
                photo_url TEXT NULL,
                enrollment_date DATE NOT NULL,
                completion_date DATE NULL,
                academic_status ENUM("active", "graduated", "suspended", "withdrawn") NOT NULL DEFAULT "active",
                id_card_issued_at DATETIME NULL,
                qr_token VARCHAR(128) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_as_user (user_id),
                INDEX idx_as_course (course_id),
                INDEX idx_as_app (application_id),
                INDEX idx_as_status (academic_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'smtp_configs' => 'CREATE TABLE IF NOT EXISTS smtp_configs (
                id VARCHAR(36) PRIMARY KEY,
                host VARCHAR(191) NOT NULL,
                port INT NOT NULL DEFAULT 465,
                username VARCHAR(191) NOT NULL,
                password VARCHAR(255) NULL,
                encryption ENUM("tls", "ssl", "none") NOT NULL DEFAULT "ssl",
                sender_email VARCHAR(191) NOT NULL,
                sender_name VARCHAR(100) NOT NULL,
                reply_to VARCHAR(191) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                last_tested_at TIMESTAMP NULL,
                last_test_status ENUM("operational", "error", "untested") NOT NULL DEFAULT "untested",
                logs JSON NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'slip_templates' => 'CREATE TABLE IF NOT EXISTS slip_templates (
                id VARCHAR(50) PRIMARY KEY,
                slip_code VARCHAR(64) NULL,
                name VARCHAR(191) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT "NIN",
                price DECIMAL(15, 2) NULL,
                demo_image_url VARCHAR(500) NULL,
                description TEXT NULL,
                supported_service VARCHAR(100) NOT NULL DEFAULT "all_nin",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 1,
                is_recommended TINYINT(1) NOT NULL DEFAULT 0,
                badge VARCHAR(50) NULL,
                watermark_text VARCHAR(100) DEFAULT "DEMO SPECIMEN - SAMPLE PREVIEW ONLY",
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'service_security_rules' => 'CREATE TABLE IF NOT EXISTS service_security_rules (
                id VARCHAR(50) PRIMARY KEY,
                service_key VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                service_name VARCHAR(191) NULL,
                category VARCHAR(50) NOT NULL DEFAULT "general",
                require_pin TINYINT(1) DEFAULT 1,
                requires_pin TINYINT(1) NULL,
                min_tier INT DEFAULT 1,
                min_kyc_level INT NULL,
                max_daily_limit DECIMAL(16, 2) DEFAULT 500000.00,
                daily_limit DECIMAL(16, 2) NULL,
                description TEXT NULL,
                updated_by VARCHAR(191) NULL,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'support_tickets' => 'CREATE TABLE IF NOT EXISTS support_tickets (
                id VARCHAR(36) PRIMARY KEY,
                ticket_number VARCHAR(64) NULL,
                user_id VARCHAR(36) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                category VARCHAR(64) NULL DEFAULT "general",
                priority ENUM("low", "medium", "high", "urgent") NOT NULL DEFAULT "medium",
                status ENUM("open", "pending", "in_progress", "waiting_customer", "resolved", "closed") NOT NULL DEFAULT "open",
                department VARCHAR(50) NOT NULL DEFAULT "General",
                assigned_to VARCHAR(100) NULL,
                order_id VARCHAR(64) NULL,
                description TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_st_user (user_id),
                INDEX idx_st_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'support_replies' => 'CREATE TABLE IF NOT EXISTS support_replies (
                id VARCHAR(36) PRIMARY KEY,
                ticket_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                is_staff TINYINT(1) NOT NULL DEFAULT 0,
                is_internal_note TINYINT(1) NOT NULL DEFAULT 0,
                message TEXT NOT NULL,
                attachment_url VARCHAR(500) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sr_ticket (ticket_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'announcement_email_deliveries' => 'CREATE TABLE IF NOT EXISTS announcement_email_deliveries (
                id VARCHAR(36) PRIMARY KEY,
                announcement_id VARCHAR(64) NOT NULL,
                announcement_source VARCHAR(32) NOT NULL DEFAULT "announcement",
                user_id VARCHAR(36) NULL,
                recipient_email VARCHAR(191) NOT NULL,
                recipient_name VARCHAR(191) NULL,
                status ENUM("pending", "sent", "failed", "skipped") NOT NULL DEFAULT "pending",
                message_id VARCHAR(255) NULL,
                error_message TEXT NULL,
                attempts INT NOT NULL DEFAULT 1,
                sent_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_ann_email (announcement_id, recipient_email),
                INDEX idx_aed_ann_status (announcement_id, status),
                INDEX idx_aed_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'modification_requests' => 'CREATE TABLE IF NOT EXISTS modification_requests (
                id VARCHAR(36) PRIMARY KEY,
                request_number VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                identity_type ENUM("NIN", "BVN") NOT NULL,
                service_key VARCHAR(100) NOT NULL,
                service_name VARCHAR(191) NOT NULL,
                masked_identifier VARCHAR(40) NOT NULL,
                submitted_fields JSON NOT NULL,
                supporting_documents JSON NULL,
                enrollment_type VARCHAR(150) NULL,
                customer_price DECIMAL(15, 2) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                endpoint VARCHAR(150) NOT NULL,
                payment_reference VARCHAR(120) NOT NULL UNIQUE,
                refund_reference VARCHAR(120) NULL UNIQUE,
                idempotency_key VARCHAR(120) NULL,
                provider_reference VARCHAR(120) NULL,
                provider_status VARCHAR(64) NULL,
                provider_remarks TEXT NULL,
                provider_response JSON NULL,
                admin_notes TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at DATETIME NULL,
                estimated_completion_text VARCHAR(150) NULL,
                status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                completed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mr_user (user_id),
                INDEX idx_mr_type_status (identity_type, status),
                INDEX idx_mr_prov_ref (provider_reference),
                INDEX idx_mr_idemp (user_id, idempotency_key),
                INDEX idx_mr_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'modification_bvn_types' => 'CREATE TABLE IF NOT EXISTS modification_bvn_types (
                id VARCHAR(64) PRIMARY KEY,
                enrollment_type VARCHAR(150) NOT NULL UNIQUE,
                label VARCHAR(191) NOT NULL,
                wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                provider_synced_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'enrolment_orders' => 'CREATE TABLE IF NOT EXISTS enrolment_orders (
                id VARCHAR(36) PRIMARY KEY,
                order_number VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                enrolment_type ENUM("NIN_ADULT", "NIN_CHILD", "NIN_ARRANGEMENT", "BVN_ENROLMENT", "BVN_ARRANGEMENT") NOT NULL DEFAULT "NIN_ADULT",
                identity_domain ENUM("NIN", "BVN") NOT NULL DEFAULT "NIN",
                service_key VARCHAR(100) NOT NULL,
                service_name VARCHAR(191) NOT NULL,
                applicant_name VARCHAR(191) NOT NULL,
                applicant_phone_masked VARCHAR(40) NULL,
                submitted_fields JSON NOT NULL,
                supporting_documents JSON NULL,
                customer_price DECIMAL(15, 2) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                endpoint VARCHAR(150) NOT NULL,
                payment_reference VARCHAR(120) NOT NULL UNIQUE,
                refund_reference VARCHAR(120) NULL UNIQUE,
                idempotency_key VARCHAR(120) NULL,
                provider_reference VARCHAR(120) NULL,
                provider_status VARCHAR(64) NULL,
                provider_remarks TEXT NULL,
                provider_response JSON NULL,
                admin_notes TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at DATETIME NULL,
                estimated_completion_text VARCHAR(150) NULL,
                status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                completed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_eo_user (user_id),
                INDEX idx_eo_domain_status (identity_domain, status),
                INDEX idx_eo_prov_ref (provider_reference),
                INDEX idx_eo_idemp (user_id, idempotency_key),
                INDEX idx_eo_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'enrolment_sample_documents' => 'CREATE TABLE IF NOT EXISTS enrolment_sample_documents (
                id VARCHAR(36) PRIMARY KEY,
                service_key VARCHAR(100) NOT NULL,
                title VARCHAR(191) NOT NULL,
                description TEXT NULL,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                file_size INT NOT NULL DEFAULT 0,
                file_path VARCHAR(500) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(36) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_esd_skey (service_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tableDefinitions as $name => $sql) {
            try {
                $db->execute($sql);
                $applied[] = "table:{$name}";
            } catch (Throwable $e) {
                $errors[] = "table:{$name} => " . $e->getMessage();
            }
        }

        // Column checks via INFORMATION_SCHEMA
        $columnAlterations = [
            'users' => [
                'kyc_level' => 'ADD COLUMN kyc_level INT NOT NULL DEFAULT 1',
                'phone_normalized' => 'ADD COLUMN phone_normalized VARCHAR(32) NULL',
                'token_version' => 'ADD COLUMN token_version INT NOT NULL DEFAULT 1',
                'assigned_permissions' => 'ADD COLUMN assigned_permissions TEXT NULL',
                'referred_by_user_id' => 'ADD COLUMN referred_by_user_id VARCHAR(36) NULL',
                'referral_source' => 'ADD COLUMN referral_source VARCHAR(64) NULL',
                'referral_campaign_code' => 'ADD COLUMN referral_campaign_code VARCHAR(64) NULL',
                'referral_bound_at' => 'ADD COLUMN referral_bound_at DATETIME NULL',
                'pin_failed_attempts' => 'ADD COLUMN pin_failed_attempts INT NOT NULL DEFAULT 0',
                'pin_locked_until' => 'ADD COLUMN pin_locked_until DATETIME NULL',
                'pin_set_at' => 'ADD COLUMN pin_set_at DATETIME NULL',
                'pin_updated_by_admin_at' => 'ADD COLUMN pin_updated_by_admin_at DATETIME NULL',
                'mfa_enabled' => 'ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0',
                'mfa_method' => 'ADD COLUMN mfa_method VARCHAR(24) NOT NULL DEFAULT "email_otp"',
                'last_login_at' => 'ADD COLUMN last_login_at DATETIME NULL',
                'last_login_ip' => 'ADD COLUMN last_login_ip VARCHAR(45) NULL',
            ],
            'user_profiles' => [
                'date_of_birth' => 'ADD COLUMN date_of_birth VARCHAR(32) NULL',
                'notification_preferences' => 'ADD COLUMN notification_preferences JSON NULL',
                'security_settings' => 'ADD COLUMN security_settings JSON NULL',
                'assigned_permissions' => 'ADD COLUMN assigned_permissions JSON NULL',
            ],
            'manual_funding_requests' => [
                'payment_reference' => 'ADD COLUMN payment_reference VARCHAR(120) NULL',
                'payment_date' => 'ADD COLUMN payment_date VARCHAR(32) NULL',
                'payment_method' => 'ADD COLUMN payment_method VARCHAR(64) NOT NULL DEFAULT "Bank Transfer"',
                'remarks' => 'ADD COLUMN remarks TEXT NULL',
                'proof_filename' => 'ADD COLUMN proof_filename VARCHAR(255) NULL',
                'admin_notes' => 'ADD COLUMN admin_notes TEXT NULL',
                'reviewed_by' => 'ADD COLUMN reviewed_by VARCHAR(100) NULL',
                'reviewed_at' => 'ADD COLUMN reviewed_at DATETIME NULL',
            ],
            'kyc_submissions' => [
                'target_level' => 'ADD COLUMN target_level INT NOT NULL DEFAULT 2',
                'verification_method' => 'ADD COLUMN verification_method VARCHAR(50) DEFAULT "nin"',
                'verification_reference' => 'ADD COLUMN verification_reference VARCHAR(120) NULL',
                'full_legal_name' => 'ADD COLUMN full_legal_name VARCHAR(191) NULL',
                'date_of_birth' => 'ADD COLUMN date_of_birth VARCHAR(32) NULL',
                'phone_number' => 'ADD COLUMN phone_number VARCHAR(32) NULL',
                'email' => 'ADD COLUMN email VARCHAR(191) NULL',
                'residential_address' => 'ADD COLUMN residential_address TEXT NULL',
                'state' => 'ADD COLUMN state VARCHAR(64) NULL',
                'lga' => 'ADD COLUMN lga VARCHAR(64) NULL',
                'nin' => 'ADD COLUMN nin VARCHAR(20) NULL',
                'bvn' => 'ADD COLUMN bvn VARCHAR(20) NULL',
                'id_document_url' => 'ADD COLUMN id_document_url TEXT NULL',
                'selfie_url' => 'ADD COLUMN selfie_url TEXT NULL',
                'proof_of_address_url' => 'ADD COLUMN proof_of_address_url TEXT NULL',
                'consent_obtained' => 'ADD COLUMN consent_obtained TINYINT(1) DEFAULT 0',
                'consent_timestamp' => 'ADD COLUMN consent_timestamp DATETIME NULL',
                'automated_verification_result' => 'ADD COLUMN automated_verification_result JSON NULL',
                'rejection_reason' => 'ADD COLUMN rejection_reason TEXT NULL',
                'additional_info_requested' => 'ADD COLUMN additional_info_requested TEXT NULL',
                'reviewer_name' => 'ADD COLUMN reviewer_name VARCHAR(191) NULL',
                'review_history' => 'ADD COLUMN review_history JSON NULL',
                'submitted_at' => 'ADD COLUMN submitted_at DATETIME NULL',
                'doc_url' => 'ADD COLUMN doc_url TEXT NULL',
                'review_notes' => 'ADD COLUMN review_notes TEXT NULL',
                'reviewed_by' => 'ADD COLUMN reviewed_by VARCHAR(100) NULL',
                'reviewed_at' => 'ADD COLUMN reviewed_at DATETIME NULL',
            ],
            'service_security_rules' => [
                'service_name' => 'ADD COLUMN service_name VARCHAR(191) NULL',
                'requires_pin' => 'ADD COLUMN requires_pin TINYINT(1) NULL',
                'min_kyc_level' => 'ADD COLUMN min_kyc_level INT NULL',
                'daily_limit' => 'ADD COLUMN daily_limit DECIMAL(16, 2) NULL',
                'description' => 'ADD COLUMN description TEXT NULL',
                'updated_by' => 'ADD COLUMN updated_by VARCHAR(191) NULL',
                'updated_at' => 'ADD COLUMN updated_at DATETIME NULL',
            ],
            'support_tickets' => [
                'ticket_number' => 'ADD COLUMN ticket_number VARCHAR(64) NULL',
                'category' => 'ADD COLUMN category VARCHAR(64) NULL',
                'assigned_to' => 'ADD COLUMN assigned_to VARCHAR(100) NULL',
                'order_id' => 'ADD COLUMN order_id VARCHAR(64) NULL',
                'description' => 'ADD COLUMN description TEXT NULL',
            ],
            'support_replies' => [
                'is_internal_note' => 'ADD COLUMN is_internal_note TINYINT(1) NOT NULL DEFAULT 0',
            ],
            'telecom_plans' => [
                'updated_at' => 'ADD COLUMN updated_at DATETIME NULL',
            ],
            'website_branding' => [
                'short_brand_name' => 'ADD COLUMN short_brand_name VARCHAR(100) NULL DEFAULT "HAMBAKTECH"',
                'business_reg_number' => 'ADD COLUMN business_reg_number VARCHAR(100) NULL DEFAULT "BN 9284726"',
                'founded_year' => 'ADD COLUMN founded_year VARCHAR(20) NULL DEFAULT "2024"',
                'business_phone' => 'ADD COLUMN business_phone VARCHAR(50) NULL DEFAULT "08147837664"',
                'info_email' => 'ADD COLUMN info_email VARCHAR(191) NULL DEFAULT "info@hambaktech.com.ng"',
            ],
            'academy_courses' => [
                'category' => 'ADD COLUMN category VARCHAR(100) NULL DEFAULT "Digital Skills"',
                'curriculum_outline' => 'ADD COLUMN curriculum_outline TEXT NULL',
                'is_available' => 'ADD COLUMN is_available TINYINT(1) NOT NULL DEFAULT 1',
                'admission_start_date' => 'ADD COLUMN admission_start_date DATE NULL',
                'admission_end_date' => 'ADD COLUMN admission_end_date DATE NULL',
                'display_order' => 'ADD COLUMN display_order INT NOT NULL DEFAULT 1',
            ],
            'announcements' => [
                'target_audience' => 'ADD COLUMN target_audience VARCHAR(64) NOT NULL DEFAULT "all_customers"',
                'target_user_id' => 'ADD COLUMN target_user_id VARCHAR(36) NULL',
            ],
            'slip_templates' => [
                'slip_code' => 'ADD COLUMN slip_code VARCHAR(64) NULL',
                'price' => 'ADD COLUMN price DECIMAL(15, 2) NULL',
                'is_recommended' => 'ADD COLUMN is_recommended TINYINT(1) NOT NULL DEFAULT 0',
                'watermark_text' => 'ADD COLUMN watermark_text VARCHAR(100) DEFAULT "SAMPLE SPECIMEN"',
            ],
            'verification_records' => [
                'idempotency_key' => 'ADD COLUMN idempotency_key VARCHAR(120) NULL',
            ],
            'service_catalogue' => [
                'processing_type' => 'ADD COLUMN processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant"',
                'manual_label' => 'ADD COLUMN manual_label VARCHAR(80) NULL DEFAULT "Manual Processing"',
                'estimated_turnaround' => 'ADD COLUMN estimated_turnaround VARCHAR(150) NULL',
                'required_documents' => 'ADD COLUMN required_documents JSON NULL',
                'form_schema' => 'ADD COLUMN form_schema JSON NULL',
                'supported_notes' => 'ADD COLUMN supported_notes TEXT NULL',
            ],
            'modification_requests' => [
                'enrollment_type' => 'ADD COLUMN enrollment_type VARCHAR(150) NULL',
                'profit' => 'ADD COLUMN profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00',
                'endpoint' => 'ADD COLUMN endpoint VARCHAR(150) NOT NULL DEFAULT ""',
                'refund_reference' => 'ADD COLUMN refund_reference VARCHAR(120) NULL',
                'provider_response' => 'ADD COLUMN provider_response JSON NULL',
                'reviewed_by' => 'ADD COLUMN reviewed_by VARCHAR(100) NULL',
                'reviewed_at' => 'ADD COLUMN reviewed_at DATETIME NULL',
                'estimated_completion_text' => 'ADD COLUMN estimated_completion_text VARCHAR(150) NULL',
            ],
        ];

        foreach ($columnAlterations as $table => $cols) {
            foreach ($cols as $col => $alterClause) {
                try {
                    $exists = $db->fetchOne(
                        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tbl AND COLUMN_NAME = :col',
                        ['tbl' => $table, 'col' => $col]
                    );
                    if (!$exists) {
                        $db->execute("ALTER TABLE `{$table}` {$alterClause}");
                        $applied[] = "col:{$table}.{$col}";
                    }
                } catch (Throwable $e) {
                    $errors[] = "col:{$table}.{$col} => " . $e->getMessage();
                }
            }
        }

        // Enum updates
        $enumUpdates = [
            'kyc_submissions.status' => 'ALTER TABLE kyc_submissions MODIFY COLUMN status ENUM("pending", "verified", "approved", "rejected", "info_requested") NOT NULL DEFAULT "pending"',
            'support_tickets.status' => 'ALTER TABLE support_tickets MODIFY COLUMN status ENUM("open", "pending", "in_progress", "waiting_customer", "resolved", "closed") NOT NULL DEFAULT "open"',
            'providers.last_ping_status' => 'ALTER TABLE providers MODIFY COLUMN last_ping_status ENUM("operational", "error", "untested", "unconfigured") NOT NULL DEFAULT "untested"',
            'academy_courses.price' => 'ALTER TABLE academy_courses MODIFY COLUMN price DECIMAL(15, 2) NULL DEFAULT NULL',
        ];
        foreach ($enumUpdates as $key => $sql) {
            try {
                $db->execute($sql);
                $applied[] = "enum:{$key}";
            } catch (Throwable $e) {
                $errors[] = "enum:{$key} => " . $e->getMessage();
            }
        }

        // Backfill users.kyc_level from tier where needed
        try {
            $db->execute('UPDATE users SET kyc_level = tier WHERE kyc_level = 1 AND tier > 1');
        } catch (Throwable $e) {
            $errors[] = 'backfill:kyc_level => ' . $e->getMessage();
        }

        // Ensure standard providers exist in providers table (without writing fake keys)
        $providers = [
            ['2sureverify', '2SureVerify Identity API', 'identity', getenv('TWOSUREVERIFY_BASE_URL') ?: 'https://2sureverify.com', 1, 0],
            ['veripine', 'Veripine Identity API', 'identity', getenv('VERIPINE_BASE_URL') ?: 'https://veripine.com/api', 1, 1],
            ['ulamadata', 'UlamaData VTU Gateway', 'telecom', getenv('ULAMADATA_BASE_URL') ?: 'https://www.ulamadata.ng', 1, 0],
            ['vtpass', 'VTpass Enterprise VTU', 'telecom', getenv('VTPASS_API_BASE_URL') ?: (getenv('VTPASS_BASE_URL') ?: ((getenv('VTPASS_ENV') === 'sandbox') ? 'https://sandbox.vtpass.com/api' : 'https://api-service.vtpass.com/api')), 1, 1],
            ['paystack', 'Paystack Checkout', 'payment', 'https://api.paystack.co', 1, 1],
            ['flutterwave', 'Flutterwave Gateway', 'payment', 'https://api.flutterwave.com/v3', 1, 0],
        ];
        foreach ($providers as $p) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO providers (id, name, provider_type, base_url, is_active, is_default, timeout_seconds, last_ping_status)
                     VALUES (?, ?, ?, ?, ?, ?, 30, "untested")',
                    $p
                );
            } catch (Throwable $e) {
                $errors[] = "provider:{$p[0]} => " . $e->getMessage();
            }
        }

        // Ensure Stage 3 modification categories and catalog metadata exist
        try {
            $modSync = self::syncModificationCatalog($db);
            $applied = array_merge($applied, $modSync['applied'] ?? []);
            $errors = array_merge($errors, $modSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncModificationCatalog => ' . $e->getMessage();
        }

        // Ensure Stage 4 enrolment tables and verified NIN Enrolment services exist
        try {
            $enrSync = self::syncEnrolmentCatalog($db);
            $applied = array_merge($applied, $enrSync['applied'] ?? []);
            $errors = array_merge($errors, $enrSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncEnrolmentCatalog => ' . $e->getMessage();
        }

        // Ensure Stage 5 Referral, Rewards, Compulsory PIN & Session/MFA Security tables exist
        try {
            $secRefSync = self::syncSecurityAndReferralSchema($db, true);
            $applied = array_merge($applied, $secRefSync['applied'] ?? []);
            $errors = array_merge($errors, $secRefSync['errors'] ?? []);
        } catch (Throwable $e) {
            $errors[] = 'syncSecurityAndReferralSchema => ' . $e->getMessage();
        }

        return [
            'applied_count' => count($applied),
            'applied' => $applied,
            'errors' => $errors,
        ];
    }

    public static function syncModificationCatalog(Database $db, bool $force = false): array
    {
        static $synced = false;
        if ($synced && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $synced = true;

        $applied = [];
        $errors = [];

        // 1. Ensure Stage 3 service_catalogue metadata columns exist even outside full sync()
        $catCols = [
            'processing_type' => 'ADD COLUMN processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant"',
            'manual_label' => 'ADD COLUMN manual_label VARCHAR(80) NULL DEFAULT "Manual Processing"',
            'estimated_turnaround' => 'ADD COLUMN estimated_turnaround VARCHAR(150) NULL',
            'required_documents' => 'ADD COLUMN required_documents JSON NULL',
            'form_schema' => 'ADD COLUMN form_schema JSON NULL',
            'supported_notes' => 'ADD COLUMN supported_notes TEXT NULL',
        ];
        foreach ($catCols as $col => $clause) {
            try {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_catalogue" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE service_catalogue {$clause}");
                    $applied[] = "col:service_catalogue.{$col}";
                }
            } catch (Throwable $e) {
                $errors[] = "col:service_catalogue.{$col} => " . $e->getMessage();
            }
        }

        // 2. Ensure modification_requests & modification_bvn_types tables exist
        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS modification_requests (
                    id VARCHAR(36) PRIMARY KEY,
                    request_number VARCHAR(64) NOT NULL UNIQUE,
                    user_id VARCHAR(36) NOT NULL,
                    identity_type ENUM("NIN", "BVN") NOT NULL,
                    service_key VARCHAR(100) NOT NULL,
                    service_name VARCHAR(191) NOT NULL,
                    masked_identifier VARCHAR(40) NOT NULL,
                    submitted_fields JSON NOT NULL,
                    supporting_documents JSON NULL,
                    enrollment_type VARCHAR(150) NULL,
                    customer_price DECIMAL(15, 2) NOT NULL,
                    provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                    endpoint VARCHAR(150) NOT NULL,
                    payment_reference VARCHAR(120) NOT NULL UNIQUE,
                    refund_reference VARCHAR(120) NULL UNIQUE,
                    idempotency_key VARCHAR(120) NULL,
                    provider_reference VARCHAR(120) NULL,
                    provider_status VARCHAR(64) NULL,
                    provider_remarks TEXT NULL,
                    provider_response JSON NULL,
                    admin_notes TEXT NULL,
                    reviewed_by VARCHAR(100) NULL,
                    reviewed_at DATETIME NULL,
                    estimated_completion_text VARCHAR(150) NULL,
                    status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                    completed_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_mr_user (user_id),
                    INDEX idx_mr_type_status (identity_type, status),
                    INDEX idx_mr_prov_ref (provider_reference),
                    INDEX idx_mr_idemp (user_id, idempotency_key),
                    INDEX idx_mr_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $db->execute(
                'CREATE TABLE IF NOT EXISTS modification_bvn_types (
                    id VARCHAR(64) PRIMARY KEY,
                    enrollment_type VARCHAR(150) NOT NULL UNIQUE,
                    label VARCHAR(191) NOT NULL,
                    wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    provider_synced_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) {
            $errors[] = 'mod_tables => ' . $e->getMessage();
        }

        // 3. Ensure strict separate service categories exist
        try {
            $db->execute(
                'INSERT INTO service_categories (id, code, name, icon, display_order, is_active)
                 VALUES
                 ("cat_mod", "nin_modification", "NIN Modification", "Edit3", 3, 1),
                 ("cat_bvn_mod", "bvn_modification", "BVN Modification", "UserCog", 4, 1)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), code=VALUES(code)'
            );
        } catch (Throwable $e) {
            $errors[] = 'mod_categories => ' . $e->getMessage();
        }

        // 4. Normalize legacy _pass service_keys -> _auth cleanly without duplicate collision
        $legacyMap = [
            'second_nin_mod_name_pass' => ['new_key' => 'second_nin_mod_name_auth', 'endpoint' => '/api/v1/second_nin_mod_name_auth.php', 'wholesale' => 10000.00],
            'second_nin_mod_phone_pass' => ['new_key' => 'second_nin_mod_phone_auth', 'endpoint' => '/api/v1/second_nin_mod_phone_auth.php', 'wholesale' => 10000.00],
        ];
        foreach ($legacyMap as $oldKey => $cfg) {
            try {
                $oldRow = $db->fetchOne('SELECT id FROM service_catalogue WHERE service_key = :ok LIMIT 1', ['ok' => $oldKey]);
                $newRow = $db->fetchOne('SELECT id FROM service_catalogue WHERE service_key = :nk LIMIT 1', ['nk' => $cfg['new_key']]);
                if ($oldRow && !$newRow) {
                    $db->execute(
                        'UPDATE service_catalogue SET service_key = :nk, endpoint = :ep, wholesale_cost = :wc WHERE id = :id',
                        ['nk' => $cfg['new_key'], 'ep' => $cfg['endpoint'], 'wc' => $cfg['wholesale'], 'id' => $oldRow['id']]
                    );
                    $applied[] = "renamed:{$oldKey}->" . $cfg['new_key'];
                } elseif ($oldRow && $newRow) {
                    $db->execute('DELETE FROM service_catalogue WHERE id = :id', ['id' => $oldRow['id']]);
                }
            } catch (Throwable $e) {
                $errors[] = "legacy:{$oldKey} => " . $e->getMessage();
            }
        }

        // Common document descriptors (with accepted formats, size limits, and configurable provider multipart keys)
        $docNinSlip = ['key' => 'nin_slip', 'provider_file_param' => 'nin_slip', 'label' => 'Current NIN Slip / Proof of NIN', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Clear JPG, PNG, WEBP or PDF copy of your existing NIN slip or NIMC tracking slip.'];
        $docAffidavit = ['key' => 'affidavit', 'provider_file_param' => 'affidavit', 'label' => 'Sworn Court Affidavit', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Official court affidavit supporting the requested identity correction.'];
        $docNewspaper = ['key' => 'newspaper_pub', 'provider_file_param' => 'newspaper_pub', 'label' => 'Newspaper Change of Name Publication', 'required' => false, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Recognised Nigerian newspaper publication showing old and new names (if applicable).'];
        $docBirthCert = ['key' => 'birth_certificate', 'provider_file_param' => 'birth_certificate', 'label' => 'Birth Certificate / Declaration of Age', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'NPC Birth Certificate, Hospital Birth Record, or Sworn Declaration of Age.'];
        $docUtilityBill = ['key' => 'address_proof', 'provider_file_param' => 'address_proof', 'label' => 'Proof of Residential Address', 'required' => false, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Recent utility bill, tenancy agreement, or government-issued proof of residence.'];
        $docMedicalOrAff = ['key' => 'gender_proof', 'provider_file_param' => 'gender_proof', 'label' => 'Supporting Affidavit / Medical Letter', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Sworn affidavit or official supporting document confirming correct gender.'];
        $docPassport = ['key' => 'passport_photo', 'provider_file_param' => 'passport_photo', 'label' => 'Recent Passport Photograph', 'required' => false, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Clear white-background passport photograph of the applicant.'];
        $docBvnPrintout = ['key' => 'bvn_slip', 'provider_file_param' => 'bvn_slip', 'label' => 'BVN Enrollment / Bank Slip', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Existing BVN printout or bank confirmation showing BVN & account details.'];
        $docGovId = ['key' => 'valid_id', 'provider_file_param' => 'valid_id', 'label' => 'Valid Government-Issued ID', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'NIN Slip, International Passport, Voter\'s Card, or Driver\'s Licence.'];

        // Field helpers (standardized `help_text` + configurable `provider_param`)
        $fldNin = ['key' => 'nin', 'provider_param' => 'nin', 'label' => '11-Digit NIN Number', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter 11-digit NIN', 'help_text' => 'Enter the applicant\'s existing 11-digit National Identification Number without spaces.'];
        $fldFirst = ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'New First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ibrahim', 'help_text' => 'Must match supporting court affidavit / ID exactly.'];
        $fldMiddle = ['key' => 'middle_name', 'provider_param' => 'middle_name', 'label' => 'New Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Musa', 'help_text' => 'Leave blank if no middle name is to be added or changed.'];
        $fldLast = ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'New Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Adeyemi', 'help_text' => 'Must match supporting court affidavit / ID exactly.'];
        $fldPhone = ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'New Registered Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => 'e.g., 08031234567', 'help_text' => 'Active 11-digit Nigerian mobile number registered in the applicant\'s name.'];
        $fldDob = ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Correct Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Select the exact date shown on the NPC birth certificate or sworn declaration of age.'];
        $fldEmail = ['key' => 'email', 'provider_param' => 'email', 'label' => 'NIMC Account Email', 'type' => 'email', 'required' => true, 'placeholder' => 'registered@example.com', 'help_text' => 'Email linked to the applicant\'s NIMC self-service account.'];
        $fldPass = ['key' => 'password', 'provider_param' => 'password', 'label' => 'NIMC Self-Service Password', 'type' => 'password', 'required' => true, 'placeholder' => 'Enter self-service password', 'help_text' => 'Used solely for immediate modification submission and never stored in plain text.'];
        $fldReason = ['key' => 'reason', 'provider_param' => 'reason', 'label' => 'Reason / Supporting Explanation', 'type' => 'textarea', 'required' => false, 'placeholder' => 'Briefly describe why this modification is requested', 'help_text' => 'Optional context for manual verification officers reviewing your request.'];

        $ninModCatalog = [
            [
                'id' => 'srv_mod_name',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_name',
                'name' => 'NIN Name Modification',
                'description' => 'Manual NIMC correction of first name, middle name, or surname on your National Identification Number record.',
                'endpoint' => '/api/v1/nin_mod_name.php',
                'wholesale_cost' => 4000.00,
                'selling_price' => 6000.00,
                'estimated_turnaround' => '2 – 7 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Ensure new names exactly match your Court Affidavit and Newspaper Publication where applicable.',
                'required_fields' => ['nin', 'first_name', 'last_name'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldReason],
            ],
            [
                'id' => 'srv_mod_phone',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_phone',
                'name' => 'NIN Phone Number Modification',
                'description' => 'Manual update of the registered telephone number linked to your NIMC NIN profile.',
                'endpoint' => '/api/v1/nin_mod_phone.php',
                'wholesale_cost' => 4000.00,
                'selling_price' => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Provided 11-digit phone number must be active and registered in Nigeria.',
                'required_fields' => ['nin', 'phone'],
                'required_documents' => [$docNinSlip, $docPassport],
                'form_schema' => [$fldNin, $fldPhone, ['key' => 'previous_phone', 'provider_param' => 'previous_phone', 'label' => 'Previous Linked Phone (Optional)', 'type' => 'tel', 'required' => false, 'maxLength' => 11, 'placeholder' => '080...', 'help_text' => 'Previous phone number originally tied to the NIN profile, if known.'], $fldReason],
            ],
            [
                'id' => 'srv_mod_addr',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_address',
                'name' => 'NIN Address Modification',
                'description' => 'Manual update of residential street address, State of Residence, and LGA on NIMC registry.',
                'endpoint' => '/api/v1/nin_mod_address.php',
                'wholesale_cost' => 4000.00,
                'selling_price' => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Provide complete residential house number, street, town, LGA, and State.',
                'required_fields' => ['nin', 'address', 'state', 'lga'],
                'required_documents' => [$docNinSlip, $docUtilityBill],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'address', 'provider_param' => 'address', 'label' => 'New Residential Address', 'type' => 'textarea', 'required' => true, 'placeholder' => 'House number, street name, town/city', 'help_text' => 'Include plot/house number, street name, and landmark/town.'],
                    ['key' => 'state', 'provider_param' => 'state', 'label' => 'New State of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Lagos', 'help_text' => 'Nigerian State matching your updated residential address.'],
                    ['key' => 'lga', 'provider_param' => 'lga', 'label' => 'New Local Government Area (LGA)', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ikeja', 'help_text' => 'Local Government Area within the selected State of residence.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_dob',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_dob',
                'name' => 'NIN Date of Birth Modification',
                'description' => 'Manual NIMC Date of Birth modification requiring verified birth certificate and sworn court affidavit.',
                'endpoint' => '/api/v1/nin_mod_dob.php',
                'wholesale_cost' => 53000.00,
                'selling_price' => 65000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC validation)',
                'supported_notes' => 'Date of Birth modification undergoes strict NIMC compliance scrutiny; ensure supporting documents are clear and authentic.',
                'required_fields' => ['nin', 'dob'],
                'required_documents' => [$docNinSlip, $docBirthCert, $docAffidavit],
                'form_schema' => [
                    $fldNin,
                    $fldDob,
                    ['key' => 'current_dob', 'provider_param' => 'current_dob', 'label' => 'Currently Registered DOB (Optional)', 'type' => 'date', 'required' => false, 'help_text' => 'Optional: date of birth currently showing on your existing NIN record.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_dob_name',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_dob_name',
                'name' => 'NIN Name & DOB Modification',
                'description' => 'Combined manual NIMC modification for correcting both full names and Date of Birth together.',
                'endpoint' => '/api/v1/nin_mod_dob_name.php',
                'wholesale_cost' => 58000.00,
                'selling_price' => 72000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC validation)',
                'supported_notes' => 'Upload both your birth record and court affidavit supporting the combined name + DOB correction.',
                'required_fields' => ['nin', 'first_name', 'last_name', 'dob'],
                'required_documents' => [$docNinSlip, $docBirthCert, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldDob, $fldReason],
            ],
            [
                'id' => 'srv_mod_name_phone',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_mod_name_phone',
                'name' => 'NIN Name & Phone Modification',
                'description' => 'Combined manual modification to update applicant full names and registered phone number simultaneously.',
                'endpoint' => '/api/v1/nin_mod_name_phone.php',
                'wholesale_cost' => 8000.00,
                'selling_price' => 12000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Saves time when both name spelling and linked phone number require update.',
                'required_fields' => ['nin', 'first_name', 'last_name', 'phone'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldPhone, $fldReason],
            ],
            [
                'id' => 'srv_mod_gender',
                'category_id' => 'cat_mod',
                'service_key' => 'gender_modification',
                'name' => 'NIN Gender Modification',
                'description' => 'Manual correction of gender classification on your NIMC National Identification record.',
                'endpoint' => '/api/v1/gender_modification.php',
                'wholesale_cost' => 5000.00,
                'selling_price' => 7500.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Requires court affidavit or supporting identification document matching the corrected gender.',
                'required_fields' => ['nin', 'gender'],
                'required_documents' => [$docNinSlip, $docMedicalOrAff, $docPassport],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'gender', 'provider_param' => 'gender', 'label' => 'Correct Gender', 'type' => 'select', 'required' => true, 'help_text' => 'Select the corrected biological gender as stated in your supporting affidavit.', 'options' => [['value' => 'Male', 'label' => 'Male'], ['value' => 'Female', 'label' => 'Female']]],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_susp',
                'category_id' => 'cat_mod',
                'service_key' => 'suspended_modification',
                'name' => 'Suspended NIN Modification',
                'description' => 'Manual compliance remediation and modification request for flagged or suspended NIN profiles.',
                'endpoint' => '/api/v1/suspended_modification.php',
                'wholesale_cost' => 23000.00,
                'selling_price' => 30000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC compliance review)',
                'supported_notes' => 'Include NIMC tracking ID (if available) and clear explanation of what triggered the suspension.',
                'required_fields' => ['nin', 'tracking_id'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docPassport],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'tracking_id', 'provider_param' => 'tracking_id', 'label' => 'NIMC Tracking ID', 'type' => 'text', 'required' => true, 'placeholder' => 'Enter NIMC tracking ID from slip', 'help_text' => '15-character NIMC enrollment/tracking ID printed on your original slip.'],
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'Registered First Name', 'type' => 'text', 'required' => false, 'placeholder' => 'First name on NIN record', 'help_text' => 'First name currently associated with the suspended NIN profile.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Registered Surname', 'type' => 'text', 'required' => false, 'placeholder' => 'Surname on NIN record', 'help_text' => 'Surname currently associated with the suspended NIN profile.'],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Contact Phone Number', 'type' => 'tel', 'required' => false, 'maxLength' => 11, 'placeholder' => '08031234567', 'help_text' => 'Reachable 11-digit mobile number for remediation updates.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_bvn_gen',
                'category_id' => 'cat_mod',
                'service_key' => 'bvn_generated_modification',
                'name' => 'BVN-Generated NIN Modification',
                'description' => 'Manual upgrade and biodata correction for NIN numbers auto-generated via BVN linkage.',
                'endpoint' => '/api/v1/bvn_generated_modification.php',
                'wholesale_cost' => 22000.00,
                'selling_price' => 28000.00,
                'estimated_turnaround' => '5 – 12 Business Days (Subject to NIMC clearance)',
                'supported_notes' => 'Both the 11-digit NIN and linked 11-digit BVN are required to process BVN-generated NIN upgrades.',
                'required_fields' => ['nin', 'bvn'],
                'required_documents' => [$docNinSlip, $docBvnPrintout, $docAffidavit],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'bvn', 'provider_param' => 'bvn', 'label' => 'Linked 11-Digit BVN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter linked 11-digit BVN', 'help_text' => 'Provide the 11-digit BVN that generated the NIN record.'],
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'First Name (As on BVN)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Ibrahim', 'help_text' => 'First name matching your BVN printout and affidavit.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Surname (As on BVN)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Adeyemi', 'help_text' => 'Surname matching your BVN printout and affidavit.'],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Phone Number Linked to BVN', 'type' => 'tel', 'required' => false, 'maxLength' => 11, 'placeholder' => '08031234567', 'help_text' => 'Active 11-digit Nigerian phone number tied to the BVN.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_child',
                'category_id' => 'cat_mod',
                'service_key' => 'child_modification',
                'name' => 'Child NIN Modification',
                'description' => 'Manual update of child / minor NIN identity details with verified parental or guardian NIN consent.',
                'endpoint' => '/api/v1/child_modification.php',
                'wholesale_cost' => 13000.00,
                'selling_price' => 18000.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Parent or legal guardian 11-digit NIN and child birth certificate are mandatory.',
                'required_fields' => ['nin', 'parent_nin'],
                'required_documents' => [$docNinSlip, $docBirthCert, ['key' => 'parent_nin_slip', 'provider_file_param' => 'parent_nin_slip', 'label' => 'Parent / Guardian NIN Slip', 'required' => true, 'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'], 'max_size_mb' => 5, 'description' => 'Copy of the parent or legal guardian\'s NIN slip.']],
                'form_schema' => [
                    ['key' => 'nin', 'provider_param' => 'nin', 'label' => 'Child 11-Digit NIN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter child 11-digit NIN', 'help_text' => 'Minor/child\'s existing 11-digit National Identification Number.'],
                    ['key' => 'parent_nin', 'provider_param' => 'parent_nin', 'label' => 'Parent / Guardian 11-Digit NIN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter parent 11-digit NIN', 'help_text' => 'Authorizing parent or legal guardian\'s 11-digit NIN.'],
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'Child First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'Child first name', 'help_text' => 'Corrected or verified first name of the child as on birth record.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Child Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'Child surname', 'help_text' => 'Corrected or verified surname of the child.'],
                    ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Child Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Verified date of birth on the child\'s NPC birth certificate.'],
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_overage',
                'category_id' => 'cat_mod',
                'service_key' => 'nin_over_age',
                'name' => 'Over-Age NIN Modification',
                'description' => 'Manual NIMC Date of Birth / age bracket modification across age tiers (5–9, 10–15, 15–20 years variance).',
                'endpoint' => '/api/v1/nin_over_age.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC verification)',
                'supported_notes' => 'Select the exact age difference bracket and upload an official NPC birth record + court affidavit.',
                'required_fields' => ['nin', 'age_range', 'dob'],
                'required_documents' => [$docNinSlip, $docBirthCert, $docAffidavit],
                'form_schema' => [
                    $fldNin,
                    ['key' => 'age_range', 'provider_param' => 'age_range', 'label' => 'Age Variance Bracket', 'type' => 'select', 'required' => true, 'help_text' => 'Choose the year difference between the currently registered DOB and the corrected DOB.', 'options' => [
                        ['value' => '5-9', 'label' => '5 – 9 Years Adjustment'],
                        ['value' => '10-15', 'label' => '10 – 15 Years Adjustment'],
                        ['value' => '15-20', 'label' => '15 – 20 Years Adjustment'],
                    ]],
                    $fldDob,
                    $fldReason,
                ],
            ],
            [
                'id' => 'srv_mod_sec_name',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_name',
                'name' => 'Second NIN Name Mod (No Email/Pass)',
                'description' => 'Second-time NIN name modification processed manually without requiring prior NIMC self-service email/password login.',
                'endpoint' => '/api/v1/second_nin_mod_name.php',
                'wholesale_cost' => 70000.00,
                'selling_price' => 85000.00,
                'estimated_turnaround' => '5 – 14 Business Days (Subject to NIMC approval)',
                'supported_notes' => 'Designed for applicants who have already used their first NIMC name modification slot and lack self-service login credentials.',
                'required_fields' => ['nin', 'first_name', 'last_name'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldReason],
            ],
            [
                'id' => 'srv_mod_sec_phone',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_phone',
                'name' => 'Second NIN Phone Mod (No Email/Pass)',
                'description' => 'Second-time NIN telephone number modification without prior NIMC self-service login credentials.',
                'endpoint' => '/api/v1/second_nin_mod_phone.php',
                'wholesale_cost' => 18000.00,
                'selling_price' => 25000.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC approval)',
                'supported_notes' => 'Use this option if you cannot access the NIMC email/password previously attached to the NIN.',
                'required_fields' => ['nin', 'phone'],
                'required_documents' => [$docNinSlip, $docPassport],
                'form_schema' => [$fldNin, $fldPhone, $fldReason],
            ],
            [
                'id' => 'srv_mod_sec_name_pass',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_name_auth',
                'name' => 'Second NIN Name Mod (With Email/Pass)',
                'description' => 'Authenticated second-time NIN name modification using your active NIMC self-service email and password.',
                'endpoint' => '/api/v1/second_nin_mod_name_auth.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '3 – 10 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Password is transmitted only during request submission and immediately masked from storage logs.',
                'required_fields' => ['nin', 'first_name', 'last_name', 'email', 'password'],
                'required_documents' => [$docNinSlip, $docAffidavit, $docNewspaper],
                'form_schema' => [$fldNin, $fldFirst, $fldMiddle, $fldLast, $fldEmail, $fldPass, $fldReason],
            ],
            [
                'id' => 'srv_mod_sec_phone_pass',
                'category_id' => 'cat_mod',
                'service_key' => 'second_nin_mod_phone_auth',
                'name' => 'Second NIN Phone Mod (With Email/Pass)',
                'description' => 'Authenticated second-time NIN phone number modification using your active NIMC self-service email and password.',
                'endpoint' => '/api/v1/second_nin_mod_phone_auth.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Subject to NIMC review)',
                'supported_notes' => 'Password is transmitted only during request submission and immediately masked from storage logs.',
                'required_fields' => ['nin', 'phone', 'email', 'password'],
                'required_documents' => [$docNinSlip, $docPassport],
                'form_schema' => [$fldNin, $fldPhone, $fldEmail, $fldPass, $fldReason],
            ],
        ];

        $bvnModService = [
            'id' => 'srv_mod_bvn_mod',
            'category_id' => 'cat_bvn_mod',
            'service_key' => 'bvn_modification',
            'name' => 'BVN Modification Service',
            'description' => 'Manual update and correction of NIBSS Bank Verification Number (BVN) records across supported banks and enrollment institutions.',
            'endpoint' => '/api/v1/bvn_modification.php',
            'wholesale_cost' => 8000.00,
            'selling_price' => 12000.00,
            'estimated_turnaround' => '3 – 10 Business Days (Depending on enrollment bank)',
            'supported_notes' => 'Final price dynamically reflects your selected Bank / Enrollment Type. Never submit NIN requests under BVN Modification.',
            'required_fields' => ['bvn', 'enrollment_type', 'field_to_modify', 'new_value'],
            'required_documents' => [$docBvnPrintout, $docGovId, $docAffidavit],
            'form_schema' => [
                ['key' => 'bvn', 'provider_param' => 'bvn', 'label' => '11-Digit BVN Number', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter 11-digit BVN', 'help_text' => 'Applicant\'s existing 11-digit NIBSS Bank Verification Number.'],
                ['key' => 'enrollment_type', 'provider_param' => 'enrollment_type', 'label' => 'Enrollment Bank / Channel Type', 'type' => 'bvn_enrollment_type', 'required' => true, 'placeholder' => 'Select enrollment bank / type', 'help_text' => 'Customer price updates automatically based on the selected enrollment bank.'],
                ['key' => 'field_to_modify', 'provider_param' => 'field_to_modify', 'label' => 'Information Field to Modify', 'type' => 'select', 'required' => true, 'help_text' => 'Choose the BVN attribute that needs correction.', 'options' => [
                    ['value' => 'name', 'label' => 'Full Name (First / Middle / Surname)'],
                    ['value' => 'dob', 'label' => 'Date of Birth'],
                    ['value' => 'phone', 'label' => 'Phone Number'],
                    ['value' => 'address', 'label' => 'Residential Address'],
                    ['value' => 'gender', 'label' => 'Gender'],
                    ['value' => 'name_and_dob', 'label' => 'Name & Date of Birth'],
                ]],
                ['key' => 'old_value', 'provider_param' => 'old_value', 'label' => 'Current Value on BVN Record', 'type' => 'text', 'required' => false, 'placeholder' => 'Existing value currently shown on BVN', 'help_text' => 'Optional reference showing what is currently on the bank\'s BVN record.'],
                ['key' => 'new_value', 'provider_param' => 'new_value', 'label' => 'Correct New Value Requested', 'type' => 'text', 'required' => true, 'conditional_on' => ['field' => 'field_to_modify', 'values' => ['', 'name', 'phone', 'address', 'gender', 'name_and_dob']], 'placeholder' => 'Exact corrected name, phone, address, or gender', 'help_text' => 'Enter the exact corrected spelling/value matching your valid government ID.'],
                ['key' => 'new_dob', 'provider_param' => 'dob', 'label' => 'Corrected Date of Birth', 'type' => 'date', 'required' => true, 'conditional_on' => ['field' => 'field_to_modify', 'values' => ['dob', 'name_and_dob']], 'help_text' => 'Exact Date of Birth from your NPC birth certificate or valid passport.'],
                ['key' => 'email', 'provider_param' => 'email', 'label' => 'Customer Contact Email (Optional)', 'type' => 'email', 'required' => false, 'placeholder' => 'applicant@example.com', 'help_text' => 'Notification email for bank BVN verification updates.'],
                ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Contact Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => '080...', 'help_text' => 'Reachable 11-digit Nigerian mobile number for follow-up.'],
                $fldReason,
            ],
        ];

        $allMods = array_merge($ninModCatalog, [$bvnModService]);
        foreach ($allMods as $srv) {
            try {
                $existing = $db->fetchOne('SELECT id, category_id, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes FROM service_catalogue WHERE service_key = :sk LIMIT 1', ['sk' => $srv['service_key']]);
                if (!$existing) {
                    $db->execute(
                        'INSERT INTO service_catalogue
                         (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes)
                         VALUES
                         (:id, :cat, :sk, :nm, :desc, "2sureverify", :ep, :wc, :sp, :rf, 0, 1, "manual", "Manual Processing", :eta, :rdocs, :fschema, :notes)',
                        [
                            'id' => $srv['id'],
                            'cat' => $srv['category_id'],
                            'sk' => $srv['service_key'],
                            'nm' => $srv['name'],
                            'desc' => $srv['description'],
                            'ep' => $srv['endpoint'],
                            'wc' => $srv['wholesale_cost'],
                            'sp' => $srv['selling_price'],
                            'rf' => json_encode($srv['required_fields']),
                            'eta' => $srv['estimated_turnaround'],
                            'rdocs' => json_encode($srv['required_documents']),
                            'fschema' => json_encode($srv['form_schema']),
                            'notes' => $srv['supported_notes'],
                        ]
                    );
                    $applied[] = 'mod_insert:' . $srv['service_key'];
                } else {
                    // Preserve admin-edited selling_price, is_active, wholesale_cost; backfill missing Stage 3 metadata & normalize schemas
                    $updCols = ['processing_type = "manual"'];
                    $updParams = ['id' => $existing['id']];
                    if ($existing['category_id'] !== $srv['category_id']) {
                        $updCols[] = 'category_id = :cat';
                        $updParams['cat'] = $srv['category_id'];
                    }
                    if (empty($existing['manual_label'])) {
                        $updCols[] = 'manual_label = :ml';
                        $updParams['ml'] = 'Manual Processing';
                    }
                    if (empty($existing['estimated_turnaround'])) {
                        $updCols[] = 'estimated_turnaround = :eta';
                        $updParams['eta'] = $srv['estimated_turnaround'];
                    }

                    // Normalize/upgrade existing required_documents metadata
                    $curDocs = is_string($existing['required_documents'] ?? null)
                        ? json_decode((string)$existing['required_documents'], true)
                        : ($existing['required_documents'] ?? null);
                    if (empty($curDocs) || !is_array($curDocs)) {
                        $updCols[] = 'required_documents = :rdocs';
                        $updParams['rdocs'] = json_encode($srv['required_documents']);
                    } else {
                        $docChanged = false;
                        $srvDocMap = [];
                        foreach ($srv['required_documents'] as $sd) {
                            $srvDocMap[$sd['key']] = $sd;
                        }
                        foreach ($curDocs as &$cd) {
                            if (!is_array($cd)) continue;
                            $dk = (string)($cd['key'] ?? '');
                            $defDoc = $srvDocMap[$dk] ?? null;
                            if (empty($cd['provider_file_param'])) {
                                $cd['provider_file_param'] = $defDoc['provider_file_param'] ?? $dk;
                                $docChanged = true;
                            }
                            if (empty($cd['accepted_formats'])) {
                                $cd['accepted_formats'] = $defDoc['accepted_formats'] ?? ['JPG', 'PNG', 'WEBP', 'PDF'];
                                $docChanged = true;
                            }
                            if (empty($cd['max_size_mb'])) {
                                $cd['max_size_mb'] = $defDoc['max_size_mb'] ?? 5;
                                $docChanged = true;
                            }
                        }
                        unset($cd);
                        if ($docChanged) {
                            $updCols[] = 'required_documents = :rdocs';
                            $updParams['rdocs'] = json_encode(array_values($curDocs));
                        }
                    }

                    // Normalize/upgrade existing form_schema metadata ('helper' -> 'help_text', provider_param, conditional new_dob)
                    $curSchema = is_string($existing['form_schema'] ?? null)
                        ? json_decode((string)$existing['form_schema'], true)
                        : ($existing['form_schema'] ?? null);
                    if (empty($curSchema) || !is_array($curSchema)) {
                        $updCols[] = 'form_schema = :fschema';
                        $updParams['fschema'] = json_encode($srv['form_schema']);
                    } else {
                        $schemaChanged = false;
                        $srvFieldMap = [];
                        foreach ($srv['form_schema'] as $sf) {
                            $srvFieldMap[$sf['key']] = $sf;
                        }
                        $seenKeys = [];
                        $legacyBvnUpgrade = false;
                        foreach ($curSchema as &$cf) {
                            if (!is_array($cf)) continue;
                            $fk = (string)($cf['key'] ?? '');
                            $seenKeys[$fk] = true;
                            $defFld = $srvFieldMap[$fk] ?? null;
                            if (isset($cf['helper']) && empty($cf['help_text'])) {
                                $cf['help_text'] = $cf['helper'];
                                unset($cf['helper']);
                                $schemaChanged = true;
                            } elseif (empty($cf['help_text']) && !empty($defFld['help_text'])) {
                                $cf['help_text'] = $defFld['help_text'];
                                $schemaChanged = true;
                            }
                            if (empty($cf['provider_param'])) {
                                $cf['provider_param'] = $defFld['provider_param'] ?? $fk;
                                $schemaChanged = true;
                            }
                            if (!empty($defFld['maxLength']) && empty($cf['maxLength'])) {
                                $cf['maxLength'] = $defFld['maxLength'];
                                $schemaChanged = true;
                            }
                            if ($srv['service_key'] === 'bvn_modification' && $fk === 'new_value' && empty($cf['conditional_on']) && !empty($defFld['conditional_on'])) {
                                $cf['conditional_on'] = $defFld['conditional_on'];
                                $cf['placeholder'] = $defFld['placeholder'] ?? ($cf['placeholder'] ?? '');
                                $schemaChanged = true;
                                $legacyBvnUpgrade = true;
                            }
                        }
                        unset($cf);
                        if ($legacyBvnUpgrade && empty($seenKeys['new_dob']) && !empty($srvFieldMap['new_dob'])) {
                            $curSchema[] = $srvFieldMap['new_dob'];
                            $schemaChanged = true;
                        }
                        if ($schemaChanged) {
                            $updCols[] = 'form_schema = :fschema';
                            $updParams['fschema'] = json_encode(array_values($curSchema));
                        }
                    }

                    if (empty($existing['supported_notes'])) {
                        $updCols[] = 'supported_notes = :notes';
                        $updParams['notes'] = $srv['supported_notes'];
                    }
                    if (count($updCols) > 1 || ($existing['processing_type'] ?? '') !== 'manual') {
                        $db->execute(
                            'UPDATE service_catalogue SET ' . implode(', ', $updCols) . ' WHERE id = :id',
                            $updParams
                        );
                        $applied[] = 'mod_backfill:' . $srv['service_key'];
                    }
                }
            } catch (Throwable $e) {
                $errors[] = 'mod_srv:' . $srv['service_key'] . ' => ' . $e->getMessage();
            }
        }

        return ['applied' => $applied, 'errors' => $errors];
    }

    public static function syncEnrolmentCatalog(Database $db, bool $force = false): array
    {
        static $enrSynced = false;
        if ($enrSynced && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $enrSynced = true;

        $applied = [];
        $errors = [];

        // 1. Ensure Stage 4 metadata columns on service_catalogue exist
        $catCols = [
            'processing_type' => 'ADD COLUMN processing_type ENUM("instant", "manual") NOT NULL DEFAULT "instant"',
            'manual_label' => 'ADD COLUMN manual_label VARCHAR(80) NULL DEFAULT "Manual Processing"',
            'estimated_turnaround' => 'ADD COLUMN estimated_turnaround VARCHAR(150) NULL',
            'required_documents' => 'ADD COLUMN required_documents JSON NULL',
            'form_schema' => 'ADD COLUMN form_schema JSON NULL',
            'supported_notes' => 'ADD COLUMN supported_notes TEXT NULL',
        ];
        foreach ($catCols as $col => $clause) {
            try {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_catalogue" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE service_catalogue {$clause}");
                    $applied[] = "col:service_catalogue.{$col}";
                }
            } catch (Throwable $e) {
                $errors[] = "col:service_catalogue.{$col} => " . $e->getMessage();
            }
        }

        // 2. Ensure Stage 4 enrolment tables exist
        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS enrolment_orders (
                    id VARCHAR(36) PRIMARY KEY,
                    order_number VARCHAR(64) NOT NULL UNIQUE,
                    user_id VARCHAR(36) NOT NULL,
                    enrolment_type ENUM("NIN_ADULT", "NIN_CHILD", "NIN_ARRANGEMENT", "BVN_ENROLMENT", "BVN_ARRANGEMENT") NOT NULL DEFAULT "NIN_ADULT",
                    identity_domain ENUM("NIN", "BVN") NOT NULL DEFAULT "NIN",
                    service_key VARCHAR(100) NOT NULL,
                    service_name VARCHAR(191) NOT NULL,
                    applicant_name VARCHAR(191) NOT NULL,
                    applicant_phone_masked VARCHAR(40) NULL,
                    submitted_fields JSON NOT NULL,
                    supporting_documents JSON NULL,
                    customer_price DECIMAL(15, 2) NOT NULL,
                    provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    profit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                    provider_id VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                    endpoint VARCHAR(150) NOT NULL,
                    payment_reference VARCHAR(120) NOT NULL UNIQUE,
                    refund_reference VARCHAR(120) NULL UNIQUE,
                    idempotency_key VARCHAR(120) NULL,
                    provider_reference VARCHAR(120) NULL,
                    provider_status VARCHAR(64) NULL,
                    provider_remarks TEXT NULL,
                    provider_response JSON NULL,
                    admin_notes TEXT NULL,
                    reviewed_by VARCHAR(100) NULL,
                    reviewed_at DATETIME NULL,
                    estimated_completion_text VARCHAR(150) NULL,
                    status ENUM("pending", "processing", "query_required", "completed", "failed", "rejected", "refunded") NOT NULL DEFAULT "pending",
                    completed_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_eo_user (user_id),
                    INDEX idx_eo_domain_status (identity_domain, status),
                    INDEX idx_eo_prov_ref (provider_reference),
                    INDEX idx_eo_idemp (user_id, idempotency_key),
                    INDEX idx_eo_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $db->execute(
                'CREATE TABLE IF NOT EXISTS enrolment_sample_documents (
                    id VARCHAR(36) PRIMARY KEY,
                    service_key VARCHAR(100) NOT NULL,
                    title VARCHAR(191) NOT NULL,
                    description TEXT NULL,
                    original_name VARCHAR(255) NOT NULL,
                    stored_name VARCHAR(255) NOT NULL,
                    mime_type VARCHAR(100) NOT NULL,
                    file_size INT NOT NULL DEFAULT 0,
                    file_path VARCHAR(500) NOT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_by VARCHAR(36) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_esd_skey (service_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) {
            $errors[] = 'enr_tables => ' . $e->getMessage();
        }

        // 3. Ensure Enrolment category exists
        try {
            $db->execute(
                'INSERT INTO service_categories (id, code, name, icon, display_order, is_active)
                 VALUES ("cat_enr", "enrolment", "Enrolment", "FilePlus", 6, 1)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), code = VALUES(code)'
            );
        } catch (Throwable $e) {
            $errors[] = 'enr_category => ' . $e->getMessage();
        }

        // 4. Confirmed 2SureVerify NIN Enrolment services (explicitly NIN Enrolment despite "bvn" in endpoint filenames)
        $docPassportAdult = [
            'key' => 'passport_photo',
            'provider_file_param' => 'passport_photo',
            'label' => 'Applicant White-Background Passport Photograph',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP'],
            'max_size_mb' => 5,
            'description' => 'Clear recent colour passport photograph on a plain white background (face centred, no glasses/headgear unless religious).',
        ];
        $docValidIdAdult = [
            'key' => 'valid_id',
            'provider_file_param' => 'valid_id',
            'label' => 'Supporting Identification / Birth Record',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Birth Certificate, Sworn Declaration of Age, International Passport, Voter\'s Card, or Driver\'s Licence.',
        ];
        $docAddressProof = [
            'key' => 'address_proof',
            'provider_file_param' => 'address_proof',
            'label' => 'Proof of Address / Utility Bill (Optional)',
            'required' => false,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Optional recent utility bill or tenancy document confirming residential address.',
        ];

        $docPassportChild = [
            'key' => 'passport_photo',
            'provider_file_param' => 'passport_photo',
            'label' => 'Child White-Background Passport Photograph',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP'],
            'max_size_mb' => 5,
            'description' => 'Clear recent passport photograph of the child on a plain white background.',
        ];
        $docBirthCertChild = [
            'key' => 'birth_certificate',
            'provider_file_param' => 'birth_certificate',
            'label' => 'Child NPC Birth Certificate / Hospital Birth Record',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Official National Population Commission (NPC) birth certificate or hospital birth record for the child.',
        ];
        $docParentNinSlip = [
            'key' => 'parent_nin_slip',
            'provider_file_param' => 'parent_nin_slip',
            'label' => 'Parent / Legal Guardian NIN Slip',
            'required' => true,
            'accepted_formats' => ['JPG', 'PNG', 'WEBP', 'PDF'],
            'max_size_mb' => 5,
            'description' => 'Clear copy of the authorizing parent or legal guardian\'s valid NIN slip.',
        ];

        $enrolmentServices = [
            [
                'id' => 'srv_enr_nin_adult',
                'category_id' => 'cat_enr',
                'service_key' => 'bvn_enroll_adult',
                'name' => 'NIN Enrolment (Adult)',
                'description' => 'Manual National Identification Number (NIN) enrolment processing for adult applicants (16 years and above) with verified biodata and supporting identification.',
                'endpoint' => '/api/v1/bvn_enroll_adult.php',
                'wholesale_cost' => 10000.00,
                'selling_price' => 15000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Manual Processing)',
                'supported_notes' => "Ensure applicant full names, date of birth, and state/LGA match supporting birth/identity documents exactly.\nThis is a Manual Processing NIN Enrolment request — status remains Pending until completed.",
                'required_fields' => ['first_name', 'last_name', 'dob', 'gender', 'phone', 'marital_status', 'state_of_origin', 'lga_of_origin', 'residence_address', 'residence_state', 'residence_lga'],
                'required_documents' => [$docPassportAdult, $docValidIdAdult, $docAddressProof],
                'form_schema' => [
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ibrahim', 'help_text' => 'Applicant legal first name matching supporting identification.'],
                    ['key' => 'middle_name', 'provider_param' => 'middle_name', 'label' => 'Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Musa', 'help_text' => 'Leave blank if the applicant has no middle name.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Adeyemi', 'help_text' => 'Applicant legal surname / family name.'],
                    ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Adult applicant date of birth (16 years and above).'],
                    ['key' => 'gender', 'provider_param' => 'gender', 'label' => 'Gender', 'type' => 'select', 'required' => true, 'help_text' => 'Applicant biological gender.', 'options' => [['value' => 'Male', 'label' => 'Male'], ['value' => 'Female', 'label' => 'Female']]],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Active Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => 'e.g., 08031234567', 'help_text' => '11-digit Nigerian mobile number reachable for enrolment updates.'],
                    ['key' => 'email', 'provider_param' => 'email', 'label' => 'Contact Email Address (Optional)', 'type' => 'email', 'required' => false, 'placeholder' => 'applicant@example.com', 'help_text' => 'Optional email address for NIN tracking and digital slip notification.'],
                    ['key' => 'marital_status', 'provider_param' => 'marital_status', 'label' => 'Marital Status', 'type' => 'select', 'required' => true, 'help_text' => 'Current marital status of the adult applicant.', 'options' => [['value' => 'Single', 'label' => 'Single'], ['value' => 'Married', 'label' => 'Married'], ['value' => 'Divorced', 'label' => 'Divorced'], ['value' => 'Widowed', 'label' => 'Widowed']]],
                    ['key' => 'state_of_origin', 'provider_param' => 'state_of_origin', 'label' => 'State of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Kano', 'help_text' => 'Applicant indigene state of origin.'],
                    ['key' => 'lga_of_origin', 'provider_param' => 'lga_of_origin', 'label' => 'LGA of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Nassarawa', 'help_text' => 'Local Government Area of origin.'],
                    ['key' => 'residence_address', 'provider_param' => 'residence_address', 'label' => 'Residential Street Address', 'type' => 'text', 'required' => true, 'placeholder' => 'House no., street name, area', 'help_text' => 'Full current residential address in Nigeria.'],
                    ['key' => 'residence_state', 'provider_param' => 'residence_state', 'label' => 'State of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Lagos', 'help_text' => 'State where the applicant currently resides.'],
                    ['key' => 'residence_lga', 'provider_param' => 'residence_lga', 'label' => 'LGA of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Ikeja', 'help_text' => 'Local Government Area of current residence.'],
                    ['key' => 'town', 'provider_param' => 'town', 'label' => 'Town / City (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Ikeja', 'help_text' => 'Town or city of residence.'],
                    ['key' => 'notes', 'provider_param' => 'notes', 'label' => 'Additional Processing Notes (Optional)', 'type' => 'textarea', 'required' => false, 'placeholder' => 'Any helpful context for our NIN enrolment team', 'help_text' => 'Optional notes or scheduling details.'],
                ],
            ],
            [
                'id' => 'srv_enr_nin_child',
                'category_id' => 'cat_enr',
                'service_key' => 'bvn_enroll_child',
                'name' => 'NIN Enrolment (Child)',
                'description' => 'Manual National Identification Number (NIN) enrolment processing for minors / children under 16 years linked to a verified parent or legal guardian NIN.',
                'endpoint' => '/api/v1/bvn_enroll_child.php',
                'wholesale_cost' => 8000.00,
                'selling_price' => 12000.00,
                'estimated_turnaround' => '3 – 7 Business Days (Manual Processing)',
                'supported_notes' => "Child NIN Enrolment requires a valid 11-digit Parent / Legal Guardian NIN and NPC Birth Certificate.\nThis is a Manual Processing NIN Enrolment request — status remains Pending until completed.",
                'required_fields' => ['first_name', 'last_name', 'dob', 'gender', 'parent_nin', 'parent_name', 'parent_relationship', 'phone', 'state_of_origin', 'lga_of_origin', 'residence_address', 'residence_state', 'residence_lga'],
                'required_documents' => [$docPassportChild, $docBirthCertChild, $docParentNinSlip],
                'form_schema' => [
                    ['key' => 'first_name', 'provider_param' => 'first_name', 'label' => 'Child First Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Amina', 'help_text' => 'Child legal first name matching NPC birth certificate.'],
                    ['key' => 'middle_name', 'provider_param' => 'middle_name', 'label' => 'Child Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'e.g., Bello', 'help_text' => 'Leave blank if the child has no middle name.'],
                    ['key' => 'last_name', 'provider_param' => 'last_name', 'label' => 'Child Surname / Last Name', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Yusuf', 'help_text' => 'Child family surname matching parent record.'],
                    ['key' => 'dob', 'provider_param' => 'dob', 'label' => 'Child Date of Birth', 'type' => 'date', 'required' => true, 'help_text' => 'Exact Date of Birth printed on the child\'s birth certificate (under 18 years).'],
                    ['key' => 'gender', 'provider_param' => 'gender', 'label' => 'Child Gender', 'type' => 'select', 'required' => true, 'help_text' => 'Child biological gender.', 'options' => [['value' => 'Male', 'label' => 'Male'], ['value' => 'Female', 'label' => 'Female']]],
                    ['key' => 'parent_nin', 'provider_param' => 'parent_nin', 'label' => 'Parent / Guardian 11-Digit NIN', 'type' => 'text', 'required' => true, 'maxLength' => 11, 'placeholder' => 'Enter 11-digit parent NIN', 'help_text' => 'Active 11-digit NIN of the authorizing parent or legal guardian.'],
                    ['key' => 'parent_name', 'provider_param' => 'parent_name', 'label' => 'Parent / Guardian Full Name', 'type' => 'text', 'required' => true, 'placeholder' => 'Full name as on Parent NIN slip', 'help_text' => 'Exact full name of the parent or legal guardian.'],
                    ['key' => 'parent_relationship', 'provider_param' => 'parent_relationship', 'label' => 'Relationship to Child', 'type' => 'select', 'required' => true, 'help_text' => 'Authorizing guardian relationship.', 'options' => [['value' => 'Father', 'label' => 'Father'], ['value' => 'Mother', 'label' => 'Mother'], ['value' => 'Legal Guardian', 'label' => 'Legal Guardian']]],
                    ['key' => 'phone', 'provider_param' => 'phone', 'label' => 'Parent / Guardian Phone Number', 'type' => 'tel', 'required' => true, 'maxLength' => 11, 'placeholder' => 'e.g., 08031234567', 'help_text' => '11-digit Nigerian mobile number of the parent/guardian.'],
                    ['key' => 'email', 'provider_param' => 'email', 'label' => 'Parent / Guardian Email (Optional)', 'type' => 'email', 'required' => false, 'placeholder' => 'parent@example.com', 'help_text' => 'Optional email address for status notifications.'],
                    ['key' => 'state_of_origin', 'provider_param' => 'state_of_origin', 'label' => 'State of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Kaduna', 'help_text' => 'Child state of origin.'],
                    ['key' => 'lga_of_origin', 'provider_param' => 'lga_of_origin', 'label' => 'LGA of Origin', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Zaria', 'help_text' => 'Child Local Government Area of origin.'],
                    ['key' => 'residence_address', 'provider_param' => 'residence_address', 'label' => 'Residential Street Address', 'type' => 'text', 'required' => true, 'placeholder' => 'House no., street name, area', 'help_text' => 'Full current residential address where the child lives.'],
                    ['key' => 'residence_state', 'provider_param' => 'residence_state', 'label' => 'State of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., Abuja FCT', 'help_text' => 'State of current residence.'],
                    ['key' => 'residence_lga', 'provider_param' => 'residence_lga', 'label' => 'LGA of Residence', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g., AMAC', 'help_text' => 'LGA of current residence.'],
                    ['key' => 'notes', 'provider_param' => 'notes', 'label' => 'Additional Processing Notes (Optional)', 'type' => 'textarea', 'required' => false, 'placeholder' => 'Any helpful context for our child NIN enrolment team', 'help_text' => 'Optional notes for manual verification officers.'],
                ],
            ],
        ];

        foreach ($enrolmentServices as $srv) {
            try {
                $existing = $db->fetchOne(
                    'SELECT id, category_id, name, provider_id, endpoint, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes FROM service_catalogue WHERE service_key = :sk LIMIT 1',
                    ['sk' => $srv['service_key']]
                );
                if (!$existing) {
                    $db->execute(
                        'INSERT INTO service_catalogue
                         (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active, processing_type, manual_label, estimated_turnaround, required_documents, form_schema, supported_notes)
                         VALUES
                         (:id, :cat, :sk, :nm, :desc, "2sureverify", :ep, :wc, :sp, :rf, 0, 1, "manual", "Manual Processing", :eta, :rdocs, :fschema, :notes)',
                        [
                            'id' => $srv['id'],
                            'cat' => $srv['category_id'],
                            'sk' => $srv['service_key'],
                            'nm' => $srv['name'],
                            'desc' => $srv['description'],
                            'ep' => $srv['endpoint'],
                            'wc' => $srv['wholesale_cost'],
                            'sp' => $srv['selling_price'],
                            'rf' => json_encode($srv['required_fields']),
                            'eta' => $srv['estimated_turnaround'],
                            'rdocs' => json_encode($srv['required_documents']),
                            'fschema' => json_encode($srv['form_schema']),
                            'notes' => $srv['supported_notes'],
                        ]
                    );
                    $applied[] = 'enr_insert:' . $srv['service_key'];
                } else {
                    // Preserve admin-edited selling_price, is_active, wholesale_cost, form_schema, required_documents, and instructions;
                    // strictly enforce category_id = cat_enr, provider_id = 2sureverify, endpoint, processing_type = manual, and non-BVN NIN naming if miscategorized
                    $updCols = ['processing_type = "manual"', 'provider_id = "2sureverify"', 'endpoint = :ep'];
                    $updParams = ['id' => $existing['id'], 'ep' => $srv['endpoint']];

                    if ($existing['category_id'] !== 'cat_enr') {
                        $updCols[] = 'category_id = "cat_enr"';
                    }
                    if (stripos((string)($existing['name'] ?? ''), 'bvn') !== false || empty($existing['name'])) {
                        $updCols[] = 'name = :nm';
                        $updParams['nm'] = $srv['name'];
                    }
                    if (empty($existing['manual_label'])) {
                        $updCols[] = 'manual_label = "Manual Processing"';
                    }
                    if (empty($existing['estimated_turnaround'])) {
                        $updCols[] = 'estimated_turnaround = :eta';
                        $updParams['eta'] = $srv['estimated_turnaround'];
                    }
                    if (empty($existing['supported_notes'])) {
                        $updCols[] = 'supported_notes = :notes';
                        $updParams['notes'] = $srv['supported_notes'];
                    }
                    $curDocs = is_string($existing['required_documents'] ?? null)
                        ? json_decode((string)$existing['required_documents'], true)
                        : ($existing['required_documents'] ?? null);
                    if (empty($curDocs) || !is_array($curDocs)) {
                        $updCols[] = 'required_documents = :rdocs';
                        $updParams['rdocs'] = json_encode($srv['required_documents']);
                    }
                    $curSchema = is_string($existing['form_schema'] ?? null)
                        ? json_decode((string)$existing['form_schema'], true)
                        : ($existing['form_schema'] ?? null);
                    if (empty($curSchema) || !is_array($curSchema)) {
                        $updCols[] = 'form_schema = :fschema';
                        $updParams['fschema'] = json_encode($srv['form_schema']);
                    }
                    if (count($updCols) > 3 || ($existing['processing_type'] ?? '') !== 'manual' || ($existing['category_id'] ?? '') !== 'cat_enr') {
                        $db->execute(
                            'UPDATE service_catalogue SET ' . implode(', ', $updCols) . ' WHERE id = :id',
                            $updParams
                        );
                        $applied[] = 'enr_backfill:' . $srv['service_key'];
                    }
                }
            } catch (Throwable $e) {
                $errors[] = 'enr_srv:' . $srv['service_key'] . ' => ' . $e->getMessage();
            }
        }

        return ['applied' => $applied, 'errors' => $errors];
    }

    public static function syncSecurityAndReferralSchema(Database $db, bool $force = false): array
    {
        static $syncedSecRef = false;
        if ($syncedSecRef && !$force) {
            return ['applied' => [], 'errors' => []];
        }
        $syncedSecRef = true;

        $applied = [];
        $errors = [];

        $userCols = [
            'kyc_level' => 'ADD COLUMN kyc_level INT NOT NULL DEFAULT 1',
            'phone_normalized' => 'ADD COLUMN phone_normalized VARCHAR(32) NULL',
            'token_version' => 'ADD COLUMN token_version INT NOT NULL DEFAULT 1',
            'assigned_permissions' => 'ADD COLUMN assigned_permissions TEXT NULL',
            'referred_by_user_id' => 'ADD COLUMN referred_by_user_id VARCHAR(36) NULL',
            'referral_source' => 'ADD COLUMN referral_source VARCHAR(64) NULL',
            'referral_campaign_code' => 'ADD COLUMN referral_campaign_code VARCHAR(64) NULL',
            'referral_bound_at' => 'ADD COLUMN referral_bound_at DATETIME NULL',
            'pin_failed_attempts' => 'ADD COLUMN pin_failed_attempts INT NOT NULL DEFAULT 0',
            'pin_locked_until' => 'ADD COLUMN pin_locked_until DATETIME NULL',
            'pin_set_at' => 'ADD COLUMN pin_set_at DATETIME NULL',
            'pin_updated_by_admin_at' => 'ADD COLUMN pin_updated_by_admin_at DATETIME NULL',
            'mfa_enabled' => 'ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0',
            'mfa_method' => 'ADD COLUMN mfa_method VARCHAR(24) NOT NULL DEFAULT "email_otp"',
            'last_login_at' => 'ADD COLUMN last_login_at DATETIME NULL',
            'last_login_ip' => 'ADD COLUMN last_login_ip VARCHAR(45) NULL',
        ];
        foreach ($userCols as $col => $clause) {
            try {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "users" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE users {$clause}");
                    $applied[] = "col:users.{$col}";
                }
            } catch (Throwable $e) {
                $errors[] = "col:users.{$col} => " . $e->getMessage();
            }
        }

        // Safe backfill for phone_normalized (canonical 2348XXXXXXXXX / digits)
        try {
            $db->execute(
                'UPDATE users SET phone_normalized = CASE
                    WHEN REGEXP_REPLACE(phone_number, "[^0-9]", "") LIKE "0%" AND CHAR_LENGTH(REGEXP_REPLACE(phone_number, "[^0-9]", "")) = 11
                        THEN CONCAT("234", SUBSTRING(REGEXP_REPLACE(phone_number, "[^0-9]", ""), 2))
                    WHEN CHAR_LENGTH(REGEXP_REPLACE(phone_number, "[^0-9]", "")) = 10
                        THEN CONCAT("234", REGEXP_REPLACE(phone_number, "[^0-9]", ""))
                    ELSE REGEXP_REPLACE(phone_number, "[^0-9]", "")
                 END
                 WHERE (phone_normalized IS NULL OR phone_normalized = "") AND phone_number IS NOT NULL AND phone_number != ""'
            );
        } catch (Throwable) {
            // Fallback for MySQL 5.7/MariaDB without REGEXP_REPLACE
            try {
                $rows = $db->fetchAll('SELECT id, phone_number FROM users WHERE (phone_normalized IS NULL OR phone_normalized = "") AND phone_number IS NOT NULL LIMIT 500');
                foreach ($rows as $r) {
                    $digits = preg_replace('/\D/', '', (string)($r['phone_number'] ?? '')) ?? '';
                    if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
                        $digits = '234' . substr($digits, 1);
                    } elseif (strlen($digits) === 10) {
                        $digits = '234' . $digits;
                    }
                    if ($digits !== '') {
                        $db->execute('UPDATE users SET phone_normalized = :pn WHERE id = :id', ['pn' => $digits, 'id' => $r['id']]);
                    }
                }
            } catch (Throwable) {
            }
        }

        $tables = [
            'user_sessions' => 'CREATE TABLE IF NOT EXISTS user_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                jti VARCHAR(64) NOT NULL UNIQUE,
                token_version INT NOT NULL DEFAULT 1,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                device_label VARCHAR(120) NULL,
                is_revoked TINYINT(1) NOT NULL DEFAULT 0,
                revoked_reason VARCHAR(120) NULL,
                revoked_at DATETIME NULL,
                last_seen_at DATETIME NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_us_user (user_id, is_revoked),
                INDEX idx_us_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'login_attempts' => 'CREATE TABLE IF NOT EXISTS login_attempts (
                id VARCHAR(36) PRIMARY KEY,
                identifier VARCHAR(191) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                attempt_count INT NOT NULL DEFAULT 0,
                locked_until DATETIME NULL,
                last_attempt_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_la_ident_ip (identifier, ip_address),
                INDEX idx_la_locked (locked_until)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'mfa_challenges' => 'CREATE TABLE IF NOT EXISTS mfa_challenges (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                challenge_token VARCHAR(128) NOT NULL UNIQUE,
                method ENUM("email_otp", "totp") NOT NULL DEFAULT "email_otp",
                otp_hash VARCHAR(255) NULL,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                is_verified TINYINT(1) NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mfa_user (user_id, is_verified),
                INDEX idx_mfa_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'user_mfa_configs' => 'CREATE TABLE IF NOT EXISTS user_mfa_configs (
                user_id VARCHAR(36) PRIMARY KEY,
                totp_secret_encrypted TEXT NULL,
                totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
                email_otp_enabled TINYINT(1) NOT NULL DEFAULT 0,
                recovery_codes_hash JSON NULL,
                enabled_at DATETIME NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'pin_reset_requests' => 'CREATE TABLE IF NOT EXISTS pin_reset_requests (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                email VARCHAR(191) NOT NULL,
                otp_hash VARCHAR(255) NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                is_used TINYINT(1) NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_prr_user (user_id, is_used),
                INDEX idx_prr_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_campaigns' => 'CREATE TABLE IF NOT EXISTS referral_campaigns (
                id VARCHAR(36) PRIMARY KEY,
                campaign_code VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                description TEXT NULL,
                reward_mode VARCHAR(32) NOT NULL DEFAULT "fixed",
                reward_value DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                points_bonus INT NOT NULL DEFAULT 0,
                min_spend DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                budget_cap DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                spent_budget DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                starts_at DATETIME NULL,
                ends_at DATETIME NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(36) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rc_active (is_active, starts_at, ends_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_tiers' => 'CREATE TABLE IF NOT EXISTS referral_tiers (
                id VARCHAR(36) PRIMARY KEY,
                tier_key VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                min_qualified_referrals INT NOT NULL DEFAULT 0,
                min_referred_volume DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_multiplier DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
                bonus_cash DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                bonus_points INT NOT NULL DEFAULT 0,
                reseller_only TINYINT(1) NOT NULL DEFAULT 0,
                display_order INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referrals' => 'CREATE TABLE IF NOT EXISTS referrals (
                id VARCHAR(36) PRIMARY KEY,
                referrer_user_id VARCHAR(36) NOT NULL,
                referred_user_id VARCHAR(36) NOT NULL UNIQUE,
                referral_code_used VARCHAR(64) NOT NULL,
                attribution_channel VARCHAR(32) NOT NULL DEFAULT "referral_link",
                campaign_code VARCHAR(64) NULL,
                risk_fingerprint VARCHAR(128) NULL,
                signup_ip VARCHAR(45) NULL,
                status ENUM("registered", "qualified", "flagged", "blocked") NOT NULL DEFAULT "registered",
                flag_reason TEXT NULL,
                qualifying_tx_count INT NOT NULL DEFAULT 0,
                qualifying_spend_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_earned_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                qualified_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ref_referrer (referrer_user_id, status),
                INDEX idx_ref_campaign (campaign_code),
                INDEX idx_ref_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_balances' => 'CREATE TABLE IF NOT EXISTS referral_balances (
                user_id VARCHAR(36) PRIMARY KEY,
                pending_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                available_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reserved_for_withdrawal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                transferred_to_wallet_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_withdrawn DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reversed_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                points_balance INT NOT NULL DEFAULT 0,
                points_redeemed_total INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_rewards' => 'CREATE TABLE IF NOT EXISTS referral_rewards (
                id VARCHAR(36) PRIMARY KEY,
                referrer_user_id VARCHAR(36) NOT NULL,
                referred_user_id VARCHAR(36) NOT NULL,
                referral_id VARCHAR(36) NULL,
                campaign_code VARCHAR(64) NULL,
                service_category VARCHAR(64) NOT NULL,
                service_key VARCHAR(100) NULL,
                source_reference VARCHAR(120) NOT NULL UNIQUE,
                gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                wholesale_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                gateway_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_margin DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_mode VARCHAR(32) NOT NULL DEFAULT "fixed",
                reward_cash DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                reward_points INT NOT NULL DEFAULT 0,
                status ENUM("pending", "available", "reversed", "rejected", "paid_out", "skipped") NOT NULL DEFAULT "pending",
                status_reason TEXT NULL,
                settles_at DATETIME NULL,
                settled_at DATETIME NULL,
                reversed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rr_referrer (referrer_user_id, status),
                INDEX idx_rr_referred (referred_user_id),
                INDEX idx_rr_settle (status, settles_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_points_ledger' => 'CREATE TABLE IF NOT EXISTS referral_points_ledger (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                entry_type ENUM("CREDIT", "DEBIT", "REVERSAL") NOT NULL,
                points INT NOT NULL,
                balance_before INT NOT NULL DEFAULT 0,
                balance_after INT NOT NULL DEFAULT 0,
                reference VARCHAR(120) NOT NULL UNIQUE,
                naira_value DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                conversion_rate DECIMAL(15, 4) NOT NULL DEFAULT 1.0000,
                description VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_rpl_user (user_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_withdrawals' => 'CREATE TABLE IF NOT EXISTS referral_withdrawals (
                id VARCHAR(36) PRIMARY KEY,
                withdrawal_number VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                bank_name VARCHAR(120) NOT NULL,
                account_number VARCHAR(30) NOT NULL,
                account_name VARCHAR(191) NOT NULL,
                gross_amount DECIMAL(15, 2) NOT NULL,
                fee_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                net_amount DECIMAL(15, 2) NOT NULL,
                status ENUM("pending", "approved", "processing", "paid", "rejected", "failed", "cancelled") NOT NULL DEFAULT "pending",
                idempotency_key VARCHAR(120) NULL,
                payment_reference VARCHAR(120) NULL,
                receipt_url VARCHAR(500) NULL,
                admin_note TEXT NULL,
                rejection_reason TEXT NULL,
                reviewed_by VARCHAR(100) NULL,
                reviewed_at DATETIME NULL,
                paid_by VARCHAR(100) NULL,
                paid_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rw_user (user_id, status),
                INDEX idx_rw_status (status, created_at),
                INDEX idx_rw_idemp (user_id, idempotency_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',

            'referral_audit_logs' => 'CREATE TABLE IF NOT EXISTS referral_audit_logs (
                id VARCHAR(36) PRIMARY KEY,
                actor_user_id VARCHAR(36) NULL,
                actor_email VARCHAR(191) NULL,
                target_user_id VARCHAR(36) NULL,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(64) NOT NULL,
                entity_id VARCHAR(64) NULL,
                details JSON NULL,
                ip_address VARCHAR(45) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ral_action (action, created_at),
                INDEX idx_ral_target (target_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];

        foreach ($tables as $name => $ddl) {
            try {
                $db->execute($ddl);
                $applied[] = "table:{$name}";
            } catch (Throwable $e) {
                $errors[] = "table:{$name} => " . $e->getMessage();
            }
        }

        // Seed starter referral tiers cleanly (idempotent)
        $defaultTiers = [
            ['tier_bronze', 'bronze', 'Bronze Starter', 0, 0.00, 1.0000, 0.00, 0, 0, 1],
            ['tier_silver', 'silver', 'Silver Partner', 5, 10000.00, 1.1500, 250.00, 50, 0, 2],
            ['tier_gold', 'gold', 'Gold Ambassador', 15, 50000.00, 1.3000, 750.00, 150, 0, 3],
            ['tier_platinum', 'platinum', 'Platinum Leader', 40, 150000.00, 1.5000, 2000.00, 400, 0, 4],
        ];
        foreach ($defaultTiers as $t) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO referral_tiers
                     (id, tier_key, name, min_qualified_referrals, min_referred_volume, reward_multiplier, bonus_cash, bonus_points, reseller_only, display_order, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
                    $t
                );
            } catch (Throwable) {
            }
        }

        // Seed default configurable settings ONLY if missing (never overwrite existing Admin values)
        $defaultSettingConfigs = [
            'referral_settings' => [
                'category' => 'referral',
                'description' => 'HAMBAKTECH Referral, Rewards, Points, Conversion & Withdrawal Rules',
                'value' => [
                    'enabled' => true,
                    'program_name' => 'HAMBAKTECH Partner & Referral Program',
                    'code_prefix' => 'HAMBAK',
                    'code_length' => 6,
                    'reward_mode' => 'fixed', // fixed, percent_of_spend, percent_of_margin, milestone, points, campaign, tier, hybrid
                    'trigger_mode' => 'first_qualifying_transaction', // signup_verified, first_qualifying_transaction, every_qualifying_transaction
                    'flat_reward_naira' => 100.00,
                    'percent_of_spend' => 1.5,
                    'percent_of_margin' => 15.0,
                    'points_per_qualifying_tx' => 50,
                    'points_per_1000_naira' => 25,
                    'point_value_naira' => 1.00,
                    'min_qualifying_spend' => 500.00,
                    'min_net_margin_naira' => 10.00,
                    'protect_negative_margin' => true,
                    'settlement_hold_hours' => 24,
                    'monthly_reward_cap_naira' => 50000.00,
                    'max_rewards_per_referee' => 1,
                    'qualifying_services' => [
                        'data' => true,
                        'airtime' => true,
                        'airtime_pin' => true,
                        'data_pin' => true,
                        'cable' => true,
                        'electricity' => true,
                        'exam_pin' => true,
                        'bulksms' => true,
                        'nin_verification' => true,
                        'bvn_verification' => true,
                        'nin_modification' => true,
                        'bvn_modification' => true,
                        'enrolment' => true,
                    ],
                    'wallet_conversion_enabled' => true,
                    'min_wallet_conversion_naira' => 500.00,
                    'min_points_conversion' => 100,
                    'wallet_conversion_fee_naira' => 0.00,
                    'withdrawal_enabled' => true,
                    'min_withdrawal_naira' => 2000.00,
                    'max_withdrawal_naira' => 100000.00,
                    'daily_withdrawal_limit_naira' => 100000.00,
                    'withdrawal_fee_type' => 'flat', // flat | percent
                    'withdrawal_fee_value' => 50.00,
                    'require_kyc_level_for_withdrawal' => 1,
                    'block_self_referral' => true,
                    'block_same_ip_signup' => true,
                    'max_signups_per_ip_24h' => 3,
                    'notify_email_on_reward' => true,
                    'notify_email_on_withdrawal' => true,
                    'terms_summary' => 'Earn rewards when friends sign up using your referral code and complete qualifying transactions above the minimum spend threshold. Rewards enter a settlement hold window before becoming available for instant wallet conversion or bank withdrawal.',
                    'whatsapp_share_template' => 'Join HAMBAKTECH for instant Data, Airtime, Bills & Identity Services using my referral link: {referral_link} (Code: {referral_code})',
                ],
            ],
            'pin_policy_settings' => [
                'category' => 'security',
                'description' => 'Compulsory Transaction PIN Activation & Server Enforcement Policy',
                'value' => [
                    'enforce_transaction_pin' => true,
                    'require_pin_activation_for_all_customers' => true,
                    'pin_length' => 4, // 4, 5, or 6
                    'allow_weak_pins' => false,
                    'pin_max_attempts' => 5,
                    'pin_lockout_minutes' => 15,
                    'otp_reset_expiry_minutes' => 15,
                    'protected_categories' => [
                        'telecom_data' => true,
                        'telecom_airtime' => true,
                        'telecom_pins' => true,
                        'telecom_swap' => true,
                        'telecom_bills' => true,
                        'telecom_bulksms' => true,
                        'identity_verification' => true,
                        'identity_modification' => true,
                        'identity_enrolment' => true,
                        'referral_wallet_conversion' => true,
                        'referral_withdrawal' => true,
                    ],
                ],
            ],
            'mfa_settings' => [
                'category' => 'security',
                'description' => 'Multi-Factor Authentication Policy for Admins and Customers',
                'value' => [
                    'require_mfa_for_superadmin' => false,
                    'require_mfa_for_admin' => false,
                    'allow_customer_mfa_opt_in' => true,
                    'default_mfa_method' => 'email_otp',
                    'otp_expiry_minutes' => 10,
                    'max_otp_attempts' => 5,
                ],
            ],
            'security_settings' => [
                'category' => 'security',
                'description' => 'Platform Session, Login Brute-Force & CORS Security Settings',
                'value' => [
                    'enforce_transaction_pin' => true,
                    'pin_max_attempts' => 5,
                    'pin_lockout_minutes' => 15,
                    'jwt_expiry_days' => 7,
                    'admin_session_timeout_minutes' => 60,
                    'customer_session_timeout_minutes' => 10080,
                    'max_failed_login_attempts' => 5,
                    'login_lockout_minutes' => 15,
                    'ip_rate_limiting_enabled' => true,
                    'bind_session_user_agent' => true,
                    'allowed_cors_origins' => ['https://hambaktech.com.ng', 'https://www.hambaktech.com.ng'],
                ],
            ],
        ];

        foreach ($defaultSettingConfigs as $sKey => $cfg) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                     VALUES (:id, :skey, :val, :cat, :desc, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'skey' => $sKey,
                        'val' => json_encode($cfg['value'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                        'cat' => $cfg['category'],
                        'desc' => $cfg['description'],
                    ]
                );
            } catch (Throwable $e) {
                $errors[] = "setting:{$sKey} => " . $e->getMessage();
            }
        }

        return ['applied' => $applied, 'errors' => $errors];
    }
}

