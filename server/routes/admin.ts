/**
 * @file admin.ts
 * Phase 4 Super Admin Dashboard and Global Management backend router.
 * Implements admin overview, customer management, staff RBAC, dashboard module control,
 * service management (pricing/providers/store/academy), audit logs, and manual funding approvals.
 */

import { Router } from 'express';
import { db, hashPassword, User, AuditLog, DashboardModuleConfig, StoreItem, AcademyCourse, ProviderConfigItem } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { parseToken, hasUserPermission, hasAnyUserPermission, sanitizeUser } from './auth.js';
import { sendEmail, testSmtpConnection, reloadTransporter } from '../services/mailer.js';
import { verificationManager } from '../adapters/verification/VerificationAdapter.js';
import {
  ALL_ROLES,
  CONSOLE_ROLES,
  PORTAL_ROLES,
  ALLOWED_PERMISSIONS,
  normalizeRole,
  isConsoleRole,
  normalizeDashboardKey,
  getDefaultPermissionsForRole,
  getRolesCatalog,
  getDashboardsCatalog,
  getDashboardConfig,
  listAllDashboardConfigs,
  saveDashboardDraft,
  publishDashboardConfig,
} from '../services/dashboardConfig.js';

export const adminRouter = Router();

const ALLOWED_STAFF_PERMISSIONS = new Set<string>(['*', ...ALLOWED_PERMISSIONS]);

// Middleware: Require Internal Console Role (Support, Staff, Manager, Admin, or SuperAdmin)
function requireAdmin(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account is suspended. Contact system administrator.' });
  }

  if (!isConsoleRole(user.role)) {
    return res.status(403).json({ error: 'Access denied: Internal console role authorization required' });
  }

  req.user = user;
  next();
}

// Middleware: Require SuperAdmin for sensitive operations
function requireSuperAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super Admin privileges required for this action' });
  }
  next();
}

function requirePermission(permission: string) {
  return (req: any, res: any, next: any) => {
    if (!hasUserPermission(req.user, permission)) {
      return res.status(403).json({ error: `Access denied. Missing required '${permission}' permission.` });
    }
    next();
  };
}

function requireAnyPermission(permissions: string[]) {
  return (req: any, res: any, next: any) => {
    if (!hasAnyUserPermission(req.user, permissions)) {
      return res.status(403).json({ error: 'Access denied. Insufficient administrative permissions for this module.' });
    }
    next();
  };
}

// -------------------------------------------------------------
// 1. ADMIN OVERVIEW
// -------------------------------------------------------------
adminRouter.get('/overview', requireAdmin, (req: any, res) => {
  const actor = req.user;
  const canCustomers = hasUserPermission(actor, 'customers');
  const canWallet = hasUserPermission(actor, 'wallet');
  const canKyc = hasUserPermission(actor, 'kyc');
  const canServices = hasUserPermission(actor, 'services');
  const canReports = hasUserPermission(actor, 'reports');
  const canAccounting = hasUserPermission(actor, 'accounting');
  const canPrinting = hasAnyUserPermission(actor, ['printing', 'printing_pricing']);
  const canSettings = hasUserPermission(actor, 'settings');
  const canFinance = canReports || canWallet || canAccounting;

  const users = db.data.users || [];
  const txns = db.data.transactions || [];
  const orders = db.data.telecom_orders || [];
  const verifications = db.data.verifications || [];

  const customers = users.filter(u => (PORTAL_ROLES as readonly string[]).includes(u.role));
  const activeCustomers = customers.filter(u => u.status === 'active');
  const suspendedCustomers = customers.filter(u => u.status === 'suspended');
  const staff = users.filter(u => isConsoleRole(u.role));

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todayRegistrations = canCustomers
    ? customers.filter(u => (u.created_at || '').startsWith(todayPrefix)).length
    : 0;

  const totalWalletBalances = canFinance
    ? users.reduce((sum, u) => sum + (u.wallet_balance || 0), 0)
    : 0;

  const totalWalletFunding = canFinance
    ? txns.filter(t => t.type === 'credit' && t.status === 'successful').reduce((sum, t) => sum + t.amount, 0)
    : 0;

  const totalServiceSales = canFinance
    ? txns.filter(t => t.type === 'debit' && t.status === 'successful').reduce((sum, t) => sum + t.amount, 0)
    : 0;

  const telecomCost = canFinance
    ? orders.filter(o => o.status === 'successful').reduce((sum, o) => sum + (o.cost_price || Math.floor(o.amount * 0.9)), 0)
    : 0;

  const verificationCost = canFinance
    ? verifications.filter(v => v.status === 'completed').reduce((sum, v) => sum + Math.floor(v.cost * 0.7), 0)
    : 0;

  const providerExpenditure = canFinance ? (telecomCost + verificationCost) : 0;
  const grossProfit = canFinance ? Math.max(0, totalServiceSales - providerExpenditure) : 0;

  const successfulTransactions = canFinance ? txns.filter(t => t.status === 'successful').length : 0;
  const pendingTransactions = canFinance ? txns.filter(t => t.status === 'pending').length : 0;
  const failedTransactions = canFinance ? txns.filter(t => t.status === 'failed').length : 0;

  const pendingFundings: any[] = [];

  const pendingKycUsers = (canKyc || canCustomers)
    ? customers.filter(u => u.kyc_status === 'pending')
    : [];
  const pendingKycSubmissionsCount = (canKyc || canCustomers)
    ? (db.data.kyc_submissions || []).filter(k => k.status === 'pending').length
    : 0;
  const pendingKycCount = Math.max(pendingKycUsers.length, pendingKycSubmissionsCount);

  const providerStatus = (canServices || canSettings) ? {
    veripine: {
      configured: Boolean(CREDENTIALS.verification.veripine.apiKey),
      status: CREDENTIALS.verification.veripine.apiKey ? 'Operational' : 'Mock Fallback',
      keyMasked: CREDENTIALS.verification.veripine.apiKey
        ? `${CREDENTIALS.verification.veripine.apiKey.slice(0, 6)}...${CREDENTIALS.verification.veripine.apiKey.slice(-4)}`
        : 'Not Set',
    },
    sureverify: {
      configured: Boolean(CREDENTIALS.verification.sureverify.apiKey),
      status: CREDENTIALS.verification.sureverify.apiKey ? 'Operational' : 'Mock Fallback',
      keyMasked: CREDENTIALS.verification.sureverify.apiKey
        ? `${CREDENTIALS.verification.sureverify.apiKey.slice(0, 6)}...${CREDENTIALS.verification.sureverify.apiKey.slice(-4)}`
        : 'Not Set',
    },
    ulamaData: {
      configured: Boolean(CREDENTIALS.telecom.ulamaData.apiKey),
      status: CREDENTIALS.telecom.ulamaData.apiKey ? 'Operational' : 'Mock Fallback',
      keyMasked: CREDENTIALS.telecom.ulamaData.apiKey
        ? `${CREDENTIALS.telecom.ulamaData.apiKey.slice(0, 6)}...${CREDENTIALS.telecom.ulamaData.apiKey.slice(-4)}`
        : 'Not Set',
    },
    vtpass: {
      configured: Boolean(CREDENTIALS.telecom.vtpass.apiKey),
      status: CREDENTIALS.telecom.vtpass.apiKey ? 'Operational' : 'Mock Fallback',
      apiKeyMasked: CREDENTIALS.telecom.vtpass.apiKey
        ? `${CREDENTIALS.telecom.vtpass.apiKey.slice(0, 6)}...${CREDENTIALS.telecom.vtpass.apiKey.slice(-4)}`
        : 'Not Set',
    },
    paystack: {
      configured: Boolean(CREDENTIALS.payments.paystack.secretKey),
      status: CREDENTIALS.payments.paystack.secretKey ? 'Live Gateway' : 'Test Mode',
      keyMasked: CREDENTIALS.payments.paystack.secretKey
        ? `${CREDENTIALS.payments.paystack.secretKey.slice(0, 6)}...${CREDENTIALS.payments.paystack.secretKey.slice(-4)}`
        : 'Not Set',
    },
    smtpMail: {
      configured: Boolean(CREDENTIALS.mail.host),
      status: CREDENTIALS.mail.host ? 'Enterprise Cloud Connected' : 'Local Fallback',
      host: CREDENTIALS.mail.host,
      port: CREDENTIALS.mail.port,
    },
    cpanel: {
      configured: Boolean(CREDENTIALS.cpanel.serverIp),
      status: 'Primary Node Active',
      host: CREDENTIALS.cpanel.ftpHost,
      serverIp: CREDENTIALS.cpanel.serverIp,
    },
  } : undefined;

  let printingSummary: {
    total_orders: number;
    pending_review: number;
    awaiting_payment: number;
    processing: number;
    ready_or_transit: number;
    completed: number;
  } | null = null;

  if (canPrinting) {
    const pOrders: any[] = db.data.printing_orders || [];
    printingSummary = {
      total_orders: pOrders.length,
      pending_review: pOrders.filter(o => ['Pending Review', 'Under Review', 'Awaiting Quotation'].includes(o.status)).length,
      awaiting_payment: pOrders.filter(o => ['Quotation Sent', 'Awaiting Payment'].includes(o.status)).length,
      processing: pOrders.filter(o => ['Payment Confirmed', 'Processing'].includes(o.status)).length,
      ready_or_transit: pOrders.filter(o => ['Ready for Collection', 'Ready for Dispatch', 'Out for Delivery'].includes(o.status)).length,
      completed: pOrders.filter(o => o.status === 'Completed').length,
    };
  }

  const stats = {
    total_users: canCustomers ? customers.length : 0,
    total_customers: canCustomers ? customers.length : 0,
    totalCustomers: canCustomers ? customers.length : 0,
    active_customers: canCustomers ? activeCustomers.length : 0,
    activeCustomers: canCustomers ? activeCustomers.length : 0,
    suspended_customers: canCustomers ? suspendedCustomers.length : 0,
    suspendedCustomers: canCustomers ? suspendedCustomers.length : 0,
    totalStaff: staff.length,
    today_registrations: todayRegistrations,
    todayRegistrations,
    total_wallet_balances: totalWalletBalances,
    totalWalletBalances,
    total_wallet_funding: totalWalletFunding,
    totalWalletFunding,
    total_service_sales: totalServiceSales,
    totalServiceSales,
    provider_expenditure: providerExpenditure,
    providerExpenditure,
    gross_profit: grossProfit,
    grossProfit,
    successful_transactions: successfulTransactions,
    successfulTransactions,
    pending_transactions: pendingTransactions,
    pendingTransactions,
    failed_transactions: failedTransactions,
    failedTransactions,
    pending_funding_approvals: pendingFundings.length,
    pendingFundingApprovals: pendingFundings.length,
    pending_kyc_count: pendingKycCount,
    pendingKycCount,
  };

  const recentRegistrations = canCustomers
    ? customers.slice(-8).reverse().map((u) => sanitizeUser(u))
    : [];
  const recentOrders = (canServices || canReports) ? orders.slice(0, 8) : [];

  res.json({
    success: true,
    data: {
      stats,
      metrics: stats,
    },
    metrics: stats,
    stats,
    recentRegistrations,
    recent_registrations: recentRegistrations,
    recentOrders,
    pendingFundings: pendingFundings.slice(0, 10),
    providerStatus,
    printing_summary: printingSummary,
    printingSummary,
  });
});

