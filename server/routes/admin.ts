/**
 * @file admin.ts
 * Phase 4 Super Admin Dashboard and Global Management backend router.
 * Implements admin overview, customer management, staff RBAC, dashboard module control,
 * service management (pricing/providers/store/academy), audit logs, and manual funding approvals.
 */

import { Router } from 'express';
import { db, hashPassword, User, AuditLog, DashboardModuleConfig, StoreItem, AcademyCourse, ProviderConfigItem } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { parseToken } from './auth.js';
import { sendEmail } from '../services/mailer.js';
import { verificationManager } from '../adapters/verification/VerificationAdapter.js';

export const adminRouter = Router();

// Middleware: Require Admin or SuperAdmin
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

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied: Super Admin or Admin authorization required' });
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

function sanitizeUser(u: any) {
  if (!u) return u;
  const { password_hash, transaction_pin_hash, ...safe } = u;
  return safe;
}

// -------------------------------------------------------------
// 1. ADMIN OVERVIEW
// -------------------------------------------------------------
adminRouter.get('/overview', requireAdmin, (req, res) => {
  const users = db.data.users || [];
  const txns = db.data.transactions || [];
  const orders = db.data.telecom_orders || [];
  const verifications = db.data.verifications || [];

  const customers = users.filter(u => u.role === 'customer');
  const activeCustomers = customers.filter(u => u.status === 'active');
  const suspendedCustomers = customers.filter(u => u.status === 'suspended');
  const staff = users.filter(u => u.role === 'admin' || u.role === 'superadmin');

  const totalWalletBalances = users.reduce((sum, u) => sum + (u.wallet_balance || 0), 0);

  const totalWalletFunding = txns
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalServiceSales = txns
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const telecomCost = orders
    .filter(o => o.status === 'successful')
    .reduce((sum, o) => sum + (o.cost_price || Math.floor(o.amount * 0.9)), 0);

  const verificationCost = verifications
    .filter(v => v.status === 'completed')
    .reduce((sum, v) => sum + Math.floor(v.cost * 0.7), 0);

  const providerExpenditure = telecomCost + verificationCost;
  const grossProfit = Math.max(0, totalServiceSales - providerExpenditure);

  const successfulTransactions = txns.filter(t => t.status === 'successful').length;
  const pendingTransactions = txns.filter(t => t.status === 'pending').length;
  const failedTransactions = txns.filter(t => t.status === 'failed').length;

  const pendingFundings = txns.filter(t => t.gateway === 'manual_transfer' && t.status === 'pending');
  const pendingKycUsers = users.filter(u => u.kyc_status === 'pending');

  const providerStatus = {
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
    flutterwave: {
      configured: Boolean(CREDENTIALS.payments.flutterwave.clientId),
      status: CREDENTIALS.payments.flutterwave.clientId ? 'Live Gateway' : 'Mock Sandbox',
      clientIdMasked: CREDENTIALS.payments.flutterwave.clientId
        ? `${CREDENTIALS.payments.flutterwave.clientId.slice(0, 8)}...`
        : 'Not Set',
    },
    smtpMail: {
      configured: Boolean(CREDENTIALS.mail.host),
      status: CREDENTIALS.mail.host ? 'TrueHost LON110 Connected' : 'Local Fallback',
      host: CREDENTIALS.mail.host,
      port: CREDENTIALS.mail.port,
    },
    cpanel: {
      configured: Boolean(CREDENTIALS.cpanel.serverIp),
      status: 'LON110 Active (51.89.153.183:1624)',
      host: CREDENTIALS.cpanel.ftpHost,
      serverIp: CREDENTIALS.cpanel.serverIp,
    },
  };

  res.json({
    success: true,
    metrics: {
      totalCustomers: customers.length,
      activeCustomers: activeCustomers.length,
      suspendedCustomers: suspendedCustomers.length,
      totalStaff: staff.length,
      totalWalletBalances,
      totalWalletFunding,
      totalServiceSales,
      providerExpenditure,
      grossProfit,
      successfulTransactions,
      pendingTransactions,
      failedTransactions,
      pendingFundingApprovals: pendingFundings.length,
      pendingKycCount: pendingKycUsers.length,
    },
    recentRegistrations: users.slice(-8).reverse().map(sanitizeUser),
    recentOrders: orders.slice(0, 8),
    pendingFundings: pendingFundings.slice(0, 10),
    providerStatus,
  });
});

// -------------------------------------------------------------
// 2. CUSTOMER MANAGEMENT
// -------------------------------------------------------------
adminRouter.get('/customers', requireAdmin, (req, res) => {
  const { search, status, tier, role } = req.query;
  let list = db.data.users.filter(u => u.role === 'customer');

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone_number.includes(q) ||
      (u.referral_code && u.referral_code.toLowerCase().includes(q))
    );
  }

  if (status && status !== 'all') {
    list = list.filter(u => u.status === status);
  }

  if (tier && tier !== 'all') {
    list = list.filter(u => String(u.tier) === String(tier));
  }

  res.json({
    success: true,
    count: list.length,
    customers: list.map(sanitizeUser),
  });
});

