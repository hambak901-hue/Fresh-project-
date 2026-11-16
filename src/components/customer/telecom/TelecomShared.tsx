/**
 * @file TelecomShared.tsx
 * Shared UI architecture for all Telecom & VTU service pages:
 * 1. Authoritative Account & Wallet Strip (Wallet Balance, Live Remaining Balance, Tier, Points, Total Refunded)
 * 2. Step Progress Indicator (Details -> Review -> Status & Delivery -> Official Receipt)
 * 3. Step 2: Dedicated Review Transaction Page
 * 4. Step 3: Live Processing / Confirmed Outcome Page (Successful, Pending with Requery, Failed with Refund Notice)
 * 5. Step 4: Dedicated Official Branded Receipt Page (Download PDF / Print / Share — strictly gated to successful)
 * 6. Customer Portal Website Footer
 */

import React, { useState } from 'react';
import { useCms } from '../../../context/CmsContext';
import {
  CustomerAccountSnapshot,
  formatNaira,
  ReviewDraft,
  TransactionExecutionResult,
  WorkflowStep,
} from './types';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Download,
  Printer,
  Share2,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Gift,
  RotateCcw,
  Award,
  Phone,
  Mail,
  MapPin,
  Building2,
} from 'lucide-react';

interface AccountStripProps {
  account: CustomerAccountSnapshot;
  pendingPayable?: number;
}

