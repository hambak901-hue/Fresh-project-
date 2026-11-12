/**
 * @file TermsPage.tsx
 * Terms and Conditions page for HambakTech Enterprise.
 * Covers user eligibility, wallet terms, NIMC/BVN verification covenants, telecom delivery SLAs, and refund policies.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { FileText, Shield, AlertCircle } from 'lucide-react';

export const TermsPage: React.FC = () => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HambakTech Enterprise';

  return (
    <div className="space-y-10 py-4 max-w-4xl">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>Legal &amp; Regulatory Agreement</span>
          <span className="text-slate-600">&bull;</span>
          <span>Effective: March 2026</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Terms and Conditions of Service
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Please review these Terms and Conditions carefully prior to registering an account or executing telecom, wallet, or sovereign verification transactions on the {companyName} platform.
        </p>
      </div>

      <div className="space-y-8 text-xs sm:text-sm text-slate-300 leading-relaxed">
        {/* Section 1 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <h2 className="text-base font-bold text-white">1. Acceptance of Terms &amp; Account Eligibility</h2>
          <p>
            By creating an account, accessing our portal, or integrating our REST API endpoints, you agree to be bound by these Terms and Conditions and all applicable Nigerian laws, including the Cybercrimes (Prohibition, Prevention, etc.) Act and Central Bank of Nigeria (CBN) regulations. You must be at least 18 years of age or an authorized legal representative of a registered business entity.
          </p>
        </section>

        {/* Section 2 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <h2 className="text-base font-bold text-white">2. Sovereign Identity Verification (NIN &amp; BVN) Covenants</h2>
          <p>
            {companyName} provides identity lookup services through accredited sovereign integration gateways. When conducting National Identification Number (NIN) or Bank Verification Number (BVN) queries:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-400 text-xs">
            <li>You must have obtained prior, verifiable, written or electronic consent from the data subject in compliance with the Nigeria Data Protection Act (NDPA).</li>
            <li>Verification queries may only be performed for lawful purposes, such as customer onboarding, fraud prevention, regulatory compliance, and identity authentication.</li>
            <li>Harvesting, scraping, reselling, or public dissemination of biometric photographs or sovereign biodata is strictly prohibited and constitutes grounds for immediate account termination and legal reporting.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <h2 className="text-base font-bold text-white">3. Telecommunication Services (Data &amp; Airtime) SLA</h2>
          <p>
            Telecom products (MTN SME, Airtel Corporate Gifting, Glo, 9mobile data, and VTU airtime) are dispatched electronically through carrier interfaces. While 99.8% of vending orders complete within 3 to 10 seconds, network delays caused by carrier upstream maintenance or unannounced carrier downtime are beyond our direct control. In the event of a carrier-confirmed delivery failure, your wallet will be refunded automatically.
          </p>
        </section>

        {/* Section 4 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <h2 className="text-base font-bold text-white">4. Wallet Accounting &amp; Fund Security</h2>
          <p>
            All wallet credits (via Flutterwave or dedicated Moniepoint virtual accounts) represent non-interest-bearing prepayments for services rendered on the platform. Balances are tracked via our double-entry immutable ledger. If an erroneous transaction or duplicate charge occurs, the user must notify support within 48 hours for auditing and reconciliation.
          </p>
        </section>

        {/* Section 5 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <h2 className="text-base font-bold text-white">5. Service Availability &amp; Maintenance</h2>
          <p>
            {companyName} utilizes high-availability cloud infrastructure designed for continuous uptime and sub-second execution. Routine system maintenance is announced via the official Announcements board in advance.
          </p>
        </section>

        {/* Section 6 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <h2 className="text-base font-bold text-white">6. Termination &amp; Account Suspension</h2>
          <p>
            We reserve the right to suspend or permanently terminate any account found engaging in fraudulent card top-ups, identity spoofing, unauthorized vulnerability scanning, or abuse of our telecom routing infrastructure.
          </p>
        </section>
      </div>
    </div>
  );
};
