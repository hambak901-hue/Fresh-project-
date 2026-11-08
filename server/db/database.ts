/**
 * @file database.ts
 * Enterprise JSON & In-Memory Database with atomic persistence.
 * Ready for Node.js hosting / cPanel MySQL migration in Phase 10.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  password_hash: string;
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
  transaction_pin_hash?: string;
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
  permissions?: string[]; // e.g. ['customers', 'wallet', 'kyc', 'services', 'cms', 'audit', 'staff']
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

export interface ProviderLog {
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

export interface IdentityServiceConfig {
  key: string;
  name: string;
  category: 'NIN Verification' | 'BVN Verification' | 'NIN Modification' | 'Personalisation' | 'Enrolment' | 'Additional Services';
  wholesale_cost: number;
  selling_price: number;
  provider: '2sureverify' | 'veripine';
  endpoint: string;
  enabled: boolean;
  required_fields: string[];
  description: string;
  version?: string;
  slip_type_supported?: boolean;
}

export interface ProviderConfigItem {
  id: '2sureverify' | 'veripine';
  name: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
  is_default: boolean;
  timeout_seconds: number;
  last_ping_status?: 'operational' | 'error' | 'untested';
  last_ping_time?: string;
  last_ping_latency?: number;
}

export interface TelecomOrder {
  id: string;
  user_id: string;
  service: 'data' | 'airtime' | 'airtime_pin' | 'airtime_swap' | 'cable' | 'data_pin' | 'bulksms' | 'electricity' | 'exam';
  network?: string;
  phone?: string;
  plan: string;
  amount: number;
  cost_price: number;
  profit: number;
  provider: 'ulamadata' | 'vtpass';
  provider_ref: string;
  status: 'successful' | 'pending' | 'failed' | 'refunded';
  metadata?: any;
  created_at: string;
}

export interface TelecomPlan {
  id: string;
  provider_plan_id: string | number;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  name: string;
  size: string;
  type: 'SME' | 'Corporate' | 'Gifting' | 'Direct';
  validity: string;
  wholesale_cost: number;
  price: number;
  enabled: boolean;
  provider: 'ulamadata' | 'vtpass';
}

export interface AirtimePinDenomination {
  id: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  value: number;
  wholesale_cost: number;
  price: number;
  enabled: boolean;
}

export interface DataPinDenomination {
  id: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  name: string;
  size: string;
  wholesale_cost: number;
  price: number;
  enabled: boolean;
}

export interface CablePackage {
  id: string;
  provider: 'dstv' | 'gotv' | 'startimes' | 'showmax';
  name: string;
  code: string;
  channels: number;
  wholesale_cost: number;
  price: number;
  enabled: boolean;
}

export interface ElectricityDisco {
  id: string;
  name: string;
  code: string;
  minimum_amount: number;
  enabled: boolean;
}

export interface ExamPackage {
  id: string;
  exam_name: 'WAEC' | 'NECO' | 'NABTEB' | 'JAMB';
  name: string;
  description: string;
  wholesale_cost: number;
  price: number;
  enabled: boolean;
}

export interface AirtimeSwapConfig {
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  conversion_rate_percent: number;
  merchant_phone: string;
  ussd_code: string;
  enabled: boolean;
}

export interface BulkSmsRecord {
  id: string;
  user_id: string;
  sender_id: string;
  recipients_count: number;
  recipients_sample: string;
  message: string;
  pages: number;
  units_charged: number;
  amount: number;
  status: 'DELIVERED' | 'PENDING' | 'FAILED';
  created_at: string;
}

export interface TelecomProviderConfigItem {
  id: 'ulamadata' | 'vtpass';
  name: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
  is_default: boolean;
  timeout_seconds: number;
  last_ping_status?: 'operational' | 'error' | 'untested';
  last_ping_time?: string;
  last_ping_latency?: number;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  read: boolean;
  created_at: string;
}

export interface SystemSettings {
  nin_fee: number;
  bvn_fee: number;
  mtn_sme_1gb: number;
  airtel_1gb: number;
  glo_1gb: number;
  nine_mobile_1gb: number;
  airtime_discount_percent: number;
  maintenance_mode: boolean;
  active_verification_provider: '2sureverify' | 'veripine';
  active_telecom_provider: 'ulamadata' | 'vtpass';
  active_payment_gateway: 'flutterwave' | 'paystack';
  bank_transfer_account_name: string;
  bank_transfer_bank: string;
  bank_transfer_account_number: string;
  company_name: string;
  support_phone: string;
  support_email: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  details: any;
  ip?: string;
  created_at: string;
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

export interface SmtpLogItem {
  id: string;
  timestamp: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'simulated' | 'failed';
  error?: string;
}

export interface SmtpConfigItem {
  host: string;
  port: number;
  username: string;
  password?: string;
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

export interface SmsConfigItem {
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

export interface StoreSettingsItem {
  store_name: string;
  status: 'coming_soon' | 'active' | 'maintenance';
  coming_soon_message: string;
  currency: string;
  notification_email: string;
  delivery_policy: string;
  allow_preorders: boolean;
}

export interface AcademySettingsItem {
  academy_name: string;
  status: 'coming_soon' | 'active' | 'maintenance';
  coming_soon_message: string;
  instructor_lead: string;
  certificate_issuer: string;
  allow_waitlist: boolean;
}

export interface ReportsSettingsItem {
  status: 'coming_soon' | 'active';
  coming_soon_message: string;
  default_range: '7d' | '30d' | '90d' | 'ytd';
  timezone: string;
  auto_export_email: string;
}

export interface CustomerMessageItem {
  id: string;
  user_id: string; // or 'all' for broadcast
  title: string;
  category: 'service' | 'system' | 'security' | 'billing';
  body: string;
  read: boolean;
  reference?: string;
  action_label?: string;
  action_link?: string;
  created_at: string;
}

interface DatabaseSchema {
  users: User[];
  transactions: Transaction[];
  verifications: VerificationRecord[];
  telecom_orders: TelecomOrder[];
  notifications: Notification[];
  settings: SystemSettings;
  audit_logs: AuditLog[];
  branding: BrandSettings;
  cms_sections: CmsSections;
  announcements: AnnouncementItem[];
  faqs: FaqItem[];
  navigation: NavMenuItem[];
  dashboard_modules: DashboardModuleConfig[];
  store_items: StoreItem[];
  academy_courses: AcademyCourse[];
  identity_services: IdentityServiceConfig[];
  provider_configs: ProviderConfigItem[];
  provider_logs: ProviderLog[];
  telecom_plans: TelecomPlan[];
  airtime_pin_denominations: AirtimePinDenomination[];
  data_pin_denominations: DataPinDenomination[];
  cable_packages: CablePackage[];
  electricity_discos: ElectricityDisco[];
  exam_packages: ExamPackage[];
  airtime_swap_configs: AirtimeSwapConfig[];
  bulk_sms_records: BulkSmsRecord[];
  telecom_provider_configs: TelecomProviderConfigItem[];
  smtp_config: SmtpConfigItem;
  email_templates: EmailTemplateItem[];
  sms_config: SmsConfigItem;
  store_settings: StoreSettingsItem;
  academy_settings: AcademySettingsItem;
  reports_settings: ReportsSettingsItem;
  customer_messages: CustomerMessageItem[];
}

const DB_DIR = path.resolve(process.cwd(), 'server', 'db');
const DB_FILE = path.join(DB_DIR, 'data.json');

// In-memory representation
let dbData: DatabaseSchema;

export function hashPassword(plainText: string): string {
  return crypto.createHash('sha256').update(plainText + 'hambaktech_salt_2026').digest('hex');
}

function getDefaultData(): DatabaseSchema {
  const superAdminPasswordHash = hashPassword('Hamohullah19@..');
  const demoUserPasswordHash = hashPassword('Password123!');

  return {
    users: [
      {
        id: 'usr_superadmin',
        email: 'admin@hambaktech.com.ng',
        password_hash: superAdminPasswordHash,
        full_name: 'Bakar Hambak (Super Admin)',
        phone_number: '+2348030001122',
        role: 'superadmin',
        wallet_balance: 500000,
        kyc_status: 'verified',
        tier: 3,
        referral_code: 'HAMBAK-SUPER',
        created_at: new Date('2026-01-01').toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
      },
      {
        id: 'usr_customer_demo',
        email: 'fatimohmusbau34@gmail.com',
        password_hash: demoUserPasswordHash,
        full_name: 'Fatimoh Musbau',
        phone_number: '+2348123456789',
        role: 'customer',
        wallet_balance: 15450,
        kyc_status: 'verified',
        nin: '12345678901',
        bvn: '22334455667',
        tier: 2,
        referral_code: 'FATIMOH99',
        created_at: new Date('2026-02-15').toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
      },
    ],
    transactions: [
      {
        id: 'txn_init_001',
        user_id: 'usr_customer_demo',
        type: 'credit',
        amount: 20000,
        balance_before: 0,
        balance_after: 20000,
        category: 'funding',
        reference: 'FLW_MOCK_INIT_001',
        gateway: 'flutterwave',
        status: 'successful',
        description: 'Wallet top-up via Flutterwave',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: 'txn_init_002',
        user_id: 'usr_customer_demo',
        type: 'debit',
        amount: 250,
        balance_before: 20000,
        balance_after: 19750,
        category: 'nin_verification',
        reference: '2SV_NIN_INIT_002',
        gateway: 'internal',
        status: 'successful',
        description: 'Instant NIN Slip Verification',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'txn_init_003',
        user_id: 'usr_customer_demo',
        type: 'debit',
        amount: 4300,
        balance_before: 19750,
        balance_after: 15450,
        category: 'data_purchase',
        reference: 'UD_MTN_INIT_003',
        gateway: 'internal',
        status: 'successful',
        description: 'MTN SME 10GB Data Top-up to 08123456789',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    verifications: [
      {
        id: 'vrf_001',
        user_id: 'usr_customer_demo',
        type: 'NIN',
        search_value: '12345678901',
        provider: '2sureverify',
        cost: 250,
        status: 'completed',
        result: {
          nin: '12345678901',
          firstname: 'FATIMOH',
          surname: 'MUSBAU',
          middlename: 'ADEYEMI',
          birthdate: '1996-08-14',
          gender: 'female',
          state: 'Lagos',
          lga: 'Ikeja',
          photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
          trackingId: 'NIN-VRF-9827391',
        },
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
    telecom_orders: [
      {
        id: 'ord_001',
        user_id: 'usr_customer_demo',
        service: 'data',
        network: 'MTN',
        phone: '08123456789',
        plan: 'MTN SME 10GB (30 Days)',
        amount: 4300,
        cost_price: 2700,
        profit: 1600,
        provider: 'ulamadata',
        provider_ref: 'UD-TXN-847291',
        status: 'successful',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    notifications: [
      {
        id: 'notif_001',
        user_id: 'usr_customer_demo',
        title: 'Welcome to HambakTech!',
        message: 'Your account has been configured. You can now verify NIN, BVN, and buy cheapest Nigerian telecom data.',
        type: 'success',
        read: false,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: 'notif_002',
        user_id: 'usr_customer_demo',
        title: 'Wallet Funded Successfully',
        message: 'Your wallet has been credited with ₦20,000 via Flutterwave gateway.',
        type: 'info',
        read: true,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ],
    settings: {
      nin_fee: 250,
      bvn_fee: 350,
      mtn_sme_1gb: 270,
      airtel_1gb: 290,
      glo_1gb: 260,
      nine_mobile_1gb: 250,
      airtime_discount_percent: 2.5,
      maintenance_mode: false,
      active_verification_provider: '2sureverify',
      active_telecom_provider: 'ulamadata',
      active_payment_gateway: 'flutterwave',
      bank_transfer_account_name: 'Hambak Technologies Enterprise',
      bank_transfer_bank: 'Moniepoint MFB / Truehost LON110',
      bank_transfer_account_number: '8210492817',
      company_name: 'HambakTech Technologies',
      support_phone: '+234 803 000 1122',
      support_email: 'support@hambaktech.com.ng',
    },
    audit_logs: [
      {
        id: 'audit_001',
        user_id: 'usr_superadmin',
        user_email: 'admin@hambaktech.com.ng',
        action: 'SYSTEM_BOOTSTRAP',
        details: { message: 'Database initialized for Phase 01 & 02 Architecture and CMS' },
        created_at: new Date().toISOString(),
      },
    ],
    branding: {
      company_name: 'HambakTech Enterprise',
      tagline: "Nigeria's Foremost Identity Verification, Telecom & Digital Services Engine",
      logo_url: '',
      favicon_url: '/favicon.ico',
      primary_color: '#10b981',
      secondary_color: '#0284c7',
      font_family: 'Plus Jakarta Sans',
      support_phone: '+234 803 000 1122',
      support_email: 'support@hambaktech.com.ng',
      office_address: 'Plot 14, Commercial Avenue, Ikeja, Lagos, Nigeria',
      whatsapp_number: '+2348030001122',
      social_links: {
        twitter: 'https://x.com/hambaktech',
        facebook: 'https://facebook.com/hambaktech',
        linkedin: 'https://linkedin.com/company/hambaktech',
        whatsapp: 'https://wa.me/2348030001122',
      },
      footer_text: "HambakTech Enterprise is Nigeria's high-reliability infrastructure provider for NIMC/BVN identity verification, SME telecoms vending, and digital payments on TrueHost LON110.",
      copyright_text: '© 2026 Hambak Technologies Enterprise. All Rights Reserved. Infrastructure hosted on TrueHost LON110 (51.89.153.183:1624).',
      seo_title: 'HambakTech Enterprise | NIMC NIN, BVN, Telecom Data & Digital Services',
      seo_description: 'All-in-one Nigerian VTU, identity verification (NIN/BVN), telecom, payments, academy, and digital services platform for HambakTech.',
      seo_keywords: 'NIN verification, BVN validation, MTN SME data, Nigerian VTU, identity verification, airtime recharge, Truehost LON110, HambakTech',
    },
    cms_sections: {
      hero: {
        badge: "Nigeria's Leading Digital Services Infrastructure",
        headline: 'Instant Identity Verification, Telecom Bundles & Digital Payments',
        subheadline: 'Automate NIMC NIN slips, BVN lookups, MTN & Airtel SME data vending, and utility bill clearing with enterprise 99.98% uptime on TrueHost LON110.',
        primaryCtaText: 'Get Started Free',
        primaryCtaLink: 'register',
        secondaryCtaText: 'Explore Solutions',
        secondaryCtaLink: 'services',
        bannerImage: '/src/assets/images/hero_fintech_portal_1794097383199.jpg',
      },
      companyIntro: {
        badge: 'Engineering Excellence & Trust',
        title: 'Engineered for Nigerian Businesses, Developers & Agents',
        description: 'Founded with a mission to eliminate manual identity validation and telecom friction, HambakTech operates high-throughput integration adapters with 2SureVerify, Veripine, UlamaData, and VTpass directly connected to sovereign telecommunication nodes.',
        founded: '2024',
        headquarters: 'Lagos, Nigeria',
        infrastructure: 'TrueHost LON110 Tier-3 Cloud Server (51.89.153.183:1624)',
        stats: [
          { label: 'Monthly Transactions', value: '₦120M+' },
          { label: 'Verifications Completed', value: '45,000+' },
          { label: 'API Dispatch Latency', value: '1.2s' },
          { label: 'Server Availability', value: '99.98%' },
        ],
      },
      howItWorks: [
        {
          step: '01',
          title: 'Open Your Account',
          description: 'Create a free personal or corporate wallet in under 60 seconds with instant verification.',
        },
        {
          step: '02',
          title: 'Fund Your Balance',
          description: 'Top up seamlessly via instant Flutterwave checkout or dedicated virtual bank accounts.',
        },
        {
          step: '03',
          title: 'Dispatch Instantly',
          description: 'Process NIN & BVN slips, dispatch SME data packages, or hook into our developer REST API.',
        },
      ],
      benefits: [
        {
          id: 'b1',
          title: 'Sub-Second Dispatch',
          description: 'Direct carrier pipes deliver MTN SME data and airtime in under 3 seconds.',
          icon: 'Zap',
        },
        {
          id: 'b2',
          title: 'Regulatory Compliant',
          description: 'Official NIMC and NIBSS data verification formats with verifiable tracking codes.',
          icon: 'ShieldCheck',
        },
        {
          id: 'b3',
          title: 'Automated Failover',
          description: 'Multi-provider routing between 2SureVerify & Veripine guarantees zero downtime.',
          icon: 'Cpu',
        },
        {
          id: 'b4',
          title: 'Wholesale Profit Margins',
          description: 'Enjoy agent discounted pricing on SME 1GB data starting as low as ₦250.',
          icon: 'TrendingUp',
        },
      ],
      pageVisibility: {
        home: true,
        about: true,
        services: true,
        contact: true,
        faq: true,
        announcements: true,
        terms: true,
        privacy: true,
        ratesCalculator: true,
      },
    },
    announcements: [
      {
        id: 'anc_001',
        title: 'MTN SME Data Price Slash to ₦270/GB',
        content: 'We are pleased to announce wholesale reductions across all MTN SME and Corporate Gifting data plans effective immediately. Resellers can now maximize profits with guaranteed instant delivery.',
        category: 'offer',
        is_pinned: true,
        status: 'published',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        author: 'Operations Team',
      },
      {
        id: 'anc_002',
        title: 'Direct NIN Verification Slip Generator Live',
        content: 'Our 2SureVerify & Veripine adapters now support full photo identity card rendering with high-resolution QR codes and NIMC tracking numbers ready for immediate download.',
        category: 'update',
        is_pinned: true,
        status: 'published',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        author: 'Identity Division',
      },
      {
        id: 'anc_003',
        title: 'Scheduled TrueHost LON110 Server Maintenance',
        content: 'Scheduled routine security updates on the lon110.truehost.cloud host. All API routes will be gracefully rerouted with zero downtime.',
        category: 'maintenance',
        is_pinned: false,
        status: 'published',
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        author: 'DevOps Lead',
      },
    ],
    faqs: [
      {
        id: 'faq_1',
        category: 'general',
        question: 'What is HambakTech Enterprise?',
        answer: 'HambakTech Enterprise is an all-in-one Nigerian technology portal providing instant identity validation (NIN, BVN, CAC), telecommunications vending (SME data, VTU airtime, bill payment), digital payment processing, and technology academy courses.',
        order: 1,
      },
      {
        id: 'faq_2',
        category: 'verification',
        question: 'How does the NIN and BVN verification work?',
        answer: 'We query sovereign databases via authorized adapters (2SureVerify and Veripine). You input the 11-digit NIN or BVN, and within seconds receive the certified biodata, official photograph, and printable NIMC slip.',
        order: 2,
      },
      {
        id: 'faq_3',
        category: 'telecom',
        question: 'How quickly is SME data delivered to the recipient?',
        answer: 'Our telecom gateway dispatches data bundles through direct integration with UlamaData and VTpass carrier bridges. Delivery typically completes in 2 to 10 seconds.',
        order: 3,
      },
      {
        id: 'faq_4',
        category: 'wallet',
        question: 'How do I fund my wallet balance?',
        answer: 'You can fund your wallet using automated Flutterwave card checkout or via instant bank transfer to your dedicated Moniepoint virtual account.',
        order: 4,
      },
      {
        id: 'faq_5',
        category: 'api',
        question: 'Can I integrate HambakTech services into my own software?',
        answer: 'Yes! All verification and telecom services provide authenticated REST API endpoints with webhook support for developers and resellers.',
        order: 5,
      },
    ],
    navigation: [
      { id: 'nav_home', label: 'Home', pageKey: 'home', enabled: true, order: 1 },
      { id: 'nav_about', label: 'About Us', pageKey: 'about', enabled: true, order: 2 },
      { id: 'nav_services', label: 'Services', pageKey: 'services', enabled: true, order: 3 },
      { id: 'nav_rates', label: 'Pricing Calculator', pageKey: 'rates', enabled: true, order: 4 },
      { id: 'nav_announcements', label: 'Announcements', pageKey: 'announcements', enabled: true, order: 5 },
      { id: 'nav_faq', label: 'FAQ', pageKey: 'faq', enabled: true, order: 6 },
      { id: 'nav_contact', label: 'Contact', pageKey: 'contact', enabled: true, order: 7 },
    ],
    dashboard_modules: [
      { id: 'nin', name: 'NIN Services', description: 'NIMC & BVN Sovereign Identity Verification Engine', icon: 'ShieldCheck', status: 'active', visible: true, order: 1 },
      { id: 'telecom', name: 'Telecommunications', description: 'High-speed automated SME data & airtime top-up', icon: 'Smartphone', status: 'active', visible: true, order: 2 },
      { id: 'wallet', name: 'My Wallet', description: 'Real-time ledger, Moniepoint VA, & instant funding', icon: 'Wallet', status: 'active', visible: true, order: 3 },
      { id: 'store', name: 'Store', description: 'Biometric scanners, POS terminals, and developer API licenses', icon: 'ShoppingBag', status: 'coming_soon', visible: true, coming_soon_message: 'Official launch in Phase 5. Hardware stock being staged.', order: 4 },
      { id: 'digital', name: 'Digital Services', description: 'Instant Cable TV renewal & 20-digit electricity prepaid tokens', icon: 'Zap', status: 'active', visible: true, order: 5 },
      { id: 'academy', name: 'Academy', description: 'Accredited VTU reseller masterclasses & NIMC agent licensing', icon: 'GraduationCap', status: 'coming_soon', visible: true, coming_soon_message: 'Accreditation syllabus under review.', order: 6 },
      { id: 'reports', name: 'Reports', description: 'Advanced profit margins, tax journals, and sub-reseller downlines', icon: 'BarChart3', status: 'coming_soon', visible: true, coming_soon_message: 'Financial reporting engine rolling out.', order: 7 },
      { id: 'transactions', name: 'Transactions', description: 'Double-entry ledger audit history', icon: 'Receipt', status: 'active', visible: true, order: 8 },
      { id: 'orders', name: 'Orders', description: 'Carrier & utility fulfillment logs', icon: 'Package', status: 'active', visible: true, order: 9 },
      { id: 'support', name: 'Support / Help Centre', description: '24/7 technical help desk & hotline', icon: 'HelpCircle', status: 'active', visible: true, order: 10 },
    ],
    store_items: [
      { id: 'item_001', name: 'HambakTech Bluetooth Biometric Fingerprint Scanner', category: 'Hardware', price: 85000, stock: 45, description: 'NIMC-certified optical biometric scanner with USB-C and Bluetooth for mobile NIN enrollments.', status: 'active', created_at: new Date().toISOString() },
      { id: 'item_002', name: 'Android Smart POS Terminal (4G + Thermal Printer)', category: 'POS Terminals', price: 120000, stock: 20, description: 'Pre-provisioned HambakTech agency banking POS terminal with direct Moniepoint virtual settlement.', status: 'active', created_at: new Date().toISOString() },
      { id: 'item_003', name: 'Enterprise VTU Reseller API Developer Key (Annual)', category: 'Software License', price: 50000, stock: 999, description: 'Unlimited 99.9% uptime telecom and verification API webhooks with zero rate limits.', status: 'active', created_at: new Date().toISOString() },
    ],
    academy_courses: [
      { id: 'crs_001', title: 'Nigerian VTU Business Mastery & Automated Sells', level: 'Beginner to Pro', duration: '4 Weeks', modules_count: 8, price: 15000, description: 'Learn how to generate ₦150k - ₦500k monthly reselling data, airtime, and utility tokens with zero upfront inventory.', status: 'enrolling', created_at: new Date().toISOString() },
      { id: 'crs_002', title: 'NIMC Identity Verification Agent Licensing Course', level: 'Professional', duration: '6 Weeks', modules_count: 12, price: 35000, description: 'Comprehensive compliance and software operating certification for authorized NIN and BVN slip enrollment centers.', status: 'enrolling', created_at: new Date().toISOString() },
      { id: 'crs_003', title: 'Agency Banking & POS Terminal Fleet Operations', level: 'Intermediate', duration: '2 Weeks', modules_count: 6, price: 20000, description: 'Managing cash-in cash-out (CICO), float balancing, Moniepoint settlement gateways, and dispute resolution.', status: 'enrolling', created_at: new Date().toISOString() },
    ],
    provider_configs: [
      {
        id: '2sureverify',
        name: '2SureVerify Gateway (Primary)',
        base_url: 'https://2sureverify.com',
        api_key: '664469ea92436a4c7ff997281a32a742dcd84f9a5e6603f0',
        is_active: true,
        is_default: true,
        timeout_seconds: 30,
        last_ping_status: 'operational',
        last_ping_time: new Date().toISOString(),
        last_ping_latency: 185,
      },
      {
        id: 'veripine',
        name: 'Veripine Identity API (Secondary Failover)',
        base_url: 'https://api.veripine.com/v1',
        api_key: 'ninbvn_6443d1d6279df9af26b60dc4',
        is_active: true,
        is_default: false,
        timeout_seconds: 30,
        last_ping_status: 'operational',
        last_ping_time: new Date().toISOString(),
        last_ping_latency: 210,
      },
    ],
    provider_logs: [],
    identity_services: [
      // 1. NIN Verification
      { key: 'nin_v1', name: 'NIN Verification (V1 Standard)', category: 'NIN Verification', wholesale_cost: 85, selling_price: 200, provider: '2sureverify', endpoint: '/api/v1/nin_v1.php', enabled: true, required_fields: ['nin', 'slip_type'], description: 'Direct NIMC lookup with slip style selection (ninBasic, ninStandard, ninPremium, ninVnin, ninSpecial).', slip_type_supported: true },
      { key: 'nin_v2', name: 'NIN Verification (V2 Multi-Tier)', category: 'NIN Verification', wholesale_cost: 95, selling_price: 220, provider: '2sureverify', endpoint: '/api/v1/nin_v2.php', enabled: true, required_fields: ['nin', 'tier'], description: 'Multi-tier NIN verification with tier selection (basic, standard, premium, regular, vnin, vip).' },
      { key: 'nin_v3', name: 'NIN Verification (V3 5-Version Selector)', category: 'NIN Verification', wholesale_cost: 97, selling_price: 250, provider: '2sureverify', endpoint: '/api/v1/nin_v3.php', enabled: true, required_fields: ['nin', 'tier', 'slip_type'], description: '5 independent upstream verification versions with custom slip styling.', slip_type_supported: true },
      { key: 'phone_v1', name: 'Phone Verification (V1)', category: 'NIN Verification', wholesale_cost: 85, selling_price: 200, provider: '2sureverify', endpoint: '/api/v1/phone_v1.php', enabled: true, required_fields: ['phone', 'slip_type'], description: 'Locate linked NIN record using registered Nigerian SIM card.', slip_type_supported: true },
      { key: 'phone_v2', name: 'Phone Verification (V2 Multi-Tier)', category: 'NIN Verification', wholesale_cost: 95, selling_price: 220, provider: '2sureverify', endpoint: '/api/v1/phone_v2.php', enabled: true, required_fields: ['phone', 'tier'], description: 'Phone to NIN matching across basic, standard, premium and VIP tiers.' },
      { key: 'phone_v3', name: 'Phone Verification (V3 5-Version)', category: 'NIN Verification', wholesale_cost: 102, selling_price: 250, provider: '2sureverify', endpoint: '/api/v1/phone_v3.php', enabled: true, required_fields: ['phone', 'tier', 'slip_type'], description: '5-version phone to NIN resolution with slip generation.', slip_type_supported: true },
      { key: 'demo_v1', name: 'Demographic Verification (V1)', category: 'NIN Verification', wholesale_cost: 90, selling_price: 200, provider: '2sureverify', endpoint: '/api/v1/demo_v1.php', enabled: true, required_fields: ['firstname', 'lastname', 'dob', 'gender'], description: 'Search and confirm NIN matching name, birth date, and gender.' },
      { key: 'demo_v2', name: 'Demographic Verification (V2)', category: 'NIN Verification', wholesale_cost: 95, selling_price: 220, provider: '2sureverify', endpoint: '/api/v1/demo_v2.php', enabled: true, required_fields: ['firstname', 'lastname', 'dob', 'gender', 'tier'], description: 'Multi-tier demographic match search.' },
      { key: 'demo_v3', name: 'Demographic Verification (V3)', category: 'NIN Verification', wholesale_cost: 97, selling_price: 250, provider: '2sureverify', endpoint: '/api/v1/demo_v3.php', enabled: true, required_fields: ['firstname', 'lastname', 'dob', 'gender', 'tier', 'slip_type'], description: 'Extended demographic matching with slip generation.', slip_type_supported: true },
      { key: 'vnin_verification', name: 'Virtual NIN (VNIN) Verification', category: 'NIN Verification', wholesale_cost: 95, selling_price: 200, provider: '2sureverify', endpoint: '/api/v1/nin_v2.php', enabled: true, required_fields: ['nin'], description: 'Verify enterprise 16-character virtual NIN or generate verifiable record.' },

      // 2. BVN Verification
      { key: 'bvn_v1', name: 'BVN Verification (V1 Standard)', category: 'BVN Verification', wholesale_cost: 85, selling_price: 250, provider: '2sureverify', endpoint: '/api/v1/bvn_v1.php', enabled: true, required_fields: ['bvn', 'slip_type'], description: 'Bank Verification Number validation with slip choice (bvnBasic, bvnAdvanced, plasticBvn).', slip_type_supported: true },
      { key: 'bvn_v2', name: 'BVN Verification (V2)', category: 'BVN Verification', wholesale_cost: 85, selling_price: 250, provider: '2sureverify', endpoint: '/api/v1/bvn_v2.php', enabled: true, required_fields: ['bvn'], description: 'Standard Central Bank of Nigeria BVN biometric record check.' },
      { key: 'bvn_v3', name: 'BVN Verification (V3 Multi-Version)', category: 'BVN Verification', wholesale_cost: 85, selling_price: 250, provider: '2sureverify', endpoint: '/api/v1/bvn_v3.php', enabled: true, required_fields: ['bvn', 'tier', 'slip_type'], description: '5-version BVN biometric query with document printing.', slip_type_supported: true },
      { key: 'bvn_retrieval', name: 'BVN Retrieval by Phone', category: 'BVN Verification', wholesale_cost: 700, selling_price: 1200, provider: '2sureverify', endpoint: '/api/v1/bvn_retrieval.php', enabled: true, required_fields: ['phone'], description: 'Retrieve 11-digit BVN linked to a phone number.' },

      // 3. NIN Modification (all 16 services)
      { key: 'nin_mod_name', name: 'NIN Name Modification', category: 'NIN Modification', wholesale_cost: 4000, selling_price: 6000, provider: '2sureverify', endpoint: '/api/v1/nin_mod_name.php', enabled: true, required_fields: ['nin', 'first_name', 'last_name'], description: 'Official correction of first name, middle name, or surname.' },
      { key: 'nin_mod_phone', name: 'NIN Phone Number Modification', category: 'NIN Modification', wholesale_cost: 4000, selling_price: 6000, provider: '2sureverify', endpoint: '/api/v1/nin_mod_phone.php', enabled: true, required_fields: ['nin', 'phone'], description: 'Update telephone number registered on NIMC database.' },
      { key: 'nin_mod_address', name: 'NIN Address Modification', category: 'NIN Modification', wholesale_cost: 4000, selling_price: 6000, provider: '2sureverify', endpoint: '/api/v1/nin_mod_address.php', enabled: true, required_fields: ['nin', 'address', 'state', 'lga'], description: 'Update residential address, state, or LGA.' },
      { key: 'nin_mod_dob', name: 'NIN Date of Birth Modification', category: 'NIN Modification', wholesale_cost: 53000, selling_price: 65000, provider: '2sureverify', endpoint: '/api/v1/nin_mod_dob.php', enabled: true, required_fields: ['nin', 'dob'], description: 'Official NIMC date of birth modification with affidavit.' },
      { key: 'nin_mod_dob_name', name: 'NIN Name & DOB Modification', category: 'NIN Modification', wholesale_cost: 58000, selling_price: 72000, provider: '2sureverify', endpoint: '/api/v1/nin_mod_dob_name.php', enabled: true, required_fields: ['nin', 'first_name', 'last_name', 'dob'], description: 'Simultaneous correction of full names and date of birth.' },
      { key: 'nin_mod_name_phone', name: 'NIN Name & Phone Modification', category: 'NIN Modification', wholesale_cost: 8000, selling_price: 12000, provider: '2sureverify', endpoint: '/api/v1/nin_mod_name_phone.php', enabled: true, required_fields: ['nin', 'first_name', 'last_name', 'phone'], description: 'Simultaneous update of names and registered telephone number.' },
      { key: 'gender_modification', name: 'NIN Gender Modification', category: 'NIN Modification', wholesale_cost: 5000, selling_price: 7500, provider: '2sureverify', endpoint: '/api/v1/gender_modification.php', enabled: true, required_fields: ['nin', 'gender'], description: 'Correction of gender classification on identity record.' },
      { key: 'suspended_modification', name: 'Suspended NIN Modification', category: 'NIN Modification', wholesale_cost: 23000, selling_price: 30000, provider: '2sureverify', endpoint: '/api/v1/suspended_modification.php', enabled: true, required_fields: ['nin', 'tracking_id'], description: 'Rectification and lifting of suspension on flagged NIN.' },
      { key: 'bvn_generated_modification', name: 'BVN Generated NIN Modification', category: 'NIN Modification', wholesale_cost: 22000, selling_price: 28000, provider: '2sureverify', endpoint: '/api/v1/bvn_generated_modification.php', enabled: true, required_fields: ['nin', 'bvn'], description: 'Upgrade and bio-capture modification for auto-generated BVN-NINs.' },
      { key: 'child_modification', name: 'Child NIN Modification', category: 'NIN Modification', wholesale_cost: 13000, selling_price: 18000, provider: '2sureverify', endpoint: '/api/v1/child_modification.php', enabled: true, required_fields: ['nin', 'parent_nin'], description: 'Update child identity record with parental consent linkage.' },
      { key: 'nin_over_age', name: 'Over-Age NIN Modification', category: 'NIN Modification', wholesale_cost: 10000, selling_price: 15000, provider: '2sureverify', endpoint: '/api/v1/nin_over_age.php', enabled: true, required_fields: ['nin', 'age_range'], description: 'Age bracket adjustment (5-9, 10-15, 15-20 years).' },
      { key: 'second_nin_mod_name', name: 'Second NIN Name Mod (No Email/Pass)', category: 'NIN Modification', wholesale_cost: 70000, selling_price: 85000, provider: '2sureverify', endpoint: '/api/v1/second_nin_mod_name.php', enabled: true, required_fields: ['nin', 'first_name', 'last_name'], description: 'Secondary NIN name modification without email or password auth.' },
      { key: 'second_nin_mod_phone', name: 'Second NIN Phone Mod (No Email/Pass)', category: 'NIN Modification', wholesale_cost: 18000, selling_price: 25000, provider: '2sureverify', endpoint: '/api/v1/second_nin_mod_phone.php', enabled: true, required_fields: ['nin', 'phone'], description: 'Secondary NIN phone number modification without email or password auth.' },
      { key: 'second_nin_mod_name_auth', name: 'Second NIN Name Mod (With Email/Pass)', category: 'NIN Modification', wholesale_cost: 10000, selling_price: 15000, provider: '2sureverify', endpoint: '/api/v1/second_nin_mod_name_auth.php', enabled: true, required_fields: ['nin', 'first_name', 'last_name', 'portal_email', 'portal_password'], description: 'Second NIN name modification using self-service credentials.' },
      { key: 'second_nin_mod_phone_auth', name: 'Second NIN Phone Mod (With Email/Pass)', category: 'NIN Modification', wholesale_cost: 10000, selling_price: 15000, provider: '2sureverify', endpoint: '/api/v1/second_nin_mod_phone_auth.php', enabled: true, required_fields: ['nin', 'phone', 'portal_email', 'portal_password'], description: 'Second NIN phone modification using self-service credentials.' },
      { key: 'bvn_modification', name: 'BVN Modification (Bank Specific)', category: 'NIN Modification', wholesale_cost: 14000, selling_price: 18000, provider: '2sureverify', endpoint: '/api/v1/bvn_modification.php', enabled: true, required_fields: ['bvn', 'bank_name', 'modification_details'], description: 'Official NIBSS bank-specific BVN record modification.' },

      // 4. Personalisation
      { key: 'personalization', name: 'NIMC Personalisation (1)', category: 'Personalisation', wholesale_cost: 170, selling_price: 350, provider: '2sureverify', endpoint: '/api/v1/personalization.php', enabled: true, required_fields: ['nin'], description: 'High-res biometric photo personalisation and card stamping.' },
      { key: 'personalization_2', name: 'NIMC Personalisation (2)', category: 'Personalisation', wholesale_cost: 140, selling_price: 300, provider: '2sureverify', endpoint: '/api/v1/personalization_2.php', enabled: true, required_fields: ['nin'], description: 'Secondary digital personalisation engine.' },

      // 5. Enrolment
      { key: 'bvn_enroll_adult', name: 'BVN Enrolment (Adult)', category: 'Enrolment', wholesale_cost: 10000, selling_price: 15000, provider: '2sureverify', endpoint: '/api/v1/bvn_enroll_adult.php', enabled: true, required_fields: ['nin', 'first_name', 'last_name', 'phone', 'bank_name'], description: 'Full biometric adult BVN enrolment registration.' },
      { key: 'bvn_enroll_child', name: 'BVN Enrolment (Child)', category: 'Enrolment', wholesale_cost: 8000, selling_price: 12000, provider: '2sureverify', endpoint: '/api/v1/bvn_enroll_child.php', enabled: true, required_fields: ['child_nin', 'parent_bvn', 'first_name', 'last_name'], description: 'Minor / Child biometric BVN enrolment registration.' },

      // 6. Additional Services
      { key: 'npc_attestation', name: 'National Population Commission (NPC) Attestation', category: 'Additional Services', wholesale_cost: 20000, selling_price: 26000, provider: '2sureverify', endpoint: '/api/v1/npc_attestation.php', enabled: true, required_fields: ['full_name', 'dob', 'state_of_origin', 'lga'], description: 'Official Federal Government NPC birth attestation certificate.' },
      { key: 'newspaper', name: 'National Newspaper Publication (Change of Name)', category: 'Additional Services', wholesale_cost: 1500, selling_price: 2500, provider: '2sureverify', endpoint: '/api/v1/newspaper.php', enabled: true, required_fields: ['old_name', 'new_name', 'address', 'reason'], description: 'Gazetted national daily change of name publication with clipping.' },
      { key: 'cac_business', name: 'CAC Business Name Registration', category: 'Additional Services', wholesale_cost: 35000, selling_price: 45000, provider: '2sureverify', endpoint: '/api/v1/cac_business.php', enabled: true, required_fields: ['business_name', 'nature_of_business', 'proprietor_nin', 'proprietor_phone'], description: 'Full BN business registration certificate & status report from CAC.' },
      { key: 'cac_company', name: 'CAC Company Registration (Limited Liability)', category: 'Additional Services', wholesale_cost: 45000, selling_price: 60000, provider: '2sureverify', endpoint: '/api/v1/cac_company.php', enabled: true, required_fields: ['company_name', 'directors_count', 'share_capital', 'director_nins'], description: 'Full RC private limited company incorporation certificate.' },
      { key: 'tin_registration', name: 'Tax Identification Number (TIN) Registration', category: 'Additional Services', wholesale_cost: 1000, selling_price: 2000, provider: '2sureverify', endpoint: '/api/v1/tin_registration.php', enabled: true, required_fields: ['nin', 'business_name', 'email', 'phone'], description: 'Federal Inland Revenue Service (FIRS) / JTB Tax ID generation.' },
      { key: 'validation', name: 'NIN Validation & Sync', category: 'Additional Services', wholesale_cost: 700, selling_price: 1200, provider: '2sureverify', endpoint: '/api/v1/validation.php', enabled: true, required_fields: ['nin'], description: 'Real-time synchronization and validation of dormant or unlinked NIN.' },
      { key: 'ipe_clearance', name: 'IPE Clearance (Internal Processing Error)', category: 'Additional Services', wholesale_cost: 400, selling_price: 800, provider: '2sureverify', endpoint: '/api/v1/ipe_clearance.php', enabled: true, required_fields: ['nin', 'tracking_id'], description: 'Instant resolution of NIMC portal Internal Processing Error.' },
      { key: 'delinking', name: 'NIN / BVN Delinking', category: 'Additional Services', wholesale_cost: 3500, selling_price: 5000, provider: '2sureverify', endpoint: '/api/v1/delinking.php', enabled: true, required_fields: ['nin', 'bvn', 'phone'], description: 'Delinking wrongly associated BVN from NIMC profile.' },
    ],
    telecom_plans: [
      // MTN SME & Corporate
      { id: 'mtn_sme_500mb', provider_plan_id: 7, network: 'MTN', name: 'MTN SME 500MB (30 Days)', size: '500MB', type: 'SME', validity: '30 Days', wholesale_cost: 130, price: 150, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_sme_1gb', provider_plan_id: 8, network: 'MTN', name: 'MTN SME 1.0GB (30 Days)', size: '1GB', type: 'SME', validity: '30 Days', wholesale_cost: 245, price: 270, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_sme_2gb', provider_plan_id: 9, network: 'MTN', name: 'MTN SME 2.0GB (30 Days)', size: '2GB', type: 'SME', validity: '30 Days', wholesale_cost: 490, price: 540, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_sme_3gb', provider_plan_id: 10, network: 'MTN', name: 'MTN SME 3.0GB (30 Days)', size: '3GB', type: 'SME', validity: '30 Days', wholesale_cost: 735, price: 810, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_sme_5gb', provider_plan_id: 11, network: 'MTN', name: 'MTN SME 5.0GB (30 Days)', size: '5GB', type: 'SME', validity: '30 Days', wholesale_cost: 1225, price: 1350, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_sme_10gb', provider_plan_id: 12, network: 'MTN', name: 'MTN SME 10.0GB (30 Days)', size: '10GB', type: 'SME', validity: '30 Days', wholesale_cost: 2450, price: 2700, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_cg_1gb', provider_plan_id: 14, network: 'MTN', name: 'MTN Corporate Gifting 1.0GB', size: '1GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 260, price: 290, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_cg_2gb', provider_plan_id: 15, network: 'MTN', name: 'MTN Corporate Gifting 2.0GB', size: '2GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 520, price: 580, enabled: true, provider: 'ulamadata' },
      { id: 'mtn_cg_5gb', provider_plan_id: 16, network: 'MTN', name: 'MTN Corporate Gifting 5.0GB', size: '5GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 1300, price: 1450, enabled: true, provider: 'ulamadata' },

      // AIRTEL Corporate & Gifting
      { id: 'airtel_cg_500mb', provider_plan_id: 20, network: 'AIRTEL', name: 'Airtel Corporate 500MB', size: '500MB', type: 'Corporate', validity: '30 Days', wholesale_cost: 140, price: 160, enabled: true, provider: 'ulamadata' },
      { id: 'airtel_cg_1gb', provider_plan_id: 21, network: 'AIRTEL', name: 'Airtel Corporate 1.0GB', size: '1GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 265, price: 290, enabled: true, provider: 'ulamadata' },
      { id: 'airtel_cg_2gb', provider_plan_id: 22, network: 'AIRTEL', name: 'Airtel Corporate 2.0GB', size: '2GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 530, price: 580, enabled: true, provider: 'ulamadata' },
      { id: 'airtel_cg_5gb', provider_plan_id: 23, network: 'AIRTEL', name: 'Airtel Corporate 5.0GB', size: '5GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 1325, price: 1450, enabled: true, provider: 'ulamadata' },
      { id: 'airtel_cg_10gb', provider_plan_id: 24, network: 'AIRTEL', name: 'Airtel Corporate 10.0GB', size: '10GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 2650, price: 2900, enabled: true, provider: 'ulamadata' },

      // GLO Corporate & Direct
      { id: 'glo_cg_500mb', provider_plan_id: 30, network: 'GLO', name: 'Glo Corporate 500MB', size: '500MB', type: 'Corporate', validity: '30 Days', wholesale_cost: 125, price: 145, enabled: true, provider: 'ulamadata' },
      { id: 'glo_cg_1gb', provider_plan_id: 31, network: 'GLO', name: 'Glo Corporate 1.0GB', size: '1GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 240, price: 260, enabled: true, provider: 'ulamadata' },
      { id: 'glo_cg_2gb', provider_plan_id: 32, network: 'GLO', name: 'Glo Corporate 2.0GB', size: '2GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 480, price: 520, enabled: true, provider: 'ulamadata' },
      { id: 'glo_cg_3gb', provider_plan_id: 33, network: 'GLO', name: 'Glo Corporate 3.0GB', size: '3GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 720, price: 780, enabled: true, provider: 'ulamadata' },
      { id: 'glo_cg_5gb', provider_plan_id: 34, network: 'GLO', name: 'Glo Corporate 5.0GB', size: '5GB', type: 'Corporate', validity: '30 Days', wholesale_cost: 1200, price: 1300, enabled: true, provider: 'ulamadata' },

      // 9MOBILE SME & Corporate
      { id: '9mobile_sme_1gb', provider_plan_id: 40, network: '9MOBILE', name: '9mobile SME 1.0GB', size: '1GB', type: 'SME', validity: '30 Days', wholesale_cost: 220, price: 250, enabled: true, provider: 'ulamadata' },
      { id: '9mobile_sme_2gb', provider_plan_id: 41, network: '9MOBILE', name: '9mobile SME 2.0GB', size: '2GB', type: 'SME', validity: '30 Days', wholesale_cost: 440, price: 500, enabled: true, provider: 'ulamadata' },
      { id: '9mobile_sme_3gb', provider_plan_id: 42, network: '9MOBILE', name: '9mobile SME 3.0GB', size: '3GB', type: 'SME', validity: '30 Days', wholesale_cost: 660, price: 750, enabled: true, provider: 'ulamadata' },
      { id: '9mobile_sme_5gb', provider_plan_id: 43, network: '9MOBILE', name: '9mobile SME 5.0GB', size: '5GB', type: 'SME', validity: '30 Days', wholesale_cost: 1100, price: 1250, enabled: true, provider: 'ulamadata' },
    ],
    airtime_pin_denominations: [
      { id: 'mtn_pin_100', network: 'MTN', value: 100, wholesale_cost: 98, price: 100, enabled: true },
      { id: 'mtn_pin_200', network: 'MTN', value: 200, wholesale_cost: 196, price: 200, enabled: true },
      { id: 'mtn_pin_500', network: 'MTN', value: 500, wholesale_cost: 490, price: 500, enabled: true },
      { id: 'mtn_pin_1000', network: 'MTN', value: 1000, wholesale_cost: 980, price: 1000, enabled: true },
      { id: 'airtel_pin_100', network: 'AIRTEL', value: 100, wholesale_cost: 98, price: 100, enabled: true },
      { id: 'airtel_pin_200', network: 'AIRTEL', value: 200, wholesale_cost: 196, price: 200, enabled: true },
      { id: 'airtel_pin_500', network: 'AIRTEL', value: 500, wholesale_cost: 490, price: 500, enabled: true },
      { id: 'airtel_pin_1000', network: 'AIRTEL', value: 1000, wholesale_cost: 980, price: 1000, enabled: true },
      { id: 'glo_pin_100', network: 'GLO', value: 100, wholesale_cost: 97, price: 100, enabled: true },
      { id: 'glo_pin_200', network: 'GLO', value: 200, wholesale_cost: 194, price: 200, enabled: true },
      { id: 'glo_pin_500', network: 'GLO', value: 500, wholesale_cost: 485, price: 500, enabled: true },
      { id: '9mobile_pin_100', network: '9MOBILE', value: 100, wholesale_cost: 97, price: 100, enabled: true },
      { id: '9mobile_pin_200', network: '9MOBILE', value: 200, wholesale_cost: 194, price: 200, enabled: true },
    ],
    data_pin_denominations: [
      { id: 'mtn_dpin_1gb', network: 'MTN', name: 'MTN 1GB Data Card PIN', size: '1GB', wholesale_cost: 275, price: 320, enabled: true },
      { id: 'mtn_dpin_2gb', network: 'MTN', name: 'MTN 2GB Data Card PIN', size: '2GB', wholesale_cost: 550, price: 620, enabled: true },
      { id: 'mtn_dpin_5gb', network: 'MTN', name: 'MTN 5GB Data Card PIN', size: '5GB', wholesale_cost: 1375, price: 1550, enabled: true },
      { id: 'airtel_dpin_1gb', network: 'AIRTEL', name: 'Airtel 1GB Data Card PIN', size: '1GB', wholesale_cost: 290, price: 340, enabled: true },
      { id: 'airtel_dpin_2gb', network: 'AIRTEL', name: 'Airtel 2GB Data Card PIN', size: '2GB', wholesale_cost: 580, price: 650, enabled: true },
      { id: 'glo_dpin_1gb', network: 'GLO', name: 'Glo 1GB Data Card PIN', size: '1GB', wholesale_cost: 260, price: 310, enabled: true },
    ],
    cable_packages: [
      { id: 'gotv_smallie', provider: 'gotv', name: 'GOtv Smallie Monthly', code: 'gotv-smallie', channels: 35, wholesale_cost: 1850, price: 1900, enabled: true },
      { id: 'gotv_jinja', provider: 'gotv', name: 'GOtv Jinja Bouquet', code: 'gotv-jinja', channels: 47, wholesale_cost: 4100, price: 4200, enabled: true },
      { id: 'gotv_jolli', provider: 'gotv', name: 'GOtv Jolli Bouquet', code: 'gotv-jolli', channels: 68, wholesale_cost: 6050, price: 6200, enabled: true },
      { id: 'gotv_max', provider: 'gotv', name: 'GOtv Max Bouquet', code: 'gotv-max', channels: 75, wholesale_cost: 8300, price: 8500, enabled: true },
      { id: 'gotv_supa', provider: 'gotv', name: 'GOtv Supa Bouquet', code: 'gotv-supa', channels: 85, wholesale_cost: 10750, price: 11000, enabled: true },
      { id: 'dstv_padi', provider: 'dstv', name: 'DStv Padi Bouquet', code: 'dstv-padi', channels: 45, wholesale_cost: 4300, price: 4400, enabled: true },
      { id: 'dstv_yanga', provider: 'dstv', name: 'DStv Yanga Bouquet', code: 'dstv-yanga', channels: 85, wholesale_cost: 5850, price: 6000, enabled: true },
      { id: 'dstv_confam', provider: 'dstv', name: 'DStv Confam Bouquet', code: 'dstv-confam', channels: 105, wholesale_cost: 10750, price: 11000, enabled: true },
      { id: 'dstv_compact', provider: 'dstv', name: 'DStv Compact Bouquet', code: 'dstv-compact', channels: 130, wholesale_cost: 18600, price: 19000, enabled: true },
      { id: 'dstv_compact_plus', provider: 'dstv', name: 'DStv Compact Plus', code: 'dstv-compact-plus', channels: 145, wholesale_cost: 30300, price: 31000, enabled: true },
      { id: 'dstv_premium', provider: 'dstv', name: 'DStv Premium Bouquet', code: 'dstv-premium', channels: 160, wholesale_cost: 43000, price: 44000, enabled: true },
      { id: 'startimes_nova', provider: 'startimes', name: 'Startimes Nova Bouquet', code: 'startimes-nova', channels: 30, wholesale_cost: 2100, price: 2200, enabled: true },
      { id: 'startimes_basic', provider: 'startimes', name: 'Startimes Basic Bouquet', code: 'startimes-basic', channels: 40, wholesale_cost: 3900, price: 4000, enabled: true },
      { id: 'startimes_smart', provider: 'startimes', name: 'Startimes Smart Bouquet', code: 'startimes-smart', channels: 47, wholesale_cost: 4700, price: 4800, enabled: true },
      { id: 'startimes_classic', provider: 'startimes', name: 'Startimes Classic Bouquet', code: 'startimes-classic', channels: 65, wholesale_cost: 5850, price: 6000, enabled: true },
      { id: 'startimes_super', provider: 'startimes', name: 'Startimes Super Bouquet', code: 'startimes-super', channels: 80, wholesale_cost: 8800, price: 9000, enabled: true },
      { id: 'showmax_mobile', provider: 'showmax', name: 'Showmax Mobile Only', code: 'showmax-mobile', channels: 1, wholesale_cost: 1500, price: 1600, enabled: true },
      { id: 'showmax_standard', provider: 'showmax', name: 'Showmax All Devices', code: 'showmax-standard', channels: 1, wholesale_cost: 3350, price: 3500, enabled: true },
    ],
    electricity_discos: [
      { id: 'ikedc', name: 'Ikeja Electric (IKEDC)', code: 'ikeja-electric', minimum_amount: 1000, enabled: true },
      { id: 'ekedc', name: 'Eko Electric (EKEDC)', code: 'eko-electric', minimum_amount: 1000, enabled: true },
      { id: 'aedc', name: 'Abuja Electricity (AEDC)', code: 'abuja-electric', minimum_amount: 1000, enabled: true },
      { id: 'ibedc', name: 'Ibadan Electricity (IBEDC)', code: 'ibadan-electric', minimum_amount: 1000, enabled: true },
      { id: 'kedco', name: 'Kano Electricity (KEDCO)', code: 'kano-electric', minimum_amount: 1000, enabled: true },
      { id: 'phed', name: 'Port Harcourt Electric (PHED)', code: 'portharcourt-electric', minimum_amount: 1000, enabled: true },
      { id: 'jed', name: 'Jos Electricity (JED)', code: 'jos-electric', minimum_amount: 1000, enabled: true },
      { id: 'kaedco', name: 'Kaduna Electricity (KAEDCO)', code: 'kaduna-electric', minimum_amount: 1000, enabled: true },
      { id: 'bedc', name: 'Benin Electricity (BEDC)', code: 'benin-electric', minimum_amount: 1000, enabled: true },
      { id: 'eedc', name: 'Enugu Electricity (EEDC)', code: 'enugu-electric', minimum_amount: 1000, enabled: true },
    ],
    exam_packages: [
      { id: 'waec_pin', exam_name: 'WAEC', name: 'WAEC Result Checker PIN & Serial', description: 'Access and verify official West African Senior School Certificate Examination results.', wholesale_cost: 3500, price: 3800, enabled: true },
      { id: 'neco_token', exam_name: 'NECO', name: 'NECO Official Result Token', description: 'Electronic token for viewing and printing National Examination Council June/July & Nov/Dec results.', wholesale_cost: 1550, price: 1800, enabled: true },
      { id: 'nabteb_pin', exam_name: 'NABTEB', name: 'NABTEB Result Scratch Card PIN', description: 'National Business and Technical Examinations Board result checker token.', wholesale_cost: 1500, price: 1800, enabled: true },
      { id: 'jamb_utme_pin', exam_name: 'JAMB', name: 'JAMB UTME Registration e-PIN', description: 'Joint Admissions and Matriculation Board Universal Tertiary Matriculation e-PIN profile code.', wholesale_cost: 8000, price: 8500, enabled: true },
      { id: 'jamb_de_pin', exam_name: 'JAMB', name: 'JAMB Direct Entry (DE) e-PIN', description: 'JAMB Direct Entry registration PIN for polytechnic and university diploma graduates.', wholesale_cost: 9000, price: 9500, enabled: true },
    ],
    airtime_swap_configs: [
      { network: 'MTN', conversion_rate_percent: 80, merchant_phone: '08134567890', ussd_code: '*600*recipient*amount*PIN#', enabled: true },
      { network: 'AIRTEL', conversion_rate_percent: 80, merchant_phone: '08023456789', ussd_code: '*432*1*recipient*amount*PIN#', enabled: true },
      { network: 'GLO', conversion_rate_percent: 75, merchant_phone: '08051234567', ussd_code: '*131*recipient*amount*PIN#', enabled: true },
      { network: '9MOBILE', conversion_rate_percent: 75, merchant_phone: '08091234567', ussd_code: '*223*PIN*amount*recipient#', enabled: true },
    ],
    bulk_sms_records: [],
    telecom_provider_configs: [
      { id: 'ulamadata', name: 'UlamaData High-Speed Gateway', base_url: 'https://ulamadata.com/api', api_key: '7aOkA4OzIF6xfuUIXbvk7ByxVGH0U5gSNy1OfpYb', is_active: true, is_default: true, timeout_seconds: 12 },
      { id: 'vtpass', name: 'VTpass Utility Bridge', base_url: 'https://api-service.vtpass.com/api', api_key: 'c0eb1581608e693f07a44b1e21b44b3a', is_active: true, is_default: false, timeout_seconds: 12 },
    ],
    smtp_config: {
      host: 'lon110.truehost.cloud',
      port: 587,
      username: 'support@hambaktech.com.ng',
      password: '',
      encryption: 'tls',
      sender_email: 'support@hambaktech.com.ng',
      sender_name: 'HambakTech Enterprise Mailer',
      reply_to_email: 'support@hambaktech.com.ng',
      last_tested_at: new Date().toISOString(),
      last_test_status: 'operational',
      last_test_message: 'LON110 SMTP handshake confirmed on port 587 (STARTTLS)',
      logs: [
        {
          id: 'smtplog_init_01',
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          recipient: 'admin@hambaktech.com.ng',
          subject: 'HambakTech LON110 SMTP Handshake Verified',
          status: 'sent',
        },
      ],
    },
    email_templates: [
      {
        id: 'tpl_reg',
        key: 'registration',
        name: 'Registration & Welcome',
        category: 'Auth',
        subject: 'Welcome to HambakTech Enterprise Portal, {{user_name}}!',
        description: 'Dispatched immediately when a new personal or corporate account is registered.',
        variables: ['user_name', 'email', 'login_url', 'company_name', 'support_email'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #020617; color: #f8fafc; border-radius: 8px;"><h2>Welcome to {{company_name}}!</h2><p>Hello <strong>{{user_name}}</strong>, your account is active.</p><p><a href="{{login_url}}" style="color: #10b981;">Sign In to Dashboard</a></p></div>',
      },
      {
        id: 'tpl_email_verif',
        key: 'email_verification',
        name: 'Email Verification',
        category: 'Auth',
        subject: 'Verify Your Email Address - {{verification_code}}',
        description: 'One-time security code sent to verify customer email address.',
        variables: ['user_name', 'verification_code', 'verification_link', 'expires_in'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #ffffff;"><h3>Verification Code</h3><p>Hello {{user_name}}, use code <strong>{{verification_code}}</strong> (valid {{expires_in}}).</p></div>',
      },
      {
        id: 'tpl_pw_reset',
        key: 'password_reset',
        name: 'Password Reset',
        category: 'Auth',
        subject: 'Reset Your Account Password [Action Required]',
        description: 'Secure authorization link to reset portal login credentials.',
        variables: ['user_name', 'reset_link', 'ip_address', 'expires_in'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #ffffff;"><h3>Password Reset Authorization</h3><p>Requested from IP {{ip_address}}.</p><p><a href="{{reset_link}}" style="color: #f59e0b;">Reset Password</a></p></div>',
      },
      {
        id: 'tpl_wallet_fund',
        key: 'wallet_funding',
        name: 'Wallet Funding',
        category: 'Wallet',
        subject: 'Wallet Credited: ₦{{amount}} [Ref: {{reference}}]',
        description: 'Instant notification whenever wallet balance is topped up.',
        variables: ['user_name', 'amount', 'new_balance', 'gateway', 'reference', 'date'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #020617; color: #10b981; border: 1px solid #10b981; border-radius: 8px;"><h3>Wallet Credited: +₦{{amount}}</h3><p style="color: #cbd5e1;">Balance: ₦{{new_balance}} &bull; Gateway: {{gateway}} &bull; Ref: {{reference}}</p></div>',
      },
      {
        id: 'tpl_pay_appr',
        key: 'payment_approval',
        name: 'Payment Approval',
        category: 'Wallet',
        subject: 'Payment Approved: ₦{{amount}} Credited to Wallet',
        description: 'Notification to customer when admin approves a manual bank transfer proof.',
        variables: ['user_name', 'amount', 'reference', 'approved_by', 'new_balance', 'date'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #ffffff;"><h3>Bank Transfer Approved</h3><p>₦{{amount}} credited by {{approved_by}}. Ref: {{reference}}.</p></div>',
      },
      {
        id: 'tpl_pay_rej',
        key: 'payment_rejection',
        name: 'Payment Rejection',
        category: 'Wallet',
        subject: 'Action Required: Payment Verification Unsuccessful [Ref: {{reference}}]',
        description: 'Sent when manual bank transfer proof is declined by administrative compliance.',
        variables: ['user_name', 'amount', 'reference', 'rejection_reason', 'support_email'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #fca5a5;"><h3>Payment Proof Declined</h3><p>Reason: {{rejection_reason}}</p></div>',
      },
      {
        id: 'tpl_txn_succ',
        key: 'successful_transactions',
        name: 'Successful Transactions',
        category: 'Transactions',
        subject: 'Transaction Successful: {{service_name}} [Ref: {{reference}}]',
        description: 'Dispatch receipt for data topups, airtime, Cable TV, electricity tokens, and NIN verification.',
        variables: ['user_name', 'service_name', 'amount', 'recipient', 'reference', 'status', 'token_or_pin', 'date'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #020617; color: #ffffff; border-radius: 8px;"><h3>Receipt: {{service_name}}</h3><p>Amount: ₦{{amount}} | Token: {{token_or_pin}} | Ref: {{reference}}</p></div>',
      },
      {
        id: 'tpl_txn_fail',
        key: 'failed_transactions',
        name: 'Failed Transactions',
        category: 'Transactions',
        subject: 'Transaction Notice: {{service_name}} Failed (Wallet Refunded)',
        description: 'Carrier network timeout or failure notice with automatic instant wallet refund receipt.',
        variables: ['user_name', 'service_name', 'amount', 'reference', 'error_reason', 'new_balance'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #f87171;"><h3>Transaction Failed (Refunded)</h3><p>₦{{amount}} refunded. Reason: {{error_reason}}</p></div>',
      },
      {
        id: 'tpl_txn_pend',
        key: 'pending_transactions',
        name: 'Pending Transactions',
        category: 'Transactions',
        subject: 'Order Processing: {{service_name}} [Ref: {{reference}}]',
        description: 'Notice dispatched when telecom or utility provider queues an order for background clearance.',
        variables: ['user_name', 'service_name', 'amount', 'reference', 'estimated_time'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #38bdf8;"><h3>Order Queued</h3><p>{{service_name}} is processing. Ref: {{reference}}</p></div>',
      },
      {
        id: 'tpl_serv_res',
        key: 'service_results',
        name: 'Service Results',
        category: 'Services',
        subject: 'Certified {{id_type}} Verification Slip Ready: {{tracking_id}}',
        description: 'Official notice containing verification tracking ID and link to download certified slip.',
        variables: ['user_name', 'id_type', 'search_value', 'tracking_id', 'download_url', 'date'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #020617; color: #38bdf8;"><h3>Verified Slip: {{tracking_id}}</h3><p><a href="{{download_url}}">Download Certified Slip</a></p></div>',
      },
      {
        id: 'tpl_acc_sec',
        key: 'account_security',
        name: 'Account Security',
        category: 'Security',
        subject: 'Security Alert: {{security_event}} on Your HambakTech Account',
        description: 'Critical notification on password updates, transaction PIN changes, or login from new IP address.',
        variables: ['user_name', 'security_event', 'device_info', 'ip_address', 'timestamp', 'support_url'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #f59e0b;"><h3>Security Event: {{security_event}}</h3><p>Time: {{timestamp}} | IP: {{ip_address}}</p></div>',
      },
      {
        id: 'tpl_adm_alert',
        key: 'admin_alerts',
        name: 'Admin Alerts',
        category: 'Admin',
        subject: '[SYSTEM ALERT] {{alert_type}} - Attention Required',
        description: 'Super administrator broadcast for low carrier balances or gateway downtime.',
        variables: ['alert_type', 'details', 'provider_name', 'current_balance', 'timestamp'],
        is_active: true,
        updated_at: new Date().toISOString(),
        html_body: '<div style="font-family: Arial, sans-serif; padding: 24px; background: #020617; color: #ef4444; border: 1px solid #ef4444;"><h3>Alert: {{alert_type}}</h3><p>{{details}}</p></div>',
      },
    ],
    sms_config: {
      provider: 'termii',
      api_key: 'termii_sec_7a09f872b26c449018e69',
      sender_id: 'HAMBAKTECH',
      route: 'generic',
      webhook_url: 'https://hambaktech.com.ng/api/telecom/bulksms/webhook',
      enabled: true,
      balance_units: 4850,
      templates: [
        {
          id: 'sms_tpl_1',
          key: 'registration',
          title: 'Welcome SMS',
          content: 'Welcome to HambakTech Enterprise, {{user_name}}! Your wallet is active. Top up and verify NIN/data instantly at hambaktech.com.ng',
          variables: ['user_name'],
          is_active: true,
        },
        {
          id: 'sms_tpl_2',
          key: 'otp',
          title: 'OTP Authorization Code',
          content: 'Your HambakTech security code is {{otp_code}}. Valid for 10 minutes. NEVER disclose this code to anyone.',
          variables: ['otp_code'],
          is_active: true,
        },
        {
          id: 'sms_tpl_3',
          key: 'wallet_funding',
          title: 'Wallet Credit Alert',
          content: 'Credit Alert: ₦{{amount}} credited to your HambakTech wallet. Balance: ₦{{balance}}. Ref: {{reference}}',
          variables: ['amount', 'balance', 'reference'],
          is_active: true,
        },
        {
          id: 'sms_tpl_4',
          key: 'transaction_receipt',
          title: 'Transaction Delivery Receipt',
          content: 'Delivered: {{service_name}} of ₦{{amount}} for {{recipient}} processed. Token/Pin: {{token_or_pin}}. Ref: {{reference}}',
          variables: ['service_name', 'amount', 'recipient', 'token_or_pin', 'reference'],
          is_active: true,
        },
        {
          id: 'sms_tpl_5',
          key: 'security_alert',
          title: 'Security Alert SMS',
          content: 'HambakTech Security: {{security_event}} updated on your account. If unauthorized, call support immediately.',
          variables: ['security_event'],
          is_active: true,
        },
      ],
      logs: [
        {
          id: 'smslog_01',
          timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
          recipient: '+2348123456789',
          message: 'Welcome to HambakTech Enterprise, Fatimoh Musbau! Your wallet is active.',
          units: 1,
          status: 'delivered',
        },
      ],
    },
    store_settings: {
      store_name: 'HambakTech Hardware & Developer Store',
      status: 'coming_soon',
      coming_soon_message: 'Official launch in Phase 5. NIMC hardware allocation and agency terminal stock being staged.',
      currency: 'NGN',
      notification_email: 'orders@hambaktech.com.ng',
      delivery_policy: 'Nationwide expedited courier delivery across all 36 Nigerian states & FCT Abuja.',
      allow_preorders: true,
    },
    academy_settings: {
      academy_name: 'HambakTech VTU & Identity Reseller Academy',
      status: 'coming_soon',
      coming_soon_message: 'Accreditation syllabus under review with regulatory partners. Pre-enrollment waitlist open.',
      instructor_lead: 'Bakar Hambak (Certified NIMC Infrastructure Lead)',
      certificate_issuer: 'Hambak Technologies Enterprise Institute',
      allow_waitlist: true,
    },
    reports_settings: {
      status: 'coming_soon',
      coming_soon_message: 'Enterprise financial reconciliation engine rolling out with sub-reseller downlines in Phase 5.',
      default_range: '30d',
      timezone: 'Africa/Lagos (WAT)',
      auto_export_email: 'finance@hambaktech.com.ng',
    },
    customer_messages: [
      {
        id: 'msg_001',
        user_id: 'usr_customer_demo',
        title: 'NIN Slip Verification Verified & Ready',
        category: 'service',
        body: 'Your NIMC Premium NIN slip verification for 12345678901 was completed successfully. You can download your high-resolution verified slip with official tracking ID NIN-VRF-9827391.',
        read: false,
        reference: '2SV_NIN_INIT_002',
        action_label: 'View Verification Record',
        action_link: 'nin',
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
      {
        id: 'msg_002',
        user_id: 'usr_customer_demo',
        title: 'Security Notice: Transaction PIN Default Set',
        category: 'security',
        body: 'A default transaction PIN (1234) has been provisioned for testing purposes. We recommend updating your 4-digit PIN in Settings before running live high-value commercial transactions.',
        read: false,
        action_label: 'Update Security PIN',
        action_link: 'settings',
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 'msg_003',
        user_id: 'all',
        title: 'System Notice: TrueHost LON110 Tier-3 Redundancy Active',
        category: 'system',
        body: 'All telecom and identity verification adapters are operating with sub-second failover between 2SureVerify, Veripine, and UlamaData nodes.',
        read: true,
        created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
      },
    ],
  };
}

export function initDatabase(): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbData = JSON.parse(raw);
      const defaults = getDefaultData();
      if (!dbData.branding) dbData.branding = defaults.branding;
      if (!dbData.cms_sections) dbData.cms_sections = defaults.cms_sections;
      if (!dbData.announcements) dbData.announcements = defaults.announcements;
      if (!dbData.faqs) dbData.faqs = defaults.faqs;
      if (!dbData.navigation) dbData.navigation = defaults.navigation;
      if (!dbData.dashboard_modules) dbData.dashboard_modules = defaults.dashboard_modules;
      if (!dbData.store_items) dbData.store_items = defaults.store_items;
      if (!dbData.academy_courses) dbData.academy_courses = defaults.academy_courses;
      if (!dbData.identity_services) dbData.identity_services = defaults.identity_services;
      if (!dbData.provider_configs) dbData.provider_configs = defaults.provider_configs;
      if (!dbData.provider_logs) dbData.provider_logs = defaults.provider_logs || [];
      if (!dbData.telecom_plans) dbData.telecom_plans = defaults.telecom_plans;
      if (!dbData.airtime_pin_denominations) dbData.airtime_pin_denominations = defaults.airtime_pin_denominations;
      if (!dbData.data_pin_denominations) dbData.data_pin_denominations = defaults.data_pin_denominations;
      if (!dbData.cable_packages) dbData.cable_packages = defaults.cable_packages;
      if (!dbData.electricity_discos) dbData.electricity_discos = defaults.electricity_discos;
      if (!dbData.exam_packages) dbData.exam_packages = defaults.exam_packages;
      if (!dbData.airtime_swap_configs) dbData.airtime_swap_configs = defaults.airtime_swap_configs;
      if (!dbData.bulk_sms_records) dbData.bulk_sms_records = [];
      if (!dbData.telecom_provider_configs) dbData.telecom_provider_configs = defaults.telecom_provider_configs;
      if (!dbData.smtp_config) dbData.smtp_config = defaults.smtp_config;
      if (!dbData.email_templates) dbData.email_templates = defaults.email_templates;
      if (!dbData.sms_config) dbData.sms_config = defaults.sms_config;
      if (!dbData.store_settings) dbData.store_settings = defaults.store_settings;
      if (!dbData.academy_settings) dbData.academy_settings = defaults.academy_settings;
      if (!dbData.reports_settings) dbData.reports_settings = defaults.reports_settings;
      if (!dbData.customer_messages) dbData.customer_messages = defaults.customer_messages;

      // Ensure demo users have default transaction PIN 1234
      for (const u of dbData.users) {
        if (!u.transaction_pin_hash) {
          u.transaction_pin_hash = hashPassword('1234');
        }
      }
      saveDatabase();
    } else {
      dbData = getDefaultData();
      saveDatabase();
    }
  } catch (err) {
    console.warn('Database initialization warning, resetting to defaults:', err);
    dbData = getDefaultData();
    saveDatabase();
  }
}

export function saveDatabase(): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save database file:', err);
  }
}

// Data access helpers
export const db = {
  saveDatabase(): void {
    saveDatabase();
  },
  get data() {
    if (!dbData) initDatabase();
    return dbData;
  },

  // Users
  findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  },
  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const newUser: User = {
      ...user,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    saveDatabase();
    return newUser;
  },
  updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    saveDatabase();
    return this.data.users[idx];
  },

  // Wallets & Transactions
  adjustBalance(userId: string, delta: number, category: Transaction['category'], description: string, gateway: Transaction['gateway'] = 'internal', metadata?: any): { user: User; transaction: Transaction } {
    const user = this.findUserById(userId);
    if (!user) throw new Error('User not found');
    if (delta < 0 && user.wallet_balance + delta < 0) {
      throw new Error(`Insufficient wallet balance. Available: ₦${user.wallet_balance.toLocaleString()}, Required: ₦${Math.abs(delta).toLocaleString()}`);
    }

    const balanceBefore = user.wallet_balance;
    const balanceAfter = balanceBefore + delta;
    user.wallet_balance = balanceAfter;
    user.updated_at = new Date().toISOString();

    const transaction: Transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      type: delta >= 0 ? 'credit' : 'debit',
      amount: Math.abs(delta),
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      category,
      reference: metadata?.reference || `REF_${Date.now()}`,
      gateway,
      status: 'successful',
      description,
      metadata,
      created_at: new Date().toISOString(),
    };

    this.data.transactions.unshift(transaction);
    saveDatabase();
    return { user, transaction };
  },

  // Notifications
  addNotification(userId: string, title: string, message: string, type: Notification['type'] = 'info'): Notification {
    const notif: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
    };
    this.data.notifications.unshift(notif);
    saveDatabase();
    return notif;
  },

  // Audit
  logAudit(action: string, details: any, userId?: string, userEmail?: string, ip?: string): void {
    const audit: AuditLog = {
      id: `audit_${Date.now()}`,
      user_id: userId,
      user_email: userEmail,
      action,
      details,
      ip,
      created_at: new Date().toISOString(),
    };
    this.data.audit_logs.unshift(audit);
    // Keep max 500 audit logs
    if (this.data.audit_logs.length > 500) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 500);
    }
    saveDatabase();
  },

  // Settings
  updateSettings(updates: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    saveDatabase();
    return this.data.settings;
  },

  // Branding
  updateBranding(updates: Partial<BrandSettings>): BrandSettings {
    this.data.branding = { ...this.data.branding, ...updates };
    saveDatabase();
    return this.data.branding;
  },

  // CMS Sections
  updateCmsSections(updates: Partial<CmsSections>): CmsSections {
    this.data.cms_sections = { ...this.data.cms_sections, ...updates };
    saveDatabase();
    return this.data.cms_sections;
  },

  // Page Visibility
  updatePageVisibility(visibility: Partial<CmsSections['pageVisibility']>): CmsSections['pageVisibility'] {
    this.data.cms_sections.pageVisibility = {
      ...this.data.cms_sections.pageVisibility,
      ...visibility,
    };
    saveDatabase();
    return this.data.cms_sections.pageVisibility;
  },

  // Announcements
  createAnnouncement(announcement: Omit<AnnouncementItem, 'id' | 'created_at'>): AnnouncementItem {
    const item: AnnouncementItem = {
      ...announcement,
      id: `anc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    this.data.announcements.unshift(item);
    saveDatabase();
    return item;
  },
  updateAnnouncement(id: string, updates: Partial<AnnouncementItem>): AnnouncementItem | undefined {
    const idx = this.data.announcements.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    this.data.announcements[idx] = { ...this.data.announcements[idx], ...updates };
    saveDatabase();
    return this.data.announcements[idx];
  },
  deleteAnnouncement(id: string): boolean {
    const before = this.data.announcements.length;
    this.data.announcements = this.data.announcements.filter(a => a.id !== id);
    saveDatabase();
    return this.data.announcements.length < before;
  },

  // FAQs
  createFaq(faq: Omit<FaqItem, 'id'>): FaqItem {
    const item: FaqItem = {
      ...faq,
      id: `faq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.data.faqs.push(item);
    saveDatabase();
    return item;
  },
  updateFaq(id: string, updates: Partial<FaqItem>): FaqItem | undefined {
    const idx = this.data.faqs.findIndex(f => f.id === id);
    if (idx === -1) return undefined;
    this.data.faqs[idx] = { ...this.data.faqs[idx], ...updates };
    saveDatabase();
    return this.data.faqs[idx];
  },
  deleteFaq(id: string): boolean {
    const before = this.data.faqs.length;
    this.data.faqs = this.data.faqs.filter(f => f.id !== id);
    saveDatabase();
    return this.data.faqs.length < before;
  },

  // Navigation
  updateNavigation(items: NavMenuItem[]): NavMenuItem[] {
    this.data.navigation = items;
    saveDatabase();
    return this.data.navigation;
  },

  // Provider Calls Audit Logging
  logProviderCall(provider: string, endpoint: string, method: string, statusCode: number, reqBody: any, resBody: any, latencyMs: number, reference: string | null = null): ProviderLog {
    if (!this.data.provider_logs) this.data.provider_logs = [];
    const log: ProviderLog = {
      id: `plog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      provider,
      endpoint,
      method,
      status_code: statusCode,
      request_body: reqBody ? JSON.stringify(reqBody) : null,
      response_body: resBody ? JSON.stringify(resBody) : null,
      latency_ms: latencyMs,
      reference,
      created_at: new Date().toISOString(),
    };
    this.data.provider_logs.unshift(log);
    // keep max 500 logs in memory
    if (this.data.provider_logs.length > 500) {
      this.data.provider_logs = this.data.provider_logs.slice(0, 500);
    }
    saveDatabase();
    return log;
  },

  // -------------------------------------------------------------
  // PHASE 8: SMTP, SMS, STORE, ACADEMY, REPORTS, MESSAGES HELPERS
  // -------------------------------------------------------------

  // SMTP Settings
  updateSmtpConfig(updates: Partial<SmtpConfigItem>): SmtpConfigItem {
    this.data.smtp_config = {
      ...this.data.smtp_config,
      ...updates,
    };
    saveDatabase();
    return this.data.smtp_config;
  },

  logSmtpEmail(recipient: string, subject: string, status: 'sent' | 'simulated' | 'failed', error?: string): SmtpLogItem {
    if (!this.data.smtp_config.logs) this.data.smtp_config.logs = [];
    const log: SmtpLogItem = {
      id: `smtplog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      recipient,
      subject,
      status,
      error,
    };
    this.data.smtp_config.logs.unshift(log);
    if (this.data.smtp_config.logs.length > 200) {
      this.data.smtp_config.logs = this.data.smtp_config.logs.slice(0, 200);
    }
    saveDatabase();
    return log;
  },

  // Email Templates
  updateEmailTemplate(id: string, updates: Partial<EmailTemplateItem>): EmailTemplateItem | null {
    const idx = this.data.email_templates.findIndex(t => t.id === id || t.key === id);
    if (idx === -1) return null;
    this.data.email_templates[idx] = {
      ...this.data.email_templates[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    saveDatabase();
    return this.data.email_templates[idx];
  },

  // SMS Configuration
  updateSmsConfig(updates: Partial<SmsConfigItem>): SmsConfigItem {
    this.data.sms_config = {
      ...this.data.sms_config,
      ...updates,
    };
    saveDatabase();
    return this.data.sms_config;
  },

  logSmsDispatch(recipient: string, message: string, units: number, status: 'delivered' | 'simulated' | 'failed'): SmsLogItem {
    if (!this.data.sms_config.logs) this.data.sms_config.logs = [];
    const log: SmsLogItem = {
      id: `smslog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      recipient,
      message,
      units,
      status,
    };
    this.data.sms_config.logs.unshift(log);
    if (this.data.sms_config.balance_units >= units && status !== 'failed') {
      this.data.sms_config.balance_units -= units;
    }
    if (this.data.sms_config.logs.length > 200) {
      this.data.sms_config.logs = this.data.sms_config.logs.slice(0, 200);
    }
    saveDatabase();
    return log;
  },

  // Digital Services Management
  updateCablePackage(id: string, updates: Partial<CablePackage>): CablePackage | null {
    const idx = this.data.cable_packages.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.data.cable_packages[idx] = { ...this.data.cable_packages[idx], ...updates };
    saveDatabase();
    return this.data.cable_packages[idx];
  },

  addCablePackage(pkg: Omit<CablePackage, 'id'>): CablePackage {
    const newPkg: CablePackage = {
      ...pkg,
      id: `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.data.cable_packages.push(newPkg);
    saveDatabase();
    return newPkg;
  },

  deleteCablePackage(id: string): boolean {
    const before = this.data.cable_packages.length;
    this.data.cable_packages = this.data.cable_packages.filter(p => p.id !== id);
    saveDatabase();
    return this.data.cable_packages.length < before;
  },

  updateElectricityDisco(id: string, updates: Partial<ElectricityDisco>): ElectricityDisco | null {
    const idx = this.data.electricity_discos.findIndex(d => d.id === id);
    if (idx === -1) return null;
    this.data.electricity_discos[idx] = { ...this.data.electricity_discos[idx], ...updates };
    saveDatabase();
    return this.data.electricity_discos[idx];
  },

  addElectricityDisco(disco: Omit<ElectricityDisco, 'id'>): ElectricityDisco {
    const newDisco: ElectricityDisco = {
      ...disco,
      id: `disco_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.data.electricity_discos.push(newDisco);
    saveDatabase();
    return newDisco;
  },

  deleteElectricityDisco(id: string): boolean {
    const before = this.data.electricity_discos.length;
    this.data.electricity_discos = this.data.electricity_discos.filter(d => d.id !== id);
    saveDatabase();
    return this.data.electricity_discos.length < before;
  },

  // Store Management
  updateStoreSettings(settings: Partial<StoreSettingsItem>): StoreSettingsItem {
    this.data.store_settings = { ...this.data.store_settings, ...settings };
    saveDatabase();
    return this.data.store_settings;
  },

  addStoreItem(item: Omit<StoreItem, 'id' | 'created_at'>): StoreItem {
    const newItem: StoreItem = {
      ...item,
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    this.data.store_items.push(newItem);
    saveDatabase();
    return newItem;
  },

  updateStoreItem(id: string, updates: Partial<StoreItem>): StoreItem | null {
    const idx = this.data.store_items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    this.data.store_items[idx] = { ...this.data.store_items[idx], ...updates };
    saveDatabase();
    return this.data.store_items[idx];
  },

  deleteStoreItem(id: string): boolean {
    const before = this.data.store_items.length;
    this.data.store_items = this.data.store_items.filter(i => i.id !== id);
    saveDatabase();
    return this.data.store_items.length < before;
  },

  // Academy Management
  updateAcademySettings(settings: Partial<AcademySettingsItem>): AcademySettingsItem {
    this.data.academy_settings = { ...this.data.academy_settings, ...settings };
    saveDatabase();
    return this.data.academy_settings;
  },

  addAcademyCourse(course: Omit<AcademyCourse, 'id' | 'created_at'>): AcademyCourse {
    const newCourse: AcademyCourse = {
      ...course,
      id: `crs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    this.data.academy_courses.push(newCourse);
    saveDatabase();
    return newCourse;
  },

  updateAcademyCourse(id: string, updates: Partial<AcademyCourse>): AcademyCourse | null {
    const idx = this.data.academy_courses.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.data.academy_courses[idx] = { ...this.data.academy_courses[idx], ...updates };
    saveDatabase();
    return this.data.academy_courses[idx];
  },

  deleteAcademyCourse(id: string): boolean {
    const before = this.data.academy_courses.length;
    this.data.academy_courses = this.data.academy_courses.filter(c => c.id !== id);
    saveDatabase();
    return this.data.academy_courses.length < before;
  },

  // Reports Management
  updateReportsSettings(settings: Partial<ReportsSettingsItem>): ReportsSettingsItem {
    this.data.reports_settings = { ...this.data.reports_settings, ...settings };
    saveDatabase();
    return this.data.reports_settings;
  },

  // Customer Messages
  addCustomerMessage(msg: Omit<CustomerMessageItem, 'id' | 'created_at'>): CustomerMessageItem {
    const newMsg: CustomerMessageItem = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    if (!this.data.customer_messages) this.data.customer_messages = [];
    this.data.customer_messages.unshift(newMsg);
    saveDatabase();
    return newMsg;
  },

  markCustomerMessageRead(id: string): boolean {
    if (!this.data.customer_messages) return false;
    const msg = this.data.customer_messages.find(m => m.id === id);
    if (msg) {
      msg.read = true;
      saveDatabase();
      return true;
    }
    return false;
  },
};

// Initialize on file load
initDatabase();
