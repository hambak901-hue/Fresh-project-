/**
 * @file OrdersReceiptsView.tsx
 * Dedicated Orders & Receipts page:
 * - Service filter & search across all Telecom & VTU orders
 * - Live reference status query tool (api.verifyTelecomTransaction)
 * - Strictly gates Official Receipt generation to confirmed 'successful' transactions
 * - Loads stored PIN vouchers for Airtime/Data PIN orders on demand
 */

import React, { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { TelecomOrder } from '../../../types';
import {
  CustomerAccountSnapshot,
  formatNaira,
  TransactionExecutionResult,
} from './types';
import { TelecomReceiptPage } from './TelecomShared';
import {
  CheckCircle2,
  Clock,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  AlertCircle,
} from 'lucide-react';

interface OrdersReceiptsViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  orders: TelecomOrder[];
  onRefreshOrders: () => Promise<void>;
}

const SERVICE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Services' },
  { value: 'airtime', label: 'Airtime' },
  { value: 'data', label: 'Data Bundles' },
  { value: 'airtime_pin', label: 'Airtime PINs' },
  { value: 'data_pin', label: 'Data PINs' },
  { value: 'airtime_swap', label: 'Airtime to Cash' },
  { value: 'cable', label: 'Cable TV' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'exam', label: 'Exam Cards' },
  { value: 'bulksms', label: 'Bulk SMS' },
];

