/**
 * @file dashboardConfig.ts
 * Express dev-server mirror of PHP DashboardConfigService.php.
 * Provides canonical 8-role catalog, dashboard catalog, default role permissions,
 * and Draft -> Preview -> Publish role dashboard configuration management.
 */

import { db } from '../db/database.js';

export const PORTAL_ROLES = ['customer', 'student', 'agent'] as const;
export const CONSOLE_ROLES = ['support', 'staff', 'manager', 'admin', 'superadmin'] as const;
export const ALL_ROLES = [
  'customer',
  'student',
  'agent',
  'support',
  'staff',
  'manager',
  'admin',
  'superadmin',
] as const;

export const DASHBOARD_KEYS = [
  'customer',
  'student',
  'agent',
  'support',
  'staff',
  'manager',
  'admin',
] as const;

export type CanonicalRole = (typeof ALL_ROLES)[number];
export type DashboardKey = (typeof DASHBOARD_KEYS)[number];

export const ALLOWED_PERMISSIONS = [
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
] as const;

export function normalizeRole(role?: string | null): CanonicalRole {
  const clean = String(role || '').trim().toLowerCase();
  return (ALL_ROLES as readonly string[]).includes(clean)
    ? (clean as CanonicalRole)
    : 'customer';
}

export function isConsoleRole(role?: string | null): boolean {
  const clean = String(role || '').trim().toLowerCase();
  return (CONSOLE_ROLES as readonly string[]).includes(clean);
}

export function normalizeDashboardKey(dashboard?: string | null, fallbackRole?: string | null): DashboardKey {
  const raw = String(dashboard || '').trim().toLowerCase();
  const aliases: Record<string, DashboardKey> = {
    customer: 'customer',
    customer_dashboard: 'customer',
    student: 'student',
    student_dashboard: 'student',
    agent: 'agent',
    agent_dashboard: 'agent',
    support: 'support',
    support_dashboard: 'support',
    staff: 'staff',
    staff_dashboard: 'staff',
    manager: 'manager',
    manager_dashboard: 'manager',
    admin: 'admin',
    admin_dashboard: 'admin',
    superadmin: 'admin',
    superadmin_dashboard: 'admin',
  };
  if (raw && aliases[raw]) {
    return aliases[raw];
  }
  const roleNorm = normalizeRole(fallbackRole || 'customer');
  return aliases[roleNorm] || 'customer';
}

export function getDefaultPermissionsForRole(role: string): string[] {
  switch (normalizeRole(role)) {
    case 'superadmin':
      return ['*'];
    case 'admin':
      return [
        'customers', 'wallet', 'kyc', 'services', 'printing', 'printing_pricing',
        'cms', 'audit', 'support', 'reports', 'referrals', 'withdrawals',
        'academy', 'notifications', 'accounting', 'accounting_physical', 'accounting_reconcile',
      ];
    case 'manager':
      return [
        'customers', 'wallet', 'kyc', 'services', 'printing', 'printing_pricing',
        'support', 'reports', 'referrals', 'withdrawals', 'academy',
        'accounting', 'accounting_physical', 'accounting_reconcile', 'notifications',
      ];
    case 'support':
      return ['support', 'customers', 'notifications'];
    case 'staff':
      return ['printing', 'support'];
    default:
      return [];
  }
}

