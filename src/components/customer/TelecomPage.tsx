/**
 * @file TelecomPage.tsx
 * Telecommunications vending page for SME data bundles and VTU airtime recharge.
 * Direct carrier bridge via UlamaData and VTpass with sub-3s dispatch.
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TelecomOrder } from '../../types';
import {
  Smartphone,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Clock,
  History,
} from 'lucide-react';

export const TelecomPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'data' | 'airtime'>('data');
  const [selectedNetwork, setSelectedNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('mtn_1gb');
  const [recipientPhone, setRecipientPhone] = useState<string>('');

  // Airtime state
  const [airtimeNetwork, setAirtimeNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [airtimePhone, setAirtimePhone] = useState<string>('');
  const [airtimeAmount, setAirtimeAmount] = useState<number>(1000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Orders history
  const [orders, setOrders] = useState<TelecomOrder[]>([]);

  useEffect(() => {
    api.getTelecomPlans().then(res => {
      setPlans(res.plans || []);
      if (res.plans?.length) {
        setSelectedPlanId(res.plans[0].id);
      }
    });
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await api.getTelecomHistory();
      setOrders(res.orders || []);
    } catch (e) {}
  };

  const handlePurchaseData = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanPhone = recipientPhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 11) {
      setError('Please provide a valid 11-digit recipient phone number.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.purchaseData(selectedPlanId, cleanPhone);
      if (res.success) {
        setSuccessMsg(res.message);
        setRecipientPhone('');
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch data. Check wallet balance.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseAirtime = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanPhone = airtimePhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 11) {
      setError('Please provide a valid 11-digit phone number.');
      return;
    }

    if (airtimeAmount < 50) {
      setError('Minimum airtime recharge is ₦50.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.purchaseAirtime(airtimeNetwork, cleanPhone, airtimeAmount);
      if (res.success) {
        setSuccessMsg(res.message);
        setAirtimePhone('');
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to recharge airtime.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPlans = plans.filter(p => p.network === selectedNetwork);
  const selectedPlanObj = plans.find(p => p.id === selectedPlanId);

  // Airtime discount 2.5%
  const airtimeDiscount = Math.round((airtimeAmount * 2.5) / 100);
  const airtimePayable = airtimeAmount - airtimeDiscount;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <Smartphone className="w-4 h-4" />
          <span>Carrier Vending Bridges</span>
          <span className="text-slate-600">&bull;</span>
          <span>UlamaData &amp; VTpass Carrier Routing</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Telecommunications Hub
        </h1>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Purchase wholesale SME &amp; corporate data bundles and recharge airtime across all Nigerian mobile networks with guaranteed sub-3s delivery.
        </p>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start w-fit text-xs font-semibold">
        <button
          onClick={() => {
            setActiveTab('data');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'data' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>SME Data Bundles</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('airtime');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'airtime' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>VTU Airtime (2.5% Off)</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{successMsg}</div>
        </div>
      )}

      {/* Content Form & Preview */}
      {activeTab === 'data' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Data Form */}
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-white">Vending Parameters</h2>

            <form onSubmit={handlePurchaseData} className="space-y-5">
              {/* Network Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Select Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => {
                        setSelectedNetwork(net);
                        const first = plans.find(p => p.network === net);
                        if (first) setSelectedPlanId(first.id);
                      }}
                      className={`py-2.5 text-center rounded-xl text-xs font-bold transition-all border ${
                        selectedNetwork === net
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Plan List */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Select Data Package</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredPlans.map(plan => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`p-3 text-left rounded-xl border text-xs transition-all ${
                        selectedPlanId === plan.id
                          ? 'bg-slate-800 border-emerald-500/40 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-white">{plan.size}</div>
                      <div className="text-[10px] text-slate-500">{plan.validity}</div>
                      <div className="text-emerald-400 font-mono font-bold mt-1">₦{plan.price.toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Recipient Nigerian Phone Number</label>
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={e => setRecipientPhone(e.target.value)}
                  placeholder="e.g. 08123456789"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !selectedPlanObj}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Dispatching Data Bundle...</span>
                  </>
                ) : (
                  <>
                    <span>Dispatch {selectedPlanObj?.size || ''} (₦{selectedPlanObj?.price.toLocaleString()})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Summary Card */}
          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Carrier Integration Specs</h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Carrier Node:</span>
                <span className="font-semibold text-emerald-400">UlamaData High-Speed API</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Dispatch Speed:</span>
                <span className="font-mono text-white font-bold">&lt; 3 Seconds</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Available Wallet:</span>
                <span className="font-mono text-emerald-400 font-bold">₦{user?.wallet_balance.toLocaleString()}</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
              Data plans are automatically credited to the recipient line directly from sovereign telecom servers.
            </div>
          </div>
        </div>
      ) : (
        /* Airtime Form */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-white">Airtime VTU Recharge</h2>

            <form onSubmit={handlePurchaseAirtime} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Network Provider</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setAirtimeNetwork(net)}
                      className={`py-2.5 text-center rounded-xl text-xs font-bold transition-all border ${
                        airtimeNetwork === net
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number to Recharge</label>
                <input
                  type="tel"
                  value={airtimePhone}
                  onChange={e => setAirtimePhone(e.target.value)}
                  placeholder="e.g. 08031234567"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Recharge Value (₦)</label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={airtimeAmount}
                  onChange={e => setAirtimeAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[200, 500, 1000, 2000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAirtimeAmount(val)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-[11px]"
                    >
                      ₦{val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-[11px]">Instant 2.5% Cashback:</div>
                  <div className="text-emerald-400 font-bold font-mono">You Save: ₦{airtimeDiscount}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-400 text-[11px]">Amount Deducted:</div>
                  <div className="text-white font-extrabold font-mono text-base">₦{airtimePayable}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Recharging Airtime...</span>
                  </>
                ) : (
                  <>
                    <span>Recharge ₦{airtimeAmount} ({airtimeNetwork})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">VTU Gateway Specs</h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Gateway:</span>
                <span className="font-semibold text-amber-400">VTpass Airtime Direct Bridge</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Cashback Rate:</span>
                <span className="font-mono text-emerald-400 font-bold">2.5% Fixed Discount</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders History Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Recent Telecom Orders</h2>
          </div>
          <button
            onClick={loadOrders}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Service</th>
                <th className="py-2.5 px-4">Network</th>
                <th className="py-2.5 px-4">Plan / Value</th>
                <th className="py-2.5 px-4">Recipient</th>
                <th className="py-2.5 px-4">Cost</th>
                <th className="py-2.5 px-4">Reference</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No telecom orders placed yet.
                  </td>
                </tr>
              ) : (
                orders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-850/50">
                    <td className="py-3 px-4 font-bold text-white uppercase text-[11px]">{o.service}</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">{o.network}</td>
                    <td className="py-3 px-4 text-slate-200">{o.plan}</td>
                    <td className="py-3 px-4 font-mono">{o.phone}</td>
                    <td className="py-3 px-4 font-mono font-bold text-white">₦{o.amount.toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{o.provider_ref}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{new Date(o.created_at).toLocaleDateString('en-NG')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
