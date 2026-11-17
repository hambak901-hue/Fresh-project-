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
  ArrowRight,
  Lock,
  Smartphone,
  CreditCard,
  GraduationCap,
  Bell,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Printer,
  ShoppingBag,
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, announcements } = useCms();

  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const brandShort = branding?.short_brand_name || 'HAMBAKTECH';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const founded = branding?.founded_year || '2024';
  const officeAddress =
    branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const slogan = branding?.tagline || 'Where Technology Meets Services';
  const whatsappPhone = branding?.whatsapp_number || '09155104724';
  const businessPhone = branding?.business_phone || '08147837664';
  const officePhone = branding?.support_phone || '09127469686';

  const howItWorks = [
    {
      step: '01',
      title: 'Create Your Account',
      description:
        'Register your personal or business account online using your valid email address and profile information.',
    },
    {
      step: '02',
      title: 'Fund Your Balance',
      description:
        'Add Nigerian Naira (₦) into your wallet through approved online payment channels or verified bank transfer.',
    },
    {
      step: '03',
      title: 'Select Your Service',
      description:
        'Access NIN/BVN verification, data bundles, airtime, utility payments, request printing production, or apply to the Academy.',
    },
    {
      step: '04',
      title: 'Receive Your Service',
      description:
        'Download digital slips and receipts immediately in your portal, collect or receive Lagos print deliveries, or start your training cohort.',
    },
  ];

  const benefits = [
    {
      id: 'b1',
      title: 'Registered Nigerian Business',
      description: `Operating transparently under ${regNo}, established in ${founded} at Lekki LCDA, Lagos State.`,
    },
    {
      id: 'b2',
      title: 'Multiple Services in One Place',
      description:
        'Digital verification, telecom VTU, utility bills, commercial printing, and practical ICT training under one roof.',
    },
    {
      id: 'b3',
      title: 'Transparent Naira Pricing',
      description:
        'Clear wallet deductions, verifiable receipts, and confirmed per-foot quotes on large-format print jobs.',
    },
    {
      id: 'b4',
      title: 'NDPA Privacy & Consent Care',
      description:
        'Consent-driven identity verification workflows with responsible record handling and access controls.',
    },
    {
      id: 'b5',
      title: 'Office Pickup & Lagos Delivery',
      description:
        'Instant portal access for digital services, Origanrigan office collection, or paid delivery across Lagos State.',
    },
    {
      id: 'b6',
      title: 'Dedicated Local Support',
      description: `Reach our team directly via WhatsApp (${whatsappPhone}), Business/Upline (${businessPhone}), or Office (${officePhone}).`,
    },
  ];

  const displayAnnouncements = (announcements || []).slice(0, 2);

  return (
    <div className="space-y-14 lg:space-y-20">
      {/* 1. HERO SECTION */}
      <section className="relative pt-4 sm:pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
              <span>
                {companyName} &bull; {regNo}
              </span>
              <span className="text-slate-400">&bull;</span>
              <span className="text-slate-600 dark:text-slate-300">{slogan}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15] text-balance">
              Digital Solutions, Printing Services and Technology Training
            </h1>

            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              <p>
                {companyName} provides dependable digital identity verification, mobile data and airtime VTU, utility bill payments, Naira wallet services, printing and document production, and practical ICT education for individuals, agents, and organisations.
              </p>
              <p>
                Operating from our registered office in Lekki LCDA, Lagos State, we combine convenient online portal tools with commercial print finishing and hands-on technology programmes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-blue-700/25 flex items-center gap-2"
              >
                <span>Create an Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('services')}
                className="px-6 py-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
              >
                Explore Our Services
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
                <span>Established: {founded}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Location: {officeAddress}</span>
              </div>
            </div>
          </div>

          {/* Right Hero Image Card */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl group">
              <img
                src="/assets/images/hero_fintech_portal_1794097383199.jpg"
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

      {/* 2. OFFICIAL ANNOUNCEMENTS */}
      <section className="rounded-2xl bg-blue-50 dark:bg-slate-900/70 border border-blue-200 dark:border-slate-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
            <Bell className="w-4 h-4" />
            <span>Official Announcements</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('announcements')}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-white flex items-center gap-1 transition-colors font-semibold"
          >
            <span>View All Announcements</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {displayAnnouncements.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            {displayAnnouncements.map((item) => (
              <div key={item.id} className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-bold text-slate-900 dark:text-white mr-2">{item.title}:</span>
                <span>{item.content}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
            Stay informed on portal service updates, printing schedules, and upcoming Digital Training Academy admission cohorts.
          </p>
        )}
      </section>

      {/* 3. CHECK OUR SERVICE RATES */}
      <section id="rates-calculator" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Transparent Naira Pricing
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Check Our Service Rates
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('rates')}
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Check Rates &amp; Place an Order</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <RatesCalculator onActionClick={() => onOpenAuth('register')} />
      </section>

      {/* 4. WELCOME SECTION */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-8 sm:p-10 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Welcome to {companyName}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
              Multiple Services. One Business.
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {companyName} ({regNo}) brings everyday digital solutions, document printing and production, and practical ICT education together within one organised Nigerian business.
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Established in {founded} and headquartered at {officeAddress}, we serve private customers, agents, schools, and growing organisations with straightforward workflows and responsive support.
            </p>
            <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div>
                <strong className="text-slate-900 dark:text-slate-200">Office Location:</strong>{' '}
                {officeAddress}
              </div>
              <div>
                <strong className="text-slate-900 dark:text-slate-200">Registration:</strong>{' '}
                {regNo} &bull; <strong className="text-slate-900 dark:text-slate-200">Established:</strong>{' '}
                {founded}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            {[
              { label: 'Currency Standard', value: 'NGN (₦)' },
              { label: 'Registered Business', value: regNo },
              { label: 'Established', value: founded },
              { label: 'Academy Tracks', value: '12 Courses' },
            ].map((stat, idx) => (
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

      {/* 5. OUR SERVICES */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Our Services
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Digital Services, Printing Production &amp; Training
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('services')}
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Explore All Services</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Service 1: NIN & BVN */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                1. NIN &amp; BVN Verification Services
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Conduct consent-based National Identification Number (NIN) and Bank Verification Number (BVN) lookups for personal records, compliance, and business operations with downloadable slip layouts and clear audit logs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                Standard &amp; Premium NIN Slips
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                BVN &amp; Phone-to-NIN
              </span>
            </div>
          </div>

          {/* Service 2: Data, Airtime & Utility Bills */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                2. Mobile Data, Airtime VTU &amp; Utility Payments
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Purchase MTN, Airtel, Glo, and 9mobile data bundles, top up discounted airtime, renew DSTV, GOtv, and Startimes bouquets, and pay electricity bills with instant token receipts.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-blue-700 dark:text-sky-400 font-semibold">
              All Major Nigerian Networks &amp; Billers
            </div>
          </div>

          {/* Service 3: Naira Wallet */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                3. Naira Wallet &amp; Account Services
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Manage your Nigerian Naira (₦) wallet through approved online checkout, verified bank transfers, transaction PIN security, and clear balance statements.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-orange-700 dark:text-orange-400 font-semibold">
              Audited Wallet History
            </div>
          </div>

          {/* Service 4: Printing & Document Production */}
          <div className="md:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    4. Printing &amp; Document Production
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Dependable personal, academic, and commercial printing handled cleanly from request to finishing.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">Document Printing</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Sharp black-and-white and full-colour printing for forms, letters, reports, invoices, and project documents.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">Photocopying Services</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Single-sided and double-sided copying for official records, certificates, and bulk office sets.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">Large-Format Printing</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Flex banners, posters, stickers, and directional signs billed with clear per-foot pricing.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">Plastic ID Card Production</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Durable PVC identification cards for businesses, schools, organisations, associations, and events.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">Photo &amp; Image Printing</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Clean passport photographs and crisp colour photo prints sized to specification.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50/70 dark:bg-slate-950 border border-blue-200 dark:border-slate-800 p-4 space-y-1.5 text-xs">
              <div className="font-bold text-slate-900 dark:text-white">
                How Our Printing Service Works
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Customers submit manual printing requests with document details, size, quantity, and finishing requirements. Our production team reviews each specification, confirms final pricing (including per-foot rates for large-format jobs), and notifies you before printing starts. Completed orders are available for direct office collection at Origanrigan, Cele Area, Lekki LCDA, or via paid delivery within Lagos State.
              </p>
            </div>
          </div>

          {/* Service 5: Digital Training Academy */}
          <div className="md:col-span-2 rounded-2xl bg-gradient-to-br from-blue-50 to-amber-50 dark:from-slate-900 dark:to-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                5. ICT &amp; Digital Training Academy
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl">
                Practical, instructor-led training across 12 structured programmes including Graphics Design, Computer Repairs, MS Office, Data Analytics, Web &amp; App Development, and Software Engineering, complete with QR-verified Student ID cards.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('academy')}
              className="pt-1 text-xs text-blue-700 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
            >
              <span>Visit Digital Training Academy</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Service 6: Hardware & Agent Equipment */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                6. Agent Equipment &amp; Business Support
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Enquire about biometric readers, thermal receipt printers, and PVC card accessories stocked for registered agents and office workstations.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
              Direct Office &amp; Upline Coordination
            </div>
          </div>
        </div>
      </section>

      {/* 6. HOW IT WORKS */}
      <section className="space-y-8 text-center">
        <div>
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Simple Onboarding</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            How {companyName} Works
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-2">
            Start using digital services, requesting print production, or enrolling in our Lekki training cohorts in four straightforward steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
          {howItWorks.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-3 shadow-sm"
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

      {/* 7. WHY CHOOSE HAMBAK TECH & SERVICES? */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-8 sm:p-10 space-y-8 shadow-sm">
        <div>
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Customer Value</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            Why Choose {companyName}?
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
          {companyName} &bull; {brandShort} &bull; {regNo}
        </span>
        <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight max-w-2xl mx-auto text-balance">
          Let’s Help You Get Things Done
        </h2>
        <p className="text-xs sm:text-sm text-blue-100 max-w-xl mx-auto leading-relaxed">
          Open a free account to access digital verification, telecom bundles, and utility payments, enquire about printing jobs, or enrol in the Digital Training Academy.
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
            onClick={() => onNavigate('services')}
            className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-xs sm:text-sm transition-colors"
          >
            Explore Our Services
          </button>
          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-xs sm:text-sm transition-colors"
          >
            Contact Our Support Team
          </button>
        </div>
      </section>
    </div>
  );
};