export function getRolesCatalog() {
  return [
    {
      slug: 'customer',
      name: 'Customer',
      category: 'portal',
      default_dashboard: 'customer',
      description: 'Standard self-service portal for VTU telecoms, NIN/BVN verification, printing, and wallet.',
      default_permissions: [],
      requires_superadmin: false,
    },
    {
      slug: 'student',
      name: 'Student',
      category: 'portal',
      default_dashboard: 'student',
      description: 'Digital Training Academy student portal with enrolled courses, QR ID card, and wallet services.',
      default_permissions: [],
      requires_superadmin: false,
    },
    {
      slug: 'agent',
      name: 'Agent / Reseller',
      category: 'portal',
      default_dashboard: 'agent',
      description: 'Partner reseller workspace with wholesale VTU/identity access, referrals, and sub-customer tools.',
      default_permissions: [],
      requires_superadmin: false,
    },
    {
      slug: 'support',
      name: 'Support Agent',
      category: 'console',
      default_dashboard: 'support',
      description: 'Internal Help Desk agent for ticket resolution, customer assistance, and notifications.',
      default_permissions: getDefaultPermissionsForRole('support'),
      requires_superadmin: true,
    },
    {
      slug: 'staff',
      name: 'Operations Staff',
      category: 'console',
      default_dashboard: 'staff',
      description: 'Internal staff workspace scoped to assigned operational modules (e.g. Printing, Support, KYC).',
      default_permissions: getDefaultPermissionsForRole('staff'),
      requires_superadmin: true,
    },
    {
      slug: 'manager',
      name: 'Operations Manager',
      category: 'console',
      default_dashboard: 'manager',
      description: 'Management console covering daily operations, reporting, printing, academy, and accounting oversight.',
      default_permissions: getDefaultPermissionsForRole('manager'),
      requires_superadmin: true,
    },
    {
      slug: 'admin',
      name: 'Administrator',
      category: 'console',
      default_dashboard: 'admin',
      description: 'Senior platform administrator across customers, services, CMS, KYC, and compliance.',
      default_permissions: getDefaultPermissionsForRole('admin'),
      requires_superadmin: true,
    },
    {
      slug: 'superadmin',
      name: 'Super Administrator',
      category: 'console',
      default_dashboard: 'admin',
      description: 'Unrestricted owner/supervisor authority including role governance, security policy, and dashboard config.',
      default_permissions: ['*'],
      requires_superadmin: true,
      is_protected: true,
    },
  ];
}

export function getDashboardsCatalog() {
  return [
    { key: 'customer', name: 'Customer Portal', category: 'portal', description: 'Self-service customer workspace for telecom, NIN/BVN, printing, and wallet.' },
    { key: 'student', name: 'Student Portal (Academy)', category: 'portal', description: 'Academy student workspace showcasing enrolled programs, QR Student ID Card, and wallet tools.' },
    { key: 'agent', name: 'Agent / Reseller Portal', category: 'portal', description: 'Partner reseller workspace with bulk telecom/identity tools and referral growth features.' },
    { key: 'support', name: 'Support Agent Console', category: 'console', description: 'Dedicated helpdesk console for resolving customer tickets and checking account summaries.' },
    { key: 'staff', name: 'Operations Staff Console', category: 'console', description: 'Permission-scoped operations console for assigned staff workflows.' },
    { key: 'manager', name: 'Operations Manager Console', category: 'console', description: 'Supervisory console with operational KPIs, reporting, printing, and reconciliation access.' },
    { key: 'admin', name: 'Admin & Super Admin Console', category: 'console', description: 'Full central administration and system governance console.' },
  ];
}

export function defaultPortalModules(dashboardKey: DashboardKey = 'customer') {
  const isStudent = dashboardKey === 'student';
  const isAgent = dashboardKey === 'agent';

  const items = [
    { id: 'dashboard', label: 'Dashboard', description: 'Workspace overview, balance, and quick actions', status: 'active' as const, visible: true, order: 1 },
    { id: 'academy', label: isStudent ? 'My Academy & ID Card' : 'Academy', description: 'Digital Training Academy courses, admissions & QR Student ID Card', status: 'active' as const, visible: true, order: isStudent ? 2 : 9 },
    { id: 'nin', label: 'NIN & BVN Services', description: 'NIMC & BVN identity verification, slips, modifications & enrolment', status: 'active' as const, visible: true, order: isStudent ? 3 : 2 },
    { id: 'telecom', label: 'Telecom & VTU', description: 'Data bundles, airtime cashback, utility bills, pins & bulk SMS', status: 'active' as const, visible: true, order: isStudent ? 4 : 3 },
    { id: 'digital', label: 'Digital Services', description: 'Cable TV bouquets & electricity prepaid tokens', status: 'active' as const, visible: true, order: 4 },
    { id: 'printing', label: 'Printing Services', description: 'Document printing, ID cards, banners, photos & delivery tracking', status: 'active' as const, visible: true, order: 5 },
    { id: 'wallet', label: 'Wallet & Funding', description: 'Paystack, Moniepoint VA, wallet ledger & funding requests', status: 'active' as const, visible: true, order: 6 },
    { id: 'referrals', label: isAgent ? 'Agent Commission & Referrals' : 'Referral Rewards', description: 'Invite users, earn points & convert rewards to wallet or cash', status: 'active' as const, visible: true, order: isAgent ? 3 : 7 },
    { id: 'store', label: 'Hardware Store', description: 'POS terminals, biometric scanners & digital hardware catalog', status: 'active' as const, visible: true, order: 8 },
    { id: 'reports', label: 'Reports & Statements', description: 'Downloadable wallet statements & spending breakdown', status: 'active' as const, visible: true, order: 10 },
    { id: 'transactions', label: 'Transactions', description: 'Full double-entry transaction ledger history', status: 'active' as const, visible: true, order: 11 },
    { id: 'orders', label: 'Orders', description: 'Telecom & digital service order fulfillment logs', status: 'active' as const, visible: true, order: 12 },
    { id: 'kyc', label: 'Identity & KYC', description: 'Upgrade KYC tier & view dedicated virtual account status', status: 'active' as const, visible: true, order: 13 },
    { id: 'notifications', label: 'Notifications', description: 'System alerts, transaction updates & announcements', status: 'active' as const, visible: true, order: 14 },
    { id: 'messages', label: 'Messages', description: 'Direct inbox messages & broadcast notices', status: 'active' as const, visible: true, order: 15 },
    { id: 'support', label: 'Support / Help', description: 'Open support tickets & track team responses', status: 'active' as const, visible: true, order: 16 },
    { id: 'profile', label: 'Profile', description: 'Personal identity details & referral code', status: 'active' as const, visible: true, order: 17 },
    { id: 'settings', label: 'Security & PIN', description: 'Transaction PIN, password & notification preferences', status: 'active' as const, visible: true, order: 18 },
  ];
  return items.sort((a, b) => a.order - b.order);
}

