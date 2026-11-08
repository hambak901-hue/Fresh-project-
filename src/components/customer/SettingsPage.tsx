import React, { useState } from 'react';
import { Settings, Lock, KeyRound, Shield, Bell, Smartphone, CheckCircle2, AlertCircle, Loader2, Upload, FileText, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';

interface SettingsPageProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

export function SettingsPage({ user, onUpdateUser }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'security' | 'pin' | 'kyc' | 'notifications'>('security');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Transaction PIN state
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handlePinUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setPinMsg({ type: 'error', text: 'PIN must be exactly 4 digits' });
      return;
    }
    if (pin !== confirmPin) {
      setPinMsg({ type: 'error', text: 'PIN confirmation does not match' });
      return;
    }
    setPinLoading(true);
    setPinMsg(null);
    try {
      const res = await api.updateCustomerPin({
        pin,
        current_pin: user.has_transaction_pin ? currentPin : undefined,
      });
      setPinMsg({ type: 'success', text: res.message });
      onUpdateUser({ ...user, has_transaction_pin: true });
      setPin('');
      setConfirmPin('');
      setCurrentPin('');
    } catch (err: any) {
      setPinMsg({ type: 'error', text: err.message || 'Failed to set transaction PIN' });
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
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Account & Security Settings
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your credentials, 4-digit transaction authorization PIN, KYC document tiers, and notification alerts.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'security'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Password & Access</span>
          </button>
          <button
            onClick={() => setActiveTab('pin')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'pin'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Transaction PIN ({user.has_transaction_pin ? 'Active' : 'Unset'})</span>
          </button>
          <button
            onClick={() => setActiveTab('kyc')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'kyc'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>KYC Compliance ({user.kyc_status.toUpperCase()})</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Alerts & Notifications</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PASSWORD & SECURITY */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handlePasswordUpdate} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              <span>Change Account Password</span>
            </h2>

            {passwordMsg && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  passwordMsg.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}
              >
                {passwordMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={passwordLoading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
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

          {/* Session Security */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Active Security Session</span>
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Your session is authenticated via encrypted JWT Bearer tokens signed with HMAC-SHA256.
            </p>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1 text-slate-400 font-mono text-[11px]">
              <p>Host: TrueHost Cloud (LON110)</p>
              <p>TLS: TLS 1.3 / AES-256-GCM</p>
              <p>IP Binding: Active</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRANSACTION PIN */}
      {activeTab === 'pin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handlePinUpdate} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                <span>{user.has_transaction_pin ? 'Change 4-Digit Transaction PIN' : 'Set Your 4-Digit Transaction PIN'}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                This PIN is required before sensitive operations (wallet withdrawals, large airtime transactions, and verification lookups).
              </p>
            </div>

            {pinMsg && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  pinMsg.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}
              >
                {pinMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>{pinMsg.text}</span>
              </div>
            )}

            {user.has_transaction_pin && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Current 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={currentPin}
                  onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  className="w-40 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-40 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Confirm 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className="w-40 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pinLoading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
            >
              {pinLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving PIN...</span>
                </>
              ) : (
                <span>{user.has_transaction_pin ? 'Update PIN' : 'Save Transaction PIN'}</span>
              )}
            </button>
          </form>

          {/* PIN Helper Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>PIN Security Guidelines</span>
            </h3>
            <ul className="text-slate-400 space-y-2 list-disc list-inside">
              <li>Never use predictable combinations like 1234 or 0000.</li>
              <li>HambakTech staff will never request your 4-digit PIN.</li>
              <li>Entering wrong PIN 3 times will lock withdrawals for 1 hour.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 3: KYC COMPLIANCE */}
      {activeTab === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleKycSubmit} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Submit Tier 2/3 Identity Documents</span>
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                  user.kyc_status === 'verified'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}>
                  Status: {user.kyc_status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Upload your government-issued ID to upgrade your wallet daily limit to ₦2,000,000.
              </p>
            </div>

            {kycMsg && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  kycMsg.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}
              >
                {kycMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>{kycMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Identification Type
                </label>
                <select
                  value={idType}
                  onChange={e => setIdType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="NIN Slip">National Identity (NIN Slip)</option>
                  <option value="BVN Printout">Bank Verification Number (BVN)</option>
                  <option value="Voters Card">INEC Permanent Voter's Card (PVC)</option>
                  <option value="International Passport">International Passport</option>
                  <option value="Drivers License">FRSC Driver's License</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Document / ID Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 70129384619"
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Document File Preview URL
              </label>
              <input
                type="text"
                value={docUrl}
                onChange={e => setDocUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Notes / Explanation (Optional)
              </label>
              <textarea
                rows={2}
                value={kycNotes}
                onChange={e => setKycNotes(e.target.value)}
                placeholder="Any special remarks for the compliance reviewer..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={kycLoading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/20"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Submitted Documents</span>
            </h3>
            {user.kyc_documents && user.kyc_documents.length > 0 ? (
              <div className="space-y-3">
                {user.kyc_documents.map(doc => (
                  <div key={doc.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{doc.id_type}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        doc.status === 'verified'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : doc.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                    <p className="font-mono text-slate-400 text-[11px]">{doc.id_number}</p>
                    <p className="text-[10px] text-slate-500">{new Date(doc.submitted_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400">No verification documents submitted yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ALERTS & NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-400" />
                <span>Notification & Security Channels</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Customize how and when you receive financial alerts and system broadcasts.
              </p>
            </div>
            {prefsMsg && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>{prefsMsg}</span>
              </span>
            )}
          </div>

          <div className="space-y-4 pt-2 divide-y divide-slate-800">
            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-white">Email Transaction Alerts</p>
                <p className="text-xs text-slate-400">Receive receipt emails for wallet funding and service debits.</p>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={e => setEmailAlerts(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-white">SMS Delivery Receipts</p>
                <p className="text-xs text-slate-400">Receive instant SMS token updates when VTU bundles are dispensed.</p>
              </div>
              <input
                type="checkbox"
                checked={smsAlerts}
                onChange={e => setSmsAlerts(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-white">Security & Login Warnings</p>
                <p className="text-xs text-slate-400">Notify me whenever a new IP address or browser signs in.</p>
              </div>
              <input
                type="checkbox"
                checked={securityWarnings}
                onChange={e => setSecurityWarnings(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-sm font-semibold text-white">Two-Factor Authentication (2FA)</p>
                <p className="text-xs text-slate-400">Require an additional OTP sent to your phone upon login.</p>
              </div>
              <input
                type="checkbox"
                checked={twoFactorEnabled}
                onChange={e => setTwoFactorEnabled(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={prefsLoading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
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
