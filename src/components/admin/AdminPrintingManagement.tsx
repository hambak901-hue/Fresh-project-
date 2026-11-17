/**
 * @file AdminPrintingManagement.tsx
 * Admin & Authorised Staff Dashboard — Printing & Document Services Management Module.
 * Enforces 'printing' (Order Operations) and 'printing_pricing' (Pricing/Categories/Zones/Settings) RBAC.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  PrintingAdminMetrics,
  PrintingCategory,
  PrintingDeliveryZone,
  PrintingOrder,
  PrintingOrderHistoryItem,
  PrintingOrderMessage,
  PrintingOrderStatus,
  PrintingPaymentRecord,
  PrintingReportsData,
  PrintingSettings,
} from '../../types';
import {
  Printer,
  RefreshCw,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Send,
  Truck,
  Tag,
  Settings,
  BarChart3,
  CreditCard,
  Users,
  Plus,
  Edit3,
  Trash2,
  X,
  FileText,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

type AdminPrintingTab = 'orders' | 'pricing' | 'zones' | 'payments' | 'reports';

type QueueFilter =
  | 'all'
  | 'pending_requests'
  | 'quotations'
  | 'processing'
  | 'ready_collection'
  | 'ready_dispatch'
  | 'completed';

const ALL_STATUSES: PrintingOrderStatus[] = [
  'Pending Review',
  'Under Review',
  'Awaiting Quotation',
  'Quotation Sent',
  'Awaiting Payment',
  'Payment Confirmed',
  'Processing',
  'On Hold',
  'Ready for Collection',
  'Ready for Dispatch',
  'Out for Delivery',
  'Completed',
  'Rejected',
  'Cancelled',
  'Refunded',
];

function statusBadge(status: string): string {
  switch (status) {
    case 'Completed':
    case 'Payment Confirmed':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'Quotation Sent':
    case 'Awaiting Payment':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'Processing':
    case 'Out for Delivery':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'Ready for Collection':
    case 'Ready for Dispatch':
      return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    case 'On Hold':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'Rejected':
    case 'Cancelled':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'Refunded':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

export const AdminPrintingManagement: React.FC<{ initialOrderRef?: string }> = ({ initialOrderRef }) => {
  const { user } = useAuth();
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const isSuper = user?.role === 'superadmin' || perms.includes('*');
  const canOperateOrders = isSuper || perms.includes('printing');
  const canManagePricing = isSuper || perms.includes('printing_pricing');

  const [activeTab, setActiveTab] = useState<AdminPrintingTab>(canOperateOrders ? 'orders' : 'pricing');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Metrics & Data
  const [metrics, setMetrics] = useState<PrintingAdminMetrics | null>(null);
  const [orders, setOrders] = useState<PrintingOrder[]>([]);
  const [categories, setCategories] = useState<PrintingCategory[]>([]);
  const [zones, setZones] = useState<PrintingDeliveryZone[]>([]);
  const [payments, setPayments] = useState<PrintingPaymentRecord[]>([]);
  const [reports, setReports] = useState<PrintingReportsData | null>(null);
  const [settings, setSettings] = useState<PrintingSettings | null>(null);
  const [staffList, setStaffList] = useState<Array<{ id: string; full_name: string; email: string; role: string }>>([]);

  // Queue Filters
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Order Detail Modal State
  const [selectedOrder, setSelectedOrder] = useState<PrintingOrder | null>(null);
  const [detailHistory, setDetailHistory] = useState<PrintingOrderHistoryItem[]>([]);
  const [detailMessages, setDetailMessages] = useState<PrintingOrderMessage[]>([]);
  const [detailPayments, setDetailPayments] = useState<PrintingPaymentRecord[]>([]);
  const [detailBusy, setDetailBusy] = useState<boolean>(false);

  // Quote Form State
  const [qPrinting, setQPrinting] = useState<number>(0);
  const [qFinishing, setQFinishing] = useState<number>(0);
  const [qUrgent, setQUrgent] = useState<number>(0);
  const [qDiscount, setQDiscount] = useState<number>(0);
  const [qDelivery, setQDelivery] = useState<number>(0);
  const [qFreeDelivery, setQFreeDelivery] = useState<boolean>(false);
  const [qDepositEnabled, setQDepositEnabled] = useState<boolean>(false);
  const [qDepositPercent, setQDepositPercent] = useState<number>(50);
  const [qInternalCost, setQInternalCost] = useState<number>(0);
  const [qDueDate, setQDueDate] = useState<string>('');
  const [qNotes, setQNotes] = useState<string>('');

  // Status / Dispatch / Assignment / Offline Payment / Chat State
  const [statusInput, setStatusInput] = useState<PrintingOrderStatus>('Pending Review');
  const [statusNote, setStatusNote] = useState<string>('');
  const [trackingNote, setTrackingNote] = useState<string>('');
  const [refundToWallet, setRefundToWallet] = useState<boolean>(false);
  const [assignStaffId, setAssignStaffId] = useState<string>('');
  const [offPayAmount, setOffPayAmount] = useState<number>(0);
  const [offPayScope, setOffPayScope] = useState<'full' | 'deposit' | 'balance' | 'delivery'>('full');
  const [offPayGateway, setOffPayGateway] = useState<'cash' | 'pos' | 'manual_transfer'>('cash');
  const [offPayRef, setOffPayRef] = useState<string>('');
  const [offPayRemarks, setOffPayRemarks] = useState<string>('');
  const [adminMsgText, setAdminMsgText] = useState<string>('');
  const [adminMsgInternal, setAdminMsgInternal] = useState<boolean>(false);

  // Category Edit Modal State
  const [editingCat, setEditingCat] = useState<Partial<PrintingCategory> | null>(null);
  const [catSaving, setCatSaving] = useState<boolean>(false);

  // Zone Edit Modal State
  const [editingZone, setEditingZone] = useState<Partial<PrintingDeliveryZone> | null>(null);
  const [zoneSaving, setZoneSaving] = useState<boolean>(false);

  // Settings Save State
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const promises: Array<Promise<any>> = [
        api.getAdminPrintingMetrics().then(r => setMetrics(r)),
        api.getAdminPrintingCategories().then(r => setCategories(r.categories || [])),
        api.getAdminPrintingDeliveryZones().then(r => setZones(r.zones || [])),
        api.getAdminPrintingSettings().then(r => setSettings(r.settings)),
      ];

      if (canOperateOrders) {
        promises.push(
          api.getAdminPrintingOrders({
            category_key: categoryFilter !== 'all' ? categoryFilter : undefined,
            assigned_staff_id: staffFilter !== 'all' ? staffFilter : undefined,
            search: searchQuery.trim() || undefined,
          }).then(r => setOrders(r.orders || [])),
          api.getAdminPrintingPayments().then(r => setPayments(r.payments || [])),
          api.getAdminPrintingReports().then(r => setReports(r)),
          api.getAdminPrintingStaffList().then(r => setStaffList(r.staff || []))
        );
      }

      await Promise.all(promises);
    } catch (err: any) {
      setError(err.message || 'Failed to load printing management data.');
    } finally {
      setLoading(false);
    }
  }, [canOperateOrders, categoryFilter, staffFilter, searchQuery]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openOrder = useCallback(async (idOrRef: string) => {
    if (!canOperateOrders) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await api.getAdminPrintingOrderDetail(idOrRef);
      if (res.success && res.order) {
        const o = res.order;
        setSelectedOrder(o);
        setDetailHistory(res.history || []);
        setDetailMessages(res.messages || []);
        setDetailPayments(res.payments || []);

        setQPrinting(Number(o.printing_charge || o.estimated_printing_charge || 0));
        setQFinishing(Number(o.finishing_charge || 0));
        setQUrgent(Number(o.urgent_charge || 0));
        setQDiscount(Number(o.discount_amount || 0));
        setQDelivery(Number(o.delivery_charge || 0));
        setQFreeDelivery(Boolean(o.free_delivery_authorized));
        setQDepositEnabled(Boolean(o.deposit_enabled));
        setQDepositPercent(Number(o.deposit_percent || 50));
        setQInternalCost(Number(o.internal_production_cost || 0));
        setQDueDate(o.due_date ? String(o.due_date).slice(0, 10) : '');
        setQNotes(o.quote_notes || '');

        setStatusInput(o.status);
        setStatusNote('');
        setTrackingNote(o.tracking_note || '');
        setRefundToWallet(false);
        setAssignStaffId(o.assigned_staff_id || '');
        setOffPayAmount(Number(o.balance_due || o.total_amount || 0));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load order detail.');
    } finally {
      setDetailBusy(false);
    }
  }, [canOperateOrders]);

  useEffect(() => {
    if (initialOrderRef && canOperateOrders) {
      openOrder(initialOrderRef);
    }
  }, [initialOrderRef, canOperateOrders, openOrder]);

  const handlePreviewFile = async (fileUrl: string) => {
    try {
      const { blobUrl } = await api.fetchPrintingFileBlobUrl(fileUrl);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: any) {
      setError(err.message || 'Unable to preview uploaded file.');
    }
  };

  const handleSendQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await api.sendAdminPrintingQuote(selectedOrder.id, {
        printing_charge: qPrinting,
        finishing_charge: qFinishing,
        urgent_charge: qUrgent,
        discount_amount: qDiscount,
        delivery_charge: qFreeDelivery || selectedOrder.collection_method === 'office_collection' ? 0 : qDelivery,
        free_delivery_authorized: qFreeDelivery,
        deposit_enabled: qDepositEnabled,
        deposit_percent: qDepositPercent,
        internal_production_cost: qInternalCost,
        due_date: qDueDate || null,
        quote_notes: qNotes,
      });
      if (res.success) {
        setSuccess(res.message);
        await loadAll();
        await openOrder(selectedOrder.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send quotation.');
    } finally {
      setDetailBusy(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await api.updateAdminPrintingStatus(selectedOrder.id, {
        status: statusInput,
        note: statusNote,
        tracking_note: trackingNote,
        refund_to_wallet: refundToWallet,
      });
      if (res.success) {
        setSuccess(res.message);
        setStatusNote('');
        await loadAll();
        await openOrder(selectedOrder.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setDetailBusy(false);
    }
  };

  const handleConfirmDispatch = async () => {
    if (!selectedOrder) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await api.confirmAdminPrintingDispatch(selectedOrder.id, {
        tracking_note: trackingNote || 'Dispatched from HambakTech Printing Desk',
        mark_out_for_delivery: true,
      });
      if (res.success) {
        setSuccess(res.message);
        await loadAll();
        await openOrder(selectedOrder.id);
      }
    } catch (err: any) {
      setError(err.message || 'Dispatch confirmation blocked.');
    } finally {
      setDetailBusy(false);
    }
  };

  const handleAssignStaff = async () => {
    if (!selectedOrder) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await api.assignAdminPrintingStaff(selectedOrder.id, assignStaffId);
      if (res.success) {
        setSuccess(res.message);
        await loadAll();
        await openOrder(selectedOrder.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to assign staff.');
    } finally {
      setDetailBusy(false);
    }
  };

  const handleRecordOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await api.recordAdminPrintingPayment(selectedOrder.id, {
        amount: offPayAmount,
        payment_scope: offPayScope,
        gateway: offPayGateway,
        reference: offPayRef || undefined,
        remarks: offPayRemarks || undefined,
      });
      if (res.success) {
        setSuccess(res.message);
        setOffPayRef('');
        setOffPayRemarks('');
        await loadAll();
        await openOrder(selectedOrder.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setDetailBusy(false);
    }
  };

  const handleSendAdminMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !adminMsgText.trim()) return;
    setDetailBusy(true);
    try {
      await api.sendAdminPrintingMessage(selectedOrder.id, adminMsgText.trim(), adminMsgInternal);
      setAdminMsgText('');
      await openOrder(selectedOrder.id);
    } catch (err: any) {
      setError(err.message || 'Failed to post message.');
    } finally {
      setDetailBusy(false);
    }
  };

  const handleReviewPayment = async (pid: string, action: 'confirm' | 'reject') => {
    setError(null);
    try {
      const res = await api.reviewAdminPrintingPayment(pid, action);
      if (res.success) {
        setSuccess(res.message);
        await loadAll();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to review payment.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    setCatSaving(true);
    setError(null);
    try {
      const res = await api.saveAdminPrintingCategory(editingCat, editingCat.id);
      if (res.success) {
        setSuccess(res.message);
        setEditingCat(null);
        await loadAll();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save category pricing.');
    } finally {
      setCatSaving(false);
    }
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingZone) return;
    setZoneSaving(true);
    setError(null);
    try {
      const res = await api.saveAdminPrintingZone(editingZone, editingZone.id);
      if (res.success) {
        setSuccess(res.message);
        setEditingZone(null);
        await loadAll();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save delivery zone.');
    } finally {
      setZoneSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSettingsSaving(true);
    setError(null);
    try {
      const res = await api.updateAdminPrintingSettings(settings);
      if (res.success) {
        setSuccess(res.message);
        setSettings(res.settings);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save printing settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Filtered Orders for Queue Pills
  const filteredOrders = orders.filter(o => {
    if (queueFilter === 'pending_requests') {
      return ['Pending Review', 'Under Review', 'Awaiting Quotation'].includes(o.status);
    }
    if (queueFilter === 'quotations') {
      return ['Quotation Sent', 'Awaiting Payment'].includes(o.status);
    }
    if (queueFilter === 'processing') {
      return ['Payment Confirmed', 'Processing', 'On Hold'].includes(o.status);
    }
    if (queueFilter === 'ready_collection') {
      return o.status === 'Ready for Collection';
    }
    if (queueFilter === 'ready_dispatch') {
      return ['Ready for Dispatch', 'Out for Delivery'].includes(o.status);
    }
    if (queueFilter === 'completed') {
      return o.status === 'Completed';
    }
    return true;
  });

  const liveQuoteTotal = Math.max(
    0,
    qPrinting +
      qFinishing +
      qUrgent +
      (qFreeDelivery || selectedOrder?.collection_method === 'office_collection' ? 0 : qDelivery) -
      qDiscount
  );
  const liveQuoteMargin = liveQuoteTotal - qInternalCost;

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
            <Printer className="w-4 h-4" />
            <span>Printing &amp; Document Services Administration</span>
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight mt-0.5">
            Print Orders, Manual Quotations, Dynamic Rates &amp; Lagos Delivery
          </h2>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Console</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Pending Requests</span>
            <div className="text-2xl font-extrabold font-mono text-amber-400 mt-1">{metrics.pending_requests}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Quotations Sent</span>
            <div className="text-2xl font-extrabold font-mono text-blue-400 mt-1">
              {metrics.quotations_pending_customer + metrics.awaiting_payment}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Processing Jobs</span>
            <div className="text-2xl font-extrabold font-mono text-sky-400 mt-1">{metrics.active_production}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Ready Collection/Disp</span>
            <div className="text-2xl font-extrabold font-mono text-indigo-400 mt-1">
              {metrics.ready_for_collection} / {metrics.ready_for_dispatch}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Collected Revenue</span>
            <div className="text-xl font-extrabold font-mono text-emerald-400 mt-1">
              ₦{metrics.total_collected.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Est. Gross Profit</span>
            <div className="text-xl font-extrabold font-mono text-white mt-1">
              ₦{metrics.estimated_gross_profit.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Admin Module Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {canOperateOrders && (
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Orders &amp; Quotations ({orders.length})</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'pricing'
              ? 'bg-blue-700 text-white'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Service Categories &amp; Pricing ({categories.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('zones')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'zones'
              ? 'bg-blue-700 text-white'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Delivery Zones &amp; Charges ({zones.length})</span>
        </button>
        {canOperateOrders && (
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payment Records ({payments.length})</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'bg-blue-700 text-white'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Reports &amp; Settings</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: ORDERS & QUOTATIONS                                          */}
      {/* =================================================================== */}
      {activeTab === 'orders' && canOperateOrders && (
        <div className="space-y-4">
          {/* Queue Filter Pills */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all', label: 'All Printing Orders' },
                { id: 'pending_requests', label: 'Pending Requests' },
                { id: 'quotations', label: 'Quotations / Awaiting Pay' },
                { id: 'processing', label: 'Processing Jobs' },
                { id: 'ready_collection', label: 'Ready for Collection' },
                { id: 'ready_dispatch', label: 'Ready for Dispatch / Out' },
                { id: 'completed', label: 'Completed Orders' },
              ] as Array<{ id: QueueFilter; label: string }>
            ).map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQueueFilter(q.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition ${
                  queueFilter === q.id
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Search & Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search ref, customer, job title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
            >
              <option value="all">All Service Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.category_key}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
            >
              <option value="all">All Assigned Staff</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.role})
                </option>
              ))}
            </select>
          </div>

          {/* Orders Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Order Ref</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Service &amp; Specs</th>
                    <th className="px-4 py-3">Collection / Delivery</th>
                    <th className="px-4 py-3">Total / Paid</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No printing orders match the active filter.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono font-bold text-blue-400">{o.order_reference}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{o.customer_name}</div>
                          <div className="text-[10px] text-slate-400">{o.customer_phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-200">{o.service_title}</div>
                          <div className="text-[10px] text-slate-400">
                            {o.category_name} &bull; Qty: {o.quantity}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-300">
                          {o.collection_method === 'paid_delivery' ? (
                            <span className="text-blue-400">Delivery ({o.delivery_lga_lcda})</span>
                          ) : (
                            <span className="text-emerald-400">Office Collection</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <div className="font-bold text-white">₦{Number(o.total_amount).toLocaleString()}</div>
                          <div className="text-[10px] text-emerald-400">Paid: ₦{Number(o.amount_paid).toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${statusBadge(o.status)}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-300">
                          {o.assigned_staff_name || <span className="text-slate-500">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openOrder(o.id)}
                            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-bold"
                          >
                            Review / Quote
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: CATEGORIES & PRICING CONFIGURATION                           */}
      {/* =================================================================== */}
      {activeTab === 'pricing' && (
        <div className="space-y-4">
          {!canManagePricing && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Read-only view: Only staff with <strong>printing_pricing</strong> or Super Admin can modify printing rates &amp; categories.</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Configurable Printing Services, Banner Per-Foot Basis &amp; Rates
            </h3>
            {canManagePricing && (
              <button
                type="button"
                onClick={() =>
                  setEditingCat({
                    name: '',
                    description: '',
                    measurement_method: 'per_page',
                    unit_label: 'page',
                    bw_rate: 50,
                    color_rate: 150,
                    base_rate: 50,
                    min_quantity: 1,
                    urgent_fee_type: 'percent',
                    urgent_fee_value: 25,
                    internal_cost_estimate: 25,
                    is_active: true,
                    requires_manual_quote: true,
                    paper_sizes: ['A4 (Standard)'],
                    size_rates: { 'A4 (Standard)': 1.0 },
                    finishing_options: [],
                    bulk_discounts: [],
                    field_schema: [],
                  })
                }
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Service Category</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map(cat => (
              <div key={cat.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{cat.name}</h4>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          cat.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {cat.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{cat.description}</p>
                  </div>
                  {canManagePricing && (
                    <button
                      type="button"
                      onClick={() => setEditingCat({ ...cat })}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Rates</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px] bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-500 block">B&amp;W Rate</span>
                    <span className="font-mono font-bold text-white">₦{Number(cat.bw_rate).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Colour Rate</span>
                    <span className="font-mono font-bold text-blue-400">₦{Number(cat.color_rate).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Basis</span>
                    <span className="font-mono text-amber-400">{cat.measurement_method}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Internal Cost</span>
                    <span className="font-mono text-rose-400">₦{Number(cat.internal_cost_estimate || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: DELIVERY ZONES & CHARGES                                     */}
      {/* =================================================================== */}
      {activeTab === 'zones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Lagos Delivery Zones, Fixed Fees &amp; Free Thresholds</h3>
            {canManagePricing && (
              <button
                type="button"
                onClick={() =>
                  setEditingZone({
                    destination_group: '',
                    lga_lcda: '',
                    towns_covered: '',
                    pricing_mode: 'fixed',
                    fixed_fee: 3500,
                    free_delivery_enabled: false,
                    free_delivery_min_order: 0,
                    estimated_eta: 'Next Business Day',
                    is_active: true,
                  })
                }
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Delivery Zone</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Destination Group</th>
                    <th className="px-4 py-3">LGA / LCDA</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Fixed Fee</th>
                    <th className="px-4 py-3">Free Threshold</th>
                    <th className="px-4 py-3">Status</th>
                    {canManagePricing && <th className="px-4 py-3 text-right">Edit</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {zones.map(z => (
                    <tr key={z.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-white">{z.destination_group}</td>
                      <td className="px-4 py-3 text-slate-300">{z.lga_lcda}</td>
                      <td className="px-4 py-3 font-mono text-sky-400">{z.pricing_mode}</td>
                      <td className="px-4 py-3 font-mono font-bold text-white">₦{Number(z.fixed_fee).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-emerald-400">
                        {z.free_delivery_enabled ? `₦${Number(z.free_delivery_min_order).toLocaleString()}` : 'Off'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${z.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          {z.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canManagePricing && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingZone({ ...z })}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: PAYMENT RECORDS                                              */}
      {/* =================================================================== */}
      {activeTab === 'payments' && canOperateOrders && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-3">Pay Ref / Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Method &amp; Scope</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Review Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No printing payments recorded yet.
                    </td>
                  </tr>
                ) : (
                  payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-blue-400">{p.reference}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.order_reference}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{p.customer_name || p.payer_name}</div>
                        <div className="text-[10px] text-slate-400">{p.service_title}</div>
                      </td>
                      <td className="px-4 py-3 uppercase font-mono text-[11px] text-slate-300">
                        {p.gateway} &bull; {p.payment_scope}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">₦{Number(p.amount).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            p.status === 'confirmed'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : p.status === 'pending'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewPayment(p.id, 'confirm')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewPayment(p.id, 'reject')}
                              className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-[11px] font-bold"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">{p.confirmed_by_name || '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: REPORTS & SETTINGS                                           */}
      {/* =================================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {reports && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 font-bold text-xs text-white uppercase tracking-wider">
                  Category Performance &amp; Margin Breakdown
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5">Orders</th>
                        <th className="px-4 py-2.5">Quoted</th>
                        <th className="px-4 py-2.5">Collected</th>
                        <th className="px-4 py-2.5">Internal Cost</th>
                        <th className="px-4 py-2.5">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reports.by_category.map(row => (
                        <tr key={row.category_key}>
                          <td className="px-4 py-2.5 font-semibold text-white">{row.category_name}</td>
                          <td className="px-4 py-2.5 font-mono">{row.order_count}</td>
                          <td className="px-4 py-2.5 font-mono">₦{row.quoted_total.toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-mono text-emerald-400">₦{row.collected_total.toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-mono text-rose-400">₦{row.internal_cost_total.toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-blue-400">₦{row.margin.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-4 rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                <div className="font-bold text-xs text-white uppercase tracking-wider">Staff Print Workload</div>
                <div className="space-y-2 text-xs">
                  {reports.by_staff.map(s => (
                    <div key={s.staff_name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="font-medium text-slate-200">{s.staff_name}</span>
                      <span className="font-mono text-slate-400">
                        {s.completed_jobs}/{s.total_jobs} done
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {settings && (
            <form onSubmit={handleSaveSettings} className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-400" />
                  <span>Printing Office Collection, Support &amp; Upload Settings</span>
                </h3>
                {canManagePricing && (
                  <button
                    type="submit"
                    disabled={settingsSaving}
                    className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {settingsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Settings</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Office Collection Title</label>
                  <input
                    type="text"
                    disabled={!canManagePricing}
                    value={settings.office_collection_title}
                    onChange={e => setSettings({ ...settings, office_collection_title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Office Collection Hours</label>
                  <input
                    type="text"
                    disabled={!canManagePricing}
                    value={settings.office_collection_hours}
                    onChange={e => setSettings({ ...settings, office_collection_hours: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Main Office Address</label>
                  <input
                    type="text"
                    disabled={!canManagePricing}
                    value={settings.office_collection_address}
                    onChange={e => setSettings({ ...settings, office_collection_address: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Support Phone</label>
                  <input
                    type="text"
                    disabled={!canManagePricing}
                    value={settings.printing_support_phone}
                    onChange={e => setSettings({ ...settings, printing_support_phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Support WhatsApp</label>
                  <input
                    type="text"
                    disabled={!canManagePricing}
                    value={settings.printing_support_whatsapp}
                    onChange={e => setSettings({ ...settings, printing_support_whatsapp: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Default Deposit %</label>
                  <input
                    type="number"
                    min={10}
                    max={90}
                    disabled={!canManagePricing}
                    value={settings.default_deposit_percent}
                    onChange={e => setSettings({ ...settings, default_deposit_percent: Number(e.target.value || 50) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Max Upload Size (MB)</label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    disabled={!canManagePricing}
                    value={settings.max_upload_mb}
                    onChange={e => setSettings({ ...settings, max_upload_mb: Number(e.target.value || 15) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ORDER MANAGEMENT MODAL (QUOTE, 15 STATUSES, DISPATCH, STAFF, CHAT)  */}
      {/* =================================================================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl text-slate-100">
            <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-400">{selectedOrder.order_reference}</span>
                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${statusBadge(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Paid: ₦{Number(selectedOrder.amount_paid).toLocaleString()} / ₦{Number(selectedOrder.total_amount).toLocaleString()}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-white mt-0.5">
                  {selectedOrder.service_title} &mdash; {selectedOrder.customer_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Customer Specs & Files */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Customer Specs &amp; Attachments</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <span className="text-slate-400">Customer:</span>
                    <span>{selectedOrder.customer_name} ({selectedOrder.customer_phone})</span>
                    <span className="text-slate-400">Category / Qty:</span>
                    <span>{selectedOrder.category_name} × {selectedOrder.quantity}</span>
                    <span className="text-slate-400">Colour / Size:</span>
                    <span>{selectedOrder.color_mode} / {selectedOrder.paper_size || 'Default'}</span>
                    {selectedOrder.width_ft && (
                      <>
                        <span className="text-slate-400">Dimensions:</span>
                        <span>{selectedOrder.width_ft}ft × {selectedOrder.height_ft}ft ({selectedOrder.sq_ft} sq.ft)</span>
                      </>
                    )}
                    <span className="text-slate-400">Collection:</span>
                    <span>{selectedOrder.collection_method}</span>
                    {selectedOrder.collection_method === 'paid_delivery' && (
                      <>
                        <span className="text-slate-400">Lagos Delivery:</span>
                        <span>
                          {selectedOrder.delivery_recipient_name} ({selectedOrder.delivery_recipient_phone}) —{' '}
                          {selectedOrder.delivery_address}, {selectedOrder.delivery_town}, {selectedOrder.delivery_lga_lcda} (Landmark: {selectedOrder.delivery_landmark})
                        </span>
                      </>
                    )}
                  </div>
                  {selectedOrder.special_instructions && (
                    <div className="p-2 rounded-lg bg-slate-900 text-slate-300 text-[11px]">
                      <strong>Instructions:</strong> {selectedOrder.special_instructions}
                    </div>
                  )}
                  {selectedOrder.uploaded_files?.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-slate-800">
                      {selectedOrder.uploaded_files.map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handlePreviewFile(f.file_url)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-blue-400 hover:underline text-[11px]"
                        >
                          <span className="truncate">{f.file_name}</span>
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Staff Assignment & Dispatch Control */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="space-y-2">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-400" />
                      <span>Staff Assignment</span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={assignStaffId}
                        onChange={e => setAssignStaffId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                      >
                        <option value="">Unassigned</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.full_name} ({s.role})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={detailBusy}
                        onClick={handleAssignStaff}
                        className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
                      >
                        Assign
                      </button>
                    </div>
                  </div>

                  {/* Status Update Form */}
                  <form onSubmit={handleUpdateStatus} className="space-y-2 pt-3 border-t border-slate-800">
                    <div className="font-bold text-white">Order Status Transition (15 Statuses)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={statusInput}
                        onChange={e => setStatusInput(e.target.value as PrintingOrderStatus)}
                        className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                      >
                        {ALL_STATUSES.map(st => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Transition note (optional)"
                        value={statusNote}
                        onChange={e => setStatusNote(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Tracking / courier / pickup bay note (optional)"
                      value={trackingNote}
                      onChange={e => setTrackingNote(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    {statusInput === 'Refunded' && Number(selectedOrder.amount_paid) > 0 && (
                      <label className="flex items-center gap-2 text-[11px] text-amber-300">
                        <input
                          type="checkbox"
                          checked={refundToWallet}
                          onChange={e => setRefundToWallet(e.target.checked)}
                        />
                        <span>Credit ₦{Number(selectedOrder.amount_paid).toLocaleString()} back to customer wallet</span>
                      </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={detailBusy}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                      >
                        Update Status
                      </button>
                      {selectedOrder.collection_method === 'paid_delivery' && (
                        <button
                          type="button"
                          disabled={detailBusy}
                          onClick={handleConfirmDispatch}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Confirm Dispatch &amp; Out for Delivery</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Official Quotation Preparation Form */}
              <form onSubmit={handleSendQuote} className="p-4 rounded-xl bg-slate-950 border border-blue-500/30 space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span>Prepare &amp; Send Official Quotation (Internal Cost Never Shown to Customer)</span>
                  </div>
                  <div className="font-mono text-xs">
                    Total: <strong className="text-emerald-400">₦{liveQuoteTotal.toLocaleString()}</strong> &bull; Est Margin:{' '}
                    <strong className={liveQuoteMargin >= 0 ? 'text-blue-400' : 'text-rose-400'}>
                      ₦{liveQuoteMargin.toLocaleString()}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Printing (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qPrinting}
                      onChange={e => setQPrinting(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Finishing (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qFinishing}
                      onChange={e => setQFinishing(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Urgent (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qUrgent}
                      onChange={e => setQUrgent(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Discount (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qDiscount}
                      onChange={e => setQDiscount(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Delivery Fee (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={qFreeDelivery || selectedOrder.collection_method === 'office_collection'}
                      value={qFreeDelivery || selectedOrder.collection_method === 'office_collection' ? 0 : qDelivery}
                      onChange={e => setQDelivery(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-rose-400 mb-1">Internal Cost (Private)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qInternalCost}
                      onChange={e => setQInternalCost(Number(e.target.value || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-rose-500/40 font-mono text-rose-300"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={qDepositEnabled}
                      onChange={e => setQDepositEnabled(e.target.checked)}
                    />
                    <span>Enable Deposit Option</span>
                  </label>
                  {qDepositEnabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Deposit %:</span>
                      <input
                        type="number"
                        min={10}
                        max={90}
                        value={qDepositPercent}
                        onChange={e => setQDepositPercent(Number(e.target.value || 50))}
                        className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-xs"
                      />
                    </div>
                  )}
                  {selectedOrder.collection_method === 'paid_delivery' && (
                    <label className="flex items-center gap-2 text-[11px] text-emerald-300">
                      <input
                        type="checkbox"
                        checked={qFreeDelivery}
                        onChange={e => setQFreeDelivery(e.target.checked)}
                      />
                      <span>Authorize Free Delivery (₦0)</span>
                    </label>
                  )}
                  <input
                    type="date"
                    value={qDueDate}
                    onChange={e => setQDueDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Customer-visible quotation notes (turnaround, paper grade, delivery schedule)..."
                    value={qNotes}
                    onChange={e => setQNotes(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={detailBusy}
                    className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {detailBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Send Official Quotation</span>
                  </button>
                </div>
              </form>

              {/* Record Offline Payment & Communication */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <form onSubmit={handleRecordOfflinePayment} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span>Record Counter / Bank / POS Payment</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      placeholder="Amount"
                      value={offPayAmount}
                      onChange={e => setOffPayAmount(Number(e.target.value || 0))}
                      className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 font-mono"
                    />
                    <select
                      value={offPayScope}
                      onChange={e => setOffPayScope(e.target.value as any)}
                      className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800"
                    >
                      <option value="full">Full</option>
                      <option value="deposit">Deposit</option>
                      <option value="balance">Balance</option>
                      <option value="delivery">Delivery</option>
                    </select>
                    <select
                      value={offPayGateway}
                      onChange={e => setOffPayGateway(e.target.value as any)}
                      className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800"
                    >
                      <option value="cash">Cash</option>
                      <option value="pos">POS</option>
                      <option value="manual_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Receipt / Bank Ref"
                      value={offPayRef}
                      onChange={e => setOffPayRef(e.target.value)}
                      className="flex-1 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800"
                    />
                    <button
                      type="submit"
                      disabled={detailBusy}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                    >
                      Confirm Payment
                    </button>
                  </div>
                  {detailPayments.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-slate-800 max-h-28 overflow-y-auto">
                      {detailPayments.map(p => (
                        <div key={p.id} className="flex justify-between text-[11px] text-slate-300">
                          <span className="font-mono">{p.reference} ({p.gateway})</span>
                          <span className="font-mono font-bold">₦{Number(p.amount).toLocaleString()} [{p.status}]</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>

                {/* Messages & Internal Notes */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col">
                  <div className="font-bold text-white">Customer Communication &amp; Internal Staff Notes</div>
                  <div className="space-y-2 max-h-40 overflow-y-auto flex-1">
                    {detailMessages.map(m => (
                      <div
                        key={m.id}
                        className={`p-2 rounded-lg text-[11px] ${
                          m.is_internal
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                            : 'bg-slate-900 border border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>
                            {m.sender_name} ({m.is_internal ? 'INTERNAL ONLY' : m.sender_role})
                          </span>
                          <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                        </div>
                        <p>{m.message}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendAdminMessage} className="space-y-2">
                    <label className="flex items-center gap-2 text-[11px] text-amber-300">
                      <input
                        type="checkbox"
                        checked={adminMsgInternal}
                        onChange={e => setAdminMsgInternal(e.target.checked)}
                      />
                      <span>Save as Internal Staff Note (Hidden from customer)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={adminMsgInternal ? 'Write internal production note...' : 'Reply to customer...'}
                        value={adminMsgText}
                        onChange={e => setAdminMsgText(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs"
                      />
                      <button type="submit" disabled={detailBusy} className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold">
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Status History Log */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-bold text-xs text-white">Audit Status History</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto text-[11px]">
                  {detailHistory.map(h => (
                    <div key={h.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex justify-between font-bold text-slate-200">
                        <span>{h.to_status}</span>
                        <span className="font-mono text-[10px] text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                      {h.note && <p className="text-slate-400 mt-0.5">{h.note}</p>}
                      <span className="text-[10px] text-slate-500">By {h.actor_name} ({h.actor_role})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CATEGORY PRICING EDIT MODAL                                         */}
      {/* =================================================================== */}
      {editingCat && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveCategory}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold">
                {editingCat.id ? `Edit Pricing: ${editingCat.name}` : 'Create Printing Category'}
              </h3>
              <button type="button" onClick={() => setEditingCat(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Service Name *</label>
                <input
                  type="text"
                  required
                  value={editingCat.name || ''}
                  onChange={e => setEditingCat({ ...editingCat, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Measurement Method (Banner Per-Foot / Per-Page)</label>
                <select
                  value={editingCat.measurement_method || 'per_page'}
                  onChange={e => setEditingCat({ ...editingCat, measurement_method: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <option value="per_page">Per Page (per_page)</option>
                  <option value="per_copy">Per Copy (per_copy)</option>
                  <option value="per_sq_ft">Banner Per Square Foot (per_sq_ft)</option>
                  <option value="per_linear_ft">Banner Per Linear Foot (per_linear_ft)</option>
                  <option value="per_card">Plastic ID Per Card (per_card)</option>
                  <option value="per_photo">Photo Unit (per_photo)</option>
                  <option value="manual">Manual Quotation Only (manual)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Black &amp; White Rate (₦)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingCat.bw_rate ?? 0}
                  onChange={e => setEditingCat({ ...editingCat, bw_rate: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Full Colour Rate (₦)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingCat.color_rate ?? 0}
                  onChange={e => setEditingCat({ ...editingCat, color_rate: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Base Rate (₦)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingCat.base_rate ?? 0}
                  onChange={e => setEditingCat({ ...editingCat, base_rate: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Unit Label (page, sq.ft, card, print)</label>
                <input
                  type="text"
                  value={editingCat.unit_label || 'unit'}
                  onChange={e => setEditingCat({ ...editingCat, unit_label: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Minimum Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={editingCat.min_quantity ?? 1}
                  onChange={e => setEditingCat({ ...editingCat, min_quantity: Math.max(1, Number(e.target.value || 1)) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-rose-400 mb-1">Internal Cost Estimate / Unit (Private)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingCat.internal_cost_estimate ?? 0}
                  onChange={e => setEditingCat({ ...editingCat, internal_cost_estimate: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-rose-500/40 font-mono text-rose-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Urgent Fee Type</label>
                <select
                  value={editingCat.urgent_fee_type || 'percent'}
                  onChange={e => setEditingCat({ ...editingCat, urgent_fee_type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="flat">Flat Fee (₦)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Urgent Fee Value</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingCat.urgent_fee_value ?? 25}
                  onChange={e => setEditingCat({ ...editingCat, urgent_fee_value: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Description</label>
              <textarea
                rows={2}
                value={editingCat.description || ''}
                onChange={e => setEditingCat({ ...editingCat, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            {/* Finishing Options quick editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">Finishing Options</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingCat({
                      ...editingCat,
                      finishing_options: [
                        ...(editingCat.finishing_options || []),
                        { code: `opt_${Date.now()}`, label: 'New Finishing', fee: 500 },
                      ],
                    })
                  }
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  + Add Finishing
                </button>
              </div>
              {(editingCat.finishing_options || []).map((f, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Label"
                    value={f.label}
                    onChange={e => {
                      const next = [...(editingCat.finishing_options || [])];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setEditingCat({ ...editingCat, finishing_options: next });
                    }}
                    className="col-span-7 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Fee"
                    value={f.fee}
                    onChange={e => {
                      const next = [...(editingCat.finishing_options || [])];
                      next[idx] = { ...next[idx], fee: Number(e.target.value || 0) };
                      setEditingCat({ ...editingCat, finishing_options: next });
                    }}
                    className="col-span-4 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (editingCat.finishing_options || []).filter((_, i) => i !== idx);
                      setEditingCat({ ...editingCat, finishing_options: next });
                    }}
                    className="col-span-1 text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Bulk Discount Tiers quick editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">Bulk Discounts</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingCat({
                      ...editingCat,
                      bulk_discounts: [...(editingCat.bulk_discounts || []), { min_qty: 100, discount_percent: 10, label: '100+ units: 10% off' }],
                    })
                  }
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  + Add Tier
                </button>
              </div>
              {(editingCat.bulk_discounts || []).map((d, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    placeholder="Min Qty"
                    value={d.min_qty}
                    onChange={e => {
                      const next = [...(editingCat.bulk_discounts || [])];
                      next[idx] = { ...next[idx], min_qty: Number(e.target.value || 1) };
                      setEditingCat({ ...editingCat, bulk_discounts: next });
                    }}
                    className="col-span-3 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono"
                  />
                  <input
                    type="number"
                    min={1}
                    max={80}
                    placeholder="% Off"
                    value={d.discount_percent}
                    onChange={e => {
                      const next = [...(editingCat.bulk_discounts || [])];
                      next[idx] = { ...next[idx], discount_percent: Number(e.target.value || 0) };
                      setEditingCat({ ...editingCat, bulk_discounts: next });
                    }}
                    className="col-span-3 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Label"
                    value={d.label || ''}
                    onChange={e => {
                      const next = [...(editingCat.bulk_discounts || [])];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setEditingCat({ ...editingCat, bulk_discounts: next });
                    }}
                    className="col-span-5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (editingCat.bulk_discounts || []).filter((_, i) => i !== idx);
                      setEditingCat({ ...editingCat, bulk_discounts: next });
                    }}
                    className="col-span-1 text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingCat.is_active ?? true}
                  onChange={e => setEditingCat({ ...editingCat, is_active: e.target.checked })}
                />
                <span>Service Category Active (Visible to Customers)</span>
              </label>
              <button
                type="submit"
                disabled={catSaving}
                className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
              >
                {catSaving ? 'Saving...' : 'Save Pricing Config'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* DELIVERY ZONE EDIT MODAL                                            */}
      {/* =================================================================== */}
      {editingZone && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveZone}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold">
                {editingZone.id ? 'Edit Lagos Delivery Zone' : 'Add Lagos Delivery Zone'}
              </h3>
              <button type="button" onClick={() => setEditingZone(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Destination Group *</label>
                <input
                  type="text"
                  required
                  value={editingZone.destination_group || ''}
                  onChange={e => setEditingZone({ ...editingZone, destination_group: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Lagos LGA / LCDA *</label>
                <input
                  type="text"
                  required
                  value={editingZone.lga_lcda || ''}
                  onChange={e => setEditingZone({ ...editingZone, lga_lcda: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Towns Covered</label>
                <input
                  type="text"
                  value={editingZone.towns_covered || ''}
                  onChange={e => setEditingZone({ ...editingZone, towns_covered: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Pricing Mode</label>
                  <select
                    value={editingZone.pricing_mode || 'fixed'}
                    onChange={e => setEditingZone({ ...editingZone, pricing_mode: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                  >
                    <option value="fixed">Fixed Delivery Fee</option>
                    <option value="manual_quote">Manual Quote</option>
                    <option value="free">Free Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Fixed Fee (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingZone.fixed_fee ?? 0}
                    onChange={e => setEditingZone({ ...editingZone, fixed_fee: Number(e.target.value || 0) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Free Delivery Min Order (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingZone.free_delivery_min_order ?? 0}
                    onChange={e => setEditingZone({ ...editingZone, free_delivery_min_order: Number(e.target.value || 0) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Estimated ETA</label>
                  <input
                    type="text"
                    value={editingZone.estimated_eta || ''}
                    onChange={e => setEditingZone({ ...editingZone, estimated_eta: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingZone.free_delivery_enabled ?? false}
                    onChange={e => setEditingZone({ ...editingZone, free_delivery_enabled: e.target.checked })}
                  />
                  <span>Enable Free Threshold</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingZone.is_active ?? true}
                    onChange={e => setEditingZone({ ...editingZone, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="submit"
                disabled={zoneSaving}
                className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
              >
                {zoneSaving ? 'Saving...' : 'Save Delivery Zone'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
