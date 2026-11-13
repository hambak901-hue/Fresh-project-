/**
 * @file ServicesPage.tsx
 * Customer-focused digital services catalog for HAMBAK TECH & SERVICES.
 * Zero unverified uptime claims or internal backend technical names.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import {
  ShieldCheck,
  Smartphone,
  Zap,
  CreditCard,
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';

interface ServicesPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { rates, branding } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';

  const services = [
    {
      id: 'nin-bvn',
      category: 'Identity Verification',
      title: 'NIN & BVN Verification Services',
      description:
        'Consent-based identity lookup and verification slip generation for authorized agents, businesses, and individual compliance checks.',
      features: [
        'Downloadable Standard & Premium NIN slip formats with QR verification',
        'Phone-to-NIN lookup and demographic confirmation',
        'Bank Verification Number (BVN) verification reports',
        'Audited verification history inside your account portal',
      ],
      pricing: `Standard NIN: ₦${rates?.nin_fee || 250} &bull; BVN: ₦${rates?.bvn_fee || 350}`,
      icon: ShieldCheck,
    },
    {
      id: 'telecom-data',
      category: 'Telecommunications',
      title: 'Mobile Data & SME Bundles',
      description:
        'Fast, automated data bundle delivery across MTN, Airtel, Glo, and 9mobile networks at transparent customer and agent rates.',
      features: [
        `MTN SME 1GB from ₦${rates?.mtn_sme_1gb || 270}`,
        `Airtel 1GB from ₦${rates?.airtel_1gb || 290}`,
        `Glo 1GB from ₦${rates?.glo_1gb || 260}`,
        'Instant order tracking and automatic refund handling on failed requests',
      ],
      pricing: `From ₦${rates?.nine_mobile_1gb || 250}/GB`,
      icon: Smartphone,
    },
    {
      id: 'airtime-vtu',
      category: 'VTU & Utilities',
      title: 'Airtime, Cable TV & Electricity Bills',
      description:
        'Convenient bill payments covering airtime top-ups, DSTV, GOtv, and Startimes subscriptions, plus prepaid and postpaid electricity tokens.',
      features: [
        `${rates?.airtime_discount_percent || 2.5}% discount on eligible airtime recharges`,
        'Smartcard verification before cable TV subscription renewal',
        'Electricity meter verification and instant token display',
        'Printable order receipts for every bill payment',
      ],
      pricing: `${rates?.airtime_discount_percent || 2.5}% Airtime Discount`,
      icon: Zap,
    },
    {
      id: 'wallet-payments',
      category: 'Naira Wallet',
      title: 'Digital Wallet & Statement Tracking',
      description:
        'Manage all service payments from a unified Nigerian Naira (NGN) wallet with transparent ledger entries.',
      features: [
        'Secure online card & bank payment funding in NGN',
        'Manual bank transfer proof submission with admin verification',
        'Transaction history & balance breakdown for every debit and credit',
        'Transaction PIN security controls',
      ],
      pricing: 'Nigerian Naira (₦) Wallet',
      icon: CreditCard,
    },
    {
      id: 'hambak-academy',
      category: 'Digital Training Academy',
      title: 'HAMBAK TECH & SERVICES Digital Training Academy',
      description:
        '12 hands-on ICT courses in Graphics Design, Computer Repairs, MS Office, Web & App Development, Python, SQL, and Software Engineering.',
      features: [
        'Online admission application with tracking reference',
        'Parent/guardian authorization built in for learners under 18',
        'Official QR-verified Student ID cards upon approval',
        'Physical training centre in Lekki LCDA and online options',
      ],
      pricing: 'Admin-Configured / Contact Academy',
      icon: GraduationCap,
      targetPage: 'academy',
    },
    {
      id: 'hardware-store',
      category: 'Agent Supplies',
      title: 'Hardware & Agent Equipment Desk',
      description:
        'Enquire about approved biometric readers, thermal receipt printers, and PVC card accessories stocked for registered agents.',
      features: [
        'Curated hardware catalog managed in the Customer Portal',
        'Guidance for physical office & agent station setup',
        'Direct coordination through our Business/Upline line (08147837664)',
      ],
      pricing: 'Inquire in Portal',
      icon: ShoppingBag,
    },
  ];

  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
          <span>{companyName}</span>
          <span className="text-slate-400">&bull;</span>
          <span>Service Catalog</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Digital Services, Utility Clearing &amp; ICT Training
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Explore our everyday digital services for Nigerian individuals, agents, and businesses alongside practical technical education at our Digital Training Academy.
        </p>
      </div>

      {/* Visual Showcase Banner */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-12 items-center shadow-sm">
        <div className="md:col-span-7 p-6 sm:p-10 space-y-4">
          <span className="text-xs font-semibold text-blue-700 dark:text-amber-400">
            Unified Customer Portal
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Manage Identity Checks, Telecom Bundles &amp; Utility Bills in One Place
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Fund your Nigerian Naira wallet once and access all supported services with clear pricing, instant order references, and responsive local support.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-sm"
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => onNavigate('rates')}
              className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition"
            >
              Calculate Service Rates
            </button>
          </div>
        </div>
        <div className="md:col-span-5 h-64 md:h-full min-h-[260px] relative">
          <img
            src="/assets/images/services_identity_telecom_1794097383404.jpg"
            alt="HAMBAK TECH & SERVICES Digital Catalog"
            className="w-full h-full object-cover object-center"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/logo.png';
            }}
          />
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {services.map((svc) => {
          const Icon = svc.icon;
          return (
            <div
              key={svc.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5 flex flex-col justify-between shadow-sm hover:border-blue-400 dark:hover:border-slate-700 transition-colors"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-slate-950 border border-blue-200 dark:border-slate-800 text-blue-700 dark:text-blue-400 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    {svc.category}
                  </span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{svc.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {svc.description}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  {svc.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4">
                <div
                  className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400"
                  dangerouslySetInnerHTML={{ __html: svc.pricing }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (svc.targetPage) {
                      onNavigate(svc.targetPage);
                    } else {
                      onOpenAuth('register');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <span>{svc.targetPage ? 'Open Academy' : 'Get Started'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          Need Guidance Choosing a Service or Course?
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
          Speak directly with our Customer Service Desk (09127469686), Business/Upline line (08147837664), or WhatsApp Desk (09155104724).
        </p>
        <button
          type="button"
          onClick={() => onNavigate('contact')}
          className="px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition"
        >
          Contact Support Desk
        </button>
      </div>
    </div>
  );
};
