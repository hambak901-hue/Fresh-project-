/**
 * @file types.ts
 * HambakTech Enterprise TypeScript interfaces.
 */

export type UserRole =
  | 'customer'
  | 'student'
  | 'agent'
  | 'support'
  | 'staff'
  | 'manager'
  | 'admin'
  | 'superadmin';

export const ALL_USER_ROLES: UserRole[] = [
  'customer',
  'student',
  'agent',
  'support',
  'staff',
  'manager',
  'admin',
  'superadmin',
];

export const CONSOLE_ROLES: UserRole[] = ['support', 'staff', 'manager', 'admin', 'superadmin'];

export function isConsoleRole(role?: string | null): boolean {
  if (!role) return false;
  return CONSOLE_ROLES.includes(role.toLowerCase() as UserRole);
}

export interface AdminRoleDefinition {
  slug: UserRole;
  name: string;
  description: string;
  default_dashboard: string;
  default_permissions: string[];
  category: 'portal' | 'console';
}

export interface AdminDashboardDefinition {
  id: string;
  label: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  role: UserRole;
  assigned_dashboard?: string;
  wallet_balance: number;
  kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  bvn?: string;
  nin?: string;
  tier: 1 | 2 | 3;
  referral_code: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'suspended';
  avatar_url?: string;
  has_transaction_pin?: boolean;
  requires_pin_setup?: boolean;
  pin_length?: number;
  email_verified?: boolean;
  address?: string;
  residential_address?: string;
  state?: string;
  lga?: string;
  bio?: string;
  kyc_documents?: Array<{
    id: string;
    id_type: string;
    id_number: string;
    doc_url?: string;
    submitted_at: string;
    status: 'pending' | 'verified' | 'rejected';
    review_notes?: string;
  }>;
  notification_preferences?: {
    email_alerts: boolean;
    sms_alerts: boolean;
    transaction_receipts: boolean;
    security_warnings: boolean;
  };
  security_settings?: {
    two_factor_enabled: boolean;
    login_alerts: boolean;
  };
  permissions?: string[];
  dob?: string;
  date_of_birth?: string;
  kyc_level?: 0 | 1 | 2 | 3;
  is_new?: boolean;
  tx_count?: number;
  orders_count?: number;
  verifications_count?: number;
  mfa_enabled?: boolean;
  mfa_method?: string;
  pin_is_locked?: boolean;
  pin_failed_attempts?: number;
  pin_locked_until?: string | null;
  referred_by_user_id?: string | null;
  referral_source?: string | null;
  referral_campaign_code?: string | null;
  virtual_account?: {
    status: 'unassigned' | 'pending_kyc' | 'active' | 'suspended';
    account_number?: string;
    account_name?: string;
    bank_name?: string;
    bank_code?: string;
    provider?: string;
    assigned_at?: string;
  };
}

export interface KycSubmission {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  target_level: 1 | 2 | 3;
  status: 'pending' | 'approved' | 'rejected' | 'info_requested';
  verification_method: 'automated' | 'manual' | 'hybrid';
  verification_reference?: string;
  full_legal_name: string;
  date_of_birth: string;
  phone_number: string;
  email: string;
  residential_address: string;
  state: string;
  lga: string;
  nin?: string;
  bvn?: string;
  id_type: 'nin_slip' | 'drivers_license' | 'voters_card' | 'international_passport';
  id_number: string;
  id_document_url?: string;
  selfie_url?: string;
  proof_of_address_url?: string;
  consent_obtained: boolean;
  consent_timestamp: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewer_id?: string;
  reviewer_email?: string;
  reviewer_name?: string;
  review_notes?: string;
  rejection_reason?: string;
  additional_info_requested?: string;
  automated_verification_result?: {
    verified: boolean;
    provider: string;
    reference: string;
    name_matched: boolean;
    timestamp: string;
  };
  review_history?: Array<{
    id: string;
    action: 'submitted' | 'approved' | 'rejected' | 'info_requested' | 'resubmitted';
    reviewer: string;
    notes: string;
    timestamp: string;
  }>;
}

export interface ServiceSecurityRule {
  service_key: string;
  service_name: string;
  category: 'telecom' | 'identity' | 'digital' | 'wallet';
  requires_pin: boolean;
  min_kyc_level: 0 | 1 | 2 | 3;
  daily_limit: number;
  description: string;
  updated_at?: string;
  updated_by?: string;
}

export interface VirtualAccountItem {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_code: string;
  provider: 'monnify' | 'providus' | 'wema' | 'flutterwave' | 'reserved_stub';
  status: 'active' | 'suspended' | 'closed' | 'pending_kyc';
  assigned_at: string;
  total_inflow: number;
  last_funding_at?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'credit' | 'debit';
  amount: number;
  balance_before: number;
  balance_after: number;
  category: 'funding' | 'nin_verification' | 'bvn_verification' | 'data_purchase' | 'airtime' | 'cable_tv' | 'store_purchase' | 'manual_adjustment';
  reference: string;
  gateway: 'flutterwave' | 'paystack' | 'manual_transfer' | 'internal';
  status: 'successful' | 'pending' | 'failed';
  description: string;
  metadata?: any;
  created_at: string;
}

export interface VerificationRecord {
  id: string;
  user_id: string;
  type: string;
  service_key?: string;
  search_value: string;
  provider: '2sureverify' | 'veripine';
  cost: number;
  provider_cost?: number;
  status: 'completed' | 'failed' | 'pending';
  reference?: string;
  slip_type?: string;
  has_slip?: boolean;
  result?: any;
  created_at: string;
}

export interface IdentityService {
  key: string;
  name: string;
  category: string;
  price: number;
  wholesale_cost?: number;
  profit_per_transaction?: number;
  margin_percent?: number;
  provider?: string;
  endpoint?: string;
  enabled?: boolean;
  required_fields: string[];
  description: string;
  slip_type_supported?: boolean;
}

export interface SlipTemplateItem {
  id: string;
  slip_code?: string;
  name: string;
  category: 'NIN' | 'BVN' | 'OTHER';
  price?: number | null;
  demo_image_url: string;
  description: string;
  supported_service: string;
  is_active: boolean;
  display_order: number;
  is_recommended?: boolean;
  badge?: string;
  watermark_text?: string;
  created_at: string;
  updated_at?: string;
}

