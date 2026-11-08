import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Clock, TrendingUp, Download, PieChart, FileSpreadsheet, 
  Bell, CheckCircle2, ArrowUpRight, DollarSign, Wallet, RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api';
import { CustomerReportsAnalytics, ReportsSettings } from '../../types';

export function ReportsComingSoonPage() {
  const [analytics, setAnalytics] = useState<CustomerReportsAnalytics | null>(null);
  const [settings, setSettings] = useState<ReportsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    api.getCustomerReports().then(res => {
      if (res?.success) {
        setAnalytics(res.analytics);
        setSettings(res.settings);
      }
    }).catch(err => {
      console.warn('Failed to load customer reports analytics:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleExportCSV = () => {
    if (!analytics) return;
    const rows = [
      ['Account Metric', 'Amount (NGN)'],
      ['Total Wallet Funding', analytics.totalFunded],
      ['Total Service Spend', analytics.totalSpent],
      ['Current Wallet Balance', analytics.currentBalance],
      ['Total Telecom Orders', analytics.ordersCount],
      ['Total Identity Verifications', analytics.verificationsCount],
      ['NIN Verification Spend', analytics.categoryBreakdown.nin_verification],
      ['BVN Verification Spend', analytics.categoryBreakdown.bvn_verification],
      ['Data Purchase Spend', analytics.categoryBreakdown.data_purchase],
      ['Airtime Recharge Spend', analytics.categoryBreakdown.airtime],
      ['Cable TV Spend', analytics.categoryBreakdown.cable_tv],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hambaktech_my_statement_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/70 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span>Module Status: Coming Soon • Phase 8 Financial Reports</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Customer Analytics & Spending Reports
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {settings?.coming_soon_message || 'In-depth profit margin calculations, cohort analytics, and automated tax accounting statements.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 transition border border-slate-700 shadow-sm"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Export My Statement (CSV)</span>
            </button>
            <button
              type="button"
              onClick={() => setNotified(!notified)}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition ${
                notified
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20'
              }`}
            >
              {notified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Subscribed</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  <span>Notify for Live Release</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* METRICS PREVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Lifetime Spend</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            ₦{(analytics?.totalSpent || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">Debited across verification & telecom</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Lifetime Funded</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400">
            ₦{(analytics?.totalFunded || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">Manual bank deposits + card gateways</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Services Dispatched</span>
            <PieChart className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            {(analytics?.ordersCount || 0) + (analytics?.verificationsCount || 0)} Completed
          </p>
          <p className="text-[11px] text-slate-500">
            {analytics?.verificationsCount || 0} verifications • {analytics?.ordersCount || 0} telecom orders
          </p>
        </div>
      </div>

      {/* SPENDING BY CATEGORY BREAKDOWN */}
      {analytics?.categoryBreakdown && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>Service Expenditure Breakdown</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <p className="text-[10px] uppercase font-mono text-slate-500">NIN Verification</p>
              <p className="text-sm font-bold font-mono text-white mt-1">
                ₦{analytics.categoryBreakdown.nin_verification.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <p className="text-[10px] uppercase font-mono text-slate-500">BVN Verification</p>
              <p className="text-sm font-bold font-mono text-white mt-1">
                ₦{analytics.categoryBreakdown.bvn_verification.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <p className="text-[10px] uppercase font-mono text-slate-500">Data Bundles</p>
              <p className="text-sm font-bold font-mono text-white mt-1">
                ₦{analytics.categoryBreakdown.data_purchase.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <p className="text-[10px] uppercase font-mono text-slate-500">Airtime VTU</p>
              <p className="text-sm font-bold font-mono text-white mt-1">
                ₦{analytics.categoryBreakdown.airtime.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <p className="text-[10px] uppercase font-mono text-slate-500">Cable TV</p>
              <p className="text-sm font-bold font-mono text-white mt-1">
                ₦{analytics.categoryBreakdown.cable_tv.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <p className="text-[10px] uppercase font-mono text-slate-500">Store / Supplies</p>
              <p className="text-sm font-bold font-mono text-white mt-1">
                ₦{analytics.categoryBreakdown.store_purchase.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Interim Notice */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between text-xs text-slate-400">
        <div>
          <p className="font-semibold text-white">Full Automated Daily Exporting Scheduled</p>
          <p className="text-slate-400 mt-0.5">
            Automatic end-of-day reconciliation journals will be dispatched to {settings?.auto_export_email || 'your registered email'} once full reports release is authorized.
          </p>
        </div>
      </div>
    </div>
  );
}