adminRouter.get('/customers/:id', requireAdmin, (req, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const transactions = db.data.transactions.filter(t => t.user_id === user.id);
  const orders = db.data.telecom_orders.filter(o => o.user_id === user.id);
  const verifications = db.data.verifications.filter(v => v.user_id === user.id);
  const auditLogs = db.data.audit_logs.filter(a => a.user_id === user.id || (a.details && a.details.targetUserId === user.id));

  res.json({
    success: true,
    customer: sanitizeUser(user),
    transactions,
    orders,
    verifications,
    auditLogs,
  });
});

// Update customer details
adminRouter.put('/customers/:id', requireAdmin, (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { full_name, phone_number, tier, kyc_status, address, state, lga } = req.body;
  const updates: Partial<User> = {};
  if (full_name !== undefined) updates.full_name = String(full_name).trim();
  if (phone_number !== undefined) updates.phone_number = String(phone_number).trim();
  if (tier !== undefined) updates.tier = Number(tier) as any;
  if (kyc_status !== undefined) updates.kyc_status = kyc_status;
  if (address !== undefined) updates.address = address;
  if (state !== undefined) updates.state = state;
  if (lga !== undefined) updates.lga = lga;

  const updated = db.updateUser(user.id, updates);

  db.logAudit('ADMIN_CUSTOMER_UPDATED', { targetUserId: user.id, updates }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Customer profile updated successfully',
    customer: updated,
  });
});

// Suspend or activate customer
adminRouter.post('/customers/:id/status', requireAdmin, (req: any, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  if (user.role === 'superadmin') {
    return res.status(400).json({ error: 'Cannot alter Super Admin account status' });
  }

  const { status, reason } = req.body;
  if (!status || !['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or suspended' });
  }

  const updated = db.updateUser(user.id, { status: status as any });

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
    customer: updated,
  });
});

// Manual Wallet Adjustment (Credit or Debit)
adminRouter.post('/customers/:id/wallet-adjust', requireAdmin, (req: any, res) => {
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
adminRouter.post('/customers/:id/kyc', requireAdmin, (req: any, res) => {
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
    customer: updated,
  });
});

