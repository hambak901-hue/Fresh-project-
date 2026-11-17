import React, { useState, useEffect } from 'react';
import {
  Scale,
  BookOpen,
  BarChart2,
  Mail,
  Settings,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  RefreshCw,
  Search,
  Save,
  X,
  Clock,
  ShieldCheck,
  Landmark,
} from 'lucide-react';
import { api } from '../../../lib/api';
import {
  AccountingChannelBalance,
  AccountingReconciliationItem,
  AccountingEntryItem,
  AccountingConfig,
  AccountingAccountRecord,
  AccountingReportLog,
} from '../../../types';
import { formatNaira, formatDomainLabel, getLagosDateString } from './accountingUtils';

// =========================================================================
// MODULE 7: CASH, POS & BANK RECONCILIATION
// =========================================================================

export const ReconciliationView: React.FC<{
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
  canAdjust: boolean;
  onDataChanged: () => void;
}> = ({ dateFrom, dateTo, refreshKey, canAdjust, onDataChanged }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    channel_balances: AccountingChannelBalance[];
    reconciliations: AccountingReconciliationItem[];
  } | null>(null);

  const [recDate, setRecDate] = useState(getLagosDateString(0));
  const [accountCode, setAccountCode] = useState('CASH_DRAWER');
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actualCounted, setActualCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingReconciliations({ date_from: dateFrom, date_to: dateTo });
      setData(res);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load reconciliation records.' });
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async (dt: string, code: string) => {
    setPreviewLoading(true);
    try {
      const res = await api.previewAccountingReconciliation(dt, code);
      setPreview(res);
      setActualCounted(String(res.expected_closing ?? 0));
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to preview channel balance.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [dateFrom, dateTo, refreshKey]);

  useEffect(() => {
    void loadPreview(recDate, accountCode);
  }, [recDate, accountCode, refreshKey]);

  const handleSubmitReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    const counted = Number(actualCounted);
    if (!Number.isFinite(counted)) {
      setFeedback({ type: 'error', text: 'Enter a valid numeric actual counted balance.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.submitAccountingReconciliation({
        reconcile_date: recDate,
        account_code: accountCode,
        actual_counted: counted,
        notes: notes.trim() || undefined,
      });
      setNotes('');
      setFeedback({
        type: 'success',
        text: `Reconciliation ${res.reconciliation.reconcile_number} saved (${res.reconciliation.status}).`,
      });
      onDataChanged();
      await Promise.all([loadList(), loadPreview(recDate, accountCode)]);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to submit reconciliation.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveAccountingReconciliation(id);
      setFeedback({ type: 'success', text: 'Reconciliation marked as approved.' });
      await loadList();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Unable to approve reconciliation.' });
    }
  };

  const expectedClosing = Number(preview?.expected_closing ?? 0);
  const countedNum = Number(actualCounted || 0);
  const variance = Number.isFinite(countedNum) ? countedNum - expectedClosing : 0;

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Channel Balances Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {(data?.channel_balances || []).map(cb => (
          <button
            key={cb.account_code}
            type="button"
            onClick={() => setAccountCode(cb.account_code)}
            className={`text-left p-4 rounded-xl border transition ${
              accountCode === cb.account_code
                ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">{cb.account_name}</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(cb.expected_balance)}
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
              +{formatNaira(cb.total_inflow)} / −{formatNaira(cb.total_outflow + cb.total_fees)}
            </p>
          </button>
        ))}
      </div>

      {/* Daily Channel Count & Variance Calculator */}
      <form
        onSubmit={handleSubmitReconciliation}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600" />
              <span>Reconcile Cash Drawer, POS Terminal &amp; Bank Channel</span>
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Compare expected closing ledger balance against physical cash count, POS EOD slip, or bank statement.
            </p>
          </div>
          {previewLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Business Date (WAT)</label>
            <input
              type="date"
              value={recDate}
              onChange={e => setRecDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Account / Channel</label>
            <select
              value={accountCode}
              onChange={e => setAccountCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            >
              {(data?.channel_balances || []).map(cb => (
                <option key={cb.account_code} value={cb.account_code}>
                  {cb.account_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Actual Counted / Bank Bal (&#8358;)</label>
            <input
              type="number"
              step="0.01"
              required
              value={actualCounted}
              onChange={e => setActualCounted(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Live Variance</label>
            <div
              className={`px-3 py-2 rounded-lg border font-mono font-extrabold ${
                Math.abs(variance) < 1
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : variance < 0
                  ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
                  : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400'
              }`}
            >
              {Math.abs(variance) < 1 ? 'BALANCED (₦0.00)' : `${variance < 0 ? 'SHORTAGE' : 'SURPLUS'} ${formatNaira(variance, true)}`}
            </div>
          </div>
        </div>

        {preview && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono">
            <div>
              <p className="text-[10px] text-slate-500">Opening Bal</p>
              <p className="font-bold">{formatNaira(preview.opening_balance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Day Inflows</p>
              <p className="font-bold text-emerald-600">+{formatNaira(preview.expected_inflow)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Day Outflows</p>
              <p className="font-bold text-rose-600">−{formatNaira(preview.expected_outflow)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Channel Fees</p>
              <p className="font-bold text-slate-600 dark:text-slate-300">−{formatNaira(preview.expected_fees)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Expected Closing</p>
              <p className="font-extrabold text-blue-700 dark:text-blue-400">{formatNaira(preview.expected_closing)}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Reconciliation remarks, POS batch number, or explanation for variance..."
            className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Submit Reconciliation</span>
          </button>
        </div>
      </form>

      {/* Reconciliation History Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
          Reconciliation History
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Ref &amp; Date</th>
                <th className="py-2.5 px-4">Channel</th>
                <th className="py-2.5 px-4 text-right">Expected</th>
                <th className="py-2.5 px-4 text-right">Actual Count</th>
                <th className="py-2.5 px-4 text-right">Variance</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading reconciliation history...
                  </td>
                </tr>
              ) : (data?.reconciliations || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No reconciliations submitted yet for this date window.
                  </td>
                </tr>
              ) : (
                (data?.reconciliations || []).map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      <p className="font-bold text-slate-900 dark:text-white">{r.reconcile_number}</p>
                      <p className="text-slate-500">{r.reconcile_date}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{r.channel_name}</p>
                      <p className="text-[10px] text-slate-500">{r.submitted_by_name}</p>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNaira(r.expected_closing)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatNaira(r.actual_counted)}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                        Number(r.variance_amount) === 0
                          ? 'text-emerald-600'
                          : Number(r.variance_amount) < 0
                          ? 'text-red-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {formatNaira(r.variance_amount, true)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                          r.status === 'balanced' || r.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : r.status === 'shortage'
                            ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {r.status !== 'approved' && canAdjust ? (
                        <button
                          type="button"
                          onClick={() => handleApprove(r.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                        >
                          Approve
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">{r.approved_by_name || '—'}</span>
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
  );
};

// =========================================================================
// MODULE 8: ACCOUNTING LEDGER & TRANSACTION HISTORY
// =========================================================================

export const AccountingLedgerView: React.FC<{
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
  canAdjust: boolean;
  onDataChanged: () => void;
}> = ({ dateFrom, dateTo, refreshKey, canAdjust, onDataChanged }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [originFilter, setOriginFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [reverseTarget, setReverseTarget] = useState<AccountingEntryItem | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingLedger({
        date_from: dateFrom,
        date_to: dateTo,
        source_origin: originFilter,
        payment_channel: channelFilter,
        search: search.trim() || undefined,
      });
      setData(res);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load accounting ledger.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo, originFilter, channelFilter, refreshKey]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await api.downloadAccountingLedgerCsv({
        date_from: dateFrom,
        date_to: dateTo,
        source_origin: originFilter,
        payment_channel: channelFilter,
        search: search.trim() || undefined,
      });
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'CSV export failed.' });
    } finally {
      setExporting(false);
    }
  };

  const handleConfirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    setReversing(true);
    try {
      await api.reverseAccountingLedgerEntry(reverseTarget.id, reverseReason.trim() || 'Reversed by supervisor');
      setReverseTarget(null);
      setReverseReason('');
      setFeedback({ type: 'success', text: `Ledger entry ${reverseTarget.entry_number} reversed cleanly.` });
      onDataChanged();
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Reversal failed.' });
    } finally {
      setReversing(false);
    }
  };

  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span>Unified Accounting Ledger &amp; Transaction History</span>
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Auditable master book combining website services, counter receipts, operating expenses, inventory costs, and wallet liability entries.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span>Export CSV</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">Entries</p>
            <p className="text-base font-extrabold font-mono">{t.entries_count}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">Revenue</p>
            <p className="text-base font-extrabold font-mono text-slate-900 dark:text-white">{formatNaira(t.total_revenue)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">COGS / Provider</p>
            <p className="text-base font-extrabold font-mono text-rose-600">{formatNaira(t.total_costs)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">Fees</p>
            <p className="text-base font-extrabold font-mono">{formatNaira(t.total_fees)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">Expenses</p>
            <p className="text-base font-extrabold font-mono text-rose-600">{formatNaira(t.total_expenses)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">Net Profit</p>
            <p className={`text-base font-extrabold font-mono ${t.total_net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatNaira(t.total_net_profit)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={originFilter}
            onChange={e => setOriginFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            <option value="all">All Origins</option>
            <option value="website">Website Portal</option>
            <option value="physical">Physical Counter</option>
            <option value="expense">Operating Expenses</option>
            <option value="income">Other Income</option>
            <option value="inventory">Inventory</option>
            <option value="adjustment">Adjustments</option>
          </select>
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            <option value="all">All Channels</option>
            <option value="wallet">Customer Wallet</option>
            <option value="cash">Cash Drawer</option>
            <option value="pos">POS Terminal</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="paystack">Paystack</option>
            <option value="flutterwave">Flutterwave</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="Search entry #, reference, title, party..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white font-semibold"
          >
            Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-3">Entry # / WAT</th>
                <th className="py-2.5 px-3">Origin / Domain</th>
                <th className="py-2.5 px-3">Description &amp; Party</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3 text-right">Revenue</th>
                <th className="py-2.5 px-3 text-right">Cost / Exp</th>
                <th className="py-2.5 px-3 text-right">Profit Impact</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !data ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading unified accounting ledger...
                  </td>
                </tr>
              ) : (data?.entries || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No ledger entries match the current filters.
                  </td>
                </tr>
              ) : (
                (data?.entries || []).map((row: AccountingEntryItem) => {
                  const isRev = Number(row.is_reversed) === 1;
                  const costExp = Number(row.cost_amount || 0) + Number(row.fee_amount || 0) + Number(row.expense_amount || 0);
                  const prof = Number(row.net_profit_impact || 0);
                  return (
                    <tr key={row.id} className={isRev ? 'opacity-50 line-through bg-slate-50/40 dark:bg-slate-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}>
                      <td className="py-2 px-3 font-mono text-[10px]">
                        <p className="font-bold text-slate-900 dark:text-white">{row.entry_number}</p>
                        <p className="text-slate-500">{row.occurred_lagos}</p>
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          {row.source_origin}
                        </span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{formatDomainLabel(row.service_domain)}</p>
                      </td>
                      <td className="py-2 px-3">
                        <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[230px]">{row.title}</p>
                        <p className="text-[10px] font-mono text-slate-500 truncate max-w-[230px]">
                          {row.customer_name || row.staff_name || '—'} · {row.reference}
                        </p>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] uppercase">{row.payment_channel}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {Number(row.revenue_amount) !== 0 ? formatNaira(row.revenue_amount) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        {costExp !== 0 ? formatNaira(costExp) : '—'}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${prof > 0 ? 'text-emerald-600' : prof < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {prof !== 0 ? formatNaira(prof, true) : `${formatNaira(row.wallet_liability_delta, true)} liab`}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {!isRev && canAdjust ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReverseTarget(row);
                              setReverseReason('');
                            }}
                            className="px-2 py-1 rounded text-[10px] font-semibold text-red-600 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reverse</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400">{isRev ? 'REVERSED' : 'LOCKED'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reversal Modal */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReverse}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">Reverse Entry {reverseTarget.entry_number}</h4>
            <p className="text-slate-600 dark:text-slate-400">
              Creates a full audit contra-entry and removes <strong>{reverseTarget.title}</strong> from net business totals.
            </p>
            <input
              type="text"
              required
              value={reverseReason}
              onChange={e => setReverseReason(e.target.value)}
              placeholder="Audit reason for reversal..."
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReverseTarget(null)} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={reversing} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5">
                {reversing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Reversal</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// MODULE 9: BUSINESS PERFORMANCE ANALYTICS
// =========================================================================

export const BusinessAnalyticsView: React.FC<{
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
}> = ({ dateFrom, dateTo, refreshKey }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.getAccountingAnalytics({ date_from: dateFrom, date_to: dateTo });
        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [dateFrom, dateTo, refreshKey]);

  if (loading && !data) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Computing margin rankings &amp; staff/service analytics...</span>
      </div>
    );
  }

  if (!data) return null;
  const s = data.summary;
  const topServices = data.top_services || [];
  const expenseBreakdown = data.expense_breakdown || [];
  const staffPerf = data.staff_performance || [];
  const maxExp = Math.max(1, ...expenseBreakdown.map((e: any) => Number(e.total_amount || 0)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500">Website Contribution</p>
          <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">{formatNaira(s.website_revenue)}</p>
          <p className="text-[11px] text-slate-500">
            {s.total_business_revenue > 0 ? ((s.website_revenue / s.total_business_revenue) * 100).toFixed(1) : '0.0'}% of total revenue
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500">Physical Counter Contribution</p>
          <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">{formatNaira(s.physical_revenue)}</p>
          <p className="text-[11px] text-slate-500">
            {s.total_business_revenue > 0 ? ((s.physical_revenue / s.total_business_revenue) * 100).toFixed(1) : '0.0'}% of total revenue
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500">Gross Margin (Before OpEx)</p>
          <p className="text-xl font-extrabold font-mono text-blue-700 dark:text-blue-400 mt-1">{formatNaira(s.gross_margin)}</p>
          <p className="text-[11px] text-slate-500">Revenue minus provider &amp; direct COGS</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-slate-500">Net Profit Margin</p>
          <p className={`text-xl font-extrabold font-mono mt-1 ${s.profit_margin_percent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {Number(s.profit_margin_percent).toFixed(1)}%
          </p>
          <p className="text-[11px] text-slate-500">Net: {formatNaira(s.net_profit)}</p>
        </div>
      </div>

      {/* Top Services Profitability Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-600" />
          <span>Service Profitability Ranking (Website + Physical + Other Income)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Service Line</th>
                <th className="py-2.5 px-4">Origin</th>
                <th className="py-2.5 px-4 text-right">Qty</th>
                <th className="py-2.5 px-4 text-right">Net Revenue</th>
                <th className="py-2.5 px-4 text-right">Cost / COGS</th>
                <th className="py-2.5 px-4 text-right">Fees</th>
                <th className="py-2.5 px-4 text-right">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topServices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No completed service revenue in this date window.
                  </td>
                </tr>
              ) : (
                topServices.map((srv: any, idx: number) => (
                  <tr key={`${srv.source_origin}-${srv.service_domain}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{formatDomainLabel(srv.service_domain)}</td>
                    <td className="py-2.5 px-4 font-mono text-[10px] uppercase text-slate-500">{srv.source_origin}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{srv.sales_count}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNaira(srv.revenue)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600">{formatNaira(srv.cogs)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">{formatNaira(srv.fees)}</td>
                    <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${Number(srv.net_profit) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatNaira(srv.net_profit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Operating Expense Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">Operating Expense Breakdown</h4>
          {expenseBreakdown.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">No operating expenses recorded in this period.</p>
          ) : (
            <div className="space-y-3">
              {expenseBreakdown.map((ex: any) => {
                const pct = Math.min(100, Math.round((Number(ex.total_amount) / maxExp) * 100));
                return (
                  <div key={ex.category} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                        {String(ex.category).replace(/_/g, ' ')} ({ex.items_count})
                      </span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatNaira(ex.total_amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div style={{ width: `${pct}%` }} className="h-full bg-rose-500 rounded-full" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Physical Counter Staff Leaderboard */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">Receptionist &amp; Counter Staff Output</h4>
          {staffPerf.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">No physical counter sales recorded by staff in this period.</p>
          ) : (
            <div className="space-y-2.5">
              {staffPerf.map((st: any, idx: number) => (
                <div
                  key={`${st.staff_name}-${idx}`}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{st.staff_name}</p>
                    <p className="text-[11px] text-slate-500">{st.sales_count} completed counter receipts</p>
                  </div>
                  <div className="text-right font-mono">
                    <p className="font-bold text-slate-900 dark:text-white">{formatNaira(st.total_revenue)}</p>
                    <p className="text-[10px] text-emerald-600 font-semibold">Profit: {formatNaira(st.net_profit)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// MODULE 10: AUTOMATED DAILY EMAIL REPORTING (12:00 PM AFRICA/LAGOS)
// =========================================================================

export const DailyEmailReportView: React.FC<{
  refreshKey: number;
  canConfigure: boolean;
}> = ({ refreshKey, canConfigure }) => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [logs, setLogs] = useState<AccountingReportLog[]>([]);
  const [customRecipients, setCustomRecipients] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.previewAccountingDailyReport();
      setReport(res.report);
      setLogs(res.logs || []);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to build daily midday report preview.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  const handleSendNow = async () => {
    setSending(true);
    setFeedback(null);
    try {
      const recs = customRecipients
        .split(/[\s,;]+/)
        .map(s => s.trim())
        .filter(Boolean);
      const res = await api.sendAccountingDailyReportNow(recs.length > 0 ? recs : undefined);
      setFeedback({
        type: 'success',
        text: `Report dispatched successfully to ${res.recipients.join(', ')} (Key: ${res.report_key}).`,
      });
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to dispatch report email. Check SMTP settings.' });
    } finally {
      setSending(false);
    }
  };

  if (loading && !report) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Compiling 12:00 PM Africa/Lagos Financial Brief preview...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>Automated Daily Financial Email Brief (12:00 PM Africa/Lagos)</span>
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              Scheduled daily cron delivers <strong>Previous Day Final ({report?.prev_day_date})</strong> +{' '}
              <strong>Current Day Activity ({report?.lagos_report_date} 00:00&ndash;{report?.cutoff_time_lagos})</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Preview</span>
          </button>
        </div>

        {canConfigure && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="text"
              value={customRecipients}
              onChange={e => setCustomRecipients(e.target.value)}
              placeholder={`Optional recipient override (default: ${(report?.recipients || []).join(', ')})`}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSendNow}
              disabled={sending}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Send Report Email Now</span>
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Email HTML Live Preview */}
      {report?.html && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white">Live Rendered Email Preview</span>
            <span className="text-[11px] font-mono text-slate-500 truncate max-w-md">{report.subject}</span>
          </div>
          <div className="bg-slate-100 dark:bg-slate-950 p-3">
            <iframe
              title="Daily Accounting Email Preview"
              srcDoc={report.html}
              className="w-full h-[540px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
              sandbox=""
            />
          </div>
        </div>
      )}

      {/* Email Dispatch Logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span>Daily Report Delivery History</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2 px-4">Sent At</th>
                <th className="py-2 px-4">Key / Type</th>
                <th className="py-2 px-4">Report Window</th>
                <th className="py-2 px-4">Recipients</th>
                <th className="py-2 px-4">Triggered By</th>
                <th className="py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No daily accounting emails have been dispatched yet.
                  </td>
                </tr>
              ) : (
                logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-mono text-[11px] text-slate-500">{l.sent_at}</td>
                    <td className="py-2 px-4 font-mono text-[11px]">{l.report_key}</td>
                    <td className="py-2 px-4 text-[11px]">
                      {l.prev_day_date} + {l.lagos_report_date} ({l.cutoff_time_lagos})
                    </td>
                    <td className="py-2 px-4 text-[11px] truncate max-w-[200px]">{l.recipients}</td>
                    <td className="py-2 px-4 font-mono text-[10px]">{l.triggered_by}</td>
                    <td className="py-2 px-4">
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                          l.status === 'sent' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'
                        }`}
                      >
                        {l.status}
                      </span>
                      {l.error_message && <p className="text-[10px] text-red-500 mt-0.5">{l.error_message}</p>}
                    </td>
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

// =========================================================================
// MODULE 11: ACCOUNTING CONFIGURATION & PERMISSIONS
// =========================================================================

export const AccountingConfigView: React.FC<{
  refreshKey: number;
  isSuperAdmin: boolean;
  onDataChanged: () => void;
}> = ({ refreshKey, isSuperAdmin, onDataChanged }) => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AccountingConfig | null>(null);
  const [accounts, setAccounts] = useState<AccountingAccountRecord[]>([]);
  const [recipientsText, setRecipientsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingAccCode, setSavingAccCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingConfig();
      setConfig(res.config);
      setAccounts(res.accounts || []);
      setRecipientsText((res.config?.daily_email_recipients || []).join(', '));
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load accounting configuration.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setFeedback(null);
    try {
      const recipients = recipientsText
        .split(/[\s,;]+/)
        .map(s => s.trim())
        .filter(Boolean);
      const res = await api.updateAccountingConfig({
        ...config,
        daily_email_recipients: recipients,
      });
      setConfig(res.config);
      setFeedback({ type: 'success', text: 'Accounting settings, schedule, and fee rules saved.' });
      onDataChanged();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Unable to save accounting configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAccount = async (acc: AccountingAccountRecord) => {
    setSavingAccCode(acc.account_code);
    setFeedback(null);
    try {
      await api.updateAccountingAccount(acc.account_code, {
        account_name: acc.account_name,
        bank_name: acc.bank_name || '',
        account_number: acc.account_number || '',
        opening_balance: Number(acc.opening_balance || 0),
        opening_date: acc.opening_date || undefined,
      });
      setFeedback({ type: 'success', text: `${acc.account_name} updated.` });
      onDataChanged();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to update account.' });
    } finally {
      setSavingAccCode(null);
    }
  };

  if (loading && !config) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Loading accounting configuration &amp; financial accounts...</span>
      </div>
    );
  }

  if (!config) return null;
  const readOnlyNotice = !isSuperAdmin && config.restrict_config_to_superadmin;

  return (
    <div className="space-y-6">
      {readOnlyNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Configuration editing is currently restricted to Super Admin accounts. Viewing in read-only mode.</span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Rules & Email Schedule Form */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 text-xs"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" />
              <span>Accounting Policies, Fee Rules &amp; 12:00 PM Daily Email Settings</span>
            </h3>
            <p className="text-slate-500 dark:text-slate-400">Timezone locked to Africa/Lagos (WAT, UTC+1).</p>
          </div>
          {!readOnlyNotice && (
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Configuration</span>
            </button>
          )}
        </div>

        {/* Daily Email Schedule */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Daily Report Email Recipients (comma-separated)
            </label>
            <input
              type="text"
              disabled={readOnlyNotice}
              value={recipientsText}
              onChange={e => setRecipientsText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Morning Activity Cut-off (WAT)
            </label>
            <input
              type="text"
              disabled={readOnlyNotice}
              value={config.daily_email_cutoff_time}
              onChange={e => setConfig({ ...config, daily_email_cutoff_time: e.target.value })}
              placeholder="11:59"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">POS Fee (%)</label>
            <input
              type="number"
              step="0.01"
              disabled={readOnlyNotice}
              value={config.pos_fee_percent}
              onChange={e => setConfig({ ...config, pos_fee_percent: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">POS Fee Cap (&#8358;)</label>
            <input
              type="number"
              step="1"
              disabled={readOnlyNotice}
              value={config.pos_fee_cap}
              onChange={e => setConfig({ ...config, pos_fee_cap: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Paystack Fee (%)</label>
            <input
              type="number"
              step="0.01"
              disabled={readOnlyNotice}
              value={config.paystack_fee_percent}
              onChange={e => setConfig({ ...config, paystack_fee_percent: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Paystack Fee Cap (&#8358;)</label>
            <input
              type="number"
              step="1"
              disabled={readOnlyNotice}
              value={config.paystack_fee_cap}
              onChange={e => setConfig({ ...config, paystack_fee_cap: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
            />
          </div>
        </div>

        {/* Report Section & Governance Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-2">
            <p className="font-bold text-slate-900 dark:text-white">Automation &amp; RBAC Safeguards</p>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={readOnlyNotice}
                checked={Boolean(config.daily_email_enabled)}
                onChange={e => setConfig({ ...config, daily_email_enabled: e.target.checked })}
              />
              <span>Enable Automated 12:00 PM Africa/Lagos Daily Email Report</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={readOnlyNotice}
                checked={Boolean(config.restrict_reversals_to_superadmin)}
                onChange={e => setConfig({ ...config, restrict_reversals_to_superadmin: e.target.checked })}
              />
              <span>Restrict Voiding &amp; Ledger Reversals to Super Admin Only</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={readOnlyNotice}
                checked={Boolean(config.restrict_config_to_superadmin)}
                onChange={e => setConfig({ ...config, restrict_config_to_superadmin: e.target.checked })}
              />
              <span>Restrict Accounting Configuration Changes to Super Admin Only</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={readOnlyNotice}
                checked={Boolean(config.exclude_internal_admin_wallets_from_liability)}
                onChange={e => setConfig({ ...config, exclude_internal_admin_wallets_from_liability: e.target.checked })}
              />
              <span>Exclude Internal Admin/Test Wallets from Customer Liabilities</span>
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-slate-900 dark:text-white">Daily Email Report Included Sections</p>
            {Object.entries(config.report_sections || {}).map(([key, val]) => (
              <label key={key} className="flex items-center gap-2 text-slate-700 dark:text-slate-300 capitalize">
                <input
                  type="checkbox"
                  disabled={readOnlyNotice}
                  checked={Boolean(val)}
                  onChange={e =>
                    setConfig({
                      ...config,
                      report_sections: { ...config.report_sections, [key]: e.target.checked },
                    })
                  }
                />
                <span>{key.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </div>
      </form>

      {/* Channel Opening Balances & Bank Account Mapping */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Landmark className="w-4 h-4 text-blue-600" />
          <span>Channel Accounts &amp; Opening Balances</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {accounts.map((acc, idx) => (
            <div key={acc.account_code} className="p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end text-xs">
              <div>
                <p className="font-mono text-[10px] text-slate-500">{acc.account_code}</p>
                <input
                  type="text"
                  disabled={readOnlyNotice}
                  value={acc.account_name}
                  onChange={e => {
                    const copy = [...accounts];
                    copy[idx] = { ...acc, account_name: e.target.value };
                    setAccounts(copy);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold mt-0.5"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Bank / Provider</label>
                <input
                  type="text"
                  disabled={readOnlyNotice}
                  value={acc.bank_name || ''}
                  onChange={e => {
                    const copy = [...accounts];
                    copy[idx] = { ...acc, bank_name: e.target.value };
                    setAccounts(copy);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Account / Terminal ID</label>
                <input
                  type="text"
                  disabled={readOnlyNotice}
                  value={acc.account_number || ''}
                  onChange={e => {
                    const copy = [...accounts];
                    copy[idx] = { ...acc, account_number: e.target.value };
                    setAccounts(copy);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Opening Balance (&#8358;)</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnlyNotice}
                  value={acc.opening_balance}
                  onChange={e => {
                    const copy = [...accounts];
                    copy[idx] = { ...acc, opening_balance: e.target.value };
                    setAccounts(copy);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              <div className="flex justify-end">
                {!readOnlyNotice && (
                  <button
                    type="button"
                    disabled={savingAccCode === acc.account_code}
                    onClick={() => handleUpdateAccount(acc)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5"
                  >
                    {savingAccCode === acc.account_code ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    <span>Save</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
