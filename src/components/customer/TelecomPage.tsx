/**
 * @file TelecomPage.tsx
 * Sovereign Telecommunications Hub.
 * Enterprise telecom services:
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
  TelecomVoucherItem,
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

  // Wallet & service status
  const [engineStatus] = useState<string>('Operational');

  // General Loading & alerts
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // PIN Authorization State
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pendingPinAction, setPendingPinAction] = useState<((verifiedPin?: string) => Promise<void>) | null>(null);
  const [pinModalTitle, setPinModalTitle] = useState<string>('Authorize Purchase');
  const [pinModalDesc, setPinModalDesc] = useState<string>('');
  const [pinModalAmount, setPinModalAmount] = useState<number | undefined>(undefined);

  // 1. Airtime State
  const [airtimeNetwork, setAirtimeNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [airtimePhone, setAirtimePhone] = useState('');
  const [airtimeAmount, setAirtimeAmount] = useState<number>(1000);
  const [airtimeDiscountPercent, setAirtimeDiscountPercent] = useState<number>(2.5);

  // 2. Data State
  const [dataPlans, setDataPlans] = useState<TelecomPlanItem[]>([]);
  const [categoriesByNetwork, setCategoriesByNetwork] = useState<Record<string, string[]>>({});
  const [dataNetwork, setDataNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [dataCategory, setDataCategory] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [dataPhone, setDataPhone] = useState('');
  const [validatingPhone, setValidatingPhone] = useState(false);
  const [phoneValidation, setPhoneValidation] = useState<{
    checked: boolean;
    valid: boolean;
    matches_network: boolean;
    formatted_phone: string;
    detected_network: string | null;
    selected_network: string;
    message: string;
  } | null>(null);
  const [dataOrderResult, setDataOrderResult] = useState<{
    status: string;
    reference: string;
    plan: string;
    network: string;
    phone: string;
    amount: number;
    message: string;
  } | null>(null);

  // 3. Airtime PIN State
  const [airtimePinDenoms, setAirtimePinDenoms] = useState<AirtimePinDenomination[]>([]);
  const [airtimePinCatalogueStatus, setAirtimePinCatalogueStatus] = useState<string>('');
  const [pinNetwork, setPinNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [selectedAirtimePinId, setSelectedAirtimePinId] = useState<string>('');
  const [pinDenom, setPinDenom] = useState<number>(100);
  const [pinQuantity, setPinQuantity] = useState<number>(1);
  const [pinBusinessName, setPinBusinessName] = useState<string>('HambakTech Enterprise');
  const [generatedAirtimePins, setGeneratedAirtimePins] = useState<TelecomVoucherItem[]>([]);
  const [pendingAirtimePinOrder, setPendingAirtimePinOrder] = useState<TelecomOrder | null>(null);

  // 4. Data PIN State
  const [dataPinDenoms, setDataPinDenoms] = useState<DataPinDenomination[]>([]);
  const [dataPinAvailable, setDataPinAvailable] = useState<boolean>(false);
  const [dataPinCatalogueStatus, setDataPinCatalogueStatus] = useState<string>('');
  const [dataPinNetwork, setDataPinNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [selectedDataPinId, setSelectedDataPinId] = useState<string>('');
  const [dataPinQuantity, setDataPinQuantity] = useState<number>(1);
  const [dataPinBusinessName, setDataPinBusinessName] = useState<string>('HambakTech Enterprise');
  const [generatedDataPins, setGeneratedDataPins] = useState<TelecomVoucherItem[]>([]);
  const [pendingDataPinOrder, setPendingDataPinOrder] = useState<TelecomOrder | null>(null);

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
  const [receiptVouchers, setReceiptVouchers] = useState<TelecomVoucherItem[]>([]);
  const [loadingReceiptVouchers, setLoadingReceiptVouchers] = useState<boolean>(false);
  const [queryRef, setQueryRef] = useState<string>('');
  const [queryStatusResult, setQueryStatusResult] = useState<any | null>(null);

  // Load Initial Data
  useEffect(() => {
    loadDataPlans();
    loadAirtimePins();
    loadDataPins();
    loadSwapConfig();
    loadCablePackages();
    loadDiscos();
    loadExamPackages();
    loadOrders();
  }, []);

  const loadDataPlans = async () => {
    try {
      const res = await api.getTelecomPlans();
      const loadedPlans = res.plans || [];
      setDataPlans(loadedPlans);
      setCategoriesByNetwork(res.categories_by_network || {});
      if (typeof res.airtime_discount_percent === 'number') {
        setAirtimeDiscountPercent(res.airtime_discount_percent);
      }
      const mtnCats =
        res.categories_by_network?.['MTN'] ||
        Array.from(new Set(loadedPlans.filter(p => p.network === 'MTN').map(p => p.type)));
      const firstCat = mtnCats[0] || '';
      setDataCategory(prev => (prev && mtnCats.includes(prev) ? prev : firstCat));
      const first =
        loadedPlans.find(p => p.network === 'MTN' && (!firstCat || p.type === firstCat)) ||
        loadedPlans.find(p => p.network === 'MTN');
      if (first) setSelectedPlanId(first.id);
    } catch {}
  };

  const runPhoneValidation = async (networkToCheck: string, phoneToCheck: string) => {
    const digits = phoneToCheck.replace(/\D+/g, '');
    if (digits.length < 10) {
      setPhoneValidation(null);
      return null;
    }
    setValidatingPhone(true);
    try {
      const res = await api.validateTelecomPhone(networkToCheck, phoneToCheck);
      const state = {
        checked: true,
        valid: Boolean(res.valid),
        matches_network: Boolean(res.matches_network),
        formatted_phone: res.formatted_phone || phoneToCheck.trim(),
        detected_network: res.detected_network || null,
        selected_network: res.selected_network || networkToCheck,
        message: res.message,
      };
      setPhoneValidation(state);
      return state;
    } catch (err: any) {
      const failState = {
        checked: true,
        valid: false,
        matches_network: false,
        formatted_phone: phoneToCheck.trim(),
        detected_network: null,
        selected_network: networkToCheck,
        message: err?.message || 'Unable to validate recipient phone number.',
      };
      setPhoneValidation(failState);
      return failState;
    } finally {
      setValidatingPhone(false);
    }
  };

  useEffect(() => {
    const digits = dataPhone.replace(/\D+/g, '');
    if (digits.length < 10) {
      setPhoneValidation(null);
      return;
    }
    const timer = window.setTimeout(() => {
      runPhoneValidation(dataNetwork, dataPhone);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dataPhone, dataNetwork]);

  const loadAirtimePins = async () => {
    try {
      const res = await api.getAirtimePinDenominations();
      const list = res.denominations || [];
      setAirtimePinDenoms(list);
      setAirtimePinCatalogueStatus(res.catalogue_status || '');
      const mtnList = list.filter(d => d.network === pinNetwork);
      const firstMatch = mtnList.find(d => d.in_stock) || mtnList[0] || list[0];
      if (firstMatch && !list.some(d => d.id === selectedAirtimePinId && d.network === pinNetwork)) {
        setSelectedAirtimePinId(firstMatch.id);
        setPinDenom(firstMatch.denomination);
      }
    } catch {}
  };

  const loadDataPins = async () => {
    try {
      const res = await api.getDataPinDenominations();
      const list = res.denominations || [];
      setDataPinDenoms(list);
      setDataPinAvailable(Boolean(res.available_for_purchase));
      setDataPinCatalogueStatus(res.catalogue_status || '');
      if (list.length) {
        setSelectedDataPinId(prev => (list.some(d => d.id === prev) ? prev : list[0].id));
      } else {
        setSelectedDataPinId('');
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

  const loadOrders = async (serviceOverride?: string) => {
    try {
      const srv = serviceOverride ?? historyFilterService;
      const res = await api.getTelecomHistory(srv === 'all' ? undefined : srv);
      setOrders(res.orders || []);
    } catch {}
  };

  const openOrderReceiptModal = async (order: TelecomOrder) => {
    setSelectedOrderReceipt(order);
    const existing = Array.isArray(order.vouchers) ? order.vouchers : [];
    setReceiptVouchers(existing);
    if ((order.service === 'airtime_pin' || order.service === 'data_pin') && order.status === 'successful' && existing.length === 0) {
      setLoadingReceiptVouchers(true);
      try {
        const res = await api.getTelecomOrderVouchers(order.id);
        setReceiptVouchers(res.vouchers || []);
      } catch {
        setReceiptVouchers([]);
      } finally {
        setLoadingReceiptVouchers(false);
      }
    }
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

  // 2. Purchase Data (10-Step Flow)
  const handlePurchaseData = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setDataOrderResult(null);

    const rawTrimmed = dataPhone.trim().replace(/\s+/g, '');
    if (!rawTrimmed) {
      setError('Please enter a recipient Nigerian phone number.');
      return;
    }

    const validation =
      phoneValidation &&
      phoneValidation.checked &&
      phoneValidation.selected_network === dataNetwork
        ? phoneValidation
        : await runPhoneValidation(dataNetwork, rawTrimmed);

    if (!validation || !validation.valid || !validation.matches_network) {
      setError(
        validation?.message ||
          `Please enter a valid ${dataNetwork} Nigerian phone number before proceeding.`
      );
      return;
    }

    if (!selectedDataPlan) {
      setError('Please select a data category and bundle plan.');
      return;
    }

    const verifiedPhone = validation.formatted_phone || rawTrimmed;
    const price = selectedDataPlan.price || 0;
    const planSnapshot = selectedDataPlan;
    const idempotencyKey = `DATA_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    setPinModalTitle('Authorize Data Bundle');
    setPinModalDesc(
      `Enter your 4-digit security PIN to send ${planSnapshot.network} ${planSnapshot.size} (${planSnapshot.type} • ${planSnapshot.validity}) to ${verifiedPhone} for ₦${price.toLocaleString()}.`
    );
    setPinModalAmount(price);
    setPendingPinAction(() => async () => {
      try {
        setLoading(true);
        const res = await api.purchaseData(
          planSnapshot.id,
          verifiedPhone,
          dataNetwork,
          idempotencyKey
        );
        const orderStatus = res.status || res.order?.status || 'successful';
        const ref = res.reference || res.order?.provider_ref || res.order?.id || '';
        setDataOrderResult({
          status: orderStatus,
          reference: ref,
          plan: res.order?.plan || `${planSnapshot.network} ${planSnapshot.size} (${planSnapshot.type})`,
          network: dataNetwork,
          phone: verifiedPhone,
          amount: res.order?.amount ?? price,
          message: res.message,
        });
        if (res.success) {
          setSuccessMsg(res.message);
          setDataPhone('');
          setPhoneValidation(null);
          await refreshUser();
          await loadOrders();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to dispatch data. Check wallet balance.');
        await refreshUser().catch(() => {});
        await loadOrders().catch(() => {});
      } finally {
        setLoading(false);
      }
    });
    setIsPinModalOpen(true);
  };

  // 3. Purchase Airtime PINs
  const handlePurchaseAirtimePin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGeneratedAirtimePins([]);
    setPendingAirtimePinOrder(null);

    const netDenoms = airtimePinDenoms.filter(d => d.network === pinNetwork);
    const chosen =
      netDenoms.find(d => d.id === selectedAirtimePinId) ||
      netDenoms.find(d => d.denomination === pinDenom) ||
      netDenoms[0] ||
      null;

    if (!chosen) {
      setError(`No active Airtime PIN denominations available for ${pinNetwork}.`);
      return;
    }
    if (!chosen.in_stock || chosen.available_stock <= 0) {
      setError(`${pinNetwork} ₦${chosen.denomination.toLocaleString()} Airtime PINs are currently out of stock (0 available).`);
      return;
    }
    const maxAllowed = Math.min(chosen.max_quantity || 50, chosen.available_stock);
    if (pinQuantity < 1 || pinQuantity > maxAllowed) {
      setError(`Quantity must be between 1 and ${maxAllowed} card(s) for ${pinNetwork} ₦${chosen.denomination.toLocaleString()}.`);
      return;
    }

    const cleanBiz = pinBusinessName.trim() || 'HambakTech';
    const unitPrice = chosen.selling_price ?? chosen.price;
    const totalAmount = Math.round(unitPrice * pinQuantity * 100) / 100;
    const idempotencyKey = `APIN_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    setPinModalTitle('Authorize Airtime PIN Generation');
    setPinModalDesc(
      `Enter your 4-digit security PIN to generate ${pinQuantity}x ${pinNetwork} ₦${chosen.denomination.toLocaleString()} Recharge PIN(s) at ₦${unitPrice.toLocaleString()}/card (Total: ₦${totalAmount.toLocaleString()}).`
    );
    setPinModalAmount(totalAmount);
    setPendingPinAction(() => async (verifiedPin?: string) => {
      try {
        setLoading(true);
        const res = await api.purchaseAirtimePin(
          {
            denominationId: chosen.id,
            network: chosen.network,
            denomination: chosen.denomination,
            quantity: pinQuantity,
            businessName: cleanBiz,
            card_name: cleanBiz,
            transaction_pin: verifiedPin || '',
            idempotency_key: idempotencyKey,
          },
          idempotencyKey
        );
        if (res.status === 'pending' || res.incomplete_vouchers) {
          setPendingAirtimePinOrder(res.order);
          setSuccessMsg(res.message || 'Airtime PIN order is pending verification.');
        } else if (res.success) {
          setSuccessMsg(res.message);
          setGeneratedAirtimePins(res.vouchers || res.pins || []);
        }
        await refreshUser();
        await loadAirtimePins();
        await loadOrders();
      } catch (err: any) {
        setError(err.message || 'Airtime PIN generation failed.');
        await refreshUser().catch(() => {});
        await loadAirtimePins().catch(() => {});
        await loadOrders().catch(() => {});
      } finally {
        setLoading(false);
      }
    });
    setIsPinModalOpen(true);
  };

  // 4. Purchase Data PINs
  const handlePurchaseDataPin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGeneratedDataPins([]);
    setPendingDataPinOrder(null);

    const netPlans = dataPinDenoms.filter(d => d.network === dataPinNetwork);
    const chosen = netPlans.find(d => d.id === selectedDataPinId) || netPlans[0] || null;
    if (!chosen || !dataPinAvailable) {
      setError(dataPinCatalogueStatus || 'Data PIN purchases are temporarily disabled pending confirmed Ulamadata plan IDs.');
      return;
    }
    if (!chosen.in_stock || chosen.available_stock <= 0) {
      setError(`${dataPinNetwork} ${chosen.size} Data PINs are currently out of stock.`);
      return;
    }
    const maxAllowed = Math.min(chosen.max_quantity || 50, chosen.available_stock);
    if (dataPinQuantity < 1 || dataPinQuantity > maxAllowed) {
      setError(`Quantity must be between 1 and ${maxAllowed} Data PIN card(s).`);
      return;
    }

    const cleanBiz = dataPinBusinessName.trim() || 'HambakTech';
    const unitPrice = chosen.selling_price ?? chosen.price;
    const totalAmount = Math.round(unitPrice * dataPinQuantity * 100) / 100;
    const idempotencyKey = `DPIN_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    setPinModalTitle('Authorize Data PIN Generation');
    setPinModalDesc(
      `Enter your 4-digit security PIN to generate ${dataPinQuantity}x ${dataPinNetwork} ${chosen.size} Data PIN card(s) at ₦${unitPrice.toLocaleString()}/card (Total: ₦${totalAmount.toLocaleString()}).`
    );
    setPinModalAmount(totalAmount);
    setPendingPinAction(() => async (verifiedPin?: string) => {
      try {
        setLoading(true);
        const res = await api.purchaseDataPin(
          {
            network: chosen.network,
            planId: chosen.id,
            quantity: dataPinQuantity,
            businessName: cleanBiz,
            card_name: cleanBiz,
            transaction_pin: verifiedPin || '',
            idempotency_key: idempotencyKey,
          },
          idempotencyKey
        );
        if (res.status === 'pending' || res.incomplete_vouchers) {
          setPendingDataPinOrder(res.order);
          setSuccessMsg(res.message || 'Data PIN order is pending verification.');
        } else if (res.success) {
          setSuccessMsg(res.message);
          setGeneratedDataPins(res.vouchers || res.pins || []);
        }
        await refreshUser();
        await loadDataPins();
        await loadOrders();
      } catch (err: any) {
        setError(err.message || 'Data PIN generation failed.');
        await refreshUser().catch(() => {});
        await loadDataPins().catch(() => {});
        await loadOrders().catch(() => {});
      } finally {
        setLoading(false);
      }
    });
    setIsPinModalOpen(true);
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
      if (res.vouchers && res.vouchers.length > 0 && res.order) {
        const srv = res.order.service || res.order.service_type;
        if (srv === 'airtime_pin') {
          setGeneratedAirtimePins(res.vouchers);
          setPendingAirtimePinOrder(null);
        } else if (srv === 'data_pin') {
          setGeneratedDataPins(res.vouchers);
          setPendingDataPinOrder(null);
        }
        setSuccessMsg(`Vouchers verified and loaded (${res.vouchers.length} card(s)).`);
      }
      await loadOrders();
    } catch (err: any) {
      setError(err.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  // Derived Values
  const availableDataCategories =
    categoriesByNetwork[dataNetwork] && categoriesByNetwork[dataNetwork].length > 0
      ? categoriesByNetwork[dataNetwork]
      : Array.from(new Set(dataPlans.filter(p => p.network === dataNetwork).map(p => p.type)));

  const activeDataCategory =
    dataCategory && availableDataCategories.includes(dataCategory)
      ? dataCategory
      : availableDataCategories[0] || '';

  const filteredDataPlans = dataPlans.filter(p => {
    const netMatch = p.network === dataNetwork;
    const typeMatch = !activeDataCategory || p.type === activeDataCategory;
    return netMatch && typeMatch;
  });

  const selectedDataPlan =
    filteredDataPlans.find(p => p.id === selectedPlanId) || filteredDataPlans[0] || null;

  const networkAirtimePinDenoms = airtimePinDenoms.filter(d => d.network === pinNetwork);
  const selectedAirtimePinDenom =
    networkAirtimePinDenoms.find(d => d.id === selectedAirtimePinId) ||
    networkAirtimePinDenoms.find(d => d.denomination === pinDenom) ||
    networkAirtimePinDenoms[0] ||
    null;
  const airtimePinMaxQty = selectedAirtimePinDenom
    ? Math.max(1, Math.min(selectedAirtimePinDenom.max_quantity || 50, selectedAirtimePinDenom.available_stock || 0))
    : 1;
  const airtimePinUnitPrice = selectedAirtimePinDenom ? (selectedAirtimePinDenom.selling_price ?? selectedAirtimePinDenom.price) : 0;
  const airtimePinTotalCost = Math.round(airtimePinUnitPrice * pinQuantity * 100) / 100;

  const networkDataPinDenoms = dataPinDenoms.filter(d => d.network === dataPinNetwork);
  const selectedDataPinPlan =
    networkDataPinDenoms.find(d => d.id === selectedDataPinId) || networkDataPinDenoms[0] || null;
  const dataPinMaxQty = selectedDataPinPlan
    ? Math.max(1, Math.min(selectedDataPinPlan.max_quantity || 50, selectedDataPinPlan.available_stock || 0))
    : 1;
  const dataPinUnitPrice = selectedDataPinPlan ? (selectedDataPinPlan.selling_price ?? selectedDataPinPlan.price) : 0;
  const dataPinTotalCost = Math.round(dataPinUnitPrice * dataPinQuantity * 100) / 100;

  const airtimeDiscount = Math.round(((airtimeAmount * airtimeDiscountPercent) / 100) * 100) / 100;
  const airtimePayable = Math.max(0, Math.round((airtimeAmount - airtimeDiscount) * 100) / 100);

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
            <div className="text-[10px] uppercase font-bold text-slate-400">Fulfillment Engine</div>
            <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Instant Automated Delivery
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
            <span>Airtime ({airtimeDiscountPercent}% Off)</span>
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
                {airtimeDiscountPercent}% Cash Discount
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
                  <span>Discount Saved ({airtimeDiscountPercent}%):</span>
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
      {/* 2. DYNAMIC DATA BUNDLES TAB (10-STEP WORKFLOW) */}
      {/* ============================================================== */}
      {activeTab === 'data' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Data Bundle Purchase</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Select network, validate recipient number, pick data category &amp; bundle plan.
                </p>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {filteredDataPlans.length} plan{filteredDataPlans.length === 1 ? '' : 's'}
              </span>
            </div>

            <form onSubmit={handlePurchaseData} className="space-y-5">
              {/* Step 1: Select Carrier Network */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  1. Select Network Carrier
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => {
                        setDataNetwork(net);
                        setError(null);
                        setDataOrderResult(null);
                        const cats =
                          categoriesByNetwork[net] && categoriesByNetwork[net].length > 0
                            ? categoriesByNetwork[net]
                            : Array.from(new Set(dataPlans.filter(p => p.network === net).map(p => p.type)));
                        const firstCat = cats[0] || '';
                        setDataCategory(firstCat);
                        const firstPlan =
                          dataPlans.find(p => p.network === net && (!firstCat || p.type === firstCat)) ||
                          dataPlans.find(p => p.network === net);
                        setSelectedPlanId(firstPlan?.id || '');
                      }}
                      className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                        dataNetwork === net
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2 & 3: Recipient Phone & Network Match Validation */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  2. Recipient Nigerian Phone Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={dataPhone}
                    onChange={e => {
                      setDataPhone(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. 08147837664 or +2348147837664"
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => runPhoneValidation(dataNetwork, dataPhone)}
                    disabled={validatingPhone || dataPhone.replace(/\D+/g, '').length < 10}
                    className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-bold disabled:opacity-50 whitespace-nowrap"
                  >
                    {validatingPhone ? 'Checking...' : 'Validate'}
                  </button>
                </div>

                {phoneValidation && (
                  <div
                    className={`mt-2 p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      phoneValidation.valid && phoneValidation.matches_network
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {phoneValidation.valid && phoneValidation.matches_network ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-semibold">{phoneValidation.message}</div>
                      {phoneValidation.detected_network && !phoneValidation.matches_network && (
                        <button
                          type="button"
                          onClick={() => {
                            const detected = phoneValidation.detected_network as 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
                            if (['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(detected)) {
                              setDataNetwork(detected);
                              const cats =
                                categoriesByNetwork[detected] ||
                                Array.from(new Set(dataPlans.filter(p => p.network === detected).map(p => p.type)));
                              const firstCat = cats[0] || '';
                              setDataCategory(firstCat);
                              const firstPlan = dataPlans.find(p => p.network === detected && (!firstCat || p.type === firstCat));
                              setSelectedPlanId(firstPlan?.id || '');
                            }
                          }}
                          className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold"
                        >
                          Switch network to {phoneValidation.detected_network}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 4: Dynamic Data Category Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  3. Data Category / Service Type ({dataNetwork})
                </label>
                <select
                  value={activeDataCategory}
                  onChange={e => {
                    const nextCat = e.target.value;
                    setDataCategory(nextCat);
                    const firstInCat = dataPlans.find(
                      p => p.network === dataNetwork && p.type === nextCat
                    );
                    setSelectedPlanId(firstInCat?.id || '');
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                  required
                >
                  {availableDataCategories.length === 0 ? (
                    <option value="">No active categories for {dataNetwork}</option>
                  ) : (
                    availableDataCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Step 5: Dynamic Data Plan Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  4. Select Data Plan ({activeDataCategory || dataNetwork})
                </label>
                <select
                  value={selectedDataPlan?.id || ''}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                  required
                >
                  {filteredDataPlans.length === 0 ? (
                    <option value="">No active plans in this category</option>
                  ) : (
                    filteredDataPlans.map(plan => (
                      <option key={plan.id} value={plan.id}>
                        {plan.size} ({plan.type}) — {plan.validity} — ₦{plan.price.toLocaleString()}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Step 6: Submit & PIN Confirmation */}
              <button
                type="submit"
                disabled={
                  loading ||
                  validatingPhone ||
                  !selectedDataPlan ||
                  Boolean(phoneValidation && (!phoneValidation.valid || !phoneValidation.matches_network))
                }
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Data Order...</span>
                  </>
                ) : (
                  <>
                    <span>
                      Buy {selectedDataPlan?.size || 'Data'} ({dataNetwork}) — ₦
                      {(selectedDataPlan?.price ?? 0).toLocaleString()}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 space-y-5">
            {/* Order Summary & Confirmation Card */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <h3 className="text-sm font-bold text-white">Order Summary</h3>
              {selectedDataPlan ? (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Carrier Network:</span>
                    <span className="font-bold text-white">{selectedDataPlan.network}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Data Category:</span>
                    <span className="font-semibold text-emerald-400">{selectedDataPlan.type}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Bundle Size:</span>
                    <span className="font-bold text-white">{selectedDataPlan.size}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Plan Name:</span>
                    <span className="font-semibold text-slate-200 text-right">{selectedDataPlan.name}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Validity Period:</span>
                    <span className="font-semibold text-white">{selectedDataPlan.validity}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Recipient Number:</span>
                    <span className="font-mono font-bold text-white">
                      {phoneValidation?.formatted_phone || dataPhone || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/30">
                    <span className="font-bold text-slate-200">Total Price (Wallet Debit):</span>
                    <span className="font-mono text-emerald-400 font-black text-base">
                      ₦{(selectedDataPlan.price ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">Select a network, category, and plan to review your order.</div>
              )}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <span className="font-bold text-white">Wallet &amp; Refund Guarantee:</span> All data bundle purchases are verified against your Transaction PIN and carrier prefix rules, with automatic wallet refund if delivery fails.
              </div>
            </div>

            {dataOrderResult && (
              <div
                className={`rounded-2xl border p-5 space-y-3 text-xs ${
                  dataOrderResult.status === 'successful'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : dataOrderResult.status === 'pending'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-rose-500/10 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-white text-sm">Data Order Receipt</span>
                  <span className="px-2 py-0.5 rounded uppercase text-[10px] font-bold bg-slate-900 text-emerald-400">
                    {dataOrderResult.status}
                  </span>
                </div>
                <p className="text-slate-200 font-medium">{dataOrderResult.message}</p>
                <div className="space-y-1 text-[11px] font-mono text-slate-300 bg-slate-950/70 p-3 rounded-xl">
                  <div>Ref: {dataOrderResult.reference}</div>
                  <div>Plan: {dataOrderResult.plan}</div>
                  <div>Recipient: {dataOrderResult.phone}</div>
                  <div>Charged: ₦{dataOrderResult.amount.toLocaleString()}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('history');
                    loadOrders();
                  }}
                  className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs"
                >
                  Open Orders &amp; Receipts
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* 3. AIRTIME PIN GENERATOR (RECHARGE CARD PRINTING) */}
      {/* ============================================================== */}
      {activeTab === 'airtime_pin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Airtime PIN Recharge Card Generator</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Live Ulamadata PIN denominations, stock counts, and HambakTech selling prices.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAirtimePins}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Stock</span>
              </button>
            </div>

            {networkAirtimePinDenoms.length > 0 && networkAirtimePinDenoms.every(d => !d.in_stock || d.available_stock <= 0) && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Carrier Stock Currently Depleted:</span>{' '}
                  {pinNetwork} Airtime PINs currently report <span className="font-mono font-bold">0 in stock</span> from Ulamadata. Purchases are safely blocked until live stock replenishes.
                </div>
              </div>
            )}

            <form onSubmit={handlePurchaseAirtimePin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => {
                    const netHasStock = airtimePinDenoms.some(d => d.network === net && d.in_stock && d.available_stock > 0);
                    return (
                      <button
                        key={net}
                        type="button"
                        onClick={() => {
                          setPinNetwork(net);
                          const match = airtimePinDenoms.filter(d => d.network === net);
                          const best = match.find(d => d.in_stock) || match[0];
                          if (best) {
                            setSelectedAirtimePinId(best.id);
                            setPinDenom(best.denomination);
                          }
                        }}
                        className={`py-3 text-center rounded-xl text-xs font-black transition-all border ${
                          pinNetwork === net
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div>{net}</div>
                        <div className={`text-[9px] font-semibold mt-0.5 ${netHasStock ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {netHasStock ? 'In Stock' : 'Out of Stock'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Live Denominations ({pinNetwork})
                </label>
                {networkAirtimePinDenoms.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                    {airtimePinCatalogueStatus || `No active ${pinNetwork} Airtime PIN denominations synced yet.`}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {networkAirtimePinDenoms.map(denom => {
                      const isSelected = selectedAirtimePinDenom?.id === denom.id;
                      const unitPrice = denom.selling_price ?? denom.price;
                      return (
                        <button
                          key={denom.id}
                          type="button"
                          onClick={() => {
                            setSelectedAirtimePinId(denom.id);
                            setPinDenom(denom.denomination);
                            if (denom.in_stock && denom.available_stock > 0) {
                              setPinQuantity(q => Math.max(1, Math.min(q, Math.min(denom.max_quantity || 50, denom.available_stock))));
                            }
                          }}
                          className={`p-3 text-left rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-slate-800 border-emerald-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          } ${!denom.in_stock ? 'opacity-70' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-white">₦{denom.denomination.toLocaleString()}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                denom.in_stock
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-rose-500/15 text-rose-400'
                              }`}
                            >
                              {denom.in_stock ? `${denom.available_stock} left` : 'Out'}
                            </span>
                          </div>
                          <div className="text-emerald-400 font-mono font-bold text-xs mt-1">
                            Pay ₦{unitPrice.toLocaleString()}
                          </div>
                          {denom.discount_percent > 0 && (
                            <div className="text-[9px] text-amber-400 font-semibold mt-0.5">
                              Save {denom.discount_percent}%
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Quantity (Max {selectedAirtimePinDenom ? `${airtimePinMaxQty} available` : '0'})
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, airtimePinMaxQty)}
                    disabled={!selectedAirtimePinDenom || !selectedAirtimePinDenom.in_stock}
                    value={pinQuantity}
                    onChange={e =>
                      setPinQuantity(Math.max(1, Math.min(Math.max(1, airtimePinMaxQty), Number(e.target.value) || 1)))
                    }
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono disabled:opacity-50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business / Card Name</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={pinBusinessName}
                    onChange={e => setPinBusinessName(e.target.value)}
                    placeholder="e.g. HambakTech Enterprise"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Unit Price ({pinNetwork} ₦{(selectedAirtimePinDenom?.denomination ?? pinDenom).toLocaleString()}):</span>
                  <span className="font-mono text-white">₦{airtimePinUnitPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                  <span className="text-slate-300 font-semibold">Total Wallet Charge:</span>
                  <span className="font-mono text-emerald-400 font-black text-base">
                    ₦{airtimePinTotalCost.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !selectedAirtimePinDenom ||
                  !selectedAirtimePinDenom.in_stock ||
                  selectedAirtimePinDenom.available_stock <= 0 ||
                  airtimePinUnitPrice <= 0
                }
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Airtime PINs...</span>
                  </>
                ) : !selectedAirtimePinDenom || !selectedAirtimePinDenom.in_stock ? (
                  <span>Currently Out of Stock — Purchase Disabled</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      Generate {pinQuantity}x ₦{selectedAirtimePinDenom.denomination.toLocaleString()} {pinNetwork} PIN(s)
                    </span>
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
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs flex items-center gap-1.5 font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Cards</span>
                </button>
              )}
            </h3>

            {pendingAirtimePinOrder && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 text-xs">
                <div className="font-bold text-amber-300">Order Pending Verification ({pendingAirtimePinOrder.provider_ref || pendingAirtimePinOrder.reference})</div>
                <p className="text-slate-300">
                  Vouchers are still settling upstream. Do not retry payment — click Requery to fetch verified PINs once complete.
                </p>
                <button
                  type="button"
                  onClick={() => handleQueryStatus(pendingAirtimePinOrder.provider_ref || pendingAirtimePinOrder.id)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px]"
                >
                  Verify &amp; Fetch Vouchers
                </button>
              </div>
            )}

            {generatedAirtimePins.length === 0 && !pendingAirtimePinOrder ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Verified airtime recharge PINs, paired serial numbers, dial codes, and balance check codes will appear here ready to copy or print.
              </div>
            ) : (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {generatedAirtimePins.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-black text-emerald-400">
                        {item.network || pinNetwork} ₦{(item.value ?? pinDenom).toLocaleString()} RECHARGE
                      </span>
                      <span className="font-bold text-slate-400">{item.card_name || pinBusinessName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="font-mono text-base font-black text-white tracking-widest">{item.pin}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.pin, `PIN #${idx + 1}`)}
                        className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy PIN</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.serial, `Serial #${idx + 1}`)}
                        className="hover:text-white flex items-center gap-1"
                      >
                        <span>SN: {item.serial}</span>
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                      {item.load_code && <span className="text-amber-400">Dial: {item.load_code}</span>}
                    </div>
                    {item.check_balance && (
                      <div className="text-[10px] text-slate-500 font-mono">Check Balance: {item.check_balance}</div>
                    )}
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
              <button
                type="button"
                onClick={loadDataPins}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {(!dataPinAvailable || networkDataPinDenoms.length === 0) && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">Data PIN Catalogue Awaiting Provider Confirmation</div>
                  <p className="mt-1 text-slate-300">
                    {dataPinCatalogueStatus ||
                      'Awaiting confirmed Ulamadata Data PIN plan IDs and pricing. Data PIN purchases are safely disabled so ordinary data plans are never mischarged or misrouted.'}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handlePurchaseDataPin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Carrier Network</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => {
                        setDataPinNetwork(net);
                        const match = dataPinDenoms.find(d => d.network === net);
                        setSelectedDataPinId(match ? match.id : '');
                      }}
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
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Data PIN Plan</label>
                {networkDataPinDenoms.length === 0 ? (
                  <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">
                    No verified {dataPinNetwork} Data PIN plans are enabled yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {networkDataPinDenoms.map(denom => (
                      <button
                        key={denom.id}
                        type="button"
                        onClick={() => setSelectedDataPinId(denom.id)}
                        className={`p-3 text-left rounded-xl border transition-all ${
                          selectedDataPinPlan?.id === denom.id
                            ? 'bg-slate-800 border-emerald-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-white text-sm">{denom.size}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              denom.in_stock ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {denom.in_stock ? `${denom.available_stock} left` : 'Out'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{denom.validity || '30 Days'}</div>
                        <div className="text-emerald-400 font-mono font-bold text-xs mt-1">
                          ₦{(denom.selling_price ?? denom.price).toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Quantity (Max {selectedDataPinPlan ? dataPinMaxQty : 0})
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, dataPinMaxQty)}
                    disabled={!selectedDataPinPlan || !selectedDataPinPlan.in_stock}
                    value={dataPinQuantity}
                    onChange={e =>
                      setDataPinQuantity(Math.max(1, Math.min(Math.max(1, dataPinMaxQty), Number(e.target.value) || 1)))
                    }
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono disabled:opacity-50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Name on Card</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={dataPinBusinessName}
                    onChange={e => setDataPinBusinessName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    required
                  />
                </div>
              </div>

              {selectedDataPinPlan && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold">Total Wallet Charge:</span>
                  <span className="font-mono text-emerald-400 font-black text-base">
                    ₦{dataPinTotalCost.toLocaleString()}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  !dataPinAvailable ||
                  !selectedDataPinPlan ||
                  !selectedDataPinPlan.in_stock ||
                  selectedDataPinPlan.available_stock <= 0
                }
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Data PINs...</span>
                  </>
                ) : !selectedDataPinPlan || !dataPinAvailable ? (
                  <span>Data PIN Temporarily Disabled</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
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
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs flex items-center gap-1.5 font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Cards</span>
                </button>
              )}
            </h3>

            {pendingDataPinOrder && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <div className="font-bold text-amber-300">Data PIN Order Pending Verification</div>
                <button
                  type="button"
                  onClick={() => handleQueryStatus(pendingDataPinOrder.provider_ref || pendingDataPinOrder.id)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px]"
                >
                  Verify &amp; Fetch Vouchers
                </button>
              </div>
            )}

            {generatedDataPins.length === 0 && !pendingDataPinOrder ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                Verified Data PIN vouchers paired with serial numbers and USSD loading instructions will appear here.
              </div>
            ) : (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {generatedDataPins.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-black text-emerald-400">{item.network || dataPinNetwork} {item.denomination_label || 'DATA PIN'}</span>
                      <span className="font-bold text-slate-400">{item.card_name || dataPinBusinessName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="font-mono text-base font-black text-white tracking-widest">{item.pin}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.pin, `Data PIN #${idx + 1}`)}
                        className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>SN: {item.serial}</span>
                      {item.load_code && <span className="text-amber-400">{item.load_code}</span>}
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
                  const val = e.target.value;
                  setHistoryFilterService(val);
                  loadOrders(val);
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
              onClick={() => loadOrders()}
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
                        <td className="py-3.5 px-4 text-slate-200">
                          <div>{o.plan}</div>
                          {(o.voucher_count ?? 0) > 0 && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-400">
                              {o.voucher_count} verified voucher(s)
                            </span>
                          )}
                        </td>
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
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openOrderReceiptModal(o)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-[10px] flex items-center gap-1"
                            >
                              <Receipt className="w-3 h-3" />
                              <span>{(o.service === 'airtime_pin' || o.service === 'data_pin') ? 'PINs / Receipt' : 'Receipt'}</span>
                            </button>
                            {o.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleQueryStatus(o.id)}
                                className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-[10px]"
                              >
                                Verify
                              </button>
                            )}
                          </div>
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
      {/* RECEIPT MODAL (WITH PROTECTED VOUCHER DISPLAY) */}
      {/* ============================================================== */}
      {selectedOrderReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <h3 className="font-black text-white text-sm">Official Transaction Receipt</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedOrderReceipt(null);
                  setReceiptVouchers([]);
                }}
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
                <span>Card Name / Recipient:</span>
                <span className="font-mono text-white">{selectedOrderReceipt.phone}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Order Reference:</span>
                <span className="font-mono text-slate-300 text-[11px]">{selectedOrderReceipt.provider_ref}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Timestamp:</span>
                <span className="text-slate-300">
                  {new Date(selectedOrderReceipt.created_at).toLocaleString('en-NG')}
                </span>
              </div>
            </div>

            {(selectedOrderReceipt.service === 'airtime_pin' || selectedOrderReceipt.service === 'data_pin') && (
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-white">Verified Recharge Vouchers</div>
                {loadingReceiptVouchers ? (
                  <div className="p-4 text-center text-xs text-slate-400 rounded-xl bg-slate-950 border border-slate-800">
                    Loading stored PIN vouchers...
                  </div>
                ) : receiptVouchers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
                    {selectedOrderReceipt.status === 'pending'
                      ? 'Vouchers will appear here once provider verification settles.'
                      : 'No vouchers attached to this order.'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {receiptVouchers.map((v, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-black text-emerald-400">
                            #{v.index || i + 1} &bull; {v.denomination_label || selectedOrderReceipt.network}
                          </span>
                          {v.load_code && <span className="font-mono text-amber-400">Dial: {v.load_code}</span>}
                        </div>
                        <div className="flex items-center justify-between bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                          <span className="font-mono font-black text-white tracking-wider">{v.pin}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(v.pin, `Receipt PIN #${i + 1}`)}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy PIN</span>
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">SN: {v.serial}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedOrderReceipt(null);
                  setReceiptVouchers([]);
                }}
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
        onSuccess={verifiedPin => {
          setIsPinModalOpen(false);
          if (pendingPinAction) pendingPinAction(verifiedPin);
        }}
        title={pinModalTitle}
        description={pinModalDesc}
        amount={pinModalAmount}
      />
    </div>
  );
};
