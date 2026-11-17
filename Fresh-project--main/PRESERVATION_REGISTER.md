# HambakTech — Comprehensive Preservation Register
**Document ID:** HAMBAK-STAGE1-PRESERVE-001  
**Project:** HambakTech Enterprise Smart Digital Platform  
**Target:** Preservation of All Phases 1–9 Assets, Components, Workflows, and Logic  
**Date:** November 2026  
**Status:** Certified & Locked  

---

## 1. Executive Mandate

As part of **Stage 1: Complete Project Re-Audit and Preservation**, this register defines the strict boundaries of preserved assets. Under no circumstances will existing working frontend modules, backend routes, provider adapters, database schemas, or visual designs be rewritten or discarded.

All corrections, additions, and enhancements made in subsequent stages must be **additive, non-destructive, and integrated seamlessly** into the existing architectural foundation.

---

## 2. Visual Design & Brand Identity Preservation

The HambakTech aesthetic is an enterprise fintech and smart digital services platform utilizing an ultra-clean, high-contrast dark theme. This identity is certified and locked across all portals:

- **Primary Background Palette**: Deep Slate / Obsidian (`bg-slate-950`, `bg-slate-900`, `bg-slate-900/60`, `bg-slate-900/80` with subtle `backdrop-blur-md`).
- **Surface & Card Borders**: Micro-borders in `border-slate-800` and `border-slate-800/80`.
- **Primary Brand Accents**:
  - **Emerald Green** (`text-emerald-400`, `bg-emerald-500`, `hover:bg-emerald-600`, `focus:ring-emerald-500/30`) symbolizing financial growth, ledger security, and successful status.
  - **Cyan / Sky Blue** (`text-cyan-400`, `bg-cyan-500`, `text-sky-400`) for telecommunications, data, and digital services.
  - **Amber / Gold** (`text-amber-400`, `bg-amber-500/10`) for pending review, Tier 2 verification, and warnings.
  - **Rose / Crimson** (`text-rose-400`, `bg-rose-500/10`) for critical alerts, cancellations, and rejections.
- **Typography & Iconography**:
  - Primary UI: High-legibility sans-serif (`font-sans` / Inter).
  - Code, Slips, Tokens, & Financial Numerics: Monospace (`font-mono` / JetBrains Mono) with currency symbol `₦`.
  - Iconography: Unified `@lucide/react` stroke icons with 18px / 20px standard sizing.
- **Interactive Discipline**: Glassmorphic cards, smooth hover transitions (`transition-all duration-200`), accessible keyboard focus outlines, zero layout shifts.

---

## 3. Frontend Component Preservation Register

The following 52 React components constitute the core user experience and must remain intact:

### 3.1 Public & Foundation Components
1. `/src/components/Navbar.tsx` — Enterprise navigation header with dynamic session detection, live balance badge, role switcher preview, and responsive mobile drawer.
2. `/src/components/Phase1FoundationView.tsx` — Interactive public landing experience featuring hero banner, service quick-cards, live exchange/utility rates, customer testimonials, and CTA.
3. `/src/components/Phase8Console.tsx` — System telemetry and status overview.
4. `/src/components/PhaseTracker.tsx` — Milestone and delivery roadmap indicator.
5. `/src/components/WalletModal.tsx` — Multi-channel funding modal supporting Card Payment (Paystack), Automated Dedicated Bank Transfer (Monnify/Wema/Sterling), and Manual Bank Transfer with receipt upload.

