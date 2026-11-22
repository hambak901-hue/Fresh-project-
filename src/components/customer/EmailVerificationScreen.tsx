/**
 * @file EmailVerificationScreen.tsx
 * Dedicated Customer Email Verification OTP Entry Screen.
 * Shown after registration or login for unverified accounts unless limited-access exploration is chosen.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { api } from '../../lib/api';
import { ThemeToggle } from '../ThemeToggle';
import {
  Mail,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  LogOut,
  Loader2,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { User } from '../../types';

interface EmailVerificationScreenProps {
  user: User;
  onVerified: (message: string) => void;
  onContinueLimited: () => void;
  onSwitchToPublic: () => void;
  onLogout: () => void;
}

function isCodeExpiredOrLockedError(err: any): boolean {
  const code = String(err?.payload?.code || '');
  const msg = String(err?.message || '');
  return (
    code === 'VERIFICATION_EXPIRED' ||
    code === 'VERIFICATION_ATTEMPTS_EXCEEDED' ||
    code === 'VERIFICATION_ALREADY_USED' ||
    /expired|maximum verification attempts|already been used/i.test(msg)
  );
}

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  user,
  onVerified,
  onContinueLimited,
  onSwitchToPublic,
  onLogout,
}) => {
  const { refreshUser, lastVerificationDispatch, clearVerificationDispatch } = useAuth();
  const { branding } = useCms();

  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [verifiedDone, setVerifiedDone] = useState(false);
  const [resendCooldown, setResendCooldown] = useState<number>(() => {
    if (lastVerificationDispatch?.sent && (lastVerificationDispatch.cooldown_seconds || 0) > 0) {
      return Number(lastVerificationDispatch.cooldown_seconds);
    }
    return 0;
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendCooldown]);

  const brandName = branding?.short_brand_name || 'HAMBAKTECH';
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const logoSrc = branding?.logo_url || '/logo.png';

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setNeedsNewCode(false);

    const code = otpCode.trim();
    if (code.length < 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.verifyEmail({ email: user.email, otp_code: code });
      const msg = res.message || 'Email verified successfully! Full portal access is now active.';
      setVerifiedDone(true);
      setSuccessMsg(msg);
      clearVerificationDispatch();
      await refreshUser();
      window.setTimeout(() => {
        onVerified(msg);
      }, 650);
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
      setNeedsNewCode(isCodeExpiredOrLockedError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setSuccessMsg(null);
    setNeedsNewCode(false);

    try {
      setResendLoading(true);
      const res = await api.resendVerification(user.email);
      setResendCooldown(Number(res.cooldown_seconds || 60));
      setOtpCode('');
      setSuccessMsg(res.message || `A fresh 6-digit verification code and confirmation link have been sent to ${user.email}.`);
    } catch (err: any) {
      const waitSec = Number(err?.payload?.errors?.retry_after_seconds || 0);
      if (waitSec > 0) {
        setResendCooldown(waitSec);
      }
      setError(err?.message || 'We could not send your verification email right now. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const deliveryWarning =
    lastVerificationDispatch && !lastVerificationDispatch.sent && !successMsg && !error;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-mono font-bold tracking-wider uppercase">
            <Mail className="w-3 h-3" />
            Email Verification Required
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/25 mx-auto overflow-hidden p-1.5">
            <img
              src={logoSrc}
              alt={brandName}
              className="w-full h-full object-contain rounded-lg bg-white"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {verifiedDone ? 'Email Verified!' : 'Verify Your Email Address'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Hello <strong className="text-slate-900 dark:text-white">{user.full_name}</strong>, email verification is required for{' '}
            <strong className="font-mono text-slate-900 dark:text-white break-all">{user.email}</strong> before you can fund your wallet, verify identities, purchase VTU bundles, or submit orders.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold">Account Access Notice</div>
            <p className="text-[11px] opacity-90 leading-relaxed">
              Wallet funding, NIN/BVN verification, telecom VTU, printing orders, referrals, and KYC submission stay locked until your email is confirmed. Enter the 6-digit code from your inbox or click the confirmation link in the email.
            </p>
          </div>
        </div>

        {deliveryWarning && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Verification Email Not Delivered Yet</div>
              <p className="text-[11px] leading-relaxed">
                Your account was created, but we could not deliver the initial verification email right now. Please tap <strong>Resend Verification Code</strong> below to try again.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {needsNewCode && (
              <button
                type="button"
                disabled={resendLoading || resendCooldown > 0}
                onClick={handleResend}
                className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                <span>
                  {resendCooldown > 0
                    ? `Request New Code in ${resendCooldown}s`
                    : 'Request New Verification Code'}
                </span>
              </button>
            )}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {!verifiedDone && (
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm font-mono tracking-widest text-blue-700 dark:text-emerald-400 font-bold focus:outline-none focus:border-emerald-600"
                  required
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Codes expire after 60 minutes and are single-use.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.trim().length < 6}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Email...</span>
                </>
              ) : (
                <>
                  <span>Verify Email &amp; Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Didn&apos;t receive the code?</span>
              <button
                type="button"
                disabled={resendLoading || resendCooldown > 0}
                onClick={handleResend}
                className="text-blue-700 dark:text-amber-400 disabled:text-slate-400 flex items-center gap-1 font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                <span>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Verification Code'}
                </span>
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onContinueLimited}
            className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
          >
            Continue to Portal (Limited Access Until Verified)
          </button>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="hover:text-blue-700 dark:hover:text-blue-400 transition"
            >
              &larr; Public Website
            </button>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>{companyName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
