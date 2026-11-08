import React, { useState } from 'react';
import { ShoppingBag, Clock, Sparkles, Bell, CheckCircle2, ShieldCheck, Cpu, CreditCard, ChevronRight } from 'lucide-react';

export function StoreComingSoonPage() {
  const [notified, setNotified] = useState(false);

  const previewItems = [
    {
      title: 'HambakTech Bluetooth Biometric Fingerprint Scanner',
      category: 'Hardware',
      price: '₦85,000',
      description: 'NIMC-certified optical biometric scanner with USB-C and Bluetooth for mobile NIN enrollments.',
      status: 'Stock Pre-order',
    },
    {
      title: 'Android Smart POS Terminal (4G + Thermal Printer)',
      category: 'POS Terminals',
      price: '₦120,000',
      description: 'Pre-provisioned HambakTech agency banking POS terminal with direct Moniepoint virtual settlement.',
      status: 'Allocation Staged',
    },
    {
      title: 'Enterprise VTU Reseller API Developer Key (Annual)',
      category: 'Software License',
      price: '₦50,000 / yr',
      description: 'Unlimited 99.9% uptime telecom and verification API webhooks with zero rate limits.',
      status: 'Beta Access',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Module Status: Coming Soon</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              HambakTech Hardware & Developer Store
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Official store for purchasing NIMC-certified biometric scanners, Agency POS terminals, and developer API licenses.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotified(!notified)}
            className={`px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition ${
              notified
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
            }`}
          >
            {notified ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>You'll be notified on launch</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>Notify Me When Live</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Catalog Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-400" />
            <span>Upcoming Catalog Preview</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">3 Products Staged</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {previewItems.map((item, idx) => (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
                    {item.category}
                  </span>
                  <span className="text-[11px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded">
                    {item.status}
                  </span>
                </div>
                <h3 className="font-bold text-white text-base">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">MSRP Target</p>
                  <p className="text-sm font-bold font-mono text-emerald-400">{item.price}</p>
                </div>
                <button
                  disabled
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 text-xs rounded-lg cursor-not-allowed font-medium"
                >
                  Coming Soon
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Admin notice */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 text-xs text-slate-400">
        <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
        <p>
          Store inventory and direct checkout are staged for official rollout in Phase 5. Store administrators will manage inventory logistics via the Super Admin Dashboard.
        </p>
      </div>
    </div>
  );
}
