import React, { useState } from 'react';
import { Lock, X, AlertCircle, Loader2, CheckCircle2, KeyRound } from 'lucide-react';
import { api } from '../../lib/api';

interface TransactionPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
  amount?: number;
}

export function TransactionPinModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Verify Transaction PIN',
  description = 'Enter your 4-digit security PIN to authorize this transaction.',
  amount,
}: TransactionPinModalProps) {
  const [pin, setPin] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 4) {
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
        onSuccess();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err: any) {
      setError(err.message || 'PIN verification failed. Please check your 4-digit PIN.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-slate-100 shadow-2xl relative">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">{description}</p>
          {amount !== undefined && (
            <div className="pt-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Debit</span>
              <p className="text-xl font-bold font-mono text-emerald-400">₦{amount.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* PIN Dots Display */}
        <div className="flex justify-center items-center gap-4 my-6">
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                pin.length > idx
                  ? 'bg-emerald-400 ring-4 ring-emerald-500/20 scale-110'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-xs text-red-400">
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
              className="py-3.5 bg-slate-800/80 hover:bg-slate-700/80 active:bg-emerald-600 active:text-white rounded-xl text-lg font-bold font-mono transition text-white shadow-sm flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleClear}
            className="py-3.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleKeyPress('0')}
            className="py-3.5 bg-slate-800/80 hover:bg-slate-700/80 active:bg-emerald-600 active:text-white rounded-xl text-lg font-bold font-mono transition text-white shadow-sm flex items-center justify-center"
          >
            0
          </button>
          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleDelete}
            className="py-3.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition"
          >
            Delete
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying authorization...</span>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500 font-mono">
            Protected &bull; <span className="text-emerald-400 font-semibold">4-Digit Transaction PIN</span>
          </p>
        </div>
      </div>
    </div>
  );
}
