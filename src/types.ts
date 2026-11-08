/**
 * @file types.ts
 * HambakTech Enterprise TypeScript interfaces.
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  role: 'customer' | 'admin' | 'superadmin';
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
  email_verified?: boolean;
  address?: string;
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

export interface ProviderConfigItem {
  id: '2sureverify' | 'veripine';
  name: string;
  base_url: string;
  api_key: string;
  api_key_masked?: string;
  is_active: boolean;
  is_default: boolean;
  timeout_seconds: number;
  last_ping_status?: 'operational' | 'error' | 'untested';
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

export interface TelecomOrder {
  id: string;
  user_id: string;
  service: 'data' | 'airtime' | 'cable' | 'electricity';
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  phone: string;
  plan: string;
  amount: number;
  cost_price: number;
  profit: number;
  provider: 'ulamadata' | 'vtpass';
  provider_ref: string;
  status: 'successful' | 'pending' | 'failed';
  created_at: string;
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
  tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  support_phone: string;
  support_email: string;
  office_address: string;
  whatsapp_number: string;
  social_links: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
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
  is_pinned: boolean;
  status: 'published' | 'draft';
  created_at: string;
  author: string;
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
  pageVisibility: {
    home: boolean;
    about: boolean;
    services: boolean;
    contact: boolean;
    faq: boolean;
    announcements: boolean;
    terms: boolean;
    privacy: boolean;
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
  level: string;
  duration: string;
  modules_count: number;
  price: number;
  description: string;
  status: 'draft' | 'enrolling' | 'active';
  created_at: string;
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
