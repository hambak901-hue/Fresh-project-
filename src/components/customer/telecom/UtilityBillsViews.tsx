/**
 * @file UtilityBillsViews.tsx
 * Dedicated views for:
 * - Cable TV (DSTV, GOTV, STARTIMES, SHOWMAX + Smartcard validation + 4-step workflow)
 * - Electricity (Discos + Prepaid/Postpaid + Meter verification + STS token delivery + 4-step workflow)
 * - Exam Cards (WAEC, NECO, NABTEB, JAMB + PIN delivery + 4-step workflow)
 * - Bulk SMS (Sender ID, multi-recipient list, character/page/unit cost breakdown + 4-step workflow)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { CablePackageItem, ElectricityDiscoItem, ExamPackageItem } from '../../../types';
import {
  createIdempotencyKey,
  CustomerAccountSnapshot,
  formatNaira,
  ReviewDraft,
  TransactionExecutionResult,
  WorkflowStep,
} from './types';
import {
  TelecomAccountStrip,
  TelecomReceiptPage,
  TelecomResultPage,
  TelecomReviewPage,
  TelecomStepProgress,
} from './TelecomShared';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Search,
  Tv,
} from 'lucide-react';

// =============================================================================
// 6. CABLE TV SERVICE VIEW
// =============================================================================

interface CableTvServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  packagesByProvider: Record<string, CablePackageItem[]>;
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const CableTvServiceView: React.FC<CableTvServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  packagesByProvider,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [provider, setProvider] = useState<'DSTV' | 'GOTV' | 'STARTIMES' | 'SHOWMAX'>('GOTV');
  const [smartcardNumber, setSmartcardNumber] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [verifiedCustomer, setVerifiedCustomer] = useState<{
    customerName: string;
    dueDate?: string;
    status?: string;
    bouquet?: string;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);

  const bouquets = useMemo(() => packagesByProvider[provider] || [], [packagesByProvider, provider]);
  const selectedBouquet = useMemo(
    () => bouquets.find((p) => p.id === selectedPackageId) || bouquets[0] || null,
    [bouquets, selectedPackageId]
  );

  const handleVerifySmartcard = async () => {
    setFormError(null);
    const cleaned = smartcardNumber.trim();
    if (cleaned.length < 8) {
      setFormError('Please enter a valid smartcard or IUC number (at least 8 digits).');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.verifySmartcard(provider, cleaned);
      if (res.success) {
        setVerifiedCustomer(res);
      } else {
        setFormError('Smartcard validation could not confirm customer details.');
      }
    } catch (err: any) {
      setVerifiedCustomer(null);
      setFormError(err?.message || 'Unable to verify smartcard number.');
    } finally {
      setVerifying(false);
    }
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedBouquet) {
      setFormError('Please select a Cable TV bouquet.');
      return;
    }
    if (!verifiedCustomer) {
      setFormError('Please click "Verify Smartcard" to confirm the subscriber account before proceeding.');
      return;
    }

    const price = Number(selectedBouquet.price || 0);
    setReviewDraft({
      serviceKey: 'cable',
      serviceTitle: `${provider} Cable TV Subscription`,
      summarySubtitle: `${selectedBouquet.name} • Subscriber: ${verifiedCustomer.customerName}`,
      networkOrProvider: provider,
      recipientLabel: 'Smartcard / IUC Number',
      recipientValue: smartcardNumber.trim(),
      nominalAmount: price,
      netPayable: price,
      confirmLabel: `Renew ${provider} (${formatNaira(price)})`,
      pinTitle: 'Authorize Cable TV Subscription',
      pinDescription: `Enter your Transaction PIN to renew ${provider} ${selectedBouquet.name} for ${verifiedCustomer.customerName} (IUC: ${smartcardNumber.trim()}) at ${formatNaira(price)}.`,
      items: [
        { label: 'Service', value: 'Cable TV Subscription' },
        { label: 'Provider', value: provider },
        { label: 'Bouquet Package', value: selectedBouquet.name, emphasize: true },
        { label: 'Smartcard / IUC Number', value: smartcardNumber.trim(), emphasize: true },
        { label: 'Subscriber Name', value: verifiedCustomer.customerName },
        { label: 'Amount Deducted', value: formatNaira(price), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft || !selectedBouquet) return;
    const bouquetSnap = selectedBouquet;
    const price = Number(bouquetSnap.price || 0);
    const iuc = reviewDraft.recipientValue;
    const customerLabel = verifiedCustomer?.customerName || '';

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      price,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'cable',
          serviceTitle: `${provider} Cable TV Subscription`,
          message: 'Renewing cable television bouquet...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: provider,
          recipientLabel: 'Smartcard / IUC Number',
          recipientValue: iuc,
          planOrDescription: `${provider} ${bouquetSnap.name}`,
          nominalAmount: price,
          netPayable: price,
          cableCustomerName: customerLabel,
        });

        try {
          const res = await api.purchaseCable({
            provider,
            smartcardNumber: iuc,
            packageId: bouquetSnap.id,
            transaction_pin: verifiedPin,
          });
          const rawStatus = String(res.order?.status || 'successful').toLowerCase();
          const outcome = rawStatus === 'pending' ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.order?.reference || res.order?.provider_ref || res.order?.id || createIdempotencyKey('CAB');

          setExecResult({
            outcome,
            serviceKey: 'cable',
            serviceTitle: `${provider} Cable TV Subscription`,
            message: res.message || 'Cable TV subscription renewed.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: provider,
            recipientLabel: 'Smartcard / IUC Number',
            recipientValue: iuc,
            planOrDescription: res.order?.plan || `${provider} ${bouquetSnap.name}`,
            nominalAmount: price,
            netPayable: price,
            balanceAfter: res.newBalance,
            order: res.order,
            cableCustomerName: customerLabel,
            requerySupported: outcome === 'pending',
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'cable',
            serviceTitle: `${provider} Cable TV Subscription`,
            message: err?.message || 'Cable TV subscription failed.',
            reference: '',
            timestamp: new Date().toISOString(),
            networkOrProvider: provider,
            recipientLabel: 'Smartcard / IUC Number',
            recipientValue: iuc,
            planOrDescription: `${provider} ${bouquetSnap.name}`,
            nominalAmount: price,
            netPayable: price,
          });
          await onTransactionComplete().catch(() => {});
        }
      }
    );
  };

  const handleReset = () => {
    setStep('form');
    setSmartcardNumber('');
    setVerifiedCustomer(null);
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
            pendingPayable={step === 'review' ? Number(selectedBouquet?.price || 0) : 0}
          />
          <TelecomStepProgress step={step} allowReceiptStep={execResult?.outcome === 'successful'} />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Tv className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Cable TV</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Verify your decoder Smartcard/IUC number and select your subscription bouquet.
            </p>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Provider */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              1. Select Cable Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(['GOTV', 'DSTV', 'STARTIMES', 'SHOWMAX'] as const).map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => {
                    setProvider(prov);
                    setSelectedPackageId('');
                    setVerifiedCustomer(null);
                    setFormError(null);
                  }}
                  className={`min-h-[48px] px-3 py-3 rounded-xl border text-xs font-bold transition ${
                    provider === prov
                      ? 'bg-blue-700 dark:bg-emerald-600 border-blue-700 dark:border-emerald-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {prov}
                </button>
              ))}
            </div>
          </div>

          {/* Smartcard & Verification */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              2. Smartcard / IUC Number
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={smartcardNumber}
                onChange={(e) => {
                  setSmartcardNumber(e.target.value.trim());
                  setVerifiedCustomer(null);
                  setFormError(null);
                }}
                placeholder="Enter Smartcard or IUC number"
                className="flex-1 min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white outline-none"
                required
              />
              <button
                type="button"
                onClick={handleVerifySmartcard}
                disabled={verifying || smartcardNumber.trim().length < 8}
                className="min-h-[46px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{verifying ? 'Verifying...' : 'Verify Smartcard'}</span>
              </button>
            </div>

            {verifiedCustomer && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Subscriber: {verifiedCustomer.customerName}</div>
                  {verifiedCustomer.bouquet && (
                    <div className="opacity-85">Current Bouquet: {verifiedCustomer.bouquet}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bouquet Select */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              3. Select Bouquet Package
            </label>
            {bouquets.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
                No bouquets found for {provider}.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {bouquets.map((pkg) => {
                  const active = selectedBouquet?.id === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
                        setFormError(null);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
                        active
                          ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-400'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{pkg.name}</span>
                      <span className="text-sm font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                        {formatNaira(pkg.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Selected Package:{' '}
              <strong className="text-slate-900 dark:text-white">
                {selectedBouquet ? `${selectedBouquet.name} (${formatNaira(selectedBouquet.price)})` : 'None'}
              </strong>
            </div>
            <button
              type="submit"
              disabled={!selectedBouquet || !verifiedCustomer}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>Review Cable Renewal</span>
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

// =============================================================================
// 7. ELECTRICITY BILL SERVICE VIEW
// =============================================================================

interface ElectricityServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  discos: ElectricityDiscoItem[];
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const ElectricityServiceView: React.FC<ElectricityServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  discos,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [discoId, setDiscoId] = useState<string>(discos[0]?.id || 'ikedc');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [meterNumber, setMeterNumber] = useState<string>('');
  const [amount, setAmount] = useState<number>(2000);
  const [verifiedMeter, setVerifiedMeter] = useState<{
    customerName: string;
    address: string;
    tariffClass?: string;
    discoName?: string;
  } | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);

  const activeDisco = discos.find((d) => d.id === discoId) || discos[0] || null;
  const minDiscoAmount = Number(activeDisco?.min_amount ?? activeDisco?.minimum_amount ?? 500);
  const safeAmount = Math.max(0, Number(amount) || 0);

  const handleVerifyMeter = async () => {
    setFormError(null);
    const cleaned = meterNumber.trim();
    if (cleaned.length < 8) {
      setFormError('Please enter a valid meter number (at least 8 digits).');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.verifyMeter(activeDisco?.id || discoId, cleaned, meterType);
      if (res.success) {
        setVerifiedMeter(res);
      } else {
        setFormError('Meter verification returned no customer details.');
      }
    } catch (err: any) {
      setVerifiedMeter(null);
      setFormError(err?.message || 'Unable to verify meter number.');
    } finally {
      setVerifying(false);
    }
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!verifiedMeter) {
      setFormError('Please verify your meter number before proceeding.');
      return;
    }
    if (safeAmount < minDiscoAmount) {
      setFormError(`Minimum electricity payment for ${activeDisco?.name || discoId} is ${formatNaira(minDiscoAmount)}.`);
      return;
    }

    const discoLabel = activeDisco?.name || verifiedMeter.discoName || discoId.toUpperCase();
    setReviewDraft({
      serviceKey: 'electricity',
      serviceTitle: 'Electricity Utility Payment',
      summarySubtitle: `${discoLabel} • ${meterType.toUpperCase()} Meter`,
      networkOrProvider: discoLabel,
      recipientLabel: 'Meter Number',
      recipientValue: meterNumber.trim(),
      nominalAmount: safeAmount,
      netPayable: safeAmount,
      confirmLabel: `Vend ${formatNaira(safeAmount)} Token`,
      pinTitle: 'Authorize Electricity Payment',
      pinDescription: `Enter your Transaction PIN to pay ${formatNaira(safeAmount)} for ${discoLabel} meter ${meterNumber.trim()} (${verifiedMeter.customerName}).`,
      items: [
        { label: 'Service', value: `Electricity (${meterType.toUpperCase()})` },
        { label: 'Distribution Company', value: discoLabel },
        { label: 'Meter Number', value: meterNumber.trim(), emphasize: true },
        { label: 'Customer Name', value: verifiedMeter.customerName },
        { label: 'Service Address', value: verifiedMeter.address || 'Registered Premises' },
        { label: 'Amount Deducted', value: formatNaira(safeAmount), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft) return;
    const discoSlug = activeDisco?.id || discoId;
    const discoLabel = reviewDraft.networkOrProvider;
    const meter = reviewDraft.recipientValue;
    const custName = verifiedMeter?.customerName || '';
    const custAddr = verifiedMeter?.address || '';

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      safeAmount,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'electricity',
          serviceTitle: 'Electricity Utility Payment',
          message: 'Generating electricity token...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: discoLabel,
          recipientLabel: 'Meter Number',
          recipientValue: meter,
          planOrDescription: `${discoLabel} (${meterType.toUpperCase()})`,
          nominalAmount: safeAmount,
          netPayable: safeAmount,
          meterCustomerName: custName,
          meterAddress: custAddr,
        });

        try {
          const res = await api.purchaseElectricity({
            discoId: discoSlug,
            meterNumber: meter,
            meterType,
            amount: safeAmount,
            transaction_pin: verifiedPin,
          });
          const rawStatus = String(res.order?.status || 'successful').toLowerCase();
          const outcome = rawStatus === 'pending' ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.order?.reference || res.order?.provider_ref || res.order?.id || createIdempotencyKey('ELE');

          setExecResult({
            outcome,
            serviceKey: 'electricity',
            serviceTitle: 'Electricity Utility Payment',
            message: res.message || 'Electricity payment completed.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: discoLabel,
            recipientLabel: 'Meter Number',
            recipientValue: meter,
            planOrDescription: res.order?.plan || `${discoLabel} (${meterType.toUpperCase()})`,
            nominalAmount: safeAmount,
            netPayable: safeAmount,
            balanceAfter: res.newBalance,
            order: res.order,
            electricityToken: res.token,
            electricityUnits: res.units,
            meterCustomerName: custName,
            meterAddress: custAddr,
            requerySupported: outcome === 'pending',
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'electricity',
            serviceTitle: 'Electricity Utility Payment',
            message: err?.message || 'Electricity vending failed.',
            reference: '',
            timestamp: new Date().toISOString(),
            networkOrProvider: discoLabel,
            recipientLabel: 'Meter Number',
            recipientValue: meter,
            planOrDescription: `${discoLabel} (${meterType.toUpperCase()})`,
            nominalAmount: safeAmount,
            netPayable: safeAmount,
          });
          await onTransactionComplete().catch(() => {});
        }
      }
    );
  };

  const handleReset = () => {
    setStep('form');
    setMeterNumber('');
    setVerifiedMeter(null);
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
            pendingPayable={step === 'review' ? safeAmount : 0}
          />
          <TelecomStepProgress step={step} allowReceiptStep={execResult?.outcome === 'successful'} />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Electricity</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Verify your prepaid or postpaid meter number and vend instant electricity tokens.
            </p>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Electricity Distribution Company (Disco)
              </label>
              <select
                value={activeDisco?.id || discoId}
                onChange={(e) => {
                  setDiscoId(e.target.value);
                  setVerifiedMeter(null);
                  setFormError(null);
                }}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none"
              >
                {discos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.state ? `(${d.state})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Meter Type
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['prepaid', 'postpaid'] as const).map((mType) => (
                  <button
                    key={mType}
                    type="button"
                    onClick={() => {
                      setMeterType(mType);
                      setVerifiedMeter(null);
                    }}
                    className={`min-h-[46px] px-3 py-2.5 rounded-xl border text-xs font-bold uppercase transition ${
                      meterType === mType
                        ? 'bg-blue-700 dark:bg-emerald-600 border-blue-700 dark:border-emerald-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {mType}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Meter Number + Verify */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Meter Number
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={meterNumber}
                onChange={(e) => {
                  setMeterNumber(e.target.value.trim());
                  setVerifiedMeter(null);
                  setFormError(null);
                }}
                placeholder="Enter electricity meter number"
                className="flex-1 min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white outline-none"
                required
              />
              <button
                type="button"
                onClick={handleVerifyMeter}
                disabled={verifying || meterNumber.trim().length < 8}
                className="min-h-[46px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{verifying ? 'Verifying...' : 'Verify Meter'}</span>
              </button>
            </div>

            {verifiedMeter && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Customer: {verifiedMeter.customerName}</div>
                  {verifiedMeter.address && <div className="opacity-85">{verifiedMeter.address}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Recharge Amount (Min {formatNaira(minDiscoAmount)})
            </label>
            <input
              type="number"
              min={minDiscoAmount}
              step={100}
              value={amount || ''}
              onChange={(e) => {
                setAmount(Number(e.target.value));
                setFormError(null);
              }}
              className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none tabular-nums"
              required
            />
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Total Payable:{' '}
              <strong className="text-lg font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                {formatNaira(safeAmount)}
              </strong>
            </div>
            <button
              type="submit"
              disabled={!verifiedMeter || safeAmount < minDiscoAmount}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>Review Electricity Payment</span>
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

// =============================================================================
// 8. EXAM CARDS SERVICE VIEW
// =============================================================================

interface ExamCardsServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  packages: ExamPackageItem[];
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const ExamCardsServiceView: React.FC<ExamCardsServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  packages,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [selectedExamId, setSelectedExamId] = useState<string>(packages[0]?.id || 'waec');
  const [quantity, setQuantity] = useState<number>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);

  const chosen = packages.find((p) => p.id === selectedExamId) || packages[0] || null;
  const totalCost = chosen ? Math.round(Number(chosen.price || 0) * quantity * 100) / 100 : 0;

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!chosen) {
      setFormError('No examination package selected.');
      return;
    }
    if (quantity < 1 || quantity > 10) {
      setFormError('Quantity must be between 1 and 10 PINs per order.');
      return;
    }

    setReviewDraft({
      serviceKey: 'exam',
      serviceTitle: 'Exam Scratch Card PINs',
      summarySubtitle: `${quantity}x ${chosen.name} Result Checker PIN(s)`,
      networkOrProvider: chosen.name,
      recipientLabel: 'Customer Account',
      recipientValue: customerEmail,
      nominalAmount: totalCost,
      netPayable: totalCost,
      confirmLabel: `Purchase PINs (${formatNaira(totalCost)})`,
      pinTitle: 'Authorize Exam PIN Purchase',
      pinDescription: `Enter your Transaction PIN to purchase ${quantity}x ${chosen.name} PIN card(s) for ${formatNaira(totalCost)}.`,
      items: [
        { label: 'Service', value: 'Examination Result Checker Cards' },
        { label: 'Examination Board', value: chosen.name, emphasize: true },
        { label: 'Unit Price', value: formatNaira(chosen.price) },
        { label: 'Quantity', value: `${quantity} PIN(s)` },
        { label: 'Total Wallet Charge', value: formatNaira(totalCost), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft || !chosen) return;
    const examSnap = chosen;
    const qtySnap = quantity;

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      totalCost,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'exam',
          serviceTitle: 'Exam Scratch Card PINs',
          message: `Generating ${qtySnap}x ${examSnap.name} PINs...`,
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: examSnap.name,
          recipientLabel: 'Customer Account',
          recipientValue: customerEmail,
          planOrDescription: `${qtySnap}x ${examSnap.name} PINs`,
          nominalAmount: totalCost,
          netPayable: totalCost,
        });

        try {
          const res = await api.purchaseExamPin({
            examId: examSnap.id,
            quantity: qtySnap,
            transaction_pin: verifiedPin,
          });
          const rawStatus = String(res.order?.status || 'successful').toLowerCase();
          const outcome = rawStatus === 'pending' ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.order?.reference || res.order?.provider_ref || res.order?.id || createIdempotencyKey('EXM');

          setExecResult({
            outcome,
            serviceKey: 'exam',
            serviceTitle: 'Exam Scratch Card PINs',
            message: res.message || `${qtySnap}x ${examSnap.name} PINs generated.`,
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: examSnap.name,
            recipientLabel: 'Customer Account',
            recipientValue: customerEmail,
            planOrDescription: res.order?.plan || `${qtySnap}x ${examSnap.name} PINs`,
            nominalAmount: totalCost,
            netPayable: totalCost,
            balanceAfter: res.newBalance,
            order: res.order,
            examPins: res.pins || [],
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'exam',
            serviceTitle: 'Exam Scratch Card PINs',
            message: err?.message || 'Exam card generation failed.',
            reference: '',
            timestamp: new Date().toISOString(),
            networkOrProvider: examSnap.name,
            recipientLabel: 'Customer Account',
            recipientValue: customerEmail,
            planOrDescription: `${qtySnap}x ${examSnap.name} PINs`,
            nominalAmount: totalCost,
            netPayable: totalCost,
          });
          await onTransactionComplete().catch(() => {});
        }
      }
    );
  };

  const handleReset = () => {
    setStep('form');
    setQuantity(1);
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
            pendingPayable={step === 'review' ? totalCost : 0}
          />
          <TelecomStepProgress step={step} allowReceiptStep={execResult?.outcome === 'successful'} />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Exam Cards</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Purchase WAEC, NECO, NABTEB, and JAMB result checker PINs and serial numbers.
            </p>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {packages.map((pkg) => {
              const active = chosen?.id === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => {
                    setSelectedExamId(pkg.id);
                    setFormError(null);
                  }}
                  className={`p-4 rounded-xl border text-left transition space-y-1.5 ${
                    active
                      ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-400'
                  }`}
                >
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">{pkg.name}</div>
                  <div className="text-base font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                    {formatNaira(pkg.price)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{pkg.description}</div>
                </button>
              );
            })}
          </div>

          <div className="max-w-xs space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Quantity (1 – 10)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none tabular-nums"
              required
            />
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Total Payable:{' '}
              <strong className="text-lg font-black font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                {formatNaira(totalCost)}
              </strong>
            </div>
            <button
              type="submit"
              disabled={!chosen}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>Review {quantity} Exam Card(s)</span>
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

// =============================================================================
// 9. BULK SMS SERVICE VIEW
// =============================================================================

interface BulkSmsServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  unitPrice?: number;
  defaultSenderId?: string;
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const BulkSmsServiceView: React.FC<BulkSmsServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  unitPrice = 3.5,
  defaultSenderId = 'HAMBAKTECH',
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [senderId, setSenderId] = useState(defaultSenderId);
  const [senderTouched, setSenderTouched] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);

  useEffect(() => {
    if (!senderTouched && defaultSenderId) {
      setSenderId(defaultSenderId);
    }
  }, [defaultSenderId, senderTouched]);

  const recipientList = useMemo(
    () =>
      recipients
        .split(/[\n,;]+/)
        .map((r) => r.trim())
        .filter((r) => r.replace(/\D+/g, '').length >= 10),
    [recipients]
  );
  const pages = Math.ceil(Math.max(1, message.length) / 160);
  const totalUnits = recipientList.length * pages;
  const totalCost = Math.round(totalUnits * unitPrice * 100) / 100;

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanSender = senderId.trim();
    if (!cleanSender || cleanSender.length > 11) {
      setFormError('Sender ID must be between 1 and 11 characters.');
      return;
    }
    if (recipientList.length === 0) {
      setFormError('Please enter at least one valid phone number recipient.');
      return;
    }
    if (!message.trim()) {
      setFormError('Please enter the SMS message text.');
      return;
    }

    setReviewDraft({
      serviceKey: 'bulksms',
      serviceTitle: 'Bulk SMS Dispatch',
      summarySubtitle: `${recipientList.length} recipient(s) • ${pages} SMS page(s) • ${formatNaira(unitPrice)}/unit`,
      networkOrProvider: cleanSender,
      recipientLabel: 'Recipients Count',
      recipientValue: `${recipientList.length} recipient(s)`,
      nominalAmount: totalCost,
      netPayable: totalCost,
      confirmLabel: `Send Bulk SMS (${formatNaira(totalCost)})`,
      pinTitle: 'Authorize Bulk SMS Broadcast',
      pinDescription: `Enter your Transaction PIN to send Bulk SMS from "${cleanSender}" to ${recipientList.length} recipient(s) (${totalUnits} units = ${formatNaira(totalCost)}).`,
      items: [
        { label: 'Service', value: 'Bulk SMS Broadcast' },
        { label: 'Sender ID', value: cleanSender, emphasize: true },
        { label: 'Recipients', value: `${recipientList.length} phone number(s)` },
        { label: 'Message Length', value: `${message.length} chars (${pages} page${pages > 1 ? 's' : ''})` },
        { label: 'Billable Units', value: `${totalUnits} units @ ${formatNaira(unitPrice)}/unit` },
        { label: 'Total Wallet Charge', value: formatNaira(totalCost), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmSend = () => {
    if (!reviewDraft) return;
    const cleanSender = senderId.trim();
    const recipsCsv = recipientList.join(',');
    const msgSnapshot = message.trim();

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      totalCost,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'bulksms',
          serviceTitle: 'Bulk SMS Dispatch',
          message: `Dispatching SMS to ${recipientList.length} recipient(s)...`,
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: cleanSender,
          recipientLabel: 'Recipients',
          recipientValue: `${recipientList.length} recipient(s)`,
          planOrDescription: `Bulk SMS (${totalUnits} units)`,
          nominalAmount: totalCost,
          netPayable: totalCost,
        });

        try {
          const res = await api.sendBulkSms({
            senderId: cleanSender,
            recipients: recipsCsv,
            message: msgSnapshot,
            transaction_pin: verifiedPin,
          });
          const rawStatus = String(res.order?.status || 'successful').toLowerCase();
          const outcome = rawStatus === 'pending' ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.order?.reference || res.messageId || res.order?.id || createIdempotencyKey('SMS');

          setExecResult({
            outcome,
            serviceKey: 'bulksms',
            serviceTitle: 'Bulk SMS Dispatch',
            message: res.message || 'Bulk SMS campaign dispatched.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: cleanSender,
            recipientLabel: 'Recipients',
            recipientValue: `${res.recipientCount ?? recipientList.length} recipient(s)`,
            planOrDescription: res.order?.plan || `Bulk SMS (${totalUnits} units)`,
            nominalAmount: totalCost,
            netPayable: totalCost,
            balanceAfter: res.newBalance,
            order: res.order,
            smsDetails: {
              senderId: cleanSender,
              pages: res.pages ?? pages,
              recipientCount: res.recipientCount ?? recipientList.length,
            },
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'bulksms',
            serviceTitle: 'Bulk SMS Dispatch',
            message: err?.message || 'Bulk SMS dispatch failed.',
            reference: '',
            timestamp: new Date().toISOString(),
            networkOrProvider: cleanSender,
            recipientLabel: 'Recipients',
            recipientValue: `${recipientList.length} recipient(s)`,
            planOrDescription: `Bulk SMS (${totalUnits} units)`,
            nominalAmount: totalCost,
            netPayable: totalCost,
          });
          await onTransactionComplete().catch(() => {});
        }
      }
    );
  };

  const handleReset = () => {
    setStep('form');
    setRecipients('');
    setMessage('');
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
            pendingPayable={step === 'review' ? totalCost : 0}
          />
          <TelecomStepProgress step={step} allowReceiptStep={execResult?.outcome === 'successful'} />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Bulk SMS</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Compose and broadcast SMS messages with custom Sender ID at {formatNaira(unitPrice)} per 160-character page unit.
            </p>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-2 max-w-sm">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Sender ID (Max 11 characters)
            </label>
            <input
              type="text"
              maxLength={11}
              value={senderId}
              onChange={(e) => {
                setSenderTouched(true);
                setSenderId(e.target.value);
              }}
              placeholder={`e.g. ${defaultSenderId}`}
              className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white outline-none"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Recipient Phone Numbers (comma, semicolon, or line separated)
              </label>
              <span className="font-mono font-bold text-blue-700 dark:text-emerald-400 tabular-nums">
                {recipientList.length} valid recipient(s)
              </span>
            </div>
            <textarea
              rows={3}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="08031234567, 08021234567"
              className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white outline-none"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-700 dark:text-slate-300">SMS Message</label>
              <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {message.length} chars &bull; {pages} page(s)
              </span>
            </div>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your SMS broadcast message here..."
              className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none"
              required
            />
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              {totalUnits} unit(s) &times; {formatNaira(unitPrice)} ={' '}
              <strong className="text-lg font-black font-mono text-blue-700 dark:text-emerald-400">
                {formatNaira(totalCost)}
              </strong>
            </div>
            <button
              type="submit"
              disabled={recipientList.length === 0 || !message.trim()}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>Review Bulk SMS Campaign</span>
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
          onConfirm={handleConfirmSend}
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
