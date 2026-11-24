/**
 * @file AuthModal.tsx
 * Customer Registration, Login, and Password Recovery modal for HAMBAK TECH & SERVICES.
 * Full validation, 6-digit OTP password reset, and dual Light/Night theme.
 */

import React, { useState, useEffect } from 'react';
import { useAuth, MfaChallengeRequiredError } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { api } from '../../lib/api';
import { MfaChallengeResponse, ReferralPublicProgram } from '../../types';
import {
  X,
  Lock,
  Mail,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  Send,
  Gift,
  LogOut,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'forgot';
  onSuccess?: (user?: any, options?: { limitedAccess?: boolean; verifiedMessage?: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccess,
}) => {
  const { login, completeMfaLogin, register, refreshUser, logout, lastVerificationDispatch, clearVerificationDispatch } = useAuth();
  const { branding } = useCms();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'verify_otp' | 'reset_password' | 'mfa_challenge' | 'verify_email'>(initialMode);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [campaignCode, setCampaignCode] = useState('');
  const [referralCheck, setReferralCheck] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid'; message?: string }>({ status: 'idle' });
  const [publicProgram, setPublicProgram] = useState<ReferralPublicProgram | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [otpCode, setOtpCode] = useState('');
  const [emailVerifyCode, setEmailVerifyCode] = useState('');
  const [pendingVerifyUser, setPendingVerifyUser] = useState<any>(null);
  const [verifyNeedsResend, setVerifyNeedsResend] = useState<boolean>(false);
  const [resetToken, setResetToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [mfaChallenge, setMfaChallenge] = useState<MfaChallengeResponse | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
      setVerifyNeedsResend(false);
      setPendingVerifyUser(null);
      setEmailVerifyCode('');
      setMfaChallenge(null);
      setMfaCode('');
      try {
        const params = new URLSearchParams(window.location.search);
        const urlRef = (params.get('ref') || params.get('referral') || '').trim().toUpperCase();
        const urlCampaign = (params.get('campaign') || '').trim().toUpperCase();
        const storedRef = (sessionStorage.getItem('hambak_referral_code') || '').trim().toUpperCase();
        const storedCampaign = (sessionStorage.getItem('hambak_referral_campaign') || '').trim().toUpperCase();
        const resolvedRef = storedRef || urlRef;
        const resolvedCampaign = storedCampaign || urlCampaign;
        if (resolvedRef && !referralCode) {
          setReferralCode(resolvedRef);
          sessionStorage.setItem('hambak_referral_code', resolvedRef);
        }
        if (resolvedCampaign && !campaignCode) {
          setCampaignCode(resolvedCampaign);
          sessionStorage.setItem('hambak_referral_campaign', resolvedCampaign);
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (mode !== 'verify_email' || !lastVerificationDispatch) return;
    if (lastVerificationDispatch.sent) {
      setResendCooldown(lastVerificationDispatch.cooldown_seconds || 60);
      setVerifyNeedsResend(false);
      setError(null);
      setSuccessMsg(
        lastVerificationDispatch.message ||
          `Account created! Enter the 6-digit code or click the confirmation link sent to ${pendingVerifyUser?.email || email.trim().toLowerCase()}.`
      );
    } else {
      setResendCooldown(0);
      setVerifyNeedsResend(true);
      setSuccessMsg(null);
      setError(
        lastVerificationDispatch.message ||
          'Your account was created, but we could not send the verification email right now. Please tap Resend Email below to try again.'
      );
    }
  }, [mode, lastVerificationDispatch]);

  useEffect(() => {
    if (!isOpen || mode !== 'register') return;
    let active = true;
    api.getReferralPublicConfig()
      .then((res) => {
        if (active && res.success && res.program) {
          setPublicProgram(res.program);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen || mode !== 'register') return;
    const clean = referralCode.trim().toUpperCase();
    if (!clean) {
      setReferralCheck({ status: 'idle' });
      return;
    }
    if (clean.length < 4) {
      setReferralCheck({ status: 'invalid', message: 'Referral code appears too short.' });
      return;
    }
    setReferralCheck({ status: 'checking' });
    const t = window.setTimeout(() => {
      api.validateReferralCode(clean)
        .then((res) => {
          if (res.valid) {
            setReferralCheck({
              status: 'valid',
              message: res.referrer_name_masked ? `Referred by ${res.referrer_name_masked}` : 'Valid referral code',
            });
          } else {
            setReferralCheck({ status: 'invalid', message: res.message || 'Referral code not found.' });
          }
        })
        .catch(() => {
          setReferralCheck({ status: 'idle' });
        });
    }, 350);
    return () => window.clearTimeout(t);
  }, [isOpen, mode, referralCode]);

  if (!isOpen) return null;

  const brandLabel = branding?.company_name || 'HAMBAK TECH & SERVICES';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Please provide both email address and password.');
      return;
    }
    try {
      setLoading(true);
      const loggedUser = await login(email.trim().toLowerCase(), password);
      if (loggedUser?.email_verification_required && !loggedUser?.email_verified) {
        setPendingVerifyUser(loggedUser);
        setEmailVerifyCode('');
        setVerifyNeedsResend(false);
        setResendCooldown(0);
        setMode('verify_email');
        setSuccessMsg(`Signed in! Enter the 6-digit verification code sent to ${loggedUser.email || email} to unlock wallet funding and services.`);
        return;
      }
      setSuccessMsg('Signed in successfully!');
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess(loggedUser);
      }, 350);
    } catch (err: any) {
      if (err instanceof MfaChallengeRequiredError) {
        setMfaChallenge(err.challenge);
        setMfaCode('');
        setMode('mfa_challenge');
        setSuccessMsg(
          err.challenge.method === 'totp'
            ? 'Enter the 6-digit code from your authenticator app (or a recovery code).'
            : `We sent a 6-digit verification code to ${err.challenge.masked_email}.`
        );
      } else if (err?.payload?.code === 'EMAIL_VERIFICATION_REQUIRED' || err?.payload?.errors?.email_verification_required) {
        setPendingVerifyUser(null);
        setEmailVerifyCode('');
        setVerifyNeedsResend(false);
        setResendCooldown(0);
        setMode('verify_email');
        setError(null);
        setSuccessMsg(err.message || 'Please enter the 6-digit verification code sent to your email.');
      } else {
        setError(err.message || 'Sign in failed. Please check your credentials or reset your password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mfaChallenge || !mfaCode.trim()) {
      setError('Please enter your verification code.');
      return;
    }
    try {
      setLoading(true);
      const loggedUser = await completeMfaLogin(mfaChallenge.challenge_token, mfaCode.trim());
      setSuccessMsg('Security check verified! Signing in...');
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess(loggedUser);
      }, 300);
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired MFA verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('Please enter a valid Nigerian phone number (e.g. 08031234567).');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setError('You must accept the Terms of Service and Privacy Policy.');
      return;
    }

    try {
      setLoading(true);
      const registeredUser = await register({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phone.trim(),
        password,
        referral_code: referralCode.trim().toUpperCase() || undefined,
        campaign_code: campaignCode.trim().toUpperCase() || undefined,
        agree_terms: true,
      });
      try {
        sessionStorage.removeItem('hambak_referral_code');
        sessionStorage.removeItem('hambak_referral_campaign');
      } catch {
        // Ignore sessionStorage errors
      }
      if (registeredUser?.email_verification_required && !registeredUser?.email_verified) {
        setPendingVerifyUser(registeredUser);
        setEmailVerifyCode('');
        setMode('verify_email');
        return;
      }
      setSuccessMsg(`Account created at KYC Level 1! Welcome to ${brandLabel}.`);
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess(registeredUser);
      }, 450);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Email may already be registered.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifyNeedsResend(false);
    const code = emailVerifyCode.trim();
    if (!code || code.length < 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    try {
      setLoading(true);
      const res = await api.verifyEmail({
        email: (pendingVerifyUser?.email || email).trim().toLowerCase(),
        otp_code: code,
      });
      clearVerificationDispatch();
      await refreshUser();
      setSuccessMsg(res.message || 'Email verified successfully! Opening your portal...');
      setTimeout(() => {
        onClose();
        if (onSuccess) {
          onSuccess(res.user || pendingVerifyUser, {
            verifiedMessage: res.message || 'Email verified successfully! Full portal access is now active.',
          });
        }
      }, 500);
    } catch (err: any) {
      const codeStr = String(err?.payload?.code || '');
      const msg = err.message || 'Invalid or expired verification code.';
      setError(msg);
      if (
        codeStr === 'VERIFICATION_EXPIRED' ||
        codeStr === 'VERIFICATION_ATTEMPTS_EXCEEDED' ||
        codeStr === 'VERIFICATION_ALREADY_USED' ||
        /expired|maximum verification attempts|already been used/i.test(msg)
      ) {
        setVerifyNeedsResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmailVerification = async () => {
    setError(null);
    setSuccessMsg(null);
    setVerifyNeedsResend(false);
    const targetEmail = (pendingVerifyUser?.email || email).trim().toLowerCase();
    if (!targetEmail) {
      setError('Email address is required to resend verification.');
      return;
    }
    try {
      setLoading(true);
      const res = await api.resendVerification(targetEmail);
      setResendCooldown(res.cooldown_seconds || 60);
      setEmailVerifyCode('');
      setSuccessMsg(res.message || `Verification code sent to ${targetEmail}.`);
    } catch (err: any) {
      const waitSec = Number(err?.payload?.errors?.retry_after_seconds || 0);
      if (waitSec > 0) setResendCooldown(waitSec);
      setError(err.message || 'Unable to resend verification email right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Please enter a valid email address to receive your verification code.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.forgotPassword(targetEmail);
      setResetToken(res.token || '');
      setSuccessMsg(res.message || 'A 6-digit verification code has been dispatched to your email.');
      setMode('verify_otp');
      setResendCooldown(45);
    } catch (err: any) {
      setError(err.message || 'Unable to send verification code. Please check your email.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = otpCode.trim();
    if (!code || code.length < 4) {
      setError('Please enter the verification code sent to your email.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.verifyOtp(email.trim().toLowerCase(), code);
      if (res.token) {
        setResetToken(res.token);
      }
      setSuccessMsg('Code verified successfully! Now choose your new password.');
      setMode('reset_password');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('New passwords do not match.');
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

      setSuccessMsg('Password updated successfully! Signing you in...');
      await refreshUser();
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess(res.user);
      }, 650);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Request a new code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <div className={`relative w-full ${mode === 'register' ? 'max-w-lg' : 'max-w-md'} rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1 pr-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
            <span>{brandLabel}</span>
            <span className="text-slate-400">&bull;</span>
            <span className="text-slate-500 dark:text-slate-400">
              {mode === 'login' && 'Account Sign In'}
              {mode === 'register' && 'Create Account'}
              {mode === 'forgot' && 'Password Recovery'}
              {mode === 'verify_otp' && 'Code Verification'}
              {mode === 'reset_password' && 'Set New Password'}
              {mode === 'mfa_challenge' && 'Two-Factor Verification'}
              {mode === 'verify_email' && 'Email Verification'}
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'register' && 'Create Customer Account'}
            {mode === 'forgot' && 'Reset Your Password'}
            {mode === 'verify_otp' && 'Enter Verification Code'}
            {mode === 'reset_password' && 'Create New Password'}
            {mode === 'mfa_challenge' && 'Security Verification'}
            {mode === 'verify_email' && 'Verify Your Email Address'}
          </h2>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            {mode === 'login' && 'Access your Naira wallet, identity verification, telecom bundles, and Academy dashboard.'}
            {mode === 'register' && 'Quickly create your KYC Level 1 starter account. No identity documents required to get started.'}
            {mode === 'forgot' && 'Enter your registered email to receive a 6-digit password recovery code.'}
            {mode === 'verify_otp' && `Enter the 6-digit OTP dispatched to ${email || 'your email'}.`}
            {mode === 'reset_password' && 'Choose a strong password of at least 8 characters.'}
            {mode === 'verify_email' && `Confirm ${pendingVerifyUser?.email || email || 'your email'} to unlock wallet funding, NIN/BVN verification, and telecom purchases.`}
            {mode === 'mfa_challenge' && (
              mfaChallenge?.method === 'totp'
                ? 'Open your authenticator app and enter the 6-digit code or a backup recovery code.'
                : `Enter the 6-digit code sent to ${mfaChallenge?.masked_email || email}.`
            )}
          </p>
        </div>

        {(mode === 'login' || mode === 'register') && (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition-colors ${
                mode === 'login'
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition-colors ${
                mode === 'register'
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {(mode === 'forgot' || mode === 'verify_otp' || mode === 'reset_password' || mode === 'mfa_challenge') && (
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMsg(null);
              setMfaChallenge(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
            {mode === 'verify_email' && verifyNeedsResend && (
              <button
                type="button"
                disabled={loading || resendCooldown > 0}
                onClick={handleResendEmailVerification}
                className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-[11px] text-blue-700 dark:text-amber-400 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Signing In...</span>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Legal Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Legal Name"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@email.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08012345678"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400"
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-slate-950 border border-blue-200 dark:border-slate-800 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                <strong className="text-blue-800 dark:text-blue-300">Starts at KYC Level 1 (Basic Profile):</strong> No NIN, BVN, or ID upload is needed right now. You can upgrade to Level 2 anytime in your portal to unlock higher limits &amp; virtual accounts.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Referral Code <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="e.g. HBK-ABC123"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white uppercase font-mono"
              />
              {referralCheck.status === 'checking' && (
                <p className="text-[11px] text-slate-500 mt-1">Verifying referral code...</p>
              )}
              {referralCheck.status === 'valid' && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{referralCheck.message}</span>
                </p>
              )}
              {referralCheck.status === 'invalid' && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  {referralCheck.message}
                </p>
              )}
              {publicProgram?.enabled && (
                <div className="mt-2 p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <Gift className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <span className="font-semibold">{publicProgram.program_name}:</span> {publicProgram.terms_summary || 'Invite friends after signup to earn rewards and loyalty points on qualifying transactions.'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="termsCheck"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-700"
              />
              <label htmlFor="termsCheck" className="text-[11px] text-slate-600 dark:text-slate-400">
                I agree to the {brandLabel} Terms of Service &amp; Privacy Policy.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Creating Account...</span>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Registered Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                We will send a 6-digit recovery code valid for 15 minutes.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Sending Code...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Verification Code</span>
                </>
              )}
            </button>
          </form>
        )}

        {mode === 'verify_otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  6-Digit Security Code
                </label>
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-[11px] text-blue-700 dark:text-amber-400 hover:underline"
                >
                  Change Email
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={10}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.trim())}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono tracking-widest text-blue-700 dark:text-amber-400 font-bold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <span>Validating Code...</span> : <span>Verify Code &amp; Continue</span>}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Didn&apos;t receive the code?</span>
              <button
                type="button"
                disabled={loading || resendCooldown > 0}
                onClick={() => handleSendOtp()}
                className="text-blue-700 dark:text-amber-400 disabled:text-slate-400 flex items-center gap-1 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </button>
            </div>
          </form>
        )}

        {mode === 'reset_password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-slate-400"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <span>Updating Password...</span> : <span>Reset Password &amp; Sign In</span>}
            </button>
          </form>
        )}

        {mode === 'mfa_challenge' && mfaChallenge && (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {mfaChallenge.method === 'totp' ? 'Authenticator or Recovery Code' : '6-Digit Email Security Code'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={20}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.trim())}
                  placeholder={mfaChallenge.method === 'totp' ? '123456 or ABCD-EFGH' : '123456'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono tracking-widest text-blue-700 dark:text-amber-400 font-bold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !mfaCode.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <span>Verifying...</span> : <span>Verify &amp; Sign In</span>}
            </button>
          </form>
        )}

        {mode === 'verify_email' && (
          <form onSubmit={handleVerifyEmailCode} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                6-Digit Email Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={emailVerifyCode}
                  onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono tracking-widest text-blue-700 dark:text-emerald-400 font-bold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Code expires in 60 minutes. You can also click the confirmation link inside the email.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || emailVerifyCode.trim().length < 6}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? <span>Verifying Email...</span> : <span>Verify Email &amp; Unlock Portal</span>}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Didn&apos;t receive the email?</span>
              <button
                type="button"
                disabled={loading || resendCooldown > 0}
                onClick={handleResendEmailVerification}
                className="text-blue-700 dark:text-amber-400 disabled:text-slate-400 flex items-center gap-1 font-semibold"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}</span>
              </button>
            </div>

            {pendingVerifyUser && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onSuccess) onSuccess(pendingVerifyUser, { limitedAccess: true });
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
                >
                  Continue to Portal (Limited Access Until Verified)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setPendingVerifyUser(null);
                    setEmailVerifyCode('');
                    setError(null);
                    setSuccessMsg(null);
                    setVerifyNeedsResend(false);
                    setMode('login');
                  }}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out / Switch Account</span>
                </button>
              </div>
            )}
          </form>
        )}

        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800/60">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-700 dark:text-emerald-400" />
          <span>{brandLabel} &bull; Encrypted Authentication</span>
        </div>
      </div>
    </div>
  );
};
