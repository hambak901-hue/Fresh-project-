/**
 * @file PinVendingViews.tsx
 * Dedicated views for:
 * - Airtime PINs (Printable recharge cards)
 * - Data PINs (Printable data e-PIN cards)
 * Preserves live stock, denomination/plan selection, max_quantity caps, business card header name,
 * idempotency keys, voucher loading on completion/requery, and 4-step workflow.
 */

import React, { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { AirtimePinDenomination, DataPinDenomination } from '../../../types';
import {
  CarrierCode,
  CARRIERS,
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
import { AlertCircle, ArrowRight, CreditCard, Printer } from 'lucide-react';

interface AirtimePinServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  denominations: AirtimePinDenomination[];
  catalogueStatus: string;
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const AirtimePinServiceView: React.FC<AirtimePinServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  denominations,
  catalogueStatus,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [network, setNetwork] = useState<CarrierCode>('MTN');
  const [selectedId, setSelectedId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [businessName, setBusinessName] = useState<string>(customerName || 'HAMBAKTECH');
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);
  const [requerying, setRequerying] = useState<boolean>(false);

  const networkDenoms = useMemo(
    () => denominations.filter((d) => d.network === network),
    [denominations, network]
  );

  const chosen = useMemo(() => {
    return (
      networkDenoms.find((d) => d.id === selectedId) ||
      networkDenoms.find((d) => d.in_stock) ||
      networkDenoms[0] ||
      null
    );
  }, [networkDenoms, selectedId]);

  const maxAllowed = chosen
    ? Math.max(1, Math.min(chosen.max_quantity || 50, chosen.available_stock || 0))
    : 1;
  const unitPrice = chosen ? Number(chosen.selling_price ?? chosen.price ?? 0) : 0;
  const totalCost = Math.round(unitPrice * quantity * 100) / 100;

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!chosen) {
      setFormError(`No Airtime PIN denominations configured for ${network}.`);
      return;
    }
    if (!chosen.in_stock || chosen.available_stock <= 0) {
      setFormError(`${network} ${formatNaira(chosen.denomination)} Airtime PINs are currently out of stock.`);
      return;
    }
    if (quantity < 1 || quantity > maxAllowed) {
      setFormError(`Quantity must be between 1 and ${maxAllowed} cards.`);
      return;
    }

    const cleanBiz = businessName.trim() || 'HAMBAKTECH';

    setReviewDraft({
      serviceKey: 'airtime_pin',
      serviceTitle: 'Airtime PIN Generation',
      summarySubtitle: `${quantity}x ${network} ${formatNaira(chosen.denomination)} Recharge e-PIN(s)`,
      networkOrProvider: network,
      recipientLabel: 'Printed Card Name',
      recipientValue: cleanBiz,
      nominalAmount: chosen.denomination * quantity,
      netPayable: totalCost,
      confirmLabel: `Generate PINs (${formatNaira(totalCost)})`,
      pinTitle: 'Authorize Airtime PIN Generation',
      pinDescription: `Enter your Transaction PIN to purchase ${quantity}x ${network} ${formatNaira(chosen.denomination)} Recharge PIN card(s) for ${formatNaira(totalCost)}.`,
      items: [
        { label: 'Service', value: 'Airtime Recharge PIN Cards' },
        { label: 'Network', value: network },
        { label: 'Card Denomination', value: formatNaira(chosen.denomination) },
        { label: 'Unit Selling Price', value: formatNaira(unitPrice) },
        { label: 'Quantity', value: `${quantity} card(s)` },
        { label: 'Card Header Name', value: cleanBiz },
        { label: 'Total Wallet Charge', value: formatNaira(totalCost), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft || !chosen) return;
    const snap = chosen;
    const cleanBiz = reviewDraft.recipientValue;
    const idempotencyKey = createIdempotencyKey('APIN');

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      totalCost,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'airtime_pin',
          serviceTitle: 'Airtime PIN Generation',
          message: 'Generating recharge card PINs and serial numbers...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: snap.network,
          recipientLabel: 'Printed Card Name',
          recipientValue: cleanBiz,
          planOrDescription: `${quantity}x ${snap.network} ${formatNaira(snap.denomination)} Airtime PINs`,
          nominalAmount: snap.denomination * quantity,
          netPayable: totalCost,
        });

        try {
          const res = await api.purchaseAirtimePin(
            {
              denominationId: snap.id,
              network: snap.network,
              denomination: snap.denomination,
              quantity,
              businessName: cleanBiz,
              card_name: cleanBiz,
              transaction_pin: verifiedPin || '',
              idempotency_key: idempotencyKey,
            },
            idempotencyKey
          );

          const isPending = res.status === 'pending' || Boolean(res.incomplete_vouchers);
          const outcome = isPending ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.reference || res.order?.reference || res.order?.provider_ref || res.order?.id || idempotencyKey;

          setExecResult({
            outcome,
            serviceKey: 'airtime_pin',
            serviceTitle: 'Airtime PIN Generation',
            message: res.message || 'Recharge PINs generated.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: snap.network,
            recipientLabel: 'Printed Card Name',
            recipientValue: cleanBiz,
            planOrDescription: `${quantity}x ${snap.network} ${formatNaira(snap.denomination)} Airtime PINs`,
            nominalAmount: snap.denomination * quantity,
            netPayable: res.order?.amount ?? totalCost,
            balanceAfter: res.balance_after ?? res.newBalance,
            order: res.order,
            vouchers: res.vouchers || res.pins || [],
            requerySupported: outcome === 'pending',
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'airtime_pin',
            serviceTitle: 'Airtime PIN Generation',
            message: err?.message || 'Airtime PIN generation failed.',
            reference: idempotencyKey,
            timestamp: new Date().toISOString(),
            networkOrProvider: snap.network,
            recipientLabel: 'Printed Card Name',
            recipientValue: cleanBiz,
            planOrDescription: `${quantity}x ${snap.network} ${formatNaira(snap.denomination)} Airtime PINs`,
            nominalAmount: snap.denomination * quantity,
            netPayable: totalCost,
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
      const loadedVouchers = res.vouchers || res.order?.vouchers || [];
      if (updatedStatus === 'successful' || loadedVouchers.length > 0 || updatedStatus === 'failed') {
        setExecResult((prev) =>
          prev
            ? {
                ...prev,
                outcome: updatedStatus === 'failed' ? 'failed' : 'successful',
                message:
                  updatedStatus === 'failed'
                    ? 'Airtime PIN order failed.'
                    : `Verified ${loadedVouchers.length} delivered recharge PIN card(s).`,
                vouchers: loadedVouchers.length > 0 ? loadedVouchers : prev.vouchers,
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
          <TelecomStepProgress
            step={step}
            allowReceiptStep={execResult?.outcome === 'successful'}
          />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Airtime PINs</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {catalogueStatus || 'Generate printable recharge card PINs and serial numbers from live stock.'}
            </p>
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
                    setSelectedId('');
                    setQuantity(1);
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

          {/* Denomination */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Recharge Card Denomination
            </label>
            {networkDenoms.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
                No Airtime PIN denominations currently available for {network}.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {networkDenoms.map((den) => {
                  const active = chosen?.id === den.id;
                  const outOfStock = !den.in_stock || den.available_stock <= 0;
                  return (
                    <button
                      key={den.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => {
                        setSelectedId(den.id);
                        setQuantity(1);
                        setFormError(null);
                      }}
                      className={`p-4 rounded-xl border text-left transition space-y-1 ${
                        outOfStock
                          ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          : active
                          ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base font-black font-mono text-slate-900 dark:text-white tabular-nums">
                          {formatNaira(den.denomination)} Card
                        </span>
                        <span className="text-xs font-mono font-bold text-blue-700 dark:text-emerald-400 tabular-nums">
                          {formatNaira(den.selling_price ?? den.price)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {outOfStock ? 'Out of stock' : `Stock available: ${den.available_stock}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Quantity (1 – {maxAllowed})
              </label>
              <input
                type="number"
                min={1}
                max={maxAllowed}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(maxAllowed, Number(e.target.value) || 1)))}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none tabular-nums"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Card Header / Business Name
              </label>
              <input
                type="text"
                maxLength={40}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. HAMBAKTECH"
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none"
                required
              />
            </div>
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
              disabled={!chosen || !chosen.in_stock || chosen.available_stock <= 0}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>Review {quantity} Recharge Card(s)</span>
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

interface DataPinServiceViewProps {
  account: CustomerAccountSnapshot;
  customerName: string;
  customerEmail: string;
  denominations: DataPinDenomination[];
  available: boolean;
  catalogueStatus: string;
  onAuthorizePin: (
    title: string,
    description: string,
    amount: number,
    action: (pin?: string) => Promise<void>
  ) => void;
  onTransactionComplete: () => Promise<void>;
  onOpenHistory: () => void;
}

export const DataPinServiceView: React.FC<DataPinServiceViewProps> = ({
  account,
  customerName,
  customerEmail,
  denominations,
  available,
  catalogueStatus,
  onAuthorizePin,
  onTransactionComplete,
  onOpenHistory,
}) => {
  const [step, setStep] = useState<WorkflowStep>('form');
  const [network, setNetwork] = useState<CarrierCode>('MTN');
  const [selectedId, setSelectedId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [businessName, setBusinessName] = useState<string>(customerName || 'HAMBAKTECH');
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [execResult, setExecResult] = useState<TransactionExecutionResult | null>(null);
  const [requerying, setRequerying] = useState<boolean>(false);

  const networkPlans = useMemo(
    () => denominations.filter((d) => d.network === network),
    [denominations, network]
  );

  const chosen = useMemo(
    () => networkPlans.find((d) => d.id === selectedId) || networkPlans[0] || null,
    [networkPlans, selectedId]
  );

  const maxAllowed = chosen
    ? Math.max(1, Math.min(chosen.max_quantity || 50, chosen.available_stock || 0))
    : 1;
  const unitPrice = chosen ? Number(chosen.selling_price ?? chosen.price ?? 0) : 0;
  const totalCost = Math.round(unitPrice * quantity * 100) / 100;

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!available || !chosen) {
      setFormError(catalogueStatus || 'No Data PIN plans are currently available for purchase.');
      return;
    }
    if (!chosen.in_stock || chosen.available_stock <= 0) {
      setFormError(`${network} ${chosen.size} Data PINs are currently out of stock.`);
      return;
    }
    if (quantity < 1 || quantity > maxAllowed) {
      setFormError(`Quantity must be between 1 and ${maxAllowed} cards.`);
      return;
    }

    const cleanBiz = businessName.trim() || 'HAMBAKTECH';

    setReviewDraft({
      serviceKey: 'data_pin',
      serviceTitle: 'Data PIN Generation',
      summarySubtitle: `${quantity}x ${network} ${chosen.size} Data e-PIN Card(s)`,
      networkOrProvider: network,
      recipientLabel: 'Printed Card Name',
      recipientValue: cleanBiz,
      nominalAmount: totalCost,
      netPayable: totalCost,
      confirmLabel: `Generate Data PINs (${formatNaira(totalCost)})`,
      pinTitle: 'Authorize Data PIN Generation',
      pinDescription: `Enter your Transaction PIN to generate ${quantity}x ${network} ${chosen.size} Data PIN card(s) for ${formatNaira(totalCost)}.`,
      items: [
        { label: 'Service', value: 'Printable Data e-PIN Cards' },
        { label: 'Network', value: network },
        { label: 'Data Bundle Size', value: `${chosen.size} (${chosen.plan_name || chosen.name || ''})` },
        { label: 'Unit Selling Price', value: formatNaira(unitPrice) },
        { label: 'Quantity', value: `${quantity} card(s)` },
        { label: 'Card Header Name', value: cleanBiz },
        { label: 'Total Wallet Charge', value: formatNaira(totalCost), tone: 'blue', emphasize: true },
      ],
    });
    setStep('review');
  };

  const handleConfirmPurchase = () => {
    if (!reviewDraft || !chosen) return;
    const snap = chosen;
    const cleanBiz = reviewDraft.recipientValue;
    const idempotencyKey = createIdempotencyKey('DPIN');

    onAuthorizePin(
      reviewDraft.pinTitle,
      reviewDraft.pinDescription,
      totalCost,
      async (verifiedPin?: string) => {
        setStep('result');
        setExecResult({
          outcome: 'processing',
          serviceKey: 'data_pin',
          serviceTitle: 'Data PIN Generation',
          message: 'Generating Data PIN vouchers...',
          reference: '',
          timestamp: new Date().toISOString(),
          networkOrProvider: snap.network,
          recipientLabel: 'Printed Card Name',
          recipientValue: cleanBiz,
          planOrDescription: `${quantity}x ${snap.network} ${snap.size} Data PINs`,
          nominalAmount: totalCost,
          netPayable: totalCost,
        });

        try {
          const res = await api.purchaseDataPin(
            {
              network: snap.network,
              planId: snap.id,
              quantity,
              businessName: cleanBiz,
              card_name: cleanBiz,
              transaction_pin: verifiedPin || '',
              idempotency_key: idempotencyKey,
            },
            idempotencyKey
          );

          const isPending = res.status === 'pending' || Boolean(res.incomplete_vouchers);
          const outcome = isPending ? 'pending' : res.success ? 'successful' : 'failed';
          const ref = res.reference || res.order?.reference || res.order?.provider_ref || res.order?.id || idempotencyKey;

          setExecResult({
            outcome,
            serviceKey: 'data_pin',
            serviceTitle: 'Data PIN Generation',
            message: res.message || 'Data PIN order processed.',
            reference: ref,
            timestamp: res.order?.created_at || new Date().toISOString(),
            networkOrProvider: snap.network,
            recipientLabel: 'Printed Card Name',
            recipientValue: cleanBiz,
            planOrDescription: `${quantity}x ${snap.network} ${snap.size} Data PINs`,
            nominalAmount: totalCost,
            netPayable: res.order?.amount ?? totalCost,
            balanceAfter: res.balance_after ?? res.newBalance,
            order: res.order,
            vouchers: res.vouchers || res.pins || [],
            requerySupported: outcome === 'pending',
          });
          await onTransactionComplete();
        } catch (err: any) {
          setExecResult({
            outcome: 'failed',
            serviceKey: 'data_pin',
            serviceTitle: 'Data PIN Generation',
            message: err?.message || 'Data PIN generation failed.',
            reference: idempotencyKey,
            timestamp: new Date().toISOString(),
            networkOrProvider: snap.network,
            recipientLabel: 'Printed Card Name',
            recipientValue: cleanBiz,
            planOrDescription: `${quantity}x ${snap.network} ${snap.size} Data PINs`,
            nominalAmount: totalCost,
            netPayable: totalCost,
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
      const loadedVouchers = res.vouchers || res.order?.vouchers || [];
      if (updatedStatus === 'successful' || loadedVouchers.length > 0 || updatedStatus === 'failed') {
        setExecResult((prev) =>
          prev
            ? {
                ...prev,
                outcome: updatedStatus === 'failed' ? 'failed' : 'successful',
                message:
                  updatedStatus === 'failed'
                    ? 'Data PIN order failed.'
                    : `Verified ${loadedVouchers.length} delivered Data PIN card(s).`,
                vouchers: loadedVouchers.length > 0 ? loadedVouchers : prev.vouchers,
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
          <TelecomStepProgress
            step={step}
            allowReceiptStep={execResult?.outcome === 'successful'}
          />
        </>
      )}

      {step === 'form' && (
        <form
          onSubmit={handleProceedToReview}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-700 dark:text-emerald-400" />
              <span>Data PINs</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {catalogueStatus || 'Purchase printable Data e-PIN cards with PINs and serial numbers.'}
            </p>
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
                    setSelectedId('');
                    setQuantity(1);
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

          {/* Data PIN Plans */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Data PIN Package
            </label>
            {!available || networkPlans.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
                {catalogueStatus || `No active Data PIN packages available for ${network}.`}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {networkPlans.map((plan) => {
                  const active = chosen?.id === plan.id;
                  const outOfStock = !plan.in_stock || plan.available_stock <= 0;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => {
                        setSelectedId(plan.id);
                        setQuantity(1);
                        setFormError(null);
                      }}
                      className={`p-4 rounded-xl border text-left transition space-y-1 ${
                        outOfStock
                          ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          : active
                          ? 'border-blue-700 dark:border-emerald-500 bg-blue-50/70 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base font-black text-slate-900 dark:text-white">
                          {plan.size}
                        </span>
                        <span className="text-xs font-mono font-bold text-blue-700 dark:text-emerald-400 tabular-nums">
                          {formatNaira(plan.selling_price ?? plan.price)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {plan.plan_name || plan.name} &bull;{' '}
                        {outOfStock ? 'Out of stock' : `Stock: ${plan.available_stock}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Quantity (1 – {maxAllowed})
              </label>
              <input
                type="number"
                min={1}
                max={maxAllowed}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(maxAllowed, Number(e.target.value) || 1)))}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none tabular-nums"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Card Header / Business Name
              </label>
              <input
                type="text"
                maxLength={40}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. HAMBAKTECH"
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none"
                required
              />
            </div>
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
              disabled={!available || !chosen || !chosen.in_stock || chosen.available_stock <= 0}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>Review {quantity} Data PIN(s)</span>
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
