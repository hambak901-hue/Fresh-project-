/**
 * @file ServicesPage.tsx
 * Services catalog page for HambakTech Enterprise.
 * Showcases NIN/BVN verification, wholesale telecoms, utility bills, developer API, and Academy.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import {
  ShieldCheck,
  Smartphone,
  Zap,
  CreditCard,
  Code,
  GraduationCap,
  Tv,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface ServicesPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { rates } = useCms();

  const services = [
    {
      id: 'nin-bvn',
      category: 'Identity Verification',
      title: 'NIN & BVN Biometric Verification',
      description:
        'Sovereign identity verification via HambakTech accredited gateway. Query official NIMC biodata, generate verifiable NIN standard slips, premium PVC plastic formats, and validate Central Bank BVN biometrics.',
      features: [
        'Instant NIMC certified slip with dynamic QR code',
        'High-resolution sovereign biodata & photograph',
        'Phone number to NIN query reverse search',
        'Corporate CAC business registration lookup',
      ],
      pricing: `Standard Slip: ₦${rates?.nin_fee || 250} &bull; BVN: ₦${rates?.bvn_fee || 350}`,
      icon: ShieldCheck,
      color: 'emerald',
    },
    {
      id: 'telecom-data',
      category: 'Telecommunications',
      title: 'Wholesale SME & Corporate Data Bundles',
      description:
        'Direct automated vending for Nigerian mobile networks. Dispatched via high-speed telecommunication bridges with 99.98% delivery success rate.',
      features: [
        `MTN SME 1GB starting from ₦${rates?.mtn_sme_1gb || 270}`,
        `Airtel Corporate Gifting from ₦${rates?.airtel_1gb || 290}/GB`,
        `Glo SME Data packages from ₦${rates?.glo_1gb || 260}/GB`,
        'Instant sub-3s delivery with automatic retry',
      ],
      pricing: `From ₦${rates?.nine_mobile_1gb || 250}/GB (Wholesale pricing)`,
      icon: Smartphone,
      color: 'sky',
    },
    {
      id: 'airtime-vtu',
      category: 'VTU Services',
      title: 'Discounted Airtime & Bills Payment',
      description:
        'Automated VTU top-up across all Nigerian networks with an instant 2.5% cashback discount. Clear DSTV, GOtv, Startimes subscriptions, and generate prepaid electricity tokens instantly.',
      features: [
        `${rates?.airtime_discount_percent || 2.5}% cashback discount on all airtime recharges`,
        'Instant DSTV, GOtv, and Startimes smartcard renewal',
        'PHCN prepaid meter tokens (IKEDC, EKEDC, AEDC, IBEDC)',
        'Automated transaction reference and SMS alert',
      ],
      pricing: `${rates?.airtime_discount_percent || 2.5}% Instant Airtime Cashback`,
      icon: Zap,
      color: 'amber',
    },
    {
      id: 'developer-api',
      category: 'Integration',
      title: 'Developer REST API & Webhooks',
      description:
        'Plug HambakTech capabilities into your own web applications, mobile apps, or enterprise systems. Comprehensive REST documentation, API keys, sandbox simulator, and realtime webhooks.',
      features: [
        'Authenticated Bearer Token headers & IP whitelisting',
        'Synchronous JSON responses with execution latency < 1.2s',
        'Idempotent request keys preventing double billing',
        'Comprehensive Postman & OpenAPI specifications',
      ],
      pricing: 'Free Developer Access with Active Wallet',
      icon: Code,
      color: 'purple',
    },
    {
      id: 'hambak-academy',
      category: 'Education & Training',
      title: 'Hambak Academy Fintech Engineering',
      description:
        'Practical certifications and training modules designed by Nigerian fintech engineers. Master telecom API integration, secure wallet ledger architecture, and VTU reseller marketing.',
      features: [
        'Hands-on cloud & web server deployment tutorials',
        'Building sovereign identity verification apps',
        'Wholesale telecom business operational models',
        'Verified certificate of completion upon graduation',
      ],
      pricing: 'Self-Paced & Cohort Courses Available',
      icon: GraduationCap,
      color: 'teal',
    },
    {
      id: 'wallet-payments',
      category: 'Payment Infrastructure',
      title: 'Unified Digital Wallet & Virtual Accounts',
      description:
        'High-speed wallet funding via automated card checkout or dedicated virtual bank accounts with zero-delay auto-credit.',
      features: [
        'Instant card funding via 256-bit encrypted gateway',
        'Permanent dedicated Nigerian virtual bank accounts',
        'Immutable double-entry ledger with transparent audit logs',
        'Downloadable PDF and CSV transaction statements',
      ],
      pricing: 'Zero Hidden Fees &bull; Instant Auto-Credit',
      icon: CreditCard,
      color: 'blue',
    },
  ];

  return (
    <div className="space-y-16 py-4">
      {/* Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>Enterprise Catalog</span>
          <span className="text-slate-600">&bull;</span>
          <span>Verified Redundant Rails</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Comprehensive Telecom, Identity &amp; Digital Solutions
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          Explore our end-to-end services built for Nigerian businesses, agents, software developers, and retail customers. Every service operates with high-throughput redundancy and guaranteed uptime.
        </p>
      </div>

      {/* Visual Showcase Banner */}
      <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 grid grid-cols-1 md:grid-cols-12 items-center">
        <div className="md:col-span-7 p-6 sm:p-10 space-y-4">
          <span className="text-xs font-semibold text-emerald-400">Next-Generation Processing</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Cryptographic Biometric Verification &amp; 5G Telecom Routing
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Our proprietary integration layer interfaces directly with sovereign databases to process National Identification Numbers, Bank Verification Numbers, and telecom bundles in sub-second intervals.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={() => onOpenAuth('register')}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
            >
              Get Started Free
            </button>
            <button
              onClick={() => onNavigate('rates')}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
            >
              Check Live Rates
            </button>
          </div>
        </div>
        <div className="md:col-span-5 h-64 md:h-full min-h-[260px] relative">
          <img
            src="/assets/images/services_identity_telecom_1794097383404.jpg"
            alt="Cryptographic identity and mobile telecom concept"
            className="w-full h-full object-cover object-center"
            onError={e => {
              (e.target as HTMLImageElement).src = '/assets/aistudio/IMG_0484_0fb633df.png';
            }}
          />
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {services.map(svc => {
          const Icon = svc.icon;
          return (
            <div
              key={svc.id}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-5 flex flex-col justify-between hover:border-slate-700 transition-colors"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    {svc.category}
                  </span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">{svc.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{svc.description}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  {svc.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4">
                <div
                  className="text-xs font-mono font-bold text-emerald-400"
                  dangerouslySetInnerHTML={{ __html: svc.pricing }}
                />
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <span>Access</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 text-center space-y-4">
        <h3 className="text-xl font-bold text-white">Need a Custom API Volume or Partnership?</h3>
        <p className="text-xs text-slate-400 max-w-lg mx-auto">
          We offer bespoke volume pricing for fintech startups, banking applications, and telecom resellers processing high transaction counts.
        </p>
        <button
          onClick={() => onNavigate('contact')}
          className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
        >
          Contact Business Development
        </button>
      </div>
    </div>
  );
};
