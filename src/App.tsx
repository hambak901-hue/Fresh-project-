/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CmsProvider } from './context/CmsContext';
import { ThemeProvider } from './context/ThemeContext';
import { PwaInstallProvider } from './components/pwa/InstallPromptSystem';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { PublicNavbar } from './components/public/PublicNavbar';
import { LandingPage } from './components/public/LandingPage';
import { AboutPage } from './components/public/AboutPage';
import { ServicesPage } from './components/public/ServicesPage';
import { RatesCalculator } from './components/public/RatesCalculator';
import { AnnouncementsPage } from './components/public/AnnouncementsPage';
import { FaqPage } from './components/public/FaqPage';
import { ContactPage } from './components/public/ContactPage';
import { TermsPage } from './components/public/TermsPage';
import { PrivacyPage } from './components/public/PrivacyPage';
import { HowItWorksPage } from './components/public/HowItWorksPage';
import { AcademyPage } from './components/public/AcademyPage';
import { RefundPolicyPage } from './components/public/RefundPolicyPage';
import { StudentVerifyPage } from './components/public/StudentVerifyPage';
import { Footer } from './components/public/Footer';
import { AuthModal } from './components/public/AuthModal';
import { CmsStudioModal } from './components/cms/CmsStudioModal';
import { WalletModal } from './components/WalletModal';
import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { CustomerLoginScreen } from './components/customer/CustomerLoginScreen';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { NinServicesPage } from './components/customer/NinServicesPage';
import { MandatoryPinSetupModal } from './components/customer/MandatoryPinSetupModal';
import { api } from './lib/api';
import {
  DASHBOARD_CATALOG_FALLBACK,
  getDashboardLabel,
  getRoleLabel,
  isConsoleDashboard,
  isConsoleRole,
  shouldRouteToConsole,
} from './lib/roles';
import { DashboardKey, RoleDashboardConfig, UserRole } from './types';
import { Calculator, ShieldCheck, Shield, Fingerprint, Loader2, Eye, X, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

function normalizePublicPageKey(raw: string): string {
  const clean = raw.replace(/^#/, '').trim();
  const lower = clean.toLowerCase();
  if (lower === 'how-it-works' || lower === 'howitworks') return 'howItWorks';
  if (lower === 'refund-policy' || lower === 'refundpolicy') return 'refundPolicy';
  if (lower === 'academy') return 'academy';
  if (lower === 'services') return 'services';
  if (lower === 'about') return 'about';
  if (lower === 'rates') return 'rates';
  if (lower === 'announcements') return 'announcements';
  if (lower === 'faq') return 'faq';
  if (lower === 'contact') return 'contact';
  if (lower === 'terms') return 'terms';
  if (lower === 'privacy') return 'privacy';
  if (lower.startsWith('verify-student')) return 'verify-student';
  return 'home';
}

function parseVerifyStudentIdFromHash(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location.hash || '';
  const match = h.match(/^#verify-student\/(.+)$/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return '';
}

function isExplicitPublicHash(): boolean {
  if (typeof window === 'undefined') return false;
  const h = (window.location.hash || '').toLowerCase();
  return (
    h.startsWith('#verify-student') ||
    h.startsWith('#academy') ||
    h.startsWith('#how-it-works') ||
    h.startsWith('#refund-policy') ||
    h.startsWith('#services') ||
    h.startsWith('#about') ||
    h.startsWith('#rates') ||
    h.startsWith('#contact') ||
    h.startsWith('#faq') ||
    h.startsWith('#announcements') ||
    h.startsWith('#terms') ||
    h.startsWith('#privacy') ||
    h === '#home' ||
    h === '#public'
  );
}

function MainAppContent() {
  const { user, loading: authLoading, logout, pinPolicy, refreshUser } = useAuth();
  const [forcePinSetupOpen, setForcePinSetupOpen] = useState<boolean>(false);
  const [paymentReturnState, setPaymentReturnState] = useState<{
    status: 'verifying' | 'success' | 'pending' | 'error';
    message: string;
    reference?: string;
    gateway?: string;
    transactionId?: string;
  } | null>(null);
  const [emailVerifyState, setEmailVerifyState] = useState<{
    status: 'verifying' | 'success' | 'error';
    message: string;
  } | null>(null);
  const processedPaymentKeyRef = useRef<string>('');
  const processedEmailVerifyRef = useRef<string>('');
  const [previewSession, setPreviewSession] = useState<{
    targetRole: UserRole;
    targetDashboard: DashboardKey;
    mode: 'published' | 'draft';
    config: RoleDashboardConfig;
    academy_preview?: any;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // URL path / hash detection for direct deep-linking
  const getInitialPhase = (): string => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      const h = window.location.hash.toLowerCase();
      const s = window.location.search.toLowerCase();
      if (h.startsWith('#verify-student') || h.startsWith('#academy') || h.startsWith('#how-it-works') || h.startsWith('#refund-policy')) {
        return '02';
      }
      if (p.includes('/admin') || h.includes('admin')) return '04';
      if (p.includes('/login') || h === '#login') return '06';
      if (p.includes('/identity') || h.includes('identity')) return '05';
      if (
        p.includes('/portal') ||
        p.includes('/customer') ||
        p.includes('/dashboard') ||
        h.includes('portal') ||
        h.includes('customer') ||
        h.startsWith('#printing') ||
        s.includes('payment=verify') ||
        s.includes('trxref=') ||
        s.includes('tx_ref=')
      ) {
        return '03';
      }
    }
    return '02';
  };

  const getInitialPublicPage = (): string => {
    if (typeof window !== 'undefined') {
      return normalizePublicPageKey(window.location.hash || '');
    }
    return 'home';
  };

  const [activePhase, setActivePhase] = useState<string>(getInitialPhase);
  const [activePublicPage, setActivePublicPage] = useState<string>(getInitialPublicPage);
  const [verifyStudentId, setVerifyStudentId] = useState<string>(parseVerifyStudentIdFromHash);
  const manualPublicBrowseRef = useRef<boolean>(isExplicitPublicHash());
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
    if (!user) {
      setPreviewSession(null);
    }
  }, [user]);

  // Auto-route authenticated users and strictly enforce Portal vs Console boundaries
  // across normal login, MFA login, refresh, direct URL navigation, and PWA reopening.
  useEffect(() => {
    if (authLoading || !user) return;
    const targetIsConsole = shouldRouteToConsole(user);
    const isPortalPreview = Boolean(
      previewSession &&
      isConsoleRole(user.role) &&
      !isConsoleDashboard(previewSession.targetDashboard)
    );

    if (activePhase === '06') {
      manualPublicBrowseRef.current = false;
      setActivePhase(targetIsConsole ? '04' : '03');
      return;
    }

    if (targetIsConsole) {
      if (activePhase === '03' && !isPortalPreview) {
        setActivePhase('04');
        return;
      }
      if (activePhase === '02' && !manualPublicBrowseRef.current && !isExplicitPublicHash()) {
        setActivePhase('04');
      }
    } else {
      if (activePhase === '04') {
        setActivePhase('03');
        return;
      }
      if (activePhase === '02' && !manualPublicBrowseRef.current && !isExplicitPublicHash()) {
        setActivePhase('03');
      }
    }
  }, [authLoading, user, activePhase, previewSession]);

  // Listen dynamically to window hash changes and history popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const h = (window.location.hash || '').toLowerCase();
      const p = (window.location.pathname || '').toLowerCase();
      const s = (window.location.search || '').toLowerCase();
      const currentUser = userRef.current;

      if (h.startsWith('#verify-student')) {
        manualPublicBrowseRef.current = true;
        setVerifyStudentId(parseVerifyStudentIdFromHash());
        setActivePublicPage('verify-student');
        setActivePhase('02');
        return;
      }

      if (
        h.startsWith('#academy') ||
        h.startsWith('#how-it-works') ||
        h.startsWith('#refund-policy') ||
        h.startsWith('#services') ||
        h.startsWith('#about') ||
        h.startsWith('#rates') ||
        h.startsWith('#contact') ||
        h.startsWith('#faq') ||
        h.startsWith('#announcements') ||
        h.startsWith('#terms') ||
        h.startsWith('#privacy')
      ) {
        manualPublicBrowseRef.current = true;
        setActivePublicPage(normalizePublicPageKey(h));
        setActivePhase('02');
        return;
      }

      if (h.includes('admin') || p.includes('/admin') || s.includes('admin')) {
        manualPublicBrowseRef.current = false;
        if (currentUser && !shouldRouteToConsole(currentUser)) {
          setActivePhase('03');
        } else {
          setActivePhase('04');
        }
      } else if (h === '#login' || p.includes('/login')) {
        manualPublicBrowseRef.current = false;
        if (currentUser) {
          setActivePhase(shouldRouteToConsole(currentUser) ? '04' : '03');
        } else {
          setActivePhase('06');
        }
      } else if (h.includes('identity') || p.includes('/identity')) {
        manualPublicBrowseRef.current = false;
        setActivePhase('05');
      } else if (
        h.includes('portal') ||
        h.includes('customer') ||
        h.startsWith('#printing') ||
        s.includes('printing_order') ||
        s.includes('payment=verify') ||
        s.includes('trxref=') ||
        s.includes('tx_ref=') ||
        p.includes('/portal') ||
        p.includes('/customer') ||
        p.includes('/dashboard') ||
        s.includes('portal')
      ) {
        manualPublicBrowseRef.current = false;
        if (currentUser && shouldRouteToConsole(currentUser)) {
          setActivePhase('04');
        } else {
          setActivePhase('03');
        }
      } else if (h === '#home' || h === '#public') {
        manualPublicBrowseRef.current = true;
        setActivePublicPage('home');
        setActivePhase('02');
      }
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    handleUrlChange();

    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  // Keep URL hash in sync cleanly when switching phases
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (activePhase === '04') {
        if (!window.location.hash.includes('admin') && !window.location.hash.includes('printing') && !window.location.pathname.includes('/admin')) {
          window.history.replaceState(null, '', '#admin');
        }
      } else if (activePhase === '03') {
        if (!window.location.hash.includes('portal') && !window.location.hash.includes('printing') && !window.location.pathname.includes('/portal')) {
          window.history.replaceState(null, '', '#portal');
        }
      } else if (activePhase === '06') {
        if (window.location.hash !== '#login') {
          window.history.replaceState(null, '', '#login');
        }
      } else if (activePhase === '02') {
        if (window.location.hash === '#admin' || window.location.hash === '#portal' || window.location.hash === '#login') {
          window.history.replaceState(null, '', window.location.pathname || '/');
        }
      }
    }
  }, [activePhase]);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [cmsStudioOpen, setCmsStudioOpen] = useState<boolean>(false);
  const [walletModalOpen, setWalletModalOpen] = useState<boolean>(false);

  // Capture referral & campaign deep-link params (?ref=CODE&campaign=CAMP) and auto-open registration when unauthenticated
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search || '');
      const hashParts = (window.location.hash || '').split('?');
      const hashParams = new URLSearchParams(hashParts[1] || '');
      const refCode = (urlParams.get('ref') || hashParams.get('ref') || '').trim().toUpperCase();
      const campaignCode = (urlParams.get('campaign') || hashParams.get('campaign') || '').trim().toUpperCase();
      if (refCode) {
        sessionStorage.setItem('hambak_referral_code', refCode);
      }
      if (campaignCode) {
        sessionStorage.setItem('hambak_referral_campaign', campaignCode);
      }
      if (refCode && !authLoading && !user) {
        setAuthMode('register');
        setAuthModalOpen(true);
      }
    } catch {
      // Ignore malformed query strings
    }
  }, [authLoading, user]);

  // Verify Paystack wallet funding callback automatically on return (Browser, PWA & Android APK)
  const runReturnedPaymentVerification = async (reference: string, gateway?: string, transactionId?: string) => {
    setPaymentReturnState({
      status: 'verifying',
      message: `Verifying payment reference ${reference}...`,
      reference,
      gateway,
      transactionId,
    });
    try {
      const res = await api.verifyFunding(reference, gateway, transactionId);
      if (res.success && !res.pending) {
        await refreshUser();
        setPaymentReturnState({
          status: 'success',
          message: res.message || `Wallet credited successfully (Ref: ${reference}).`,
          reference,
        });
      } else {
        setPaymentReturnState({
          status: 'pending',
          message: res.message || 'Payment is still awaiting gateway confirmation. Tap Check Again shortly.',
          reference,
          gateway,
          transactionId,
        });
      }
    } catch (err: any) {
      setPaymentReturnState({
        status: 'error',
        message: err?.message || 'Unable to verify returned payment automatically.',
        reference,
        gateway,
        transactionId,
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || authLoading || !user) return;
    try {
      const urlParams = new URLSearchParams(window.location.search || '');
      const h = window.location.hash || '';
      const qIdx = h.indexOf('?');
      const hashParams = qIdx !== -1 ? new URLSearchParams(h.slice(qIdx + 1)) : new URLSearchParams('');

      const isPrinting = Boolean(
        urlParams.get('printing_order') ||
        hashParams.get('printing_order') ||
        h.toLowerCase().startsWith('#printing')
      );
      if (isPrinting) return;

      const isPaymentCallback =
        urlParams.get('payment') === 'verify' ||
        hashParams.get('payment') === 'verify' ||
        Boolean(urlParams.get('trxref') || urlParams.get('tx_ref') || urlParams.get('transaction_id')) ||
        (Boolean(urlParams.get('reference')) && Boolean(urlParams.get('gateway')));

      if (!isPaymentCallback) return;

      const reference = (
        urlParams.get('reference') ||
        urlParams.get('trxref') ||
        urlParams.get('tx_ref') ||
        hashParams.get('reference') ||
        hashParams.get('trxref') ||
        hashParams.get('tx_ref') ||
        ''
      ).trim();
      const gateway = (urlParams.get('gateway') || hashParams.get('gateway') || '').trim() || undefined;
      const transactionId = (urlParams.get('transaction_id') || hashParams.get('transaction_id') || '').trim() || undefined;
      const statusParam = (urlParams.get('status') || hashParams.get('status') || '').toLowerCase();

      const dedupeKey = `${reference}:${transactionId || ''}:${statusParam}`;
      if (!reference && !transactionId) return;
      if (processedPaymentKeyRef.current === dedupeKey) return;
      processedPaymentKeyRef.current = dedupeKey;

      const cleanHash = shouldRouteToConsole(user) ? '#admin' : '#portal';
      window.history.replaceState(null, '', `/${cleanHash}`);

      if (statusParam === 'cancelled' || statusParam === 'canceled') {
        setPaymentReturnState({
          status: 'error',
          message: `Checkout was cancelled (Ref: ${reference}). No funds were charged.`,
          reference,
        });
        return;
      }

      void runReturnedPaymentVerification(reference, gateway, transactionId);
    } catch {
      // Ignore malformed return params
    }
  }, [authLoading, user]);

  // Handle email verification links (?verify_email=1&token=...&email=... or /verify-email?token=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const pathLower = (window.location.pathname || '').toLowerCase();
      const urlParams = new URLSearchParams(window.location.search || '');
      const h = window.location.hash || '';
      const qIdx = h.indexOf('?');
      const hashParams = qIdx !== -1 ? new URLSearchParams(h.slice(qIdx + 1)) : new URLSearchParams('');

      const verifyFlag = urlParams.get('verify_email') || hashParams.get('verify_email');
      const token = (urlParams.get('token') || hashParams.get('token') || '').trim();
      const otpCode = (urlParams.get('code') || hashParams.get('code') || '').trim();
      const emailParam = (urlParams.get('email') || hashParams.get('email') || '').trim();

      const isVerifyEmailLink =
        Boolean((verifyFlag || pathLower.includes('/verify-email')) && (token || (otpCode && emailParam)));

      if (!isVerifyEmailLink) return;
      const dedupeKey = `${token}:${otpCode}:${emailParam}`;
      if (processedEmailVerifyRef.current === dedupeKey) return;
      processedEmailVerifyRef.current = dedupeKey;

      window.history.replaceState(null, '', userRef.current ? '/#portal' : '/');
      setEmailVerifyState({ status: 'verifying', message: 'Confirming your email address...' });

      api.verifyEmail({
        token: token || undefined,
        otp_code: otpCode || undefined,
        email: emailParam || undefined,
      })
        .then(async (res) => {
          await refreshUser();
          setEmailVerifyState({
            status: 'success',
            message: res.message || 'Email verified successfully! Full portal access is now active.',
          });
        })
        .catch((err: any) => {
          setEmailVerifyState({
            status: 'error',
            message: err?.message || 'Verification link is invalid or expired. Request a new code in your portal.',
          });
        });
    } catch {
      // Ignore malformed verification query params
    }
  }, []);

  // Listen for server-enforced 403 PIN_SETUP_REQUIRED events from api.ts
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPinSetupRequired = () => {
      setForcePinSetupOpen(true);
    };
    window.addEventListener('hambak:pin-setup-required', onPinSetupRequired);
    return () => {
      window.removeEventListener('hambak:pin-setup-required', onPinSetupRequired);
    };
  }, []);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleNavigate = (page: string) => {
    if (page === 'register') {
      handleOpenAuth('register');
      return;
    }
    if (page === 'login') {
      handleOpenAuth('login');
      return;
    }

    manualPublicBrowseRef.current = true;

    if (page.startsWith('verify-student')) {
      const parts = page.split('/');
      const sid = parts[1] ? decodeURIComponent(parts[1]) : '';
      setVerifyStudentId(sid);
      setActivePublicPage('verify-student');
      setActivePhase('02');
      window.location.hash = sid ? `#verify-student/${encodeURIComponent(sid)}` : '#verify-student';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const normalized = normalizePublicPageKey(page);
    setActivePublicPage(normalized);
    setActivePhase('02');

    if (normalized === 'academy') {
      window.history.replaceState(null, '', '#academy');
    } else if (normalized === 'howItWorks') {
      window.history.replaceState(null, '', '#how-it-works');
    } else if (normalized === 'refundPolicy') {
      window.history.replaceState(null, '', '#refund-policy');
    } else if (normalized === 'home') {
      window.history.replaceState(null, '', window.location.pathname || '/');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const switchToPublicHome = () => {
    manualPublicBrowseRef.current = true;
    setActivePublicPage('home');
    setActivePhase('02');
    window.history.replaceState(null, '', window.location.pathname || '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLaunchPreview = async (
    dashboardOrRole: string,
    mode: 'published' | 'draft' = 'published'
  ) => {
    if (!user || !isConsoleRole(user.role)) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res: any = await api.previewAdminDashboard(dashboardOrRole, mode);
      const preview = res?.preview || (res?.target_dashboard && res?.config ? res : null);
      if (res?.success && preview) {
        setPreviewSession({
          targetRole: preview.target_role,
          targetDashboard: preview.target_dashboard,
          mode: preview.mode || mode,
          config: preview.config,
          academy_preview: preview.academy_preview,
        });
        manualPublicBrowseRef.current = false;
        setActivePhase(isConsoleDashboard(preview.target_dashboard) ? '04' : '03');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'Unable to launch dashboard preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExitPreview = () => {
    setPreviewSession(null);
    setPreviewError(null);
    manualPublicBrowseRef.current = false;
    setActivePhase('04');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCustomerLogout = () => {
    setPreviewSession(null);
    setForcePinSetupOpen(false);
    setWalletModalOpen(false);
    void logout();
    manualPublicBrowseRef.current = false;
    setActivePhase('06');
    window.history.replaceState(null, '', '#login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderSessionLoader = () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 gap-3">
      <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      <p className="text-xs font-medium">Verifying portal session...</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-700 selection:text-white transition-colors">
      {/* EMAIL VERIFICATION LINK STATUS BANNER */}
      {emailVerifyState && (
        <div
          role="status"
          className={`no-print fixed top-3 left-1/2 -translate-x-1/2 z-[86] max-w-md w-[calc(100%-1.5rem)] px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-start gap-3 text-xs ${
            emailVerifyState.status === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
              : emailVerifyState.status === 'verifying'
              ? 'bg-blue-950/95 border-blue-500/50 text-blue-100'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-100'
          }`}
        >
          {emailVerifyState.status === 'verifying' ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0 mt-0.5" />
          ) : emailVerifyState.status === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-1">
            <div className="font-bold">
              {emailVerifyState.status === 'verifying'
                ? 'Verifying Email'
                : emailVerifyState.status === 'success'
                ? 'Email Verified'
                : 'Email Verification Notice'}
            </div>
            <p className="text-[11px] opacity-90 leading-snug">{emailVerifyState.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setEmailVerifyState(null)}
            aria-label="Close email verification notice"
            className="p-1 rounded-lg hover:bg-white/10 transition shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* WALLET PAYMENT CALLBACK VERIFICATION BANNER */}
      {paymentReturnState && (
        <div
          role="status"
          className={`no-print fixed top-3 left-1/2 -translate-x-1/2 z-[85] max-w-md w-[calc(100%-1.5rem)] px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-start gap-3 text-xs ${
            paymentReturnState.status === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
              : paymentReturnState.status === 'verifying'
              ? 'bg-blue-950/95 border-blue-500/50 text-blue-100'
              : paymentReturnState.status === 'pending'
              ? 'bg-amber-950/95 border-amber-500/50 text-amber-100'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-100'
          }`}
        >
          {paymentReturnState.status === 'verifying' ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0 mt-0.5" />
          ) : paymentReturnState.status === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-1.5">
            <div className="font-bold">
              {paymentReturnState.status === 'verifying'
                ? 'Confirming Wallet Deposit'
                : paymentReturnState.status === 'success'
                ? 'Wallet Deposit Confirmed'
                : paymentReturnState.status === 'pending'
                ? 'Awaiting Gateway Confirmation'
                : 'Payment Verification Notice'}
            </div>
            <p className="text-[11px] opacity-90 leading-snug">{paymentReturnState.message}</p>
            {(paymentReturnState.status === 'pending' || paymentReturnState.status === 'error') &&
              paymentReturnState.reference && (
                <button
                  type="button"
                  onClick={() =>
                    void runReturnedPaymentVerification(
                      paymentReturnState.reference!,
                      paymentReturnState.gateway,
                      paymentReturnState.transactionId
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Check Again</span>
                </button>
              )}
          </div>
          <button
            type="button"
            onClick={() => setPaymentReturnState(null)}
            aria-label="Close payment notification"
            className="p-1 rounded-lg hover:bg-white/10 transition shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ADMIN CENTRAL DASHBOARD PREVIEW BANNER */}
      {previewSession && user && isConsoleRole(user.role) && (
        <div className="no-print sticky top-0 z-[60] bg-amber-950/95 border-b border-amber-500/40 text-amber-100 px-4 py-2.5 backdrop-blur-md shadow-lg">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold uppercase text-[10px] whitespace-nowrap">
                <Eye className="w-3.5 h-3.5" />
                <span>Admin Preview Mode</span>
              </span>
              <span className="font-semibold text-white">
                Inspecting: {getDashboardLabel(previewSession.targetDashboard)}
              </span>
              <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                previewSession.mode === 'draft'
                  ? 'bg-purple-500/25 text-purple-200 border border-purple-400/40'
                  : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
              }`}>
                {previewSession.mode === 'draft' ? 'DRAFT PREVIEW' : 'LIVE PUBLISHED'}
              </span>
              <span className="text-[11px] text-amber-200/80 hidden md:inline">
                (Session preserved as {getRoleLabel(user.role)})
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={previewSession.targetDashboard}
                disabled={previewLoading}
                onChange={e => handleLaunchPreview(e.target.value, previewSession.mode)}
                className="bg-slate-900 border border-amber-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                aria-label="Switch Preview Dashboard"
              >
                {DASHBOARD_CATALOG_FALLBACK.map(d => (
                  <option key={d.key} value={d.key}>
                    Preview: {d.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={previewLoading}
                onClick={() =>
                  handleLaunchPreview(
                    previewSession.targetDashboard,
                    previewSession.mode === 'draft' ? 'published' : 'draft'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold whitespace-nowrap transition"
              >
                {previewLoading ? 'Switching...' : previewSession.mode === 'draft' ? 'View Published' : 'View Draft'}
              </button>

              <button
                type="button"
                onClick={handleExitPreview}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1 whitespace-nowrap transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit Preview &amp; Return to Admin</span>
              </button>
            </div>
          </div>
          {previewError && (
            <p className="max-w-7xl mx-auto mt-1 text-[11px] text-rose-300">{previewError}</p>
          )}
        </div>
      )}

      {/* IDENTITY DESK VIEW (PROTECTED) */}
      {activePhase === '05' && (
        authLoading ? renderSessionLoader() : !user ? (
          <CustomerLoginScreen
            notice="Authentication required to access the Identity Verification Desk."
            onSuccess={(loggedInUser) => {
              manualPublicBrowseRef.current = false;
              setActivePhase(shouldRouteToConsole(loggedInUser) ? '04' : '05');
            }}
            onOpenRegister={() => handleOpenAuth('register')}
            onSwitchToPublic={switchToPublicHome}
            onSwitchToAdmin={() => {
              manualPublicBrowseRef.current = false;
              setActivePhase('04');
            }}
          />
        ) : (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    Identity Verification &amp; NIN/BVN Services Desk
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                    Instant verification, slip printing, and profile record services.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shouldRouteToConsole(user) ? (
                  <button
                    type="button"
                    onClick={() => setActivePhase('04')}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{getRoleLabel(user?.role)} Console</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActivePhase('03')}
                    className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{getDashboardLabel(user?.assigned_dashboard || user?.role)}</span>
                  </button>
                )}
              </div>
            </div>

            <NinServicesPage />
          </main>
        )
      )}

      {/* SUPER ADMIN DASHBOARD VIEW (PROTECTED) */}
      {activePhase === '04' && (
        <SuperAdminDashboard
          onSwitchToCustomerPortal={() => {
            manualPublicBrowseRef.current = false;
            if (!user) {
              setActivePhase('03');
              return;
            }
            if (!shouldRouteToConsole(user)) {
              setActivePhase('03');
              return;
            }
            void handleLaunchPreview('customer', 'published');
          }}
          onSwitchToPublic={switchToPublicHome}
          onLaunchPreview={handleLaunchPreview}
          previewConfig={
            previewSession && isConsoleDashboard(previewSession.targetDashboard)
              ? previewSession.config
              : null
          }
          previewDashboardKey={
            previewSession && isConsoleDashboard(previewSession.targetDashboard)
              ? previewSession.targetDashboard
              : null
          }
          isPreviewMode={Boolean(
            previewSession && isConsoleDashboard(previewSession.targetDashboard)
          )}
        />
      )}

      {/* CUSTOMER LOGIN PAGE (#login) */}
      {activePhase === '06' && (
        authLoading ? renderSessionLoader() : (
          <CustomerLoginScreen
            onSuccess={(loggedInUser) => {
              manualPublicBrowseRef.current = false;
              setActivePhase(shouldRouteToConsole(loggedInUser || user) ? '04' : '03');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenRegister={() => handleOpenAuth('register')}
            onSwitchToPublic={switchToPublicHome}
            onSwitchToAdmin={() => {
              manualPublicBrowseRef.current = false;
              setActivePhase('04');
            }}
          />
        )
      )}

      {/* CUSTOMER / STUDENT / AGENT PORTAL VIEW (STRICT AUTH GUARD) */}
      {activePhase === '03' && (
        authLoading ? renderSessionLoader() : !user ? (
          <CustomerLoginScreen
            notice="Please sign in with your portal credentials to access your dashboard."
            onSuccess={(loggedInUser) => {
              manualPublicBrowseRef.current = false;
              setActivePhase(shouldRouteToConsole(loggedInUser) ? '04' : '03');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenRegister={() => handleOpenAuth('register')}
            onSwitchToPublic={switchToPublicHome}
            onSwitchToAdmin={() => {
              manualPublicBrowseRef.current = false;
              setActivePhase('04');
            }}
          />
        ) : (
          <RootErrorBoundary scopeLabel="Customer Portal">
            <CustomerDashboard
              onOpenFundModal={() => setWalletModalOpen(true)}
              onSwitchToPublic={switchToPublicHome}
              onSwitchToAdmin={() => {
                manualPublicBrowseRef.current = false;
                setActivePhase(user && !shouldRouteToConsole(user) ? '03' : '04');
              }}
              onLogout={handleCustomerLogout}
              previewConfig={
                previewSession && !isConsoleDashboard(previewSession.targetDashboard)
                  ? previewSession.config
                  : null
              }
              previewRole={
                previewSession && !isConsoleDashboard(previewSession.targetDashboard)
                  ? previewSession.targetRole
                  : undefined
              }
              previewAcademyData={
                previewSession && !isConsoleDashboard(previewSession.targetDashboard)
                  ? previewSession.academy_preview
                  : undefined
              }
              isPreviewMode={Boolean(
                previewSession && !isConsoleDashboard(previewSession.targetDashboard)
              )}
            />
          </RootErrorBoundary>
        )
      )}

      {/* PUBLIC WEBSITE VIEW */}
      {activePhase === '02' && (
        <>
          <PublicNavbar
            activePage={activePublicPage}
            onNavigate={handleNavigate}
            onOpenAuth={handleOpenAuth}
            onOpenCmsStudio={() => setCmsStudioOpen(true)}
            onSwitchToCustomerDashboard={() => {
              manualPublicBrowseRef.current = false;
              setActivePhase('03');
            }}
            onSwitchToAdminDashboard={() => {
              manualPublicBrowseRef.current = false;
              setActivePhase('04');
            }}
            onOpenWalletModal={() => setWalletModalOpen(true)}
          />

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {activePublicPage === 'home' && (
              <LandingPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'about' && (
              <AboutPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'services' && (
              <ServicesPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'howItWorks' && (
              <HowItWorksPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'academy' && (
              <AcademyPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'verify-student' && (
              <StudentVerifyPage initialStudentId={verifyStudentId} onNavigate={handleNavigate} />
            )}

            {activePublicPage === 'rates' && (
              <div className="space-y-8 py-4">
                <div className="space-y-3 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
                    <Calculator className="w-4 h-4" />
                    <span>Live Tariff Estimator</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
                    Wholesale Rates &amp; Fee Calculator
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Check live NGN pricing for NIN verification, BVN lookup, SME &amp; gifting data plans, and airtime discounts.
                  </p>
                </div>
                <RatesCalculator onActionClick={() => handleOpenAuth('register')} />
              </div>
            )}

            {activePublicPage === 'announcements' && <AnnouncementsPage />}

            {activePublicPage === 'faq' && <FaqPage onNavigate={handleNavigate} />}

            {activePublicPage === 'contact' && <ContactPage />}

            {activePublicPage === 'terms' && <TermsPage />}

            {activePublicPage === 'privacy' && <PrivacyPage />}

            {activePublicPage === 'refundPolicy' && <RefundPolicyPage />}
          </main>

          <Footer onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
        </>
      )}

      {/* FALLBACK */}
      {activePhase !== '02' && activePhase !== '03' && activePhase !== '04' && activePhase !== '05' && activePhase !== '06' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">Redirecting to home...</p>
          <button
            type="button"
            onClick={switchToPublicHome}
            className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold"
          >
            Go to Home
          </button>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
        onSuccess={(loggedInUser) => {
          manualPublicBrowseRef.current = false;
          if (shouldRouteToConsole(loggedInUser || user)) {
            setActivePhase('04');
          } else {
            setActivePhase('03');
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* CMS Studio Modal */}
      <CmsStudioModal isOpen={cmsStudioOpen} onClose={() => setCmsStudioOpen(false)} />

      {/* Wallet Modal */}
      <WalletModal isOpen={walletModalOpen} onClose={() => setWalletModalOpen(false)} />

      {/* Compulsory Transaction PIN Activation Overlay (gated until email verified for new accounts) */}
      <MandatoryPinSetupModal
        isOpen={Boolean(
          user &&
          !previewSession &&
          (user.role === 'customer' || user.role === 'student' || user.role === 'agent') &&
          (!user.email_verification_required || Boolean(user.email_verified)) &&
          !user.has_transaction_pin &&
          (pinPolicy?.require_pin_activation_for_all_customers || forcePinSetupOpen)
        )}
        onCompleted={() => setForcePinSetupOpen(false)}
        onLogout={handleCustomerLogout}
      />
    </div>
  );
}

export default function App() {
  return (
    <RootErrorBoundary scopeLabel="Application">
      <ThemeProvider>
        <AuthProvider>
          <CmsProvider>
            <PwaInstallProvider>
              <MainAppContent />
            </PwaInstallProvider>
          </CmsProvider>
        </AuthProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}
