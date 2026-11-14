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
                'form_schema' => [$fldNin, $fldDob, $fldFirst, $fldLast, $fldReason],
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
                    $fldFirst,
                    $fldLast,
                    $fldPhone,
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
                    $fldFirst,
                    $fldLast,
                    $fldPhone,
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
                    $fldFirst,
                    $fldLast,
                    $fldDob,
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
                ['key' => 'new_value', 'provider_param' => 'new_value', 'label' => 'Correct New Value Requested', 'type' => 'text', 'required' => true, 'placeholder' => 'Exact corrected name, DOB, phone, or address', 'help_text' => 'Enter the exact corrected spelling/value matching your valid government ID.'],
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
                        }
                        unset($cf);
                        if ($srv['service_key'] === 'bvn_modification' && empty($seenKeys['new_dob']) && !empty($srvFieldMap['new_dob'])) {
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
}
