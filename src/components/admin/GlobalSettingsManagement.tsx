import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Building,
  Palette,
  Globe,
  Layout,
  Layers,
  Shield,
  Key,
  Lock,
  UserCheck,
  Wallet,
  CreditCard,
  Cpu,
  Percent,
  RefreshCw,
  Mail,
  FileText,
  MessageSquare,
  Bell,
  UploadCloud,
  Code,
  HardDrive,
  Gift,
  KeyRound,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { useCms } from '../../context/CmsContext';
import { useAuth } from '../../context/AuthContext';
import { LogoUploader } from './LogoUploader';

interface CategoryField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'select' | 'password';
  options?: { label: string; value: string }[];
  helper?: string;
  readOnly?: boolean;
}

interface CategoryConfig {
  key: string;
  name: string;
  group: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  superAdminOnly?: boolean;
  fields: CategoryField[];
}

const SETTINGS_CATEGORIES: CategoryConfig[] = [
  // 1. General
  {
    key: 'general',
    name: '1. General Settings',
    group: 'Platform',
    icon: Sliders,
    description: 'System identity, platform naming, maintenance toggle, default currency, and time zone.',
    fields: [
      { key: 'site_name', label: 'Platform Name', type: 'text', helper: 'Official short brand title displayed across navigation and headers' },
      { key: 'site_tagline', label: 'Platform Tagline', type: 'text', helper: 'Short brand slogan for page titles and metadata' },
      { key: 'maintenance_mode', label: 'Platform Maintenance Mode', type: 'boolean', helper: 'Temporarily display maintenance notice to public visitors' },
      { key: 'default_currency', label: 'Default Currency Code', type: 'text', helper: 'ISO Currency (e.g. NGN)' },
      { key: 'currency_symbol', label: 'Default Currency Symbol', type: 'text', helper: 'Symbol used in slips and ledgers (e.g. ₦)' },
      { key: 'timezone', label: 'Default Platform Timezone', type: 'text', helper: 'Server time zone for reports and logs (e.g. Africa/Lagos (GMT+1))' },
    ],
  },
  // 2. Company
  {
    key: 'company',
    name: '2. Company Information',
    group: 'Platform',
    icon: Building,
    description: 'Corporate registration, legal business entity, CAC/BN registration numbers, and headquarters address.',
    fields: [
      { key: 'company_name', label: 'Registered Business Name', type: 'text', helper: 'Full corporate name as registered with CAC' },
      { key: 'registration_number', label: 'CAC / RC / BN Number', type: 'text', helper: 'Official corporate registration number (e.g. BN 9284726)' },
      { key: 'founded_year', label: 'Founded Year', type: 'text', helper: 'Year established (e.g. 2024)' },
      { key: 'official_email', label: 'General Information Email', type: 'text', helper: 'info@hambaktech.com.ng' },
      { key: 'support_email', label: 'Customer Support Email', type: 'text', helper: 'support@hambaktech.com.ng' },
      { key: 'whatsapp_phone', label: 'WhatsApp Desk Number', type: 'text', helper: '09155104724' },
      { key: 'business_phone', label: 'Business / Upline Contact', type: 'text', helper: '08147837664' },
      { key: 'official_phone', label: 'Customer Service / Office Phone', type: 'text', helper: '09127469686' },
      { key: 'headquarters_address', label: 'Headquarters Address', type: 'textarea', helper: 'Physical office address for receipts and footer' },
    ],
  },
  // 3. Branding
  {
    key: 'branding',
    name: '3. Branding & Visual Identity',
    group: 'Platform',
    icon: Palette,
    description: 'Corporate logos, favicons, primary/secondary/accent colors, and typography.',
    fields: [
      { key: 'logo_url', label: 'Primary Logo URL', type: 'text', helper: 'Main header logo image path or URL (/logo.png)' },
      { key: 'favicon_url', label: 'Favicon URL', type: 'text', helper: 'Browser tab icon path (e.g. /logo.png)' },
      { key: 'primary_color', label: 'Primary Brand Color', type: 'text', helper: 'Hex code for primary buttons and accents (e.g. #1d4ed8)' },
      { key: 'secondary_color', label: 'Secondary Brand Color', type: 'text', helper: 'Hex code for secondary accents (e.g. #0f172a)' },
      { key: 'accent_color', label: 'Highlight Accent Color', type: 'text', helper: 'Hex code for highlight badges (e.g. #d97706)' },
      { key: 'typography', label: 'Website Typography', type: 'text', helper: 'Font stack (e.g. Plus Jakarta Sans, sans-serif)' },
    ],
  },
  // 4. Website CMS
  {
    key: 'website',
    name: '4. Website CMS',
    group: 'Platform',
    icon: Globe,
    description: 'Public registration switch, SEO meta tags, rate calculator visibility, and announcement ticker.',
    fields: [
      { key: 'enable_registration', label: 'Allow Public Registration', type: 'boolean', helper: 'Allow new customers to create accounts online' },
      { key: 'enable_guest_rates_calculator', label: 'Show Public Rates Calculator', type: 'boolean', helper: 'Display public pricing calculator on the website' },
      { key: 'enable_announcements_ticker', label: 'Show Global Announcement Ticker', type: 'boolean', helper: 'Display active published announcements on public header' },
      { key: 'meta_title', label: 'Default Meta Title', type: 'text', helper: 'SEO title for search engine indexing' },
      { key: 'meta_description', label: 'Default Meta Description', type: 'textarea', helper: 'Summary snippet for Google & social sharing cards' },
    ],
  },
  // 5. Landing Page
  {
    key: 'landing_page',
    name: '5. Landing Page Controls',
    group: 'Platform',
    icon: Layout,
    description: 'Landing page hero badge, headline, subtitle, and primary/secondary CTA button labels.',
    fields: [
      { key: 'hero_badge', label: 'Hero Badge Label', type: 'text', helper: 'Small top badge text above main headline' },
      { key: 'hero_headline', label: 'Hero Section Title', type: 'text', helper: 'Primary high-impact heading on the homepage' },
      { key: 'hero_subheadline', label: 'Hero Section Subtitle', type: 'textarea', helper: 'Descriptive narrative under the main hero title' },
      { key: 'primary_cta_text', label: 'Primary CTA Button Text', type: 'text', helper: 'Primary call to action button label' },
      { key: 'secondary_cta_text', label: 'Secondary CTA Button Text', type: 'text', helper: 'Secondary call to action button label' },
    ],
  },
  // 6. Customer Dashboard
  {
    key: 'customer_dashboard',
    name: '6. Customer Dashboard Controls',
    group: 'Portal',
    icon: Layers,
    description: 'Configure which core modules are enabled inside the customer portal.',
    fields: [
      { key: 'enable_nin_services', label: 'NIN & Identity Services Module', type: 'boolean', helper: 'Enable NIN verification, slips, modification, and enrolment' },
      { key: 'enable_telecom_vtu', label: 'Telecom VTU & Utilities Module', type: 'boolean', helper: 'Enable data, airtime, cable TV, and electricity payments' },
      { key: 'enable_wallet_transfers', label: 'Peer-to-Peer Wallet Transfers', type: 'boolean', helper: 'Allow customers to transfer funds between platform wallets' },
      { key: 'enable_virtual_accounts', label: 'Virtual Bank Accounts Module', type: 'boolean', helper: 'Enable dedicated bank deposit accounts' },
      { key: 'enable_store_module', label: 'Hardware Store Module', type: 'boolean', helper: 'Show POS hardware & accessory store in portal' },
      { key: 'enable_academy_module', label: 'Digital Academy Module', type: 'boolean', helper: 'Show training academy in customer portal' },
    ],
  },
  // 7. Admin Dashboard
  {
    key: 'admin_dashboard',
    name: '7. Admin Dashboard Controls',
    group: 'Security',
    icon: Shield,
    superAdminOnly: true,
    description: 'Root MFA enforcement, admin session timeouts, audit retention, and telemetry refresh interval.',
    fields: [
      { key: 'require_2fa_for_root', label: 'Require 2FA / MFA for Root Admins', type: 'boolean', helper: 'Enforce MFA challenge for Super Admin logins' },
      { key: 'session_timeout_minutes', label: 'Admin Inactivity Timeout (Minutes)', type: 'number', helper: 'Automatic sign-out window for idle administrators' },
      { key: 'audit_log_retention_days', label: 'Audit Log Retention (Days)', type: 'number', helper: 'Retention window for administrative audit trails' },
      { key: 'auto_refresh_interval_sec', label: 'Auto-Refresh Interval (Seconds)', type: 'number', helper: 'Dashboard overview refresh frequency' },
    ],
  },
  // 8. Authentication & Password
  {
    key: 'auth',
    name: '8. Authentication & Password',
    group: 'Security',
    icon: Key,
    superAdminOnly: true,
    description: 'Public signup, email verification, password length, failed login limits, and lockout duration.',
    fields: [
      { key: 'allow_customer_registration', label: 'Allow Customer Registration', type: 'boolean', helper: 'Permit new customer sign-ups through /api/auth/register' },
      { key: 'require_email_verification', label: 'Require Email Verification Before Login', type: 'boolean', helper: 'Prevent unverified accounts from signing in' },
      { key: 'min_password_length', label: 'Minimum Password Length', type: 'number', helper: 'Minimum characters required for account passwords' },
      { key: 'max_failed_attempts', label: 'Max Failed Login Attempts Before Lockout', type: 'number', helper: 'Brute-force protection threshold' },
      { key: 'lockout_duration_minutes', label: 'Account Lockout Duration (Minutes)', type: 'number', helper: 'Cooldown duration after exceeding failed login threshold' },
    ],
  },
  // 9. Security & Session Policies
  {
    key: 'security',
    name: '9. Security & Session Policies',
    group: 'Security',
    icon: Lock,
    superAdminOnly: true,
    description: 'Transaction PIN defaults, session timeouts, User-Agent binding, and IP rate-limiting rules.',
    fields: [
      { key: 'enforce_transaction_pin', label: 'Enforce Transaction PIN Platform-Wide', type: 'boolean', helper: 'Require valid Transaction PIN for protected debits' },
      { key: 'pin_max_attempts', label: 'Max Failed PIN Attempts', type: 'number', helper: 'Wrong PIN threshold before temporary PIN lockout (3–10)' },
      { key: 'pin_lockout_minutes', label: 'PIN Lockout Duration (Minutes)', type: 'number', helper: 'Cooldown window after PIN lockout (5–120)' },
      { key: 'session_timeout_minutes', label: 'Customer Session Timeout (Minutes)', type: 'number', helper: 'Idle/token lifetime for customer sessions (15–10080)' },
      { key: 'admin_session_timeout_minutes', label: 'Admin Session Timeout (Minutes)', type: 'number', helper: 'Stricter idle lifetime for staff/admin sessions (10–720)' },
      { key: 'login_max_attempts', label: 'Login Max Failed Attempts', type: 'number', helper: 'Threshold before login throttling applies (3–15)' },
      { key: 'login_lockout_minutes', label: 'Login Lockout Duration (Minutes)', type: 'number', helper: 'Cooldown duration for throttled accounts (5–180)' },
      { key: 'bind_user_agent', label: 'Bind Session Tokens to Browser User-Agent', type: 'boolean', helper: 'Reject stolen tokens replayed from a different device/client' },
      { key: 'jwt_expiry_days', label: 'JWT Token Expiry (Days)', type: 'number', helper: 'Maximum JWT validity window' },
      { key: 'ip_rate_limiting_enabled', label: 'Enable IP Rate Limiting', type: 'boolean', helper: 'Protect login and OTP endpoints against abuse' },
    ],
  },
  // 10. KYC & Identity Rules
  {
    key: 'kyc',
    name: '10. KYC & Identity Rules',
    group: 'Compliance',
    icon: UserCheck,
    description: 'Daily transaction tier limits, auto-approval switches, and Tier 3 proof of address checks.',
    fields: [
      { key: 'tier1_daily_limit', label: 'Tier 1 Daily Transaction Limit (₦)', type: 'number', helper: 'Unverified phone/email account limit' },
      { key: 'tier2_daily_limit', label: 'Tier 2 Daily Transaction Limit (₦)', type: 'number', helper: 'Verified NIN/BVN account limit' },
      { key: 'tier3_daily_limit', label: 'Tier 3 Daily Transaction Limit (₦)', type: 'number', helper: 'Full corporate/CAC verified merchant limit' },
      { key: 'auto_approval_enabled', label: 'Auto-Approve KYC on Exact Match', type: 'boolean', helper: 'Automatically approve Level 2 when identity verification matches' },
      { key: 'require_proof_of_address_for_tier3', label: 'Require Proof of Address for Tier 3', type: 'boolean', helper: 'Mandate utility bill or bank statement upload for Tier 3' },
    ],
  },
  // 11. Wallet & Ledger Controls
  {
    key: 'wallet',
    name: '11. Wallet & Ledger Controls',
    group: 'Financial',
    icon: Wallet,
    description: 'Minimum and maximum customer wallet deposit bounds via Paystack.',
    fields: [
      { key: 'min_funding_amount', label: 'Minimum Wallet Funding (₦)', type: 'number', helper: 'Minimum deposit allowed per Paystack funding request' },
      { key: 'max_funding_amount', label: 'Maximum Single Funding (₦)', type: 'number', helper: 'Maximum allowed single deposit transaction' },
    ],
  },
  // 12. Payment Gateways
  {
    key: 'payment_gateways',
    name: '12. Payment Gateways',
    group: 'Financial',
    icon: CreditCard,
    superAdminOnly: true,
    description: 'Paystack payment gateway configuration and settlement percentage fee.',
    fields: [
      {
        key: 'active_gateway',
        label: 'Primary Active Gateway',
        type: 'select',
        options: [
          { label: 'Paystack', value: 'paystack' },
        ],
        helper: 'Paystack is the sole active customer funding gateway',
      },
      { key: 'enable_paystack', label: 'Enable Paystack Gateway', type: 'boolean', helper: 'Process cards, USSD, and instant Paystack bank transfers' },
      { key: 'paystack_charge_percent', label: 'Paystack Fee Rate (%)', type: 'number', helper: 'Configured settlement fee percentage' },
      { key: 'enable_paystack_dva', label: 'Enable Paystack Dedicated Virtual Accounts', type: 'boolean', helper: 'Allow eligible KYC Level 2+ customers to request a Paystack-generated NUBAN' },
      {
        key: 'paystack_dva_preferred_bank',
        label: 'Preferred Paystack DVA Bank Partner',
        type: 'select',
        options: [
          { label: 'Wema Bank (wema-bank)', value: 'wema-bank' },
          { label: 'Titan Paystack (titan-paystack)', value: 'titan-paystack' },
        ],
        helper: 'Bank slug requested from Paystack when assigning customer DVAs',
      },
      {
        key: 'dva_fee_bearer',
        label: 'DVA Transfer Fee Handling',
        type: 'select',
        options: [
          { label: 'Deduct Actual Paystack Charge from Deposit (Net Credit)', value: 'customer' },
          { label: 'Merchant Absorbs Paystack DVA Charge (Full Credit)', value: 'merchant' },
        ],
        helper: 'Controls whether actual Paystack DVA charges are deducted before crediting wallet',
      },
    ],
  },
  // 13. Provider Integration
  {
    key: 'provider_integration',
    name: '13. Provider Integration & Routing',
    group: 'Integration',
    icon: Cpu,
    superAdminOnly: true,
    description: 'Primary vs fallback verification & telecom provider routing and failover timeout parameters.',
    fields: [
      {
        key: 'primary_identity_provider',
        label: 'Primary Verification Provider',
        type: 'select',
        options: [
          { label: '2SureVerify Gateway (Primary)', value: '2sureverify' },
          { label: 'Veripine Identity API', value: 'veripine' },
        ],
        helper: 'Root upstream gateway for NIN and BVN services',
      },
      {
        key: 'fallback_identity_provider',
        label: 'Fallback Verification Provider',
        type: 'select',
        options: [
          { label: 'Veripine Secondary Engine', value: 'veripine' },
          { label: '2SureVerify Failover Engine', value: '2sureverify' },
          { label: 'None (Fail Fast)', value: 'none' },
        ],
        helper: 'Failover gateway used when auto-failover is enabled',
      },
      {
        key: 'primary_telecom_provider',
        label: 'Primary Telecom Provider',
        type: 'select',
        options: [
          { label: 'UlamaData Core API', value: 'ulamadata' },
          { label: 'VTpass Live Gateway', value: 'vtpass' },
        ],
        helper: 'Primary provider for airtime, data bundles, and utility bills',
      },
      {
        key: 'fallback_telecom_provider',
        label: 'Fallback Telecom Provider',
        type: 'select',
        options: [
          { label: 'VTpass Live Gateway', value: 'vtpass' },
          { label: 'UlamaData Core API', value: 'ulamadata' },
        ],
        helper: 'Secondary telecom provider when failover applies',
      },
      { key: 'auto_failover_enabled', label: 'Enable Automated Provider Failover', type: 'boolean', helper: 'Allow automatic failover if primary provider errors' },
      { key: 'request_timeout_seconds', label: 'Provider Request Timeout (Seconds)', type: 'number', helper: 'Upstream cURL wait timeout' },
    ],
  },
  // 14. Service Pricing
  {
    key: 'service_pricing',
    name: '14. Service Pricing & Reference Rates',
    group: 'Financial',
    icon: Percent,
    description: 'Baseline reference retail prices for NIN slips, BVN checks, and 1GB benchmark telecom bundles.',
    fields: [
      { key: 'nin_standard_slip_price', label: 'NIN Standard Slip Fee (₦)', type: 'number', helper: 'Reference customer price for standard NIN verification' },
      { key: 'nin_premium_pvc_price', label: 'NIN Premium PVC Slip Fee (₦)', type: 'number', helper: 'Reference customer price for premium slip generation' },
      { key: 'bvn_verification_price', label: 'BVN Verification Fee (₦)', type: 'number', helper: 'Reference customer price for BVN lookup' },
      { key: 'mtn_sme_1gb_price', label: 'MTN SME 1GB Benchmark Price (₦)', type: 'number', helper: 'Public rate calculator reference for MTN 1GB' },
      { key: 'airtel_1gb_price', label: 'Airtel 1GB Benchmark Price (₦)', type: 'number', helper: 'Public rate calculator reference for Airtel 1GB' },
      { key: 'glo_1gb_price', label: 'Glo 1GB Benchmark Price (₦)', type: 'number', helper: 'Public rate calculator reference for Glo 1GB' },
      { key: 'nine_mobile_1gb_price', label: '9mobile 1GB Benchmark Price (₦)', type: 'number', helper: 'Public rate calculator reference for 9mobile 1GB' },
    ],
  },
  // 15. Transaction Rules
  {
    key: 'transactions',
    name: '15. Transaction Rules & Receipts',
    group: 'Financial',
    icon: RefreshCw,
    description: 'Auto-refund triggers for failed orders and downloadable transaction receipt formatting.',
    fields: [
      { key: 'auto_refund_failed_verifications', label: 'Auto-Refund Failed Verifications', type: 'boolean', helper: 'Automatically refund wallet when identity provider fails' },
      { key: 'auto_refund_failed_telecom', label: 'Auto-Refund Failed Telecom Orders', type: 'boolean', helper: 'Automatically refund wallet when VTU delivery fails' },
      { key: 'generate_downloadable_receipts', label: 'Enable Downloadable Receipts', type: 'boolean', helper: 'Provide formatted receipts for customer transactions' },
      { key: 'receipt_prefix', label: 'Receipt Reference Prefix', type: 'text', helper: 'Prefix on receipt numbers (e.g. HT-REC-)' },
    ],
  },
  // 16. SMTP & Mail Delivery
  {
    key: 'smtp',
    name: '16. SMTP & Mail Delivery',
    group: 'Communication',
    icon: Mail,
    superAdminOnly: true,
    description: 'Outgoing SMTP mail host, port, SSL/TLS mode, authenticated user, and From headers.',
    fields: [
      { key: 'smtp_host', label: 'SMTP Host Server', type: 'text', helper: 'e.g. mail.hambaktech.com.ng' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', helper: '465 (SSL) or 587 (TLS)' },
      { key: 'smtp_secure', label: 'Use Implicit SSL/TLS Encryption', type: 'boolean', helper: 'Enable SSL wrapper for port 465' },
      { key: 'smtp_user', label: 'SMTP Username / Mailbox', type: 'text', helper: 'support@hambaktech.com.ng' },
      { key: 'from_email', label: 'From Email Address', type: 'text', helper: 'Sender address shown to recipients' },
      { key: 'from_name', label: 'From Display Name', type: 'text', helper: 'Sender name shown in inbox' },
    ],
  },
  // 17. Email Templates
  {
    key: 'email_templates',
    name: '17. Email Notification Triggers',
    group: 'Communication',
    icon: FileText,
    description: 'Enable or pause automated emails for welcome onboarding, funding receipts, KYC updates, and security alerts.',
    fields: [
      { key: 'welcome_email_enabled', label: 'Welcome Email on Registration', type: 'boolean', helper: 'Send welcome guide on customer signup' },
      { key: 'funding_receipt_email_enabled', label: 'Wallet Funding Receipt Email', type: 'boolean', helper: 'Dispatch confirmation email when wallet is funded' },
      { key: 'kyc_status_email_enabled', label: 'KYC Status Update Email', type: 'boolean', helper: 'Notify customer when KYC is approved or rejected' },
      { key: 'security_alert_email_enabled', label: 'Security & Login Alert Email', type: 'boolean', helper: 'Send security emails for PIN, MFA, and login events' },
    ],
  },
  // 18. SMS Gateway
  {
    key: 'sms',
    name: '18. SMS Gateway & Billing',
    group: 'Communication',
    icon: MessageSquare,
    description: 'SMS sender ID (max 11 chars), transactional/OTP SMS toggles, and unit pricing.',
    fields: [
      { key: 'sms_sender_id', label: 'SMS Sender ID (Alphanumeric)', type: 'text', helper: 'Up to 11 characters (e.g. HAMBAKTECH)' },
      { key: 'enable_transaction_sms', label: 'Enable Transaction SMS Alerts', type: 'boolean', helper: 'Dispatch SMS alerts on high-value transactions' },
      { key: 'enable_otp_sms', label: 'Enable OTP SMS Fallback', type: 'boolean', helper: 'Allow OTP codes via SMS when configured' },
      { key: 'sms_rate_per_unit', label: 'SMS Cost per Page (₦)', type: 'number', helper: 'Unit charge per SMS page' },
    ],
  },
  // 19. Notifications
  {
    key: 'notifications',
    name: '19. System Notifications',
    group: 'Communication',
    icon: Bell,
    description: 'Dashboard alert badges, sound feedback, and marketing announcement banners.',
    fields: [
      { key: 'enable_dashboard_alerts', label: 'Enable In-App Dashboard Alerts', type: 'boolean', helper: 'Show real-time unread notifications in portal header' },
      { key: 'sound_alerts_enabled', label: 'Enable Sound Alerts', type: 'boolean', helper: 'Play subtle chime on critical notifications' },
      { key: 'marketing_announcements_enabled', label: 'Enable Marketing Announcements', type: 'boolean', helper: 'Show promotional broadcasts to customers' },
    ],
  },
  // 20. Upload Settings
  {
    key: 'upload',
    name: '20. Upload & Storage Settings',
    group: 'Platform',
    icon: UploadCloud,
    description: 'Maximum file upload ceiling, permitted extensions, storage path, and filename sanitization.',
    fields: [
      { key: 'max_file_size_mb', label: 'Maximum File Upload Size (MB)', type: 'number', helper: 'Max upload size for KYC, modification, and specimen files' },
      { key: 'allowed_extensions', label: 'Permitted File Extensions (Comma-separated)', type: 'text', helper: 'e.g. jpg, jpeg, png, pdf' },
      { key: 'upload_directory', label: 'Private Upload Directory', type: 'text', helper: 'Protected storage directory path (e.g. storage/uploads)' },
      { key: 'sanitize_filenames', label: 'Sanitize Uploaded Filenames', type: 'boolean', helper: 'Strip special characters and randomize disk filenames' },
    ],
  },
  // 21. API Settings
  {
    key: 'api',
    name: '21. API & Webhook Controls',
    group: 'Integration',
    icon: Code,
    superAdminOnly: true,
    description: 'API rate limits, webhook dispatch toggles, signature verification strictness, and CORS allowlist.',
    fields: [
      { key: 'rate_limit_requests_per_minute', label: 'API Rate Limit (Requests / Minute)', type: 'number', helper: 'Per-IP/user request limit per minute' },
      { key: 'enable_webhook_dispatch', label: 'Enable Webhook Processing', type: 'boolean', helper: 'Accept Paystack and provider callbacks' },
      { key: 'signature_verification_strict', label: 'Strict Webhook HMAC Verification', type: 'boolean', helper: 'Reject unsigned or invalid HMAC webhook signatures' },
      { key: 'cors_allowed_origins', label: 'CORS Allowed Origins', type: 'text', helper: 'Allowed frontend origins (comma-separated or *)' },
    ],
  },
  // 22. System Configuration
  {
    key: 'system_config',
    name: '22. System Configuration',
    group: 'Platform',
    icon: HardDrive,
    superAdminOnly: true,
    description: 'Environment mode, build release tag, PHP runtime, and MySQL database engine info.',
    fields: [
      { key: 'cpanel_server', label: 'Server Cluster Label', type: 'text', helper: 'Internal label shown in Super Admin configuration' },
      {
        key: 'environment',
        label: 'Runtime Environment',
        type: 'select',
        options: [
          { label: 'Production', value: 'production' },
          { label: 'Staging', value: 'staging' },
        ],
      },
      { key: 'version', label: 'Platform Release Tag', type: 'text', helper: 'Current application release version' },
      { key: 'php_version', label: 'Active PHP Runtime Version', type: 'text', readOnly: true, helper: 'Detected live PHP version (read-only)' },
      { key: 'database_engine', label: 'Database Storage Engine', type: 'text', readOnly: true, helper: 'Active relational database engine' },
    ],
  },
  // 23. Referral & Rewards Engine
  {
    key: 'referral',
    name: '23. Referral & Rewards Engine',
    group: 'Growth & Phase 11',
    icon: Gift,
    superAdminOnly: true,
    description: 'Master referral program switches, reward modes, settlement holds, wallet conversion, and cash payout bounds.',
    fields: [
      { key: 'enabled', label: 'Enable Referral & Rewards Program', type: 'boolean', helper: 'Master toggle for referral attribution and rewards' },
      { key: 'program_name', label: 'Program Display Name', type: 'text', helper: 'Title displayed in Customer Referral Centre' },
      {
        key: 'reward_mode',
        label: 'Primary Reward Calculation Mode',
        type: 'select',
        options: [
          { label: 'Hybrid (Cash + Loyalty Points)', value: 'hybrid' },
          { label: 'Fixed Cash per Qualifying Tx', value: 'fixed' },
          { label: 'Percent of Transaction Spend', value: 'percent_of_spend' },
          { label: 'Percent of Net Margin', value: 'percent_of_margin' },
          { label: 'Loyalty Points Only', value: 'points' },
        ],
      },
      {
        key: 'trigger_mode',
        label: 'Reward Trigger Rule',
        type: 'select',
        options: [
          { label: 'First Qualifying Transaction Only', value: 'first_qualifying_transaction' },
          { label: 'Every Qualifying Transaction', value: 'every_qualifying_transaction' },
          { label: 'Up to N Transactions per Referee', value: 'up_to_n_tx' },
          { label: 'Upon Verified Signup', value: 'signup_verified' },
        ],
      },
      { key: 'max_rewards_per_referee', label: 'Max Rewards per Referee', type: 'number', helper: 'Maximum reward events allowed per referred customer when Up to N mode applies' },
      { key: 'flat_reward_naira', label: 'Flat Cash Reward (₦)', type: 'number', helper: 'Cash reward amount when fixed/hybrid mode applies' },
      { key: 'percent_of_spend', label: 'Spend Commission (%)', type: 'number', helper: 'Percentage of referred spend credited' },
      { key: 'percent_of_margin', label: 'Margin Share (%)', type: 'number', helper: 'Percentage of net platform margin shared' },
      { key: 'point_value_naira', label: 'Naira Value per Loyalty Point (₦)', type: 'number', helper: 'Conversion rate when converting points to wallet' },
      { key: 'min_qualifying_spend', label: 'Min Qualifying Spend (₦)', type: 'number', helper: 'Minimum transaction value to qualify for reward' },
      { key: 'settlement_hold_hours', label: 'Pending Settlement Hold (Hours)', type: 'number', helper: 'Delay before pending rewards become withdrawable' },
      { key: 'wallet_conversion_enabled', label: 'Allow Convert Rewards to Wallet', type: 'boolean', helper: 'Let customers transfer referral earnings into main wallet' },
      { key: 'withdrawal_enabled', label: 'Allow Bank Cash Withdrawals', type: 'boolean', helper: 'Let eligible customers request bank payouts' },
      { key: 'min_withdrawal_naira', label: 'Minimum Bank Withdrawal (₦)', type: 'number', helper: 'Enforced server-side minimum (floor ₦500)' },
      { key: 'max_withdrawal_naira', label: 'Maximum Single Withdrawal (₦)', type: 'number', helper: 'Maximum single bank payout request' },
      { key: 'require_kyc_level_for_withdrawal', label: 'Minimum KYC Level for Cash Withdrawal', type: 'number', helper: 'Required customer KYC tier (1–3)' },
    ],
  },
  // 24. Transaction PIN Policy
  {
    key: 'pin_policy',
    name: '24. Compulsory Transaction PIN Policy',
    group: 'Security',
    icon: KeyRound,
    superAdminOnly: true,
    description: 'Compulsory customer PIN activation, PIN digit length, weak PIN rejection, lockout rules, and OTP expiry.',
    fields: [
      { key: 'enforce_transaction_pin', label: 'Enforce Transaction PIN Across Services', type: 'boolean', helper: 'Require PIN on protected purchases, conversions, and withdrawals' },
      { key: 'require_pin_activation_for_all_customers', label: 'Compulsory PIN Activation on Login', type: 'boolean', helper: 'Require customers without a PIN to create one immediately' },
      {
        key: 'pin_length',
        label: 'Required PIN Length',
        type: 'select',
        options: [
          { label: '4 Digits (Standard)', value: '4' },
          { label: '5 Digits', value: '5' },
          { label: '6 Digits (High Security)', value: '6' },
        ],
      },
      { key: 'allow_weak_pins', label: 'Allow Sequential / Repeated Weak PINs', type: 'boolean', helper: 'Keep OFF in production (blocks 1234, 0000, birth-year sequences)' },
      { key: 'pin_max_attempts', label: 'Max Wrong PIN Attempts Before Lockout', type: 'number', helper: 'Clamped server-side (3–10)' },
      { key: 'pin_lockout_minutes', label: 'PIN Lockout Duration (Minutes)', type: 'number', helper: 'Clamped server-side (5–120)' },
      { key: 'otp_reset_expiry_minutes', label: 'Email OTP Reset Expiry (Minutes)', type: 'number', helper: 'Validity of Email OTP for PIN recovery' },
    ],
  },
  // 25. Multi-Factor Authentication Policy
  {
    key: 'mfa',
    name: '25. Multi-Factor Authentication (MFA)',
    group: 'Security',
    icon: ShieldCheck,
    superAdminOnly: true,
    description: 'Super Admin & Admin MFA enforcement, customer opt-in, Email OTP & TOTP switches, and issuer label.',
    fields: [
      { key: 'enforce_mfa_for_superadmin', label: 'Require MFA for Super Admin Accounts', type: 'boolean', helper: 'Challenges Super Admins at sign-in once MFA is configured' },
      { key: 'enforce_mfa_for_admin', label: 'Require MFA for Admin / Staff Accounts', type: 'boolean', helper: 'Enforces 2FA challenge for administrative staff' },
      { key: 'allow_customer_mfa', label: 'Allow Customer Self-Service MFA', type: 'boolean', helper: 'Let customers enable Email OTP or Authenticator App MFA' },
      { key: 'allow_email_otp', label: 'Allow Email OTP Method', type: 'boolean', helper: 'Dispatch 6-digit login challenges via SMTP' },
      { key: 'allow_totp', label: 'Allow TOTP Authenticator App', type: 'boolean', helper: 'Support Google Authenticator / Authy / 1Password codes' },
      { key: 'otp_expiry_minutes', label: 'MFA Challenge Expiry (Minutes)', type: 'number', helper: 'Clamped server-side (3–30)' },
      { key: 'max_otp_attempts', label: 'Max MFA Challenge Attempts', type: 'number', helper: 'Invalid MFA attempts allowed per challenge' },
      { key: 'totp_issuer', label: 'TOTP Authenticator Issuer Label', type: 'text', helper: 'App title shown inside customer/admin authenticator app' },
    ],
  },
];

export const GlobalSettingsManagement: React.FC = () => {
  const { user } = useAuth();
  const { branding, refreshCms, updateBranding } = useCms();
  const isSuperAdmin = user?.role === 'superadmin';

  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('general');
  const [settingsValues, setSettingsValues] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchCategory, setSearchCategory] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminAllSettings();
      if (res && res.success && res.settings) {
        setSettingsValues(res.settings);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load system settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const activeCategory = SETTINGS_CATEGORIES.find(c => c.key === selectedCategoryKey) || SETTINGS_CATEGORIES[0];
  const isLockedForRole = Boolean(activeCategory.superAdminOnly && !isSuperAdmin);

  const handleFieldChange = (fieldKey: string, value: any) => {
    setSettingsValues(prev => ({
      ...prev,
      [activeCategory.key]: {
        ...(prev[activeCategory.key] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedForRole) {
      setFeedback({
        type: 'error',
        message: 'Only a Super Administrator can modify this restricted configuration section.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const rawValues = { ...(settingsValues[activeCategory.key] || {}) };
      if (activeCategory.key === 'upload' && typeof rawValues.allowed_extensions === 'string') {
        rawValues.allowed_extensions = rawValues.allowed_extensions
          .split(',')
          .map((s: string) => s.trim().toLowerCase().replace(/^\./, ''))
          .filter(Boolean);
      }
      if (activeCategory.key === 'pin_policy' && rawValues.pin_length !== undefined) {
        rawValues.pin_length = Number(rawValues.pin_length) || 4;
      }

      const res = await api.updateAdminSettingsCategory(activeCategory.key, rawValues);
      if (res && res.success) {
        // Synchronize frontend-visible company/branding fields cleanly with live website_branding
        if (activeCategory.key === 'company') {
          await updateBranding({
            ...(branding || {}),
            company_name: rawValues.company_name || branding?.company_name,
            business_reg_number: rawValues.registration_number || rawValues.cac_registration_number || branding?.business_reg_number,
            office_address: rawValues.headquarters_address || branding?.office_address,
            info_email: rawValues.official_email || branding?.info_email,
            support_email: rawValues.support_email || branding?.support_email,
            whatsapp_number: rawValues.whatsapp_phone || branding?.whatsapp_number,
            business_phone: rawValues.business_phone || branding?.business_phone,
            support_phone: rawValues.official_phone || branding?.support_phone,
            founded_year: rawValues.founded_year || branding?.founded_year,
          });
        } else if (activeCategory.key === 'branding') {
          await updateBranding({
            ...(branding || {}),
            logo_url: rawValues.logo_url || branding?.logo_url,
            favicon_url: rawValues.favicon_url || branding?.favicon_url,
            primary_color: rawValues.primary_color || branding?.primary_color,
            secondary_color: rawValues.secondary_color || branding?.secondary_color,
            font_family: rawValues.typography || branding?.font_family,
          });
        } else if (activeCategory.key === 'general') {
          await updateBranding({
            ...(branding || {}),
            short_brand_name: rawValues.site_name || branding?.short_brand_name,
            tagline: rawValues.site_tagline || branding?.tagline,
          });
        } else if (activeCategory.key === 'website') {
          await updateBranding({
            ...(branding || {}),
            seo_title: rawValues.meta_title || branding?.seo_title,
            seo_description: rawValues.meta_description || branding?.seo_description,
          });
        }
        await refreshCms();
        setFeedback({
          type: 'success',
          message: `${activeCategory.name} updated and synchronized across live system settings.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const filteredCategories = SETTINGS_CATEGORIES.filter(c =>
    c.name.toLowerCase().includes(searchCategory.toLowerCase()) ||
    c.description.toLowerCase().includes(searchCategory.toLowerCase()) ||
    c.group.toLowerCase().includes(searchCategory.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sliders className="w-3.5 h-3.5" />
            Super Admin Control Plane &bull; {SETTINGS_CATEGORIES.length} Sections
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Global System Settings Management</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Comprehensive control over all {SETTINGS_CATEGORIES.length} administrative settings categories. All changes persist to MySQL and immediately control platform behavior without code edits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadSettings()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload Config</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Categories Selector on Left (25 Sections) + Settings Form on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${SETTINGS_CATEGORIES.length} setting categories...`}
              value={searchCategory}
              onChange={e => setSearchCategory(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 max-h-[750px] overflow-y-auto space-y-1">
            {filteredCategories.map(cat => {
              const Icon = cat.icon;
              const isSelected = selectedCategoryKey === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryKey(cat.key);
                    setFeedback(null);
                  }}
                  className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl text-left transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    <span className="text-xs truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {cat.superAdminOnly && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        isSelected ? 'bg-amber-400/20 text-amber-100' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        ROOT
                      </span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {cat.group}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Category Form */}
        <div className="lg:col-span-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6">
            <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <activeCategory.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{activeCategory.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{activeCategory.description}</p>
                </div>
              </div>
              {activeCategory.superAdminOnly && (
                <span className="self-start sm:self-center text-[10px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                  SUPER ADMIN PROTECTED
                </span>
              )}
            </div>

            {isLockedForRole && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="font-semibold text-amber-200">Super Administrator Privileges Required</p>
                  <p className="text-amber-300/80 mt-0.5">
                    You can inspect this category, but only a Super Administrator can modify security, authentication, provider routing, payment gateways, SMTP, PIN, MFA, or referral engine policies.
                  </p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-20 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                <p className="text-xs">Loading category configuration...</p>
              </div>
            ) : (
              <form onSubmit={handleSaveCategory} className="space-y-5">
                {activeCategory.key === 'branding' && (
                  <LogoUploader
                    currentLogoUrl={String(settingsValues.branding?.logo_url || '/logo.png')}
                    onLogoUpdated={(newUrl) => {
                      handleFieldChange('logo_url', newUrl);
                      refreshCms();
                    }}
                  />
                )}

                <div className="space-y-4">
                  {activeCategory.fields.map(field => {
                    const currentCategoryValues = settingsValues[activeCategory.key] || {};
                    const rawVal = currentCategoryValues[field.key];
                    const displayStringVal = Array.isArray(rawVal)
                      ? rawVal.join(', ')
                      : (rawVal !== undefined && rawVal !== null ? String(rawVal) : '');

                    return (
                      <div key={field.key} className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="text-xs font-semibold text-slate-200">
                            {field.label}
                          </label>
                          <span className="text-[10px] font-mono text-slate-500">{field.key}</span>
                        </div>

                        {field.type === 'text' && (
                          <input
                            type="text"
                            readOnly={field.readOnly || isLockedForRole}
                            value={displayStringVal}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 read-only:opacity-65"
                          />
                        )}

                        {field.type === 'password' && (
                          <input
                            type="password"
                            readOnly={field.readOnly || isLockedForRole}
                            value={displayStringVal}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono read-only:opacity-65"
                          />
                        )}

                        {field.type === 'number' && (
                          <input
                            type="number"
                            step="any"
                            readOnly={field.readOnly || isLockedForRole}
                            value={rawVal !== undefined && rawVal !== null ? String(rawVal) : ''}
                            onChange={e => handleFieldChange(field.key, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono read-only:opacity-65"
                          />
                        )}

                        {field.type === 'textarea' && (
                          <textarea
                            rows={3}
                            readOnly={field.readOnly || isLockedForRole}
                            value={displayStringVal}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed read-only:opacity-65"
                          />
                        )}

                        {field.type === 'select' && field.options && (
                          <select
                            disabled={field.readOnly || isLockedForRole}
                            value={rawVal !== undefined && rawVal !== null ? String(rawVal) : field.options[0]?.value}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-65"
                          >
                            {field.options.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {field.type === 'boolean' && (
                          <div className="pt-1">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={field.readOnly || isLockedForRole}
                                checked={rawVal === true || rawVal === 1 || rawVal === '1' || rawVal === 'true'}
                                onChange={e => handleFieldChange(field.key, e.target.checked)}
                                className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 disabled:opacity-65"
                              />
                              <span className="text-xs text-slate-300 font-medium">
                                {(rawVal === true || rawVal === 1 || rawVal === '1' || rawVal === 'true') ? 'Enabled / Active' : 'Disabled / Inactive'}
                              </span>
                            </label>
                          </div>
                        )}

                        {field.helper && (
                          <p className="text-[11px] text-slate-500 pt-0.5">{field.helper}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
                  <span className="text-[11px] text-slate-500 font-mono">
                    Affects MySQL table: <code className="text-indigo-400">system_settings</code>
                  </span>

                  <button
                    type="submit"
                    disabled={saving || isLockedForRole}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition shadow-md shadow-indigo-600/30 disabled:opacity-50"
                  >
                    {saving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Save {activeCategory.name.replace(/^\d+\.\s*/, '')}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
