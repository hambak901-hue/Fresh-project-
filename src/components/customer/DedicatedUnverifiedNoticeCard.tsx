import React from 'react';
import { ArrowLeft, ArrowRight, Ban, Info, ShieldAlert } from 'lucide-react';
import { UnverifiedServiceNotice } from '../../types';

export type UnverifiedServiceKey = 'nin_tracking' | 'bvn_enrolment' | 'nin_bvn_arrangement';

interface FallbackUnverifiedSpec {
  service_key: UnverifiedServiceKey;
  title: string;
  subtitle: string;
  explanation: string;
  providerStatusNote: string;
  alternatives: Array<{
    serviceKey: string;
    label: string;
    hint: string;
  }>;
}

const FALLBACK_SPECS: Record<UnverifiedServiceKey, FallbackUnverifiedSpec> = {
  nin_tracking: {
    service_key: 'nin_tracking',
    title: 'NIN Tracking',
    subtitle: 'Standalone NIN Tracking Lookup — Not Yet Supported',
    explanation:
      'There is no verified standalone customer tracking-ID lookup endpoint exposed in the active 2SureVerify B2B API specification, so HAMBAK does not accept orders or debit customer wallets for standalone NIN Tracking.',
    providerStatusNote:
      'Existing IPE Clearance, NIN Personalisation, and Self-MOD IPE orders submitted through HAMBAK already poll status automatically using official provider status endpoints.',
    alternatives: [
      {
        serviceKey: 'ipe_clearance',
        label: 'Open IPE Clearance',
        hint: 'Clear or check pending NIN enrolment tracking / ticket IDs.',
      },
      {
        serviceKey: 'nin_personalization',
        label: 'Open NIN Personalisation',
        hint: 'Retrieve NIN or slips from an enrolment Tracking ID.',
      },
      {
        serviceKey: 'modification_clearance',
        label: 'Open Self-MOD IPE Clearance',
        hint: 'Clear a pending NIN modification Tracking ID.',
      },
    ],
  },
  bvn_enrolment: {
    service_key: 'bvn_enrolment',
    title: 'BVN Enrolment',
    subtitle: 'Customer BVN Enrolment Submission — Not Yet Supported',
    explanation:
      'The official 2SureVerify API documentation only exposes Adult and Child NIN Enrolment endpoints (bvn_enroll_adult.php and bvn_enroll_child.php) and does not provide a standalone Bank Verification Number (BVN) enrolment endpoint.',
    providerStatusNote:
      'No placeholder form or wallet charge is permitted until an official verified BVN enrolment upstream API is integrated and tested.',
    alternatives: [
      {
        serviceKey: 'bvn_enroll_adult',
        label: 'Open NIN Adult Enrolment',
        hint: 'Submit verified Adult NIN Enrolment with passport upload.',
      },
      {
        serviceKey: 'bvn_enroll_child',
        label: 'Open NIN Child Enrolment',
        hint: 'Submit verified Child NIN Enrolment with passport upload.',
      },
    ],
  },
  nin_bvn_arrangement: {
    service_key: 'nin_bvn_arrangement',
    title: 'NIN / BVN Arrangement',
    subtitle: 'NIN / BVN Arrangement Service — Not Yet Supported',
    explanation:
      'No verified NIN/BVN Arrangement or record synchronization endpoint exists in the official upstream provider documentation. HAMBAK will not collect payment or fabricate orders for an unsupported service.',
    providerStatusNote:
      'If you need to update mismatched records or retrieve a linked email, use our verified NIN Validation, NIN Delinking, or NIN/BVN Modification desks.',
    alternatives: [
      {
        serviceKey: 'nin_validation',
        label: 'Open NIN Validation',
        hint: 'Resolve Bank Validation, No Record, Update Records & Photo Error.',
      },
      {
        serviceKey: 'nin_delinking',
        label: 'Open NIN Delinking / Email Retrieval',
        hint: 'Retrieve linked email or process NIN delinking.',
      },
    ],
  },
};

interface DedicatedUnverifiedNoticeCardProps {
  serviceKey: UnverifiedServiceKey;
  backendNotice?: UnverifiedServiceNotice | null;
  onBackToHub: () => void;
  onNavigateService: (targetKey: string) => void;
}

export const DedicatedUnverifiedNoticeCard: React.FC<DedicatedUnverifiedNoticeCardProps> = ({
  serviceKey,
  backendNotice,
  onBackToHub,
  onNavigateService,
}) => {
  const spec = FALLBACK_SPECS[serviceKey];
  const displayName = backendNotice?.name || spec.title;
  const description = backendNotice?.description || spec.explanation;
  const badgeText = backendNotice?.label || 'Not Yet Supported';

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onBackToHub}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-emerald-400 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Identity Services Hub</span>
            </button>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{displayName}</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                <Ban className="w-3.5 h-3.5" />
                <span>{badgeText}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{spec.subtitle}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Service Unavailable — No Active Provider Endpoint</span>
          </div>
          <p className="leading-relaxed">{description}</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-900 dark:text-white">Zero Charge Protection</p>
            <p>{spec.providerStatusNote}</p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Verified Alternatives Available Now
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {spec.alternatives.map(alt => (
              <button
                key={alt.serviceKey}
                type="button"
                onClick={() => onNavigateService(alt.serviceKey)}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-emerald-500 text-left transition flex items-center justify-between gap-3 group"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-emerald-400">
                    {alt.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {alt.hint}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-emerald-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
