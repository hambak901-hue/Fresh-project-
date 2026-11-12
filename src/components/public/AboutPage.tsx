/**
 * @file AboutPage.tsx
 * About Us page for HambakTech Enterprise.
 * Details company story, mission, core values, reliability architecture, and security compliance.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { ShieldCheck, Server, Globe, Cpu, Users, Award, CheckCircle2, ArrowRight, Lock, Zap } from 'lucide-react';

interface AboutPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HambakTech Enterprise';

  return (
    <div className="space-y-16 py-4">
      {/* Header Banner */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>About Our Enterprise</span>
          <span className="text-slate-600">&bull;</span>
          <span>Next-Generation Digital Services</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Empowering Nigerian Businesses with Reliable Digital Services
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          HambakTech Enterprise was founded to simplify and accelerate access to essential digital services across Nigeria. We provide seamless integration pathways for identity validation, wholesale telecommunication data, bill settlement, and digital commerce.
        </p>
      </div>

      {/* Hero Visual Section */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
        <img
          src="/assets/images/about_team_office_1794097382819.jpg"
          alt="HambakTech Enterprise Operations"
          className="w-full h-80 sm:h-96 object-cover object-center"
          onError={e => {
            (e.target as HTMLImageElement).src = '/assets/aistudio/IMG_0485_9e5b9616.png';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent"></div>
        <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400">Operations: </span>
            <span className="text-white font-bold">Lagos &bull; Nationwide Digital Edge</span>
          </div>
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60 font-mono text-emerald-400">
            256-Bit SSL Encrypted Rails
          </div>
        </div>
      </div>

      {/* Mission, Vision, and Values */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Our Mission</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            To deliver affordable, high-speed telecom packages, instant identity verification, and dependable financial technology tools to merchants, developers, and businesses across Nigeria.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Automated Delivery</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Our automated dispatch engine connects directly with telecom operators and verification registries, guaranteeing sub-second processing and real-time status reporting.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Compliance &amp; Trust</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Strict adherence to the Nigeria Data Protection Act (NDPA), certified document generation formats, and bank-grade data security protocols.
          </p>
        </div>
      </div>

      {/* Enterprise Reliability & Pillars */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 space-y-6">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-emerald-400">Platform Reliability</span>
          <h2 className="text-2xl font-bold text-white">Engineered for High Availability</h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Designed for continuous operational uptime, instant transaction settlements, and transparent ledger reporting for agents and business clients.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">UPTIME SLA</div>
            <div className="text-slate-200 font-bold">99.9% Availability</div>
            <div className="text-emerald-400 text-[11px]">Continuous Monitoring</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">SECURITY ARCHITECTURE</div>
            <div className="text-slate-200 font-bold">256-Bit TLS Encryption</div>
            <div className="text-slate-400 text-[11px]">Immutable Audit Trail</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">DISPATCH SPEED</div>
            <div className="text-slate-200 font-bold">Sub-3 Second Vending</div>
            <div className="text-slate-400 text-[11px]">Automated Carrier Links</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">CUSTOMER SUPPORT</div>
            <div className="text-white font-bold">24/7 Dedicated Desk</div>
            <div className="text-emerald-400 text-[11px]">Rapid Issue Resolution</div>
          </div>
        </div>
      </div>

      {/* Call to action */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center space-y-4">
        <h3 className="text-xl font-bold text-white">Experience HambakTech Firsthand</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Create an account in 60 seconds to access wholesale rates, instant NIN slips, and developer APIs.
        </p>
        <button
          onClick={() => onOpenAuth('register')}
          className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
        >
          Create Free Account
        </button>
      </div>
    </div>
  );
};
