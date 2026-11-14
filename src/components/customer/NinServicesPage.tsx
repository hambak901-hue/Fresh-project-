/**
 * @file NinServicesPage.tsx
 * Customer NIN & Identity Services Workspace.
 * Clean, responsive, Light/Dark-mode workflow for NIN Verification (Search Type + Slip Type +
 * Dynamic Specimen Preview & Pricing + Consent + Verify & Debit Wallet + Authentic Report & PDF/Print),
 * alongside BVN, Modification, Enrolment, Additional Services, and Verification History.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import {
  VerificationRecord,
  IdentityService,
  SlipTemplateItem,
  ModificationServiceItem,
  ModificationRequestItem,
} from '../../types';
import { IdentitySlipModal } from './IdentitySlipModal';
import { TransactionPinModal } from './TransactionPinModal';
import { ModificationSection, getModificationStatusStyle } from './ModificationSection';
import { downloadVerificationReportPdf, extractVerificationReport } from '../../lib/pdfReport';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Download,
  Printer,
  ArrowRight,
  RefreshCw,
  FileText,
  Phone,
  Edit3,
  UserCheck,
  GraduationCap,
  Briefcase,
  Eye,
  Star,
  Wallet,
  Loader2,
  Lock,
} from 'lucide-react';

type HubCategory = 'nin_verify' | 'bvn_verify' | 'nin_mod' | 'bvn_mod' | 'enrolment' | 'additional' | 'history';
type NinSearchType = 'nin_v1' | 'phone_v1' | 'demo_v1' | 'vnin_verification';
type BvnSearchMode = 'bvn_number' | 'bvn_retrieval';

const PENDING_RECOVERY_KEY = 'hambak_pending_nin_recovery';

interface PendingRecoveryAttempt {
  idempotencyKey: string;
  serviceKey: string;
  searchValue: string;
  slipType?: string;
  slipName?: string;
  startedAt: string;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `idemp_${crypto.randomUUID()}`;
  }
  return `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const NinServicesPage: React.FC = () => {
  const { user, refreshUser, updateBalance } = useAuth();
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';

  const [activeCategory, setActiveCategory] = useState<HubCategory>('nin_verify');
  const [services, setServices] = useState<IdentityService[]>([]);
  const [categories, setCategories] = useState<Record<string, IdentityService[]>>({});
  const [slipTemplates, setSlipTemplates] = useState<SlipTemplateItem[]>([]);
  const [previewModalTemplate, setPreviewModalTemplate] = useState<SlipTemplateItem | null>(null);
  const [loadingServices, setLoadingServices] = useState<boolean>(true);

  // NIN Verification Form State (includes NIN Number, Phone Number, Demographic Verification)
  const [ninSearchType, setNinSearchType] = useState<NinSearchType>('nin_v1');
  const [ninInputValue, setNinInputValue] = useState<string>('');
  const [demoFirstName, setDemoFirstName] = useState<string>('');
  const [demoLastName, setDemoLastName] = useState<string>('');
  const [demoDob, setDemoDob] = useState<string>('');
  const [demoGender, setDemoGender] = useState<'m' | 'f'>('m');
  const [selectedSlipId, setSelectedSlipId] = useState<string>('');

  // BVN Verification Form State
  const [bvnSearchMode, setBvnSearchMode] = useState<BvnSearchMode>('bvn_number');
  const [bvnInputValue, setBvnInputValue] = useState<string>('');
  const [bvnFirstName, setBvnFirstName] = useState<string>('');
  const [bvnLastName, setBvnLastName] = useState<string>('');
  const [selectedBvnSlipId, setSelectedBvnSlipId] = useState<string>('');

  const [selectedServiceKey, setSelectedServiceKey] = useState<string>('nin_v1');
  const [formData, setFormData] = useState<Record<string, any>>({
    slip_type: 'ninStandard',
    tier: 'basic',
    gender: 'F',
  });

  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);

  const [modBanks, setModBanks] = useState<Array<{ bank_name: string; price: number }>>([]);
  const [enrollBanks, setEnrollBanks] = useState<Array<{ bank_name: string; price: number }>>([]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const inFlightRef = useRef<boolean>(false);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const [recoveryAttempt, setRecoveryAttempt] = useState<PendingRecoveryAttempt | null>(() => {
    try {
      const saved = sessionStorage.getItem(PENDING_RECOVERY_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [recovering, setRecovering] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verifiedRecord, setVerifiedRecord] = useState<any | null>(null);
  const [activeSlipRecord, setActiveSlipRecord] = useState<any | null>(null);
  const [slipModalOpen, setSlipModalOpen] = useState<boolean>(false);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [photoLoadError, setPhotoLoadError] = useState<boolean>(false);

  const [history, setHistory] = useState<VerificationRecord[]>([]);
  const [modHistory, setModHistory] = useState<ModificationRequestItem[]>([]);
  const [historyTabFilter, setHistoryTabFilter] = useState<'instant' | 'nin_mod' | 'bvn_mod'>('instant');
  const [ninModServices, setNinModServices] = useState<ModificationServiceItem[]>([]);
  const [bvnModServices, setBvnModServices] = useState<ModificationServiceItem[]>([]);
  const [loadingModServices, setLoadingModServices] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [pollingRef, setPollingRef] = useState<string | null>(null);

  useEffect(() => {
    setPhotoLoadError(false);
  }, [verifiedRecord]);

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadHistory();
    }
  }, [user?.id, historySearch]);

  const loadCatalog = async () => {
    try {
      setLoadingServices(true);
      setLoadingModServices(true);
      const [res, modRes] = await Promise.all([
        api.getVerificationServices(),
        api.getModificationServices().catch(() => null),
      ]);
      if (modRes?.success) {
        setNinModServices(modRes.nin_modification || []);
        setBvnModServices(modRes.bvn_modification || []);
      }
      if (res.success) {
        setServices(res.services || []);
        setCategories(res.categories || {});
        let templates: SlipTemplateItem[] = res.slipTemplates || [];
        if (templates.length === 0) {
          const st = await api.getSlipTemplates().catch(() => null);
          if (st?.templates) templates = st.templates;
        }
        setSlipTemplates(templates);

        const activeNinSlipsList = templates
          .filter(t => t.category === 'NIN' && t.is_active !== false)
          .sort((a, b) => a.display_order - b.display_order);

        if (activeNinSlipsList.length > 0 && !selectedSlipId) {
          const recommended = activeNinSlipsList.find(s => s.is_recommended) || activeNinSlipsList[0];
          setSelectedSlipId(recommended.id);
        }

        const activeBvnSlipsList = templates
          .filter(t => t.category === 'BVN' && t.is_active !== false)
          .sort((a, b) => a.display_order - b.display_order);

        if (activeBvnSlipsList.length > 0 && !selectedBvnSlipId) {
          const recommendedBvn = activeBvnSlipsList.find(s => s.is_recommended) || activeBvnSlipsList[0];
          setSelectedBvnSlipId(recommendedBvn.id);
        }
      }
    } catch (e) {
      console.warn('Unable to load identity services catalog:', e);
    } finally {
      setLoadingServices(false);
      setLoadingModServices(false);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const [verRes, modRes] = await Promise.all([
        api.getVerificationHistory(undefined, historySearch.trim() || undefined),
        api.getModificationHistory({
          identity_type: 'ALL',
          search: historySearch.trim() || undefined,
          limit: 50,
        }).catch(() => null),
      ]);
      if (verRes && verRes.success) {
        setHistory(verRes.verifications || []);
      }
      if (modRes && modRes.success) {
        setModHistory(modRes.requests || []);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (selectedServiceKey === 'bvn_modification' && modBanks.length === 0) {
      api.getBvnModificationBanks().then(res => {
        if (res.success) setModBanks(res.data);
      }).catch(() => {});
    }
    if ((selectedServiceKey === 'bvn_enroll_adult' || selectedServiceKey === 'bvn_enroll_child') && enrollBanks.length === 0) {
      api.getBvnEnrollmentBanks().then(res => {
        if (res.success) setEnrollBanks(res.data);
      }).catch(() => {});
    }
  }, [selectedServiceKey]);

  const activeNinSlips = useMemo(() => {
    return slipTemplates
      .filter(t => t.category === 'NIN' && t.is_active !== false)
      .sort((a, b) => a.display_order - b.display_order);
  }, [slipTemplates]);

  const activeBvnSlips = useMemo(() => {
    return slipTemplates
      .filter(t => t.category === 'BVN' && t.is_active !== false)
      .sort((a, b) => a.display_order - b.display_order);
  }, [slipTemplates]);

  useEffect(() => {
    if (activeNinSlips.length === 0) return;
    const exists = activeNinSlips.some(s => s.id === selectedSlipId || s.slip_code === selectedSlipId);
    if (!selectedSlipId || !exists) {
      const recommended = activeNinSlips.find(s => s.is_recommended) || activeNinSlips[0];
      setSelectedSlipId(recommended.id);
    }
  }, [activeNinSlips, selectedSlipId]);

  useEffect(() => {
    if (activeBvnSlips.length === 0) return;
    const exists = activeBvnSlips.some(s => s.id === selectedBvnSlipId || s.slip_code === selectedBvnSlipId);
    if (!selectedBvnSlipId || !exists) {
      const recommended = activeBvnSlips.find(s => s.is_recommended) || activeBvnSlips[0];
      setSelectedBvnSlipId(recommended.id);
    }
  }, [activeBvnSlips, selectedBvnSlipId]);

  const selectedNinSlip = useMemo(() => {
    return activeNinSlips.find(s => s.id === selectedSlipId || s.slip_code === selectedSlipId) || activeNinSlips[0] || null;
  }, [activeNinSlips, selectedSlipId]);

  const selectedBvnSlip = useMemo(() => {
    return activeBvnSlips.find(s => s.id === selectedBvnSlipId || s.slip_code === selectedBvnSlipId) || activeBvnSlips[0] || null;
  }, [activeBvnSlips, selectedBvnSlipId]);

  const enabledServices = useMemo(() => {
    return services.filter(s => s.enabled !== false);
  }, [services]);

  const ninNumberServiceKey = useMemo(() => {
    for (const k of ['nin_v1', 'nin_v2', 'nin_v3']) {
      if (enabledServices.some(s => s.key === k)) return k;
    }
    return 'nin_v1';
  }, [enabledServices]);

  const ninPhoneServiceKey = useMemo(() => {
    for (const k of ['phone_v1', 'phone_v2', 'phone_v3']) {
      if (enabledServices.some(s => s.key === k)) return k;
    }
    return 'phone_v1';
  }, [enabledServices]);

  const ninDemoServiceKey = useMemo(() => {
    for (const k of ['demo_v1', 'demo_v2', 'demo_v3']) {
      if (enabledServices.some(s => s.key === k)) return k;
    }
    return 'demo_v1';
  }, [enabledServices]);

  const vninAvailable = useMemo(() => {
    if (services.length === 0) return false;
    return enabledServices.some(s => s.key === 'vnin_verification');
  }, [services.length, enabledServices]);

  const ninTargetServiceKey =
    ninSearchType === 'phone_v1'
      ? ninPhoneServiceKey
      : ninSearchType === 'demo_v1'
      ? ninDemoServiceKey
      : ninSearchType === 'vnin_verification'
      ? 'vnin_verification'
      : ninNumberServiceKey;

  const bvnServicesList = useMemo(() => {
    return (categories.bvn_verification || services.filter(s => s.category === 'bvn_verification'))
      .filter(s => s.enabled !== false);
  }, [categories, services]);

  const bvnNumberServiceKey = useMemo(() => {
    const preferred = ['bvn_v1', 'bvn_v2', 'bvn_v3'];
    for (const k of preferred) {
      if (bvnServicesList.some(s => s.key === k)) return k;
    }
    return bvnServicesList.find(s => s.key !== 'bvn_retrieval')?.key || 'bvn_v1';
  }, [bvnServicesList]);

  const bvnRetrievalAvailable = useMemo(() => {
    if (services.length === 0) return true;
    return bvnServicesList.some(s => s.key === 'bvn_retrieval');
  }, [services.length, bvnServicesList]);

  const bvnTargetServiceKey = bvnSearchMode === 'bvn_retrieval' ? 'bvn_retrieval' : bvnNumberServiceKey;

  const demoVerificationAvailable = useMemo(() => {
    if (services.length === 0) return true;
    return ['demo_v1', 'demo_v2', 'demo_v3'].some(k => enabledServices.some(s => s.key === k));
  }, [services.length, enabledServices]);

  const activeServiceKey =
    activeCategory === 'nin_verify'
      ? ninTargetServiceKey
      : activeCategory === 'bvn_verify'
      ? bvnTargetServiceKey
      : selectedServiceKey;

  const currentService = useMemo(() => {
    return (
      services.find(s => s.key === activeServiceKey) ||
      services[0] || {
        key: activeServiceKey,
        name:
          ninSearchType === 'phone_v1'
            ? 'NIN Search via Phone Number'
            : ninSearchType === 'demo_v1'
            ? 'NIN Verification via Demographic Data'
            : ninSearchType === 'vnin_verification'
            ? 'Virtual NIN (VNIN) Verification'
            : activeServiceKey === 'bvn_retrieval'
            ? 'BVN Retrieval via Phone Number'
            : activeServiceKey.startsWith('bvn_')
            ? 'BVN Verification'
            : 'NIN Verification',
        category: activeCategory === 'bvn_verify' ? 'bvn_verification' : 'nin_verification',
        price: activeServiceKey === 'bvn_retrieval' ? 1200 : activeCategory === 'bvn_verify' ? 250 : 200,
        required_fields:
          activeServiceKey.startsWith('phone_') || activeServiceKey === 'bvn_retrieval'
            ? ['phone', 'slip_type']
            : activeServiceKey.startsWith('demo_')
            ? ['firstname', 'lastname', 'dob', 'gender', 'slip_type']
            : activeServiceKey.startsWith('bvn_')
            ? ['bvn', 'slip_type']
            : ['nin', 'slip_type'],
        description:
          activeCategory === 'bvn_verify'
            ? 'Verify Bank Verification Number details and generate an authorized BVN slip report.'
            : 'Verify National Identification Number details.',
        slip_type_supported: activeServiceKey !== 'vnin_verification',
      }
    );
  }, [services, activeServiceKey, activeCategory, ninSearchType]);

  const computeBvnSlipPrice = (slip: SlipTemplateItem | null): number => {
    const servicePrice = Number((currentService as any).price ?? (currentService as any).selling_price ?? 0);
    const slipPrice =
      slip?.price !== null && slip?.price !== undefined && Number(slip.price) > 0
        ? Number(slip.price)
        : 0;
    if (bvnSearchMode === 'bvn_retrieval') {
      return Math.max(servicePrice || 1200, slipPrice);
    }
    if ((currentService as any).slip_type_supported === false && servicePrice > 0) {
      return servicePrice;
    }
    return slipPrice > 0 ? slipPrice : servicePrice;
  };

  const finalCharge = useMemo(() => {
    const servicePrice = Number((currentService as any).price ?? (currentService as any).selling_price ?? 0);
    if (activeCategory === 'nin_verify') {
      if ((currentService as any).slip_type_supported === false && servicePrice > 0) {
        return servicePrice;
      }
      if (selectedNinSlip?.price !== null && selectedNinSlip?.price !== undefined && Number(selectedNinSlip.price) > 0) {
        return Number(selectedNinSlip.price);
      }
    }
    if (activeCategory === 'bvn_verify') {
      return computeBvnSlipPrice(selectedBvnSlip);
    }
    return servicePrice;
  }, [activeCategory, selectedNinSlip, selectedBvnSlip, currentService, bvnSearchMode]);

  const walletBalance = Number(user?.wallet_balance ?? 0);
  const insufficientBalance = walletBalance < finalCharge;

  const resetIdempotency = () => {
    idempotencyKeyRef.current = createIdempotencyKey();
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
    resetIdempotency();
  };

  const handleSwitchCategory = (cat: HubCategory) => {
    setActiveCategory(cat);
    setVerifiedRecord(null);
    setError(null);
    setSuccessMessage(null);
    resetIdempotency();

    if (cat === 'nin_verify') setSelectedServiceKey(ninTargetServiceKey);
    if (cat === 'bvn_verify') setSelectedServiceKey(bvnTargetServiceKey);
    if (cat === 'nin_mod') {
      const firstMod = (categories.nin_modification || [])[0];
      setSelectedServiceKey(firstMod?.key || 'nin_mod_name');
    }
    if (cat === 'enrolment') {
      const firstEnroll = (categories.enrolment || [])[0];
      setSelectedServiceKey(firstEnroll?.key || 'bvn_enroll_adult');
    }
    if (cat === 'additional') {
      const firstAdd = (categories.additional_services || []).filter(s => !s.key.toLowerCase().startsWith('demo_'))[0];
      setSelectedServiceKey(firstAdd?.key || '');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || inFlightRef.current) return;

    setError(null);
    setSuccessMessage(null);

    if (!consentAccepted) {
      setError('Please confirm that you have obtained authorization from the individual before submitting.');
      return;
    }

    if (activeCategory === 'nin_verify') {
      if ((currentService as any).slip_type_supported !== false && !selectedNinSlip) {
        setError('No active slip format is currently available. Please contact support.');
        return;
      }
      if (ninSearchType === 'demo_v1') {
        if (!demoFirstName.trim() || !demoLastName.trim()) {
          setError('Please enter both First Name and Surname for Demographic Verification.');
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(demoDob)) {
          setError('Please select a valid Date of Birth (YYYY-MM-DD) for Demographic Verification.');
          return;
        }
      } else if (ninSearchType === 'vnin_verification') {
        const digitsOnly = ninInputValue.replace(/\s+/g, '');
        if (!/^\d{11}$/.test(digitsOnly)) {
          setError('Please enter a valid 11-digit NIN for VNIN slip verification.');
          return;
        }
      } else {
        const digitsOnly = ninInputValue.replace(/\s+/g, '');
        if (ninSearchType === 'nin_v1') {
          if (!/^\d{11}$/.test(digitsOnly)) {
            setError('Please enter a valid 11-digit National Identification Number (NIN).');
            return;
          }
        } else {
          if (!/^\d{11}$/.test(digitsOnly)) {
            setError('Please enter a valid 11-digit Nigerian Phone Number (e.g. 08012345678).');
            return;
          }
        }
      }
      if (insufficientBalance) {
        setError(`Insufficient wallet balance. Available: ₦${walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}, Required: ₦${finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. Please fund your wallet.`);
        return;
      }
    } else if (activeCategory === 'bvn_verify') {
      if (!selectedBvnSlip) {
        setError('No active BVN slip format is currently available. Please contact support.');
        return;
      }
      const digitsOnly = bvnInputValue.replace(/\s+/g, '');
      if (bvnSearchMode === 'bvn_number') {
        if (!/^\d{11}$/.test(digitsOnly)) {
          setError('Please enter a valid 11-digit Bank Verification Number (BVN).');
          return;
        }
      } else {
        if (!bvnFirstName.trim() || !bvnLastName.trim()) {
          setError('Please enter both First Name and Last Name for BVN Retrieval.');
          return;
        }
        if (!/^\d{11}$/.test(digitsOnly)) {
          setError('Please enter a valid 11-digit Phone Number linked to the BVN (e.g. 08012345678).');
          return;
        }
      }
      if (insufficientBalance) {
        setError(`Insufficient wallet balance. Available: ₦${walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}, Required: ₦${finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. Please fund your wallet.`);
        return;
      }
    } else {
      for (const field of currentService.required_fields || []) {
        if (!formData[field] || String(formData[field]).trim() === '') {
          setError(`Please complete the required field: ${field.replace(/_/g, ' ').toUpperCase()}.`);
          return;
        }
      }
      if (formData.nin && !/^\d{11}$/.test(String(formData.nin).trim()) && currentService.key !== 'vnin_verification') {
        setError('National Identification Number (NIN) must be exactly 11 digits.');
        return;
      }
      if (formData.bvn && !/^\d{11}$/.test(String(formData.bvn).trim())) {
        setError('Bank Verification Number (BVN) must be exactly 11 digits.');
        return;
      }
    }

    if (user?.has_transaction_pin) {
      setPinModalOpen(true);
    } else {
      executeVerification();
    }
  };

  const clearRecoveryAttempt = () => {
    setRecoveryAttempt(null);
    try {
      sessionStorage.removeItem(PENDING_RECOVERY_KEY);
    } catch {
    }
  };

  const saveRecoveryAttempt = (attempt: PendingRecoveryAttempt) => {
    setRecoveryAttempt(attempt);
    try {
      sessionStorage.setItem(PENDING_RECOVERY_KEY, JSON.stringify(attempt));
    } catch {
    }
  };

  const applyRecoveredRecord = (
    rec: any,
    fallbackMeta?: { serviceKey?: string; searchValue?: string; slipType?: string; slipName?: string | null }
  ) => {
    const recordObj = rec.record || {};
    const resultData = rec.result || recordObj.result || {};
    const recordPayload = {
      id: rec.recordId || recordObj.id,
      data: resultData,
      result: resultData,
      service_key: recordObj.service_key || fallbackMeta?.serviceKey || activeServiceKey,
      type: recordObj.type || currentService.category,
      search_value: recordObj.search_value || fallbackMeta?.searchValue || '',
      reference: rec.reference || recordObj.reference,
      slip_type: rec.slip_type || recordObj.slip_type || fallbackMeta?.slipType,
      slip_name: rec.slip_name || fallbackMeta?.slipName,
      has_original_pdf: Boolean(rec.has_original_pdf || resultData?.pdf_base64 || resultData?.pdf_url),
      status: 'completed',
      verified_at: recordObj.created_at || new Date().toISOString(),
      created_at: recordObj.created_at || new Date().toISOString(),
    };
    setVerifiedRecord(recordPayload);
    setActiveSlipRecord(recordPayload);
    if (typeof rec.newBalance === 'number') {
      updateBalance(rec.newBalance);
    }
    clearRecoveryAttempt();
    resetIdempotency();
    void Promise.allSettled([refreshUser(), loadHistory()]);
  };

  const handleRecoverAttempt = async (attemptOverride?: PendingRecoveryAttempt) => {
    const target = attemptOverride || recoveryAttempt;
    if (!target || recovering) return;

    setRecovering(true);
    setError(null);
    try {
      const rec = await api.recoverVerification({ idempotencyKey: target.idempotencyKey });
      if (rec && rec.found) {
        if (rec.status === 'completed') {
          applyRecoveredRecord(rec, target);
          setSuccessMessage(
            `Recovered completed verification result safely (Ref: ${rec.reference}) without any duplicate charge.`
          );
          return;
        }
        if (rec.status === 'failed') {
          if (typeof rec.newBalance === 'number') {
            updateBalance(rec.newBalance);
          }
          clearRecoveryAttempt();
          resetIdempotency();
          setError('The previous verification attempt did not succeed and your wallet was automatically refunded.');
          void Promise.allSettled([refreshUser(), loadHistory()]);
          return;
        }
        if (rec.status === 'pending') {
          setError(
            `Verification is still finalizing on the server (Ref: ${rec.reference || target.idempotencyKey}). Please wait a moment and click Recover Result again.`
          );
          return;
        }
      }
      setError('No completed transaction was found for that interrupted request. Your wallet was not debited or check Verification History.');
      clearRecoveryAttempt();
      resetIdempotency();
    } catch (recErr: any) {
      setError(recErr?.message || 'Unable to check recovery status right now. Please check Verification History.');
    } finally {
      setRecovering(false);
    }
  };

  const executeVerification = async () => {
    if (inFlightRef.current || submitting) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const activeIkey = idempotencyKeyRef.current;
    const cleanSearchVal =
      activeCategory === 'nin_verify'
        ? ninSearchType === 'demo_v1'
          ? `${demoFirstName.trim().toUpperCase()} ${demoLastName.trim().toUpperCase()} (${demoDob})`
          : ninInputValue.replace(/\s+/g, '')
        : activeCategory === 'bvn_verify'
        ? bvnInputValue.replace(/\s+/g, '')
        : String(formData.nin || formData.bvn || formData.phone || '').trim();
    const targetKey =
      activeCategory === 'nin_verify'
        ? ninTargetServiceKey
        : activeCategory === 'bvn_verify'
        ? bvnTargetServiceKey
        : currentService.key;

    const attemptSnapshot: PendingRecoveryAttempt = {
      idempotencyKey: activeIkey,
      serviceKey: targetKey,
      searchValue: cleanSearchVal,
      slipType:
        activeCategory === 'nin_verify'
          ? (ninSearchType === 'vnin_verification' ? 'ninVnin' : selectedNinSlip?.slip_code)
          : activeCategory === 'bvn_verify'
          ? selectedBvnSlip?.slip_code
          : formData.slip_type,
      slipName:
        activeCategory === 'nin_verify'
          ? (ninSearchType === 'vnin_verification' ? 'VNIN Slip' : selectedNinSlip?.name)
          : activeCategory === 'bvn_verify'
          ? selectedBvnSlip?.name
          : currentService.name,
      startedAt: new Date().toISOString(),
    };
    saveRecoveryAttempt(attemptSnapshot);

    try {
      const payload: Record<string, any> =
        activeCategory === 'nin_verify'
          ? ninSearchType === 'demo_v1'
            ? {
                search_type: 'demo',
                firstname: demoFirstName.trim().toUpperCase(),
                lastname: demoLastName.trim().toUpperCase(),
                dob: demoDob,
                gender: demoGender,
                slip_type: selectedNinSlip?.slip_code || 'ninStandard',
                slip_template_id: selectedNinSlip?.id,
                idempotency_key: activeIkey,
              }
            : ninSearchType === 'vnin_verification'
            ? {
                search_type: 'vnin',
                tier: 'vnin',
                nin: cleanSearchVal,
                slip_type: 'ninVnin',
                slip_template_id: selectedNinSlip?.id,
                idempotency_key: activeIkey,
              }
            : {
                search_type: ninSearchType === 'phone_v1' ? 'phone' : 'nin',
                nin: ninSearchType === 'nin_v1' ? cleanSearchVal : undefined,
                phone: ninSearchType === 'phone_v1' ? cleanSearchVal : undefined,
                slip_type: selectedNinSlip?.slip_code || 'ninStandard',
                slip_template_id: selectedNinSlip?.id,
                idempotency_key: activeIkey,
              }
          : activeCategory === 'bvn_verify'
          ? {
              search_type: bvnSearchMode === 'bvn_retrieval' ? 'phone' : 'bvn',
              bvn: bvnSearchMode === 'bvn_number' ? cleanSearchVal : undefined,
              phone: bvnSearchMode === 'bvn_retrieval' ? cleanSearchVal : undefined,
              phone_number: bvnSearchMode === 'bvn_retrieval' ? cleanSearchVal : undefined,
              first_name: bvnSearchMode === 'bvn_retrieval' ? bvnFirstName.trim().toUpperCase() : undefined,
              last_name: bvnSearchMode === 'bvn_retrieval' ? bvnLastName.trim().toUpperCase() : undefined,
              slip_type: selectedBvnSlip?.slip_code || 'bvnBasic',
              slip_template_id: selectedBvnSlip?.id,
              idempotency_key: activeIkey,
            }
          : {
              ...formData,
              idempotency_key: activeIkey,
            };

      const res = await api.executeIdentityService(
        targetKey,
        payload,
        consentAccepted,
        activeIkey
      );

      if (res && res.success === true && (res.result || res.reference)) {
        const normalizedResult = res.result || (res as any).data?.result || (res as any).data || {};
        const resolvedFallbackSlip = activeCategory === 'bvn_verify' ? selectedBvnSlip : selectedNinSlip;
        const recordPayload = {
          id: res.recordId || (res as any).verification_id,
          data: normalizedResult,
          result: normalizedResult,
          service_key: targetKey,
          type: currentService.category,
          search_value: cleanSearchVal,
          reference: res.reference,
          slip_type: res.slip_type || resolvedFallbackSlip?.slip_code,
          slip_name: res.slip_name || resolvedFallbackSlip?.name,
          has_original_pdf: Boolean(
            (res as any).has_original_pdf ||
              normalizedResult?.pdf_base64 ||
              normalizedResult?.pdf_url
          ),
          status: 'completed',
          verified_at: res.verified_at || new Date().toISOString(),
          created_at: res.verified_at || new Date().toISOString(),
        };

        setSuccessMessage(res.message || 'Verification completed successfully.');
        setVerifiedRecord(recordPayload);
        setActiveSlipRecord(recordPayload);
        clearRecoveryAttempt();
        resetIdempotency();

        if (typeof res.newBalance === 'number') {
          updateBalance(res.newBalance);
        }

        void Promise.allSettled([refreshUser(), loadHistory()]);
      } else {
        throw new Error(
          res?.message || 'Verification returned an incomplete response. Please check Verification History.'
        );
      }
    } catch (err: any) {
      const isInterrupted = Boolean(err?.isTimeout || err?.isNetworkError || err?.isEmptyResponse);
      const isPendingConflict = err?.payload?.code === 'VERIFICATION_IN_PROGRESS' || err?.statusCode === 409;

      if (isInterrupted || isPendingConflict) {
        try {
          const rec = await api.recoverVerification({ idempotencyKey: activeIkey });
          if (rec && rec.found && rec.status === 'completed') {
            applyRecoveredRecord(rec, attemptSnapshot);
            setSuccessMessage(
              `Connection was interrupted, but your verification completed! Retrieved saved report (Ref: ${rec.reference}) without any duplicate charge.`
            );
            return;
          }
          if (rec && rec.found && rec.status === 'failed') {
            if (typeof rec.newBalance === 'number') {
              updateBalance(rec.newBalance);
            }
            clearRecoveryAttempt();
            resetIdempotency();
            setError('Verification could not be completed. Your wallet has been automatically refunded.');
            void Promise.allSettled([refreshUser(), loadHistory()]);
            return;
          }
        } catch {
        }

        setError(
          err?.message ||
            'Connection timed out before the result arrived. Use "Recover Result" below to retrieve any completed transaction safely without being charged again.'
        );
      } else {
        clearRecoveryAttempt();
        if (typeof err?.payload?.errors?.balance_after === 'number') {
          updateBalance(err.payload.errors.balance_after);
        }
        setError(err?.message || 'Verification could not be completed. Please try again.');
        void Promise.allSettled([refreshUser(), loadHistory()]);
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleOpenHistoryRecord = async (item: VerificationRecord) => {
    setError(null);
    setLoadingRecordId(item.id);
    try {
      const res = await api.getVerificationRecord(item.id);
      if (res && res.success && res.record) {
        setActiveSlipRecord(res.record);
        setSlipModalOpen(true);
        return;
      }
      setActiveSlipRecord(item);
      setSlipModalOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to load full verification document right now.');
    } finally {
      setLoadingRecordId(null);
    }
  };

  const handlePollStatus = async (ref: string) => {
    try {
      setPollingRef(ref);
      const res = await api.pollVerificationStatus(ref);
      if (res.success) {
        setSuccessMessage(`Status updated: ${res.message}`);
        await loadHistory();
      } else {
        setError(res.message || 'Status check returned no update');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check verification status');
    } finally {
      setPollingRef(null);
    }
  };

  const handleDirectDownloadPdf = async (recordObj: any) => {
    if (!recordObj) return;
    setDownloadingPdf(true);
    try {
      await downloadVerificationReportPdf(recordObj, companyName);
    } catch (err: any) {
      setError(err?.message || 'Failed to prepare verification PDF download.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const report = verifiedRecord ? extractVerificationReport(verifiedRecord) : null;
  const reportFields = report
    ? [
        { label: 'First Name', value: report.firstName },
        { label: 'Middle Name', value: report.middleName },
        { label: 'Surname', value: report.surname },
        { label: 'BVN Number', value: report.bvn, mono: true },
        { label: 'NIN Number', value: report.nin, mono: true },
        { label: 'Date of Birth', value: report.dateOfBirth, mono: true },
        { label: 'Gender', value: report.gender },
        { label: 'Nationality', value: report.nationality },
        { label: 'Phone Number', value: report.phoneNumber, mono: true },
        { label: 'Email Address', value: report.email },
        { label: 'Residential Address', value: [report.address, report.lga, report.state].filter(Boolean).join(', ') || null },
        { label: 'Enrollment Bank', value: report.enrollmentBank },
        { label: 'Enrollment Branch', value: report.enrollmentBranch },
        { label: 'Account Level', value: report.levelOfAccount },
        { label: 'Watchlisted', value: report.watchListed },
        { label: 'Marital Status', value: report.maritalStatus },
        { label: 'Name on Card', value: report.nameOnCard },
        { label: 'Registration Date', value: report.registrationDate, mono: true },
        { label: 'Tracking Reference', value: report.trackingId, mono: true },
      ].filter(item => Boolean(item.value))
    : [];

  return (
    <div className="space-y-6 font-sans overflow-x-hidden">
      {/* Clean Page Header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Identity &amp; Verification Services</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            NIN &amp; Identity Services
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Verify National Identification Numbers quickly, select your preferred slip layout, and download or print your verification report.
          </p>
        </div>

        {/* Available Wallet Balance */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm self-start sm:self-auto">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider block">
              Available Wallet Balance
            </span>
            <span className="text-base sm:text-lg font-extrabold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="no-print flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 text-xs">
        {[
          { id: 'nin_verify', label: 'NIN Verification', icon: ShieldCheck },
          { id: 'bvn_verify', label: 'BVN Verification', icon: UserCheck },
          { id: 'nin_mod', label: 'NIN Modification', icon: Edit3 },
          { id: 'bvn_mod', label: 'BVN Modification', icon: Briefcase },
          { id: 'enrolment', label: 'Enrolment', icon: GraduationCap },
          { id: 'additional', label: 'Additional Services', icon: Briefcase },
          { id: 'history', label: 'Verification History', icon: FileText, count: history.length + modHistory.length },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSwitchCategory(tab.id as HubCategory)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-all shrink-0 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Workspace */}
      {activeCategory === 'nin_mod' ? (
        <ModificationSection
          mode="NIN"
          services={ninModServices}
          loadingServices={loadingModServices}
          onOpenHistoryTab={() => {
            setHistoryTabFilter('nin_mod');
            handleSwitchCategory('history');
          }}
        />
      ) : activeCategory === 'bvn_mod' ? (
        <ModificationSection
          mode="BVN"
          services={bvnModServices}
          loadingServices={loadingModServices}
          onOpenHistoryTab={() => {
            setHistoryTabFilter('bvn_mod');
            handleSwitchCategory('history');
          }}
        />
      ) : activeCategory !== 'history' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column: Clean Form */}
          <div className="no-print lg:col-span-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
            {activeCategory === 'nin_verify' ? (
              <>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">NIN Verification</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Choose a search method, select your slip format, review the charge, and verify immediately.
                  </p>
                </div>

                {error && (
                  <div className="space-y-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-relaxed">{error}</div>
                    </div>
                    {recoveryAttempt && !submitting && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRecoverAttempt()}
                          disabled={recovering}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
                          <span>{recovering ? 'Checking Saved Result...' : 'Recover Completed Result'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={clearRecoveryAttempt}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!error && recoveryAttempt && !submitting && (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs">
                    <span>An earlier verification check was interrupted.</span>
                    <button
                      type="button"
                      onClick={() => handleRecoverAttempt()}
                      disabled={recovering}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${recovering ? 'animate-spin' : ''}`} />
                      <span>{recovering ? 'Recovering...' : 'Recover Result'}</span>
                    </button>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{successMessage}</div>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* 1. Select Search Type Dropdown */}
                  <div>
                    <label
                      htmlFor="nin-search-type"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                    >
                      Select Search Type
                    </label>
                    <select
                      id="nin-search-type"
                      value={ninSearchType}
                      onChange={e => {
                        setNinSearchType(e.target.value as NinSearchType);
                        setNinInputValue('');
                        setError(null);
                        setSuccessMessage(null);
                        resetIdempotency();
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="nin_v1">NIN Number</option>
                      <option value="phone_v1">Phone Number</option>
                      {demoVerificationAvailable && (
                        <option value="demo_v1">Demographic Verification (Name, DOB &amp; Gender)</option>
                      )}
                      {vninAvailable && (
                        <option value="vnin_verification">Virtual NIN (VNIN)</option>
                      )}
                    </select>
                  </div>

                  {/* 2. Dynamic Search Input Field(s) */}
                  {ninSearchType === 'demo_v1' ? (
                    <div className="space-y-3 rounded-2xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="demo-first-name"
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
                          >
                            First Name
                          </label>
                          <input
                            id="demo-first-name"
                            type="text"
                            value={demoFirstName}
                            onChange={e => {
                              setDemoFirstName(e.target.value);
                              setError(null);
                              resetIdempotency();
                            }}
                            placeholder="e.g. AHMAD"
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="demo-last-name"
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
                          >
                            Surname
                          </label>
                          <input
                            id="demo-last-name"
                            type="text"
                            value={demoLastName}
                            onChange={e => {
                              setDemoLastName(e.target.value);
                              setError(null);
                              resetIdempotency();
                            }}
                            placeholder="e.g. BELLO"
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="demo-dob"
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
                          >
                            Date of Birth
                          </label>
                          <input
                            id="demo-dob"
                            type="date"
                            max={new Date().toISOString().split('T')[0]}
                            value={demoDob}
                            onChange={e => {
                              setDemoDob(e.target.value);
                              setError(null);
                              resetIdempotency();
                            }}
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="demo-gender"
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
                          >
                            Gender
                          </label>
                          <select
                            id="demo-gender"
                            value={demoGender}
                            onChange={e => {
                              setDemoGender(e.target.value as 'm' | 'f');
                              setError(null);
                              resetIdempotency();
                            }}
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="m">Male</option>
                            <option value="f">Female</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="nin-search-value"
                          className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                        >
                          {ninSearchType === 'nin_v1'
                            ? 'NIN Number (11 Digits)'
                            : ninSearchType === 'vnin_verification'
                            ? 'NIN Number for VNIN Slip (11 Digits)'
                            : 'Phone Number (11 Digits)'}
                        </label>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {ninInputValue.replace(/\D/g, '').length}/11 digits
                        </span>
                      </div>
                      <div className="relative">
                        {ninSearchType === 'phone_v1' ? (
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        ) : (
                          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        )}
                        <input
                          id="nin-search-value"
                          type={ninSearchType === 'phone_v1' ? 'tel' : 'text'}
                          inputMode="numeric"
                          maxLength={11}
                          value={ninInputValue}
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                            setNinInputValue(val);
                            setError(null);
                            resetIdempotency();
                          }}
                          placeholder={
                            ninSearchType === 'nin_v1'
                              ? 'Enter 11-digit NIN number'
                              : ninSearchType === 'vnin_verification'
                              ? 'Enter 11-digit NIN for VNIN slip'
                              : 'e.g. 08012345678'
                          }
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* 3. Select Slip Type Dropdown */}
                  <div>
                    <label
                      htmlFor="nin-slip-type"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                    >
                      Select Slip Type
                    </label>
                    {loadingServices ? (
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading slip options...</span>
                      </div>
                    ) : activeNinSlips.length === 0 ? (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
                        No active NIN slip types are currently available. Please contact support.
                      </div>
                    ) : (
                      <select
                        id="nin-slip-type"
                        value={selectedNinSlip?.id || ''}
                        onChange={e => {
                          setSelectedSlipId(e.target.value);
                          setError(null);
                          resetIdempotency();
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {activeNinSlips.map(slip => {
                          const slipPrice =
                            slip.price !== null && slip.price !== undefined
                              ? Number(slip.price)
                              : Number((currentService as any).price ?? (currentService as any).selling_price ?? 0);
                          return (
                            <option key={slip.id} value={slip.id}>
                              {slip.name} — ₦{slipPrice.toLocaleString('en-NG')}
                              {slip.is_recommended ? ' (Recommended)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  {/* 4. Selected Slip Specimen Preview, Description & Price */}
                  {selectedNinSlip && (
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {selectedNinSlip.name}
                            </span>
                            {(selectedNinSlip.is_recommended || selectedNinSlip.badge) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-bold">
                                {selectedNinSlip.is_recommended && <Star className="w-2.5 h-2.5 fill-current" />}
                                <span>{selectedNinSlip.badge || 'Recommended'}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                            {selectedNinSlip.description}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                            Price
                          </span>
                          <span className="text-sm font-extrabold font-mono text-blue-700 dark:text-emerald-400">
                            ₦{finalCharge.toLocaleString('en-NG')}
                          </span>
                        </div>
                      </div>

                      {/* Specimen Image with Watermark & Zoom */}
                      <div className="relative h-36 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <img
                          src={selectedNinSlip.demo_image_url}
                          alt={`${selectedNinSlip.name} Specimen`}
                          className="w-full h-full object-cover"
                          onError={e => {
                            (e.target as HTMLImageElement).src = '/assets/aistudio/IMG_0483_23e1a1e1.png';
                          }}
                        />
                        <div className="absolute inset-0 bg-slate-950/30 flex items-center justify-center pointer-events-none">
                          <span className="px-2.5 py-1 rounded-md bg-amber-950/85 border border-amber-400/60 text-amber-200 font-mono text-[10px] font-bold tracking-wider rotate-[-4deg]">
                            {selectedNinSlip.watermark_text || 'SAMPLE SPECIMEN'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewModalTemplate(selectedNinSlip)}
                          className="absolute top-2 right-2 min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-900 text-white text-[10px] font-semibold inline-flex items-center gap-1 transition"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 5. Wallet & Final Charge Breakdown */}
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Available Wallet Balance</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Final Customer Charge</span>
                      <span className="font-mono font-extrabold text-blue-700 dark:text-emerald-400">
                        ₦{finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">Balance After Verification</span>
                      <span
                        className={`font-mono ${
                          insufficientBalance
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {insufficientBalance
                          ? 'Insufficient Balance'
                          : `₦${(walletBalance - finalCharge).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  </div>

                  {/* 6. Legal Authorization / Consent Checkbox */}
                  <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={e => {
                        setConsentAccepted(e.target.checked);
                        setError(null);
                      }}
                      className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong className="text-slate-900 dark:text-white">Authorization Consent:</strong> I confirm that I have received explicit legal consent from the NIN holder to perform this verification under applicable Nigerian data protection laws (NDPR).
                    </span>
                  </label>

                  {/* 7. Verify & Debit Wallet Button */}
                  <button
                    type="submit"
                    disabled={submitting || activeNinSlips.length === 0}
                    className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying &amp; Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify &amp; Debit Wallet (₦{finalCharge.toLocaleString('en-NG')})</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : activeCategory === 'bvn_verify' ? (
              <>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">BVN Verification</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Verify a Bank Verification Number or retrieve BVN via phone number, select your BVN slip format, and download your report.
                  </p>
                </div>

                {error && (
                  <div className="space-y-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-relaxed">{error}</div>
                    </div>
                    {recoveryAttempt && !submitting && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRecoverAttempt()}
                          disabled={recovering}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
                          <span>{recovering ? 'Checking Saved Result...' : 'Recover Completed Result'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={clearRecoveryAttempt}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!error && recoveryAttempt && !submitting && (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs">
                    <span>An earlier verification check was interrupted.</span>
                    <button
                      type="button"
                      onClick={() => handleRecoverAttempt()}
                      disabled={recovering}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${recovering ? 'animate-spin' : ''}`} />
                      <span>{recovering ? 'Recovering...' : 'Recover Result'}</span>
                    </button>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{successMessage}</div>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* 1. Select Search Type Dropdown */}
                  <div>
                    <label
                      htmlFor="bvn-search-type"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                    >
                      Select Search Type
                    </label>
                    <select
                      id="bvn-search-type"
                      value={bvnSearchMode}
                      onChange={e => {
                        setBvnSearchMode(e.target.value as BvnSearchMode);
                        setBvnInputValue('');
                        setError(null);
                        setSuccessMessage(null);
                        resetIdempotency();
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="bvn_number">BVN Number</option>
                      {bvnRetrievalAvailable && (
                        <option value="bvn_retrieval">Phone Number (BVN Retrieval)</option>
                      )}
                    </select>
                  </div>

                  {bvnSearchMode === 'bvn_retrieval' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="bvn-ret-firstname"
                          className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                        >
                          First Name
                        </label>
                        <input
                          id="bvn-ret-firstname"
                          type="text"
                          value={bvnFirstName}
                          onChange={e => {
                            setBvnFirstName(e.target.value);
                            setError(null);
                            resetIdempotency();
                          }}
                          placeholder="e.g. MUSA"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="bvn-ret-lastname"
                          className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                        >
                          Last Name (Surname)
                        </label>
                        <input
                          id="bvn-ret-lastname"
                          type="text"
                          value={bvnLastName}
                          onChange={e => {
                            setBvnLastName(e.target.value);
                            setError(null);
                            resetIdempotency();
                          }}
                          placeholder="e.g. IBRAHIM"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* 2. Dynamic BVN / Phone Input Field */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="bvn-search-value"
                        className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                      >
                        {bvnSearchMode === 'bvn_number' ? 'BVN Number (11 Digits)' : 'Phone Number (11 Digits)'}
                      </label>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {bvnInputValue.replace(/\D/g, '').length}/11 digits
                      </span>
                    </div>
                    <div className="relative">
                      {bvnSearchMode === 'bvn_number' ? (
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      ) : (
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      )}
                      <input
                        id="bvn-search-value"
                        type={bvnSearchMode === 'bvn_number' ? 'text' : 'tel'}
                        inputMode="numeric"
                        maxLength={11}
                        value={bvnInputValue}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                          setBvnInputValue(digits);
                          setError(null);
                          resetIdempotency();
                        }}
                        placeholder={
                          bvnSearchMode === 'bvn_number'
                            ? 'Enter 11-digit BVN number'
                            : 'e.g. 08012345678'
                        }
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        required
                      />
                    </div>
                  </div>

                  {/* 3. Select BVN Slip Type Dropdown */}
                  <div>
                    <label
                      htmlFor="bvn-slip-type"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                    >
                      Select Slip Type
                    </label>
                    {loadingServices ? (
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading BVN slip formats...</span>
                      </div>
                    ) : activeBvnSlips.length === 0 ? (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
                        No active BVN slip types are currently available. Please contact support.
                      </div>
                    ) : (
                      <select
                        id="bvn-slip-type"
                        value={selectedBvnSlip?.id || ''}
                        onChange={e => {
                          setSelectedBvnSlipId(e.target.value);
                          setError(null);
                          resetIdempotency();
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {activeBvnSlips.map(slip => {
                          const effectivePrice = computeBvnSlipPrice(slip);
                          return (
                            <option key={slip.id} value={slip.id}>
                              {slip.name} — ₦{effectivePrice.toLocaleString('en-NG')}
                              {slip.is_recommended ? ' (Recommended)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  {/* 4. Selected BVN Slip Specimen Preview, Description & Price */}
                  {selectedBvnSlip && (
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {selectedBvnSlip.name}
                            </span>
                            {(selectedBvnSlip.is_recommended || selectedBvnSlip.badge) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-bold">
                                {selectedBvnSlip.is_recommended && <Star className="w-2.5 h-2.5 fill-current" />}
                                <span>{selectedBvnSlip.badge || 'Recommended'}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                            {selectedBvnSlip.description}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                            Price
                          </span>
                          <span className="text-sm font-extrabold font-mono text-blue-700 dark:text-emerald-400">
                            ₦{finalCharge.toLocaleString('en-NG')}
                          </span>
                        </div>
                      </div>

                      <div className="relative h-36 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <img
                          src={selectedBvnSlip.demo_image_url}
                          alt={`${selectedBvnSlip.name} Specimen`}
                          className="w-full h-full object-cover"
                          onError={e => {
                            (e.target as HTMLImageElement).src = '/assets/slips/bvn_basic.jpg';
                          }}
                        />
                        <div className="absolute inset-0 bg-slate-950/30 flex items-center justify-center pointer-events-none">
                          <span className="px-2.5 py-1 rounded-md bg-amber-950/85 border border-amber-400/60 text-amber-200 font-mono text-[10px] font-bold tracking-wider rotate-[-4deg]">
                            {selectedBvnSlip.watermark_text || 'SAMPLE SPECIMEN'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewModalTemplate(selectedBvnSlip)}
                          className="absolute top-2 right-2 min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-900 text-white text-[10px] font-semibold inline-flex items-center gap-1 transition"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 5. Wallet & Final Charge Breakdown */}
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Available Wallet Balance</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Final Customer Charge</span>
                      <span className="font-mono font-extrabold text-blue-700 dark:text-emerald-400">
                        ₦{finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">Balance After Verification</span>
                      <span
                        className={`font-mono ${
                          insufficientBalance
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {insufficientBalance
                          ? 'Insufficient Balance'
                          : `₦${(walletBalance - finalCharge).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  </div>

                  {/* 6. Legal Authorization / Consent Checkbox */}
                  <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={e => {
                        setConsentAccepted(e.target.checked);
                        setError(null);
                      }}
                      className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong className="text-slate-900 dark:text-white">Authorization Consent:</strong> I confirm that I have received explicit legal consent from the BVN holder to perform this verification under Nigerian data protection laws (NDPR) and CBN/NIBSS guidelines.
                    </span>
                  </label>

                  {/* 7. Verify & Debit Wallet Button */}
                  <button
                    type="submit"
                    disabled={submitting || activeBvnSlips.length === 0}
                    className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying BVN Record...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify &amp; Debit Wallet (₦{finalCharge.toLocaleString('en-NG')})</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              /* Enrolment / Additional Services */
              <>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-blue-600 dark:text-emerald-400 font-bold">
                    {String(currentService.category || '').replace(/_/g, ' ')}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{currentService.name}</h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{currentService.description}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Select Service</label>
                  <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {(() => {
                      const catList: IdentityService[] = (categories as any)[
                        activeCategory === 'enrolment' ? 'enrolment' : 'additional_services'
                      ] || [];
                      const filteredList =
                        activeCategory === 'additional'
                          ? catList.filter(s => !s.key.toLowerCase().startsWith('demo_'))
                          : catList;
                      if (filteredList.length === 0) {
                        return (
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                            No active services are currently listed under this section.
                          </div>
                        );
                      }
                      return filteredList.map((srv: IdentityService) => {
                        const isSelected = selectedServiceKey === srv.key;
                        return (
                          <button
                            key={srv.key}
                            type="button"
                            onClick={() => {
                              setSelectedServiceKey(srv.key);
                              setError(null);
                              setSuccessMessage(null);
                              resetIdempotency();
                            }}
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-emerald-500/10 border-blue-500 dark:border-emerald-500/60 text-slate-900 dark:text-white font-semibold'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span className="truncate pr-2">{srv.name}</span>
                            <span className="font-mono font-bold text-blue-700 dark:text-emerald-400 shrink-0">
                              ₦{(srv.price ?? (srv as any).selling_price ?? 0).toLocaleString()}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{error}</div>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{successMessage}</div>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {(currentService.required_fields || []).includes('nin') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        National Identification Number (NIN)
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={formData.nin || ''}
                        onChange={e => handleFieldChange('nin', e.target.value)}
                        placeholder="11-digit NIN"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                        required
                      />
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('bvn') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Bank Verification Number (BVN)
                      </label>
                      <input
                        type="text"
                        maxLength={11}
                        value={formData.bvn || ''}
                        onChange={e => handleFieldChange('bvn', e.target.value)}
                        placeholder="11-digit BVN"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                        required
                      />
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('phone') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={e => handleFieldChange('phone', e.target.value)}
                        placeholder="e.g. 08012345678"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                        required
                      />
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('firstname') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">First Name</label>
                        <input
                          type="text"
                          value={formData.firstname || ''}
                          onChange={e => handleFieldChange('firstname', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Surname</label>
                        <input
                          type="text"
                          value={formData.lastname || ''}
                          onChange={e => handleFieldChange('lastname', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white uppercase"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('dob') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Date of Birth</label>
                        <input
                          type="date"
                          value={formData.dob || ''}
                          onChange={e => handleFieldChange('dob', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Gender</label>
                        <select
                          value={formData.gender || 'F'}
                          onChange={e => handleFieldChange('gender', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="F">Female</option>
                          <option value="M">Male</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('first_name') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">New First Name</label>
                        <input
                          type="text"
                          value={formData.first_name || ''}
                          onChange={e => handleFieldChange('first_name', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">New Last Name</label>
                        <input
                          type="text"
                          value={formData.last_name || ''}
                          onChange={e => handleFieldChange('last_name', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white uppercase"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('address') && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Residential Address</label>
                        <input
                          type="text"
                          value={formData.address || ''}
                          onChange={e => handleFieldChange('address', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="State"
                          value={formData.state || ''}
                          onChange={e => handleFieldChange('state', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                          required
                        />
                        <input
                          type="text"
                          placeholder="LGA"
                          value={formData.lga || ''}
                          onChange={e => handleFieldChange('lga', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('bank_name') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Bank</label>
                      <select
                        value={formData.bank_name || (modBanks[0]?.bank_name || 'ACCESS BANK')}
                        onChange={e => handleFieldChange('bank_name', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      >
                        {(modBanks.length > 0 ? modBanks : [
                          { bank_name: 'ACCESS BANK', price: 4500 },
                          { bank_name: 'FIRST BANK', price: 4500 },
                          { bank_name: 'GT BANK', price: 4500 },
                          { bank_name: 'ZENITH BANK', price: 4500 },
                          { bank_name: 'UBA', price: 4500 },
                        ]).map(b => (
                          <option key={b.bank_name} value={b.bank_name}>{b.bank_name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(currentService.required_fields || []).includes('business_name') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Business Name</label>
                      <input
                        type="text"
                        value={formData.business_name || ''}
                        onChange={e => handleFieldChange('business_name', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white uppercase"
                        required
                      />
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={e => setConsentAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                      <strong className="text-slate-900 dark:text-white">Authorization Consent:</strong> I confirm I have obtained legal authorization from the identity holder to submit this request.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Request...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify &amp; Debit Wallet (₦{finalCharge.toLocaleString('en-NG')})</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Right Column: Human-Readable Verification Report */}
          <div className="lg:col-span-7 space-y-4">
            {submitting ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 sm:p-14 text-center space-y-4 shadow-sm">
                <Loader2 className="w-10 h-10 text-blue-600 dark:text-emerald-400 animate-spin mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Verifying Identity Record</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                    Please hold on while we retrieve and format your verification report. Do not close or refresh this page.
                  </p>
                </div>
              </div>
            ) : report && verifiedRecord ? (
              <div className={`rounded-3xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 p-5 sm:p-8 space-y-6 shadow-lg ${slipModalOpen ? 'no-print' : 'print-only-area'}`}>
                {/* Report Top Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                        {companyName}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {report.isBvnReport ? 'BVN Verification Report' : 'NIN Verification Report'} &bull; {report.slipTypeName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            report.hasOriginalPdf
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {report.hasOriginalPdf ? 'Original Provider PDF' : 'Generated Report'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="no-print flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleDirectDownloadPdf(verifiedRecord)}
                      disabled={downloadingPdf}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                    >
                      {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>
                        {downloadingPdf
                          ? 'Preparing PDF...'
                          : report.hasOriginalPdf
                          ? 'Download Original PDF'
                          : 'Download Report PDF'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSlipRecord(verifiedRecord);
                        setSlipModalOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Full View</span>
                    </button>
                  </div>
                </div>

                {/* Readable Identity Report Card */}
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    {report.photo && !photoLoadError ? (
                      <div className="w-28 h-34 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 shadow-sm">
                        <img
                          src={report.photo}
                          alt={report.fullName || 'Verified Subject Photograph'}
                          className="w-full h-full object-cover"
                          onError={() => setPhotoLoadError(true)}
                        />
                      </div>
                    ) : (
                      <div className="w-28 h-32 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 shrink-0 flex flex-col items-center justify-center p-2 text-center">
                        <FileText className="w-6 h-6 text-slate-400 mb-1" />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          {photoLoadError ? 'Photo unavailable' : 'No photo returned'}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 w-full space-y-3">
                      {report.fullName && (
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Full Name</div>
                          <div className="text-lg font-extrabold text-slate-900 dark:text-white">{report.fullName}</div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {reportFields.map(field => (
                          <div key={field.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                            <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">
                              {field.label}
                            </div>
                            <div
                              className={`text-slate-900 dark:text-white font-semibold mt-0.5 break-words ${
                                field.mono ? 'font-mono' : ''
                              }`}
                            >
                              {field.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Transaction & Verification Metadata */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Transaction Reference
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{report.reference}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Verification Date
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{report.verifiedAt}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Verification Status
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{report.status}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Legal Notice */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-blue-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    This {companyName} verification report is provided for authorized identity validation and KYC records. It does not replace {report.isBvnReport ? 'official banking credentials issued directly by CBN/NIBSS' : 'an official government-issued NIMC identity card'}.
                  </span>
                </div>
              </div>
            ) : (
              /* Clean Empty State */
              <div className="no-print rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Ready to Verify</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                    {activeCategory === 'bvn_verify'
                      ? 'Select a BVN search type, enter the 11-digit BVN or linked phone number, pick your preferred BVN slip format, and click '
                      : 'Select a search type, enter the NIN, phone number, or demographic details, pick your preferred slip type, and click '}
                    <strong>Verify &amp; Debit Wallet</strong> to view your report.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 max-w-md mx-auto text-left text-xs space-y-1.5">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Automatic Wallet Protection</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    If a verification query cannot be completed, your wallet is automatically refunded immediately with a full ledger reference.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Verification & Modification History */
        <div className="no-print rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verification &amp; Modification History</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Search instant verification reports or inspect separated NIN Modification and BVN Modification statuses.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadHistory()}
                placeholder="Search reference or number..."
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={loadHistory}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                title="Refresh history"
              >
                <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-fit overflow-x-auto">
            {[
              { id: 'instant', label: `Instant Verifications (${history.length})` },
              { id: 'nin_mod', label: `NIN Modifications (${modHistory.filter(m => m.identity_type === 'NIN').length})` },
              { id: 'bvn_mod', label: `BVN Modifications (${modHistory.filter(m => m.identity_type === 'BVN').length})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryTabFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  historyTabFilter === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {historyTabFilter === 'instant' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Search Value</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                        No verification records found yet.
                      </td>
                    </tr>
                  ) : (
                    history.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-sans font-bold text-slate-900 dark:text-white">
                          {item.type}
                        </td>
                        <td className="py-3.5 px-4 text-blue-700 dark:text-emerald-400 font-bold">{item.search_value}</td>
                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[150px]">
                          {item.reference || item.id}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">₦{item.cost.toLocaleString()}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                                : item.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-sans text-[11px]">
                          {new Date(item.created_at).toLocaleString('en-NG')}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          {item.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handlePollStatus(item.reference || item.id)}
                              disabled={pollingRef === (item.reference || item.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-sans hover:bg-amber-500/25 transition"
                            >
                              {pollingRef === (item.reference || item.id) ? 'Checking...' : 'Check Status'}
                            </button>
                          )}
                          {item.status === 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleOpenHistoryRecord(item)}
                              disabled={loadingRecordId === item.id}
                              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-800 dark:text-slate-200 text-[11px] font-sans font-semibold inline-flex items-center gap-1 transition"
                            >
                              {loadingRecordId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                              <span>{loadingRecordId === item.id ? 'Loading...' : 'View Report'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Request #</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Masked ID</th>
                    <th className="py-3 px-4">Charge</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Submitted</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(() => {
                    const targetDomain = historyTabFilter === 'bvn_mod' ? 'BVN' : 'NIN';
                    const scopedMods = modHistory.filter(m => m.identity_type === targetDomain);
                    if (scopedMods.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500">
                            No {targetDomain} modification requests found yet.
                          </td>
                        </tr>
                      );
                    }
                    return scopedMods.map(item => {
                      const st = getModificationStatusStyle(item.status);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            {item.request_number}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                            <div>{item.service_name}</div>
                            {item.refund_reference && (
                              <div className="text-[10px] font-mono text-purple-600 dark:text-purple-300 mt-0.5">
                                Refund: {item.refund_reference}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-blue-700 dark:text-emerald-400">
                            {item.masked_identifier}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            ₦{Number(item.customer_price).toLocaleString('en-NG')}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${st.classes}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                            {new Date(item.created_at).toLocaleString('en-NG')}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleSwitchCategory(targetDomain === 'BVN' ? 'bvn_mod' : 'nin_mod')}
                              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-semibold"
                            >
                              Open Tracker
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Printable & Downloadable Report Modal */}
      <IdentitySlipModal
        isOpen={slipModalOpen}
        onClose={() => setSlipModalOpen(false)}
        record={activeSlipRecord}
      />

      {/* Transaction PIN Authorization Modal (only prompted if user has PIN configured) */}
      <TransactionPinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={() => {
          setPinModalOpen(false);
          executeVerification();
        }}
        title="Authorize Verification"
        description={`Enter your 4-digit Transaction PIN to verify and debit ₦${finalCharge.toLocaleString('en-NG')}.`}
        amount={finalCharge}
      />

      {/* Specimen Zoom Preview Modal */}
      {previewModalTemplate && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {previewModalTemplate.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold">
                  SAMPLE SPECIMEN
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalTemplate(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[60vh]">
                <img
                  src={previewModalTemplate.demo_image_url}
                  alt={previewModalTemplate.name}
                  className="w-full h-auto object-contain max-h-[58vh]"
                />
                <div className="absolute inset-0 bg-slate-950/20 flex items-center justify-center pointer-events-none select-none">
                  <div className="border-2 border-dashed border-amber-400/80 bg-amber-950/85 text-amber-200 px-4 py-2 rounded-xl text-xs font-mono font-black tracking-widest rotate-[-8deg] shadow-2xl">
                    {previewModalTemplate.watermark_text || 'SAMPLE SPECIMEN'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">{previewModalTemplate.name}</span>
                  {previewModalTemplate.price !== null && previewModalTemplate.price !== undefined && (
                    <span className="font-mono font-bold text-blue-700 dark:text-emerald-400">
                      ₦{Number(previewModalTemplate.price).toLocaleString('en-NG')}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  {previewModalTemplate.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (previewModalTemplate.category === 'BVN') {
                    setSelectedBvnSlipId(previewModalTemplate.id);
                  } else {
                    setSelectedSlipId(previewModalTemplate.id);
                  }
                  setPreviewModalTemplate(null);
                  resetIdempotency();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition"
              >
                Use This Slip Format
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