export const TelecomAccountStrip: React.FC<AccountStripProps> = ({ account, pendingPayable = 0 }) => {
  const wallet = Number(account.walletBalance || 0);
  const payable = Math.max(0, Number(pendingPayable || 0));
  const remaining = Math.max(0, Math.round((wallet - payable) * 100) / 100);
  const insufficient = payable > 0 && wallet < payable;

  return (
    <div className="no-print grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Wallet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Wallet Balance</span>
        </div>
        <div className="text-base sm:text-lg font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
          {formatNaira(wallet)}
        </div>
      </div>

      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Remaining After Tx</span>
        </div>
        <div
          className={`text-base sm:text-lg font-extrabold font-mono mt-1 tabular-nums ${
            insufficient
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {insufficient ? `Short ${formatNaira(payable - wallet)}` : formatNaira(remaining)}
        </div>
      </div>

      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Customer Tier</span>
        </div>
        <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
          Tier {account.tier}
        </div>
      </div>

      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Total Refunded</span>
        </div>
        <div className="text-base sm:text-lg font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
          {account.totalRefunded !== null ? formatNaira(account.totalRefunded) : '—'}
        </div>
      </div>

      <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Gift className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
          <span>Reward Points</span>
        </div>
        <div className="text-base sm:text-lg font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
          {account.pointsBalance !== null ? `${account.pointsBalance.toLocaleString()} pts` : '—'}
        </div>
      </div>
    </div>
  );
};

export const TelecomStepProgress: React.FC<{
  step: WorkflowStep;
  allowReceiptStep?: boolean;
}> = ({ step, allowReceiptStep = false }) => {
  const steps: Array<{ key: WorkflowStep; num: string; label: string }> = [
    { key: 'form', num: '1', label: 'Service Details' },
    { key: 'review', num: '2', label: 'Review Order' },
    { key: 'result', num: '3', label: 'Execution & Status' },
    { key: 'receipt', num: '4', label: 'Official Receipt' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="no-print grid grid-cols-2 sm:grid-cols-4 gap-2">
      {steps.map((s, idx) => {
        const isCurrent = s.key === step;
        const isDone = idx < currentIdx;
        const isLockedReceipt = s.key === 'receipt' && !allowReceiptStep && step !== 'receipt';

        return (
          <div
            key={s.key}
            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition ${
              isCurrent
                ? 'bg-blue-700 dark:bg-emerald-600 border-blue-700 dark:border-emerald-600 text-white shadow-sm'
                : isDone
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                : isLockedReceipt
                ? 'bg-slate-100/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                isCurrent
                  ? 'bg-white/20 text-white'
                  : isDone
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {isDone ? '✓' : s.num}
            </span>
            <span className="truncate">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
};

interface ReviewPageProps {
  draft: ReviewDraft;
  walletBalance: number;
  loading?: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export const TelecomReviewPage: React.FC<ReviewPageProps> = ({
  draft,
  walletBalance,
  loading = false,
  onBack,
  onConfirm,
}) => {
  const remaining = Math.round((walletBalance - draft.netPayable) * 100) / 100;
  const insufficient = remaining < 0;

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-emerald-400">
            Step 2 &bull; Review Transaction
          </p>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            {draft.serviceTitle}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{draft.summarySubtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Net Charge</div>
          <div className="text-2xl font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
            {formatNaira(draft.netPayable)}
          </div>
        </div>
      </div>

      {/* Itemized Summary Table */}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
        {draft.items.map((row) => (
          <div key={row.label} className="px-4 py-3 flex items-center justify-between gap-4 text-xs sm:text-sm">
            <span className="text-slate-600 dark:text-slate-400">{row.label}</span>
            <span
              className={`font-semibold text-right tabular-nums ${
                row.tone === 'emerald'
                  ? 'text-emerald-700 dark:text-emerald-400 font-mono'
                  : row.tone === 'blue'
                  ? 'text-blue-700 dark:text-blue-400 font-mono'
                  : row.tone === 'amber'
                  ? 'text-amber-700 dark:text-amber-400 font-mono'
                  : row.emphasize
                  ? 'text-slate-900 dark:text-white font-bold font-mono'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Wallet Impact Summary */}
      <div className="rounded-xl p-4 border border-slate-200 dark:border-slate-800 bg-blue-50/60 dark:bg-slate-950 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-slate-500 dark:text-slate-400 block">Current Wallet Balance</span>
          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatNaira(walletBalance)}
          </span>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400 block">Transaction Deduction</span>
          <span className="text-sm font-bold font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
            {draft.netPayable > 0 ? `-${formatNaira(draft.netPayable)}` : '₦0'}
          </span>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400 block">Balance After Purchase</span>
          <span
            className={`text-sm font-bold font-mono tabular-nums ${
              insufficient ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {insufficient ? `Insufficient (${formatNaira(remaining)})` : formatNaira(remaining)}
          </span>
        </div>
      </div>

      {insufficient && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Your wallet balance is lower than the required payable amount. Please fund your wallet first.</span>
        </div>
      )}

      <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2.5">
        <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-emerald-400 shrink-0" />
        <span>Next, confirm this order with your account Transaction PIN to debit your wallet and complete delivery.</span>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="min-h-[46px] px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back &amp; Edit Details</span>
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || insufficient}
          className="min-h-[46px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{draft.confirmLabel || 'Authorize with PIN & Complete'}</span>
        </button>
      </div>
    </div>
  );
};

interface ResultPageProps {
  result: TransactionExecutionResult;
  requerying?: boolean;
  onRequery?: (reference: string) => void;
  onOpenReceipt: () => void;
  onNewOrder: () => void;
  onEditRetry: () => void;
  onOpenHistory: () => void;
}

export const TelecomResultPage: React.FC<ResultPageProps> = ({
  result,
  requerying = false,
  onRequery,
  onOpenReceipt,
  onNewOrder,
  onEditRetry,
  onOpenHistory,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  if (result.outcome === 'processing') {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
          <RefreshCw className="w-7 h-7 text-blue-700 dark:text-emerald-400 animate-spin" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
          Processing {result.serviceTitle}...
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Please wait while your wallet debit is verified and your request is delivered. Do not close or refresh this window.
        </p>
      </div>
    );
  }

  const isSuccess = result.outcome === 'successful';
  const isPending = result.outcome === 'pending';

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
            isSuccess
              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
              : isPending
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
              : 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="w-8 h-8" />
          ) : isPending ? (
            <Clock className="w-8 h-8" />
          ) : (
            <AlertCircle className="w-8 h-8" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-bold uppercase tracking-wider ${
              isSuccess
                ? 'text-emerald-700 dark:text-emerald-400'
                : isPending
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {isSuccess
              ? 'Transaction Successful'
              : isPending
              ? 'Transaction Pending Confirmation'
              : 'Transaction Failed'}
          </p>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
            {result.serviceTitle}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">{result.message}</p>
        </div>
      </div>

      {/* Reference & Amount Summary */}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
        {result.reference && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Reference</span>
            <div className="flex items-center gap-2 font-mono font-bold text-slate-900 dark:text-white">
              <span className="break-all">{result.reference}</span>
              <button
                type="button"
                onClick={() => handleCopy(result.reference, 'ref')}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-700"
                title="Copy Reference"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {copiedKey === 'ref' && <span className="text-[11px] text-emerald-600 font-sans">Copied</span>}
            </div>
          </div>
        )}
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">{result.recipientLabel}</span>
          <span className="font-semibold font-mono text-slate-900 dark:text-white">{result.recipientValue}</span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Service / Package</span>
          <span className="font-semibold text-slate-900 dark:text-white text-right">{result.planOrDescription}</span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Amount Charged</span>
          <span className="font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatNaira(result.netPayable)}
          </span>
        </div>
        {typeof result.balanceAfter === 'number' && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Wallet Balance After</span>
            <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatNaira(result.balanceAfter)}
            </span>
          </div>
        )}
      </div>

      {/* Electricity STS Token Delivery Card */}
      {isSuccess && result.electricityToken && (
        <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
            Prepaid Electricity Token
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xl sm:text-2xl font-black font-mono tracking-wider text-slate-900 dark:text-white tabular-nums">
              {result.electricityToken}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(result.electricityToken!, 'token')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedKey === 'token' ? 'Token Copied' : 'Copy Token'}</span>
            </button>
          </div>
          {result.electricityUnits && (
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Units Issued: <strong>{result.electricityUnits}</strong>
            </p>
          )}
        </div>
      )}

      {/* Delivered Recharge / Data PINs */}
      {isSuccess && result.vouchers && result.vouchers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Delivered Voucher PINs ({result.vouchers.length})
            </h3>
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  result.vouchers!
                    .map((v, idx) => `#${idx + 1} PIN: ${v.pin} | S/N: ${v.serial}`)
                    .join('\n'),
                  'allpins'
                )
              }
              className="text-xs font-semibold text-blue-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedKey === 'allpins' ? 'All Copied' : 'Copy All PINs'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.vouchers.map((v, idx) => (
              <div
                key={`${v.serial}-${idx}`}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300">
                  <span>{v.network || result.networkOrProvider} {v.denomination_label || ''}</span>
                  <span>Card #{idx + 1}</span>
                </div>
                <div className="font-mono text-base font-black text-slate-900 dark:text-white tracking-wide">
                  {v.pin}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  S/N: {v.serial}
                </div>
                {v.load_code && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Load: <strong className="font-mono">{v.load_code}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivered Exam PINs */}
      {isSuccess && result.examPins && result.examPins.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Delivered Exam Scratch Card PINs ({result.examPins.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.examPins.map((ep, idx) => (
              <div
                key={`${ep.serial}-${idx}`}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
              >
                <div className="font-bold text-slate-700 dark:text-slate-300">
                  {ep.exam} Card #{idx + 1}
                </div>
                <div className="font-mono text-base font-black text-slate-900 dark:text-white">
                  PIN: {ep.pin}
                </div>
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Serial: {ep.serial}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Airtime-to-Cash Transfer Instructions (Pending Manual Transfer) */}
      {result.swapDetails && (
        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs sm:text-sm">
          <div className="font-bold text-amber-900 dark:text-amber-300">
            Next Step: Complete Airtime Transfer
          </div>
          {result.swapDetails.transfer_number && (
            <p className="text-slate-800 dark:text-slate-200">
              Transfer airtime to merchant line:{' '}
              <strong className="font-mono text-base">{result.swapDetails.transfer_number}</strong>
            </p>
          )}
          {result.swapDetails.instructions && (
            <p className="text-slate-700 dark:text-slate-300">{result.swapDetails.instructions}</p>
          )}
        </div>
      )}

      {/* Pending Warning Notice */}
      {isPending && !result.swapDetails && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-bold">Official receipt is locked until confirmation succeeds</p>
          <p>
            This order is currently awaiting confirmation. Use &ldquo;Check Status Now&rdquo; below or track it inside Orders &amp; Receipts.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5">
          {isSuccess && (
            <button
              type="button"
              onClick={onOpenReceipt}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition"
            >
              <Printer className="w-4 h-4" />
              <span>View Official Receipt</span>
            </button>
          )}

          {isPending && onRequery && result.reference && (
            <button
              type="button"
              disabled={requerying}
              onClick={() => onRequery(result.reference)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${requerying ? 'animate-spin' : ''}`} />
              <span>{requerying ? 'Checking Status...' : 'Check Status Now'}</span>
            </button>
          )}

          {!isSuccess && !isPending && (
            <button
              type="button"
              onClick={onEditRetry}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Edit Details &amp; Retry</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onNewOrder}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold transition"
          >
            New Transaction
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold transition"
          >
            Orders &amp; Receipts
          </button>
        </div>
      </div>
    </div>
  );
};

interface ReceiptPageProps {
  result: TransactionExecutionResult;
  customerName: string;
  customerEmail: string;
  onBack: () => void;
  onNewOrder: () => void;
}

export const TelecomReceiptPage: React.FC<ReceiptPageProps> = ({
  result,
  customerName,
  customerEmail,
  onBack,
  onNewOrder,
}) => {
  const { branding } = useCms();
  const [shareNote, setShareNote] = useState<string | null>(null);

  if (result.outcome !== 'successful') {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Official Receipt Unavailable
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Receipts are issued exclusively for confirmed successful transactions.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 text-white text-xs font-bold"
        >
          Back to Transaction Status
        </button>
      </div>
    );
  }

  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const supportEmail = branding?.support_email || 'support@hambaktech.com.ng';
  const supportPhone = branding?.support_phone || '09127469686';

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const summaryText = [
      `${companyName} — Official Transaction Receipt`,
      `Service: ${result.serviceTitle}`,
      `Package: ${result.planOrDescription}`,
      `${result.recipientLabel}: ${result.recipientValue}`,
      `Amount Paid: ${formatNaira(result.netPayable)}`,
      `Reference: ${result.reference}`,
      `Status: Successful`,
      result.electricityToken ? `Electricity Token: ${result.electricityToken}` : '',
      `Website: https://hambaktech.com.ng`,
    ]
      .filter(Boolean)
      .join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${companyName} Receipt — ${result.reference}`,
          text: summaryText,
        });
        setShareNote('Receipt shared successfully.');
        return;
      } catch {}
    }

    navigator.clipboard.writeText(summaryText);
    setShareNote('Receipt summary copied to clipboard for sharing.');
    window.setTimeout(() => setShareNote(null), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF / Print</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Receipt</span>
          </button>
          <button
            type="button"
            onClick={onNewOrder}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold"
          >
            New Transaction
          </button>
        </div>
      </div>

      {shareNote && (
        <div className="no-print p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300">
          {shareNote}
        </div>
      )}

      {/* Printable Official Receipt Document */}
      <div className="print-only-area bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        {/* Letterhead */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <img
              src={branding?.logo_url || '/logo.png'}
              alt={companyName}
              className="w-12 h-12 rounded-xl object-contain bg-slate-50 p-1.5 border border-slate-200"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <h2 className="text-lg font-black tracking-tight text-blue-900 dark:text-white">
                {companyName}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Reg No: {regNo} &bull; https://hambaktech.com.ng
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Official Payment Receipt
            </div>
            <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
              Status: SUCCESSFUL
            </div>
          </div>
        </div>

        {/* Highlight Amount Box */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{result.serviceTitle}</div>
            <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {result.planOrDescription}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Paid</div>
            <div className="text-2xl font-black font-mono text-blue-800 dark:text-emerald-400 tabular-nums">
              {formatNaira(result.netPayable)}
            </div>
          </div>
        </div>

        {/* Metadata Rows */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
          <div className="py-2.5 flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Transaction Reference</span>
            <span className="font-mono font-bold text-right break-all">{result.reference}</span>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Date &amp; Time</span>
            <span className="font-mono text-right">{new Date(result.timestamp).toLocaleString()}</span>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Customer Name</span>
            <span className="font-semibold text-right">{customerName}</span>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Customer Email</span>
            <span className="font-mono text-right">{customerEmail}</span>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Network / Provider</span>
            <span className="font-semibold text-right">{result.networkOrProvider}</span>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">{result.recipientLabel}</span>
            <span className="font-mono font-semibold text-right">{result.recipientValue}</span>
          </div>
          {result.nominalAmount > 0 && result.nominalAmount !== result.netPayable && (
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Nominal Value</span>
              <span className="font-mono tabular-nums text-right">{formatNaira(result.nominalAmount)}</span>
            </div>
          )}
          {typeof result.discountAmount === 'number' && result.discountAmount > 0 && (
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Customer Discount Saved</span>
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums text-right">
                -{formatNaira(result.discountAmount)}
              </span>
            </div>
          )}
          {typeof result.balanceAfter === 'number' && (
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Wallet Balance After</span>
              <span className="font-mono font-semibold tabular-nums text-right">{formatNaira(result.balanceAfter)}</span>
            </div>
          )}
        </div>

        {/* STS Token Block if Electricity */}
        {result.electricityToken && (
          <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 space-y-1">
            <div className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-400">
              STS Prepaid Meter Token
            </div>
            <div className="text-lg font-black font-mono tracking-wider tabular-nums">
              {result.electricityToken}
            </div>
            {result.electricityUnits && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Units: {result.electricityUnits}
              </div>
            )}
          </div>
        )}

        {/* Delivered PINs Table if PIN/Exam */}
        {result.vouchers && result.vouchers.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
              Delivered Voucher PINs
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">PIN</th>
                    <th className="px-3 py-2">Serial Number</th>
                    <th className="px-3 py-2">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {result.vouchers.map((v, idx) => (
                    <tr key={`${v.serial}-${idx}`}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold">{v.pin}</td>
                      <td className="px-3 py-2">{v.serial}</td>
                      <td className="px-3 py-2">{v.denomination_label || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result.examPins && result.examPins.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
              Exam Result Checker Tokens
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Exam</th>
                    <th className="px-3 py-2">PIN</th>
                    <th className="px-3 py-2">Serial Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {result.examPins.map((ep, idx) => (
                    <tr key={`${ep.serial}-${idx}`}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">{ep.exam}</td>
                      <td className="px-3 py-2 font-bold">{ep.pin}</td>
                      <td className="px-3 py-2">{ep.serial}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Receipt Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>Issued automatically by {companyName}</span>
          <span>Support: {supportEmail} &bull; {supportPhone}</span>
        </div>
      </div>
    </div>
  );
};

export const CustomerPortalFooter: React.FC = () => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const brandShort = branding?.short_brand_name || 'HAMBAKTECH';
  const regNumber = branding?.business_reg_number || 'BN 9284726';
  const address = branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const supportEmail = branding?.support_email || 'support@hambaktech.com.ng';
  const infoEmail = branding?.info_email || 'info@hambaktech.com.ng';
  const officePhone = branding?.support_phone || '09127469686';
  const businessPhone = branding?.business_phone || '08147837664';
  const whatsappPhone = branding?.whatsapp_number || '09155104724';

  return (
    <footer className="no-print mt-10 pt-8 pb-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <img
              src={branding?.logo_url || '/logo.png'}
              alt={companyName}
              className="h-8 w-auto object-contain rounded"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <div className="text-sm font-extrabold text-blue-900 dark:text-white">{companyName}</div>
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {brandShort} &bull; {branding?.tagline || 'Where Technology Meets Services'}
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span>Reg No: {regNumber} &bull; https://hambaktech.com.ng</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
            Office &amp; Support Contacts
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <span>{address}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <a href={`mailto:${supportEmail}`} className="hover:text-blue-700 dark:hover:text-white">
              {supportEmail}
            </a>
            <span className="text-slate-400">&bull;</span>
            <a href={`mailto:${infoEmail}`} className="hover:text-blue-700 dark:hover:text-white">
              {infoEmail}
            </a>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
            Customer Helpdesk
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Phone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              Office: {officePhone}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              Business: {businessPhone}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-mono tabular-nums">WhatsApp: {whatsappPhone}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-500 pt-1">
            {branding?.copyright_text ||
              `© ${new Date().getFullYear()} ${companyName} (${regNumber}). All Rights Reserved.`}
          </div>
        </div>
      </div>
    </footer>
  );
};
