/**
 * @file TermsPage.tsx
 * Official Terms and Conditions page for HAMBAK TECH & SERVICES (BN 9284726).
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';

export const TermsPage: React.FC = () => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const supportEmail = branding?.support_email || 'support@hambaktech.com.ng';

  return (
    <div className="space-y-10 py-4 max-w-4xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
          <span>{companyName}</span>
          <span className="text-slate-400">&bull;</span>
          <span>{regNo}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Terms and Conditions of Service
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Please read these Terms carefully prior to registering an account, funding your Nigerian Naira wallet, purchasing digital services, or applying to {companyName} Digital Training Academy.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            1. Acceptance of Terms &amp; Account Eligibility
          </h2>
          <p>
            By creating an account or submitting a training application on this platform, you agree to comply with these Terms and applicable laws of the Federal Republic of Nigeria. Digital wallet and commercial utility accounts require accurate registration details. Minors enrolling in HAMBAK TECH &amp; SERVICES Digital Training Academy must supply verifiable Parent or Guardian authorization.
          </p>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            2. Identity Verification &amp; Data Consent
          </h2>
          <p>
            When executing National Identification Number (NIN) or Bank Verification Number (BVN) queries through {companyName}:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-400 text-xs">
            <li>You must obtain explicit consent from the individual whose identity record is being verified in compliance with the Nigeria Data Protection Act (NDPA).</li>
            <li>Verification services may only be used for lawful onboarding, KYC compliance, and authorized personal/business document confirmation.</li>
            <li>Unauthorized harvesting, sharing, or misuse of personal identity records will result in immediate account termination.</li>
          </ul>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            3. Telecommunication &amp; Utility Delivery
          </h2>
          <p>
            Data bundles, airtime, cable TV renewals, and electricity token dispatches depend on mobile network operators and utility providers. In the event of a confirmed delivery failure where your wallet was debited, automated reconciliation or support-verified wallet reversal applies in line with our Refund &amp; Dispute Policy.
          </p>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            4. Naira Wallet Prepayments
          </h2>
          <p>
            Wallet balances represent non-interest-bearing prepayments in Nigerian Naira (₦) dedicated to services on the {companyName} platform. Users must report any suspected unauthorized account activity or transaction discrepancy within 48 hours via {supportEmail}.
          </p>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            5. Suspension &amp; Compliance Enforcement
          </h2>
          <p>
            {companyName} reserves the right to restrict or terminate accounts involved in fraudulent payment reversals, unauthorized automation, identity misuse, or violation of Academy code of conduct guidelines.
          </p>
        </section>
      </div>
    </div>
  );
};
