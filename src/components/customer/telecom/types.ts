/**
 * @file types.ts
 * Shared types, service menu definitions, network styles, and Nigerian phone MNP helpers
 * for HAMBAKTECH Customer Telecom & VTU Services.
 */

import { TelecomOrder, TelecomVoucherItem } from '../../../types';

export type TelecomTab =
  | 'airtime'
  | 'data'
  | 'airtime_pin'
  | 'data_pin'
  | 'airtime_swap'
  | 'cable'
  | 'electricity'
  | 'exam'
  | 'bulksms'
  | 'history';

export type CarrierCode = 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';

export type WorkflowStep = 'form' | 'review' | 'result' | 'receipt';

export type ExecutionOutcome = 'processing' | 'successful' | 'pending' | 'failed';

export interface CustomerAccountSnapshot {
  walletBalance: number;
  tier: number;
  pointsBalance: number | null;
  totalRefunded: number | null;
  loaded: boolean;
}

export interface ReviewBreakdownItem {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: 'default' | 'emerald' | 'blue' | 'amber';
}

export interface ReviewDraft {
  serviceKey: Exclude<TelecomTab, 'history'>;
  serviceTitle: string;
  summarySubtitle: string;
  networkOrProvider: string;
  recipientLabel: string;
  recipientValue: string;
  nominalAmount: number;
  discountAmount?: number;
  netPayable: number;
  items: ReviewBreakdownItem[];
  pinTitle: string;
  pinDescription: string;
  confirmLabel?: string;
}

export interface TransactionExecutionResult {
  outcome: ExecutionOutcome;
  serviceKey: Exclude<TelecomTab, 'history'>;
  serviceTitle: string;
  message: string;
  reference: string;
  timestamp: string;
  networkOrProvider: string;
  recipientLabel: string;
  recipientValue: string;
  planOrDescription: string;
  nominalAmount: number;
  discountAmount?: number;
  netPayable: number;
  balanceAfter?: number;
  order?: TelecomOrder;
  vouchers?: TelecomVoucherItem[];
  examPins?: Array<{ serial: string; pin: string; exam: string }>;
  electricityToken?: string;
  electricityUnits?: string;
  meterCustomerName?: string;
  meterAddress?: string;
  cableCustomerName?: string;
  swapDetails?: {
    transfer_number?: string;
    instructions?: string;
    ussd_template?: string;
    expected_credit?: number;
    conversion_rate?: number;
  };
  smsDetails?: {
    senderId?: string;
    pages?: number;
    recipientCount?: number;
  };
  requerySupported?: boolean;
}

export const CARRIERS: Array<{
  code: CarrierCode;
  label: string;
  accentBg: string;
  accentText: string;
  borderActive: string;
}> = [
  {
    code: 'MTN',
    label: 'MTN Nigeria',
    accentBg: 'bg-amber-500',
    accentText: 'text-amber-700 dark:text-amber-400',
    borderActive: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200',
  },
  {
    code: 'AIRTEL',
    label: 'Airtel Nigeria',
    accentBg: 'bg-rose-600',
    accentText: 'text-rose-700 dark:text-rose-400',
    borderActive: 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200',
  },
  {
    code: 'GLO',
    label: 'Globacom (Glo)',
    accentBg: 'bg-emerald-600',
    accentText: 'text-emerald-700 dark:text-emerald-400',
    borderActive: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200',
  },
  {
    code: '9MOBILE',
    label: '9mobile',
    accentBg: 'bg-teal-600',
    accentText: 'text-teal-700 dark:text-teal-400',
    borderActive: 'border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200',
  },
];