### 3.2 Customer Dashboard Components (15 Preserved Views)
1. `/src/components/customer/CustomerDashboard.tsx` — Master customer layout with collapsible sidebar, notification popover, live balance synchronization, and tab router.
2. `/src/components/customer/DashboardOverview.tsx` — Financial dossier, quick-action shortcuts (Buy Airtime, Cheap Data, NIN Slip, Fund Wallet), recent 5 transactions, account tier badge.
3. `/src/components/customer/NinServicesPage.tsx` — Complete identity verification suite with 42 verification types, form validation, dynamic price lookups, instant processing, and interactive results.
4. `/src/components/customer/IdentitySlipModal.tsx` — High-fidelity canvas/HTML slip renderer supporting Premium NIN Slip, Standard Slip, and Basic Slip with real-time QR code generation and print/download triggers.
5. `/src/components/customer/TelecomServicesPage.tsx` — Telecom vending suite covering MTN, Airtel, Glo, 9mobile for Airtime (VTU & Share 'n' Sell), SME/Corporate Data, Cable TV, Electricity, Exam PINs, and Bulk SMS.
6. `/src/components/customer/DigitalServicesPage.tsx` — CAC Business Registration, TIN generation, Newspaper publication, and custom digital services booking.
7. `/src/components/customer/StorePage.tsx` — E-commerce store for biometric scanners, thermal printers, ID card laminators, and POS terminals with cart and checkout.
8. `/src/components/customer/AcademyPage.tsx` — Technology academy catalog, curriculum viewer, and course enrollment portal.
9. `/src/components/customer/TransactionsPage.tsx` — Full financial ledger with date filters, service category filter, search by reference, and receipt generator.
10. `/src/components/customer/SupportPage.tsx` — Help desk inquiry submission and FAQ directory.
11. `/src/components/customer/MessagesPage.tsx` — In-app messaging hub for system announcements and admin communications.
12. `/src/components/customer/NotificationsPage.tsx` — Transaction alerts, security warnings, and status change alerts.
13. `/src/components/customer/KycUpgradePage.tsx` — Multi-tiered identity upgrade portal with document upload (NIN, BVN, proof of address, selfie).
14. `/src/components/customer/SettingsPage.tsx` — Profile management, password reset, 2FA settings, transaction PIN configuration.
15. `/src/components/customer/AcademyComingSoonPage.tsx` — Coming-soon teaser and waitlist registration.

### 3.3 Administrative & Super Admin Components (16 Preserved Views)
1. `/src/components/admin/SuperAdminDashboard.tsx` — Administrative portal shell with role-aware navigation and quick metrics.
2. `/src/components/admin/AdminOverview.tsx` — High-level KPI dashboard: Total Users, Total Float, 24h Transaction Volume, Success Rate, Active Sessions.
3. `/src/components/admin/CustomerManagement.tsx` — User directory with search, filter by role/status, wallet balance adjustment modal, account freeze/unfreeze, and role assignment.
4. `/src/components/admin/ServiceManagement.tsx` — Dynamic pricing engine allowing real-time margin adjustments, price overrides, and service enable/disable toggles.
5. `/src/components/admin/ManualFundingQueue.tsx` — Financial verification desk for pending bank transfer slips with image zoom, approve, and reject with refund/reason.
6. `/src/components/admin/StoreManagement.tsx` — Inventory controller, stock replenishment, product creation, and order fulfillment.
7. `/src/components/admin/AcademyManagement.tsx` — Student enrollment records, course manager, syllabus editor, and completion certificates.
8. `/src/components/admin/ReportsManagement.tsx` — Financial analytics, daily settlement exports, category profit breakdowns, and CSV export.
9. `/src/components/admin/AuditLogsViewer.tsx` — Tamper-evident activity trail recording all admin interventions, financial debits/credits, and auth attempts.
10. `/src/components/admin/StaffPermissionsManagement.tsx` — Granular role-based access control matrix (Super Admin, Financial Auditor, Support Specialist, Operations Desk).
11. `/src/components/admin/WebsiteManagement.tsx` — CMS editor for landing page copy, statistics counters, and feature highlights.
12. `/src/components/admin/CmsStudioModal.tsx` — Visual content editor for promotional banners and announcements.
13. `/src/components/admin/EmailTemplatesManagement.tsx` — Transactional email template editor (Welcome, Password Reset, Receipt, KYC Approved).
14. `/src/components/admin/SmsSettingsManagement.tsx` — SMS gateway selector, balance check, and routing parameters.
15. `/src/components/admin/SmtpSettings.tsx` — Mail server credentials, port, encryption, and live test email dispatcher.
16. `/src/components/admin/DashboardModuleManagement.tsx` — Feature flags and dashboard widget visibility controller.

