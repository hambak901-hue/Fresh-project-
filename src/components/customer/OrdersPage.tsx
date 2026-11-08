import React, { useState, useEffect } from 'react';
import { Package, Smartphone, Wifi, Tv, Zap, Search, RefreshCw, CheckCircle2, Clock, XCircle, X } from 'lucide-react';
import { api } from '../../lib/api';
import { TelecomOrder } from '../../types';

export function OrdersPage() {
  const [orders, setOrders] = useState<TelecomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'data' | 'airtime' | 'cable' | 'electricity'>('all');
  const [selectedOrder, setSelectedOrder] = useState<TelecomOrder | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.getTelecomHistory();
      if (res?.orders) {
        setOrders(res.orders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filtered = orders.filter(o => {
    const matchesSearch =
      o.plan.toLowerCase().includes(search.toLowerCase()) ||
      o.phone.includes(search) ||
      o.network.toLowerCase().includes(search.toLowerCase()) ||
      o.provider_ref.toLowerCase().includes(search.toLowerCase());
    const matchesService = serviceFilter === 'all' || o.service === serviceFilter;
    return matchesSearch && matchesService;
  });

  const getServiceIcon = (service: string) => {
    switch (service) {
      case 'data':
        return <Wifi className="w-4 h-4 text-emerald-400" />;
      case 'airtime':
        return <Smartphone className="w-4 h-4 text-sky-400" />;
      case 'cable':
        return <Tv className="w-4 h-4 text-indigo-400" />;
      case 'electricity':
        return <Zap className="w-4 h-4 text-amber-400" />;
      default:
        return <Package className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Telecom & Service Orders
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Audit logs of data subscriptions, VTU airtime recharge, TV renewals, and electricity prepaid tokens.
            </p>
          </div>
          <button
            onClick={fetchOrders}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition self-start sm:self-auto"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Counts summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-slate-400">Total Vended Orders</p>
            <p className="text-lg font-bold font-mono text-white mt-0.5 tabular-nums">{orders.length}</p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-emerald-400">Data Top-ups</p>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5 tabular-nums">
              {orders.filter(o => o.service === 'data').length}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-sky-400">Airtime Recharges</p>
            <p className="text-lg font-bold font-mono text-sky-400 mt-0.5 tabular-nums">
              {orders.filter(o => o.service === 'airtime').length}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-amber-400">Bills & Utilities</p>
            <p className="text-lg font-bold font-mono text-amber-400 mt-0.5 tabular-nums">
              {orders.filter(o => o.service === 'cable' || o.service === 'electricity').length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by recipient phone, plan name, provider reference..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Services</option>
            <option value="data">Data Bundles</option>
            <option value="airtime">VTU Airtime</option>
            <option value="cable">Cable TV</option>
            <option value="electricity">Electricity</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-2">
            <Package className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="font-semibold text-slate-300">No orders found</p>
            <p className="text-xs text-slate-500">Your recent telecom purchases will show up here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3.5 px-4">Service / Plan</th>
                  <th className="py-3.5 px-4">Network / Provider</th>
                  <th className="py-3.5 px-4">Recipient</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4">Reference</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filtered.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="hover:bg-slate-800/40 cursor-pointer transition"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                          {getServiceIcon(order.service)}
                        </div>
                        <span className="font-medium text-white">{order.plan}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                        {order.network}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {order.phone}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums">
                      ₦{order.amount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[10px]">
                      {order.provider_ref}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                          order.status === 'successful'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : order.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {order.status === 'successful' && <CheckCircle2 className="w-3 h-3" />}
                        {order.status === 'pending' && <Clock className="w-3 h-3" />}
                        {order.status === 'failed' && <XCircle className="w-3 h-3" />}
                        <span>{order.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedOrder(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                {getServiceIcon(selectedOrder.service)}
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Order Receipt</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedOrder.id}</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Service Plan</span>
                <span className="font-semibold text-white">{selectedOrder.plan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Carrier / Network</span>
                <span className="font-mono text-white">{selectedOrder.network}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Recipient Target</span>
                <span className="font-mono text-white">{selectedOrder.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Paid</span>
                <span className="font-mono font-bold text-white">₦{selectedOrder.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Carrier Reference</span>
                <span className="font-mono text-slate-300">{selectedOrder.provider_ref}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">API Gateway</span>
                <span className="font-mono uppercase text-slate-300">{selectedOrder.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Delivery Status</span>
                <span className="capitalize font-semibold text-emerald-400">{selectedOrder.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp</span>
                <span className="font-mono text-slate-300">{new Date(selectedOrder.created_at).toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
