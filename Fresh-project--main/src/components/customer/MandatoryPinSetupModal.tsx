/**
 * @file MandatoryPinSetupModal.tsx
 * Compulsory Transaction PIN activation overlay for new registrations and existing
 * customers who have not yet activated their transaction PIN.
 */

import React, { useState } from 'react';
import { LockKeyhole, ShieldAlert, CheckCircle2, Eye, EyeOff, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

function isWeakPinPattern(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  if ('01234567890'.includes(pin) || '9876543210'.includes(pin)) return true;
  const common = new Set([
    '0000', '1111', '1234', '4321', '1122', '1212', '2000', '2020', '2024', '2025', '2026', '2580',
    '00000', '11111', '12345', '54321',
    '000000', '111111', '123456', '654321',
  ]);
  return common.has(pin);
}

interface MandatoryPinSetupModalProps {
  isOpen: boolean;
  onCompleted?: () => void;
  onLogout?: () => void;
}

export const MandatoryPinSetupModal: React.FC<MandatoryPinSetupModalProps> = ({
  isOpen,
  onCompleted,
  onLogout,
}) => {
  const { user, pinPolicy, refreshUser, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!isOpen || !user) return null;

  const expectedLength = pinPolicy?.pin_length || 4;
  const allowWeak = Boolean(pinPolicy?.allow_weak_pins);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPin = pin.replace(/\D/g, '');
    const cleanConfirm = confirmPin.replace(/\D/g, '');

    if (cleanPin.length !== expectedLength) {
      setError(`Your Transaction PIN must be exactly ${expectedLength} numeric digits.`);
      return;
    }
    if (cleanPin !== cleanConfirm) {
      setError('PIN entries do not match. Please re-enter and confirm.');
      return;
    }
    if (!allowWeak && isWeakPinPattern(cleanPin)) {
      setError('Please choose a stronger PIN. Repeated digits (e.g. 1111) or simple sequences (e.g. 1234) are blocked.');
      return;
    }

    const phoneDigits = (user.phone_number || '').replace(/\D/g, '');
    if (!allowWeak && phoneDigits && (phoneDigits.endsWith(cleanPin) || phoneDigits.startsWith(cleanPin))) {
      setError('For your safety, your Transaction PIN cannot match the beginning or end of your phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.setTransactionPin(cleanPin);
      if (!res.success) {
        throw new Error(res.message || 'Unable to activate Transaction PIN.');
      }
      setDone(true);
      await refreshUser();
      setTimeout(() => {
        setPin('');
        setConfirmPin('');
        setDone(false);
        onCompleted?.();
      }, 650);
    } catch (err: any) {
      setError(err?.message || 'Unable to activate Transaction PIN right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (onLogout) {
      onLogout();
    } else {
      await logout();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mandatory-pin-heading"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
              <LockKeyhole className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Mandatory Account Security
              </p>
              <h2
                id="mandatory-pin-heading"
                className="text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5"
              >
                Activate Your {expectedLength}-Digit Transaction PIN
              </h2>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              Welcome <span className="font-semibold">{user.full_name}</span>. To protect your wallet from unauthorized transactions, you must activate a confidential {expectedLength}-digit Transaction PIN before purchasing airtime, data, identity services, or converting referral rewards.
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 font-medium">
              {error}
            </div>
          )}

          {done && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Transaction PIN activated successfully. Opening your dashboard...</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Create {expectedLength}-Digit PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPins(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPins ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <input
              type={showPins ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={expectedLength}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, expectedLength))}
              placeholder={'•'.repeat(expectedLength)}
              required
              autoFocus
              className="w-full px-4 py-3 text-center tracking-[0.65em] text-lg font-bold tabular-nums rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Confirm {expectedLength}-Digit PIN
            </label>
            <input
              type={showPins ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={expectedLength}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, expectedLength))}
              placeholder={'•'.repeat(expectedLength)}
              required
              className="w-full px-4 py-3 text-center tracking-[0.65em] text-lg font-bold tabular-nums rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Rules: Use {expectedLength} unique numeric digits. Avoid sequences (1234), repeated digits (1111), your phone number, or birth year.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
            <button
              type="submit"
              disabled={submitting || pin.length !== expectedLength || confirmPin.length !== expectedLength}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition shadow-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockKeyhole className="w-4 h-4" />}
              <span>{submitting ? 'Activating PIN...' : 'Activate PIN & Continue'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
