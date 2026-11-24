import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  Search,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Eye,
  X,
  Users,
  ArrowDownLeft,
  Sliders,
  Clock,
  Ban,
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Lock,
  Loader2,
  History,
  FileWarning,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  PaystackDvaAdminStatusResponse,
  PaystackDvaCustomerDetailResponse,
} from '../../types';

type DvaSubTab = 'directory' | 'deposits' | 'unmatched' | 'controls';

const fmtNaira = (val: number | undefined | null) =>
  `₦${Number(val || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (val?: string | null) => {
  if (!val) return '—';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? val : d.toLocaleString();
};

export function PaystackDvaManagement() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin' || (Array.isArray(user?.permissions) && user.permissions.includes('*'));

  const [subTab, setSubTab] = useState<DvaSubTab>('directory');
  const [data, setData] = useState<PaystackDvaAdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Directory filters & pagination
  const [dirSearch, setDirSearch] = useState('');
  const [dirStatus, setDirStatus] = useState('all');
  const [dirKyc, setDirKyc] = useState('all');
  const [dirPage, setDirPage] = useState(1);

  // Deposits filters & pagination
  const [txCustomer, setTxCustomer] = useState('');
  const [txRef, setTxRef] = useState('');
  const [txStatus, setTxStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [txPage, setTxPage] = useState(1);

  // Action states
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Customer detail modal
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<PaystackDvaCustomerDetailResponse | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  // Reason / Deactivate / Mark Failed modal
  const [reasonModal, setReasonModal] = useState<{
    mode: 'deactivate' | 'suspend' | 'mark_failed';
    userId?: string;
    customerLabel?: string;
    settlementId?: string;
    reference?: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');

  // SuperAdmin Verified Attribution modal (strictly guarded)
  const [attrModal, setAttrModal] = useState<{
    settlementId: string;
    reference: string;
    grossAmount: number;
    accountNumber: string;
  } | null>(null);
  const [attrUserId, setAttrUserId] = useState('');
  const [attrEvidence, setAttrEvidence] = useState('');
  const [attrConfirm, setAttrConfirm] = useState(false);

  // Gateway & DVA controls form state (SuperAdmin editable)
  const [policyForm, setPolicyForm] = useState({
    enable_paystack_dva: false,
    preferred_bank: 'wema-bank',
    fee_bearer: 'customer' as 'customer' | 'merchant',
    dva_rollout_mode: 'paused' as 'paused' | 'testing_allowlist' | 'all_eligible',
    dva_test_user_emails: '',
    dva_require_bvn: true,
    dva_auto_provision_on_register: true,
    dva_auto_provision_on_wallet_open: true,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadData = useCallback(async (syncForm = false) => {
    setLoading(true);
    try {
      const res = await api.getAdminPaystackDvaStatus({
        search: dirSearch.trim() || undefined,
        status: dirStatus !== 'all' ? dirStatus : undefined,
        kyc_status: dirKyc !== 'all' ? dirKyc : undefined,
        page: dirPage,
        limit: 15,
        tx_customer: txCustomer.trim() || undefined,
        tx_reference: txRef.trim() || undefined,
        tx_status: txStatus !== 'all' ? txStatus : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        tx_page: txPage,
        tx_limit: 20,
      });
      setData(res);
      if (syncForm && res.policy) {
        const rawEmails = Array.isArray(res.policy.dva_test_user_emails)
          ? res.policy.dva_test_user_emails.join(', ')
          : String(res.policy.dva_test_user_emails || '');
        setPolicyForm({
          enable_paystack_dva: Boolean(res.policy.enable_paystack_dva),
          preferred_bank: res.policy.preferred_bank || 'wema-bank',
          fee_bearer: res.policy.fee_bearer === 'merchant' ? 'merchant' : 'customer',
          dva_rollout_mode: (res.policy.dva_rollout_mode as any) || 'paused',
          dva_test_user_emails: rawEmails,
          dva_require_bvn: res.policy.dva_require_bvn !== false,
          dva_auto_provision_on_register: res.policy.dva_auto_provision_on_register !== false,
          dva_auto_provision_on_wallet_open: res.policy.dva_auto_provision_on_wallet_open !== false,
        });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load Paystack DVA management data.' });
    } finally {
      setLoading(false);
    }
  }, [dirSearch, dirStatus, dirKyc, dirPage, txCustomer, txRef, txStatus, dateFrom, dateTo, txPage]);

  useEffect(() => {
    loadData(true);
  }, [dirPage, dirStatus, dirKyc, txPage, txStatus]);

  const openCustomerDetail = async (userId: string) => {
    setDetailUserId(userId);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await api.getAdminPaystackDvaCustomerDetail(userId);
      setDetailData(res);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Unable to fetch customer DVA details.' });
      setDetailUserId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSyncCustomer = async (userId: string) => {
    setBusyKey(`sync:${userId}`);
    setFeedback(null);
    try {
      const res = await api.requeryAdminPaystackDva(userId);
      setFeedback({ type: 'success', text: res.message || 'Customer DVA status synced from Paystack.' });
      await loadData(false);
      if (detailUserId === userId) {
        await openCustomerDetail(userId);
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Paystack status sync failed.' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAccountAction = async (
    userId: string,
    action: 'provision' | 'suspend' | 'reactivate' | 'deactivate',
    reason?: string
  ) => {
    setBusyKey(`${action}:${userId}`);
    setFeedback(null);
    try {
      const res = await api.adminPaystackDvaAction(userId, action, reason);
      setFeedback({ type: 'success', text: res.message || `Account updated (${action}).` });
      await loadData(false);
      if (detailUserId === userId) {
        await openCustomerDetail(userId);
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || `Failed to ${action} dedicated account.` });
    } finally {
      setBusyKey(null);
    }
  };

  const handleReverifySettlement = async (settlementId: string) => {
    setBusyKey(`reverify:${settlementId}`);
    setFeedback(null);
    try {
      const res = await api.resolvePaystackDvaSettlement(settlementId, 'reverify');
      setFeedback({ type: 'success', text: res.message || `Verification status: ${res.status || 'completed'}.` });
      await loadData(false);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Paystack settlement re-verification failed.' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSubmitReasonModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    const cleanReason = reasonText.trim();
    if (cleanReason.length < 5) {
      setFeedback({ type: 'error', text: 'Please enter a clear reason (minimum 5 characters).' });
      return;
    }
    if (reasonModal.mode === 'mark_failed' && reasonModal.settlementId) {
      setBusyKey(`fail:${reasonModal.settlementId}`);
      try {
        const res = await api.resolvePaystackDvaSettlement(reasonModal.settlementId, 'mark_failed', cleanReason);
        setFeedback({ type: 'success', text: res.message || 'Unmatched record marked as failed.' });
        setReasonModal(null);
        setReasonText('');
        await loadData(false);
      } catch (err: any) {
        setFeedback({ type: 'error', text: err?.message || 'Unable to mark record failed.' });
      } finally {
        setBusyKey(null);
      }
      return;
    }
    if ((reasonModal.mode === 'deactivate' || reasonModal.mode === 'suspend') && reasonModal.userId) {
      const action = reasonModal.mode;
      const uid = reasonModal.userId;
      setReasonModal(null);
      setReasonText('');
      await handleAccountAction(uid, action, cleanReason);
    }
  };

  const handleSubmitVerifiedAttribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attrModal || !isSuperAdmin) return;
    if (!attrUserId.trim() || attrEvidence.trim().length < 15 || !attrConfirm) {
      setFeedback({
        type: 'error',
        text: 'Customer ID, minimum 15-character written investigation evidence, and explicit confirmation are required.',
      });
      return;
    }
    setBusyKey(`attr:${attrModal.settlementId}`);
    setFeedback(null);
    try {
      const res = await api.resolvePaystackDvaSettlement(
        attrModal.settlementId,
        'verified_attribute',
        attrEvidence.trim(),
        {
          target_user_id: attrUserId.trim(),
          confirm_verified_attribution: true,
        }
      );
      setFeedback({ type: 'success', text: res.message || 'Verified Paystack deposit credited with audit log.' });
      setAttrModal(null);
      setAttrUserId('');
      setAttrEvidence('');
      setAttrConfirm(false);
      await loadData(false);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'SuperAdmin verified attribution failed.' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setSavingPolicy(true);
    setFeedback(null);
    try {
      const res = await api.saveAdminPaystackDvaSettings({
        enable_paystack_dva: policyForm.enable_paystack_dva,
        enable_virtual_accounts: policyForm.enable_paystack_dva,
        preferred_bank: policyForm.preferred_bank,
        fee_bearer: policyForm.fee_bearer,
        dva_rollout_mode: policyForm.dva_rollout_mode,
        dva_test_user_emails: policyForm.dva_test_user_emails,
        dva_require_bvn: policyForm.dva_require_bvn,
        dva_auto_provision_on_register: policyForm.dva_auto_provision_on_register,
        dva_auto_provision_on_wallet_open: policyForm.dva_auto_provision_on_wallet_open,
      });
      setFeedback({ type: 'success', text: res.message || 'Paystack DVA settings updated.' });
      await loadData(true);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to save Paystack DVA settings.' });
    } finally {
      setSavingPolicy(false);
    }
  };

  const totals = data?.totals;
  const unmatchedList = data?.unmatched_settlements || [];
  const reversedDisputedCount = totals?.reversed_disputed_count ?? ((totals?.disputed_count || 0) + (totals?.reversed_count || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight uppercase">
                Paystack Virtual Account Management
              </h2>
              <p className="text-xs text-slate-400">
                Dedicated Virtual Account provisioning, webhook settlement monitoring, quarantine investigation &amp; policy controls
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                data?.capability?.capable ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              Paystack DVA: {data?.policy?.enable_paystack_dva ? 'Enabled' : 'Disabled'} ({data?.policy?.dva_rollout_mode || 'paused'})
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Last Webhook: {fmtDate(data?.last_successful_webhook_at)}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Live Data</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Admin Overview Metrics (11 live database metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Eligible Customers</div>
          <div className="text-xl font-black font-mono text-white mt-1">
            {totals?.eligible_customers_count ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Verified &amp; Tier 2+</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Active Accounts</div>
          <div className="text-xl font-black font-mono text-emerald-400 mt-1">
            {totals?.active_accounts ?? totals?.assigned_accounts ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Live assigned DVAs</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Pending Assignments</div>
          <div className="text-xl font-black font-mono text-amber-400 mt-1">
            {totals?.pending_accounts ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Processing / ID check</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Failed Assignments</div>
          <div className="text-xl font-black font-mono text-rose-400 mt-1">
            {totals?.failed_accounts ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Needs retry / info</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Successful Deposits</div>
          <div className="text-xl font-black font-mono text-sky-400 mt-1">
            {totals?.settled_count ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Settled transfers</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Quarantined / Unmatched</div>
          <div className="text-xl font-black font-mono text-amber-300 mt-1">
            {totals?.under_review_count ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {fmtNaira(totals?.under_review_amount)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 sm:col-span-2 lg:col-span-2">
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Gross DVA Deposits</div>
          <div className="text-xl font-black font-mono text-white mt-1">
            {fmtNaira(totals?.total_gross)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Settled + disputed gross transfer volume</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Paystack DVA Fees</div>
          <div className="text-xl font-black font-mono text-rose-300 mt-1">
            {fmtNaira(totals?.total_paystack_fees)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            Cust: {fmtNaira(totals?.customer_borne_fees)} &bull; Merch: {fmtNaira(totals?.merchant_borne_fees)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Net DVA Settlements</div>
          <div className="text-xl font-black font-mono text-emerald-300 mt-1">
            {fmtNaira(totals?.net_settlement)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Gross minus Paystack fees</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Wallet Credits (DVA)</div>
          <div className="text-xl font-black font-mono text-indigo-400 mt-1">
            {fmtNaira(totals?.total_net_credited ?? totals?.wallet_liability_created)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Single ledger credits issued</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Reversed / Disputed</div>
          <div className="text-xl font-black font-mono text-rose-400 mt-1">
            {reversedDisputedCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {fmtNaira(totals?.reversed_disputed_amount ?? totals?.reversed_amount)}
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'directory' as DvaSubTab, label: 'Customer Virtual Account Directory', icon: Users, count: data?.accounts_pagination?.total },
          { id: 'deposits' as DvaSubTab, label: 'DVA Deposit Monitoring', icon: ArrowDownLeft, count: data?.settlements_pagination?.total },
          { id: 'unmatched' as DvaSubTab, label: 'Unmatched & Disputed Queue', icon: AlertTriangle, count: unmatchedList.length },
          { id: 'controls' as DvaSubTab, label: 'Gateway & DVA Controls', icon: Sliders },
        ].map(tab => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                active
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${active ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-300'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Customer Virtual Account Directory */}
      {subTab === 'directory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 justify-between">
            <form
              onSubmit={e => {
                e.preventDefault();
                setDirPage(1);
                loadData(false);
              }}
              className="flex flex-wrap gap-2 flex-1"
            >
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={dirSearch}
                  onChange={e => setDirSearch(e.target.value)}
                  placeholder="Search name, email, customer ID, account #, bank..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <select
                value={dirStatus}
                onChange={e => {
                  setDirStatus(e.target.value);
                  setDirPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All Account Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending / Processing</option>
                <option value="awaiting_customer_info">Awaiting Info</option>
                <option value="failed">Failed</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
                <option value="under_review">Under Review</option>
              </select>
              <select
                value={dirKyc}
                onChange={e => {
                  setDirKyc(e.target.value);
                  setDirPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All KYC Statuses</option>
                <option value="verified">KYC Verified</option>
                <option value="pending">KYC Pending</option>
                <option value="unverified">KYC Unverified</option>
                <option value="failed">KYC Failed</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                Search
              </button>
            </form>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-3.5 py-3">Customer</th>
                  <th className="px-3.5 py-3">Account Number &amp; Bank</th>
                  <th className="px-3.5 py-3">Account Name</th>
                  <th className="px-3.5 py-3">Account Status</th>
                  <th className="px-3.5 py-3">KYC Status</th>
                  <th className="px-3.5 py-3">Date Assigned</th>
                  <th className="px-3.5 py-3 text-right">Total Deposits</th>
                  <th className="px-3.5 py-3">Last Deposit</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {!data?.accounts?.length ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      {loading ? 'Loading virtual accounts...' : 'No dedicated virtual accounts matched the current filters.'}
                    </td>
                  </tr>
                ) : (
                  data.accounts.map(acc => {
                    const prov = acc.provisioning_status || (acc.assignment_status === 'assigned' && acc.account_status === 'active' ? 'active' : acc.assignment_status);
                    const canRetry = ['failed', 'awaiting_customer_info', 'not_requested'].includes(prov);
                    return (
                      <tr key={acc.id} className="hover:bg-slate-800/40">
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-white">{acc.customer_name || 'Customer'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{acc.customer_email || '—'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">ID: {acc.user_id}</div>
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="font-mono font-bold text-emerald-400">
                            {acc.account_number || <span className="text-amber-400">Pending</span>}
                          </div>
                          <div className="text-[11px] text-slate-300">{acc.bank_name || '—'}</div>
                        </td>
                        <td className="px-3.5 py-3 text-slate-300 max-w-[170px] truncate" title={acc.account_name || ''}>
                          {acc.account_name || '—'}
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              prov === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : prov === 'processing' || prov === 'pending_identification'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : prov === 'awaiting_customer_info' || prov === 'under_review'
                                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {String(prov).replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="text-[11px] font-semibold capitalize text-slate-200">
                            {acc.kyc_status || acc.kyc_validation_status || 'unverified'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">Tier {acc.kyc_level || 1}</div>
                        </td>
                        <td className="px-3.5 py-3 text-[11px] font-mono text-slate-400 whitespace-nowrap">
                          {fmtDate(acc.assigned_at)}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="font-mono font-bold text-white">{fmtNaira(acc.total_inflow)}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{acc.deposits_count || 0} deposit(s)</div>
                        </td>
                        <td className="px-3.5 py-3 text-[11px] font-mono text-slate-400 whitespace-nowrap">
                          {fmtDate(acc.last_deposit_at || acc.last_funding_at)}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCustomerDetail(acc.user_id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1"
                              title="View Account Details"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSyncCustomer(acc.user_id)}
                              disabled={busyKey === `sync:${acc.user_id}`}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1"
                              title="Sync from Paystack"
                            >
                              <RefreshCw className={`w-3 h-3 ${busyKey === `sync:${acc.user_id}` ? 'animate-spin' : ''}`} />
                              <span>Sync</span>
                            </button>
                            {canRetry && (
                              <button
                                type="button"
                                onClick={() => handleAccountAction(acc.user_id, 'provision')}
                                disabled={busyKey === `provision:${acc.user_id}`}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Retry</span>
                              </button>
                            )}
                            {prov === 'active' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReasonText('');
                                  setReasonModal({ mode: 'suspend', userId: acc.user_id, customerLabel: acc.customer_name || acc.user_id });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <Pause className="w-3 h-3" />
                                <span>Suspend</span>
                              </button>
                            )}
                            {(prov === 'suspended' || prov === 'under_review') && (
                              <button
                                type="button"
                                onClick={() => handleAccountAction(acc.user_id, 'reactivate')}
                                disabled={busyKey === `reactivate:${acc.user_id}`}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <Play className="w-3 h-3" />
                                <span>Reactivate</span>
                              </button>
                            )}
                            {isSuperAdmin && (prov === 'active' || prov === 'suspended') && Boolean(acc.dedicated_account_id) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReasonText('');
                                  setReasonModal({ mode: 'deactivate', userId: acc.user_id, customerLabel: acc.customer_name || acc.user_id });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Deactivate</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Directory Pagination */}
          {data?.accounts_pagination && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Page {data.accounts_pagination.page} of {data.accounts_pagination.total_pages} ({data.accounts_pagination.total} accounts)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={dirPage <= 1}
                  onClick={() => setDirPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={dirPage >= data.accounts_pagination.total_pages}
                  onClick={() => setDirPage(p => p + 1)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. DVA Deposit Monitoring */}
      {subTab === 'deposits' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <form
            onSubmit={e => {
              e.preventDefault();
              setTxPage(1);
              loadData(false);
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5"
          >
            <input
              type="text"
              value={txCustomer}
              onChange={e => setTxCustomer(e.target.value)}
              placeholder="Customer name, email, account #..."
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              value={txRef}
              onChange={e => setTxRef(e.target.value)}
              placeholder="Paystack reference..."
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <select
              value={txStatus}
              onChange={e => {
                setTxStatus(e.target.value);
                setTxPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="settled">Settled</option>
              <option value="under_review">Quarantined / Under Review</option>
              <option value="disputed">Disputed</option>
              <option value="reversed">Reversed</option>
              <option value="failed">Failed</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none"
              aria-label="Date From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none"
              aria-label="Date To"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                Filter
              </button>
              <button
                type="button"
                onClick={() => {
                  setTxCustomer('');
                  setTxRef('');
                  setTxStatus('all');
                  setDateFrom('');
                  setDateTo('');
                  setTxPage(1);
                  setTimeout(() => loadData(false), 0);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-3.5 py-3">Date &amp; Time</th>
                  <th className="px-3.5 py-3">Customer</th>
                  <th className="px-3.5 py-3">Account #</th>
                  <th className="px-3.5 py-3 text-right">Gross Amount</th>
                  <th className="px-3.5 py-3 text-right">Paystack Fee</th>
                  <th className="px-3.5 py-3 text-right">Net Wallet Credit</th>
                  <th className="px-3.5 py-3">Paystack Reference</th>
                  <th className="px-3.5 py-3">Tx Status</th>
                  <th className="px-3.5 py-3">Webhook Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {!data?.settlements?.length ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      {loading ? 'Loading DVA deposit settlements...' : 'No DVA deposits matched your filter criteria.'}
                    </td>
                  </tr>
                ) : (
                  data.settlements.map(s => (
                    <tr key={s.id} className="hover:bg-slate-800/40">
                      <td className="px-3.5 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {fmtDate(s.settled_at || s.created_at)}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-white">{s.customer_name || s.user_id || 'Unmatched'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.customer_email || '—'}</div>
                      </td>
                      <td className="px-3.5 py-3 font-mono text-emerald-400 font-bold">{s.account_number || '—'}</td>
                      <td className="px-3.5 py-3 text-right font-mono text-white">{fmtNaira(s.gross_amount)}</td>
                      <td className="px-3.5 py-3 text-right font-mono text-rose-400">
                        <div>{fmtNaira(s.paystack_fee)}</div>
                        <div className="text-[9px] text-slate-500 uppercase">{s.fee_bearer} borne</div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400">
                        {fmtNaira(s.net_credit_amount)}
                      </td>
                      <td className="px-3.5 py-3 font-mono text-[11px] text-slate-300">
                        <div>{s.paystack_reference}</div>
                        {s.reversal_reference && (
                          <div className="text-[10px] text-rose-400">Rev: {s.reversal_reference}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.settlement_status === 'settled'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : s.settlement_status === 'under_review'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : s.settlement_status === 'disputed'
                              ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {s.settlement_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-mono text-[11px] text-slate-400 uppercase">
                        {(s.webhook_status || s.settlement_status).replace(/_/g, ' ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data?.settlements_pagination && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Page {data.settlements_pagination.page} of {data.settlements_pagination.total_pages} ({data.settlements_pagination.total} deposits)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={txPage <= 1}
                  onClick={() => setTxPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={txPage >= data.settlements_pagination.total_pages}
                  onClick={() => setTxPage(p => p + 1)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Unmatched & Quarantined Transfers */}
      {subTab === 'unmatched' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-300">Quarantined &amp; Disputed Transfer Investigation Safeguard</p>
              <p className="text-[11px] text-amber-100/80">
                Unmatched or flagged transfers are held safely outside customer wallet balances. Direct one-click crediting of unverified transfers to arbitrary accounts is strictly disabled. Use Paystack re-verification first, or escalate verified exceptions to a Super Administrator with written evidence.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-3.5 py-3">Date</th>
                  <th className="px-3.5 py-3">Paystack Ref</th>
                  <th className="px-3.5 py-3">Receiving Account #</th>
                  <th className="px-3.5 py-3">Sender Evidence</th>
                  <th className="px-3.5 py-3 text-right">Gross Amount</th>
                  <th className="px-3.5 py-3">Quarantine / Dispute Reason</th>
                  <th className="px-3.5 py-3 text-right">Investigation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {unmatchedList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No unmatched, quarantined, or disputed DVA transfers pending investigation.
                    </td>
                  </tr>
                ) : (
                  unmatchedList.map(u => (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="px-3.5 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="px-3.5 py-3 font-mono text-white">{u.paystack_reference}</td>
                      <td className="px-3.5 py-3 font-mono text-amber-300">{u.account_number || '—'}</td>
                      <td className="px-3.5 py-3 text-[11px]">
                        <div className="text-white font-semibold">{u.sender_account_name || 'Unknown Sender'}</div>
                        <div className="text-slate-400 font-mono">
                          {u.sender_bank || '—'} {u.sender_account_number_masked ? `• ${u.sender_account_number_masked}` : ''}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-white">{fmtNaira(u.gross_amount)}</td>
                      <td className="px-3.5 py-3 text-[11px] text-amber-300 max-w-xs">
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 uppercase text-[10px] font-bold mr-1.5">
                          {u.settlement_status.replace(/_/g, ' ')}
                        </span>
                        <span>{u.quarantine_reason || u.dispute_status || 'Account match verification required'}</span>
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleReverifySettlement(u.id)}
                            disabled={busyKey === `reverify:${u.id}`}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-semibold"
                          >
                            {busyKey === `reverify:${u.id}` ? 'Verifying...' : 'Re-verify Paystack'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReasonText('');
                              setReasonModal({ mode: 'mark_failed', settlementId: u.id, reference: u.paystack_reference });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-[11px] font-semibold"
                          >
                            Mark Failed
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setAttrUserId(u.user_id || '');
                                setAttrEvidence('');
                                setAttrConfirm(false);
                                setAttrModal({
                                  settlementId: u.id,
                                  reference: u.paystack_reference,
                                  grossAmount: u.gross_amount,
                                  accountNumber: u.account_number,
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              <FileWarning className="w-3 h-3" />
                              <span>SuperAdmin Resolve</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Admin Wallet & Paystack DVA Policy Controls */}
      {subTab === 'controls' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Paystack DVA Policy &amp; Provisioning Controls</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Disabled and paused by default until production testing is approved. All changes are audit-logged.
                </p>
              </div>
              {!isSuperAdmin && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>SuperAdmin Read-Only</span>
                </span>
              )}
            </div>

            <form onSubmit={handleSavePolicy} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Enable Paystack DVA</div>
                    <div className="text-[11px] text-slate-400">Allow dedicated virtual account assignment</div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={policyForm.enable_paystack_dva}
                    onChange={e => setPolicyForm(f => ({ ...f, enable_paystack_dva: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Provisioning Rollout Mode</label>
                  <select
                    disabled={!isSuperAdmin}
                    value={policyForm.dva_rollout_mode}
                    onChange={e => setPolicyForm(f => ({ ...f, dva_rollout_mode: e.target.value as any }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  >
                    <option value="paused">Paused (Production Hold)</option>
                    <option value="testing_allowlist">Testing Allowlist Only</option>
                    <option value="all_eligible">All Eligible Customers</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Preferred Supported Bank</label>
                  <select
                    disabled={!isSuperAdmin}
                    value={policyForm.preferred_bank}
                    onChange={e => setPolicyForm(f => ({ ...f, preferred_bank: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  >
                    {(data?.capability?.providers?.length
                      ? data.capability.providers
                      : [
                          { provider_slug: 'wema-bank', bank_name: 'Wema Bank' },
                          { provider_slug: 'titan-paystack', bank_name: 'Titan Trust Bank (Paystack)' },
                        ]
                    ).map((p, idx) => (
                      <option key={`${p.provider_slug || idx}`} value={p.provider_slug || 'wema-bank'}>
                        {p.bank_name || p.provider_slug} ({p.provider_slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">DVA Transfer Fee Bearer</label>
                  <select
                    disabled={!isSuperAdmin}
                    value={policyForm.fee_bearer}
                    onChange={e => setPolicyForm(f => ({ ...f, fee_bearer: e.target.value as any }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  >
                    <option value="customer">Customer (Net settlement credited to wallet)</option>
                    <option value="merchant">Merchant Absorbs Fee (Gross credited to wallet)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                  Testing Allowlist Emails (comma-separated, used in Testing Allowlist mode)
                </label>
                <textarea
                  rows={2}
                  disabled={!isSuperAdmin}
                  value={policyForm.dva_test_user_emails}
                  onChange={e => setPolicyForm(f => ({ ...f, dva_test_user_emails: e.target.value }))}
                  placeholder="qa@example.com, tester@hambaktech.com.ng"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={policyForm.dva_require_bvn}
                    onChange={e => setPolicyForm(f => ({ ...f, dva_require_bvn: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span>Require verified BVN</span>
                </label>
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={policyForm.dva_auto_provision_on_register}
                    onChange={e => setPolicyForm(f => ({ ...f, dva_auto_provision_on_register: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span>Auto-provision on register</span>
                </label>
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={policyForm.dva_auto_provision_on_wallet_open}
                    onChange={e => setPolicyForm(f => ({ ...f, dva_auto_provision_on_wallet_open: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span>Auto-provision on wallet open</span>
                </label>
              </div>

              {isSuperAdmin && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPolicy}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2"
                  >
                    {savingPolicy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Paystack DVA Controls</span>
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Live Integration Health</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Paystack Capability</div>
                <div className={`font-bold mt-1 ${data?.capability?.capable ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {data?.capability?.capable ? 'Live DVA Enabled' : data?.capability?.reason || 'Not Activated'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{data?.capability?.message}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Last Successful Webhook</div>
                <div className="font-mono text-white font-semibold mt-1">
                  {fmtDate(data?.last_successful_webhook_at)}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400">Supported Partner Banks</div>
                {data?.capability?.providers?.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {data.capability.providers.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-emerald-300">
                        {p.bank_name || p.provider_slug}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">None returned by Paystack yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Account Detail Modal */}
      {detailUserId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Customer Dedicated Virtual Account Details</h3>
                <p className="text-[11px] text-slate-400 font-mono">User ID: {detailUserId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailUserId(null);
                  setDetailData(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {detailLoading || !detailData ? (
                <div className="py-12 flex flex-col items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span>Loading customer virtual account record &amp; audit trail...</span>
                </div>
              ) : (
                <>
                  {/* Customer & Account Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <div className="font-bold text-indigo-400 uppercase text-[10px]">Customer Profile (Redacted KYC)</div>
                      <div className="font-bold text-white text-sm">{detailData.customer.full_name}</div>
                      <div className="text-slate-400 font-mono">{detailData.customer.email}</div>
                      <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">KYC Status / Level</span>
                          <span className="text-white font-semibold capitalize">
                            {detailData.customer.kyc_status} (Tier {detailData.customer.kyc_level})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">BVN On File</span>
                          <span className="text-white font-mono">
                            {detailData.customer.has_bvn ? detailData.customer.bvn_last4 || 'Verified' : 'Not provided'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Email Verified</span>
                          <span className="text-white">{detailData.customer.email_verified ? 'Yes' : 'No'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Wallet Balance</span>
                          <span className="text-emerald-400 font-mono font-bold">{fmtNaira(detailData.customer.wallet_balance)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <div className="font-bold text-emerald-400 uppercase text-[10px]">Paystack Dedicated Virtual Account</div>
                      {detailData.virtual_account ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-mono font-black text-emerald-400">
                              {detailData.virtual_account.account_number || 'Pending Assignment'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold uppercase text-slate-200">
                              {(detailData.virtual_account.provisioning_status || detailData.virtual_account.assignment_status).replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-slate-300">
                            {detailData.virtual_account.bank_name || '—'} &bull; {detailData.virtual_account.account_name || '—'}
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                            <div>
                              <span className="text-slate-500 block">Paystack Customer Code</span>
                              <span className="text-slate-200 font-mono">{detailData.virtual_account.paystack_customer_code || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Date Assigned</span>
                              <span className="text-slate-200 font-mono">{fmtDate(detailData.virtual_account.assigned_at)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Last Synced</span>
                              <span className="text-slate-200 font-mono">{fmtDate(detailData.virtual_account.last_synced_at)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Total Inflow</span>
                              <span className="text-emerald-400 font-mono font-bold">{fmtNaira(detailData.virtual_account.total_inflow)}</span>
                            </div>
                          </div>
                          {detailData.virtual_account.failure_reason && (
                            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 mt-2">
                              {detailData.virtual_account.failure_reason}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-slate-500 py-4">No dedicated virtual account record exists yet.</div>
                      )}
                    </div>
                  </div>

                  {/* Associated Deposits */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-slate-300">
                      Associated DVA Deposits ({detailData.deposits.length})
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Paystack Reference</th>
                            <th className="px-3 py-2 text-right">Gross</th>
                            <th className="px-3 py-2 text-right">Fee</th>
                            <th className="px-3 py-2 text-right">Net Credit</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {detailData.deposits.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                                No DVA deposits recorded for this customer yet.
                              </td>
                            </tr>
                          ) : (
                            detailData.deposits.map(dep => (
                              <tr key={dep.id}>
                                <td className="px-3 py-2 font-mono text-[11px]">{fmtDate(dep.settled_at || dep.created_at)}</td>
                                <td className="px-3 py-2 font-mono text-[11px]">{dep.paystack_reference}</td>
                                <td className="px-3 py-2 text-right font-mono">{fmtNaira(dep.gross_amount)}</td>
                                <td className="px-3 py-2 text-right font-mono text-rose-400">{fmtNaira(dep.paystack_fee)}</td>
                                <td className="px-3 py-2 text-right font-mono text-emerald-400 font-bold">{fmtNaira(dep.net_credit_amount)}</td>
                                <td className="px-3 py-2 uppercase text-[10px] font-bold">{dep.settlement_status}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Account Assignment & Audit History */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-slate-300 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Account Assignment &amp; Audit History ({detailData.history.length})</span>
                    </h4>
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {detailData.history.length === 0 ? (
                        <div className="text-xs text-slate-500 p-3 rounded-xl bg-slate-950 border border-slate-800">
                          No Paystack DVA events recorded yet.
                        </div>
                      ) : (
                        detailData.history.map(h => (
                          <div key={h.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-bold text-indigo-300">{h.action}</span>
                              <span className="text-[11px] text-slate-400 ml-2">by {h.actor}</span>
                              {h.details && Object.keys(h.details).length > 0 && (
                                <div className="text-[10px] text-slate-500 font-mono mt-1 break-all">
                                  {JSON.stringify(h.details)}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">{fmtDate(h.created_at)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reason Modal (Suspend / Deactivate / Mark Failed) */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSubmitReasonModal} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase">
                {reasonModal.mode === 'deactivate'
                  ? 'Confirm SuperAdmin Account Deactivation'
                  : reasonModal.mode === 'suspend'
                  ? 'Suspend Dedicated Virtual Account'
                  : 'Mark Quarantined Transfer Failed'}
              </h3>
              <button type="button" onClick={() => setReasonModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {reasonModal.mode === 'deactivate'
                ? `This will call Paystack API to permanently deactivate the DVA for ${reasonModal.customerLabel}.`
                : reasonModal.mode === 'suspend'
                ? `Temporarily suspend automated settlement for ${reasonModal.customerLabel}.`
                : `Mark unmatched transfer ${reasonModal.reference} as failed without crediting any customer wallet.`}
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Mandatory Audit Reason</label>
              <textarea
                required
                rows={3}
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                placeholder="Enter detailed justification (min 5 characters)..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Confirm &amp; Audit Log
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SuperAdmin Verified Attribution Modal */}
      {attrModal && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSubmitVerifiedAttribution} className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-300 uppercase flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>SuperAdmin Exceptional Verified Attribution</span>
              </h3>
              <button type="button" onClick={() => setAttrModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1 font-mono">
              <div className="text-slate-400">Reference: <span className="text-white">{attrModal.reference}</span></div>
              <div className="text-slate-400">Gross: <span className="text-emerald-400">{fmtNaira(attrModal.grossAmount)}</span></div>
              <div className="text-slate-400">Account #: <span className="text-amber-300">{attrModal.accountNumber || '—'}</span></div>
            </div>
            <p className="text-[11px] text-slate-400">
              Server will verify this transaction directly against Paystack <code>/transaction/verify</code> before any wallet credit is permitted.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Target Customer User ID</label>
              <input
                type="text"
                required
                value={attrUserId}
                onChange={e => setAttrUserId(e.target.value)}
                placeholder="Paste verified customer user_id..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Written Investigation Evidence (min 15 chars)</label>
              <textarea
                required
                rows={3}
                value={attrEvidence}
                onChange={e => setAttrEvidence(e.target.value)}
                placeholder="Document Paystack verification proof & bank session match..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <label className="flex items-start gap-2.5 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={attrConfirm}
                onChange={e => setAttrConfirm(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>I confirm this transfer is Paystack-verified and authorize single-ledger settlement with full SuperAdmin audit logging.</span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAttrModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyKey === `attr:${attrModal.settlementId}`}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold"
              >
                {busyKey === `attr:${attrModal.settlementId}` ? 'Verifying & Attributing...' : 'Verify & Credit Ledger'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