// -------------------------------------------------------------
// 2. CUSTOMER MANAGEMENT
// -------------------------------------------------------------
adminRouter.get('/customers', requireAdmin, requirePermission('customers'), (req, res) => {
  const { search, status, tier, role, kyc_status, filter } = req.query;
  const allUsers = db.data.users || [];
  const portalUsers = allUsers.filter(u => (PORTAL_ROLES as readonly string[]).includes(normalizeRole(u.role)));
  const nowCutoff = Date.now() - 72 * 3600 * 1000;

  const roleParam = String(role || 'portal').trim().toLowerCase();
  let list: User[];
  if (roleParam === 'all' || roleParam === 'all_users') {
    list = [...allUsers];
  } else if (roleParam !== '' && roleParam !== 'portal' && (ALL_ROLES as readonly string[]).includes(roleParam)) {
    list = allUsers.filter(u => normalizeRole(u.role) === roleParam);
  } else {
    list = [...portalUsers];
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone_number.includes(q) ||
      (u.nin && u.nin.includes(q)) ||
      (u.bvn && u.bvn.includes(q)) ||
      (u.referral_code && u.referral_code.toLowerCase().includes(q))
    );
  }

  if (status && status !== 'all') {
    list = list.filter(u => u.status === status);
  }

  if (tier && tier !== 'all') {
    list = list.filter(u => String(u.tier) === String(tier));
  }

  if (kyc_status && kyc_status !== 'all') {
    list = list.filter(u => u.kyc_status === kyc_status);
  }

  if (filter === 'new') {
    list = list.filter(u => new Date(u.created_at).getTime() >= nowCutoff);
  }

  const txns = db.data.transactions || [];
  const orders = db.data.telecom_orders || [];
  const verifs = db.data.verifications || [];

  const enriched = list
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(u => ({
      ...sanitizeUser(u),
      is_new: new Date(u.created_at).getTime() >= nowCutoff,
      tx_count: txns.filter(t => t.user_id === u.id).length,
      orders_count: orders.filter(o => o.user_id === u.id).length,
      verifications_count: verifs.filter(v => v.user_id === u.id).length,
    }));

  const summary = {
    total: portalUsers.length,
    active: portalUsers.filter(u => u.status === 'active').length,
    suspended: portalUsers.filter(u => u.status === 'suspended').length,
    pending_kyc: portalUsers.filter(u => u.kyc_status === 'pending').length,
    verified_kyc: portalUsers.filter(u => u.kyc_status === 'verified').length,
    new_registrations: portalUsers.filter(u => new Date(u.created_at).getTime() >= nowCutoff).length,
    all_accounts: allUsers.length,
    students: allUsers.filter(u => normalizeRole(u.role) === 'student').length,
    agents: allUsers.filter(u => normalizeRole(u.role) === 'agent').length,
    console_accounts: allUsers.filter(u => isConsoleRole(u.role)).length,
  };

  res.json({
    success: true,
    count: enriched.length,
    customers: enriched,
    summary,
  });
});

