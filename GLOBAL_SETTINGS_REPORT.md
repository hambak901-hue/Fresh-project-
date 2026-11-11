# HAMBAKTECH — STAGE 8: GLOBAL SETTINGS RECONCILIATION REPORT

**Audit Date**: November 11, 2026  
**Implementation**: `GlobalSettingsManagement.tsx` & `SettingsController.php`  
**Storage**: MySQL `system_settings` table on `qfqzpeqx_hambak`.

---

## 1. Overview & 22 Categories Reconciliation

Every administrative settings category requested across Stages 4 through 8 has been unified into a single centralized configuration engine. All modifications save directly to the MySQL database and immediately alter application logic without source code modifications.

---

## 2. Complete Inventory of All 22 Settings Categories

| # | Category Key | Section Name | Target Config Scope & Key Parameters |
| :--- | :--- | :--- | :--- |
| **1** | `general` | General Settings | Site name, tagline, default currency (NGN, ₦), support email, phone, timezone (`Africa/Lagos`) |
| **2** | `company` | Company Information | Corporate registration name, CAC/RC number, TIN, physical address, state, country |
| **3** | `branding` | Branding & Identity | Primary logo URL, favicon URL, primary color (`#4f46e5`), secondary color (`#06b6d4`), font family, watermark text |
| **4** | `website` | Website CMS | SEO meta title, meta description, enable public registration, public portal visibility, social media links |
| **5** | `landing_page` | Landing Page Controls | Hero title, subtitle, CTA text, show live stats, show global announcement marquee |
| **6** | `customer_dashboard`| Customer Dashboard | Enable virtual bank accounts, enable NIN slip printing, enable wallet transfers, airtime swap, exam PINs |
| **7** | `admin_dashboard` | Admin Dashboard | Telemetry auto-refresh interval (sec), inactivity timeout (min), strict staff IP whitelisting |
| **8** | `authentication` | Auth & Password | Min password length, max failed login attempts (lockout), lockout duration (min), email verification |
| **9** | `security` | Security Policies | API rate limiting (req/min), CSRF header enforcement, security event logging, customer BVN masking |
| **10**| `kyc` | KYC & Compliance | Tier 1 limit (₦), Tier 2 limit (₦), Tier 3 limit (₦), KYC funding threshold, auto-approve NIN name match |
| **11**| `wallet` | Wallet & Ledger | Min funding amount, max single funding, prevent overdrafts, enforce transaction PIN on debits |
| **12**| `payment_gateways`| Payment Gateways | Paystack enabled, Flutterwave enabled, Moniepoint manual transfer bank, account number & name |
| **13**| `providers` | Provider Integration | Active verification provider (`2SureVerify`), failover provider, telecom provider (`UlamaData`), timeout (sec) |
| **14**| `pricing` | Pricing & Margins | Default markup (%), minimum profit floor (₦), standard NIN price (₦200), premium slip fee (₦250) |
| **15**| `transactions` | Transaction Rules | Auto-refund wallet on provider failure, prevent duplicate orders window (sec), max auto-retries |
| **16**| `smtp` | SMTP Mail Delivery | SMTP host (`lon110.truehost.cloud`), port (587), encryption (TLS), sender name, sender address |
| **17**| `email_templates` | Email Templates | Welcome email switch, funding receipt email switch, KYC alert email switch, security alert switch |
| **18**| `sms` | SMS Gateway | SMS sender ID (`HAMBAKTECH`), enable transactional SMS, gateway balance alert threshold |
| **19**| `notifications` | System Notifications | Alert admin on manual funding, alert admin on KYC submission, notification retention days |
| **20**| `uploads` | Upload & Storage | Max upload size (5MB), permitted extensions (`jpg, png, pdf`), storage driver (`local` cPanel storage) |
| **21**| `api_settings` | API & Webhooks | Enable developer REST API, developer rate limits, webhook HMAC signature secret |
| **22**| `system_maintenance`| System & Maintenance | Maintenance mode on/off, verbose debug mode off, cache TTL (sec), database connection pool |

---

## 3. Database Persistence

All 22 categories are saved to the `system_settings` table using keyed category JSON payloads or individual setting keys.
```sql
INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
VALUES (:id, :key, :json_value, :category, :description, NOW())
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW();
```

---

## 4. Live API & Frontend Verification

- `GET /api/admin/settings/all` tested live on `https://hambaktech.com.ng`:
  - Returns HTTP 200 with all 22 categories parsed and available.
- `POST /api/admin/settings/update` saves modifications immediately and reflects across server runtime configuration.
