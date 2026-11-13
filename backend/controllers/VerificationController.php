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
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
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
                 WHERE service_key = "bvn_retrieval"',
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
        if (str_contains($c, 'bvn')) return 'bvn_verification';
        if (str_contains($c, 'mod')) return 'nin_modification';
        if (str_contains($c, 'enrol')) return 'enrolment';
        if (str_contains($c, 'add') || str_contains($c, 'ipe') || str_contains($c, 'clearance') || str_contains($c, 'personal')) {
            return 'additional_services';
        }
        return 'nin_verification';
    }

    private function extractNormalizedIdentity(array $providerResult): array
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
        $bvn = $merged['bvn'] ?? $merged['BVN'] ?? null;
        $dob = $merged['birthdate'] ?? $merged['dateOfBirth'] ?? $merged['date_of_birth'] ?? $merged['dob'] ?? null;
        $gender = $merged['gender'] ?? $merged['sex'] ?? null;
        $phone = $merged['telephoneno']
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
        $state = $merged['residence_state'] ?? $merged['stateOfResidence'] ?? $merged['state'] ?? $merged['stateOfOrigin'] ?? null;
        $lga = $merged['residence_lga'] ?? $merged['lgaOfResidence'] ?? $merged['lga'] ?? $merged['lgaOfOrigin'] ?? null;
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
        return $merged;
    }

    private function sanitizeCustomerError(string $message): string
    {
        $clean = preg_replace('/https?:\/\/\S+/i', '', $message) ?? $message;
        $clean = str_ireplace(['2sureverify', 'veripine', 'ulamadata', 'api_key', 'twosureverify_api_key'], 'verification gateway', $clean);
        return trim($clean) ?: 'Identity verification could not be completed at this moment.';
    }

    private function sanitizeResultForCustomer(array $data): array
    {
        unset(
            $data['provider'],
            $data['provider_id'],
            $data['provider_cost'],
            $data['wholesale_cost'],
            $data['raw_error'],
            $data['endpoint'],
            $data['api_url'],
            $data['api_key'],
            $data['amount_charged'],
            $data['balance_before'],
            $data['balance_after'],
            $data['wallet_balance'],
            $data['provider_balance'],
            $data['commission'],
            $data['charge']
        );
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

        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $activeProvider = $this->resolveActiveProviderId();

        if ($isAdmin) {
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.wholesale_cost, s.selling_price,
                        s.provider_id as provider, s.endpoint, s.is_active as enabled,
                        s.required_fields, s.slip_type_supported, c.name as category_name, c.code as category_code
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
        } else {
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.selling_price,
                        s.is_active as enabled, s.required_fields, s.slip_type_supported, c.name as category_name, c.code as category_code
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
            'enrolment' => [],
            'additional_services' => [],
        ];

        foreach ($rows as &$r) {
            $r['selling_price'] = (float)$r['selling_price'];
            $r['price'] = $r['selling_price'];
            $r['enabled'] = (bool)$r['enabled'];
            $r['slip_type_supported'] = (bool)$r['slip_type_supported'];
            if ($isAdmin) {
                $r['wholesale_cost'] = (float)$r['wholesale_cost'];
                $r['margin'] = round($r['selling_price'] - $r['wholesale_cost'], 2);
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

        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        // Enforce explicit NDPR/NIMC authorization consent
        $rawConsent = $request->input('consent', false);
        $consentAccepted = filter_var($rawConsent, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
        if (!$consentAccepted) {
            Response::error('Legal authorization consent is required before submitting an identity verification request.', 422);
        }

        $nestedPayload = $request->input('payload', []);
        $allInputs = array_merge($request->getBody(), is_array($nestedPayload) ? $nestedPayload : []);

        $serviceKey = trim((string)($request->input('serviceKey') ?? $request->input('service_key', '')));
        $searchType = strtolower(trim((string)($allInputs['search_type'] ?? $request->input('search_type', ''))));
        if ($serviceKey === '' || $serviceKey === 'nin_verify') {
            if (in_array($searchType, ['demo', 'demographic', 'demo_v1'], true)) {
                $serviceKey = 'demo_v1';
            } elseif (in_array($searchType, ['phone', 'phone_number', 'phone_v1'], true)) {
                $serviceKey = 'phone_v1';
            } else {
                $serviceKey = 'nin_v1';
            }
        } elseif ($serviceKey === 'bvn_verify') {
            if (in_array($searchType, ['phone', 'phone_number', 'bvn_phone', 'bvn_retrieval'], true)) {
                $serviceKey = 'bvn_retrieval';
            } else {
                $serviceKey = 'bvn_v1';
            }
        }

        $slipTemplateId = trim((string)($allInputs['slip_template_id'] ?? $request->input('slip_template_id', '')));
        $defaultSlipFallback = str_starts_with(strtolower($serviceKey), 'bvn_') ? 'bvnBasic' : 'ninStandard';
        $slipTypeInput = trim((string)($allInputs['slip_type'] ?? $request->input('slip_type', $defaultSlipFallback)));
        $tier = trim((string)($allInputs['tier'] ?? $request->input('tier', 'standard')));
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

        $resolvedSlipCode = $slipTypeInput ?: ($isBvnVerification ? 'bvnBasic' : 'ninStandard');
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
                Response::error('Selected slip type was not found.', 422);
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
                        if (!$isAdmin && is_array($decodedRes)) {
                            $decodedRes = $this->sanitizeResultForCustomer($decodedRes);
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

        // 4. Determine configured provider chain (priority + fallback) and ensure credentials exist before debiting wallet
        $routing = $this->resolveProviderChain($categoryKey, $service['provider_id'] ?? null);
        $providerChain = $routing['chain'];
        $adapters = $routing['adapters'];

        if (empty($providerChain)) {
            Response::error(
                'Verification service is temporarily unavailable because gateway credentials are not configured.',
                503
            );
        }
        $usedProvider = $providerChain[0];

        $wholesaleCost = (float)$service['wholesale_cost'];
        $endpoint = (string)($service['endpoint'] ?? $serviceKey);

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
                ]
            );
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
            return;
        }

        // Insert initial pending record to lock idempotency_key against concurrent double clicks
        $recordId = Security::generateUuid();
        try {
            $this->db->execute(
                'INSERT INTO verification_records
                 (id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, idempotency_key, result_data, created_at)
                 VALUES
                 (:id, :uid, :type, :skey, :search, :prov, :cost, 0.00, "pending", :ref, :slip, 0, :ikey, NULL, NOW())',
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
                ]
            );
        } catch (Throwable) {
        }

        // 6. Dispatch to Real Upstream Provider Adapter (with configured priority & fallback)
        try {
            $payload = array_merge($allInputs, [
                'service_key' => $serviceKey,
                'search_value' => $searchValue,
                'slip_type' => $resolvedSlipCode,
                'tier' => $tier,
                'reference' => $reference,
            ]);

            $providerResult = null;
            $lastErrorMsg = 'Upstream identity verification failed.';
            $primaryErrorMsg = null;

            foreach ($providerChain as $idx => $candidateProv) {
                $usedProvider = $candidateProv;
                $candidateAdapter = $adapters[$candidateProv];
                $attemptPayload = $payload;
                if ($idx > 0) {
                    $attemptPayload['reference'] = $reference . '_FB' . $idx;
                }
                $attemptRes = $candidateAdapter->verify($endpoint, $attemptPayload);
                $attemptOk = !isset($attemptRes['success']) ? true : (bool)$attemptRes['success'];
                if (strtolower((string)($attemptRes['status'] ?? '')) === 'failed') {
                    $attemptOk = false;
                }
                if ($attemptOk) {
                    $providerResult = $attemptRes;
                    break;
                }
                $candidateMsg = trim((string)($attemptRes['message'] ?? ''));
                if ($idx === 0 && $candidateMsg !== '') {
                    $primaryErrorMsg = $candidateMsg;
                }
                $candLower = strtolower($candidateMsg);
                $isMerchantWalletErr = str_contains($candLower, 'insufficient') && (str_contains($candLower, 'balance') || str_contains($candLower, 'fund'));
                if ($isMerchantWalletErr) {
                    $candidateMsg = 'Identity gateway service is temporarily unavailable. Please try again shortly.';
                }
                if ($idx > 0 && $primaryErrorMsg !== null && str_contains(strtolower($primaryErrorMsg), 'no record found') && ($isMerchantWalletErr || str_contains($candLower, 'unavailable'))) {
                    $lastErrorMsg = $primaryErrorMsg;
                } elseif ($candidateMsg !== '') {
                    $lastErrorMsg = $candidateMsg;
                }
            }

            if ($providerResult === null) {
                throw new Exception($lastErrorMsg);
            }

            $resultData = $this->extractNormalizedIdentity($providerResult);
            $actualProviderCost = (float)($providerResult['provider_cost'] ?? $wholesaleCost);
            $verifiedAt = date('c');

            $customerSafeResult = $resultData;
            if (!$isAdmin && is_array($customerSafeResult)) {
                $customerSafeResult = $this->sanitizeResultForCustomer($customerSafeResult);
            }

            // 7. Update verification_records to completed
            $encodedRecordResult = json_encode(
                $resultData,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
            ) ?: '{}';

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

            $hasOriginalPdf = is_array($customerSafeResult)
                && (!empty($customerSafeResult['pdf_base64']) || !empty($customerSafeResult['pdf_url']));

            Response::success([
                'verification_id' => $recordId,
                'recordId' => $recordId,
                'reference' => $reference,
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
            $refundRef = 'REFUND_' . $reference;
            $refundResult = $this->walletService->credit(
                $user['id'],
                $cost,
                'manual_adjustment',
                $refundRef,
                "Automatic refund for failed verification {$reference}",
                'internal'
            );

            $this->db->execute(
                'UPDATE verification_records
                 SET type = "FAILED", provider_cost = 0.00, status = "failed", has_slip = 0, result_data = :result
                 WHERE id = :id',
                [
                    'result' => json_encode(['error' => $e->getMessage()]),
                    'id' => $recordId,
                ]
            );

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
                'error_message' => $e->getMessage(),
                'metadata' => ['slip_type' => $resolvedSlipCode, 'refund_reference' => $refundRef],
            ]);

            $displayError = $isAdmin ? $e->getMessage() : $this->sanitizeCustomerError($e->getMessage());
            Response::error(
                'Verification could not be completed: ' . $displayError . '. Your wallet has been automatically refunded.',
                502,
                [
                    'refunded' => true,
                    'refund_reference' => $refundRef,
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
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $selectCols = $isAdmin
            ? 'id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, result_data as result, created_at'
            : 'id, user_id, type, service_key, search_value, cost, status, reference, slip_type, has_slip, result_data as result, created_at';

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
            $r['has_slip'] = (bool)$r['has_slip'];
            $r['has_original_pdf'] = false;
            $r['has_photo'] = false;
            if (!empty($r['result']) && is_string($r['result'])) {
                $decodedRes = json_decode($r['result'], true);
                if (is_array($decodedRes)) {
                    if (!$isAdmin) {
                        $decodedRes = $this->sanitizeResultForCustomer($decodedRes);
                    }
                    $r['has_original_pdf'] = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
                    $r['has_photo'] = !empty($decodedRes['photo']);
                    unset($decodedRes['pdf_base64'], $decodedRes['photo']);
                    $r['result'] = $decodedRes;
                } else {
                    $r['result'] = null;
                }
            }
        }

        Response::success([
            'count' => count($rows),
            'history' => $rows,
            'verifications' => $rows,
        ]);
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
        $banks = [
            ['bank_name' => 'Access Bank', 'price' => 4500],
            ['bank_name' => 'First Bank of Nigeria', 'price' => 4500],
            ['bank_name' => 'Guaranty Trust Bank (GTBank)', 'price' => 4500],
            ['bank_name' => 'United Bank for Africa (UBA)', 'price' => 4500],
            ['bank_name' => 'Zenith Bank', 'price' => 4500],
            ['bank_name' => 'Fidelity Bank', 'price' => 4500],
            ['bank_name' => 'Union Bank', 'price' => 4500],
            ['bank_name' => 'Sterling Bank', 'price' => 4500],
            ['bank_name' => 'Wema Bank', 'price' => 4500],
        ];
        Response::success(['data' => $banks]);
    }

    /**
     * GET /api/verification/banks/enrollment
     */
    public function enrollmentBanks(Request $request): void
    {
        $banks = [
            ['bank_name' => 'First Bank BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'Access Bank BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'UBA BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'Zenith Bank BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'Wema Bank BVN Enrolment', 'price' => 3500],
        ];
        Response::success(['data' => $banks]);
    }

    /**
     * GET /api/verification/status/:ref
     */
    public function checkStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ref = trim((string)($params['ref'] ?? ''));
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

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
        $record['has_original_pdf'] = false;

        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $decodedRes = json_decode($record['result_data'], true);
            if (!$isAdmin && is_array($decodedRes)) {
                $decodedRes = $this->sanitizeResultForCustomer($decodedRes);
            }
            if (is_array($decodedRes)) {
                $record['has_original_pdf'] = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
            }
            $record['result'] = $decodedRes;
        }
        unset($record['result_data']);
        if (!$isAdmin) {
            unset($record['provider'], $record['provider_cost']);
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
        }

        Response::success([
            'status' => $record['status'],
            'record_status' => $record['status'],
            'has_original_pdf' => $record['has_original_pdf'],
            'record' => $record,
        ]);
    }

    /**
     * GET /api/verification/recover?idempotency_key=...&reference=...
     */
    public function recover(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
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
            $meta = $this->db->fetchOne(
                'SELECT id FROM verification_records WHERE user_id = :uid AND (reference = :ref OR id = :id) LIMIT 1',
                ['uid' => $user['id'], 'ref' => $ref, 'id' => $ref]
            );
            if ($meta) {
                $record = $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id LIMIT 1', ['id' => $meta['id']]);
            }
        }

        $wallet = $this->db->fetchOne('SELECT balance FROM wallets WHERE user_id = :uid', ['uid' => $user['id']]);
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
        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $decodedRes = json_decode($record['result_data'], true);
            if (!$isAdmin && is_array($decodedRes)) {
                $decodedRes = $this->sanitizeResultForCustomer($decodedRes);
            }
        }
        $hasOriginalPdf = is_array($decodedRes) && (!empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']));
        $record['has_original_pdf'] = $hasOriginalPdf;
        $record['result'] = $decodedRes;
        unset($record['result_data']);
        if (!$isAdmin) {
            unset($record['provider'], $record['provider_cost']);
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
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
                    'uid' => $user['id'],
                    'ref1' => $record['reference'],
                    'ref2' => 'REFUND_' . $record['reference'],
                ]
            );
        } catch (Throwable) {
        }

        Response::success([
            'found' => true,
            'status' => $record['status'],
            'record_status' => $record['status'],
            'recordId' => $record['id'],
            'reference' => $record['reference'],
            'slip_type' => $record['slip_type'],
            'slip_name' => $slipName,
            'has_original_pdf' => $hasOriginalPdf,
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
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $record = $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id OR reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isAdmin && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification record.');
        }

        $record['cost'] = (float)$record['cost'];
        $record['has_slip'] = (bool)$record['has_slip'];
        $record['has_original_pdf'] = false;
        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $decodedRes = json_decode($record['result_data'], true);
            if (!$isAdmin && is_array($decodedRes)) {
                $decodedRes = $this->sanitizeResultForCustomer($decodedRes);
            }
            if (is_array($decodedRes)) {
                $record['has_original_pdf'] = !empty($decodedRes['pdf_base64']) || !empty($decodedRes['pdf_url']);
            }
            $record['result'] = $decodedRes;
        }
        unset($record['result_data']);
        if (!$isAdmin) {
            unset($record['provider'], $record['provider_cost']);
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
        }

        Response::success([
            'has_original_pdf' => $record['has_original_pdf'],
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
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $record = $this->db->fetchOne('SELECT id, user_id, reference, result_data FROM verification_records WHERE id = :id OR reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isAdmin && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification document.');
        }

        $decoded = !empty($record['result_data']) ? json_decode((string)$record['result_data'], true) : null;
        $b64 = is_array($decoded) ? (string)($decoded['pdf_base64'] ?? '') : '';
        if ($b64 === '') {
            Response::notFound('Original provider PDF document is not attached to this record.');
        }
        $cleanB64 = preg_replace('/^data:application\/pdf;base64,/i', '', trim($b64)) ?? '';
        $binary = base64_decode($cleanB64, true);
        if ($binary === false || $binary === '') {
            Response::error('Stored PDF document could not be decoded.', 500);
        }

        $safeRef = preg_replace('/[^A-Za-z0-9_-]/', '_', (string)($record['reference'] ?: $record['id']));
        header('Access-Control-Allow-Origin: *');
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="HAMBAKTECH_VERIFICATION_' . $safeRef . '.pdf"');
        header('Content-Length: ' . strlen($binary));
        header('X-Content-Type-Options: nosniff');
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