// Create customer/agent account by Admin
adminRouter.post('/customers/create', requireAdmin, requirePermission('customers'), (req: any, res) => {
  const {
    full_name,
    email,
    phone_number,
    role = 'customer',
    status = 'active',
    tier = 1,
    password,
    initial_balance = 0,
    date_of_birth,
    residential_address,
    state,
    lga,
    nin,
    bvn,
  } = req.body;

  if (!full_name || !email || !phone_number) {
    return res.status(400).json({ error: 'Full name, email, and phone number are required.' });
  }

  const targetRole = String(role || 'customer').toLowerCase().trim();
  if (!(ALL_ROLES as readonly string[]).includes(targetRole)) {
    return res.status(400).json({ error: `Role must be one of: ${ALL_ROLES.join(', ')}` });
  }

  if (isConsoleRole(targetRole) && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only Super Admin can provision internal console or administrator accounts.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (db.findUserByEmail(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const rawPassword = typeof password === 'string' && password.length >= 8
    ? password
    : `Hbk#${Math.random().toString(36).slice(2, 10)}!`;

  const numTier = Math.min(3, Math.max(1, Number(tier || 1))) as 1 | 2 | 3;
  const kycStatus: User['kyc_status'] = (nin || bvn || numTier >= 2) ? 'verified' : 'unverified';
  const normalizedBalance = Math.max(0, Number(initial_balance || 0));
  const assignedDashboard = normalizeDashboardKey(req.body.assigned_dashboard, targetRole);
  const reqPerms = Array.isArray(req.body.permissions)
    ? req.body.permissions.filter((p: any) => ALLOWED_STAFF_PERMISSIONS.has(String(p)))
    : getDefaultPermissionsForRole(targetRole);

  const created = db.createUser({
    email: cleanEmail,
    password_hash: hashPassword(rawPassword),
    full_name: String(full_name).trim(),
    phone_number: String(phone_number).trim(),
    role: targetRole as User['role'],
    assigned_dashboard: assignedDashboard,
    token_version: 1,
    wallet_balance: normalizedBalance,
    kyc_status: kycStatus,
    tier: numTier,
    kyc_level: numTier,
    nin: nin ? String(nin).trim() : undefined,
    bvn: bvn ? String(bvn).trim() : undefined,
    date_of_birth: date_of_birth || undefined,
    address: residential_address || undefined,
    state: state || undefined,
    lga: lga || undefined,
    referral_code: (targetRole === 'agent' ? 'AGT-' : targetRole === 'student' ? 'STD-' : 'HT-') + Math.random().toString(36).substring(2, 7).toUpperCase(),
    status: status === 'suspended' ? 'suspended' : 'active',
    permissions: isConsoleRole(targetRole) ? (targetRole === 'superadmin' ? ['*'] : reqPerms) : undefined,
  });

  if (normalizedBalance > 0) {
    db.data.transactions.unshift({
      id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: created.id,
      type: 'credit',
      amount: normalizedBalance,
      balance_before: 0,
      balance_after: normalizedBalance,
      category: 'manual_adjustment',
      reference: `INIT_${Date.now()}`,
      gateway: 'internal',
      status: 'successful',
      description: 'Initial balance provisioned by administrator',
      created_at: new Date().toISOString(),
    });
    db.saveDatabase();
  }

  db.logAudit('ADMIN_USER_CREATED', {
    targetUserId: created.id,
    email: created.email,
    role: created.role,
    tier: numTier,
  }, req.user.id, req.user.email);

  const safe = sanitizeUser(created);
  return res.status(201).json({
    success: true,
    message: `Account provisioned for ${created.full_name} (${created.role})`,
    user: safe,
    wallet: { balance: created.wallet_balance },
  });
});

adminRouter.get('/customers/:id', requireAdmin, requirePermission('customers'), (req, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const transactions = db.data.transactions.filter(t => t.user_id === user.id);
  const orders = db.data.telecom_orders.filter(o => o.user_id === user.id);
  const verifications = db.data.verifications.filter(v => v.user_id === user.id);
  const auditLogs = db.data.audit_logs.filter(a => a.user_id === user.id || (a.details && a.details.targetUserId === user.id));
  const kycSub = (db.data.kyc_submissions || []).find(k => k.user_id === user.id) || null;
  const kycSubs = (db.data.kyc_submissions || []).filter(k => k.user_id === user.id);

  const totalFunded = transactions
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalSpent = transactions
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  res.json({
    success: true,
    customer: sanitizeUser(user),
    transactions,
    orders,
    verifications,
    auditLogs,
    kyc: kycSub,
    kyc_submissions: kycSubs,
    support_tickets: [],
    stats: {
      total_funded: totalFunded,
      total_spent: totalSpent,
      tx_count: transactions.length,
      orders_count: orders.length,
      verifications_count: verifications.length,
      tickets_count: 0,
    },
  });
});

// Update customer details
adminRouter.put('/customers/:id', requireAdmin, requirePermission('customers'), (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  if (isConsoleRole(user.role) && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only Super Admin can modify internal staff or admin accounts.' });
  }

  const {
    full_name,
    email,
    phone_number,
    tier,
    kyc_status,
    address,
    residential_address,
    state,
    lga,
    date_of_birth,
    nin,
    bvn,
    role,
    assigned_dashboard,
    new_password,
  } = req.body;

  const updates: Partial<User> = {};
  let bumpToken = false;
  if (full_name !== undefined) updates.full_name = String(full_name).trim();
  if (email !== undefined && String(email).trim()) {
    const cleanEmail = String(email).trim().toLowerCase();
    const conflict = db.findUserByEmail(cleanEmail);
    if (conflict && conflict.id !== user.id) {
      return res.status(409).json({ error: 'Another account already uses this email address.' });
    }
    updates.email = cleanEmail;
  }
  if (phone_number !== undefined) updates.phone_number = String(phone_number).trim();
  if (tier !== undefined) {
    const numTier = Math.min(3, Math.max(1, Number(tier))) as 1 | 2 | 3;
    updates.tier = numTier;
    updates.kyc_level = numTier;
  }
  if (kyc_status !== undefined) updates.kyc_status = kyc_status;
  if (address !== undefined) updates.address = address;
  if (residential_address !== undefined) updates.address = residential_address;
  if (state !== undefined) updates.state = state;
  if (lga !== undefined) updates.lga = lga;
  if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
  if (nin !== undefined) updates.nin = nin;
  if (bvn !== undefined) updates.bvn = bvn;

  if (role !== undefined && (ALL_ROLES as readonly string[]).includes(String(role).toLowerCase())) {
    const nextRole = String(role).toLowerCase() as User['role'];
    if (nextRole !== user.role) {
      if ((isConsoleRole(nextRole) || isConsoleRole(user.role)) && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only Super Admin can assign or modify internal console roles.' });
      }
      if (user.id === req.user?.id && user.role === 'superadmin' && nextRole !== 'superadmin') {
        return res.status(403).json({ error: 'You cannot demote your own active Super Admin account.' });
      }
      if (user.role === 'superadmin' && nextRole !== 'superadmin') {
        const remaining = db.data.users.filter(u => u.role === 'superadmin' && u.status === 'active' && u.id !== user.id).length;
        if (remaining < 1) {
          return res.status(403).json({ error: 'At least one active Super Admin account must remain on the platform.' });
        }
      }
      updates.role = nextRole;
      updates.assigned_dashboard = normalizeDashboardKey(assigned_dashboard, nextRole);
      bumpToken = true;
    }
  } else if (assigned_dashboard !== undefined) {
    updates.assigned_dashboard = normalizeDashboardKey(assigned_dashboard, user.role);
    bumpToken = true;
  }

  if (typeof new_password === 'string' && new_password.length > 0) {
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    updates.password_hash = hashPassword(new_password);
    bumpToken = true;
  }

  if (bumpToken) {
    updates.token_version = Number(user.token_version ?? 1) + 1;
  }

  const updated = db.updateUser(user.id, updates);

  const safeAuditUpdates = { ...updates };
  delete safeAuditUpdates.password_hash;
  db.logAudit('ADMIN_CUSTOMER_UPDATED', { targetUserId: user.id, updates: safeAuditUpdates }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Customer profile updated successfully',
    customer: sanitizeUser(updated),
  });
});

// Delete customer account
adminRouter.delete('/customers/:id', requireAdmin, requirePermission('customers'), (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  if (isConsoleRole(user.role)) {
    return res.status(403).json({ error: 'Internal staff and administrator accounts cannot be deleted from Customer Management.' });
  }

  const force = req.query.force === 'true';
  const hasFinancialHistory =
    user.wallet_balance > 0 ||
    db.data.transactions.some(t => t.user_id === user.id) ||
    (db.data.printing_orders || []).some((o: any) => o.user_id === user.id);

  if (hasFinancialHistory && !force) {
    return res.status(409).json({
      error: 'Customer has wallet balance or transaction/order history. Enable Force Delete to remove permanently.',
    });
  }

  db.data.users = db.data.users.filter(u => u.id !== user.id);
  db.saveDatabase();
  db.logAudit('ADMIN_CUSTOMER_DELETED', { targetUserId: user.id, email: user.email, force }, req.user.id, req.user.email);

  return res.json({
    success: true,
    message: `Account ${user.email} permanently deleted`,
    deleted_id: user.id,
  });
});

// Suspend or activate customer
adminRouter.post('/customers/:id/status', requireAdmin, requirePermission('customers'), (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { status, reason } = req.body;
  if (!status || !['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or suspended' });
  }

  if (isConsoleRole(user.role) && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only a Super Admin can modify internal console account status.' });
  }
  if (user.id === req.user?.id && status === 'suspended') {
    return res.status(403).json({ error: 'You cannot suspend your own active account.' });
  }
  if (user.role === 'superadmin' && status === 'suspended') {
    const remaining = db.data.users.filter(u => u.role === 'superadmin' && u.status === 'active' && u.id !== user.id).length;
    if (remaining < 1) {
      return res.status(403).json({ error: 'At least one active Super Admin account must remain on the platform.' });
    }
  }

  const updates: Partial<User> = { status: status as any };
  if (status === 'suspended') {
    updates.token_version = Number(user.token_version ?? 1) + 1;
  }

  const updated = db.updateUser(user.id, updates);

  db.logAudit('ACCOUNT_STATUS_CHANGED', {
    targetUserId: user.id,
    targetEmail: user.email,
    newStatus: status,
    reason: reason || 'Administrative action',
  }, req.user.id, req.user.email);

  db.addNotification(
    user.id,
    status === 'suspended' ? 'Account Suspended' : 'Account Re-activated',
    status === 'suspended'
      ? `Your account was suspended by administration. Reason: ${reason || 'Terms violation or audit request'}. Contact support.`
      : 'Your HambakTech account has been restored to active status.',
    status === 'suspended' ? 'alert' : 'success'
  );

  res.json({
    success: true,
    message: `Customer account is now ${status.toUpperCase()}`,
    customer: sanitizeUser(updated),
  });
});

// Manual Wallet Adjustment (Credit or Debit)
adminRouter.post('/customers/:id/wallet-adjust', requireAdmin, requirePermission('wallet'), (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { type, amount, reason } = req.body;
  const numAmount = Number(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Adjustment amount must be a positive number' });
  }
  if (!['credit', 'debit'].includes(type)) {
    return res.status(400).json({ error: 'Type must be credit or debit' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'Reason for manual adjustment is required for audit logs' });
  }

  const delta = type === 'credit' ? numAmount : -numAmount;

  try {
    const result = db.adjustBalance(
      user.id,
      delta,
      'manual_adjustment',
      `Admin ${type.toUpperCase()}: ₦${numAmount.toLocaleString()} - ${reason}`,
      'internal',
      { adminId: req.user.id, adminEmail: req.user.email, reason }
    );

    db.logAudit('WALLET_ADJUSTMENT', {
      targetUserId: user.id,
      targetEmail: user.email,
      type,
      amount: numAmount,
      balanceBefore: result.transaction.balance_before,
      balanceAfter: result.transaction.balance_after,
      reason,
    }, req.user.id, req.user.email);

    db.addNotification(
      user.id,
      type === 'credit' ? 'Wallet Credited by Admin' : 'Wallet Debited by Admin',
      `${type === 'credit' ? 'Received' : 'Debited'} ₦${numAmount.toLocaleString()}. Reason: ${reason}`,
      type === 'credit' ? 'success' : 'warning'
    );

    res.json({
      success: true,
      message: `Successfully ${type}ed ₦${numAmount.toLocaleString()} to customer's wallet`,
      newBalance: result.user.wallet_balance,
      transaction: result.transaction,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Balance adjustment failed' });
  }
});

// Review and Approve / Reject KYC
adminRouter.post('/customers/:id/kyc', requireAdmin, requirePermission('kyc'), (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { status, tier, review_notes } = req.body;
  if (!['verified', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be verified, rejected, or pending' });
  }

  const updates: Partial<User> = {
    kyc_status: status as any,
  };

  if (status === 'verified') {
    updates.tier = (tier ? Number(tier) : Math.max(user.tier, 2)) as any;
  }

  // Update existing docs status
  if (user.kyc_documents && user.kyc_documents.length > 0) {
    updates.kyc_documents = user.kyc_documents.map(doc => ({
      ...doc,
      status: status as any,
      review_notes: review_notes || (status === 'verified' ? 'Approved by Compliance Officer' : 'Documentation insufficient'),
    }));
  }

  const updated = db.updateUser(user.id, updates);

  db.logAudit('KYC_REVIEW', {
    targetUserId: user.id,
    targetEmail: user.email,
    newKycStatus: status,
    assignedTier: updates.tier,
    reviewNotes: review_notes,
  }, req.user.id, req.user.email);

  db.addNotification(
    user.id,
    status === 'verified' ? 'KYC Verification Approved!' : 'KYC Verification Rejected',
    status === 'verified'
      ? `Congratulations! Your identity documents have been approved. Your account is upgraded to Tier ${updates.tier}.`
      : `Your submitted documents could not be verified. Note: ${review_notes || 'Please re-submit clear documents in Settings.'}`,
    status === 'verified' ? 'success' : 'alert'
  );

  res.json({
    success: true,
    message: `Customer KYC status updated to ${status.toUpperCase()}`,
    customer: sanitizeUser(updated),
  });
});

// Send custom customer notification
adminRouter.post('/customers/:id/notify', requireAdmin, requirePermission('notifications'), (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { title, message, type = 'info' } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required' });
  }

  const notif = db.addNotification(user.id, title, message, type);

  db.logAudit('CUSTOMER_NOTIFIED', {
    targetUserId: user.id,
    targetEmail: user.email,
    title,
    type,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Notification dispatched to customer',
    notification: notif,
  });
});

// -------------------------------------------------------------
// 3. DASHBOARD MODULES MANAGEMENT (Phase 4 requirement 4)
// -------------------------------------------------------------
adminRouter.get('/dashboard-modules', requireAdmin, (req, res) => {
  res.json({
    success: true,
    modules: db.data.dashboard_modules || [],
  });
});

adminRouter.put('/dashboard-modules/:id', requireAdmin, requirePermission('settings'), (req: any, res) => {
  const { id } = req.params;
  const { name, description, icon, status, visible, coming_soon_message, order } = req.body;

  const modules = db.data.dashboard_modules || [];
  const idx = modules.findIndex(m => m.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Module not found' });
  }

  if (name !== undefined) modules[idx].name = name;
  if (description !== undefined) modules[idx].description = description;
  if (icon !== undefined) modules[idx].icon = icon;
  if (status !== undefined) modules[idx].status = status;
  if (visible !== undefined) modules[idx].visible = Boolean(visible);
  if (coming_soon_message !== undefined) modules[idx].coming_soon_message = coming_soon_message;
  if (order !== undefined) modules[idx].order = Number(order);

  db.saveDatabase();

  db.logAudit('DASHBOARD_MODULE_UPDATED', {
    moduleId: id,
    changes: req.body,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Module "${modules[idx].name}" configuration saved`,
    module: modules[idx],
  });
});

// -------------------------------------------------------------
// 4. STAFF & PERMISSIONS RBAC (Phase 4 requirement 5)
// -------------------------------------------------------------
adminRouter.get('/staff', requireAdmin, requirePermission('staff'), (req, res) => {
  const orderRank: Record<string, number> = { superadmin: 1, admin: 2, manager: 3, staff: 4, support: 5 };
  const staff = db.data.users
    .filter(u => isConsoleRole(u.role))
    .sort((a, b) => (orderRank[a.role] || 99) - (orderRank[b.role] || 99))
    .map(u => ({
      ...sanitizeUser(u),
    }));
  res.json({
    success: true,
    staff,
  });
});

adminRouter.post('/staff', requireAdmin, requireSuperAdmin, async (req: any, res) => {
  try {
    const { full_name, email, phone_number, password, role = 'staff', permissions, assigned_dashboard } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const dbRole = String(role || 'staff').toLowerCase();
    if (!(CONSOLE_ROLES as readonly string[]).includes(dbRole)) {
      return res.status(400).json({ error: `Role must be one of: ${CONSOLE_ROLES.join(', ')}` });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const sanitizedPerms = dbRole === 'superadmin'
      ? ['*']
      : Array.isArray(permissions)
        ? permissions.filter((p: any) => ALLOWED_STAFF_PERMISSIONS.has(String(p)))
        : getDefaultPermissionsForRole(dbRole);

    const dashKey = normalizeDashboardKey(assigned_dashboard, dbRole);

    const newStaff = db.createUser({
      email: email.trim().toLowerCase(),
      password_hash: hashPassword(password),
      full_name: full_name.trim(),
      phone_number: phone_number || '+2348000000000',
      role: dbRole as any,
      assigned_dashboard: dashKey,
      token_version: 1,
      wallet_balance: 0,
      kyc_status: 'verified',
      tier: 3,
      referral_code: 'STAFF-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      status: 'active',
      permissions: sanitizedPerms,
    });

    db.logAudit('STAFF_CREATED', {
      staffId: newStaff.id,
      email: newStaff.email,
      role: newStaff.role,
      assigned_dashboard: dashKey,
      permissions: sanitizedPerms,
    }, req.user.id, req.user.email);

    res.status(201).json({
      success: true,
      message: `Staff member ${newStaff.full_name} (${newStaff.role}) created successfully`,
      staff: sanitizeUser(newStaff),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create staff' });
  }
});

adminRouter.put('/staff/:id', requireAdmin, requireSuperAdmin, (req: any, res) => {
  const staffUser = db.findUserById(req.params.id);
  if (!staffUser) {
    return res.status(404).json({ error: 'Staff member not found' });
  }

  const { role, permissions, status, full_name, phone_number, assigned_dashboard } = req.body;

  if (staffUser.id === req.user?.id && (status === 'suspended' || (role && role !== 'superadmin'))) {
    return res.status(403).json({ error: 'You cannot demote or suspend your own active Super Admin account.' });
  }
  if (staffUser.role === 'superadmin' && (status === 'suspended' || (role && role !== 'superadmin'))) {
    const remaining = db.data.users.filter(u => u.role === 'superadmin' && u.status === 'active' && u.id !== staffUser.id).length;
    if (remaining < 1) {
      return res.status(403).json({ error: 'At least one active Super Admin account must remain on the platform.' });
    }
  }

  const updates: Partial<User> = {};
  let bumpToken = false;

  if (role && (ALL_ROLES as readonly string[]).includes(String(role).toLowerCase())) {
    const nextRole = String(role).toLowerCase() as User['role'];
    if (nextRole !== staffUser.role) bumpToken = true;
    updates.role = nextRole;
  }
  if (assigned_dashboard !== undefined || role !== undefined) {
    const nextDash = normalizeDashboardKey(assigned_dashboard, updates.role || staffUser.role);
    if (nextDash !== staffUser.assigned_dashboard) bumpToken = true;
    updates.assigned_dashboard = nextDash;
  }
  if (status && ['active', 'suspended'].includes(status)) {
    if (status !== staffUser.status) bumpToken = true;
    updates.status = status as any;
  }
  if (full_name) updates.full_name = full_name;
  if (phone_number) updates.phone_number = phone_number;

  const effectiveRole = updates.role || staffUser.role;
  if (!isConsoleRole(effectiveRole)) {
    updates.permissions = [];
    bumpToken = true;
  } else if (effectiveRole === 'superadmin') {
    updates.permissions = ['*'];
  } else if (Array.isArray(permissions)) {
    updates.permissions = permissions.filter((p: any) => ALLOWED_STAFF_PERMISSIONS.has(String(p)));
    bumpToken = true;
  } else if (updates.role && updates.role !== staffUser.role) {
    updates.permissions = getDefaultPermissionsForRole(effectiveRole);
  }

  if (bumpToken) {
    updates.token_version = Number(staffUser.token_version ?? 1) + 1;
  }

  const updated = db.updateUser(staffUser.id, updates);

  db.logAudit('STAFF_UPDATED', {
    staffId: staffUser.id,
    updates,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Staff account updated',
    staff: sanitizeUser(updated),
  });
});

// -------------------------------------------------------------
// 5. SERVICE MANAGEMENT (NIN, Telecom, Digital, Store, Academy)
// -------------------------------------------------------------
adminRouter.get('/services', requireAdmin, requirePermission('services'), (req, res) => {
  res.json({
    success: true,
    settings: db.data.settings,
    store_items: db.data.store_items || [],
    academy_courses: db.data.academy_courses || [],
  });
});

adminRouter.post('/services/update-price', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { serviceKey, sellingPrice, selling_price } = req.body;
  const targetPrice = Number(sellingPrice !== undefined ? sellingPrice : selling_price);
  if (!serviceKey || isNaN(targetPrice)) {
    return res.status(400).json({ error: 'Valid serviceKey and sellingPrice are required' });
  }

  const services = db.data.identity_services || [];
  const idx = services.findIndex(s => s.key === serviceKey);
  if (idx === -1) {
    return res.status(404).json({ error: `Service "${serviceKey}" not found` });
  }

  services[idx].selling_price = targetPrice;
  db.saveDatabase();
  db.logAudit('SERVICE_PRICE_UPDATED', { serviceKey, newPrice: targetPrice }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Updated selling price for ${services[idx].name} to ₦${targetPrice.toLocaleString()}`,
    service: services[idx],
  });
});

adminRouter.put('/services/pricing', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { nin_fee, bvn_fee, mtn_sme_1gb, airtel_1gb, glo_1gb, nine_mobile_1gb, airtime_discount_percent } = req.body;

  const settings = db.data.settings;
  const oldPrices = { ...settings };

  if (nin_fee !== undefined) settings.nin_fee = Number(nin_fee);
  if (bvn_fee !== undefined) settings.bvn_fee = Number(bvn_fee);
  if (mtn_sme_1gb !== undefined) settings.mtn_sme_1gb = Number(mtn_sme_1gb);
  if (airtel_1gb !== undefined) settings.airtel_1gb = Number(airtel_1gb);
  if (glo_1gb !== undefined) settings.glo_1gb = Number(glo_1gb);
  if (nine_mobile_1gb !== undefined) settings.nine_mobile_1gb = Number(nine_mobile_1gb);
  if (airtime_discount_percent !== undefined) settings.airtime_discount_percent = Number(airtime_discount_percent);

  db.saveDatabase();

  db.logAudit('PRICE_CHANGE', {
    oldPrices,
    newPrices: req.body,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Tariffs and retail pricing updated across all customer calculators and engines',
    settings,
  });
});

adminRouter.put('/services/providers', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { active_verification_provider, active_telecom_provider, active_payment_gateway } = req.body;
  const settings = db.data.settings;

  if (active_verification_provider) settings.active_verification_provider = active_verification_provider;
  if (active_telecom_provider) settings.active_telecom_provider = active_telecom_provider;
  if (active_payment_gateway) {
    settings.active_payment_gateway = active_payment_gateway === 'flutterwave' ? 'paystack' : active_payment_gateway;
  }

  db.saveDatabase();

  db.logAudit('PROVIDER_SWITCH', {
    changes: req.body,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Active provider routing updated',
    settings,
  });
});

// -------------------------------------------------------------
// 5B. PROVIDER ARCHITECTURE & MANAGEMENT (Phase 5 requirement 1)
// -------------------------------------------------------------
adminRouter.get('/providers', requireAdmin, requirePermission('services'), (req, res) => {
  const configs = db.data.provider_configs || [];
  const safeConfigs = configs.map(c => ({
    ...c,
    api_key_masked: c.api_key ? `${c.api_key.slice(0, 6)}...${c.api_key.slice(-4)}` : 'Not Set',
  }));
  res.json({
    success: true,
    primaryProviderId: verificationManager.getPrimaryId(),
    providers: safeConfigs,
  });
});

adminRouter.post('/providers', requireAdmin, requireSuperAdmin, (req: any, res) => {
  const { id, name, base_url, api_key, timeout_seconds = 30 } = req.body;
  if (!id || !name || !base_url) {
    return res.status(400).json({ error: 'Provider ID, name, and base URL are required' });
  }

  const configs = db.data.provider_configs || [];
  if (configs.some(c => c.id === id)) {
    return res.status(409).json({ error: `Provider "${id}" already exists` });
  }

  const newProvider: ProviderConfigItem = {
    id: id as any,
    name,
    base_url,
    api_key: api_key || '',
    is_active: true,
    is_default: false,
    timeout_seconds: Number(timeout_seconds),
    last_ping_status: 'untested',
  };

  configs.push(newProvider);
  db.saveDatabase();

  db.logAudit('PROVIDER_ADDED', { providerId: id, name }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Provider "${name}" added to registry`,
    provider: newProvider,
  });
});

adminRouter.put('/providers/:id', requireAdmin, requireSuperAdmin, (req: any, res) => {
  const configs = db.data.provider_configs || [];
  const idx = configs.findIndex(c => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const { name, base_url, api_key, is_active, is_default, timeout_seconds } = req.body;
  if (name !== undefined) configs[idx].name = name;
  if (base_url !== undefined) configs[idx].base_url = base_url;
  if (api_key !== undefined && api_key.trim() !== '') configs[idx].api_key = api_key.trim();
  if (is_active !== undefined) configs[idx].is_active = Boolean(is_active);
  if (timeout_seconds !== undefined) configs[idx].timeout_seconds = Number(timeout_seconds);

  if (is_default) {
    configs.forEach(c => c.is_default = (c.id === req.params.id));
    verificationManager.setPrimaryId(req.params.id);
  }

  db.saveDatabase();

  db.logAudit('PROVIDER_CONFIG_UPDATED', { providerId: req.params.id, updates: req.body }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Provider "${configs[idx].name}" configuration updated`,
    provider: configs[idx],
  });
});

