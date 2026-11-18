/**
 * @file roles.ts
 * Canonical 8-role metadata, dashboard routing helpers, and badge styles
 * shared across authentication routing, Admin Customer Management,
 * Staff RBAC, Dashboard Configurator, and Preview Hub.
 */

import {
  DashboardCatalogItem,
  DashboardKey,
  RoleCatalogItem,
  User,
  UserRole,
} from '../types';

export const PORTAL_ROLES: readonly UserRole[] = ['customer', 'student', 'agent'];
export const CONSOLE_ROLES: readonly UserRole[] = ['support', 'staff', 'manager', 'admin', 'superadmin'];
export const ALL_ROLES: readonly UserRole[] = [
  'customer',
  'student',
  'agent',
  'support',
  'staff',
  'manager',
  'admin',
  'superadmin',
];

export const DASHBOARD_KEYS: readonly DashboardKey[] = [
  'customer',
  'student',
  'agent',
  'support',
  'staff',
  'manager',
  'admin',
];

export function normalizeRole(role?: string | null): UserRole {
  const clean = String(role || '').trim().toLowerCase();
  return (ALL_ROLES as readonly string[]).includes(clean)
    ? (clean as UserRole)
    : 'customer';
}

export function isConsoleRole(role?: string | null): boolean {
  const norm = normalizeRole(role);
  return (CONSOLE_ROLES as readonly string[]).includes(norm);
}

export function isPortalRole(role?: string | null): boolean {
  return !isConsoleRole(role);
}

export function normalizeDashboardKey(
  dashboard?: string | null,
  fallbackRole?: string | null
): DashboardKey {
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
  const roleNorm = normalizeRole(fallbackRole);
  return aliases[roleNorm] || 'customer';
}

export function isConsoleDashboard(dashboardKey?: string | null): boolean {
  const key = normalizeDashboardKey(dashboardKey);
  return key === 'support' || key === 'staff' || key === 'manager' || key === 'admin';
}

export function resolveEffectiveDashboard(user?: Pick<User, 'role' | 'assigned_dashboard'> | null): DashboardKey {
  if (!user) return 'customer';
  return normalizeDashboardKey(user.assigned_dashboard, user.role);
}

export function shouldRouteToConsole(user?: Pick<User, 'role' | 'assigned_dashboard'> | null): boolean {
  if (!user) return false;
  const effectiveDash = resolveEffectiveDashboard(user);
  return isConsoleDashboard(effectiveDash);
}

export function getRoleLabel(role?: string | null): string {
  switch (normalizeRole(role)) {
    case 'customer':
      return 'Customer';
    case 'student':
      return 'Student';
    case 'agent':
      return 'Agent / Reseller';
    case 'support':
      return 'Support Agent';
    case 'staff':
      return 'Operations Staff';
    case 'manager':
      return 'Operations Manager';
    case 'admin':
      return 'Administrator';
    case 'superadmin':
      return 'Super Administrator';
  }
}

export function getDashboardLabel(dashboardKey?: string | null): string {
  switch (normalizeDashboardKey(dashboardKey)) {
    case 'customer':
      return 'Customer Portal';
    case 'student':
      return 'Student Portal (Academy)';
    case 'agent':
      return 'Agent / Reseller Portal';
    case 'support':
      return 'Support Agent Console';
    case 'staff':
      return 'Operations Staff Console';
    case 'manager':
      return 'Operations Manager Console';
    case 'admin':
      return 'Admin & Super Admin Console';
  }
}

export function getRoleBadgeClasses(role?: string | null): string {
  switch (normalizeRole(role)) {
    case 'superadmin':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'admin':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'manager':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'staff':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    case 'support':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'agent':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'student':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'customer':
    default:
      return 'bg-slate-700/60 text-slate-300 border-slate-600/60';
  }
}

export const ROLE_CATALOG_FALLBACK: RoleCatalogItem[] = [
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
    default_permissions: ['support', 'customers', 'notifications'],
    requires_superadmin: true,
  },
  {
    slug: 'staff',
    name: 'Operations Staff',
    category: 'console',
    default_dashboard: 'staff',
    description: 'Internal staff workspace scoped to assigned operational modules (Printing, Support, KYC).',
    default_permissions: ['printing', 'support'],
    requires_superadmin: true,
  },
  {
    slug: 'manager',
    name: 'Operations Manager',
    category: 'console',
    default_dashboard: 'manager',
    description: 'Management console covering daily operations, reporting, printing, academy, and accounting.',
    default_permissions: [
      'customers', 'wallet', 'kyc', 'services', 'printing', 'printing_pricing',
      'support', 'reports', 'referrals', 'withdrawals', 'academy',
      'accounting', 'accounting_physical', 'accounting_reconcile', 'notifications',
    ],
    requires_superadmin: true,
  },
  {
    slug: 'admin',
    name: 'Administrator',
    category: 'console',
    default_dashboard: 'admin',
    description: 'Senior platform administrator across customers, services, CMS, KYC, and compliance.',
    default_permissions: [
      'customers', 'wallet', 'kyc', 'services', 'printing', 'printing_pricing',
      'cms', 'audit', 'support', 'reports', 'referrals', 'withdrawals',
      'academy', 'notifications', 'accounting', 'accounting_physical', 'accounting_reconcile',
    ],
    requires_superadmin: true,
  },
  {
    slug: 'superadmin',
    name: 'Super Administrator',
    category: 'console',
    default_dashboard: 'admin',
    description: 'Unrestricted highest system authority including user/role governance, security policy, and dashboard config.',
    default_permissions: ['*'],
    requires_superadmin: true,
  },
];

export const DASHBOARD_CATALOG_FALLBACK: DashboardCatalogItem[] = [
  { key: 'customer', name: 'Customer Portal', category: 'portal', description: 'Self-service customer workspace for telecom, NIN/BVN, printing, and wallet.' },
  { key: 'student', name: 'Student Portal (Academy)', category: 'portal', description: 'Academy student workspace showcasing enrolled programs, QR Student ID Card, and wallet tools.' },
  { key: 'agent', name: 'Agent / Reseller Portal', category: 'portal', description: 'Partner reseller workspace with bulk telecom/identity tools and referral growth features.' },
  { key: 'support', name: 'Support Agent Console', category: 'console', description: 'Dedicated helpdesk console for resolving customer tickets and checking account summaries.' },
  { key: 'staff', name: 'Operations Staff Console', category: 'console', description: 'Permission-scoped operations console for assigned staff workflows.' },
  { key: 'manager', name: 'Operations Manager Console', category: 'console', description: 'Operations management console with KPIs, reporting, printing, and reconciliation access.' },
  { key: 'admin', name: 'Admin & Super Admin Console', category: 'console', description: 'Full central administration and system governance console.' },
];
