import React, { useState, useEffect } from 'react';
import { Lock, X, AlertCircle, Loader2, KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface TransactionPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (verifiedPin?: string) => void;
  title?: string;
  description?: string;
  amount?: number;
}

export function TransactionPinModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Verify Transaction PIN',
  description,
  amount,
}: TransactionPinModalProps) {
  const { pinPolicy, refreshUser } = useAuth();
  const pinLength = pinPolicy?.pin_length || 4;

  const [pin, setPin] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Inline Forgot PIN OTP reset flow
  const [resetMode, setResetMode] = useState<'pin' | 'reset'>('pin');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setResetMode('pin');
      setOtpSent(false);
      setOtpCode('');
      setNewPin('');
      setConfirmNewPin('');
      setResetSuccess(null);
      setOtpPreview(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveDesc =
    description || `Enter your ${pinLength}-digit security PIN to authorize this transaction.`;

  const handleKeyPress = (num: string) => {
    if (pin.length < pinLength) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === pinLength) {
        verify(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const verify = async (pinToVerify: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.verifyPin(pinToVerify);
      if (res.success && res.verified) {
        setPin('');
        onSuccess(pinToVerify);
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err: any) {
      setError(err.message || `PIN verification failed. Please check your ${pinLength}-digit PIN.`);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      const res = await api.requestPinResetOtp();
      setOtpSent(true);
      setOtpPreview(res.otp_preview || null);
      setResetSuccess(res.message || 'Verification code sent to your registered email.');
    } catch (err: any) {
      setError(err?.message || 'Unable to send PIN reset OTP right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanNew = newPin.replace(/\D/g, '');
    if (cleanNew.length !== pinLength) {
      setError(`New PIN must be exactly ${pinLength} digits.`);
      return;
    }
    if (cleanNew !== confirmNewPin.replace(/\D/g, '')) {
      setError('New PIN confirmation does not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.confirmPinResetOtp(otpCode.trim(), cleanNew);
      await refreshUser();
      setResetSuccess(res.message || 'Transaction PIN reset successfully!');
      setTimeout(() => {
        setResetMode('pin');
        setOtpSent(false);
        setOtpCode('');
        setNewPin('');
        setConfirmNewPin('');
        setResetSuccess(null);
      }, 900);
    } catch (err: any) {
      setError(err?.message || 'Invalid OTP or weak PIN.');
    } finally {
      setLoading(false);
    }
  };

  const dotIndices = Array.from({ length: pinLength }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 text-slate-900 dark:text-slate-100 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          aria-label="Close PIN modal"
        >
          <X className="w-5 h-5" />
        </button>

        {resetMode === 'pin' ? (
          <>
            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {effectiveDesc}
              </p>
              {amount !== undefined && (
                <div className="pt-2">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                    Total Debit
                  </span>
                  <p className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    ₦{amount.toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Dynamic PIN Dots Display */}
            <div className="flex justify-center items-center gap-3.5 my-6">
              {dotIndices.map(idx => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    pin.length > idx
                      ? 'bg-emerald-500 ring-4 ring-emerald-500/20 scale-110'
                      : 'bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="flex-1">{error}</p>
              </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  disabled={loading}
                  onClick={() => handleKeyPress(num)}
                  className="py-3.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 active:bg-emerald-600 active:text-white rounded-xl text-lg font-bold font-mono transition text-slate-900 dark:text-white shadow-sm flex items-center justify-center"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                disabled={loading || pin.length === 0}
                onClick={handleClear}
                className="py-3.5 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleKeyPress('0')}
                className="py-3.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 active:bg-emerald-600 active:text-white rounded-xl text-lg font-bold font-mono transition text-slate-900 dark:text-white shadow-sm flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                disabled={loading || pin.length === 0}
                onClick={handleDelete}
                className="py-3.5 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition"
              >
                Delete
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying authorization...</span>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-mono">
                {pinLength}-Digit PIN Protected
              </span>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setResetMode('reset');
                  setError(null);
                }}
                className="text-blue-700 dark:text-blue-400 hover:underline font-semibold"
              >
                Forgot PIN?
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setResetMode('pin');
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to PIN Keypad</span>
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <KeyRound className="w-4 h-4" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Reset Transaction PIN</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify your account via email OTP to set a fresh {pinLength}-digit PIN.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
            {resetSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{resetSuccess}</span>
              </div>
            )}
            {otpPreview && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 text-xs">
                OTP Code Preview: <span className="font-mono font-bold">{otpPreview}</span>
              </div>
            )}

            {!otpSent ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleRequestOtp}
                className="w-full py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                <span>Send Email OTP</span>
              </button>
            ) : (
              <form onSubmit={handleConfirmReset} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Email OTP Code
                  </label>
                  <input
                    type="text"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.trim())}
                    placeholder="Enter 6-digit OTP"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
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
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Confirm New PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={pinLength}
                    required
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Confirm PIN Reset</span>}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
