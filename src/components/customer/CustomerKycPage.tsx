import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  Lock,
  ChevronRight,
  FileText,
  UserCheck,
  Camera,
  Building,
  CreditCard,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  Send,
  AlertTriangle
} from 'lucide-react';
import { api } from '../../lib/api';
import { User, KycSubmission, ServiceSecurityRule, VirtualAccountItem } from '../../types';

interface CustomerKycPageProps {
  user: User;
  onRefreshUser?: () => void;
}

export function CustomerKycPage({ user, onRefreshUser }: CustomerKycPageProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeSubmission, setActiveSubmission] = useState<KycSubmission | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountItem | null>(null);
  const [rules, setRules] = useState<ServiceSecurityRule[]>([]);
  const [levelInfo, setLevelInfo] = useState<any>(null);
  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Target Tier Selection for application
  const currentLevel = user.kyc_level ?? (user.kyc_status === 'verified' ? 2 : user.tier || 1);
  const [selectedTargetLevel, setSelectedTargetLevel] = useState<number>(
    currentLevel >= 3 ? 3 : currentLevel + 1
  );

  // Form Fields
  const [formData, setFormData] = useState({
    full_legal_name: user.full_name || '',
    date_of_birth: user.date_of_birth || user.dob || '',
    phone_number: user.phone_number || '',
    email: user.email || '',
    residential_address: user.address || '',
    state: user.state || 'Lagos',
    lga: user.lga || 'Ikeja',
    nin: user.nin || '',
    bvn: user.bvn || '',
    id_type: 'nin_slip' as 'nin_slip' | 'drivers_license' | 'voters_card' | 'international_passport',
    id_number: '',
    id_document_url: '',
    selfie_url: '',
    proof_of_address_url: '',
    consent_obtained: false,
    auto_verify: true,
  });

  // Uploading state
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [uploadingSelfie, setUploadingSelfie] = useState<boolean>(false);
  const [uploadingProof, setUploadingProof] = useState<boolean>(false);

  // NDPR Terms Modal
  const [showNdprModal, setShowNdprModal] = useState<boolean>(false);

  // Load Status
  const loadKycData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getKycStatus();
      if (res.success) {
        setActiveSubmission(res.active_submission);
        setVirtualAccount(res.virtual_account);
        setRules(res.rules || []);
        setLevelInfo(res.level_info);
        if (res.user) {
          setFormData(prev => ({
            ...prev,
            full_legal_name: res.user.full_name || prev.full_legal_name,
            phone_number: res.user.phone_number || prev.phone_number,
            email: res.user.email || prev.email,
            date_of_birth: res.user.date_of_birth || res.user.dob || prev.date_of_birth,
            address: res.user.address || prev.residential_address,
          }));
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retrieve KYC status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKycData();
  }, []);

  // Handle Document Upload
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'id_document' | 'selfie' | 'proof_of_address'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'id_document') setUploadingDoc(true);
    if (type === 'selfie') setUploadingSelfie(true);
    if (type === 'proof_of_address') setUploadingProof(true);
    setErrorMessage(null);

    try {
      const uploadRes = await api.uploadDocument(file, type);
      if (uploadRes.success && uploadRes.file_url) {
        const fileUrl: string = uploadRes.file_url;
        if (type === 'id_document') setFormData(prev => ({ ...prev, id_document_url: fileUrl }));
        if (type === 'selfie') setFormData(prev => ({ ...prev, selfie_url: fileUrl }));
        if (type === 'proof_of_address') setFormData(prev => ({ ...prev, proof_of_address_url: fileUrl }));
      }
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to upload ${type}.`);
    } finally {
      if (type === 'id_document') setUploadingDoc(false);
      if (type === 'selfie') setUploadingSelfie(false);
      if (type === 'proof_of_address') setUploadingProof(false);
    }
  };

  // Submit KYC Package
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.consent_obtained) {
      setErrorMessage('You must review and consent to the NDPR Identity Verification Terms before proceeding.');
      return;
    }
    if (!formData.full_legal_name || !formData.date_of_birth || !formData.residential_address) {
      setErrorMessage('Please fill in all required personal identification fields.');
      return;
    }

    if (selectedTargetLevel >= 2) {
      if (!formData.nin && !formData.bvn) {
        setErrorMessage('Level 2 verification requires a valid 11-digit NIN or BVN.');
        return;
      }
      if (!formData.id_number) {
        setErrorMessage('Please enter your official ID document number.');
        return;
      }
    }

    if (selectedTargetLevel === 3) {
      if (!formData.selfie_url && !formData.proof_of_address_url) {
        setErrorMessage('Level 3 Enhanced verification requires a selfie photograph and proof of residential address.');
        return;
      }
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.submitKyc({
        target_level: selectedTargetLevel,
        full_legal_name: formData.full_legal_name,
        date_of_birth: formData.date_of_birth,
        phone_number: formData.phone_number,
        email: formData.email,
        residential_address: formData.residential_address,
        state: formData.state,
        lga: formData.lga,
        nin: formData.nin || undefined,
        bvn: formData.bvn || undefined,
        id_type: formData.id_type,
        id_number: formData.id_number || 'N/A',
        id_document_url: formData.id_document_url || undefined,
        selfie_url: formData.selfie_url || undefined,
        proof_of_address_url: formData.proof_of_address_url || undefined,
        consent_obtained: formData.consent_obtained,
        auto_verify: formData.auto_verify,
      });

      if (res.success) {
        setSuccessMessage(res.message);
        setActiveSubmission(res.submission);
        if (res.instant_verified) {
          setSuccessMessage(`Instant Automated Verification Successful! Your account has been upgraded to Level ${selectedTargetLevel}.`);
        }
        if (onRefreshUser) onRefreshUser();
        loadKycData();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'KYC submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyAccount = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 0:
        return <span className="px-2.5 py-1 text-xs rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">Level 0 &bull; Unverified</span>;
      case 1:
        return <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Level 1 &bull; Basic</span>;
      case 2:
        return <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Level 2 &bull; Identity Verified</span>;
      case 3:
        return <span className="px-2.5 py-1 text-xs rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">Level 3 &bull; Enhanced Enterprise</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Identity Verification & KYC</h1>
              <p className="text-sm text-slate-400">
                NDPR-compliant customer identity verification, limit management, and virtual account eligibility.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadKycData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
          <div>{getLevelBadge(currentLevel)}</div>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="flex-1">{errorMessage}</p>
        </div>
      )}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-400 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="flex-1">{successMessage}</p>
        </div>
      )}

      {/* KYC Tier Stepper Progression */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Verification Level Hierarchy</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Level 0 */}
          <div className={`p-4 rounded-2xl border transition-all ${
            currentLevel >= 0 ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-900/40 border-slate-800 opacity-60'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-400">LEVEL 0</span>
              {currentLevel >= 0 && <Check className="w-4 h-4 text-emerald-400" />}
            </div>
            <h3 className="text-base font-bold text-white mb-1">Unverified</h3>
            <p className="text-xs text-slate-400 mb-3">Basic account registration. Highly restricted service access.</p>
            <div className="text-xs font-mono text-slate-500">Daily limit: ₦0</div>
          </div>

          {/* Level 1 */}
          <div className={`p-4 rounded-2xl border transition-all ${
            currentLevel >= 1
              ? 'bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20'
              : 'bg-slate-900/40 border-slate-800 opacity-60'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-blue-400">LEVEL 1</span>
              {currentLevel >= 1 ? <Check className="w-4 h-4 text-emerald-400" /> : <Lock className="w-3.5 h-3.5 text-slate-500" />}
            </div>
            <h3 className="text-base font-bold text-white mb-1">Basic Profile</h3>
            <p className="text-xs text-slate-400 mb-3">Verified email & basic phone. Standard airtime and data bundles.</p>
            <div className="text-xs font-mono text-blue-400 font-semibold">Daily limit: ₦20,000</div>
          </div>

          {/* Level 2 */}
          <div className={`p-4 rounded-2xl border transition-all ${
            currentLevel >= 2
              ? 'bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20'
              : selectedTargetLevel === 2
              ? 'bg-emerald-950/20 border-emerald-500/50'
              : 'bg-slate-900/40 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-emerald-400">LEVEL 2</span>
              {currentLevel >= 2 ? <Check className="w-4 h-4 text-emerald-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
            </div>
            <h3 className="text-base font-bold text-white mb-1">Identity Verified</h3>
            <p className="text-xs text-slate-400 mb-3">Validated NIN/BVN & official ID. Unlocks NIN verification & Virtual Bank Accounts.</p>
            <div className="text-xs font-mono text-emerald-400 font-semibold">Daily limit: ₦200,000</div>
          </div>

          {/* Level 3 */}
          <div className={`p-4 rounded-2xl border transition-all ${
            currentLevel >= 3
              ? 'bg-purple-500/5 border-purple-500/30 ring-1 ring-purple-500/20'
              : selectedTargetLevel === 3
              ? 'bg-purple-950/20 border-purple-500/50'
              : 'bg-slate-900/40 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-purple-400">LEVEL 3</span>
              {currentLevel >= 3 ? <Check className="w-4 h-4 text-purple-400" /> : <UserCheck className="w-3.5 h-3.5 text-purple-400" />}
            </div>
            <h3 className="text-base font-bold text-white mb-1">Enhanced</h3>
            <p className="text-xs text-slate-400 mb-3">Live selfie & address proof. High-volume purchases, bulk SMS & developer APIs.</p>
            <div className="text-xs font-mono text-purple-400 font-semibold">Daily limit: ₦2,000,000</div>
          </div>
        </div>
      </div>

      {/* Grid: Virtual Bank Account Card & Active Submission Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Virtual Bank Account Widget */}
        <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -z-0" />
          
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Virtual Bank Account</h3>
              </div>
              <span className={`px-2 py-0.5 text-[11px] rounded-full uppercase tracking-wider font-mono font-bold ${
                virtualAccount?.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : currentLevel < 2
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {virtualAccount?.status === 'active' ? 'Active' : currentLevel < 2 ? 'Requires Level 2' : 'Pending Provision'}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Individually assigned dedicated NUBAN account. Inbound bank transfers instantly credit your HambakTech wallet.
            </p>

            {currentLevel < 2 ? (
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Level 2 KYC Required</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  CBN compliance guidelines mandate verified NIN/BVN identity before a personalized virtual account can be allocated to your profile.
                </p>
                <button
                  onClick={() => setSelectedTargetLevel(2)}
                  className="w-full mt-2 py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  Apply for Level 2 Below <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : virtualAccount?.status === 'active' ? (
              <div className="space-y-3 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Bank Name</span>
                  <div className="text-sm font-bold text-white">{virtualAccount.bank_name}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Account Name</span>
                  <div className="text-sm font-semibold text-slate-200">{virtualAccount.account_name}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Account Number</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xl font-bold tracking-wider text-emerald-400">
                      {virtualAccount.account_number}
                    </span>
                    <button
                      onClick={() => handleCopyAccount(virtualAccount.account_number)}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
                      title="Copy account number"
                    >
                      {copiedAccount ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-700/50 flex justify-between text-[11px] text-slate-400">
                  <span>Total Inflows:</span>
                  <span className="text-slate-200 font-bold">₦{virtualAccount.total_inflow.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400">
                Identity verified! Virtual account will be provisioned automatically upon provider webhook acknowledgment.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Automated Settlement</span>
            <span>Zero Processing Delay</span>
          </div>
        </div>

        {/* Active Submission Card */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Current Verification Status
              </h3>
              {activeSubmission && (
                <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                  activeSubmission.status === 'approved'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : activeSubmission.status === 'pending'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : activeSubmission.status === 'info_requested'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {activeSubmission.status.toUpperCase()}
                </span>
              )}
            </div>

            {activeSubmission ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-slate-500">Target Level:</span>
                    <p className="font-semibold text-slate-200">Level {activeSubmission.target_level}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Method:</span>
                    <p className="font-semibold text-slate-200 capitalize">{activeSubmission.verification_method}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Submitted:</span>
                    <p className="font-semibold text-slate-200">
                      {new Date(activeSubmission.submitted_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Reference:</span>
                    <p className="font-mono text-slate-300 truncate">{activeSubmission.verification_reference || activeSubmission.id}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Consent Logged:</span>
                    <p className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-3.5 h-3.5" /> NDPR Yes
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Reviewed By:</span>
                    <p className="text-slate-300 font-semibold">{activeSubmission.reviewer_name || 'Pending Review'}</p>
                  </div>
                </div>

                {activeSubmission.status === 'info_requested' && (
                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-bold">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>Compliance Officer Requested Additional Information:</span>
                    </div>
                    <p className="text-xs text-slate-300 italic">
                      "{activeSubmission.additional_info_requested || 'Please re-upload a clearer image of your ID.'}"
                    </p>
                  </div>
                )}

                {activeSubmission.status === 'rejected' && (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Verification Rejection Reason:</span>
                    </div>
                    <p className="text-xs text-red-300">
                      {activeSubmission.rejection_reason || 'Information provided did not match official government registry.'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      You may correct your information and resubmit below.
                    </p>
                  </div>
                )}

                {activeSubmission.status === 'pending' && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your identity verification is currently queued with our compliance desk. Automated API verification has passed; manual administrator sign-off will complete within 15–30 minutes.
                    </p>
                  </div>
                )}

                {activeSubmission.status === 'approved' && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-300 leading-relaxed">
                      Your identity documentation has been thoroughly validated and verified. Your account enjoys Level {activeSubmission.target_level} elevated limits.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-white">No Active KYC Application</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Submit your identity package below to unlock higher daily transaction limits, individual bank accounts, and sensitive services.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Current Daily Limit: <strong className="text-white">₦{(levelInfo?.daily_limit || 20000).toLocaleString()}</strong></span>
            <span>Security Engine: <strong className="text-emerald-400">2SureVerify Automated</strong></span>
          </div>
        </div>
      </div>

      {/* KYC Application Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl">
        <div className="border-b border-slate-800 pb-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Submit Verification Application
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select your desired KYC tier and provide verified identification details.
            </p>
          </div>

          {/* Tier Tabs */}
          <div className="flex bg-slate-800/80 p-1 rounded-2xl border border-slate-700">
            {[1, 2, 3].map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedTargetLevel(lvl)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  selectedTargetLevel === lvl
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Level {lvl}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section A: Personal Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Basic Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Legal Name (as shown on official ID) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_legal_name}
                  onChange={e => setFormData({ ...formData, full_legal_name: e.target.value })}
                  placeholder="e.g. Adebayo Ibrahim Adeleke"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date of Birth <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.date_of_birth}
                  onChange={e => setFormData({ ...formData, date_of_birth: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Verified Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone_number}
                  onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Residential Street Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.residential_address}
                  onChange={e => setFormData({ ...formData, residential_address: e.target.value })}
                  placeholder="e.g. 14 Admiralty Way, Lekki Phase 1"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">State of Residence</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={e => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Local Government Area (LGA)</label>
                <input
                  type="text"
                  value={formData.lga}
                  onChange={e => setFormData({ ...formData, lga: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Section B: Identity Numbers (For Level 2 & 3) */}
          {selectedTargetLevel >= 2 && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  2. Government Identity Numbers (Level 2 &bull; Identity Verified)
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Encrypted &bull; Strictly Minimized</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    National Identity Number (NIN) <span className="text-slate-500">(11 digits)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.nin}
                    onChange={e => setFormData({ ...formData, nin: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 12345678901"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Verified securely against NIMC national repository.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bank Verification Number (BVN) <span className="text-slate-500">(Optional if NIN provided)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.bvn}
                    onChange={e => setFormData({ ...formData, bvn: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 22234567890"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Optional secondary validation for high volume limits.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Official Document Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.id_type}
                    onChange={e => setFormData({ ...formData, id_type: e.target.value as any })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="nin_slip">National Identity Slip (NIN Slip)</option>
                    <option value="drivers_license">Federal Driver's License</option>
                    <option value="voters_card">INEC Voter's Card</option>
                    <option value="international_passport">Nigerian International Passport</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    ID Document Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required={selectedTargetLevel >= 2}
                    value={formData.id_number}
                    onChange={e => setFormData({ ...formData, id_number: e.target.value })}
                    placeholder="e.g. Document serial or license number"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                {/* Document Upload */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Upload ID Document Scan / Clear Photo
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer transition">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span>{uploadingDoc ? 'Uploading...' : formData.id_document_url ? 'Replace Document' : 'Choose File (PDF, PNG, JPG)'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        onChange={e => handleFileUpload(e, 'id_document')}
                        disabled={uploadingDoc}
                        className="hidden"
                      />
                    </label>
                    {formData.id_document_url && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                        <Check className="w-3.5 h-3.5" /> Uploaded: {formData.id_document_url.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section C: Level 3 Enhanced Proofs */}
          {selectedTargetLevel === 3 && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                3. Enhanced Verification Proofs (Level 3 &bull; Enterprise ₦2,000,000 Limit)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Selfie */}
                <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 space-y-3">
                  <span className="text-xs font-semibold text-slate-200 block">Live Selfie Photo</span>
                  <p className="text-[11px] text-slate-400">Clear frontal photo of your face, matching the ID document.</p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer transition">
                    <Camera className="w-4 h-4 text-purple-400" />
                    <span>{uploadingSelfie ? 'Uploading...' : formData.selfie_url ? 'Replace Selfie' : 'Upload Selfie Photo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={e => handleFileUpload(e, 'selfie')}
                      disabled={uploadingSelfie}
                      className="hidden"
                    />
                  </label>
                  {formData.selfie_url && (
                    <span className="block text-xs text-purple-400 font-mono">
                      Selfie Attached ({formData.selfie_url.split('/').pop()})
                    </span>
                  )}
                </div>

                {/* Proof of Address */}
                <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 space-y-3">
                  <span className="text-xs font-semibold text-slate-200 block">Proof of Residential Address</span>
                  <p className="text-[11px] text-slate-400">Recent utility bill (electricity, water) or bank statement within 3 months.</p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer transition">
                    <Upload className="w-4 h-4 text-purple-400" />
                    <span>{uploadingProof ? 'Uploading...' : formData.proof_of_address_url ? 'Replace Proof' : 'Upload Utility Bill / Statement'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={e => handleFileUpload(e, 'proof_of_address')}
                      disabled={uploadingProof}
                      className="hidden"
                    />
                  </label>
                  {formData.proof_of_address_url && (
                    <span className="block text-xs text-purple-400 font-mono">
                      Proof Attached ({formData.proof_of_address_url.split('/').pop()})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section D: Automated Verification Option */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <input
                type="checkbox"
                id="auto_verify"
                checked={formData.auto_verify}
                onChange={e => setFormData({ ...formData, auto_verify: e.target.checked })}
                className="mt-1 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-800 border-slate-700"
              />
              <label htmlFor="auto_verify" className="text-xs text-slate-300 leading-relaxed cursor-pointer">
                <strong className="text-emerald-400 block mb-0.5">Automated Real-Time Verification Engine (Recommended)</strong>
                Perform real-time name matching check against official government repositories (NIMC/NIBSS via 2SureVerify) for instant approval. If disabled, submission will require standard manual compliance review.
              </label>
            </div>
          </div>

          {/* Section E: NDPR Consent Checkbox & Modal */}
          <div className="pt-2">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
              <input
                type="checkbox"
                id="consent_obtained"
                required
                checked={formData.consent_obtained}
                onChange={e => setFormData({ ...formData, consent_obtained: e.target.checked })}
                className="mt-1 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-800 border-slate-700"
              />
              <div className="text-xs text-slate-300 leading-relaxed flex-1">
                <label htmlFor="consent_obtained" className="cursor-pointer">
                  I give explicit consent under the <strong>Nigeria Data Protection Regulation (NDPR)</strong> to HambakTech Enterprise to collect, process, and securely verify my submitted identity records solely for KYC compliance, fraud prevention, and account qualification.
                </label>{' '}
                <button
                  type="button"
                  onClick={() => setShowNdprModal(true)}
                  className="text-emerald-400 underline hover:text-emerald-300 font-semibold inline-block ml-1"
                >
                  Read NDPR Privacy Policy & Data Minimization Charter
                </button>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="submit"
              disabled={submitting || !formData.consent_obtained}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Verification Package...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Level {selectedTargetLevel} Verification</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Service-Specific PIN and Security Rules Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-400" />
              Service Security & Transaction PIN Policy Matrix
            </h3>
            <p className="text-xs text-slate-400">
              Transparent platform rules governing which services require verified transaction PIN and minimum KYC tier.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">Super Admin Enforced</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-mono">
              <tr>
                <th className="py-3 px-4 rounded-l-xl">Service Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Min. KYC Required</th>
                <th className="py-3 px-4">PIN Required</th>
                <th className="py-3 px-4 rounded-r-xl">Daily Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {rules.map(rule => (
                <tr key={rule.service_key} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-semibold text-white">{rule.service_name}</td>
                  <td className="py-3 px-4 capitalize font-mono text-slate-400">{rule.category}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      rule.min_kyc_level === 0
                        ? 'bg-slate-800 text-slate-400'
                        : rule.min_kyc_level === 1
                        ? 'bg-blue-500/10 text-blue-400'
                        : rule.min_kyc_level === 2
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-purple-500/10 text-purple-400'
                    }`}>
                      Level {rule.min_kyc_level}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {rule.requires_pin ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <Lock className="w-3.5 h-3.5" /> 4-Digit PIN
                      </span>
                    ) : (
                      <span className="text-slate-500">Not Required</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                    ₦{rule.daily_limit.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NDPR Consent Modal */}
      {showNdprModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">NDPR & KYC Data Privacy Charter</h3>
              </div>
              <button
                onClick={() => setShowNdprModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3 max-h-96 overflow-y-auto pr-2 leading-relaxed">
              <p>
                <strong>1. Lawful Basis:</strong> HambakTech Enterprise processes your identity information in strict accordance with the Nigeria Data Protection Act 2023, NDPR standards, and CBN Anti-Money Laundering and Combating the Financing of Terrorism (AML/CFT) guidelines.
              </p>
              <p>
                <strong>2. Data Minimization:</strong> We only collect information essential for customer verification, fraud mitigation, and service authorization. We do not store biometric templates or unnecessary credentials.
              </p>
              <p>
                <strong>3. Storage & Encryption:</strong> All sensitive identity records (NIN, BVN, uploaded government documents) are encrypted at rest with AES-256 and transmitted exclusively over TLS 1.3 encrypted sessions. Documents are stored in access-restricted buckets and accessible only by authorized compliance personnel.
              </p>
              <p>
                <strong>4. Automated Verification:</strong> Verification against NIMC and NIBSS repositories is performed through licensed aggregator interfaces (2SureVerify / Veripine) utilizing zero-knowledge validation where names and birth dates are verified without persistent storage of third-party datasets.
              </p>
              <p>
                <strong>5. Rights of the Data Subject:</strong> You have the right to request access to, rectification of, or erasure of your personal data subject to statutory financial transaction record retention mandates.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowNdprModal(false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
