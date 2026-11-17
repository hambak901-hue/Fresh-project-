/**
 * @file HowItWorksPage.tsx
 * Customer onboarding, wallet funding, service fulfillment, and Digital Training Academy guide.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { ArrowRight, CheckCircle2, Phone, Mail, Clock, ShieldCheck } from 'lucide-react';

interface HowItWorksPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, cmsSections } = useCms();
  const steps = cmsSections?.howItWorks || [
    {
      step: '01',
      title: 'Register Your Account',
      description: 'Sign up in minutes with your valid email address and create your personal dashboard.',
    },
    {
      step: '02',
      title: 'Fund Your NGN Wallet',
      description: 'Add funds conveniently via approved payment gateways or verified bank transfer.',
    },
    {
      step: '03',
      title: 'Order or Enroll',
      description: 'Access telecom VTU, bill payments, identity services, or apply to the Digital Training Academy.',
    },
  ];

  const csInfo = cmsSections?.customerServiceInfo || {
    officeHours: 'Monday – Saturday, 8:00 AM – 6:00 PM WAT',
    whatsappLabel: 'WhatsApp Desk',
    businessLabel: 'Business / Upline Contact',
    officeLabel: 'Customer Service / Office',
  };

  return (
    <div className="space-y-14 py-6">
      <div className="space-y-4 max-w-3xl">
        <div className="text-xs font-bold text-blue-700 dark:text-blue-400">
          Platform Guide &bull; {branding?.short_brand_name || 'HAMBAKTECH'}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          How {branding?.short_brand_name || 'HAMBAKTECH'} Works
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          From opening your Nigerian Naira wallet to purchasing telecom bundles, running identity verifications, or enrolling in our Digital Training Academy—every workflow is built for clarity and ease of use.
        </p>
      </div>

      {/* 3 Main Onboarding Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((st, idx) => (
          <div
            key={idx}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm"
          >
            <div className="text-3xl font-black font-mono text-blue-700 dark:text-blue-400">{st.step}</div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{st.title}</h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{st.description}</p>
          </div>
        ))}
      </div>

      {/* Digital Training Academy Steps */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Digital Training Academy Admissions
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              How Academy Enrollment Works
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('academy')}
            className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-2 self-start sm:self-auto"
          >
            <span>Open Academy Portal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {[
            { t: '1. Select a Track', d: 'Choose any of the 12 official courses matching your career goal and schedule.' },
            { t: '2. Submit Application', d: 'Complete the admission form online (applicants under 18 include parent/guardian details).' },
            { t: '3. Admin Review', d: 'Admissions desk reviews applications and issues sequential Student ID (HTDA/YYYY/0001).' },
            { t: '4. Receive QR ID Card', d: 'Download/print your verifiable Student ID card and begin instructor-led training.' },
          ].map((item, i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                <span>{item.t}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{item.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Support Guidance */}
      <div className="rounded-2xl bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Responsive Customer Service</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Dedicated Local Contact Channels</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Office Hours: <strong>{csInfo.officeHours}</strong>. Reach our Lekki, Lagos desk anytime via email or our labeled telephone lines.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 font-semibold">{csInfo.whatsappLabel || 'WhatsApp'}</div>
            <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>{branding?.whatsapp_number || '09155104724'}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 font-semibold">{csInfo.businessLabel || 'Business / Upline Contact'}</div>
            <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
              <span>{branding?.business_phone || '08147837664'}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 font-semibold">{csInfo.officeLabel || 'Customer Service / Office'}</div>
            <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{branding?.support_phone || '09127469686'}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 font-semibold">Support Email</div>
            <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="truncate">{branding?.support_email || 'support@hambaktech.com.ng'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onOpenAuth('register')}
          className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-2"
        >
          <span>Create Free Account</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('services')}
          className="px-6 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
        >
          View Services Catalog
        </button>
      </div>
    </div>
  );
};
