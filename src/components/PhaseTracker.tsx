/**
 * @file PhaseTracker.tsx
 * Strictly monitors the 10 development phases of Project X.
 * Enforces rule: "AI Studio must not jump from one phase to another. Each phase must be completed, checked, and preserved before proceeding to the next."
 */

import React, { useState } from 'react';
import { CheckCircle2, Clock, ShieldCheck, ChevronRight, AlertCircle, FileCheck, Server, ArrowRight } from 'lucide-react';
import { PhaseInfo } from '../types';

export const PHASES: PhaseInfo[] = [
  {
    number: '01',
    title: 'Project Foundation and Architecture',
    description: 'Project structure, database, backend, authentication foundation, and credentials vault.',
    status: 'completed',
    deliverables: [
      'Encrypted server credentials vault for all uploaded API keys & SMTP/SFTP info',
      'Full-stack Express + Vite application runtime on port 3000',
      'Thread-safe database and wallet ledger engine with audit logging',
      'Session token authentication (Register, Login, Role Authorization, Quick Switch)',
      'Provider diagnostic endpoints (2SureVerify, Veripine, UlamaData, VTpass, Flutterwave)',
      'TrueHost LON110 SMTP email integration & connectivity tester',
      'cPanel SFTP deployment target configuration (LON110 @ 51.89.153.183:1624)',
    ],
  },
  {
    number: '02',
    title: 'Public Website and Branding',
    description: 'Landing page, registration, login, hero banners, service showcases, testimonials, CMS.',
    status: 'pending',
    deliverables: [
      'Modern fintech landing page for HambakTech',
      'Brand showcase with trust badges, services grid, and live rate calculators',
      'Customer Registration & Sign-in modal/pages with instant validation',
      'Dynamic CMS content sections for announcements and promos',
    ],
  },
  {
    number: '03',
    title: 'Customer Dashboard',
    description: 'Navigation, profiles, settings, notifications, KYC tier upgrading.',
    status: 'pending',
    deliverables: [
      'Customer portal shell with responsive sidebar & mobile drawer',
      'Wallet balance glance card with quick actions',
      'Tier 1/2/3 KYC verification submission & document management',
      'Real-time notifications center and security settings',
    ],
  },
  {
    number: '04',
    title: 'Super Admin Dashboard',
    description: 'Global administration and complete management interfaces.',
    status: 'pending',
    deliverables: [
      'Executive analytics: total revenue, active users, daily transactions, API uptime',
      'User management table: view, credit/debit, suspend, upgrade KYC',
      'System fee configuration: set prices for NIN, BVN, SME data bundles',
      'Provider gateway toggles (2SureVerify vs Veripine, UlamaData vs VTpass)',
    ],
  },
  {
    number: '05',
    title: 'NIN and BVN Integration',
    description: '2SureVerify, service catalogue, verification slips, and other identity services.',
    status: 'pending',
    deliverables: [
      'Instant NIN Slip generator with official layout and photo',
      'NIN by Phone Number and Tracking ID lookup',
      'Central Bank of Nigeria BVN biometric validation',
      'CAC registration search & PDF verification slip export',
    ],
  },
  {
    number: '06',
    title: 'Telecommunications Integration',
    description: 'Ulamadata and all documented telecom services (Data, Airtime, Cable, Bills).',
    status: 'pending',
    deliverables: [
      'MTN SME & Corporate Gifting data vending with instant balance auto-check',
      'Airtel, Glo, and 9mobile corporate data dispatching',
      'Discounted airtime top-up engine with phone number network auto-detector',
      'Cable TV (DSTV, GOtv, Startimes) and Electricity prepaid tokens',
    ],
  },
  {
    number: '07',
    title: 'Wallet and Payment System',
    description: 'Paystack, manual funding, wallet ledger, Flutterwave-ready architecture.',
    status: 'pending',
    deliverables: [
      'Flutterwave inline payment checkout with automatic webhook credit',
      'Dedicated virtual accounts & manual bank transfer funding workflow',
      'Ledger balance history with downloadable transaction receipts',
      'Referral commission and bonus wallet payout engine',
    ],
  },
  {
    number: '08',
    title: 'Additional Modules and Communications',
    description: 'Digital services, Store, Academy, Reports, SMTP, SMS.',
    status: 'pending',
    deliverables: [
      'HambakTech Academy courses catalogue and enrollment module',
      'Digital goods store (software, keys, certificates)',
      'Automated SMTP transactional emails via lon110.truehost.cloud',
      'Bulk SMS notifications engine for marketing campaigns',
    ],
  },
  {
    number: '09',
    title: 'Complete System Integration and Testing',
    description: 'Security hardening, transaction stress testing, provider testing, bug fixing.',
    status: 'pending',
    deliverables: [
      'End-to-end simulated transaction audit across all gateways',
      'XSS, CSRF, and SQL-injection mitigation audit',
      'Rate limiting and idempotent payment validation',
      'Cross-browser and mobile responsive testing',
    ],
  },
  {
    number: '10',
    title: 'Production Preparation and cPanel Deployment',
    description: 'Build, database migration, deployment package, FTP deployment and verification.',
    status: 'pending',
    deliverables: [
      'Production Vite build optimization and bundle minification',
      'cPanel Node.js Application Manager configuration files (.htaccess, server.js)',
      'MySQL database schema migration script for cPanel PHPMyAdmin',
      'Direct SFTP deployment automation using uploaded 51.89.153.183:1624 credentials',
    ],
  },
];