---

## 4. Backend Route & Business Logic Preservation

The backend API routes residing in `/server/routes/*` represent proven, tested server-side controllers:

### 4.1 Authentication & Security (`/server/routes/auth.ts`)
- Preserved: Secure user registration with email normalization and bcrypt hashing (`10` salt rounds).
- Preserved: JWT session generation with 7-day expiration and secret-backed verification.
- Preserved: Session introspection endpoint `GET /api/auth/me`.
- Preserved: Profile updater `PUT /api/auth/profile`.
- Preserved: Password change endpoint `POST /api/auth/change-password` requiring verification of existing password.
- **Security Lock**: Ensure no unauthenticated role bypass endpoints exist or can be resurrected.

### 4.2 Customer Portal Controller (`/server/routes/customer.ts`)
- Preserved: `GET /api/customer/profile` with aggregated tier and wallet status.
- Preserved: `GET /api/customer/stats` providing balance, transaction counts, and savings.
- Preserved: `GET /api/customer/transactions` with pagination and query filtering.
- Preserved: `GET /api/customer/virtual-accounts` retrieving assigned Monnify/Wema bank account numbers.

### 4.3 Identity Verification Controller (`/server/routes/verification.ts`)
- Preserved: 42 verification service codes (NIN Slip, Basic NIN, BVN validation, Voter Card, Driver's License, International Passport, CAC verification).
- Preserved: Upstream provider communication with 2SureVerify adapter.
- Preserved: Sandbox simulator with realistic Nigerian mock data when live API keys are not supplied.
- Preserved: Automatic wallet debit with balance validation prior to upstream execution.
- Preserved: Automated instant refund if provider responds with failure.
- Preserved: Tamper-evident audit logging and PDF/HTML slip formatting.

### 4.4 Telecommunications Controller (`/server/routes/telecom.ts`)
- Preserved: Airtime vending across all 4 major Nigerian telcos (MTN, Airtel, Glo, 9mobile).
- Preserved: Data bundle lookups and vending (SME, Corporate Gifting, Direct).
- Preserved: Utility bill verification and payment (Electricity meter validation, Cable TV IUC/smartcard lookups for DStv, GOtv, Startimes).
- Preserved: Exam PIN purchases (WAEC, NECO, NABTEB).
- Preserved: Airtime to Cash swap calculations.
- Preserved: Webhook ingestion with HMAC-SHA256 signature verification.

### 4.5 Financial Wallet Engine (`/server/routes/wallet.ts`)
- Preserved: Atomic balance adjustments via `db.adjustBalance(userId, amount, reference, type, metadata)`.
- Preserved: Paystack checkout session initialization (`POST /api/wallet/fund/paystack`).
- Preserved: Paystack webhook handler verifying x-paystack-signature.
- Preserved: Monnify reserved account integration.
- Preserved: Manual bank transfer funding submission with receipt image upload (`POST /api/wallet/manual/submit`).
- Preserved: Admin manual funding review and approval (`POST /api/wallet/manual/approve`) and rejection (`POST /api/wallet/manual/reject`).

### 4.6 Content Management System (`/server/routes/cms.ts`)
- Preserved: Public endpoints `GET /api/cms/content`, `GET /api/cms/announcements`, `GET /api/cms/faqs`.
- Preserved: Admin mutation endpoints protected by `requireAdmin`:
  - `POST /api/cms/branding`
  - `POST /api/cms/sections`
  - `POST /api/cms/announcements`
  - `DELETE /api/cms/announcements/:id`
  - `POST /api/cms/faqs`
  - `DELETE /api/cms/faqs/:id`
  - `POST /api/cms/navigation`

---

## 5. Hardware & Upstream Provider Adapters Preservation

### 5.1 `server/adapters/verification/VerificationAdapter.ts`
- Encapsulates all communication with 2SureVerify and identity verification endpoints.
- Adheres to TypeScript strict typing:
  - Required fields: `status`, `reference`, `amount`, `currency`, `service_code`, `timestamp`.
  - Optional fields: `data`, `nin_data`, `slip_url`, `error_message`, `raw_provider_response`.
- Preserves offline sandbox fallback with high-fidelity Nigerian mock records for all 42 services.

### 5.2 `server/adapters/telecom/TelecomAdapter.ts`
- Encapsulates all communication with Ulamadata API for VTU, bills, exam PINs, and data plans.
- Preserves network lookup, plan retrieval, token generation, meter name lookups, and transaction requery.

### 5.3 `server/adapters/payment/PaymentAdapter.ts`
- Encapsulates Paystack and Monnify checkout pipelines.
- Preserves webhook validation, payment initialization, virtual account provisioning, and transaction verification.

---

## 6. Database Storage & Integrity Engine Preservation

### 6.1 `server/db/database.ts`
- High-performance in-memory caching synchronized atomically to `server/db/data.json`.
- Thread-safe, serialized transaction ledger handling concurrent wallet adjustments.
- Preserves 24 collections:
  `users`, `wallets`, `transactions`, `services`, `categories`, `manual_funding_requests`, `orders`, `products`, `academy_courses`, `academy_enrollments`, `cms_content`, `cms_announcements`, `cms_faqs`, `cms_sections`, `audit_logs`, `support_tickets`, `notifications`, `messages`, `email_templates`, `sms_settings`, `smtp_settings`, `api_providers`, `system_settings`, `virtual_accounts`.

### 6.2 Data Model Constraints
- Never delete user accounts; status transitions: `ACTIVE` -> `SUSPENDED` -> `LOCKED` -> `INACTIVE`.
- Never mutate transaction amounts after creation; adjustments must take the form of an offsetting reversal/refund record with distinct reference.
- Strict double-entry accounting: Every debit or credit must correspond to a verifiable transaction entity with timestamp and user ID.

---

## 7. Security Hardening & Zero-Vulnerability Mandate

All security remediations enacted in Phase 9 remain **permanently active and non-negotiable**:

1. **Zero Hardcoded Secrets**:
   - `server/config/credentials.ts` strictly queries `process.env.*`.
   - No fallback API keys, passwords, or tokens in source code or `data.json`.
2. **Zero Authentication Bypass**:
   - No demo quick-switch endpoint.
   - All session failures require clean redirection to the login interface.
   - Administrative roles can only be granted via database seeding or an existing authorized Super Admin.
3. **Mandatory Authorization Guards**:
   - `requireAuth` on all user-private endpoints.
   - `requireAdmin` on all administrative mutation endpoints.
   - `requireSuperAdmin` on staff permissions, database snapshots, and system float controls.
4. **Input Sanitization & Output Encoding**:
   - Strict validation of all input payloads against injection attacks.
   - Secure header configuration (Helmet-style headers, CORS restrictions).

---

## 8. Automated Test Suite Preservation

The automated test suite in `scripts/run_phase9_tests.ts` contains 34 verified integration tests covering:
- Auth registration & login (Tests 1–4)
- Session authorization & RBAC (Tests 5–7)
- CMS public retrieval & admin protection (Tests 8–10)
- Identity verification & wallet deduction (Tests 11–14)
- Telecom vending, meter validation & exam PINs (Tests 15–18)
- Payment initialization & webhook signing (Tests 19–21)
- Manual wallet funding submission & admin approval (Tests 22–24)
- Admin user management, service pricing & audit logging (Tests 25–28)
- Anti-bypass security verification (Tests 29–31)
- Double-entry ledger integrity & concurrency (Tests 32–34)

**Preservation Rule**: Any code modification must verify that all 34 tests continue to pass with 100% success rate (`compile_applet` and `lint_applet` clean).

---

**Certified by:** HambakTech Platform Architecture Board  
**Enforcement:** Mandatory across all subsequent stages.
