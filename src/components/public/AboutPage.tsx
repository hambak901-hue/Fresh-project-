/**
 * @file AboutPage.tsx
 * About Us page for HAMBAK TECH & SERVICES (HAMBAKTECH).
 * Powered dynamically by Admin CMS (aboutOverview, mission, vision, coreValues, businessObjectives, whyChooseUs)
 * and official company identity (BN 9284726, Lekki LCDA, Founded 2024).
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import {
  ShieldCheck,
  Globe,
  Zap,
  CheckCircle2,
  MapPin,
  Building2,
  Target,
  Smartphone,
  Printer,
  CreditCard,
  GraduationCap,
} from 'lucide-react';

interface AboutPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const brandShort = branding?.short_brand_name || 'HAMBAKTECH';
  const slogan = branding?.tagline || 'Where Technology Meets Services';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const founded = branding?.founded_year || '2024';
  const address =
    branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const whatsappPhone = branding?.whatsapp_number || '09155104724';
  const businessPhone = branding?.business_phone || '08147837664';
  const officePhone = branding?.support_phone || '09127469686';
  const supportEmail = branding?.support_email || 'support@hambaktech.com.ng';
  const infoEmail = branding?.info_email || 'info@hambaktech.com.ng';

  const philosophyItems = [
    {
      title: 'Integrity',
      description:
        'Every wallet balance, service fee, printing quote, and student admission record is handled honestly and transparently.',
    },
    {
      title: 'Professionalism',
      description:
        'Disciplined operations across digital request processing, print finishing, and classroom instruction.',
    },
    {
      title: 'Customer Satisfaction',
      description:
        'Responsive follow-through from initial enquiry and job confirmation to digital delivery, pickup, or dispatch.',
    },
    {
      title: 'Quality Service',
      description:
        'Clean verification slips, reliable telecom vending, sharp commercial printing, and practical hands-on training.',
    },
    {
      title: 'Accessibility',
      description:
        'Convenient online access paired with a real physical office and direct phone support channels in Lekki, Lagos.',
    },
    {
      title: 'Continuous Improvement',
      description:
        'Regular refinement of our service workflows, printing capacity, and training curriculum to serve customers better.',
    },
  ];

  const commitments = [
    'Strict respect for user consent and Nigeria Data Protection Act (NDPA) standards on all identity verification workflows.',
    'Clear Nigerian Naira (₦) pricing displayed upfront for digital services and confirmed prior to printing production.',
    'Fair, verifiable handling of failed automated transactions, wallet funding confirmations, and customer support tickets.',
    'Direct access to human assistance through dedicated WhatsApp, Business/Upline, Customer Service/Office, and email desks.',
  ];

  return (
    <div className="space-y-12 py-4">
      {/* Header Banner */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
          <span>About {companyName}</span>
          <span className="text-slate-400">&bull;</span>
          <span>{slogan}</span>
          <span className="text-slate-400">&bull;</span>
          <span>{regNo}</span>
          <span className="text-slate-400">&bull;</span>
          <span>Established {founded}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          A Business Built Around Technology, Services and Opportunity
        </h1>
        <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            {companyName} (also known as {brandShort}) is a registered Nigerian technology, printing, and digital services business established in {founded} under Business Name {regNo}.
          </p>
          <p>
            Operating from {address}, we serve individuals, VTU agents, businesses, schools, and learners who value reliable everyday digital tools, quality print production, and practical ICT education.
          </p>
        </div>
      </div>

      {/* Hero Visual Section */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
        <img
          src="/assets/images/about_team_office_1794097382819.jpg"
          alt={`${companyName} Operations`}
          className="w-full h-72 sm:h-96 object-cover object-center"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/logo.png';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />
        <div className="absolute bottom-5 left-5 right-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-white">
          <div className="bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{address}</span>
          </div>
          <div className="bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60 font-mono text-amber-300 flex items-center gap-2">
            <Building2 className="w-4 h-4 shrink-0" />
            <span>
              {regNo} &bull; Est. {founded}
            </span>
          </div>
        </div>
      </div>

      {/* Who We Are */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Who We Are</h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {companyName} combines an online customer service portal with physical commercial operations in Lekki LCDA, Lagos State. Rather than separating digital tools, document printing, and computer training into disconnected places, we organise them within one accessible Nigerian enterprise built around practical customer needs.
        </p>
      </div>

      {/* Mission & Vision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Our Mission</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            To deliver dependable digital identity verification, telecommunications VTU, utility bill payments, commercial printing production, and practical ICT skills training backed by transparent Nigerian Naira pricing and honest customer support.
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Our Vision</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            To grow as a trusted technology, document production, and digital skills hub in Lagos State and across Nigeria, known for reliability, accountability, and practical value.
          </p>
        </div>
      </div>

      {/* Our Business Services & Operations */}
      <div className="space-y-6">
        <div>
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
            What We Do
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            Our Business Services &amp; Operations
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              1. Digital Identity Services
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Consent-based National Identification Number (NIN) and Bank Verification Number (BVN) lookups, phone-to-NIN queries, and clean downloadable verification slip layouts supported by verifiable reference logs.
            </p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              2. Telecommunications &amp; Digital Payments
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Automated mobile data bundles for MTN, Airtel, Glo, and 9mobile, discounted airtime top-ups, cable TV renewals (DSTV, GOtv, Startimes), and electricity meter token vending in Nigerian Naira.
            </p>
          </div>

          {/* 3. Printing & Document Production */}
          <div className="md:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  3. Printing &amp; Document Production
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Commercial, academic, and personal print production with confirmed quotes before production starts.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">A. Document Printing</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Clean black-and-white and full-colour printing for letters, business forms, reports, manuals, and academic work.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">B. Photocopying Services</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Single-sided and double-sided copying for identification papers, receipts, certificates, and bulk office sets.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">C. Large-Format Printing</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Banners, flex signs, posters, and display prints priced transparently per foot based on dimensions and material.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">D. Plastic ID Card Production</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Durable PVC ID cards produced neatly for companies, schools, associations, staff teams, and events.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">E. Photo &amp; Image Printing</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Passport photographs and high-clarity colour image prints prepared cleanly to requested sizes.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-slate-950 border border-blue-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  Request, Collection &amp; Lagos Delivery
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  All print orders are submitted as manual specifications for review and pricing confirmation. Finished jobs are collected at our Origanrigan, Lekki office or sent via paid delivery within Lagos State.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              4. Digital Wallet &amp; Online Services
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Unified Nigerian Naira (₦) wallet funded via approved online payment gateways or verified bank transfers, with transaction PIN controls and clear debit/credit ledger statements.
            </p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              5. ICT &amp; Digital Training
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Hands-on instruction across 12 structured courses covering Graphics Design, Computer Repairs, MS Office, Data Analysis, Web &amp; App Development, and Software Engineering, complete with QR-verified Student ID cards.
            </p>
          </div>
        </div>
      </div>

      {/* Our Business Philosophy */}
      <div className="space-y-4">
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Our Business Philosophy
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {philosophyItems.map((val, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-2.5 shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
                {idx % 3 === 0 ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : idx % 3 === 1 ? (
                  <Zap className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{val.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {val.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Our Commitment to Customers & Official Business Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Our Commitment to Customers
          </h2>
          <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            {commitments.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Our Business Location &amp; Official Business Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Registered Name</div>
              <div className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {companyName} ({brandShort}) &bull; {regNo}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Established</div>
              <div className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {founded} &bull; Lekki LCDA, Lagos State
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 sm:col-span-2">
              <div className="font-bold text-slate-900 dark:text-white">Office Address</div>
              <div className="text-slate-600 dark:text-slate-400 leading-relaxed">{address}</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Phone Desks</div>
              <div className="text-slate-600 dark:text-slate-400 leading-relaxed space-y-0.5">
                <div>WhatsApp: {whatsappPhone}</div>
                <div>Business / Upline: {businessPhone}</div>
                <div>Customer Service / Office: {officePhone}</div>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Official Emails</div>
              <div className="text-slate-600 dark:text-slate-400 leading-relaxed space-y-0.5">
                <div>{supportEmail}</div>
                <div>{infoEmail}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 to-slate-900 text-white p-8 text-center space-y-4 shadow-lg">
        <h3 className="text-xl font-bold">Work, Learn and Grow With Us</h3>
        <p className="text-xs text-blue-100 max-w-md mx-auto">
          Explore our digital services, enquire about printing jobs, or enrol in our Digital Training Academy in Lekki LCDA, Lagos State.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('services')}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all"
          >
            Explore Our Services
          </button>
          <button
            type="button"
            onClick={() => onNavigate('academy')}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold transition-all"
          >
            Visit Digital Training Academy
          </button>
          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold transition-all"
          >
            Contact Us
          </button>
          <button
            type="button"
            onClick={() => onOpenAuth('register')}
            className="px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold transition-all"
          >
            Create Free Account
          </button>
        </div>
      </div>
    </div>
  );
};