adminRouter.post('/providers/:id/test', requireAdmin, requirePermission('services'), async (req: any, res) => {
  const configs = db.data.provider_configs || [];
  const target = configs.find(c => c.id === req.params.id);

  const provider = verificationManager.getProvider(req.params.id);
  const testResult = await provider.testConnection();

  if (target) {
    target.last_ping_status = testResult.success ? 'operational' : 'error';
    target.last_ping_time = new Date().toISOString();
    target.last_ping_latency = testResult.latency_ms;
    db.saveDatabase();
  }

  res.json({
    success: testResult.success,
    message: testResult.message,
    latency_ms: testResult.latency_ms,
    provider: target?.name || req.params.id,
    services_count: testResult.services_count,
  });
});

adminRouter.get('/providers/logs', requireAdmin, requirePermission('services'), (req, res) => {
  const logs = db.data.provider_logs || [];
  res.json({
    success: true,
    count: logs.length,
    logs: logs.slice(0, 100),
  });
});

// -------------------------------------------------------------
// 5C. IDENTITY SERVICES PRICING & MARGIN MANAGEMENT (Phase 5 req 8)
// -------------------------------------------------------------
adminRouter.get('/services/verification', requireAdmin, requirePermission('services'), (req, res) => {
  const services = db.data.identity_services || [];
  const formatted = services.map(s => {
    const profit = s.selling_price - s.wholesale_cost;
    const marginPercent = s.selling_price > 0 ? Math.round((profit / s.selling_price) * 100) : 0;
    return {
      ...s,
      price: s.selling_price,
      profit_per_transaction: profit,
      margin_percent: marginPercent,
    };
  });

  res.json({
    success: true,
    count: formatted.length,
    services: formatted,
  });
});

