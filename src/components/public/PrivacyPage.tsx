/**
 * @file PrivacyPage.tsx
 * Privacy Policy page for HambakTech Enterprise.
 * Complies with the Nigeria Data Protection Act (NDPA) and NDPR standards for biometric and financial data handling.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { Lock, ShieldCheck, Eye, Database } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HambakTech Enterprise';

  return (
    <div className="space-y-10 py-4 max-w-4xl">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>Data Protection &amp; Confidentiality</span>
          <span className="text-slate-600">&bull;</span>
          <span>NDPA 2023 Compliant</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Privacy Policy &amp; Data Safeguards
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          {companyName} is committed to protecting your personal data, biometric query privacy, and financial transaction records in accordance with the Nigeria Data Protection Act (NDPA 2023).
        </p>
      </div>

      <div className="space-y-8 text-xs sm:text-sm text-slate-300 leading-relaxed">
        {/* Section 1 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Database className="w-4 h-4" />
            <span>Information We Collect</span>
          </div>
          <h2 className="text-base font-bold text-white">1. Data Categories Collected</h2>
          <p>
            When utilizing our platform, we collect information required to execute KYC verification, telecom vending, and wallet billing:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-400 text-xs">
            <li><strong>Account Profile:</strong> Full legal name, verified email address, Nigerian telephone number, and hashed authentication credentials.</li>
            <li><strong>Identity Verification Records:</strong> Search queries containing 11-digit National Identification Numbers (NIN) or Bank Verification Numbers (BVN), and the returned verification slips.</li>
            <li><strong>Telecommunications Records:</strong> Recipient mobile MSISDNs, purchased data bundle volumes, network carrier, and delivery receipts.</li>
            <li><strong>Financial &amp; Transactional Data:</strong> Flutterwave gateway references, virtual account transfer deposits, ledger credit/debit histories.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>Sovereign Biometric Data Safeguards</span>
          </div>
          <h2 className="text-base font-bold text-white">2. NIMC &amp; Central Bank BVN Processing Standards</h2>
          <p>
            Biometric images, fingerprints, and sensitive sovereign identity records retrieved via authorized sovereign identity interfaces are encrypted in transit using TLS 1.3 encryption. We do not store raw unencrypted biometric templates. Verification records generated for slip printing are retained strictly for the user's documented audit trail and downloadable slip reproduction.
          </p>
        </section>

        {/* Section 3 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Information Sharing</span>
          </div>
          <h2 className="text-base font-bold text-white">3. Third-Party Disclosures &amp; Carrier Intermediaries</h2>
          <p>
            We only transmit data to licensed downstream infrastructure providers necessary to fulfill your requested transactions:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-400 text-xs">
            <li><strong>Verification Gateways:</strong> Authorized identity resolution pipes for sovereign compliance.</li>
            <li><strong>Telecom Operators:</strong> Licensed telecommunication carriers for automated airtime and data allocation.</li>
            <li><strong>Payment Gateways:</strong> Licensed payment processors and central settlement banks for account clearing.</li>
          </ul>
          <p className="pt-1">
            We never sell, rent, or monetize your contact information or query logs to marketing third parties.
          </p>
        </section>

        {/* Section 4 */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Eye className="w-4 h-4" />
            <span>Data Subject Rights</span>
          </div>
          <h2 className="text-base font-bold text-white">4. Your Rights Under the NDPA</h2>
          <p>
            As a data subject under Nigerian law, you possess the right to request access to your personal information, request rectification of inaccurate profile records, request deletion of non-statutory records, and lodge complaints with the Nigeria Data Protection Commission (NDPC).
          </p>
          <p className="text-slate-400 text-xs">
            To exercise your privacy rights, email our Data Protection Officer at: <a href={`mailto:${branding?.support_email || 'support@hambaktech.com.ng'}`} className="text-emerald-400 hover:underline">{branding?.support_email || 'support@hambaktech.com.ng'}</a>.
          </p>
        </section>
      </div>
    </div>
  );
};
