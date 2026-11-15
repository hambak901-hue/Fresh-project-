import React, { useState, useEffect } from 'react';
import { ShieldCheck, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, LogOut, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

interface PinActivationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onActivated?: () => void;
}

export const PinActivationModal: React.FC<PinActivationModalProps> = ({
  isOpen,
  onClose,
  onActivated,
}) => {
  const { user, refreshUser, logout } = useAuth();
  const [pinLength, setPinLength] = useState<number>(user?.pin_length || 4);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);
    setPin('');
    setConfirmPin('');
    api
      .getPublicPinPolicy()
      .then(pol => {
        if (pol?.pin_length) {
          setPinLength(pol.pin_length);
        }
      })
      .catch(() => {
        if (user?.pin_length) setPinLength(user.pin_length);
      });
  }, [isOpen, user?.pin_length]);

  if (!isOpen || !user || user.role !== 'customer') return null;

  const isWeakLocalCheck = (value: string): string | null => {
    if (value.length !== pinLength) {
      return `Please enter exactly ${pinLength} digits.`;
    }
    if (/^(\d)\1+$/.test(value)) {
      return `Repeated digits like ${value} are blocked for your security.`;
    }
    let asc = true;
    let desc = true;
    for (let i = 1; i < value.length; i++) {
      const diff = Number(value[i]) - Number(value[i - 1]);
      if (diff !== 1) asc = false;
      if (diff !== -1) desc = false;
    }
    if (asc || desc) {
      return `Sequential PINs like ${value} are too predictable. Choose a stronger combination.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const weakErr = isWeakLocalCheck(pin);
    if (weakErr) {
      setError(weakErr);
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.setCustomerPin({ pin });
      setSuccessMsg(res.message || 'Transaction PIN activated successfully!');
      await refreshUser();
      setTimeout(() => {
        onActivated?.();
        onClose?.();
      }, 650);
    } catch (err: any) {
      setError(err?.message || 'Unable to activate Transaction PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-900 dark:text-slate-100">
        {!user.requires_pin_setup && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="text-center space-y-2 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-600/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            Compulsory Account Security Step
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            Activate Your {pinLength}-Digit Transaction PIN
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Every wallet debit, airtime/data purchase, verification, and referral cashout requires your personal {pinLength}-digit Transaction PIN.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                New {pinLength}-Digit PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPins(!showPins)}
                className="text-[11px] text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 hover:underline"
              >
                {showPins ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPins ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type={showPins ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={pinLength}
                required
                autoFocus
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                placeholder={'•'.repeat(pinLength)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono tracking-[0.4em] text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Confirm {pinLength}-Digit PIN
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type={showPins ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={pinLength}
                required
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                placeholder={'•'.repeat(pinLength)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono tracking-[0.4em] text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">PIN Security Guidelines</p>
            <p>Avoid repeated digits (1111), sequences (1234), or digits from your phone number.</p>
          </div>

          <button
            type="submit"
            disabled={loading || pin.length !== pinLength || confirmPin.length !== pinLength}
            className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-700/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Activating Security PIN...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Activate Transaction PIN &amp; Continue</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hover:text-slate-800 dark:hover:text-slate-200 transition"
            >
              Remind me before spending
            </button>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline ml-auto"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