export function defaultConsoleModules(dashboardKey: DashboardKey) {
  const items = [
    { id: 'overview', label: 'Overview Hub', description: 'Executive KPIs, metrics & pending approvals', status: 'active' as const, visible: true, order: 1 },
    { id: 'customers', label: 'Customer Management', description: 'Registered users, roles, KYC & wallet balance directory', status: 'active' as const, visible: true, order: 2 },
    { id: 'support_admin', label: 'Support Desk', description: 'Customer support ticket triage & live resolution', status: 'active' as const, visible: true, order: 3 },
    { id: 'printing_admin', label: 'Printing Operations', description: 'Printing quotes, production status, delivery & pricing', status: 'active' as const, visible: true, order: 4 },
    { id: 'academy_admin', label: 'Academy Management', description: 'Courses, student admissions review & QR ID cards', status: 'active' as const, visible: true, order: 5 },
    { id: 'kyc_admin', label: 'KYC & Security Rules', description: 'Identity compliance review & tier limits', status: 'active' as const, visible: ['manager', 'admin', 'staff'].includes(dashboardKey), order: 6 },
    { id: 'accounting', label: 'Business Accounting', description: 'Website ledger, physical sales, expenses & reconciliations', status: 'active' as const, visible: ['manager', 'admin'].includes(dashboardKey), order: 7 },
    { id: 'services', label: 'Service Pricing & Telecom', description: 'NIN/BVN pricing, telecom plans & provider status', status: 'active' as const, visible: ['manager', 'admin'].includes(dashboardKey), order: 8 },
    { id: 'referrals_admin', label: 'Referrals & Withdrawals', description: 'Referral campaigns, rewards & cash payout approvals', status: 'active' as const, visible: ['manager', 'admin'].includes(dashboardKey), order: 9 },
    { id: 'notifications_admin', label: 'Broadcast & Notifications', description: 'Platform announcements & SMTP/SMS messaging', status: 'active' as const, visible: ['support', 'manager', 'admin'].includes(dashboardKey), order: 10 },
    { id: 'cms', label: 'Website CMS & Branding', description: 'Landing page content, FAQs & legal pages', status: 'active' as const, visible: dashboardKey === 'admin', order: 11 },
    { id: 'staff', label: 'Staff & Role Permissions', description: 'Internal roles & RBAC access matrix', status: 'active' as const, visible: dashboardKey === 'admin', order: 12 },
    { id: 'modules', label: 'Dashboard Management', description: 'Central role dashboard configurator & preview', status: 'active' as const, visible: dashboardKey === 'admin', order: 13 },
    { id: 'security_audit', label: 'Security & Audit Trail', description: 'Active sessions, MFA policies & audit footprint', status: 'active' as const, visible: dashboardKey === 'admin', order: 14 },
  ];
  return items.sort((a, b) => a.order - b.order);
}

