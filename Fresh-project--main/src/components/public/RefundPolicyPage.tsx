/**
 * @file RefundPolicyPage.tsx
 * Refund & Dispute Resolution Policy powered dynamically by CMS sections & official company identity.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export const RefundPolicyPage: React.FC = () => {
  const { branding, cmsSections } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const policy = cmsSections?.refundPolicy || {
    title: 'Refund & Dispute Resolution Policy',
    summary: `${companyName} (${regNo}) maintains transparent procedures for reversing confirmed failed digital deliveries and investigating wallet funding discrepancies.`,
    sections: [
      {
        heading: '1. Failed Automated Service Orders',
        body: 'When an automated airtime, data, cable TV, or electricity transaction fails definitively at the fulfillment gateway without value delivered, the debited amount is reversed to your NGN wallet after confirmation.',
      },
      {
        heading: '2. Wallet Funding Discrepancies',
        body: 'Duplicate payment gateway debits or uncredited bank transfers supported by valid session references are investigated by our reconciliation desk within 24 to 48 business hours.',
      },
      {
        heading: '3. Non-Refundable Fulfilled Services',
        body: 'Successfully delivered digital tokens, PINs, airtime, data bundles, and completed identity verification records cannot be recalled once fulfilled.',
      },
      {
        heading: '4. Dispute Escalation Channels',
        body: `Open a support ticket from your Customer Dashboard or email ${branding?.support_email || 'support@hambaktech.com.ng'} with your transaction reference, date, and amount.`,
      },
    ],
  };

  return (
    <div className="space-y-8 py-6 max-w-4xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
          <RefreshCw className="w-4 h-4" />
          <span>{companyName} &bull; {regNo}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {policy.title || 'Refund & Dispute Resolution Policy'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {policy.summary}
        </p>
      </div>

      <div className="space-y-5">
        {(policy.sections || []).map((sec, idx) => (
          <section
            key={idx}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-2 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{sec.heading}</h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{sec.body}</p>
          </section>
        ))}
      </div>

      <div className="rounded-2xl bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 p-5 flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
        <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
        <span>
          Support Desk: <strong>{branding?.support_email || 'support@hambaktech.com.ng'}</strong> &bull; Customer Service / Office:{' '}
          <strong className="font-mono">{branding?.support_phone || '09127469686'}</strong>
        </span>
      </div>
    </div>
  );
};
