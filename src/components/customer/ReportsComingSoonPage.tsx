import React, { useState } from 'react';
import { BarChart3, Clock, TrendingUp, Download, PieChart, FileSpreadsheet, Bell, CheckCircle2, ArrowUpRight } from 'lucide-react';

export function ReportsComingSoonPage() {
  const [notified, setNotified] = useState(false);

  const upcomingFeatures = [
    {
      title: 'Real-Time Reseller Profit Margin Breakdown',
      icon: TrendingUp,
      color: 'text-emerald-400',
      description: 'Granular visualization of net profit generated per GB of data, airtime discount spreads, and NIN verification commissions.',
    },
    {
      title: 'Automated Daily & Monthly Excel / CSV Statements',
      icon: FileSpreadsheet,
      color: 'text-indigo-400',
      description: 'Schedule automated end-of-day transaction journals sent directly to your registered business email address.',
    },
    {
      title: 'Customer Sub-Agent Downline Analytics',
      icon: PieChart,
      color: 'text-amber-400',
      description: 'Track referral earnings, Tier 2 customer activity, and sub-reseller commissions across your network.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Module Status: Coming Soon</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Advanced Financial & Reseller Reports
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              In-depth profit margin calculations, cohort analytics, and automated tax accounting statements.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotified(!notified)}
            className={`px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition ${
              notified
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20'
            }`}
          >
            {notified ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Subscribed to Launch Update</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>Notify When Analytics Go Live</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feature Preview Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <span>Planned Analytics Capabilities</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">Q2 Roadmap</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {upcomingFeatures.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${feat.color}`} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{feat.title}</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{feat.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interim Tip */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between text-xs text-slate-400">
        <div>
          <p className="font-semibold text-white">Need immediate transaction records?</p>
          <p className="text-slate-400 mt-0.5">
            You can generate and export complete account statements right now from the <strong>My Wallet</strong> tab or review every entry on the <strong>Transactions</strong> page.
          </p>
        </div>
      </div>
    </div>
  );
}
