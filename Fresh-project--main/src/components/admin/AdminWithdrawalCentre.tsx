import React, { useEffect, useState } from 'react';
import {
  Landmark,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  XCircle,
  ArrowUpRight,
  Ban,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ReferralWithdrawalItem } from '../../types';

type WithdrawalAction = 'approve' | 'process' | 'mark_paid' | 'reject' | 'fail';

const STATUS_FILTERS = ['all', 'pending', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled'];

export function AdminWithdrawalCentre() {
  const [withdrawals, setWithdrawals] = useState<ReferralWithdrawalItem[]>([]);
  const [stats, setStats] = useState<{
    pending_count: number;
    pending_payout_total: number;
    processing_count: number;
    paid_count: number;
    paid_total: number;
    rejected_count: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [modal, setModal] = useState<{
    item: ReferralWithdrawalItem;
    action: WithdrawalAction;
  } | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWithdrawals = async (status = statusFilter, q = search) => {
    setLoading(true);
    try {
      const res = await api.getAdminWithdrawals({ status, search: q });
      if (res && res.success) {
        setWithdrawals(res.withdrawals || []);
        setStats(res.stats || null);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load referral withdrawal queue.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWithdrawals();
  }, []);

  const openActionModal = (item: ReferralWithdrawalItem, action: WithdrawalAction) => {
    setPaymentReference(item.payment_reference || '');
    setAdminNote(item.admin_note || '');
    setRejectionReason('');
    setModal({ item, action });
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    const { item, action } = modal;

    if (action === 'mark_paid' && !paymentReference.trim()) {
      setFeedback({ type: 'error', message: 'A bank transfer / payment reference is required before marking as Paid.' });
      return;
    }
    if ((action === 'reject' || action === 'fail') && !rejectionReason.trim()) {
      setFeedback({ type: 'error', message: 'Please provide a clear reason before rejecting or failing a withdrawal.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.adminProcessWithdrawal(item.id, action, {
        payment_reference: paymentReference.trim() || undefined,
        admin_note: adminNote.trim() || undefined,
        rejection_reason: rejectionReason.trim() || undefined,
      });
      setFeedback({ type: 'success', message: res.message || `Withdrawal ${item.withdrawal_number} updated.` });
      setModal(null);
      await loadWithdrawals();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Withdrawal update failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'paid' || s === 'approved') {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    }
    if (s === 'pending' || s === 'processing') {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
    return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Landmark className="w-3.5 h-3.5" />
            <span>Admin Cash Payout Desk</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Referral Cash Withdrawal Queue
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review customer bank payout requests, record verified bank transfer references, or reject/fail payouts with automatic balance refund.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadWithdrawals()}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 self-start md:self-center transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            &times;
          </button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-semibold">
              <span>Pending Review ({stats.pending_count})</span>
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              ₦{Number(stats.pending_payout_total || 0).toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Net payout awaiting initial approval</p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-semibold">
              <span>Approved / Processing</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {stats.processing_count}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Requests cleared or in bank disbursement</p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <span>Paid Withdrawals ({stats.paid_count})</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
              ₦{Number(stats.paid_total || 0).toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Total settled to banks &bull; Rejected/Failed: {stats.rejected_count}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                void loadWithdrawals(st, search);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ref, customer, bank, account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadWithdrawals(statusFilter, search);
              }}
              className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadWithdrawals(statusFilter, search)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg"
          >
            Filter
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading withdrawal requests...
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">
            No withdrawal requests match the selected filter.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Reference &amp; Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Bank Account</th>
                <th className="py-3 px-4">Gross / Fee / Net</th>
                <th className="py-3 px-4">Status &amp; Audit</th>
                <th className="py-3 px-4 text-right">Workflow Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {withdrawals.map((wd) => (
                <tr key={wd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <p className="font-mono font-bold text-slate-900 dark:text-white">{wd.withdrawal_number}</p>
                    <p className="text-[10px] text-slate-500">{new Date(wd.created_at).toLocaleString()}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{wd.customer_name || 'Customer'}</p>
                    <p className="text-[10px] font-mono text-slate-500">{wd.customer_email}</p>
                    {typeof wd.kyc_level === 'number' && (
                      <p className="text-[10px] text-slate-400">KYC Level {wd.kyc_level}</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{wd.bank_name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {wd.account_number} &bull; {wd.account_name}
                    </p>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      Net: ₦{Number(wd.net_amount || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Gross ₦{Number(wd.gross_amount || 0).toLocaleString()} (Fee ₦{Number(wd.fee_amount || 0).toLocaleString()})
                    </p>
                  </td>
                  <td className="py-3 px-4 space-y-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusBadge(
                        wd.status
                      )}`}
                    >
                      {wd.status}
                    </span>
                    {wd.payment_reference && (
                      <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                        Pay Ref: {wd.payment_reference}
                      </p>
                    )}
                    {wd.rejection_reason && <p className="text-[10px] text-red-500 max-w-xs">{wd.rejection_reason}</p>}
                    {wd.admin_note && <p className="text-[10px] text-slate-500 max-w-xs">{wd.admin_note}</p>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {wd.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'approve')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'reject')}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {wd.status === 'approved' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'process')}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-semibold"
                          >
                            Processing
                          </button>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'mark_paid')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                          >
                            Mark Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'reject')}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-semibold"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {wd.status === 'processing' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'mark_paid')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                          >
                            Mark Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => openActionModal(wd, 'fail')}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Mark Failed</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmAction}
            className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white capitalize">
              {modal.action.replace('_', ' ')} Withdrawal
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <p className="font-mono font-bold text-slate-900 dark:text-white">{modal.item.withdrawal_number}</p>
              <p className="text-slate-600 dark:text-slate-400">
                {modal.item.customer_name} &bull; {modal.item.bank_name} ({modal.item.account_number})
              </p>
              <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                Net Payout: ₦{Number(modal.item.net_amount || 0).toLocaleString()}
              </p>
            </div>

            {modal.action === 'mark_paid' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Bank Transfer / NIP Payment Reference *
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. NIP-20261115-994021"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Payout Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Settled via corporate transfer..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            {(modal.action === 'approve' || modal.action === 'process') && (
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Internal Processing Notes (Optional)
                </label>
                <input
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Verified customer earnings..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            )}

            {(modal.action === 'reject' || modal.action === 'fail') && (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Note: Rejecting or failing this withdrawal will automatically refund ₦
                  {Number(modal.item.gross_amount || 0).toLocaleString()} back to the customer&apos;s Available Referral Balance.
                </p>
                <label className="block text-[11px] font-semibold uppercase text-slate-500">
                  Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection or bank failure..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 ${
                  modal.action === 'reject' || modal.action === 'fail'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
