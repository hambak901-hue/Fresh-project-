/**
 * @file LandingPage.tsx
 * High-conversion modern landing page for HambakTech Enterprise.
 * Features hero with generated asset, rates calculator, company intro, bento services,
 * how it works, benefits, announcements highlight, and CTA sections.
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
  Server,
  Lock,
  Smartphone,
  CreditCard,
  GraduationCap,
  Bell,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, cmsSections, announcements } = useCms();

  const hero = cmsSections?.hero || {
    badge: "Nigeria's Leading Digital Services Platform",
    headline: 'Instant Identity Verification, Telecom Bundles & Digital Payments',
    subheadline:
      'Automate official NIMC NIN slip generation, verified BVN checks, MTN & Airtel SME data vending, and utility bill clearing with high-speed, reliable enterprise rails.',
    primaryCtaText: 'Get Started Free',
    primaryCtaLink: 'register',
    secondaryCtaText: 'Explore Solutions',
    secondaryCtaLink: 'services',
    bannerImage: '/assets/images/hero_fintech_portal_1794097383199.jpg',
  };

  const intro = cmsSections?.companyIntro || {
    badge: 'Engineering Excellence & Trust',
    title: 'Engineered for Nigerian Businesses, Developers & Resellers',
    description:
      'Founded with a mission to eliminate manual identity validation and telecom friction, HambakTech operates high-throughput automated gateways directly connected to telecom carrier pipelines and accredited identity validation registries.',
    founded: '2024',
    headquarters: 'Lagos, Nigeria',
    infrastructure: 'High-Availability Secure Cloud Edge',
    stats: [
      { label: 'Active Business Accounts', value: '5,000+' },
      { label: 'Daily Service Operations', value: '15,000+' },
      { label: 'Avg Dispatch Speed', value: '< 2.5s' },
      { label: 'Platform Availability', value: '99.9%' },
    ],
  };

  const howItWorks = cmsSections?.howItWorks || [
    {
      step: '01',
      title: 'Open Your Account',
      description: 'Create a free personal or corporate wallet in under 60 seconds with instant verification.',
    },
    {
      step: '02',
      title: 'Fund Your Balance',
      description: 'Top up seamlessly via instant card checkout, dedicated virtual bank accounts, or automated bank transfer.',
    },
    {
      step: '03',
      title: 'Dispatch Instantly',
      description: 'Process NIN & BVN slips, dispatch SME data packages, or hook into our developer REST API.',
    },
  ];

  const benefits = cmsSections?.benefits || [
    {
      id: 'b1',
      title: 'Sub-Second Dispatch',
      description: 'Direct carrier pipes deliver MTN SME data and airtime in under 3 seconds.',
      icon: 'Zap',
    },
    {
      id: 'b2',
      title: 'Regulatory Compliant',
      description: 'Official NIMC and NIBSS data verification formats with verifiable tracking codes.',
      icon: 'ShieldCheck',
    },
    {
      id: 'b3',
      title: 'Automated Failover',
      description: 'Multi-tier routing and sovereign failover infrastructure guarantees zero downtime.',
      icon: 'Cpu',
    },
    {
      id: 'b4',
      title: 'Wholesale Profit Margins',
      description: 'Enjoy agent discounted pricing on SME 1GB data starting as low as ₦250.',
      icon: 'TrendingUp',
    },
  ];

  const pinnedAnnouncements = (announcements || []).filter(a => a.is_pinned).slice(0, 2);

  return (
    <div className="space-y-16 lg:space-y-24">
      {/* 1. HERO SECTION */}
      <section className="relative pt-4 sm:pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Unboxed Metadata Kicker (Anti-slop zero-pill) */}
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span>{hero.badge}</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Verified Service Infrastructure</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.15] text-balance">
              {hero.headline}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              {hero.subheadline}
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => {
                  if (hero.primaryCtaLink === 'register') {
                    onOpenAuth('register');
                  } else {
                    onNavigate(hero.primaryCtaLink);
                  }
                }}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2"
              >
                <span>{hero.primaryCtaText}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate(hero.secondaryCtaLink || 'services')}
                className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
              >
                {hero.secondaryCtaText}
              </button>
            </div>

            {/* Quick Proof Strip */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-6 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>NIMC Licensed Format</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Sub-3s Vending</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>High-Availability Cloud Edge</span>
              </div>
            </div>
          </div>

          {/* Right Hero Image Card */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl group">
              <img
                src={hero.bannerImage || '/assets/images/hero_fintech_portal_1794097383199.jpg'}
                alt="HambakTech Enterprise Operations Center"
                className="w-full h-72 sm:h-96 object-cover object-center group-hover:scale-105 transition-transform duration-700"
                loading="eager"
                onError={e => {
                  (e.target as HTMLImageElement).src =
                    '/assets/aistudio/IMG_0483_23e1a1e1.png';
                }}
              />
              {/* Gradient scrim for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>

              {/* Inset Badge */}
              <div className="absolute bottom-4 left-4 right-4 p-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/60 flex items-center justify-between text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Security Architecture</div>
                  <div className="font-bold text-white">256-Bit Encrypted Edge</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">Uptime SLA</div>
                  <div className="font-mono text-emerald-400 font-bold">99.9% High Availability</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PINNED ANNOUNCEMENTS STRIP (If available) */}
      {pinnedAnnouncements.length > 0 && (
        <section className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Bell className="w-4 h-4" />
              <span>Latest Official Announcement</span>
            </div>
            <button
              onClick={() => onNavigate('announcements')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>View all notices</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-300">
            <span className="font-bold text-white mr-2">{pinnedAnnouncements[0].title}:</span>
            <span className="text-slate-400">{pinnedAnnouncements[0].content}</span>
          </div>
        </section>
      )}

      {/* 3. LIVE PRICING & RATES CALCULATOR */}
      <section id="rates-calculator">
        <RatesCalculator
          onActionClick={service => {
            onOpenAuth('register');
          }}
        />
      </section>

      {/* 4. COMPANY INTRODUCTION & STATS */}
      <section className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-8 sm:p-12 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-semibold text-emerald-400">{intro.badge}</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight text-balance">
              {intro.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {intro.description}
            </p>
            <div className="pt-2 text-xs text-slate-400 space-y-1">
              <div>
                <strong className="text-slate-300">Headquarters:</strong> {intro.headquarters} &bull; <strong className="text-slate-300">Founded:</strong> {intro.founded}
              </div>
              <div>
                <strong className="text-slate-300">Infrastructure:</strong> {intro.infrastructure}
              </div>
            </div>
          </div>

          {/* 4 KPI Metrics Grid */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            {intro.stats.map((stat, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-1"
              >
                <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                  {stat.value}
                </div>
                <div className="text-[11px] text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SERVICES OVERVIEW (BENTO GRID) */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-emerald-400">Unified Architecture</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              Complete Digital Services Suite
            </h2>
          </div>
          <button
            onClick={() => onNavigate('services')}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 self-start sm:self-auto"
          >
            <span>View full service specifications</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Identity Verification (Col span 2 on md) */}
          <div className="md:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-4 relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">NIN &amp; BVN Sovereign Verification</h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                Instant identity validation via HambakTech sovereign gateway. Generates certified NIMC slips, premium plastic identity formats, phone-to-NIN lookups, and Central Bank BVN biometrics.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 text-[11px] text-slate-400">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">Standard Slip</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">Premium NIN Card</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">CBN BVN Query</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">Phone Lookup</span>
            </div>
          </div>

          {/* Card 2: Telecom Vending */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Wholesale SME Telecoms</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Automated vending for MTN SME (₦270/GB), Airtel Corporate Gifting, Glo, and 9mobile with sub-3s delivery via direct carrier infrastructure.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-sky-400 font-mono font-semibold">
              Wholesale from ₦250/GB
            </div>
          </div>

          {/* Card 3: VTU Airtime & Bills */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Airtime &amp; Utility Bills</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Recharge Nigerian lines with an instant 2.5% discount. Vend DSTV, GOtv, Startimes cable TV and PHCN prepaid electricity tokens instantly.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-amber-400 font-mono font-semibold">
              2.5% Cashback on Airtime
            </div>
          </div>

          {/* Card 4: Payments & Wallet */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Unified Wallet &amp; Automated Top-Up</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Top up via automated secure card checkout or dedicated virtual bank accounts with audited double-entry accounting.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-purple-400 font-mono font-semibold">
              Instant Auto-Credit
            </div>
          </div>

          {/* Card 5: Hambak Academy & Digital Goods */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Hambak Academy &amp; Store</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Practical courses in Nigerian fintech integration, VTU agency scaling, developer licenses, and digital asset vending.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-teal-400 font-mono font-semibold">
              Certified Learning Tracks
            </div>
          </div>
        </div>
      </section>

      {/* 6. HOW IT WORKS */}
      <section className="space-y-8 text-center">
        <div>
          <div className="text-xs font-semibold text-emerald-400">Streamlined Workflow</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            How HambakTech Works
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto mt-2">
            Get your agency or business up and running in three simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {howItWorks.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3 relative"
            >
              <div className="text-3xl font-extrabold text-emerald-400/80 font-mono">
                {item.step}
              </div>
              <h3 className="text-base font-bold text-white">{item.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. BENEFITS & TRUST */}
      <section className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 sm:p-12 space-y-8">
        <div>
          <div className="text-xs font-semibold text-emerald-400">Wholesale Advantages</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Why Nigerian Resellers &amp; Businesses Choose HambakTech
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map(b => (
            <div key={b.id} className="space-y-2">
              <div className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{b.title}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 8. CALL TO ACTION SECTION */}
      <section className="rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/30 p-8 sm:p-14 text-center space-y-6 shadow-2xl">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          Ready to scale your VTU &amp; Identity verification operations?
        </span>
        <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight max-w-2xl mx-auto text-balance">
          Join Over 5,000 Verified Accounts on HambakTech
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
          Create your free wallet today. Enjoy wholesale SME rates, instant NIMC slip generation, and sub-second carrier delivery.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={() => onOpenAuth('register')}
            className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-500/30 flex items-center gap-2"
          >
            <span>Create Free Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate('contact')}
            className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
          >
            Contact Sales Desk
          </button>
        </div>
      </section>
    </div>
  );
};
