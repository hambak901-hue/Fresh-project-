/**
 * @file RatesCalculator.tsx
 * Interactive NGN pricing estimator powered by live backend rates from CmsContext.
 * Supports Dual Light/Night styling and zero internal backend terminology.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { Calculator, ArrowRight, CheckCircle2 } from 'lucide-react';

interface RatesCalculatorProps {
  onActionClick?: (service: string) => void;
}

export const RatesCalculator: React.FC<RatesCalculatorProps> = ({ onActionClick }) => {
  const { rates } = useCms();
  const [selectedService, setSelectedService] = useState<'data' | 'verification' | 'airtime'>('data');

  const [network, setNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [dataSizeGb, setDataSizeGb] = useState<number>(2);
  const [verificationType, setVerificationType] = useState<'NIN_STANDARD' | 'NIN_PREMIUM' | 'BVN' | 'PHONE'>('NIN_STANDARD');
  const [airtimeAmount, setAirtimeAmount] = useState<number>(1000);

  const mtn1Gb = rates?.mtn_sme_1gb || 270;
  const airtel1Gb = rates?.airtel_1gb || 290;
  const glo1Gb = rates?.glo_1gb || 260;
  const nineMobile1Gb = rates?.nine_mobile_1gb || 250;
  const ninFee = rates?.nin_fee || 250;
  const bvnFee = rates?.bvn_fee || 350;
  const airtimeDiscountPercent = rates?.airtime_discount_percent || 2.5;

  const getRatePerGb = () => {
    switch (network) {
      case 'MTN':
        return mtn1Gb;
      case 'AIRTEL':
        return airtel1Gb;
      case 'GLO':
        return glo1Gb;
      case '9MOBILE':
        return nineMobile1Gb;
    }
  };

  const calculatedDataCost = getRatePerGb() * dataSizeGb;

  const getVerificationCost = () => {
    switch (verificationType) {
      case 'NIN_STANDARD':
        return ninFee;
      case 'NIN_PREMIUM':
        return ninFee + 250;
      case 'BVN':
        return bvnFee;
      case 'PHONE':
        return ninFee + 50;
    }
  };

  const airtimeDiscount = (airtimeAmount * airtimeDiscountPercent) / 100;
  const airtimeFinalCost = Math.max(0, airtimeAmount - airtimeDiscount);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
            <Calculator className="w-4 h-4" />
            <span>Naira Tariff Estimator</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            Live Service Rates Calculator
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Preview current Nigerian Naira (₦) rates for data bundles, verification checks, and airtime top-ups.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSelectedService('data')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedService === 'data'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Mobile Data
          </button>
          <button
            type="button"
            onClick={() => setSelectedService('verification')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedService === 'verification'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            NIN / BVN
          </button>
          <button
            type="button"
            onClick={() => setSelectedService('airtime')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedService === 'airtime'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Airtime VTU
          </button>
        </div>
      </div>

      {selectedService === 'data' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Select Mobile Network
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map((net) => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => setNetwork(net)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all border ${
                      network === net
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {net}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Select Data Volume ({dataSizeGb}GB)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 5, 10].map((gb) => (
                  <button
                    key={gb}
                    type="button"
                    onClick={() => setDataSizeGb(gb)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      dataSizeGb === gb
                        ? 'bg-blue-700 border-blue-700 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {gb}GB
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
              <span>30 Days Standard Validity &bull; Instant Portal Dispatch</span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-center">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Estimated Cost (NGN)
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              ₦{calculatedDataCost.toLocaleString('en-NG')}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Rate:{' '}
              <span className="text-blue-700 dark:text-amber-400 font-mono font-semibold">
                ₦{getRatePerGb()}/GB
              </span>{' '}
              on {network}
            </div>
            <button
              type="button"
              onClick={() => onActionClick && onActionClick('data')}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <span>Order on Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedService === 'verification' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Select Verification Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'NIN_STANDARD', label: 'NIN Standard Slip' },
                  { id: 'NIN_PREMIUM', label: 'NIN Premium Card Format' },
                  { id: 'BVN', label: 'BVN Verification Check' },
                  { id: 'PHONE', label: 'Phone-to-NIN Lookup' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVerificationType(item.id as any)}
                    className={`p-3 text-left rounded-xl text-xs font-semibold transition-all border ${
                      verificationType === item.id
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
              <span>Consent Required &bull; Downloadable Printable Layout</span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-center">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Standard Verification Fee
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              ₦{getVerificationCost().toLocaleString('en-NG')}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Processed securely through your Naira wallet
            </div>
            <button
              type="button"
              onClick={() => onActionClick && onActionClick('verification')}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <span>Access Verification Desk</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedService === 'airtime' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Recharge Amount (₦)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-xs">₦</span>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={airtimeAmount}
                  onChange={(e) => setAirtimeAmount(Math.max(100, Number(e.target.value)))}
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Quick Presets
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAirtimeAmount(amt)}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                      airtimeAmount === amt
                        ? 'bg-blue-700 border-blue-700 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    ₦{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
              <span>{airtimeDiscountPercent}% Discount Applied Automatically</span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-center">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Discounted Amount You Pay
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              ₦{airtimeFinalCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-blue-700 dark:text-amber-400 font-mono">
              You Save: ₦{airtimeDiscount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} (
              {airtimeDiscountPercent}% off)
            </div>
            <button
              type="button"
              onClick={() => onActionClick && onActionClick('airtime')}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <span>Recharge via Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
