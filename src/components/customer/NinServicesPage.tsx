/**
 * @file NinServicesPage.tsx
 * Phase 5 Complete Sovereign Identity Hub.
 * Integrates 2SureVerify as primary provider with official endpoint paths,
 * complete service coverage (NIN V1/V2/V3, Phone V1/V2/V3, Demo V1/V2/V3, VNIN, BVN V1/V2/V3, BVN Retrieval,
 * all 16 NIN modifications, Personalisation 1&2, Adult/Child Enrolment, and 8 Additional Services),
 * printable slips, status polling, and wallet transaction safety with NDPR consent.
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VerificationRecord, IdentityService } from '../../types';
import { IdentitySlipModal } from './IdentitySlipModal';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Download,
  Printer,
  User,
  QrCode,
  ArrowRight,
  RefreshCw,
  FileText,
  Clock,
  ChevronRight,
  ExternalLink,
  Layers,
  Sparkles,
  Phone,
  Calendar,
  Lock,
  Building,
  Edit3,
  UserCheck,
  GraduationCap,
  Briefcase,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

type HubCategory = 'nin_verify' | 'bvn_verify' | 'nin_mod' | 'enrolment' | 'additional' | 'history';

export const NinServicesPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [activeCategory, setActiveCategory] = useState<HubCategory>('nin_verify');
  const [services, setServices] = useState<IdentityService[]>([]);
  const [categories, setCategories] = useState<Record<string, IdentityService[]>>({});
  const [slipTypes, setSlipTypes] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [activeProvider, setActiveProvider] = useState<string>('2sureverify');
  const [loadingServices, setLoadingServices] = useState<boolean>(true);

  // Selected Service & Form state
  const [selectedServiceKey, setSelectedServiceKey] = useState<string>('nin_v1');
  const [formData, setFormData] = useState<Record<string, any>>({
    slip_type: 'ninStandard',
    tier: 'basic',
    gender: 'Female',
  });
  const [consentAccepted, setConsentAccepted] = useState<boolean>(true);
  const [useTestSandbox, setUseTestSandbox] = useState<boolean>(false);

  // Banks for BVN Modification and Enrolment
  const [modBanks, setModBanks] = useState<Array<{ bank_name: string; price: number }>>([]);
  const [enrollBanks, setEnrollBanks] = useState<Array<{ bank_name: string; price: number }>>([]);

  // Execution state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<any | null>(null);
  const [activeSlipRecord, setActiveSlipRecord] = useState<any | null>(null);
  const [slipModalOpen, setSlipModalOpen] = useState<boolean>(false);

  // History state
  const [history, setHistory] = useState<VerificationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyCategory, setHistoryCategory] = useState<string>('all');
  const [pollingRef, setPollingRef] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog();
    loadHistory();
  }, []);

  const loadCatalog = async () => {
    try {
      setLoadingServices(true);
      const res = await api.getVerificationServices();
      if (res.success) {
        setServices(res.services || []);
        setCategories(res.categories || {});
        setSlipTypes(res.slipTypes || []);
        if (res.activeProvider) setActiveProvider(res.activeProvider);
      }
    } catch (e) {
      console.error('Failed to load identity services catalog:', e);
    } finally {
      setLoadingServices(false);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.getVerificationHistory(
        historyCategory === 'all' ? undefined : historyCategory,
        historySearch.trim() || undefined
      );
      if (res.success) {
        setHistory(res.verifications || []);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (selectedServiceKey === 'bvn_modification' && modBanks.length === 0) {
      api.getBvnModificationBanks().then(res => {
        if (res.success) setModBanks(res.data);
      });
    }
    if ((selectedServiceKey === 'bvn_enroll_adult' || selectedServiceKey === 'bvn_enroll_child') && enrollBanks.length === 0) {
      api.getBvnEnrollmentBanks().then(res => {
        if (res.success) setEnrollBanks(res.data);
      });
    }
  }, [selectedServiceKey]);

  // Current selected service object
  const currentService = services.find(s => s.key === selectedServiceKey) || services[0] || {
    key: 'nin_v1',
    name: 'NIN Verification (V1 Standard)',
    category: 'NIN Verification',
    price: 200,
    required_fields: ['nin', 'slip_type'],
    description: 'Direct NIMC lookup with slip style selection.',
    slip_type_supported: true,
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSwitchCategory = (cat: HubCategory) => {
    setActiveCategory(cat);
    setError(null);
    setSuccessMessage(null);

    // Pick first service in new category
    if (cat === 'nin_verify') setSelectedServiceKey('nin_v1');
    if (cat === 'bvn_verify') setSelectedServiceKey('bvn_v1');
    if (cat === 'nin_mod') setSelectedServiceKey('nin_mod_name');
    if (cat === 'enrolment') setSelectedServiceKey('bvn_enroll_adult');
    if (cat === 'additional') setSelectedServiceKey('npc_attestation');
  };

  const handleExecuteService = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!consentAccepted) {
      setError('Regulatory compliance: You must confirm that you have obtained authorization from the individual before proceeding.');
      return;
    }

    // Client-side field validations
    for (const field of currentService.required_fields) {
      if (!formData[field] || String(formData[field]).trim() === '') {
        setError(`Please enter the required field: "${field.replace(/_/g, ' ').toUpperCase()}"`);
        return;
      }
    }

    // Numeric length checks for NIN/BVN
    if (formData.nin && (!/^\d{11}$/.test(formData.nin.trim()) && currentService.key !== 'vnin_verification')) {
      setError('National Identification Number (NIN) must be exactly 11 numeric digits.');
      return;
    }
    if (formData.bvn && !/^\d{11}$/.test(formData.bvn.trim())) {
      setError('Bank Verification Number (BVN) must be exactly 11 numeric digits.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.executeIdentityService(
        currentService.key,
        formData,
        consentAccepted,
        useTestSandbox
      );

      if (res.success) {
        setSuccessMessage(res.message || 'Verification processed successfully.');
        setVerifiedResult(res.result);
        setActiveSlipRecord({
          data: res.result,
          service_key: currentService.key,
          type: currentService.category,
          search_value: formData.nin || formData.bvn || formData.phone || 'Result',
          created_at: new Date().toISOString(),
        });

        // Trigger slip modal if slip returned
        if (currentService.slip_type_supported || res.result?.pdf_base64 || res.result?.has_pdf_slip) {
          setSlipModalOpen(true);
        }

        await refreshUser();
        await loadHistory();
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check parameters or available wallet balance.');
    } finally {
      setSubmitting(false);
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
      setError(err.message || 'Failed to poll reference status');
    } finally {
      setPollingRef(null);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Page Title & Sovereign Badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Sovereign Identity Pipeline (Phase 5)</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-slate-300">Primary Provider: 2SureVerify Gateway</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-slate-400">Veripine Failover</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            NIN &amp; BVN Verification Desk
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Complete integration for National Identity (NIN V1/V2/V3), BVN validation, 16 official modifications, biometrics enrolment, and CAC/NPC digital certificates.
          </p>
        </div>

        {/* Live Wallet & Sandbox Badge */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-right">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Available Wallet</span>
            <span className="text-base font-extrabold font-mono text-emerald-400">
              ₦{user?.wallet_balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800 text-xs">
        {[
          { id: 'nin_verify', label: '1. NIN Verification', icon: ShieldCheck, badge: 'V1/V2/V3' },
          { id: 'bvn_verify', label: '2. BVN Verification', icon: UserCheck, badge: 'Retrieval' },
          { id: 'nin_mod', label: '3. NIN Modification', icon: Edit3, badge: '16 Services' },
          { id: 'enrolment', label: '4. Enrolment & Personalisation', icon: GraduationCap },
          { id: 'additional', label: '5. Additional Digital Services', icon: Briefcase, badge: 'NPC/CAC/TIN' },
          { id: 'history', label: '6. Records & Slip Vault', icon: FileText, badge: `${history.length}` },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleSwitchCategory(tab.id as HubCategory)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-bold'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Category Workspace */}
      {activeCategory !== 'history' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Service Selector & Form */}
          <div className="lg:col-span-5 rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                {currentService.category}
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">{currentService.name}</h2>
              <p className="text-xs text-slate-400 mt-1">{currentService.description}</p>
            </div>

            {/* Service Sub-Pills in Current Category */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Select Specific Workflow</label>
              <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {((categories as any)[
                  activeCategory === 'nin_verify'
                    ? 'nin_verification'
                    : activeCategory === 'bvn_verify'
                    ? 'bvn_verification'
                    : activeCategory === 'nin_mod'
                    ? 'nin_modification'
                    : activeCategory === 'enrolment'
                    ? 'enrolment'
                    : 'additional_services'
                ] || []).map((srv: IdentityService) => {
                  const isSelected = selectedServiceKey === srv.key;
                  return (
                    <button
                      key={srv.key}
                      type="button"
                      onClick={() => {
                        setSelectedServiceKey(srv.key);
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500/60 text-white font-semibold'
                          : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      <span className="truncate pr-2">{srv.name}</span>
                      <span className="font-mono font-bold text-emerald-400 shrink-0">
                        ₦{srv.price.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error & Success Messages */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{error}</div>
              </div>
            )}

            {successMessage && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{successMessage}</div>
              </div>
            )}

            {/* Dynamic Form */}
            <form onSubmit={handleExecuteService} className="space-y-4">
              {/* Field: nin */}
              {currentService.required_fields.includes('nin') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    National Identification Number (NIN)
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.nin || ''}
                      onChange={e => handleFieldChange('nin', e.target.value)}
                      placeholder="e.g. 35359517922 (11 Digits)"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Field: bvn */}
              {currentService.required_fields.includes('bvn') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bank Verification Number (BVN)
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      maxLength={11}
                      value={formData.bvn || ''}
                      onChange={e => handleFieldChange('bvn', e.target.value)}
                      placeholder="e.g. 22334455667 (11 Digits)"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Field: phone */}
              {currentService.required_fields.includes('phone') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Registered Telephone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={e => handleFieldChange('phone', e.target.value)}
                      placeholder="e.g. 08032503238"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Field: slip_type */}
              {currentService.slip_type_supported && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Document Slip Layout Format
                  </label>
                  <select
                    value={formData.slip_type || 'ninStandard'}
                    onChange={e => handleFieldChange('slip_type', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ninStandard">NIMC Standard Slip (High-Res Colored with QR)</option>
                    <option value="ninPremium">NIMC Premium Plastic Card Layout</option>
                    <option value="ninBasic">NIMC Basic Slip</option>
                    <option value="ninVnin">NIMC Virtual NIN Certificate</option>
                    <option value="ninSpecial">NIMC Special Diplomatic Slip</option>
                  </select>
                </div>
              )}

              {/* Field: tier (for V2 & V3 endpoints) */}
              {currentService.required_fields.includes('tier') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Upstream Verification Tier / Data Version
                  </label>
                  {currentService.key.endsWith('_v3') ? (
                    <select
                      value={formData.tier || 'v1'}
                      onChange={e => handleFieldChange('tier', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      <option value="v1">Version 1 (High Reliability)</option>
                      <option value="v2">Version 2 (Instant Route)</option>
                      <option value="v3">Version 3 (Direct Telecom Sync)</option>
                      <option value="v4">Version 4 (NIMC Secondary)</option>
                      <option value="v5">Version 5 (Bank Gateway)</option>
                    </select>
                  ) : (
                    <select
                      value={formData.tier || 'basic'}
                      onChange={e => handleFieldChange('tier', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 capitalize"
                    >
                      <option value="basic">Basic Tier (Name + Photo)</option>
                      <option value="standard">Standard Tier (Full Biodata)</option>
                      <option value="premium">Premium Tier (Enriched Address &amp; Origin)</option>
                      <option value="regular">Regular Tier</option>
                      <option value="vnin">Virtual NIN (VNIN) Tier</option>
                      <option value="vip">VIP Tier (Highest Priority)</option>
                    </select>
                  )}
                </div>
              )}

              {/* Fields: firstname, lastname, dob, gender (Demographics) */}
              {currentService.required_fields.includes('firstname') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={formData.firstname || ''}
                      onChange={e => handleFieldChange('firstname', e.target.value)}
                      placeholder="e.g. CHIOMA"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white uppercase focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Last Name / Surname</label>
                    <input
                      type="text"
                      value={formData.lastname || ''}
                      onChange={e => handleFieldChange('lastname', e.target.value)}
                      placeholder="e.g. OBIAGWU"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white uppercase focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
              )}

              {currentService.required_fields.includes('dob') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.dob || '1995-08-14'}
                      onChange={e => handleFieldChange('dob', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Gender</label>
                    <select
                      value={formData.gender || 'F'}
                      onChange={e => handleFieldChange('gender', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="F">Female (F)</option>
                      <option value="M">Male (M)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Fields: first_name & last_name for modifications */}
              {currentService.required_fields.includes('first_name') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Correct First Name</label>
                    <input
                      type="text"
                      value={formData.first_name || ''}
                      onChange={e => handleFieldChange('first_name', e.target.value)}
                      placeholder="e.g. FATIMOH"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white uppercase focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Correct Last Name</label>
                    <input
                      type="text"
                      value={formData.last_name || ''}
                      onChange={e => handleFieldChange('last_name', e.target.value)}
                      placeholder="e.g. MUSBAU"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white uppercase focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Field: address, state, lga */}
              {currentService.required_fields.includes('address') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Residential Address</label>
                    <input
                      type="text"
                      value={formData.address || ''}
                      onChange={e => handleFieldChange('address', e.target.value)}
                      placeholder="e.g. 14 Awolowo Way, Ikeja"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">State</label>
                      <input
                        type="text"
                        value={formData.state || 'Lagos'}
                        onChange={e => handleFieldChange('state', e.target.value)}
                        placeholder="e.g. Lagos"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">LGA</label>
                      <input
                        type="text"
                        value={formData.lga || 'Ikeja'}
                        onChange={e => handleFieldChange('lga', e.target.value)}
                        placeholder="e.g. Ikeja"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Field: age_range (Over-Age modification) */}
              {currentService.required_fields.includes('age_range') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Age Bracket Range</label>
                  <select
                    value={formData.age_range || '5-9'}
                    onChange={e => handleFieldChange('age_range', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    <option value="5-9">5 to 9 Years Bracket</option>
                    <option value="10-15">10 to 15 Years Bracket</option>
                    <option value="15-20">15 to 20 Years Bracket</option>
                  </select>
                </div>
              )}

              {/* Field: bank_name (BVN Modification) */}
              {currentService.required_fields.includes('bank_name') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Associated Bank</label>
                  <select
                    value={formData.bank_name || (modBanks[0]?.bank_name || 'ACCESS BANK')}
                    onChange={e => handleFieldChange('bank_name', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {(modBanks.length > 0 ? modBanks : [
                      { bank_name: 'ACCESS BANK', price: 18000 },
                      { bank_name: 'FIRST BANK', price: 18000 },
                      { bank_name: 'GT BANK', price: 18000 },
                      { bank_name: 'ZENITH BANK', price: 18000 },
                      { bank_name: 'UBA', price: 18000 },
                    ]).map(b => (
                      <option key={b.bank_name} value={b.bank_name}>
                        {b.bank_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Field: portal credentials for self-service modifications */}
              {currentService.required_fields.includes('portal_email') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">NIMC Self-Service Email</label>
                    <input
                      type="email"
                      value={formData.portal_email || ''}
                      onChange={e => handleFieldChange('portal_email', e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Portal Password</label>
                    <input
                      type="password"
                      value={formData.portal_password || ''}
                      onChange={e => handleFieldChange('portal_password', e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Field: business_name & proprietor for CAC/TIN */}
              {currentService.required_fields.includes('business_name') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Proposed Business / Enterprise Name</label>
                    <input
                      type="text"
                      value={formData.business_name || ''}
                      onChange={e => handleFieldChange('business_name', e.target.value)}
                      placeholder="e.g. Hambak Global Logistics"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 uppercase"
                      required
                    />
                  </div>
                  {currentService.required_fields.includes('nature_of_business') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nature of Business</label>
                      <input
                        type="text"
                        value={formData.nature_of_business || 'General Merchandising & Information Technology'}
                        onChange={e => handleFieldChange('nature_of_business', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Mandatory NDPR Customer Consent Checkbox */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={e => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950"
                  />
                  <span className="text-[11px] text-slate-300 leading-snug">
                    <strong className="text-white">NDPR / NIMC Compliance Consent:</strong> I certify that I have obtained full legal authorization from the subject individual to query, verify, or modify their identity record.
                  </span>
                </label>

                {/* Sandbox Toggle */}
                <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Simulation / Sandbox Mode:</span>
                  <button
                    type="button"
                    onClick={() => setUseTestSandbox(!useTestSandbox)}
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold transition ${
                      useTestSandbox
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {useTestSandbox ? 'ACTIVE (Sandbox)' : 'OFF (Live 2SureVerify)'}
                  </button>
                </div>
              </div>

              {/* Cost & Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Query with 2SureVerify...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm &amp; Debit ₦{currentService.price.toLocaleString()}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Verified Slip Card & Preview */}
          <div className="lg:col-span-7 space-y-4">
            {verifiedResult ? (
              <div className="rounded-3xl bg-slate-900 border border-emerald-500/40 p-6 sm:p-8 space-y-6 shadow-2xl">
                {/* Result Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white uppercase tracking-wider">
                        Federal Republic of Nigeria
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {currentService.name} &bull; Validated via 2SureVerify
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSlipModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Certified Slip</span>
                    </button>
                  </div>
                </div>

                {/* Identity Biodata Preview Card */}
                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    {/* Photo */}
                    <div className="w-28 h-32 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shrink-0 shadow-md">
                      <img
                        src={verifiedResult.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                        alt="Citizen Photo"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">Surname</div>
                        <div className="text-white font-bold text-sm">{verifiedResult.surname || 'MUSBAU'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">First Name</div>
                        <div className="text-white font-bold text-sm">{verifiedResult.firstname || 'FATIMOH'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">Middle Name</div>
                        <div className="text-slate-300 font-medium">{verifiedResult.middlename || '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">Gender</div>
                        <div className="text-slate-300 font-medium">{verifiedResult.gender || 'Female'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">Date of Birth</div>
                        <div className="text-slate-300 font-mono">{verifiedResult.birthdate || '1995-08-14'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">Telephone</div>
                        <div className="text-slate-300 font-mono">{verifiedResult.telephoneno || '08032503238'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Number Banner */}
                  <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] text-slate-500 font-mono uppercase">Verified Identity Number</div>
                      <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-widest">
                        {verifiedResult.nin || verifiedResult.bvn || formData.nin || formData.bvn || '35359517922'}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] text-slate-500 font-mono uppercase">NIMC Tracking Code</div>
                      <div className="text-xs font-mono text-slate-300 font-bold">
                        {verifiedResult.tracking_id || `NIMC-${Math.floor(100000000 + Math.random() * 900000000)}`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Raw Payload view */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-850 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Raw Upstream JSON Response</span>
                    <span className="text-[10px] font-mono text-slate-500">2SureVerify API v1</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-950 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-40">
                    {JSON.stringify(verifiedResult, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-12 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                  <FileText className="w-7 h-7 text-emerald-500/70" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">No Verification Loaded</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Select a service from the left and submit valid credentials to execute the query against 2SureVerify and view the verified biodata slip.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 max-w-md mx-auto text-left text-xs space-y-2">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Transaction Safety Guarantee:</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Every transaction generates an immutable reference. In the event of an upstream provider rejection, the debited amount is immediately refunded to your wallet.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History & Slip Vault */
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Identity Slip Vault &amp; Transaction Journal</h2>
              <p className="text-xs text-slate-400">Search and reprint any verification certificate or check pending status.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadHistory()}
                placeholder="Search reference or ID..."
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={loadHistory}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
                title="Refresh history"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Identifier</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                      No identity records found in your vault.
                    </td>
                  </tr>
                ) : (
                  history.map(item => (
                    <tr key={item.id} className="hover:bg-slate-850/50">
                      <td className="py-3.5 px-4 font-sans font-bold text-white">
                        {item.type}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-400 font-bold">{item.search_value}</td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px] truncate max-w-[150px]">
                        {item.reference || item.id}
                      </td>
                      <td className="py-3.5 px-4 font-bold">₦{item.cost.toLocaleString()}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : item.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {item.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-sans text-[11px]">
                        {new Date(item.created_at).toLocaleString('en-NG')}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {item.status === 'pending' && (
                          <button
                            onClick={() => handlePollStatus(item.reference || item.id)}
                            disabled={pollingRef === (item.reference || item.id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-sans hover:bg-amber-500/25 transition"
                          >
                            {pollingRef === (item.reference || item.id) ? 'Checking...' : 'Check Status'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveSlipRecord(item);
                            setSlipModalOpen(true);
                          }}
                          className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-sans font-semibold transition"
                        >
                          View Slip
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slip Modal Component */}
      <IdentitySlipModal
        isOpen={slipModalOpen}
        onClose={() => setSlipModalOpen(false)}
        record={activeSlipRecord}
      />
    </div>
  );
};
