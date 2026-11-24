/**
 * @file WalletModal.tsx
 * Customer Wallet Top-Up & Payment Modal.
 * Uses Paystack Automated Merchant Checkout & Instant Verification exclusively.
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
  AlertCircle,
  CheckCircle2,
  Lock,
  Building,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { VirtualAccountStateResponse } from '../types';
import confetti from 'canvas-confetti';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const { user, updateBalance, refreshUser } = useAuth();
  const [amount, setAmount] = useState<string>('5000');
  const [loading, setLoading] = useState<boolean>(false);
  const [verifyingOnline, setVerifyingOnline] = useState<boolean>(false);
  const [copiedDynAcc, setCopiedDynAcc] = useState<boolean>(false);
  const [summary, setSummary] = useState<any>(null);
  const [vaState, setVaState] = useState<VirtualAccountStateResponse | null>(null);
  const [vaProvisioning, setVaProvisioning] = useState<boolean>(false);
  const [copiedDva, setCopiedDva] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<{
    reference: string;
    gateway: string;
    amount: number;
    checkoutUrl?: string;
    transferDetails?: {
      account_number: string;
      bank_name: string;
      account_name: string;
      amount: number;
      currency: string;
      expires_at?: string;
      note?: string;
      reference: string;
    } | null;
  } | null>(null);

  const needsEmailVerification = Boolean(user?.email_verification_required && !user?.email_verified);

  useEffect(() => {
    if (isOpen && !needsEmailVerification) {
      loadSummary();
    } else if (!isOpen) {
      setPendingCheckout(null);
      setVerifyingOnline(false);
    }
  }, [isOpen, needsEmailVerification]);

  const loadSummary = async () => {
    try {
      const [data, va] = await Promise.all([
        api.getWalletSummary(),
        api.getVirtualAccount(false).catch(() => null),
      ]);
      setSummary(data);
      if (va) setVaState(va);
    } catch (err) {
      console.error('Failed to load wallet summary:', err);
    }
  };

  const handleProvisionDva = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setVaProvisioning(true);
    try {
      const res = await api.provisionVirtualAccount();
      setVaState(res);
      setSuccessMessage(res.message || 'Dedicated account request submitted to Paystack.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to generate dedicated account at this time.');
    } finally {
      setVaProvisioning(false);
    }
  };

  const handleVerifyPendingCheckout = async (silent = false) => {
    if (!pendingCheckout) return;
    if (!silent) {
      setVerifyingOnline(true);
      setErrorMessage(null);
    }
    try {
      const verifyRes = await api.verifyFunding(pendingCheckout.reference, pendingCheckout.gateway);
      if (verifyRes.success && !verifyRes.pending) {
        const creditedAmt = verifyRes.amount || pendingCheckout.amount;
        if (typeof verifyRes.balance === 'number') {
          updateBalance(verifyRes.balance);
        }
        await refreshUser();
        setPendingCheckout(null);
        setSuccessMessage(`Payment of ₦${Number(creditedAmt).toLocaleString()} verified and credited to your wallet!`);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
        await loadSummary();
      } else if (!silent) {
        setSuccessMessage(verifyRes.message || 'Payment is still awaiting confirmation from the gateway. If you just paid, please check again in a few seconds.');
      }
    } catch (err: any) {
      if (!silent) {
        setErrorMessage(err.message || 'Payment confirmation pending or incomplete.');
      }
    } finally {
      if (!silent) {
        setVerifyingOnline(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !pendingCheckout) return;
    const pollInterval = window.setInterval(() => {
      void handleVerifyPendingCheckout(true);
    }, 5500);
    return () => window.clearInterval(pollInterval);
  }, [isOpen, pendingCheckout]);

  if (!isOpen) return null;

  // Handle Online Payment (Paystack Hosted Checkout)
  const handleOnlineCheckout = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const num = Number(amount);
    if (!num || num < 100) {
      setErrorMessage('Minimum wallet funding amount is ₦100.00.');
      return;
    }

    setLoading(true);
    try {
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/?payment=verify#portal`
          : 'https://hambaktech.com.ng/?payment=verify#portal';
      const initRes = await api.initializePayment('paystack', num, callbackUrl);
      const checkoutUrl = initRes.authorization_url || initRes.link || '';
      const transferDetails = initRes.transfer_details || null;

      if (!initRes.success || (!checkoutUrl && !transferDetails)) {
        throw new Error(initRes.message || 'Payment initiation failed.');
      }

      if (transferDetails) {
        setPendingCheckout({
          reference: initRes.reference,
          gateway: 'paystack',
          amount: num,
          transferDetails,
        });
        setSuccessMessage(`Temporary transfer account generated (Ref: ${initRes.reference}). Transfer exact amount below and click Verify Transfer.`);
        return;
      }

      const isStandaloneOrApk =
        typeof window !== 'undefined' &&
        (Boolean((window as any).HambakAndroidBridge) ||
          /HambakTechAndroidApp/i.test(navigator.userAgent || '') ||
          window.matchMedia?.('(display-mode: standalone)').matches ||
          Boolean((window.navigator as any).standalone));

      if (isStandaloneOrApk) {
        setSuccessMessage('Redirecting to secure Paystack checkout...');
        window.location.href = checkoutUrl;
        return;
      }

      setPendingCheckout({
        reference: initRes.reference,
        gateway: 'paystack',
        amount: num,
        checkoutUrl,
      });

      const win = window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        setSuccessMessage('Redirecting to secure Paystack checkout...');
        window.location.href = checkoutUrl;
        return;
      }

      setSuccessMessage(`Checkout opened in a new window (Ref: ${initRes.reference}). Complete payment there, then return here or click Verify Payment.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize Paystack checkout.');
    } finally {
      setLoading(false);
    }
  };

  const gatewayMap = new Map<string, { id: string; name: string; status: string; is_active: boolean }>(
    ((summary?.availableGateways as any[]) || []).map(g => [g.id, g])
  );
  const paystackActive = gatewayMap.has('paystack') ? gatewayMap.get('paystack')?.status === 'active' : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Fund Wallet</h3>
              <p className="text-xs text-slate-400">
                Available: <span className="text-emerald-400 font-mono font-bold">₦{Number(user?.wallet_balance ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
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

        {/* Paystack-Only Checkout Header Badge */}
        <div className="px-5 pt-3 shrink-0">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-950 rounded-2xl border border-emerald-500/30 text-xs">
            <div className="flex items-center gap-2 font-bold text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Paystack Instant Checkout</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Card, Bank Transfer &amp; USSD</span>
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

          {needsEmailVerification ? (
            <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-white">Verify Your Email to Fund Wallet</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                To protect your wallet and transactions, please verify{' '}
                <strong className="font-mono text-amber-300 break-all">{user?.email}</strong> before initializing a Paystack deposit.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('hambak:email-verification-required'));
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
              >
                Enter Verification Code
              </button>
            </div>
          ) : pendingCheckout ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span>
                        {pendingCheckout.transferDetails
                          ? 'Transfer to Temporary Account'
                          : 'Awaiting Paystack Confirmation'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{pendingCheckout.reference}</span>
                  </div>

                  {pendingCheckout.transferDetails ? (
                    <div className="space-y-2.5 text-xs">
                      <p className="text-slate-300 leading-relaxed">
                        {pendingCheckout.transferDetails.note || 'Transfer the exact amount below to credit your wallet automatically.'}
                      </p>
                      <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Bank Name</span>
                          <strong className="text-white">{pendingCheckout.transferDetails.bank_name}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Exact Amount</span>
                          <strong className="text-emerald-400 font-mono">
                            ₦{Number(pendingCheckout.transferDetails.amount || pendingCheckout.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] text-slate-500 uppercase block">Beneficiary Name</span>
                          <strong className="text-white">{pendingCheckout.transferDetails.account_name}</strong>
                        </div>
                        <div className="col-span-2 flex items-center justify-between pt-2 border-t border-slate-800">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block">Temporary Account Number</span>
                            <span className="text-base font-extrabold font-mono text-emerald-400 tracking-wider">
                              {pendingCheckout.transferDetails.account_number}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText?.(pendingCheckout.transferDetails!.account_number).catch(() => {});
                              setCopiedDynAcc(true);
                              setTimeout(() => setCopiedDynAcc(false), 2000);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
                          >
                            {copiedDynAcc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedDynAcc ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      <p className="text-slate-300 leading-relaxed">
                        Complete your payment of{' '}
                        <strong className="text-white font-mono">₦{pendingCheckout.amount.toLocaleString()}</strong> on the Paystack checkout page, then click verify below.
                      </p>
                      {pendingCheckout.checkoutUrl && (
                        <a
                          href={pendingCheckout.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Re-open Checkout Window</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => void handleVerifyPendingCheckout(false)}
                    disabled={verifyingOnline}
                    className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <RefreshCw className={`w-4 h-4 ${verifyingOnline ? 'animate-spin' : ''}`} />
                    <span>{verifyingOnline ? 'Checking Gateway...' : 'I Have Completed Payment — Verify'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingCheckout(null);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                  >
                    Start New Deposit
                  </button>
                </div>
              </div>
            ) : (
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

              {/* Payment Gateway (Paystack Only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Payment Gateway</label>
                <div className="p-3.5 rounded-2xl border bg-emerald-950/30 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      <span>Paystack Online Checkout</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        paystackActive
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {paystackActive ? 'ACTIVE' : 'OFFLINE'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Fund instantly using Debit Card, Bank Transfer via Paystack, USSD, or QR. Your wallet is credited automatically upon confirmation.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleOnlineCheckout}
                disabled={loading || !paystackActive}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting to Paystack Gateway...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Proceed to Paystack — ₦{Number(amount || 0).toLocaleString()}</span>
                  </>
                )}
              </button>

              {/* Dedicated Personal Bank Account (Paystack DVA) */}
              {vaState?.dva_enabled && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Dedicated Bank Account (Paystack)</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {vaState.has_virtual_account
                        ? 'ACTIVE'
                        : vaState.assignment_status === 'pending'
                        ? 'PENDING'
                        : vaState.eligible
                        ? 'AVAILABLE'
                        : 'TIER 2 KYC'}
                    </span>
                  </div>

                  {vaState.has_virtual_account && vaState.virtual_account ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div>
                        <div className="text-[11px] text-slate-400">
                          {vaState.virtual_account.bank_name} &bull; {vaState.virtual_account.account_name}
                        </div>
                        <div className="text-sm font-black font-mono text-emerald-400 tracking-wider">
                          {vaState.virtual_account.account_number}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText?.(vaState.virtual_account!.account_number).catch(() => {});
                          setCopiedDva(true);
                          setTimeout(() => setCopiedDva(false), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        {copiedDva ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDva ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ) : vaState.assignment_status === 'pending' ? (
                    <p className="text-[11px] text-amber-300">
                      Awaiting Paystack confirmation for your dedicated account assignment.
                    </p>
                  ) : vaState.eligible ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        Get a personal Paystack account number for direct transfers.
                      </span>
                      <button
                        type="button"
                        onClick={handleProvisionDva}
                        disabled={vaProvisioning}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-[11px] font-bold shrink-0"
                      >
                        {vaProvisioning ? 'Requesting...' : 'Generate'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      {vaState.message || 'Complete Level 2 KYC to unlock a dedicated Paystack bank account.'}
                    </p>
                  )}
                </div>
              )}
            </div>
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
