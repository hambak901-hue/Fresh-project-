<?php
/**
 * @file CmsController.php
 * Public Website, Branding & Content Management System Controller for HambakTech Enterprise
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;

class CmsController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * GET /api/cms/public
     */
    public function publicData(Request $request): void
    {
        // 1. Branding
        $branding = $this->db->fetchOne('SELECT * FROM website_branding LIMIT 1');
        if (!$branding) {
            $defaultId = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO website_branding (id, company_name, tagline, logo_url, favicon_url, primary_color, secondary_color, font_family, support_phone, support_email, office_address, whatsapp_number, social_links, footer_text, copyright_text, seo_title, seo_description, seo_keywords, updated_at)
                 VALUES (:id, "HambakTech Enterprise", "Sovereign VTU, Telecom & Identity Verification", "/logo.svg", "/favicon.ico", "#10b981", "#0284c7", "Plus Jakarta Sans", "+234 803 000 1122", "support@hambaktech.com.ng", "Lagos, Nigeria", "+2348030001122", "{}", "Nigeria\'s premier digital infrastructure platform for official identity verification, wholesale telecom vending, and automated digital payments.", "© 2026 Hambak Technologies Enterprise. All Rights Reserved.", "HambakTech Enterprise Portal", "All-in-one Nigerian VTU, identity verification (NIN/BVN), telecom, payments, academy, and digital services platform for HambakTech.", "VTU, NIN, BVN, Telecom, Data, Airtime, Nigeria", NOW())',
                ['id' => $defaultId]
            );
            $branding = $this->db->fetchOne('SELECT * FROM website_branding WHERE id = :id', ['id' => $defaultId]);
        }
        if ($branding && !empty($branding['social_links'])) {
            $branding['social_links'] = is_string($branding['social_links']) ? json_decode($branding['social_links'], true) : $branding['social_links'];
        }

        // 2. Sections
        $sectionRows = $this->db->fetchAll('SELECT section_key, section_data FROM cms_sections');
        $cmsSections = [];
        foreach ($sectionRows as $sr) {
            $cmsSections[$sr['section_key']] = json_decode($sr['section_data'], true);
        }

        // 3. Announcements
        $announcements = $this->db->fetchAll(
            'SELECT id, title, content, category, is_pinned, status, author, created_at 
             FROM announcements 
             WHERE status = "published" 
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

        // 1. Branding
        $branding = $this->db->fetchOne('SELECT * FROM website_branding LIMIT 1');
        if ($branding && !empty($branding['social_links'])) {
            $branding['social_links'] = json_decode($branding['social_links'], true);
        }

        // 2. CMS Sections
        $sectionRows = $this->db->fetchAll('SELECT section_key, section_data FROM cms_sections');
        $cmsSections = [];
        foreach ($sectionRows as $sr) {
            $cmsSections[$sr['section_key']] = json_decode($sr['section_data'], true);
        }

        // 3. Announcements (all drafts and published)
        $announcements = $this->db->fetchAll(
            'SELECT id, title, content, category, is_pinned, status, author, created_at, updated_at 
             FROM announcements 
             ORDER BY is_pinned DESC, created_at DESC'
        );
        foreach ($announcements as &$a) {
            $a['is_pinned'] = (bool)$a['is_pinned'];
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
            'pageVisibility' => $cmsSections['pageVisibility'] ?? [
                'services' => true,
                'rates' => true,
                'about' => true,
                'contact' => true,
                'faq' => true,
                'announcements' => true,
                'terms' => true,
                'privacy' => true,
            ],
        ]);
    }

    /**
     * POST|PUT /api/cms/branding
     */
    public function updateBranding(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $b = $request->getBody();

        $existing = $this->db->fetchOne('SELECT id FROM website_branding LIMIT 1');
        if (!$existing) {
            $rowId = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO website_branding (id, company_name, tagline, logo_url, favicon_url, primary_color, secondary_color, font_family, support_phone, support_email, office_address, whatsapp_number, social_links, footer_text, copyright_text, seo_title, seo_description, seo_keywords, updated_at)
                 VALUES (:id, :name, :tag, :logo, :fav, :pcol, :scol, :font, :phone, :email, :addr, :wa, :soc, :foot, :copy, :stitle, :sdesc, :skey, NOW())',
                [
                    'id' => $rowId,
                    'name' => $b['company_name'] ?? 'HambakTech Enterprise',
                    'tag' => $b['tagline'] ?? '',
                    'logo' => $b['logo_url'] ?? '',
                    'fav' => $b['favicon_url'] ?? '/favicon.ico',
                    'pcol' => $b['primary_color'] ?? '#10b981',
                    'scol' => $b['secondary_color'] ?? '#0284c7',
                    'font' => $b['font_family'] ?? 'Plus Jakarta Sans',
                    'phone' => $b['support_phone'] ?? '+234 803 000 1122',
                    'email' => $b['support_email'] ?? 'support@hambaktech.com.ng',
                    'addr' => $b['office_address'] ?? 'Lagos, Nigeria',
                    'wa' => $b['whatsapp_number'] ?? '',
                    'soc' => isset($b['social_links']) ? (is_string($b['social_links']) ? $b['social_links'] : json_encode($b['social_links'])) : null,
                    'foot' => $b['footer_text'] ?? '',
                    'copy' => $b['copyright_text'] ?? '',
                    'stitle' => $b['seo_title'] ?? '',
                    'sdesc' => $b['seo_description'] ?? '',
                    'skey' => $b['seo_keywords'] ?? '',
                ]
            );
        } else {
            $this->db->execute(
                'UPDATE website_branding 
                 SET company_name = :name, tagline = :tag, logo_url = :logo, favicon_url = :fav,
                     primary_color = :pcol, secondary_color = :scol, font_family = :font,
                     support_phone = :phone, support_email = :email, office_address = :addr,
                     whatsapp_number = :wa, social_links = :soc, footer_text = :foot,
                     copyright_text = :copy, seo_title = :stitle, seo_description = :sdesc,
                     seo_keywords = :skey, updated_at = NOW()
                 WHERE id = :id',
                [
                    'id' => $existing['id'],
                    'name' => $b['company_name'] ?? 'HambakTech Enterprise',
                    'tag' => $b['tagline'] ?? '',
                    'logo' => $b['logo_url'] ?? '',
                    'fav' => $b['favicon_url'] ?? '/favicon.ico',
                    'pcol' => $b['primary_color'] ?? '#10b981',
                    'scol' => $b['secondary_color'] ?? '#0284c7',
                    'font' => $b['font_family'] ?? 'Plus Jakarta Sans',
                    'phone' => $b['support_phone'] ?? '+234 803 000 1122',
                    'email' => $b['support_email'] ?? 'support@hambaktech.com.ng',
                    'addr' => $b['office_address'] ?? 'Lagos, Nigeria',
                    'wa' => $b['whatsapp_number'] ?? '',
                    'soc' => isset($b['social_links']) ? (is_string($b['social_links']) ? $b['social_links'] : json_encode($b['social_links'])) : null,
                    'foot' => $b['footer_text'] ?? '',
                    'copy' => $b['copyright_text'] ?? '',
                    'stitle' => $b['seo_title'] ?? '',
                    'sdesc' => $b['seo_description'] ?? '',
                    'skey' => $b['seo_keywords'] ?? '',
                ]
            );
        }

        $updated = $this->db->fetchOne('SELECT * FROM website_branding LIMIT 1');
        if ($updated && !empty($updated['social_links'])) {
            $updated['social_links'] = is_string($updated['social_links']) ? json_decode($updated['social_links'], true) : $updated['social_links'];
        }

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
        $id = (string)$request->input('id', '');
        $title = trim((string)$request->input('title', ''));
        $content = trim((string)$request->input('content', ''));
        $category = (string)$request->input('category', 'general');
        $isPinned = (int)$request->input('is_pinned', 0);
        $status = (string)$request->input('status', 'published');

        if (empty($title) || empty($content)) {
            Response::error('Announcement title and content are required.', 422);
        }

        if (!empty($id)) {
            $this->db->execute(
                'UPDATE announcements 
                 SET title = :title, content = :content, category = :cat, is_pinned = :pin, status = :st, updated_at = NOW()
                 WHERE id = :id',
                [
                    'title' => $title,
                    'content' => $content,
                    'cat' => $category,
                    'pin' => $isPinned,
                    'st' => $status,
                    'id' => $id,
                ]
            );
        } else {
            $id = Security::generateUuid();
            $this->db->execute(
                'INSERT INTO announcements (id, title, content, category, is_pinned, status, author, created_at)
                 VALUES (:id, :title, :content, :cat, :pin, :st, :author, NOW())',
                [
                    'id' => $id,
                    'title' => $title,
                    'content' => $content,
                    'cat' => $category,
                    'pin' => $isPinned,
                    'st' => $status,
                    'author' => $user['full_name'] ?? 'Administrator',
                ]
            );
        }

        $saved = $this->db->fetchOne('SELECT * FROM announcements WHERE id = :id', ['id' => $id]);
        Response::success(['announcement' => $saved, 'id' => $id], 'Announcement saved successfully');
    }

    /**
     * PUT /api/cms/announcements/:id
     */
    public function updateAnnouncement(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $b = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM announcements WHERE id = :id', ['id' => $id]);
        if (!$existing) {
            Response::error('Announcement not found', 404);
        }

        $this->db->execute(
            'UPDATE announcements 
             SET title = :title, content = :content, category = :cat, is_pinned = :pin, status = :st, updated_at = NOW()
             WHERE id = :id',
            [
                'title' => $b['title'] ?? $existing['title'],
                'content' => $b['content'] ?? $existing['content'],
                'cat' => $b['category'] ?? $existing['category'],
                'pin' => isset($b['is_pinned']) ? (int)$b['is_pinned'] : (int)$existing['is_pinned'],
                'st' => $b['status'] ?? $existing['status'],
                'id' => $id,
            ]
        );

        $saved = $this->db->fetchOne('SELECT * FROM announcements WHERE id = :id', ['id' => $id]);
        Response::success(['announcement' => $saved], 'Announcement updated successfully');
    }

    /**
     * DELETE /api/cms/announcements/:id
     */
    public function deleteAnnouncement(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM announcements WHERE id = :id', ['id' => $id]);
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
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, NULL, :email, "CONTACT_FORM_SUBMISSION", :details, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'email' => $email,
                'details' => json_encode(compact('name', 'email', 'phone', 'subject', 'message')),
                'ip' => $request->getIp(),
            ]
        );

        Response::success(null, 'Thank you for contacting HambakTech Enterprise. Our team will review your message promptly.');
    }
}