export function getDefaultConfig(dashboardKey: string): any {
  const key = normalizeDashboardKey(dashboardKey, dashboardKey);
  const isPortal = ['customer', 'student', 'agent'].includes(key);

  if (isPortal) {
    const titles: Record<string, [string, string, string]> = {
      customer: ['Customer Portal', 'Welcome to HAMBAKTECH', 'Your real-time workspace for Nigerian telecom vending, identity lookups, printing, and wallet management.'],
      student: ['Student Portal', 'Academy Student Workspace', 'Track your Digital Training Academy admission, download your verified QR Student ID Card, and access wallet services.'],
      agent: ['Agent / Reseller Portal', 'Partner Reseller Workspace', 'High-volume identity verification, wholesale telecom vending, printing services, and referral commissions.'],
    };
    const [badge, title, subtitle] = titles[key];
    return {
      dashboard_key: key,
      category: 'portal',
      title,
      subtitle,
      badge_text: badge,
      default_tab: 'dashboard',
      announcement_banner: {
        enabled: key === 'student' || key === 'agent',
        title: key === 'student'
          ? 'Academy Student Portal Active'
          : key === 'agent'
            ? 'Authorized Partner Reseller Rates Active'
            : 'Platform Notice',
        message: key === 'student'
          ? 'Your verified Academy enrollments, course schedules, and QR Student ID Card are available directly from your Student Workspace.'
          : key === 'agent'
            ? 'Process bulk NIN/BVN lookups, telecom top-ups, and grow referral commissions with priority processing.'
            : 'Enjoy instant automated wallet funding, VTU cashback, and NIMC/BVN verification services.',
        tone: key === 'student' ? 'info' : 'emerald',
      },
      sections: {
        wallet_balance_card: true,
        transaction_kpis: true,
        quick_actions_grid: true,
        recent_activities: true,
        notice_board: true,
        virtual_account_card: true,
        kyc_upgrade_banner: true,
        student_academy_hero: key === 'student',
        agent_reseller_panel: key === 'agent',
      },
      features: {
        enable_wallet_funding: true,
        enable_nin_bvn: true,
        enable_telecom: true,
        enable_printing: true,
        enable_academy_enrollment: true,
        enable_student_id_card: true,
        enable_referrals: true,
        enable_support_tickets: true,
      },
      modules: defaultPortalModules(key),
      required_permissions: [],
    };
  }

  const consoleMeta: Record<string, [string, string, string, string]> = {
    support: ['Support Agent Console', 'Customer Support Desk', 'Review customer tickets, assist with order inquiries, and inspect account verification status.', 'support_admin'],
    staff: ['Operations Staff Console', 'Staff Operations Workspace', 'Execute assigned daily operational tasks across printing, academy, or customer support queues.', 'overview'],
    manager: ['Operations Manager Console', 'Operations Management Hub', 'Oversee daily fulfillment, financial reconciliation, printing production, and team KPIs.', 'overview'],
    admin: ['Administrator Console', 'Enterprise Control Center', 'Centralized management across customers, identity services, telecom, academy, and compliance.', 'overview'],
  };
  const [badge, title, subtitle, defaultTab] = consoleMeta[key] || consoleMeta.admin;

  return {
    dashboard_key: key,
    category: 'console',
    title,
    subtitle,
    badge_text: badge,
    default_tab: defaultTab,
    announcement_banner: {
      enabled: false,
      title: 'Operations Briefing',
      message: 'All actions performed inside internal consoles are recorded in the immutable security audit ledger.',
      tone: 'info',
    },
    sections: {
      kpi_financial_cards: ['manager', 'admin'].includes(key),
      kpi_customer_cards: true,
      quick_preview_launcher: key === 'admin',
      recent_registrations: ['support', 'manager', 'admin'].includes(key),
      pending_funding_queue: ['manager', 'admin'].includes(key),
      printing_ops_summary: ['staff', 'manager', 'admin'].includes(key),
    },
    features: {
      show_revenue_metrics: ['manager', 'admin'].includes(key),
      allow_customer_lookup: ['support', 'manager', 'admin'].includes(key),
      allow_ticket_resolution: true,
      allow_kyc_review: ['manager', 'admin'].includes(key),
      allow_printing_ops: ['staff', 'manager', 'admin'].includes(key),
      allow_academy_review: ['manager', 'admin'].includes(key),
    },
    modules: defaultConsoleModules(key),
    required_permissions: getDefaultPermissionsForRole(key),
  };
}

