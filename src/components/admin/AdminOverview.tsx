import React, { useState, useEffect } from 'react';
import {
  Users,
  Wallet,
  Activity,
  AlertCircle,
  Shield,
  Server,
  RefreshCw,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Printer,
  LifeBuoy,
  Store,
  Scale,
  Landmark,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getStoredToken } from '../../lib/api';
import { isConsoleRole } from '../../lib/roles';
import { AdminOverviewData } from '../../types';

interface AdminOverviewProps {
  onNavigateToTab: (tab: string) => void;
}

export function AdminOverview({ onNavigateToTab }: AdminOverviewProps) {
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    if (!user || !isConsoleRole(user.role)) {
      setLoading(false);
      setError('Internal console authentication token required to view console telemetry.');
      return;
    }

    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      setError('Administrator authentication token required to view enterprise telemetry.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminOverview();
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin overview metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [user]);

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Aggregating enterprise telemetry & database metrics...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-slate-900 border border-amber-500/30 rounded-2xl text-center space-y-4 shadow-xl shadow-slate-950/50">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white">Administrator Access Required</h3>
        <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
        <div className="pt-2 flex justify-center gap-3">
          <button
            onClick={fetchOverview}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  const rawMetrics = (data?.metrics as any) || {};
  const metrics = {
    totalCustomers: Number(rawMetrics.totalCustomers ?? rawMetrics.total_customers ?? 0),
    activeCustomers: Number(rawMetrics.activeCustomers ?? rawMetrics.active_customers ?? 0),
    suspendedCustomers: Number(rawMetrics.suspendedCustomers ?? rawMetrics.suspended_customers ?? 0),
    totalStaff: Number(rawMetrics.totalStaff ?? rawMetrics.total_staff ?? 0),
    totalWalletBalances: Number(rawMetrics.totalWalletBalances ?? rawMetrics.total_wallet_balances ?? 0),
    totalWalletFunding: Number(rawMetrics.totalWalletFunding ?? rawMetrics.total_wallet_funding ?? 0),
    totalServiceSales: Number(rawMetrics.totalServiceSales ?? rawMetrics.total_service_sales ?? 0),
    providerExpenditure: Number(rawMetrics.providerExpenditure ?? rawMetrics.provider_expenditure ?? 0),
    grossProfit: Number(rawMetrics.grossProfit ?? rawMetrics.gross_profit ?? 0),
    successfulTransactions: Number(rawMetrics.successfulTransactions ?? rawMetrics.successful_transactions ?? 0),
    pendingTransactions: Number(rawMetrics.pendingTransactions ?? rawMetrics.pending_transactions ?? 0),
    failedTransactions: Number(rawMetrics.failedTransactions ?? rawMetrics.failed_transactions ?? 0),
    pendingKycCount: Number(rawMetrics.pendingKycCount ?? rawMetrics.pending_kyc_count ?? 0),
  };

  const recentRegistrations: any[] = data?.recentRegistrations || (data as any)?.recent_registrations || [];
  const printingSummary = (data as any)?.printing_summary || (data as any)?.printingSummary || null;
  const dvaSummary = (data as any)?.paystack_dva_summary || (data as any)?.paystackDvaSummary || null;

  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const isSuper = user?.role === 'superadmin' || perms.includes('*');
  const hasPerm = (p: string) => isSuper || perms.includes(p);
  const canCustomers = hasPerm('customers');
  const canWallet = hasPerm('wallet');
  const canKyc = hasPerm('kyc');
  const canReports = hasPerm('reports');
  const canServices = hasPerm('services');
  const canSettings = hasPerm('settings');
  const canSupport = hasPerm('support');
  const canStaff = hasPerm('staff');
  const canAccountingPhysical = hasPerm('accounting') || hasPerm('accounting_physical');
  const canAccountingReconcile = hasPerm('accounting') || hasPerm('accounting_reconcile');
  const canPrinting = hasPerm('printing') || hasPerm('printing_pricing');
  const canFinance = isSuper || canWallet || canReports || hasPerm('accounting');

  const deskShortcuts: Array<{ id: string; label: string; desc: string; icon: React.FC<{ className?: string }> }> = [];
  if (canPrinting) deskShortcuts.push({ id: 'printing', label: 'Printing Desk', desc: 'Quotes, Orders, Pricing & Dispatch', icon: Printer });
  if (canCustomers) deskShortcuts.push({ id: 'customers', label: 'Customers', desc: 'Profiles, Agents & Alerts', icon: Users });
  if (canWallet) deskShortcuts.push({ id: 'funding', label: 'Wallet & Paystack', desc: 'Adjustments & Paystack Gateway', icon: Wallet });
  if (canWallet) deskShortcuts.push({ id: 'paystack_dva', label: 'Virtual Accounts (DVA)', desc: 'Directory, Deposits & Controls', icon: Landmark });
  if (canKyc) deskShortcuts.push({ id: 'kyc_admin', label: 'KYC Reviews', desc: 'Compliance & Tier Upgrades', icon: ShieldCheck });
  if (canAccountingPhysical) deskShortcuts.push({ id: 'acc_physical_sales', label: 'Physical Counter', desc: 'Walk-in POS & Receipts', icon: Store });
  if (canAccountingReconcile) deskShortcuts.push({ id: 'acc_reconciliation', label: 'Reconciliation', desc: 'Cash / POS / Bank Recon', icon: Scale });
  if (canSupport) deskShortcuts.push({ id: 'support_admin', label: 'Support Centre', desc: 'Customer Help Tickets', icon: LifeBuoy });
  if (canStaff) deskShortcuts.push({ id: 'staff', label: 'Staff Roles', desc: 'Appointments & Scopes', icon: Shield });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Executive Command Centre &bull; Live Production</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Global Platform Overview
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Real-time audit of customer registrations, wallet floats, telecommunications expenditure, and carrier health.
            </p>
          </div>
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {/* Global Financial Flow Metrics (Scoped by Financial Permissions) */}
        {canFinance && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
              <p className="text-xs text-slate-400">Total Customer Wallets Float</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
                ₦{(metrics.totalWalletBalances || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Liability to customers</p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
              <p className="text-xs text-slate-400">Gross Service Sales (Debits)</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-white mt-1 tabular-nums">
                ₦{(metrics.totalServiceSales || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Total vending volume</p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
              <p className="text-xs text-slate-400">Provider Cost (Wholesale COGS)</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-red-400 mt-1 tabular-nums">
                ₦{(metrics.providerExpenditure || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">UlamaData &amp; VTpass cost</p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
              <p className="text-xs text-indigo-400 font-semibold">Net Platform Margin</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-indigo-400 mt-1 tabular-nums">
                +₦{(metrics.grossProfit || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-indigo-400/80 mt-0.5 font-mono">Retained gross profit</p>
            </div>
          </div>
        )}
      </div>

      {/* Appointed Role Desk Shortcuts */}
      {deskShortcuts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Appointed Desk Access ({user?.role})
            </h2>
            <span className="text-[11px] font-mono text-indigo-400">
              {isSuper ? 'Full Root Access' : `${perms.length} granted permission(s)`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {deskShortcuts.map(sc => {
              const Icon = sc.icon;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onNavigateToTab(sc.id)}
                  className="text-left p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{sc.label}</p>
                      <p className="text-[10px] text-slate-400 truncate">{sc.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary KPI Grid (Scoped by Granted Role Permissions) */}
      {(canCustomers || canKyc || canWallet || canFinance) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {canCustomers && (
            <div
              onClick={() => onNavigateToTab('customers')}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 cursor-pointer transition space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Customer Accounts</span>
                <Users className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-white tabular-nums">
                {metrics.totalCustomers}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="text-emerald-400 font-mono">{metrics.activeCustomers} Active</span>
                <span>&bull;</span>
                <span className="text-red-400 font-mono">{metrics.suspendedCustomers} Suspended</span>
              </div>
            </div>
          )}

          {(canKyc || canCustomers) && (
            <div
              onClick={() => onNavigateToTab(canKyc ? 'kyc_admin' : 'customers')}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 cursor-pointer transition space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Pending KYC Submissions</span>
                <ShieldCheck className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
                {metrics.pendingKycCount}
              </p>
              <p className="text-[11px] text-slate-400">Awaiting Tier 2/3 ID validation</p>
            </div>
          )}

          {canWallet && (
            <div
              onClick={() => onNavigateToTab('funding')}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 cursor-pointer transition space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Active Funding Gateway</span>
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                Paystack
              </p>
              <p className="text-[11px] text-slate-400">Sole automated customer funding</p>
            </div>
          )}

          {canFinance && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Transaction Health</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {metrics.successfulTransactions}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="text-amber-400 font-mono">{metrics.pendingTransactions} Pend</span>
                <span>&bull;</span>
                <span className="text-red-400 font-mono">{metrics.failedTransactions} Fail</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PAYSTACK VIRTUAL ACCOUNT MANAGEMENT Live Overview */}
      {(canWallet || canFinance || isSuper) && dvaSummary && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                <Landmark className="w-4 h-4 text-indigo-400" />
                <span>Paystack Virtual Account Management</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Rollout: <span className="font-mono text-slate-200">{dvaSummary.dva_rollout_mode || 'paused'}</span> &bull; Status:{' '}
                <span className={dvaSummary.enable_paystack_dva ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {dvaSummary.enable_paystack_dva ? 'Enabled' : 'Disabled'}
                </span>
              </p>
            </div>
            {canWallet && (
              <button
                type="button"
                onClick={() => onNavigateToTab('paystack_dva')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto transition"
              >
                <span>Open DVA Console</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">Eligible Customers</p>
              <p className="text-lg font-bold font-mono text-white mt-0.5">{Number(dvaSummary.eligible_customers || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-emerald-400">Active Accounts</p>
              <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{Number(dvaSummary.active_accounts || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-amber-400">Pending Assignments</p>
              <p className="text-lg font-bold font-mono text-amber-400 mt-0.5">{Number(dvaSummary.pending_accounts || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-rose-400">Failed Assignments</p>
              <p className="text-lg font-bold font-mono text-rose-400 mt-0.5">{Number(dvaSummary.failed_accounts || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-sky-400">Successful DVA Deposits</p>
              <p className="text-lg font-bold font-mono text-sky-400 mt-0.5">{Number(dvaSummary.successful_deposits || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-amber-300">Unmatched / Quarantined</p>
              <p className="text-lg font-bold font-mono text-amber-300 mt-0.5">{Number(dvaSummary.quarantined_count || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">Gross DVA Deposits</p>
              <p className="text-base font-bold font-mono text-white mt-0.5">₦{Number(dvaSummary.gross_deposits || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-rose-300">Paystack DVA Fees</p>
              <p className="text-base font-bold font-mono text-rose-300 mt-0.5">₦{Number(dvaSummary.total_fees || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-emerald-300">Net DVA Settlements</p>
              <p className="text-base font-bold font-mono text-emerald-300 mt-0.5">₦{Number(dvaSummary.net_settlements || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-indigo-400">Wallet Credits (DVA)</p>
              <p className="text-base font-bold font-mono text-indigo-400 mt-0.5">₦{Number(dvaSummary.wallet_credits || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 sm:col-span-2">
              <p className="text-[11px] text-rose-400">Reversed / Disputed</p>
              <p className="text-base font-bold font-mono text-rose-400 mt-0.5">
                {Number(dvaSummary.reversed_disputed_count || 0)} &bull; ₦{Number(dvaSummary.reversed_disputed_amount || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Printing & Document Services Desk Live Summary */}
      {canPrinting && printingSummary && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-400" />
              <span>Printing &amp; Document Services Desk Summary</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigateToTab('printing')}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto transition"
            >
              <span>Open Printing Desk</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">Total Print Jobs</p>
              <p className="text-lg font-bold font-mono text-white mt-0.5">{Number(printingSummary.total_orders || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-amber-400">Pending Review</p>
              <p className="text-lg font-bold font-mono text-amber-400 mt-0.5">{Number(printingSummary.pending_review || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-sky-400">Awaiting Payment</p>
              <p className="text-lg font-bold font-mono text-sky-400 mt-0.5">{Number(printingSummary.awaiting_payment || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-indigo-400">In Production</p>
              <p className="text-lg font-bold font-mono text-indigo-400 mt-0.5">{Number(printingSummary.processing || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-violet-400">Ready / In Transit</p>
              <p className="text-lg font-bold font-mono text-violet-400 mt-0.5">{Number(printingSummary.ready_or_transit || 0)}</p>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-emerald-400">Completed</p>
              <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{Number(printingSummary.completed || 0)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Provider Connectivity & System Status Board (Only for Services / Settings / SuperAdmin) */}
      {(isSuper || canServices || canSettings) && data?.providerStatus && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Integrated Provider &amp; Carrier Gateways Status</span>
            </h2>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
              All 7 Services Connected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">2SureVerify NIN</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.sureverify.status}</p>
              <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.sureverify.keyMasked}</p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Veripine BVN</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.veripine.status}</p>
              <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.veripine.keyMasked}</p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">UlamaData Telecom</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.ulamaData.status}</p>
              <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.ulamaData.keyMasked}</p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">VTpass Utilities</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.vtpass.status}</p>
              <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.vtpass.apiKeyMasked}</p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Paystack Payment</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    data.providerStatus.paystack?.configured !== false
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`}
                />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">
                {data.providerStatus.paystack?.status || 'Operational'}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                {data.providerStatus.paystack?.keyMasked || (data.providerStatus.paystack as any)?.publicKeyMasked || 'Paystack Live Gateway'}
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">TrueHost SMTP Mail</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.smtpMail.status}</p>
              <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.smtpMail.host}:{data.providerStatus.smtpMail.port}</p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Production Web Hosting</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.cpanel.status}</p>
              <p className="text-[10px] text-slate-500 font-mono">Gateway: Active &bull; TLS Verified</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Customer Registrations */}
      {canCustomers && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Recent Registrations</span>
                  {(rawMetrics.today_registrations ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                      {rawMetrics.today_registrations} today
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => onNavigateToTab('customers')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  <span>Manage Customers</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {recentRegistrations.map((regUser: any) => {
                  const createdMs = regUser.created_at ? new Date(regUser.created_at).getTime() : 0;
                  const isNew = Boolean(regUser.is_new) || (createdMs > 0 && Date.now() - createdMs <= 72 * 3600 * 1000);
                  return (
                    <div
                      key={regUser.id}
                      onClick={() => onNavigateToTab('customers')}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs hover:border-slate-700 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold shrink-0">
                          {regUser.full_name?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white truncate">{regUser.full_name}</p>
                            {isNew && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                NEW
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono truncate">{regUser.email}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-2">
                        <span className="font-mono text-emerald-400 font-bold">
                          ₦{(Number(regUser.wallet_balance) || 0).toLocaleString()}
                        </span>
                        <p className="text-[10px] text-slate-500 font-mono capitalize">
                          {regUser.status} &bull; Tier {regUser.tier}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
    </div>
  );
}
