/**
 * @file AboutPage.tsx
 * About Us page for HAMBAK TECH & SERVICES (HAMBAKTECH).
 * Powered dynamically by Admin CMS (aboutOverview, mission, vision, coreValues, businessObjectives, whyChooseUs)
 * and official company identity (BN 9284726, Lekki LCDA, Founded 2024).
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { ShieldCheck, Globe, Zap, CheckCircle2, MapPin, Building2, Target } from 'lucide-react';

interface AboutPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, cmsSections } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const brandShort = branding?.short_brand_name || 'HAMBAKTECH';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const founded = branding?.founded_year || '2024';
  const address = branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';

  const overview = cmsSections?.aboutOverview || {
    title: `Empowering Nigerians with Reliable Digital Services & Practical ICT Skills`,
    content: `${companyName} (${regNo}) was established in ${founded} to bridge everyday digital utility access and hands-on technical education in Nigeria. Operating from ${address}, we serve individual users, VTU agents, corporate partners, and technology students.`,
  };

  const mission = cmsSections?.mission || {
    title: 'Our Mission',
    content:
      'To deliver trustworthy, accessible digital verification, mobile connectivity, utility bill clearing, and practical ICT & software skills training backed by transparent Naira pricing.',
  };

  const vision = cmsSections?.vision || {
    title: 'Our Vision',
    content:
      'To become a household name across Nigeria for dependable everyday digital services and career-ready technology education.',
  };

  const coreValues = cmsSections?.coreValues || [
    {
      title: 'Integrity & Accountability',
      description: 'Every wallet credit, service charge, and training record is transparently logged and verifiable.',
    },
    {
      title: 'Compliance & Data Care',
      description: 'Consent-driven identity workflows built with strict respect for Nigeria Data Protection Act (NDPA) standards.',
    },
    {
      title: 'Practical Excellence',
      description: 'Digital tools and Academy courses tailored to solve real everyday business and career needs in Nigeria.',
    },
  ];

  const objectives = cmsSections?.businessObjectives || [
    'Provide fast, reliable access to mobile data, airtime VTU, cable TV, and electricity payments.',
    'Support authorized, consent-based identity verification and clean printable slip generation.',
    'Equip youths, entrepreneurs, and professionals with practical ICT, design, and software skills through HAMBAKTECH Digital Training Academy.',
  ];

  const whyChooseUs = cmsSections?.whyChooseUs || [
    { title: 'Registered Business', description: `${companyName} operates transparently under registration ${regNo}.` },
    { title: 'Naira Wallet Clarity', description: 'Fund in Nigerian Naira (₦) with clear transaction and order history.' },
    { title: 'Dedicated Phone Desks', description: 'Distinct WhatsApp, Business/Upline, and Office support channels.' },
    { title: 'QR-Verified Academy IDs', description: 'Every approved student receives an official verifiable Student ID card.' },
  ];

  return (
    <div className="space-y-12 py-4">
      {/* Header Banner */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
          <span>{companyName}</span>
          <span className="text-slate-400">&bull;</span>
          <span>{regNo}</span>
          <span className="text-slate-400">&bull;</span>
          <span>Founded {founded}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          {overview.title}
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          {overview.content}
        </p>
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
            <span>{regNo} &bull; Est. {founded}</span>
          </div>
        </div>
      </div>

      {/* Mission & Vision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{mission.title}</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {mission.content}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{vision.title}</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {vision.content}
          </p>
        </div>
      </div>

      {/* Core Values */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {coreValues.map((val, idx) => (
          <div
            key={idx}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-2.5 shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              {idx === 0 ? <Zap className="w-4 h-4" /> : idx === 1 ? <ShieldCheck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{val.title}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {val.description}
            </p>
          </div>
        ))}
      </div>

      {/* Business Objectives & Why Choose Us */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Business Objectives</h2>
          <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            {objectives.map((obj, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Why Choose {brandShort}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {whyChooseUs.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1"
              >
                <div className="font-bold text-slate-900 dark:text-white">{item.title}</div>
                <div className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 to-slate-900 text-white p-8 text-center space-y-4 shadow-lg">
        <h3 className="text-xl font-bold">Work or Learn with {companyName}</h3>
        <p className="text-xs text-blue-100 max-w-md mx-auto">
          Create a free account to use our digital portal, or visit our Digital Training Academy to apply for upcoming cohorts.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => onOpenAuth('register')}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all"
          >
            Create Free Account
          </button>
          <button
            type="button"
            onClick={() => onNavigate('academy')}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold transition-all"
          >
            Explore Academy
          </button>
        </div>
      </div>
    </div>
  );
};
