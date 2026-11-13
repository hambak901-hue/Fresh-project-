/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CmsProvider } from './context/CmsContext';
import { ThemeProvider } from './context/ThemeContext';
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
import { Calculator, ShieldCheck, Shield, Fingerprint, Loader2 } from 'lucide-react';

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
  const { user, loading: authLoading, logout } = useAuth();

  // URL path / hash detection for direct deep-linking
  const getInitialPhase = (): string => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      const h = window.location.hash.toLowerCase();
      if (h.startsWith('#verify-student') || h.startsWith('#academy') || h.startsWith('#how-it-works') || h.startsWith('#refund-policy')) {
        return '02';
      }
      if (p.includes('/admin') || h.includes('admin')) return '04';
      if (p.includes('/login') || h === '#login') return '06';
      if (p.includes('/identity') || h.includes('identity')) return '05';
      if (p.includes('/portal') || p.includes('/customer') || h.includes('portal') || h.includes('customer')) return '03';
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

  // Auto-route authenticated users to their portal ONLY on login / default entry or #login,
  // preserving explicit public deep-links such as #verify-student/<id> or #academy
  useEffect(() => {
    if (!user) return;
    if (activePhase === '06') {
      if (user.role === 'admin' || user.role === 'superadmin') {
        setActivePhase('04');
      } else {
        setActivePhase('03');
      }
      return;
    }
    if (manualPublicBrowseRef.current || isExplicitPublicHash()) return;
    if (activePhase === '02') {
      if (user.role === 'admin' || user.role === 'superadmin') {
        setActivePhase('04');
      } else {
        setActivePhase('03');
      }
    }
  }, [user, activePhase]);

  // Listen dynamically to window hash changes and history popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const h = (window.location.hash || '').toLowerCase();
      const p = (window.location.pathname || '').toLowerCase();
      const s = (window.location.search || '').toLowerCase();

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
        setActivePhase('04');
      } else if (h === '#login' || p.includes('/login')) {
        manualPublicBrowseRef.current = false;
        setActivePhase('06');
      } else if (h.includes('identity') || p.includes('/identity')) {
        manualPublicBrowseRef.current = false;
        setActivePhase('05');
      } else if (
        h.includes('portal') ||
        h.includes('customer') ||
        p.includes('/portal') ||
        p.includes('/customer') ||
        s.includes('portal')
      ) {
        manualPublicBrowseRef.current = false;
        setActivePhase('03');
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
        if (!window.location.hash.includes('admin') && !window.location.pathname.includes('/admin')) {
          window.history.replaceState(null, '', '#admin');
        }
      } else if (activePhase === '03') {
        if (!window.location.hash.includes('portal') && !window.location.pathname.includes('/portal')) {
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

  const handleCustomerLogout = () => {
    logout();
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
      {/* IDENTITY DESK VIEW (PROTECTED) */}
      {activePhase === '05' && (
        authLoading ? renderSessionLoader() : !user ? (
          <CustomerLoginScreen
            notice="Authentication required to access the Identity Verification Desk."
            onSuccess={(loggedInUser) => {
              manualPublicBrowseRef.current = false;
              const role = loggedInUser?.role;
              setActivePhase(role === 'admin' || role === 'superadmin' ? '04' : '05');
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
                {(user?.role === 'admin' || user?.role === 'superadmin') && (
                  <button
                    type="button"
                    onClick={() => setActivePhase('04')}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin Console</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActivePhase('03')}
                  className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Customer Portal</span>
                </button>
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
            setActivePhase('03');
          }}
          onSwitchToPublic={switchToPublicHome}
        />
      )}

      {/* CUSTOMER LOGIN PAGE (#login) */}
      {activePhase === '06' && (
        authLoading ? renderSessionLoader() : (
          <CustomerLoginScreen
            onSuccess={(loggedInUser) => {
              manualPublicBrowseRef.current = false;
              const role = loggedInUser?.role || user?.role;
              setActivePhase(role === 'admin' || role === 'superadmin' ? '04' : '03');
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

      {/* CUSTOMER DASHBOARD VIEW (STRICT AUTH GUARD) */}
      {activePhase === '03' && (
        authLoading ? renderSessionLoader() : !user ? (
          <CustomerLoginScreen
            notice="Please sign in with your customer credentials to access the Customer Portal."
            onSuccess={(loggedInUser) => {
              manualPublicBrowseRef.current = false;
              const role = loggedInUser?.role;
              setActivePhase(role === 'admin' || role === 'superadmin' ? '04' : '03');
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
          <CustomerDashboard
            onOpenFundModal={() => setWalletModalOpen(true)}
            onSwitchToPublic={switchToPublicHome}
            onSwitchToAdmin={() => {
              manualPublicBrowseRef.current = false;
              setActivePhase('04');
            }}
            onLogout={handleCustomerLogout}
          />
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
          const role = loggedInUser?.role || user?.role;
          if (role === 'admin' || role === 'superadmin') {
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
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CmsProvider>
          <MainAppContent />
        </CmsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
