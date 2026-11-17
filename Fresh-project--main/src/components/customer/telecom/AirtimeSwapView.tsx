/**
 * @file AirtimeSwapView.tsx
 * Airtime-to-Cash conversion view preserving swap conversion rates, min/max caps,
 * bank or wallet payout option, Nigerian sender number validation, and clear pending transfer instructions.
 */

import React, { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { AirtimeSwapConfigItem } from '../../../types';
import {
  analyzeNigerianPhone,
  CarrierCode,
  CARRIERS,
  CustomerAccountSnapshot,
  formatNaira,
  ReviewDraft,
  TransactionExecutionResult,
  WorkflowStep,
} from './types';
import { TelecomPhoneField } from './TelecomPhoneField';
import {
  TelecomAccountStrip,
  TelecomReceiptPage,
  TelecomResultPage,
  TelecomReviewPage,
  TelecomStepProgress,
} from './TelecomShared';
import { AlertCircle, ArrowRight, Repeat } from 'lucide-react';

interface AirtimeSwapViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  configs: AirtimeSwapConfigItem[];
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const AirtimeSwapView: React.FC<AirtimeSwapViewProps> = ({
  account,
  customerName,
  customerEmail,
  configs,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [network, setNetwork] = useState<CarrierCode>('MTN');
  const [senderPhone, setSenderPhone] = useState('');
  const [ported, setPorted] = useState(false);
  const [amount, setAmount] = useState<number>(2000);
  const [payoutDestination, setPayoutDestination] = useState<'wallet' | 'bank'>('wallet');
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);

  const activeConfig: any = useMemo(
    () => configs.find((c) => c.network === network) || null,
    [configs, network]
  );

  const conversionRate = activeConfig
    ? Number(activeConfig.conversion_rate ?? activeConfig.conversion_rate_percent ?? activeConfig.rate ?? 80)
    : 80;
  const minAmount = activeConfig ? Number(activeConfig.min_amount || 500) : 500;
  const maxAmount = activeConfig ? Number(activeConfig.max_amount || 50000) : 50000;
  const safeAmount = Math.max(0, Number(amount) || 0);
  const expectedCredit = Math.round(((safeAmount * conversionRate) / 100) * 100) / 100;

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (activeConfig && !activeConfig.enabled) {
      setFormError(`Airtime to Cash is currently disabled for ${network}.`);
      return;
    }

    const analysis = analyzeNigerianPhone(senderPhone);
    if (!analysis.valid) {
      setFormError(analysis.reason || 'Please enter a valid 11-digit Nigerian sender phone number.');
      return;
    }
    if (safeAmount < minAmount || safeAmount > maxAmount) {
      setFormError(
        `Airtime transfer amount for ${network} must be between ${formatNaira(minAmount)} and ${formatNaira(maxAmount)}.`
      );
      return;
    }
    if (payoutDestination === 'bank') {
      if (!bankName.trim() || accountNumber.replace(/\D+/g, '').length !== 10 || !accountName.trim()) {
        setFormError('Please provide your Bank Name, 10-digit NUBAN Account Number, and Account Name.');
        return;
      }
    }

    const formattedPhone = analysis.normalized;
    setSenderPhone(formattedPhone);

    const bankLabel = payoutDestination === 'wallet' ? 'Wallet Direct Credit' : bankName.trim();

    setReviewDraft({
      serviceKey: 'airtime_swap',
      serviceTitle: 'Airtime to Cash Conversion',
      summarySubtitle: `${network} airtime swap at ${conversionRate}% payout rate`,
      networkOrProvider: network,
      recipientLabel: 'Sender Phone Number',
      recipientValue: formattedPhone,
      nominalAmount: safeAmount,
      netPayable: 0, // Customer transfers airtime; wallet is credited upon verification
      confirmLabel: 'Authorize & Generate Transfer Details',
      pinTitle: 'Authorize Airtime to Cash',
      pinDescription: `Enter your Transaction PIN to initiate a ${formatNaira(safeAmount)} ${network} airtime conversion (estimated payout: ${formatNaira(expectedCredit)}).`,
      items: [
        { label: 'Service', value: 'Airtime to Cash Conversion' },
        { label: 'Network', value: network },
        { label: 'Sender Phone Number', value: formattedPhone, emphasize: true },
        { label: 'Airtime Amount to Transfer', value: formatNaira(safeAmount), emphasize: true },
        { label: 'Conversion Rate', value: `${conversionRate}%` },
        { label: 'Estimated Cash Payout', value: formatNaira(expectedCredit), tone: 'emerald', emphasize: true },
        {
          label: 'Payout Destination',
          value:
            payoutDestination === 'wallet'
              ? 'Wallet Direct Credit'
              : `${bankLabel} • ${accountNumber.trim()} (${accountName.trim()})`,
        },
        { label: 'Wallet Debit', value: '₦0 (Transfer airtime after approval)', tone: 'blue' },
      ],
    });
    setStep('review');
  };

  const handleConfirmSwap = () => {
    if (!reviewDraft) return;
    const cleanPhone = reviewDraft.recipientValue;
    const bankLabel = payoutDestination === 'wallet' ? 'Wallet Direct Credit' : bankName.trim();

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      0,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'airtime_swap',
          serviceTitle: 'Airtime to Cash Conversion',
          message: 'Creating airtime swap order and generating transfer destination...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: network,
          recipientLabel: 'Sender Phone Number',
          recipientValue: cleanPhone,
          planOrDescription: `${network} ${formatNaira(safeAmount)} Airtime to Cash`,
          nominalAmount: safeAmount,
          netPayable: 0,
        });

        try {
          const res = await api.initiateAirtimeSwap({
            network,
            phone: cleanPhone,
            amount: safeAmount,
            bankName: bankLabel,
            accountNumber: payoutDestination === 'bank' ? accountNumber.trim() : '',
            accountName: payoutDestination === 'bank' ? accountName.trim() : '',
            transaction_pin: verifiedPin,
          });

          const ref = res.order?.reference || res.order?.provider_ref || res.order?.id || '';
          setExecResult({
            outcome: 'pending',
            serviceKey: 'airtime_swap',
            serviceTitle: 'Airtime to Cash Conversion',
            message: res.message || 'Swap initiated. Transfer airtime to the merchant line below.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: network,
            recipientLabel: 'Sender Phone Number',
            recipientValue: cleanPhone,
            planOrDescription: `${network} ${formatNaira(safeAmount)} Airtime → ${formatNaira(expectedCredit)} Payout`,
            nominalAmount: safeAmount,
            netPayable: 0,
            order: res.order,
            swapDetails: res.swapDetails,
            requerySupported: false,
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'airtime_swap',
            serviceTitle: 'Airtime to Cash Conversion',
            message: err?.message || 'Unable to initiate airtime swap.',
            reference: '',
            timestamp: new Date().toISOString(),
            networkOrProvider: network,
            recipientLabel: 'Sender Phone Number',
            recipientValue: cleanPhone,
            planOrDescription: `${network} ${formatNaira(safeAmount)} Airtime to Cash`,
            nominalAmount: safeAmount,
            netPayable: 0,
          });
        }
      }
    );
  };

  const handleReset = () => {
    setStep('form');
    setSenderPhone('');
    setPorted(false);
    setFormError(null);
    setReviewDraft(null);
    setExecResult(null);
  };

  return (
    <div className="space-y-6">
      {step !== 'form' && (
        <>
          <TelecomAccountStrip account={account} pendingPayable={0} />
          <TelecomStepProgress step={step} allowReceiptStep={execResult?.outcome === 'successful'} />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Repeat className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
                <span>Airtime to Cash</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Convert excess airtime into cash credited directly to your wallet or bank account.
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-emerald-950/40 border border-blue-200 dark:border-emerald-800/60 text-xs font-bold text-blue-700 dark:text-emerald-400 tabular-nums">
              Rate: {conversionRate}% Payout
            </div>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Network */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Network
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {CARRIERS.map((carrier) => (
                <button
                  key={carrier.code}
                  type="button"
                  onClick={() => {
                    setNetwork(carrier.code);
                    setPorted(false);
                    setFormError(null);
                  }}
                  className={`min-h-[48px] px-3 py-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                    network === carrier.code
                      ? carrier.borderActive
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-sm ${carrier.accentBg}`} />
                  <span>{carrier.code}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <TelecomPhoneField
              label="Sender Phone Number (Transferring Airtime)"
              selectedNetwork={network}
              value={senderPhone}
              ported={ported}
              onChange={(val) => {
                setSenderPhone(val);
                setFormError(null);
              }}
              onPortedChange={setPorted}
              onSelectNetwork={setNetwork}
            />

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Airtime Amount to Swap ({formatNaira(minAmount)} – {formatNaira(maxAmount)})
              </label>
              <input
                type="number"
                min={minAmount}
                max={maxAmount}
                step={100}
                value={amount || ''}
                onChange={(e) => {
                  setAmount(Number(e.target.value));
                  setFormError(null);
                }}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none tabular-nums"
                required
              />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                Estimated Cash Payout ({conversionRate}%): {formatNaira(expectedCredit)}
              </p>
            </div>
          </div>

          {/* Payout Destination */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Payout Method
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPayoutDestination('wallet')}
                className={`min-h-[48px] p-3.5 rounded-xl border text-left text-xs font-bold transition ${
                  payoutDestination === 'wallet'
                    ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30 text-blue-900 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                }`}
              >
                Wallet Direct Credit (Instant upon confirmation)
              </button>
              <button
                type="button"
                onClick={() => setPayoutDestination('bank')}
                className={`min-h-[48px] p-3.5 rounded-xl border text-left text-xs font-bold transition ${
                  payoutDestination === 'bank'
                    ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30 text-blue-900 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                }`}
              >
                Bank Account Settlement
              </button>
            </div>

            {payoutDestination === 'bank' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank Name (e.g. GTBank)"
                  className="min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none"
                  required
                />
                <input
                  type="text"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D+/g, ''))}
                  placeholder="10-Digit Account Number"
                  className="min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white outline-none"
                  required
                />
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Account Holder Name"
                  className="min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none"
                  required
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              You receive:{' '}
              <strong className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatNaira(expectedCredit)}
              </strong>
            </div>
            <button
              type="submit"
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition"
            >
              <span>Review Airtime Conversion</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {step === 'review' && reviewDraft && (
        <TelecomReviewPage
          draft={reviewDraft}
          walletBalance={account.walletBalance}
          onBack={() => setStep('form')}
          onConfirm={handleConfirmSwap}
        />
      )}

      {step === 'result' && execResult && (
        <TelecomResultPage
          result={execResult}
          onOpenReceipt={() => {
            if (execResult.outcome === 'successful') setStep('receipt');
          }}
          onNewOrder={handleReset}
          onEditRetry={() => setStep('form')}
          onOpenHistory={onOpenHistory}
        />
      )}

      {step === 'receipt' && execResult && (
        <TelecomReceiptPage
          result={execResult}
          customerName={customerName}
          customerEmail={customerEmail}
          onBack={() => setStep('result')}
          onNewOrder={handleReset}
        />
      )}
    </div>
  );
};
