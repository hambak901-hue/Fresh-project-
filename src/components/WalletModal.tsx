/**
 * @file WalletModal.tsx
 * HAMBakTECH Stage 7: Complete Customer Wallet Top-Up & Payment Modal.
 * Supports:
 * 1. Paystack Automated Merchant Checkout & Instant Verification
 * 2. Flutterwave Activated Hosted Checkout & Verification
 * 3. Moniepoint MFB Manual Transfer Instructions (Bank: Moniepoint MFB, Acc: 5210471634, Name: Hambaktech_Services)
 * 4. Dedicated Manual Funding Form with File Receipt Upload & Verification Workflow
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  CreditCard,
  ShieldCheck,
  Clock,
  ExternalLink,
  RefreshCw,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Building,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const { user, updateBalance } = useAuth();
  const [activeTab, setActiveTab] = useState<'online' | 'manual_form'>('online');
  const [amount, setAmount] = useState<string>('5000');
  const [gateway, setGateway] = useState<'paystack' | 'flutterwave' | 'manual'>('flutterwave');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [summary, setSummary] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Manual Transfer Form State
  const [depositorName, setDepositorName] = useState<string>(user?.full_name || '');
  const [manualAmount, setManualAmount] = useState<string>('5000');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Mobile App Transfer');
  const [transactionRemarks, setTransactionRemarks] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [submittingManual, setSubmittingManual] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadSummary();
      if (user?.full_name && !depositorName) {
        setDepositorName(user.full_name);
      }
    }
  }, [isOpen]);

  const loadSummary = async () => {
    try {
      const data = await api.getWalletSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load wallet summary:', err);
    }
  };

  if (!isOpen) return null;

  // Handle Online Payment (Paystack or Flutterwave)
  const handleOnlineCheckout = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const num = Number(amount);
    if (!num || num < 100) {
      setErrorMessage('Minimum wallet funding amount is ₦100.00.');
      return;
    }

    if (gateway === 'manual') {
      setActiveTab('manual_form');
      setManualAmount(amount);
      return;
    }

    setLoading(true);
    try {
      const initRes = await api.initializePayment(gateway, num);
      if (initRes.success && initRes.authorization_url) {
        setSuccessMessage(`Redirecting to secure ${gateway === 'flutterwave' ? 'Flutterwave' : 'Paystack'} checkout...`);
        
        // Open secure hosted payment checkout in a new window or redirect
        const win = window.open(initRes.authorization_url, '_blank');
        if (!win) {
          window.location.href = initRes.authorization_url;
        }

        // Poll or verify reference in background
        const verifyRes = await api.verifyFunding(initRes.reference, gateway);
        if (verifyRes.success) {
          updateBalance(verifyRes.balance);
          setSuccessMessage(`Payment of ₦${num.toLocaleString()} verified and credited to your wallet!`);
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 },
          });
          await loadSummary();
        }
      } else {
        throw new Error(initRes.message || 'Payment initiation failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to initialize ${gateway} checkout.`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Receipt File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Invalid file format. Please upload a JPG, PNG image or PDF document.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Receipt file size must not exceed 5MB.');
      return;
    }

    setReceiptFile(file);
    setReceiptFileName(file.name);
    setErrorMessage(null);
  };

  // Handle Manual Funding Proof Form Submission
  const handleManualFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const amt = Number(manualAmount);
    if (!amt || amt < 500) {
      setErrorMessage('Minimum manual funding amount is ₦500.00.');
      return;
    }

    if (!depositorName.trim()) {
      setErrorMessage('Customer / Depositor legal name is required.');
      return;
    }

    if (!paymentReference.trim()) {
      setErrorMessage('Please provide your bank transfer session ID or reference.');
      return;
    }

    if (!receiptFile) {
      setErrorMessage('Please attach an official bank transfer receipt (screenshot or PDF).');
      return;
    }

    setSubmittingManual(true);
    try {
      const formData = new FormData();
      formData.append('amount', String(amt));
      formData.append('depositor_name', depositorName.trim());
      formData.append('sender_name', depositorName.trim());
      formData.append('bank_name', 'Moniepoint MFB');
      formData.append('account_number', '5210471634');
      formData.append('reference', paymentReference.trim());
      formData.append('payment_reference', paymentReference.trim());
      formData.append('payment_date', paymentDate);
      formData.append('payment_method', paymentMethod);
      formData.append('remarks', transactionRemarks.trim() || 'Manual transfer deposit');
      formData.append('receipt', receiptFile);

      const res = await api.submitManualFunding(formData as any);
      if (res.success) {
        setSuccessMessage('Transfer proof submitted successfully! Your request has been queued for verification and wallet crediting.');
        confetti({ particleCount: 30, spread: 50 });
        setPaymentReference('');
        setReceiptFile(null);
        setReceiptFileName('');
        await loadSummary();
        setTimeout(() => {
          setActiveTab('online');
        }, 3000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit manual transfer proof.');
    } finally {
      setSubmittingManual(false);
    }
  };

  const copyBank = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bankDetails = {
    bank: summary?.bankDetails?.bank || 'Moniepoint MFB',
    accountNumber: summary?.bankDetails?.accountNumber || '5210471634',
    accountName: summary?.bankDetails?.accountName || 'Hambaktech_Services',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Fund Wallet</h3>
              <p className="text-xs text-slate-400">
                Available: <span className="text-emerald-400 font-mono font-bold">₦{user?.wallet_balance.toLocaleString('en-NG', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setActiveTab('online'); setErrorMessage(null); }}
              className={`py-2 rounded-xl transition ${
                activeTab === 'online'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Instant Online Deposit
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('manual_form'); setErrorMessage(null); }}
              className={`py-2 rounded-xl transition ${
                activeTab === 'manual_form'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bank Transfer Proof
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {activeTab === 'online' ? (
            <div className="space-y-4">
              {/* Preset Amounts */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Preset Amount (NGN)</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {['1000', '2500', '5000', '10000'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmount(val)}
                      className={`py-2.5 text-xs font-bold rounded-xl border transition-all ${
                        amount === val
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-sm'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      ₦{Number(val).toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Or enter custom amount in ₦"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Payment Gateway Options */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Payment Gateway</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Flutterwave (Active) */}
                  <button
                    type="button"
                    onClick={() => setGateway('flutterwave')}
                    className={`p-3.5 rounded-2xl border text-left transition relative ${
                      gateway === 'flutterwave'
                        ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/40'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-amber-400">Flutterwave</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">Cards, USSD, Bank Account &amp; Barter</p>
                  </button>

                  {/* Paystack (Active) */}
                  <button
                    type="button"
                    onClick={() => setGateway('paystack')}
                    className={`p-3.5 rounded-2xl border text-left transition relative ${
                      gateway === 'paystack'
                        ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/40'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-emerald-400">Paystack</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">Instant Card, NIP Transfer &amp; USSD</p>
                  </button>

                  {/* Manual Bank Transfer */}
                  <button
                    type="button"
                    onClick={() => setGateway('manual')}
                    className={`p-3.5 rounded-2xl border text-left transition relative ${
                      gateway === 'manual'
                        ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/40'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sky-400">Bank Transfer</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                        OFFICIAL
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">Moniepoint Dedicated Account</p>
                  </button>
                </div>
              </div>

              {/* Dedicated Official Receiving Bank Instructions */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Building className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Official Receiving Bank Instructions</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Zero Platform Surcharge</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Bank Name</span>
                    <strong className="text-white font-semibold">{bankDetails.bank}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Account Name</span>
                    <strong className="text-white font-semibold">{bankDetails.accountName}</strong>
                  </div>
                  <div className="col-span-2 flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 mt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Account Number</span>
                      <span className="text-base font-bold font-mono text-emerald-400">{bankDetails.accountNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyBank(bankDetails.accountNumber)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleOnlineCheckout}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting to {gateway === 'flutterwave' ? 'Flutterwave' : 'Paystack'} Gateway...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Proceed to Deposit ₦{Number(amount || 0).toLocaleString()}</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Manual Bank Transfer Form */
            <form onSubmit={handleManualFormSubmit} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] text-slate-400">
                  After initiating a bank transfer to <strong>{bankDetails.accountNumber} ({bankDetails.bank})</strong>, fill this form and attach your transfer receipt.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Customer / Depositor Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={depositorName}
                    onChange={e => setDepositorName(e.target.value)}
                    placeholder="Full sender account name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Amount Transferred (₦) *
                  </label>
                  <input
                    type="number"
                    required
                    min="500"
                    step="50"
                    value={manualAmount}
                    onChange={e => setManualAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Payment Reference / Session ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    placeholder="e.g. 090267182910291"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none"
                  >
                    <option value="Mobile App Transfer">Mobile App Transfer</option>
                    <option value="USSD Transfer">USSD Transfer</option>
                    <option value="Internet Banking">Internet Banking</option>
                    <option value="POS / Agent Deposit">POS / Agent Deposit</option>
                    <option value="Bank Branch Deposit">Bank Branch Deposit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Transaction Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={transactionRemarks}
                    onChange={e => setTransactionRemarks(e.target.value)}
                    placeholder="e.g. Wallet topup for NIN slip"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none"
                  />
                </div>

                {/* Upload Receipt File */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Attach Bank Transfer Receipt (JPG, PNG, PDF &le; 5MB) *
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white cursor-pointer transition">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span>{receiptFileName ? 'Change Receipt File' : 'Choose Receipt File'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    {receiptFileName && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono truncate max-w-xs">
                        <Check className="w-3.5 h-3.5 shrink-0" /> {receiptFileName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('online')}
                  className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center gap-2 shadow"
                >
                  {submittingManual ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting Proof...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Submit Payment Proof</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Recent Ledger Entries */}
          {summary?.recentTransactions && summary.recentTransactions.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-2">
                Recent Ledger History
              </span>
              <div className="space-y-1.5">
                {summary.recentTransactions.slice(0, 3).map((txn: any) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                          txn.type === 'credit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {txn.type === 'credit' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200 truncate max-w-[200px]">{txn.description}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{txn.reference}</div>
                      </div>
                    </div>
                    <div
                      className={`font-mono font-bold ${
                        txn.type === 'credit' ? 'text-emerald-400' : 'text-slate-300'
                      }`}
                    >
                      {txn.type === 'credit' ? '+' : '-'}₦{Number(txn.amount).toLocaleString()}
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