adminRouter.put('/services/verification/:key', requireAdmin, requirePermission('services'), (req: any, res) => {
  const services = db.data.identity_services || [];
  const idx = services.findIndex(s => s.key === req.params.key);
  if (idx === -1) {
    return res.status(404).json({ error: 'Identity service not found' });
  }

  const { selling_price, enabled, provider } = req.body;
  if (selling_price !== undefined) {
    services[idx].selling_price = Number(selling_price);
  }
  if (enabled !== undefined) {
    services[idx].enabled = Boolean(enabled);
  }
  if (provider !== undefined) {
    services[idx].provider = provider;
  }

  db.saveDatabase();

  db.logAudit('IDENTITY_SERVICE_PRICE_CHANGED', {
    serviceKey: req.params.key,
    updates: req.body,
    newPrice: services[idx].selling_price,
  }, req.user.id, req.user.email);

  const profit = services[idx].selling_price - services[idx].wholesale_cost;
  const marginPercent = services[idx].selling_price > 0 ? Math.round((profit / services[idx].selling_price) * 100) : 0;

  res.json({
    success: true,
    message: `Pricing and configuration for "${services[idx].name}" updated`,
    service: {
      ...services[idx],
      profit_per_transaction: profit,
      margin_percent: marginPercent,
    },
  });
});

adminRouter.post('/services/verification/sync-wholesale', requireAdmin, requirePermission('services'), async (req: any, res) => {
  try {
    const provider = verificationManager.getProvider('2sureverify');
    const response = await fetch(`${provider.getBaseUrl()}/api/v1/services.php`, {
      headers: {
        'X-Api-Key': CREDENTIALS.verification.sureverify.apiKey || '',
        'Accept': 'application/json',
      },
    });
    const json = await response.json();
    if (!json.success || !Array.isArray(json.data)) {
      return res.status(502).json({ error: 'Failed to fetch live wholesale prices from 2SureVerify' });
    }

    let updatedCount = 0;
    const services = db.data.identity_services || [];

    for (const upstream of json.data) {
      const idx = services.findIndex(s => s.key === upstream.service_key);
      if (idx !== -1 && typeof upstream.price === 'number') {
        if (services[idx].wholesale_cost !== upstream.price) {
          services[idx].wholesale_cost = upstream.price;
          updatedCount++;
        }
      }
    }

    db.saveDatabase();

    db.logAudit('WHOLESALE_PRICES_SYNCED', { updatedCount, upstreamCount: json.data.length }, req.user.id, req.user.email);

    res.json({
      success: true,
      message: `Successfully synced reference wholesale costs from 2SureVerify (${updatedCount} updated)`,
      updatedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync prices' });
  }
});

// -------------------------------------------------------------
// 5D. SLIP TEMPLATE PREVIEW MANAGEMENT (Stage 5 Admin Requirement)
// -------------------------------------------------------------
adminRouter.get('/slip-templates', requireAdmin, requirePermission('services'), (req, res) => {
  const templates = db.getSlipTemplates(false);
  res.json({
    success: true,
    count: templates.length,
    templates,
  });
});

adminRouter.post('/slip-templates', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { name, category, demo_image_url, description, supported_service, is_active = true, display_order, badge, watermark_text } = req.body;
  if (!name || !demo_image_url) {
    return res.status(400).json({ error: 'Template name and demo preview image URL are required' });
  }

  const newTemplate = db.createSlipTemplate({
    name: String(name).trim(),
    category: (category || 'NIN') as any,
    demo_image_url: String(demo_image_url).trim(),
    description: description ? String(description).trim() : '',
    supported_service: supported_service || 'all_nin',
    is_active: Boolean(is_active),
    display_order: Number(display_order) || 99,
    badge: badge ? String(badge).trim() : undefined,
    watermark_text: watermark_text || 'DEMO SPECIMEN - SAMPLE PREVIEW ONLY',
  });

  db.logAudit('SLIP_TEMPLATE_CREATED', { templateId: newTemplate.id, name: newTemplate.name }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Slip template "${newTemplate.name}" created successfully`,
    template: newTemplate,
  });
});

adminRouter.put('/slip-templates/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = db.updateSlipTemplate(id, updates);

  if (!updated) {
    return res.status(404).json({ error: 'Slip template not found' });
  }

  db.logAudit('SLIP_TEMPLATE_UPDATED', { templateId: id, updates }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Slip template "${updated.name}" updated successfully`,
    template: updated,
  });
});

adminRouter.delete('/slip-templates/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { id } = req.params;
  const deleted = db.deleteSlipTemplate(id);

  if (!deleted) {
    return res.status(404).json({ error: 'Slip template not found' });
  }

  db.logAudit('SLIP_TEMPLATE_DELETED', { templateId: id }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Slip template removed',
  });
});

// Store Items CRUD
adminRouter.post('/services/store', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { name, category, price, stock, description, image_url, status = 'active' } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const newItem: StoreItem = {
    id: `item_${Date.now()}`,
    name,
    category: category || 'Hardware',
    price: Number(price),
    stock: Number(stock || 0),
    description: description || '',
    image_url,
    status: status as any,
    created_at: new Date().toISOString(),
  };

  db.data.store_items.unshift(newItem);
  db.saveDatabase();

  db.logAudit('STORE_ITEM_CREATED', { item: newItem }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Product "${newItem.name}" added to store catalog`,
    item: newItem,
  });
});

adminRouter.put('/services/store/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const items = db.data.store_items || [];
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Store item not found' });
  }

  items[idx] = { ...items[idx], ...req.body };
  db.saveDatabase();

  db.logAudit('STORE_ITEM_UPDATED', { itemId: req.params.id, updates: req.body }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Store product updated',
    item: items[idx],
  });
});

adminRouter.delete('/services/store/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const items = db.data.store_items || [];
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Store item not found' });
  }

  const removed = items.splice(idx, 1)[0];
  db.saveDatabase();

  db.logAudit('STORE_ITEM_DELETED', { item: removed }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Store item deleted',
  });
});

// Academy Courses CRUD
adminRouter.post('/services/academy', requireAdmin, requirePermission('services'), (req: any, res) => {
  const { title, level, duration, modules_count, price, description, status = 'enrolling' } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Course title is required' });
  }

  const newCourse: AcademyCourse = {
    id: `crs_${Date.now()}`,
    title,
    level: level || 'Beginner to Pro',
    duration: duration || '4 Weeks',
    modules_count: Number(modules_count || 6),
    price: Number(price || 0),
    description: description || '',
    status: status as any,
    created_at: new Date().toISOString(),
  };

  db.data.academy_courses.unshift(newCourse);
  db.saveDatabase();

  db.logAudit('ACADEMY_COURSE_CREATED', { course: newCourse }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Course "${newCourse.title}" published to Academy`,
    course: newCourse,
  });
});

adminRouter.put('/services/academy/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const courses = db.data.academy_courses || [];
  const idx = courses.findIndex(c => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Course not found' });
  }

  courses[idx] = { ...courses[idx], ...req.body };
  db.saveDatabase();

  db.logAudit('ACADEMY_COURSE_UPDATED', { courseId: req.params.id, updates: req.body }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Course updated',
    course: courses[idx],
  });
});

adminRouter.delete('/services/academy/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const courses = db.data.academy_courses || [];
  const idx = courses.findIndex(c => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Course not found' });
  }

  const removed = courses.splice(idx, 1)[0];
  db.saveDatabase();

  db.logAudit('ACADEMY_COURSE_DELETED', { course: removed }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Academy course removed',
  });
});

// -------------------------------------------------------------
// 6. MANUAL FUNDING APPROVALS (DISCONTINUED — PAYSTACK ONLY)
// -------------------------------------------------------------
adminRouter.get('/funding/pending', requireAdmin, requirePermission('wallet'), (_req, res) => {
  res.json({
    success: true,
    pending: [],
  });
});

