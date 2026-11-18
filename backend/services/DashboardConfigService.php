<?php
/**
 * @file DashboardConfigService.php
 * Central Role Catalog, Dashboard Assignment, and Draft/Preview/Publish Dashboard Configuration Service
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Database;
use HambakTech\Core\Security;
use Throwable;

class DashboardConfigService
{
    public const PORTAL_ROLES = ['customer', 'student', 'agent'];
    public const CONSOLE_ROLES = ['support', 'staff', 'manager', 'admin', 'superadmin'];
    public const ALL_ROLES = ['customer', 'student', 'agent', 'support', 'staff', 'manager', 'admin', 'superadmin'];
    public const DASHBOARD_KEYS = ['customer', 'student', 'agent', 'support', 'staff', 'manager', 'admin'];

    public const ALLOWED_PERMISSIONS = [
        'customers',
        'wallet',
        'kyc',
        'services',
        'printing',
        'printing_pricing',
        'cms',
        'audit',
        'support',
        'reports',
        'referrals',
        'withdrawals',
        'academy',
        'pin_security',
        'security',
        'settings',
        'notifications',
        'staff',
        'accounting',
        'accounting_physical',
        'accounting_reconcile',
        'accounting_adjust',
        'accounting_config',
    ];

    public static function normalizeRole(?string $role): string
    {
        $clean = strtolower(trim((string)$role));
        return in_array($clean, self::ALL_ROLES, true) ? $clean : 'customer';
    }

    public static function normalizeDashboardKey(?string $dashboard, ?string $fallbackRole = null): string
    {
        $raw = strtolower(trim((string)$dashboard));
        $aliases = [
            'customer' => 'customer',
            'customer_dashboard' => 'customer',
            'student' => 'student',
            'student_dashboard' => 'student',
            'agent' => 'agent',
            'agent_dashboard' => 'agent',
            'support' => 'support',
            'support_dashboard' => 'support',
            'staff' => 'staff',
            'staff_dashboard' => 'staff',
            'manager' => 'manager',
            'manager_dashboard' => 'manager',
            'admin' => 'admin',
            'admin_dashboard' => 'admin',
            'superadmin' => 'admin',
            'superadmin_dashboard' => 'admin',
        ];
        if (isset($aliases[$raw])) {
            return $aliases[$raw];
        }
        $roleKey = self::normalizeRole($fallbackRole ?? 'customer');
        return $aliases[$roleKey] ?? 'customer';
    }

    public static function getDefaultPermissionsForRole(string $role): array
    {
        return match (self::normalizeRole($role)) {
            'superadmin' => ['*'],
            'admin' => [
                'customers', 'wallet', 'kyc', 'services', 'printing', 'printing_pricing',
                'cms', 'audit', 'support', 'reports', 'referrals', 'withdrawals',
                'academy', 'notifications', 'accounting', 'accounting_physical', 'accounting_reconcile',
            ],
            'manager' => [
                'customers', 'wallet', 'kyc', 'services', 'printing', 'printing_pricing',
                'support', 'reports', 'referrals', 'withdrawals', 'academy',
                'accounting', 'accounting_physical', 'accounting_reconcile', 'notifications',
            ],
            'support' => ['support', 'customers', 'notifications'],
            'staff' => ['printing', 'support'],
            default => [],
        };
    }

    public static function getRolesCatalog(): array
    {
        return [
            [
                'slug' => 'customer',
                'name' => 'Customer',
                'category' => 'portal',
                'default_dashboard' => 'customer',
                'description' => 'Standard self-service portal for VTU telecoms, NIN/BVN verification, printing, and wallet.',
                'default_permissions' => [],
                'requires_superadmin' => false,
            ],
            [
                'slug' => 'student',
                'name' => 'Student',
                'category' => 'portal',
                'default_dashboard' => 'student',
                'description' => 'Digital Training Academy student portal with enrolled courses, QR ID card, and wallet services.',
                'default_permissions' => [],
                'requires_superadmin' => false,
            ],
            [
                'slug' => 'agent',
                'name' => 'Agent / Reseller',
                'category' => 'portal',
                'default_dashboard' => 'agent',
                'description' => 'Partner reseller workspace with wholesale VTU/identity access, referrals, and sub-customer tools.',
                'default_permissions' => [],
                'requires_superadmin' => false,
            ],
            [
                'slug' => 'support',
                'name' => 'Support Agent',
                'category' => 'console',
                'default_dashboard' => 'support',
                'description' => 'Internal Help Desk agent for ticket resolution, customer assistance, and notifications.',
                'default_permissions' => self::getDefaultPermissionsForRole('support'),
                'requires_superadmin' => true,
            ],
            [
                'slug' => 'staff',
                'name' => 'Operations Staff',
                'category' => 'console',
                'default_dashboard' => 'staff',
                'description' => 'Internal staff workspace scoped to assigned operational modules (e.g. Printing, Support, KYC).',
                'default_permissions' => self::getDefaultPermissionsForRole('staff'),
                'requires_superadmin' => true,
            ],
            [
                'slug' => 'manager',
                'name' => 'Operations Manager',
                'category' => 'console',
                'default_dashboard' => 'manager',
                'description' => 'Management console covering daily operations, reporting, printing, academy, and accounting oversight.',
                'default_permissions' => self::getDefaultPermissionsForRole('manager'),
                'requires_superadmin' => true,
            ],
            [
                'slug' => 'admin',
                'name' => 'Administrator',
                'category' => 'console',
                'default_dashboard' => 'admin',
                'description' => 'Senior platform administrator across customers, services, CMS, KYC, and compliance.',
                'default_permissions' => self::getDefaultPermissionsForRole('admin'),
                'requires_superadmin' => true,
            ],
            [
                'slug' => 'superadmin',
                'name' => 'Super Administrator',
                'category' => 'console',
                'default_dashboard' => 'admin',
                'description' => 'Unrestricted highest system authority including user/role governance, security policy, and dashboard config.',
                'default_permissions' => ['*'],
                'requires_superadmin' => true,
            ],
        ];
    }

    public static function getDashboardsCatalog(): array
    {
        return [
            ['key' => 'customer', 'name' => 'Customer Portal', 'category' => 'portal', 'description' => 'Self-service customer workspace for telecom, NIN/BVN, printing, and wallet.'],
            ['key' => 'student', 'name' => 'Student Portal (Academy)', 'category' => 'portal', 'description' => 'Academy student workspace showcasing enrolled programs, QR Student ID Card, and wallet tools.'],
            ['key' => 'agent', 'name' => 'Agent / Reseller Portal', 'category' => 'portal', 'description' => 'Partner reseller workspace with bulk telecom/identity tools and referral growth features.'],
            ['key' => 'support', 'name' => 'Support Agent Console', 'category' => 'console', 'description' => 'Dedicated helpdesk console for resolving customer tickets and checking account summaries.'],
            ['key' => 'staff', 'name' => 'Operations Staff Console', 'category' => 'console', 'description' => 'Permission-scoped operations console for assigned staff workflows.'],
            ['key' => 'manager', 'name' => 'Operations Manager Console', 'category' => 'console', 'description' => 'Operations management console with KPIs, reporting, printing, and reconciliation access.'],
            ['key' => 'admin', 'name' => 'Admin & Super Admin Console', 'category' => 'console', 'description' => 'Full central administration and system governance console.'],
        ];
    }

    public static function defaultPortalModules(string $dashboardKey = 'customer'): array
    {
        $isStudent = $dashboardKey === 'student';
        $isAgent = $dashboardKey === 'agent';

        return [
            ['id' => 'dashboard', 'label' => 'Dashboard', 'description' => 'Workspace overview, balance, and quick actions', 'status' => 'active', 'visible' => true, 'order' => 1],
            ['id' => 'academy', 'label' => $isStudent ? 'My Academy & ID Card' : 'Academy', 'description' => 'Digital Training Academy courses, admissions & QR Student ID Card', 'status' => 'active', 'visible' => true, 'order' => $isStudent ? 2 : 9],
            ['id' => 'nin', 'label' => 'NIN & BVN Services', 'description' => 'NIMC & BVN identity verification, slips, modifications & enrolment', 'status' => 'active', 'visible' => true, 'order' => $isStudent ? 3 : 2],
            ['id' => 'telecom', 'label' => 'Telecom & VTU', 'description' => 'Data bundles, airtime cashback, utility bills, pins & bulk SMS', 'status' => 'active', 'visible' => true, 'order' => $isStudent ? 4 : 3],
            ['id' => 'digital', 'label' => 'Digital Services', 'description' => 'Cable TV bouquets & electricity prepaid tokens', 'status' => 'active', 'visible' => true, 'order' => 4],
            ['id' => 'printing', 'label' => 'Printing Services', 'description' => 'Document printing, ID cards, banners, photos & delivery tracking', 'status' => 'active', 'visible' => true, 'order' => 5],
            ['id' => 'wallet', 'label' => 'Wallet & Funding', 'description' => 'Paystack, Moniepoint VA, wallet ledger & funding requests', 'status' => 'active', 'visible' => true, 'order' => 6],
            ['id' => 'referrals', 'label' => $isAgent ? 'Agent Commission & Referrals' : 'Referral Rewards', 'description' => 'Invite users, earn points & convert rewards to wallet or cash', 'status' => 'active', 'visible' => true, 'order' => $isAgent ? 3 : 7],
            ['id' => 'store', 'label' => 'Hardware Store', 'description' => 'POS terminals, biometric scanners & digital hardware catalog', 'status' => 'active', 'visible' => true, 'order' => 8],
            ['id' => 'reports', 'label' => 'Reports & Statements', 'description' => 'Downloadable wallet statements & spending breakdown', 'status' => 'active', 'visible' => true, 'order' => 10],
            ['id' => 'transactions', 'label' => 'Transactions', 'description' => 'Full double-entry transaction ledger history', 'status' => 'active', 'visible' => true, 'order' => 11],
            ['id' => 'orders', 'label' => 'Orders', 'description' => 'Telecom & digital service order fulfillment logs', 'status' => 'active', 'visible' => true, 'order' => 12],
            ['id' => 'kyc', 'label' => 'Identity & KYC', 'description' => 'Upgrade KYC tier & view dedicated virtual account status', 'status' => 'active', 'visible' => true, 'order' => 13],
            ['id' => 'notifications', 'label' => 'Notifications', 'description' => 'System alerts, transaction updates & announcements', 'status' => 'active', 'visible' => true, 'order' => 14],
            ['id' => 'messages', 'label' => 'Messages', 'description' => 'Direct inbox messages & broadcast notices', 'status' => 'active', 'visible' => true, 'order' => 15],
            ['id' => 'support', 'label' => 'Support / Help', 'description' => 'Open support tickets & track team responses', 'status' => 'active', 'visible' => true, 'order' => 16],
            ['id' => 'profile', 'label' => 'Profile', 'description' => 'Personal identity details & referral code', 'status' => 'active', 'visible' => true, 'order' => 17],
            ['id' => 'settings', 'label' => 'Security & PIN', 'description' => 'Transaction PIN, password & notification preferences', 'status' => 'active', 'visible' => true, 'order' => 18],
        ];
    }

    public static function defaultConsoleModules(string $dashboardKey): array
    {
        $items = [
            ['id' => 'overview', 'label' => 'Overview Hub', 'description' => 'Executive KPIs, metrics & pending approvals', 'status' => 'active', 'visible' => true, 'order' => 1],
            ['id' => 'customers', 'label' => 'Customer Management', 'description' => 'Registered users, roles, KYC & wallet balance directory', 'status' => 'active', 'visible' => true, 'order' => 2],
            ['id' => 'support_admin', 'label' => 'Support Desk', 'description' => 'Customer support ticket triage & live resolution', 'status' => 'active', 'visible' => true, 'order' => 3],
            ['id' => 'printing_admin', 'label' => 'Printing Operations', 'description' => 'Printing quotes, production status, delivery & pricing', 'status' => 'active', 'visible' => true, 'order' => 4],
            ['id' => 'academy_admin', 'label' => 'Academy Management', 'description' => 'Courses, student admissions review & QR ID cards', 'status' => 'active', 'visible' => true, 'order' => 5],
            ['id' => 'kyc_admin', 'label' => 'KYC & Security Rules', 'description' => 'Identity compliance review & tier limits', 'status' => 'active', 'visible' => in_array($dashboardKey, ['manager', 'admin', 'staff'], true), 'order' => 6],
            ['id' => 'accounting', 'label' => 'Business Accounting', 'description' => 'Website ledger, physical sales, expenses & reconciliations', 'status' => 'active', 'visible' => in_array($dashboardKey, ['manager', 'admin'], true), 'order' => 7],
            ['id' => 'services', 'label' => 'Service Pricing & Telecom', 'description' => 'NIN/BVN pricing, telecom plans & provider status', 'status' => 'active', 'visible' => in_array($dashboardKey, ['manager', 'admin'], true), 'order' => 8],
            ['id' => 'referrals_admin', 'label' => 'Referrals & Withdrawals', 'description' => 'Referral campaigns, rewards & cash payout approvals', 'status' => 'active', 'visible' => in_array($dashboardKey, ['manager', 'admin'], true), 'order' => 9],
            ['id' => 'notifications_admin', 'label' => 'Broadcast & Notifications', 'description' => 'Platform announcements & SMTP/SMS messaging', 'status' => 'active', 'visible' => in_array($dashboardKey, ['support', 'manager', 'admin'], true), 'order' => 10],
            ['id' => 'cms', 'label' => 'Website CMS & Branding', 'description' => 'Landing page content, FAQs & legal pages', 'status' => 'active', 'visible' => $dashboardKey === 'admin', 'order' => 11],
            ['id' => 'staff', 'label' => 'Staff & Role Permissions', 'description' => 'Internal roles & RBAC access matrix', 'status' => 'active', 'visible' => $dashboardKey === 'admin', 'order' => 12],
            ['id' => 'modules', 'label' => 'Dashboard Management', 'description' => 'Central role dashboard configurator & preview', 'status' => 'active', 'visible' => $dashboardKey === 'admin', 'order' => 13],
            ['id' => 'security_audit', 'label' => 'Security & Audit Trail', 'description' => 'Active sessions, MFA policies & audit footprint', 'status' => 'active', 'visible' => $dashboardKey === 'admin', 'order' => 14],
        ];
        usort($items, fn($a, $b) => ($a['order'] ?? 99) <=> ($b['order'] ?? 99));
        return $items;
    }

    public static function getDefaultConfig(string $dashboardKey): array
    {
        $key = self::normalizeDashboardKey($dashboardKey, $dashboardKey);
        $isPortal = in_array($key, ['customer', 'student', 'agent'], true);

        if ($isPortal) {
            $titles = [
                'customer' => ['Customer Portal', 'Welcome to HAMBAKTECH', 'Your real-time workspace for Nigerian telecom vending, identity lookups, printing, and wallet management.'],
                'student' => ['Student Portal', 'Academy Student Workspace', 'Track your Digital Training Academy admission, download your verified QR Student ID Card, and access wallet services.'],
                'agent' => ['Agent / Reseller Portal', 'Partner Reseller Workspace', 'High-volume identity verification, wholesale telecom vending, printing services, and referral commissions.'],
            ];
            [$badge, $title, $subtitle] = $titles[$key];
            $modules = self::defaultPortalModules($key);
            usort($modules, fn($a, $b) => ($a['order'] ?? 99) <=> ($b['order'] ?? 99));

            return [
                'dashboard_key' => $key,
                'category' => 'portal',
                'title' => $title,
                'subtitle' => $subtitle,
                'badge_text' => $badge,
                'default_tab' => $key === 'student' ? 'dashboard' : 'dashboard',
                'announcement_banner' => [
                    'enabled' => $key === 'student' || $key === 'agent',
                    'title' => $key === 'student'
                        ? 'Academy Student Portal Active'
                        : ($key === 'agent' ? 'Authorized Partner Reseller Rates Active' : 'Platform Notice'),
                    'message' => $key === 'student'
                        ? 'Your verified Academy enrollments, course schedules, and QR Student ID Card are available directly from your Student Workspace.'
                        : ($key === 'agent'
                            ? 'Process bulk NIN/BVN lookups, telecom top-ups, and grow referral commissions with priority processing.'
                            : 'Enjoy instant automated wallet funding, VTU cashback, and NIMC/BVN verification services.'),
                    'tone' => $key === 'student' ? 'info' : 'emerald',
                ],
                'sections' => [
                    'wallet_balance_card' => true,
                    'transaction_kpis' => true,
                    'quick_actions_grid' => true,
                    'recent_activities' => true,
                    'notice_board' => true,
                    'virtual_account_card' => true,
                    'kyc_upgrade_banner' => true,
                    'student_academy_hero' => $key === 'student',
                    'agent_reseller_panel' => $key === 'agent',
                ],
                'features' => [
                    'enable_wallet_funding' => true,
                    'enable_nin_bvn' => true,
                    'enable_telecom' => true,
                    'enable_printing' => true,
                    'enable_academy_enrollment' => true,
                    'enable_student_id_card' => true,
                    'enable_referrals' => true,
                    'enable_support_tickets' => true,
                ],
                'modules' => $modules,
                'required_permissions' => [],
            ];
        }

        $consoleMeta = [
            'support' => ['Support Agent Console', 'Customer Support Desk', 'Review customer tickets, assist with order inquiries, and inspect account verification status.', 'support_admin'],
            'staff' => ['Operations Staff Console', 'Staff Operations Workspace', 'Execute assigned daily operational tasks across printing, academy, or customer support queues.', 'overview'],
            'manager' => ['Operations Manager Console', 'Operations Management Hub', 'Oversee daily fulfillment, financial reconciliation, printing production, and team KPIs.', 'overview'],
            'admin' => ['Administrator Console', 'Enterprise Control Center', 'Centralized management across customers, identity services, telecom, academy, and compliance.', 'overview'],
        ];
        [$badge, $title, $subtitle, $defaultTab] = $consoleMeta[$key] ?? $consoleMeta['admin'];

        return [
            'dashboard_key' => $key,
            'category' => 'console',
            'title' => $title,
            'subtitle' => $subtitle,
            'badge_text' => $badge,
            'default_tab' => $defaultTab,
            'announcement_banner' => [
                'enabled' => false,
                'title' => 'Operations Briefing',
                'message' => 'All actions performed inside internal consoles are recorded in the immutable security audit ledger.',
                'tone' => 'info',
            ],
            'sections' => [
                'kpi_financial_cards' => in_array($key, ['manager', 'admin'], true),
                'kpi_customer_cards' => true,
                'quick_preview_launcher' => $key === 'admin',
                'recent_registrations' => in_array($key, ['support', 'manager', 'admin'], true),
                'pending_funding_queue' => in_array($key, ['manager', 'admin'], true),
                'printing_ops_summary' => in_array($key, ['staff', 'manager', 'admin'], true),
            ],
            'features' => [
                'show_revenue_metrics' => in_array($key, ['manager', 'admin'], true),
                'allow_customer_lookup' => in_array($key, ['support', 'manager', 'admin'], true),
                'allow_ticket_resolution' => true,
                'allow_kyc_review' => in_array($key, ['manager', 'admin'], true),
                'allow_printing_ops' => in_array($key, ['staff', 'manager', 'admin'], true),
                'allow_academy_review' => in_array($key, ['manager', 'admin'], true),
            ],
            'modules' => self::defaultConsoleModules($key),
            'required_permissions' => self::getDefaultPermissionsForRole($key),
        ];
    }

    public static function ensureTable(Database $db): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }
        $ensured = true;

        try {
            $db->execute(
                'CREATE TABLE IF NOT EXISTS role_dashboard_configs (
                    dashboard_key VARCHAR(64) PRIMARY KEY,
                    category ENUM("portal", "console") NOT NULL DEFAULT "portal",
                    draft_config JSON NOT NULL,
                    published_config JSON NOT NULL,
                    has_unpublished_changes TINYINT(1) NOT NULL DEFAULT 0,
                    updated_by VARCHAR(100) NULL,
                    published_by VARCHAR(100) NULL,
                    published_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable) {
        }

        // Seed missing configs idempotently without overwriting existing admin drafts/published records
        foreach (self::DASHBOARD_KEYS as $key) {
            try {
                $existing = $db->fetchOne('SELECT dashboard_key FROM role_dashboard_configs WHERE dashboard_key = :k LIMIT 1', ['k' => $key]);
                if (!$existing) {
                    $def = self::getDefaultConfig($key);
                    // Sync legacy customer dashboard_modules toggles into default customer published config on first seed
                    if ($key === 'customer') {
                        $def = self::mergeLegacyModulesIntoConfig($db, $def);
                    }
                    $json = json_encode($def, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                    $db->execute(
                        'INSERT IGNORE INTO role_dashboard_configs
                         (dashboard_key, category, draft_config, published_config, has_unpublished_changes, updated_by, published_by, published_at)
                         VALUES (:k, :cat, :draft, :pub, 0, "system", "system", NOW())',
                        [
                            'k' => $key,
                            'cat' => $def['category'],
                            'draft' => $json,
                            'pub' => $json,
                        ]
                    );
                }
            } catch (Throwable) {
            }
        }
    }

    private static function mergeLegacyModulesIntoConfig(Database $db, array $cfg): array
    {
        try {
            $rows = $db->fetchAll('SELECT module_key, name, description, status, is_visible, coming_soon_message, display_order FROM dashboard_modules');
            if (!empty($rows) && !empty($cfg['modules'])) {
                $byKey = [];
                foreach ($rows as $r) {
                    $byKey[(string)$r['module_key']] = $r;
                }
                foreach ($cfg['modules'] as &$mod) {
                    $mk = (string)($mod['id'] ?? '');
                    if (isset($byKey[$mk])) {
                        $r = $byKey[$mk];
                        $mod['status'] = (string)($r['status'] ?? $mod['status']);
                        $mod['visible'] = (bool)($r['is_visible'] ?? $mod['visible']);
                        if (!empty($r['coming_soon_message'])) {
                            $mod['coming_soon_message'] = (string)$r['coming_soon_message'];
                        }
                    }
                }
                unset($mod);
            }
        } catch (Throwable) {
        }
        return $cfg;
    }

    public static function sanitizeConfigPayload(string $dashboardKey, array $raw): array
    {
        $base = self::getDefaultConfig($dashboardKey);

        $merged = $base;
        if (isset($raw['title']) && is_string($raw['title'])) {
            $merged['title'] = mb_substr(trim($raw['title']), 0, 120) ?: $base['title'];
        }
        if (isset($raw['subtitle']) && is_string($raw['subtitle'])) {
            $merged['subtitle'] = mb_substr(trim($raw['subtitle']), 0, 300);
        }
        if (isset($raw['badge_text']) && is_string($raw['badge_text'])) {
            $merged['badge_text'] = mb_substr(trim($raw['badge_text']), 0, 60) ?: $base['badge_text'];
        }
        if (isset($raw['default_tab']) && is_string($raw['default_tab'])) {
            $merged['default_tab'] = preg_replace('/[^a-z0-9_-]/i', '', trim($raw['default_tab'])) ?: $base['default_tab'];
        }

        if (isset($raw['announcement_banner']) && is_array($raw['announcement_banner'])) {
            $ab = $raw['announcement_banner'];
            $tone = in_array($ab['tone'] ?? '', ['info', 'emerald', 'amber'], true) ? $ab['tone'] : $base['announcement_banner']['tone'];
            $merged['announcement_banner'] = [
                'enabled' => (bool)($ab['enabled'] ?? $base['announcement_banner']['enabled']),
                'title' => mb_substr(trim((string)($ab['title'] ?? $base['announcement_banner']['title'])), 0, 120),
                'message' => mb_substr(trim((string)($ab['message'] ?? $base['announcement_banner']['message'])), 0, 500),
                'tone' => $tone,
            ];
        }

        if (isset($raw['sections']) && is_array($raw['sections'])) {
            foreach ($base['sections'] as $sKey => $defBool) {
                if (array_key_exists($sKey, $raw['sections'])) {
                    $merged['sections'][$sKey] = (bool)$raw['sections'][$sKey];
                }
            }
        }

        if (isset($raw['features']) && is_array($raw['features'])) {
            foreach ($base['features'] as $fKey => $defBool) {
                if (array_key_exists($fKey, $raw['features'])) {
                    $merged['features'][$fKey] = (bool)$raw['features'][$fKey];
                }
            }
        }

        if (isset($raw['modules']) && is_array($raw['modules'])) {
            $baseMap = [];
            foreach ($base['modules'] as $bm) {
                $baseMap[$bm['id']] = $bm;
            }
            $cleanMods = [];
            $seen = [];
            foreach ($raw['modules'] as $idx => $rm) {
                if (!is_array($rm)) continue;
                $id = trim((string)($rm['id'] ?? ''));
                if ($id === '' || !isset($baseMap[$id]) || isset($seen[$id])) continue;
                $seen[$id] = true;
                $bm = $baseMap[$id];
                $st = in_array($rm['status'] ?? '', ['active', 'coming_soon', 'disabled'], true) ? $rm['status'] : $bm['status'];
                $item = [
                    'id' => $id,
                    'label' => mb_substr(trim((string)($rm['label'] ?? $bm['label'])), 0, 80) ?: $bm['label'],
                    'description' => mb_substr(trim((string)($rm['description'] ?? $bm['description'])), 0, 220),
                    'status' => $st,
                    'visible' => array_key_exists('visible', $rm) ? (bool)$rm['visible'] : (bool)$bm['visible'],
                    'order' => isset($rm['order']) ? max(1, (int)$rm['order']) : ($idx + 1),
                ];
                if (!empty($rm['coming_soon_message'])) {
                    $item['coming_soon_message'] = mb_substr(trim((string)$rm['coming_soon_message']), 0, 300);
                }
                $cleanMods[] = $item;
            }
            foreach ($base['modules'] as $bm) {
                if (!isset($seen[$bm['id']])) {
                    $cleanMods[] = $bm;
                }
            }
            usort($cleanMods, fn($a, $b) => ($a['order'] ?? 99) <=> ($b['order'] ?? 99));
            $merged['modules'] = $cleanMods;
        }

        return $merged;
    }

    public static function getConfig(Database $db, string $dashboardKey, string $mode = 'published'): array
    {
        $key = self::normalizeDashboardKey($dashboardKey, $dashboardKey);
        self::ensureTable($db);
        $def = self::getDefaultConfig($key);

        try {
            $row = $db->fetchOne('SELECT * FROM role_dashboard_configs WHERE dashboard_key = :k LIMIT 1', ['k' => $key]);
            if ($row) {
                $col = ($mode === 'draft') ? 'draft_config' : 'published_config';
                $decoded = is_string($row[$col] ?? null) ? json_decode((string)$row[$col], true) : null;
                if (is_array($decoded)) {
                    $sanitized = self::sanitizeConfigPayload($key, $decoded);
                    if ($key === 'customer' && $mode === 'published') {
                        $sanitized = self::mergeLegacyModulesIntoConfig($db, $sanitized);
                    }
                    return $sanitized;
                }
            }
        } catch (Throwable) {
        }

        return $def;
    }

    public static function listAllConfigs(Database $db): array
    {
        self::ensureTable($db);
        $catalog = self::getDashboardsCatalog();
        $rows = [];
        try {
            $dbRows = $db->fetchAll('SELECT * FROM role_dashboard_configs');
            foreach ($dbRows as $r) {
                $rows[(string)$r['dashboard_key']] = $r;
            }
        } catch (Throwable) {
        }

        $result = [];
        foreach ($catalog as $meta) {
            $key = $meta['key'];
            $r = $rows[$key] ?? null;
            $def = self::getDefaultConfig($key);
            $draft = ($r && is_string($r['draft_config'] ?? null)) ? (json_decode((string)$r['draft_config'], true) ?: $def) : $def;
            $pub = ($r && is_string($r['published_config'] ?? null)) ? (json_decode((string)$r['published_config'], true) ?: $def) : $def;
            $result[] = [
                'dashboard_key' => $key,
                'name' => $meta['name'],
                'category' => $meta['category'],
                'description' => $meta['description'],
                'draft_config' => self::sanitizeConfigPayload($key, $draft),
                'published_config' => self::sanitizeConfigPayload($key, $pub),
                'has_unpublished_changes' => (bool)($r['has_unpublished_changes'] ?? false),
                'updated_by' => $r['updated_by'] ?? null,
                'updated_at' => $r['updated_at'] ?? null,
                'published_by' => $r['published_by'] ?? null,
                'published_at' => $r['published_at'] ?? null,
            ];
        }
        return $result;
    }

    public static function saveDraft(Database $db, string $dashboardKey, array $payload, string $actorEmail): array
    {
        $key = self::normalizeDashboardKey($dashboardKey, $dashboardKey);
        self::ensureTable($db);
        $clean = self::sanitizeConfigPayload($key, $payload);
        $draftJson = json_encode($clean, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $existing = $db->fetchOne('SELECT published_config FROM role_dashboard_configs WHERE dashboard_key = :k LIMIT 1', ['k' => $key]);
        $pubJson = $existing['published_config'] ?? $draftJson;

        $db->execute(
            'INSERT INTO role_dashboard_configs
             (dashboard_key, category, draft_config, published_config, has_unpublished_changes, updated_by, published_by, published_at)
             VALUES (:k, :cat, :draft, :pub, 1, :ub, :pb, NOW())
             ON DUPLICATE KEY UPDATE
                draft_config = :draft2,
                has_unpublished_changes = 1,
                updated_by = :ub2,
                updated_at = NOW()',
            [
                'k' => $key,
                'cat' => $clean['category'],
                'draft' => $draftJson,
                'pub' => $pubJson,
                'ub' => $actorEmail,
                'pb' => $actorEmail,
                'draft2' => $draftJson,
                'ub2' => $actorEmail,
            ]
        );

        return self::getRecord($db, $key);
    }

    public static function publish(Database $db, string $dashboardKey, string $actorEmail, ?array $optionalDraftPayload = null): array
    {
        $key = self::normalizeDashboardKey($dashboardKey, $dashboardKey);
        self::ensureTable($db);

        if ($optionalDraftPayload !== null) {
            self::saveDraft($db, $key, $optionalDraftPayload, $actorEmail);
        }

        $row = $db->fetchOne('SELECT draft_config FROM role_dashboard_configs WHERE dashboard_key = :k LIMIT 1', ['k' => $key]);
        $draft = ($row && is_string($row['draft_config'] ?? null))
            ? (json_decode((string)$row['draft_config'], true) ?: self::getDefaultConfig($key))
            : self::getDefaultConfig($key);
        $clean = self::sanitizeConfigPayload($key, $draft);
        $json = json_encode($clean, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $db->execute(
            'INSERT INTO role_dashboard_configs
             (dashboard_key, category, draft_config, published_config, has_unpublished_changes, updated_by, published_by, published_at)
             VALUES (:k, :cat, :draft, :pub, 0, :ub, :pb, NOW())
             ON DUPLICATE KEY UPDATE
                draft_config = :draft2,
                published_config = :pub2,
                has_unpublished_changes = 0,
                updated_by = :ub2,
                published_by = :pb2,
                published_at = NOW(),
                updated_at = NOW()',
            [
                'k' => $key,
                'cat' => $clean['category'],
                'draft' => $json,
                'pub' => $json,
                'ub' => $actorEmail,
                'pb' => $actorEmail,
                'draft2' => $json,
                'pub2' => $json,
                'ub2' => $actorEmail,
                'pb2' => $actorEmail,
            ]
        );

        // Keep legacy dashboard_modules table aligned when publishing customer workspace
        if ($key === 'customer' && !empty($clean['modules'])) {
            foreach ($clean['modules'] as $m) {
                try {
                    $db->execute(
                        'UPDATE dashboard_modules
                         SET name = :nm, description = :dsc, status = :st, is_visible = :vis, coming_soon_message = :csm, display_order = :ord
                         WHERE module_key = :mk OR id = :mk2',
                        [
                            'nm' => $m['label'],
                            'dsc' => $m['description'] ?? '',
                            'st' => $m['status'],
                            'vis' => !empty($m['visible']) ? 1 : 0,
                            'csm' => $m['coming_soon_message'] ?? null,
                            'ord' => (int)($m['order'] ?? 1),
                            'mk' => $m['id'],
                            'mk2' => $m['id'],
                        ]
                    );
                } catch (Throwable) {
                }
            }
        }

        return self::getRecord($db, $key);
    }

    public static function getRecord(Database $db, string $dashboardKey): array
    {
        $key = self::normalizeDashboardKey($dashboardKey, $dashboardKey);
        self::ensureTable($db);
        $metaMap = [];
        foreach (self::getDashboardsCatalog() as $m) {
            $metaMap[$m['key']] = $m;
        }
        $meta = $metaMap[$key] ?? ['key' => $key, 'name' => ucfirst($key) . ' Dashboard', 'category' => 'portal', 'description' => ''];
        $r = $db->fetchOne('SELECT * FROM role_dashboard_configs WHERE dashboard_key = :k LIMIT 1', ['k' => $key]);
        $def = self::getDefaultConfig($key);
        $draft = ($r && is_string($r['draft_config'] ?? null)) ? (json_decode((string)$r['draft_config'], true) ?: $def) : $def;
        $pub = ($r && is_string($r['published_config'] ?? null)) ? (json_decode((string)$r['published_config'], true) ?: $def) : $def;

        return [
            'dashboard_key' => $key,
            'name' => $meta['name'],
            'category' => $meta['category'],
            'description' => $meta['description'],
            'draft_config' => self::sanitizeConfigPayload($key, $draft),
            'published_config' => self::sanitizeConfigPayload($key, $pub),
            'has_unpublished_changes' => (bool)($r['has_unpublished_changes'] ?? false),
            'updated_by' => $r['updated_by'] ?? null,
            'updated_at' => $r['updated_at'] ?? null,
            'published_by' => $r['published_by'] ?? null,
            'published_at' => $r['published_at'] ?? null,
        ];
    }
}
