/**
 * @file DataServiceView.tsx
 * Dedicated Data Bundles service view preserving network/category filtering,
 * real catalogue pricing, Nigerian MNP phone support, and 4-step workflow.
 */

import React, { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { TelecomPlanItem } from '../../../types';
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
import { AlertCircle, ArrowRight, Smartphone } from 'lucide-react';

interface DataServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  plans: TelecomPlanItem[];
  categoriesByNetwork: Record<string, string[]>;
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const DataServiceView: React.FC<DataServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  plans,
  categoriesByNetwork,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [network, setNetwork] = useState<CarrierCode>('MTN');
  const [category, setCategory] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [ported, setPorted] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);
  const [requerying, setRequerying] = useState<boolean>(false);

  const availableCategories = useMemo(() => {
    const listed = categoriesByNetwork[network];
    if (listed && listed.length > 0) return listed;
    return Array.from(new Set(plans.filter((p) => p.network === network).map((p) => p.type)));
  }, [categoriesByNetwork, plans, network]);

  const activeCategory =
    category && availableCategories.includes(category)
      ? category
      : availableCategories[0] || '';

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => p.network === network && (!activeCategory || p.type === activeCategory));
  }, [plans, network, activeCategory]);

  const selectedPlan = useMemo(() => {
    return filteredPlans.find((p) => p.id === selectedPlanId) || filteredPlans[0] || null;
  }, [filteredPlans, selectedPlanId]);

  const handleSelectNetwork = (net: CarrierCode) => {
    setNetwork(net);
    setPorted(false);
    setFormError(null);
    const nextCats =
      categoriesByNetwork[net]?.length > 0
        ? categoriesByNetwork[net]
        : Array.from(new Set(plans.filter((p) => p.network === net).map((p) => p.type)));
    const nextCat = nextCats[0] || '';
    setCategory(nextCat);
    const firstPlan = plans.find((p) => p.network === net && (!nextCat || p.type === nextCat));
    setSelectedPlanId(firstPlan?.id || '');
  };

  const handleSelectCategory = (cat: string) => {
    setCategory(cat);
    const firstPlan = plans.find((p) => p.network === network && p.type === cat);
    if (firstPlan) setSelectedPlanId(firstPlan.id);
    setFormError(null);
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedPlan) {
      setFormError('Please select a mobile data bundle plan.');
      return;
    }

    const analysis = analyzeNigerianPhone(phone);
    if (!analysis.valid) {
      setFormError(analysis.reason || 'Please enter a valid 11-digit Nigerian recipient number.');
      return;
    }

    if (analysis.detectedNetwork && analysis.detectedNetwork !== network && !ported) {
      setFormError(
        `${analysis.normalized} has an ${analysis.detectedNetwork} prefix. Click "Switch to ${analysis.detectedNetwork}" or confirm it was ported to ${network}.`
      );
      return;
    }

    const formattedPhone = analysis.normalized;
    setPhone(formattedPhone);
    const price = Number(selectedPlan.price || 0);

    setReviewDraft({
      serviceKey: 'data',
      serviceTitle: 'Mobile Data Bundle Purchase',
      summarySubtitle: `${selectedPlan.network} ${selectedPlan.size} (${selectedPlan.type})`,
      networkOrProvider: selectedPlan.network,
      recipientLabel: 'Recipient Phone Number',
      recipientValue: formattedPhone,
      nominalAmount: price,
      netPayable: price,
      confirmLabel: `Confirm & Pay ${formatNaira(price)}`,
      pinTitle: 'Authorize Data Bundle',
      pinDescription: `Enter your Transaction PIN to send ${selectedPlan.network} ${selectedPlan.size} (${selectedPlan.type} • ${selectedPlan.validity}) to ${formattedPhone} for ${formatNaira(price)}.`,
      items: [
        { label: 'Service', value: 'Mobile Data Bundle' },
        { label: 'Network', value: `${selectedPlan.network}${ported ? ' (Ported MNP)' : ''}` },
        { label: 'Data Category', value: selectedPlan.type },
        { label: 'Bundle Plan', value: `${selectedPlan.size} — ${selectedPlan.name}`, emphasize: true },
        { label: 'Validity', value: selectedPlan.validity || 'Standard' },
        { label: 'Recipient Phone Number', value: formattedPhone, emphasize: true },
        { label: 'Amount Deducted', value: formatNaira(price), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft || !selectedPlan) return;
    const planSnapshot = selectedPlan;
    const recipientPhone = reviewDraft.recipientValue;
    const price = Number(planSnapshot.price || 0);
    const idempotencyKey = createIdempotencyKey('DATA');

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      price,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'data',
          serviceTitle: 'Mobile Data Bundle Purchase',
          message: 'Dispatching mobile data bundle...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: planSnapshot.network,
          recipientLabel: 'Recipient Phone Number',
          recipientValue: recipientPhone,
          planOrDescription: `${planSnapshot.network} ${planSnapshot.size} (${planSnapshot.type})`,
          nominalAmount: price,
          netPayable: price,
        });

        try {
          const res = await api.purchaseData(
            planSnapshot.id,
            recipientPhone,
            network,
            idempotencyKey,
            verifiedPin,
            ported
          );
          const rawStatus = String(res.status || res.order?.status || 'successful').toLowerCase();
          const outcome = rawStatus === 'pending' ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.reference || res.order?.reference || res.order?.provider_ref || res.order?.id || idempotencyKey;

          setExecResult({
            outcome,
            serviceKey: 'data',
            serviceTitle: 'Mobile Data Bundle Purchase',
            message: res.message || 'Data bundle order submitted.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: planSnapshot.network,
            recipientLabel: 'Recipient Phone Number',
            recipientValue: recipientPhone,
            planOrDescription: res.order?.plan || `${planSnapshot.network} ${planSnapshot.size} (${planSnapshot.type})`,
            nominalAmount: res.order?.amount ?? price,
            netPayable: res.order?.amount ?? price,
            balanceAfter: res.balance_after ?? res.newBalance,
            order: res.order,
            requerySupported: outcome === 'pending',
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'data',
            serviceTitle: 'Mobile Data Bundle Purchase',
            message: err?.message || 'Data purchase failed. Please verify balance and try again.',
            reference: idempotencyKey,
            timestamp: new Date().toISOString(),
            networkOrProvider: planSnapshot.network,
            recipientLabel: 'Recipient Phone Number',
            recipientValue: recipientPhone,
            planOrDescription: `${planSnapshot.network} ${planSnapshot.size} (${planSnapshot.type})`,
            nominalAmount: price,
            netPayable: price,
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
                    ? 'Data bundle confirmed delivered.'
                    : 'Data delivery failed. Automatic wallet refund applies where applicable.',
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
            pendingPayable={step === 'review' ? Number(selectedPlan?.price || 0) : 0}
          />

          <TelecomStepProgress
            step={step}
            allowReceiptStep={execResult?.outcome === 'successful'}
          />
        </>
      )}

      {step === 'form' && (
        <form onSubmit={handleProceedToReview} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
                <span>Data Bundles</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Choose a carrier network, category, and bundle plan, then enter your recipient phone number.
              </p>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* 1. Network Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. Select Mobile Network
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {CARRIERS.map((carrier) => {
                  const active = network === carrier.code;
                  return (
                    <button
                      key={carrier.code}
                      type="button"
                      onClick={() => handleSelectNetwork(carrier.code)}
                      className={`min-h-[48px] px-3 py-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                        active
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

            {/* 2. Data Category */}
            {availableCategories.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  2. Select Data Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map((cat) => {
                    const active = activeCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleSelectCategory(cat)}
                        className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold transition ${
                          active
                            ? 'bg-blue-700 dark:bg-emerald-600 border-blue-700 dark:border-emerald-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Data Plans Catalogue */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                3. Select Data Bundle Plan ({filteredPlans.length} available)
              </label>
              {filteredPlans.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                  No active plans found for {network} {activeCategory}.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[340px] overflow-y-auto pr-1">
                  {filteredPlans.map((plan) => {
                    const active = selectedPlan?.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setFormError(null);
                        }}
                        className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 min-h-[84px] ${
                          active
                            ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30 ring-1 ring-blue-700/30 dark:ring-emerald-500/40'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 hover:border-blue-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                            {plan.size}
                          </span>
                          <span className="text-sm font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                            {formatNaira(plan.price)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          {plan.type} &bull; Validity: {plan.validity || '30 days'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Recipient Nigerian Phone + MNP */}
            <TelecomPhoneField
              label="4. Recipient Phone Number"
              selectedNetwork={network}
              value={phone}
              ported={ported}
              useServerValidation={true}
              onChange={(val) => {
                setPhone(val);
                setFormError(null);
              }}
              onPortedChange={setPorted}
              onSelectNetwork={handleSelectNetwork}
            />

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Selected Plan:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {selectedPlan ? `${selectedPlan.network} ${selectedPlan.size} (${formatNaira(selectedPlan.price)})` : 'None'}
                </strong>
              </div>
              <button
                type="submit"
                disabled={!selectedPlan}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <span>
                  {selectedPlan ? `Continue with ${selectedPlan.size} (${formatNaira(selectedPlan.price)})` : 'Select a Plan'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
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