export function sanitizeConfigPayload(dashboardKey: string, raw: any): any {
  const base = getDefaultConfig(dashboardKey);
  if (!raw || typeof raw !== 'object') return base;
  const merged: any = {
    ...base,
    sections: { ...base.sections },
    features: { ...base.features },
    announcement_banner: { ...base.announcement_banner },
  };

  if (typeof raw.title === 'string' && raw.title.trim()) {
    merged.title = raw.title.trim().slice(0, 120);
  }
  if (typeof raw.subtitle === 'string') {
    merged.subtitle = raw.subtitle.trim().slice(0, 300);
  }
  if (typeof raw.badge_text === 'string' && raw.badge_text.trim()) {
    merged.badge_text = raw.badge_text.trim().slice(0, 60);
  }
  if (typeof raw.default_tab === 'string' && raw.default_tab.trim()) {
    merged.default_tab = raw.default_tab.trim().replace(/[^a-z0-9_-]/gi, '') || base.default_tab;
  }

  if (raw.announcement_banner && typeof raw.announcement_banner === 'object') {
    const ab = raw.announcement_banner;
    const tone = ['info', 'emerald', 'amber'].includes(ab.tone) ? ab.tone : base.announcement_banner.tone;
    merged.announcement_banner = {
      enabled: Boolean(ab.enabled ?? base.announcement_banner.enabled),
      title: String(ab.title ?? base.announcement_banner.title).trim().slice(0, 120),
      message: String(ab.message ?? base.announcement_banner.message).trim().slice(0, 500),
      tone,
    };
  }

  if (raw.sections && typeof raw.sections === 'object') {
    for (const sKey of Object.keys(base.sections)) {
      if (sKey in raw.sections) {
        merged.sections[sKey] = Boolean(raw.sections[sKey]);
      }
    }
  }

  if (raw.features && typeof raw.features === 'object') {
    for (const fKey of Object.keys(base.features)) {
      if (fKey in raw.features) {
        merged.features[fKey] = Boolean(raw.features[fKey]);
      }
    }
  }

  if (Array.isArray(raw.modules)) {
    const baseMap = new Map<string, any>(base.modules.map((m: any) => [m.id, m]));
    const cleanMods: any[] = [];
    const seen = new Set<string>();
    raw.modules.forEach((rm: any, idx: number) => {
      if (!rm || typeof rm !== 'object') return;
      const id = String(rm.id || '').trim();
      const bm = baseMap.get(id);
      if (!id || !bm || seen.has(id)) return;
      seen.add(id);
      const st = ['active', 'coming_soon', 'disabled'].includes(rm.status) ? rm.status : bm.status;
      const item: any = {
        id,
        label: String(rm.label ?? bm.label).trim().slice(0, 80) || bm.label,
        description: String(rm.description ?? bm.description).trim().slice(0, 220),
        status: st,
        visible: 'visible' in rm ? Boolean(rm.visible) : Boolean(bm.visible),
        order: typeof rm.order === 'number' ? Math.max(1, rm.order) : idx + 1,
      };
      if (rm.coming_soon_message) {
        item.coming_soon_message = String(rm.coming_soon_message).trim().slice(0, 300);
      }
      cleanMods.push(item);
    });
    for (const bm of base.modules) {
      if (!seen.has(bm.id)) cleanMods.push(bm);
    }
    cleanMods.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    merged.modules = cleanMods;
  }

  return merged;
}

function ensureStore(): Record<string, any> {
  if (!db.data.role_dashboard_configs || typeof db.data.role_dashboard_configs !== 'object') {
    db.data.role_dashboard_configs = {};
  }
  const store = db.data.role_dashboard_configs;
  let dirty = false;
  for (const key of DASHBOARD_KEYS) {
    if (!store[key]) {
      const def = getDefaultConfig(key);
      if (key === 'customer' && Array.isArray(db.data.dashboard_modules)) {
        const legacyMap = new Map(db.data.dashboard_modules.map((m: any) => [m.id, m]));
        def.modules = def.modules.map((m: any) => {
          const lm: any = legacyMap.get(m.id);
          return lm ? { ...m, status: lm.status || m.status, visible: lm.visible ?? m.visible, coming_soon_message: lm.coming_soon_message ?? m.coming_soon_message } : m;
        });
      }
      store[key] = {
        dashboard_key: key,
        category: def.category,
        draft_config: def,
        published_config: def,
        has_unpublished_changes: false,
        updated_by: 'system',
        updated_at: new Date().toISOString(),
        published_by: 'system',
        published_at: new Date().toISOString(),
      };
      dirty = true;
    }
  }
  if (dirty) db.saveDatabase();
  return store;
}

