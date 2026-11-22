/**
 * @file ManualFundingQueue.tsx
 * Admin Wallet Controls, Financial Ledger Administration & Paystack Gateway Status (Phase 7).
 * Allows admin to:
 * 1. Perform direct administrative wallet adjustments (Credit / Debit) with mandatory audit justification.
 * 2. View real-time Financial Administration Reports (Funding, Service Sales, Provider Expenditure, Gross Profit, and Float), including historical archived transfer totals.
 * 3. Review active Payment Gateway status (Paystack Sole Active Gateway).
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Building,
  TrendingUp,
  Wallet,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../lib/api';

export function ManualFundingQueue() {
  const [activeSubTab, setActiveSubTab] = useState<'adjust' | 'reports' | 'gateways'>('adjust');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Financial Reports State
  const [financialReports, setFinancialReports] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Gateway Management State
  const [gateways, setGateways] = useState<any[]>([]);

  // Direct Wallet Adjustment State
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustAmount, setAdjustAmount] = useState<number>(5000);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  useEffect(() => {
    loadReports();
    loadGateways();
    loadCustomers();
  }, []);

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const res = await api.getAdminFinancialReports();
      setFinancialReports(res.reports);
    } catch (e) {
      console.error(e);
    } finally {
      setReportsLoading(false);
    }
  };

  const loadGateways = async () => {
    try {
      const res = await api.getPaymentGateways();
      setGateways(res.gateways || []);
    } catch (e) {}
  };

  const loadCustomers = async () => {
    try {
      const res = await api.getAdminCustomers();
      setCustomers(res.customers || []);
      if (res.customers?.length) {
        setSelectedCustomerId(res.customers[0].id);
      }
    } catch (e) {}
  };

  const handleDirectAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !adjustAmount || adjustAmount <= 0) {
      setMessage({ type: 'error', text: 'Select customer and specify a positive amount.' });
      return;
    }
    if (!adjustReason || adjustReason.trim().length < 5) {
      setMessage({ type: 'error', text: 'A detailed reason (min 5 chars) is mandatory for audit logging.' });
      return;
    }

    setAdjustSubmitting(true);
    setMessage(null);
    try {
      const res = await api.adminAdjustWalletBalance({
        customerId: selectedCustomerId,
        type: adjustType,
        amount: adjustAmount,
        reason: adjustReason.trim(),
      });
      setMessage({ type: 'success', text: res.message });
      setAdjustReason('');
      await loadCustomers();
      await loadReports();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Wallet adjustment failed' });
    } finally {
      setAdjustSubmitting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleSwitchGateway = async (gatewayId: string) => {
    try {
      const res = await api.switchPaymentGateway(gatewayId);
      setMessage({ type: 'success', text: res.message });
      await loadGateways();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to switch gateway' });
    }
  };

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full mb-3">
              <Wallet className="w-3.5 h-3.5" />
              <span>Phase 07 Treasury, Ledger &amp; Paystack Controls</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Wallet Controls &amp; Paystack Gateway
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Exercise audited administrative wallet adjustments, review financial yield, and verify Paystack gateway status. Paystack is the sole active customer funding gateway.
            </p>
          </div>
          <button
            onClick={() => {
              loadReports();
              loadGateways();
              loadCustomers();
            }}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${reportsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Ledger</span>
          </button>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('adjust')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'adjust' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Direct Wallet Adjustment</span>
          </button>

          <button
            onClick={() => setActiveSubTab('reports')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'reports' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Financial &amp; Profit Reports</span>
          </button>

          <button
            onClick={() => setActiveSubTab('gateways')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'gateways' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Paystack Gateway</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold'
              : 'bg-red-500/10 border border-red-500/30 text-red-400 font-bold'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. DIRECT ADMINISTRATIVE WALLET ADJUSTMENT */}
      {/* ============================================================== */}
      {activeSubTab === 'adjust' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Administrative Balance Adjustment</span>
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                Audit Logged
              </span>
            </div>

            <form onSubmit={handleDirectAdjustment} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Target Customer</label>
                <select
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-indigo-500"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.email}) - Bal: ₦{c.wallet_balance?.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Operation Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAdjustType('credit')}
                    className={`py-3 text-center rounded-xl text-xs font-bold border transition-all ${
                      adjustType === 'credit'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    + Direct Credit (Deposit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('debit')}
                    className={`py-3 text-center rounded-xl text-xs font-bold border transition-all ${
                      adjustType === 'debit'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-400 font-black'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    - Direct Debit (Deduction)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Adjustment Amount (₦)</label>
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Administrative Reason &amp; Reference (Mandatory)
                </label>
                <textarea
                  rows={3}
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="e.g. Compensation for failed VTU transaction #TXN_48291 after manual ledger audit"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={adjustSubmitting}
                className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 ${
                  adjustType === 'credit' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {adjustSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Ledger Entry...</span>
                  </>
                ) : (
                  <span>
                    Execute {adjustType.toUpperCase()} of ₦{adjustAmount.toLocaleString()}
                  </span>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Target Account Inspection</h3>
            {selectedCustomerObj ? (
              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer Name:</span>
                    <span className="font-bold text-white">{selectedCustomerObj.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Email Address:</span>
                    <span className="font-mono text-slate-300">{selectedCustomerObj.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Balance:</span>
                    <span className="font-mono text-emerald-400 font-black text-sm">
                      ₦{selectedCustomerObj.wallet_balance?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Projected Balance:</span>
                    <span className="font-mono font-black text-sm text-indigo-400">
                      ₦{Math.max(
                        0,
                        selectedCustomerObj.wallet_balance +
                          (adjustType === 'credit' ? adjustAmount : -adjustAmount)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-slate-400 text-[11px] leading-relaxed">
                  <span className="font-bold text-amber-400">Audit Compliance:</span> Every manual credit or debit is permanently committed to the immutable database ledger and recorded in system audit logs with your administrator ID.
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">Select a customer above</div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. FINANCIAL & PROFIT REPORTS */}
      {/* ============================================================== */}
      {activeSubTab === 'reports' && (
        <div className="space-y-6">
          {reportsLoading || !financialReports ? (
            <div className="p-12 text-center text-xs text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              <span>Compiling financial ledger metrics...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Customer Float</div>
                  <div className="text-2xl font-black font-mono text-white">
                    ₦{financialReports.float.totalCustomerFloat.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Across {financialReports.float.totalCustomers} active wallets
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Wallet Funding</div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    ₦{financialReports.funding.totalFunding.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {financialReports.funding.fundingTransactionsCount} funding deposits
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Service Sales</div>
                  <div className="text-2xl font-black font-mono text-sky-400">
                    ₦{financialReports.sales.totalServiceSales.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Telecom &amp; Sovereign Identity
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Gross Platform Profit</div>
                  <div className="text-2xl font-black font-mono text-purple-400">
                    ₦{financialReports.profit.grossProfit.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-purple-300 font-bold">
                    Margin: {financialReports.profit.profitMarginPercent}%
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Funding Source Breakdown</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400">Paystack Online (Card/USSD):</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        ₦{(financialReports.funding.paystackFunding || 0).toLocaleString()}
                      </span>
                    </div>
                    {(financialReports.funding.flutterwaveFunding || 0) > 0 && (
                      <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Legacy Flutterwave (Historical):</span>
                        <span className="font-mono text-amber-400 font-bold">
                          ₦{(financialReports.funding.flutterwaveFunding || 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400">Manual Bank Transfers (Historical Archive):</span>
                      <span className="font-mono text-sky-400 font-bold">
                        ₦{(financialReports.funding.manualFunding || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Revenue vs Wholesale Cost</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400">Total Provider Expenditure:</span>
                      <span className="font-mono text-rose-400 font-bold">
                        ₦{financialReports.expenditure.totalProviderExpenditure.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400">Net Gross Profit:</span>
                      <span className="font-mono text-emerald-400 font-black text-sm">
                        ₦{financialReports.profit.grossProfit.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. PAYMENT GATEWAY CONFIGURATION (PAYSTACK ONLY) */}
      {/* ============================================================== */}
      {activeSubTab === 'gateways' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gateways.filter(g => g.id === 'paystack').map(g => (
              <div
                key={g.id}
                className={`p-6 rounded-2xl border transition-all ${
                  g.is_active
                    ? 'bg-slate-900 border-emerald-500/40 shadow-lg'
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-base font-bold text-white">{g.name}</h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      g.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {g.status === 'active' ? 'Operational' : 'Disabled'}
                  </span>
                </div>

                <div className="py-4 space-y-2 text-xs text-slate-400">
                  <p>
                    Sole active customer wallet funding gateway. Supports Mastercard, Visa, Verve, USSD banking, and Paystack instant bank transfers with HMAC-SHA512 webhook verification.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-mono">
                    Status: {g.is_active ? 'Primary Gateway' : g.status === 'active' ? 'Standby' : 'Disabled'}
                  </span>
                  {g.status !== 'active' ? (
                    <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 font-bold text-xs cursor-not-allowed">
                      Unavailable
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSwitchGateway(g.id)}
                      disabled={g.is_active}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        g.is_active
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {g.is_active ? 'Active Gateway' : 'Set as Primary'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
