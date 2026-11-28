<?php
/**
 * @file VerificationController.php
 * Sovereign Identity Verification & Modification Controller
 * Supports Veripine and 2SureVerify Providers with atomic debit, honest provider checks & auto-refund
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Exception;
use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Core\SchemaSync;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Services\ResultDocumentService;
use HambakTech\Services\FulfilmentRouterService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;
use HambakTech\Adapters\Verification\VeripineAdapter;

class VerificationController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    public static function ensureSlipSchemaAndDefaults(Database $db): void
    {
        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS slip_templates (
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
                    watermark_text VARCHAR(100) DEFAULT "SAMPLE SPECIMEN",
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            $cols = [
                'slip_code' => 'ADD COLUMN slip_code VARCHAR(64) NULL AFTER id',
                'price' => 'ADD COLUMN price DECIMAL(15, 2) NULL AFTER category',
                'is_recommended' => 'ADD COLUMN is_recommended TINYINT(1) NOT NULL DEFAULT 0 AFTER display_order',
                'watermark_text' => 'ADD COLUMN watermark_text VARCHAR(100) DEFAULT "SAMPLE SPECIMEN"',
            ];
            foreach ($cols as $col => $clause) {
                $exists = $db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "slip_templates" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $db->execute("ALTER TABLE slip_templates {$clause}");
                }
            }

            $idempExists = $db->fetchOne(
                'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "verification_records" AND COLUMN_NAME = "idempotency_key"'
            );
            if (!$idempExists) {
                $db->execute('ALTER TABLE verification_records ADD COLUMN idempotency_key VARCHAR(120) NULL AFTER has_slip');
            }

            $canonicalCount = $db->fetchOne(
                'SELECT COUNT(*) as cnt FROM slip_templates WHERE category = "NIN" AND slip_code IN ("ninBasic", "ninRegular", "ninStandard", "ninPremium", "ninVnin")'
            );
            if ((int)($canonicalCount['cnt'] ?? 0) === 0) {
                // Remove old unconfigured placeholder NIN slips once when migrating to the 5 canonical NIN slip formats
                $db->execute(
                    'DELETE FROM slip_templates WHERE id IN ("tpl_nin_long", "tpl_nin_plastic", "tpl_nin_improved") AND (slip_code IS NULL OR slip_code = "")'
                );

                $ninDefaults = [
                    [
                        'id' => 'tpl_nin_basic',
                        'slip_code' => 'ninBasic',
                        'name' => 'Basic Slip',
                        'category' => 'NIN',
                        'price' => 200.00,
                        'demo_image_url' => '/assets/aistudio/IMG_0486_66e12609.jpeg',
                        'description' => 'Essential NIN verification layout showing core biodata details, verified photograph, and transaction reference.',
                        'supported_service' => 'all_nin',
                        'is_active' => 1,
                        'display_order' => 1,
                        'is_recommended' => 0,
                        'badge' => null,
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_nin_regular',
                        'slip_code' => 'ninRegular',
                        'name' => 'Regular Slip',
                        'category' => 'NIN',
                        'price' => 200.00,
                        'demo_image_url' => '/assets/aistudio/IMG_0485_9e5b9616.png',
                        'description' => 'Standard full-page verification report displaying complete citizen details, photograph, and tracking details.',
                        'supported_service' => 'all_nin',
                        'is_active' => 1,
                        'display_order' => 2,
                        'is_recommended' => 0,
                        'badge' => null,
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_nin_standard',
                        'slip_code' => 'ninStandard',
                        'name' => 'Standard Slip',
                        'category' => 'NIN',
                        'price' => 200.00,
                        'demo_image_url' => '/assets/aistudio/IMG_0483_23e1a1e1.png',
                        'description' => 'Long-form standard verification layout with full demographic attributes, residential info, and QR reference.',
                        'supported_service' => 'all_nin',
                        'is_active' => 1,
                        'display_order' => 3,
                        'is_recommended' => 1,
                        'badge' => 'Recommended',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_nin_premium',
                        'slip_code' => 'ninPremium',
                        'name' => 'Premium Slip',
                        'category' => 'NIN',
                        'price' => 250.00,
                        'demo_image_url' => '/assets/aistudio/IMG_0484_0fb633df.png',
                        'description' => 'High-clarity compact card layout with verified photograph, structured biodata, and QR verification tag.',
                        'supported_service' => 'all_nin',
                        'is_active' => 1,
                        'display_order' => 4,
                        'is_recommended' => 0,
                        'badge' => 'Premium Card',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_nin_vnin',
                        'slip_code' => 'ninVnin',
                        'name' => 'VNIN Slip',
                        'category' => 'NIN',
                        'price' => 250.00,
                        'demo_image_url' => '/assets/aistudio/IMG_0483_23e1a1e1.png',
                        'description' => 'Virtual NIN verification slip format tailored for institutional onboarding and third-party KYC compliance.',
                        'supported_service' => 'all_nin',
                        'is_active' => 1,
                        'display_order' => 5,
                        'is_recommended' => 0,
                        'badge' => 'Virtual NIN',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_nin_special',
                        'slip_code' => 'ninSpecial',
                        'name' => 'Special Slip',
                        'category' => 'NIN',
                        'price' => 550.00,
                        'demo_image_url' => '/assets/aistudio/IMG_0603_1ff5c6a0.jpeg',
                        'description' => 'Official Special NIN Slip PDF issued via 2SureVerify.',
                        'supported_service' => 'all_nin',
                        'is_active' => 1,
                        'display_order' => 6,
                        'is_recommended' => 0,
                        'badge' => 'Special Slip',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                ];

                foreach ($ninDefaults as $d) {
                    $db->execute(
                        'INSERT IGNORE INTO slip_templates
                         (id, slip_code, name, category, price, demo_image_url, description, supported_service, is_active, display_order, is_recommended, badge, watermark_text)
                         VALUES (:id, :slip_code, :name, :category, :price, :demo_image_url, :description, :supported_service, :is_active, :display_order, :is_recommended, :badge, :watermark_text)',
                        $d
                    );
                }
            }

            // Guarantee ninSpecial exists non-destructively even on pre-seeded databases
            $specialExists = $db->fetchOne(
                'SELECT id FROM slip_templates WHERE LOWER(slip_code) = "ninspecial" OR id = "tpl_nin_special" LIMIT 1'
            );
            if (!$specialExists) {
                $db->execute(
                    'INSERT IGNORE INTO slip_templates
                     (id, slip_code, name, category, price, demo_image_url, description, supported_service, is_active, display_order, is_recommended, badge, watermark_text)
                     VALUES ("tpl_nin_special", "ninSpecial", "Special Slip", "NIN", 550.00, "/assets/aistudio/IMG_0603_1ff5c6a0.jpeg", "Official Special NIN Slip PDF issued via 2SureVerify.", "all_nin", 1, 6, 0, "Special Slip", "SAMPLE SPECIMEN")'
                );
            }

            // Seed canonical BVN Slip Templates (BVN Basic, Advanced Stamp, Plastic BVN, Bank BVN)
            $bvnCanonicalCount = $db->fetchOne(
                'SELECT COUNT(*) as cnt FROM slip_templates WHERE category = "BVN" AND slip_code IN ("bvnBasic", "bvnAdvanced", "plasticBvn", "bankBvn")'
            );
            if ((int)($bvnCanonicalCount['cnt'] ?? 0) === 0) {
                $db->execute(
                    'DELETE FROM slip_templates WHERE id IN ("tpl_bvn_standard", "tpl_bvn_plastic") AND (slip_code IS NULL OR slip_code = "")'
                );

                $bvnDefaults = [
                    [
                        'id' => 'tpl_bvn_basic',
                        'slip_code' => 'bvnBasic',
                        'name' => 'BVN Basic',
                        'category' => 'BVN',
                        'price' => 250.00,
                        'demo_image_url' => '/assets/slips/bvn_basic.jpg',
                        'description' => 'Essential CBN BVN verification slip showing verified full name, 11-digit BVN, portrait photograph, phone number, and date of birth.',
                        'supported_service' => 'all_bvn',
                        'is_active' => 1,
                        'display_order' => 1,
                        'is_recommended' => 0,
                        'badge' => null,
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_bvn_advanced',
                        'slip_code' => 'bvnAdvanced',
                        'name' => 'Advanced Stamp',
                        'category' => 'BVN',
                        'price' => 300.00,
                        'demo_image_url' => '/assets/slips/bvn_advanced.jpg',
                        'description' => 'Stamped NIBSS BVN verification report featuring QR authentication badge, full demographic records, enrollment details, and compliance seal.',
                        'supported_service' => 'all_bvn',
                        'is_active' => 1,
                        'display_order' => 2,
                        'is_recommended' => 1,
                        'badge' => 'Recommended',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_bvn_plastic_card',
                        'slip_code' => 'plasticBvn',
                        'name' => 'Plastic BVN',
                        'category' => 'BVN',
                        'price' => 350.00,
                        'demo_image_url' => '/assets/slips/bvn_plastic.jpg',
                        'description' => 'Compact biometric plastic BVN card layout with portrait photo, CBN security pattern, and scannable verification QR code.',
                        'supported_service' => 'all_bvn',
                        'is_active' => 1,
                        'display_order' => 3,
                        'is_recommended' => 0,
                        'badge' => 'Plastic Card',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                    [
                        'id' => 'tpl_bvn_bank',
                        'slip_code' => 'bankBvn',
                        'name' => 'Bank BVN',
                        'category' => 'BVN',
                        'price' => 300.00,
                        'demo_image_url' => '/assets/slips/bvn_bank.jpg',
                        'description' => 'Formal institutional Bank BVN verification certificate formatted for commercial bank onboarding, corporate KYC, and audit compliance.',
                        'supported_service' => 'all_bvn',
                        'is_active' => 1,
                        'display_order' => 4,
                        'is_recommended' => 0,
                        'badge' => 'Bank Format',
                        'watermark_text' => 'SAMPLE SPECIMEN',
                    ],
                ];

                foreach ($bvnDefaults as $bd) {
                    $db->execute(
                        'INSERT IGNORE INTO slip_templates
                         (id, slip_code, name, category, price, demo_image_url, description, supported_service, is_active, display_order, is_recommended, badge, watermark_text)
                         VALUES (:id, :slip_code, :name, :category, :price, :demo_image_url, :description, :supported_service, :is_active, :display_order, :is_recommended, :badge, :watermark_text)',
                        $bd
                    );
                }
            }

            // Ensure demo_v1 supports slip_type selection seamlessly inside NIN Verification
            $db->execute(
                'UPDATE service_catalogue
                 SET slip_type_supported = 1,
                     required_fields = :rf
                 WHERE service_key = "demo_v1" AND slip_type_supported = 0',
                ['rf' => '["firstname", "lastname", "dob", "gender", "slip_type"]']
            );

            // Ensure bvn_retrieval includes first_name, last_name, phone, and slip_type required by provider
            $db->execute(
                'UPDATE service_catalogue
                 SET slip_type_supported = 1,
                     required_fields = :rf
                 WHERE service_key = "bvn_retrieval"
                   AND routing_updated_at IS NULL
                   AND COALESCE(fulfilment_mode, "") <> "internal_manual"',
                ['rf' => '["first_name", "last_name", "phone", "slip_type"]']
            );
        } catch (Throwable $e) {
            error_log('[Slip Schema/Seed Notice]: ' . $e->getMessage());
        }
    }

    public static function formatSlipRow(array $row): array
    {
        $row['is_active'] = (bool)($row['is_active'] ?? true);
        $row['display_order'] = (int)($row['display_order'] ?? 1);
        $row['is_recommended'] = (bool)($row['is_recommended'] ?? false);
        $row['price'] = isset($row['price']) && $row['price'] !== null ? (float)$row['price'] : null;
        return $row;
    }

    private function resolveActiveProviderId(?string $serviceProvider = null): string
    {
        try {
            $setting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_verification_provider"');
            if ($setting && !empty($setting['setting_value'])) {
                $val = strtolower(trim((string)$setting['setting_value']));
                if (in_array($val, ['2sureverify', 'veripine'], true)) {
                    $provRow = $this->db->fetchOne('SELECT is_active FROM providers WHERE id = :id LIMIT 1', ['id' => $val]);
                    if (!$provRow || (bool)$provRow['is_active']) {
                        return $val;
                    }
                }
            }
            $defaultRow = $this->db->fetchOne('SELECT id FROM providers WHERE provider_type IN ("identity", "verification") AND is_default = 1 AND is_active = 1 LIMIT 1');
            if ($defaultRow && !empty($defaultRow['id'])) {
                return strtolower((string)$defaultRow['id']);
            }
        } catch (Throwable) {
        }
        if (!empty($serviceProvider) && in_array(strtolower($serviceProvider), ['2sureverify', 'veripine'], true)) {
            return strtolower($serviceProvider);
        }
        return '2sureverify';
    }

    private function resolveProviderChain(string $categoryKey, ?string $serviceProvider = null): array
    {
        $settings = [];
        try {
            $rows = $this->db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("active_verification_provider", "bvn_primary_provider", "bvn_fallback_provider", "bvn_auto_fallback", "identity_auto_fallback", "provider_integration_settings")'
            );
            foreach ($rows as $r) {
                $settings[$r['setting_key']] = (string)$r['setting_value'];
            }
        } catch (Throwable) {
        }

        $integ = !empty($settings['provider_integration_settings'])
            ? (json_decode($settings['provider_integration_settings'], true) ?: [])
            : [];

        $activeMap = ['2sureverify' => true, 'veripine' => true];
        try {
            $provRows = $this->db->fetchAll('SELECT id, is_active FROM providers WHERE id IN ("2sureverify", "veripine")');
            foreach ($provRows as $pr) {
                $activeMap[strtolower((string)$pr['id'])] = (bool)$pr['is_active'];
            }
        } catch (Throwable) {
        }

        $twoSure = new TwoSureVerifyAdapter();
        $veripine = new VeripineAdapter();
        $adapters = [
            '2sureverify' => $twoSure,
            'veripine' => $veripine,
        ];
        $usable = [
            '2sureverify' => $activeMap['2sureverify'] && $twoSure->hasCredentials(),
            'veripine' => $activeMap['veripine'] && $veripine->hasCredentials(),
        ];

        $isBvn = ($categoryKey === 'bvn_verification');
        if ($isBvn) {
            $primary = strtolower(trim((string)($settings['bvn_primary_provider'] ?? '')));
            if (!in_array($primary, ['2sureverify', 'veripine'], true)) {
                $primary = !empty($serviceProvider) && in_array(strtolower($serviceProvider), ['2sureverify', 'veripine'], true)
                    ? strtolower($serviceProvider)
                    : $this->resolveActiveProviderId($serviceProvider);
            }
            $autoFallbackRaw = $settings['bvn_auto_fallback'] ?? ($integ['auto_failover_enabled'] ?? '1');
            $autoFallback = filter_var($autoFallbackRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $autoFallback = $autoFallback === null ? true : $autoFallback;
            $fallback = strtolower(trim((string)($settings['bvn_fallback_provider'] ?? ($primary === '2sureverify' ? 'veripine' : '2sureverify'))));
        } else {
            $primary = $this->resolveActiveProviderId($serviceProvider);
            $autoFallbackRaw = $settings['identity_auto_fallback'] ?? ($integ['auto_failover_enabled'] ?? '1');
            $autoFallback = filter_var($autoFallbackRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $autoFallback = $autoFallback === null ? true : $autoFallback;
            $fallback = strtolower(trim((string)($integ['fallback_identity_provider'] ?? ($primary === '2sureverify' ? 'veripine' : '2sureverify'))));
        }

        $chain = [];
        if (isset($adapters[$primary]) && !empty($usable[$primary])) {
            $chain[] = $primary;
        }
        if ($autoFallback && $fallback !== 'none' && isset($adapters[$fallback]) && !empty($usable[$fallback]) && !in_array($fallback, $chain, true)) {
            $chain[] = $fallback;
        }
        // If configured primary is unconfigured/inactive, fall back to any active configured identity adapter
        if (empty($chain)) {
            foreach (['2sureverify', 'veripine'] as $cand) {
                if (!empty($usable[$cand])) {
                    $chain[] = $cand;
                }
            }
        }

        return [
            'chain' => $chain,
            'adapters' => $adapters,
        ];
    }

    private function mapCategoryKey(string $categoryName): string
    {
        $c = strtolower(trim($categoryName));
        if (str_contains($c, 'bvn') && str_contains($c, 'mod')) return 'bvn_modification';
        if (str_contains($c, 'bvn')) return 'bvn_verification';
        if (str_contains($c, 'mod')) return 'nin_modification';
        if (str_contains($c, 'enrol')) return 'enrolment';
        if (str_contains($c, 'add') || str_contains($c, 'ipe') || str_contains($c, 'clearance') || str_contains($c, 'personal')) {
            return 'additional_services';
        }
        return 'nin_verification';
    }

    private function extractNormalizedIdentity(array $providerResult, bool $isBvnContext = false, bool $isNinContext = false): array
    {
        $raw = $providerResult['data'] ?? $providerResult;
        if (isset($raw['user_data']) && is_array($raw['user_data'])) {
            $nested = $raw['user_data'];
            $merged = array_merge($raw, $nested);
        } elseif (isset($raw['data']) && is_array($raw['data'])) {
            $merged = array_merge($raw, $raw['data']);
        } else {
            $merged = is_array($raw) ? $raw : [];
        }

        // Preserve original returned keys, normalize aliases only when present (never fabricate defaults)
        $first = $merged['firstname'] ?? $merged['firstName'] ?? $merged['first_name'] ?? null;
        $middle = $merged['middlename'] ?? $merged['middleName'] ?? $merged['middle_name'] ?? null;
        $surname = $merged['surname'] ?? $merged['lastName'] ?? $merged['last_name'] ?? $merged['lastname'] ?? null;
        $nin = $merged['nin'] ?? $merged['NIN'] ?? null;
        $bvn = $merged['bvn'] ?? $merged['BVN'] ?? ($isBvnContext ? ($merged['idNumber'] ?? null) : null);
        $dob = $merged['birthdate'] ?? $merged['birthDate'] ?? $merged['dateOfBirth'] ?? $merged['date_of_birth'] ?? $merged['dob'] ?? null;
        $gender = $merged['gender'] ?? $merged['sex'] ?? null;
        $phone = $merged['telephoneno']
            ?? $merged['telephoneNo']
            ?? $merged['phone']
            ?? $merged['phoneNumber']
            ?? $merged['phoneNumber1']
            ?? $merged['phone_number']
            ?? $merged['phone_number_1']
            ?? null;
        $address = $merged['address']
            ?? $merged['residence_address']
            ?? $merged['residential_address']
            ?? $merged['residentialAddress']
            ?? $merged['residence_AdressLine1']
            ?? null;
        $state = $merged['residence_state']
            ?? $merged['state_of_residence']
            ?? $merged['stateOfResidence']
            ?? $merged['state']
            ?? $merged['state_of_origin']
            ?? $merged['stateOfOrigin']
            ?? null;
        $lga = $merged['residence_lga']
            ?? $merged['lga_of_residence']
            ?? $merged['lgaOfResidence']
            ?? $merged['lga']
            ?? $merged['lga_of_origin']
            ?? $merged['lgaOfOrigin']
            ?? null;
        $nationality = $merged['nationality'] ?? $merged['birthcountry'] ?? $merged['country'] ?? null;
        $tracking = $merged['tracking_id'] ?? $merged['trackingId'] ?? null;
        $photo = $merged['photo'] ?? $merged['base64Image'] ?? $merged['image'] ?? $merged['avatar'] ?? null;

        if (is_string($photo) && trim($photo) !== '') {
            $photo = trim($photo);
            $isUrlOrAsset = str_starts_with($photo, 'data:')
                || str_starts_with($photo, 'http://')
                || str_starts_with($photo, 'https://')
                || str_starts_with($photo, '/assets/')
                || str_starts_with($photo, '/uploads/');
            if (!$isUrlOrAsset) {
                $mime = str_starts_with($photo, 'iVBOR') ? 'image/png' : 'image/jpeg';
                $photo = "data:{$mime};base64," . $photo;
            }
        } else {
            $photo = null;
        }

        if ($first !== null) $merged['firstname'] = (string)$first;
        if ($middle !== null) $merged['middlename'] = (string)$middle;
        if ($surname !== null) $merged['surname'] = (string)$surname;
        if ($nin !== null) $merged['nin'] = (string)$nin;
        if ($bvn !== null) $merged['bvn'] = (string)$bvn;
        if ($dob !== null) $merged['birthdate'] = (string)$dob;
        if ($gender !== null) $merged['gender'] = (string)$gender;
        if ($phone !== null) $merged['telephoneno'] = (string)$phone;
        if ($address !== null) $merged['address'] = (string)$address;
        if ($state !== null) $merged['residence_state'] = (string)$state;
        if ($lga !== null) $merged['residence_lga'] = (string)$lga;
        if ($nationality !== null && $nationality !== '') $merged['nationality'] = (string)$nationality;
        if ($tracking !== null) $merged['tracking_id'] = (string)$tracking;
        if ($photo !== null) $merged['photo'] = $photo;

        // Normalize BVN-specific metadata when present
        $enrollmentBank = $merged['enrollmentBank'] ?? $merged['enrollment_bank'] ?? null;
        $enrollmentBranch = $merged['enrollmentBranch'] ?? $merged['enrollment_branch'] ?? null;
        $watchListed = $merged['watchListed'] ?? $merged['watchlisted'] ?? null;
        $levelOfAccount = $merged['levelOfAccount'] ?? $merged['level_of_account'] ?? null;
        $maritalStatus = $merged['maritalStatus'] ?? $merged['marital_status'] ?? null;
        $email = $merged['email'] ?? null;
        $nameOnCard = $merged['nameOnCard'] ?? $merged['name_on_card'] ?? null;
        $regDate = $merged['registrationDate'] ?? $merged['registration_date'] ?? null;

        if ($enrollmentBank !== null && $enrollmentBank !== '') $merged['enrollment_bank'] = (string)$enrollmentBank;
        if ($enrollmentBranch !== null && $enrollmentBranch !== '') $merged['enrollment_branch'] = (string)$enrollmentBranch;
        if ($watchListed !== null && $watchListed !== '') $merged['watch_listed'] = (string)$watchListed;
        if ($levelOfAccount !== null && $levelOfAccount !== '') $merged['level_of_account'] = (string)$levelOfAccount;
        if ($maritalStatus !== null && $maritalStatus !== '') $merged['marital_status'] = (string)$maritalStatus;
        if ($email !== null && $email !== '') $merged['email'] = (string)$email;
        if ($nameOnCard !== null && $nameOnCard !== '') $merged['name_on_card'] = (string)$nameOnCard;
        if ($regDate !== null && $regDate !== '') $merged['registration_date'] = (string)$regDate;

        if (!empty($providerResult['pdf_base64']) && empty($merged['pdf_base64'])) {
            $merged['pdf_base64'] = $providerResult['pdf_base64'];
        }
        if (!empty($providerResult['pdf_url']) && empty($merged['pdf_url'])) {
            $merged['pdf_url'] = $providerResult['pdf_url'];
        }

        unset($merged['user_data']);
        return $this->stripCrossTypeFields($merged, $isBvnContext, $isNinContext);
    }

    private function stripCrossTypeFields(array $data, bool $isBvnContext, bool $isNinContext): array
    {
        if ($isBvnContext) {
            // BVN lookups must return BVN data only and NEVER expose echoed/bogus NIN fields
            unset($data['nin'], $data['NIN'], $data['tracking_id'], $data['trackingId']);
        } elseif ($isNinContext) {
            // NIN lookups must stay strictly separated from BVN banking fields
            unset(
                $data['bvn'],
                $data['BVN'],
                $data['enrollment_bank'],
                $data['enrollmentBank'],
                $data['enrollment_branch'],
                $data['enrollmentBranch'],
                $data['level_of_account'],
                $data['levelOfAccount'],
                $data['watch_listed'],
                $data['watchListed'],
                $data['watchlisted'],
                $data['name_on_card'],
                $data['nameOnCard'],
                $data['registration_date'],
                $data['registrationDate']
            );
        }
        return $data;
    }

    private function detectRecordDomain(string $serviceKey = '', string $type = ''): array
    {
        $sk = strtolower(trim($serviceKey));
        $tp = strtolower(trim($type));
        $isBvn = str_starts_with($sk, 'bvn') || $tp === 'bvn' || str_contains($tp, 'bvn');
        $isNin = !$isBvn && (
            str_starts_with($sk, 'nin_')
            || str_starts_with($sk, 'phone_')
            || str_starts_with($sk, 'demo_')
            || $sk === 'vnin_verification'
            || in_array($tp, ['nin', 'phone', 'demo', 'nin_verification'], true)
        );
        return [$isBvn, $isNin];
    }

    private function hasSubstantiveIdentityData(array $resultData, bool $isBvn = false): bool
    {
        $st = strtolower(trim((string)($resultData['status'] ?? '')));
        if (in_array($st, ['failed', 'error', 'not_found', 'no_record', 'rejected'], true)) {
            return false;
        }
        $candidateKeys = $isBvn
            ? ['firstname', 'middlename', 'surname', 'full_name', 'name_on_card', 'bvn', 'photo', 'pdf_base64', 'pdf_url']
            : ['firstname', 'middlename', 'surname', 'full_name', 'name_on_card', 'nin', 'bvn', 'photo', 'pdf_base64', 'pdf_url'];
        foreach ($candidateKeys as $k) {
            if (!empty($resultData[$k]) && is_string($resultData[$k])) {
                $v = strtolower(trim($resultData[$k]));
                if ($v !== '' && $v !== 'null' && $v !== 'undefined' && $v !== 'n/a') {
                    return true;
                }
            }
        }
        return false;
    }

    private function sanitizeCustomerError(string $message): string
    {
        return Security::sanitizeCustomerError($message);
    }

    private function sanitizeResultForCustomer(array $data, string $serviceKey = '', string $type = ''): array
    {
        unset(
            $data['provider'],
            $data['provider_id'],
            $data['provider_cost'],
            $data['wholesale_cost'],
            $data['raw_error'],
            $data['raw'],
            $data['raw_response'],
            $data['provider_response'],
            $data['integrity_error'],
            $data['endpoint'],
            $data['api_url'],
            $data['api_key'],
            $data['amount_charged'],
            $data['balance_before'],
            $data['balance_after'],
            $data['wallet_balance'],
            $data['provider_balance'],
            $data['commission'],
            $data['charge'],
            $data['trace'],
            $data['stack']
        );
        if (!empty($data['error']) && is_string($data['error'])) {
            $data['error'] = Security::sanitizeCustomerError($data['error'], Security::ERR_PROVIDER_UNAVAILABLE);
        }
        [$isBvn, $isNin] = $this->detectRecordDomain($serviceKey, $type);
        $data = $this->stripCrossTypeFields($data, $isBvn, $isNin);
        if (!empty($data['photo']) && is_string($data['photo'])) {
            $p = trim($data['photo']);
            $isUrlOrAsset = str_starts_with($p, 'data:')
                || str_starts_with($p, 'http://')
                || str_starts_with($p, 'https://')
                || str_starts_with($p, '/assets/')
                || str_starts_with($p, '/uploads/');
            if ($p !== '' && !$isUrlOrAsset) {
                $mime = str_starts_with($p, 'iVBOR') ? 'image/png' : 'image/jpeg';
                $data['photo'] = "data:{$mime};base64," . $p;
            }
        }
        return $data;
    }

    public function services(Request $request): void
    {
        self::ensureSlipSchemaAndDefaults($this->db);
        SchemaSync::syncModificationCatalog($this->db);
        SchemaSync::syncEnrolmentCatalog($this->db);
        SchemaSync::syncAdditionalServicesCatalog($this->db);

        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $activeProvider = $this->resolveActiveProviderId();

        if ($isAdmin) {
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.wholesale_cost, s.internal_fulfilment_cost,
                        s.selling_price, s.provider_id as provider, s.endpoint, s.is_active as enabled,
                        s.required_fields, s.slip_type_supported, s.fulfilment_mode, s.sla_hours,
                        s.processing_type, s.manual_label, s.estimated_turnaround,
                        c.name as category_name, c.code as category_code
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
        } else {
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.selling_price,
                        s.is_active as enabled, s.required_fields, s.slip_type_supported,
                        s.fulfilment_mode, s.sla_hours, s.processing_type, s.manual_label, s.estimated_turnaround,
                        c.name as category_name, c.code as category_code
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
        }

        $categories = [
            'nin_verification' => [],
            'bvn_verification' => [],
            'nin_modification' => [],
            'bvn_modification' => [],
            'enrolment' => [],
            'additional_services' => [],
        ];

        foreach ($rows as &$r) {
            $r['selling_price'] = (float)$r['selling_price'];
            $r['price'] = $r['selling_price'];
            $r['enabled'] = (bool)$r['enabled'];
            $r['slip_type_supported'] = (bool)$r['slip_type_supported'];
            $r['fulfilment_mode'] = (string)($r['fulfilment_mode'] ?? 'provider_instant');
            $r['sla_hours'] = isset($r['sla_hours']) && $r['sla_hours'] !== null ? (int)$r['sla_hours'] : null;
            if ($isAdmin) {
                $r['wholesale_cost'] = (float)$r['wholesale_cost'];
                $r['internal_fulfilment_cost'] = (float)($r['internal_fulfilment_cost'] ?? 0);
                $effCost = $r['fulfilment_mode'] === 'internal_manual' ? $r['internal_fulfilment_cost'] : $r['wholesale_cost'];
                $r['margin'] = round($r['selling_price'] - $effCost, 2);
            }
            if (is_string($r['required_fields'])) {
                $r['required_fields'] = json_decode($r['required_fields'], true) ?: [];
            }
            $catKey = !empty($r['category_code']) ? $this->mapCategoryKey((string)$r['category_code']) : $this->mapCategoryKey((string)($r['category_name'] ?? ''));
            $r['category'] = $catKey;
            unset($r['category_name'], $r['category_code']);
            if (!isset($categories[$catKey])) {
                $categories[$catKey] = [];
            }
            $categories[$catKey][] = $r;
        }

        $slipTemplates = [];
        try {
            $tplRows = $this->db->fetchAll('SELECT * FROM slip_templates WHERE is_active = 1 ORDER BY display_order ASC, name ASC');
            foreach ($tplRows as $t) {
                $slipTemplates[] = self::formatSlipRow($t);
            }
        } catch (Throwable) {
        }

        $slipTypes = array_values(array_map(static function ($t) {
            return [
                'id' => $t['slip_code'] ?: $t['id'],
                'template_id' => $t['id'],
                'name' => $t['name'],
                'description' => $t['description'] ?? '',
                'price' => $t['price'],
                'is_recommended' => $t['is_recommended'],
                'badge' => $t['badge'] ?? null,
            ];
        }, array_filter($slipTemplates, static fn($t) => strtoupper((string)($t['category'] ?? '')) === 'NIN')));

        $bvnSlipTypes = array_values(array_map(static function ($t) {
            return [
                'id' => $t['slip_code'] ?: $t['id'],
                'template_id' => $t['id'],
                'name' => $t['name'],
                'description' => $t['description'] ?? '',
                'price' => $t['price'],
                'is_recommended' => $t['is_recommended'],
                'badge' => $t['badge'] ?? null,
            ];
        }, array_filter($slipTemplates, static fn($t) => strtoupper((string)($t['category'] ?? '')) === 'BVN')));

        // Ensure demographic verification is never duplicated in additional_services
        if (!empty($categories['additional_services'])) {
            $categories['additional_services'] = array_values(array_filter(
                $categories['additional_services'],
                static fn($s) => !str_starts_with(strtolower((string)($s['key'] ?? '')), 'demo_')
            ));
        }

        Response::success([
            'activeProvider' => $isAdmin ? $activeProvider : 'verified',
            'services' => $rows,
            'categories' => $categories,
            'slipTypes' => $slipTypes,
            'bvnSlipTypes' => $bvnSlipTypes,
            'slipTemplates' => $slipTemplates,
        ]);
    }

    public function verify(Request $request): void
    {
        self::ensureSlipSchemaAndDefaults($this->db);

        $user = Auth::requireVerifiedEmail($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        // Enforce explicit NDPR/NIMC authorization consent
        $rawConsent = $request->input('consent', false);
        $consentAccepted = filter_var($rawConsent, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
        if (!$consentAccepted) {
            Response::error('Legal authorization consent is required before submitting an identity verification request.', 422);
        }

        $nestedPayload = $request->input('payload', []);
        $allInputs = array_merge($request->getBody(), is_array($nestedPayload) ? $nestedPayload : []);

        $pickFirstActiveKey = function (array $candidates): string {
            try {
                $placeholders = implode(', ', array_fill(0, count($candidates), '?'));
                $rows = $this->db->fetchAll(
                    "SELECT service_key FROM service_catalogue WHERE service_key IN ({$placeholders}) AND is_active = 1",
                    $candidates
                );
                $activeKeys = array_column($rows, 'service_key');
                foreach ($candidates as $cand) {
                    if (in_array($cand, $activeKeys, true)) {
                        return $cand;
                    }
                }
            } catch (Throwable) {
            }
            return $candidates[0];
        };

        $serviceKey = trim((string)($request->input('serviceKey') ?? $request->input('service_key', '')));
        $searchType = strtolower(trim((string)($allInputs['search_type'] ?? $request->input('search_type', ''))));
        $requestedVersion = strtolower(trim((string)($allInputs['version'] ?? $request->input('version', ''))));
        $prioritizeVersion = static function (array $candidates) use ($requestedVersion): array {
            if (in_array($requestedVersion, ['v1', 'v2', 'v3'], true)) {
                usort($candidates, static function (string $a, string $b) use ($requestedVersion): int {
                    $aMatch = str_ends_with($a, '_' . $requestedVersion) ? 0 : 1;
                    $bMatch = str_ends_with($b, '_' . $requestedVersion) ? 0 : 1;
                    return $aMatch <=> $bMatch;
                });
            }
            return $candidates;
        };
        if ($serviceKey === '' || $serviceKey === 'nin_verify') {
            if (in_array($searchType, ['demo_v1', 'demo_v2', 'demo_v3', 'phone_v1', 'phone_v2', 'phone_v3', 'nin_v1', 'nin_v2', 'nin_v3', 'vnin_verification'], true)) {
                $serviceKey = $searchType;
            } elseif (in_array($searchType, ['demo', 'demographic'], true)) {
                $serviceKey = $pickFirstActiveKey($prioritizeVersion(['demo_v1', 'demo_v2', 'demo_v3']));
            } elseif (in_array($searchType, ['phone', 'phone_number'], true)) {
                $serviceKey = $pickFirstActiveKey($prioritizeVersion(['phone_v1', 'phone_v2', 'phone_v3']));
            } elseif ($searchType === 'vnin') {
                $serviceKey = 'vnin_verification';
            } else {
                $serviceKey = $pickFirstActiveKey($prioritizeVersion(['nin_v1', 'nin_v2', 'nin_v3']));
            }
        } elseif ($serviceKey === 'bvn_verify') {
            if (in_array($searchType, ['bvn_v1', 'bvn_v2', 'bvn_v3', 'bvn_retrieval'], true)) {
                $serviceKey = $searchType;
            } elseif (in_array($searchType, ['phone', 'phone_number', 'bvn_phone'], true)) {
                $serviceKey = 'bvn_retrieval';
            } else {
                $serviceKey = $pickFirstActiveKey($prioritizeVersion(['bvn_v1', 'bvn_v2', 'bvn_v3']));
            }
        }

        $asyncAdditionalKeys = ['ipe_clearance', 'nin_validation', 'modification_clearance', 'nin_personalization', 'nin_personalization_2', 'npc_attestation', 'nin_delinking'];
        if (in_array(strtolower($serviceKey), $asyncAdditionalKeys, true)) {
            Response::error('Please submit clearance, validation, personalisation, NPC attestation, or delinking requests through the Additional & Clearance Services portal.', 422);
        }
        $unverifiedKeys = ['nin_tracking', 'bvn_enrolment', 'nin_bvn_arrangement'];
        if (in_array(strtolower($serviceKey), $unverifiedKeys, true)) {
            Response::error('This service is not yet supported because its upstream fulfillment endpoint is not verified.', 422);
        }

        $isBvnInputKey = str_starts_with(strtolower($serviceKey), 'bvn_') || str_contains(strtolower($serviceKey), 'bvn');
        $slipTemplateId = trim((string)($allInputs['slip_template_id'] ?? $request->input('slip_template_id', '')));
        $defaultSlipFallback = $isBvnInputKey ? 'bvnBasic' : 'ninStandard';
        $slipTypeInput = trim((string)($allInputs['slip_type'] ?? $request->input('slip_type', '')));
        if ($slipTypeInput === '') {
            $slipTypeInput = $defaultSlipFallback;
        }
        $tier = trim((string)($allInputs['tier'] ?? $request->input('tier', '')));
        if ($serviceKey === 'vnin_verification') {
            $tier = 'vnin';
        }
        $idempotencyKey = trim((string)($allInputs['idempotency_key'] ?? $request->input('idempotency_key', '')));

        $searchValue = trim((string)(
            $allInputs['search_value']
            ?? $allInputs['nin']
            ?? $allInputs['bvn']
            ?? $allInputs['phone']
            ?? $allInputs['phone_number']
            ?? $allInputs['tracking_id']
            ?? $allInputs['trackingId']
            ?? $allInputs['reference_id']
            ?? ''
        ));

        if ($searchValue === '' && (!empty($allInputs['firstname']) || !empty($allInputs['first_name']))) {
            $fn = trim((string)($allInputs['firstname'] ?? $allInputs['first_name'] ?? ''));
            $ln = trim((string)($allInputs['lastname'] ?? $allInputs['surname'] ?? $allInputs['last_name'] ?? ''));
            $dobVal = trim((string)($allInputs['dob'] ?? $allInputs['birthdate'] ?? ''));
            $searchValue = trim(strtoupper($fn . ' ' . $ln) . ($dobVal !== '' ? " ({$dobVal})" : ''));
        }

        if ($searchValue === '' && !in_array($serviceKey, ['demo_v1', 'demo_v2', 'demo_v3'], true)) {
            Response::error('Please provide the required NIN, BVN, phone number, or search value.', 422);
        }

        // Strict format validation BEFORE touching wallet
        if (in_array($serviceKey, ['nin_v1', 'nin_v2', 'nin_v3'], true)) {
            $cleanNin = preg_replace('/\s+/', '', $searchValue) ?? '';
            if (!preg_match('/^\d{11}$/', $cleanNin)) {
                Response::error('NIN Number must be exactly 11 numeric digits.', 422);
            }
            $searchValue = $cleanNin;
            $allInputs['nin'] = $cleanNin;
        } elseif ($serviceKey === 'vnin_verification') {
            $cleanVnin = preg_replace('/\s+/', '', $searchValue) ?? '';
            if (!preg_match('/^\d{11}$/', $cleanVnin)) {
                Response::error('Please enter a valid 11-digit NIN for VNIN slip verification.', 422);
            }
            $searchValue = $cleanVnin;
            $allInputs['nin'] = $cleanVnin;
        } elseif (in_array($serviceKey, ['bvn_v1', 'bvn_v2', 'bvn_v3'], true)) {
            $cleanBvn = preg_replace('/\s+/', '', $searchValue) ?? '';
            if (!preg_match('/^\d{11}$/', $cleanBvn)) {
                Response::error('BVN Number must be exactly 11 numeric digits.', 422);
            }
            $searchValue = $cleanBvn;
            $allInputs['bvn'] = $cleanBvn;
        } elseif (in_array($serviceKey, ['phone_v1', 'phone_v2', 'phone_v3'], true)) {
            $cleanPhone = preg_replace('/\s+/', '', $searchValue) ?? '';
            if (!preg_match('/^\d{11}$/', $cleanPhone)) {
                Response::error('Phone Number must be exactly 11 numeric digits (e.g. 08012345678).', 422);
            }
            $searchValue = $cleanPhone;
            $allInputs['phone'] = $cleanPhone;
        } elseif ($serviceKey === 'bvn_retrieval') {
            $fn = trim((string)($allInputs['first_name'] ?? $allInputs['firstname'] ?? ''));
            $ln = trim((string)($allInputs['last_name'] ?? $allInputs['lastname'] ?? $allInputs['surname'] ?? ''));
            $cleanPhone = preg_replace('/\s+/', '', (string)($allInputs['phone'] ?? $allInputs['phone_number'] ?? $searchValue)) ?? '';
            if ($fn === '' || $ln === '') {
                Response::error('First Name and Last Name are required for BVN Retrieval.', 422);
            }
            if (!preg_match('/^\d{11}$/', $cleanPhone)) {
                Response::error('Phone Number must be exactly 11 numeric digits (e.g. 08012345678).', 422);
            }
            $allInputs['first_name'] = strtoupper($fn);
            $allInputs['last_name'] = strtoupper($ln);
            $allInputs['phone'] = $cleanPhone;
            $allInputs['phone_number'] = $cleanPhone;
            $searchValue = $cleanPhone;
        } elseif (in_array($serviceKey, ['demo_v1', 'demo_v2', 'demo_v3'], true)) {
            $fn = trim((string)($allInputs['firstname'] ?? $allInputs['first_name'] ?? ''));
            $ln = trim((string)($allInputs['lastname'] ?? $allInputs['surname'] ?? $allInputs['last_name'] ?? ''));
            $dobVal = trim((string)($allInputs['dob'] ?? $allInputs['birthdate'] ?? ''));
            $genderRaw = strtolower(trim((string)($allInputs['gender'] ?? '')));
            if ($fn === '' || $ln === '') {
                Response::error('First Name and Surname are required for Demographic Verification.', 422);
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dobVal) || !strtotime($dobVal)) {
                Response::error('Please provide a valid Date of Birth (YYYY-MM-DD) for Demographic Verification.', 422);
            }
            if (!in_array($genderRaw, ['m', 'f', 'male', 'female'], true)) {
                Response::error('Please select a valid Gender (Male or Female) for Demographic Verification.', 422);
            }
            $allInputs['firstname'] = strtoupper($fn);
            $allInputs['lastname'] = strtoupper($ln);
            $allInputs['dob'] = $dobVal;
            $allInputs['gender'] = ($genderRaw === 'f' || $genderRaw === 'female') ? 'f' : 'm';
            $searchValue = strtoupper($fn . ' ' . $ln) . " ({$dobVal})";
        }

        // 1. Fetch Service Configuration from MySQL
        $service = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code FROM service_catalogue s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.service_key = :k AND s.is_active = 1',
            ['k' => $serviceKey]
        );

        if (!$service) {
            Response::error('Selected verification service is unavailable or inactive.', 404);
        }

        // 2. Resolve Slip Template, Active Status & Dynamic Slip Price BEFORE touching wallet
        $cost = (float)$service['selling_price'];
        $categoryKey = $this->mapCategoryKey((string)($service['category_code'] ?? ''));
        $isNinVerification = ($categoryKey === 'nin_verification');
        $isBvnVerification = ($categoryKey === 'bvn_verification');
        $expectedSlipCategory = $isBvnVerification ? 'BVN' : 'NIN';

        $validBvnSlipCodes = ['bvnBasic', 'bvnAdvanced', 'plasticBvn', 'bankBvn'];
        $validNinSlipCodes = ['ninBasic', 'ninRegular', 'ninStandard', 'ninPremium', 'ninVnin', 'ninSpecial'];

        // Strictly reject cross-domain slip templates (NIN slip on BVN or BVN slip on NIN)
        $slipLower = strtolower($slipTypeInput);
        if ($isBvnVerification && (str_starts_with($slipLower, 'nin') || str_starts_with($slipLower, 'tpl_nin'))) {
            Response::error('NIN slip templates cannot be used for BVN verification. Please select a valid BVN slip format.', 422);
        }
        if ($isNinVerification && (str_contains($slipLower, 'bvn') || str_starts_with($slipLower, 'tpl_bvn'))) {
            Response::error('BVN slip templates cannot be used for NIN verification. Please select a valid NIN slip format.', 422);
        }

        $resolvedSlipCode = $isBvnVerification
            ? (in_array($slipTypeInput, $validBvnSlipCodes, true) ? $slipTypeInput : 'bvnBasic')
            : ($serviceKey === 'vnin_verification'
                ? 'ninVnin'
                : (in_array($slipTypeInput, $validNinSlipCodes, true) ? $slipTypeInput : 'ninStandard'));
        $resolvedSlipName = null;

        if ($isNinVerification || $isBvnVerification || $slipTemplateId !== '' || !empty($service['slip_type_supported'])) {
            $tpl = null;
            if ($slipTemplateId !== '') {
                $tpl = $this->db->fetchOne(
                    'SELECT * FROM slip_templates WHERE (id = :id OR slip_code = :code) AND UPPER(category) = :cat LIMIT 1',
                    ['id' => $slipTemplateId, 'code' => $slipTemplateId, 'cat' => $expectedSlipCategory]
                );
            }
            if (!$tpl && $slipTypeInput !== '') {
                $tpl = $this->db->fetchOne(
                    'SELECT * FROM slip_templates WHERE (slip_code = :code OR id = :id) AND UPPER(category) = :cat LIMIT 1',
                    ['code' => $slipTypeInput, 'id' => $slipTypeInput, 'cat' => $expectedSlipCategory]
                );
            }
            if (!$tpl && ($isNinVerification || $isBvnVerification) && $slipTemplateId === '') {
                $tpl = $this->db->fetchOne(
                    'SELECT * FROM slip_templates WHERE slip_code = :code AND UPPER(category) = :cat LIMIT 1',
                    ['code' => $resolvedSlipCode, 'cat' => $expectedSlipCategory]
                );
            }

            if ($tpl) {
                if (!(bool)$tpl['is_active']) {
                    Response::error('The selected slip type is currently disabled. Please select an active slip type.', 422);
                }
                if (!empty($tpl['slip_code'])) {
                    $resolvedSlipCode = (string)$tpl['slip_code'];
                }
                $resolvedSlipName = (string)$tpl['name'];
                if ($serviceKey === 'bvn_retrieval') {
                    // Phone-to-BVN retrieval carries a higher upstream registry fee; never charge below service selling_price
                    $slipPrice = ($tpl['price'] !== null && (float)$tpl['price'] > 0) ? (float)$tpl['price'] : 0.0;
                    $cost = max((float)$service['selling_price'], $slipPrice);
                } elseif (!empty($service['slip_type_supported']) && $tpl['price'] !== null && (float)$tpl['price'] > 0) {
                    $cost = (float)$tpl['price'];
                }
            } elseif (($isNinVerification || $isBvnVerification) && $slipTemplateId !== '') {
                Response::error("Selected {$expectedSlipCategory} slip template was not found.", 422);
            }
        }

        // 3. Idempotency / Duplicate Submission Guard BEFORE touching wallet
        if ($idempotencyKey !== '') {
            $idempKeyNorm = substr($idempotencyKey, 0, 120);
            try {
                $existingMeta = $this->db->fetchOne(
                    'SELECT id FROM verification_records WHERE user_id = :uid AND idempotency_key = :ikey ORDER BY created_at DESC LIMIT 1',
                    ['uid' => $user['id'], 'ikey' => $idempKeyNorm]
                );
                $existing = $existingMeta
                    ? $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id LIMIT 1', ['id' => $existingMeta['id']])
                    : null;
                if ($existing) {
                    if ($existing['status'] === 'completed') {
                        $decodedRes = json_decode((string)$existing['result_data'], true) ?: [];
                        if (is_array($decodedRes)) {
                            [$exBvn, $exNin] = $this->detectRecordDomain((string)($existing['service_key'] ?? ''), (string)($existing['type'] ?? ''));
                            $decodedRes = $this->stripCrossTypeFields($decodedRes, $exBvn, $exNin);
                            if (!$isAdmin) {
                                $decodedRes = $this->sanitizeResultForCustomer($decodedRes, (string)($existing['service_key'] ?? ''), (string)($existing['type'] ?? ''));
                            }
                        }
                        $wallet = $this->db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $user['id']]);
                        $bal = $wallet ? (float)$wallet['balance'] : (float)($user['wallet_balance'] ?? 0);
                        $hasOriginalPdf = is_array($decodedRes) && (!empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']));
                        Response::success([
                            'duplicate' => true,
                            'verification_id' => $existing['id'],
                            'recordId' => $existing['id'],
                            'reference' => $existing['reference'],
                            'cost' => (float)$existing['cost'],
                            'balance_after' => $bal,
                            'newBalance' => $bal,
                            'slip_type' => $existing['slip_type'],
                            'slip_name' => $resolvedSlipName,
                            'has_original_pdf' => $hasOriginalPdf,
                            'result' => $decodedRes,
                            'verified_at' => $existing['created_at'],
                            'service' => [
                                'key' => $serviceKey,
                                'name' => $service['name'],
                                'category' => $categoryKey,
                            ],
                        ], 'Verification already processed for this request.');
                        return;
                    }
                    if ($existing['status'] === 'pending') {
                        Response::error(
                            'This verification request is still in progress. Please use Recover Result instead of submitting again.',
                            409,
                            [
                                'pending' => true,
                                'reference' => $existing['reference'],
                                'idempotency_key' => $idempKeyNorm,
                            ],
                            'VERIFICATION_IN_PROGRESS'
                        );
                    }
                    $createdTs = strtotime((string)($existing['created_at'] ?? '')) ?: 0;
                    if ($existing['status'] === 'failed' && (time() - $createdTs) < 30) {
                        Response::error('Duplicate submission detected. Please review and try again.', 409);
                    }
                }
            } catch (Throwable) {
            }
        }

        // 4. Unified Routing Decision (provider_instant | provider_async | internal_manual) BEFORE debiting wallet
        $routerService = new FulfilmentRouterService($this->db);
        $route = $routerService->resolveRoute($serviceKey);
        if (!$route) {
            Response::error('Selected verification service routing configuration could not be loaded.', 503);
        }

        $fulfilmentMode = (string)$route['fulfilment_mode'];
        $isManualRoute = ($fulfilmentMode === 'internal_manual');
        $isAsyncRoute = ($fulfilmentMode === 'provider_async' || $serviceKey === 'bvn_retrieval');
        $providerChain = [];
        $adapters = [];
        $usedProvider = (string)$route['provider_id'];

        if ($isManualRoute) {
            $manualCheck = $routerService->canRouteManual($route);
            if (empty($manualCheck['allowed'])) {
                Security::logPrivateError('VerificationRouting', (string)($manualCheck['reason'] ?? 'Manual routing rejected'), [
                    'category' => $categoryKey,
                    'service_key' => $serviceKey,
                ]);
                Response::error((string)($manualCheck['customer_message'] ?? 'This service is temporarily unavailable.'), (int)($manualCheck['code'] ?? 503));
            }
            $usedProvider = 'hambak_manual';
        } else {
            $extCheck = $routerService->canDispatchExternal($route);
            if (empty($extCheck['allowed'])) {
                Security::logPrivateError('VerificationRouting', (string)($extCheck['reason'] ?? 'External dispatch rejected'), [
                    'category' => $categoryKey,
                    'service_key' => $serviceKey,
                    'provider_id' => $route['provider_id'] ?? null,
                ]);
                Response::error((string)($extCheck['customer_message'] ?? Security::ERR_PROVIDER_AUTH), (int)($extCheck['code'] ?? 503));
            }

            if ($isAsyncRoute || $serviceKey === 'bvn_retrieval') {
                // Async registry retrieval (e.g. 2SureVerify bvn_retrieval) is single-provider only — NEVER fallback to veripine
                $twoSure = new TwoSureVerifyAdapter();
                if (!$twoSure->hasCredentials()) {
                    Response::error(Security::ERR_PROVIDER_AUTH, 503);
                }
                $adapters = ['2sureverify' => $twoSure];
                $providerChain = ['2sureverify'];
                $usedProvider = '2sureverify';
            } else {
                $routing = $this->resolveProviderChain($categoryKey, $route['provider_id'] ?? ($service['provider_id'] ?? null));
                $providerChain = $routing['chain'];
                $adapters = $routing['adapters'];

                if (empty($providerChain)) {
                    Security::logPrivateError('VerificationRouting', 'No verification provider credentials configured', [
                        'category' => $categoryKey,
                        'service_key' => $serviceKey,
                    ]);
                    Response::error(Security::ERR_PROVIDER_AUTH, 503);
                }
                $usedProvider = $providerChain[0];
            }
        }

        $orderMeta = $routerService->buildOrderRoutingMetadata($route);
        $wholesaleCost = (float)$service['wholesale_cost'];
        $endpoint = trim((string)($route['endpoint'] ?? $service['endpoint'] ?? $serviceKey));

        // Enforce compulsory Transaction PIN verification BEFORE touching wallet
        $pinService = new PinSecurityService($this->db);
        $pinService->requireValidPin($user, $allInputs, 'identity_verification', $serviceKey);

        // 5. Atomic Wallet Debit
        $debitCategory = $isBvnVerification ? 'bvn_verification' : 'nin_verification';
        $recordTypeLabel = $isBvnVerification
            ? 'BVN'
            : (str_starts_with($serviceKey, 'demo_') ? 'DEMO' : (str_starts_with($serviceKey, 'phone_') ? 'PHONE' : 'NIN'));

        $reference = 'VRF_' . strtoupper(bin2hex(random_bytes(6)));
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $cost,
                $debitCategory,
                $reference,
                "Identity verification fee for {$service['name']}" . ($resolvedSlipName ? " ({$resolvedSlipName})" : '') . " ({$searchValue})",
                'internal',
                [
                    'service_key' => $serviceKey,
                    'search_value' => $searchValue,
                    'slip_type' => $resolvedSlipCode,
                    'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                ]
            );
        } catch (Throwable $e) {
            $errMsg = Security::sanitizeWalletDebitError($e);
            $httpStatus = Security::isCustomerWalletInsufficient($e) ? 400 : 500;
            Response::error($errMsg, $httpStatus);
            return;
        }

        // Insert initial pending record with immutable routing_snapshot, sla_due_at & internal_fulfilment_cost
        $recordId = Security::generateUuid();
        $initialTimeline = $isManualRoute ? [[
            'step' => 'submitted',
            'status' => 'pending',
            'label' => 'Queued at HAMBAK Manual Desk',
            'note' => 'Order paid and routed internally to HAMBAK MANUAL fulfilment queue.',
            'at' => gmdate('c'),
        ]] : [];
        $initialResultPayload = $isManualRoute
            ? json_encode(['status' => 'pending', 'fulfilment_mode' => 'internal_manual', 'manual_timeline' => $initialTimeline], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            : null;

        try {
            $this->db->execute(
                'INSERT INTO verification_records
                 (id, user_id, type, service_key, search_value, provider, cost, provider_cost,
                  fulfilment_mode, routing_snapshot, sla_due_at, internal_fulfilment_cost,
                  status, reference, slip_type, has_slip, idempotency_key, result_data, created_at)
                 VALUES
                 (:id, :uid, :type, :skey, :search, :prov, :cost, 0.00,
                  :fmode, :rsnap, :sladue, :icost,
                  "pending", :ref, :slip, 0, :ikey, :rdata, NOW())',
                [
                    'id' => $recordId,
                    'uid' => $user['id'],
                    'type' => $recordTypeLabel,
                    'skey' => $serviceKey,
                    'search' => $searchValue,
                    'prov' => $usedProvider,
                    'cost' => $cost,
                    'fmode' => $orderMeta['fulfilment_mode'],
                    'rsnap' => $orderMeta['routing_snapshot_json'],
                    'sladue' => $orderMeta['sla_due_at'],
                    'icost' => $orderMeta['internal_fulfilment_cost'],
                    'ref' => $reference,
                    'slip' => $resolvedSlipCode,
                    'ikey' => $idempotencyKey !== '' ? substr($idempotencyKey, 0, 120) : null,
                    'rdata' => $initialResultPayload,
                ]
            );
        } catch (Throwable) {
            $this->db->execute(
                'INSERT INTO verification_records
                 (id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, idempotency_key, result_data, created_at)
                 VALUES
                 (:id, :uid, :type, :skey, :search, :prov, :cost, 0.00, "pending", :ref, :slip, 0, :ikey, :rdata, NOW())',
                [
                    'id' => $recordId,
                    'uid' => $user['id'],
                    'type' => $recordTypeLabel,
                    'skey' => $serviceKey,
                    'search' => $searchValue,
                    'prov' => $usedProvider,
                    'cost' => $cost,
                    'ref' => $reference,
                    'slip' => $resolvedSlipCode,
                    'ikey' => $idempotencyKey !== '' ? substr($idempotencyKey, 0, 120) : null,
                    'rdata' => $initialResultPayload,
                ]
            );
        }

        // 5B. Internal Manual Path: Zero external calls, stay pending in HAMBAK MANUAL queue
        if ($isManualRoute) {
            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'IDENTITY_MANUAL_SUBMITTED',
                'service_type' => $serviceKey,
                'reference' => $reference,
                'provider' => 'hambak_manual',
                'status' => 'pending',
                'amount' => $cost,
                'metadata' => [
                    'fulfilment_mode' => 'internal_manual',
                    'sla_due_at' => $orderMeta['sla_due_at'],
                    'slip_type' => $resolvedSlipCode,
                ],
            ]);

            Response::success([
                'pending' => true,
                'async' => true,
                'status' => 'pending',
                'fulfilment_mode' => 'internal_manual',
                'sla_due_at' => $orderMeta['sla_due_at'],
                'verification_id' => $recordId,
                'recordId' => $recordId,
                'reference' => $reference,
                'cost' => $cost,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'slip_type' => $resolvedSlipCode,
                'slip_name' => $resolvedSlipName,
                'has_original_pdf' => false,
                'result' => null,
                'service' => [
                    'key' => $serviceKey,
                    'name' => $service['name'],
                    'category' => $categoryKey,
                    'fulfilment_mode' => 'internal_manual',
                    'sla_hours' => $orderMeta['sla_hours'],
                    'estimated_turnaround' => $route['estimated_turnaround'] ?? null,
                ],
            ], 'Your request has been queued with our fulfilment desk and will be processed within the stated turnaround window.');
            return;
        }

        // 6. Dispatch to Real Upstream Provider Adapter (with dispatch lock & async pending support)
        $lockAcquired = $routerService->acquireDispatchLock('verification_records', $recordId);
        if (!$lockAcquired) {
            Response::error('Verification dispatch is already in progress. Please refresh status shortly.', 409);
        }

        $dispatchErrForLock = null;
        try {
            $payload = array_merge($allInputs, [
                'service_key' => $serviceKey,
                'search_value' => $searchValue,
                'slip_type' => $resolvedSlipCode,
                'tier' => $tier,
                'reference' => $reference,
            ]);

            $providerResult = null;
            $providerPending = null;
            $lastErrorMsg = 'Upstream identity verification failed.';
            $primaryErrorMsg = null;
            $attemptErrors = [];

            foreach ($providerChain as $idx => $candidateProv) {
                $usedProvider = $candidateProv;
                $candidateAdapter = $adapters[$candidateProv];
                $attemptPayload = $payload;
                if ($idx > 0) {
                    $attemptPayload['reference'] = $reference . '_FB' . $idx;
                }
                $attemptRes = $candidateAdapter->verify($endpoint, $attemptPayload);
                $candStatusLower = strtolower((string)($attemptRes['status'] ?? ''));
                $attemptOk = (!isset($attemptRes['success']) || (bool)$attemptRes['success'] === true)
                    && empty($attemptRes['is_simulated'])
                    && !in_array($candStatusLower, ['failed', 'error', 'not_found', 'no_record', 'rejected'], true);

                $isAsyncAccepted = $attemptOk && (
                    !empty($attemptRes['pending'])
                    || in_array($candStatusLower, ['pending', 'processing', 'queued', 'submitted', 'in_progress'], true)
                );

                if ($attemptOk) {
                    $candidateNormalized = $this->extractNormalizedIdentity($attemptRes, $isBvnVerification, $isNinVerification);
                    $hasSubstantive = $this->hasSubstantiveIdentityData($candidateNormalized, $isBvnVerification);
                    if ($isAsyncAccepted || ($isAsyncRoute && !$hasSubstantive)) {
                        $providerPending = $attemptRes;
                        break;
                    }
                    if (($isNinVerification || $isBvnVerification) && !$hasSubstantive) {
                        $attemptOk = false;
                        $attemptRes['code'] = (int)($attemptRes['code'] ?? 422);
                        $attemptRes['message'] = 'Gateway returned an empty identity record without verified details.';
                    }
                }

                if ($attemptOk) {
                    $providerResult = $attemptRes;
                    break;
                }
                $rawCandMsg = trim((string)($attemptRes['message'] ?? 'Verification failed'));
                $candCode = (int)($attemptRes['code'] ?? 502);
                $attemptErrors[] = "[{$candidateProv} HTTP {$candCode}] {$rawCandMsg}";

                $candidateMsg = $rawCandMsg;
                if ($idx === 0 && $candidateMsg !== '') {
                    $primaryErrorMsg = $candidateMsg;
                }
                $candLower = strtolower($candidateMsg);
                $isMerchantWalletErr = str_contains($candLower, 'insufficient') && (str_contains($candLower, 'balance') || str_contains($candLower, 'fund'));
                if ($isMerchantWalletErr) {
                    $candidateMsg = 'Identity gateway service is temporarily unavailable. Please try again shortly';
                }
                if ($idx > 0 && $primaryErrorMsg !== null && str_contains(strtolower($primaryErrorMsg), 'no record found') && ($isMerchantWalletErr || str_contains($candLower, 'unavailable'))) {
                    $lastErrorMsg = $primaryErrorMsg;
                } elseif ($candidateMsg !== '') {
                    $lastErrorMsg = $candidateMsg;
                }
            }

            if ($providerPending !== null) {
                $nestedP = is_array($providerPending['data'] ?? null) ? $providerPending['data'] : [];
                $provRef = trim((string)($providerPending['reference'] ?? $nestedP['reference'] ?? $reference));
                $provTxId = trim((string)($providerPending['provider_transaction_id'] ?? $providerPending['transaction_id'] ?? $nestedP['transaction_id'] ?? ''));
                $provStat = trim((string)($providerPending['provider_status'] ?? $providerPending['status'] ?? 'pending'));
                $estCost = isset($providerPending['provider_cost']) && is_numeric($providerPending['provider_cost'])
                    ? (float)$providerPending['provider_cost']
                    : $wholesaleCost;

                $pendingSnapshot = [
                    'status' => 'pending',
                    'pending' => true,
                    'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                    'message' => trim((string)($providerPending['message'] ?? 'Request submitted and awaiting registry completion.')),
                    'provider_reference' => $provRef,
                    'provider_transaction_id' => $provTxId !== '' ? $provTxId : null,
                ];

                try {
                    $this->db->execute(
                        'UPDATE verification_records
                         SET provider = :prov, provider_cost = :pcost, status = "pending",
                             provider_reference = :pref, provider_transaction_id = :ptx, provider_status = :pstat,
                             result_data = :rdata, updated_at = NOW()
                         WHERE id = :id',
                        [
                            'prov' => $usedProvider,
                            'pcost' => $estCost,
                            'pref' => $provRef,
                            'ptx' => $provTxId !== '' ? $provTxId : null,
                            'pstat' => $provStat !== '' ? $provStat : 'pending',
                            'rdata' => json_encode($pendingSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                            'id' => $recordId,
                        ]
                    );
                } catch (Throwable) {
                    $this->db->execute(
                        'UPDATE verification_records
                         SET provider = :prov, provider_cost = :pcost, status = "pending", result_data = :rdata
                         WHERE id = :id',
                        [
                            'prov' => $usedProvider,
                            'pcost' => $estCost,
                            'rdata' => json_encode($pendingSnapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                            'id' => $recordId,
                        ]
                    );
                }

                $routerService->releaseDispatchLock('verification_records', $recordId, null);

                FootprintService::record([
                    'user_id' => $user['id'],
                    'user_email' => $user['email'] ?? null,
                    'user_name' => $user['full_name'] ?? null,
                    'category' => 'service',
                    'action' => 'IDENTITY_VERIFY_ASYNC_PENDING',
                    'service_type' => $serviceKey,
                    'reference' => $reference,
                    'provider' => $usedProvider,
                    'status' => 'pending',
                    'amount' => $cost,
                    'metadata' => [
                        'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                        'sla_due_at' => $orderMeta['sla_due_at'],
                        'provider_reference' => $provRef,
                    ],
                ]);

                Response::success([
                    'pending' => true,
                    'async' => true,
                    'status' => 'pending',
                    'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                    'sla_due_at' => $orderMeta['sla_due_at'],
                    'verification_id' => $recordId,
                    'recordId' => $recordId,
                    'reference' => $reference,
                    'cost' => $cost,
                    'balance_after' => $debitResult['balance_after'],
                    'newBalance' => $debitResult['balance_after'],
                    'slip_type' => $resolvedSlipCode,
                    'slip_name' => $resolvedSlipName,
                    'has_original_pdf' => false,
                    'result' => null,
                    'service' => [
                        'key' => $serviceKey,
                        'name' => $service['name'],
                        'category' => $categoryKey,
                        'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                        'sla_hours' => $orderMeta['sla_hours'],
                    ],
                ], 'Your BVN retrieval request has been submitted and is awaiting asynchronous confirmation. Use Check Status to retrieve your result.');
                return;
            }

            if ($providerResult === null) {
                throw new Exception($lastErrorMsg);
            }

            $resultData = $this->extractNormalizedIdentity($providerResult, $isBvnVerification, $isNinVerification);
            if (($isNinVerification || $isBvnVerification) && !$this->hasSubstantiveIdentityData($resultData, $isBvnVerification)) {
                throw new Exception('Identity verification did not return valid identity details.');
            }
            $actualProviderCost = (float)($providerResult['provider_cost'] ?? $wholesaleCost);
            $verifiedAt = date('c');

            $customerSafeResult = $resultData;
            if (!$isAdmin && is_array($customerSafeResult)) {
                $customerSafeResult = $this->sanitizeResultForCustomer($customerSafeResult, $serviceKey, $recordTypeLabel);
            }

            // 7. Update verification_records to completed
            $encodedRecordResult = json_encode(
                $resultData,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
            ) ?: '{}';

            $provRefCompleted = trim((string)($providerResult['reference'] ?? $reference));
            $provTxCompleted = trim((string)($providerResult['provider_transaction_id'] ?? $providerResult['transaction_id'] ?? ''));

            try {
                $this->db->execute(
                    'UPDATE verification_records
                     SET provider = :prov, provider_cost = :pcost, status = "completed", has_slip = 1,
                         provider_reference = :pref, provider_transaction_id = :ptx, provider_status = "completed",
                         completed_at = NOW(), updated_at = NOW(), result_data = :result
                     WHERE id = :id',
                    [
                        'prov' => $usedProvider,
                        'pcost' => $actualProviderCost,
                        'pref' => $provRefCompleted,
                        'ptx' => $provTxCompleted !== '' ? $provTxCompleted : null,
                        'result' => $encodedRecordResult,
                        'id' => $recordId,
                    ]
                );
            } catch (Throwable) {
                $this->db->execute(
                    'UPDATE verification_records
                     SET provider = :prov, provider_cost = :pcost, status = "completed", has_slip = 1, result_data = :result
                     WHERE id = :id',
                    [
                        'prov' => $usedProvider,
                        'pcost' => $actualProviderCost,
                        'result' => $encodedRecordResult,
                        'id' => $recordId,
                    ]
                );
            }
            $routerService->releaseDispatchLock('verification_records', $recordId, null);

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => $isBvnVerification ? 'BVN_VERIFIED' : 'IDENTITY_VERIFIED',
                'service_type' => $serviceKey,
                'reference' => $reference,
                'provider' => $usedProvider,
                'status' => 'successful',
                'amount' => $cost,
                'metadata' => [
                    'slip_type' => $resolvedSlipCode,
                    'slip_name' => $resolvedSlipName,
                    'search_type' => $recordTypeLabel,
                ],
            ]);

            // Trigger referral & loyalty points reward if user was referred
            try {
                (new ReferralEngineService($this->db))->recordQualifyingTransaction([
                    'user_id' => (string)$user['id'],
                    'service_category' => $isBvnVerification ? 'bvn_verification' : 'nin_verification',
                    'service_key' => $serviceKey,
                    'source_reference' => $reference,
                    'gross_amount' => $cost,
                    'wholesale_cost' => $actualProviderCost,
                    'gateway_fee' => 0.0,
                ]);
            } catch (Throwable $refEx) {
                error_log('[Verification Referral Hook Error] ' . $refEx->getMessage());
            }

            $hasOriginalPdf = is_array($customerSafeResult)
                && (!empty($customerSafeResult['pdf_base64']) || !empty($customerSafeResult['pdf_url']));

            Response::success([
                'verification_id' => $recordId,
                'recordId' => $recordId,
                'reference' => $reference,
                'fulfilment_mode' => $orderMeta['fulfilment_mode'],
                'cost' => $cost,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'slip_type' => $resolvedSlipCode,
                'slip_name' => $resolvedSlipName,
                'has_original_pdf' => $hasOriginalPdf,
                'verified_at' => $verifiedAt,
                'result' => $customerSafeResult,
                'service' => [
                    'key' => $serviceKey,
                    'name' => $service['name'],
                    'category' => $categoryKey,
                ],
            ], 'Verification completed successfully!');
        } catch (Exception $e) {
            $dispatchErrForLock = $e->getMessage();
            $routerService->releaseDispatchLock('verification_records', $recordId, $dispatchErrForLock);

            $refundRef = 'REFUND_' . $reference;
            $refundResult = $this->walletService->attemptConfirmedRefund(
                (string)$user['id'],
                $cost,
                'refund',
                $refundRef,
                "Automatic refund for failed verification {$reference}",
                ['reference' => $reference, 'service_key' => $serviceKey]
            );
            $refundConfirmed = !empty($refundResult['confirmed']);

            Security::logPrivateError('VerificationDispatch', $e, [
                'user_id' => $user['id'],
                'service_key' => $serviceKey,
                'provider' => $usedProvider,
                'reference' => $reference,
                'diagnostics' => $attemptErrors ?? [],
                'refund_confirmed' => $refundConfirmed,
            ]);

            $adminDiagMsg = !empty($attemptErrors) ? implode(' | ', $attemptErrors) : $e->getMessage();
            try {
                $this->db->execute(
                    'UPDATE verification_records
                     SET type = "FAILED", provider_cost = 0.00, status = "failed", has_slip = 0,
                         refund_reference = :rref, last_dispatch_error = :lerr, updated_at = NOW(), result_data = :result
                     WHERE id = :id',
                    [
                        'rref' => $refundConfirmed ? $refundRef : null,
                        'lerr' => substr($adminDiagMsg, 0, 1000),
                        'result' => json_encode([
                            'error' => Security::sanitizeCustomerError($e->getMessage(), Security::ERR_PROVIDER_UNAVAILABLE),
                            'refund_confirmed' => $refundConfirmed,
                            'refund_reference' => $refundConfirmed ? $refundRef : null,
                        ]),
                        'id' => $recordId,
                    ]
                );
            } catch (Throwable) {
                $this->db->execute(
                    'UPDATE verification_records
                     SET type = "FAILED", provider_cost = 0.00, status = "failed", has_slip = 0, result_data = :result
                     WHERE id = :id',
                    [
                        'result' => json_encode([
                            'error' => Security::sanitizeCustomerError($e->getMessage(), Security::ERR_PROVIDER_UNAVAILABLE),
                            'refund_confirmed' => $refundConfirmed,
                            'refund_reference' => $refundConfirmed ? $refundRef : null,
                        ]),
                        'id' => $recordId,
                    ]
                );
            }

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'IDENTITY_VERIFY_FAILED',
                'service_type' => $serviceKey,
                'reference' => $reference,
                'provider' => $usedProvider,
                'status' => 'failed',
                'amount' => $cost,
                'error_message' => $adminDiagMsg,
                'metadata' => [
                    'slip_type' => $resolvedSlipCode,
                    'refund_reference' => $refundRef,
                    'refund_confirmed' => $refundConfirmed,
                ],
            ]);

            $errMsg = $refundConfirmed
                ? Security::ERR_TXN_REFUNDED
                : Security::ERR_TXN_REFUND_PENDING;
            Response::error(
                $errMsg,
                502,
                [
                    'refunded' => $refundConfirmed,
                    'refund_pending' => !$refundConfirmed,
                    'refund_reference' => $refundConfirmed ? $refundRef : null,
                    'reference' => $reference,
                    'balance_after' => $refundResult['balance_after'] ?? null,
                ]
            );
        }
    }

    public function history(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $limit = min(100, max(1, (int)$request->query('limit', 50)));
        $category = trim((string)$request->query('category', ''));
        $search = trim((string)$request->query('search', ''));
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));

        $selectCols = $isAdmin
            ? 'id, user_id, type, service_key, search_value, provider, cost, provider_cost, internal_fulfilment_cost, fulfilment_mode, sla_due_at, result_document_id, awaiting_admin_review, provider_status, status, reference, slip_type, has_slip, result_data as result, created_at, completed_at'
            : 'id, user_id, type, service_key, search_value, cost, fulfilment_mode, sla_due_at, result_document_id, status, reference, slip_type, has_slip, result_data as result, created_at, completed_at';

        $whereSql = 'WHERE user_id = :uid ';
        $params = ['uid' => $user['id']];

        if (!empty($category) && $category !== 'all') {
            $whereSql .= 'AND (LOWER(type) = :cat OR LOWER(service_key) LIKE :catlike) ';
            $params['cat'] = strtolower($category);
            $params['catlike'] = '%' . strtolower($category) . '%';
        }
        if (!empty($search)) {
            $whereSql .= 'AND (search_value LIKE :q1 OR reference LIKE :q2 OR service_key LIKE :q3) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
        }

        // Two-step deferred fetch avoids MySQL sort_buffer_size exhaustion (SQLSTATE HY001 1038) on large JSON result_data
        $idRows = $this->db->fetchAll(
            "SELECT id FROM verification_records {$whereSql} ORDER BY created_at DESC LIMIT " . (int)$limit,
            $params
        );

        $rows = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $vid) {
                    $ph = ':vid_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['vid_' . $idx] = $vid;
                }
                $rows = $this->db->fetchAll(
                    "SELECT {$selectCols} FROM verification_records WHERE id IN (" . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($rows, static function ($a, $b) use ($orderMap) {
                    return ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX);
                });
            }
        }

        foreach ($rows as &$r) {
            $r['cost'] = (float)$r['cost'];
            if (isset($r['provider_cost'])) {
                $r['provider_cost'] = (float)$r['provider_cost'];
            }
            if (isset($r['internal_fulfilment_cost'])) {
                $r['internal_fulfilment_cost'] = (float)$r['internal_fulfilment_cost'];
            }
            $r['fulfilment_mode'] = (string)($r['fulfilment_mode'] ?? 'provider_instant');
            $r['has_slip'] = (bool)$r['has_slip'];
            $r['has_result_document'] = !empty($r['result_document_id']);
            $r['has_original_pdf'] = !empty($r['result_document_id']);
            $r['has_photo'] = false;
            if (!empty($r['result']) && is_string($r['result'])) {
                $decodedRes = json_decode($r['result'], true);
                if (is_array($decodedRes)) {
                    [$rowBvn, $rowNin] = $this->detectRecordDomain((string)($r['service_key'] ?? ''), (string)($r['type'] ?? ''));
                    $decodedRes = $this->stripCrossTypeFields($decodedRes, $rowBvn, $rowNin);
                    if (!$isAdmin) {
                        $decodedRes = $this->sanitizeResultForCustomer($decodedRes, (string)($r['service_key'] ?? ''), (string)($r['type'] ?? ''));
                    }
                    $r['has_original_pdf'] = $r['has_original_pdf'] || !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
                    $r['has_photo'] = !empty($decodedRes['photo']);
                    unset($decodedRes['pdf_base64'], $decodedRes['photo']);
                    $r['result'] = $decodedRes;
                } else {
                    $r['result'] = null;
                }
            }
            $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $r, 'verification', $isAdmin);
            $hasLegacyPdf = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
            $hasDoc = !empty($resultMeta['has_result_document']) || $hasLegacyPdf;
            $r = array_merge($r, $resultMeta);
            $r['has_result_document'] = !empty($resultMeta['has_result_document']);
            $r['has_original_pdf'] = $hasDoc;
            $r['result_availability_state'] = $this->resolveResultAvailabilityState(
                (string)($r['status'] ?? ''),
                (bool)$r['has_original_pdf'],
                !empty($r['result'])
            );
        }

        Response::success([
            'count' => count($rows),
            'history' => $rows,
            'verifications' => $rows,
        ]);
    }

    private function resolveResultAvailabilityState(string $status, bool $hasOriginalPdf, bool $hasResultPayload): string
    {
        $st = strtolower(trim($status));
        if ($hasOriginalPdf) {
            return 'document_available';
        }
        if (in_array($st, ['failed', 'rejected', 'refunded'], true)) {
            return 'failed_or_rejected';
        }
        if (in_array($st, ['pending', 'under_review', 'assigned', 'processing', 'query_required'], true)) {
            return 'processing';
        }
        if ($st === 'completed') {
            return $hasResultPayload ? 'result_available' : 'document_unavailable';
        }
        return 'none';
    }

    /**
     * GET /api/verification/slip-templates
     */
    public function slipTemplates(Request $request): void
    {
        self::ensureSlipSchemaAndDefaults($this->db);

        $category = strtoupper(trim((string)$request->query('category', '')));
        $templates = [];
        try {
            $sql = 'SELECT * FROM slip_templates WHERE is_active = 1 ';
            $params = [];
            if (!empty($category) && $category !== 'ALL') {
                $sql .= 'AND UPPER(category) = :cat ';
                $params['cat'] = $category;
            }
            $sql .= 'ORDER BY display_order ASC, name ASC';
            $rows = $this->db->fetchAll($sql, $params);
            foreach ($rows as $t) {
                $templates[] = self::formatSlipRow($t);
            }
        } catch (Throwable) {
        }

        Response::success([
            'count' => count($templates),
            'templates' => $templates,
        ]);
    }

    /**
     * GET /api/verification/banks/modification
     */
    public function modificationBanks(Request $request): void
    {
        SchemaSync::syncModificationCatalog($this->db);

        $rows = $this->db->fetchAll(
            'SELECT enrollment_type, label, selling_price FROM modification_bvn_types WHERE is_active = 1 ORDER BY label ASC'
        );

        if (empty($rows)) {
            $adapter = new TwoSureVerifyAdapter();
            if ($adapter->hasCredentials()) {
                $res = $adapter->getBvnModificationBanks();
                $list = $res['data'] ?? $res['banks'] ?? $res['enrollment_types'] ?? [];
                if (!empty($res['success']) && is_array($list)) {
                    $banks = [];
                    foreach ($list as $entry) {
                        if (!is_array($entry)) {
                            continue;
                        }
                        $typeCode = trim((string)($entry['enrollment_type'] ?? $entry['bank_code'] ?? $entry['code'] ?? $entry['name'] ?? $entry['bank_name'] ?? ''));
                        $label = trim((string)($entry['label'] ?? $entry['name'] ?? $entry['bank_name'] ?? $typeCode));
                        if ($typeCode === '') {
                            continue;
                        }
                        $wholesale = is_numeric($entry['price'] ?? $entry['cost'] ?? null) ? (float)$entry['price'] ?? (float)$entry['cost'] : 0.0;
                        $selling = $wholesale > 0 ? max($wholesale, round($wholesale + max(2500.0, $wholesale * 0.25), -2)) : 17500.0;
                        $banks[] = [
                            'enrollment_type' => $typeCode,
                            'bank_name' => $label,
                            'price' => $selling,
                        ];
                    }
                    if (!empty($banks)) {
                        Response::success(['data' => $banks]);
                    }
                }
            }
        }

        $banks = array_map(static function ($r) {
            return [
                'enrollment_type' => (string)$r['enrollment_type'],
                'bank_name' => (string)$r['label'],
                'price' => (float)$r['selling_price'],
            ];
        }, $rows);

        Response::success(['data' => $banks]);
    }

    /**
     * GET /api/verification/banks/enrollment
     * Returns honest unsupported status — no unverified BVN enrolment banks may be fabricated.
     */
    public function enrollmentBanks(Request $request): void
    {
        Response::success([
            'data' => [],
            'supported' => false,
            'status' => 'not_yet_supported',
            'message' => 'BVN Enrolment bank endpoints are not yet supported on the active provider.',
        ]);
    }

    /**
     * GET /api/verification/status/:ref
     */
    public function checkStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ref = trim((string)($params['ref'] ?? ''));
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));

        $record = $this->db->fetchOne(
            'SELECT * FROM verification_records WHERE reference = :ref OR id = :id LIMIT 1',
            ['ref' => $ref, 'id' => $ref]
        );
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isAdmin && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification record.');
        }

        $record['cost'] = (float)($record['cost'] ?? 0);
        $record['has_slip'] = (bool)($record['has_slip'] ?? false);
        $record['fulfilment_mode'] = (string)($record['fulfilment_mode'] ?? 'provider_instant');

        $hasLegacyPdf = false;
        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $decodedRes = json_decode($record['result_data'], true);
            if (is_array($decodedRes)) {
                [$rowBvn, $rowNin] = $this->detectRecordDomain((string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                $decodedRes = $this->stripCrossTypeFields($decodedRes, $rowBvn, $rowNin);
                if (!$isAdmin) {
                    $decodedRes = $this->sanitizeResultForCustomer($decodedRes, (string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                }
                $hasLegacyPdf = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
                unset($decodedRes['pdf_base64']);
            }
            $record['result'] = $decodedRes;
        }
        unset($record['result_data']);
        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $record, 'verification', $isAdmin);
        $record = array_merge($record, $resultMeta);
        $record['has_result_document'] = !empty($resultMeta['has_result_document']);
        $record['has_original_pdf'] = !empty($resultMeta['has_result_document']) || $hasLegacyPdf;

        if (!$isAdmin) {
            unset(
                $record['provider'],
                $record['provider_cost'],
                $record['internal_fulfilment_cost'],
                $record['routing_snapshot'],
                $record['last_dispatch_error'],
                $record['dispatch_locked_at'],
                $record['dispatch_attempts'],
                $record['claimed_by'],
                $record['claimed_at'],
                $record['completion_approved_by'],
                $record['completion_approved_at'],
                $record['admin_notes'],
                $record['provider_reference'],
                $record['provider_transaction_id'],
                $record['provider_status']
            );
            if (!empty($record['provider_remarks'])) {
                $record['provider_remarks'] = null;
            }
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
            $record['internal_fulfilment_cost'] = (float)($record['internal_fulfilment_cost'] ?? 0);
        }

        $record['result_availability_state'] = $this->resolveResultAvailabilityState(
            (string)($record['status'] ?? ''),
            (bool)$record['has_original_pdf'],
            !empty($record['result'])
        );

        Response::success([
            'status' => $record['status'],
            'record_status' => $record['status'],
            'fulfilment_mode' => $record['fulfilment_mode'],
            'sla_due_at' => $record['sla_due_at'] ?? null,
            'has_original_pdf' => $record['has_original_pdf'],
            'has_result_document' => $record['has_result_document'],
            'result_document' => $record['result_document'] ?? null,
            'result_availability_state' => $record['result_availability_state'],
            'record' => $record,
        ]);
    }

    /**
     * POST /api/verification/:id/poll
     * Polls asynchronous verification status (e.g. bvn_retrieval via 2SureVerify /api/v1/bvn_retrieval_status.php).
     * Never executes external calls for internal_manual orders.
     */
    public function pollStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $isStaff = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));

        $record = $this->db->fetchOne(
            'SELECT * FROM verification_records WHERE id = :id OR reference = :ref LIMIT 1',
            ['id' => $id, 'ref' => $id]
        );
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isStaff && (string)$record['user_id'] !== (string)$user['id']) {
            Response::forbidden('Unauthorized access to verification record.');
        }

        $this->executeVerificationPoll($record, $isStaff);
    }

    /**
     * POST /api/admin/verification/:id/poll
     */
    public function adminPollStatus(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'manual_fulfilment']);
        $id = trim((string)($params['id'] ?? ''));
        $record = $this->db->fetchOne(
            'SELECT * FROM verification_records WHERE id = :id OR reference = :ref LIMIT 1',
            ['id' => $id, 'ref' => $id]
        );
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        $this->executeVerificationPoll($record, true, $admin);
    }

    private function executeVerificationPoll(array $record, bool $isAdmin, ?array $actor = null): void
    {
        if (FulfilmentRouterService::isInternalManualOrder($record)) {
            Response::error('Internal manual orders are processed by the HAMBAK MANUAL fulfilment desk and cannot be polled against external providers.', 422);
        }

        $currentStatus = strtolower(trim((string)($record['status'] ?? 'pending')));
        if (in_array($currentStatus, ['completed', 'failed', 'refunded'], true)) {
            $decoded = !empty($record['result_data']) && is_string($record['result_data']) ? json_decode($record['result_data'], true) : null;
            if (is_array($decoded)) {
                [$rowBvn, $rowNin] = $this->detectRecordDomain((string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                $decoded = $this->stripCrossTypeFields($decoded, $rowBvn, $rowNin);
                if (!$isAdmin) {
                    $decoded = $this->sanitizeResultForCustomer($decoded, (string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                }
            }
            $record['result'] = $decoded;
            unset($record['result_data']);
            if (!$isAdmin) {
                unset($record['provider'], $record['provider_cost'], $record['internal_fulfilment_cost'], $record['routing_snapshot']);
            }
            Response::success([
                'status' => $record['status'],
                'pending' => false,
                'record' => $record,
                'result' => $decoded,
            ], 'Verification status is already finalized.');
            return;
        }

        $adapter = new TwoSureVerifyAdapter();
        if (!$adapter->hasCredentials()) {
            Response::error(Security::ERR_PROVIDER_AUTH, 503);
        }

        $routerService = new FulfilmentRouterService($this->db);
        if (!$routerService->acquireDispatchLock('verification_records', (string)$record['id'])) {
            Response::error('Status check is already in progress. Please wait a moment and try again.', 409);
        }

        $lastErr = null;
        try {
            $provRef = trim((string)($record['provider_reference'] ?? '')) ?: (string)$record['reference'];
            $provTxId = trim((string)($record['provider_transaction_id'] ?? ''));
            $res = $adapter->checkStatus($provRef, (string)($record['service_key'] ?? ''), $provTxId !== '' ? $provTxId : null);

            $nested = is_array($res['data'] ?? null) ? $res['data'] : [];
            $statusLower = strtolower(trim((string)($res['status'] ?? $nested['status'] ?? '')));
            [$isBvn, $isNin] = $this->detectRecordDomain((string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));

            $isStillPending = empty($res['success']) && in_array($statusLower, ['pending', 'processing', 'queued', 'submitted', 'in_progress'], true)
                || (!empty($res['pending']))
                || (!empty($nested['pending']))
                || in_array($statusLower, ['pending', 'processing', 'queued', 'submitted', 'in_progress'], true);

            if ($isStillPending) {
                $pStat = $statusLower !== '' ? $statusLower : 'pending';
                $this->db->execute(
                    'UPDATE verification_records SET provider_status = :pstat, updated_at = NOW() WHERE id = :id',
                    ['pstat' => $pStat, 'id' => $record['id']]
                );
                $routerService->releaseDispatchLock('verification_records', (string)$record['id'], null);
                Response::success([
                    'status' => 'pending',
                    'pending' => true,
                    'provider_status' => $isAdmin ? $pStat : 'processing',
                    'record_id' => $record['id'],
                    'reference' => $record['reference'],
                ], 'Request is still being processed by the upstream registry. Please check again shortly.');
                return;
            }

            $isConfirmedFail = in_array($statusLower, ['failed', 'rejected', 'not_found', 'no_record', 'cancelled'], true)
                || !empty($res['provider_refunded']);

            if (!empty($res['success'])) {
                $normalized = $this->extractNormalizedIdentity($res, $isBvn, $isNin);
                if ($this->hasSubstantiveIdentityData($normalized, $isBvn)) {
                    $encoded = json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '{}';
                    $pCost = isset($res['provider_cost']) && is_numeric($res['provider_cost'])
                        ? (float)$res['provider_cost']
                        : (float)($record['provider_cost'] ?? 0);

                    $this->db->execute(
                        'UPDATE verification_records
                         SET status = "completed", has_slip = 1, provider_cost = :pc,
                             provider_status = "completed", result_data = :rd,
                             completed_at = NOW(), updated_at = NOW()
                         WHERE id = :id',
                        ['pc' => $pCost, 'rd' => $encoded, 'id' => $record['id']]
                    );
                    $routerService->releaseDispatchLock('verification_records', (string)$record['id'], null);

                    try {
                        (new ReferralEngineService($this->db))->recordQualifyingTransaction([
                            'user_id' => (string)$record['user_id'],
                            'service_category' => $isBvn ? 'bvn_verification' : 'nin_verification',
                            'service_key' => (string)$record['service_key'],
                            'source_reference' => (string)$record['reference'],
                            'gross_amount' => (float)$record['cost'],
                            'wholesale_cost' => $pCost,
                            'gateway_fee' => 0.0,
                        ]);
                    } catch (Throwable) {
                    }

                    $out = $isAdmin ? $normalized : $this->sanitizeResultForCustomer($normalized, (string)$record['service_key'], (string)$record['type']);
                    Response::success([
                        'status' => 'completed',
                        'pending' => false,
                        'verification_id' => $record['id'],
                        'reference' => $record['reference'],
                        'result' => $out,
                        'has_original_pdf' => !empty($out['pdf_base64']) || !empty($out['pdf_url']),
                    ], 'Verification completed successfully!');
                    return;
                }
            }

            if ($isConfirmedFail) {
                $refundRef = 'REFUND_' . $record['reference'];
                $refundResult = $this->walletService->attemptConfirmedRefund(
                    (string)$record['user_id'],
                    (float)$record['cost'],
                    'refund',
                    $refundRef,
                    "Automatic refund for failed async verification {$record['reference']}",
                    ['reference' => $record['reference'], 'service_key' => $record['service_key']]
                );
                $refundConfirmed = !empty($refundResult['confirmed']);
                $rawMsg = trim((string)($res['message'] ?? 'Async verification failed upstream.'));
                $this->db->execute(
                    'UPDATE verification_records
                     SET status = "failed", has_slip = 0, provider_cost = 0.00,
                         provider_status = :pstat, refund_reference = :rref,
                         last_dispatch_error = :lerr, updated_at = NOW(), result_data = :rd
                     WHERE id = :id',
                    [
                        'pstat' => $statusLower !== '' ? $statusLower : 'failed',
                        'rref' => $refundConfirmed ? $refundRef : null,
                        'lerr' => substr($rawMsg, 0, 1000),
                        'rd' => json_encode([
                            'error' => Security::sanitizeCustomerError($rawMsg, Security::ERR_PROVIDER_UNAVAILABLE),
                            'refund_confirmed' => $refundConfirmed,
                            'refund_reference' => $refundConfirmed ? $refundRef : null,
                        ]),
                        'id' => $record['id'],
                    ]
                );
                $routerService->releaseDispatchLock('verification_records', (string)$record['id'], $rawMsg);
                Response::success([
                    'status' => 'failed',
                    'pending' => false,
                    'refunded' => $refundConfirmed,
                    'refund_reference' => $refundConfirmed ? $refundRef : null,
                    'message' => $refundConfirmed ? Security::ERR_TXN_REFUNDED : Security::ERR_TXN_REFUND_PENDING,
                ], $refundConfirmed ? Security::ERR_TXN_REFUNDED : Security::ERR_TXN_REFUND_PENDING);
                return;
            }

            // Ambiguous / transient provider response — keep pending and never auto-fail or double-charge
            $routerService->releaseDispatchLock('verification_records', (string)$record['id'], (string)($res['message'] ?? ''));
            Response::success([
                'status' => 'pending',
                'pending' => true,
                'record_id' => $record['id'],
                'reference' => $record['reference'],
            ], 'Status check complete; request remains pending.');
        } catch (Throwable $e) {
            $lastErr = $e->getMessage();
            $routerService->releaseDispatchLock('verification_records', (string)$record['id'], $lastErr);
            Response::error(Security::ERR_PROVIDER_UNAVAILABLE, 502);
        }
    }

    /**
     * GET /api/verification/recover?idempotency_key=...&reference=...
     */
    public function recover(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));
        $ikey = trim((string)$request->query('idempotency_key', ''));
        $ref = trim((string)$request->query('reference', ''));

        if ($ikey === '' && $ref === '') {
            Response::error('Please provide an idempotency_key or reference to check recovery.', 422);
        }

        $record = null;
        if ($ikey !== '') {
            $meta = $this->db->fetchOne(
                'SELECT id FROM verification_records WHERE user_id = :uid AND idempotency_key = :ikey ORDER BY created_at DESC LIMIT 1',
                ['uid' => $user['id'], 'ikey' => substr($ikey, 0, 120)]
            );
            if ($meta) {
                $record = $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id LIMIT 1', ['id' => $meta['id']]);
            }
        }
        if (!$record && $ref !== '') {
            $meta = $isAdmin
                ? $this->db->fetchOne(
                    'SELECT id FROM verification_records WHERE reference = :ref OR id = :id LIMIT 1',
                    ['ref' => $ref, 'id' => $ref]
                )
                : $this->db->fetchOne(
                    'SELECT id FROM verification_records WHERE user_id = :uid AND (reference = :ref OR id = :id) LIMIT 1',
                    ['uid' => $user['id'], 'ref' => $ref, 'id' => $ref]
                );
            if ($meta) {
                $record = $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id LIMIT 1', ['id' => $meta['id']]);
            }
        }

        $targetUserId = $record ? (string)$record['user_id'] : (string)$user['id'];
        $wallet = $this->db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $targetUserId]);
        $bal = $wallet ? (float)$wallet['balance'] : (float)($user['wallet_balance'] ?? 0);

        if (!$record) {
            Response::success([
                'found' => false,
                'status' => 'not_found',
                'record_status' => 'not_found',
                'balance_after' => $bal,
                'newBalance' => $bal,
                'record' => null,
                'result' => null,
            ], 'No matching verification transaction was recorded for this attempt.');
            return;
        }

        $record['cost'] = (float)($record['cost'] ?? 0);
        $record['has_slip'] = (bool)($record['has_slip'] ?? false);
        $decodedRes = null;
        $hasLegacyPdf = false;
        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $decodedRes = json_decode($record['result_data'], true);
            if (is_array($decodedRes)) {
                [$rowBvn, $rowNin] = $this->detectRecordDomain((string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                $decodedRes = $this->stripCrossTypeFields($decodedRes, $rowBvn, $rowNin);
                if (!$isAdmin) {
                    $decodedRes = $this->sanitizeResultForCustomer($decodedRes, (string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                }
                $hasLegacyPdf = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
                unset($decodedRes['pdf_base64']);
            }
        }
        $record['fulfilment_mode'] = (string)($record['fulfilment_mode'] ?? 'provider_instant');
        $record['result'] = $decodedRes;
        unset($record['result_data']);
        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $record, 'verification', $isAdmin);
        $record = array_merge($record, $resultMeta);
        $hasOriginalPdf = !empty($resultMeta['has_result_document']) || $hasLegacyPdf;
        $record['has_original_pdf'] = $hasOriginalPdf;
        $record['has_result_document'] = !empty($resultMeta['has_result_document']);
        if (!$isAdmin) {
            unset(
                $record['provider'],
                $record['provider_cost'],
                $record['internal_fulfilment_cost'],
                $record['routing_snapshot'],
                $record['last_dispatch_error'],
                $record['dispatch_locked_at'],
                $record['dispatch_attempts'],
                $record['claimed_by'],
                $record['claimed_at'],
                $record['completion_approved_by'],
                $record['completion_approved_at'],
                $record['admin_notes'],
                $record['provider_reference'],
                $record['provider_transaction_id'],
                $record['provider_status']
            );
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
            $record['internal_fulfilment_cost'] = (float)($record['internal_fulfilment_cost'] ?? 0);
        }

        $slipName = null;
        if (!empty($record['slip_type'])) {
            try {
                $tpl = $this->db->fetchOne(
                    'SELECT name FROM slip_templates WHERE slip_code = :c OR id = :id LIMIT 1',
                    ['c' => $record['slip_type'], 'id' => $record['slip_type']]
                );
                if ($tpl) {
                    $slipName = (string)$tpl['name'];
                }
            } catch (Throwable) {
            }
        }

        $ledgerTx = [];
        try {
            $ledgerTx = $this->db->fetchAll(
                'SELECT id, type, amount, balance_before, balance_after, category, reference, status, description, created_at
                 FROM transactions WHERE user_id = :uid AND (reference = :ref1 OR reference = :ref2) ORDER BY created_at DESC',
                [
                    'uid' => $targetUserId,
                    'ref1' => $record['reference'],
                    'ref2' => 'REFUND_' . $record['reference'],
                ]
            );
        } catch (Throwable) {
        }

        $availabilityState = $this->resolveResultAvailabilityState(
            (string)($record['status'] ?? ''),
            $hasOriginalPdf,
            !empty($decodedRes)
        );
        $record['result_availability_state'] = $availabilityState;

        Response::success([
            'found' => true,
            'status' => $record['status'],
            'record_status' => $record['status'],
            'fulfilment_mode' => $record['fulfilment_mode'],
            'sla_due_at' => $record['sla_due_at'] ?? null,
            'recordId' => $record['id'],
            'reference' => $record['reference'],
            'slip_type' => $record['slip_type'],
            'slip_name' => $slipName,
            'has_original_pdf' => $hasOriginalPdf,
            'has_result_document' => $record['has_result_document'],
            'result_document' => $record['result_document'] ?? null,
            'result_availability_state' => $availabilityState,
            'balance_after' => $bal,
            'newBalance' => $bal,
            'record' => $record,
            'result' => $decodedRes,
            'ledger_transactions' => $ledgerTx,
        ], 'Verification recovery status retrieved.');
    }

    /**
     * GET /api/verification/record/:id
     */
    public function getRecord(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $isAdmin = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));

        $record = $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id OR reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isAdmin && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification record.');
        }

        $record['cost'] = (float)$record['cost'];
        $record['has_slip'] = (bool)$record['has_slip'];
        $record['fulfilment_mode'] = (string)($record['fulfilment_mode'] ?? 'provider_instant');
        $hasLegacyPdf = false;
        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $decodedRes = json_decode($record['result_data'], true);
            if (is_array($decodedRes)) {
                [$rowBvn, $rowNin] = $this->detectRecordDomain((string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                $decodedRes = $this->stripCrossTypeFields($decodedRes, $rowBvn, $rowNin);
                if (!$isAdmin) {
                    $decodedRes = $this->sanitizeResultForCustomer($decodedRes, (string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
                }
                $hasLegacyPdf = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
                unset($decodedRes['pdf_base64']);
            }
            $record['result'] = $decodedRes;
        }
        unset($record['result_data']);
        $resultMeta = ResultDocumentService::formatResultMetadata($this->db, $record, 'verification', $isAdmin);
        $record = array_merge($record, $resultMeta);
        $record['has_result_document'] = !empty($resultMeta['has_result_document']);
        $record['has_original_pdf'] = !empty($resultMeta['has_result_document']) || $hasLegacyPdf;
        if (!$isAdmin) {
            unset(
                $record['provider'],
                $record['provider_cost'],
                $record['internal_fulfilment_cost'],
                $record['routing_snapshot'],
                $record['last_dispatch_error'],
                $record['dispatch_locked_at'],
                $record['dispatch_attempts'],
                $record['claimed_by'],
                $record['claimed_at'],
                $record['completion_approved_by'],
                $record['completion_approved_at'],
                $record['admin_notes'],
                $record['provider_reference'],
                $record['provider_transaction_id'],
                $record['provider_status']
            );
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
            $record['internal_fulfilment_cost'] = (float)($record['internal_fulfilment_cost'] ?? 0);
        }

        $record['result_availability_state'] = $this->resolveResultAvailabilityState(
            (string)($record['status'] ?? ''),
            (bool)$record['has_original_pdf'],
            !empty($record['result'])
        );

        Response::success([
            'has_original_pdf' => $record['has_original_pdf'],
            'has_result_document' => $record['has_result_document'],
            'result_document' => $record['result_document'] ?? null,
            'result_availability_state' => $record['result_availability_state'],
            'record' => $record,
        ]);
    }

    /**
     * GET /api/verification/record/:id/pdf
     */
    public function downloadPdf(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $isStaff = Auth::isAdmin($user) && (Auth::hasPermission($user, 'services') || Auth::hasPermission($user, 'manual_fulfilment'));

        $record = $this->db->fetchOne('SELECT id, user_id, type, service_key, reference, result_document_id, result_data FROM verification_records WHERE id = :id OR reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isStaff && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification document.');
        }

        if (!empty($record['result_document_id'])) {
            $forceDownload = filter_var($request->query('download', false), FILTER_VALIDATE_BOOLEAN);
            ResultDocumentService::streamResultDocument($this->db, $user, 'verification', (string)$record['id'], $forceDownload);
            return;
        }

        $decoded = !empty($record['result_data']) ? json_decode((string)$record['result_data'], true) : null;
        $b64 = is_array($decoded) ? (string)($decoded['pdf_base64'] ?? '') : '';
        $binary = null;

        if ($b64 !== '') {
            $validated = ResultDocumentService::decodeAndValidatePdfBase64($b64, 'application/pdf');
            if ($validated['ok'] && is_string($validated['bytes'])) {
                $binary = $validated['bytes'];
            }
        }

        if ($binary === null && is_array($decoded) && !empty($decoded['pdf_url']) && is_string($decoded['pdf_url'])) {
            $adapter = new TwoSureVerifyAdapter();
            $fetched = ResultDocumentService::downloadRemotePdfSafely($decoded['pdf_url'], $adapter->getAuthHeaders());
            if ($fetched['ok'] && is_string($fetched['bytes'])) {
                $binary = $fetched['bytes'];
            }
        }

        if ($binary === null) {
            Response::notFound('Original provider PDF document is not attached to this record.');
        }

        [$isBvnDoc] = $this->detectRecordDomain((string)($record['service_key'] ?? ''), (string)($record['type'] ?? ''));
        $prefix = $isBvnDoc ? 'HAMBAKTECH_BVN_SLIP_' : 'HAMBAKTECH_NIN_SLIP_';
        $safeFilename = ResultDocumentService::sanitizePdfFilename($prefix . (string)($record['reference'] ?: $record['id']) . '.pdf');

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
        header('Content-Length: ' . strlen($binary));
        header('Cache-Control: private, no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        echo $binary;
        exit;
    }

    public function banks(Request $request): void
    {
        $banks = [
            ['name' => 'Access Bank', 'code' => '044'],
            ['name' => 'First Bank of Nigeria', 'code' => '011'],
            ['name' => 'Guaranty Trust Bank (GTBank)', 'code' => '058'],
            ['name' => 'United Bank for Africa (UBA)', 'code' => '033'],
            ['name' => 'Zenith Bank', 'code' => '057'],
            ['name' => 'Moniepoint Microfinance Bank', 'code' => '50515'],
            ['name' => 'OPay (PayCom)', 'code' => '999992'],
            ['name' => 'Kuda Bank', 'code' => '50211'],
            ['name' => 'Palmpay', 'code' => '999991'],
            ['name' => 'Fidelity Bank', 'code' => '070'],
            ['name' => 'Stanbic IBTC Bank', 'code' => '221'],
            ['name' => 'Union Bank', 'code' => '032'],
            ['name' => 'Sterling Bank', 'code' => '232'],
            ['name' => 'Wema Bank (ALAT)', 'code' => '035'],
        ];
        Response::success(['banks' => $banks]);
    }
}
