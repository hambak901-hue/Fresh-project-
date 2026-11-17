import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  KeyRound,
  Monitor,
  Smartphone,
  Lock,
  Unlock,
  RotateCcw,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Copy,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  MfaPolicy,
  MfaStatus,
  PinPolicy,
  PinUserStatusRow,
  SessionSecuritySettings,
  UserSessionItem,
} from '../../types';

const PIN_CATEGORY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'nin_verification', label: 'NIN Verification' },
  { key: 'bvn_verification', label: 'BVN Verification' },
  { key: 'nin_modification', label: 'NIN Modification' },
  { key: 'bvn_modification', label: 'BVN Modification' },
  { key: 'nin_enrolment', label: 'NIN Enrolment' },
  { key: 'telecom_data', label: 'Telecom Data Plans' },
  { key: 'telecom_airtime', label: 'Telecom Airtime' },
  { key: 'telecom_pins', label: 'Data / Airtime / Exam ePINs' },
  { key: 'telecom_bills', label: 'Cable TV & Electricity' },
  { key: 'telecom_bulksms', label: 'Bulk SMS Dispatch' },
  { key: 'wallet_transfer', label: 'Wallet Transfers' },
  { key: 'referral_wallet_conversion', label: 'Referral Wallet / Points Conversion' },
  { key: 'referral_withdrawal', label: 'Referral Bank Cash Withdrawal' },
];

