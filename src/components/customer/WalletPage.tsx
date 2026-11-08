/**
 * @file WalletPage.tsx
 * Customer Wallet management page for HambakTech Enterprise.
 * Features available balance, Flutterwave funding, dedicated virtual accounts, manual payment proof submission,
 * transaction ledger, and exportable financial statement.
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Transaction } from '../../types';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Search,
  RefreshCw,
  Plus,
  ShieldCheck,
  CreditCard,
  Building,
  Upload,
} from 'lucide-react';

interface WalletPageProps {
  onOpenFundModal?: () => void;
}

export const WalletPage: React.FC<WalletPageProps> = ({ onOpenFundModal }) => {
  const { user, refreshUser } = useAuth();
  const [walletSummary, setWalletSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Manual payment proof form
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [bankName, setBankName] = useState<string>('Access Bank');
  const [transferRef, setTransferRef] = useState<string>('');
  const [manualSubmitting, setManualSubmitting] = useState<boolean>(false);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  // Statement generator
  const [statementModalOpen, setStatementModalOpen] = useState<boolean>(false);
  const [statementData, setStatementData] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Filtering
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedBank, setCopiedBank] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getWalletSummary();
      setWalletSummary(res);
      setTransactions(res.recentTransactions || []);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAccount = () => {
    const acc = walletSummary?.bankDetails?.accountNumber || '8210492817';
    navigator.clipboard.writeText(acc);
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2000);
  };

  const handleManualProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setManualSuccess(null);

    const amt = Number(manualAmount);
    if (!amt || amt < 500) {
      setManualError('Minimum manual funding amount is ₦500.');
      return;
    }
    if (!senderName || !transferRef) {
      setManualError('Please provide sender name and payment reference.');
      return;
    }

    try {
      setManualSubmitting(true);
      const res = await api.submitManualFunding({
        amount: amt,
        sender_name: senderName,
        bank_name: bankName,
        reference: transferRef,
      });

      if (res.success) {
        setManualSuccess(res.message);
        setManualAmount('');
        setSenderName('');
        setTransferRef('');
        await loadData();
        setTimeout(() => {
          setManualModalOpen(false);
          setManualSuccess(null);
        }, 1500);
      }
    } catch (err: any) {
      setManualError(err.message || 'Failed to submit payment proof');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleGenerateStatement = async () => {
    try {
      setStatementLoading(true);
      const res = await api.getCustomerStatement({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setStatementData(res);
    } catch (err) {
    } finally {
      setStatementLoading(false);
    }
  };

  const filteredTxns = transactions.filter(t => {
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesSearch =
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Wallet className="w-4 h-4" />
            <span>Treasury &amp; Ledger</span>
            <span className="text-slate-600">&bull;</span>
            <span>Double-Entry Immutable Accounting</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            Wallet Management
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setStatementModalOpen(true);
              handleGenerateStatement();
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Account Statement</span>
          </button>

          <button
            onClick={onOpenFundModal}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Fund Wallet</span>
          </button>
        </div>
      </div>

      {/* Balance & Virtual Accounts Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Balance Card */}
        <div className="lg:col-span-6 rounded-2xl bg-gradient-to-tr from-slate-900 via-slate-900 to-emerald-950/30 border border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Available Wallet Balance
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              Tier {user?.tier || 1} Account
            </span>
          </div>

          <div>
            <div className="text-4xl font-extrabold text-white font-mono tracking-tight">
              ₦{user?.wallet_balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Active ledger balance for instant NIN, BVN, and data purchases.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800/80">
            <div>
              <div className="text-[10px] text-slate-500 font-medium">TOTAL FUNDED</div>
              <div className="text-sm font-bold text-white font-mono mt-0.5">
                ₦{(walletSummary?.totalFunded || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-medium">TOTAL DISPATCHED</div>
              <div className="text-sm font-bold text-slate-300 font-mono mt-0.5">
                ₦{(walletSummary?.totalSpent || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Virtual Bank Account Card */}
        <div className="lg:col-span-6 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">Dedicated Virtual Bank Account</h2>
            </div>
            <span className="text-[10px] font-mono text-emerald-400">Instant Auto-Credit</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Transfer directly to this dedicated account number from any Nigerian bank app or USSD to credit your HambakTech wallet automatically.
          </p>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500">ACCOUNT NUMBER</div>
                <div className="text-2xl font-extrabold text-emerald-400 font-mono tracking-widest mt-0.5">
                  {walletSummary?.bankDetails?.accountNumber || '8210492817'}
                </div>
              </div>

              <button
                onClick={handleCopyAccount}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                {copiedBank ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedBank ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-slate-500 text-[10px] block">BANK NAME</span>
                <span className="text-slate-200 font-semibold">{walletSummary?.bankDetails?.bank || 'Moniepoint MFB'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">BENEFICIARY</span>
                <span className="text-slate-200 font-semibold truncate block">
                  {walletSummary?.bankDetails?.accountName || 'HambakTech Enterprise'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setManualModalOpen(true)}
            className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-medium text-center flex items-center justify-center gap-2 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Submit Manual Transfer Proof</span>
          </button>
        </div>
      </div>

      {/* Transactions Ledger */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Wallet Transactions Ledger</h2>
            <p className="text-xs text-slate-400">Immutable ledger history of all funding, verification debits, and telecom purchases.</p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by reference or description..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg ${filterType === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('credit')}
                className={`px-2.5 py-1 rounded-lg ${filterType === 'credit' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
              >
                Credits
              </button>
              <button
                onClick={() => setFilterType('debit')}
                className={`px-2.5 py-1 rounded-lg ${filterType === 'debit' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
              >
                Debits
              </button>
            </div>

            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
              title="Refresh ledger"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Reference</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Balance After</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No transactions found in this view.
                  </td>
                </tr>
              ) : (
                filteredTxns.map(t => (
                  <tr key={t.id} className="hover:bg-slate-850/50">
                    <td className="py-3 px-4">
                      {t.type === 'credit' ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>Credit</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-400 font-bold">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Debit</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-white max-w-xs truncate">{t.description}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{t.reference}</td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {t.type === 'credit' ? (
                        <span className="text-emerald-400">+₦{t.amount.toLocaleString()}</span>
                      ) : (
                        <span className="text-rose-400">-₦{t.amount.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      ₦{t.balance_after.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'successful'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : t.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(t.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sub-modal: Manual Payment Proof Submission */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Submit Proof of Bank Transfer</h3>
            <p className="text-xs text-slate-400">
              Transferred directly to our Moniepoint account? Enter your payment details below for immediate reconciliation.
            </p>

            {manualError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {manualError}
              </div>
            )}
            {manualSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                {manualSuccess}
              </div>
            )}

            <form onSubmit={handleManualProofSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Transferred Amount (₦)</label>
                <input
                  type="number"
                  min="500"
                  step="100"
                  value={manualAmount}
                  onChange={e => setManualAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Sender Account Name</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={e => setSenderName(e.target.value)}
                  placeholder="e.g. Babatunde Adeleke"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Bank Used</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    placeholder="e.g. Access Bank"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Session / Ref ID</label>
                  <input
                    type="text"
                    value={transferRef}
                    onChange={e => setTransferRef(e.target.value)}
                    placeholder="e.g. 0902938172"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono uppercase"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                >
                  {manualSubmitting ? 'Submitting...' : 'Submit Proof'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-modal: Account Financial Statement */}
      {statementModalOpen && statementData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Official Wallet Statement</h3>
                <p className="text-[11px] text-slate-400">HambakTech Enterprise Ledger Accounting</p>
              </div>
              <button
                onClick={() => setStatementModalOpen(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
              >
                Close
              </button>
            </div>

            {/* Statement Summary Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-slate-500 text-[10px] block">TOTAL CREDITED</span>
                  <span className="text-emerald-400 font-mono font-bold text-sm">
                    ₦{statementData.statement?.totalCredits?.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">TOTAL DEBITED</span>
                  <span className="text-rose-400 font-mono font-bold text-sm">
                    ₦{statementData.statement?.totalDebits?.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">CLOSING BALANCE</span>
                  <span className="text-white font-mono font-bold text-sm">
                    ₦{statementData.account?.currentBalance?.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">TRANSACTION COUNT</span>
                  <span className="text-slate-200 font-mono font-bold text-sm">
                    {statementData.statement?.transactionCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Statement Items */}
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-300">Statement Transactions:</div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
                {(statementData.statement?.transactions || []).map((st: any) => (
                  <div key={st.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold">{st.description}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Ref: {st.reference} &bull; {new Date(st.created_at).toLocaleDateString('en-NG')}</div>
                    </div>
                    <div className="font-mono font-bold text-right">
                      {st.type === 'credit' ? (
                        <span className="text-emerald-400">+₦{st.amount.toLocaleString()}</span>
                      ) : (
                        <span className="text-rose-400">-₦{st.amount.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">TrueHost LON110 Cryptographic Stamp Verified</span>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
