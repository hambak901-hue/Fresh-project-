/**
 * @file RatesCalculator.tsx
 * Live pricing & fee calculator fetching realtime rates from backend settings.
 * Supports NIN/BVN identity fees, MTN/Airtel/Glo SME data bundles, and VTU airtime discounts.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { Calculator, Shield, Wifi, Smartphone, ArrowRight, CheckCircle2 } from 'lucide-react';

interface RatesCalculatorProps {
  onActionClick?: (service: string) => void;
}

export const RatesCalculator: React.FC<RatesCalculatorProps> = ({ onActionClick }) => {
  const { rates } = useCms();
  const [selectedService, setSelectedService] = useState<'data' | 'verification' | 'airtime'>('data');

  // Data bundle state
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [dataSizeGb, setDataSizeGb] = useState<number>(2);

  // Verification state
  const [verificationType, setVerificationType] = useState<'NIN_STANDARD' | 'NIN_PREMIUM' | 'BVN' | 'PHONE'>('NIN_STANDARD');

  // Airtime state
  const [airtimeAmount, setAirtimeAmount] = useState<number>(1000);

  // Base rates from backend or fallback
  const mtn1Gb = rates?.mtn_sme_1gb || 270;
  const airtel1Gb = rates?.airtel_1gb || 290;
  const glo1Gb = rates?.glo_1gb || 260;
  const nineMobile1Gb = rates?.nine_mobile_1gb || 250;
  const ninFee = rates?.nin_fee || 250;
  const bvnFee = rates?.bvn_fee || 350;
  const airtimeDiscountPercent = rates?.airtime_discount_percent || 2.5;

  // Compute Data cost
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

  // Compute Verification cost
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

  // Compute Airtime cost
  const airtimeDiscount = (airtimeAmount * airtimeDiscountPercent) / 100;
  const airtimeFinalCost = Math.max(0, airtimeAmount - airtimeDiscount);

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Calculator className="w-4 h-4" />
            <span>Real-Time Wholesale Fee Engine</span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">Live Pricing Calculator</h3>
          <p className="text-xs text-slate-400">
            Calculated transparently against real-time wholesale network tariffs and verification fees.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setSelectedService('data')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedService === 'data' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SME Data
          </button>
          <button
            onClick={() => setSelectedService('verification')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedService === 'verification' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            NIN / BVN
          </button>
          <button
            onClick={() => setSelectedService('airtime')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedService === 'airtime' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Airtime VTU
          </button>
        </div>
      </div>

      {/* Content based on selected tab */}
      {selectedService === 'data' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Select Carrier Network</label>
              <div className="grid grid-cols-4 gap-2">
                {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => setNetwork(net)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all border ${
                      network === net
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {net}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Select Package Volume ({dataSizeGb}GB)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 5, 10].map(gb => (
                  <button
                    key={gb}
                    type="button"
                    onClick={() => setDataSizeGb(gb)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      dataSizeGb === gb
                        ? 'bg-slate-800 border-emerald-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {gb}GB
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>30 Days Validity &bull; Direct Carrier Pipeline &bull; Sub-3s Delivery</span>
            </div>
          </div>

          {/* Pricing Result Card */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-6 space-y-4 text-center">
            <span className="text-[11px] font-semibold text-slate-400">Total Calculated Cost</span>
            <div className="text-3xl font-extrabold text-white font-mono">
              ₦{calculatedDataCost.toLocaleString('en-NG')}
            </div>
            <div className="text-xs text-slate-400">
              Rate: <span className="text-emerald-400 font-mono font-semibold">₦{getRatePerGb()}/GB</span> on {network} SME
            </div>
            <button
              onClick={() => onActionClick && onActionClick('data')}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <span>Vending Available on Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedService === 'verification' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Select Verification Service</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'NIN_STANDARD', label: 'NIN Standard Slip' },
                  { id: 'NIN_PREMIUM', label: 'NIN Premium Plastic Card' },
                  { id: 'BVN', label: 'BVN Central Bank Biometrics' },
                  { id: 'PHONE', label: 'Phone Number to NIN Query' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVerificationType(item.id as any)}
                    className={`p-3 text-left rounded-xl text-xs font-semibold transition-all border ${
                      verificationType === item.id
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Includes Official NIMC Stamp, QR Code & Sovereign Biometrics</span>
            </div>
          </div>

          {/* Pricing Result Card */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-6 space-y-4 text-center">
            <span className="text-[11px] font-semibold text-slate-400">Official Verification Fee</span>
            <div className="text-3xl font-extrabold text-white font-mono">
              ₦{getVerificationCost().toLocaleString('en-NG')}
            </div>
            <div className="text-xs text-slate-400">
              Infrastructure: <span className="text-emerald-400 font-semibold">HambakTech Sovereign Pipeline</span>
            </div>
            <button
              onClick={() => onActionClick && onActionClick('verification')}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <span>Instant Verification Available</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedService === 'airtime' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Recharge Amount (₦)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-xs">₦</span>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={airtimeAmount}
                  onChange={e => setAirtimeAmount(Math.max(100, Number(e.target.value)))}
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Quick Presets</label>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2000, 5000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAirtimeAmount(amt)}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                      airtimeAmount === amt
                        ? 'bg-slate-800 border-emerald-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    ₦{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Instant {airtimeDiscountPercent}% Cashback Discount on All Nigerian Networks</span>
            </div>
          </div>

          {/* Pricing Result Card */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-6 space-y-4 text-center">
            <span className="text-[11px] font-semibold text-slate-400">Discounted Amount You Pay</span>
            <div className="text-3xl font-extrabold text-white font-mono">
              ₦{airtimeFinalCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-emerald-400 font-mono">
              You Save: ₦{airtimeDiscount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} ({airtimeDiscountPercent}% off)
            </div>
            <button
              onClick={() => onActionClick && onActionClick('airtime')}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
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