export function AdminSecurityPinManagement() {
  const { user, refreshUser } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const [activeTab, setActiveTab] = useState<'pin' | 'mfa_sessions'>('pin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // PIN Governance state
  const [pinPolicy, setPinPolicy] = useState<PinPolicy | null>(null);
  const [pinSummary, setPinSummary] = useState<{
    total_customers: number;
    pin_activated_count: number;
    pin_missing_count: number;
    pin_locked_count: number;
  } | null>(null);
  const [pinUsers, setPinUsers] = useState<PinUserStatusRow[]>([]);
  const [resetModal, setResetModal] = useState<{
    row: PinUserStatusRow;
    mode: 'force_reactivate' | 'set_temp_pin';
    newPin: string;
  } | null>(null);

  // MFA & Sessions Governance state
  const [mfaPolicy, setMfaPolicy] = useState<MfaPolicy | null>(null);
  const [secSettings, setSecSettings] = useState<SessionSecuritySettings | null>(null);
  const [activeSessions, setActiveSessions] = useState<UserSessionItem[]>([]);
  const [failedLogins, setFailedLogins] = useState<any[]>([]);
  const [mfaStats, setMfaStats] = useState<{
    admin_mfa_enabled: number;
    total_admins: number;
    customer_mfa_enabled: number;
  } | null>(null);

  // Caller Admin Own MFA Self-Enrollment
  const [myMfaStatus, setMyMfaStatus] = useState<MfaStatus | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_url: string; qr_url?: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePwd, setDisablePwd] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pinRes, secRes, myMfaRes] = await Promise.allSettled([
        api.getAdminPinOverview(),
        api.getAdminSecurityOverview(),
        api.getMfaStatus(),
      ]);
      if (pinRes.status === 'fulfilled' && pinRes.value.success) {
        setPinPolicy(pinRes.value.policy);
        setPinSummary(pinRes.value.summary);
        setPinUsers(pinRes.value.users || []);
      }
      if (secRes.status === 'fulfilled' && secRes.value.success) {
        setMfaPolicy(secRes.value.mfa_policy);
        setSecSettings(secRes.value.security_settings);
        setActiveSessions(secRes.value.active_sessions || []);
        setFailedLogins(secRes.value.failed_logins || []);
        setMfaStats(secRes.value.mfa_stats || null);
      }
      if (myMfaRes.status === 'fulfilled' && myMfaRes.value.success) {
        setMyMfaStatus(myMfaRes.value.mfa);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to load security governance data.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSavePinPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPolicy || !isSuperAdmin) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateAdminPinPolicy(pinPolicy);
      if (res.policy) setPinPolicy(res.policy);
      setFeedback({ type: 'success', message: res.message || 'Transaction PIN policy saved.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update PIN policy.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlockPin = async (userId: string) => {
    setBusyId(userId);
    setFeedback(null);
    try {
      const res = await api.adminUnlockUserPin(userId);
      setFeedback({ type: 'success', message: res.message || 'Customer PIN unlocked.' });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to unlock customer PIN.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModal) return;
    setBusyId(resetModal.row.id);
    setFeedback(null);
    try {
      const res = await api.adminResetUserPin(
        resetModal.row.id,
        resetModal.mode,
        resetModal.mode === 'set_temp_pin' ? resetModal.newPin : undefined
      );
      setFeedback({ type: 'success', message: res.message || 'Customer PIN reset completed.' });
      setResetModal(null);
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'PIN reset failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveMfaSessionPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !mfaPolicy || !secSettings) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateAdminMfaSecurityPolicy({
        mfa_policy: mfaPolicy,
        security_settings: secSettings,
      });
      if (res.mfa_policy) setMfaPolicy(res.mfa_policy);
      if (res.security_settings) setSecSettings(res.security_settings);
      setFeedback({ type: 'success', message: res.message || 'MFA and session security policy saved.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save security policy.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!isSuperAdmin) return;
    setBusyId(sessionId);
    setFeedback(null);
    try {
      const res = await api.adminRevokeSession(sessionId);
      setFeedback({ type: 'success', message: res.message || 'Session revoked immediately.' });
      setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to revoke session.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleEnableMyEmailMfa = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.setEmailMfa(true);
      if (res.recovery_codes?.length) setRecoveryCodes(res.recovery_codes);
      setFeedback({ type: 'success', message: res.message || 'Email OTP MFA enabled on your administrator account.' });
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to enable Email MFA.' });
    } finally {
      setSaving(false);
    }
  };

  const handleBeginMyTotp = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.beginTotpSetup();
      let generatedQr = res.qr_url;
      if (res.otpauth_url) {
        try {
          generatedQr = await QRCode.toDataURL(res.otpauth_url, { width: 220, margin: 1 });
        } catch {
          // keep fallback
        }
      }
      setTotpSetup({ secret: res.secret, otpauth_url: res.otpauth_url, qr_url: generatedQr });
      setTotpCode('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to begin TOTP enrollment.' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmMyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.confirmTotpSetup(totpCode.trim());
      if (res.recovery_codes?.length) setRecoveryCodes(res.recovery_codes);
      setTotpSetup(null);
      setTotpCode('');
      setFeedback({ type: 'success', message: res.message || 'Authenticator App MFA is now active on your account.' });
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Invalid authenticator code.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableMyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.disableMfa(disablePwd);
      setShowDisable(false);
      setDisablePwd('');
      setRecoveryCodes([]);
      setFeedback({ type: 'success', message: res.message || 'MFA disabled on your account.' });
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to disable MFA.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !pinPolicy && !mfaPolicy) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium">Loading PIN, MFA &amp; Session Security Controls...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Authentication &amp; Financial Authorization Governance</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Transaction PIN, MFA &amp; Session Security
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enforce mandatory Transaction PINs, configure Email OTP &amp; TOTP MFA, manage active user sessions, and inspect lockouts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAll()}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 self-start md:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Security</span>
        </button>
      </div>

      {!isSuperAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            Policy edits and active session revocation require Super Admin privileges. You may assist locked customers and configure your own MFA below.
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700">
            &times;
          </button>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('pin')}
          className={`px-4 py-2 rounded-xl font-semibold inline-flex items-center gap-2 ${
            activeTab === 'pin' ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Transaction PIN Governance</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mfa_sessions')}
          className={`px-4 py-2 rounded-xl font-semibold inline-flex items-center gap-2 ${
            activeTab === 'mfa_sessions' ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>MFA &amp; Active Sessions ({activeSessions.length})</span>
        </button>
      </div>

      {/* TAB 1: TRANSACTION PIN */}
      {activeTab === 'pin' && (
        <div className="space-y-6">
          {pinSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Total Customers</p>
                <p className="text-xl font-extrabold font-mono tabular-nums mt-1">{pinSummary.total_customers}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">PIN Activated</p>
                <p className="text-xl font-extrabold font-mono tabular-nums text-emerald-600 mt-1">{pinSummary.pin_activated_count}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Pending Activation</p>
                <p className="text-xl font-extrabold font-mono tabular-nums text-amber-600 mt-1">{pinSummary.pin_missing_count}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Currently Locked</p>
                <p className="text-xl font-extrabold font-mono tabular-nums text-rose-600 mt-1">{pinSummary.pin_locked_count}</p>
              </div>
            </div>
          )}

          {pinPolicy && (
            <form onSubmit={handleSavePinPolicy} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Master PIN Enforcement Policy</h3>
                  <p className="text-xs text-slate-500">Control required PIN length, lockout thresholds, and protected endpoints.</p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={pinPolicy.enforce_transaction_pin}
                    onChange={(e) => setPinPolicy({ ...pinPolicy, enforce_transaction_pin: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Enforce Server-Side PIN Checks</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Required PIN Length</label>
                  <select
                    disabled={!isSuperAdmin}
                    value={pinPolicy.pin_length}
                    onChange={(e) => setPinPolicy({ ...pinPolicy, pin_length: Number(e.target.value) as 4 | 5 | 6 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  >
                    <option value={4}>4 Digits</option>
                    <option value={5}>5 Digits</option>
                    <option value={6}>6 Digits</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Max Failed Attempts</label>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    disabled={!isSuperAdmin}
                    value={pinPolicy.pin_max_attempts}
                    onChange={(e) => setPinPolicy({ ...pinPolicy, pin_max_attempts: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Lockout Duration (Mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    disabled={!isSuperAdmin}
                    value={pinPolicy.pin_lockout_minutes}
                    onChange={(e) => setPinPolicy({ ...pinPolicy, pin_lockout_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Reset OTP Expiry (Mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    disabled={!isSuperAdmin}
                    value={pinPolicy.otp_reset_expiry_minutes}
                    onChange={(e) => setPinPolicy({ ...pinPolicy, otp_reset_expiry_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={pinPolicy.require_pin_activation_for_all_customers}
                    onChange={(e) =>
                      setPinPolicy({ ...pinPolicy, require_pin_activation_for_all_customers: e.target.checked })
                    }
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Compulsory PIN Activation Prompt Before Protected Services</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={pinPolicy.allow_weak_pins}
                    onChange={(e) => setPinPolicy({ ...pinPolicy, allow_weak_pins: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Allow Sequential/Repeated PINs</span>
                </label>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Protected Service &amp; Financial Operations</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {PIN_CATEGORY_LABELS.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={Boolean(pinPolicy.protected_categories?.[item.key] ?? true)}
                        onChange={(e) =>
                          setPinPolicy({
                            ...pinPolicy,
                            protected_categories: {
                              ...(pinPolicy.protected_categories || {}),
                              [item.key]: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {isSuperAdmin && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save PIN Policy</span>
                </button>
              )}
            </form>
          )}

          {/* Customer PIN Exception Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Customer PIN Exceptions (Locked, Failed Attempts, or Missing PIN)
              </h3>
            </div>
            {pinUsers.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">All customer accounts have active, unlocked Transaction PINs.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">PIN Status</th>
                    <th className="py-3 px-4">Failed Attempts</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pinUsers.map((row) => {
                    const hasPin = Boolean(row.has_transaction_pin);
                    const isLocked = Boolean(row.pin_locked_until && new Date(row.pin_locked_until) > new Date());
                    return (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">{row.full_name}</p>
                          <p className="text-[10px] font-mono text-slate-500">{row.email}</p>
                        </td>
                        <td className="py-3 px-4">
                          {isLocked ? (
                            <span className="text-rose-600 font-bold">Locked until {new Date(row.pin_locked_until!).toLocaleTimeString()}</span>
                          ) : hasPin ? (
                            <span className="text-emerald-600 font-semibold">Activated</span>
                          ) : (
                            <span className="text-amber-600 font-semibold">Not Activated</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">{row.pin_failed_attempts}</td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {(isLocked || row.pin_failed_attempts > 0) && (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => handleUnlockPin(row.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Unlock</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setResetModal({ row, mode: 'force_reactivate', newPin: '' })}
                            className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset PIN</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MFA & SESSIONS */}
      {activeTab === 'mfa_sessions' && (
        <div className="space-y-6">
          {mfaStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Admin MFA Adoption</p>
                <p className="text-xl font-extrabold font-mono tabular-nums mt-1">
                  {mfaStats.admin_mfa_enabled} / {mfaStats.total_admins}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Customer MFA Opt-Ins</p>
                <p className="text-xl font-extrabold font-mono tabular-nums text-emerald-600 mt-1">{mfaStats.customer_mfa_enabled}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Active Tracked Sessions</p>
                <p className="text-xl font-extrabold font-mono tabular-nums text-blue-600 mt-1">{activeSessions.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">Failed Login Records</p>
                <p className="text-xl font-extrabold font-mono tabular-nums text-amber-600 mt-1">{failedLogins.length}</p>
              </div>
            </div>
          )}

          {/* Caller Admin Self MFA Enrollment */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>Your Administrator MFA Setup</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Status: <strong>{myMfaStatus?.enabled ? `Active (${myMfaStatus.preferred_method})` : 'Off'}</strong>
                  {myMfaStatus ? ` • Recovery codes remaining: ${myMfaStatus.recovery_codes_remaining}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleBeginMyTotp}
                  className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold"
                >
                  {myMfaStatus?.totp_configured ? 'Reconfigure Authenticator' : 'Setup Authenticator App'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleEnableMyEmailMfa}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Use Email OTP MFA
                </button>
                {myMfaStatus?.enabled && !myMfaStatus.required_by_policy && (
                  <button
                    type="button"
                    onClick={() => setShowDisable((v) => !v)}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold"
                  >
                    Disable
                  </button>
                )}
              </div>
            </div>

            {recoveryCodes.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-amber-800 dark:text-amber-300">
                  <span>Backup Recovery Codes (Save Offline)</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
                  {recoveryCodes.map((c) => (
                    <div key={c} className="px-2 py-1 rounded bg-white dark:bg-slate-950 border border-amber-200 text-center">
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totpSetup && (
              <form onSubmit={handleConfirmMyTotp} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <p className="text-xs font-semibold">Scan QR or enter secret in Google Authenticator:</p>
                {totpSetup.qr_url && (
                  <img src={totpSetup.qr_url} alt="Admin TOTP QR" className="w-36 h-36 bg-white p-1.5 rounded-xl border" />
                )}
                <p className="text-[11px] font-mono break-all text-slate-600 dark:text-slate-400">Secret: {totpSetup.secret}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                  />
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                    Verify
                  </button>
                </div>
              </form>
            )}

            {showDisable && (
              <form onSubmit={handleDisableMyMfa} className="flex gap-2">
                <input
                  type="password"
                  required
                  value={disablePwd}
                  onChange={(e) => setDisablePwd(e.target.value)}
                  placeholder="Confirm admin password to disable MFA"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-rose-300 text-xs"
                />
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">
                  Confirm Disable
                </button>
              </form>
            )}
          </div>

          {/* MFA & Session Policy Form */}
          {mfaPolicy && secSettings && (
            <form onSubmit={handleSaveMfaSessionPolicy} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Platform MFA &amp; Session Policy</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={mfaPolicy.enforce_mfa_for_superadmin}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, enforce_mfa_for_superadmin: e.target.checked })}
                  />
                  <span>Require MFA for Super Admin</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={mfaPolicy.enforce_mfa_for_admin}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, enforce_mfa_for_admin: e.target.checked })}
                  />
                  <span>Require MFA for Staff Admins</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={mfaPolicy.allow_customer_mfa}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, allow_customer_mfa: e.target.checked })}
                  />
                  <span>Allow Customer MFA Opt-In</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={mfaPolicy.allow_email_otp}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, allow_email_otp: e.target.checked })}
                  />
                  <span>Allow Email OTP Channel</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={mfaPolicy.allow_totp}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, allow_totp: e.target.checked })}
                  />
                  <span>Allow Authenticator (TOTP)</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={secSettings.bind_user_agent}
                    onChange={(e) => setSecSettings({ ...secSettings, bind_user_agent: e.target.checked })}
                  />
                  <span>Bind Sessions to User-Agent</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">TOTP Issuer Label</label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={mfaPolicy.totp_issuer}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, totp_issuer: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">MFA OTP Expiry (Mins)</label>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    disabled={!isSuperAdmin}
                    value={mfaPolicy.otp_expiry_minutes}
                    onChange={(e) => setMfaPolicy({ ...mfaPolicy, otp_expiry_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Customer Session Timeout (Mins)</label>
                  <input
                    type="number"
                    min={15}
                    disabled={!isSuperAdmin}
                    value={secSettings.session_timeout_minutes}
                    onChange={(e) => setSecSettings({ ...secSettings, session_timeout_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Admin Session Timeout (Mins)</label>
                  <input
                    type="number"
                    min={10}
                    disabled={!isSuperAdmin}
                    value={secSettings.admin_session_timeout_minutes}
                    onChange={(e) =>
                      setSecSettings({ ...secSettings, admin_session_timeout_minutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Max Login Attempts</label>
                  <input
                    type="number"
                    min={3}
                    max={15}
                    disabled={!isSuperAdmin}
                    value={secSettings.login_max_attempts}
                    onChange={(e) => setSecSettings({ ...secSettings, login_max_attempts: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">Login Lockout (Mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    disabled={!isSuperAdmin}
                    value={secSettings.login_lockout_minutes}
                    onChange={(e) => setSecSettings({ ...secSettings, login_lockout_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>

              {isSuperAdmin && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save MFA &amp; Session Policy</span>
                </button>
              )}
            </form>
          )}

          {/* Active Sessions Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Server-Tracked Sessions</h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Device / IP</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Revoke</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {activeSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {s.full_name} <span className="text-[10px] uppercase font-mono text-blue-600">({s.role})</span>
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">{s.email}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p>{s.device_label}</p>
                      <p className="text-[10px] font-mono text-slate-500">IP: {s.ip_address}</p>
                    </td>
                    <td className="py-3 px-4 text-[11px] font-mono text-slate-500">
                      {new Date(s.last_seen_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isSuperAdmin && (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => handleRevokeSession(s.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin PIN Reset Modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleResetPinSubmit}
            className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Reset Customer Transaction PIN</h3>
            <p className="text-xs text-slate-500">
              Customer: <strong className="text-slate-900 dark:text-white">{resetModal.row.full_name}</strong> ({resetModal.row.email})
            </p>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={resetModal.mode === 'force_reactivate'}
                  onChange={() => setResetModal({ ...resetModal, mode: 'force_reactivate', newPin: '' })}
                />
                <span>Clear PIN &amp; force customer self-activation on next login</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={resetModal.mode === 'set_temp_pin'}
                  onChange={() => setResetModal({ ...resetModal, mode: 'set_temp_pin' })}
                />
                <span>Assign a temporary {pinPolicy?.pin_length || 4}-digit PIN immediately</span>
              </label>
            </div>
            {resetModal.mode === 'set_temp_pin' && (
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={pinPolicy?.pin_length || 4}
                value={resetModal.newPin}
                onChange={(e) => setResetModal({ ...resetModal, newPin: e.target.value.replace(/\D/g, '') })}
                placeholder={`Enter ${pinPolicy?.pin_length || 4}-digit temporary PIN`}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-mono tracking-widest"
              />
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === resetModal.row.id}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
              >
                Apply PIN Reset
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
