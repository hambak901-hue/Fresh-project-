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
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  ExternalLink,
  X
} from 'lucide-react';
import { api } from '../../lib/api';

interface CategoryConfig {
  key: string;
  name: string;
  group: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'textarea' | 'select' | 'password';
    options?: { label: string; value: string }[];
    helper?: string;
  }[];
}

const SETTINGS_CATEGORIES: CategoryConfig[] = [
  // 1. General
  {
    key: 'general',
    name: '1. General Settings',
    group: 'Platform',
    icon: Sliders,
    description: 'System identity, platform naming, default currency, time zone, and primary contact routing.',
    fields: [
      { key: 'site_name', label: 'Platform Name', type: 'text', helper: 'Official platform title displayed across navigation and headers' },
      { key: 'site_tagline', label: 'Platform Tagline', type: 'text', helper: 'Short brand slogan for page titles and metadata' },
      { key: 'currency_code', label: 'Default Currency Code', type: 'text', helper: 'ISO Currency (e.g. NGN, USD)' },
      { key: 'currency_symbol', label: 'Default Currency Symbol', type: 'text', helper: 'Symbol used in slips and ledgers (e.g. ₦)' },
      { key: 'support_email', label: 'Customer Support Email', type: 'text', helper: 'Primary incoming help desk address' },
      { key: 'support_phone', label: 'Customer Support Phone', type: 'text', helper: 'Support hotline and WhatsApp line' },
      { key: 'timezone', label: 'Default Platform Timezone', type: 'text', helper: 'Server time zone for reports and logs (e.g. Africa/Lagos)' },
    ],
  },
  // 2. Company
  {
    key: 'company',
    name: '2. Company Information',
    group: 'Platform',
    icon: Building,
    description: 'Corporate registration, legal business entity, CAC/RC registration numbers, and headquarters address.',
    fields: [
      { key: 'company_name', label: 'Registered Business Name', type: 'text', helper: 'Full corporate name as registered with CAC' },
      { key: 'cac_registration_number', label: 'CAC / RC / BN Number', type: 'text', helper: 'Official corporate registration number' },
      { key: 'headquarters_address', label: 'Headquarters Address', type: 'textarea', helper: 'Physical office address for receipts and footer' },
      { key: 'operational_state', label: 'Operating State / Province', type: 'text', helper: 'State of registration (e.g. Lagos, Abuja)' },
      { key: 'operating_country', label: 'Operating Country', type: 'text', helper: 'Country of incorporation (e.g. Nigeria)' },
      { key: 'tax_identification_number', label: 'Tax Identification Number (TIN)', type: 'text', helper: 'FIRS TIN number for corporate filings' },
    ],
  },
  // 3. Branding
  {
    key: 'branding',
    name: '3. Branding & Visual Identity',
    group: 'Platform',
    icon: Palette,
    description: 'Corporate logos, favicons, primary brand colors, typography, and visual assets.',
    fields: [
      { key: 'logo_url', label: 'Primary Logo URL', type: 'text', helper: 'Main header logo image path or URL' },
      { key: 'favicon_url', label: 'Favicon URL', type: 'text', helper: 'Browser tab icon path (e.g. /favicon.ico)' },
      { key: 'primary_color', label: 'Primary Brand Color', type: 'text', helper: 'Hex code for primary buttons and accents (e.g. #4f46e5)' },
      { key: 'secondary_color', label: 'Secondary Brand Color', type: 'text', helper: 'Hex code for secondary accents (e.g. #06b6d4)' },
      { key: 'font_family', label: 'Website Typography', type: 'text', helper: 'Font stack (e.g. Inter, system-ui, sans-serif)' },
      { key: 'watermark_text', label: 'Slip Watermark Text', type: 'text', helper: 'Security watermark applied to downloaded verification slips' },
    ],
  },
  // 4. Website CMS
  {
    key: 'website',
    name: '4. Website CMS',
    group: 'Platform',
    icon: Globe,
    description: 'Public page visibility, SEO meta tags, navigation menus, and public registration switches.',
    fields: [
      { key: 'meta_title', label: 'Default Meta Title', type: 'text', helper: 'SEO title for search engine indexing' },
      { key: 'meta_description', label: 'Default Meta Description', type: 'textarea', helper: 'Summary snippet for Google & social sharing cards' },
      { key: 'allow_public_registration', label: 'Allow Public Registration', type: 'boolean', helper: 'Allow new customers to create accounts online' },
      { key: 'public_portal_enabled', label: 'Public Website Enabled', type: 'boolean', helper: 'Toggle visibility of public website pages' },
      { key: 'social_facebook_url', label: 'Facebook URL', type: 'text' },
      { key: 'social_twitter_url', label: 'Twitter / X URL', type: 'text' },
      { key: 'social_linkedin_url', label: 'LinkedIn URL', type: 'text' },
    ],
  },
  // 5. Landing Page
  {
    key: 'landing_page',
    name: '5. Landing Page Controls',
    group: 'Platform',
    icon: Layout,
    description: 'Landing page hero section headings, banner visibility, service highlights, and CTA copy.',
    fields: [
      { key: 'hero_title', label: 'Hero Section Title', type: 'text', helper: 'Primary high-impact heading on the homepage' },
      { key: 'hero_subtitle', label: 'Hero Section Subtitle', type: 'textarea', helper: 'Descriptive narrative under the main hero title' },
      { key: 'hero_cta_text', label: 'Hero CTA Button Text', type: 'text', helper: 'Call to action button label' },
      { key: 'show_live_stats', label: 'Display Live Statistics Section', type: 'boolean', helper: 'Show transaction count and happy customer metrics' },
      { key: 'show_announcement_banner', label: 'Show Global Announcement Banner', type: 'boolean', helper: 'Display top marquee notification banner' },
    ],
  },
  // 6. Customer Dashboard
  {
    key: 'customer_dashboard',
    name: '6. Customer Dashboard Controls',
    group: 'Portal',
    icon: Layers,
    description: 'Configure which service modules and features are active inside the customer dashboard.',
    fields: [
      { key: 'enable_virtual_accounts', label: 'Virtual Bank Accounts Module', type: 'boolean', helper: 'Enable dedicated automated bank deposit accounts' },
      { key: 'enable_nin_slips', label: 'NIN Slip Generation & Printing', type: 'boolean', helper: 'Allow customers to generate standard/premium NIN slips' },
      { key: 'enable_wallet_transfers', label: 'Peer-to-Peer Wallet Transfers', type: 'boolean', helper: 'Allow customers to send funds between platform accounts' },
      { key: 'enable_airtime_swap', label: 'Airtime to Cash Conversion', type: 'boolean', helper: 'Enable automated airtime swap module' },
      { key: 'enable_exam_pins', label: 'Educational Exam PINs (WAEC/NECO/JAMB)', type: 'boolean', helper: 'Allow purchase of educational scratch tokens' },
    ],
  },
  // 7. Admin Dashboard
  {
    key: 'admin_dashboard',
    name: '7. Admin Dashboard Controls',
    group: 'Security',
    icon: Shield,
    description: 'Telemetry refresh rates, administrative session timeouts, and IP whitelisting options.',
    fields: [
      { key: 'telemetry_refresh_interval_sec', label: 'Auto-Refresh Interval (Seconds)', type: 'number', helper: 'How often overview charts refresh live' },
      { key: 'admin_session_timeout_minutes', label: 'Admin Session Inactivity Timeout (Minutes)', type: 'number', helper: 'Automatic sign-out timer for idle administrators' },
      { key: 'strict_ip_whitelist_enabled', label: 'Enforce IP Whitelist for Staff', type: 'boolean', helper: 'Restrict root login to designated office IP addresses' },
      { key: 'allowed_admin_ips', label: 'Whitelisted IP Addresses (Comma-separated)', type: 'text', helper: 'List of allowed IP addresses when whitelist is active' },
    ],
  },
  // 8. Authentication & Password
  {
    key: 'authentication',
    name: '8. Authentication & Password',
    group: 'Security',
    icon: Key,
    description: 'Password complexity requirements, login attempt limits, account lockout durations, and 2FA policies.',
    fields: [
      { key: 'min_password_length', label: 'Minimum Password Length', type: 'number', helper: 'Minimum number of characters required for user passwords' },
      { key: 'max_login_attempts', label: 'Max Failed Login Attempts Before Lockout', type: 'number', helper: 'Shield against brute force credential stuffing' },
      { key: 'lockout_duration_minutes', label: 'Account Lockout Duration (Minutes)', type: 'number', helper: 'How long an account remains locked after repeated failures' },
      { key: 'require_email_verification', label: 'Require Email Verification Before Login', type: 'boolean', helper: 'Prevent unverified emails from accessing dashboard' },
      { key: 'allow_remember_me', label: 'Enable 30-day "Remember Me" Tokens', type: 'boolean', helper: 'Issue extended refresh tokens for trusted devices' },
    ],
  },
  // 9. Security Policies
  {
    key: 'security',
    name: '9. Security Policies',
    group: 'Security',
    icon: Lock,
    description: 'API rate limits, CSRF token validation, SQL injection shields, and payload sanitization rules.',
    fields: [
      { key: 'api_rate_limit_per_minute', label: 'API Rate Limit (Requests / Minute / IP)', type: 'number', helper: 'Throttle aggressive traffic to prevent server overload' },
      { key: 'enforce_csrf_validation', label: 'Enforce Strict CSRF Header Validation', type: 'boolean', helper: 'Require X-Requested-With and bearer auth on all mutations' },
      { key: 'log_security_events', label: 'Log Failed Access to Audit Trail', type: 'boolean', helper: 'Record unauthorized attempts in security ledger' },
      { key: 'mask_customer_bvn', label: 'Mask Customer BVN on Dashboard View', type: 'boolean', helper: 'Display BVN as *******1234 on non-admin screens' },
    ],
  },
  // 10. KYC & Identity Rules
  {
    key: 'kyc',
    name: '10. KYC & Identity Rules',
    group: 'Compliance',
    icon: UserCheck,
    description: 'Tier limits, mandatory document verification thresholds, and automated validation rules.',
    fields: [
      { key: 'tier1_daily_limit', label: 'Tier 1 Daily Transaction Limit (₦)', type: 'number', helper: 'Unverified phone/email account limit' },
      { key: 'tier2_daily_limit', label: 'Tier 2 Daily Transaction Limit (₦)', type: 'number', helper: 'Verified NIN/BVN account limit' },
      { key: 'tier3_daily_limit', label: 'Tier 3 Daily Transaction Limit (₦)', type: 'number', helper: 'Full corporate/CAC verified merchant limit' },
      { key: 'require_kyc_for_funding_over', label: 'Require KYC for Single Funding Above (₦)', type: 'number', helper: 'Prompts KYC upload when funding exceeds this figure' },
      { key: 'auto_verify_nin_match', label: 'Auto-Approve KYC on Exact Name Match', type: 'boolean', helper: 'Automatically approve Level 2 when NIN matches profile' },
    ],
  },
  // 11. Wallet & Ledger Controls
  {
    key: 'wallet',
    name: '11. Wallet & Ledger Controls',
    group: 'Financial',
    icon: Wallet,
    description: 'Minimum/maximum wallet funding amounts, overdraft rules, and transaction PIN enforcement.',
    fields: [
      { key: 'min_funding_amount', label: 'Minimum Wallet Funding (₦)', type: 'number', helper: 'Minimum deposit allowed via online gateways' },
      { key: 'max_funding_amount', label: 'Maximum Single Funding (₦)', type: 'number', helper: 'Maximum allowed single deposit transaction' },
      { key: 'allow_negative_balance', label: 'Allow Negative Balance (Overdraft)', type: 'boolean', helper: 'Strictly forbidden in production to prevent deficits' },
      { key: 'require_transaction_pin', label: 'Require Transaction PIN for Debits', type: 'boolean', helper: 'Prompt for 4-digit PIN before charging user wallet' },
    ],
  },
  // 12. Payment Gateways
  {
    key: 'payment_gateways',
    name: '12. Payment Gateways',
    group: 'Financial',
    icon: CreditCard,
    description: 'Payment processors status, active gateways, bank transfer details, and transaction processing modes.',
    fields: [
      { key: 'paystack_enabled', label: 'Enable Paystack Gateway', type: 'boolean', helper: 'Process debit cards, USSD, and bank transfers' },
      { key: 'flutterwave_enabled', label: 'Enable Flutterwave Gateway', type: 'boolean', helper: 'Process multi-currency and card payments' },
      { key: 'manual_transfer_enabled', label: 'Enable Direct Bank Transfer (Manual)', type: 'boolean', helper: 'Allow users to submit proof of bank transfer' },
      { key: 'gateway_environment', label: 'Gateway Mode', type: 'select', options: [{ label: 'Live Production', value: 'live' }, { label: 'Sandbox / Test', value: 'test' }] },
      { key: 'bank_transfer_bank', label: 'Manual Funding Bank Name', type: 'text', helper: 'e.g. Moniepoint MFB, OPay, Wema Bank' },
      { key: 'bank_transfer_account_number', label: 'Manual Funding Account Number', type: 'text', helper: '10-digit NUBAN account number' },
      { key: 'bank_transfer_account_name', label: 'Manual Funding Account Name', type: 'text', helper: 'Beneficiary company name' },
    ],
  },
  // 13. Provider Integration (Admin Only)
  {
    key: 'providers',
    name: '13. Provider Integration & Routing',
    group: 'Integration',
    icon: Cpu,
    description: 'Administrative gateway assignment, primary vs fallback routing, and upstream health parameters.',
    fields: [
      { key: 'active_verification_provider', label: 'Primary Verification Provider', type: 'select', options: [
        { label: '2SureVerify (Official Partner)', value: '2sureverify' },
        { label: 'Veripine Core API', value: 'veripine' },
        { label: 'Internal Sandbox Engine', value: 'sandbox' }
      ], helper: 'Root upstream gateway for NIN and BVN services' },
      { key: 'fallback_verification_provider', label: 'Fallback Verification Provider', type: 'select', options: [
        { label: 'None (Fail Fast)', value: 'none' },
        { label: 'Veripine Secondary Engine', value: 'veripine' },
        { label: '2SureVerify Failover Engine', value: '2sureverify' }
      ], helper: 'Automated failover gateway if primary returns HTTP 5xx' },
      { key: 'active_telecom_provider', label: 'Active Telecom Provider', type: 'select', options: [
        { label: 'UlamaData Core API', value: 'ulamadata' },
        { label: 'VTpass Live Gateway', value: 'vtpass' }
      ], helper: 'Provider for airtime, data bundles, and electricity tokens' },
      { key: 'provider_timeout_seconds', label: 'Provider Request Timeout (Seconds)', type: 'number', helper: 'Maximum wait time before timeout error' },
    ],
  },
  // 14. Service Pricing & Margins
  {
    key: 'pricing',
    name: '14. Service Pricing & Margins',
    group: 'Financial',
    icon: Percent,
    description: 'Default retail markup percentages, fixed service fees, and minimum profit margins.',
    fields: [
      { key: 'default_markup_percent', label: 'Default Service Markup (%)', type: 'number', helper: 'Default percentage added to wholesale cost price' },
      { key: 'minimum_profit_ngn', label: 'Minimum Profit Floor per Transaction (₦)', type: 'number', helper: 'Guaranteed minimum profit margin in Naira' },
      { key: 'nin_standard_retail_price', label: 'Standard NIN Verification Price (₦)', type: 'number', helper: 'Base retail cost for standard customer lookup' },
      { key: 'nin_premium_slip_price', label: 'Premium Color Slip Generation Fee (₦)', type: 'number', helper: 'Cost to render and download standard PDF slip' },
    ],
  },
  // 15. Transaction Rules
  {
    key: 'transactions',
    name: '15. Transaction Rules',
    group: 'Financial',
    icon: RefreshCw,
    description: 'Automated refund triggers on provider failure, duplicate transaction guards, and webhook validation.',
    fields: [
      { key: 'auto_refund_on_failure', label: 'Auto-Refund Wallet on Upstream Failure', type: 'boolean', helper: 'Instantly refund customer balance if provider order fails' },
      { key: 'prevent_duplicate_orders_sec', label: 'Prevent Duplicate Orders Window (Seconds)', type: 'number', helper: 'Block identical requests within this time frame' },
      { key: 'max_auto_retries', label: 'Maximum Upstream Auto-Retries', type: 'number', helper: 'Number of automatic retries before marking as failed' },
    ],
  },
  // 16. SMTP & Mail Delivery
  {
    key: 'smtp',
    name: '16. SMTP & Mail Delivery',
    group: 'Communication',
    icon: Mail,
    description: 'Outgoing email server host, port, authentication credentials, and sender headers.',
    fields: [
      { key: 'smtp_host', label: 'SMTP Host Server', type: 'text', helper: 'e.g. mail.hambaktech.com.ng or smtp.gmail.com' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', helper: 'Usually 465 (SSL) or 587 (TLS)' },
      { key: 'smtp_encryption', label: 'Encryption Protocol', type: 'select', options: [{ label: 'TLS (STARTTLS)', value: 'tls' }, { label: 'SSL', value: 'ssl' }, { label: 'None', value: 'none' }] },
      { key: 'smtp_username', label: 'SMTP Username / Account', type: 'text', helper: 'Mail account login (e.g. support@hambaktech.com.ng)' },
      { key: 'smtp_sender_name', label: 'Default Sender Display Name', type: 'text', helper: 'Display name appearing in inbox (e.g. HambakTech Services)' },
      { key: 'smtp_sender_email', label: 'Default Sender Email Address', type: 'text', helper: 'Email address shown in From: header' },
    ],
  },
  // 17. Email Templates
  {
    key: 'email_templates',
    name: '17. Email Templates',
    group: 'Communication',
    icon: FileText,
    description: 'Toggle transactional notifications for registrations, wallet funding receipts, and security alerts.',
    fields: [
      { key: 'send_welcome_email', label: 'Send Welcome Email on Registration', type: 'boolean', helper: 'Dispatches onboarding guide to new signups' },
      { key: 'send_funding_receipt', label: 'Send Wallet Funding Receipt Email', type: 'boolean', helper: 'Dispatches PDF / HTML receipt when wallet is credited' },
      { key: 'send_login_alert', label: 'Send Security Alert on New IP Login', type: 'boolean', helper: 'Notifies user when account is accessed from new location' },
      { key: 'send_password_reset_email', label: 'Allow Automated Password Reset Emails', type: 'boolean', helper: 'Transmits one-time recovery tokens via email' },
    ],
  },
  // 18. SMS Gateway
  {
    key: 'sms',
    name: '18. SMS Gateway',
    group: 'Communication',
    icon: MessageSquare,
    description: 'SMS API provider configuration, sender ID (11 characters max), and low-balance warnings.',
    fields: [
      { key: 'sms_sender_id', label: 'SMS Sender ID (Alphanumeric)', type: 'text', helper: '11 characters max (e.g. HAMBAKTECH)' },
      { key: 'enable_transactional_sms', label: 'Enable Transactional SMS Alerts', type: 'boolean', helper: 'Send SMS on wallet credit and high-value orders' },
      { key: 'sms_low_balance_threshold', label: 'SMS Gateway Balance Alert Threshold (₦)', type: 'number', helper: 'Alert admin when gateway balance drops below this' },
    ],
  },
  // 19. System Notifications
  {
    key: 'notifications',
    name: '19. System Notifications',
    group: 'Communication',
    icon: Bell,
    description: 'In-app notification retention period, admin email alerts on manual funding, and system alarms.',
    fields: [
      { key: 'alert_admin_on_manual_funding', label: 'Alert Admin on New Manual Funding Request', type: 'boolean', helper: 'Sends immediate notification to staff when receipt is uploaded' },
      { key: 'alert_admin_on_kyc_submission', label: 'Alert Admin on New KYC Document Upload', type: 'boolean', helper: 'Notifies compliance team of pending review' },
      { key: 'notification_retention_days', label: 'Customer Notification Retention (Days)', type: 'number', helper: 'Number of days to store notification history before purge' },
    ],
  },
  // 20. Upload Settings
  {
    key: 'uploads',
    name: '20. Upload & Storage Settings',
    group: 'Platform',
    icon: UploadCloud,
    description: 'Maximum upload file size, permitted file MIME types, and document storage directory.',
    fields: [
      { key: 'max_upload_size_mb', label: 'Maximum File Upload Size (MB)', type: 'number', helper: 'Hard ceiling for KYC documents and payment receipts' },
      { key: 'allowed_file_extensions', label: 'Permitted File Extensions', type: 'text', helper: 'Comma-separated (e.g. jpg, jpeg, png, pdf)' },
      { key: 'storage_driver', label: 'Storage Driver', type: 'select', options: [{ label: 'Local Encrypted Disk (cPanel /uploads)', value: 'local' }, { label: 'Amazon S3 / DigitalOcean Spaces', value: 's3' }] },
    ],
  },
  // 21. API Settings
  {
    key: 'api_settings',
    name: '21. API Settings & Webhooks',
    group: 'Integration',
    icon: Code,
    description: 'Public developer API access, webhook secret signatures, and developer sandbox switches.',
    fields: [
      { key: 'enable_developer_api', label: 'Enable Developer REST API', type: 'boolean', helper: 'Allow third-party businesses to verify identities via API key' },
      { key: 'developer_api_rate_limit', label: 'Developer Rate Limit (Requests / Hour)', type: 'number', helper: 'Throttling limit for external API key holders' },
      { key: 'webhook_signature_secret', label: 'Webhook HMAC Signature Secret', type: 'password', helper: 'Secret key used to verify incoming provider webhooks' },
    ],
  },
  // 22. System Configuration
  {
    key: 'system_maintenance',
    name: '22. System Configuration & Maintenance',
    group: 'Platform',
    icon: HardDrive,
    description: 'Platform maintenance mode, debug logging flags, cache purging, and database operational state.',
    fields: [
      { key: 'maintenance_mode', label: 'Activate Platform Maintenance Mode', type: 'boolean', helper: 'Presents friendly maintenance banner to non-admin visitors' },
      { key: 'debug_mode', label: 'Enable Verbose Debug Logs', type: 'boolean', helper: 'Logs SQL execution times and API traces (Keep OFF in production)' },
      { key: 'cache_ttl_seconds', label: 'System Cache TTL (Seconds)', type: 'number', helper: 'Duration to cache catalog and pricing responses' },
    ],
  },
];

export const GlobalSettingsManagement: React.FC = () => {
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
    setSaving(true);
    setFeedback(null);
    try {
      const currentValues = settingsValues[activeCategory.key] || {};
      const res = await api.updateAdminSettingsCategory(activeCategory.key, currentValues);
      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `${activeCategory.name} updated and saved to MySQL successfully.`
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
    c.description.toLowerCase().includes(searchCategory.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sliders className="w-3.5 h-3.5" />
            Stage 8 • 22-Section Reconciliation
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Global System Settings Management</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Comprehensive control over all 22 administrative settings categories. All changes persist to MySQL and immediately influence platform logic.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
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
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Categories Selector on Left (22 Sections) + Settings Form on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 22 Categories Navigation */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search 22 setting categories..."
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
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    <span className="text-xs truncate">{cat.name}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                    isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {cat.group}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Category Form */}
        <div className="lg:col-span-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <activeCategory.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{activeCategory.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{activeCategory.description}</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                <p className="text-xs">Loading category configuration...</p>
              </div>
            ) : (
              <form onSubmit={handleSaveCategory} className="space-y-5">
                <div className="space-y-4">
                  {activeCategory.fields.map(field => {
                    const currentCategoryValues = settingsValues[activeCategory.key] || {};
                    const val = currentCategoryValues[field.key];

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
                            value={val !== undefined ? String(val) : ''}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                          />
                        )}

                        {field.type === 'password' && (
                          <input
                            type="password"
                            value={val !== undefined ? String(val) : ''}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        )}

                        {field.type === 'number' && (
                          <input
                            type="number"
                            value={val !== undefined ? String(val) : ''}
                            onChange={e => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        )}

                        {field.type === 'textarea' && (
                          <textarea
                            rows={3}
                            value={val !== undefined ? String(val) : ''}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                          />
                        )}

                        {field.type === 'select' && field.options && (
                          <select
                            value={val !== undefined ? String(val) : field.options[0]?.value}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
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
                                checked={val === true || val === 1 || val === '1' || val === 'true'}
                                onChange={e => handleFieldChange(field.key, e.target.checked)}
                                className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                              />
                              <span className="text-xs text-slate-300 font-medium">
                                {(val === true || val === 1 || val === '1' || val === 'true') ? 'Enabled / Active' : 'Disabled / Inactive'}
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

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-mono">
                    Affects MySQL table: <code className="text-indigo-400">system_settings</code>
                  </span>

                  <button
                    type="submit"
                    disabled={saving}
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