export interface ProviderConfigItem {
  id: string;
  name: string;
  provider_type?: string;
  base_url: string;
  api_key: string;
  api_key_masked?: string;
  secret_key?: string;
  secret_key_masked?: string;
  public_key?: string;
  public_key_masked?: string;
  has_api_key?: boolean;
  has_secret_key?: boolean;
  has_public_key?: boolean;
  balance?: number;
  is_active: boolean;
  is_default: boolean;
  timeout_seconds: number;
  last_ping_status?: 'operational' | 'error' | 'untested' | 'unconfigured';
  last_ping_time?: string;
  last_ping_latency?: number;
}

export interface ProviderLogItem {
  id: string;
  provider: string;
  endpoint: string;
  method: string;
  status_code: number;
  request_body: string | null;
  response_body: string | null;
  latency_ms: number;
  reference: string | null;
  created_at: string;
}

export interface TelecomVoucherItem {
  index: number;
  pin: string;
  serial: string;
  denomination_label?: string;
  value?: number;
  network?: string;
  load_code?: string;
  check_balance?: string;
  card_name?: string;
  created_at?: string;
}

export interface TelecomOrder {
  id: string;
  user_id?: string;
  reference?: string;
  service: 'data' | 'airtime' | 'airtime_pin' | 'airtime_swap' | 'cable' | 'data_pin' | 'bulksms' | 'electricity' | 'exam';
  service_type?: string;
  network: string;
  phone: string;
  recipient?: string;
  plan: string;
  amount: number;
  cost_price?: number;
  profit?: number;
  provider?: string;
  provider_id?: string;
  provider_ref: string;
  status: 'successful' | 'pending' | 'failed';
  metadata?: any;
  token?: string;
  units?: string;
  face_value?: number;
  discount_saved?: number;
  voucher_count?: number;
  vouchers?: TelecomVoucherItem[];
  customer_name?: string;
  customer_email?: string;
  created_at: string;
  updated_at?: string;
}

export interface TelecomPlanItem {
  id: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE' | string;
  network_id?: number | null;
  name: string;
  size: string;
  validity: string;
  type: string;
  plan_type?: string;
  price: number;
  wholesale_cost?: number;
  cost_price?: number;
  pricing_mode?: 'fixed' | 'markup_percent' | 'discount_percent' | 'default_markup' | string;
  fixed_price?: number | null;
  markup_percent?: number | null;
  discount_percent?: number | null;
  admin_price_locked?: boolean;
  margin?: number;
  margin_percent?: number;
  provider_plan_id?: number;
  provider_id?: string;
  provider?: string;
  is_active?: boolean;
  enabled: boolean;
  updated_at?: string;
}

export interface AirtimePinDenomination {
  id: string;
  network: string;
  network_id?: number;
  denomination: number;
  price: number;
  selling_price?: number;
  discount_percent: number;
  discount_rate?: number;
  available_stock: number;
  in_stock: boolean;
  max_quantity: number;
  enabled: boolean;
  is_active?: boolean;
  // Admin-only fields
  provider_plan_id?: number;
  wholesale_cost?: number;
  api_discount?: number;
  pricing_mode?: 'fixed' | 'markup_percent' | 'discount_percent' | 'default_markup' | string;
  fixed_price?: number | null;
  markup_percent?: number | null;
  admin_price_locked?: boolean;
  profit?: number;
  margin_percent?: number;
  price_anomaly?: boolean;
  updated_at?: string;
}

export interface DataPinDenomination {
  id: string;
  network: string;
  network_id?: number;
  size: string;
  plan_name: string;
  name?: string;
  validity?: string;
  price: number;
  selling_price?: number;
  available_stock: number;
  in_stock: boolean;
  max_quantity: number;
  enabled: boolean;
  is_active?: boolean;
  // Admin-only fields
  provider_plan_id?: number;
  wholesale_cost?: number;
  pricing_mode?: 'fixed' | 'markup_percent' | 'discount_percent' | 'default_markup' | string;
  fixed_price?: number | null;
  markup_percent?: number | null;
  discount_percent?: number | null;
  admin_price_locked?: boolean;
  profit?: number;
  margin_percent?: number;
  updated_at?: string;
}

export interface CablePackageItem {
  id: string;
  provider: 'DSTV' | 'GOTV' | 'STARTIMES' | 'SHOWMAX' | string;
  name: string;
  code: string;
  price: number;
  cost_price?: number;
  wholesale_cost?: number;
  channels: number;
  enabled: boolean;
}

export interface ElectricityDiscoItem {
  id: string;
  name: string;
  code: string;
  state?: string;
  min_amount?: number;
  min?: number;
  minimum_amount?: number;
  enabled: boolean;
}

export interface ExamPackageItem {
  id: string;
  name: string;
  code: string;
  price: number;
  cost_price: number;
  description: string;
  enabled: boolean;
}

export interface AirtimeSwapConfigItem {
  network: string;
  conversion_rate: number;
  merchant_phone: string;
  ussd_template: string;
  min_amount: number;
  max_amount: number;
  enabled: boolean;
}

export interface TelecomProviderStatus {
  id: string;
  name: string;
  is_primary: boolean;
  balance?: number;
  currency?: string;
  latency_ms?: number;
  status?: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  read: boolean;
  created_at: string;
}

export interface SystemStatusResponse {
  status: string;
  phase: string;
  credentials: {
    veripine: { configured: boolean; keyMasked: string };
    sureverify: { configured: boolean; keyMasked: string };
    ulamaData: { configured: boolean; keyMasked: string };
    vtpass: { configured: boolean; apiKeyMasked: string; publicKeyMasked: string; secretKeyMasked: string };
    flutterwave: { configured: boolean; clientIdMasked: string; secretKeyMasked: string; encryptionKeyConfigured: boolean };
    smtpMail: { configured: boolean; host: string; port: number; user: string; supportEmail: string; webmailUrl: string };
    cpanel: { serverName: string; serverIp: string; sftpHost: string; sftpPort: number; sftpUser: string; sftpPassConfigured: boolean; nameservers: string[] };
  };
  stats: {
    totalUsers: number;
    totalTransactions: number;
    totalVerifications: number;
    totalOrders: number;
    activeSettings: any;
  };
  timestamp: string;
}

export interface PhaseInfo {
  number: string;
  title: string;
  description: string;
  status: 'completed' | 'in_progress' | 'pending';
  deliverables: string[];
}

