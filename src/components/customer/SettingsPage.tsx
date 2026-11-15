import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  KeyRound,
  Shield,
  Bell,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  FileText,
  Check,
  Monitor,
  Trash2,
  LogOut,
  Copy,
  RefreshCw,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { MfaPolicy, MfaStatus, User, UserSessionItem } from '../../types';

interface SettingsPageProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

export function SettingsPage({ user, onUpdateUser }: SettingsPageProps) {
  const { pinPolicy, refreshUser, logout } = useAuth();
  const pinLength = pinPolicy?.pin_length || 4;

  const [activeTab, setActiveTab] = useState<'security' | 'pin' | 'kyc' | 'notifications'>('security');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Sessions & MFA State
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaPolicy, setMfaPolicy] = useState<MfaPolicy | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaMsg, setMfaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_url: string; qr_url?: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableMfaPassword, setDisableMfaPassword] = useState('');
  const [showDisableMfa, setShowDisableMfa] = useState(false);

  // Transaction PIN state
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline Forgot PIN via OTP state
  const [showOtpReset, setShowOtpReset] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNewPin, setOtpNewPin] = useState('');
  const [otpConfirmPin, setOtpConfirmPin] = useState('');

  // KYC state
  const [idType, setIdType] = useState('NIN Slip');
  const [idNumber, setIdNumber] = useState('');
  const [docUrl, setDocUrl] = useState('/public/assets/aistudio/IMG_0484_0fb633df.png');
  const [kycNotes, setKycNotes] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMsg, setKycMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notification Preferences
  const [emailAlerts, setEmailAlerts] = useState(user.notification_preferences?.email_alerts ?? true);
  const [smsAlerts, setSmsAlerts] = useState(user.notification_preferences?.sms_alerts ?? false);
  const [transactionReceipts, setTransactionReceipts] = useState(user.notification_preferences?.transaction_receipts ?? true);
  const [securityWarnings, setSecurityWarnings] = useState(user.notification_preferences?.security_warnings ?? true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.security_settings?.two_factor_enabled ?? false);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  const loadSecurityData = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const [sessRes, mfaRes] = await Promise.allSettled([api.listSessions(), api.getMfaStatus()]);
      if (sessRes.status === 'fulfilled' && sessRes.value.success) {
        setSessions(sessRes.value.sessions || []);
      }
      if (mfaRes.status === 'fulfilled' && mfaRes.value.success) {
        setMfaStatus(mfaRes.value.mfa);
        setMfaPolicy(mfaRes.value.policy);
        setTwoFactorEnabled(Boolean(mfaRes.value.mfa?.enabled));
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'security') {
      void loadSecurityData();
    }
  }, [activeTab, loadSecurityData]);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setPasswordLoading(true);
    setPasswordMsg(null);
    try {
      const res = await api.updateCustomerPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordMsg({ type: 'success', text: res.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await api.revokeOwnSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err: any) {
      setMfaMsg({ type: 'error', text: err?.message || 'Unable to revoke session.' });
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAllDevices = async () => {
    setSessionsLoading(true);
    try {
      await api.logoutAll();
      await logout();
    } catch (err: any) {
      setMfaMsg({ type: 'error', text: err?.message || 'Failed to sign out of all devices.' });
      setSessionsLoading(false);
    }
  };

  const handleEnableEmailMfa = async () => {
    setMfaLoading(true);
    setMfaMsg(null);
    try {
      const res = await api.setEmailMfa(true);
      if (res.recovery_codes?.length) {
        setRecoveryCodes(res.recovery_codes);
      }
      setMfaMsg({ type: 'success', text: res.message || 'Email OTP two-factor authentication enabled.' });
      await loadSecurityData();
      await refreshUser();
    } catch (err: any) {
      setMfaMsg({ type: 'error', text: err?.message || 'Failed to enable Email MFA.' });
    } finally {
      setMfaLoading(false);
    }
  };

  const handleBeginTotp = async () => {
    setMfaLoading(true);
    setMfaMsg(null);
    try {
      const res = await api.beginTotpSetup();
      let generatedQr: string | undefined = res.qr_url;
      if (res.otpauth_url) {
        try {
          generatedQr = await QRCode.toDataURL(res.otpauth_url, {
            width: 220,
            margin: 1,
          });
        } catch {
          // Keep fallback qr_url if local encoding fails
        }
      }
      setTotpSetup({
        secret: res.secret,
        otpauth_url: res.otpauth_url,
        qr_url: generatedQr,
      });
      setTotpCode('');
    } catch (err: any) {
      setMfaMsg({ type: 'error', text: err?.message || 'Unable to start authenticator setup.' });
    } finally {
      setMfaLoading(false);
    }
  };

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) return;
    setMfaLoading(true);
    setMfaMsg(null);
    try {
      const res = await api.confirmTotpSetup(totpCode.trim());
      if (res.recovery_codes?.length) {
        setRecoveryCodes(res.recovery_codes);
      }
      setTotpSetup(null);
      setTotpCode('');
      setMfaMsg({ type: 'success', text: res.message || 'Authenticator App MFA is now active!' });
      await loadSecurityData();
      await refreshUser();
    } catch (err: any) {
      setMfaMsg({ type: 'error', text: err?.message || 'Invalid authenticator verification code.' });
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaMsg(null);
    try {
      const res = await api.disableMfa(disableMfaPassword);
      setDisableMfaPassword('');
      setShowDisableMfa(false);
      setRecoveryCodes([]);
      setMfaMsg({ type: 'success', text: res.message || 'Two-factor authentication disabled.' });
      await loadSecurityData();
      await refreshUser();
    } catch (err: any) {
      setMfaMsg({ type: 'error', text: err?.message || 'Unable to disable MFA. Check your password.' });
    } finally {
      setMfaLoading(false);
    }
  };

  const handlePinUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== pinLength) {
      setPinMsg({ type: 'error', text: `PIN must be exactly ${pinLength} digits` });
      return;
    }
    if (pin !== confirmPin) {
      setPinMsg({ type: 'error', text: 'PIN confirmation does not match' });
      return;
    }
    setPinLoading(true);
    setPinMsg(null);
    try {
      const res = await api.setTransactionPin(pin, user.has_transaction_pin ? currentPin : undefined);
      setPinMsg({ type: 'success', text: res.message || 'Transaction PIN updated successfully.' });
      onUpdateUser({ ...user, has_transaction_pin: true });
      await refreshUser();
      setPin('');
      setConfirmPin('');
      setCurrentPin('');
    } catch (err: any) {
      setPinMsg({ type: 'error', text: err.message || 'Failed to set transaction PIN' });
    } finally {
      setPinLoading(false);
    }
  };

  const handleRequestPinOtp = async () => {
    setPinLoading(true);
    setPinMsg(null);
    try {
      const res = await api.requestPinResetOtp();
      setOtpSent(true);
      setPinMsg({ type: 'success', text: res.message || 'A verification OTP has been dispatched to your email.' });
    } catch (err: any) {
      setPinMsg({ type: 'error', text: err?.message || 'Unable to send PIN reset OTP.' });
    } finally {
      setPinLoading(false);
    }
  };

  const handleConfirmPinOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpNewPin.length !== pinLength) {
      setPinMsg({ type: 'error', text: `New PIN must be exactly ${pinLength} digits.` });
      return;
    }
    if (otpNewPin !== otpConfirmPin) {
      setPinMsg({ type: 'error', text: 'PIN confirmation does not match.' });
      return;
    }
    setPinLoading(true);
    setPinMsg(null);
    try {
      const res = await api.confirmPinResetOtp(otpCode.trim(), otpNewPin);
      setPinMsg({ type: 'success', text: res.message || 'Transaction PIN reset successfully.' });
      setShowOtpReset(false);
      setOtpSent(false);
      setOtpCode('');
      setOtpNewPin('');
      setOtpConfirmPin('');
      await refreshUser();
    } catch (err: any) {
      setPinMsg({ type: 'error', text: err?.message || 'Failed to reset PIN with OTP.' });
    } finally {
      setPinLoading(false);
    }
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idNumber) {
      setKycMsg({ type: 'error', text: 'ID Number is required' });
      return;
    }
    setKycLoading(true);
    setKycMsg(null);
    try {
      const res = await api.submitCustomerKyc({
        id_type: idType,
        id_number: idNumber,
        doc_url: docUrl,
        notes: kycNotes,
      });
      if (res?.user) {
        onUpdateUser(res.user);
        setKycMsg({ type: 'success', text: res.message });
        setIdNumber('');
        setKycNotes('');
      }
    } catch (err: any) {
      setKycMsg({ type: 'error', text: err.message || 'KYC submission failed' });
    } finally {
      setKycLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setPrefsLoading(true);
    setPrefsMsg(null);
    try {
      const res = await api.updateCustomerPreferences({
        notification_preferences: {
          email_alerts: emailAlerts,
          sms_alerts: smsAlerts,
          transaction_receipts: transactionReceipts,
          security_warnings: securityWarnings,
        },
        security_settings: {
          two_factor_enabled: twoFactorEnabled,
          login_alerts: true,
        },
      });
      if (res?.user) {
        onUpdateUser(res.user);
        setPrefsMsg('Preferences updated successfully');
        setTimeout(() => setPrefsMsg(null), 3000);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setPrefsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Account &amp; Security Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your password, active sessions, multi-factor authentication (MFA), {pinLength}-digit transaction PIN, and notification alerts.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition whitespace-nowrap ${
              activeTab === 'security'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Password, MFA &amp; Sessions</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pin')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition whitespace-nowrap ${
              activeTab === 'pin'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Transaction PIN ({user.has_transaction_pin ? 'Active' : 'Unset'})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('kyc')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition whitespace-nowrap ${
              activeTab === 'kyc'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>KYC Compliance ({user.kyc_status.toUpperCase()})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Alerts &amp; Notifications</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PASSWORD, MFA & ACTIVE SESSIONS */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handlePasswordUpdate}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Change Account Password</span>
              </h2>

              {passwordMsg && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                    passwordMsg.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
                  }`}
                >
                  {passwordMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{passwordMsg.text}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className="px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
              >
                {passwordLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </form>

            {/* Real MFA Configuration Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Two-Factor Authentication (MFA)</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Add a second verification step at sign-in using Email OTP or an Authenticator App (TOTP).
                  </p>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
                    mfaStatus?.enabled
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {mfaStatus?.enabled ? `Active (${mfaStatus.preferred_method === 'totp' ? 'Authenticator' : 'Email OTP'})` : 'Off'}
                </span>
              </div>

              {mfaMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    mfaMsg.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
                  }`}
                >
                  {mfaMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{mfaMsg.text}</span>
                </div>
              )}

              {recoveryCodes.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Save Your Backup Recovery Codes
                    </p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}
                      className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                    {recoveryCodes.map(code => (
                      <div key={code} className="px-2 py-1 rounded bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900 text-slate-800 dark:text-amber-200 text-center">
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totpSetup ? (
                <form onSubmit={handleConfirmTotp} className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Scan QR or copy setup key into Google Authenticator / Authy:
                  </p>
                  {totpSetup.qr_url && (
                    <div className="flex justify-center p-2 bg-white rounded-xl w-fit mx-auto border border-slate-200">
                      <img src={totpSetup.qr_url} alt="TOTP QR Code" className="w-36 h-36" />
                    </div>
                  )}
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] break-all text-slate-700 dark:text-slate-300">
                    Secret: {totpSetup.secret}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      maxLength={8}
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit code"
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
                    />
                    <button
                      type="submit"
                      disabled={mfaLoading || totpCode.length < 6}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold"
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => setTotpSetup(null)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {(mfaPolicy?.allow_totp ?? true) && (
                    <button
                      type="button"
                      disabled={mfaLoading}
                      onClick={handleBeginTotp}
                      className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold transition"
                    >
                      {mfaStatus?.totp_configured ? 'Reconfigure Authenticator App' : 'Enable Authenticator App'}
                    </button>
                  )}
                  {(mfaPolicy?.allow_email_otp ?? true) && (
                    <button
                      type="button"
                      disabled={mfaLoading}
                      onClick={handleEnableEmailMfa}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                    >
                      Use Email OTP MFA
                    </button>
                  )}
                  {mfaStatus?.enabled && !mfaStatus.required_by_policy && (
                    <button
                      type="button"
                      onClick={() => setShowDisableMfa(v => !v)}
                      className="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition"
                    >
                      Disable MFA
                    </button>
                  )}
                </div>
              )}

              {showDisableMfa && (
                <form onSubmit={handleDisableMfa} className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-2.5">
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                    Confirm your account password to disable MFA:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      required
                      value={disableMfaPassword}
                      onChange={e => setDisableMfaPassword(e.target.value)}
                      placeholder="Current password"
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-rose-200 dark:border-rose-800 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={mfaLoading}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                    >
                      Confirm
                    </button>
                  </div>
                </form>
              )}

              {mfaStatus && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  Recovery codes remaining: <span className="font-semibold">{mfaStatus.recovery_codes_remaining}</span>
                  {mfaStatus.required_by_policy ? ' • Enforced by platform security policy' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Active Sessions Management */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Active Signed-In Sessions</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Every login creates a tracked server session bound to your browser. Revoke any unrecognized device immediately.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadSecurityData()}
                  disabled={sessionsLoading}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogoutAllDevices}
                  disabled={sessionsLoading}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out All Devices</span>
                </button>
              </div>
            </div>

            {sessionsLoading && sessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading active sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">No active sessions found.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {sessions.map(sess => (
                  <div
                    key={sess.id}
                    className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40 dark:bg-slate-950/40"
                  >
                    <div className="space-y-0.5 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                        <span>{sess.device_label || 'Web Browser Session'}</span>
                        {sess.is_current && (
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            (Current Session)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        IP: {sess.ip_address || 'Unknown'} &bull; Last active: {new Date(sess.last_seen_at).toLocaleString()}
                      </p>
                    </div>
                    {!sess.is_current && (
                      <button
                        type="button"
                        disabled={revokingId === sess.id}
                        onClick={() => handleRevokeSession(sess.id)}
                        className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{revokingId === sess.id ? 'Revoking...' : 'Revoke'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TRANSACTION PIN */}
      {activeTab === 'pin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>
                    {user.has_transaction_pin
                      ? `Change ${pinLength}-Digit Transaction PIN`
                      : `Activate Your ${pinLength}-Digit Transaction PIN`}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  This PIN authorizes identity lookups, modifications, enrolment, airtime, data, bills, and referral conversions or withdrawals.
                </p>
              </div>
              {user.has_transaction_pin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOtpReset(v => !v);
                    setPinMsg(null);
                  }}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  {showOtpReset ? 'Use Current PIN Instead' : 'Forgot PIN? Reset via Email OTP'}
                </button>
              )}
            </div>

            {user.pin_is_locked && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">
                Your Transaction PIN is temporarily locked due to repeated failed attempts. Use Email OTP reset below or wait for lockout expiry.
              </div>
            )}

            {pinMsg && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  pinMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
                }`}
              >
                {pinMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{pinMsg.text}</span>
              </div>
            )}

            {!showOtpReset ? (
              <form onSubmit={handlePinUpdate} className="space-y-5">
                {user.has_transaction_pin && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Current {pinLength}-Digit PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={pinLength}
                      required
                      value={currentPin}
                      onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                      className="w-44 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      New {pinLength}-Digit PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={pinLength}
                      required
                      value={pin}
                      onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                      className="w-44 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Confirm {pinLength}-Digit PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={pinLength}
                      required
                      value={confirmPin}
                      onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                      className="w-44 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pinLoading}
                  className="px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
                >
                  {pinLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving PIN...</span>
                    </>
                  ) : (
                    <span>{user.has_transaction_pin ? 'Update Transaction PIN' : 'Activate Transaction PIN'}</span>
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Request a one-time security code to your email <span className="font-semibold">{user.email}</span> to reset your forgotten {pinLength}-digit Transaction PIN.
                </p>
                {!otpSent ? (
                  <button
                    type="button"
                    disabled={pinLoading}
                    onClick={handleRequestPinOtp}
                    className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2"
                  >
                    {pinLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Send Reset OTP to Email</span>
                  </button>
                ) : (
                  <form onSubmit={handleConfirmPinOtp} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Email OTP
                        </label>
                        <input
                          type="text"
                          required
                          value={otpCode}
                          onChange={e => setOtpCode(e.target.value.trim())}
                          placeholder="6-digit OTP"
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          New {pinLength}-Digit PIN
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={pinLength}
                          required
                          value={otpNewPin}
                          onChange={e => setOtpNewPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Confirm PIN
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={pinLength}
                          required
                          value={otpConfirmPin}
                          onChange={e => setOtpConfirmPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={pinLoading}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold"
                    >
                      {pinLoading ? 'Resetting PIN...' : 'Verify OTP & Reset PIN'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* PIN Helper Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" />
              <span>PIN Security Policy</span>
            </h3>
            <ul className="text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside leading-relaxed">
              <li>Required length: <strong className="text-slate-900 dark:text-white">{pinLength} numeric digits</strong>.</li>
              <li>Weak sequences (e.g. 1234, 0000) and phone segments are blocked.</li>
              <li>{pinPolicy?.pin_max_attempts || 5} wrong attempts locks PIN for {pinPolicy?.pin_lockout_minutes || 15} minutes.</li>
              <li>HambakTech staff will never ask for your Transaction PIN.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 3: KYC COMPLIANCE */}
      {activeTab === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleKycSubmit} className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Submit Tier 2/3 Identity Documents</span>
                </h2>
                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold capitalize ${
                  user.kyc_status === 'verified'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                }`}>
                  Status: {user.kyc_status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload your government-issued ID to upgrade your wallet daily limit to ₦2,000,000.
              </p>
            </div>

            {kycMsg && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  kycMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
                }`}
              >
                {kycMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{kycMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Identification Type
                </label>
                <select
                  value={idType}
                  onChange={e => setIdType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                >
                  <option value="NIN Slip">National Identity (NIN Slip)</option>
                  <option value="BVN Printout">Bank Verification Number (BVN)</option>
                  <option value="Voters Card">INEC Permanent Voter&apos;s Card (PVC)</option>
                  <option value="International Passport">International Passport</option>
                  <option value="Drivers License">FRSC Driver&apos;s License</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Document / ID Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 70129384619"
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Document File Preview URL
              </label>
              <input
                type="text"
                value={docUrl}
                onChange={e => setDocUrl(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Notes / Explanation (Optional)
              </label>
              <textarea
                rows={2}
                value={kycNotes}
                onChange={e => setKycNotes(e.target.value)}
                placeholder="Any special remarks for the compliance reviewer..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={kycLoading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
            >
              {kycLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Documents...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Submit for Compliance Review</span>
                </>
              )}
            </button>
          </form>

          {/* KYC Documents History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Submitted Documents</span>
            </h3>
            {user.kyc_documents && user.kyc_documents.length > 0 ? (
              <div className="space-y-3">
                {user.kyc_documents.map(doc => (
                  <div key={doc.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-white">{doc.id_type}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        doc.status === 'verified'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : doc.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'bg-red-500/10 text-red-700 dark:text-red-400'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                    <p className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">{doc.id_number}</p>
                    <p className="text-[10px] text-slate-400">{new Date(doc.submitted_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No verification documents submitted yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ALERTS & NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Notification &amp; Security Channels</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Customize how and when you receive financial alerts and system broadcasts.
              </p>
            </div>
            {prefsMsg && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>{prefsMsg}</span>
              </span>
            )}
          </div>

          <div className="space-y-4 pt-2 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Email Transaction Alerts</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receive receipt emails for wallet funding and service debits.</p>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={e => setEmailAlerts(e.target.checked)}
                className="w-5 h-5 accent-blue-700 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">SMS Delivery Receipts</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receive instant SMS token updates when VTU bundles are dispensed.</p>
              </div>
              <input
                type="checkbox"
                checked={smsAlerts}
                onChange={e => setSmsAlerts(e.target.checked)}
                className="w-5 h-5 accent-blue-700 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Transaction Receipt Emails</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receive downloadable breakdown confirmations for completed services.</p>
              </div>
              <input
                type="checkbox"
                checked={transactionReceipts}
                onChange={e => setTransactionReceipts(e.target.checked)}
                className="w-5 h-5 accent-blue-700 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Security &amp; Login Warnings</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Notify me whenever a new IP address or browser signs in.</p>
              </div>
              <input
                type="checkbox"
                checked={securityWarnings}
                onChange={e => setSecurityWarnings(e.target.checked)}
                className="w-5 h-5 accent-blue-700 rounded cursor-pointer"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={prefsLoading}
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
          >
            {prefsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Preferences...</span>
              </>
            ) : (
              <span>Save Alert Preferences</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
