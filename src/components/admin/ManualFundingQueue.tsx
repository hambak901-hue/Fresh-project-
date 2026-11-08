import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Check,
  X,
  Loader2,
  FileText,
  AlertCircle,
  Building,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Transaction } from '../../types';

export function ManualFundingQueue() {
  const [pending, setPending] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await api.getPendingFundingApprovals();
      setPending(res.pending || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (txn: Transaction) => {
    setActionLoading(txn.id);
    setMessage(null);
    try {
      const res = await api.approveFunding(txn.id);
      setMessage({ type: 'success', text: res.message });
      await fetchPending();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Approval failed' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleReject = async (txn: Transaction) => {
    const reason = window.prompt(
      `Enter reason for declining payment proof for ${txn.reference}:`,
      'Deposit could not be matched against bank statement'
    );
    if (reason === null) return;

    setActionLoading(txn.id);
    setMessage(null);
    try {
      const res = await api.rejectFunding(txn.id, reason);
      setMessage({ type: 'success', text: res.message });
      await fetchPending();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Rejection failed' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Compliance Settlement Desk</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Manual Funding Approvals ({pending.length})
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Inspect submitted proofs of bank transfer, verify transaction bank references, and credit customer wallet balances instantly.
            </p>
          </div>
          <button
            onClick={fetchPending}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
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

      {/* Pending Items List */}
      <div className="space-y-3">
        {pending.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="font-semibold text-slate-300 text-sm">No Pending Manual Fundings</p>
            <p className="text-slate-500 mt-1">All bank transfer payments have been processed and credited.</p>
          </div>
        ) : (
          pending.map(txn => (
            <div
              key={txn.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                    ₦{txn.amount.toLocaleString()}
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-slate-300">
                    Ref: {txn.reference}
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    PENDING REVIEW
                  </span>
                </div>

                <p className="font-semibold text-white">{txn.description}</p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-[11px] font-mono">
                  <span>Customer ID: {txn.user_id}</span>
                  <span>Sender: {txn.metadata?.sender_name || 'N/A'}</span>
                  <span>Bank: {txn.metadata?.bank_name || 'Access Bank'}</span>
                  <span>Submitted: {new Date(txn.created_at).toLocaleString()}</span>
                </div>

                {txn.metadata?.payment_proof_url && (
                  <div className="pt-1">
                    <a
                      href={txn.metadata.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline inline-flex items-center gap-1 text-[11px]"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View Uploaded Bank Transfer Receipt</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={actionLoading === txn.id}
                  onClick={() => handleApprove(txn)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                >
                  {actionLoading === txn.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Approve &amp; Credit Wallet</span>
                </button>
                <button
                  type="button"
                  disabled={actionLoading === txn.id}
                  onClick={() => handleReject(txn)}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-xl font-semibold flex items-center gap-1.5 transition"
                >
                  <X className="w-4 h-4" />
                  <span>Decline</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
