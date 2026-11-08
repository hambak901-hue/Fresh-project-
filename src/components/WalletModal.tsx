/**
 * @file WalletModal.tsx
 * Modal for testing wallet funding, viewing ledger transactions, and Moniepoint bank details.
 */

import React, { useState, useEffect } from 'react';
import { X, Wallet, ArrowDownLeft, ArrowUpRight, Copy, Check, CreditCard, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const { user, updateBalance } = useAuth();
  const [amount, setAmount] = useState<string>('5000');
  const [gateway, setGateway] = useState<'flutterwave' | 'paystack' | 'manual'>('flutterwave');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      api.getWalletSummary()
        .then(data => setSummary(data))
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFund = async () => {
    const num = Number(amount);
    if (!num || num < 100) return;
    setLoading(true);
    try {
      const res = await api.fundWallet(num, gateway);
      if (res.success) {
        updateBalance(res.balance);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
        const updated = await api.getWalletSummary();
        setSummary(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Funding failed');
    } finally {
      setLoading(false);
    }
  };

  const copyBank = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Wallet Management &amp; Top-up</h3>
              <p className="text-[11px] text-slate-400">Available Balance: ₦{user?.wallet_balance.toLocaleString() || '0'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Quick Preset Buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Select Amount (NGN)</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {['1000', '2500', '5000', '10000'].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val)}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                    amount === val
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  ₦{Number(val).toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Or enter custom amount"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Payment Gateway Select */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Select Payment Channel</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setGateway('flutterwave')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  gateway === 'flutterwave'
                    ? 'bg-emerald-950/40 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-bold text-emerald-400">Flutterwave</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Card, USSD &amp; Instant Bank</div>
              </button>
              <button
                type="button"
                onClick={() => setGateway('manual')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  gateway === 'manual'
                    ? 'bg-emerald-950/40 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-bold text-blue-400">Bank Transfer</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Moniepoint Dedicated</div>
              </button>
            </div>
          </div>

          {/* Dedicated Virtual Bank Info */}
          {gateway === 'manual' && summary?.bankDetails && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span>Bank Name:</span>
                <span className="font-semibold text-white">{summary.bankDetails.bank}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Account Name:</span>
                <span className="font-semibold text-white">{summary.bankDetails.accountName}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Account Number:</span>
                <div className="flex items-center gap-1.5 font-mono text-emerald-400 font-bold">
                  <span>{summary.bankDetails.accountNumber}</span>
                  <button
                    onClick={() => copyBank(summary.bankDetails.accountNumber)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Top up action */}
          <button
            onClick={handleFund}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            <span>{loading ? 'Processing Top-up...' : `Credit ₦${Number(amount || 0).toLocaleString()} to Wallet`}</span>
          </button>

          {/* Recent Ledger Transactions */}
          {summary?.recentTransactions && summary.recentTransactions.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Recent Ledger Entries
              </h4>
              <div className="space-y-1.5 text-xs">
                {summary.recentTransactions.slice(0, 3).map((txn: any) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center ${
                          txn.type === 'credit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {txn.type === 'credit' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                      </div>
                      <div>
                        <div className="font-medium text-white truncate max-w-[200px]">{txn.description}</div>
                        <div className="text-[10px] text-slate-500">{new Date(txn.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div
                      className={`font-mono font-bold ${
                        txn.type === 'credit' ? 'text-emerald-400' : 'text-slate-300'
                      }`}
                    >
                      {txn.type === 'credit' ? '+' : '-'}₦{txn.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
