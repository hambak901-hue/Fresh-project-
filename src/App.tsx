/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CmsProvider, useCms } from './context/CmsContext';
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
import { Footer } from './components/public/Footer';
import { AuthModal } from './components/public/AuthModal';
import { CmsStudioModal } from './components/cms/CmsStudioModal';
import { WalletModal } from './components/WalletModal';
import { api } from './lib/api';
import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { NinServicesPage } from './components/customer/NinServicesPage';
import { Phase8Console } from './components/Phase8Console';
import { Phase9IntegrationQa } from './components/Phase9IntegrationQa';
import { ShieldCheck, Sparkles, Layers, Lock, ChevronRight, Calculator, CheckCircle2, User as UserIcon, Shield, Fingerprint, Zap, FileCheck } from 'lucide-react';

function MainAppContent() {
  const { user } = useAuth();
  const { branding, cmsSections } = useCms();

  // URL path / hash detection for direct deep-linking
  const getInitialPhase = (): string => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      const h = window.location.hash.toLowerCase();
      if (p.includes('/admin') || h.includes('admin')) return '04';
      if (p.includes('/portal') || p.includes('/customer') || h.includes('portal')) return '03';
    }
    return '02';
  };

  // Active view: '02' (Public Website - default), '03' (Customer Dashboard), '04' (Super Admin Console), '09' (QA & Diagnostics)
  const [activePhase, setActivePhase] = useState<string>(getInitialPhase);
  const [activePublicPage, setActivePublicPage] = useState<string>('home');

  // Auto-route authenticated users to their respective portal on login or initial session restoration
  useEffect(() => {
    if (user) {
      if (user.role === 'admin' || user.role === 'superadmin') {
        // If user is admin and currently on public page, route to admin console
        if (activePhase === '02') {
          setActivePhase('04');
        }
      } else {
        // If customer is on public page, route to customer portal
        if (activePhase === '02') {
          setActivePhase('03');
        }
      }
    }
  }, [user]);

  // Listen dynamically to window hash changes and history popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const h = (window.location.hash || '').toLowerCase();
      const p = (window.location.pathname || '').toLowerCase();
      const s = (window.location.search || '').toLowerCase();

      if (h.includes('admin') || p.includes('/admin') || s.includes('admin')) {
        setActivePhase('04');
      } else if (h.includes('portal') || h.includes('customer') || p.includes('/portal') || p.includes('/customer') || s.includes('portal')) {
        setActivePhase('03');
      } else if (h === '#home' || h === '#public' || (h === '' && p === '/' && !s.includes('admin') && !s.includes('portal'))) {
        // Only return to public page if user is not an admin
        if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
          setActivePhase('02');
        }
      }
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    // Execute immediately on mount to ensure deep-linked hash is honored
    handleUrlChange();

    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [user]);

  // Keep URL in sync with active phase
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
      } else if (activePhase === '02') {
        if (window.location.hash === '#admin' || window.location.hash === '#portal') {
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
    setActivePublicPage(page);
    setActivePhase('02');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">

      {/* PHASE 09 COMPLETE APPLICATION INTEGRATION & QA VIEW */}
      {activePhase === '09' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Phase9IntegrationQa
            onSwitchToCustomer={() => setActivePhase('03')}
            onSwitchToAdmin={() => setActivePhase('04')}
            onSwitchToPublic={() => {
              setActivePublicPage('home');
              setActivePhase('02');
            }}
          />
        </main>
      )}

      {/* PHASE 08 ADDITIONAL MODULES & COMMS VIEW */}
      {activePhase === '08' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Phase8Console
            onSwitchToCustomer={() => setActivePhase('03')}
            onSwitchToAdmin={() => setActivePhase('04')}
          />
        </main>
      )}

      {/* PHASE 05 COMPLETE NIN & BVN DESK VIEW */}
      {activePhase === '05' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Phase 05: Sovereign Identity Desk (NIN &amp; BVN Verification)</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20 text-[10px]">
                    Verified Identity Network
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  42 official services &bull; 16 modifications &bull; High-res NIMC/CBN slip generator &bull; Wholesale margin desk
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePhase('04')}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Pricing &amp; Gateways</span>
              </button>
              <button
                onClick={() => setActivePhase('03')}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Customer Portal</span>
              </button>
            </div>
          </div>

          <NinServicesPage />
        </main>
      )}

      {/* PHASE 04 SUPER ADMIN DASHBOARD VIEW */}
      {activePhase === '04' && (
        <SuperAdminDashboard
          onSwitchToCustomerPortal={() => setActivePhase('03')}
          onSwitchToPublic={() => setActivePhase('02')}
        />
      )}

      {/* PHASE 03 CUSTOMER DASHBOARD VIEW */}
      {activePhase === '03' && (
        <CustomerDashboard
          onOpenFundModal={() => setWalletModalOpen(true)}
          onSwitchToPublic={() => setActivePhase('02')}
          onSwitchToAdmin={() => setActivePhase('04')}
        />
      )}

      {/* PHASE 02 PUBLIC WEBSITE VIEW */}
      {activePhase === '02' && (
        <>
          {/* Top Navbar */}
          <PublicNavbar
            activePage={activePublicPage}
            onNavigate={handleNavigate}
            onOpenAuth={handleOpenAuth}
            onOpenCmsStudio={() => setCmsStudioOpen(true)}
            onSwitchToCustomerDashboard={() => setActivePhase('03')}
            onSwitchToAdminDashboard={() => setActivePhase('04')}
            onOpenWalletModal={() => setWalletModalOpen(true)}
          />

          {/* Main Public Page Container */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Page Router */}
            {activePublicPage === 'home' && (
              <LandingPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'about' && (
              <AboutPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'services' && (
              <ServicesPage onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activePublicPage === 'rates' && (
              <div className="space-y-8 py-4">
                <div className="space-y-3 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Calculator className="w-4 h-4" />
                    <span>Real-time Tariffs</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
                    Wholesale Rates &amp; Fee Calculator
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Test live fee computations for NIN slip printing, BVN verification, MTN SME data, and airtime cashback discounts.
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
          </main>

          {/* Footer */}
          <Footer onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
        </>
      )}

      {/* Fallback to Public Website */}
      {activePhase !== '02' && activePhase !== '03' && activePhase !== '04' && activePhase !== '05' && activePhase !== '08' && activePhase !== '09' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-slate-400 text-sm">Redirecting to home...</p>
          <button
            onClick={() => setActivePhase('02')}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
          >
            Go to Home
          </button>
        </div>
      )}

      {/* Auth Modal (Register & Login) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
        onSuccess={(loggedInUser) => {
          const role = loggedInUser?.role || user?.role;
          if (role === 'admin' || role === 'superadmin') {
            setActivePhase('04');
          } else {
            setActivePhase('03');
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* CMS Studio Modal (Admin Content & Branding Management) */}
      <CmsStudioModal
        isOpen={cmsStudioOpen}
        onClose={() => setCmsStudioOpen(false)}
      />

      {/* Wallet Modal */}
      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CmsProvider>
        <MainAppContent />
      </CmsProvider>
    </AuthProvider>
  );
}