export interface BrandSettings {
  company_name: string;
  short_brand_name?: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  whatsapp_number: string;
  business_phone?: string;
  support_phone: string;
  support_email: string;
  info_email?: string;
  office_address: string;
  business_reg_number?: string;
  founded_year?: string;
  social_links: {
    tiktok?: string;
    facebook?: string;
    telegram?: string;
    x?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
    whatsapp_channel?: string;
    instagram?: string;
    whatsapp?: string;
  };
  footer_text: string;
  copyright_text: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  category: 'update' | 'maintenance' | 'offer' | 'security' | 'general';
  target_audience?: string;
  target_user_id?: string | null;
  is_pinned: boolean;
  status: 'published' | 'draft';
  created_at: string;
  author: string;
  email_stats?: {
    sent_count: number;
    failed_count: number;
    total_logged: number;
    last_sent_at?: string | null;
  };
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: 'general' | 'verification' | 'telecom' | 'wallet' | 'api';
  order: number;
}

export interface NavMenuItem {
  id: string;
  label: string;
  pageKey: string;
  enabled: boolean;
  order: number;
}

export interface CmsSections {
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    primaryCtaText: string;
    primaryCtaLink: string;
    secondaryCtaText: string;
    secondaryCtaLink: string;
    bannerImage: string;
  };
  companyIntro: {
    badge: string;
    title: string;
    description: string;
    founded: string;
    headquarters: string;
    infrastructure: string;
    stats: Array<{ label: string; value: string }>;
  };
  aboutOverview?: {
    title: string;
    content: string;
  };
  mission?: {
    title: string;
    content: string;
  };
  vision?: {
    title: string;
    content: string;
  };
  coreValues?: Array<{
    title: string;
    description: string;
  }>;
  businessObjectives?: string[];
  whyChooseUs?: Array<{
    title: string;
    description: string;
  }>;
  howItWorks: Array<{
    step: string;
    title: string;
    description: string;
  }>;
  benefits: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
  }>;
  customerServiceInfo?: {
    officeHours?: string;
    whatsappLabel?: string;
    businessLabel?: string;
    officeLabel?: string;
  };
  refundPolicy?: {
    title?: string;
    summary?: string;
    sections?: Array<{ heading: string; body: string }>;
  };
  academyOverview?: {
    title?: string;
    subtitle?: string;
    admissionNote?: string;
  };
  pageVisibility: {
    home: boolean;
    about: boolean;
    services: boolean;
    howItWorks?: boolean;
    academy?: boolean;
    contact: boolean;
    faq: boolean;
    announcements: boolean;
    terms: boolean;
    privacy: boolean;
    refundPolicy?: boolean;
    ratesCalculator: boolean;
  };
}

export interface PublicRates {
  nin_fee: number;
  bvn_fee: number;
  mtn_sme_1gb: number;
  airtel_1gb: number;
  glo_1gb: number;
  nine_mobile_1gb: number;
  airtime_discount_percent: number;
}

export interface PublicCmsResponse {
  success: boolean;
  branding: BrandSettings;
  cms_sections: CmsSections;
  announcements: AnnouncementItem[];
  faqs: FaqItem[];
  navigation: NavMenuItem[];
  rates: PublicRates;
  timestamp: string;
}

export interface AdminCmsResponse {
  success: boolean;
  branding: BrandSettings;
  cms_sections: CmsSections;
  announcements: AnnouncementItem[];
  faqs: FaqItem[];
  navigation: NavMenuItem[];
  settings: any;
}

export interface DashboardModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'coming_soon' | 'disabled';
  visible: boolean;
  coming_soon_message?: string;
  order?: number;
}

export interface StoreItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  image_url?: string;
  status: 'active' | 'draft' | 'out_of_stock';
  created_at: string;
}

export interface AcademyCourse {
  id: string;
  title: string;
  category?: string;
  level: string;
  duration: string;
  modules_count: number;
  price: number | null;
  description: string;
  curriculum_outline?: string | null;
  is_available?: boolean;
  admission_start_date?: string | null;
  admission_end_date?: string | null;
  display_order?: number;
  status: 'draft' | 'enrolling' | 'active';
  created_at: string;
}

export interface AcademyApplication {
  id: string;
  application_ref: string;
  user_id?: string | null;
  course_id: string;
  course_title?: string;
  course_duration?: string;
  course_category?: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  age_at_submission: number;
  gender: string;
  address: string;
  state: string;
  lga: string;
  qualification?: string | null;
  study_mode: string;
  preferred_schedule: string;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_address?: string | null;
  guardian_relationship?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  passport_url?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'info_requested' | 'enrolled';
  admin_notes?: string | null;
  info_request_message?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  student_id?: string | null;
  academic_status?: string | null;
  created_at: string;
}

export interface AcademyStudent {
  id: string;
  student_id: string;
  application_id: string;
  user_id?: string | null;
  course_id: string;
  course_title?: string;
  course_duration?: string;
  course_category?: string;
  full_name: string;
  email: string;
  phone: string;
  photo_url?: string | null;
  enrollment_date: string;
  completion_date?: string | null;
  academic_status: 'active' | 'graduated' | 'suspended' | 'withdrawn';
  id_card_issued_at?: string | null;
  created_at?: string;
}

export interface StudentVerificationResult {
  success: boolean;
  valid: boolean;
  student_id: string;
  full_name?: string;
  course_title?: string;
  course_duration?: string;
  academic_status?: string;
  enrollment_date?: string;
  completion_date?: string | null;
  id_card_issued_at?: string | null;
  message?: string;
  academy?: {
    name: string;
    email: string;
    address: string;
    business_reg_number: string;
    motto: string;
  };
}

export interface AuditLogItem {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  details: any;
  ip?: string;
  created_at: string;
}

export interface AdminOverviewData {
  metrics: {
    totalCustomers: number;
    activeCustomers: number;
    suspendedCustomers: number;
    totalStaff: number;
    totalWalletBalances: number;
    totalWalletFunding: number;
    totalRefunds?: number;
    totalServiceSales: number;
    providerExpenditure: number;
    grossProfit: number;
    successfulTransactions: number;
    pendingTransactions: number;
    failedTransactions: number;
    pendingFundingApprovals: number;
    pendingKycCount: number;
  };
  recentRegistrations: User[];
  recentOrders: TelecomOrder[];
  pendingFundings: Transaction[];
  providerStatus: {
    veripine: { configured: boolean; status: string; keyMasked: string };
    sureverify: { configured: boolean; status: string; keyMasked: string };
    ulamaData: { configured: boolean; status: string; keyMasked: string };
    vtpass: { configured: boolean; status: string; apiKeyMasked: string };
    flutterwave: { configured: boolean; status: string; clientIdMasked: string };
    smtpMail: { configured: boolean; status: string; host: string; port: number };
    cpanel: { configured: boolean; status: string; host: string; serverIp: string };
  };
}

