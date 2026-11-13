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
                name VARCHAR(191) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT "NIN",
                demo_image_url VARCHAR(500) NULL,
                description TEXT NULL,
                supported_service VARCHAR(100) NOT NULL DEFAULT "all_nin",
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 1,
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

        return [
            'applied_count' => count($applied),
            'applied' => $applied,
            'errors' => $errors,
        ];
    }
}
