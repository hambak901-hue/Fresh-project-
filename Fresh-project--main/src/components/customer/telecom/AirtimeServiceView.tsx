/**
 * @file AirtimeServiceView.tsx
 * Clean Instant VTU Airtime Recharge service view with dual Light/Night theme,
 * Nigerian phone MNP support, and 4-step transaction workflow.
 */

import React, { useState } from 'react';
import { api } from '../../../lib/api';
import {
  analyzeNigerianPhone,
  CarrierCode,
  CARRIERS,
  createIdempotencyKey,
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
import { AlertCircle, ArrowRight, Zap } from 'lucide-react';

interface AirtimeServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  discountPercent: number;
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

const PRESET_AMOUNTS = [200, 500, 1000, 2000];

export const AirtimeServiceView: React.FC<AirtimeServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  discountPercent,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [network, setNetwork] = useState<CarrierCode>('MTN');
  const [phone, setPhone] = useState('');
  const [ported, setPorted] = useState(false);
  const [amount, setAmount] = useState<number>(1000);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);
  const [requerying, setRequerying] = useState(false);

  const safeAmount = Math.max(0, Number(amount) || 0);
  const discountSaved = Math.round(((safeAmount * discountPercent) / 100) * 100) / 100;
  const netPayable = Math.max(0, Math.round((safeAmount - discountSaved) * 100) / 100);

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const analysis = analyzeNigerianPhone(phone);
    if (!analysis.valid) {
      setFormError(analysis.reason || 'Please enter a valid 11-digit Nigerian phone number.');
      return;
    }
    if (analysis.detectedNetwork && analysis.detectedNetwork !== network && !ported) {
      setFormError(
        `${analysis.normalized} has an ${analysis.detectedNetwork} prefix. Switch to ${analysis.detectedNetwork} or confirm the line was ported to ${network}.`
      );
      return;
    }
    if (safeAmount < 50) {
      setFormError('Minimum airtime recharge amount is ₦50.');
      return;
    }
    if (safeAmount > 50000) {
      setFormError('Maximum single airtime recharge is ₦50,000.');
      return;
    }

    const formattedPhone = analysis.normalized;
    setPhone(formattedPhone);

    setReviewDraft({
      serviceKey: 'airtime',
      serviceTitle: 'Instant VTU Airtime Recharge',
      summarySubtitle: `Cash discount of ${discountPercent}% applied to ${network} top-up`,
      networkOrProvider: network,
      recipientLabel: 'Recipient Phone Number',
      recipientValue: formattedPhone,
      nominalAmount: safeAmount,
      discountAmount: discountSaved,
      netPayable,
      confirmLabel: `Confirm & Pay ${formatNaira(netPayable)}`,
      pinTitle: 'Authorize Airtime Recharge',
      pinDescription: `Enter your Transaction PIN to recharge ${formatNaira(safeAmount)} ${network} airtime to ${formattedPhone} (${formatNaira(netPayable)} deducted from wallet).`,
      items: [
        { label: 'Service', value: 'Instant VTU Airtime Recharge' },
        { label: 'Mobile Network', value: `${network}${ported ? ' (Ported MNP)' : ''}` },
        { label: 'Recipient Phone Number', value: formattedPhone, emphasize: true },
        { label: 'Nominal Airtime Value', value: formatNaira(safeAmount), emphasize: true },
        { label: `Cash Discount (${discountPercent}%)`, value: `-${formatNaira(discountSaved)}`, tone: 'emerald' },
        { label: 'Net Wallet Deduction', value: formatNaira(netPayable), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft) return;
    const idempotencyKey = createIdempotencyKey('AIR');
    const cleanPhone = reviewDraft.recipientValue;

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      reviewDraft.netPayable,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'airtime',
          serviceTitle: 'Instant VTU Airtime Recharge',
          message: 'Processing airtime delivery...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: network,
          recipientLabel: 'Recipient Phone Number',
          recipientValue: cleanPhone,
          planOrDescription: `${network} ${formatNaira(safeAmount)} Airtime`,
          nominalAmount: safeAmount,
          discountAmount: discountSaved,
          netPayable,
        });

        try {
          const res = await api.purchaseAirtime(
            network,
            cleanPhone,
            safeAmount,
            verifiedPin,
            idempotencyKey,
            ported
          );
          const rawStatus = String(res.status || res.order?.status || 'successful').toLowerCase();
          const outcome = rawStatus === 'pending' ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.reference || res.order?.reference || res.order?.provider_ref || res.order?.id || idempotencyKey;

          setExecResult({
            outcome,
            serviceKey: 'airtime',
            serviceTitle: 'Instant VTU Airtime Recharge',
            message: res.message || (outcome === 'successful' ? 'Airtime delivered successfully.' : 'Order awaiting confirmation.'),
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: network,
            recipientLabel: 'Recipient Phone Number',
            recipientValue: cleanPhone,
            planOrDescription: `${network} ${formatNaira(safeAmount)} Airtime`,
            nominalAmount: res.face_value ?? safeAmount,
            discountAmount: res.discountSaved ?? discountSaved,
            netPayable: res.amount_charged ?? netPayable,
            balanceAfter: res.balance_after ?? res.newBalance,
            order: res.order,
            requerySupported: outcome === 'pending',
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'airtime',
            serviceTitle: 'Instant VTU Airtime Recharge',
            message: err?.message || 'Unable to complete airtime recharge.',
            reference: idempotencyKey,
            timestamp: new Date().toISOString(),
            networkOrProvider: network,
            recipientLabel: 'Recipient Phone Number',
            recipientValue: cleanPhone,
            planOrDescription: `${network} ${formatNaira(safeAmount)} Airtime`,
            nominalAmount: safeAmount,
            discountAmount: discountSaved,
            netPayable,
          });
          await onTransactionComplete().catch(() => {});
        }
      }
    );
  };

  const handleRequery = async (reference: string) => {
    setRequerying(true);
    try {
      const res = await api.verifyTelecomTransaction(reference);
      const updatedStatus = String(res.order?.status || res.result?.status || '').toLowerCase();
      if (updatedStatus === 'successful' || updatedStatus === 'failed') {
        setExecResult((prev) =>
          prev
            ? {
                ...prev,
                outcome: updatedStatus === 'successful' ? 'successful' : 'failed',
                message:
                  updatedStatus === 'successful'
                    ? 'Airtime transaction confirmed successful.'
                    : 'Transaction failed on verification. Any reversal is logged to your wallet.',
                order: res.order || prev.order,
                requerySupported: false,
              }
            : prev
        );
        await onTransactionComplete();
      }
    } finally {
      setRequerying(false);
    }
  };

  const handleReset = () => {
    setStep('form');
    setPhone('');
    setPorted(false);
    setFormError(null);
    setReviewDraft(null);
    setExecResult(null);
  };

  return (
    <div className="space-y-6">
      {step !== 'form' && (
        <>
          <TelecomAccountStrip
            account={account}
            pendingPayable={step === 'review' ? netPayable : 0}
          />

          <TelecomStepProgress
            step={step}
            allowReceiptStep={execResult?.outcome === 'successful'}
          />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Left Form Panel */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
                  <span>Instant VTU Airtime Recharge</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Top up any Nigerian mobile number with the applicable customer discount.
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {discountPercent}% Cash Discount
              </div>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Carrier Network Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Select Mobile Network
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {CARRIERS.map((carrier) => {
                  const selected = network === carrier.code;
                  return (
                    <button
                      key={carrier.code}
                      type="button"
                      onClick={() => {
                        setNetwork(carrier.code);
                        setPorted(false);
                        setFormError(null);
                      }}
                      className={`min-h-[48px] px-3 py-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                        selected
                          ? carrier.borderActive
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-sm ${carrier.accentBg}`} />
                      <span>{carrier.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phone Number Input with MNP Support */}
            <TelecomPhoneField
              label="Recipient Phone Number"
              selectedNetwork={network}
              value={phone}
              ported={ported}
              onChange={(val) => {
                setPhone(val);
                setFormError(null);
              }}
              onPortedChange={setPorted}
              onSelectNetwork={setNetwork}
            />

            {/* Recharge Amount Presets & Input */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Recharge Amount (₦)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PRESET_AMOUNTS.map((amt) => {
                  const isSelected = safeAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setAmount(amt);
                        setFormError(null);
                      }}
                      className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-mono font-bold tabular-nums transition ${
                        isSelected
                          ? 'bg-blue-700 dark:bg-emerald-600 border-blue-700 dark:border-emerald-600 text-white shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-blue-400 dark:hover:border-emerald-500'
                      }`}
                    >
                      {formatNaira(amt)}
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 dark:text-slate-400">
                  ₦
                </span>
                <input
                  type="number"
                  min={50}
                  max={50000}
                  step={50}
                  value={amount || ''}
                  onChange={(e) => {
                    setAmount(Number(e.target.value));
                    setFormError(null);
                  }}
                  placeholder="Enter custom airtime amount (min ₦50)"
                  className="w-full min-h-[46px] pl-9 pr-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-blue-600 dark:focus:border-emerald-500 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none tabular-nums"
                  required
                />
              </div>
            </div>
          </div>

          {/* Right Live Pricing Breakdown & CTA */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
              Order Calculation
            </h3>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Network Selected</span>
                <span className="font-bold text-slate-900 dark:text-white">{network}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Nominal Airtime Value</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                  {formatNaira(safeAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Discount Saved ({discountPercent}%)
                </span>
                <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                  -{formatNaira(discountSaved)}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">Net Amount Deducted</span>
                <span className="text-xl font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                  {formatNaira(netPayable)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"
            >
              <span>
                Recharge {formatNaira(safeAmount)} {network} Airtime
              </span>
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
          onConfirm={handleConfirmPurchase}
        />
      )}

      {step === 'result' && execResult && (
        <TelecomResultPage
          result={execResult}
          requerying={requerying}
          onRequery={handleRequery}
          onOpenReceipt={() => {
            if (execResult.outcome === 'successful') {
              setStep('receipt');
            }
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
