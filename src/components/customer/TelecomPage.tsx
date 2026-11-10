/**
 * @file TelecomPage.tsx
 * Sovereign Telecommunications Hub (Phase 6 Complete).
 * Integrates Ulamadata Primary Provider with full-spectrum telecom modules:
 * 1. Airtime Top-Up (MTN, Airtel, Glo, 9mobile)
 * 2. Dynamic Data Bundles (SME, Corporate, Gifting, Direct)
 * 3. Airtime PIN Generator (Printable recharge cards)
 * 4. Data PIN Generator (Printable data cards)
 * 5. Airtime Swap (Airtime to Cash)
 * 6. Cable TV (DSTV, GOtv, Startimes, Showmax with Smartcard Validation)
 * 7. Electricity Bill Payment (Prepaid/Postpaid with 20-digit STS Token)
 * 8. Exam Scratch Cards (WAEC, NECO, NABTEB, JAMB)
 * 9. Bulk SMS Portal (Sender ID, multi-recipient, character counter)
 * 10. Live Transaction Status Query & Receipt Generator
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  TelecomOrder,
  TelecomPlanItem,
  AirtimePinDenomination,
  DataPinDenomination,
  CablePackageItem,
  ElectricityDiscoItem,
  ExamPackageItem,
  AirtimeSwapConfigItem,
} from '../../types';
import {
  Smartphone,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Tv,
  Lightbulb,
  GraduationCap,
  MessageSquare,
  Repeat,
  Printer,
  CreditCard,
  Search,
  Copy,
  Receipt,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { TransactionPinModal } from './TransactionPinModal';

type TelecomTab =
  | 'airtime'
  | 'data'
  | 'airtime_pin'
  | 'data_pin'
  | 'airtime_swap'
  | 'cable'
  | 'electricity'
  | 'exam'
  | 'bulksms'
  | 'history';

export const TelecomPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TelecomTab>('airtime');

  // Provider info & wallet
  const [activeProvider, setActiveProvider] = useState<string>('ulamadata');
  const [providerBalance, setProviderBalance] = useState<number>(0);

  // General Loading & alerts
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // PIN Authorization State
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pendingPinAction, setPendingPinAction] = useState<(() => Promise<void>) | null>(null);
  const [pinModalTitle, setPinModalTitle] = useState<string>('Authorize Purchase');
  const [pinModalDesc, setPinModalDesc] = useState<string>('');
  const [pinModalAmount, setPinModalAmount] = useState<number | undefined>(undefined);

  // 1. Airtime State
  const [airtimeNetwork, setAirtimeNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [airtimePhone, setAirtimePhone] = useState('');
  const [airtimeAmount, setAirtimeAmount] = useState<number>(1000);

  // 2. Data State
  const [dataPlans, setDataPlans] = useState<TelecomPlanItem[]>([]);
  const [dataNetwork, setDataNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [dataTypeFilter, setDataTypeFilter] = useState<'all' | 'SME' | 'Corporate' | 'Gifting' | 'Direct'>('all');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [dataPhone, setDataPhone] = useState('');

  // 3. Airtime PIN State
  const [airtimePinDenoms, setAirtimePinDenoms] = useState<AirtimePinDenomination[]>([]);
  const [pinNetwork, setPinNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [pinDenom, setPinDenom] = useState<number>(100);
  const [pinQuantity, setPinQuantity] = useState<number>(1);
  const [pinBusinessName, setPinBusinessName] = useState<string>('HambakTech Enterprise');
  const [generatedAirtimePins, setGeneratedAirtimePins] = useState<any[]>([]);

  // 4. Data PIN State
  const [dataPinDenoms, setDataPinDenoms] = useState<DataPinDenomination[]>([]);
  const [dataPinNetwork, setDataPinNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [selectedDataPinId, setSelectedDataPinId] = useState<string>('');
  const [dataPinQuantity, setDataPinQuantity] = useState<number>(1);
  const [dataPinBusinessName, setDataPinBusinessName] = useState<string>('HambakTech Enterprise');
  const [generatedDataPins, setGeneratedDataPins] = useState<any[]>([]);

  // 5. Airtime Swap State
  const [swapConfigs, setSwapConfigs] = useState<AirtimeSwapConfigItem[]>([]);
  const [swapNetwork, setSwapNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [swapSenderPhone, setSwapSenderPhone] = useState<string>('');
  const [swapAmount, setSwapAmount] = useState<number>(2000);
  const [swapBankName, setSwapBankName] = useState<string>('Wallet Direct Credit');
  const [swapAccountNumber, setSwapAccountNumber] = useState<string>('');
  const [swapAccountName, setSwapAccountName] = useState<string>('');
  const [swapResult, setSwapResult] = useState<any | null>(null);

  // 6. Cable TV State
  const [cablePackages, setCablePackages] = useState<Record<string, CablePackageItem[]>>({});
  const [cableProvider, setCableProvider] = useState<'DSTV' | 'GOTV' | 'STARTIMES' | 'SHOWMAX'>('GOTV');
  const [smartcardNumber, setSmartcardNumber] = useState<string>('');
  const [selectedCablePackageId, setSelectedCablePackageId] = useState<string>('');
  const [smartcardCustomer, setSmartcardCustomer] = useState<any | null>(null);
  const [validatingSmartcard, setValidatingSmartcard] = useState(false);

  // 7. Electricity State
  const [discos, setDiscos] = useState<ElectricityDiscoItem[]>([]);
  const [selectedDiscoId, setSelectedDiscoId] = useState<string>('ikedc');
  const [meterNumber, setMeterNumber] = useState<string>('');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [meterAmount, setMeterAmount] = useState<number>(2000);
  const [meterCustomer, setMeterCustomer] = useState<any | null>(null);
  const [validatingMeter, setValidatingMeter] = useState(false);
  const [electricityReceipt, setElectricityReceipt] = useState<any | null>(null);

  // 8. Exam Scratch Cards State
  const [examPackages, setExamPackages] = useState<ExamPackageItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('waec');
  const [examQuantity, setExamQuantity] = useState<number>(1);
  const [generatedExamPins, setGeneratedExamPins] = useState<any[]>([]);

  // 9. Bulk SMS State
  const [smsSenderId, setSmsSenderId] = useState<string>('HambakTech');
  const [smsRecipients, setSmsRecipients] = useState<string>('');
  const [smsMessage, setSmsMessage] = useState<string>('');

  // 10. History & Verification State
  const [orders, setOrders] = useState<TelecomOrder[]>([]);
  const [historyFilterService, setHistoryFilterService] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [selectedOrderReceipt, setSelectedOrderReceipt] = useState<TelecomOrder | null>(null);
  const [queryRef, setQueryRef] = useState<string>('');
  const [queryStatusResult, setQueryStatusResult] = useState<any | null>(null);

  // Load Initial Data
  useEffect(() => {
    loadProviderStatus();
    loadDataPlans();
    loadAirtimePins();
    loadDataPins();
    loadSwapConfig();
    loadCablePackages();
    loadDiscos();
    loadExamPackages();
    loadOrders();
  }, []);

  const loadProviderStatus = async () => {
    try {
      const res = await api.getTelecomProviders();
      setActiveProvider(res.activeProvider || 'ulamadata');
      setProviderBalance(res.wallet_balance || 0);
    } catch {}
  };

  const loadDataPlans = async () => {
    try {
      const res = await api.getTelecomPlans();
      setDataPlans(res.plans || []);
      const first = (res.plans || []).find(p => p.network === 'MTN');
      if (first) setSelectedPlanId(first.id);
    } catch {}
  };

  const loadAirtimePins = async () => {
    try {
      const res = await api.getAirtimePinDenominations();
      setAirtimePinDenoms(res.denominations || []);
    } catch {}
  };

  const loadDataPins = async () => {
    try {
      const res = await api.getDataPinDenominations();
      setDataPinDenoms(res.denominations || []);
      if (res.denominations?.length) {
        setSelectedDataPinId(res.denominations[0].id);
      }
    } catch {}
  };

  const loadSwapConfig = async () => {
    try {
      const res = await api.getAirtimeSwapConfig();
      setSwapConfigs(res.configs || []);
    } catch {}
  };

  const loadCablePackages = async () => {
    try {
      const res = await api.getCablePackages();
      setCablePackages(res.packages || {});
      const firstGroup = res.packages?.['GOTV'] || [];
      if (firstGroup.length) setSelectedCablePackageId(firstGroup[0].id);
    } catch {}
  };

  const loadDiscos = async () => {
    try {
      const res = await api.getElectricityDiscos();
      setDiscos(res.discos || []);
      if (res.discos?.length) setSelectedDiscoId(res.discos[0].id);
    } catch {}
  };

  const loadExamPackages = async () => {
    try {
      const res = await api.getExamPackages();
      setExamPackages(res.packages || []);
      if (res.packages?.length) setSelectedExamId(res.packages[0].id);
    } catch {}
  };

  const loadOrders = async () => {
    try {
      const res = await api.getTelecomHistory();
      setOrders(res.orders || []);
    } catch {}
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  // 1. Purchase Airtime
  const handlePurchaseAirtime = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const cleanPhone = airtimePhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 11) {
      setError('Please provide a valid 11-digit phone number.');
      return;
    }
    if (airtimeAmount < 50) {
      setError('Minimum airtime recharge is ₦50.');
      return;
    }

    setPinModalTitle('Authorize Airtime Top-Up');
    setPinModalDesc(`Enter your 4-digit security PIN to authorize ₦${airtimeAmount.toLocaleString()} recharge on ${airtimeNetwork} for ${cleanPhone}.`);
    setPinModalAmount(airtimeAmount);
    setPendingPinAction(() => async () => {
      try {
        setLoading(true);
        const res = await api.purchaseAirtime(airtimeNetwork, cleanPhone, airtimeAmount);
        if (res.success) {
          setSuccessMsg(res.message);
          setAirtimePhone('');
          await refreshUser();
          await loadOrders();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to recharge airtime.');
      } finally {
        setLoading(false);
      }
    });
    setIsPinModalOpen(true);
  };

  // 2. Purchase Data
  const handlePurchaseData = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const cleanPhone = dataPhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 11) {
      setError('Please provide a valid 11-digit recipient phone number.');
      return;
    }
    if (!selectedPlanId) {
      setError('Please select a data bundle plan.');
      return;
    }

    const currentPlan = dataPlans.find(p => p.id === selectedPlanId);
    const price = currentPlan?.price || 0;

    setPinModalTitle('Authorize Data Bundle');
    setPinModalDesc(`Enter your 4-digit security PIN to authorize ${currentPlan?.name || 'data'} for ${cleanPhone}.`);
    setPinModalAmount(price);
    setPendingPinAction(() => async () => {
      try {
        setLoading(true);
        const res = await api.purchaseData(selectedPlanId, cleanPhone);
        if (res.success) {
          setSuccessMsg(res.message);
          setDataPhone('');
          await refreshUser();
          await loadOrders();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to dispatch data. Check wallet balance.');
      } finally {
        setLoading(false);
      }
    });
    setIsPinModalOpen(true);
  };

  // 3. Purchase Airtime PINs
  const handlePurchaseAirtimePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGeneratedAirtimePins([]);

    try {
      setLoading(true);
      const res = await api.purchaseAirtimePin({
        network: pinNetwork,
        denomination: pinDenom,
        quantity: pinQuantity,
        businessName: pinBusinessName,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setGeneratedAirtimePins(res.pins || []);
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Airtime PIN generation failed.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Purchase Data PINs
  const handlePurchaseDataPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGeneratedDataPins([]);

    try {
      setLoading(true);
      const res = await api.purchaseDataPin({
        network: dataPinNetwork,
        planId: selectedDataPinId,
        quantity: dataPinQuantity,
        businessName: dataPinBusinessName,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setGeneratedDataPins(res.pins || []);
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Data PIN generation failed.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Initiate Airtime Swap
  const handleInitiateSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSwapResult(null);

    const cleanPhone = swapSenderPhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 11) {
      setError('Valid 11-digit sender phone number required.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.initiateAirtimeSwap({
        network: swapNetwork,
        phone: cleanPhone,
        amount: swapAmount,
        bankName: swapBankName,
        accountNumber: swapAccountNumber,
        accountName: swapAccountName,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setSwapResult(res.swapDetails);
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Airtime swap request failed.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Cable TV Validation & Purchase
  const handleValidateSmartcard = async () => {
    if (!smartcardNumber || smartcardNumber.length < 8) {
      setError('Please enter a valid smartcard/IUC number (min 8 digits).');
      return;
    }
    setError(null);
    try {
      setValidatingSmartcard(true);
      const res = await api.verifySmartcard(cableProvider, smartcardNumber);
      if (res.success) {
        setSmartcardCustomer(res);
      }
    } catch (err: any) {
      setError(err.message || 'Smartcard validation failed.');
    } finally {
      setValidatingSmartcard(false);
    }
  };

  const handlePurchaseCable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!smartcardCustomer) {
      setError('Please validate smartcard number before proceeding.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.purchaseCable({
        provider: cableProvider,
        smartcardNumber,
        packageId: selectedCablePackageId,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setSmartcardCustomer(null);
        setSmartcardNumber('');
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Cable renewal failed.');
    } finally {
      setLoading(false);
    }
  };

  // 7. Electricity Validation & Purchase
  const handleValidateMeter = async () => {
    if (!meterNumber || meterNumber.length < 8) {
      setError('Please enter a valid meter number (min 8 digits).');
      return;
    }
    setError(null);
    try {
      setValidatingMeter(true);
      const res = await api.verifyMeter(selectedDiscoId, meterNumber, meterType);
      if (res.success) {
        setMeterCustomer(res);
      }
    } catch (err: any) {
      setError(err.message || 'Meter verification failed.');
    } finally {
      setValidatingMeter(false);
    }
  };

  const handlePurchaseElectricity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setElectricityReceipt(null);

    if (!meterCustomer) {
      setError('Please verify meter number before proceeding.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.purchaseElectricity({
        discoId: selectedDiscoId,
        meterNumber,
        meterType,
        amount: meterAmount,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setElectricityReceipt({
          token: res.token,
          units: res.units,
          meterNumber,
          discoId: selectedDiscoId,
          amount: meterAmount,
          customerName: meterCustomer.customerName,
          address: meterCustomer.address,
        });
        setMeterCustomer(null);
        setMeterNumber('');
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Electricity payment failed.');
    } finally {
      setLoading(false);
    }
  };

  // 8. Exam Scratch Card Purchase
  const handlePurchaseExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGeneratedExamPins([]);

    try {
      setLoading(true);
      const res = await api.purchaseExamPin({
        examId: selectedExamId,
        quantity: examQuantity,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setGeneratedExamPins(res.pins || []);
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Exam token generation failed.');
    } finally {
      setLoading(false);
    }
  };

  // 9. Bulk SMS Send
  const handleSendBulkSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      setLoading(true);
      const res = await api.sendBulkSms({
        senderId: smsSenderId,
        recipients: smsRecipients,
        message: smsMessage,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setSmsMessage('');
        setSmsRecipients('');
        await refreshUser();
        await loadOrders();
      }
    } catch (err: any) {
      setError(err.message || 'Bulk SMS dispatch failed.');
    } finally {
      setLoading(false);
    }
  };

  // 10. Query Transaction Status
  const handleQueryStatus = async (ref: string) => {
    if (!ref) return;
    try {
      setLoading(true);
      const res = await api.verifyTelecomTransaction(ref);
      setQueryStatusResult(res);
      await loadOrders();
    } catch (err: any) {
      setError(err.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  // Derived Values
  const filteredDataPlans = dataPlans.filter(p => {
    const netMatch = p.network === dataNetwork;
    const typeMatch = dataTypeFilter === 'all' || p.type === dataTypeFilter;
    return netMatch && typeMatch;
  });
  const selectedDataPlan = dataPlans.find(p => p.id === selectedPlanId);

  const airtimeDiscount = Math.round((airtimeAmount * 2.5) / 100);
  const airtimePayable = airtimeAmount - airtimeDiscount;

  const currentCableBouquets = cablePackages[cableProvider] || [];
  const selectedCableBouquet = currentCableBouquets.find(p => p.id === selectedCablePackageId);

  const selectedExamPkg = examPackages.find(p => p.id === selectedExamId);

  // Bulk SMS character counter
  const smsLength = smsMessage.length;
  const smsPages = Math.ceil(Math.max(1, smsLength) / 160);
  const recipientCount = smsRecipients
    .split(/[\n,;]+/)
    .map(r => r.trim())
    .filter(r => r.length >= 10).length;
  const totalSmsCost = recipientCount * smsPages * 3.5;

  return (
    <div className="space-y-8">
      {/* Sovereign Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <Smartphone className="w-4 h-4" />
            <span className="uppercase tracking-wider">Telecommunications Engine</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-slate-300">Carrier Network Direct Gateway</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">
            Carrier &amp; Utility Vending Hub
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Real-time direct integration for Airtime, SME/Corporate Data, PIN Generation, Airtime-to-Cash, Cable TV, STS Electricity Tokens, Exam PINs, and Bulk SMS.
          </p>
        </div>

        {/* Live Provider Status Badge */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Carrier Gateway</div>
            <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {activeProvider === 'ulamadata' ? 'Primary Route (Active)' : 'Redundant Route (Active)'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Your Wallet</div>
            <div className="text-xs font-mono font-bold text-white mt-0.5">
              ₦{(user?.wallet_balance ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 10-Service Tab Navigation Bar */}
      <div className="overflow-x-auto pb-2 scrollbar-none">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-900 border border-slate-800 w-max text-xs font-bold">
          <button
            onClick={() => { setActiveTab('airtime'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'airtime' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Airtime (2.5% Off)</span>
          </button>

          <button
            onClick={() => { setActiveTab('data'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'data' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Data Bundles</span>
          </button>

          <button
            onClick={() => { setActiveTab('airtime_pin'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'airtime_pin' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Airtime PINs</span>
          </button>

          <button
            onClick={() => { setActiveTab('data_pin'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'data_pin' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Data PINs</span>
          </button>

          <button
            onClick={() => { setActiveTab('airtime_swap'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'airtime_swap' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Airtime to Cash</span>
          </button>

          <button
            onClick={() => { setActiveTab('cable'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'cable' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Cable TV</span>
          </button>

          <button
            onClick={() => { setActiveTab('electricity'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'electricity' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Electricity</span>
          </button>

          <button
            onClick={() => { setActiveTab('exam'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'exam' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Exam Cards</span>
          </button>

          <button
            onClick={() => { setActiveTab('bulksms'); setError(null); setSuccessMsg(null); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'bulksms' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Bulk SMS</span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); setError(null); setSuccessMsg(null); loadOrders(); }}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'history' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Orders &amp; Receipts</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-bold">{successMsg}</div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. AIRTIME TOP-UP TAB */}
      {/* ============================================================== */}
      {activeTab === 'airtime' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Instant VTU Airtime Recharge</span>
              </h2>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
                2.5% Cash Discount
              </span>
            </div>

            <form onSubmit={handlePurchaseAirtime} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Network Carrier</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setAirtimeNetwork(net)}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        airtimeNetwork === net
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recipient Nigerian Phone Number</label>
                <input
                  type="tel"
                  value={airtimePhone}
                  onChange={e => setAirtimePhone(e.target.value)}
                  placeholder="e.g. 08031234567"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recharge Amount (₦)</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[200, 500, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAirtimeAmount(amt)}
                      className={`py-2 text-center rounded-lg text-xs font-bold border ${
                        airtimeAmount === amt
                          ? 'bg-slate-800 border-amber-500/40 text-amber-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="50"
                  max="50000"
                  value={airtimeAmount}
                  onChange={e => setAirtimeAmount(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Nominal Airtime Value:</span>
                  <span className="font-mono text-white font-bold">₦{airtimeAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Discount Saved (2.5%):</span>
                  <span className="font-mono font-bold">-₦{airtimeDiscount.toLocaleString()}</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-white">
                  <span>Net Amount Deducted:</span>
                  <span className="font-mono text-amber-400 text-sm">₦{airtimePayable.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Recharging Carrier...</span>
                  </>
                ) : (
                  <>
                    <span>Recharge ₦{airtimeAmount.toLocaleString()} ({airtimeNetwork})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5">
            <h3 className="text-sm font-bold text-white">VTU Gateway Architecture</h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Carrier Gateway:</span>
                <span className="font-bold text-emerald-400">Enterprise Telecom Core</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Route Redundancy:</span>
                <span className="font-semibold text-slate-300">Carrier Auto-Switch</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Delivery Latency:</span>
                <span className="font-mono text-emerald-400 font-bold">&lt; 2.5 seconds</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Supported Networks:</span>
                <span className="font-bold text-white">MTN, GLO, AIRTEL, 9MOBILE</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-slate-400 text-[11px] leading-relaxed">
              <span className="font-bold text-emerald-400">Automatic Ported Number Handling:</span> All airtime top-ups automatically route via carrier lookup even if a line was ported to another network.
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. DYNAMIC DATA BUNDLES TAB */}
      {/* ============================================================== */}
      {activeTab === 'data' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Dynamic Data Vending</span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                {filteredDataPlans.length} plans available
              </span>
            </div>

            <form onSubmit={handlePurchaseData} className="space-y-5">
              {/* Network */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => {
                        setDataNetwork(net);
                        const first = dataPlans.find(p => p.network === net);
                        if (first) setSelectedPlanId(first.id);
                      }}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        dataNetwork === net
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Type Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Data Type / Category</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['all', 'SME', 'Corporate', 'Gifting', 'Direct'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDataTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        dataTypeFilter === t
                          ? 'bg-slate-800 border-emerald-500/40 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t === 'all' ? 'All Types' : t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan Grid */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Dynamic Data Plan</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1 border border-slate-800/80 rounded-xl bg-slate-950">
                  {filteredDataPlans.map(plan => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`p-3 text-left rounded-xl border text-xs transition-all ${
                        selectedPlanId === plan.id
                          ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-black text-white text-sm">{plan.size}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{plan.type} &bull; {plan.validity}</div>
                      <div className="text-emerald-400 font-mono font-bold mt-1 text-xs">
                        ₦{(plan.price ?? plan.cost_price ?? 0).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recipient Nigerian Phone Number</label>
                <input
                  type="tel"
                  value={dataPhone}
                  onChange={e => setDataPhone(e.target.value)}
                  placeholder="e.g. 08123456789"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !selectedDataPlan}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Dispatching Data Bundle...</span>
                  </>
                ) : (
                  <>
                    <span>
                      Vend {selectedDataPlan?.size} ({selectedDataPlan?.network}) for ₦
                      {(selectedDataPlan?.price ?? 0).toLocaleString()}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5">
            <h3 className="text-sm font-bold text-white">Dynamic Plan Specs</h3>
            {selectedDataPlan ? (
              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Plan Description:</span>
                  <span className="font-bold text-white">{selectedDataPlan.name}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Package Type:</span>
                  <span className="font-semibold text-emerald-400">{selectedDataPlan.type} Bundle</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Validity Period:</span>
                  <span className="font-semibold text-white">{selectedDataPlan.validity}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Customer Price:</span>
                  <span className="font-mono text-emerald-400 font-black text-sm">
                    ₦{(selectedDataPlan.price ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Select a plan to view specifications</div>
            )}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              <span className="font-bold text-white">Direct Dynamic Catalogue:</span> Plans are synced directly with the carrier databases, ensuring instant activation and automated refund if unfulfilled.
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. AIRTIME PIN GENERATOR (RECHARGE CARD PRINTING) */}
      {/* ============================================================== */}
      {activeTab === 'airtime_pin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Airtime PIN Recharge Card Generator</span>
              </h2>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Printable Vouchers
              </span>
            </div>

            <form onSubmit={handlePurchaseAirtimePin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setPinNetwork(net)}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        pinNetwork === net
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
                <label className="block text-xs font-semibold text-slate-300 mb-2">Denomination (₦)</label>
                <div className="grid grid-cols-4 gap-2">
                  {[100, 200, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPinDenom(amt)}
                      className={`py-2.5 text-center rounded-xl text-xs font-bold border transition-all ${
                        pinDenom === amt
                          ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      ₦{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Quantity (Cards)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={pinQuantity}
                    onChange={e => setPinQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Name on Card</label>
                  <input
                    type="text"
                    value={pinBusinessName}
                    onChange={e => setPinBusinessName(e.target.value)}
                    placeholder="e.g. Hambak Telecoms"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Purchase Price:</span>
                <span className="font-mono text-emerald-400 font-black text-sm">
                  ₦{(pinDenom * pinQuantity).toLocaleString()}
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Airtime PINs...</span>
                  </>
                ) : (
                  <>
                    <span>Generate {pinQuantity}x ₦{pinDenom} {pinNetwork} PIN(s)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Generated Airtime Cards</span>
              {generatedAirtimePins.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs flex items-center gap-1.5 font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Cards</span>
                </button>
              )}
            </h3>

            {generatedAirtimePins.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Generated airtime vouchers with serial numbers and recharge USSD codes will appear here ready to print or distribute.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {generatedAirtimePins.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-black text-emerald-400">{pinNetwork} ₦{item.value} RECHARGE</span>
                      <span className="font-bold text-slate-400">{pinBusinessName}</span>
                    </div>
                    <div className="text-center py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-base font-black text-white tracking-widest">
                      {item.pin}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>SN: {item.serial}</span>
                      <span className="text-amber-400">{item.load_code}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. DATA PIN GENERATOR (DATA VOUCHERS) */}
      {/* ============================================================== */}
      {activeTab === 'data_pin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Data PIN Voucher Printing</span>
              </h2>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Data Scratch Cards
              </span>
            </div>

            <form onSubmit={handlePurchaseDataPin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setDataPinNetwork(net)}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        dataPinNetwork === net
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
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Data Card Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {dataPinDenoms
                    .filter(d => d.network === dataPinNetwork)
                    .map(denom => (
                      <button
                        key={denom.id}
                        type="button"
                        onClick={() => setSelectedDataPinId(denom.id)}
                        className={`p-3 text-left rounded-xl border transition-all ${
                          selectedDataPinId === denom.id
                            ? 'bg-slate-800 border-emerald-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-black text-white text-sm">{denom.size}</div>
                        <div className="text-emerald-400 font-mono font-bold text-xs mt-1">₦{denom.price.toLocaleString()}</div>
                      </button>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={dataPinQuantity}
                    onChange={e => setDataPinQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Name on Card</label>
                  <input
                    type="text"
                    value={dataPinBusinessName}
                    onChange={e => setDataPinBusinessName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !selectedDataPinId}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Data PINs...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Data PIN Cards</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Generated Data Cards</span>
              {generatedDataPins.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs flex items-center gap-1.5 font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Cards</span>
                </button>
              )}
            </h3>

            {generatedDataPins.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Generated data recharge vouchers will show here. Customers dial the printed USSD code to load data directly.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {generatedDataPins.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-black text-emerald-400">{dataPinNetwork} {item.size} DATA PIN</span>
                      <span className="font-bold text-slate-400">{dataPinBusinessName}</span>
                    </div>
                    <div className="text-center py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-base font-black text-white tracking-widest">
                      {item.pin}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>SN: {item.serial}</span>
                      <span className="text-amber-400">{item.load_code}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. AIRTIME SWAP (AIRTIME TO CASH) */}
      {/* ============================================================== */}
      {activeTab === 'airtime_swap' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-emerald-400" />
                <span>Airtime to Cash Conversion</span>
              </h2>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                80% Cash Payout
              </span>
            </div>

            <form onSubmit={handleInitiateSwap} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Sender Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setSwapNetwork(net)}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        swapNetwork === net
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
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number Sending Airtime</label>
                <input
                  type="tel"
                  value={swapSenderPhone}
                  onChange={e => setSwapSenderPhone(e.target.value)}
                  placeholder="e.g. 08031234567"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Airtime Amount (₦)</label>
                <input
                  type="number"
                  min="500"
                  max="50000"
                  value={swapAmount}
                  onChange={e => setSwapAmount(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Destination Bank / Method</label>
                  <input
                    type="text"
                    value={swapBankName}
                    onChange={e => setSwapBankName(e.target.value)}
                    placeholder="e.g. OPay / Hambak Wallet"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Account Number</label>
                  <input
                    type="text"
                    value={swapAccountNumber}
                    onChange={e => setSwapAccountNumber(e.target.value)}
                    placeholder="Optional (defaults to wallet)"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Airtime to Transfer:</span>
                  <span className="font-mono text-white font-bold">₦{swapAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Conversion Rate:</span>
                  <span className="font-mono font-bold">80% Cashout</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-white">
                  <span>You Will Receive:</span>
                  <span className="font-mono text-emerald-400 text-base">₦{Math.round(swapAmount * 0.8).toLocaleString()}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Swap Order...</span>
                  </>
                ) : (
                  <>
                    <span>Convert Airtime to Cash</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Transfer Instructions</h3>
            {swapResult ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="font-bold text-emerald-400">Step 1: Transfer Airtime</div>
                  <p className="text-slate-300 text-[11px]">
                    Transfer <strong>₦{swapResult.amount_airtime.toLocaleString()}</strong> airtime to our merchant receiving line:
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between font-mono font-bold text-white">
                    <span>{swapResult.merchant_phone}</span>
                    <button
                      onClick={() => copyToClipboard(swapResult.merchant_phone, 'phone')}
                      className="text-emerald-400 text-[10px] hover:underline"
                    >
                      {copiedText === 'phone' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Step 2: Dial USSD Code</div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-amber-400 text-xs">
                    {swapResult.ussd_transfer_instruction}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Replace PIN with your carrier share PIN (Default MTN PIN is 0000).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                  Cash payout of <strong className="text-emerald-400">₦{swapResult.cash_payout.toLocaleString()}</strong> will automatically credit to your wallet within 3 minutes of receipt.
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Submit the swap form to receive the exact USSD code and merchant number to transfer airtime.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. CABLE TV SUBSCRIPTION */}
      {/* ============================================================== */}
      {activeTab === 'cable' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-emerald-400" />
              <span>Cable TV Subscription &amp; Renewal</span>
            </h2>

            <div className="space-y-5">
              {/* Provider */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Cable Provider</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['GOTV', 'DSTV', 'STARTIMES', 'SHOWMAX'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setCableProvider(p);
                        setSmartcardCustomer(null);
                        const pkgs = cablePackages[p] || [];
                        if (pkgs.length) setSelectedCablePackageId(pkgs[0].id);
                      }}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        cableProvider === p
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smartcard Number & Verification */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Smartcard / IUC / UIC Number</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={smartcardNumber}
                    onChange={e => {
                      setSmartcardNumber(e.target.value);
                      setSmartcardCustomer(null);
                    }}
                    placeholder="Enter 10-11 digit Smartcard Number"
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleValidateSmartcard}
                    disabled={validatingSmartcard || !smartcardNumber}
                    className="px-4 py-3 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 disabled:opacity-50"
                  >
                    {validatingSmartcard ? 'Validating...' : 'Verify IUC'}
                  </button>
                </div>
              </div>

              {/* Verified Smartcard Badge */}
              {smartcardCustomer && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs animate-in fade-in">
                  <div>
                    <div className="font-black text-white text-sm">{smartcardCustomer.customerName}</div>
                    <div className="text-[11px] text-emerald-400 mt-0.5">
                      Status: {smartcardCustomer.status} &bull; Due: {smartcardCustomer.dueDate}
                    </div>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
              )}

              {/* Package Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Bouquet Package</label>
                <div className="grid grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-1 bg-slate-950 rounded-xl border border-slate-800">
                  {currentCableBouquets.map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedCablePackageId(pkg.id)}
                      className={`p-3 text-left rounded-xl border text-xs transition-all ${
                        selectedCablePackageId === pkg.id
                          ? 'bg-slate-800 border-emerald-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-white">{pkg.name}</div>
                      <div className="text-[10px] text-slate-500">{pkg.channels} Channels</div>
                      <div className="text-emerald-400 font-mono font-bold mt-1">₦{pkg.price.toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handlePurchaseCable}
                disabled={loading || !smartcardCustomer || !selectedCableBouquet}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Renewing Subscription...</span>
                  </>
                ) : (
                  <>
                    <span>
                      Renew {selectedCableBouquet?.name} (₦{(selectedCableBouquet?.price ?? 0).toLocaleString()})
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Cable API Direct Link</h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Provider Core:</span>
                <span className="font-bold text-white">MultiChoice Direct Bridge</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Validation:</span>
                <span className="font-semibold text-emerald-400">Real-Time Account Name</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Bouquet Auto-Match:</span>
                <span className="font-semibold text-slate-300">Automatic Channel Sync</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              Ensure your decoder is powered on and tuned to Channel 200 (GOtv) or 100 (DStv) during recharge for instant sub-60 second viewing restoration.
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 7. ELECTRICITY BILL PAYMENT (PREPAID & POSTPAID) */}
      {/* ============================================================== */}
      {activeTab === 'electricity' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-400" />
              <span>Electricity Bill Payment &amp; Token Generator</span>
            </h2>

            <div className="space-y-5">
              {/* Disco Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Distribution Company (Disco)</label>
                <select
                  value={selectedDiscoId}
                  onChange={e => {
                    setSelectedDiscoId(e.target.value);
                    setMeterCustomer(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-emerald-500 font-semibold"
                >
                  {discos.map(disco => (
                    <option key={disco.id} value={disco.id}>
                      {disco.name} ({disco.state})
                    </option>
                  ))}
                </select>
              </div>

              {/* Meter Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Meter Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setMeterType('prepaid'); setMeterCustomer(null); }}
                    className={`py-3 text-center rounded-xl text-xs font-bold border transition-all ${
                      meterType === 'prepaid'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Prepaid (STS Token)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMeterType('postpaid'); setMeterCustomer(null); }}
                    className={`py-3 text-center rounded-xl text-xs font-bold border transition-all ${
                      meterType === 'postpaid'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Postpaid (Bill Settlement)
                  </button>
                </div>
              </div>

              {/* Meter Number & Verification */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Meter Number</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={meterNumber}
                    onChange={e => {
                      setMeterNumber(e.target.value);
                      setMeterCustomer(null);
                    }}
                    placeholder="Enter 11-13 digit Meter Number"
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleValidateMeter}
                    disabled={validatingMeter || !meterNumber}
                    className="px-4 py-3 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 disabled:opacity-50"
                  >
                    {validatingMeter ? 'Checking...' : 'Verify Meter'}
                  </button>
                </div>
              </div>

              {/* Verified Meter Badge */}
              {meterCustomer && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1 text-xs animate-in fade-in">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-white text-sm">{meterCustomer.customerName}</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-[11px] text-slate-300">{meterCustomer.address}</div>
                  <div className="text-[10px] font-mono text-emerald-400">
                    Tariff: {meterCustomer.tariffClass}
                  </div>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Purchase Amount (₦)</label>
                <input
                  type="number"
                  min="1000"
                  max="100000"
                  value={meterAmount}
                  onChange={e => setMeterAmount(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:border-emerald-500"
                  required
                />
              </div>

              <button
                type="button"
                onClick={handlePurchaseElectricity}
                disabled={loading || !meterCustomer || meterAmount < 1000}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating 20-Digit STS Token...</span>
                  </>
                ) : (
                  <>
                    <span>Generate ₦{meterAmount.toLocaleString()} Token</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Generated Electricity Token</h3>
            {electricityReceipt ? (
              <div className="p-5 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-4">
                <div className="text-center pb-3 border-b border-slate-800">
                  <div className="text-xs uppercase font-bold text-slate-400">Standard 20-Digit STS Token</div>
                  <div className="font-mono text-xl font-black text-emerald-400 tracking-wider mt-2 py-2 px-3 rounded-lg bg-slate-900 border border-slate-800">
                    {electricityReceipt.token}
                  </div>
                  <button
                    onClick={() => copyToClipboard(electricityReceipt.token, 'token')}
                    className="text-[10px] text-slate-400 hover:text-white mt-2 inline-flex items-center gap-1 font-bold"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedText === 'token' ? 'Copied Token' : 'Copy Token'}</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Units Generated:</span>
                    <span className="font-mono text-white font-bold">{electricityReceipt.units}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Meter Number:</span>
                    <span className="font-mono text-white">{electricityReceipt.meterNumber}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Customer:</span>
                    <span className="text-white font-bold">{electricityReceipt.customerName}</span>
                  </div>
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Payment Slip</span>
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Your generated 20-digit token and allocated kWh power units will display here with printable receipt.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 8. EXAMINATION SCRATCH CARDS (WAEC, NECO, NABTEB, JAMB) */}
      {/* ============================================================== */}
      {activeTab === 'exam' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-400" />
              <span>Examination Result Checker PINs &amp; Tokens</span>
            </h2>

            <form onSubmit={handlePurchaseExam} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Examination Board</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {examPackages.map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedExamId(pkg.id)}
                      className={`p-3 text-center rounded-xl border text-xs transition-all ${
                        selectedExamId === pkg.id
                          ? 'bg-slate-800 border-emerald-500 text-white font-black shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold">{pkg.code}</div>
                      <div className="text-emerald-400 font-mono text-[11px] mt-1">₦{pkg.price.toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={examQuantity}
                  onChange={e => setExamQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  required
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Purchase Cost:</span>
                <span className="font-mono text-emerald-400 font-black text-sm">
                  ₦{((selectedExamPkg?.price ?? 0) * examQuantity).toLocaleString()}
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !selectedExamPkg}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Dispensing Exam PINs...</span>
                  </>
                ) : (
                  <>
                    <span>Generate {examQuantity}x {selectedExamPkg?.name}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Generated Examination PINs</span>
              {generatedExamPins.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs flex items-center gap-1.5 font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
              )}
            </h3>

            {generatedExamPins.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Purchased result checker PINs with serial numbers and online check instructions will display here.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {generatedExamPins.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-emerald-400">{item.exam} RESULT CHECKER</span>
                      <span className="text-slate-400">PIN #{idx + 1}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-center text-sm font-black text-white tracking-widest">
                      {item.pin}
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Serial: {item.serial}</span>
                      <span className="text-amber-400">Online Check Active</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 9. BULK SMS PORTAL */}
      {/* ============================================================== */}
      {activeTab === 'bulksms' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Bulk SMS Dispatch Portal</span>
            </h2>

            <form onSubmit={handleSendBulkSms} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Sender ID (Max 11 Characters)
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={smsSenderId}
                  onChange={e => setSmsSenderId(e.target.value)}
                  placeholder="e.g. HAMBAKTECH"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Recipients (Separate with comma or new line)
                </label>
                <textarea
                  rows={4}
                  value={smsRecipients}
                  onChange={e => setSmsRecipients(e.target.value)}
                  placeholder="08031234567, 08123456789&#10;07089123456"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">Message Content</label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {smsLength} chars &bull; {smsPages} page{smsPages > 1 ? 's' : ''}
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={smsMessage}
                  onChange={e => setSmsMessage(e.target.value)}
                  placeholder="Type your SMS message here..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-emerald-500"
                  required
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Recipients Count:</span>
                  <span className="font-mono text-white font-bold">{recipientCount} recipients</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Pages per Recipient:</span>
                  <span className="font-mono text-white">{smsPages} page(s)</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-white">
                  <span>Total SMS Units Cost:</span>
                  <span className="font-mono text-emerald-400 text-sm">₦{totalSmsCost.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || recipientCount === 0 || !smsMessage}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Transmitting Bulk SMS...</span>
                  </>
                ) : (
                  <>
                    <span>Dispatch SMS to {recipientCount} Recipients</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">DND Gateway Routing</h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Delivery Route:</span>
                <span className="font-bold text-emerald-400">Corporate DND Bypass</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Price per SMS:</span>
                <span className="font-mono text-white">₦3.50 / page</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Standard Page:</span>
                <span className="font-mono text-white">160 Characters</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              Nigeria Communications Commission (NCC) Do-Not-Disturb (DND) active lines receive deliveries through our direct banking corporate route.
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 10. ORDERS & RECEIPTS HISTORY TAB */}
      {/* ============================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Query Live Reference Bar */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 w-full relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="text"
                value={queryRef}
                onChange={e => setQueryRef(e.target.value)}
                placeholder="Query live transaction reference on carrier network..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:border-emerald-500"
              />
            </div>
            <button
              onClick={() => handleQueryStatus(queryRef)}
              disabled={loading || !queryRef}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-xs text-slate-950 disabled:opacity-50"
            >
              Verify On-Chain
            </button>
          </div>

          {/* Query Result Modal/Card */}
          {queryStatusResult && (
            <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-black text-white text-sm">Query Status Result</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                  {queryStatusResult.result?.status?.toUpperCase() || 'VERIFIED'}
                </span>
              </div>
              <div className="text-slate-300 font-mono text-[11px]">
                {queryStatusResult.result?.message}
              </div>
            </div>
          )}

          {/* Table Header Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter Service:</span>
              <select
                value={historyFilterService}
                onChange={e => {
                  setHistoryFilterService(e.target.value);
                  setTimeout(loadOrders, 50);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
              >
                <option value="all">All Services</option>
                <option value="data">Data Bundles</option>
                <option value="airtime">Airtime</option>
                <option value="airtime_pin">Airtime PINs</option>
                <option value="data_pin">Data PINs</option>
                <option value="airtime_swap">Airtime Swap</option>
                <option value="cable">Cable TV</option>
                <option value="electricity">Electricity</option>
                <option value="exam">Exam Cards</option>
                <option value="bulksms">Bulk SMS</option>
              </select>
            </div>
            <button
              onClick={loadOrders}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Orders</span>
            </button>
          </div>

          {/* Orders Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Network/Provider</th>
                    <th className="py-3 px-4">Plan / Details</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No orders recorded for this category yet.
                      </td>
                    </tr>
                  ) : (
                    orders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-850/50">
                        <td className="py-3.5 px-4 font-black text-white uppercase text-[11px]">
                          {o.service.replace('_', ' ')}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{o.network}</td>
                        <td className="py-3.5 px-4 text-slate-200">{o.plan}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-300">{o.phone}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-white">
                          ₦{(o.amount ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                          {o.provider_ref}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              o.status === 'successful'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : o.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => setSelectedOrderReceipt(o)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-[10px] flex items-center gap-1"
                          >
                            <Receipt className="w-3 h-3" />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* RECEIPT MODAL */}
      {/* ============================================================== */}
      {selectedOrderReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <h3 className="font-black text-white text-sm">Official Transaction Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedOrderReceipt(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-center py-2">
              <div className="text-[10px] uppercase font-bold text-slate-400">HambakTech Enterprise Portal</div>
              <div className="font-black text-white text-lg mt-0.5">
                ₦{(selectedOrderReceipt.amount ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-emerald-400 font-bold mt-1 uppercase">
                {selectedOrderReceipt.status} &bull; {selectedOrderReceipt.service.replace('_', ' ')}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Product / Plan:</span>
                <span className="font-bold text-white">{selectedOrderReceipt.plan}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Carrier / Gateway:</span>
                <span className="font-mono text-emerald-400">{selectedOrderReceipt.network}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Recipient:</span>
                <span className="font-mono text-white">{selectedOrderReceipt.phone}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Gateway Reference:</span>
                <span className="font-mono text-slate-300 text-[11px]">{selectedOrderReceipt.provider_ref}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Timestamp:</span>
                <span className="text-slate-300">
                  {new Date(selectedOrderReceipt.created_at).toLocaleString('en-NG')}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setSelectedOrderReceipt(null)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
              >
                Done
              </button>
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
          if (pendingPinAction) pendingPinAction();
        }}
        title={pinModalTitle}
        description={pinModalDesc}
        amount={pinModalAmount}
      />
    </div>
  );
};