// -------------------------------------------------------------
// PHASE 8 INTERFACES
// -------------------------------------------------------------

export interface SmtpLogItem {
  id: string;
  timestamp: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'simulated' | 'failed';
  error?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  password_masked?: string;
  encryption: 'tls' | 'ssl' | 'none';
  sender_email: string;
  sender_name: string;
  reply_to_email: string;
  last_tested_at?: string;
  last_test_status?: 'operational' | 'error' | 'untested';
  last_test_message?: string;
  logs: SmtpLogItem[];
}

export interface EmailTemplateItem {
  id: string;
  key: string;
  name: string;
  category: 'Auth' | 'Wallet' | 'Transactions' | 'Services' | 'Security' | 'Admin';
  subject: string;
  html_body: string;
  description: string;
  variables: string[];
  is_active: boolean;
  updated_at: string;
}

export interface SmsTemplateItem {
  id: string;
  key: string;
  title: string;
  content: string;
  variables: string[];
  is_active: boolean;
}

export interface SmsLogItem {
  id: string;
  timestamp: string;
  recipient: string;
  message: string;
  units: number;
  status: 'delivered' | 'simulated' | 'failed';
}

export interface SmsConfig {
  provider: 'termii' | 'bulksms_nigeria' | 'twilio' | 'custom_webhook';
  api_key: string;
  sender_id: string;
  route: 'generic' | 'dnd' | 'whatsapp';
  webhook_url?: string;
  enabled: boolean;
  balance_units: number;
  templates: SmsTemplateItem[];
  logs: SmsLogItem[];
}

export interface StoreSettings {
  store_name: string;
  status: 'coming_soon' | 'active' | 'maintenance';
  coming_soon_message: string;
  currency: string;
  notification_email: string;
  delivery_policy: string;
  allow_preorders: boolean;
}

export interface AcademySettings {
  academy_name: string;
  short_name?: string;
  email?: string;
  contact_email?: string;
  mentor_email?: string;
  address?: string;
  business_reg_number?: string;
  motto?: string;
  student_id_prefix?: string;
  certificate_prefix?: string;
  status: 'coming_soon' | 'active' | 'maintenance';
  coming_soon?: boolean;
  coming_soon_message?: string;
  admission_open?: boolean;
  enrollment_open?: boolean;
  admission_start_date?: string;
  admission_end_date?: string;
  instructor_lead: string;
  certificate_issuer: string;
  allow_waitlist?: boolean;
  whatsapp_number?: string;
  business_phone?: string;
  office_phone?: string;
  banner_url?: string;
}

export interface ReportsSettings {
  status: 'coming_soon' | 'active';
  coming_soon_message: string;
  default_range: '7d' | '30d' | '90d' | 'ytd';
  timezone: string;
  auto_export_email: string;
}

export interface CustomerMessage {
  id: string;
  user_id: string;
  title: string;
  category: 'service' | 'system' | 'security' | 'billing';
  body: string;
  read: boolean;
  reference?: string;
  action_label?: string;
  action_link?: string;
  created_at: string;
}

export interface CustomerReportsAnalytics {
  totalSpent: number;
  totalFunded: number;
  currentBalance: number;
  categoryBreakdown: {
    nin_verification: number;
    bvn_verification: number;
    data_purchase: number;
    airtime: number;
    cable_tv: number;
    store_purchase: number;
  };
  ordersCount: number;
  verificationsCount: number;
  transactionsCount: number;
  recentTransactions: Transaction[];
}

export interface AdminReportsData {
  settings: ReportsSettings;
  analytics: {
    totalVolume: number;
    totalFunding: number;
    totalTelecomCost: number;
    totalTelecomProfit: number;
    totalVerifCost: number;
    estimatedGrossMargin: number;
    transactionCount: number;
    categoryBreakdown: Record<string, number>;
    ordersCount: number;
    verificationsCount: number;
  };
}

export interface KycSubmission {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  target_level: 1 | 2 | 3;
  status: 'pending' | 'approved' | 'rejected' | 'info_requested';
  verification_method: 'automated' | 'manual' | 'hybrid';
  verification_reference?: string;
  full_legal_name: string;
  date_of_birth: string;
  phone_number: string;
  email: string;
  residential_address: string;
  state: string;
  lga: string;
  nin?: string;
  bvn?: string;
  id_type: 'nin_slip' | 'drivers_license' | 'voters_card' | 'international_passport';
  id_number: string;
  id_document_url?: string;
  selfie_url?: string;
  proof_of_address_url?: string;
  consent_obtained: boolean;
  consent_timestamp: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewer_id?: string;
  reviewer_email?: string;
  reviewer_name?: string;
  review_notes?: string;
  rejection_reason?: string;
  additional_info_requested?: string;
  automated_verification_result?: {
    verified: boolean;
    provider: string;
    reference: string;
    name_matched: boolean;
    timestamp: string;
  };
  review_history?: Array<{
    id: string;
    action: 'submitted' | 'approved' | 'rejected' | 'info_requested' | 'resubmitted';
    reviewer: string;
    notes: string;
    timestamp: string;
  }>;
}

export interface ServiceSecurityRule {
  service_key: string;
  service_name: string;
  category: 'telecom' | 'identity' | 'digital' | 'wallet';
  requires_pin: boolean;
  min_kyc_level: 0 | 1 | 2 | 3;
  daily_limit: number;
  description: string;
  updated_at?: string;
  updated_by?: string;
}

export interface VirtualAccountItem {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_code: string;
  provider: 'monnify' | 'providus' | 'wema' | 'flutterwave' | 'reserved_stub';
  status: 'active' | 'suspended' | 'closed' | 'pending_kyc';
  assigned_at: string;
  total_inflow: number;
  last_funding_at?: string;
  webhook_reference?: string;
}

export interface ActivityFootprint {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  category: 'auth' | 'wallet' | 'service' | 'admin' | 'security' | 'visitor';
  action: string;
  service_type: string | null;
  reference: string | null;
  provider: string | null;
  status: 'pending' | 'processing' | 'successful' | 'failed';
  amount: number | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: string | null;
  browser_info: string | null;
  created_at: string;
}

