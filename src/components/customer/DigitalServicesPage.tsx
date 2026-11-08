import React, { useState, useEffect } from 'react';
import { Tv, Zap, CheckCircle2, AlertCircle, Loader2, RefreshCw, Receipt, ShieldCheck, ArrowRight, Copy, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';
import { TransactionPinModal } from './TransactionPinModal';

interface DigitalServicesPageProps {
  user: User;
  onRefreshBalance: () => void;
}

export function DigitalServicesPage({ user, onRefreshBalance }: DigitalServicesPageProps) {
  const [activeTab, setActiveTab] = useState<'cable' | 'electricity'>('cable');

  // PIN Authorization Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState<'cable' | 'electricity'>('cable');

  // Cable TV state
  const [cablePackages, setCablePackages] = useState<Record<string, Array<{ id: string; name: string; price: number; channels: number }>>>({});
  const [selectedProvider, setSelectedProvider] = useState<'DSTV' | 'GOTV' | 'STARTIMES'>('DSTV');
  const [smartcardNumber, setSmartcardNumber] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [smartcardVerified, setSmartcardVerified] = useState<any | null>(null);
  const [verifyingSmartcard, setVerifyingSmartcard] = useState(false);
  const [submittingCable, setSubmittingCable] = useState(false);
  const [cableSuccess, setCableSuccess] = useState<string | null>(null);
  const [cableError, setCableError] = useState<string | null>(null);

  // Electricity state
  const [discos, setDiscos] = useState<Array<{ id: string; name: string; state: string; min: number }>>([]);
  const [selectedDisco, setSelectedDisco] = useState<string>('ikedc');
  const [meterNumber, setMeterNumber] = useState('');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [electricityAmount, setElectricityAmount] = useState<number>(2000);
  const [meterVerified, setMeterVerified] = useState<any | null>(null);
  const [verifyingMeter, setVerifyingMeter] = useState(false);
  const [submittingElectricity, setSubmittingElectricity] = useState(false);
  const [electricitySuccess, setElectricitySuccess] = useState<any | null>(null);
  const [electricityError, setElectricityError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    api.getCablePackages().then(res => {
      if (res?.packages) {
        setCablePackages(res.packages);
        if (res.packages.DSTV?.[0]) {
          setSelectedPackageId(res.packages.DSTV[0].id);
        }
      }
    }).catch(() => {});

    api.getElectricityDiscos().then(res => {
      if (res?.discos) {
        const mappedDiscos = res.discos.map(d => ({
          id: d.id,
          name: d.name,
          state: d.state || 'National',
          min: d.min ?? d.min_amount ?? 1000,
        }));
        setDiscos(mappedDiscos);
        if (mappedDiscos[0]) setSelectedDisco(mappedDiscos[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleProviderChange = (provider: 'DSTV' | 'GOTV' | 'STARTIMES') => {
    setSelectedProvider(provider);
    setSmartcardVerified(null);
    setCableSuccess(null);
    setCableError(null);
    const pkgs = cablePackages[provider];
    if (pkgs && pkgs.length > 0) {
      setSelectedPackageId(pkgs[0].id);
    }
  };

  const handleVerifySmartcard = async () => {
    if (!smartcardNumber || smartcardNumber.length < 8) {
      setCableError('Enter a valid Smartcard / IUC number (minimum 8 digits)');
      return;
    }
    setVerifyingSmartcard(true);
    setCableError(null);
    try {
      const res = await api.verifySmartcard(selectedProvider, smartcardNumber);
      setSmartcardVerified(res);
    } catch (err: any) {
      setCableError(err.message || 'Verification failed. Please check the smartcard number.');
    } finally {
      setVerifyingSmartcard(false);
    }
  };

  const promptCablePurchase = () => {
    const pkgs = cablePackages[selectedProvider] || [];
    const pkg = pkgs.find(p => p.id === selectedPackageId);
    if (!pkg) return;

    const pkgPrice = pkg?.price ?? 0;
    if (user.wallet_balance < pkgPrice) {
      setCableError(`Insufficient funds. Your balance is ₦${user.wallet_balance.toLocaleString()}, but ₦${pkgPrice.toLocaleString()} is required.`);
      return;
    }
    setPinAction('cable');
    setIsPinModalOpen(true);
  };

  const handlePurchaseCable = async () => {
    const pkgs = cablePackages[selectedProvider] || [];
    const pkg = pkgs.find(p => p.id === selectedPackageId);
    if (!pkg) return;

    setSubmittingCable(true);
    setCableError(null);
    setCableSuccess(null);
    try {
      const res = await api.purchaseCable({
        provider: selectedProvider,
        smartcardNumber,
        packageId: selectedPackageId,
      });
      setCableSuccess(res.message);
      onRefreshBalance();
    } catch (err: any) {
      setCableError(err.message || 'Cable renewal failed');
    } finally {
      setSubmittingCable(false);
    }
  };

  const handleVerifyMeter = async () => {
    if (!meterNumber || meterNumber.length < 8) {
      setElectricityError('Enter a valid Meter Number (minimum 8 digits)');
      return;
    }
    setVerifyingMeter(true);
    setElectricityError(null);
    try {
      const res = await api.verifyMeter(selectedDisco, meterNumber, meterType);
      setMeterVerified(res);
    } catch (err: any) {
      setElectricityError(err.message || 'Meter verification failed');
    } finally {
      setVerifyingMeter(false);
    }
  };

  const promptElectricityPurchase = () => {
    if (user.wallet_balance < electricityAmount) {
      setElectricityError(`Insufficient funds. Your balance is ₦${user.wallet_balance.toLocaleString()}, but ₦${electricityAmount.toLocaleString()} is required.`);
      return;
    }
    setPinAction('electricity');
    setIsPinModalOpen(true);
  };

  const handlePurchaseElectricity = async () => {
    setSubmittingElectricity(true);
    setElectricityError(null);
    setElectricitySuccess(null);
    try {
      const res = await api.purchaseElectricity({
        discoId: selectedDisco,
        meterNumber,
        meterType,
        amount: electricityAmount,
      });
      setElectricitySuccess(res);
      onRefreshBalance();
    } catch (err: any) {
      setElectricityError(err.message || 'Electricity recharge failed');
    } finally {
      setSubmittingElectricity(false);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const currentPackages = cablePackages[selectedProvider] || [];
  const currentSelectedPkg = currentPackages.find(p => p.id === selectedPackageId);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Zap className="w-3.5 h-3.5" />
              <span>Digital Utilities Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Digital Services & Utilities
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Instant Cable TV renewal and 20-digit prepaid electricity meter tokens powered by VTpass direct API gateway.
            </p>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-right sm:min-w-[180px]">
            <p className="text-xs text-slate-400">Available Balance</p>
            <p className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              ₦{user.wallet_balance.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('cable')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'cable'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Cable TV Renewal</span>
          </button>
          <button
            onClick={() => setActiveTab('electricity')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'electricity'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Electricity Bills</span>
          </button>
        </div>
      </div>

      {/* CABLE TV TAB */}
      {activeTab === 'cable' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Tv className="w-5 h-5 text-indigo-400" />
              <span>Select TV Provider</span>
            </h2>

            {/* Provider Cards */}
            <div className="grid grid-cols-3 gap-3">
              {(['DSTV', 'GOTV', 'STARTIMES'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  className={`p-4 rounded-xl border text-center font-bold text-sm transition-all ${
                    selectedProvider === p
                      ? 'border-indigo-500 bg-indigo-500/10 text-white ring-2 ring-indigo-500/30'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <p className="text-base">{p}</p>
                  <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                    {p === 'DSTV' ? 'MultiChoice DStv' : p === 'GOTV' ? 'MultiChoice GOtv' : 'StarTimes Digital'}
                  </p>
                </button>
              ))}
            </div>

            {/* Smartcard Input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Smartcard / IUC Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 1023456789"
                  value={smartcardNumber}
                  onChange={e => {
                    setSmartcardNumber(e.target.value.replace(/\D/g, ''));
                    setSmartcardVerified(null);
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleVerifySmartcard}
                  disabled={verifyingSmartcard || !smartcardNumber}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition"
                >
                  {verifyingSmartcard ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>Verify</span>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Turn on your decoder before subscription renewal to receive signal transmission instantly.
              </p>
            </div>

            {/* Verified Card Info */}
            {smartcardVerified && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-emerald-400">Smartcard Verified</p>
                  <p className="text-white font-medium">{smartcardVerified.customerName}</p>
                  <p className="text-slate-400 font-mono">Status: {smartcardVerified.status} • Renewal Due: {smartcardVerified.dueDate}</p>
                </div>
              </div>
            )}

            {/* Bouquet Packages */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Bouquet Package
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {currentPackages.map(pkg => (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition ${
                      selectedPackageId === pkg.id
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{pkg.name}</p>
                      <p className="text-xs text-slate-400">{pkg.channels} Channels • 30 Days Validity</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-indigo-400 tabular-nums">
                        ₦{pkg.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feedback messages */}
            {cableError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cableError}</span>
              </div>
            )}

            {cableSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{cableSuccess}</span>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="button"
              onClick={promptCablePurchase}
              disabled={submittingCable || !smartcardNumber || !selectedPackageId}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/20"
            >
              {submittingCable ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Activating Subscription...</span>
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  <span>Renew {selectedProvider} (₦{(currentSelectedPkg?.price ?? 0).toLocaleString()})</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Helper Sidebar */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Auto-Reconnection Guarantee</span>
              </h3>
              <ul className="text-xs text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                  <span>Decoder is credited within 60 seconds of successful transaction.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                  <span>Direct integration with MultiChoice Nigeria & StarTimes media servers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                  <span>If channels do not display, text <strong>RESET IUC</strong> to 30333 or reboot the decoder.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ELECTRICITY TAB */}
      {activeTab === 'electricity' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <span>Electricity Bill Payment</span>
            </h2>

            {/* Select Disco */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Distribution Company (DISCO)
              </label>
              <select
                value={selectedDisco}
                onChange={e => {
                  setSelectedDisco(e.target.value);
                  setMeterVerified(null);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {discos.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.state})
                  </option>
                ))}
              </select>
            </div>

            {/* Meter Type */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Meter Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['prepaid', 'postpaid'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMeterType(type)}
                    className={`p-3 rounded-xl border text-center font-semibold text-sm capitalize transition ${
                      meterType === type
                        ? 'border-amber-500 bg-amber-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {type} Meter
                  </button>
                ))}
              </div>
            </div>

            {/* Meter Number */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Meter Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 01011526738"
                  value={meterNumber}
                  onChange={e => {
                    setMeterNumber(e.target.value.replace(/\D/g, ''));
                    setMeterVerified(null);
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleVerifyMeter}
                  disabled={verifyingMeter || !meterNumber}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition"
                >
                  {verifyingMeter ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>Verify</span>
                </button>
              </div>
            </div>

            {/* Verified Meter Details */}
            {meterVerified && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-1 text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Meter Verified • {meterVerified.discoName}</span>
                </div>
                <p className="text-white font-medium">{meterVerified.customerName}</p>
                <p className="text-slate-400">{meterVerified.address}</p>
                <p className="text-slate-500 font-mono">Tariff: {meterVerified.tariffClass}</p>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Recharge Amount (₦)
              </label>
              <input
                type="number"
                min={1000}
                step={500}
                value={electricityAmount}
                onChange={e => setElectricityAmount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[1000, 2000, 3000, 5000, 10000, 20000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setElectricityAmount(amt)}
                    className="px-3 py-1 bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-300 rounded-lg transition font-mono"
                  >
                    ₦{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback */}
            {electricityError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{electricityError}</span>
              </div>
            )}

            {/* Token Result Box */}
            {electricitySuccess && (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Prepaid Electricity Token Generated
                  </span>
                  <span className="text-xs font-mono text-emerald-300">
                    Units: {electricitySuccess.units}
                  </span>
                </div>
                <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
                  <p className="text-xl sm:text-2xl font-bold font-mono tracking-widest text-emerald-300">
                    {electricitySuccess.token}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopyToken(electricitySuccess.token)}
                    className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg transition"
                    title="Copy Token"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Punch this 20-digit token into your Customer Interface Unit (CIU) keypad and press enter.
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={promptElectricityPurchase}
              disabled={submittingElectricity || !meterNumber || electricityAmount < 1000}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-amber-600/20"
            >
              {submittingElectricity ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispensing Token...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Purchase Units (₦{electricityAmount.toLocaleString()})</span>
                </>
              )}
            </button>
          </div>

          {/* Helper Sidebar */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>Prepaid Token Instructions</span>
              </h3>
              <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                <li>Input your 11-digit meter number and verify recipient address.</li>
                <li>Ensure wallet has sufficient balance for purchase amount.</li>
                <li>Copy 20-digit generated token directly to your meter UI box.</li>
                <li>Your electricity unit credits immediately.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Transaction PIN Authorization Modal */}
      <TransactionPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          setIsPinModalOpen(false);
          if (pinAction === 'cable') {
            handlePurchaseCable();
          } else {
            handlePurchaseElectricity();
          }
        }}
        title={pinAction === 'cable' ? 'Authorize Cable Subscription' : 'Authorize Electricity Purchase'}
        description={`Enter your 4-digit security PIN to authorize debit of ₦${(pinAction === 'cable' ? (currentSelectedPkg?.price ?? 0) : electricityAmount).toLocaleString()} from your wallet.`}
        amount={pinAction === 'cable' ? (currentSelectedPkg?.price ?? 0) : electricityAmount}
      />
    </div>
  );
}