export const OrdersReceiptsView: React.FC<OrdersReceiptsViewProps> = ({
  customerName,
  customerEmail,
  orders,
  onRefreshOrders,
}) => {
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [queryRef, setQueryRef] = useState<string>('');
  const [querying, setQuerying] = useState<boolean>(false);
  const [queryFeedback, setQueryFeedback] = useState<string | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<TransactionExecutionResult | null>(null);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((ord) => {
      const srv = (ord.service_type || ord.service || '').toLowerCase();
      if (serviceFilter !== 'all' && srv !== serviceFilter) return false;
      if (!q) return true;
      return (
        (ord.reference || '').toLowerCase().includes(q) ||
        (ord.provider_ref || '').toLowerCase().includes(q) ||
        (ord.phone || ord.recipient || '').toLowerCase().includes(q) ||
        (ord.plan || '').toLowerCase().includes(q) ||
        (ord.network || '').toLowerCase().includes(q)
      );
    });
  }, [orders, serviceFilter, searchTerm]);

  const handleVerifyRef = async (ref: string) => {
    const cleanRef = ref.trim();
    if (!cleanRef) return;
    setQuerying(true);
    setQueryFeedback(null);
    try {
      const res = await api.verifyTelecomTransaction(cleanRef);
      const nextStatus = res.order?.status || res.result?.status || 'checked';
      setQueryFeedback(`Reference ${cleanRef}: current status is ${String(nextStatus).toUpperCase()}.`);
      await onRefreshOrders();
    } catch (err: any) {
      setQueryFeedback(err?.message || `Unable to check reference ${cleanRef}.`);
    } finally {
      setQuerying(false);
    }
  };

  const handleOpenOfficialReceipt = async (order: TelecomOrder) => {
    if (order.status !== 'successful') return;
    const srv = (order.service_type || order.service || 'data') as Exclude<
      TransactionExecutionResult['serviceKey'],
      'history'
    >;

    let loadedVouchers = Array.isArray(order.vouchers) ? order.vouchers : [];
    if ((srv === 'airtime_pin' || srv === 'data_pin') && loadedVouchers.length === 0) {
      setLoadingOrderId(order.id);
      try {
        const res = await api.getTelecomOrderVouchers(order.id);
        loadedVouchers = res.vouchers || [];
      } catch {
        loadedVouchers = [];
      } finally {
        setLoadingOrderId(null);
      }
    }

    const meta = typeof order.metadata === 'object' && order.metadata ? order.metadata : {};
    setActiveReceipt({
      outcome: 'successful',
      serviceKey: srv,
      serviceTitle:
        SERVICE_FILTER_OPTIONS.find((opt) => opt.value === srv)?.label || 'Telecom & VTU Service',
      message: 'Official confirmed transaction receipt',
      reference: order.reference || order.provider_ref || order.id,
      timestamp: order.created_at,
      networkOrProvider: order.network || 'HAMBAKTECH',
      recipientLabel:
        srv === 'cable'
          ? 'Smartcard / IUC'
          : srv === 'electricity'
          ? 'Meter Number'
          : srv === 'airtime_pin' || srv === 'data_pin'
          ? 'Card Order'
          : 'Recipient',
      recipientValue: order.phone || order.recipient || '—',
      planOrDescription: order.plan || srv.toUpperCase(),
      nominalAmount: Number(order.face_value ?? meta.face_value ?? order.amount ?? 0),
      discountAmount: Number(order.discount_saved ?? meta.discount_saved ?? 0),
      netPayable: Number(order.amount || 0),
      order,
      vouchers: loadedVouchers,
      electricityToken: order.token || meta.token,
      electricityUnits: order.units || meta.units,
      examPins: Array.isArray(meta.cards) ? meta.cards : undefined,
    });
  };

  if (activeReceipt) {
    return (
      <div className="space-y-6">
        <TelecomReceiptPage
          result={activeReceipt}
          customerName={customerName}
          customerEmail={customerEmail}
          onBack={() => setActiveReceipt(null)}
          onNewOrder={() => setActiveReceipt(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Orders &amp; Receipts</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Track Telecom &amp; VTU transactions, verify pending orders, and print official receipts for successful orders.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRefreshOrders()}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh History</span>
          </button>
        </div>

        {/* Status Query & Filter Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none"
            >
              {SERVICE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search phone, meter, IUC, or reference..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none"
            />
          </div>

          <div className="lg:col-span-4 flex gap-2">
            <input
              type="text"
              value={queryRef}
              onChange={(e) => setQueryRef(e.target.value)}
              placeholder="Verify reference (HT-...)"
              className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white outline-none"
            />
            <button
              type="button"
              onClick={() => handleVerifyRef(queryRef)}
              disabled={querying || !queryRef.trim()}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
            >
              {querying ? 'Checking...' : 'Verify'}
            </button>
          </div>
        </div>

        {queryFeedback && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-slate-950 border border-blue-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200">
            {queryFeedback}
          </div>
        )}

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="p-10 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
            No matching telecom transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-bold">Date / Reference</th>
                  <th className="px-4 py-3 font-bold">Service &amp; Plan</th>
                  <th className="px-4 py-3 font-bold">Recipient</th>
                  <th className="px-4 py-3 font-bold text-right">Amount</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredOrders.map((order) => {
                  const status = (order.status || '').toLowerCase();
                  const isSuccess = status === 'successful';
                  const isPending = status === 'pending';
                  const displayRef = order.reference || order.provider_ref || order.id;
                  const srvLabel =
                    SERVICE_FILTER_OPTIONS.find(
                      (o) => o.value === (order.service_type || order.service || '').toLowerCase()
                    )?.label || (order.service_type || order.service || 'Order').toUpperCase();

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-950/60 transition"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {displayRef}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {new Date(order.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-bold text-slate-900 dark:text-white">{srvLabel}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          {order.network ? `${order.network} • ` : ''}
                          {order.plan}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top font-mono text-slate-800 dark:text-slate-200">
                        {order.phone || order.recipient || '—'}
                      </td>
                      <td className="px-4 py-3.5 align-top text-right font-mono font-extrabold text-slate-900 dark:text-white tabular-nums">
                        {formatNaira(order.amount)}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={`inline-flex items-center gap-1 font-bold uppercase text-[11px] ${
                            isSuccess
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : isPending
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : isPending ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{status || 'unknown'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-top text-right">
                        {isSuccess ? (
                          <button
                            type="button"
                            disabled={loadingOrderId === order.id}
                            onClick={() => handleOpenOfficialReceipt(order)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1.5 transition"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>{loadingOrderId === order.id ? 'Loading...' : 'Receipt'}</span>
                          </button>
                        ) : isPending ? (
                          <button
                            type="button"
                            disabled={querying}
                            onClick={() => handleVerifyRef(displayRef)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold inline-flex items-center gap-1.5 transition"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Check Status</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">No receipt</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
