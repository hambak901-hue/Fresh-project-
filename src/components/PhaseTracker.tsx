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
    description: 'Complete public website with 10 pages, CMS management, dynamic branding, rates engine, and auth entry points.',
    status: 'completed',
    deliverables: [
      '10 Public Pages: Home, About, Services, Contact, Register, Login, Privacy, Terms, FAQ, Announcements',
      'Configurable Hero section, company intro, bento services, how it works, benefits, CTAs',
      'Dynamic Branding: Company name, logo, favicon, colors, typography, contact & social links, SEO',
      'Admin CMS Studio: live editing of content, banners, headings, nav menus, announcements, FAQs & visibility',
      'Live Rates & Pricing Calculator with realtime carrier and NIMC verification fees',
      'Fully responsive, mobile-first design with accessible forms and proper error/loading states',
    ],
  },
  {
    number: '03',
    title: 'Customer Dashboard Development',
    description: 'Complete 14-page customer portal, real-time metrics, transaction PIN, KYC compliance, wallet funding, and utility vending.',
    status: 'completed',
    deliverables: [
      '14 Customer Pages: Overview, NIN Services, Telecom, Wallet, Store, Digital Services, Academy, Reports, Transactions, Orders, Notifications, Profile, Settings, Support',
      'Live metrics: balance, total/success/pending/failed transactions, recent activity feed & recent orders',
      'Customer Account & Profile: full biodata editing, avatar selection/upload, referral tracking, account status',
      'Security: 4-digit transaction PIN setup/update with real-time verification before sensitive actions',
      'KYC Portal: Tier 1/2/3 compliance document upload (NIN, BVN, PVC, Passport) with review tracking',
      'Wallet Hub: Available balance, Moniepoint virtual account, manual payment proof upload, statement generator',
      'Digital Services & Telecom: SME Data (MTN @ ₦270), VTU airtime (2.5% discount), Cable TV renewal & 20-digit electricity prepaid tokens',
      'Coming Soon Modules: Dedicated pages with waitlist subscriptions for Store, Academy, and Reports',
    ],
  },
  {
    number: '04',
    title: 'Super Admin Dashboard and Global Management',
    description: 'Global administration and complete management interfaces with real database metrics, customer controls, and CMS.',
    status: 'completed',
    deliverables: [
      'Admin Overview: Real database metrics for customers, wallet floats, sales, provider expenditure, and live gateway status',
      'Customer Management: Full registry search, profile editing, account suspension, manual wallet adjustments, and KYC review',
      'Website Management (CMS): Global branding, colors, hero banners, page visibility toggles, announcements, and FAQs',
      'Dashboard Management: Customer portal module control (active/coming soon/disabled), icons, and navigation visibility',
      'Staff & Permissions: Role-based access control (RBAC), staff account creation, granular scopes, and root protection',
      'Service Management: Dedicated admin suites for NIN/BVN tariffs, telecom rates, Store catalog, and Academy courses',
      'Manual Funding Approvals: Compliance settlement desk for reviewing and approving bank transfer proofs',
      'Audit Logs: Immutable system activity journal tracking price changes, wallet adjustments, and staff operations',
    ],
  },
  {
    number: '05',
    title: 'Complete NIN and BVN Integration',
    description: '2SureVerify primary provider adapter, 42 official identity services, 16 NIN modifications, high-res slips, wholesale pricing matrix, and audit logging.',
    status: 'completed',
    deliverables: [
      'Provider Architecture: 2SureVerify primary adapter (X-Api-Key) & Veripine failover with live roundtrip latency testing and request audit logs',
      'NIN Verification Suite: NIN V1, NIN V2, NIN V3, Phone V1/V2/V3, Demo V1/V2/V3, and Virtual NIN (VNIN) lookup',
      'BVN Verification Suite: BVN V1, BVN V2, BVN V3, BVN Retrieval by Phone, and bank-specific workflows with dynamic bank selectors',
      'All 16 NIN Modifications: Name, Phone, Address, DOB, Name & DOB, Gender, Suspended, BVN Generated, Over-Age, Child, 2nd NIN without/with auth, and BVN Mod',
      'Enrolment & Personalisation: Adult Enrolment, Child Enrolment, Personalisation 1 & 2 with upstream parameters and tracking IDs',
      'Additional Services: NPC Attestation, Newspaper Publication, CAC Business & Company, TIN Registration, NIN Validation, IPE Clearance, Delinking',
      'Wholesale & Reseller Pricing Desk: Live 2SureVerify wholesale sync, admin margin controls, hidden wholesale costs from public endpoints',
      'Digital Verification Slips: High-resolution NIMC & CBN slip renderer with official coat of arms, QR code, citizen photo, and print/download',
      'Transaction Safety: Customer wallet balance pre-check, duplicate prevention, automatic refund upon upstream rejection, and mandatory NDPR consent',
    ],
  },
  {
    number: '06',
    title: 'Telecommunications Integration',
    description: 'Ulamadata primary provider adapter, dynamic data catalogue, airtime with discount, printable PIN vouchers, airtime swap, cable TV, electricity tokens, exam scratch cards, and bulk SMS.',
    status: 'completed',
    deliverables: [
      'Provider Architecture: Ulamadata primary adapter (Token 7aOkA4OzIF...) with VTpass failover and live wallet balance tracking',
      'Dynamic Data Bundles: MTN, Airtel, Glo, 9mobile SME, Corporate Gifting, Gifting & Direct with real-time catalogue retrieval',
      'Discounted VTU Airtime: Instant carrier top-up across all 4 networks with 2.5% automated cash discount and ported line routing',
      'Airtime PIN Generator: Printable recharge cards with serial number, PIN, carrier USSD recharge code, and business branding',
      'Data PIN Generator: Printable data vouchers for SME and direct data packages ready for retail printing',
      'Airtime Swap (Airtime to Cash): 80% automated cashout with merchant line routing, carrier USSD codes, and direct wallet payout',
      'Cable TV Subscriptions: DSTV, GOtv, Startimes, Showmax with real-time smartcard IUC account validation and bouquet renewal',
      'Electricity Bill Payment: IKEDC, EKEDC, AEDC, IBEDC, KEDCO, PHED, JED, KAEDCO, BEDC, EEDC with meter verification & 20-digit STS tokens',
      'Exam Scratch Cards: WAEC Result Checker PIN, NECO Token, NABTEB PIN, JAMB UTME with instant serial and token delivery',
      'Bulk SMS Gateway: Custom 11-char Sender ID, multi-recipient parsing, real-time character/page counter, and corporate DND bypass',
      'Webhook & Idempotency: Protected Ulamadata webhook endpoint with signature verification, duplicate event defense, and auto-refund',
    ],
  },
  {
    number: '07',
    title: 'Wallet and Payment System',
    description: 'Paystack online gateway, immutable ledger with atomic balance locks, manual bank funding settlement desk, administrative wallet controls, and Flutterwave Coming Soon adapter.',
    status: 'completed',
    deliverables: [
      'Individual Customer Wallets: Atomic balance locks, credits, debits, funding history, and filterable account statements',
      'Immutable Wallet Ledger: Double-entry accounting where balance changes require ledger entries, preventing negative balances',
      'Paystack Online Gateway: Initialization, checkout authorization, server-side verification, and HMAC SHA512 webhook signature verification',
      'Anti-Double Spending: Strict verification preventing crediting based solely on returning users and idempotent webhook callbacks',
      'Manual Wallet Funding: Customer proof submission with bank selection, reference tracking, and remarks',
      'Admin Funding Approvals: Compliance settlement desk with customer details, receipt inspection, idempotent approval, and rejection reasons',
      'Admin Wallet Controls: Direct manual credit and debit with mandatory audit justification and admin identity tracking',
      'Flutterwave Coming Soon Adapter: Modular architecture prepared and staged as Coming Soon until live certification',
      'Financial Administration: Real-time reports for customer float, funding breakdown, service sales, provider expenditure, and gross profit',
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
