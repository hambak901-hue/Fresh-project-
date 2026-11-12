import React, { useState, useEffect } from 'react';
import {
  Users,
  Wallet,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Shield,
  Server,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  ChevronRight,
  Check,
  X,
  Loader2,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getStoredToken } from '../../lib/api';
import { AdminOverviewData, Transaction } from '../../types';

interface AdminOverviewProps {
  onNavigateToTab: (tab: string) => void;
}

export function AdminOverview({ onNavigateToTab }: AdminOverviewProps) {
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchOverview = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      setLoading(false);
      setError('Administrator authentication token required to view enterprise telemetry.');
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

  const handleApproveFunding = async (id: string) => {
    setActionLoading(id);
    setActionSuccess(null);
    try {
      const res = await api.approveFunding(id);
      setActionSuccess(res.message);
      await fetchOverview();
    } catch (err: any) {
      console.error(err);
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  const handleRejectFunding = async (id: string) => {
    let reason = 'Bank deposit could not be verified on statement';
    try {
      const p = window.prompt('Enter reason for declining this manual payment proof:', reason);
      if (p === null) return;
      if (p) reason = p;
    } catch {
      // In iframe environments where window.prompt is disallowed, fallback gracefully
    }

    setActionLoading(id);
    setActionSuccess(null);
    try {
      const res = await api.rejectFunding(id, reason);
      setActionSuccess(res.message);
      await fetchOverview();
    } catch (err: any) {
      console.error(err);
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

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
    pendingFundingApprovals: Number(rawMetrics.pendingFundingApprovals ?? rawMetrics.pending_funding_approvals ?? 0),
    pendingKycCount: Number(rawMetrics.pendingKycCount ?? rawMetrics.pending_kyc_count ?? 0),
  };

  const recentRegistrations: any[] = data?.recentRegistrations || (data as any)?.recent_registrations || [];
  const pendingFundings: any[] = data?.pendingFundings || (data as any)?.pending_funding || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Executive Command Centre &bull; Enterprise Cloud</span>
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

        {/* Global Financial Flow Metrics (Anti-pill tabular figures) */}
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
      </div>

      {actionSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

        <div
          onClick={() => onNavigateToTab('customers')}
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

        <div
          onClick={() => onNavigateToTab('funding')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 cursor-pointer transition space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Pending Bank Approvals</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-sky-400 tabular-nums">
            {metrics.pendingFundingApprovals}
          </p>
          <p className="text-[11px] text-slate-400">Manual transfer proofs</p>
        </div>

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
      </div>

      {/* Provider Connectivity & System Status Board */}
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
          {data?.providerStatus && (
            <>
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
                  <span className="font-semibold text-white">Flutterwave Payment</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.flutterwave.status}</p>
                <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.flutterwave.clientIdMasked}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Enterprise SMTP Mail</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.smtpMail.status}</p>
                <p className="text-[10px] text-slate-500 font-mono">Mail Gateway: Active</p>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Production Server Core</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.cpanel.status}</p>
                <p className="text-[10px] text-slate-500 font-mono">Hosting Cluster: Operational</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dual Column: Pending Funding Approvals & Recent Registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Manual Funding Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Pending Bank Transfer Proofs ({pendingFundings.length})</span>
            </h2>
            <button
              onClick={() => onNavigateToTab('funding')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pendingFundings.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">All payment proofs processed</p>
              <p className="text-slate-500">No manual bank deposits awaiting administrative confirmation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingFundings.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono text-sm">
                        ₦{(Number(item.amount) || 0).toLocaleString()}
                      </span>
                      <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        {item.reference}
                      </span>
                    </div>
                    <p className="text-slate-300">{item.description}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Sender: {item.metadata?.sender_name || 'N/A'} &bull; {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={actionLoading === item.id}
                      onClick={() => handleApproveFunding(item.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1 transition"
                    >
                      {actionLoading === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === item.id}
                      onClick={() => handleRejectFunding(item.id)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-lg font-semibold flex items-center gap-1 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Customer Registrations */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Recent Registrations</span>
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
            {recentRegistrations.map((user: any) => (
              <div
                key={user.id}
                className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                    {user.full_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user.full_name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{user.email}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-emerald-400 font-bold">
                    ₦{(Number(user.wallet_balance) || 0).toLocaleString()}
                  </span>
                  <p className="text-[10px] text-slate-500 font-mono capitalize">
                    {user.status} &bull; Tier {user.tier}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
