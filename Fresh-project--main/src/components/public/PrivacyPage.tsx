/**
 * @file PrivacyPage.tsx
 * NDPA Privacy Policy page for HAMBAK TECH & SERVICES (BN 9284726).
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { Lock, ShieldCheck, Eye, Database } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
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
          <span>NDPA Compliant ({regNo})</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Privacy Policy &amp; Data Safeguards
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {companyName} respects your privacy and handles personal, transactional, and Academy student records in accordance with the Nigeria Data Protection Act (NDPA).
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Database className="w-4 h-4" />
            <span>Information We Collect</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            1. Data Categories Collected
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-400 text-xs">
            <li>
              <strong>Account Profile:</strong> Full name, email address, phone number, residential location, and hashed authentication credentials.
            </li>
            <li>
              <strong>Service &amp; Verification Records:</strong> Consent-based NIN/BVN verification parameters, recipient mobile numbers, utility meter/smartcard identifiers, and printable verification slips.
            </li>
            <li>
              <strong>Academy Admissions &amp; Minor Protection:</strong> Applicant biodata, course selection, and Parent/Guardian authorization contact fields for students under 18 years old.
            </li>
            <li>
              <strong>Financial Records:</strong> Nigerian Naira (₦) wallet credits, checkout references, and service order receipts.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>Public Student Verification Privacy</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            2. Minimal Data Exposure
          </h2>
          <p>
            Public Student ID verification pages display only official Student ID number, Student Name, Enrolled Course, Academic Status, and Enrollment/Completion dates. Private personal phone numbers, residential addresses, emails, and parent/guardian details are never exposed publicly.
          </p>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Authorized Processing Partners</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            3. Service Delivery Disclosures
          </h2>
          <p>
            We share only the minimum transaction parameters necessary with accredited identity verification, telecommunications, utility biller, and payment checkout partners to complete your requested transactions. We never sell personal data to marketers.
          </p>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-xs font-bold uppercase tracking-wider">
            <Eye className="w-4 h-4" />
            <span>Your Privacy Rights</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            4. Access, Correction &amp; Contact
          </h2>
          <p>
            To request correction or review of your personal account records under the Nigeria Data Protection Act, email{' '}
            <a href={`mailto:${supportEmail}`} className="text-blue-700 dark:text-blue-400 underline font-semibold">
              {supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};
