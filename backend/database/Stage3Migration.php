<?php
/**
 * @file Stage3Migration.php
 * Idempotent Database Schema & Seed Migration for HAMBAK TECH — Stage 3:
 * NIN & BVN Modification Management (strict category isolation, bank/tier pricing,
 * supporting documents, status lifecycle & audit trail).
 */

declare(strict_types=1);

namespace HambakTech\Database;

use HambakTech\Core\Database;
use Throwable;

class Stage3Migration
{
    private static bool $migrated = false;

    public static function ensureSchema(Database $db, bool $force = false): void
    {
        if (self::$migrated && !$force) {
            return;
        }

        // 1. Add Stage 3 columns to service_catalogue idempotently
        $catCols = [
            'processing_type'     => 'ADD COLUMN processing_type VARCHAR(20) NOT NULL DEFAULT "instant" AFTER slip_type_supported',
            'manual_label'        => 'ADD COLUMN manual_label VARCHAR(100) NULL AFTER processing_type',
            'estimated_turnaround'=> 'ADD COLUMN estimated_turnaround VARCHAR(120) NULL AFTER manual_label',
            'required_documents'  => 'ADD COLUMN required_documents TEXT NULL AFTER estimated_turnaround',
            'field_schema'        => 'ADD COLUMN field_schema LONGTEXT NULL AFTER required_documents',
            'display_order'       => 'ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER field_schema',
        ];
        foreach ($catCols as $col => $clause) {
            $exists = $db->fetchOne(
                'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_catalogue" AND COLUMN_NAME = :col',
                ['col' => $col]
            );
            if (!$exists) {
                $db->execute("ALTER TABLE service_catalogue {$clause}");
            }
        }

        // 2. Ensure independent service categories with exact Stage 3 order
        $categories = [
            ['id' => 'cat_nin',      'code' => 'nin_verification',    'name' => 'NIN Verification',    'description' => 'Instant National Identification Number & Demographic verification services', 'icon' => 'shield-check', 'order' => 1],
            ['id' => 'cat_bvn',      'code' => 'bvn_verification',    'name' => 'BVN Verification',    'description' => 'Instant Bank Verification Number lookup and retrieval services',           'icon' => 'credit-card',  'order' => 2],
            ['id' => 'cat_mod',      'code' => 'nin_modification',    'name' => 'NIN Modification',    'description' => 'Manual NIMC NIN biodata correction and update requests',                   'icon' => 'file-edit',    'order' => 3],
            ['id' => 'cat_bvn_mod',  'code' => 'bvn_modification',    'name' => 'BVN Modification',    'description' => 'Manual BVN bank/agency record correction and update requests',             'icon' => 'building-2',   'order' => 4],
            ['id' => 'cat_enroll',   'code' => 'enrolment',           'name' => 'Enrolment',           'description' => 'NIN & BVN fresh biometric enrolment services',                             'icon' => 'user-plus',    'order' => 5],
            ['id' => 'cat_add',      'code' => 'additional_services', 'name' => 'Additional Services', 'description' => 'Personalization, validation, IPE clearance, NPC, CAC & TIN filings',       'icon' => 'layers',       'order' => 6],
        ];
        foreach ($categories as $c) {
            $db->execute(
                'INSERT INTO service_categories (id, code, name, description, icon, display_order, is_active)
                 VALUES (:id, :code, :name, :desc, :icon, :ord, 1)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    description = VALUES(description),
                    display_order = VALUES(display_order),
                    is_active = 1',
                [
                    'id'   => $c['id'],
                    'code' => $c['code'],
                    'name' => $c['name'],
                    'desc' => $c['description'],
                    'icon' => $c['icon'],
                    'ord'  => $c['order'],
                ]
            );
        }

        // 3. Create bvn_modification_banks table
        $db->execute(
            'CREATE TABLE IF NOT EXISTS bvn_modification_banks (
                enrollment_type VARCHAR(120) PRIMARY KEY,
                bank_name VARCHAR(150) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 14000.00,
                customer_price DECIMAL(15, 2) NOT NULL DEFAULT 18000.00,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $defaultBanks = [
            ['AGENCY',                  'Agency BVN Enrolment / Update', 6000.00,  8500.00,  1, 1],
            ['ACCESS BANK',             'Access Bank',                   14000.00, 17500.00, 2, 0],
            ['BOA BANK',                'Bank of Agriculture (BOA)',     14000.00, 17500.00, 3, 1],
            ['FCMB BANK',               'FCMB Bank',                     14000.00, 17500.00, 4, 1],
            ['FIRST BANK',              'First Bank of Nigeria',         14000.00, 17500.00, 5, 1],
            ['GT BANK',                 'Guaranty Trust Bank (GTBank)',  14000.00, 17500.00, 6, 1],
            ['HERITAGE BANK',           'Heritage Bank',                 14000.00, 17500.00, 7, 1],
            ['JAIZ BANK',               'Jaiz Bank',                     14000.00, 17500.00, 8, 1],
            ['KEYSTONE BANK',           'Keystone Bank',                 14000.00, 17500.00, 9, 1],
            ['LAPO MICRO FINANCE BANK', 'LAPO Microfinance Bank',        14000.00, 17500.00, 10, 1],
            ['MICROFINANCE BANK',       'Microfinance Bank (Other)',     14000.00, 17500.00, 11, 1],
            ['NIBSS BANK',              'NIBSS Direct',                  14000.00, 17500.00, 12, 1],
            ['NON COMMERCIAL BANK',     'Non-Commercial Bank',           14000.00, 17500.00, 13, 1],
            ['STANBIC IBTC BANK',       'Stanbic IBTC Bank',             14000.00, 17500.00, 14, 1],
            ['UNITY BANK',              'Unity Bank',                    14000.00, 17500.00, 15, 1],
        ];
        foreach ($defaultBanks as [$etype, $bname, $pcost, $cprice, $ord, $activeFlag]) {
            $db->execute(
                'INSERT IGNORE INTO bvn_modification_banks
                 (enrollment_type, bank_name, provider_cost, customer_price, is_active, display_order)
                 VALUES (:et, :bn, :pc, :cp, :act, :ord)',
                ['et' => $etype, 'bn' => $bname, 'pc' => $pcost, 'cp' => $cprice, 'act' => $activeFlag, 'ord' => $ord]
            );
        }

        // 4. Create nin_over_age_tiers table
        $db->execute(
            'CREATE TABLE IF NOT EXISTS nin_over_age_tiers (
                age_range VARCHAR(32) PRIMARY KEY,
                label VARCHAR(120) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
                customer_price DECIMAL(15, 2) NOT NULL DEFAULT 15000.00,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                display_order INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $defaultTiers = [
            ['5-9',   '5 – 9 Years Adjustment',   10000.00, 15000.00, 1],
            ['10-15', '10 – 15 Years Adjustment', 12000.00, 17500.00, 2],
            ['15-20', '15 – 20 Years Adjustment', 15000.00, 21000.00, 3],
        ];
        foreach ($defaultTiers as [$ar, $lbl, $pc, $cp, $ord]) {
            $db->execute(
                'INSERT IGNORE INTO nin_over_age_tiers
                 (age_range, label, provider_cost, customer_price, is_active, display_order)
                 VALUES (:ar, :lbl, :pc, :cp, 1, :ord)',
                ['ar' => $ar, 'lbl' => $lbl, 'pc' => $pc, 'cp' => $cp, 'ord' => $ord]
            );
        }

        // 5. Create modification_requests table (strictly stores manual NIN & BVN modifications)
        $db->execute(
            'CREATE TABLE IF NOT EXISTS modification_requests (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                category ENUM("NIN", "BVN") NOT NULL,
                service_key VARCHAR(100) NOT NULL,
                service_name VARCHAR(191) NOT NULL,
                modification_type VARCHAR(100) NULL,
                sub_type VARCHAR(60) NULL,
                enrollment_type VARCHAR(120) NULL,
                age_range VARCHAR(32) NULL,
                processing_type VARCHAR(20) NOT NULL DEFAULT "manual",
                identifier_masked VARCHAR(32) NOT NULL,
                identifier_encrypted TEXT NOT NULL,
                provider VARCHAR(50) NOT NULL DEFAULT "2sureverify",
                provider_endpoint VARCHAR(191) NOT NULL,
                provider_reference VARCHAR(120) NULL,
                provider_status VARCHAR(60) NULL,
                customer_price DECIMAL(15, 2) NOT NULL,
                provider_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                margin DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                payment_reference VARCHAR(120) NOT NULL,
                refund_reference VARCHAR(120) NULL,
                refunded_at TIMESTAMP NULL,
                status ENUM("pending", "processing", "completed", "failed", "rejected", "query_required") NOT NULL DEFAULT "pending",
                consent_accepted TINYINT(1) NOT NULL DEFAULT 1,
                consent_timestamp TIMESTAMP NULL,
                form_payload LONGTEXT NOT NULL,
                supporting_documents TEXT NULL,
                provider_response LONGTEXT NULL,
                provider_remarks TEXT NULL,
                admin_notes TEXT NULL,
                query_message TEXT NULL,
                reviewed_by VARCHAR(36) NULL,
                reviewed_at TIMESTAMP NULL,
                estimated_turnaround VARCHAR(120) NULL,
                estimated_completion_at TIMESTAMP NULL,
                idempotency_key VARCHAR(120) NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_status_check_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_mod_payment_ref (payment_reference),
                UNIQUE KEY uq_mod_user_idemp (user_id, idempotency_key),
                INDEX idx_mod_user_cat (user_id, category, status),
                INDEX idx_mod_cat_status (category, status, created_at),
                INDEX idx_mod_provider_ref (provider_reference)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        // 6. Create modification_status_history audit log table
        $db->execute(
            'CREATE TABLE IF NOT EXISTS modification_status_history (
                id VARCHAR(36) PRIMARY KEY,
                request_id VARCHAR(36) NOT NULL,
                previous_status VARCHAR(40) NULL,
                new_status VARCHAR(40) NOT NULL,
                actor_type ENUM("customer", "provider", "admin", "system") NOT NULL DEFAULT "system",
                actor_id VARCHAR(36) NULL,
                remarks TEXT NULL,
                is_customer_visible TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mod_hist_req (request_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        // 7. Clean up legacy misnamed keys (second_nin_mod_name_pass / second_nin_mod_phone_pass) -> canonical _auth
        $legacyMap = [
            'second_nin_mod_name_pass'  => 'second_nin_mod_name_auth',
            'second_nin_mod_phone_pass' => 'second_nin_mod_phone_auth',
        ];
        foreach ($legacyMap as $oldKey => $newKey) {
            $oldRow = $db->fetchOne('SELECT id FROM service_catalogue WHERE service_key = :ok LIMIT 1', ['ok' => $oldKey]);
            $newRow = $db->fetchOne('SELECT id FROM service_catalogue WHERE service_key = :nk LIMIT 1', ['nk' => $newKey]);
            if ($oldRow && !$newRow) {
                $db->execute(
                    'UPDATE service_catalogue SET service_key = :nk WHERE service_key = :ok',
                    ['nk' => $newKey, 'ok' => $oldKey]
                );
            } elseif ($oldRow && $newRow) {
                $db->execute('DELETE FROM service_catalogue WHERE service_key = :ok', ['ok' => $oldKey]);
            }
        }

        // 8. Seed / normalize all 15 NIN Modification + 1 BVN Modification catalog services
        // Only overwrite price/cost if column hasn't been manually edited (or ensure field_schema, required_fields,
        // required_documents, category_id, endpoint, processing_type, manual_label are always authoritative).
        $services = self::getCanonicalModificationCatalog();
        foreach ($services as $idx => $svc) {
            $existing = $db->fetchOne(
                'SELECT id, selling_price, wholesale_cost FROM service_catalogue WHERE service_key = :sk LIMIT 1',
                ['sk' => $svc['service_key']]
            );
            $rfJson = json_encode(array_column(array_filter($svc['field_schema'], fn($f) => !empty($f['required'])), 'name'));
            $schemaJson = json_encode($svc['field_schema']);
            $docsJson = json_encode($svc['required_documents']);

            if ($existing) {
                $db->execute(
                    'UPDATE service_catalogue SET
                        category_id = :cat,
                        name = :name,
                        description = :desc,
                        provider_id = "2sureverify",
                        endpoint = :ep,
                        wholesale_cost = :wcost,
                        required_fields = :rf,
                        slip_type_supported = 0,
                        processing_type = "manual",
                        manual_label = "Manual Processing",
                        estimated_turnaround = :turnaround,
                        required_documents = :docs,
                        field_schema = :fschema,
                        display_order = :ord,
                        updated_at = NOW()
                     WHERE service_key = :sk',
                    [
                        'cat'        => $svc['category_id'],
                        'name'       => $svc['name'],
                        'desc'       => $svc['description'],
                        'ep'         => $svc['endpoint'],
                        'wcost'      => $svc['wholesale_cost'],
                        'rf'         => $rfJson,
                        'turnaround' => $svc['estimated_turnaround'],
                        'docs'       => $docsJson,
                        'fschema'    => $schemaJson,
                        'ord'        => $idx + 1,
                        'sk'         => $svc['service_key'],
                    ]
                );
                // If existing selling_price is lower than corrected wholesale cost (e.g. second_nin_mod_* or bvn_modification), align price safely
                if ((float)$existing['selling_price'] <= 0 || (float)$existing['selling_price'] < (float)$svc['wholesale_cost']) {
                    $db->execute(
                        'UPDATE service_catalogue SET selling_price = :sp WHERE service_key = :sk',
                        ['sp' => $svc['selling_price'], 'sk' => $svc['service_key']]
                    );
                }
            } else {
                $db->execute(
                    'INSERT INTO service_catalogue
                     (id, category_id, service_key, name, description, provider_id, endpoint,
                      wholesale_cost, selling_price, required_fields, slip_type_supported,
                      processing_type, manual_label, estimated_turnaround, required_documents,
                      field_schema, display_order, is_active)
                     VALUES
                     (:id, :cat, :sk, :name, :desc, "2sureverify", :ep,
                      :wcost, :sp, :rf, 0,
                      "manual", "Manual Processing", :turnaround, :docs,
                      :fschema, :ord, 1)',
                    [
                        'id'         => 'svc_' . $svc['service_key'],
                        'cat'        => $svc['category_id'],
                        'sk'         => $svc['service_key'],
                        'name'       => $svc['name'],
                        'desc'       => $svc['description'],
                        'ep'         => $svc['endpoint'],
                        'wcost'      => $svc['wholesale_cost'],
                        'sp'         => $svc['selling_price'],
                        'rf'         => $rfJson,
                        'turnaround' => $svc['estimated_turnaround'],
                        'docs'       => $docsJson,
                        'fschema'    => $schemaJson,
                        'ord'        => $idx + 1,
                    ]
                );
            }
        }

        // Sync Second NIN auth default selling prices if they had stale wrong _pass pricing from earlier seed
        try {
            $db->execute(
                'UPDATE service_catalogue SET selling_price = 14500.00 WHERE service_key IN ("second_nin_mod_name_auth", "second_nin_mod_phone_auth") AND selling_price IN (20000.00, 36000.00)'
            );
        } catch (Throwable) {
        }

        self::$migrated = true;
    }

    /**
     * Exact Stage 3 Modification Catalogue mapped 1:1 against verified live 2SureVerify validators.
     */
    public static function getCanonicalModificationCatalog(): array
    {
        return [
            // =================================================================
            // CATEGORY 1: NIN MODIFICATION (cat_mod -> nin_modification)
            // =================================================================
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_mod_name',
                'name'                 => 'NIN Name Modification',
                'description'          => 'Correct spelling errors, rearrange sequence, or update First Name, Surname, or Middle Name on your NIMC National Identity record.',
                'endpoint'             => '/api/v1/nin_mod_name.php',
                'wholesale_cost'       => 4000.00,
                'selling_price'        => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days',
                'required_documents'   => [
                    ['key' => 'supporting_id', 'label' => 'Court Affidavit / Sworn Declaration or Valid Government ID (Optional/Recommended)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',         'label' => 'Current 11-Digit NIN', 'type' => 'nin',  'required' => true,  'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'first_name',  'label' => 'New First Name',       'type' => 'text', 'required' => true,  'placeholder' => 'Enter corrected first name'],
                    ['name' => 'last_name',   'label' => 'New Last Name / Surname', 'type' => 'text', 'required' => true, 'placeholder' => 'Enter corrected surname'],
                    ['name' => 'middle_name', 'label' => 'New Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'Enter middle name if applicable'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_mod_phone',
                'name'                 => 'NIN Phone Number Modification',
                'description'          => 'Update or replace the primary phone number linked to your NIMC NIN profile so alerts and verification requests match your active line.',
                'endpoint'             => '/api/v1/nin_mod_phone.php',
                'wholesale_cost'       => 4000.00,
                'selling_price'        => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days',
                'required_documents'   => [
                    ['key' => 'supporting_id', 'label' => 'NIN Slip / Valid ID Copy (Optional)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',   'label' => 'Current 11-Digit NIN',     'type' => 'nin',   'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'phone', 'label' => 'New 11-Digit Phone Number','type' => 'phone', 'required' => true, 'placeholder' => 'e.g. 08012345678'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_mod_address',
                'name'                 => 'NIN Address Modification',
                'description'          => 'Update your residential state, local government area, town, and street address stored on the NIMC National Identity database.',
                'endpoint'             => '/api/v1/nin_mod_address.php',
                'wholesale_cost'       => 4000.00,
                'selling_price'        => 6000.00,
                'estimated_turnaround' => '2 – 5 Business Days',
                'required_documents'   => [
                    ['key' => 'utility_bill', 'label' => 'Proof of Address / Utility Bill (Optional)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',     'label' => 'Current 11-Digit NIN',          'type' => 'nin',  'required' => true,  'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'state',   'label' => 'New State of Residence',        'type' => 'text', 'required' => true,  'placeholder' => 'e.g. Lagos'],
                    ['name' => 'town',    'label' => 'New Town / City',               'type' => 'text', 'required' => true,  'placeholder' => 'e.g. Ikeja'],
                    ['name' => 'lga',     'label' => 'Local Government Area (LGA)',   'type' => 'text', 'required' => false, 'placeholder' => 'e.g. Ikeja LGA'],
                    ['name' => 'address', 'label' => 'Street / Residential Address',  'type' => 'text', 'required' => false, 'placeholder' => 'Full street address'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_mod_name_phone',
                'name'                 => 'NIN Name & Phone Modification (Bundle)',
                'description'          => 'Combined correction request to update both your full legal name and linked mobile phone number on NIMC in one filing.',
                'endpoint'             => '/api/v1/nin_mod_name_phone.php',
                'wholesale_cost'       => 8000.00,
                'selling_price'        => 12000.00,
                'estimated_turnaround' => '3 – 5 Business Days',
                'required_documents'   => [
                    ['key' => 'supporting_id', 'label' => 'Affidavit / Valid ID Card (Optional)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',              'label' => 'Current 11-Digit NIN',         'type' => 'nin',   'required' => true,  'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'new_first_name',   'label' => 'New First Name',               'type' => 'text',  'required' => true,  'placeholder' => 'Corrected first name'],
                    ['name' => 'new_last_name',    'label' => 'New Last Name / Surname',      'type' => 'text',  'required' => true,  'placeholder' => 'Corrected surname'],
                    ['name' => 'new_middle_name',  'label' => 'New Middle Name (Optional)',   'type' => 'text',  'required' => false, 'placeholder' => 'Corrected middle name'],
                    ['name' => 'new_phone_number', 'label' => 'New 11-Digit Phone Number',    'type' => 'phone', 'required' => true,  'placeholder' => 'e.g. 08012345678'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_mod_dob',
                'name'                 => 'NIN Date of Birth (DOB) Modification',
                'description'          => 'Official NIMC Date of Birth correction requiring complete birth origin, educational level, and current residential biodata.',
                'endpoint'             => '/api/v1/nin_mod_dob.php',
                'wholesale_cost'       => 53000.00,
                'selling_price'        => 65000.00,
                'estimated_turnaround' => '5 – 14 Business Days',
                'required_documents'   => [
                    ['key' => 'birth_certificate', 'label' => 'NPC Birth Certificate or Age Declaration Affidavit (Recommended)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',              'label' => 'Current 11-Digit NIN',        'type' => 'nin',   'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'new_dob',          'label' => 'Correct Date of Birth',       'type' => 'date',  'required' => true],
                    ['name' => 'phone_number',     'label' => 'Active Phone Number',         'type' => 'phone', 'required' => true, 'placeholder' => 'e.g. 08012345678'],
                    ['name' => 'marital_status',   'label' => 'Marital Status',              'type' => 'select','required' => true, 'options' => ['Single', 'Married', 'Divorced', 'Widowed']],
                    ['name' => 'education_level',  'label' => 'Highest Education Level',     'type' => 'select','required' => true, 'options' => ['Primary', 'Secondary', 'OND/NCE', 'HND/BSc', 'Postgraduate', 'None']],
                    ['name' => 'birth_type',       'label' => 'Birth / Registration Type',   'type' => 'select','required' => true, 'options' => ['Hospital', 'Home', 'Clinic', 'Traditional']],
                    ['name' => 'place_of_birth',   'label' => 'Place of Birth (Hospital / Town)', 'type' => 'text', 'required' => true, 'placeholder' => 'e.g. General Hospital Ikeja'],
                    ['name' => 'state_of_birth',   'label' => 'State of Birth',              'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Lagos'],
                    ['name' => 'lga_of_birth',     'label' => 'LGA of Birth',                'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ikeja'],
                    ['name' => 'village_of_birth', 'label' => 'Village / Town of Birth',     'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ikeja'],
                    ['name' => 'state_of_origin',  'label' => 'State of Origin',             'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ogun'],
                    ['name' => 'lga_origin',       'label' => 'LGA of Origin',               'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Abeokuta South'],
                    ['name' => 'village_origin',   'label' => 'Village / Town of Origin',    'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ake'],
                    ['name' => 'resident_state',   'label' => 'State of Residence',          'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Lagos'],
                    ['name' => 'lga_resident',     'label' => 'LGA of Residence',            'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Alimosho'],
                    ['name' => 'village_resident', 'label' => 'Town / District of Residence','type' => 'text',  'required' => true, 'placeholder' => 'e.g. Egbeda'],
                    ['name' => 'resident_address', 'label' => 'Full Residential Address',    'type' => 'text',  'required' => true, 'placeholder' => 'House no., street name, area'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_mod_dob_name',
                'name'                 => 'NIN Name & Date of Birth Modification',
                'description'          => 'Simultaneous correction of Name and Date of Birth on your NIMC National Identity profile with full birth and residential details.',
                'endpoint'             => '/api/v1/nin_mod_dob_name.php',
                'wholesale_cost'       => 58000.00,
                'selling_price'        => 72000.00,
                'estimated_turnaround' => '5 – 14 Business Days',
                'required_documents'   => [
                    ['key' => 'birth_certificate', 'label' => 'Birth Certificate / Age Declaration Affidavit (Recommended)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',              'label' => 'Current 11-Digit NIN',      'type' => 'nin',   'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'new_first_name',   'label' => 'Corrected First Name',      'type' => 'text',  'required' => true, 'placeholder' => 'Enter corrected first name'],
                    ['name' => 'new_last_name',    'label' => 'Corrected Last Name',       'type' => 'text',  'required' => true, 'placeholder' => 'Enter corrected surname'],
                    ['name' => 'new_dob',          'label' => 'Corrected Date of Birth',   'type' => 'date',  'required' => true],
                    ['name' => 'phone_number',     'label' => 'Active Phone Number',       'type' => 'phone', 'required' => true, 'placeholder' => 'e.g. 08012345678'],
                    ['name' => 'state_of_origin',  'label' => 'State of Origin',           'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ogun'],
                    ['name' => 'lga',              'label' => 'LGA of Origin',             'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Abeokuta South'],
                    ['name' => 'village_town',     'label' => 'Village / Town of Origin',  'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ake'],
                    ['name' => 'place_of_birth',   'label' => 'Place of Birth',            'type' => 'text',  'required' => true, 'placeholder' => 'Hospital or town of birth'],
                    ['name' => 'state_of_birth',   'label' => 'State of Birth',            'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Lagos'],
                    ['name' => 'lga_of_birth',     'label' => 'LGA of Birth',              'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Ikeja'],
                    ['name' => 'resident_state',   'label' => 'State of Residence',        'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Lagos'],
                    ['name' => 'resident_lga',     'label' => 'LGA of Residence',          'type' => 'text',  'required' => true, 'placeholder' => 'e.g. Alimosho'],
                    ['name' => 'resident_address', 'label' => 'Full Residential Address',  'type' => 'text',  'required' => true, 'placeholder' => 'House no., street name'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'gender_modification',
                'name'                 => 'NIN Gender Modification',
                'description'          => 'Correct a mistakenly recorded Male or Female gender marker on your NIMC National Identity record.',
                'endpoint'             => '/api/v1/gender_modification.php',
                'wholesale_cost'       => 5000.00,
                'selling_price'        => 7500.00,
                'estimated_turnaround' => '2 – 5 Business Days',
                'required_documents'   => [],
                'field_schema'         => [
                    ['name' => 'nin',    'label' => 'Current 11-Digit NIN', 'type' => 'nin',    'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'gender', 'label' => 'Correct Gender',       'type' => 'select', 'required' => true, 'options' => ['Male', 'Female']],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'suspended_modification',
                'name'                 => 'Suspended NIN Modification',
                'description'          => 'Re-activate and update a suspended NIMC NIN profile using your core biodata and clear photograph.',
                'endpoint'             => '/api/v1/suspended_modification.php',
                'wholesale_cost'       => 23000.00,
                'selling_price'        => 30000.00,
                'estimated_turnaround' => '5 – 10 Business Days',
                'required_documents'   => [
                    ['key' => 'picture', 'label' => 'Recent Clear Passport / NIN Slip Photo (Required)', 'required' => true, 'accept' => '.jpg,.jpeg,.png,.webp'],
                ],
                'field_schema'         => [
                    ['name' => 'nin',        'label' => 'Suspended 11-Digit NIN', 'type' => 'nin',   'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'first_name', 'label' => 'First Name',             'type' => 'text',  'required' => true, 'placeholder' => 'Enter first name'],
                    ['name' => 'surname',    'label' => 'Surname',                'type' => 'text',  'required' => true, 'placeholder' => 'Enter surname'],
                    ['name' => 'dob',        'label' => 'Date of Birth',          'type' => 'date',  'required' => true],
                    ['name' => 'phone',      'label' => 'Phone Number',           'type' => 'phone', 'required' => true, 'placeholder' => 'e.g. 08012345678'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'bvn_generated_modification',
                'name'                 => 'BVN-Generated NIN Modification',
                'description'          => 'Fix or update a NIN profile that was auto-generated from BVN enrollment so it carries accurate personal identity records.',
                'endpoint'             => '/api/v1/bvn_generated_modification.php',
                'wholesale_cost'       => 22000.00,
                'selling_price'        => 28000.00,
                'estimated_turnaround' => '5 – 10 Business Days',
                'required_documents'   => [
                    ['key' => 'picture', 'label' => 'Clear Passport Photograph / Identity Photo (Required)', 'required' => true, 'accept' => '.jpg,.jpeg,.png,.webp'],
                ],
                'field_schema'         => [
                    ['name' => 'nin',        'label' => '11-Digit BVN-Generated NIN', 'type' => 'nin',   'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'bvn',        'label' => 'Linked 11-Digit BVN',        'type' => 'bvn',   'required' => true, 'placeholder' => 'e.g. 22123456789'],
                    ['name' => 'first_name', 'label' => 'First Name',                 'type' => 'text',  'required' => true, 'placeholder' => 'Enter first name'],
                    ['name' => 'surname',    'label' => 'Surname',                    'type' => 'text',  'required' => true, 'placeholder' => 'Enter surname'],
                    ['name' => 'dob',        'label' => 'Date of Birth',              'type' => 'date',  'required' => true],
                    ['name' => 'phone',      'label' => 'Phone Number',               'type' => 'phone', 'required' => true, 'placeholder' => 'e.g. 08012345678'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'child_modification',
                'name'                 => 'Child NIN Modification (Minor)',
                'description'          => 'Modify a minor/child NIN name, phone number, or residential address using parent or guardian NIN authorization.',
                'endpoint'             => '/api/v1/child_modification.php',
                'wholesale_cost'       => 13000.00,
                'selling_price'        => 18000.00,
                'estimated_turnaround' => '3 – 7 Business Days',
                'required_documents'   => [
                    ['key' => 'birth_cert', 'label' => 'Child Birth Certificate / Guardian Consent Note (Optional)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'sub_type',     'label' => 'Modification Sub-Type',    'type' => 'select', 'required' => true, 'options' => ['name', 'phone', 'address']],
                    ['name' => 'child_nin',    'label' => "Child's 11-Digit NIN",     'type' => 'nin',    'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'guardian_nin', 'label' => "Parent/Guardian's 11-Digit NIN", 'type' => 'nin', 'required' => true, 'placeholder' => 'e.g. 98765432109'],
                    ['name' => 'new_name',     'label' => 'New Full Name of Child',   'type' => 'text',   'required' => true, 'showWhen' => ['field' => 'sub_type', 'value' => 'name'], 'placeholder' => 'Full corrected name'],
                    ['name' => 'new_phone',    'label' => 'New 11-Digit Phone Number','type' => 'phone',  'required' => true, 'showWhen' => ['field' => 'sub_type', 'value' => 'phone'], 'placeholder' => 'e.g. 08012345678'],
                    ['name' => 'new_address',  'label' => 'New Residential Address',  'type' => 'text',   'required' => true, 'showWhen' => ['field' => 'sub_type', 'value' => 'address'], 'placeholder' => 'Full updated residential address'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'nin_over_age',
                'name'                 => 'NIN Over-Age Modification',
                'description'          => 'Age-bracket adjustment on a NIN record (5–9, 10–15, or 15–20 year correction tiers) with supporting facial photograph.',
                'endpoint'             => '/api/v1/nin_over_age.php',
                'wholesale_cost'       => 10000.00,
                'selling_price'        => 15000.00,
                'estimated_turnaround' => '5 – 10 Business Days',
                'required_documents'   => [
                    ['key' => 'picture', 'label' => 'Clear Applicant Photograph (Required)', 'required' => true, 'accept' => '.jpg,.jpeg,.png,.webp'],
                ],
                'field_schema'         => [
                    ['name' => 'age_range',  'label' => 'Age Difference Bracket', 'type' => 'select', 'required' => true, 'options' => ['5-9', '10-15', '15-20']],
                    ['name' => 'nin',        'label' => 'Current 11-Digit NIN',   'type' => 'nin',    'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'first_name', 'label' => 'First Name',             'type' => 'text',   'required' => true, 'placeholder' => 'Enter first name'],
                    ['name' => 'surname',    'label' => 'Surname',                'type' => 'text',   'required' => true, 'placeholder' => 'Enter surname'],
                    ['name' => 'phone',      'label' => 'Active Phone Number',    'type' => 'phone',  'required' => true, 'placeholder' => 'e.g. 08012345678'],
                    ['name' => 'dob',        'label' => 'Target Date of Birth',   'type' => 'date',   'required' => true],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'second_nin_mod_name',
                'name'                 => 'Second NIN Modification — Name (No Login Needed)',
                'description'          => 'Second-time NIN name correction when you no longer have access to the NIMC self-service portal email or password.',
                'endpoint'             => '/api/v1/second_nin_mod_name.php',
                'wholesale_cost'       => 70000.00,
                'selling_price'        => 85000.00,
                'estimated_turnaround' => '5 – 14 Business Days',
                'required_documents'   => [
                    ['key' => 'supporting_id', 'label' => 'Affidavit / Publication / ID Document (Optional)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'nin',         'label' => 'Current 11-Digit NIN',     'type' => 'nin',  'required' => true,  'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'first_name',  'label' => 'New First Name',           'type' => 'text', 'required' => true,  'placeholder' => 'Corrected first name'],
                    ['name' => 'surname',     'label' => 'New Surname',              'type' => 'text', 'required' => true,  'placeholder' => 'Corrected surname'],
                    ['name' => 'middle_name', 'label' => 'New Middle Name (Optional)', 'type' => 'text', 'required' => false, 'placeholder' => 'Optional middle name'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'second_nin_mod_phone',
                'name'                 => 'Second NIN Modification — Phone (No Login Needed)',
                'description'          => 'Second-time phone number update on NIN without requiring NIMC self-service portal email or password.',
                'endpoint'             => '/api/v1/second_nin_mod_phone.php',
                'wholesale_cost'       => 18000.00,
                'selling_price'        => 25000.00,
                'estimated_turnaround' => '3 – 7 Business Days',
                'required_documents'   => [],
                'field_schema'         => [
                    ['name' => 'nin',   'label' => 'Current 11-Digit NIN',      'type' => 'nin',   'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'phone', 'label' => 'New 11-Digit Phone Number', 'type' => 'phone', 'required' => true, 'placeholder' => 'e.g. 08012345678'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'second_nin_mod_name_auth',
                'name'                 => 'Second NIN Modification — Name (With Email & Password)',
                'description'          => 'Discounted second-time NIN name correction when you can provide your NIMC self-service login email and password.',
                'endpoint'             => '/api/v1/second_nin_mod_name_auth.php',
                'wholesale_cost'       => 10000.00,
                'selling_price'        => 14500.00,
                'estimated_turnaround' => '3 – 7 Business Days',
                'required_documents'   => [],
                'field_schema'         => [
                    ['name' => 'nin',         'label' => 'Current 11-Digit NIN',        'type' => 'nin',      'required' => true,  'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'first_name',  'label' => 'New First Name',              'type' => 'text',     'required' => true,  'placeholder' => 'Corrected first name'],
                    ['name' => 'surname',     'label' => 'New Surname',                 'type' => 'text',     'required' => true,  'placeholder' => 'Corrected surname'],
                    ['name' => 'middle_name', 'label' => 'New Middle Name (Optional)',  'type' => 'text',     'required' => false, 'placeholder' => 'Optional middle name'],
                    ['name' => 'address',     'label' => 'Residential Address',         'type' => 'text',     'required' => true,  'placeholder' => 'House no., street, city, state'],
                    ['name' => 'email',       'label' => 'NIMC Portal Login Email',     'type' => 'email',    'required' => true,  'placeholder' => 'Portal email address'],
                    ['name' => 'password',    'label' => 'NIMC Portal Password',        'type' => 'password', 'required' => true,  'placeholder' => 'Portal password'],
                ],
            ],
            [
                'category_id'          => 'cat_mod',
                'service_key'          => 'second_nin_mod_phone_auth',
                'name'                 => 'Second NIN Modification — Phone (With Email & Password)',
                'description'          => 'Discounted second-time NIN phone number update using your active NIMC self-service login email and password.',
                'endpoint'             => '/api/v1/second_nin_mod_phone_auth.php',
                'wholesale_cost'       => 10000.00,
                'selling_price'        => 14500.00,
                'estimated_turnaround' => '3 – 7 Business Days',
                'required_documents'   => [],
                'field_schema'         => [
                    ['name' => 'nin',      'label' => 'Current 11-Digit NIN',      'type' => 'nin',      'required' => true, 'placeholder' => 'e.g. 12345678901'],
                    ['name' => 'phone',    'label' => 'New 11-Digit Phone Number', 'type' => 'phone',    'required' => true, 'placeholder' => 'e.g. 08012345678'],
                    ['name' => 'address',  'label' => 'Residential Address',       'type' => 'text',     'required' => true, 'placeholder' => 'House no., street, city, state'],
                    ['name' => 'email',    'label' => 'NIMC Portal Login Email',   'type' => 'email',    'required' => true, 'placeholder' => 'Portal email address'],
                    ['name' => 'password', 'label' => 'NIMC Portal Password',      'type' => 'password', 'required' => true, 'placeholder' => 'Portal password'],
                ],
            ],

            // =================================================================
            // CATEGORY 2: BVN MODIFICATION (cat_bvn_mod -> bvn_modification)
            // =================================================================
            [
                'category_id'          => 'cat_bvn_mod',
                'service_key'          => 'bvn_modification',
                'name'                 => 'BVN Modification Request',
                'description'          => 'Official Bank Verification Number (BVN) update for Name, Phone Number, Residential Address, or Date of Birth, routed by enrollment bank or agency.',
                'endpoint'             => '/api/v1/bvn_modification.php',
                'wholesale_cost'       => 14000.00,
                'selling_price'        => 17500.00,
                'estimated_turnaround' => '3 – 10 Business Days',
                'required_documents'   => [
                    ['key' => 'bvn_supporting_doc', 'label' => 'Valid ID / Bank Slip / Affidavit (Recommended)', 'required' => false],
                ],
                'field_schema'         => [
                    ['name' => 'method',          'label' => 'BVN Modification Type',      'type' => 'select', 'required' => true, 'options' => ['name', 'phone', 'address', 'dob']],
                    ['name' => 'enrollment_type', 'label' => 'Enrollment Bank / Channel',  'type' => 'bank_select', 'required' => true],
                    ['name' => 'bvn',             'label' => 'Current 11-Digit BVN',       'type' => 'bvn',    'required' => true, 'placeholder' => 'e.g. 22123456789'],
                    ['name' => 'first_name',      'label' => 'New First Name',             'type' => 'text',   'required' => true,  'showWhen' => ['field' => 'method', 'value' => 'name'], 'placeholder' => 'Corrected first name'],
                    ['name' => 'last_name',       'label' => 'New Last Name / Surname',    'type' => 'text',   'required' => true,  'showWhen' => ['field' => 'method', 'value' => 'name'], 'placeholder' => 'Corrected last name'],
                    ['name' => 'middle_name',     'label' => 'New Middle Name (Optional)', 'type' => 'text',   'required' => false, 'showWhen' => ['field' => 'method', 'value' => 'name'], 'placeholder' => 'Middle name if any'],
                    ['name' => 'phone',           'label' => 'New 11-Digit Phone Number',  'type' => 'phone',  'required' => true,  'showWhen' => ['field' => 'method', 'value' => 'phone'], 'placeholder' => 'e.g. 08012345678'],
                    ['name' => 'address_line1',   'label' => 'New Residential Address',    'type' => 'text',   'required' => true,  'showWhen' => ['field' => 'method', 'value' => 'address'], 'placeholder' => 'Street address line'],
                    ['name' => 'state',           'label' => 'State of Residence',         'type' => 'text',   'required' => true,  'showWhen' => ['field' => 'method', 'value' => 'address'], 'placeholder' => 'e.g. Lagos'],
                    ['name' => 'date_of_birth',   'label' => 'Correct Date of Birth',      'type' => 'date',   'required' => true,  'showWhen' => ['field' => 'method', 'value' => 'dob']],
                ],
            ],
        ];
    }
}
