import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  CreditCard,
  Wallet,
  Shield,
  Tv,
  Cpu,
  TrendingUp,
  UserCheck,
  FileText,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  ArrowUpRight,
  Filter
} from 'lucide-react';
import { api } from '../../lib/api';

type ReportKey =
  | 'customer'
  | 'transaction'
  | 'wallet'
  | 'payment'
  | 'nin'
  | 'telecom'
  | 'provider'
  | 'profit'
  | 'kyc'
  | 'staff'
  | 'referral_growth';

export const ReportsManagement: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ReportKey>('customer');
  const [reportsData, setReportsData] = useState<any>(null);
  const [referralReport, setReferralReport] = useState<import('../../types').ReferralGrowthReport | null>(null);
  const [refDateFrom, setRefDateFrom] = useState('');
  const [refDateTo, setRefDateTo] = useState('');
  const [refCampaignCode, setRefCampaignCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [res, refRes] = await Promise.allSettled([
        api.getDetailedReportsAdmin(),
        api.getAdminReferralGrowthReport({
          date_from: refDateFrom || undefined,
          date_to: refDateTo || undefined,
          campaign_code: refCampaignCode || undefined,
        }),
      ]);
      if (res.status === 'fulfilled' && res.value && res.value.success && res.value.reports) {
        setReportsData(res.value.reports);
      }
      if (refRes.status === 'fulfilled' && refRes.value && refRes.value.success) {
        setReferralReport(refRes.value.report);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch detailed reports' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const handleExportJSON = () => {
    if (!reportsData) return;
    const payload = { ...reportsData, referral_growth_report: referralReport };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `hambaktech_11_reports_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setFeedback({ type: 'success', message: 'All 11 reports exported to JSON successfully.' });
  };

  const handleExportCSV = () => {
    if (!reportsData) return;
    const rows: string[][] = [
      ['HAMBAKTECH ENTERPRISE SYSTEM AUDIT REPORT', `Generated: ${reportsData.generated_at || new Date().toISOString()}`],
      [],
      ['1. CUSTOMER REPORT'],
      ['Total Customers', reportsData.customer_report?.total_customers ?? 0],
      ['Active Customers', reportsData.customer_report?.active_customers ?? 0],
      ['Suspended Customers', reportsData.customer_report?.suspended_customers ?? 0],
      ['Verified Customers', reportsData.customer_report?.verified_customers ?? 0],
      ['Total Customer Balances', `₦${reportsData.customer_report?.total_customer_balance ?? 0}`],
      [],
      ['2. TRANSACTION REPORT'],
      ['Total Turnover Volume', `₦${reportsData.transaction_report?.summary?.total_volume ?? 0}`],
      ['Total Transactions', reportsData.transaction_report?.summary?.total_count ?? 0],
      ['Successful Volume', `₦${reportsData.transaction_report?.summary?.successful_volume ?? 0}`],
      ['Success Count', reportsData.transaction_report?.summary?.successful_count ?? 0],
      ['Failed Count', reportsData.transaction_report?.summary?.failed_count ?? 0],
      ['Auto-Refund Credits', `₦${reportsData.transaction_report?.summary?.refund_credit_volume ?? 0} (${reportsData.transaction_report?.summary?.refund_count ?? 0})`],
      ['Transaction Reversals', `₦${reportsData.transaction_report?.summary?.reversal_volume ?? 0} (${reportsData.transaction_report?.summary?.reversal_count ?? 0})`],
      ['Manual Credit Adjustments', `₦${reportsData.transaction_report?.summary?.manual_adjustment_credit_volume ?? 0}`],
      ['Manual Debit Adjustments', `₦${reportsData.transaction_report?.summary?.manual_adjustment_debit_volume ?? 0}`],
      [],
      ['3. WALLET & FLOAT REPORT'],
      ['System Float in Circulation', `₦${reportsData.wallet_report?.system_float ?? 0}`],
      ['Active Wallets Count', reportsData.wallet_report?.total_wallets ?? 0],
      ['Average Wallet Float', `₦${reportsData.wallet_report?.average_balance ?? 0}`],
      ['Negative Balances', reportsData.wallet_report?.negative_wallets ?? 0],
      ['Ledger Drift', `₦${reportsData.wallet_report?.ledger_reconciliation?.drift ?? 0}`],
      ['Ledger Balanced', reportsData.wallet_report?.ledger_reconciliation?.is_balanced ? 'YES' : 'NO'],
      [],
      ['4. FINANCIAL PROFIT REPORT'],
      ['Total Service Sales', `₦${reportsData.profit_report?.total_revenue ?? 0}`],
      ['Wholesale Provider Costs', `₦${reportsData.profit_report?.total_expenditure ?? 0}`],
      ['Gross Operating Profit', `₦${reportsData.profit_report?.gross_profit ?? 0}`],
      ['Gross Operating Margin', `${reportsData.profit_report?.margin_percent ?? 0}%`],
      [],
      ['11. REFERRAL & GROWTH ROI REPORT'],
      ['Total Referrals', String(referralReport?.summary?.total_referrals ?? 0)],
      ['Qualified Referrals', String(referralReport?.summary?.qualified_referrals ?? 0)],
      ['Referred Revenue', `₦${referralReport?.summary?.referred_revenue ?? 0}`],
      ['Total Reward Cost', `₦${referralReport?.summary?.total_reward_cost ?? 0}`],
      ['Net Referral Contribution', `₦${referralReport?.summary?.net_referral_contribution ?? 0}`],
      ['Referral ROI %', `${referralReport?.summary?.roi_percent ?? 0}%`],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `hambaktech_enterprise_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setFeedback({ type: 'success', message: 'Report CSV exported successfully.' });
  };

  const reportTabs = [
    { key: 'customer' as ReportKey, label: '1. Customer Report', icon: Users },
    { key: 'transaction' as ReportKey, label: '2. Transaction Report', icon: BarChart3 },
    { key: 'wallet' as ReportKey, label: '3. Wallet Report', icon: Wallet },
    { key: 'payment' as ReportKey, label: '4. Payment Report', icon: CreditCard },
    { key: 'nin' as ReportKey, label: '5. NIN Service Report', icon: Shield },
    { key: 'telecom' as ReportKey, label: '6. Telecom Report', icon: Tv },
    { key: 'provider' as ReportKey, label: '7. Provider Expenditure', icon: Cpu },
    { key: 'profit' as ReportKey, label: '8. Profit Report', icon: TrendingUp },
    { key: 'kyc' as ReportKey, label: '9. KYC Report', icon: UserCheck },
    { key: 'staff' as ReportKey, label: '10. Staff Activity Report', icon: FileText },
    { key: 'referral_growth' as ReportKey, label: '11. Referral & Growth ROI', icon: ArrowUpRight },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <BarChart3 className="w-3.5 h-3.5" />
            Executive Telemetry &bull; 11 Standard Reports
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Enterprise Financial &amp; Service Reports</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Reconcile all 11 core operational &amp; referral domains using live database records. Export full sets to JSON or CSV.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportJSON}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON (All 11)</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={loadReports}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
            title="Refresh Reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 11 Reports Nav Horizontal Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800">
        {reportTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeReport === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveReport(tab.key)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-24 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
          <p className="text-xs">Aggregating live MySQL data for report...</p>
        </div>
      ) : !reportsData ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
          <AlertCircle className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-white">No Report Data Available</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Report 1: Customer Report */}
          {activeReport === 'customer' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Total Registered Customers</p>
                  <p className="text-2xl font-bold text-white mt-1">{reportsData.customer_report?.total_customers ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Active Account Status</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{reportsData.customer_report?.active_customers ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-red-400 font-medium">Suspended Accounts</p>
                  <p className="text-2xl font-bold text-red-400 mt-1">{reportsData.customer_report?.suspended_customers ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-cyan-400 font-medium">Verified KYC Accounts</p>
                  <p className="text-2xl font-bold text-cyan-400 mt-1">{reportsData.customer_report?.verified_customers ?? 0}</p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white">Customer Float & Tier Aggregation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <p className="text-slate-400">Total Customer Wallet Balance</p>
                    <p className="text-xl font-bold text-white font-mono">
                      ₦{parseFloat(reportsData.customer_report?.total_customer_balance || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <p className="text-slate-400">Tier 2+ (NIN/BVN Linked) Customers</p>
                    <p className="text-xl font-bold text-indigo-400 font-mono">
                      {reportsData.customer_report?.tier2_plus_customers ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Report 2: Transaction Report */}
          {activeReport === 'transaction' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Total Transactions</p>
                  <p className="text-2xl font-bold text-white mt-1">{reportsData.transaction_report?.summary?.total_count ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Successful Volume</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    ₦{parseFloat(reportsData.transaction_report?.summary?.successful_volume || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-amber-400 font-medium">Pending Settlements</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">{reportsData.transaction_report?.summary?.pending_count ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-red-400 font-medium">Failed Transactions</p>
                  <p className="text-2xl font-bold text-red-400 mt-1">{reportsData.transaction_report?.summary?.failed_count ?? 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-cyan-400 font-medium">Auto-Refund Credits</p>
                  <p className="text-lg font-bold text-cyan-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.transaction_report?.summary?.refund_credit_volume || 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {reportsData.transaction_report?.summary?.refund_count ?? 0} refund entries
                  </p>
                </div>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-purple-400 font-medium">Ledger Reversals</p>
                  <p className="text-lg font-bold text-purple-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.transaction_report?.summary?.reversal_volume || 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {reportsData.transaction_report?.summary?.reversal_count ?? 0} reversal entries
                  </p>
                </div>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Manual Credits</p>
                  <p className="text-lg font-bold text-emerald-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.transaction_report?.summary?.manual_adjustment_credit_volume || 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Admin wallet credits</p>
                </div>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-rose-400 font-medium">Manual Debits</p>
                  <p className="text-lg font-bold text-rose-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.transaction_report?.summary?.manual_adjustment_debit_volume || 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Admin wallet debits</p>
                </div>
              </div>

              {/* Category Breakdown Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white">Turnover by Service Category</h3>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Transaction Count</th>
                      <th className="py-3 px-4">Gross Turnover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {(reportsData.transaction_report?.categories || []).map((cat: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-semibold text-white capitalize">{String(cat.category || 'general').replace(/_/g, ' ')}</td>
                        <td className="py-3 px-4 font-mono">{cat.count}</td>
                        <td className="py-3 px-4 font-mono text-emerald-400">₦{parseFloat(cat.volume || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report 3: Wallet Report */}
          {activeReport === 'wallet' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Total Customer Float</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    ₦{parseFloat(reportsData.wallet_report?.system_float || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Active Wallets</p>
                  <p className="text-2xl font-bold text-white mt-1">{reportsData.wallet_report?.total_wallets ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Average Balance</p>
                  <p className="text-2xl font-bold text-white font-mono mt-1">
                    ₦{parseFloat(reportsData.wallet_report?.average_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Negative Float Count</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{reportsData.wallet_report?.negative_wallets ?? 0}</p>
                </div>
              </div>

              {reportsData.wallet_report?.ledger_reconciliation && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-sm font-bold text-white">Wallet Ledger Reconciliation</h3>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${
                        reportsData.wallet_report.ledger_reconciliation.is_balanced
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {reportsData.wallet_report.ledger_reconciliation.is_balanced ? 'Balanced' : 'Drift Detected'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <p className="text-slate-400">Wallets Table Total</p>
                      <p className="text-base font-bold text-white font-mono mt-1">
                        ₦{Number(reportsData.wallet_report.ledger_reconciliation.wallets_total || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <p className="text-slate-400">Users Mirror Total</p>
                      <p className="text-base font-bold text-white font-mono mt-1">
                        ₦{Number(reportsData.wallet_report.ledger_reconciliation.users_total || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <p className="text-slate-400">Reconciliation Drift</p>
                      <p
                        className={`text-base font-bold font-mono mt-1 ${
                          reportsData.wallet_report.ledger_reconciliation.is_balanced ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ₦{Number(reportsData.wallet_report.ledger_reconciliation.drift || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Report 4: Payment Report */}
          {activeReport === 'payment' && (
            <div className="space-y-4">
              {reportsData.payment_summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                    <p className="text-xs text-slate-400 font-medium">Paystack Checkout Credits</p>
                    <p className="text-xl font-bold text-emerald-400 font-mono mt-1">
                      ₦{Number(reportsData.payment_summary.paystack_checkout?.wallet_credits || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Gross ₦{Number(reportsData.payment_summary.paystack_checkout?.gross || 0).toLocaleString()} &bull; Fees ₦{Number(reportsData.payment_summary.paystack_checkout?.fees || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                    <p className="text-xs text-indigo-400 font-medium">Paystack DVA Credits</p>
                    <p className="text-xl font-bold text-indigo-400 font-mono mt-1">
                      ₦{Number(reportsData.payment_summary.paystack_dva?.wallet_credits || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Gross ₦{Number(reportsData.payment_summary.paystack_dva?.gross || 0).toLocaleString()} &bull; Fees ₦{Number(reportsData.payment_summary.paystack_dva?.fees || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                    <p className="text-xs text-amber-400 font-medium">Other / Historical Gateways</p>
                    <p className="text-xl font-bold text-amber-400 font-mono mt-1">
                      ₦{Number(reportsData.payment_summary.other_gateways?.wallet_credits || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Fees ₦{Number(reportsData.payment_summary.other_gateways?.fees || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                    <p className="text-xs text-slate-300 font-medium">Total Wallet Credits (Unique)</p>
                    <p className="text-xl font-bold text-white font-mono mt-1">
                      ₦{Number(reportsData.payment_summary.total_wallet_credits || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Net Settlement ₦{Number(reportsData.payment_summary.total_net_settlement || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">Payment Gateway Settlement Reconciliation (No Double-Counting)</h3>
                  <span className="text-[11px] text-slate-400">Paystack Checkout and Paystack DVA separated</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Gateway Channel</th>
                        <th className="py-3 px-4 text-right">Gross Deposits</th>
                        <th className="py-3 px-4 text-right">Gateway Fees</th>
                        <th className="py-3 px-4 text-right">Net Settlement</th>
                        <th className="py-3 px-4 text-right">Wallet Credits</th>
                        <th className="py-3 px-4 text-right">Success</th>
                        <th className="py-3 px-4 text-right">Pending</th>
                        <th className="py-3 px-4 text-right">Failed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {(reportsData.payment_report || []).map((gw: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-semibold text-white uppercase">
                            {String(gw.gateway || 'MANUAL').replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-white">
                            ₦{parseFloat(gw.gross_amount ?? gw.total_amount ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-400">
                            ₦{parseFloat(gw.fees || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-300">
                            ₦{parseFloat(gw.net_settlement ?? gw.settled_amount ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            ₦{parseFloat(gw.settled_amount ?? gw.total_amount ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-400">{gw.successful_count}</td>
                          <td className="py-3 px-4 text-right font-mono text-amber-400">{gw.pending_count}</td>
                          <td className="py-3 px-4 text-right font-mono text-red-400">{gw.failed_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Report 5: NIN Service Report */}
          {activeReport === 'nin' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Total Verifications</p>
                  <p className="text-2xl font-bold text-white mt-1">{reportsData.nin_service_report?.summary?.total_requests ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Completed Lookups</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{reportsData.nin_service_report?.summary?.completed_requests ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-cyan-400 font-medium">Total Revenue</p>
                  <p className="text-2xl font-bold text-cyan-400 font-mono mt-1">
                    ₦{parseFloat(reportsData.nin_service_report?.summary?.total_revenue || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Wholesale Cost</p>
                  <p className="text-2xl font-bold text-slate-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.nin_service_report?.summary?.total_wholesale_cost || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white">NIN & BVN Service Code Performance</h3>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Service Code</th>
                      <th className="py-3 px-4">Lookups</th>
                      <th className="py-3 px-4">Completed</th>
                      <th className="py-3 px-4">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {(reportsData.nin_service_report?.breakdown || []).map((srv: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-white uppercase">{srv.service_code}</td>
                        <td className="py-3 px-4 font-mono">{srv.count}</td>
                        <td className="py-3 px-4 font-mono text-emerald-400">{srv.completed}</td>
                        <td className="py-3 px-4 font-mono text-cyan-400">₦{parseFloat(srv.revenue || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report 6: Telecom Report */}
          {activeReport === 'telecom' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Telecom Orders</p>
                  <p className="text-2xl font-bold text-white mt-1">{reportsData.telecom_report?.summary?.total_orders ?? 0}</p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Total Telecom Sales</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    ₦{parseFloat(reportsData.telecom_report?.summary?.total_sales || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Cost Price</p>
                  <p className="text-2xl font-bold text-slate-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.telecom_report?.summary?.total_cost || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-cyan-400 font-medium">Telecom Profit</p>
                  <p className="text-2xl font-bold text-cyan-400 font-mono mt-1">
                    +₦{parseFloat(reportsData.telecom_report?.summary?.gross_profit || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white">Network Breakdown (MTN, GLO, AIRTEL, 9MOBILE)</h3>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Network</th>
                      <th className="py-3 px-4">Orders</th>
                      <th className="py-3 px-4">Sales</th>
                      <th className="py-3 px-4">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {(reportsData.telecom_report?.networks || []).map((net: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-white uppercase">{net.network}</td>
                        <td className="py-3 px-4 font-mono">{net.orders_count}</td>
                        <td className="py-3 px-4 font-mono text-emerald-400">₦{parseFloat(net.sales || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 font-mono text-cyan-400">+₦{parseFloat(net.profit || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report 7: Provider Expenditure Report */}
          {activeReport === 'provider' && (
            <div className="space-y-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white">Administrative Provider Expenditure Overview</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Internal upstream connection telemetry. Strictly withheld from non-admin customer interfaces.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Total Upstream Wholesale Cost</span>
                  <p className="text-2xl font-bold font-mono text-indigo-400">
                    ₦{parseFloat(reportsData.provider_expenditure_report?.total_cost || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Provider</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Active</th>
                      <th className="py-3 px-4">Balance</th>
                      <th className="py-3 px-4">Latency</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {(reportsData.provider_expenditure_report?.providers || []).map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-white">{p.name}</td>
                        <td className="py-3 px-4 uppercase text-[10px] font-mono text-slate-400">{p.provider_type}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-cyan-400">₦{parseFloat(p.balance || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{p.last_ping_latency || '42ms'}</td>
                        <td className="py-3 px-4">
                          <span className="text-emerald-400 font-semibold">{p.last_ping_status || 'HEALTHY'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report 8: Profit Report */}
          {activeReport === 'profit' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Total Platform Sales</p>
                  <p className="text-2xl font-bold text-white font-mono mt-1">
                    ₦{parseFloat(reportsData.profit_report?.total_revenue || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Wholesale COGS</p>
                  <p className="text-2xl font-bold text-slate-300 font-mono mt-1">
                    ₦{parseFloat(reportsData.profit_report?.total_expenditure || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-emerald-400 font-medium">Gross Profit</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    +₦{parseFloat(reportsData.profit_report?.gross_profit || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-xs text-cyan-400 font-medium">Gross Profit Margin</p>
                  <p className="text-2xl font-bold text-cyan-400 font-mono mt-1">
                    {reportsData.profit_report?.margin_percent || 0}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Report 9: KYC Report */}
          {activeReport === 'kyc' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <p className="text-xs text-slate-400 font-medium">Total Submissions</p>
                <p className="text-2xl font-bold text-white mt-1">{reportsData.kyc_report?.total_submissions ?? 0}</p>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <p className="text-xs text-emerald-400 font-medium">Approved Submissions</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{reportsData.kyc_report?.approved_count ?? 0}</p>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <p className="text-xs text-amber-400 font-medium">Pending Review</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{reportsData.kyc_report?.pending_count ?? 0}</p>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <p className="text-xs text-indigo-400 font-medium">Tier 2 Submissions</p>
                <p className="text-2xl font-bold text-indigo-400 mt-1">{reportsData.kyc_report?.tier2_count ?? 0}</p>
              </div>
            </div>
          )}

          {/* Report 11: Staff Activity Report */}
          {activeReport === 'staff' && (
            <div className="space-y-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Staff Activity & Compliance Audit Trail</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Chronological record of root actions and administrative wallet adjustments.</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Total Audit Events</span>
                  <p className="text-xl font-bold font-mono text-indigo-400">
                    {reportsData.staff_activity_report?.total_audit_events ?? 0}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Entity</th>
                      <th className="py-3 px-4">Target ID</th>
                      <th className="py-3 px-4">IP Address</th>
                      <th className="py-3 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {(reportsData.staff_activity_report?.recent_events || []).map((ev: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-400">{ev.action}</td>
                        <td className="py-3 px-4 capitalize text-slate-300">{ev.entity}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{ev.entity_id || 'System'}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{ev.ip_address || '127.0.0.1'}</td>
                        <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                          {ev.created_at ? new Date(ev.created_at).toLocaleString() : 'Recent'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report 12: Referral & Growth ROI Report */}
          {activeReport === 'referral_growth' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-end gap-3 text-xs">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">From Date</label>
                  <input
                    type="date"
                    value={refDateFrom}
                    onChange={(e) => setRefDateFrom(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">To Date</label>
                  <input
                    type="date"
                    value={refDateTo}
                    onChange={(e) => setRefDateTo(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Campaign Code</label>
                  <input
                    type="text"
                    placeholder="Optional code"
                    value={refCampaignCode}
                    onChange={(e) => setRefCampaignCode(e.target.value.toUpperCase())}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadReports()}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Apply Filters
                </button>
              </div>

              {referralReport && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                      <p className="text-xs text-slate-400">Referred Revenue</p>
                      <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                        ₦{Number(referralReport.summary.referred_revenue || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                      <p className="text-xs text-slate-400">Total Reward Cost</p>
                      <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
                        ₦{Number(referralReport.summary.total_reward_cost || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                      <p className="text-xs text-slate-400">Net Contribution</p>
                      <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                        ₦{Number(referralReport.summary.net_referral_contribution || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                      <p className="text-xs text-slate-400">Conversion Rate / ROI</p>
                      <p className="text-2xl font-bold font-mono text-white mt-1">
                        {referralReport.summary.conversion_rate_percent}% / {referralReport.summary.roi_percent}%
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800">
                      <h3 className="text-sm font-bold text-white">Top Performing Affiliates</h3>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Referrer</th>
                          <th className="py-3 px-4">Code</th>
                          <th className="py-3 px-4">Referred / Qualified</th>
                          <th className="py-3 px-4">Generated Revenue</th>
                          <th className="py-3 px-4">Rewards Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {referralReport.top_referrers.map((tr) => (
                          <tr key={tr.id} className="hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-semibold text-white">{tr.full_name}</td>
                            <td className="py-3 px-4 font-mono text-indigo-400">{tr.referral_code}</td>
                            <td className="py-3 px-4 font-mono">
                              {tr.total_referred} / <span className="text-emerald-400">{tr.qualified_count}</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-emerald-400">
                              ₦{Number(tr.generated_revenue || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 font-mono text-cyan-400">
                              ₦{Number(tr.rewards_earned || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
