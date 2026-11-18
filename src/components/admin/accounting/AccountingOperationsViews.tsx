import React, { useState, useEffect } from 'react';
import {
  Plus,
  Printer,
  Package,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Ban,
  Store,
  Boxes,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../../lib/api';
import {
  AccountingExpenseIncomeItem,
  AccountingPhysicalSaleItem,
  AccountingInventoryItem,
  AccountingInventoryMovement,
} from '../../../types';
import {
  formatNaira,
  getLagosDateString,
  PHYSICAL_SERVICE_CATEGORIES,
  EXPENSE_CATEGORIES,
  OTHER_INCOME_CATEGORIES,
} from './accountingUtils';

// =========================================================================
// MODULE 4: INCOME & EXPENSE MANAGEMENT
// =========================================================================

export const ExpensesIncomeView: React.FC<{
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
  canAdjust: boolean;
  onDataChanged: () => void;
}> = ({ dateFrom, dateTo, refreshKey, canAdjust, onDataChanged }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'other_income'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'voided'>('active');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Void modal
  const [voidTarget, setVoidTarget] = useState<AccountingExpenseIncomeItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Form fields
  const [recordType, setRecordType] = useState<'expense' | 'other_income'>('expense');
  const [entryDate, setEntryDate] = useState(getLagosDateString(0));
  const [category, setCategory] = useState('power_fuel');
  const [title, setTitle] = useState('');
  const [partyName, setPartyName] = useState('');
  const [amount, setAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | 'bank_transfer' | 'wallet' | 'other'>('cash');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingExpensesIncome({
        date_from: dateFrom,
        date_to: dateTo,
        record_type: typeFilter,
        status: statusFilter,
      });
      setData(res);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load expenses and income records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo, typeFilter, statusFilter, refreshKey]);

  const handleTypeSwitch = (rt: 'expense' | 'other_income') => {
    setRecordType(rt);
    setCategory(rt === 'expense' ? EXPENSE_CATEGORIES[0].value : OTHER_INCOME_CATEGORIES[0].value);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title.trim() || !Number.isFinite(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', text: 'Please enter a valid title and positive amount.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await api.createAccountingExpenseOrIncome({
        record_type: recordType,
        entry_date: entryDate,
        category,
        title: title.trim(),
        party_name: partyName.trim() || undefined,
        amount: numAmount,
        fee_amount: Number(feeAmount || 0),
        payment_method: paymentMethod,
        reference: reference.trim() || undefined,
        description: description.trim() || undefined,
      });
      setTitle('');
      setPartyName('');
      setAmount('');
      setFeeAmount('0');
      setReference('');
      setDescription('');
      setShowForm(false);
      setFeedback({
        type: 'success',
        text: `${recordType === 'expense' ? 'Operating expense' : 'Other business income'} voucher recorded and posted to accounting ledger.`,
      });
      onDataChanged();
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to save voucher.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await api.voidAccountingExpenseOrIncome(voidTarget.id, voidReason.trim() || 'Voided by administrator');
      setVoidTarget(null);
      setVoidReason('');
      setFeedback({ type: 'success', text: `Voucher ${voidTarget.voucher_number} voided and reversed.` });
      onDataChanged();
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Unable to void voucher.' });
    } finally {
      setVoiding(false);
    }
  };

  const summary = data?.summary;
  const activeCategories = recordType === 'expense' ? EXPENSE_CATEGORIES : OTHER_INCOME_CATEGORIES;

  return (
    <div className="space-y-5">
      {/* Header & CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">Income &amp; Operating Expense Vouchers</h3>
          <p className="text-slate-500 dark:text-slate-400">
            Track rent, fuel, power, salaries, stationery, bank fees, and non-portal consultancy or training income.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{showForm ? 'Close Form' : 'Record Expense / Income'}</span>
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

      {/* New Voucher Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleTypeSwitch('expense')}
              className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-1.5 border transition ${
                recordType === 'expense'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Operating Expense (Outflow)</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch('other_income')}
              className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-1.5 border transition ${
                recordType === 'other_income'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span>Other Business Income (Inflow)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Date (WAT)</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                {activeCategories.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Amount (&#8358;)</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 15000"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Payment Channel</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                <option value="cash">Cash Drawer</option>
                <option value="bank_transfer">Company Bank Transfer</option>
                <option value="pos">POS Terminal</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Voucher Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={recordType === 'expense' ? 'e.g. Generator Fuel (20 Litres)' : 'e.g. Corporate CAC Setup Advisory'}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {recordType === 'expense' ? 'Vendor / Paid To' : 'Client / Received From'}
              </label>
              <input
                type="text"
                value={partyName}
                onChange={e => setPartyName(e.target.value)}
                placeholder="Optional name"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Bank/POS Fee (&#8358;)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={feeAmount}
                  onChange={e => setFeeAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">External Ref</label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Receipt / Ref"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Notes / Justification</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional detailed breakdown"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Post Voucher to Ledger</span>
            </button>
          </div>
        </form>
      )}

      {/* KPI Strip */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Operating Expenses (Period)</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
              {formatNaira(summary.total_expenses)}
            </p>
            <p className="text-[11px] text-slate-500">{summary.expense_count} active expense vouchers</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Other Business Income</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
              {formatNaira(summary.total_other_income)}
            </p>
            <p className="text-[11px] text-slate-500">{summary.income_count} active income vouchers</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Bank &amp; Voucher Charges</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(summary.total_fees)}
            </p>
            <p className="text-[11px] text-slate-500">Transfer / stamp duty charges</p>
          </div>
        </div>
      )}

      {/* Filters & Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">All Vouchers</option>
              <option value="expense">Operating Expenses</option>
              <option value="other_income">Other Income</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            >
              <option value="active">Active Only</option>
              <option value="voided">Voided Only</option>
              <option value="all">All Statuses</option>
            </select>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {(data?.records || []).length} vouchers shown
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Voucher &amp; Date</th>
                <th className="py-2.5 px-4">Type &amp; Category</th>
                <th className="py-2.5 px-4">Title / Party</th>
                <th className="py-2.5 px-4">Channel</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4 text-right">Fee</th>
                <th className="py-2.5 px-4">Recorded By</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !data ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading vouchers...
                  </td>
                </tr>
              ) : (data?.records || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No vouchers recorded for the selected period.
                  </td>
                </tr>
              ) : (
                (data?.records || []).map((r: AccountingExpenseIncomeItem) => (
                  <tr key={r.id} className={r.status === 'voided' ? 'opacity-55 bg-slate-50/50 dark:bg-slate-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}>
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      <p className="font-bold text-slate-900 dark:text-white">{r.voucher_number}</p>
                      <p className="text-slate-500">{r.entry_date}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-block text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                          r.record_type === 'expense'
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {r.record_type === 'expense' ? 'EXPENSE' : 'INCOME'}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{r.category.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <p className={`font-semibold text-slate-900 dark:text-white ${r.status === 'voided' ? 'line-through' : ''}`}>
                        {r.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {r.party_name || r.description || r.reference || '—'}
                      </p>
                      {r.status === 'voided' && (
                        <p className="text-[10px] text-red-500 font-medium">Voided: {r.void_reason}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] uppercase text-slate-600 dark:text-slate-300">
                      {r.payment_method}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                        r.record_type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatNaira(r.amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                      {Number(r.fee_amount) > 0 ? formatNaira(r.fee_amount) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-slate-600 dark:text-slate-400">
                      {r.recorded_by_name || 'Admin'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {r.status === 'active' && canAdjust ? (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTarget(r);
                            setVoidReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200 dark:border-red-500/30"
                        >
                          Void
                        </button>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{r.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Void Confirmation Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmVoid}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-600" />
                <span>Void Voucher {voidTarget.voucher_number}</span>
              </h4>
              <button type="button" onClick={() => setVoidTarget(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Voiding <strong>{voidTarget.title}</strong> ({formatNaira(voidTarget.amount)}) marks the voucher as voided and reverses its impact on cash/bank balances and profit.
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Reason for Voiding</label>
              <input
                type="text"
                required
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="e.g. Duplicate entry or cancelled payment"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={voiding}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {voiding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Void</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// MODULE 5: PHYSICAL BUSINESS SALES & RECEPTIONIST RECORDS
// =========================================================================

export const PhysicalSalesView: React.FC<{
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
  canAdjust: boolean;
  onDataChanged: () => void;
}> = ({ dateFrom, dateTo, refreshKey, canAdjust, onDataChanged }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [inventoryItems, setInventoryItems] = useState<AccountingInventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Form state
  const [saleDate, setSaleDate] = useState(getLagosDateString(0));
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceCategory, setServiceCategory] = useState('nin_slip_print');
  const [serviceName, setServiceName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [directCost, setDirectCost] = useState('0');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [inventoryQtyUsed, setInventoryQtyUsed] = useState('1');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'pos' | 'transfer' | 'split'>('cash');
  const [cashAmount, setCashAmount] = useState('0');
  const [posAmount, setPosAmount] = useState('0');
  const [transferAmount, setTransferAmount] = useState('0');
  const [posFee, setPosFee] = useState('');
  const [posRrn, setPosRrn] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [description, setDescription] = useState('');

  // Receipt print & void modal
  const [receiptSale, setReceiptSale] = useState<AccountingPhysicalSaleItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<AccountingPhysicalSaleItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [salesRes, invRes] = await Promise.all([
        api.getAccountingPhysicalSales({
          date_from: dateFrom,
          date_to: dateTo,
          service_category: categoryFilter,
          payment_mode: paymentFilter,
          search: search.trim() || undefined,
        }),
        api.getAccountingInventory(),
      ]);
      setData(salesRes);
      setInventoryItems((invRes.items || []).filter(i => Boolean(Number(i.is_active))));
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load physical counter sales.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo, categoryFilter, paymentFilter, refreshKey]);

  const grossCalc = Math.max(0, Number(quantity || 0) * Number(unitPrice || 0));
  const netCalc = Math.max(0, grossCalc - Number(discountAmount || 0));

  const handleInventoryPick = (id: string) => {
    setInventoryItemId(id);
    if (!id) return;
    const item = inventoryItems.find(i => i.id === id);
    if (item) {
      if (!serviceName.trim()) setServiceName(item.name);
      if (!unitPrice && Number(item.default_selling_price) > 0) {
        setUnitPrice(String(item.default_selling_price));
      }
      const q = Number(inventoryQtyUsed || quantity || 1);
      setDirectCost((Number(item.average_unit_cost) * q).toFixed(2));
    }
  };

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || netCalc <= 0) {
      setFeedback({ type: 'error', text: 'Enter service description and positive unit price.' });
      return;
    }
    if (paymentMode === 'split') {
      const splitSum = Number(cashAmount || 0) + Number(posAmount || 0) + Number(transferAmount || 0);
      if (Math.abs(splitSum - netCalc) > 0.5) {
        setFeedback({
          type: 'error',
          text: `Split amounts (${formatNaira(splitSum)}) must equal net total (${formatNaira(netCalc)}).`,
        });
        return;
      }
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.createAccountingPhysicalSale({
        sale_date: saleDate,
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || undefined,
        service_category: serviceCategory,
        service_name: serviceName.trim(),
        description: description.trim() || undefined,
        quantity: Number(quantity || 1),
        unit_price: Number(unitPrice || 0),
        discount_amount: Number(discountAmount || 0),
        direct_cost: Number(directCost || 0),
        inventory_item_id: inventoryItemId || undefined,
        inventory_qty_used: inventoryItemId ? Number(inventoryQtyUsed || quantity || 1) : undefined,
        payment_mode: paymentMode,
        cash_amount: paymentMode === 'split' ? Number(cashAmount || 0) : undefined,
        pos_amount: paymentMode === 'split' ? Number(posAmount || 0) : undefined,
        transfer_amount: paymentMode === 'split' ? Number(transferAmount || 0) : undefined,
        pos_fee: posFee.trim() !== '' ? Number(posFee) : undefined,
        pos_rrn: posRrn.trim() || undefined,
        bank_reference: bankReference.trim() || undefined,
      });

      setServiceName('');
      setCustomerPhone('');
      setQuantity('1');
      setUnitPrice('');
      setDiscountAmount('0');
      setDirectCost('0');
      setInventoryItemId('');
      setPosFee('');
      setPosRrn('');
      setBankReference('');
      setDescription('');
      setShowForm(false);
      setReceiptSale(res.sale);
      setFeedback({ type: 'success', text: `Counter sale recorded (${res.sale.receipt_number}).` });
      onDataChanged();
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to record physical sale.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await api.voidAccountingPhysicalSale(voidTarget.id, voidReason.trim() || 'Voided by administrator');
      setVoidTarget(null);
      setVoidReason('');
      setFeedback({ type: 'success', text: `Receipt ${voidTarget.receipt_number} voided and inventory restored.` });
      onDataChanged();
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to void sale.' });
    } finally {
      setVoiding(false);
    }
  };

  const printReceiptInFrame = (sale: AccountingPhysicalSaleItem) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>${sale.receipt_number}</title>
      <style>
        body { font-family: monospace; width: 300px; margin: 12px auto; color: #0f172a; font-size: 12px; }
        h2 { margin: 0 0 4px 0; font-size: 14px; text-align: center; }
        .muted { color: #475569; font-size: 11px; text-align: center; margin-bottom: 10px; }
        .line { border-top: 1px dashed #94a3b8; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        .bold { font-weight: bold; }
      </style></head><body>
      <h2>HAMBAK TECH &amp; SERVICES</h2>
      <div class="muted">Official Walk-in Counter Receipt</div>
      <div class="line"></div>
      <div class="row"><span>Receipt:</span><span class="bold">${sale.receipt_number}</span></div>
      <div class="row"><span>Date:</span><span>${sale.sale_date}</span></div>
      <div class="row"><span>Customer:</span><span>${sale.customer_name || 'Walk-in'}</span></div>
      <div class="row"><span>Attendant:</span><span>${sale.attendant_name || 'Staff'}</span></div>
      <div class="line"></div>
      <div class="bold">${sale.service_name}</div>
      <div class="row"><span>Qty ${Number(sale.quantity)} x ${formatNaira(sale.unit_price)}</span><span>${formatNaira(sale.gross_amount)}</span></div>
      ${Number(sale.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>-${formatNaira(sale.discount_amount)}</span></div>` : ''}
      <div class="line"></div>
      <div class="row bold"><span>TOTAL PAID (${sale.payment_mode.toUpperCase()})</span><span>${formatNaira(sale.net_amount)}</span></div>
      ${Number(sale.cash_amount) > 0 ? `<div class="row"><span>Cash:</span><span>${formatNaira(sale.cash_amount)}</span></div>` : ''}
      ${Number(sale.pos_amount) > 0 ? `<div class="row"><span>POS${sale.pos_rrn ? ` (${sale.pos_rrn})` : ''}:</span><span>${formatNaira(sale.pos_amount)}</span></div>` : ''}
      ${Number(sale.transfer_amount) > 0 ? `<div class="row"><span>Transfer:</span><span>${formatNaira(sale.transfer_amount)}</span></div>` : ''}
      <div class="line"></div>
      <div class="muted">Thank you for your patronage.</div>
      </body></html>`);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1200);
    }, 200);
  };

  const s = data?.summary;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-600" />
            <span>Physical Business Sales &amp; Receptionist Counter</span>
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            Record printing, lamination, passport photo, NIN/BVN slip printing, plastic ID cards &amp; accessory sales with split Cash/POS/Transfer and receipt printing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{showForm ? 'Close POS Form' : 'Record Counter Sale'}</span>
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

      {/* Counter Sale Form */}
      {showForm && (
        <form
          onSubmit={handleCreateSale}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Sale Date (WAT)</label>
              <input
                type="date"
                required
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Service Category</label>
              <select
                value={serviceCategory}
                onChange={e => setServiceCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                {PHYSICAL_SERVICE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Customer Phone</label>
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Service / Product Description</label>
              <input
                type="text"
                required
                value={serviceName}
                onChange={e => setServiceName(e.target.value)}
                placeholder="e.g. Premium Plastic NIN Slip + Lamination"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Quantity</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Unit Price (&#8358;)</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)}
                placeholder="1500"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Discount (&#8358;)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discountAmount}
                onChange={e => setDiscountAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Optional Inventory Link + Direct Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Deduct Stock Item (Optional)
              </label>
              <select
                value={inventoryItemId}
                onChange={e => handleInventoryPick(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                <option value="">No Stock Deduction</option>
                {inventoryItems.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.name} ({Number(it.current_stock)} {it.unit_label} avail)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Stock Qty Used</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!inventoryItemId}
                value={inventoryQtyUsed}
                onChange={e => {
                  setInventoryQtyUsed(e.target.value);
                  const it = inventoryItems.find(x => x.id === inventoryItemId);
                  if (it) setDirectCost((Number(it.average_unit_cost) * Number(e.target.value || 0)).toFixed(2));
                }}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Direct Material Cost / COGS (&#8358;)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={directCost}
                onChange={e => setDirectCost(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Payment Method & Split */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {(['cash', 'pos', 'transfer', 'split'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`px-3 py-1.5 rounded-lg font-semibold uppercase text-[11px] border transition ${
                      paymentMode === mode
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {mode === 'split' ? 'Split (Cash+POS+Bank)' : mode}
                  </button>
                ))}
              </div>
              <div className="text-right font-mono">
                <span className="text-slate-500 mr-2">Net Total:</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white">{formatNaira(netCalc)}</span>
              </div>
            </div>

            {paymentMode === 'split' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Cash Part (&#8358;)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">POS Part (&#8358;)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={posAmount}
                    onChange={e => setPosAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Transfer Part (&#8358;)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(paymentMode === 'pos' || paymentMode === 'split') && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">POS Fee (blank = auto config)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={posFee}
                      onChange={e => setPosFee(e.target.value)}
                      placeholder="Auto"
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">POS RRN / Terminal Ref</label>
                    <input
                      type="text"
                      value={posRrn}
                      onChange={e => setPosRrn(e.target.value)}
                      placeholder="Optional RRN"
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                    />
                  </div>
                </>
              )}
              {(paymentMode === 'transfer' || paymentMode === 'split') && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Bank Transfer Ref</label>
                  <input
                    type="text"
                    value={bankReference}
                    onChange={e => setBankReference(e.target.value)}
                    placeholder="Sender / Session ID"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Complete Sale &amp; Issue Receipt</span>
            </button>
          </div>
        </form>
      )}

      {/* Summary Strip */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Counter Revenue</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">{formatNaira(s.net_revenue)}</p>
            <p className="text-[10px] text-slate-500">{s.completed_count} receipts</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Net Counter Profit</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">{formatNaira(s.net_profit)}</p>
            <p className="text-[10px] text-slate-500">Cost {formatNaira(s.direct_cost)} · POS Fee {formatNaira(s.pos_fees)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Cash Drawer Inflow</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">{formatNaira(s.cash_total)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">POS Terminal Inflow</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">{formatNaira(s.pos_total)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Bank Transfer Inflow</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">{formatNaira(s.transfer_total)}</p>
          </div>
        </div>
      )}

      {/* Sales Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            <option value="all">All Categories</option>
            {PHYSICAL_SERVICE_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            <option value="all">All Payment Modes</option>
            <option value="cash">Cash</option>
            <option value="pos">POS</option>
            <option value="transfer">Bank Transfer</option>
            <option value="split">Split Payment</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="Search receipt #, service, customer, attendant..."
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
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Receipt &amp; Date</th>
                <th className="py-2.5 px-4">Service &amp; Customer</th>
                <th className="py-2.5 px-4">Payment Split</th>
                <th className="py-2.5 px-4 text-right">Net Total</th>
                <th className="py-2.5 px-4 text-right">Cost / Fee</th>
                <th className="py-2.5 px-4">Attendant</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading counter sales...
                  </td>
                </tr>
              ) : (data?.sales || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No walk-in / physical counter sales found in this range.
                  </td>
                </tr>
              ) : (
                (data?.sales || []).map((row: AccountingPhysicalSaleItem) => (
                  <tr
                    key={row.id}
                    className={row.status !== 'completed' ? 'opacity-55 bg-slate-50/40 dark:bg-slate-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                  >
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      <p className="font-bold text-slate-900 dark:text-white">{row.receipt_number}</p>
                      <p className="text-slate-500">{row.sale_date}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <p className={`font-semibold text-slate-900 dark:text-white ${row.status !== 'completed' ? 'line-through' : ''}`}>
                        {row.service_name} ({Number(row.quantity)})
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {row.customer_name || 'Walk-in'} {row.customer_phone ? `· ${row.customer_phone}` : ''}
                      </p>
                    </td>
                    <td className="py-2.5 px-4 text-[11px] font-mono">
                      <span className="uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {row.payment_mode}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {Number(row.cash_amount) > 0 && `Cash ${formatNaira(row.cash_amount)} `}
                        {Number(row.pos_amount) > 0 && `POS ${formatNaira(row.pos_amount)} `}
                        {Number(row.transfer_amount) > 0 && `Bank ${formatNaira(row.transfer_amount)}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                      {formatNaira(row.net_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                      {formatNaira(Number(row.direct_cost) + Number(row.pos_fee))}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-slate-600 dark:text-slate-400">
                      {row.attendant_name || 'Staff'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setReceiptSale(row)}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <Receipt className="w-3 h-3" />
                        <span>Receipt</span>
                      </button>
                      {row.status === 'completed' && canAdjust && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTarget(row);
                            setVoidReason('');
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-600 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Preview & Print Modal */}
      {receiptSale && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">HAMBAK TECH &amp; SERVICES</h4>
                <p className="text-[11px] font-mono text-slate-500">{receiptSale.receipt_number}</p>
              </div>
              <button type="button" onClick={() => setReceiptSale(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{receiptSale.sale_date}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span>{receiptSale.customer_name || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span>Service:</span>
                <span className="font-bold text-right">{receiptSale.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Qty &times; Unit:</span>
                <span>
                  {Number(receiptSale.quantity)} &times; {formatNaira(receiptSale.unit_price)}
                </span>
              </div>
              {Number(receiptSale.discount_amount) > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Discount:</span>
                  <span>-{formatNaira(receiptSale.discount_amount)}</span>
                </div>
              )}
              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2 pt-2 flex justify-between text-sm font-extrabold text-slate-900 dark:text-white">
                <span>Total Paid ({receiptSale.payment_mode.toUpperCase()}):</span>
                <span>{formatNaira(receiptSale.net_amount)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Attendant:</span>
                <span>{receiptSale.attendant_name}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReceiptSale(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => printReceiptInFrame(receiptSale)}
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Sale Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmVoid}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">Void Sale {voidTarget.receipt_number}</h4>
            <p className="text-slate-600 dark:text-slate-400">
              This reverses the counter revenue of <strong>{formatNaira(voidTarget.net_amount)}</strong> across Cash/POS/Bank channels and restores any deducted inventory stock.
            </p>
            <input
              type="text"
              required
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder="Reason for voiding receipt..."
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVoidTarget(null)} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={voiding} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5">
                {voiding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Void Sale</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// MODULE 6: INVENTORY & PURCHASE ACCOUNTING
// =========================================================================

export const InventoryAccountingView: React.FC<{
  refreshKey: number;
  onDataChanged: () => void;
}> = ({ refreshKey, onDataChanged }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [modalMode, setModalMode] = useState<'none' | 'item' | 'movement'>('none');
  const [editingItem, setEditingItem] = useState<AccountingInventoryItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Item form
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [itemCat, setItemCat] = useState('cards_slips');
  const [unitLabel, setUnitLabel] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('10');
  const [defaultSellingPrice, setDefaultSellingPrice] = useState('0');
  const [initialStock, setInitialStock] = useState('0');
  const [initialCost, setInitialCost] = useState('0');
  const [supplierName, setSupplierName] = useState('');

  // Movement form
  const [moveItemId, setMoveItemId] = useState('');
  const [movementType, setMovementType] = useState<'purchase' | 'usage' | 'wastage' | 'adjustment_in' | 'adjustment_out'>('purchase');
  const [moveQty, setMoveQty] = useState('1');
  const [moveUnitCost, setMoveUnitCost] = useState('0');
  const [movePayMethod, setMovePayMethod] = useState('cash');
  const [moveSupplier, setMoveSupplier] = useState('');
  const [moveRef, setMoveRef] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [recordAsExpense, setRecordAsExpense] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingInventory();
      setData(res);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Failed to load inventory ledger.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  const openNewItem = () => {
    setEditingItem(null);
    setName('');
    setSku('');
    setItemCat('cards_slips');
    setUnitLabel('pcs');
    setReorderLevel('10');
    setDefaultSellingPrice('0');
    setInitialStock('0');
    setInitialCost('0');
    setSupplierName('');
    setModalMode('item');
  };

  const openEditItem = (item: AccountingInventoryItem) => {
    setEditingItem(item);
    setName(item.name);
    setSku(item.sku);
    setItemCat(item.category);
    setUnitLabel(item.unit_label);
    setReorderLevel(String(item.reorder_level));
    setDefaultSellingPrice(String(item.default_selling_price));
    setSupplierName(item.supplier_name || '');
    setModalMode('item');
  };

  const openMovementModal = (item?: AccountingInventoryItem, mType: 'purchase' | 'usage' = 'purchase') => {
    const firstId = item?.id || data?.items?.[0]?.id || '';
    setMoveItemId(firstId);
    setMovementType(mType);
    setMoveQty('1');
    setMoveUnitCost(item ? String(item.average_unit_cost) : '0');
    setMoveSupplier(item?.supplier_name || '');
    setMoveRef('');
    setMoveNotes('');
    setRecordAsExpense(false);
    setModalMode('movement');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await api.saveAccountingInventoryItem(
        {
          name: name.trim(),
          sku: sku.trim() || undefined,
          category: itemCat,
          unit_label: unitLabel.trim() || 'pcs',
          reorder_level: Number(reorderLevel || 0),
          default_selling_price: Number(defaultSellingPrice || 0),
          supplier_name: supplierName.trim() || undefined,
          ...(editingItem
            ? {}
            : {
                initial_stock: Number(initialStock || 0),
                unit_cost: Number(initialCost || 0),
              }),
        },
        editingItem?.id
      );
      setModalMode('none');
      setFeedback({ type: 'success', text: editingItem ? 'Inventory item updated.' : 'New inventory SKU created.' });
      onDataChanged();
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Unable to save inventory item.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.recordAccountingInventoryMovement({
        item_id: moveItemId,
        movement_type: movementType,
        quantity: Number(moveQty || 0),
        unit_cost: Number(moveUnitCost || 0),
        payment_method: movePayMethod,
        supplier_name: moveSupplier.trim() || undefined,
        reference: moveRef.trim() || undefined,
        notes: moveNotes.trim() || undefined,
        record_as_expense: recordAsExpense,
      });
      setData((prev: any) => ({ ...prev, summary: res.summary, items: res.items, movements: res.movements }));
      setModalMode('none');
      setFeedback({ type: 'success', text: res.message || 'Stock movement posted.' });
      onDataChanged();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Unable to record stock movement.' });
    } finally {
      setSaving(false);
    }
  };

  const s = data?.summary;
  const items: AccountingInventoryItem[] = data?.items || [];
  const movements: AccountingInventoryMovement[] = data?.movements || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Boxes className="w-4 h-4 text-blue-600" />
            <span>Inventory, Supplies &amp; Purchase Accounting</span>
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            Track A4 paper, lamination pouches, PVC blank ID cards, ink/toner, and hardware stock with weighted-average unit cost.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openMovementModal(undefined, 'purchase')}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Restock / Record Usage</span>
          </button>
          <button
            type="button"
            onClick={openNewItem}
            className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add SKU</span>
          </button>
        </div>
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

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Active SKUs</p>
            <p className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">{s.total_items}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Low Stock Alerts</p>
            <p className={`text-2xl font-extrabold font-mono mt-1 ${s.low_stock_count > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {s.low_stock_count}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Inventory Asset Valuation (Cost)</p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(s.total_stock_valuation)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Potential Retail Value</p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
              {formatNaira(s.potential_retail_value)}
            </p>
          </div>
        </div>
      )}

      {/* Inventory Stock Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
          Current Stock Catalog
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">SKU &amp; Item</th>
                <th className="py-2.5 px-4 text-right">In Stock</th>
                <th className="py-2.5 px-4 text-right">Reorder At</th>
                <th className="py-2.5 px-4 text-right">Avg Unit Cost</th>
                <th className="py-2.5 px-4 text-right">Stock Valuation</th>
                <th className="py-2.5 px-4 text-right">Default Price</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading inventory catalog...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No inventory items yet. Click &ldquo;Add SKU&rdquo; to track paper, PVC cards, toner, or accessories.
                  </td>
                </tr>
              ) : (
                items.map(it => {
                  const isLow = Number(it.current_stock) <= Number(it.reorder_level);
                  const val = Number(it.current_stock) * Number(it.average_unit_cost);
                  return (
                    <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{it.name}</span>
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500">
                          {it.sku} &bull; {it.category}
                        </p>
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${isLow ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                        {Number(it.current_stock)} {it.unit_label}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                        {Number(it.reorder_level)} {it.unit_label}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNaira(it.average_unit_cost)}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatNaira(val)}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatNaira(it.default_selling_price)}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openMovementModal(it, 'purchase')}
                          className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold text-[11px]"
                        >
                          +Restock
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditItem(it)}
                          className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Stock Movements */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
          Stock Movement &amp; Purchase Log
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold uppercase text-slate-500 sticky top-0">
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Item</th>
                <th className="py-2 px-4">Type</th>
                <th className="py-2 px-4 text-right">Qty &Delta;</th>
                <th className="py-2 px-4 text-right">Total Cost</th>
                <th className="py-2 px-4 text-right">After</th>
                <th className="py-2 px-4">Notes / Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No inventory movements logged yet.
                  </td>
                </tr>
              ) : (
                movements.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-mono text-[11px] text-slate-500">{m.entry_date}</td>
                    <td className="py-2 px-4 font-semibold text-slate-900 dark:text-white">{m.item_name || m.sku}</td>
                    <td className="py-2 px-4 font-mono text-[10px] uppercase">{m.movement_type}</td>
                    <td
                      className={`py-2 px-4 text-right font-mono tabular-nums font-bold ${
                        Number(m.quantity_delta) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {Number(m.quantity_delta) > 0 ? `+${Number(m.quantity_delta)}` : Number(m.quantity_delta)} {m.unit_label || ''}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums">{formatNaira(m.total_cost)}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-500">{Number(m.stock_after)}</td>
                    <td className="py-2 px-4 text-[11px] text-slate-500">{m.notes || m.reference || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit SKU Modal */}
      {modalMode === 'item' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveItem}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-3.5 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {editingItem ? `Edit ${editingItem.name}` : 'Create Inventory SKU'}
              </h4>
              <button type="button" onClick={() => setModalMode('none')} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Blank PVC Cards (Pack of 100)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">SKU Code (optional)</label>
                <input
                  type="text"
                  value={sku}
                  onChange={e => setSku(e.target.value)}
                  placeholder="Auto if blank"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Category</label>
                <select
                  value={itemCat}
                  onChange={e => setItemCat(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  <option value="cards_slips">PVC Cards &amp; Slips</option>
                  <option value="paper_stationery">Paper, Envelopes &amp; Stationery</option>
                  <option value="ink_toner">Printer Ink &amp; Toner</option>
                  <option value="lamination">Lamination &amp; Binding Supplies</option>
                  <option value="hardware">POS / Biometric Hardware</option>
                  <option value="consumable">General Consumables</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Unit Label</label>
                <input
                  type="text"
                  value={unitLabel}
                  onChange={e => setUnitLabel(e.target.value)}
                  placeholder="pcs / reams / packs"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Reorder Alert Threshold</label>
                <input
                  type="number"
                  step="0.01"
                  value={reorderLevel}
                  onChange={e => setReorderLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Default Retail Price (&#8358;)</label>
                <input
                  type="number"
                  step="0.01"
                  value={defaultSellingPrice}
                  onChange={e => setDefaultSellingPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              {!editingItem && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Opening Stock Qty</label>
                    <input
                      type="number"
                      step="0.01"
                      value={initialStock}
                      onChange={e => setInitialStock(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Unit Cost (&#8358;)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={initialCost}
                      onChange={e => setInitialCost(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                    />
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Preferred Supplier</label>
              <input
                type="text"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalMode('none')} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-700 text-white font-bold flex items-center gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save SKU</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Movement Modal */}
      {modalMode === 'movement' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordMovement}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-3.5 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Record Stock Purchase / Usage</h4>
              <button type="button" onClick={() => setModalMode('none')} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Inventory Item</label>
                <select
                  required
                  value={moveItemId}
                  onChange={e => {
                    setMoveItemId(e.target.value);
                    const it = items.find(x => x.id === e.target.value);
                    if (it) setMoveUnitCost(String(it.average_unit_cost));
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({Number(it.current_stock)} {it.unit_label})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Movement Type</label>
                <select
                  value={movementType}
                  onChange={e => setMovementType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  <option value="purchase">Stock Purchase (Restock +)</option>
                  <option value="usage">Internal Consumable Usage (−)</option>
                  <option value="wastage">Spoilage / Damaged Wastage (−)</option>
                  <option value="adjustment_in">Audit Adjustment (+)</option>
                  <option value="adjustment_out">Audit Adjustment (−)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={moveQty}
                  onChange={e => setMoveQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Unit Cost (&#8358;)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={moveUnitCost}
                  onChange={e => setMoveUnitCost(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
              {movementType === 'purchase' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Paid Via</label>
                    <select
                      value={movePayMethod}
                      onChange={e => setMovePayMethod(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    >
                      <option value="cash">Cash Drawer</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="pos">POS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Supplier</label>
                    <input
                      type="text"
                      value={moveSupplier}
                      onChange={e => setMoveSupplier(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                </>
              )}
            </div>
            {movementType === 'purchase' && (
              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={recordAsExpense}
                  onChange={e => setRecordAsExpense(e.target.checked)}
                />
                <span>Expense entire purchase immediately (instead of capitalizing as stock asset until sold/used)</span>
              </label>
            )}
            <div>
              <label className="block text-[11px] font-semibold mb-1">Reference / Notes</label>
              <input
                type="text"
                value={moveNotes}
                onChange={e => setMoveNotes(e.target.value)}
                placeholder="Invoice number or usage reason"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalMode('none')} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={saving || !moveItemId} className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-bold flex items-center gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Post Movement</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
