/**
 * @file AboutPage.tsx
 * About Us page for HambakTech Enterprise.
 * Details company story, mission, TrueHost LON110 infrastructure, leadership, and compliance.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { ShieldCheck, Server, Globe, Cpu, Users, Award, CheckCircle2, ArrowRight } from 'lucide-react';

interface AboutPageProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, cmsSections } = useCms();
  const companyName = branding?.company_name || 'HambakTech Enterprise';

  return (
    <div className="space-y-16 py-4">
      {/* Header Banner */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>About Our Enterprise</span>
          <span className="text-slate-600">&bull;</span>
          <span>TrueHost LON110 High-Availability Node</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Building Sovereign Digital Infrastructure for Nigeria
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          HambakTech Enterprise was established to eliminate technical barriers in Nigerian digital services. We bridge telecom operators, sovereign identity repositories, and payment networks through unified, sub-second API pipelines.
        </p>
      </div>

      {/* Hero Visual Section */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
        <img
          src="/src/assets/images/about_team_office_1794097382819.jpg"
          alt="HambakTech Enterprise Engineering Hub in Lagos"
          className="w-full h-80 sm:h-96 object-cover object-center"
          onError={e => {
            (e.target as HTMLImageElement).src = '/public/assets/aistudio/IMG_0485_9e5b9616.png';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent"></div>
        <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400">Operations Hub: </span>
            <span className="text-white font-bold">Lagos &bull; London Tier-3 Node</span>
          </div>
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60 font-mono text-emerald-400">
            LON110 Server: 51.89.153.183:1624
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
            To provide the most resilient, cost-effective, and rapid telecom and identity validation rails for Nigerian merchants, developers, and institutions.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Our Technology</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Direct socket pipelines into sovereign telecommunication databases, decoupled adapters with automatic failover, and zero-compromise encryption.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">Compliance &amp; Trust</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Strict adherence to the Nigeria Data Protection Act (NDPA), NIMC accredited identity rendering standards, and NIBSS security requirements.
          </p>
        </div>
      </div>

      {/* Technological Architecture Breakdown */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 space-y-6">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-emerald-400">Enterprise Hosting</span>
          <h2 className="text-2xl font-bold text-white">TrueHost LON110 Infrastructure</h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Our portal runs on high-speed hardware provisioned in TrueHost's premier London Tier-3 cloud facility, ensuring ultra-low latency for Nigerian data networks.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">HOST / IP</div>
            <div className="text-slate-200 font-mono font-bold">lon110.truehost.cloud</div>
            <div className="text-emerald-400 font-mono text-[11px]">51.89.153.183</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">SFTP SECURE ACCESS</div>
            <div className="text-slate-200 font-bold">Port 1624 SSH/SFTP</div>
            <div className="text-slate-400 text-[11px]">Active Daemon</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">TRANSACTION ENGINE</div>
            <div className="text-slate-200 font-bold">PHP 8.2 &bull; Node.js 22</div>
            <div className="text-slate-400 text-[11px]">Dual-Engine Hybrid</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-slate-500 font-mono text-[10px]">TRANSACTION VOLUME</div>
            <div className="text-white font-mono font-bold">₦120,000,000+</div>
            <div className="text-emerald-400 text-[11px]">Monthly Cleared</div>
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