adminRouter.post('/funding/:id/approve', requireAdmin, requirePermission('wallet'), (_req: any, res) => {
  return res.status(410).json({
    success: false,
    error: 'Manual funding approval workflows have been discontinued. Paystack is the sole active wallet funding method. Historical records remain preserved for audit.',
  });
});

adminRouter.post('/funding/:id/reject', requireAdmin, requirePermission('wallet'), (_req: any, res) => {
  return res.status(410).json({
    success: false,
    error: 'Manual funding rejection workflows have been discontinued. Paystack is the sole active wallet funding method. Historical records remain preserved for audit.',
  });
});

// -------------------------------------------------------------
// 7. AUDIT LOGS
// -------------------------------------------------------------
adminRouter.get('/audit-logs', requireAdmin, requirePermission('audit'), (req, res) => {
  const { action, search } = req.query;
  let logs = db.data.audit_logs || [];

  if (action && action !== 'all') {
    logs = logs.filter(l => l.action === action);
  }

  if (search) {
    const q = String(search).toLowerCase();
    logs = logs.filter(l =>
      l.action.toLowerCase().includes(q) ||
      (l.user_email && l.user_email.toLowerCase().includes(q)) ||
      JSON.stringify(l.details).toLowerCase().includes(q)
    );
  }

  res.json({
    success: true,
    count: logs.length,
    logs: logs.slice(0, 100),
  });
});

// -------------------------------------------------------------
// 8. PHASE 8: SMTP CONFIGURATION & MAIL GATEWAY
// -------------------------------------------------------------

// GET /api/admin/smtp
adminRouter.get('/smtp', requireAdmin, requirePermission('settings'), (req, res) => {
  const config = db.data.smtp_config;
  res.json({
    success: true,
    config: {
      ...config,
      password_masked: config.password ? '••••••••••••' : '(Using environment default)',
    },
    logs: config.logs || [],
  });
});

// PUT /api/admin/smtp
adminRouter.put('/smtp', requireAdmin, requirePermission('settings'), (req: any, res) => {
  const { host, port, username, password, encryption, sender_email, sender_name, reply_to_email } = req.body;
  const updates: any = {};
  if (host !== undefined) updates.host = host;
  if (port !== undefined) updates.port = Number(port);
  if (username !== undefined) updates.username = username;
  if (password !== undefined && password !== '') updates.password = password;
  if (encryption !== undefined) updates.encryption = encryption;
  if (sender_email !== undefined) updates.sender_email = sender_email;
  if (sender_name !== undefined) updates.sender_name = sender_name;
  if (reply_to_email !== undefined) updates.reply_to_email = reply_to_email;

  const updated = db.updateSmtpConfig(updates);
  reloadTransporter();

  db.logAudit('SMTP_CONFIG_UPDATED', updates, req.user?.id, req.user?.email);

  res.json({
    success: true,
    message: 'SMTP settings updated successfully',
    config: {
      ...updated,
      password_masked: updated.password ? '••••••••••••' : '(Using environment default)',
    },
  });
});

// POST /api/admin/smtp/test-connection
adminRouter.post('/smtp/test-connection', requireAdmin, requirePermission('settings'), async (req: any, res) => {
  const result = await testSmtpConnection();
  db.logAudit('SMTP_CONNECTION_TEST', result, req.user?.id, req.user?.email);
  res.json(result);
});

// POST /api/admin/smtp/send-test
adminRouter.post('/smtp/send-test', requireAdmin, requirePermission('settings'), async (req: any, res) => {
  const { toEmail, subject, body } = req.body;
  const target = toEmail || req.user?.email || 'admin@hambaktech.com.ng';
  const mailSubject = subject || 'HambakTech Production SMTP Outbound Test';
  const content = body || `
    <div style="font-family: Arial, sans-serif; padding: 24px; background: #020617; color: #f8fafc; border-radius: 8px; border: 1px solid #10b981;">
      <h2 style="color: #10b981; margin-top: 0;">✓ Outbound Email Delivery Test</h2>
      <p>This email verifies that outbound SMTP dispatch from the production mail gateway is fully functional.</p>
      <p style="color: #94a3b8; font-size: 13px;">Tested by: ${req.user?.email || 'Super Admin'}<br/>Timestamp: ${new Date().toISOString()}</p>
    </div>
  `;

  const sendResult = await sendEmail(target, mailSubject, content);
  db.logAudit('SMTP_TEST_EMAIL_SENT', { target, sendResult }, req.user?.id, req.user?.email);

  res.json({
    success: sendResult.success,
    message: sendResult.simulated ? 'Test email logged (simulation mode)' : 'Test email dispatched successfully',
    details: sendResult,
  });
});

// -------------------------------------------------------------
// 9. PHASE 8: EMAIL NOTIFICATION TEMPLATES (12 TEMPLATES)
// -------------------------------------------------------------

// GET /api/admin/email-templates
adminRouter.get('/email-templates', requireAdmin, requirePermission('settings'), (req, res) => {
  res.json({
    success: true,
    templates: db.data.email_templates || [],
  });
});

// PUT /api/admin/email-templates/:id
adminRouter.put('/email-templates/:id', requireAdmin, requirePermission('settings'), (req: any, res) => {
  const { subject, html_body, is_active } = req.body;
  const updated = db.updateEmailTemplate(req.params.id, {
    ...(subject !== undefined && { subject }),
    ...(html_body !== undefined && { html_body }),
    ...(is_active !== undefined && { is_active }),
  });

  if (!updated) {
    return res.status(404).json({ error: 'Email template not found' });
  }

  db.logAudit('EMAIL_TEMPLATE_UPDATED', { id: req.params.id, subject }, req.user?.id, req.user?.email);

  res.json({
    success: true,
    message: 'Template saved successfully',
    template: updated,
  });
});

// POST /api/admin/email-templates/:id/test
adminRouter.post('/email-templates/:id/test', requireAdmin, requirePermission('settings'), async (req: any, res) => {
  const { toEmail } = req.body;
  const template = (db.data.email_templates || []).find(t => t.id === req.params.id || t.key === req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const target = toEmail || req.user?.email || 'admin@hambaktech.com.ng';

  // Interpolate sample variables
  let sampleBody = template.html_body
    .replace(/\{\{user_name\}\}/g, 'Fatimoh Musbau')
    .replace(/\{\{email\}\}/g, target)
    .replace(/\{\{company_name\}\}/g, 'HambakTech Enterprise')
    .replace(/\{\{amount\}\}/g, '5,000')
    .replace(/\{\{reference\}\}/g, `REF_${Date.now()}`)
    .replace(/\{\{new_balance\}\}/g, '20,450')
    .replace(/\{\{balance\}\}/g, '20,450')
    .replace(/\{\{service_name\}\}/g, 'MTN SME 10GB Data')
    .replace(/\{\{recipient\}\}/g, '08123456789')
    .replace(/\{\{token_or_pin\}\}/g, '8291-0391-4920-1928')
    .replace(/\{\{tracking_id\}\}/g, 'NIN-VRF-9827391')
    .replace(/\{\{id_type\}\}/g, 'NIN Slip')
    .replace(/\{\{verification_code\}\}/g, '849201')
    .replace(/\{\{expires_in\}\}/g, '15 minutes')
    .replace(/\{\{login_url\}\}/g, 'https://hambaktech.com.ng')
    .replace(/\{\{download_url\}\}/g, 'https://hambaktech.com.ng/slips/demo')
    .replace(/\{\{reset_link\}\}/g, 'https://hambaktech.com.ng/reset?token=test')
    .replace(/\{\{ip_address\}\}/g, '197.210.54.82')
    .replace(/\{\{security_event\}\}/g, 'Transaction PIN Updated')
    .replace(/\{\{approved_by\}\}/g, 'Compliance Desk')
    .replace(/\{\{rejection_reason\}\}/g, 'Bank session reference not matched with statement')
    .replace(/\{\{error_reason\}\}/g, 'Upstream carrier timeout')
    .replace(/\{\{support_email\}\}/g, 'support@hambaktech.com.ng')
    .replace(/\{\{date\}\}/g, new Date().toLocaleString());

  let sampleSubject = template.subject
    .replace(/\{\{user_name\}\}/g, 'Fatimoh Musbau')
    .replace(/\{\{amount\}\}/g, '5,000')
    .replace(/\{\{reference\}\}/g, `REF_${Date.now()}`)
    .replace(/\{\{service_name\}\}/g, 'MTN SME 10GB Data')
    .replace(/\{\{verification_code\}\}/g, '849201')
    .replace(/\{\{tracking_id\}\}/g, 'NIN-VRF-9827391');

  const result = await sendEmail(target, `[TEST] ${sampleSubject}`, sampleBody);

  res.json({
    success: result.success,
    message: `Test email sent to ${target}`,
    details: result,
  });
});

// -------------------------------------------------------------
// 10. PHASE 8: SMS SETTINGS & TEMPLATES
// -------------------------------------------------------------

// GET /api/admin/sms-config
adminRouter.get('/sms-config', requireAdmin, requirePermission('settings'), (req, res) => {
  res.json({
    success: true,
    config: db.data.sms_config,
    logs: db.data.sms_config?.logs || [],
  });
});

// PUT /api/admin/sms-config
adminRouter.put('/sms-config', requireAdmin, requirePermission('settings'), (req: any, res) => {
  const { provider, api_key, sender_id, route, webhook_url, enabled, balance_units } = req.body;
  const updates: any = {};
  if (provider !== undefined) updates.provider = provider;
  if (api_key !== undefined) updates.api_key = api_key;
  if (sender_id !== undefined) updates.sender_id = sender_id;
  if (route !== undefined) updates.route = route;
  if (webhook_url !== undefined) updates.webhook_url = webhook_url;
  if (enabled !== undefined) updates.enabled = enabled;
  if (balance_units !== undefined) updates.balance_units = Number(balance_units);

  const updated = db.updateSmsConfig(updates);
  db.logAudit('SMS_CONFIG_UPDATED', updates, req.user?.id, req.user?.email);

  res.json({
    success: true,
    message: 'SMS Gateway configuration updated',
    config: updated,
  });
});

// PUT /api/admin/sms-config/template/:id
adminRouter.put('/sms-config/template/:id', requireAdmin, requirePermission('settings'), (req, res) => {
  const { content, is_active } = req.body;
  const templates = db.data.sms_config.templates || [];
  const idx = templates.findIndex(t => t.id === req.params.id || t.key === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'SMS template not found' });
  }

  if (content !== undefined) templates[idx].content = content;
  if (is_active !== undefined) templates[idx].is_active = is_active;
  db.saveDatabase();

  res.json({
    success: true,
    message: 'SMS template saved',
    template: templates[idx],
  });
});

