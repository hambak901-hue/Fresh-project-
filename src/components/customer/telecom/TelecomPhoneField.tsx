/**
 * @file TelecomPhoneField.tsx
 * Nigerian phone input component with live format normalization (+234 / 234 / 0...),
 * carrier prefix detection, one-click network switching, and Mobile Number Portability (MNP) support.
 */

import React, { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { analyzeNigerianPhone, CarrierCode } from './types';
import { CheckCircle2, AlertTriangle, RefreshCw, ArrowRightLeft } from 'lucide-react';

interface TelecomPhoneFieldProps {
  label?: string;
  selectedNetwork: CarrierCode;
  value: string;
  ported: boolean;
  onChange: (value: string) => void;
  onPortedChange: (ported: boolean) => void;
  onSelectNetwork: (network: CarrierCode) => void;
  useServerValidation?: boolean;
  placeholder?: string;
  helperText?: string;
}

export const TelecomPhoneField: React.FC<TelecomPhoneFieldProps> = ({
  label = 'Recipient Nigerian Phone Number',
  selectedNetwork,
  value,
  ported,
  onChange,
  onPortedChange,
  onSelectNetwork,
  useServerValidation = false,
  placeholder = '0803 123 4567 or +234 803 123 4567',
  helperText,
}) => {
  const localAnalysis = analyzeNigerianPhone(value);
  const [serverChecking, setServerChecking] = useState(false);
  const [serverNote, setServerNote] = useState<{
    valid: boolean;
    matches_network: boolean;
    detected_network: string | null;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!useServerValidation) {
      setServerNote(null);
      return;
    }
    const digits = value.replace(/\D+/g, '');
    if (digits.length < 10) {
      setServerNote(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setServerChecking(true);
      try {
        const res = await api.validateTelecomPhone(selectedNetwork, value, ported);
        if (!cancelled) {
          setServerNote({
            valid: Boolean(res.valid),
            matches_network: Boolean(res.matches_network),
            detected_network: res.detected_network,
            message: res.message,
          });
        }
      } catch {
        if (!cancelled) setServerNote(null);
      } finally {
        if (!cancelled) setServerChecking(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, selectedNetwork, ported, useServerValidation]);

  const effectiveValid = serverNote ? serverNote.valid : localAnalysis.valid;
  const detected = (serverNote?.detected_network as CarrierCode | null) ?? localAnalysis.detectedNetwork;
  const isMismatch =
    effectiveValid &&
    detected !== null &&
    detected !== selectedNetwork;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label}
        </label>
        {localAnalysis.valid && localAnalysis.normalized !== value.trim() && (
          <button
            type="button"
            onClick={() => onChange(localAnalysis.normalized)}
            className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline font-mono tabular-nums"
          >
            Format as {localAnalysis.normalized}
          </button>
        )}
      </div>

      <input
        type="tel"
        inputMode="tel"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (ported) onPortedChange(false);
        }}
        placeholder={placeholder}
        className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-blue-600 dark:focus:border-emerald-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-emerald-500/20 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition tabular-nums"
        required
      />

      {helperText && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{helperText}</p>
      )}

      {serverChecking && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Validating Nigerian number...</span>
        </div>
      )}

      {value.trim().length > 0 && !localAnalysis.valid && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{localAnalysis.reason}</span>
        </div>
      )}

      {effectiveValid && !isMismatch && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Valid <strong className="font-mono tabular-nums">{localAnalysis.normalized}</strong> ({selectedNetwork}
              {detected ? ` • prefix matches ${detected}` : ''})
            </span>
          </div>
        </div>
      )}

      {isMismatch && (
        <div
          className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
            ported
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {ported ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">
                  {ported
                    ? `Ported line confirmed: routing ${localAnalysis.normalized} as ${selectedNetwork}`
                    : `${localAnalysis.normalized} has an ${detected} prefix, while ${selectedNetwork} is selected.`}
                </p>
                <p className="text-[11px] opacity-85 mt-0.5">
                  {ported
                    ? 'Mobile Number Portability (MNP) mode enabled for this transaction.'
                    : 'If this line was ported (MNP), confirm below. Otherwise switch to the detected network.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {detected && !ported && (
              <button
                type="button"
                onClick={() => {
                  onSelectNetwork(detected);
                  onPortedChange(false);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold inline-flex items-center gap-1.5 text-xs hover:opacity-90 transition"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Switch to {detected}</span>
              </button>
            )}
            <label className="min-h-[38px] px-3 py-1.5 rounded-lg border border-current/25 bg-white/70 dark:bg-slate-900/60 inline-flex items-center gap-2 cursor-pointer select-none font-semibold">
              <input
                type="checkbox"
                checked={ported}
                onChange={(e) => onPortedChange(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
              <span>Number was ported to {selectedNetwork} (MNP)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
