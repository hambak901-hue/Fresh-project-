<?php
/**
 * @file CmsController.php
 * Public Website, Branding & Content Management System Controller for HambakTech Enterprise
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\AnnouncementEmailService;

class CmsController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function getOfficialBrandingDefaults(): array
    {
        return [
            'id' => 'brd_default',
            'company_name' => 'HAMBAK TECH & SERVICES',
            'short_brand_name' => 'HAMBAKTECH',
            'tagline' => 'Where Technology Meets Services',
            'logo_url' => '/logo.png',
            'favicon_url' => '/logo.png',
            'primary_color' => '#1d4ed8',
            'secondary_color' => '#0f172a',
            'font_family' => 'Plus Jakarta Sans',
            'whatsapp_number' => '09155104724',
            'business_phone' => '08147837664',
            'support_phone' => '09127469686',
            'support_email' => 'support@hambaktech.com.ng',
            'info_email' => 'info@hambaktech.com.ng',
            'office_address' => 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
            'business_reg_number' => 'BN 9284726',
            'founded_year' => '2024',
            'social_links' => [
                'tiktok' => '',
                'facebook' => '',
                'telegram' => '',
                'x' => '',
                'linkedin' => '',
                'youtube' => '',
                'whatsapp_channel' => '',
            ],
            'footer_text' => 'HAMBAK TECH & SERVICES provides digital identity verification, telecommunication VTU services, automated bill payments, and practical ICT & software skills training across Nigeria.',
            'copyright_text' => '© ' . date('Y') . ' HAMBAK TECH & SERVICES (BN 9284726). All Rights Reserved.',
            'seo_title' => 'HAMBAKTECH | Digital Services, Telecom VTU & Digital Training Academy',
            'seo_description' => 'HAMBAK TECH & SERVICES — Digital identity verification, telecom data & airtime VTU, bill payments, and HAMBAKTECH Digital Training Academy in Lekki, Lagos State, Nigeria.',
            'seo_keywords' => 'HAMBAKTECH, HAMBAK TECH & SERVICES, NIN verification, BVN verification, Nigerian VTU, SME data bundles, Digital Training Academy, Lekki Lagos',
        ];
    }

    private function loadNormalizedBranding(): array
    {
        $defaults = $this->getOfficialBrandingDefaults();
        $branding = $this->db->fetchOne('SELECT * FROM website_branding LIMIT 1');

        if (!$branding) {
            $insert = $defaults;
            $insert['social_links'] = json_encode($defaults['social_links']);
            try {
                $this->db->execute(
                    'INSERT INTO website_branding (
                        id, company_name, short_brand_name, tagline, logo_url, favicon_url,
                        primary_color, secondary_color, font_family,
                        support_phone, business_phone, support_email, info_email, office_address,
                        whatsapp_number, business_reg_number, founded_year,
                        social_links, footer_text, copyright_text, seo_title, seo_description, seo_keywords, updated_at
                    ) VALUES (
                        :id, :company_name, :short_brand_name, :tagline, :logo_url, :favicon_url,
                        :primary_color, :secondary_color, :font_family,
                        :support_phone, :business_phone, :support_email, :info_email, :office_address,
                        :whatsapp_number, :business_reg_number, :founded_year,
                        :social_links, :footer_text, :copyright_text, :seo_title, :seo_description, :seo_keywords, NOW()
                    )',
                    $insert
                );
                $branding = $this->db->fetchOne('SELECT * FROM website_branding LIMIT 1');
            } catch (\Throwable) {
                return $defaults;
            }
        }

        if (!$branding) {
            return $defaults;
        }

        if (!empty($branding['social_links']) && is_string($branding['social_links'])) {
            $decodedSoc = json_decode($branding['social_links'], true);
            $branding['social_links'] = is_array($decodedSoc) ? $decodedSoc : [];
        } else {
            $branding['social_links'] = [];
        }

        // Heal Stage 1 placeholder values automatically if untouched
        $needsHeal = false;
        if (empty($branding['company_name']) || $branding['company_name'] === 'HambakTech Enterprise') {
            $branding['company_name'] = $defaults['company_name'];
            $needsHeal = true;
        }
        if (empty($branding['short_brand_name'])) {
            $branding['short_brand_name'] = $defaults['short_brand_name'];
            $needsHeal = true;
        }
        if (empty($branding['tagline']) || str_contains((string)$branding['tagline'], 'Sovereign Identity') || str_contains((string)$branding['tagline'], 'Automated Identity Verification')) {
            $branding['tagline'] = $defaults['tagline'];
            $needsHeal = true;
        }
        if (empty($branding['logo_url']) || $branding['logo_url'] === '/logo.svg') {
            $branding['logo_url'] = '/logo.png';
            $needsHeal = true;
        }
        if (empty($branding['favicon_url']) || $branding['favicon_url'] === '/favicon.ico') {
            $branding['favicon_url'] = '/logo.png';
            $needsHeal = true;
        }
        if (empty($branding['support_phone']) || str_contains((string)$branding['support_phone'], '803 000 1122')) {
            $branding['support_phone'] = $defaults['support_phone'];
            $needsHeal = true;
        }
        if (empty($branding['whatsapp_number']) || str_contains((string)$branding['whatsapp_number'], '8030001122')) {
            $branding['whatsapp_number'] = $defaults['whatsapp_number'];
            $needsHeal = true;
        }
        if (empty($branding['business_phone'])) {
            $branding['business_phone'] = $defaults['business_phone'];
            $needsHeal = true;
        }
        if (empty($branding['info_email'])) {
            $branding['info_email'] = $defaults['info_email'];
            $needsHeal = true;
        }
        if (empty($branding['office_address']) || str_contains((string)$branding['office_address'], 'Ikeja') || trim((string)$branding['office_address']) === 'Lagos, Nigeria') {
            $branding['office_address'] = $defaults['office_address'];
            $needsHeal = true;
        }
        if (empty($branding['business_reg_number']) || str_contains((string)$branding['business_reg_number'], 'RC-')) {
            $branding['business_reg_number'] = $defaults['business_reg_number'];
            $needsHeal = true;
        }
        if (empty($branding['founded_year'])) {
            $branding['founded_year'] = $defaults['founded_year'];
            $needsHeal = true;
        }
        if (empty($branding['footer_text'])) {
            $branding['footer_text'] = $defaults['footer_text'];
            $needsHeal = true;
        }
        if (empty($branding['copyright_text']) || str_contains((string)$branding['copyright_text'], 'Hambak Technologies Enterprise')) {
            $branding['copyright_text'] = $defaults['copyright_text'];
            $needsHeal = true;
        }
        if (empty($branding['seo_title'])) {
            $branding['seo_title'] = $defaults['seo_title'];
            $needsHeal = true;
        }
        if (empty($branding['seo_description'])) {
            $branding['seo_description'] = $defaults['seo_description'];
            $needsHeal = true;
        }
        if (empty($branding['seo_keywords'])) {
            $branding['seo_keywords'] = $defaults['seo_keywords'];
            $needsHeal = true;
        }

        // Remove unconfigured Stage 1 placeholder social links
        $soc = $branding['social_links'];
        $cleanSoc = [];
        foreach (['tiktok', 'facebook', 'telegram', 'x', 'linkedin', 'youtube', 'whatsapp_channel'] as $key) {
            $val = trim((string)($soc[$key] ?? ($key === 'x' ? ($soc['twitter'] ?? '') : '')));
            if ($val !== '' && !str_contains($val, 'x.com/hambaktech') && !str_contains($val, 'facebook.com/hambaktech') && !str_contains($val, 'linkedin.com/company/hambaktech')) {
                $cleanSoc[$key] = $val;
            } else {
                $cleanSoc[$key] = '';
            }
        }
        $branding['social_links'] = $cleanSoc;

        if ($needsHeal && !empty($branding['id'])) {
            try {
                $this->db->execute(
                    'UPDATE website_branding SET
                        company_name = :cn, short_brand_name = :sbn, tagline = :tag, logo_url = :logo, favicon_url = :fav,
                        support_phone = :sp, business_phone = :bp, whatsapp_number = :wa,
                        support_email = :se, info_email = :ie, office_address = :addr,
                        business_reg_number = :reg, founded_year = :fy, footer_text = :foot, copyright_text = :copy,
                        seo_title = :stitle, seo_description = :sdesc, seo_keywords = :skey,
                        social_links = :soc, updated_at = NOW()
                     WHERE id = :id',
                    [
                        'cn' => $branding['company_name'],
                        'sbn' => $branding['short_brand_name'],
                        'tag' => $branding['tagline'],
                        'logo' => $branding['logo_url'],
                        'fav' => $branding['favicon_url'],
                        'sp' => $branding['support_phone'],
                        'bp' => $branding['business_phone'],
                        'wa' => $branding['whatsapp_number'],
                        'se' => $branding['support_email'] ?: $defaults['support_email'],
                        'ie' => $branding['info_email'],
                        'addr' => $branding['office_address'],
                        'reg' => $branding['business_reg_number'],
                        'fy' => $branding['founded_year'],
                        'foot' => $branding['footer_text'],
                        'copy' => $branding['copyright_text'],
                        'stitle' => $branding['seo_title'],
                        'sdesc' => $branding['seo_description'],
                        'skey' => $branding['seo_keywords'],
                        'soc' => json_encode($cleanSoc),
                        'id' => $branding['id'],
                    ]
                );
            } catch (\Throwable) {
            }
        }

        return array_merge($defaults, $branding);
    }

    private function getDefaultSections(): array
    {
        return [
            'hero' => [
                'badge' => 'HAMBAK TECH & SERVICES • BN 9284726',
                'headline' => 'Where Technology Meets Practical Digital Services & Training',
                'subheadline' => 'Instant identity verification support, telecom data & airtime VTU, utility bill payments, and hands-on ICT & software training from our Lekki, Lagos operations center.',
                'primaryCtaText' => 'Create Free Account',
                'primaryCtaLink' => 'register',
                'secondaryCtaText' => 'Explore Digital Academy',
                'secondaryCtaLink' => 'academy',
                'bannerImage' => '',
            ],
            'companyIntro' => [
                'badge' => 'Trusted Nigerian Digital Services',
                'title' => 'Built for Individuals, Agents & Growing Businesses in Nigeria',
                'description' => 'Founded in 2024 and registered as HAMBAK TECH & SERVICES (BN 9284726), we deliver accessible digital services, telecom vending, identity verification workflows, and industry-relevant technology training.',
                'founded' => '2024',
                'headquarters' => 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
                'infrastructure' => 'Secure Automated Digital Platform & Customer Support',
                'stats' => [
                    ['label' => 'Official Academy Tracks', 'value' => '12 Courses'],
                    ['label' => 'Operating Currency', 'value' => 'NGN (₦)'],
                    ['label' => 'Established', 'value' => '2024'],
                    ['label' => 'Registered Ref', 'value' => 'BN 9284726'],
                ],
            ],
            'aboutOverview' => [
                'title' => 'About HAMBAK TECH & SERVICES',
                'content' => 'HAMBAK TECH & SERVICES (operating as HAMBAKTECH) is a Nigerian technology and digital services enterprise located at Origanrigan, Cele Area, Lekki LCDA, Lagos State. Since 2024, we have combined everyday digital utility convenience with practical computer and software career training.',
            ],
            'mission' => [
                'title' => 'Our Mission',
                'content' => 'To provide reliable digital utility services, accessible fintech payment workflows, and practical technology training that empower individuals and businesses across Nigeria.',
            ],
            'vision' => [
                'title' => 'Our Vision',
                'content' => 'To be a trusted household partner where everyday technology meets dependable service delivery and youth digital capacity building.',
            ],
            'coreValues' => [
                ['title' => 'Integrity & Transparency', 'description' => 'Clear pricing in Nigerian Naira, verifiable transaction receipts, and honest communication.'],
                ['title' => 'Customer Dependability', 'description' => 'Responsive multi-channel support across WhatsApp, office phone, and dedicated email desks.'],
                ['title' => 'Practical Excellence', 'description' => 'Hands-on technical execution across both our digital services portal and our training academy.'],
            ],
            'businessObjectives' => [
                'Deliver seamless airtime, data, cable TV, electricity, and exam pin vending in NGN.',
                'Provide guided, compliant digital identity verification tools for customers and agents.',
                'Equip students and professionals with market-ready ICT, design, data analysis, and software skills.',
            ],
            'whyChooseUs' => [
                ['title' => 'Unified Wallet & Services', 'description' => 'Manage identity lookups, telecom bundles, and utility bills from one organized dashboard.'],
                ['title' => 'Verified Transaction Records', 'description' => 'Every wallet credit and service order produces clear ledger records and downloadable receipts.'],
                ['title' => 'Real Physical Presence in Lekki', 'description' => 'Backed by registered operations at Origanrigan, Cele Area, Lekki LCDA, Lagos State (BN 9284726).'],
            ],
            'howItWorks' => [
                ['step' => '01', 'title' => 'Register Your Account', 'description' => 'Sign up in minutes with your valid email address and create your personal dashboard.'],
                ['step' => '02', 'title' => 'Fund Your NGN Wallet', 'description' => 'Add funds conveniently via approved payment gateways or verified bank transfer.'],
                ['step' => '03', 'title' => 'Order or Enroll', 'description' => 'Access telecom VTU, bill payments, identity services, or apply to the Digital Training Academy.'],
            ],
            'benefits' => [
                ['id' => 'b1', 'title' => 'Instant VTU Fulfillment', 'description' => 'Purchase MTN, Airtel, Glo, and 9mobile data bundles and airtime quickly in Nigerian Naira.', 'icon' => 'Zap'],
                ['id' => 'b2', 'title' => 'Structured Verification Workflows', 'description' => 'Guided NIN and BVN verification workflows with clear fee visibility before checkout.', 'icon' => 'ShieldCheck'],
                ['id' => 'b3', 'title' => 'Dedicated Support Channels', 'description' => 'Reach our support team via WhatsApp (09155104724), Office (09127469686), or email.', 'icon' => 'Headphones'],
                ['id' => 'b4', 'title' => 'Practical Digital Training', 'description' => 'Apply online for 12 structured technology and creative courses at our Digital Training Academy.', 'icon' => 'GraduationCap'],
            ],
            'customerServiceInfo' => [
                'officeHours' => 'Monday – Saturday, 8:00 AM – 6:00 PM WAT',
                'whatsappLabel' => 'WhatsApp Desk',
                'businessLabel' => 'Business / Upline Contact',
                'officeLabel' => 'Customer Service / Office',
            ],
            'refundPolicy' => [
                'title' => 'Refund & Dispute Resolution Policy',
                'summary' => 'HAMBAK TECH & SERVICES maintains fair, transparent handling of failed digital deliveries and wallet funding disputes.',
                'sections' => [
                    ['heading' => '1. Failed Automated Service Orders', 'body' => 'When an automated airtime, data, or bill transaction fails definitively at the fulfillment gateway without value delivered, the debited amount is reversed to your HAMBAKTECH NGN wallet after confirmation.'],
                    ['heading' => '2. Wallet Funding Discrepancies', 'body' => 'Duplicate gateway charges or uncredited transfers supported by valid payment references are investigated by our accounts desk within 24–48 business hours.'],
                    ['heading' => '3. Wallet Balance Withdrawals & Non-Refundable Completed Orders', 'body' => 'Successfully delivered digital tokens, PINs, airtime, and completed verification queries cannot be recalled or refunded once fulfilled.'],
                    ['heading' => '4. How to Request Review', 'body' => 'Open a support ticket inside your portal or email support@hambaktech.com.ng with your transaction reference, date, and amount.'],
                ],
            ],
            'academyOverview' => [
                'title' => 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY',
                'subtitle' => 'Practical instructor-led digital literacy, creative design, data analysis, and software development programs in Lekki, Lagos State.',
                'admissionNote' => 'Online admissions are open for qualified applicants. Applicants under 18 years old require parent or guardian consent details.',
            ],
            'pageVisibility' => [
                'home' => true,
                'about' => true,
                'services' => true,
                'howItWorks' => true,
                'ratesCalculator' => true,
                'academy' => true,
                'contact' => true,
                'faq' => true,
                'announcements' => true,
                'terms' => true,
                'privacy' => true,
                'refundPolicy' => true,
            ],
        ];
    }

    /**
     * GET /api/cms/public
     */
    public function publicData(Request $request): void
    {
        $branding = $this->loadNormalizedBranding();
        $defaultSections = $this->getDefaultSections();

        $sectionRows = $this->db->fetchAll('SELECT section_key, section_data FROM cms_sections');
        $cmsSections = [];
        foreach ($sectionRows as $sr) {
            $decoded = json_decode($sr['section_data'], true);
            if (is_array($decoded)) {
                $cmsSections[$sr['section_key']] = $decoded;
            }
        }

        // Heal Stage 1 fabricated stats if untouched in companyIntro
        if (!empty($cmsSections['companyIntro']['stats']) && is_array($cmsSections['companyIntro']['stats'])) {
            $firstVal = (string)($cmsSections['companyIntro']['stats'][0]['value'] ?? '');
            if (str_contains($firstVal, '120M') || str_contains((string)($cmsSections['companyIntro']['headquarters'] ?? ''), 'Lagos, Nigeria') && strlen((string)$cmsSections['companyIntro']['headquarters']) < 20) {
                $cmsSections['companyIntro'] = $defaultSections['companyIntro'];
                $this->db->execute(
                    'INSERT INTO cms_sections (id, section_key, section_data, updated_at) VALUES (:id, "companyIntro", :d, NOW())
                     ON DUPLICATE KEY UPDATE section_data = :d2, updated_at = NOW()',
                    ['id' => Security::generateUuid(), 'd' => json_encode($defaultSections['companyIntro']), 'd2' => json_encode($defaultSections['companyIntro'])]
                );
            }
        }

        // Heal Stage 1 untouched sections once if still showing legacy placeholder copy
        if (($cmsSections['hero']['badge'] ?? '') === "Nigeria's Leading Digital Services Infrastructure") {
            $cmsSections['hero'] = $defaultSections['hero'];
            $this->db->execute(
                'INSERT INTO cms_sections (id, section_key, section_data, updated_at) VALUES (:id, "hero", :d, NOW())
                 ON DUPLICATE KEY UPDATE section_data = :d2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'd' => json_encode($defaultSections['hero']), 'd2' => json_encode($defaultSections['hero'])]
            );
        }
        if (($cmsSections['benefits'][0]['title'] ?? '') === 'Sub-Second Dispatch') {
            $cmsSections['benefits'] = $defaultSections['benefits'];
            $this->db->execute(
                'INSERT INTO cms_sections (id, section_key, section_data, updated_at) VALUES (:id, "benefits", :d, NOW())
                 ON DUPLICATE KEY UPDATE section_data = :d2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'd' => json_encode($defaultSections['benefits']), 'd2' => json_encode($defaultSections['benefits'])]
            );
        }
        if (!empty($cmsSections['howItWorks'][2]['description']) && str_contains((string)$cmsSections['howItWorks'][2]['description'], 'developer REST API')) {
            $cmsSections['howItWorks'] = $defaultSections['howItWorks'];
            $this->db->execute(
                'INSERT INTO cms_sections (id, section_key, section_data, updated_at) VALUES (:id, "howItWorks", :d, NOW())
                 ON DUPLICATE KEY UPDATE section_data = :d2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'd' => json_encode($defaultSections['howItWorks']), 'd2' => json_encode($defaultSections['howItWorks'])]
            );
        }

        // Seed any missing CMS sections without overwriting custom admin edits
        foreach ($defaultSections as $skey => $sdata) {
            if (!isset($cmsSections[$skey])) {
                try {
                    $this->db->execute(
                        'INSERT INTO cms_sections (id, section_key, section_data, updated_at)
                         VALUES (:id, :skey, :data, NOW())
                         ON DUPLICATE KEY UPDATE section_data = :data2, updated_at = NOW()',
                        [
                            'id' => Security::generateUuid(),
                            'skey' => $skey,
                            'data' => json_encode($sdata),
                            'data2' => json_encode($sdata),
                        ]
                    );
                } catch (\Throwable) {
                }
                $cmsSections[$skey] = $sdata;
            } elseif ($skey === 'pageVisibility' && is_array($cmsSections['pageVisibility'])) {
                $cmsSections['pageVisibility'] = array_merge($sdata, $cmsSections['pageVisibility']);
            }
        }

        // Clean fake uptime text from hero subheadline if still Stage 1 default
        if (!empty($cmsSections['hero']['subheadline']) && str_contains((string)$cmsSections['hero']['subheadline'], 'sovereign')) {
            $cmsSections['hero'] = $defaultSections['hero'];
        }

        // 3. Announcements (only public / general customer broadcasts)
        $emailSvc = new AnnouncementEmailService($this->db);
        $emailSvc->ensureSchema();
        $announcements = $this->db->fetchAll(
            'SELECT id, title, content, category, target_audience, is_pinned, status, author, created_at
             FROM announcements
             WHERE status = "published"
               AND (target_audience IS NULL OR target_audience = "" OR target_audience IN ("all_customers", "all_users", "all", "customers", "public"))
             ORDER BY is_pinned DESC, created_at DESC LIMIT 10'
        );
        foreach ($announcements as &$a) {
            $a['is_pinned'] = (bool)$a['is_pinned'];
        }

        // 4. FAQs
        $faqs = $this->db->fetchAll(
            'SELECT id, category, question, answer, display_order, is_active
             FROM faqs
             WHERE is_active = 1
             ORDER BY display_order ASC'
        );

        // Ensure Stage 2 essential navigation items exist if absent
        $essentialNav = [
            ['id' => 'nav_home', 'menu_key' => 'home', 'label' => 'Home', 'page_key' => 'home', 'display_order' => 1],
            ['id' => 'nav_about', 'menu_key' => 'about', 'label' => 'About', 'page_key' => 'about', 'display_order' => 2],
            ['id' => 'nav_services', 'menu_key' => 'services', 'label' => 'Services', 'page_key' => 'services', 'display_order' => 3],
            ['id' => 'nav_how_it_works', 'menu_key' => 'how_it_works', 'label' => 'How It Works', 'page_key' => 'howItWorks', 'display_order' => 4],
            ['id' => 'nav_rates', 'menu_key' => 'rates', 'label' => 'Rates', 'page_key' => 'rates', 'display_order' => 5],
            ['id' => 'nav_academy', 'menu_key' => 'academy', 'label' => 'Academy', 'page_key' => 'academy', 'display_order' => 6],
            ['id' => 'nav_contact', 'menu_key' => 'contact', 'label' => 'Contact', 'page_key' => 'contact', 'display_order' => 7],
        ];
        foreach ($essentialNav as $en) {
            try {
                $exists = $this->db->fetchOne('SELECT id FROM navigation_menus WHERE page_key = :pk LIMIT 1', ['pk' => $en['page_key']]);
                if (!$exists) {
                    $this->db->execute(
                        'INSERT INTO navigation_menus (id, menu_key, label, page_key, display_order, is_active)
                         VALUES (:id, :mkey, :label, :pkey, :ord, 1)',
                        [
                            'id' => $en['id'],
                            'mkey' => $en['menu_key'],
                            'label' => $en['label'],
                            'pkey' => $en['page_key'],
                            'ord' => $en['display_order'],
                        ]
                    );
                }
            } catch (\Throwable) {
            }
        }

        // 5. Navigation
        $nav = $this->db->fetchAll(
            'SELECT id, menu_key, label, page_key, display_order as `order`, is_active as enabled
             FROM navigation_menus
             WHERE is_active = 1
             ORDER BY display_order ASC'
        );
        foreach ($nav as &$n) {
            $n['enabled'] = (bool)$n['enabled'];
        }

        // 6. Dashboard Modules
        $modules = $this->db->fetchAll(
            'SELECT id, module_key, name, description, icon, status, is_visible as visible, coming_soon_message, display_order
             FROM dashboard_modules
             ORDER BY display_order ASC'
        );
        foreach ($modules as &$m) {
            $m['visible'] = (bool)$m['visible'];
        }

        // 7. Dynamic Rates
        $rates = [
            'nin_fee' => 150.00,
            'bvn_fee' => 100.00,
            'mtn_sme_1gb' => 285.00,
            'airtel_1gb' => 290.00,
            'glo_1gb' => 275.00,
            'nine_mobile_1gb' => 280.00,
            'airtime_discount_percent' => 2.0,
        ];
        $settingsRows = $this->db->fetchAll('SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE "%fee%" OR setting_key LIKE "%rate%" OR setting_key LIKE "%1gb%"');
        foreach ($settingsRows as $sr) {
            $val = json_decode($sr['setting_value'], true);
            $rates[$sr['setting_key']] = is_numeric($val) ? (float)$val : $val;
        }

        Response::success([
            'branding' => $branding,
            'cms_sections' => $cmsSections,
            'announcements' => $announcements,
            'faqs' => $faqs,
            'navigation' => $nav,
            'dashboard_modules' => $modules,
            'rates' => $rates,
            'timestamp' => date('c'),
        ]);
    }

    /**
     * GET /api/cms/admin
     */
    public function adminData(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);

        $branding = $this->loadNormalizedBranding();
        $defaultSections = $this->getDefaultSections();

        // 2. CMS Sections
        $sectionRows = $this->db->fetchAll('SELECT section_key, section_data FROM cms_sections');
        $cmsSections = [];
        foreach ($sectionRows as $sr) {
            $decoded = json_decode($sr['section_data'], true);
            if (is_array($decoded)) {
                $cmsSections[$sr['section_key']] = $decoded;
            }
        }
        foreach ($defaultSections as $k => $v) {
            if (!isset($cmsSections[$k])) {
                $cmsSections[$k] = $v;
            }
        }

        // 3. Announcements (all drafts and published)
        $emailSvcAdmin = new AnnouncementEmailService($this->db);
        $emailSvcAdmin->ensureSchema();
        $announcements = $this->db->fetchAll(
            'SELECT id, title, content, category, target_audience, target_user_id, is_pinned, status, author, created_at, updated_at
             FROM announcements
             ORDER BY is_pinned DESC, created_at DESC'
        );
        $annStats = $emailSvcAdmin->getDeliveryStatsMap(array_map(fn($r) => (string)$r['id'], $announcements));
        foreach ($announcements as &$a) {
            $a['is_pinned'] = (bool)$a['is_pinned'];
            $a['email_stats'] = $annStats[(string)$a['id']] ?? ['sent_count' => 0, 'failed_count' => 0, 'total_logged' => 0, 'last_sent_at' => null];
        }

        // 4. FAQs
        $faqs = $this->db->fetchAll(
            'SELECT id, category, question, answer, display_order as `order`, is_active
             FROM faqs
             ORDER BY display_order ASC'
        );

        // 5. Navigation (all active and inactive)
        $navigation = $this->db->fetchAll(
            'SELECT id, menu_key, label, page_key, display_order as `order`, is_active as enabled
             FROM navigation_menus
             ORDER BY display_order ASC'
        );
        foreach ($navigation as &$n) {
            $n['enabled'] = (bool)$n['enabled'];
        }

        // 6. Settings
        $settingsRows = $this->db->fetchAll('SELECT setting_key, setting_value FROM system_settings');
        $settings = [];
        foreach ($settingsRows as $row) {
            $settings[$row['setting_key']] = json_decode($row['setting_value'], true);
        }

        Response::success([
            'branding' => $branding,
            'cms_sections' => $cmsSections,
            'announcements' => $announcements,
            'faqs' => $faqs,
            'navigation' => $navigation,
            'settings' => $settings,
            'pageVisibility' => array_merge($defaultSections['pageVisibility'], $cmsSections['pageVisibility'] ?? []),
        ]);
    }

    /**
     * POST|PUT /api/cms/branding
     */
    public function updateBranding(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $b = $request->getBody();
        $defaults = $this->getOfficialBrandingDefaults();

        $existing = $this->db->fetchOne('SELECT id FROM website_branding LIMIT 1');
        $params = [
            'name' => $b['company_name'] ?? $defaults['company_name'],
            'sbn' => $b['short_brand_name'] ?? $defaults['short_brand_name'],
            'tag' => $b['tagline'] ?? $defaults['tagline'],
            'logo' => !empty($b['logo_url']) ? $b['logo_url'] : '/logo.png',
            'fav' => !empty($b['favicon_url']) ? $b['favicon_url'] : '/logo.png',
            'pcol' => $b['primary_color'] ?? $defaults['primary_color'],
            'scol' => $b['secondary_color'] ?? $defaults['secondary_color'],
            'font' => $b['font_family'] ?? $defaults['font_family'],
            'phone' => $b['support_phone'] ?? $defaults['support_phone'],
            'bphone' => $b['business_phone'] ?? $defaults['business_phone'],
            'email' => $b['support_email'] ?? $defaults['support_email'],
            'iemail' => $b['info_email'] ?? $defaults['info_email'],
            'addr' => $b['office_address'] ?? $defaults['office_address'],
            'wa' => $b['whatsapp_number'] ?? $defaults['whatsapp_number'],
            'reg' => $b['business_reg_number'] ?? $defaults['business_reg_number'],
            'fy' => $b['founded_year'] ?? $defaults['founded_year'],
            'soc' => isset($b['social_links']) ? json_encode($b['social_links']) : json_encode($defaults['social_links']),
            'foot' => $b['footer_text'] ?? $defaults['footer_text'],
            'copy' => $b['copyright_text'] ?? $defaults['copyright_text'],
            'stitle' => $b['seo_title'] ?? $defaults['seo_title'],
            'sdesc' => $b['seo_description'] ?? $defaults['seo_description'],
            'skey' => $b['seo_keywords'] ?? $defaults['seo_keywords'],
        ];

        if ($existing) {
            $params['id'] = $existing['id'];
            $this->db->execute(
                'UPDATE website_branding
                 SET company_name = :name, short_brand_name = :sbn, tagline = :tag, logo_url = :logo, favicon_url = :fav,
                     primary_color = :pcol, secondary_color = :scol, font_family = :font,
                     support_phone = :phone, business_phone = :bphone, support_email = :email, info_email = :iemail,
                     office_address = :addr, whatsapp_number = :wa, business_reg_number = :reg, founded_year = :fy,
                     social_links = :soc, footer_text = :foot, copyright_text = :copy,
                     seo_title = :stitle, seo_description = :sdesc, seo_keywords = :skey, updated_at = NOW()
                 WHERE id = :id',
                $params
            );
        } else {
            $params['id'] = 'brd_default';
            $this->db->execute(
                'INSERT INTO website_branding
                 (id, company_name, short_brand_name, tagline, logo_url, favicon_url, primary_color, secondary_color, font_family,
                  support_phone, business_phone, support_email, info_email, office_address, whatsapp_number, business_reg_number, founded_year,
                  social_links, footer_text, copyright_text, seo_title, seo_description, seo_keywords, updated_at)
                 VALUES (:id, :name, :sbn, :tag, :logo, :fav, :pcol, :scol, :font,
                  :phone, :bphone, :email, :iemail, :addr, :wa, :reg, :fy,
                  :soc, :foot, :copy, :stitle, :sdesc, :skey, NOW())',
                $params
            );
        }

        $updated = $this->loadNormalizedBranding();

        Response::success(['branding' => $updated], 'Branding updated successfully in MySQL');
    }

    /**
     * POST|PUT /api/cms/sections
     */
    public function updateSections(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $sections = $request->getBody();

        foreach ($sections as $key => $val) {
            $this->db->execute(
                'INSERT INTO cms_sections (id, section_key, section_data, updated_at)
                 VALUES (:id, :skey, :sdata, NOW())
                 ON DUPLICATE KEY UPDATE section_data = :sdata2, updated_at = NOW()',
                [
                    'id' => Security::generateUuid(),
                    'skey' => $key,
                    'sdata' => json_encode($val),
                    'sdata2' => json_encode($val),
                ]
            );
        }

        // Return all updated sections
        $sectionRows = $this->db->fetchAll('SELECT section_key, section_data FROM cms_sections');
        $cmsSections = [];
        foreach ($sectionRows as $sr) {
            $cmsSections[$sr['section_key']] = json_decode($sr['section_data'], true);
        }

        Response::success(['cms_sections' => $cmsSections], 'CMS sections updated successfully');
    }

    /**
     * POST|PUT /api/cms/visibility
     */
    public function updateVisibility(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $updates = $request->getBody();

        // Get existing pageVisibility
        $existing = $this->db->fetchOne('SELECT section_data FROM cms_sections WHERE section_key = "pageVisibility"');
        $current = $existing ? json_decode($existing['section_data'], true) : [];
        $merged = array_merge($current, $updates);

        $this->db->execute(
            'INSERT INTO cms_sections (id, section_key, section_data, updated_at)
             VALUES (:id, "pageVisibility", :sdata, NOW())
             ON DUPLICATE KEY UPDATE section_data = :sdata2, updated_at = NOW()',
            [
                'id' => Security::generateUuid(),
                'sdata' => json_encode($merged),
                'sdata2' => json_encode($merged),
            ]
        );

        Response::success(['pageVisibility' => $merged], 'Page visibility updated successfully');
    }

    /**
     * POST /api/cms/announcements
     */
    public function saveAnnouncement(Request $request): void
    {
        $user = Auth::requireRole($request, ['admin', 'superadmin']);
        $emailSvc = new AnnouncementEmailService($this->db);
        $emailSvc->ensureSchema();

        $id = trim((string)$request->input('id', ''));
        $title = trim((string)$request->input('title', ''));
        $content = trim((string)($request->input('content') ?: $request->input('message') ?: ''));
        $category = (string)$request->input('category', 'general');
        $isPinned = (int)$request->input('is_pinned', 0);
        $status = strtolower(trim((string)$request->input('status', 'published'))) === 'draft' ? 'draft' : 'published';
        $targetAudience = AnnouncementEmailService::normalizeAudience(
            (string)($request->input('target_audience') ?? $request->input('target_role') ?? 'all_customers')
        );
        $targetUserId = trim((string)($request->input('target_user_id') ?? $request->input('user_id') ?? ''));
        if ($targetUserId !== '') {
            $targetAudience = 'specific_user';
        }

        if (empty($title) || empty($content)) {
            Response::error('Announcement title and content are required.', 422);
        }

        if (!empty($id)) {
            $this->db->execute(
                'UPDATE announcements 
                 SET title = :title, content = :content, category = :cat, target_audience = :aud, target_user_id = :tuid, is_pinned = :pin, status = :st, updated_at = NOW()
                 WHERE id = :id',
                [
                    'title' => $title,
                    'content' => $content,
                    'cat' => $category,
                    'aud' => $targetAudience,
                    'tuid' => $targetUserId !== '' ? $targetUserId : null,
                    'pin' => $isPinned,
                    'st' => $status,
                    'id' => $id,
                ]
            );
        } else {
            $id = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO announcements (id, title, content, category, target_audience, target_user_id, is_pinned, status, author, created_at)
                 VALUES (:id, :title, :content, :cat, :aud, :tuid, :pin, :st, :author, NOW())',
                [
                    'id' => $id,
                    'title' => $title,
                    'content' => $content,
                    'cat' => $category,
                    'aud' => $targetAudience,
                    'tuid' => $targetUserId !== '' ? $targetUserId : null,
                    'pin' => $isPinned,
                    'st' => $status,
                    'author' => $user['full_name'] ?? 'Administrator',
                ]
            );
        }

        $saved = $this->db->fetchOne('SELECT * FROM announcements WHERE id = :id', ['id' => $id]);
        $emailDelivery = [
            'triggered' => false,
            'reason' => 'inactive_or_draft',
            'total_targeted' => 0,
            'sent' => 0,
            'failed' => 0,
            'skipped_duplicates' => 0,
            'errors' => [],
        ];
        if ($saved && AnnouncementEmailService::isDeliverable($saved)) {
            try {
                $recipients = $emailSvc->resolveRecipients($targetAudience, $targetUserId !== '' ? $targetUserId : null);
                $emailSvc->ensureInAppNotifications($saved, $recipients);
                $emailDelivery = $emailSvc->dispatchForAnnouncement($saved, [
                    'recipients' => $recipients,
                    'source' => 'announcement',
                ]);
            } catch (Throwable $e) {
                $emailDelivery = ['triggered' => true, 'sent' => 0, 'failed' => 0, 'skipped_duplicates' => 0, 'errors' => [$e->getMessage()]];
            }
        }
        if ($saved) {
            $saved['is_pinned'] = (bool)$saved['is_pinned'];
        }
        Response::success(['announcement' => $saved, 'id' => $id, 'email_delivery' => $emailDelivery], 'Announcement saved successfully');
    }

    /**
     * PUT /api/cms/announcements/:id
     */
    public function updateAnnouncement(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $emailSvc = new AnnouncementEmailService($this->db);
        $emailSvc->ensureSchema();

        $id = $params['id'] ?? '';
        $b = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM announcements WHERE id = :id', ['id' => $id]);
        if (!$existing) {
            Response::error('Announcement not found', 404);
        }

        $targetAudience = isset($b['target_audience']) || isset($b['target_role'])
            ? AnnouncementEmailService::normalizeAudience((string)($b['target_audience'] ?? $b['target_role']))
            : ($existing['target_audience'] ?? 'all_customers');
        $targetUserId = array_key_exists('target_user_id', $b)
            ? (trim((string)$b['target_user_id']) ?: null)
            : ($existing['target_user_id'] ?? null);
        if (!empty($targetUserId)) {
            $targetAudience = 'specific_user';
        }
        $status = isset($b['status'])
            ? (strtolower(trim((string)$b['status'])) === 'draft' ? 'draft' : 'published')
            : ($existing['status'] ?? 'published');

        $this->db->execute(
            'UPDATE announcements 
             SET title = :title, content = :content, category = :cat, target_audience = :aud, target_user_id = :tuid, is_pinned = :pin, status = :st, updated_at = NOW()
             WHERE id = :id',
            [
                'title' => $b['title'] ?? $existing['title'],
                'content' => $b['content'] ?? $existing['content'],
                'cat' => $b['category'] ?? $existing['category'],
                'aud' => $targetAudience,
                'tuid' => $targetUserId,
                'pin' => isset($b['is_pinned']) ? (int)$b['is_pinned'] : (int)$existing['is_pinned'],
                'st' => $status,
                'id' => $id,
            ]
        );

        $saved = $this->db->fetchOne('SELECT * FROM announcements WHERE id = :id', ['id' => $id]);
        $emailDelivery = [
            'triggered' => false,
            'reason' => 'inactive_or_draft',
            'total_targeted' => 0,
            'sent' => 0,
            'failed' => 0,
            'skipped_duplicates' => 0,
            'errors' => [],
        ];
        if ($saved && AnnouncementEmailService::isDeliverable($saved)) {
            try {
                $recipients = $emailSvc->resolveRecipients($targetAudience, $targetUserId);
                $emailSvc->ensureInAppNotifications($saved, $recipients);
                $emailDelivery = $emailSvc->dispatchForAnnouncement($saved, [
                    'recipients' => $recipients,
                    'source' => 'announcement',
                ]);
            } catch (Throwable $e) {
                $emailDelivery = ['triggered' => true, 'sent' => 0, 'failed' => 0, 'skipped_duplicates' => 0, 'errors' => [$e->getMessage()]];
            }
        }
        if ($saved) {
            $saved['is_pinned'] = (bool)$saved['is_pinned'];
        }
        Response::success(['announcement' => $saved, 'email_delivery' => $emailDelivery], 'Announcement updated successfully');
    }

    /**
     * DELETE /api/cms/announcements/:id
     */
    public function deleteAnnouncement(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM announcements WHERE id = :id', ['id' => $id]);
        try {
            $this->db->execute('DELETE FROM notifications WHERE action_link = :alink', ['alink' => '#announcement:' . $id]);
        } catch (Throwable) {
        }
        try {
            $this->db->execute('DELETE FROM announcement_email_deliveries WHERE announcement_id = :aid', ['aid' => $id]);
        } catch (Throwable) {
        }
        Response::success(['success' => true], 'Announcement deleted successfully');
    }

    /**
     * POST /api/cms/faqs
     */
    public function saveFaq(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = (string)$request->input('id', '');
        $question = trim((string)$request->input('question', ''));
        $answer = trim((string)$request->input('answer', ''));
        $category = (string)$request->input('category', 'general');
        $order = (int)$request->input('display_order', $request->input('order', 1));
        $isActive = (int)$request->input('is_active', 1);

        if (empty($question) || empty($answer)) {
            Response::error('Question and answer are required', 422);
        }

        if (!empty($id)) {
            $this->db->execute(
                'UPDATE faqs 
                 SET question = :question, answer = :answer, category = :cat, display_order = :ord, is_active = :act
                 WHERE id = :id',
                [
                    'question' => $question,
                    'answer' => $answer,
                    'cat' => $category,
                    'ord' => $order,
                    'act' => $isActive,
                    'id' => $id,
                ]
            );
        } else {
            $id = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO faqs (id, category, question, answer, display_order, is_active, created_at)
                 VALUES (:id, :cat, :question, :answer, :ord, :act, NOW())',
                [
                    'id' => $id,
                    'cat' => $category,
                    'question' => $question,
                    'answer' => $answer,
                    'ord' => $order,
                    'act' => $isActive,
                ]
            );
        }

        $saved = $this->db->fetchOne('SELECT * FROM faqs WHERE id = :id', ['id' => $id]);
        Response::success(['faq' => $saved, 'id' => $id], 'FAQ saved successfully');
    }

    /**
     * PUT /api/cms/faqs/:id
     */
    public function updateFaq(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $b = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM faqs WHERE id = :id', ['id' => $id]);
        if (!$existing) {
            Response::error('FAQ not found', 404);
        }

        $this->db->execute(
            'UPDATE faqs 
             SET question = :question, answer = :answer, category = :cat, display_order = :ord, is_active = :act
             WHERE id = :id',
            [
                'question' => $b['question'] ?? $existing['question'],
                'answer' => $b['answer'] ?? $existing['answer'],
                'cat' => $b['category'] ?? $existing['category'],
                'ord' => isset($b['display_order']) ? (int)$b['display_order'] : (isset($b['order']) ? (int)$b['order'] : (int)$existing['display_order']),
                'act' => isset($b['is_active']) ? (int)$b['is_active'] : (int)$existing['is_active'],
                'id' => $id,
            ]
        );

        $saved = $this->db->fetchOne('SELECT * FROM faqs WHERE id = :id', ['id' => $id]);
        Response::success(['faq' => $saved], 'FAQ updated successfully');
    }

    /**
     * DELETE /api/cms/faqs/:id
     */
    public function deleteFaq(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM faqs WHERE id = :id', ['id' => $id]);
        Response::success(['success' => true], 'FAQ deleted successfully');
    }

    /**
     * POST|PUT /api/cms/navigation
     */
    public function updateNavigation(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $items = $request->input('navigation', $request->getBody());

        if (is_array($items)) {
            foreach ($items as $item) {
                if (empty($item['menu_key']) && empty($item['label'])) continue;
                $key = $item['menu_key'] ?? strtolower(preg_replace('/[^a-zA-Z0-9]+/', '_', (string)$item['label']));
                $label = (string)($item['label'] ?? ucfirst($key));
                $pageKey = (string)($item['page_key'] ?? $key);
                $displayOrder = (int)($item['display_order'] ?? ($item['order'] ?? 1));
                $isActive = !empty($item['enabled']) || !empty($item['is_active']) ? 1 : 0;

                $this->db->execute(
                    'INSERT INTO navigation_menus (id, menu_key, label, page_key, display_order, is_active)
                     VALUES (:id, :mkey, :label, :pkey, :ord, :act)
                     ON DUPLICATE KEY UPDATE label = :label2, page_key = :pkey2, display_order = :ord2, is_active = :act2',
                    [
                        'id' => $item['id'] ?? Security::generateUuid(),
                        'mkey' => $key,
                        'label' => $label,
                        'pkey' => $pageKey,
                        'ord' => $displayOrder,
                        'act' => $isActive,
                        'label2' => $label,
                        'pkey2' => $pageKey,
                        'ord2' => $displayOrder,
                        'act2' => $isActive,
                    ]
                );
            }
        }

        $allNav = $this->db->fetchAll('SELECT id, menu_key, label, page_key, display_order as `order`, is_active as enabled FROM navigation_menus ORDER BY display_order ASC');
        foreach ($allNav as &$n) {
            $n['enabled'] = (bool)$n['enabled'];
        }

        Response::success(['navigation' => $allNav], 'Navigation updated successfully');
    }

    /**
     * POST /api/cms/contact (Public)
     */
    public function contact(Request $request): void
    {
        $name = trim((string)$request->input('name', ''));
        $email = trim((string)$request->input('email', ''));
        $phone = trim((string)$request->input('phone', ''));
        $subject = trim((string)$request->input('subject', 'General Inquiry'));
        $message = trim((string)$request->input('message', ''));

        if (empty($name) || empty($email) || empty($message)) {
            Response::error('Name, email, and message are required.', 422);
        }

        // Record in audit log
        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
                 VALUES (:id, NULL, :email, "CONTACT_FORM_SUBMISSION", :details, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'email' => $email,
                    'details' => json_encode(compact('name', 'email', 'phone', 'subject')),
                    'ip' => $request->getIp(),
                ]
            );
        } catch (\Throwable) {
        }

        Response::success(null, 'Thank you for contacting HambakTech Enterprise. Our team will review your message promptly.');
    }
}