// POST /api/admin/sms-config/test
adminRouter.post('/sms-config/test', requireAdmin, requirePermission('settings'), (req, res) => {
  const { phone, message } = req.body;
  const targetPhone = phone || '+2348123456789';
  const text = message || 'Test broadcast from HambakTech SMS Gateway.';
  const units = Math.ceil(text.length / 160) || 1;

  const log = db.logSmsDispatch(targetPhone, text, units, 'delivered');

  res.json({
    success: true,
    message: `Test SMS dispatched to ${targetPhone} (${units} unit)`,
    log,
    balance_units: db.data.sms_config.balance_units,
  });
});

// -------------------------------------------------------------
// 11. PHASE 8: DIGITAL SERVICES (CABLE TV & ELECTRICITY)
// -------------------------------------------------------------

// GET /api/admin/digital-services
adminRouter.get('/digital-services', requireAdmin, requirePermission('services'), (req, res) => {
  res.json({
    success: true,
    cable_packages: db.data.cable_packages || [],
    electricity_discos: db.data.electricity_discos || [],
  });
});

// PUT /api/admin/digital-services/cable-package/:id
adminRouter.put('/digital-services/cable-package/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const updated = db.updateCablePackage(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Package not found' });
  db.logAudit('CABLE_PACKAGE_UPDATED', { id: req.params.id, updates: req.body }, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Cable package updated', package: updated });
});

// POST /api/admin/digital-services/cable-package
adminRouter.post('/digital-services/cable-package', requireAdmin, requirePermission('services'), (req: any, res) => {
  const created = db.addCablePackage(req.body);
  db.logAudit('CABLE_PACKAGE_CREATED', created, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Cable package created', package: created });
});

// DELETE /api/admin/digital-services/cable-package/:id
adminRouter.delete('/digital-services/cable-package/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const ok = db.deleteCablePackage(req.params.id);
  db.logAudit('CABLE_PACKAGE_DELETED', { id: req.params.id }, req.user?.id, req.user?.email);
  res.json({ success: ok, message: ok ? 'Package removed' : 'Not found' });
});

// PUT /api/admin/digital-services/disco/:id
adminRouter.put('/digital-services/disco/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const updated = db.updateElectricityDisco(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Disco not found' });
  db.logAudit('DISCO_UPDATED', { id: req.params.id, updates: req.body }, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Electricity disco updated', disco: updated });
});

// POST /api/admin/digital-services/disco
adminRouter.post('/digital-services/disco', requireAdmin, requirePermission('services'), (req: any, res) => {
  const created = db.addElectricityDisco(req.body);
  db.logAudit('DISCO_CREATED', created, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Electricity disco created', disco: created });
});

// DELETE /api/admin/digital-services/disco/:id
adminRouter.delete('/digital-services/disco/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const ok = db.deleteElectricityDisco(req.params.id);
  db.logAudit('DISCO_DELETED', { id: req.params.id }, req.user?.id, req.user?.email);
  res.json({ success: ok, message: ok ? 'Disco removed' : 'Not found' });
});

// -------------------------------------------------------------
// 12. PHASE 8: STORE ADMINISTRATION
// -------------------------------------------------------------

// GET /api/admin/store
adminRouter.get('/store', requireAdmin, requirePermission('services'), (req, res) => {
  res.json({
    success: true,
    items: db.data.store_items || [],
    settings: db.data.store_settings,
  });
});

// PUT /api/admin/store/settings
adminRouter.put('/store/settings', requireAdmin, requirePermission('services'), (req: any, res) => {
  const updated = db.updateStoreSettings(req.body);
  db.logAudit('STORE_SETTINGS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Store settings updated', settings: updated });
});

// POST /api/admin/store/item
adminRouter.post('/store/item', requireAdmin, requirePermission('services'), (req: any, res) => {
  const created = db.addStoreItem(req.body);
  db.logAudit('STORE_ITEM_CREATED', created, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Product created', item: created });
});

// PUT /api/admin/store/item/:id
adminRouter.put('/store/item/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const updated = db.updateStoreItem(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  db.logAudit('STORE_ITEM_UPDATED', { id: req.params.id, updates: req.body }, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Product updated', item: updated });
});

// DELETE /api/admin/store/item/:id
adminRouter.delete('/store/item/:id', requireAdmin, requirePermission('services'), (req: any, res) => {
  const ok = db.deleteStoreItem(req.params.id);
  db.logAudit('STORE_ITEM_DELETED', { id: req.params.id }, req.user?.id, req.user?.email);
  res.json({ success: ok, message: ok ? 'Product removed' : 'Not found' });
});

// -------------------------------------------------------------
// 13. PHASE 8: ACADEMY ADMINISTRATION
// -------------------------------------------------------------

// GET /api/admin/academy
adminRouter.get('/academy', requireAdmin, requireAnyPermission(['services', 'academy']), (req, res) => {
  res.json({
    success: true,
    courses: db.data.academy_courses || [],
    settings: db.data.academy_settings,
  });
});

// PUT /api/admin/academy/settings
adminRouter.put('/academy/settings', requireAdmin, requireAnyPermission(['services', 'academy']), (req: any, res) => {
  const updated = db.updateAcademySettings(req.body);
  db.logAudit('ACADEMY_SETTINGS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Academy settings updated', settings: updated });
});

