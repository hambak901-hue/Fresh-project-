<?php
/**
 * @file migrate.php
 * Automated JSON to MySQL Data Migration & Ingestion Utility
 * Seamlessly migrates server/db/data.json into MariaDB/MySQL without duplicates
 */

declare(strict_types=1);

namespace HambakTech\Database;

define('HAMBAKTECH_ROOT', dirname(__DIR__));
require_once HAMBAKTECH_ROOT . '/core/autoload.php';

use HambakTech\Core\Database;
use HambakTech\Core\Security;

class Migrator
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function run(): void
    {
        echo "=== [HAMBAKTECH ENTERPRISE] COMMENCING DATABASE MIGRATION ===" . PHP_EOL;

        $jsonFile = dirname(HAMBAKTECH_ROOT) . '/server/db/data.json';
        if (!file_exists($jsonFile)) {
            echo "[Notice] JSON data file not found at {$jsonFile}. Using initial bootstrap schema." . PHP_EOL;
            return;
        }

        $raw = file_get_contents($jsonFile);
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            echo "[Error] Invalid JSON payload in {$jsonFile}." . PHP_EOL;
            return;
        }

        $this->migrateProviders($data['provider_configs'] ?? []);
        $this->migrateUsers($data['users'] ?? []);
        $this->migrateIdentityServices($data['identity_services'] ?? []);
        $this->migrateTelecomPlans($data['telecom_plans'] ?? []);
        $this->migrateTransactions($data['transactions'] ?? []);
        $this->migrateVerifications($data['verifications'] ?? []);
        $this->migrateTelecomOrders($data['telecom_orders'] ?? []);
        $this->migrateBranding($data['branding'] ?? []);
        $this->migrateCmsSections($data['cms_sections'] ?? []);
        $this->migrateAnnouncements($data['announcements'] ?? []);
        $this->migrateFaqs($data['faqs'] ?? []);
        $this->migrateNavigation($data['navigation'] ?? []);
        $this->migrateDashboardModules($data['dashboard_modules'] ?? []);

        echo "=== [HAMBAKTECH ENTERPRISE] DATABASE MIGRATION COMPLETED SUCCESSFULLY ===" . PHP_EOL;
    }

    private function formatDate(?string $date): string
    {
        if (empty($date)) {
            return date('Y-m-d H:i:s');
        }
        $ts = strtotime($date);
        return $ts ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
    }

    private function migrateProviders(array $providers): void
    {
        echo "[1/13] Migrating Providers... ";
        $count = 0;
        foreach ($providers as $p) {
            $this->db->execute(
                'INSERT INTO providers (id, name, provider_type, base_url, api_key, is_active, is_default, timeout_seconds, balance, last_ping_status, last_ping_at, created_at)
                 VALUES (:id, :name, "identity", :url, :key, :active, :def, :to, 0.00, :status, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE name = :name2, base_url = :url2, api_key = :key2, is_active = :active2, is_default = :def2',
                [
                    'id' => $p['id'],
                    'name' => $p['name'],
                    'url' => $p['base_url'],
                    'key' => $p['api_key'] ?? '',
                    'active' => !empty($p['is_active']) ? 1 : 0,
                    'def' => !empty($p['is_default']) ? 1 : 0,
                    'to' => $p['timeout_seconds'] ?? 30,
                    'status' => $p['last_ping_status'] ?? 'operational',
                    'name2' => $p['name'],
                    'url2' => $p['base_url'],
                    'key2' => $p['api_key'] ?? '',
                    'active2' => !empty($p['is_active']) ? 1 : 0,
                    'def2' => !empty($p['is_default']) ? 1 : 0,
                ]
            );
            $count++;
        }

        // Ensure UlamaData, VTpass, and Paystack exist
        $defaults = [
            ['id' => 'ulamadata', 'name' => 'UlamaData Telecom API', 'type' => 'telecom', 'url' => 'https://ulamadata.com'],
            ['id' => 'vtpass', 'name' => 'VTpass Gateway (Secondary)', 'type' => 'telecom', 'url' => 'https://api-service.vtpass.com/api'],
            ['id' => 'paystack', 'name' => 'Paystack Merchant Checkout', 'type' => 'payment', 'url' => 'https://api.paystack.co'],
        ];
        foreach ($defaults as $d) {
            $this->db->execute(
                'INSERT INTO providers (id, name, provider_type, base_url, is_active, is_default, created_at)
                 VALUES (:id, :name, :type, :url, 1, 1, NOW())
                 ON DUPLICATE KEY UPDATE name = :name',
                ['id' => $d['id'], 'name' => $d['name'], 'type' => $d['type'], 'url' => $d['url']]
            );
        }
        echo "{$count} providers synced." . PHP_EOL;
    }

    private function migrateUsers(array $users): void
    {
        echo "[2/13] Migrating Users & Wallets... ";
        $count = 0;
        foreach ($users as $u) {
            $balance = (float)($u['wallet_balance'] ?? 0);
            $this->db->execute(
                'INSERT INTO users 
                 (id, email, password_hash, full_name, phone_number, role, kyc_status, tier, referral_code, status, avatar_url, created_at)
                 VALUES 
                 (:id, :email, :pass, :name, :phone, :role, :kyc, :tier, :ref, :st, :avatar, :created)
                 ON DUPLICATE KEY UPDATE full_name = :name2, phone_number = :phone2, wallet_balance = :bal',
                [
                    'id' => $u['id'],
                    'email' => strtolower($u['email']),
                    'pass' => $u['password_hash'],
                    'name' => $u['full_name'],
                    'phone' => $u['phone_number'],
                    'role' => $u['role'] ?? 'customer',
                    'kyc' => $u['kyc_status'] ?? 'unverified',
                    'tier' => $u['tier'] ?? 1,
                    'ref' => $u['referral_code'] ?? ('REF_' . $u['id']),
                    'st' => $u['status'] ?? 'active',
                    'avatar' => $u['avatar_url'] ?? null,
                    'created' => $this->formatDate($u['created_at'] ?? null),
                    'name2' => $u['full_name'],
                    'phone2' => $u['phone_number'],
                    'bal' => $balance,
                ]
            );

            // User Profile
            $this->db->execute(
                'INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, bio, created_at)
                 VALUES (:uid, :nin, :bvn, :addr, :st, :lga, :bio, NOW())
                 ON DUPLICATE KEY UPDATE nin = :nin2, bvn = :bvn2',
                [
                    'uid' => $u['id'],
                    'nin' => $u['nin'] ?? null,
                    'bvn' => $u['bvn'] ?? null,
                    'addr' => $u['address'] ?? null,
                    'st' => $u['state'] ?? null,
                    'lga' => $u['lga'] ?? null,
                    'bio' => $u['bio'] ?? null,
                    'nin2' => $u['nin'] ?? null,
                    'bvn2' => $u['bvn'] ?? null,
                ]
            );

            // Wallet
            $this->db->execute(
                'INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status, created_at)
                 VALUES (:id, :uid, :bal, "NGN", 0, "active", NOW())
                 ON DUPLICATE KEY UPDATE balance = :bal2',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $u['id'],
                    'bal' => $balance,
                    'bal2' => $balance,
                ]
            );
            $count++;
        }
        echo "{$count} users & wallets synced." . PHP_EOL;
    }

    private function migrateIdentityServices(array $services): void
    {
        echo "[3/13] Migrating Service Categories & Identity Catalogue... ";
        // Ensure Categories exist
        $cats = [
            'nin_verification' => 'NIN Verification',
            'bvn_verification' => 'BVN Verification',
            'nin_modification' => 'NIN Modification',
            'personalisation' => 'Personalisation',
            'enrolment' => 'Enrolment',
            'additional_services' => 'Additional Services',
        ];

        $catMap = [];
        $order = 1;
        foreach ($cats as $code => $name) {
            $catId = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO service_categories (id, code, name, display_order, is_active, created_at)
                 VALUES (:id, :code, :name, :order, 1, NOW())
                 ON DUPLICATE KEY UPDATE name = :name2',
                ['id' => $catId, 'code' => $code, 'name' => $name, 'order' => $order++, 'name2' => $name]
            );
            $existing = $this->db->fetchOne('SELECT id FROM service_categories WHERE code = :code', ['code' => $code]);
            $catMap[$name] = $existing['id'] ?? $catId;
        }

        $count = 0;
        foreach ($services as $s) {
            $catName = $s['category'] ?? 'NIN Verification';
            $catId = $catMap[$catName] ?? reset($catMap);

            $this->db->execute(
                'INSERT INTO service_catalogue 
                 (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active, created_at)
                 VALUES 
                 (:id, :cat_id, :skey, :name, :desc, :prov, :ep, :wcost, :price, :fields, :slip, :active, NOW())
                 ON DUPLICATE KEY UPDATE 
                 name = :name2, description = :desc2, wholesale_cost = :wcost2, selling_price = :price2, endpoint = :ep2, required_fields = :fields2',
                [
                    'id' => Security::generateUuid(),
                    'cat_id' => $catId,
                    'skey' => $s['key'],
                    'name' => $s['name'],
                    'desc' => $s['description'] ?? '',
                    'prov' => $s['provider'] ?? '2sureverify',
                    'ep' => $s['endpoint'] ?? '/api/v1/nin_v1.php',
                    'wcost' => $s['wholesale_cost'] ?? 0.00,
                    'price' => $s['selling_price'] ?? 0.00,
                    'fields' => json_encode($s['required_fields'] ?? []),
                    'slip' => !empty($s['slip_type_supported']) ? 1 : 0,
                    'active' => !empty($s['enabled']) ? 1 : 0,
                    'name2' => $s['name'],
                    'desc2' => $s['description'] ?? '',
                    'wcost2' => $s['wholesale_cost'] ?? 0.00,
                    'price2' => $s['selling_price'] ?? 0.00,
                    'ep2' => $s['endpoint'] ?? '/api/v1/nin_v1.php',
                    'fields2' => json_encode($s['required_fields'] ?? []),
                ]
            );
            $count++;
        }
        echo "{$count} services catalogued." . PHP_EOL;
    }

    private function migrateTelecomPlans(array $plans): void
    {
        echo "[4/13] Migrating Telecom Bundles... ";
        $count = 0;
        foreach ($plans as $p) {
            $this->db->execute(
                'INSERT INTO telecom_plans 
                 (id, provider_plan_id, network, name, size, plan_type, validity, wholesale_cost, price, is_active, provider_id, created_at)
                 VALUES 
                 (:id, :ppid, :net, :name, :size, :type, :val, :wcost, :price, :active, :prov, NOW())
                 ON DUPLICATE KEY UPDATE wholesale_cost = :wcost2, price = :price2',
                [
                    'id' => $p['id'],
                    'ppid' => (string)($p['provider_plan_id'] ?? $p['id']),
                    'net' => $p['network'],
                    'name' => $p['name'],
                    'size' => $p['size'],
                    'type' => $p['type'] ?? 'SME',
                    'val' => $p['validity'] ?? '30 Days',
                    'wcost' => $p['wholesale_cost'] ?? 0.00,
                    'price' => $p['price'] ?? 0.00,
                    'active' => !empty($p['enabled']) ? 1 : 0,
                    'prov' => $p['provider'] ?? 'ulamadata',
                    'wcost2' => $p['wholesale_cost'] ?? 0.00,
                    'price2' => $p['price'] ?? 0.00,
                ]
            );
            $count++;
        }
        echo "{$count} plans synced." . PHP_EOL;
    }

    private function migrateTransactions(array $txs): void
    {
        echo "[5/13] Migrating Financial Transactions & Immutable Ledger... ";
        $count = 0;
        foreach ($txs as $t) {
            $wallet = $this->db->fetchOne('SELECT id FROM wallets WHERE user_id = :uid', ['uid' => $t['user_id']]);
            $walletId = $wallet['id'] ?? null;

            $this->db->execute(
                'INSERT INTO transactions 
                 (id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, created_at)
                 VALUES 
                 (:id, :uid, :type, :amt, :before, :after, :cat, :ref, :gw, :st, :desc, :created)
                 ON DUPLICATE KEY UPDATE status = :st2',
                [
                    'id' => $t['id'],
                    'uid' => $t['user_id'],
                    'type' => $t['type'],
                    'amt' => $t['amount'],
                    'before' => $t['balance_before'] ?? 0.00,
                    'after' => $t['balance_after'] ?? 0.00,
                    'cat' => $t['category'] ?? 'funding',
                    'ref' => $t['reference'],
                    'gw' => $t['gateway'] ?? 'internal',
                    'st' => $t['status'] ?? 'successful',
                    'desc' => $t['description'] ?? '',
                    'created' => $this->formatDate($t['created_at'] ?? null),
                    'st2' => $t['status'] ?? 'successful',
                ]
            );

            // Populate Immutable Ledger if wallet exists
            if ($walletId) {
                $this->db->execute(
                    'INSERT IGNORE INTO wallet_ledger 
                     (id, wallet_id, user_id, entry_type, amount, balance_before, balance_after, reference, category, description, created_at)
                     VALUES 
                     (:id, :wid, :uid, :etype, :amt, :before, :after, :ref, :cat, :desc, :created)',
                    [
                        'id' => Security::generateUuid(),
                        'wid' => $walletId,
                        'uid' => $t['user_id'],
                        'etype' => strtoupper($t['type']),
                        'amt' => $t['amount'],
                        'before' => $t['balance_before'] ?? 0.00,
                        'after' => $t['balance_after'] ?? 0.00,
                        'ref' => $t['reference'],
                        'cat' => $t['category'] ?? 'funding',
                        'desc' => $t['description'] ?? '',
                        'created' => $this->formatDate($t['created_at'] ?? null),
                    ]
                );
            }
            $count++;
        }
        echo "{$count} transactions and ledger records journaled." . PHP_EOL;
    }

    private function migrateVerifications(array $verifications): void
    {
        echo "[6/13] Migrating Identity Verification Records... ";
        $count = 0;
        foreach ($verifications as $v) {
            $this->db->execute(
                'INSERT INTO verification_records 
                 (id, user_id, type, service_key, search_value, provider, cost, status, reference, result_data, created_at)
                 VALUES 
                 (:id, :uid, :type, :skey, :search, :prov, :cost, :st, :ref, :res, :created)
                 ON DUPLICATE KEY UPDATE status = :st2',
                [
                    'id' => $v['id'],
                    'uid' => $v['user_id'],
                    'type' => $v['type'] ?? 'NIN',
                    'skey' => $v['service_key'] ?? 'nin_v1',
                    'search' => $v['search_value'] ?? '12345678901',
                    'prov' => $v['provider'] ?? '2sureverify',
                    'cost' => $v['cost'] ?? 200.00,
                    'st' => $v['status'] ?? 'completed',
                    'ref' => $v['reference'] ?? ('VRF_' . $v['id']),
                    'res' => isset($v['result']) ? json_encode($v['result']) : null,
                    'created' => $this->formatDate($v['created_at'] ?? null),
                    'st2' => $v['status'] ?? 'completed',
                ]
            );
            $count++;
        }
        echo "{$count} verifications migrated." . PHP_EOL;
    }

    private function migrateTelecomOrders(array $orders): void
    {
        echo "[7/13] Migrating Telecom Orders... ";
        $count = 0;
        foreach ($orders as $o) {
            $this->db->execute(
                'INSERT INTO telecom_orders 
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, status, created_at)
                 VALUES 
                 (:id, :uid, :stype, :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :st, :created)
                 ON DUPLICATE KEY UPDATE status = :st2',
                [
                    'id' => $o['id'],
                    'uid' => $o['user_id'],
                    'stype' => $o['service'] ?? 'data',
                    'net' => $o['network'] ?? 'MTN',
                    'phone' => $o['phone'] ?? '',
                    'plan' => $o['plan'] ?? '10GB',
                    'amt' => $o['amount'] ?? 0.00,
                    'cost' => $o['cost_price'] ?? 0.00,
                    'profit' => $o['profit'] ?? 0.00,
                    'prov' => $o['provider'] ?? 'ulamadata',
                    'pref' => $o['provider_ref'] ?? ('ORD_' . $o['id']),
                    'st' => $o['status'] ?? 'successful',
                    'created' => $this->formatDate($o['created_at'] ?? null),
                    'st2' => $o['status'] ?? 'successful',
                ]
            );
            $count++;
        }
        echo "{$count} telecom orders recorded." . PHP_EOL;
    }

    private function migrateBranding(array $b): void
    {
        echo "[8/13] Migrating Website Branding... ";
        $this->db->execute(
            'INSERT INTO website_branding 
             (id, company_name, tagline, logo_url, favicon_url, primary_color, secondary_color, font_family, support_phone, support_email, office_address, whatsapp_number, social_links, footer_text, copyright_text, seo_title, seo_description, seo_keywords, updated_at)
             VALUES 
             ("brd_default", :name, :tag, :logo, :fav, :pcol, :scol, :font, :phone, :email, :addr, :wa, :soc, :foot, :copy, :stitle, :sdesc, :skey, NOW())
             ON DUPLICATE KEY UPDATE company_name = :name2, primary_color = :pcol2',
            [
                'name' => $b['company_name'] ?? 'HambakTech Enterprise',
                'tag' => $b['tagline'] ?? '',
                'logo' => $b['logo_url'] ?? '',
                'fav' => $b['favicon_url'] ?? '/favicon.ico',
                'pcol' => $b['primary_color'] ?? '#10b981',
                'scol' => $b['secondary_color'] ?? '#0284c7',
                'font' => $b['font_family'] ?? 'Plus Jakarta Sans',
                'phone' => $b['support_phone'] ?? '+234 803 000 1122',
                'email' => $b['support_email'] ?? 'support@hambaktech.com.ng',
                'addr' => $b['office_address'] ?? 'Plot 14 Commercial Ave, Ikeja, Lagos',
                'wa' => $b['whatsapp_number'] ?? '+2348030001122',
                'soc' => isset($b['social_links']) ? json_encode($b['social_links']) : null,
                'foot' => $b['footer_text'] ?? '',
                'copy' => $b['copyright_text'] ?? '',
                'stitle' => $b['seo_title'] ?? '',
                'sdesc' => $b['seo_description'] ?? '',
                'skey' => $b['seo_keywords'] ?? '',
                'name2' => $b['company_name'] ?? 'HambakTech Enterprise',
                'pcol2' => $b['primary_color'] ?? '#10b981',
            ]
        );
        echo "done." . PHP_EOL;
    }

    private function migrateCmsSections(array $sections): void
    {
        echo "[9/13] Migrating CMS Sections... ";
        $count = 0;
        foreach ($sections as $key => $val) {
            $this->db->execute(
                'INSERT INTO cms_sections (id, section_key, section_data, updated_at)
                 VALUES (:id, :skey, :data, NOW())
                 ON DUPLICATE KEY UPDATE section_data = :data2',
                [
                    'id' => Security::generateUuid(),
                    'skey' => $key,
                    'data' => json_encode($val),
                    'data2' => json_encode($val),
                ]
            );
            $count++;
        }
        echo "{$count} sections synced." . PHP_EOL;
    }

    private function migrateAnnouncements(array $announcements): void
    {
        echo "[10/13] Migrating Announcements... ";
        $count = 0;
        foreach ($announcements as $a) {
            $this->db->execute(
                'INSERT INTO announcements (id, title, content, category, is_pinned, status, author, created_at)
                 VALUES (:id, :title, :content, :cat, :pin, :st, :author, :created)
                 ON DUPLICATE KEY UPDATE title = :title2, content = :content2',
                [
                    'id' => $a['id'],
                    'title' => $a['title'],
                    'content' => $a['content'],
                    'cat' => $a['category'] ?? 'general',
                    'pin' => !empty($a['is_pinned']) ? 1 : 0,
                    'st' => $a['status'] ?? 'published',
                    'author' => $a['author'] ?? 'HambakTech Admin',
                    'created' => $this->formatDate($a['created_at'] ?? null),
                    'title2' => $a['title'],
                    'content2' => $a['content'],
                ]
            );
            $count++;
        }
        echo "{$count} announcements stored." . PHP_EOL;
    }

    private function migrateFaqs(array $faqs): void
    {
        echo "[11/13] Migrating FAQs... ";
        $count = 0;
        foreach ($faqs as $f) {
            $this->db->execute(
                'INSERT INTO faqs (id, category, question, answer, display_order, is_active, created_at)
                 VALUES (:id, :cat, :q, :a, :order, 1, NOW())
                 ON DUPLICATE KEY UPDATE question = :q2, answer = :a2',
                [
                    'id' => $f['id'],
                    'cat' => $f['category'] ?? 'general',
                    'q' => $f['question'],
                    'a' => $f['answer'],
                    'order' => $f['order'] ?? 1,
                    'q2' => $f['question'],
                    'a2' => $f['answer'],
                ]
            );
            $count++;
        }
        echo "{$count} FAQs stored." . PHP_EOL;
    }

    private function migrateNavigation(array $nav): void
    {
        echo "[12/13] Migrating Navigation Menus... ";
        $count = 0;
        foreach ($nav as $n) {
            $this->db->execute(
                'INSERT INTO navigation_menus (id, menu_key, label, page_key, display_order, is_active)
                 VALUES (:id, :key, :label, :page, :order, :active)
                 ON DUPLICATE KEY UPDATE label = :label2, page_key = :page2',
                [
                    'id' => $n['id'],
                    'key' => $n['id'],
                    'label' => $n['label'],
                    'page' => $n['pageKey'],
                    'order' => $n['order'] ?? 1,
                    'active' => !empty($n['enabled']) ? 1 : 0,
                    'label2' => $n['label'],
                    'page2' => $n['pageKey'],
                ]
            );
            $count++;
        }
        echo "{$count} navigation items mapped." . PHP_EOL;
    }

    private function migrateDashboardModules(array $modules): void
    {
        echo "[13/13] Migrating Dashboard Modules... ";
        $count = 0;
        foreach ($modules as $m) {
            $this->db->execute(
                'INSERT INTO dashboard_modules (id, module_key, name, description, icon, status, is_visible, coming_soon_message, display_order)
                 VALUES (:id, :key, :name, :desc, :icon, :status, :vis, :cs_msg, :order)
                 ON DUPLICATE KEY UPDATE name = :name2, status = :status2',
                [
                    'id' => $m['id'],
                    'key' => $m['id'],
                    'name' => $m['name'],
                    'desc' => $m['description'] ?? '',
                    'icon' => $m['icon'] ?? 'Cpu',
                    'status' => $m['status'] ?? 'active',
                    'vis' => !empty($m['visible']) ? 1 : 0,
                    'cs_msg' => $m['coming_soon_message'] ?? null,
                    'order' => $m['order'] ?? 1,
                    'name2' => $m['name'],
                    'status2' => $m['status'] ?? 'active',
                ]
            );
            $count++;
        }
        echo "{$count} modules configured." . PHP_EOL;
    }
}

$migrator = new Migrator();
$migrator->run();