export interface FootprintStats {
  total_activities: number;
  today_logins: number;
  today_services: number;
  wallet_operations: number;
  failed_activities: number;
  unique_ips: number;
}

export interface AdminCreateCustomerPayload {
  full_name: string;
  email: string;
  phone_number: string;
  role: UserRole;
  assigned_dashboard?: string;
  permissions?: string[];
  status: 'active' | 'pending' | 'suspended';
  tier: number;
  password?: string;
  initial_balance?: number;
  notify_customer?: boolean;
  date_of_birth?: string;
  residential_address?: string;
  state?: string;
  lga?: string;
  id_type?: 'nin_slip' | 'drivers_license' | 'voters_card' | 'international_passport' | string;
  id_number?: string;
  nin?: string;
  bvn?: string;
  referral_code?: string;
  kyc_consent?: boolean;
  consent_obtained?: boolean;
}

// Stage 3 — Manual NIN & BVN Modification Types

export interface ModificationRequiredDocument {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  accepted_formats?: string[];
  max_size_mb?: number;
  provider_file_param?: string;
}

export interface ModificationFormFieldOption {
  value: string;
  label: string;
}

export interface ModificationFieldCondition {
  field: string;
  values: string[];
}

export interface ModificationFormField {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'password' | 'date' | 'select' | 'textarea' | 'bvn_enrollment_type';
  required: boolean;
  placeholder?: string;
  help_text?: string;
  helper?: string;
  maxLength?: number;
  conditional_on?: ModificationFieldCondition;
  provider_param?: string;
  validation_hint?: string;
  options?: ModificationFormFieldOption[];
}

export interface ModificationPayloadMappingSpec {
  service_key: string;
  endpoint: string;
  method: string;
  provider_schema_verified: boolean;
  verification_note?: string;
  fields: Record<string, string>;
  files: Record<string, string>;
  field_trace?: Array<{
    customer_field: string;
    internal_field: string;
    provider_param: string;
    required: boolean;
  }>;
  file_trace?: Array<{
    doc_key: string;
    provider_file_param: string;
    required: boolean;
  }>;
}

export interface ModificationServiceItem {
  id: string;
  key: string;
  service_key: string;
  category: 'nin_modification' | 'bvn_modification' | string;
  identity_type: 'NIN' | 'BVN';
  name: string;
  description: string;
  selling_price: number;
  price: number;
  is_active: boolean;
  enabled: boolean;
  processing_type: 'manual' | string;
  manual_label: string;
  estimated_turnaround: string;
  supported_notes?: string;
  required_fields: string[];
  required_documents: ModificationRequiredDocument[];
  form_schema: ModificationFormField[];
  updated_at?: string | null;
  // Admin-only private fields
  provider_id?: string;
  provider?: string;
  endpoint?: string;
  wholesale_cost?: number;
  profit?: number;
  margin_percent?: number;
  provider_schema_verified?: boolean;
  payload_mapping?: ModificationPayloadMappingSpec;
}

export interface ModificationBvnTypeItem {
  id: string;
  enrollment_type: string;
  label: string;
  selling_price: number;
  is_active: boolean;
  provider_synced_at?: string | null;
  // Admin-only private fields
  wholesale_cost?: number;
  profit?: number;
}

export interface ModificationDocumentAttachment {
  id: string;
  doc_key: string;
  doc_label?: string;
  file_name?: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  file_size?: number;
  file_url: string;
}

export type ModificationRequestStatus =
  | 'pending'
  | 'processing'
  | 'query_required'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'refunded';

export interface ModificationRequestItem {
  id: string;
  request_number: string;
  user_id: string;
  identity_type: 'NIN' | 'BVN';
  service_key: string;
  service_name: string;
  masked_identifier: string;
  submitted_fields: Record<string, any>;
  supporting_documents: ModificationDocumentAttachment[];
  enrollment_type?: string | null;
  customer_price: number;
  payment_reference: string;
  refund_reference?: string | null;
  provider_reference?: string | null;
  provider_status?: string | null;
  provider_remarks?: string | null;
  estimated_completion_text: string;
  status: ModificationRequestStatus | string;
  reviewed_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  // Admin-only fields
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  provider_cost?: number;
  profit?: number;
  provider_id?: string;
  endpoint?: string;
  admin_notes?: string | null;
  reviewed_by?: string | null;
  provider_response?: any;
}

export interface ModificationAdminStats {
  total_all: number;
  nin_count: number;
  bvn_count: number;
  pending_count: number;
  processing_count: number;
  query_count: number;
  completed_count: number;
  failed_count: number;
  refunded_count: number;
  total_revenue: number;
  total_provider_cost: number;
  total_margin: number;
}

// Stage 4 — HAMBAK Enrolment Centre (Verified Manual NIN Enrolment Types)

export interface EnrolmentSampleDocument {
  id: string;
  service_key: string;
  title: string;
  description?: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  is_active: boolean;
  file_url: string;
  created_at?: string | null;
}

export interface EnrolmentServiceItem {
  id: string;
  key: string;
  service_key: string;
  category: 'enrolment' | string;
  identity_domain: 'NIN';
  enrolment_type: 'NIN_ADULT' | 'NIN_CHILD' | string;
  name: string;
  description: string;
  selling_price: number;
  price: number;
  is_active: boolean;
  enabled: boolean;
  verified_provider_service: boolean;
  processing_type: 'manual' | string;
  manual_label: string;
  estimated_turnaround: string;
  supported_notes?: string;
  required_fields: string[];
  required_documents: ModificationRequiredDocument[];
  form_schema: ModificationFormField[];
  sample_documents: EnrolmentSampleDocument[];
  updated_at?: string | null;
  // Admin-only private fields
  provider_id?: string;
  provider?: string;
  endpoint?: string;
  wholesale_cost?: number;
  profit?: number;
  margin_percent?: number;
  provider_schema_verified?: boolean;
  payload_mapping?: ModificationPayloadMappingSpec;
}

export type EnrolmentOrderStatus =
  | 'pending'
  | 'processing'
  | 'query_required'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'refunded';