export const TELECOM_MENU_ITEMS: Array<{
  id: TelecomTab;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'airtime',
    label: 'Airtime',
    shortLabel: 'Airtime',
    description: 'Instant VTU airtime recharge with customer cash discount across Nigerian networks.',
  },
  {
    id: 'data',
    label: 'Data Bundles',
    shortLabel: 'Data Bundles',
    description: 'SME, Corporate, Direct, and Gifting mobile data plans for all major networks.',
  },
  {
    id: 'airtime_pin',
    label: 'Airtime PINs',
    shortLabel: 'Airtime PINs',
    description: 'Generate printable recharge card e-PINs and serial numbers for retail or personal use.',
  },
  {
    id: 'data_pin',
    label: 'Data PINs',
    shortLabel: 'Data PINs',
    description: 'Generate printable mobile data voucher cards with instant PIN and serial delivery.',
  },
  {
    id: 'airtime_swap',
    label: 'Airtime to Cash',
    shortLabel: 'Airtime to Cash',
    description: 'Convert excess airtime on your line to wallet balance or bank payout securely.',
  },
  {
    id: 'cable',
    label: 'Cable TV',
    shortLabel: 'Cable TV',
    description: 'Renew DStv, GOtv, StarTimes, and Showmax subscriptions with smartcard verification.',
  },
  {
    id: 'electricity',
    label: 'Electricity',
    shortLabel: 'Electricity',
    description: 'Pay prepaid and postpaid utility electricity bills across Nigerian Discos.',
  },
  {
    id: 'exam',
    label: 'Exam Cards',
    shortLabel: 'Exam Cards',
    description: 'Purchase WAEC, NECO, NABTEB, and JAMB result checker PINs and serial numbers.',
  },
  {
    id: 'bulksms',
    label: 'Bulk SMS',
    shortLabel: 'Bulk SMS',
    description: 'Send verified SMS broadcasts with custom Sender ID and transparent per-unit billing.',
  },
  {
    id: 'history',
    label: 'Orders & Receipts',
    shortLabel: 'Orders & Receipts',
    description: 'Review all past telecom orders, verify pending statuses, and print official receipts.',
  },
];

const CARRIER_PREFIX_MAP: Record<string, CarrierCode> = {
  // MTN
  '0803': 'MTN', '0806': 'MTN', '0703': 'MTN', '0706': 'MTN', '0813': 'MTN', '0816': 'MTN',
  '0810': 'MTN', '0814': 'MTN', '0903': 'MTN', '0906': 'MTN', '0913': 'MTN', '0916': 'MTN',
  '07025': 'MTN', '07026': 'MTN', '0704': 'MTN',
  // AIRTEL
  '0802': 'AIRTEL', '0808': 'AIRTEL', '0708': 'AIRTEL', '0812': 'AIRTEL', '0701': 'AIRTEL',
  '0902': 'AIRTEL', '0901': 'AIRTEL', '0904': 'AIRTEL', '0907': 'AIRTEL', '0912': 'AIRTEL',
  '0911': 'AIRTEL',
  // GLO
  '0805': 'GLO', '0807': 'GLO', '0705': 'GLO', '0815': 'GLO', '0811': 'GLO',
  '0905': 'GLO', '0915': 'GLO',
  // 9MOBILE
  '0809': '9MOBILE', '0818': '9MOBILE', '0817': '9MOBILE', '0909': '9MOBILE', '0908': '9MOBILE',
};

export interface NigerianPhoneAnalysis {
  raw: string;
  normalized: string;
  valid: boolean;
  detectedNetwork: CarrierCode | null;
  reason?: string;
}

/**
 * Normalizes Nigerian mobile phone formats (+234..., 234..., 0..., or 10 digits)
 * to local 11-digit format (e.g. 08031234567) and detects the original carrier prefix.
 */
export function analyzeNigerianPhone(rawInput: string): NigerianPhoneAnalysis {
  const digits = rawInput.replace(/\D+/g, '');
  if (!digits) {
    return { raw: rawInput, normalized: '', valid: false, detectedNetwork: null, reason: 'Enter a recipient phone number.' };
  }

  let normalized = digits;
  if (digits.startsWith('234') && digits.length === 13) {
    normalized = `0${digits.slice(3)}`;
  } else if (digits.startsWith('2340') && digits.length === 14) {
    normalized = `0${digits.slice(4)}`;
  } else if (/^[789][01]\d{8}$/.test(digits)) {
    normalized = `0${digits}`;
  }

  const valid = /^0[789][01]\d{8}$/.test(normalized);
  if (!valid) {
    return {
      raw: rawInput,
      normalized,
      valid: false,
      detectedNetwork: null,
      reason: 'Enter a valid 11-digit Nigerian number (e.g. 08031234567 or +2348031234567).',
    };
  }

  const p5 = normalized.slice(0, 5);
  const p4 = normalized.slice(0, 4);
  const detectedNetwork = CARRIER_PREFIX_MAP[p5] || CARRIER_PREFIX_MAP[p4] || null;

  return {
    raw: rawInput,
    normalized,
    valid: true,
    detectedNetwork,
  };
}

export function formatNaira(amount: number): string {
  return `₦${Number(amount || 0).toLocaleString('en-NG', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