// Send custom customer notification
adminRouter.post('/customers/:id/notify', requireAdmin, (req: any, res) => {
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

adminRouter.put('/dashboard-modules/:id', requireAdmin, (req: any, res) => {
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
adminRouter.get('/staff', requireAdmin, (req, res) => {
  const staff = db.data.users.filter(u => u.role === 'admin' || u.role === 'superadmin');
  res.json({
    success: true,
    staff: staff.map(sanitizeUser),
  });
});

adminRouter.post('/staff', requireAdmin, requireSuperAdmin, async (req: any, res) => {
  try {
    const { full_name, email, phone_number, password, role = 'admin', permissions = [] } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const newStaff = db.createUser({
      email: email.trim().toLowerCase(),
      password_hash: hashPassword(password),
      full_name: full_name.trim(),
      phone_number: phone_number || '+2348000000000',
      role: role as any,
      wallet_balance: 0,
      kyc_status: 'verified',
      tier: 3,
      referral_code: 'STAFF-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      status: 'active',
    });

    // Attach permissions
    newStaff.permissions = permissions.length > 0 ? permissions : ['customers', 'wallet', 'kyc', 'services', 'cms', 'audit'];
    db.saveDatabase();

    db.logAudit('STAFF_CREATED', {
      staffId: newStaff.id,
      email: newStaff.email,
      role: newStaff.role,
      permissions: newStaff.permissions,
    }, req.user.id, req.user.email);

    res.json({
      success: true,
      message: `Staff member ${newStaff.full_name} (${newStaff.role}) created successfully`,
      staff: newStaff,
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

  const { role, permissions, status, full_name, phone_number } = req.body;
  const updates: Partial<User> = {};

  if (role && ['admin', 'superadmin', 'customer'].includes(role)) updates.role = role as any;
  if (status && ['active', 'suspended'].includes(status)) updates.status = status as any;
  if (full_name) updates.full_name = full_name;
  if (phone_number) updates.phone_number = phone_number;
  if (permissions) updates.permissions = permissions;

  const updated = db.updateUser(staffUser.id, updates);

  db.logAudit('STAFF_UPDATED', {
    staffId: staffUser.id,
    updates,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Staff account updated',
    staff: updated,
  });
});

// -------------------------------------------------------------
// 5. SERVICE MANAGEMENT (NIN, Telecom, Digital, Store, Academy)
// -------------------------------------------------------------
adminRouter.get('/services', requireAdmin, (req, res) => {
  res.json({
    success: true,
    settings: db.data.settings,
    store_items: db.data.store_items || [],
    academy_courses: db.data.academy_courses || [],
  });
});

adminRouter.put('/services/pricing', requireAdmin, (req: any, res) => {
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

adminRouter.put('/services/providers', requireAdmin, (req: any, res) => {
  const { active_verification_provider, active_telecom_provider, active_payment_gateway } = req.body;
  const settings = db.data.settings;

  if (active_verification_provider) settings.active_verification_provider = active_verification_provider;
  if (active_telecom_provider) settings.active_telecom_provider = active_telecom_provider;
  if (active_payment_gateway) settings.active_payment_gateway = active_payment_gateway;

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
adminRouter.get('/providers', requireAdmin, (req, res) => {
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

adminRouter.post('/providers/:id/test', requireAdmin, async (req: any, res) => {
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

adminRouter.get('/providers/logs', requireAdmin, (req, res) => {
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
adminRouter.get('/services/verification', requireAdmin, (req, res) => {
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

adminRouter.put('/services/verification/:key', requireAdmin, (req: any, res) => {
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

adminRouter.post('/services/verification/sync-wholesale', requireAdmin, async (req: any, res) => {
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

// Store Items CRUD
adminRouter.post('/services/store', requireAdmin, (req: any, res) => {
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

adminRouter.put('/services/store/:id', requireAdmin, (req: any, res) => {
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

adminRouter.delete('/services/store/:id', requireAdmin, (req: any, res) => {
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
adminRouter.post('/services/academy', requireAdmin, (req: any, res) => {
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

adminRouter.put('/services/academy/:id', requireAdmin, (req: any, res) => {
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

adminRouter.delete('/services/academy/:id', requireAdmin, (req: any, res) => {
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
// 6. MANUAL FUNDING APPROVALS
// -------------------------------------------------------------
adminRouter.get('/funding/pending', requireAdmin, (req, res) => {
  const pending = db.data.transactions.filter(t => t.gateway === 'manual_transfer' && t.status === 'pending');
  res.json({
    success: true,
    pending,
  });
});

adminRouter.post('/funding/:id/approve', requireAdmin, (req: any, res) => {
  const txn = db.data.transactions.find(t => t.id === req.params.id);
  if (!txn) {
    return res.status(404).json({ error: 'Funding transaction not found' });
  }
  if (txn.status !== 'pending') {
    return res.status(400).json({ error: `Transaction is already ${txn.status}` });
  }

  const user = db.findUserById(txn.user_id);
  if (!user) {
    return res.status(404).json({ error: 'Associated customer account not found' });
  }

  // Credit customer wallet
  const oldBalance = user.wallet_balance;
  user.wallet_balance += txn.amount;
  user.updated_at = new Date().toISOString();

  // Update transaction status
  txn.status = 'successful';
  txn.balance_before = oldBalance;
  txn.balance_after = user.wallet_balance;

  db.saveDatabase();

  db.logAudit('MANUAL_FUNDING_APPROVED', {
    transactionId: txn.id,
    targetUserId: user.id,
    amount: txn.amount,
    reference: txn.reference,
    senderName: txn.metadata?.sender_name,
  }, req.user.id, req.user.email);

  db.addNotification(
    user.id,
    'Bank Transfer Payment Approved',
    `Your transfer of ₦${txn.amount.toLocaleString()} (Ref: ${txn.reference}) was verified. Wallet credited successfully.`,
    'success'
  );

  res.json({
    success: true,
    message: `Payment of ₦${txn.amount.toLocaleString()} approved. ${user.full_name}'s wallet balance updated to ₦${user.wallet_balance.toLocaleString()}.`,
    transaction: txn,
    userBalance: user.wallet_balance,
  });
});

adminRouter.post('/funding/:id/reject', requireAdmin, (req: any, res) => {
  const txn = db.data.transactions.find(t => t.id === req.params.id);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  if (txn.status !== 'pending') {
    return res.status(400).json({ error: `Transaction is already ${txn.status}` });
  }

  const { reason = 'Bank deposit could not be verified' } = req.body;
  txn.status = 'failed';
  if (!txn.metadata) txn.metadata = {};
  txn.metadata.rejection_reason = reason;

  db.saveDatabase();

  db.logAudit('MANUAL_FUNDING_REJECTED', {
    transactionId: txn.id,
    targetUserId: txn.user_id,
    reference: txn.reference,
    reason,
  }, req.user.id, req.user.email);

  db.addNotification(
    txn.user_id,
    'Payment Proof Rejected',
    `Your manual transfer proof for ₦${txn.amount.toLocaleString()} (Ref: ${txn.reference}) was declined. Reason: ${reason}`,
    'alert'
  );

  res.json({
    success: true,
    message: 'Manual funding request rejected',
    transaction: txn,
  });
});

// -------------------------------------------------------------
// 7. AUDIT LOGS
// -------------------------------------------------------------
adminRouter.get('/audit-logs', requireAdmin, (req, res) => {
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
