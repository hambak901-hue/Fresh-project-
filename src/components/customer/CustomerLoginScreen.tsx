/**
 * @file CustomerLoginScreen.tsx
 * Dedicated full-page Customer Portal Sign-In & OTP Password Recovery Screen.
 * Shown whenever a customer signs out or an unauthenticated visitor opens #portal / #login.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { api } from '../../lib/api';
import { ThemeToggle } from '../ThemeToggle';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  KeyRound,
  Send,
  RefreshCw,
  UserPlus,
  Shield,
} from 'lucide-react';
import { User } from '../../types';

interface CustomerLoginScreenProps {
  onSuccess: (user?: User | null) => void;
  onOpenRegister: () => void;
  onSwitchToPublic: () => void;
  onSwitchToAdmin: () => void;
  notice?: string | null;
}

export const CustomerLoginScreen: React.FC<CustomerLoginScreenProps> = ({
  onSuccess,
  onOpenRegister,
  onSwitchToPublic,
  onSwitchToAdmin,
  notice,
}) => {
  const { login, refreshUser } = useAuth();
  const { branding } = useCms();

  const [mode, setMode] = useState<'login' | 'forgot' | 'verify_otp' | 'reset_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const brandName = branding?.short_brand_name || 'HAMBAKTECH';
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const logoSrc = branding?.logo_url || '/logo.png';

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim() || !password) {
      setError('Please enter your registered email address and password.');
      return;
    }
    try {
      setLoading(true);
      const loggedUser = await login(email.trim().toLowerCase(), password);
      onSuccess(loggedUser);
    } catch (err: any) {
      setError(err?.message || 'Sign in failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Please enter your registered email address.');
      return;
    }
    try {
      setLoading(true);
      const res = await api.forgotPassword(targetEmail);
      setResetToken(res.token || '');
      setSuccessMsg(res.message || 'A 6-digit recovery code has been sent to your email.');
      setMode('verify_otp');
      setResendCooldown(45);
    } catch (err: any) {
      setError(err?.message || 'Unable to dispatch recovery code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setError('Please enter the verification code sent to your email.');
      return;
    }
    try {
      setLoading(true);
      const res = await api.verifyOtp(email.trim().toLowerCase(), otpCode.trim());
      if (res.token) setResetToken(res.token);
      setSuccessMsg('Code verified. Set your new password below.');
      setMode('reset_password');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (password.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      setLoading(true);
      const res = await api.resetPassword({
        email: email.trim().toLowerCase(),
        otp_code: otpCode.trim(),
        token: resetToken,
        new_password: password,
      });
      await refreshUser();
      onSuccess(res.user);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-mono font-bold tracking-wider uppercase">
            <ShieldCheck className="w-3 h-3" />
            Customer Portal Login
          </span>
          <ThemeToggle compact />
        </div>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-700/25 mx-auto overflow-hidden p-1.5">
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
            {mode === 'login' && `${brandName} Customer Portal`}
            {mode === 'forgot' && 'Password Recovery'}
            {mode === 'verify_otp' && 'Verify Security Code'}
            {mode === 'reset_password' && 'Set New Password'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {mode === 'login' && 'Sign in to access your Naira wallet, identity verification, telecom bundles, and Academy services.'}
            {mode === 'forgot' && 'Enter your registered email address to receive a 6-digit recovery code.'}
            {mode === 'verify_otp' && `Enter the 6-digit code sent to ${email || 'your email'}.`}
            {mode === 'reset_password' && 'Choose a strong password of at least 8 characters.'}
          </p>
        </div>

        {notice && !error && !successMsg && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-800 dark:text-blue-300 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {mode !== 'login' && (
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMsg(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-700/25"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Sign In to Customer Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenRegister}
              className="w-full py-2.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition border border-slate-200 dark:border-slate-700"
            >
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Create New Customer Account</span>
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Registered Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{loading ? 'Sending...' : 'Send Recovery Code'}</span>
            </button>
          </form>
        )}

        {mode === 'verify_otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                6-Digit Security Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.trim())}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm font-mono tracking-widest text-blue-700 dark:text-amber-400 font-bold focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Verify Code</span>}
            </button>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Didn&apos;t receive the code?</span>
              <button
                type="button"
                disabled={loading || resendCooldown > 0}
                onClick={() => handleSendOtp()}
                className="text-blue-700 dark:text-blue-400 disabled:text-slate-400 flex items-center gap-1 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}</span>
              </button>
            </div>
          </form>
        )}

        {mode === 'reset_password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password (min 8 chars)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Reset Password &amp; Sign In</span>}
            </button>
          </form>
        )}

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={onSwitchToPublic}
            className="hover:text-blue-700 dark:hover:text-blue-400 transition"
          >
            &larr; Public Website
          </button>
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="inline-flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 transition"
          >
            <Shield className="w-3 h-3" />
            <span>Admin Console &rarr;</span>
          </button>
        </div>

        <p className="text-[10px] text-center text-slate-400">
          {companyName} &bull; Encrypted Portal Session
        </p>
      </div>
    </div>
  );
};
