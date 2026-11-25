/**
 * @file paystackDvaLocal.ts
 * Express dev/preview implementation of Paystack Dedicated Virtual Accounts (DVA),
 * matching the PHP REST API contracts in WalletController.php and AdminController.php.
 */

import { db, User, VirtualAccountItem } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';

export interface DvaPolicyConfig {
  enable_paystack_dva: boolean;
  enable_virtual_accounts: boolean;
  preferred_bank: string;
  fee_bearer: 'customer' | 'merchant';
  dva_rollout_mode: 'testing_allowlist' | 'all_eligible' | 'paused';
  dva_test_user_emails: string[];
  dva_require_bvn: boolean;
  dva_auto_provision_on_register: boolean;
  dva_auto_provision_on_wallet_open: boolean;
}

export interface DvaSettlementRecord {
  id: string;
  user_id: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  paystack_reference: string;
  account_number: string;
  paystack_customer_code?: string | null;
  gross_amount: number;
  paystack_fee: number;
  customer_borne_fee: number;
  merchant_borne_fee: number;
  net_settlement_amount: number;
  net_credit_amount: number;
  fee_bearer: 'customer' | 'merchant';
  fee_confirmed: boolean;
  webhook_status: string;
  quarantine_reason?: string | null;
  reversal_transaction_id?: string | null;
  reversal_reference?: string | null;
  reversal_reason?: string | null;
  dispute_status?: string | null;
  dispute_reference?: string | null;
  sender_bank?: string | null;
  sender_account_name?: string | null;
  sender_account_number_masked?: string | null;
  settlement_status: 'settled' | 'under_review' | 'failed' | 'disputed' | 'reversed';
  settled_at?: string | null;
  reversed_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export const NIGERIAN_DVA_BANKS = [
  { name: 'Wema Bank', code: '035', slug: 'wema-bank' },
  { name: 'Titan Paystack', code: '100039', slug: 'titan-paystack' },
  { name: 'Access Bank', code: '044', slug: 'access-bank' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058', slug: 'guaranty-trust-bank' },
  { name: 'Zenith Bank', code: '057', slug: 'zenith-bank' },
  { name: 'First Bank of Nigeria', code: '011', slug: 'first-bank-of-nigeria' },
  { name: 'United Bank for Africa (UBA)', code: '033', slug: 'united-bank-for-africa' },
  { name: 'Fidelity Bank', code: '070', slug: 'fidelity-bank' },
  { name: 'Sterling Bank', code: '232', slug: 'sterling-bank' },
];

const DEFAULT_POLICY: DvaPolicyConfig = {
  enable_paystack_dva: true,
  enable_virtual_accounts: true,
  preferred_bank: 'wema-bank',
  fee_bearer: 'customer',
  dva_rollout_mode: 'all_eligible',
  dva_test_user_emails: [],
  dva_require_bvn: false,
  dva_auto_provision_on_register: false,
  dva_auto_provision_on_wallet_open: false,
};

function ensureDvaCollections() {
  const store = db.data as any;
  if (!store.dva_policy) {
    store.dva_policy = { ...DEFAULT_POLICY };
  }
  if (!Array.isArray(store.paystack_dva_settlements)) {
    store.paystack_dva_settlements = [];
  }
  if (!Array.isArray(db.data.virtual_accounts)) {
    db.data.virtual_accounts = [];
  }
  return store;
}

export function getDvaPolicy(): DvaPolicyConfig {
  const store = ensureDvaCollections();
  return {
    ...DEFAULT_POLICY,
    ...(store.dva_policy || {}),
  };
}

export function saveDvaPolicy(patch: Partial<DvaPolicyConfig> & { dva_test_user_emails?: string[] | string }): DvaPolicyConfig {
  const store = ensureDvaCollections();
  const current = getDvaPolicy();
  let allowlist = current.dva_test_user_emails;
  if (patch.dva_test_user_emails !== undefined) {
    if (Array.isArray(patch.dva_test_user_emails)) {
      allowlist = patch.dva_test_user_emails.map(e => String(e).trim().toLowerCase()).filter(Boolean);
    } else {
      allowlist = String(patch.dva_test_user_emails)
        .split(/[\s,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  const next: DvaPolicyConfig = {
    enable_paystack_dva: patch.enable_paystack_dva !== undefined ? Boolean(patch.enable_paystack_dva) : current.enable_paystack_dva,
    enable_virtual_accounts: patch.enable_virtual_accounts !== undefined ? Boolean(patch.enable_virtual_accounts) : current.enable_virtual_accounts,
    preferred_bank: patch.preferred_bank ? String(patch.preferred_bank).trim() : current.preferred_bank,
    fee_bearer: patch.fee_bearer === 'merchant' ? 'merchant' : (patch.fee_bearer === 'customer' ? 'customer' : current.fee_bearer),
    dva_rollout_mode: ['paused', 'testing_allowlist', 'all_eligible'].includes(String(patch.dva_rollout_mode))
      ? (patch.dva_rollout_mode as DvaPolicyConfig['dva_rollout_mode'])
      : current.dva_rollout_mode,
    dva_test_user_emails: allowlist,
    dva_require_bvn: patch.dva_require_bvn !== undefined ? Boolean(patch.dva_require_bvn) : current.dva_require_bvn,
    dva_auto_provision_on_register: patch.dva_auto_provision_on_register !== undefined ? Boolean(patch.dva_auto_provision_on_register) : current.dva_auto_provision_on_register,
    dva_auto_provision_on_wallet_open: patch.dva_auto_provision_on_wallet_open !== undefined ? Boolean(patch.dva_auto_provision_on_wallet_open) : current.dva_auto_provision_on_wallet_open,
  };
  store.dva_policy = next;
  db.saveDatabase();
  return next;
}

function isUserInRollout(user: User, policy: DvaPolicyConfig): boolean {
  if (!policy.enable_paystack_dva || !policy.enable_virtual_accounts) return false;
  if (policy.dva_rollout_mode === 'paused') return false;
  if (policy.dva_rollout_mode === 'testing_allowlist') {
    return policy.dva_test_user_emails.includes(user.email.toLowerCase());
  }
  return true;
}

function resolveBankMeta(slugOrCode?: string) {
  const key = String(slugOrCode || 'wema-bank').toLowerCase().trim();
  return (
    NIGERIAN_DVA_BANKS.find(b => b.slug === key || b.code === key || b.name.toLowerCase() === key) ||
    NIGERIAN_DVA_BANKS[0]
  );
}

function getExtendedVirtualAccount(userId: string): any | null {
  ensureDvaCollections();
  return (db.data.virtual_accounts || []).find(v => v.user_id === userId) || null;
}

function generateDeterministicNuban(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) % 10000000;
  }
  const suffix = String(Math.abs(hash) + 1000000).slice(0, 7).padStart(7, '0');
  return `901${suffix}`;
}

export function buildCustomerVirtualAccountState(user: User, syncPending: boolean = false) {
  const policy = getDvaPolicy();
  const paystackConfigured = Boolean(CREDENTIALS.payments.paystack.secretKey || process.env.NODE_ENV !== 'production');
  const currentLevel = Number(user.kyc_level ?? (user.kyc_status === 'verified' ? Math.max(2, user.tier || 2) : user.tier || 1));
  const requiredLevel = 2;
  const emailVerified = user.email_verified !== false;
  const hasBvn = Boolean(user.bvn && /^\d{11}$/.test(String(user.bvn).trim()));
  const inRolloutScope = isUserInRollout(user, policy);
  const existing = getExtendedVirtualAccount(user.id);

  // If sync requested on a pending account, promote cleanly to active
  if (syncPending && existing && (existing.status === 'pending' || existing.assignment_status === 'pending')) {
    existing.status = 'active';
    existing.account_status = 'active';
    existing.assignment_status = 'assigned';
    existing.provisioning_status = 'active';
    existing.kyc_validation_status = 'verified';
    existing.last_synced_at = new Date().toISOString();
    existing.updated_at = new Date().toISOString();
    db.saveDatabase();
  }

  const missing: string[] = [];
  if (!emailVerified) missing.push('Verify your email address');
  if (currentLevel < requiredLevel) missing.push('Upgrade to KYC Tier 2 (Identity Verified)');
  if (policy.dva_require_bvn && !hasBvn) missing.push('Provide your 11-digit BVN for bank compliance');

  const eligible = emailVerified && currentLevel >= requiredLevel && (!policy.dva_require_bvn || hasBvn) && inRolloutScope;

  const hasAccount = Boolean(existing && existing.account_number && existing.status !== 'closed' && existing.assignment_status !== 'deactivated');
  const status: 'active' | 'pending' | 'pending_kyc' | 'unassigned' = hasAccount
    ? (existing.status === 'pending' || existing.assignment_status === 'pending' ? 'pending' : 'active')
    : currentLevel < requiredLevel
      ? 'pending_kyc'
      : 'unassigned';

  const assignmentStatus = existing?.assignment_status || (hasAccount ? 'assigned' : 'not_requested');
  const provisioningStatus = existing?.provisioning_status || (hasAccount ? 'active' : (currentLevel < requiredLevel ? 'not_eligible' : 'eligible'));

  let message = '';
  if (hasAccount && existing) {
    message = `Dedicated ${existing.bank_name} account active. Bank transfers credit your wallet automatically.`;
  } else if (!policy.enable_paystack_dva || !policy.enable_virtual_accounts) {
    message = 'Dedicated Virtual Accounts are currently paused by platform administration.';
  } else if (!inRolloutScope) {
    message = 'Dedicated Virtual Accounts are currently enabled for allowlisted accounts during rollout.';
  } else if (!eligible) {
    message = `Complete requirements to unlock your Paystack Dedicated Account: ${missing.join(', ')}.`;
  } else {
    message = 'Your account is eligible for a Paystack Dedicated Virtual Account. Click Request Dedicated Bank Account to generate yours.';
  }

  return {
    success: true,
    has_virtual_account: hasAccount,
    dva_enabled: policy.enable_paystack_dva && policy.enable_virtual_accounts,
    dva_feature_enabled: policy.enable_paystack_dva && policy.enable_virtual_accounts,
    rollout_mode: policy.dva_rollout_mode,
    in_rollout_scope: inRolloutScope,
    paystack_configured: paystackConfigured,
    eligible,
    email_verified: emailVerified,
    has_bvn: hasBvn,
    require_bvn: policy.dva_require_bvn,
    dva_consent: Boolean(existing?.dva_consent ?? (user as any).dva_consent ?? false),
    missing_requirements: missing,
    required_level: requiredLevel,
    current_level: currentLevel,
    status,
    assignment_status: assignmentStatus,
    provisioning_status: provisioningStatus,
    kyc_validation_status: existing?.kyc_validation_status || (currentLevel >= 2 ? 'verified' : 'unverified'),
    error_code: existing?.error_code || null,
    failure_reason: existing?.failure_reason || null,
    assigned_at: existing?.assigned_at || null,
    last_synced_at: existing?.last_synced_at || null,
    fee_bearer: policy.fee_bearer,
    preferred_bank: policy.preferred_bank,
    virtual_account: hasAccount ? (existing as VirtualAccountItem) : null,
    account_number: hasAccount ? existing.account_number : null,
    account_name: hasAccount ? existing.account_name : null,
    bank_name: hasAccount ? existing.bank_name : null,
    message,
  };
}

export function provisionCustomerVirtualAccount(
  user: User,
  payload: {
    preferred_bank?: string;
    dva_consent?: boolean;
    bvn?: string;
    bank_code?: string;
    account_number?: string;
    force_retry?: boolean;
  } = {}
) {
  ensureDvaCollections();
  const policy = getDvaPolicy();

  if (!policy.enable_paystack_dva || !policy.enable_virtual_accounts || policy.dva_rollout_mode === 'paused') {
    throw new Error('Dedicated Virtual Account provisioning is temporarily paused by administration.');
  }
  if (!isUserInRollout(user, policy)) {
    throw new Error('Your account is not yet included in the current Paystack DVA rollout scope.');
  }
  if (user.email_verified === false) {
    throw new Error('Please verify your email address before requesting a Dedicated Virtual Account.');
  }

  const currentLevel = Number(user.kyc_level ?? (user.kyc_status === 'verified' ? Math.max(2, user.tier || 2) : user.tier || 1));
  if (currentLevel < 2) {
    throw new Error('Dedicated Virtual Accounts require KYC Tier 2 verification. Complete KYC verification first.');
  }

  if (payload.bvn && /^\d{11}$/.test(String(payload.bvn).trim())) {
    db.updateUser(user.id, { bvn: String(payload.bvn).trim() });
    user.bvn = String(payload.bvn).trim();
  }

  const hasBvn = Boolean(user.bvn && /^\d{11}$/.test(String(user.bvn).trim()));
  if (policy.dva_require_bvn && !hasBvn) {
    throw new Error('An 11-digit BVN is required before Paystack can issue your Dedicated Virtual Account.');
  }

  const existing = getExtendedVirtualAccount(user.id);
  const consentGiven = Boolean(payload.dva_consent ?? existing?.dva_consent ?? (user as any).dva_consent ?? false);
  if (!consentGiven) {
    throw new Error('Please confirm authorization for Paystack to assign a Dedicated Virtual Account.');
  }

  if (existing && existing.status === 'active' && existing.assignment_status === 'assigned' && !payload.force_retry) {
    const state = buildCustomerVirtualAccountState(user, false);
    return {
      ...state,
      message: `Your Paystack Dedicated Account (${existing.bank_name} — ${existing.account_number}) is already active.`,
    };
  }

  const bankMeta = resolveBankMeta(payload.preferred_bank || payload.bank_code || policy.preferred_bank);
  const nowIso = new Date().toISOString();
  const accountNumber = existing?.account_number || generateDeterministicNuban(user.id);
  const accountName = `HAMBAK/${user.full_name.toUpperCase()}`;
  const paystackCustomerCode = existing?.paystack_customer_code || `CUS_${user.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
  const dedicatedAccountId = existing?.dedicated_account_id || (100000 + Math.floor(Math.random() * 899999));

  const record: any = {
    id: existing?.id || `va_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    user_id: user.id,
    account_number: accountNumber,
    account_name: accountName,
    bank_name: bankMeta.name,
    bank_code: bankMeta.code,
    bank_slug: bankMeta.slug,
    dedicated_account_id: dedicatedAccountId,
    paystack_customer_code: paystackCustomerCode,
    currency: 'NGN',
    provider: 'paystack',
    status: 'active',
    account_status: 'active',
    assignment_status: 'assigned',
    provisioning_status: 'active',
    kyc_validation_status: 'verified',
    dva_consent: true,
    assigned_at: existing?.assigned_at || nowIso,
    last_synced_at: nowIso,
    total_inflow: existing?.total_inflow || 0,
    last_funding_at: existing?.last_funding_at || null,
    created_at: existing?.created_at || nowIso,
    updated_at: nowIso,
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    db.data.virtual_accounts!.unshift(record);
  }

  (user as any).dva_consent = true;
  user.virtual_account = {
    status: 'active',
    account_number: record.account_number,
    account_name: record.account_name,
    bank_name: record.bank_name,
    bank_code: record.bank_code,
    provider: 'paystack',
    assigned_at: record.assigned_at,
  };
  db.saveDatabase();

  db.logAudit('PAYSTACK_DVA_ASSIGNED', {
    userId: user.id,
    bank: bankMeta.name,
    accountNumber: record.account_number,
    paystackCustomerCode,
  }, user.id, user.email);

  db.addNotification(
    user.id,
    'Dedicated Bank Account Assigned',
    `Your Paystack Dedicated Account (${bankMeta.name} - ${record.account_number}) is now active for instant wallet funding.`,
    'success'
  );

  const state = buildCustomerVirtualAccountState(user, false);
  return {
    ...state,
    message: `Your Paystack Dedicated Account (${bankMeta.name} — ${record.account_number}) has been assigned and activated.`,
  };
}

export function getAdminDvaStatus(query: any = {}) {
  const store = ensureDvaCollections();
  const policy = getDvaPolicy();
  const accountsRaw: any[] = db.data.virtual_accounts || [];
  const settlementsRaw: DvaSettlementRecord[] = store.paystack_dva_settlements || [];
  const users = db.data.users || [];

  const enrichedAccounts = accountsRaw.map(acc => {
    const owner = users.find(u => u.id === acc.user_id);
    const accSettlements = settlementsRaw.filter(s => s.user_id === acc.user_id);
    return {
      id: acc.id,
      user_id: acc.user_id,
      customer_name: owner?.full_name || acc.account_name || 'Customer',
      customer_email: owner?.email || '',
      kyc_level: owner ? Number(owner.kyc_level ?? owner.tier ?? 1) : 1,
      kyc_status: owner?.kyc_status || 'unverified',
      provider: acc.provider || 'paystack',
      paystack_customer_code: acc.paystack_customer_code || null,
      dedicated_account_id: acc.dedicated_account_id || null,
      account_number: acc.account_number,
      account_name: acc.account_name || owner?.full_name || null,
      bank_name: acc.bank_name,
      bank_slug: acc.bank_slug || null,
      bank_code: acc.bank_code || null,
      account_status: acc.account_status || acc.status || 'active',
      kyc_validation_status: acc.kyc_validation_status || 'verified',
      assignment_status: acc.assignment_status || 'assigned',
      provisioning_status: acc.provisioning_status || (acc.status === 'suspended' ? 'suspended' : acc.status === 'closed' ? 'deactivated' : 'active'),
      dva_consent: Boolean(acc.dva_consent ?? true),
      error_code: acc.error_code || null,
      failure_reason: acc.failure_reason || null,
      deposits_count: accSettlements.length,
      total_inflow: Number(acc.total_inflow || 0),
      assigned_at: acc.assigned_at || acc.created_at || null,
      last_synced_at: acc.last_synced_at || null,
      last_funding_at: acc.last_funding_at || null,
      last_deposit_at: acc.last_funding_at || null,
      created_at: acc.created_at || acc.assigned_at || new Date().toISOString(),
      updated_at: acc.updated_at || acc.last_synced_at || acc.assigned_at || new Date().toISOString(),
    };
  });

  // Apply search/status filters if provided
  const search = String(query.search || '').trim().toLowerCase();
  const statusFilter = String(query.status || '').trim().toLowerCase();
  const bankFilter = String(query.bank || '').trim().toLowerCase();

  let filteredAccounts = enrichedAccounts;
  if (search) {
    filteredAccounts = filteredAccounts.filter(a =>
      a.customer_name.toLowerCase().includes(search) ||
      a.customer_email.toLowerCase().includes(search) ||
      a.account_number.toLowerCase().includes(search)
    );
  }
  if (statusFilter && statusFilter !== 'all') {
    filteredAccounts = filteredAccounts.filter(a =>
      String(a.account_status).toLowerCase() === statusFilter ||
      String(a.provisioning_status).toLowerCase() === statusFilter
    );
  }
  if (bankFilter && bankFilter !== 'all') {
    filteredAccounts = filteredAccounts.filter(a =>
      String(a.bank_slug || a.bank_name).toLowerCase().includes(bankFilter)
    );
  }

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
  const totalAcc = filteredAccounts.length;
  const pagedAccounts = filteredAccounts.slice((page - 1) * limit, page * limit);

  const txPage = Math.max(1, Number(query.tx_page || 1));
  const txLimit = Math.max(1, Math.min(100, Number(query.tx_limit || 20)));
  const pagedSettlements = settlementsRaw.slice((txPage - 1) * txLimit, txPage * txLimit);

  const settled = settlementsRaw.filter(s => s.settlement_status === 'settled');
  const underReview = settlementsRaw.filter(s => s.settlement_status === 'under_review');
  const disputed = settlementsRaw.filter(s => s.settlement_status === 'disputed');
  const reversed = settlementsRaw.filter(s => s.settlement_status === 'reversed');
  const failed = settlementsRaw.filter(s => s.settlement_status === 'failed');

  const totalGross = settled.reduce((s, r) => s + r.gross_amount, 0);
  const totalFees = settled.reduce((s, r) => s + r.paystack_fee, 0);
  const customerFees = settled.reduce((s, r) => s + r.customer_borne_fee, 0);
  const merchantFees = settled.reduce((s, r) => s + r.merchant_borne_fee, 0);
  const netCredited = settled.reduce((s, r) => s + r.net_credit_amount, 0);
  const netSettlement = settled.reduce((s, r) => s + r.net_settlement_amount, 0);

  return {
    success: true,
    last_successful_webhook_at: settled[0]?.settled_at || null,
    capability: {
      configured: Boolean(CREDENTIALS.payments.paystack.secretKey),
      capable: true,
      status_code: 200,
      reason: CREDENTIALS.payments.paystack.secretKey ? 'paystack_live_configured' : 'sandbox_preview_ready',
      message: CREDENTIALS.payments.paystack.secretKey
        ? 'Paystack Dedicated Virtual Account API configured and ready.'
        : 'Preview container active with simulated Paystack DVA provisioning.',
      providers: NIGERIAN_DVA_BANKS.slice(0, 2).map((b, idx) => ({
        id: idx + 1,
        provider_slug: b.slug,
        bank_id: idx + 1,
        bank_name: b.name,
      })),
    },
    policy,
    totals: {
      eligible_customers_count: users.filter(u => (u.tier || 1) >= 2 && u.email_verified !== false).length,
      assigned_accounts: enrichedAccounts.filter(a => a.assignment_status === 'assigned').length,
      active_accounts: enrichedAccounts.filter(a => a.account_status === 'active').length,
      pending_accounts: enrichedAccounts.filter(a => a.account_status === 'pending' || a.assignment_status === 'pending').length,
      awaiting_info_accounts: enrichedAccounts.filter(a => a.provisioning_status === 'awaiting_info').length,
      suspended_accounts: enrichedAccounts.filter(a => a.account_status === 'suspended' || a.provisioning_status === 'suspended').length,
      deactivated_accounts: enrichedAccounts.filter(a => a.assignment_status === 'deactivated' || a.provisioning_status === 'deactivated').length,
      under_review_accounts: enrichedAccounts.filter(a => a.provisioning_status === 'under_review').length,
      failed_accounts: enrichedAccounts.filter(a => a.assignment_status === 'failed').length,
      settled_count: settled.length,
      under_review_count: underReview.length,
      disputed_count: disputed.length,
      reversed_count: reversed.length,
      reversed_disputed_count: disputed.length + reversed.length,
      failed_settlement_count: failed.length,
      total_gross: totalGross,
      total_paystack_fees: totalFees,
      customer_borne_fees: customerFees,
      merchant_borne_fees: merchantFees,
      net_settlement: netSettlement,
      total_net_credited: netCredited,
      wallet_liability_created: netCredited,
      under_review_amount: underReview.reduce((s, r) => s + r.gross_amount, 0),
      reversed_amount: reversed.reduce((s, r) => s + r.gross_amount, 0),
      reversed_disputed_amount: disputed.concat(reversed).reduce((s, r) => s + r.gross_amount, 0),
    },
    reconciliation: {
      gross_deposits: totalGross,
      customer_borne_fees: customerFees,
      merchant_borne_fees: merchantFees,
      total_paystack_fees: totalFees,
      net_settlement: netSettlement,
      wallet_liability_created: netCredited,
      quarantined_count: underReview.length,
      quarantined_amount: underReview.reduce((s, r) => s + r.gross_amount, 0),
      disputed_count: disputed.length,
      reversed_count: reversed.length,
      reversed_amount: reversed.reduce((s, r) => s + r.gross_amount, 0),
    },
    accounts: pagedAccounts,
    accounts_pagination: {
      page,
      limit,
      total: totalAcc,
      total_pages: Math.max(1, Math.ceil(totalAcc / limit)),
    },
    settlements: pagedSettlements,
    settlements_pagination: {
      page: txPage,
      limit: txLimit,
      total: settlementsRaw.length,
      total_pages: Math.max(1, Math.ceil(settlementsRaw.length / txLimit)),
    },
    unmatched_settlements: underReview,
  };
}

export function getAdminDvaCustomerDetail(userId: string) {
  const user = db.findUserById(userId);
  if (!user) return null;
  const status = getAdminDvaStatus({ limit: 100 });
  const account = status.accounts.find(a => a.user_id === userId) || null;
  const store = ensureDvaCollections();
  const deposits = (store.paystack_dva_settlements || []).filter((s: DvaSettlementRecord) => s.user_id === userId);
  const hasBvn = Boolean(user.bvn && /^\d{11}$/.test(String(user.bvn).trim()));

  const history = (db.data.audit_logs || [])
    .filter(l => l.user_id === userId && String(l.action).includes('DVA'))
    .slice(0, 20)
    .map(l => ({
      id: l.id,
      source: 'audit_log' as const,
      action: l.action,
      actor: l.user_email || 'System',
      status: 'logged',
      details: l.details || {},
      created_at: l.created_at,
    }));

  return {
    success: true,
    customer: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      status: user.status,
      kyc_status: user.kyc_status,
      kyc_level: Number(user.kyc_level ?? user.tier ?? 1),
      email_verified: user.email_verified !== false,
      wallet_balance: user.wallet_balance,
      has_bvn: hasBvn,
      bvn_last4: hasBvn ? String(user.bvn).slice(-4) : null,
      dva_consent: Boolean((user as any).dva_consent ?? account?.dva_consent ?? false),
      created_at: user.created_at,
    },
    virtual_account: account,
    deposits,
    history,
  };
}

export function requeryAdminDva(userId: string, actor?: User) {
  const user = db.findUserById(userId);
  if (!user) throw new Error('Customer not found');
  const existing = getExtendedVirtualAccount(userId);
  if (!existing) {
    throw new Error('Customer does not have an assigned or pending Paystack Dedicated Account yet.');
  }
  existing.last_synced_at = new Date().toISOString();
  existing.updated_at = new Date().toISOString();
  if (existing.status === 'pending') {
    existing.status = 'active';
    existing.account_status = 'active';
    existing.assignment_status = 'assigned';
    existing.provisioning_status = 'active';
  }
  db.saveDatabase();
  db.logAudit('ADMIN_DVA_REQUERY', { userId, accountNumber: existing.account_number }, actor?.id, actor?.email);
  return {
    success: true,
    message: `Paystack DVA status synchronized for ${user.full_name} (${existing.account_number}).`,
    account: existing,
  };
}

export function performAdminDvaAction(
  userId: string,
  action: 'provision' | 'suspend' | 'reactivate' | 'deactivate' | 'mark_under_review',
  reason?: string,
  actor?: User
) {
  const user = db.findUserById(userId);
  if (!user) throw new Error('Customer not found');

  if (action === 'provision') {
    const res = provisionCustomerVirtualAccount(user, { dva_consent: true, force_retry: true });
    db.logAudit('ADMIN_DVA_PROVISIONED', { userId, reason }, actor?.id, actor?.email);
    return {
      success: true,
      message: res.message,
      account: res.virtual_account,
    };
  }

  const existing = getExtendedVirtualAccount(userId);
  if (!existing) {
    throw new Error('No Dedicated Virtual Account record found for this customer.');
  }

  const nowIso = new Date().toISOString();
  if (action === 'suspend') {
    existing.status = 'suspended';
    existing.account_status = 'suspended';
    existing.provisioning_status = 'suspended';
    existing.failure_reason = reason || 'Suspended by administrator';
  } else if (action === 'reactivate') {
    existing.status = 'active';
    existing.account_status = 'active';
    existing.assignment_status = 'assigned';
    existing.provisioning_status = 'active';
    existing.failure_reason = null;
  } else if (action === 'deactivate') {
    existing.status = 'closed';
    existing.account_status = 'deactivated';
    existing.assignment_status = 'deactivated';
    existing.provisioning_status = 'deactivated';
    existing.failure_reason = reason || 'Deactivated by administrator';
  } else if (action === 'mark_under_review') {
    existing.provisioning_status = 'under_review';
    existing.failure_reason = reason || 'Flagged for compliance review';
  }
  existing.updated_at = nowIso;
  if (user.virtual_account) {
    user.virtual_account.status = existing.status;
  }
  db.saveDatabase();
  db.logAudit(`ADMIN_DVA_${action.toUpperCase()}`, { userId, reason }, actor?.id, actor?.email);

  return {
    success: true,
    message: `Dedicated account ${action.replace('_', ' ')} completed for ${user.full_name}.`,
    account: existing,
  };
}

export function resolveAdminDvaSettlement(
  settlementId: string,
  action: 'reverify' | 'mark_failed' | 'verified_attribute',
  reason?: string,
  extra?: { target_user_id?: string; confirm_verified_attribution?: boolean },
  actor?: User
) {
  const store = ensureDvaCollections();
  const settlement: DvaSettlementRecord | undefined = store.paystack_dva_settlements.find((s: DvaSettlementRecord) => s.id === settlementId);
  if (!settlement) {
    throw new Error('DVA settlement record not found');
  }

  const nowIso = new Date().toISOString();
  if (action === 'mark_failed') {
    settlement.settlement_status = 'failed';
    settlement.quarantine_reason = reason || 'Marked failed by admin';
    settlement.resolved_at = nowIso;
  } else if (action === 'reverify' || action === 'verified_attribute') {
    if (action === 'verified_attribute' && extra?.target_user_id) {
      if (!extra.confirm_verified_attribution) {
        throw new Error('Explicit attribution confirmation is required.');
      }
      settlement.user_id = extra.target_user_id;
    }
    if (settlement.settlement_status !== 'settled' && settlement.user_id) {
      const targetUser = db.findUserById(settlement.user_id);
      if (targetUser) {
        db.adjustBalance(
          targetUser.id,
          settlement.net_credit_amount,
          'funding',
          `Paystack DVA Settlement (${settlement.paystack_reference})`,
          'paystack',
          { funding_method: 'paystack_dva', settlement_id: settlement.id, gross_amount: settlement.gross_amount }
        );
      }
    }
    settlement.settlement_status = 'settled';
    settlement.settled_at = nowIso;
    settlement.resolved_at = nowIso;
  }

  db.saveDatabase();
  db.logAudit('ADMIN_DVA_SETTLEMENT_RESOLVED', { settlementId, action, reason }, actor?.id, actor?.email);

  return {
    success: true,
    message: `Settlement ${settlement.paystack_reference} updated (${settlement.settlement_status}).`,
    status: settlement.settlement_status,
    settlement,
  };
}