export interface EnrolmentOrderItem {
  id: string;
  order_number: string;
  user_id: string;
  enrolment_type: 'NIN_ADULT' | 'NIN_CHILD' | string;
  identity_domain: 'NIN' | string;
  service_key: string;
  service_name: string;
  applicant_name: string;
  applicant_phone_masked: string;
  submitted_fields: Record<string, any>;
  supporting_documents: ModificationDocumentAttachment[];
  customer_price: number;
  payment_reference: string;
  refund_reference?: string | null;
  provider_remarks?: string | null;
  estimated_completion_text: string;
  status: EnrolmentOrderStatus | string;
  reviewed_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  // Admin-only fields
  provider_reference?: string | null;
  provider_status?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  provider_cost?: number;
  profit?: number;
  provider_id?: string;
  endpoint?: string;
  admin_notes?: string | null;
  reviewed_by?: string | null;
  provider_response?: any;
}

export interface EnrolmentAdminStats {
  total_all: number;
  adult_count: number;
  child_count: number;
  pending_count: number;
  processing_count: number;
  query_count: number;
  completed_count: number;
  failed_count: number;
  refunded_count: number;
  total_revenue: number;
  total_provider_cost: number;
  total_margin: number;
}

export interface EnrolmentUnverifiedNotice {
  service_key: string;
  name: string;
  identity_domain: string;
  status: string;
  reason: string;
}

// Phase 11 — Compulsory Transaction PIN, MFA, Sessions, Referrals & Withdrawal Centre