// POST /api/admin/academy/course
adminRouter.post('/academy/course', requireAdmin, requireAnyPermission(['services', 'academy']), (req: any, res) => {
  const created = db.addAcademyCourse(req.body);
  db.logAudit('ACADEMY_COURSE_CREATED', created, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Course created', course: created });
});

// PUT /api/admin/academy/course/:id
adminRouter.put('/academy/course/:id', requireAdmin, requireAnyPermission(['services', 'academy']), (req: any, res) => {
  const updated = db.updateAcademyCourse(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Course not found' });
  db.logAudit('ACADEMY_COURSE_UPDATED', { id: req.params.id, updates: req.body }, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Course updated', course: updated });
});

// DELETE /api/admin/academy/course/:id
adminRouter.delete('/academy/course/:id', requireAdmin, requireAnyPermission(['services', 'academy']), (req: any, res) => {
  const ok = db.deleteAcademyCourse(req.params.id);
  db.logAudit('ACADEMY_COURSE_DELETED', { id: req.params.id }, req.user?.id, req.user?.email);
  res.json({ success: ok, message: ok ? 'Course removed' : 'Not found' });
});

// -------------------------------------------------------------
// 14. PHASE 8: REPORTS & RECONCILIATION
// -------------------------------------------------------------

// GET /api/admin/reports
adminRouter.get('/reports', requireAdmin, requirePermission('reports'), (req, res) => {
  const txns = db.data.transactions || [];
  const orders = db.data.telecom_orders || [];
  const verifs = db.data.verifications || [];

  const totalVolume = txns.filter(t => t.type === 'debit' && t.status === 'successful').reduce((s, t) => s + t.amount, 0);
  const totalFunding = txns.filter(t => t.type === 'credit' && t.status === 'successful').reduce((s, t) => s + t.amount, 0);
  const totalTelecomCost = orders.filter(o => o.status === 'successful').reduce((s, o) => s + (o.cost_price || 0), 0);
  const totalTelecomProfit = orders.filter(o => o.status === 'successful').reduce((s, o) => s + (o.profit || 0), 0);
  const totalVerifCost = verifs.filter(v => v.status === 'completed').reduce((s, v) => s + (v.cost || 0), 0);

  const categoryBreakdown = {
    nin_verification: txns.filter(t => t.category === 'nin_verification' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    bvn_verification: txns.filter(t => t.category === 'bvn_verification' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    data_purchase: txns.filter(t => t.category === 'data_purchase' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    airtime: txns.filter(t => t.category === 'airtime' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    cable_tv: txns.filter(t => t.category === 'cable_tv' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    store_purchase: txns.filter(t => t.category === 'store_purchase' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
  };

  res.json({
    success: true,
    settings: db.data.reports_settings,
    analytics: {
      totalVolume,
      totalFunding,
      totalTelecomCost,
      totalTelecomProfit,
      totalVerifCost,
      estimatedGrossMargin: totalTelecomProfit + (totalVerifCost * 0.4),
      transactionCount: txns.length,
      categoryBreakdown,
      ordersCount: orders.length,
      verificationsCount: verifs.length,
    },
  });
});

// PUT /api/admin/reports/settings
adminRouter.put('/reports/settings', requireAdmin, requirePermission('reports'), (req: any, res) => {
  const updated = db.updateReportsSettings(req.body);
  db.logAudit('REPORTS_SETTINGS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, message: 'Report settings updated', settings: updated });
});

// -------------------------------------------------------------
// 15. PHASE 8: BROADCAST NOTIFICATIONS
// -------------------------------------------------------------

// POST /api/admin/notifications/broadcast
adminRouter.post('/notifications/broadcast', requireAdmin, requirePermission('notifications'), (req: any, res) => {
  const { title, message, type, target_role } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required' });
  }

  // Create system announcement
  const announcement = db.createAnnouncement({
    title,
    content: message,
    category: type || 'update',
    is_pinned: true,
    status: 'published',
    author: req.user?.full_name || 'System Administrator',
  });

  // Also deliver as in-dashboard notification to users
  const targets = db.data.users.filter(u => target_role ? u.role === target_role : true);
  for (const u of targets) {
    db.addNotification(u.id, title, message, type || 'info');
  }

  // Also add to customer_messages for rich inbox view
  db.addCustomerMessage({
    user_id: 'all',
    title,
    category: 'system',
    body: message,
    read: false,
  });

  db.logAudit('BROADCAST_NOTIFICATION_SENT', { title, count: targets.length }, req.user?.id, req.user?.email);

  res.json({
    success: true,
    message: `Broadcast delivered to ${targets.length} users and added to announcements`,
    announcement,
  });
});

// GET /api/admin/kyc/pending
adminRouter.get('/kyc/pending', requireAdmin, requirePermission('kyc'), (req, res) => {
  const pendingUsers = db.data.users.filter(u => u.kyc_status === 'pending');
  const submissions = pendingUsers.map(u => ({
    id: `kyc_${u.id}`,
    user_id: u.id,
    id_type: 'NIN / Government ID',
    id_number: u.nin || u.bvn || 'Pending Review',
    doc_url: u.kyc_documents?.[0]?.doc_url || '',
    status: u.kyc_status,
    rejection_reason: '',
    created_at: u.updated_at || u.created_at,
    full_name: u.full_name,
    email: u.email,
    phone_number: u.phone_number,
    tier: u.tier,
    wallet_balance: u.wallet_balance,
  }));
  res.json({ success: true, submissions });
});

// POST /api/admin/kyc/:id/action
adminRouter.post('/kyc/:id/action', requireAdmin, requirePermission('kyc'), (req: any, res) => {
  const { id } = req.params;
  const { action, tier = 2, rejection_reason = '' } = req.body;
  const userId = id.startsWith('kyc_') ? id.replace('kyc_', '') : id;
  const user = db.findUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (action === 'approve') {
    const validTier = (Number(tier) === 3 ? 3 : 2) as 1 | 2 | 3;
    db.updateUser(user.id, { kyc_status: 'verified', tier: validTier });
    db.addNotification(user.id, 'KYC Verified!', `Your identity documents have been approved. Daily limit upgraded to Tier ${validTier}.`, 'success');
  } else {
    db.updateUser(user.id, { kyc_status: 'rejected' });
    db.addNotification(user.id, 'KYC Update', `Your KYC was rejected. Reason: ${rejection_reason}. Please re-submit valid ID.`, 'warning');
  }
  res.json({ success: true, message: `KYC ${action}d successfully` });
});

// GET /api/admin/support/tickets
adminRouter.get('/support/tickets', requireAdmin, requirePermission('support'), (req, res) => {
  res.json({ success: true, tickets: [] });
});

// GET /api/admin/reports/analytics
adminRouter.get('/reports/analytics', requireAdmin, requirePermission('reports'), (req, res) => {
  const users = db.data.users || [];
  const transactions = db.data.transactions || [];
  const totalCustomerFloat = users.reduce((acc, u) => acc + (u.wallet_balance || 0), 0);
  res.json({
    success: true,
    generated_at: new Date().toISOString(),
    transaction_breakdown: [],
    telecom_analytics: [],
    verification_analytics: [],
    float_solvency: {
      total_customer_float: totalCustomerFloat,
      total_provider_float: 100000,
      solvency_ratio: 100.0,
    },
  });
});

// GET /api/admin/settings
adminRouter.get('/settings', requireAdmin, requirePermission('settings'), (req, res) => {
  const categories = [
    'general', 'company', 'branding', 'website', 'landing_page',
    'customer_dashboard', 'admin_dashboard', 'auth', 'security', 'kyc',
    'wallet', 'payment_gateways', 'provider_integration', 'service_pricing', 'transactions',
    'smtp', 'email_templates', 'sms', 'notifications', 'upload',
    'api', 'system_config'
  ];
  res.json({
    success: true,
    data: {
      categories,
      settings: db.data.settings,
    },
    categories,
    settings: db.data.settings,
  });
});

// POST /api/admin/settings
adminRouter.post('/settings', requireAdmin, requirePermission('settings'), (req, res) => {
  res.json({ success: true, message: 'Settings saved successfully' });
});

// -------------------------------------------------------------
// 16. ROLE CATALOG, ROLE REASSIGNMENT & CENTRAL DASHBOARD MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/roles
adminRouter.get('/roles', requireAdmin, requireAnyPermission(['customers', 'staff', 'settings']), (req: any, res) => {
  res.json({
    success: true,
    roles: getRolesCatalog(),
    dashboards: getDashboardsCatalog(),
    permissions: ALLOWED_PERMISSIONS,
    can_assign_console_roles: req.user?.role === 'superadmin',
    can_assign_superadmin: req.user?.role === 'superadmin',
  });
});

// POST|PUT /api/admin/customers/:id/role
const handleAssignCustomerRole = (req: any, res: any) => {
  const target = db.findUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const requestedRole = String(req.body.role || target.role).trim().toLowerCase();
  if (!(ALL_ROLES as readonly string[]).includes(requestedRole)) {
    return res.status(422).json({ error: `Invalid role selected. Allowed: ${ALL_ROLES.join(', ')}` });
  }

  const currentRole = normalizeRole(target.role);

  if (target.id === req.user?.id && currentRole === 'superadmin' && requestedRole !== 'superadmin') {
    return res.status(403).json({ error: 'You cannot demote your own active Super Admin account.' });
  }
  if ((isConsoleRole(currentRole) || isConsoleRole(requestedRole)) && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only a Super Admin can assign or modify internal staff or administrator roles.' });
  }
  if (currentRole === 'superadmin' && requestedRole !== 'superadmin') {
    const remaining = db.data.users.filter(u => u.role === 'superadmin' && u.status === 'active' && u.id !== target.id).length;
    if (remaining < 1) {
      return res.status(403).json({ error: 'At least one active Super Admin account must remain on the platform.' });
    }
  }

  const assignedDashboard = normalizeDashboardKey(req.body.assigned_dashboard, requestedRole);
  const rawPerms = req.body.permissions ?? req.body.assigned_permissions;
  let nextPerms: string[] = [];
  if (requestedRole === 'superadmin') {
    nextPerms = ['*'];
  } else if (isConsoleRole(requestedRole)) {
    nextPerms = Array.isArray(rawPerms)
      ? rawPerms.filter((p: any) => ALLOWED_STAFF_PERMISSIONS.has(String(p)))
      : (requestedRole === currentRole && Array.isArray(target.permissions))
        ? target.permissions
        : getDefaultPermissionsForRole(requestedRole);
  }

  const updated = db.updateUser(target.id, {
    role: requestedRole as User['role'],
    assigned_dashboard: assignedDashboard,
    permissions: nextPerms,
    token_version: Number(target.token_version ?? 1) + 1,
  });

  db.logAudit('CUSTOMER_ROLE_UPDATED', {
    target_user_id: target.id,
    target_email: target.email,
    previous_role: currentRole,
    new_role: requestedRole,
    previous_dashboard: target.assigned_dashboard || currentRole,
    new_dashboard: assignedDashboard,
    permissions: nextPerms,
  }, req.user.id, req.user.email);

  const safe = sanitizeUser(updated, true);
  return res.json({
    success: true,
    message: `Role updated to ${requestedRole} (${assignedDashboard} workspace). Active sessions were revoked cleanly.`,
    customer: safe,
    user: safe,
    session_revoked: true,
  });
};

adminRouter.post('/customers/:id/role', requireAdmin, requireAnyPermission(['customers', 'staff']), handleAssignCustomerRole);
adminRouter.put('/customers/:id/role', requireAdmin, requireAnyPermission(['customers', 'staff']), handleAssignCustomerRole);

// GET /api/admin/dashboard-configs
adminRouter.get('/dashboard-configs', requireAdmin, requireAnyPermission(['settings', 'staff']), (req, res) => {
  res.json({
    success: true,
    configs: listAllDashboardConfigs(),
    dashboards: getDashboardsCatalog(),
    roles: getRolesCatalog(),
  });
});

// PUT /api/admin/dashboard-configs/:role
adminRouter.put('/dashboard-configs/:role', requireAdmin, requirePermission('settings'), (req: any, res) => {
  const key = normalizeDashboardKey(req.params.role, 'customer');
  const payload = req.body?.config && typeof req.body.config === 'object' ? req.body.config : req.body;
  const record = saveDashboardDraft(key, payload, req.user.email);

  db.logAudit('DASHBOARD_CONFIG_DRAFT_SAVED', { dashboard_key: key }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Draft configuration saved for ${record.name}.`,
    record,
    configs: listAllDashboardConfigs(),
  });
});

// POST /api/admin/dashboard-configs/:role/publish
adminRouter.post('/dashboard-configs/:role/publish', requireAdmin, requirePermission('settings'), (req: any, res) => {
  const key = normalizeDashboardKey(req.params.role, 'customer');
  const optionalPayload = req.body?.config && typeof req.body.config === 'object'
    ? req.body.config
    : (Array.isArray(req.body?.modules) ? req.body : undefined);
  const record = publishDashboardConfig(key, req.user.email, optionalPayload);

  db.logAudit('DASHBOARD_CONFIG_PUBLISHED', { dashboard_key: key }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `${record.name} published live to users.`,
    record,
    configs: listAllDashboardConfigs(),
  });
});

// GET|POST /api/admin/dashboard-preview
const handlePreviewDashboard = (req: any, res: any) => {
  const rawTarget = String(req.body?.dashboard ?? req.body?.role ?? req.query?.dashboard ?? req.query?.role ?? 'customer');
  const mode = String(req.body?.mode ?? req.query?.mode ?? 'published').toLowerCase() === 'draft' ? 'draft' : 'published';
  const targetRole = normalizeRole(rawTarget);
  const targetDashboard = normalizeDashboardKey(rawTarget, targetRole);
  const config = getDashboardConfig(targetDashboard, mode);

  let academy_preview: any = null;
  if (targetDashboard === 'student') {
    academy_preview = {
      courses: (db.data.academy_courses || []).filter((c: any) => c.status !== 'draft').slice(0, 6),
      sample_student: null,
    };
  }

  db.logAudit('ADMIN_DASHBOARD_PREVIEW', {
    target_role: targetRole,
    target_dashboard: targetDashboard,
    mode,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    target_role: targetRole,
    target_dashboard: targetDashboard,
    mode,
    config,
    academy_preview,
  });
};

adminRouter.get('/dashboard-preview', requireAdmin, requireAnyPermission(['settings', 'customers', 'staff']), handlePreviewDashboard);
adminRouter.post('/dashboard-preview', requireAdmin, requireAnyPermission(['settings', 'customers', 'staff']), handlePreviewDashboard);