interface PhaseTrackerProps {
  currentPhaseNumber: string;
  onSelectPhase: (phaseNumber: string) => void;
}

export const PhaseTracker: React.FC<PhaseTrackerProps> = ({ currentPhaseNumber, onSelectPhase }) => {
  const [expandedPhase, setExpandedPhase] = useState<string>(currentPhaseNumber);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              10-Phase Waterfall Masterplan
            </span>
            <span className="text-xs text-slate-400 font-mono">Strict Step-by-Step Rule Enforced</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">Project X &bull; Roadmap Execution Tracker</h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/50 px-3 py-1.5 rounded-lg border border-emerald-800/40">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-semibold">Phase 01 Completed</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-300 bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-800/40">
            <Clock className="w-4 h-4" />
            <span>9 Phases In Pipeline</span>
          </div>
        </div>
      </div>

      {/* Horizontal Phase Sequence Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 my-4">
        {PHASES.map(phase => {
          const isCurrent = phase.number === currentPhaseNumber;
          const isDone = phase.status === 'completed';

          return (
            <button
              key={phase.number}
              onClick={() => {
                setExpandedPhase(phase.number);
                onSelectPhase(phase.number);
              }}
              className={`p-2.5 rounded-xl text-left border transition-all text-xs relative group ${
                isCurrent
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-500/30'
                  : isDone
                  ? 'bg-slate-800/80 text-emerald-300 border-emerald-500/30 hover:bg-slate-800'
                  : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between font-mono font-bold text-[11px] mb-1">
                <span>Phase {phase.number}</span>
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-700 group-hover:bg-amber-400/80 transition-colors" />
                )}
              </div>
              <p className="truncate font-medium text-[11px] leading-tight">
                {phase.title.split(' ')[0]} {phase.title.split(' ')[1] || ''}
              </p>
            </button>
          );
        })}
      </div>

      {/* Detailed Selected Phase Card */}
      {(() => {
        const active = PHASES.find(p => p.number === expandedPhase) || PHASES[0];
        const isDone = active.status === 'completed';

        return (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 mt-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-base shrink-0 ${
                    isDone ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {active.number}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{active.title}</h3>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      }`}
                    >
                      {isDone ? 'Active & Verified' : 'Queued for Sequential Execution'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{active.description}</p>
                </div>
              </div>

              {active.number === '01' ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/30">
                  <ShieldCheck className="w-4 h-4" />
                  Credentials & Architecture Secured
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Awaiting Phase {parseInt(active.number) - 1} signoff
                </div>
              )}
            </div>

            <div className="mt-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                Phase {active.number} Scope & Deliverables
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {active.deliverables.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${
                      isDone
                        ? 'bg-emerald-950/20 border-emerald-900/30 text-slate-200'
                        : 'bg-slate-900/50 border-slate-800/60 text-slate-400'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isDone ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
