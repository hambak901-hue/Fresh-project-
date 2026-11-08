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
import { api } from '../../lib/api';
import { AdminOverviewData, Transaction } from '../../types';

interface AdminOverviewProps {
  onNavigateToTab: (tab: string) => void;
}

export function AdminOverview({ onNavigateToTab }: AdminOverviewProps) {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminOverview();
      setData(res);
    } catch (e) {
      console.error('Failed to load admin overview:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

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
    const reason = window.prompt('Enter reason for declining this manual payment proof:', 'Bank deposit could not be verified on statement');
    if (reason === null) return;

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

  const metrics = data?.metrics || {
    totalCustomers: 0,
    activeCustomers: 0,
    suspendedCustomers: 0,
    totalStaff: 0,
    totalWalletBalances: 0,
    totalWalletFunding: 0,
    totalServiceSales: 0,
    providerExpenditure: 0,
    grossProfit: 0,
    successfulTransactions: 0,
    pendingTransactions: 0,
    failedTransactions: 0,
    pendingFundingApprovals: 0,
    pendingKycCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Executive Command Centre &bull; TrueHost LON110</span>
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
              ₦{metrics.totalWalletBalances.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Liability to customers</p>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
            <p className="text-xs text-slate-400">Gross Service Sales (Debits)</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-white mt-1 tabular-nums">
              ₦{metrics.totalServiceSales.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Total vending volume</p>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
            <p className="text-xs text-slate-400">Provider Cost (Wholesale COGS)</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-red-400 mt-1 tabular-nums">
              ₦{metrics.providerExpenditure.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">UlamaData &amp; VTpass cost</p>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
            <p className="text-xs text-indigo-400 font-semibold">Net Platform Margin</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-indigo-400 mt-1 tabular-nums">
              +₦{metrics.grossProfit.toLocaleString()}
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
                  <span className="font-semibold text-white">TrueHost SMTP Mail</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.smtpMail.status}</p>
                <p className="text-[10px] text-slate-500 font-mono">{data.providerStatus.smtpMail.host}:{data.providerStatus.smtpMail.port}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">TrueHost LON110 Server</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-slate-400 text-[11px] font-mono">{data.providerStatus.cpanel.status}</p>
                <p className="text-[10px] text-slate-500 font-mono">SFTP Target: {data.providerStatus.cpanel.serverIp}:1624</p>
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
              <span>Pending Bank Transfer Proofs ({data?.pendingFundings?.length || 0})</span>
            </h2>
            <button
              onClick={() => onNavigateToTab('funding')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {(!data?.pendingFundings || data.pendingFundings.length === 0) ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">All payment proofs processed</p>
              <p className="text-slate-500">No manual bank deposits awaiting administrative confirmation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.pendingFundings.map(item => (
                <div
                  key={item.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono text-sm">
                        ₦{item.amount.toLocaleString()}
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
            {data?.recentRegistrations?.map(user => (
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
                    ₦{user.wallet_balance?.toLocaleString() || 0}
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
