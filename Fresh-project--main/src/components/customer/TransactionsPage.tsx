import React, { useState, useEffect } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, Filter, RefreshCw, CheckCircle2, Clock, XCircle, Download, FileText, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Transaction } from '../../types';

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'successful' | 'pending' | 'failed'>('all');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomerSummary();
      // Also get complete statement
      const stmt = await api.getCustomerStatement();
      if (stmt?.statement?.transactions) {
        setTransactions(stmt.statement.transactions);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filtered = transactions.filter(t => {
    const matchesSearch =
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.reference.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalCredits = filtered
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = filtered
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Transaction Ledger
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Comprehensive double-entry audit history of all wallet fundings, service debits, and adjustments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchTransactions}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition"
              title="Refresh Transactions"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-slate-400">Total Entries</p>
            <p className="text-lg font-bold font-mono text-white mt-0.5 tabular-nums">
              {filtered.length}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-emerald-400">Total Inflow (Credits)</p>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5 tabular-nums">
              +₦{totalCredits.toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-red-400">Total Outflow (Debits)</p>
            <p className="text-lg font-bold font-mono text-red-400 mt-0.5 tabular-nums">
              -₦{totalDebits.toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-indigo-400">Net Flow</p>
            <p className="text-lg font-bold font-mono text-indigo-400 mt-0.5 tabular-nums">
              ₦{(totalCredits - totalDebits).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by description, reference (e.g. TXN_...), or category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Types</option>
            <option value="credit">Credits (+)</option>
            <option value="debit">Debits (-)</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="successful">Successful</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-2">
            <FileText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="font-semibold text-slate-300">No transactions match your query</p>
            <p className="text-xs text-slate-500">Try modifying your search or filter options</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3.5 px-4">Transaction / Description</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Reference</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-right">Balance</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filtered.map(txn => {
                  const isCredit = txn.type === 'credit';
                  return (
                    <tr
                      key={txn.id}
                      onClick={() => setSelectedTxn(txn)}
                      className="hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isCredit
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white line-clamp-1">{txn.description}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{txn.gateway}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium">
                          {String(txn.category || 'general').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {txn.reference}
                      </td>
                      <td className={`py-3.5 px-4 text-right font-mono font-bold tabular-nums text-xs ${
                        isCredit ? 'text-emerald-400' : 'text-slate-200'
                      }`}>
                        {isCredit ? '+' : '-'}₦{txn.amount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400 tabular-nums">
                        ₦{txn.balance_after?.toLocaleString() ?? '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            txn.status === 'successful'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : txn.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {txn.status === 'successful' && <CheckCircle2 className="w-3 h-3" />}
                          {txn.status === 'pending' && <Clock className="w-3 h-3" />}
                          {txn.status === 'failed' && <XCircle className="w-3 h-3" />}
                          <span>{txn.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(txn.created_at).toLocaleDateString('en-NG', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedTxn(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  selectedTxn.type === 'credit'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {selectedTxn.type === 'credit' ? (
                  <ArrowDownLeft className="w-5 h-5" />
                ) : (
                  <ArrowUpRight className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Transaction Receipt</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedTxn.reference}</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount</span>
                <span className={`font-mono font-bold text-sm ${
                  selectedTxn.type === 'credit' ? 'text-emerald-400' : 'text-white'
                }`}>
                  {selectedTxn.type === 'credit' ? '+' : '-'}₦{selectedTxn.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className="capitalize font-semibold text-white">{selectedTxn.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Category</span>
                <span className="capitalize text-white">{String(selectedTxn.category || 'general').replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment Gateway</span>
                <span className="capitalize font-mono text-slate-300">{selectedTxn.gateway}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Balance Before</span>
                <span className="font-mono text-slate-300">₦{selectedTxn.balance_before.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Balance After</span>
                <span className="font-mono text-slate-300">₦{selectedTxn.balance_after.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp</span>
                <span className="font-mono text-slate-300">{new Date(selectedTxn.created_at).toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <p className="text-slate-400 mb-1">Description</p>
                <p className="text-white font-medium">{selectedTxn.description}</p>
              </div>
            </div>

            <button
              onClick={() => setSelectedTxn(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
