/**
 * @file accountingUtils.ts
 * Shared formatting helpers and constants for HAMBAKTECH Business Management & Accounting.
 */

export function formatNaira(value: number | string | null | undefined, showPlus = false): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '₦0.00';
  const sign = num < 0 ? '-' : showPlus && num > 0 ? '+' : '';
  return `${sign}₦${Math.abs(num).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getLagosDateString(offsetDays = 0): string {
  const now = new Date();
  // Convert to Africa/Lagos (UTC+1) cleanly without DST drift
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const lagosMs = utcMs + 3600000 + offsetDays * 86400000;
  const d = new Date(lagosMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getLagosMonthStartString(): string {
  const today = getLagosDateString(0);
  return `${today.slice(0, 7)}-01`;
}

export function formatDomainLabel(domain: string): string {
  const map: Record<string, string> = {
    nin_verification: 'NIN Verification',
    bvn_verification: 'BVN Verification',
    nin_modification: 'NIN Modification',
    bvn_modification: 'BVN Modification',
    enrolment: 'NIN Enrolment',
    data: 'Data Bundles',
    airtime: 'VTU Airtime',
    airtime_pin: 'Airtime PINs',
    data_pin: 'Data PINs',
    cable: 'Cable TV',
    electricity: 'Electricity',
    exam: 'Exam PINs',
    bulksms: 'Bulk SMS',
    wallet_funding: 'Wallet Funding (Liability)',
    wallet_adjustment: 'Wallet Adjustment',
    referral_payout: 'Referral Cash Payout',
    inventory_purchase: 'Inventory Purchase',
    inventory_cogs: 'Inventory Usage / COGS',
  };
  if (map[domain]) return map[domain];
  return domain
    .replace(/^physical_/, 'Counter: ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export const PHYSICAL_SERVICE_CATEGORIES = [
  { value: 'printing', label: 'Document Printing' },
  { value: 'nin_slip_print', label: 'NIN Slip Printing / Lamination' },
  { value: 'bvn_slip_print', label: 'BVN Slip Printing' },
  { value: 'passport_photo', label: 'Passport Photograph' },
  { value: 'plastic_id_card', label: 'Plastic ID Card Production' },
  { value: 'photocopy', label: 'Photocopy' },
  { value: 'lamination', label: 'Lamination & Binding' },
  { value: 'document_typing', label: 'Document Typing & Formatting' },
  { value: 'scanning', label: 'Document Scanning & Email' },
  { value: 'online_registration', label: 'Online Registration (JAMB/NYSC/CAC/etc.)' },
  { value: 'hardware_sale', label: 'Hardware / Accessory Sale' },
  { value: 'academy_tuition', label: 'Training Academy Fee' },
  { value: 'other', label: 'Other Counter Service' },
];

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Shop / Office Rent' },
  { value: 'power_fuel', label: 'Power, PHCN & Generator Fuel' },
  { value: 'internet_comms', label: 'Internet & Data Subscription' },
  { value: 'staff_salary', label: 'Staff Salaries & Stipends' },
  { value: 'supplies_stationery', label: 'Paper, Toner & Office Supplies' },
  { value: 'equipment_maintenance', label: 'Printer & Equipment Maintenance' },
  { value: 'bank_charges', label: 'Bank & Transfer Charges' },
  { value: 'marketing', label: 'Marketing & Promotion' },
  { value: 'transport_logistics', label: 'Transport & Logistics' },
  { value: 'miscellaneous', label: 'Miscellaneous Expense' },
];

export const OTHER_INCOME_CATEGORIES = [
  { value: 'consultancy', label: 'IT / Tech Consultancy' },
  { value: 'academy_fee', label: 'Academy Tuition / Training' },
  { value: 'commission', label: 'Agent Commission / Rebate' },
  { value: 'hardware_commission', label: 'Hardware / Software Setup' },
  { value: 'other_income', label: 'Other Business Income' },
];
