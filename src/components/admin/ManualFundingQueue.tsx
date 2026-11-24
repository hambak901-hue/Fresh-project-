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
  ShieldCheck,
  Landmark,
  Clock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { PaystackDvaAdminStatusResponse } from '../../types';

export function ManualFundingQueue() {
  const [activeSubTab, setActiveSubTab] = useState<'adjust' | 'reports' | 'gateways'>('adjust');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Financial Reports State
  const [financialReports, setFinancialReports] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Gateway Management & Paystack DVA State
  const [gateways, setGateways] = useState<any[]>([]);
  const [dvaStatus, setDvaStatus] = useState<PaystackDvaAdminStatusResponse | null>(null);
  const [dvaLoading, setDvaLoading] = useState(false);
  const [requeryingUserId, setRequeryingUserId] = useState<string | null>(null);
  const [actioningUserId, setActioningUserId] = useState<string | null>(null);
  const [resolvingSettlementKey, setResolvingSettlementKey] = useState<string | null>(null);

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
    loadDvaStatus();
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

  const loadDvaStatus = async () => {
    setDvaLoading(true);
    try {
      const res = await api.getAdminPaystackDvaStatus();
      setDvaStatus(res);
    } catch (e) {
    } finally {
      setDvaLoading(false);
    }
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

  const handleRequeryCustomerDva = async (userId: string) => {
    setRequeryingUserId(userId);
    setMessage(null);
    try {
      const res = await api.requeryAdminPaystackDva(userId);
      setMessage({ type: 'success', text: res.message || 'Paystack DVA status synchronized.' });
      await loadDvaStatus();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to sync/requery Paystack DVA.' });
    } finally {
      setRequeryingUserId(null);
    }
  };

  const handleAdminDvaAction = async (
    userId: string,
    action: 'provision' | 'suspend' | 'reactivate' | 'deactivate' | 'mark_under_review'
  ) => {
    setActioningUserId(`${userId}:${action}`);
    setMessage(null);
    try {
      const res = await api.adminPaystackDvaAction(userId, action);
      setMessage({ type: 'success', text: res.message || `DVA ${action} completed.` });
      await loadDvaStatus();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || `Failed to ${action} dedicated account.` });
    } finally {
      setActioningUserId(null);
    }
  };

  const handleResolveSettlement = async (settlementId: string, action: 'reverify' | 'mark_failed') => {
    setResolvingSettlementKey(`${settlementId}:${action}`);
    setMessage(null);
    try {
      const res = await api.resolvePaystackDvaSettlement(settlementId, action);
      setMessage({
        type: 'success',
        text: res.message || `DVA settlement ${action === 'reverify' ? 're-verified with Paystack' : 'marked failed'}.`,
      });
      await Promise.all([loadDvaStatus(), loadReports()]);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Unable to process quarantined DVA settlement.' });
    } finally {
      setResolvingSettlementKey(null);
    }
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
              loadDvaStatus();
            }}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${reportsLoading || dvaLoading ? 'animate-spin' : ''}`} />
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
                  <h3 className="text-sm font-bold text-white">Funding Source Breakdown (Separated &amp; Verified)</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div>
                        <span className="text-slate-300 font-medium block">Paystack Checkout (Card / USSD / Bank Transfer):</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {financialReports.funding.paystackCheckoutCount || 0} txns &bull; Gross ₦{(financialReports.funding.paystackCheckoutGross ?? financialReports.funding.paystackFunding ?? 0).toLocaleString()} &bull; Fees ₦{(financialReports.funding.paystackCheckoutFees || 0).toLocaleString()}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-400 font-bold">
                        ₦{(financialReports.funding.paystackCheckoutFunding ?? financialReports.funding.paystackFunding ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div>
                        <span className="text-slate-300 font-medium block">Paystack Dedicated Virtual Accounts (Wallet Credits):</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {financialReports.funding.paystackDvaAccounts || 0} active DVAs &bull; {financialReports.funding.paystackDvaCount || 0} settled &bull; Gross ₦{(financialReports.funding.paystackDvaGross || 0).toLocaleString()} &bull; Cust Fee ₦{(financialReports.funding.paystackDvaCustomerFees || 0).toLocaleString()} &bull; Merch Fee ₦{(financialReports.funding.paystackDvaMerchantFees || 0).toLocaleString()} &bull; Net Paystack ₦{(financialReports.funding.paystackDvaNetSettlement || 0).toLocaleString()}
                          {(financialReports.funding.paystackDvaQuarantinedCount || 0) > 0 ? ` • ${financialReports.funding.paystackDvaQuarantinedCount} under review` : ''}
                          {(financialReports.funding.paystackDvaReversed || 0) > 0 ? ` • Reversed ₦${Number(financialReports.funding.paystackDvaReversed).toLocaleString()}` : ''}
                        </span>
                      </div>
                      <span className="font-mono text-indigo-400 font-bold">
                        ₦{(financialReports.funding.paystackDvaNet || 0).toLocaleString()}
                      </span>
                    </div>
                    {(financialReports.funding.flutterwaveFunding || 0) > 0 && (
                      <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Other Gateways / Legacy Flutterwave (Historical):</span>
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Total Gross</span>
                        <span className="text-white font-bold">₦{(financialReports.funding.totalGrossDeposits ?? financialReports.funding.totalFunding ?? 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Total Fees</span>
                        <span className="text-rose-400 font-bold">₦{(financialReports.funding.totalGatewayFees ?? financialReports.funding.paystackDvaFees ?? 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Net Settlement</span>
                        <span className="text-emerald-300 font-bold">₦{(financialReports.funding.totalNetSettlements ?? financialReports.funding.totalFunding ?? 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Wallet Credits</span>
                        <span className="text-indigo-400 font-bold">₦{(financialReports.funding.totalWalletCredits ?? financialReports.funding.totalFunding ?? 0).toLocaleString()}</span>
                      </div>
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

          {/* Paystack Dedicated Virtual Accounts (Auto-Generated) Panel */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">
                    Paystack Dedicated Virtual Accounts (Auto-Generated)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Accounts are requested directly from Paystack&apos;s official API and settled automatically via signed webhooks into the single customer wallet ledger. Manual account entry and deposit approvals are permanently disabled.
                </p>
              </div>
              <button
                type="button"
                onClick={loadDvaStatus}
                disabled={dvaLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dvaLoading ? 'animate-spin' : ''}`} />
                <span>Check Live Capability</span>
              </button>
            </div>

            {/* Live Paystack Capability Banner */}
            {dvaStatus?.capability && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  dvaStatus.capability.capable
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-bold">
                  <span className="flex items-center gap-2">
                    {dvaStatus.capability.capable ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span>
                      {dvaStatus.capability.capable
                        ? 'Paystack Dedicated Virtual Accounts Enabled on Merchant Account'
                        : 'Paystack DVA Live Eligibility / Activation Check'}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950/60 border border-slate-700/60">
                    Policy: {dvaStatus.policy.enable_paystack_dva ? 'Enabled' : 'Paused'} &bull; Rollout:{' '}
                    {dvaStatus.policy.dva_rollout_mode === 'all_eligible'
                      ? 'All Eligible'
                      : dvaStatus.policy.dva_rollout_mode === 'paused'
                      ? 'Paused'
                      : `Testing Allowlist (${dvaStatus.policy.dva_test_user_emails?.length || 0})`}
                    {' '}&bull; Bearer: {dvaStatus.policy.fee_bearer}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed">{dvaStatus.capability.message}</p>

                {dvaStatus.capability.capable && dvaStatus.capability.providers?.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {dvaStatus.capability.providers.map((p, idx) => (
                      <span
                        key={`${p.provider_slug || idx}`}
                        className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-emerald-500/30 text-[11px] font-mono text-emerald-300"
                      >
                        {p.bank_name || p.provider_slug} ({p.provider_slug})
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-100/80 pt-1 space-y-1">
                    <div className="font-semibold">Required Paystack Merchant Go-Live Checklist:</div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>Complete Paystack Registered Business compliance &amp; Go-Live approval in Paystack Dashboard.</li>
                      <li>Request Dedicated Virtual Accounts activation under Paystack Settings &rarr; Preferences / Compliance.</li>
                      <li>Configure server <code>PAYSTACK_SECRET_KEY</code> and set Paystack Webhook URL to <code>/api/wallet/paystack/webhook</code>.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* DVA Summary KPIs & Separated Reconciliation Breakdown */}
            {dvaStatus?.totals && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Active DVAs</div>
                    <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                      {dvaStatus.totals.assigned_accounts}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Processing</div>
                    <div className="text-xl font-black font-mono text-amber-400 mt-1">
                      {dvaStatus.totals.pending_accounts}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Under Review</div>
                    <div className="text-xl font-black font-mono text-sky-400 mt-1">
                      {dvaStatus.totals.under_review_count ?? 0}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Disputed / Reversed</div>
                    <div className="text-xl font-black font-mono text-rose-400 mt-1">
                      {(dvaStatus.totals.disputed_count ?? 0) + (dvaStatus.totals.reversed_count ?? 0)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Gross Deposits</div>
                    <div className="text-xl font-black font-mono text-white mt-1">
                      ₦{Number(dvaStatus.totals.total_gross || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Net Paystack Settled</div>
                    <div className="text-xl font-black font-mono text-emerald-300 mt-1">
                      ₦{Number(dvaStatus.totals.net_settlement ?? Math.max(0, (dvaStatus.totals.total_gross || 0) - (dvaStatus.totals.total_paystack_fees || 0))).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Wallet Liability Created</div>
                    <div className="text-xl font-black font-mono text-indigo-400 mt-1">
                      ₦{Number(dvaStatus.totals.wallet_liability_created ?? dvaStatus.totals.total_net_credited ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Customer-Borne Fees</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      ₦{Number(dvaStatus.totals.customer_borne_fees || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Merchant-Borne Fees</div>
                    <div className="font-bold text-rose-400 mt-0.5">
                      ₦{Number(dvaStatus.totals.merchant_borne_fees || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Total Paystack Fees</div>
                    <div className="font-bold text-slate-200 mt-0.5">
                      ₦{Number(dvaStatus.totals.total_paystack_fees || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Quarantined Amount</div>
                    <div className="font-bold text-sky-300 mt-0.5">
                      ₦{Number(dvaStatus.totals.under_review_amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Reversed Deposits</div>
                    <div className="font-bold text-rose-300 mt-0.5">
                      ₦{Number(dvaStatus.totals.reversed_amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Read-Only Paystack-Generated Customer Accounts Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Paystack-Generated Customer Accounts ({dvaStatus?.accounts?.length || 0})
                </h4>
                <span className="text-[11px] text-slate-500">Official Paystack assignments &bull; Lifecycle governed</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Account #</th>
                      <th className="px-4 py-3">Bank</th>
                      <th className="px-4 py-3">Paystack Customer Ref</th>
                      <th className="px-4 py-3">Provisioning Status</th>
                      <th className="px-4 py-3 text-right">Total Inflow</th>
                      <th className="px-4 py-3 text-right">Lifecycle &amp; Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {!dvaStatus?.accounts?.length ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          No Paystack dedicated virtual accounts have been requested or assigned yet.
                        </td>
                      </tr>
                    ) : (
                      dvaStatus.accounts.map(acc => {
                        const prov = acc.provisioning_status || (acc.assignment_status === 'assigned' && acc.account_status === 'active' ? 'active' : acc.assignment_status);
                        return (
                          <tr key={acc.id} className="hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-white">{acc.customer_name || acc.user_id}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{acc.customer_email || ''}</div>
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                              {acc.account_number || <span className="text-amber-400">Pending</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-300">{acc.bank_name || '—'}</td>
                            <td className="px-4 py-3 font-mono text-slate-400">{acc.paystack_customer_code || '—'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  prov === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : prov === 'processing' || prov === 'pending_identification'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : prov === 'awaiting_customer_info' || prov === 'under_review'
                                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {String(prov).replace(/_/g, ' ')}
                              </span>
                              {acc.failure_reason && (
                                <div className="text-[10px] text-rose-400 mt-1 max-w-xs truncate" title={acc.failure_reason}>
                                  {acc.failure_reason}
                                </div>
                              )}
                              {acc.last_synced_at && (
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  Synced: {new Date(acc.last_synced_at).toLocaleDateString()}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-white">
                              ₦{Number(acc.total_inflow || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRequeryCustomerDva(acc.user_id)}
                                  disabled={requeryingUserId === acc.user_id}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1"
                                >
                                  <RefreshCw className={`w-3 h-3 ${requeryingUserId === acc.user_id ? 'animate-spin' : ''}`} />
                                  <span>Requery</span>
                                </button>
                                {(prov === 'awaiting_customer_info' || prov === 'failed' || prov === 'not_requested') && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDvaAction(acc.user_id, 'provision')}
                                    disabled={actioningUserId === `${acc.user_id}:provision`}
                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-semibold"
                                  >
                                    {actioningUserId === `${acc.user_id}:provision` ? '...' : 'Provision'}
                                  </button>
                                )}
                                {prov === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDvaAction(acc.user_id, 'suspend')}
                                    disabled={actioningUserId === `${acc.user_id}:suspend`}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-[11px] font-semibold"
                                  >
                                    Suspend
                                  </button>
                                )}
                                {(prov === 'suspended' || prov === 'under_review') && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDvaAction(acc.user_id, 'reactivate')}
                                    disabled={actioningUserId === `${acc.user_id}:reactivate`}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold"
                                  >
                                    Reactivate
                                  </button>
                                )}
                                {(prov === 'active' || prov === 'suspended') && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDvaAction(acc.user_id, 'deactivate')}
                                    disabled={actioningUserId === `${acc.user_id}:deactivate`}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-[11px] font-semibold"
                                  >
                                    Deactivate
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
            </div>

            {/* Recent Automated DVA Webhook Settlements Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Recent Automated DVA Webhook Settlements ({dvaStatus?.settlements?.length || 0})</span>
                </h4>
                <span className="text-[11px] text-slate-500">HMAC-SHA512 verified &bull; Idempotent ledger credit</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Paystack Ref</th>
                      <th className="px-4 py-3 text-right">Gross</th>
                      <th className="px-4 py-3 text-right">Paystack Fee</th>
                      <th className="px-4 py-3 text-right">Net Credit</th>
                      <th className="px-4 py-3">Bearer</th>
                      <th className="px-4 py-3">Status &amp; Audit</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {!dvaStatus?.settlements?.length ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                          No Paystack DVA inbound transfers settled yet.
                        </td>
                      </tr>
                    ) : (
                      dvaStatus.settlements.map(s => (
                        <tr key={s.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 text-slate-400 font-mono whitespace-nowrap">
                            {new Date(s.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{s.customer_name || s.user_id || 'Unmatched'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{s.account_number}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">
                            <div>{s.paystack_reference}</div>
                            {s.reversal_reference && (
                              <div className="text-[10px] text-rose-400">Rev: {s.reversal_reference}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-white">
                            ₦{Number(s.gross_amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-rose-400">
                            <div>₦{Number(s.paystack_fee).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</div>
                            {s.fee_confirmed === false && (
                              <div className="text-[9px] text-amber-400">Unconfirmed</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                            ₦{Number(s.net_credit_amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 uppercase text-[10px] font-mono text-slate-400">
                            {s.fee_bearer}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                s.settlement_status === 'settled'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : s.settlement_status === 'under_review'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : s.settlement_status === 'disputed'
                                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {s.settlement_status.replace(/_/g, ' ')}
                            </span>
                            {s.quarantine_reason && (
                              <div className="text-[10px] text-amber-300 font-mono mt-1 max-w-[180px] truncate" title={s.quarantine_reason}>
                                {s.quarantine_reason}
                              </div>
                            )}
                            {s.dispute_status && (
                              <div className="text-[10px] text-orange-300 font-mono mt-0.5">
                                Dispute: {s.dispute_status}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.settlement_status === 'under_review' ? (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleResolveSettlement(s.id, 'reverify')}
                                  disabled={resolvingSettlementKey !== null}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-semibold whitespace-nowrap"
                                >
                                  {resolvingSettlementKey === `${s.id}:reverify` ? '...' : 'Re-verify'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolveSettlement(s.id, 'mark_failed')}
                                  disabled={resolvingSettlementKey !== null}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 disabled:opacity-50 text-rose-300 text-[11px] font-semibold whitespace-nowrap"
                                >
                                  {resolvingSettlementKey === `${s.id}:mark_failed` ? '...' : 'Mark Failed'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
