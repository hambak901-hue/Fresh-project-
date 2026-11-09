<?php
/**
 * @file CmsController.php
 * Public Website, Branding & Content Management System Controller
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

    public function publicData(Request $request): void
    {
        // 1. Branding
        $branding = $this->db->fetchOne('SELECT * FROM website_branding LIMIT 1');
        if ($branding && !empty($branding['social_links'])) {
            $branding['social_links'] = json_decode($branding['social_links'], true);
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
            'SELECT id, category, question, answer, display_order 
             FROM faqs 
             WHERE is_active = 1 
             ORDER BY display_order ASC'
        );

        // 5. Navigation
        $nav = $this->db->fetchAll(
            'SELECT id, menu_key, label, page_key, display_order, is_active as enabled 
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

        Response::success([
            'branding' => $branding,
            'cms_sections' => $cmsSections,
            'announcements' => $announcements,
            'faqs' => $faqs,
            'navigation' => $nav,
            'dashboard_modules' => $modules,
        ]);
    }

    public function updateBranding(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $b = $request->getBody();

        $this->db->execute(
            'UPDATE website_branding 
             SET company_name = :name, tagline = :tag, logo_url = :logo, favicon_url = :fav,
                 primary_color = :pcol, secondary_color = :scol, font_family = :font,
                 support_phone = :phone, support_email = :email, office_address = :addr,
                 whatsapp_number = :wa, social_links = :soc, footer_text = :foot,
                 copyright_text = :copy, seo_title = :stitle, seo_description = :sdesc,
                 seo_keywords = :skey, updated_at = NOW()
             WHERE id = (SELECT id FROM website_branding LIMIT 1)',
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
                'addr' => $b['office_address'] ?? '',
                'wa' => $b['whatsapp_number'] ?? '',
                'soc' => isset($b['social_links']) ? json_encode($b['social_links']) : null,
                'foot' => $b['footer_text'] ?? '',
                'copy' => $b['copyright_text'] ?? '',
                'stitle' => $b['seo_title'] ?? '',
                'sdesc' => $b['seo_description'] ?? '',
                'skey' => $b['seo_keywords'] ?? '',
            ]
        );

        Response::success(null, 'Branding updated successfully in MySQL');
    }

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

        Response::success(null, 'CMS sections updated successfully');
    }

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
                compact('title', 'content', 'cat', 'pin', 'st', 'id')
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
                    'author' => $user['full_name'],
                ]
            );
        }

        Response::success(['id' => $id], 'Announcement saved successfully');
    }
}