export interface PinPolicy {
  enforce_transaction_pin: boolean;
  require_pin_activation_for_all_customers: boolean;
  pin_length: 4 | 5 | 6;
  allow_weak_pins: boolean;
  pin_max_attempts: number;
  pin_lockout_minutes: number;
  otp_reset_expiry_minutes: number;
  protected_categories: {
    nin_verification?: boolean;
    bvn_verification?: boolean;
    nin_modification?: boolean;
    bvn_modification?: boolean;
    nin_enrolment?: boolean;
    identity_verification?: boolean;
    identity_modification?: boolean;
    identity_enrolment?: boolean;
    telecom_data?: boolean;
    telecom_airtime?: boolean;
    telecom_pins?: boolean;
    telecom_swap?: boolean;
    telecom_bills?: boolean;
    telecom_bulksms?: boolean;
    telecom_sms?: boolean;
    wallet_transfer?: boolean;
    referral_wallet_conversion?: boolean;
    referral_withdrawal?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface PinUserStatusRow {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  status: string;
  kyc_level: number;
  has_transaction_pin: boolean | number;
  pin_failed_attempts: number;
  pin_locked_until?: string | null;
  pin_set_at?: string | null;
  pin_updated_by_admin_at?: string | null;
  created_at: string;
}

export interface MfaChallengeResponse {
  challenge_token: string;
  method: 'email_otp' | 'totp' | string;
  masked_email: string;
  expires_in_minutes: number;
}

export interface MfaStatus {
  enabled: boolean;
  preferred_method: 'email_otp' | 'totp' | string;
  totp_configured: boolean;
  recovery_codes_remaining: number;
  required_by_policy: boolean;
}

export interface MfaPolicy {
  enforce_mfa_for_superadmin: boolean;
  enforce_mfa_for_admin: boolean;
  allow_customer_mfa: boolean;
  allow_email_otp: boolean;
  allow_totp: boolean;
  otp_expiry_minutes: number;
  max_otp_attempts?: number;
  totp_issuer: string;
}

export interface SessionSecuritySettings {
  session_timeout_minutes: number;
  admin_session_timeout_minutes: number;
  bind_user_agent: boolean;
  login_max_attempts: number;
  login_lockout_minutes: number;
  enforce_cors_allowlist?: boolean;
  allowed_origins?: string;
}

export interface UserSessionItem {
  id: string;
  user_id?: string;
  ip_address: string;
  device_label: string;
  is_current?: boolean;
  last_seen_at: string;
  expires_at: string;
  created_at: string;
  full_name?: string;
  email?: string;
  role?: string;
}

export interface ReferralQualifyingServices {
  data?: boolean;
  airtime?: boolean;
  airtime_pin?: boolean;
  data_pin?: boolean;
  cable?: boolean;
  electricity?: boolean;
  exam_pin?: boolean;
  bulksms?: boolean;
  nin_verification?: boolean;
  bvn_verification?: boolean;
  nin_modification?: boolean;
  bvn_modification?: boolean;
  enrolment?: boolean;
  nin_enrolment?: boolean;
  telecom_data?: boolean;
  telecom_airtime?: boolean;
  telecom_pins?: boolean;
  telecom_bills?: boolean;
  academy?: boolean;
  [key: string]: boolean | undefined;
}

export interface ReferralPublicProgram {
  enabled: boolean;
  program_name: string;
  reward_mode: 'fixed' | 'percent_of_spend' | 'percent_of_margin' | 'points' | 'hybrid';
  trigger_mode:
    | 'signup_verified'
    | 'first_qualifying_transaction'
    | 'every_qualifying_transaction'
    | 'first_qualifying_tx'
    | 'every_qualifying_tx'
    | 'up_to_n_tx';
  flat_reward_naira: number;
  percent_of_spend: number;
  percent_of_margin: number;
  points_per_qualifying_tx: number;
  points_per_1000_naira: number;
  point_value_naira: number;
  min_qualifying_spend: number;
  settlement_hold_hours: number;
  max_rewards_per_referee: number;
  qualifying_services: ReferralQualifyingServices;
  wallet_conversion_enabled: boolean;
  min_wallet_conversion_naira: number;
  min_points_conversion: number;
  wallet_conversion_fee_naira: number;
  withdrawal_enabled: boolean;
  min_withdrawal_naira: number;
  max_withdrawal_naira: number;
  daily_withdrawal_limit_naira: number;
  withdrawal_fee_type: 'flat' | 'percent';
  withdrawal_fee_value: number;
  require_kyc_level_for_withdrawal: number;
  terms_summary: string;
  whatsapp_share_template: string;
}

export interface ReferralProgramConfig extends ReferralPublicProgram {
  code_prefix: string;
  code_length: number;
  min_net_margin_naira: number;
  monthly_reward_cap_naira: number;
  block_self_referral: boolean;
  block_same_ip_signup: boolean;
  max_signups_per_ip_24h: number;
  notify_email_on_reward: boolean;
  notify_email_on_withdrawal: boolean;
}

export interface ReferralCampaign {
  id: string;
  campaign_code: string;
  name: string;
  description?: string;
  reward_mode: string;
  reward_value: number;
  points_bonus: number;
  min_spend: number;
  budget_cap: number;
  spent_budget: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean | number;
  created_at?: string;
}

export interface ReferralTier {
  id: string;
  tier_key: string;
  name: string;
  min_qualified_referrals: number;
  min_referred_volume: number;
  reward_multiplier: number;
  bonus_cash: number;
  bonus_points: number;
  reseller_only: boolean | number;
  display_order: number;
  is_active: boolean | number;
}

export interface ReferralRecordItem {
  id: string;
  status: 'registered' | 'qualified' | 'flagged' | 'blocked';
  attribution_channel: string;
  campaign_code?: string | null;
  qualifying_tx_count: number;
  qualifying_spend_total: number;
  reward_earned_total: number;
  qualified_at?: string | null;
  created_at: string;
  customer_label?: string;
  phone_masked?: string;
  // Admin fields
  referrer_name?: string;
  referrer_email?: string;
  referrer_code?: string;
  referred_name?: string;
  referred_email?: string;
  referred_phone?: string;
  referral_code_used?: string;
  signup_ip?: string;
  flag_reason?: string | null;
}

export interface ReferralRewardItem {
  id: string;
  service_category: string;
  service_key?: string | null;
  source_reference: string;
  gross_amount: number;
  reward_mode: string;
  reward_cash: number;
  reward_points: number;
  status: 'pending' | 'available' | 'reversed' | 'rejected' | 'paid_out' | 'skipped';
  status_reason?: string | null;
  settles_at?: string | null;
  settled_at?: string | null;
  reversed_at?: string | null;
  created_at: string;
  referred_customer?: string;
  // Admin fields
  referrer_name?: string;
  referrer_email?: string;
  referred_name?: string;
  referred_email?: string;
  wholesale_cost?: number;
  net_margin?: number;
}

export interface ReferralPointsEntry {
  id: string;
  entry_type: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  points: number;
  balance_before: number;
  balance_after: number;
  reference: string;
  naira_value: number;
  conversion_rate: number;
  description: string;
  created_at: string;
}

export interface ReferralWithdrawalItem {
  id: string;
  withdrawal_number: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  status: 'pending' | 'approved' | 'processing' | 'paid' | 'rejected' | 'failed' | 'cancelled';
  payment_reference?: string | null;
  rejection_reason?: string | null;
  admin_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  paid_by?: string | null;
  paid_at?: string | null;
  created_at: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  kyc_level?: number;
}

export interface ReferralDashboardData {
  referral_code: string;
  referral_link: string;
  balance: {
    pending_balance: number;
    available_balance: number;
    reserved_for_withdrawal: number;
    transferred_to_wallet_total: number;
    total_withdrawn: number;
    reversed_total: number;
    points_balance: number;
    points_redeemed_total: number;
  };
  stats: {
    total_referrals: number;
    qualified_referrals: number;
    pending_referrals: number;
    referred_volume: number;
    lifetime_earned: number;
  };
  current_tier: ReferralTier | null;
  tiers: ReferralTier[];
  referred_users: ReferralRecordItem[];
  rewards: ReferralRewardItem[];
  withdrawals: ReferralWithdrawalItem[];
  points_ledger: ReferralPointsEntry[];
  trend: Array<{
    day: string;
    referrals_count: number;
    qualified_count: number;
    rewards_total: number;
  }>;
  config: ReferralPublicProgram;
  pin_policy?: PinPolicy;
}

export interface ReferralGrowthReport {
  generated_at: string;
  summary: {
    total_referrals: number;
    qualified_referrals: number;
    flagged_referrals: number;
    blocked_referrals: number;
    active_referrers: number;
    conversion_rate_percent: number;
    qualifying_transactions: number;
    referred_revenue: number;
    wholesale_cost: number;
    gateway_fees: number;
    pending_reward_liability: number;
    approved_rewards_naira: number;
    reversed_rewards_naira: number;
    total_reward_cost: number;
    net_referral_contribution: number;
    roi_percent: number;
    total_converted_to_wallet: number;
    total_cash_paid_out: number;
    pending_withdrawal_amount: number;
    pending_withdrawal_count: number;
    outstanding_available_balances: number;
    outstanding_points_liability: number;
  };
  service_breakdown: Array<{
    service_category: string;
    tx_count: number;
    revenue: number;
    wholesale_cost: number;
    net_margin: number;
    rewards_cost: number;
  }>;
  top_referrers: Array<{
    id: string;
    full_name: string;
    email: string;
    referral_code: string;
    total_referred: number;
    qualified_count: number;
    generated_revenue: number;
    rewards_earned: number;
    available_balance: number;
    points_balance: number;
  }>;
  campaigns: Array<{
    id: string;
    campaign_code: string;
    name: string;
    reward_mode: string;
    reward_value: number;
    budget_cap: number;
    spent_budget: number;
    is_active: number | boolean;
    signups: number;
    qualified_signups: number;
    generated_revenue: number;
  }>;
}

// =========================================================================
// INTEGRATED BUSINESS MANAGEMENT & ACCOUNTING TYPES (11 MODULES)
// =========================================================================

export interface AccountingPeriodSummary {
  period: {
    date_from: string | null;
    date_to: string | null;
    start_utc: string;
    end_utc: string;
  };
  website_gross_sales: number;
  website_refunds: number;
  website_revenue: number;
  physical_revenue: number;
  other_income: number;
  total_business_revenue: number;
  provider_costs: number;
  direct_inventory_cogs: number;
  gateway_pos_fees: number;
  operating_expenses: number;
  total_costs_and_expenses: number;
  unverified_cost_count?: number;
  unverified_cost_revenue?: number;
  gross_margin: number;
  net_profit: number;
  profit_margin_percent: number;
  wallet_funding_inflow: number;
  customer_wallet_deposits: number;
  net_wallet_liability_delta: number;
  counts: {
    active_entries: number;
    website_sales: number;
    refunds: number;
    physical_sales: number;
  };
  physical_payment_split: {
    cash: number;
    pos: number;
    transfer: number;
    pos_fees: number;
  };
  channels: Record<string, { inflow: number; outflow: number; fees: number }>;
  website_domains: Array<{
    service_domain: string;
    tx_count: number;
    refund_count: number;
    gross_sales: number;
    refunds: number;
    net_revenue: number;
    provider_cost: number;
    net_profit: number;
  }>;
}

export interface AccountingEntryItem {
  id: string;
  entry_number: string;
  entry_date: string;
  occurred_at: string;
  occurred_lagos: string;
  source_origin: 'website' | 'physical' | 'expense' | 'income' | 'inventory' | 'reconciliation' | 'adjustment';
  source_table?: string | null;
  source_id?: string | null;
  entry_category: string;
  service_domain: string;
  title: string;
  description?: string | null;
  reference?: string | null;
  gross_amount: number | string;
  revenue_amount: number | string;
  cost_amount: number | string;
  fee_amount: number | string;
  expense_amount: number | string;
  net_profit_impact: number | string;
  wallet_liability_delta: number | string;
  payment_channel: string;
  account_code?: string | null;
  reconciliation_status: 'unreconciled' | 'reconciled' | 'flagged' | 'na';
  reconciliation_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  staff_user_id?: string | null;
  staff_name?: string | null;
  is_reversed: number | boolean;
  reversal_of_entry_id?: string | null;
  reversed_at?: string | null;
  metadata?: any;
}

export interface AccountingChannelBalance {
  account_code: string;
  account_name: string;
  account_type: 'cash' | 'pos' | 'bank' | 'gateway' | 'liability';
  bank_name?: string | null;
  account_number?: string | null;
  opening_balance: number;
  total_inflow: number;
  total_outflow: number;
  total_fees: number;
  expected_balance: number;
}

export interface AccountingWalletLiabilitySummary {
  total_customer_liability: number;
  total_customers: number;
  funded_wallets_count: number;
  negative_wallets_count: number;
  negative_exposure: number;
  internal_admin_wallets_total: number;
  internal_admin_wallets_count: number;
  balance_mismatch_count: number;
  referral_liability_total: number;
  referral_available_liability: number;
  referral_reserved_withdrawal: number;
}

export interface AccountingPhysicalSaleItem {
  id: string;
  receipt_number: string;
  sale_date: string;
  occurred_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  service_category: string;
  service_name: string;
  description?: string | null;
  quantity: number | string;
  unit_price: number | string;
  gross_amount: number | string;
  discount_amount: number | string;
  net_amount: number | string;
  direct_cost: number | string;
  inventory_item_id?: string | null;
  inventory_qty_used: number | string;
  payment_mode: 'cash' | 'pos' | 'transfer' | 'split';
  cash_amount: number | string;
  pos_amount: number | string;
  transfer_amount: number | string;
  pos_fee: number | string;
  pos_rrn?: string | null;
  bank_reference?: string | null;
  attendant_user_id?: string | null;
  attendant_name?: string | null;
  status: 'completed' | 'voided' | 'refunded';
  void_reason?: string | null;
  created_at?: string;
}

export interface AccountingExpenseIncomeItem {
  id: string;
  voucher_number: string;
  record_type: 'expense' | 'other_income';
  entry_date: string;
  occurred_at: string;
  category: string;
  title: string;
  description?: string | null;
  party_name?: string | null;
  amount: number | string;
  fee_amount: number | string;
  payment_method: 'cash' | 'pos' | 'bank_transfer' | 'wallet' | 'other';
  account_code?: string | null;
  reference?: string | null;
  attachment_note?: string | null;
  recorded_by?: string | null;
  recorded_by_name?: string | null;
  status: 'active' | 'voided';
  void_reason?: string | null;
}

export interface AccountingInventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_label: string;
  current_stock: number | string;
  reorder_level: number | string;
  average_unit_cost: number | string;
  default_selling_price: number | string;
  supplier_name?: string | null;
  is_active: number | boolean;
  notes?: string | null;
}

export interface AccountingInventoryMovement {
  id: string;
  item_id: string;
  item_name?: string;
  sku?: string;
  unit_label?: string;
  movement_type: 'purchase' | 'sale_deduction' | 'usage' | 'adjustment_in' | 'adjustment_out' | 'wastage';
  quantity_delta: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  stock_before: number | string;
  stock_after: number | string;
  payment_method?: string | null;
  supplier_name?: string | null;
  reference?: string | null;
  notes?: string | null;
  recorded_by_name?: string | null;
  entry_date: string;
  occurred_at: string;
}

export interface AccountingReconciliationItem {
  id: string;
  reconcile_number: string;
  reconcile_date: string;
  account_code: string;
  channel_name: string;
  opening_balance: number | string;
  expected_inflow: number | string;
  expected_outflow: number | string;
  expected_fees: number | string;
  expected_closing: number | string;
  actual_counted: number | string;
  variance_amount: number | string;
  status: 'balanced' | 'shortage' | 'surplus' | 'pending_review' | 'approved';
  notes?: string | null;
  submitted_by_name?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  created_at?: string;
}

export interface AccountingConfig {
  business_currency: string;
  timezone: string;
  daily_email_enabled: boolean;
  daily_email_hour_lagos: number;
  daily_email_minute_lagos: number;
  daily_email_cutoff_time: string;
  daily_email_recipients: string[];
  report_sections: Record<string, boolean>;
  pos_fee_percent: number;
  pos_fee_cap: number;
  paystack_fee_percent: number;
  paystack_flat_fee: number;
  paystack_flat_threshold: number;
  paystack_fee_cap: number;
  flutterwave_fee_percent: number;
  flutterwave_fee_cap: number;
  gateway_fee_borne_by: 'company' | 'customer';
  low_stock_alert_default: number;
  variance_alert_threshold: number;
  restrict_reversals_to_superadmin: boolean;
  restrict_config_to_superadmin: boolean;
  exclude_internal_admin_wallets_from_liability: boolean;
  auto_sync_on_dashboard_load: boolean;
}

export interface AccountingAccountRecord {
  id: string;
  account_code: string;
  account_name: string;
  account_type: 'cash' | 'pos' | 'bank' | 'gateway' | 'liability';
  bank_name?: string | null;
  account_number?: string | null;
  opening_balance: number | string;
  opening_date?: string | null;
  is_active: number | boolean;
  notes?: string | null;
}

export interface AccountingReportLog {
  id: string;
  report_key: string;
  report_type: 'daily_midday' | 'manual_preview' | 'manual_send';
  lagos_report_date: string;
  prev_day_date: string;
  cutoff_time_lagos: string;
  recipients: string;
  status: 'sent' | 'failed' | 'skipped';
  error_message?: string | null;
  summary_snapshot?: any;
  triggered_by: string;
  sent_at: string;
}