export function getDashboardConfig(dashboardKey: string, mode: 'published' | 'draft' = 'published') {
  const key = normalizeDashboardKey(dashboardKey, dashboardKey);
  const store = ensureStore();
  const rec = store[key];
  const raw = mode === 'draft' ? rec?.draft_config : rec?.published_config;
  const sanitized = sanitizeConfigPayload(key, raw);
  if (key === 'customer' && mode === 'published' && Array.isArray(db.data.dashboard_modules)) {
    const legacyMap = new Map(db.data.dashboard_modules.map((m: any) => [m.id, m]));
    sanitized.modules = sanitized.modules.map((m: any) => {
      const lm: any = legacyMap.get(m.id);
      return lm ? { ...m, status: lm.status || m.status, visible: lm.visible ?? m.visible, coming_soon_message: lm.coming_soon_message ?? m.coming_soon_message } : m;
    });
  }
  return sanitized;
}

export function getDashboardRecord(dashboardKey: string) {
  const key = normalizeDashboardKey(dashboardKey, dashboardKey);
  const store = ensureStore();
  const meta = getDashboardsCatalog().find((m) => m.key === key) || {
    key,
    name: `${key} Dashboard`,
    category: 'portal',
    description: '',
  };
  const r = store[key];
  return {
    dashboard_key: key,
    name: meta.name,
    category: meta.category,
    description: meta.description,
    draft_config: sanitizeConfigPayload(key, r?.draft_config),
    published_config: sanitizeConfigPayload(key, r?.published_config),
    has_unpublished_changes: Boolean(r?.has_unpublished_changes),
    updated_by: r?.updated_by || null,
    updated_at: r?.updated_at || null,
    published_by: r?.published_by || null,
    published_at: r?.published_at || null,
  };
}

export function listAllDashboardConfigs() {
  ensureStore();
  return getDashboardsCatalog().map((m) => getDashboardRecord(m.key));
}

export function saveDashboardDraft(dashboardKey: string, payload: any, actorEmail: string) {
  const key = normalizeDashboardKey(dashboardKey, dashboardKey);
  const store = ensureStore();
  const clean = sanitizeConfigPayload(key, payload);
  const prev = store[key];
  store[key] = {
    dashboard_key: key,
    category: clean.category,
    draft_config: clean,
    published_config: prev?.published_config || clean,
    has_unpublished_changes: true,
    updated_by: actorEmail,
    updated_at: new Date().toISOString(),
    published_by: prev?.published_by || actorEmail,
    published_at: prev?.published_at || new Date().toISOString(),
  };
  db.saveDatabase();
  return getDashboardRecord(key);
}

export function publishDashboardConfig(dashboardKey: string, actorEmail: string, optionalDraftPayload?: any) {
  const key = normalizeDashboardKey(dashboardKey, dashboardKey);
  const store = ensureStore();
  if (optionalDraftPayload && typeof optionalDraftPayload === 'object') {
    saveDashboardDraft(key, optionalDraftPayload, actorEmail);
  }
  const clean = sanitizeConfigPayload(key, store[key]?.draft_config);
  const now = new Date().toISOString();
  store[key] = {
    dashboard_key: key,
    category: clean.category,
    draft_config: clean,
    published_config: clean,
    has_unpublished_changes: false,
    updated_by: actorEmail,
    updated_at: now,
    published_by: actorEmail,
    published_at: now,
  };

  if (key === 'customer' && Array.isArray(db.data.dashboard_modules) && Array.isArray(clean.modules)) {
    for (const m of clean.modules) {
      const legacy = db.data.dashboard_modules.find((lm: any) => lm.id === m.id);
      if (legacy) {
        legacy.name = m.label;
        legacy.description = m.description;
        legacy.status = m.status;
        legacy.visible = Boolean(m.visible);
        if (m.coming_soon_message) legacy.coming_soon_message = m.coming_soon_message;
        legacy.order = m.order;
      }
    }
  }

  db.saveDatabase();
  return getDashboardRecord(key);
}
