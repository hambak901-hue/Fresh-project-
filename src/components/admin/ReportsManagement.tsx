import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Settings, Save, Download, RefreshCw, CheckCircle2, 
  AlertCircle, TrendingUp, DollarSign, PieChart, Calendar, FileText, ArrowUpRight
} from 'lucide-react';
import { api } from '../../lib/api';
import { AdminReportsData, ReportsSettings } from '../../types';

export const ReportsManagement: React.FC = () => {
  const [data, setData] = useState<AdminReportsData | null>(null);
  const [settings, setSettings] = useState<ReportsSettings>({
    status: 'coming_soon',
    coming_soon_message: 'Enterprise automated reporting, regulatory compliance reconciliations, and custom business analytics will be activated shortly.',
    default_range: '30d',
    timezone: 'Africa/Lagos (GMT+1)',
    auto_export_email: 'reports@hambaktech.com',
  });

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadReportsData = async () => {
    setLoading(true);
    try {
      const res = await api.getReportsAdmin();
      if (res && res.analytics) {
        setData(res);
        if (res.settings) {
          setSettings(res.settings);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load report analytics' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportsData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback(null);
    try {
      const res = await api.updateReportsSettings(settings);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Report settings saved successfully' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    const rows = [
      ['Metric', 'Value'],
      ['Total Transaction Volume', `₦${data.analytics.totalVolume}`],
      ['Total Customer Wallet Funding', `₦${data.analytics.totalFunding}`],
      ['Gross Operating Margin', `₦${data.analytics.estimatedGrossMargin}`],
      ['Total Processed Transactions', data.analytics.transactionCount],
      ['Telecom Orders', data.analytics.ordersCount],
      ['Identity Verifications', data.analytics.verificationsCount],
      ...Object.entries(data.analytics.categoryBreakdown).map(([cat, val]) => [
        `Category: ${cat}`, `₦${val}`
      ])
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hambaktech_admin_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback({ type: 'success', message: 'CSV report downloaded successfully' });
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <BarChart3 className="w-3.5 h-3.5" />
            Phase 8 • Financial & Service Reports
          </div>
          <h2 className="text-2xl font-bold text-white">Reports Administration & Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">
            Enterprise financial summaries, telecom margin tracking, regulatory compliance data, and automated scheduling.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={loadReportsData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* METRICS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Volume</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            ₦{(data?.analytics.totalVolume || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">Gross funds moved across all channels</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Estimated Gross Margin</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400">
            +₦{(data?.analytics.estimatedGrossMargin || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">Net platform earnings from services</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Customer Funding</span>
            <ArrowUpRight className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            ₦{(data?.analytics.totalFunding || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">Total credited to customer balances</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Processed Orders & Verifications</span>
            <PieChart className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            {(data?.analytics.ordersCount || 0) + (data?.analytics.verificationsCount || 0)}
          </p>
          <p className="text-[11px] text-slate-500">
            {data?.analytics.ordersCount || 0} telecom • {data?.analytics.verificationsCount || 0} verifications
          </p>
        </div>
      </div>

      {/* CATEGORY BREAKDOWN TABLE */}
      {data?.analytics.categoryBreakdown && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-cyan-400" />
            Financial Volume by Service Category
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(data.analytics.categoryBreakdown).map(([cat, val]) => (
              <div key={cat} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500">
                  {cat.replace(/_/g, ' ')}
                </p>
                <p className="text-sm font-bold font-mono text-white mt-1">
                  ₦{val.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPORTS SETTINGS CARD */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Reports Configuration & Module Settings</h3>
            <p className="text-xs text-slate-400">Controls Coming Soon status banner and auto-dispatch schedule</p>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Module Status</label>
              <select
                value={settings.status}
                onChange={(e) => setSettings({ ...settings, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="coming_soon">Coming Soon (Preview Live, Deep Exports Restricted)</option>
                <option value="active">Active (Full Enterprise Analytics Live)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Default Reporting Range</label>
              <select
                value={settings.default_range}
                onChange={(e) => setSettings({ ...settings, default_range: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="ytd">Year To Date (YTD)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Coming Soon Status Notice</label>
            <textarea
              rows={2}
              value={settings.coming_soon_message}
              onChange={(e) => setSettings({ ...settings, coming_soon_message: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Scheduled Export Recipient Email</label>
              <input
                type="email"
                value={settings.auto_export_email}
                onChange={(e) => setSettings({ ...settings, auto_export_email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Reconciliation Timezone</label>
              <input
                type="text"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 transition-colors shadow-lg shadow-cyan-600/20"
            >
              <Save className="w-4 h-4" />
              {savingSettings ? 'Saving Settings...' : 'Save Report Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
