/**
 * @file LandingPage.tsx
 * Official public landing page for HAMBAK TECH & SERVICES (HAMBAKTECH).
 * Driven by CMS sections, verified rates, zero unverified statistical claims,
 * Academy spotlight, and unified Light/Night theme (Blue, White, Gold & Peach).
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { RatesCalculator } from './RatesCalculator';
import {
  ShieldCheck,
  Zap,
  Cpu,
  TrendingUp,
  ArrowRight,
  Lock,
  Smartphone,
  CreditCard,
  GraduationCap,
  Bell,
  CheckCircle2,
  ChevronRight,
  MapPin,
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, cmsSections, announcements } = useCms();

  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const slogan = branding?.tagline || 'Where Technology Meets Services';

  const hero = cmsSections?.hero || {
    badge: `${companyName} · ${regNo}`,
    headline: 'Trusted Digital Services, Identity Verification & Practical ICT Training',
    subheadline:
      'Access reliable NIN & BVN verification services, mobile data and airtime VTU, utility bill payments, and hands-on computer training from one dependable Nigerian platform.',
    primaryCtaText: 'Create Account',
    primaryCtaLink: 'register',
    secondaryCtaText: 'Explore Services',
    secondaryCtaLink: 'services',
    bannerImage: '/assets/images/hero_fintech_portal_1794097383199.jpg',
  };

  const intro = cmsSections?.companyIntro || {
    badge: 'Who We Are',
    title: 'Built for Nigerian Individuals, Agents & Growing Businesses',
    description:
      'HAMBAK TECH & SERVICES delivers fast digital utility services, identity verification workflows, and accredited ICT training across Nigeria from our Lagos operations hub.',
    founded: branding?.founded_year || '2024',
    headquarters: branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
    infrastructure: 'Encrypted Web Portal & Automated Wallet Ledger',
    stats: [
      { label: 'Currency Standard', value: 'NGN (₦)' },
      { label: 'Business Registration', value: regNo },
      { label: 'Founded', value: branding?.founded_year || '2024' },
      { label: 'Academy Tracks', value: '12 Courses' },
    ],
  };

  const howItWorks = cmsSections?.howItWorks || [
    {
      step: '01',
      title: 'Create Your Account',
      description: 'Register your personal or business account quickly and complete standard account verification.',
    },
    {
      step: '02',
      title: 'Fund Your Wallet',
      description: 'Add funds in Nigerian Naira (₦) using secure checkout or approved bank transfer verification.',
    },
    {
      step: '03',
      title: 'Use Services or Enroll',
      description: 'Process digital services, print verification slips, or submit your Academy training application online.',
    },
  ];

  const benefits = cmsSections?.benefits || [
    {
      id: 'b1',
      title: 'Transparent Naira Pricing',
      description: 'Clear wallet balance deduction and verifiable receipts on every completed request.',
      icon: 'TrendingUp',
    },
    {
      id: 'b2',
      title: 'NDPA Data Protection',
      description: 'Strict user consent enforcement and secure handling for identity verification records.',
      icon: 'ShieldCheck',
    },
    {
      id: 'b3',
      title: 'Reliable Wallet Ledger',
      description: 'Double-entry NGN wallet accounting ensures balances and refunds remain accurate.',
      icon: 'Cpu',
    },
    {
      id: 'b4',
      title: 'Dedicated Support Channels',
      description: 'Reach our WhatsApp desk, business/upline line, or office support directly whenever needed.',
      icon: 'Zap',
    },
  ];

  const pinnedAnnouncements = (announcements || []).filter((a) => a.is_pinned).slice(0, 2);

  return (
    <div className="space-y-14 lg:space-y-20">
      {/* 1. HERO SECTION */}
      <section className="relative pt-4 sm:pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
              <span>{hero.badge}</span>
              <span className="text-slate-400">&bull;</span>
              <span className="text-slate-600 dark:text-slate-300">{slogan}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15] text-balance">
              {hero.headline}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {hero.subheadline}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (hero.primaryCtaLink === 'register') {
                    onOpenAuth('register');
                  } else {
                    onNavigate(hero.primaryCtaLink);
                  }
                }}
                className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-blue-700/25 flex items-center gap-2"
              >
                <span>{hero.primaryCtaText}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate(hero.secondaryCtaLink || 'services')}
                className="px-6 py-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
              >
                {hero.secondaryCtaText}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('academy')}
                className="px-5 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 font-bold text-xs sm:text-sm transition-colors flex items-center gap-2"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Digital Training Academy</span>
              </button>
            </div>

            {/* Verified Identity & Location Strip */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center gap-5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Registered Business: {regNo}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>TLS Encrypted Sessions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Lekki LCDA, Lagos State</span>
              </div>
            </div>
          </div>

          {/* Right Hero Image Card */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl group">
              <img
                src={hero.bannerImage || '/assets/images/hero_fintech_portal_1794097383199.jpg'}
                alt={`${companyName} Digital Portal`}
                className="w-full h-72 sm:h-96 object-cover object-center group-hover:scale-105 transition-transform duration-700"
                loading="eager"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logo.png';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-700/60 flex items-center justify-between text-xs text-white">
                <div>
                  <div className="text-[10px] text-amber-300 font-semibold">{companyName}</div>
                  <div className="font-bold">{slogan}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-300">Primary Currency</div>
                  <div className="font-mono text-amber-300 font-bold">NGN (₦)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PINNED ANNOUNCEMENTS STRIP */}
      {pinnedAnnouncements.length > 0 && (
        <section className="rounded-2xl bg-blue-50 dark:bg-slate-900/70 border border-blue-200 dark:border-slate-800 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
              <Bell className="w-4 h-4" />
              <span>Official Notice</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('announcements')}
              className="text-xs text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>View all notices</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-white mr-2">
              {pinnedAnnouncements[0].title}:
            </span>
            <span>{pinnedAnnouncements[0].content}</span>
          </div>
        </section>
      )}

      {/* 3. LIVE PRICING & RATES CALCULATOR */}
      <section id="rates-calculator">
        <RatesCalculator onActionClick={() => onOpenAuth('register')} />
      </section>

      {/* 4. COMPANY INTRODUCTION */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-8 sm:p-10 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">{intro.badge}</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
              {intro.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {intro.description}
            </p>
            <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div>
                <strong className="text-slate-900 dark:text-slate-200">Office Location:</strong>{' '}
                {intro.headquarters}
              </div>
              <div>
                <strong className="text-slate-900 dark:text-slate-200">Registration:</strong>{' '}
                {regNo} &bull; <strong className="text-slate-900 dark:text-slate-200">Founded:</strong>{' '}
                {intro.founded}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            {intro.stats.map((stat, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left space-y-1"
              >
                <div className="text-lg sm:text-2xl font-extrabold text-blue-800 dark:text-white font-mono">
                  {stat.value}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SERVICES OVERVIEW */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Service Portfolio
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Digital Services &amp; Academy Tracks
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('services')}
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>View all services</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                NIN &amp; BVN Verification Services
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Conduct consent-based National Identification Number and Bank Verification Number checks with instant downloadable slip layouts and reference audit logs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                Standard &amp; Premium Slips
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                BVN Verification
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                Phone-to-NIN Query
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Mobile Data &amp; VTU Bundles
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Purchase MTN SME, Airtel, Glo, and 9mobile data packages at transparent agent and personal pricing.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-blue-700 dark:text-sky-400 font-semibold">
              All Major Nigerian Networks
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Airtime &amp; Utility Payments
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Top up airtime, pay DSTV, GOtv, and Startimes subscriptions, and vend prepaid electricity meter tokens.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
              Instant Token Delivery
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Naira Wallet &amp; Funding
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Manage your NGN balance through secure card checkout, bank transfer verification, and downloadable statements.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-orange-700 dark:text-orange-400 font-semibold">
              Audited Wallet History
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-amber-50 dark:from-slate-900 dark:to-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Digital Training Academy
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                12 hands-on courses covering Graphics Design, Computer Repairs, MS Office, Web &amp; App Development, and Software Engineering.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('academy')}
              className="pt-1 text-xs text-blue-700 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
            >
              <span>Apply Online Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 6. HOW IT WORKS */}
      <section className="space-y-8 text-center">
        <div>
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Simple Onboarding</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            How {branding?.short_brand_name || 'HAMBAKTECH'} Works
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-2">
            Start using digital services or enrolling in our Lekki training cohorts in three straightforward steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {howItWorks.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm"
            >
              <div className="text-3xl font-extrabold text-blue-700 dark:text-amber-400 font-mono">
                {item.step}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. BENEFITS */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-8 sm:p-10 space-y-8 shadow-sm">
        <div>
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Customer Value</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            Why Customers &amp; Learners Choose {companyName}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b) => (
            <div key={b.id} className="space-y-2">
              <div className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-amber-400 shrink-0" />
                <span>{b.title}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {b.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 8. CALL TO ACTION */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-900 via-blue-800 to-slate-900 text-white p-8 sm:p-14 text-center space-y-5 shadow-xl">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
          {companyName} &bull; {regNo}
        </span>
        <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight max-w-2xl mx-auto text-balance">
          Get Started with Digital Services or Our Training Academy
        </h2>
        <p className="text-xs sm:text-sm text-blue-100 max-w-xl mx-auto leading-relaxed">
          Open your free wallet account to access verification tools, mobile data, and bill payments, or apply directly to our Digital Training Academy.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={() => onOpenAuth('register')}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg flex items-center gap-2"
          >
            <span>Create Free Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-xs sm:text-sm transition-colors"
          >
            Contact Support
          </button>
        </div>
      </section>
    </div>
  );
};
