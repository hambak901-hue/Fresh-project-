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
import { PhaseTracker, PHASES } from './components/PhaseTracker';
import { Phase1FoundationView } from './components/Phase1FoundationView';
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

  // Active view: '09' (Phase 09 QA & Integration), '08' (Phase 08 Modules & Comms), '05' (Phase 05 NIN & BVN Desk), '04' (Phase 04 Super Admin Console), '03' (Phase 03 Customer Dashboard), '02' (Phase 02 Public Website), '01' (Phase 01 Foundation Console)
  const [activePhase, setActivePhase] = useState<string>('09');
  const [activePublicPage, setActivePublicPage] = useState<string>('home');
  const [showRoadmapBanner, setShowRoadmapBanner] = useState<boolean>(false);

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
      {/* Top Banner: Phase Progress & Mode Bar */}
      <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">
              {activePhase === '09'
                ? 'PHASE 09 ACTIVE'
                : activePhase === '08'
                ? 'PHASE 08 ACTIVE'
                : activePhase === '05'
                ? 'PHASE 05 ACTIVE'
                : activePhase === '04'
                ? 'PHASE 04 ACTIVE'
                : activePhase === '03'
                ? 'PHASE 03 ACTIVE'
                : activePhase === '02'
                ? 'PHASE 02 ACTIVE'
                : 'PHASE 01 ACTIVE'}
            </span>
            <span className="text-slate-300 font-semibold">
              {activePhase === '09'
                ? 'Phase 09: Complete Application Integration & Quality Assurance (34 Tests Verified, 5 Reports)'
                : activePhase === '08'
                ? 'Phase 08: Additional Modules & Communication System (SMTP, 12 Email Templates, SMS, PIN)'
                : activePhase === '05'
                ? 'Phase 05: Complete NIN & BVN Integration (2SureVerify, Veripine, Slips)'
                : activePhase === '04'
                ? 'Super Admin Dashboard & Global Management (8 Modules, Real-time DB & RBAC)'
                : activePhase === '03'
                ? 'Customer Dashboard Development (14 Pages, Live Backend & Real-time Metrics)'
                : activePhase === '02'
                ? 'Public Website & Dynamic Branding Management'
                : 'Project Foundation & Credentials Vault'}
            </span>
            <span className="text-slate-600 hidden md:inline">&bull;</span>
            <span className="text-slate-400 hidden md:inline text-[11px]">TrueHost LON110 Server (51.89.153.183)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRoadmapBanner(!showRoadmapBanner)}
              className="text-[11px] text-slate-400 hover:text-white transition-colors underline"
            >
              {showRoadmapBanner ? 'Hide 10-Phase Roadmap' : 'View 10-Phase Roadmap'}
            </button>
            <span className="text-slate-700">|</span>
            <button
              onClick={() => setActivePhase('09')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '09'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>Phase 09: QA</span>
            </button>
            <button
              onClick={() => setActivePhase('08')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '08'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Phase 08</span>
            </button>
            <button
              onClick={() => setActivePhase('05')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '05'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
              <span>Phase 05: NIN &amp; BVN</span>
            </button>
            <button
              onClick={() => setActivePhase('04')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '04'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-300" />
              <span>Admin Console</span>
            </button>
            <button
              onClick={() => setActivePhase('03')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '03'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Customer Portal</span>
            </button>
            <button
              onClick={() => setActivePhase('02')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '02'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span>Public Web</span>
            </button>
            <button
              onClick={() => setActivePhase('01')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                activePhase === '01'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Phase 01</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Phase Roadmap Tracker */}
      {showRoadmapBanner && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4">
          <PhaseTracker
            currentPhaseNumber={activePhase}
            onSelectPhase={phaseNum => {
              setActivePhase(phaseNum);
            }}
          />
        </div>
      )}

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
                    2SureVerify &bull; Veripine
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
          onSwitchToPhaseConsole={() => setActivePhase('01')}
        />
      )}

      {/* PHASE 03 CUSTOMER DASHBOARD VIEW */}
      {activePhase === '03' && (
        <CustomerDashboard
          onOpenFundModal={() => setWalletModalOpen(true)}
          onSwitchToPublic={() => setActivePhase('02')}
          onSwitchToPhaseConsole={() => setActivePhase('01')}
          onSwitchToAdmin={() => setActivePhase('04')}
        />
      )}

      {/* PHASE 01 VIEW */}
      {activePhase === '01' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              <span className="font-bold text-purple-200">Phase 01 Foundation &amp; Architecture Console</span>
              <span className="text-slate-400">&bull; Database, Adapters, Auth &amp; Credentials Vault</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePhase('04')}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
              >
                Go to Super Admin Console
              </button>
              <button
                onClick={() => setActivePhase('03')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
              >
                Go to Customer Dashboard
              </button>
              <button
                onClick={() => setActivePhase('02')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Return to Phase 02 Public Website
              </button>
            </div>
          </div>

          <Phase1FoundationView onProceedToPhase2={() => setActivePhase('02')} />
        </main>
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
            onSwitchToPhaseConsole={() => setActivePhase('01')}
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

      {/* Other Queued Phases (Phase 10) */}
      {activePhase !== '01' && activePhase !== '02' && activePhase !== '03' && activePhase !== '04' && activePhase !== '05' && activePhase !== '08' && activePhase !== '09' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
              Phase {activePhase} Queued
            </span>
            <h3 className="text-xl font-bold text-white mt-2">
              {PHASES.find(p => p.number === activePhase)?.title}
            </h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto mt-2 leading-relaxed">
              {PHASES.find(p => p.number === activePhase)?.description}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 max-w-md mx-auto text-left text-xs space-y-2">
            <div className="font-semibold text-slate-300">Phase Rule Enforced:</div>
            <p className="text-slate-400 text-[11px]">
              Per project specifications, AI Studio completes and tests each phase sequentially. Phase 01 Foundation, Phase 02 Public Website, Phase 03 Customer Portal, and Phase 04 Super Admin Dashboard are completed and verified.
            </p>
          </div>

          <button
            onClick={() => setActivePhase('04')}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
          >
            Return to Phase 04 Admin Console
          </button>
        </main>
      )}

      {/* Auth Modal (Register & Login) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
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
