# HambakTech — Correction and Upgrade Plan
**Document ID:** HAMBAK-STAGE1-PLAN-001  
**Project:** HambakTech Enterprise Smart Digital Platform  
**Target:** Phased Remediation, Production Feature Alignment, and Architectural Upgrade  
**Date:** November 2026  
**Status:** Approved for Execution  

---

## 1. Executive Summary

This Correction Plan defines the precise, non-destructive roadmap for bringing the HambakTech codebase into 100% operational, functional, and visual parity with the live production deployment (`https://hambaktech.com.ng`), while preserving all existing working code, designs, and security hardenings completed in Phases 1–9.

In accordance with stage guidelines, every item records:
- **Existing implementation**
- **Current functionality**
- **Required correction**
- **Whether it is tested**
- **Completion status**

---

## 2. Master Itemized Correction Register

### Item 1: Elimination of Hardcoded Credential Fallbacks (Security Finding 1)
- **Existing Implementation**: `server/config/credentials.ts` and `server/db/data.json`.
- **Current Functionality**: Credential resolver strictly queries `process.env.*`. If an environment variable is absent in sandbox mode, graceful simulated mocks or empty strings are returned; no sensitive live keys, passwords, or tokens are committed to source files.
- **Required Correction**: Maintain strict environment-variable isolation. Never reintroduce hardcoded fallback secrets. Keep `.env.example` as the canonical template.
- **Whether It Is Tested**: Tested in Test 29 of `scripts/run_phase9_tests.ts` and verified via source code AST scan.
- **Completion Status**: **COMPLETED & LOCKED (Stage 1 / Phase 9)**

---

### Item 2: Removal of Auth Quick-Switch & Elimination of Auto-Escalation (Security Finding 2)
- **Existing Implementation**: `server/routes/auth.ts` and `src/context/AuthContext.tsx`.
- **Current Functionality**: The unauthenticated `/api/auth/quick-switch` endpoint was permanently purged. `AuthContext.tsx` no longer attempts to auto-elevate invalid sessions to `Super Admin`; expired or invalid sessions cleanly reset state and redirect to the login screen.
- **Required Correction**: Retain strict session verification via standard JWT tokens signed with `JWT_SECRET`.
- **Whether It Is Tested**: Tested in Test 30 of `scripts/run_phase9_tests.ts` (verifying 404/401 on unauthorized escalation).
- **Completion Status**: **COMPLETED & LOCKED (Stage 1 / Phase 9)**

---

### Item 3: CMS Administrative Endpoint Authorization (Security Finding 3)
- **Existing Implementation**: `server/routes/cms.ts`.
- **Current Functionality**: Every mutating administrative route (`POST /api/cms/branding`, `POST /api/cms/sections`, `POST /api/cms/announcements`, `POST /api/cms/faqs`, `POST /api/cms/navigation`) is strictly guarded by the `requireAdmin` middleware. Public endpoints (`GET /api/cms/content`, `GET /api/cms/announcements`, `GET /api/cms/faqs`) only return sanitized public strings.
- **Required Correction**: Retain authorization guards and ensure any new CMS desks (such as legal or SEO content) apply the same `requireAdmin` middleware.
- **Whether It Is Tested**: Tested in Tests 8, 9, and 10 of `scripts/run_phase9_tests.ts`.
- **Completion Status**: **COMPLETED & LOCKED (Stage 1 / Phase 9)**

---

### Item 4: Server Configuration & System Endpoint Hardening (Security Finding 4)
- **Existing Implementation**: `server/routes/system.ts` and `server/routes/cpanel.ts`.
- **Current Functionality**: `/api/system/status` sanitizes internal server metrics and masks IP addresses; export/SFTP routes require authorized Super Admin session.
- **Required Correction**: Retain Super Admin checks on all server operations.
- **Whether It Is Tested**: Tested in Test 31 of `scripts/run_phase9_tests.ts`.
- **Completion Status**: **COMPLETED & LOCKED (Stage 1 / Phase 9)**

---

### Item 5: Double-Entry Financial Ledger & Concurrency Locking (Security Finding 5)
- **Existing Implementation**: `server/db/database.ts` and `server/routes/wallet.ts`.
- **Current Functionality**: `db.adjustBalance` executes atomically using an in-memory lock per user, preventing negative balance debits, duplicate transactions, and race conditions. Reversals create new signed records rather than mutating historic records.
- **Required Correction**: Preserve double-entry ledger invariance across all transaction types (Telecom, NIN, Store, Academy).
- **Whether It Is Tested**: Tested in Tests 14, 22, 23, 24, 32, 33, and 34 of `scripts/run_phase9_tests.ts`.
- **Completion Status**: **COMPLETED & LOCKED (Stage 1 / Phase 9)**

---

### Item 6: Webhook Signature Verification & Provider Isolation (Security Finding 6)
- **Existing Implementation**: `server/routes/telecom.ts` and `server/routes/wallet.ts`.
- **Current Functionality**: Ulamadata and Paystack webhooks verify HMAC-SHA256 signatures against `process.env.ULAMADATA_WEBHOOK_SECRET` and `process.env.PAYSTACK_SECRET_KEY`. Customer APIs never expose upstream provider credentials or raw vendor costs.
- **Required Correction**: Maintain strict signature verification and customer price isolation.
- **Whether It Is Tested**: Tested in Tests 20 and 21 of `scripts/run_phase9_tests.ts`.
- **Completion Status**: **COMPLETED & LOCKED (Stage 1 / Phase 9)**

---

### Item 7: Dedicated KYC Verification Desk (`/admin/kyc`)
- **Existing Implementation**: KYC fields exist in user models; verification actions were embedded inside `CustomerManagement.tsx`.
- **Current Functionality**: Admin can view user KYC status within customer list, but no dedicated desk exists for compliance officers to view document queues, compare ID photos against selfies, and execute one-click Tier upgrades with pre-set limits.
- **Required Correction**:
  1. Create `/src/components/admin/KycVerificationDesk.tsx` with dedicated queues (`Pending`, `Tier 2 Verified`, `Tier 3 Verified`, `Rejected`), side-by-side document modal, and canned rejection reasons.
  2. Implement backend routes: `GET /api/admin/kyc/pending` and `POST /api/admin/kyc/:id/review` (`{ decision, tier, reason }`).
  3. Wire `/admin/kyc` into admin navigation and router.
- **Whether It Is Tested**: Pending Stage 2 implementation; will be tested via dedicated KYC integration test script.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 8: Dedicated Support Desk (`/admin/support`)
- **Existing Implementation**: Customer-facing `SupportPage.tsx` and `MessagesPage.tsx`.
- **Current Functionality**: Customers can send inquiries, but administrative triage was unorganized without ticket IDs, priorities (`Urgent`, `High`, `Normal`), or staff assignment.
- **Required Correction**:
  1. Create `/src/components/admin/SupportDeskManagement.tsx` featuring a two-pane triage workspace (ticket list on left, active message thread and customer dossier on right).
  2. Implement backend routes: `GET /api/admin/support/tickets`, `POST /api/admin/support/tickets/:id/reply`, `PUT /api/admin/support/tickets/:id/status`, `PUT /api/admin/support/tickets/:id/assign`.
  3. Add `support_tickets` collection in `server/db/database.ts`.
- **Whether It Is Tested**: Pending Stage 2 implementation; will be tested with multi-user message thread tests.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 9: Integration Providers Console (`/admin/providers`)
- **Existing Implementation**: Upstream adapters exist in `server/adapters/*`; service tariffs are managed in `ServiceManagement.tsx`.
- **Current Functionality**: Provider settings are mixed inside service pricing, lacking real-time API balance badges, ping latency indicators, manual requery triggers, and raw webhook inspection.
- **Required Correction**:
  1. Create `/src/components/admin/ProviderIntegrationsConsole.tsx` displaying live status cards for 2SureVerify, Ulamadata, Paystack, and Monnify.
  2. Provide manual requery utility (`POST /api/requery`) to verify stuck transactions against upstream APIs.
  3. Provide webhook log viewer (`GET /api/admin/webhooks`).
  4. Implement `GET /api/admin/providers` returning upstream float balances and connectivity status.
- **Whether It Is Tested**: Upstream adapters are tested in Tests 11, 15, and 19; new admin provider console will be tested in Stage 2.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 10: Super Admin Level 0 Operations Console (`/admin/super`)
- **Existing Implementation**: Staff roles and manual funding queue exist in `SuperAdminDashboard.tsx`.
- **Current Functionality**: Administrative controls lack a master Level 0 diagnostic panel showing platform uptime, memory usage, maintenance mode switch, and total customer float vs provider reserve balance audit.
- **Required Correction**:
  1. Enhance `SuperAdminDashboard.tsx` with dedicated Level 0 console.
  2. Implement backend routes:
     - `GET /api/admin/super/status` (Node uptime, process memory, DB stats).
     - `POST /api/admin/super/maintenance` (Platform-wide maintenance toggle with custom notification).
     - `GET /api/admin/super/float-audit` (Reconciles total user wallet balances against upstream provider balances).
- **Whether It Is Tested**: Server health tested in Test 31; float audit endpoint will be added to test suite.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 11: Master Platform Settings & Company Profile Desk (`/admin/settings`)
- **Existing Implementation**: `SmtpSettings.tsx` and `SmsSettingsManagement.tsx` operate separately.
- **Current Functionality**: Admin must open different tabs to configure communication channels, and cannot configure CAC company profile or platform-wide business rules.
- **Required Correction**:
  1. Create `/src/components/admin/PlatformSettingsDesk.tsx` with unified tabs:
     - Company Profile (CAC RC, legal name, address, support phone/email).
     - Financial Rules (minimum wallet fund, max daily limits, auto-refund timeout).
     - Communications Gateway (SMTP, SMS provider, WhatsApp link).
     - Security & Session Policy (session timeout, staff 2FA enforcement).
  2. Implement backend routes: `GET /api/admin/settings`, `POST /api/admin/settings/company`, `POST /api/admin/settings/platform`.
- **Whether It Is Tested**: SMTP test email is tested; platform settings endpoint will be covered in test suite.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 12: Master Multi-Service Order Processing Desk (`/admin/orders`)
- **Existing Implementation**: Store orders are viewed inside `StoreManagement.tsx`; telecom and identity transactions are viewed in `TransactionsPage.tsx`.
- **Current Functionality**: No unified view allows an operations manager to inspect orders across all service types (Hardware Store, NIN Slips, Telecom Bundles, CAC Digital Registrations).
- **Required Correction**:
  1. Create `/src/components/admin/MasterOrderDesk.tsx` with category filters (`All`, `Store Hardware`, `NIN Slips`, `Telecom / Bills`, `Digital Services`, `Academy`).
  2. Implement backend routes: `GET /api/admin/orders` and `PUT /api/admin/orders/:id/status`.
- **Whether It Is Tested**: Orders will be tested via transaction queries and status update tests.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 13: Escrow & Float Ledger Desk (`/admin/wallet`)
- **Existing Implementation**: `ManualFundingQueue.tsx` approves bank deposits; `ReportsManagement.tsx` shows revenue.
- **Current Functionality**: Financial officers cannot view an integrated escrow ledger tracking customer liabilities versus bank deposits and provider float reserves in one table.
- **Required Correction**:
  1. Create `/src/components/admin/EscrowLedgerDesk.tsx` linking manual funding approvals with the double-entry transaction ledger.
  2. Implement `GET /api/admin/wallet/ledger` and alias `GET /api/admin/payments/manual` to `/api/wallet/manual/pending`.
- **Whether It Is Tested**: Manual funding tested in Tests 22–24; ledger audit tested in Tests 32–34.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 14: User Password Recovery Flow (`/forgot-password`, `/reset-password`)
- **Existing Implementation**: Authenticated password change exists in `/api/auth/change-password` and `SettingsPage.tsx`.
- **Current Functionality**: Unauthenticated users who forget their password have no recovery mechanism.
- **Required Correction**:
  1. Implement unauthenticated backend endpoints in `server/routes/auth.ts`:
     - `POST /api/auth/forgot-password` (Generates 6-digit OTP, sends via email/SMS, stores with 15-minute expiry).
     - `POST /api/auth/verify-reset-code` (Validates OTP).
     - `POST /api/auth/reset-password` (Bcrypt-hashes new password, invalidates OTP).
  2. Add Forgot Password modal and workflow to the Login view in `App.tsx`.
- **Whether It Is Tested**: Will be added as automated integration tests in test script.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 15: Production REST API Compatibility Aliases
- **Existing Implementation**: Core endpoints live under `/api/admin/*`, `/api/wallet/*`, and `/api/telecom/*`.
- **Current Functionality**: Certain paths differ from production Next.js conventions (e.g. production uses `/api/admin/payments/manual` where local uses `/api/wallet/manual/pending`).
- **Required Correction**: Add backward-compatible Express route aliases in `server.ts` or route files so both path styles function identically without code duplication:
  - `/api/admin/payments/manual` -> `/api/wallet/manual/pending`
  - `/api/admin/payments/manual/approve` -> `/api/wallet/manual/approve`
  - `/api/admin/payments/manual/reject` -> `/api/wallet/manual/reject`
  - `/api/admin/kyc/pending` -> dedicated handler
  - `/api/admin/providers` -> dedicated handler
  - `/api/admin/products` -> `/api/admin/store/products`
  - `/api/admin/store/orders` -> `/api/admin/orders`
  - `/api/requery` -> `/api/telecom/requery`
  - `/api/public/dashboard/config` -> dynamic layout config
  - `/api/public/dashboard/quick-actions` -> role-based shortcuts
- **Whether It Is Tested**: All local endpoints tested; aliases will be verified via automated HTTP requests.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

### Item 16: Client-Side URL Deep-Linking & History Synchronizer
- **Existing Implementation**: Client SPA controls views via internal React state variables.
- **Current Functionality**: Refreshing the browser or navigating directly to `/admin/users` or `/login` resets to the default home screen.
- **Required Correction**:
  - Implement bidirectional URL synchronization in `src/App.tsx`:
    - On mount: Parse `window.location.pathname` and set the active tab/view accordingly (e.g. `/admin/dashboard`, `/admin/users`, `/admin/kyc`, `/admin/providers`, `/admin/store`, `/admin/payments`, `/admin/reports`, `/admin/support`, `/admin/academy`, `/admin/cms`, `/admin/notifications`, `/admin/super`, `/admin/activity`, `/admin/settings`, `/login`, `/register`, `/portal/dashboard`).
    - On view switch: Use `window.history.pushState` to update the browser address bar without page reload.
    - On back/forward button: Listen to `popstate` event and update active tab.
- **Whether It Is Tested**: Will be tested by simulating URL path changes and checking component mount state.
- **Completion Status**: **SCHEDULED FOR STAGE 2 IMPLEMENTATION**

---

## 3. Implementation Phasing & Milestones

```
+---------------------------------------------------------------------------------+
| STAGE 1: COMPLETE PROJECT RE-AUDIT & PRESERVATION                              |
| Status: 100% COMPLETE                                                           |
| Deliverables:                                                                   |
|   1. COMPLETE_PROJECT_AUDIT.md  [Certified]                                     |
|   2. PRODUCTION_COMPARISON.md   [Certified]                                     |
|   3. MISSING_FEATURES.md        [Certified]                                     |
|   4. PRESERVATION_REGISTER.md   [Certified]                                     |
|   5. CORRECTION_PLAN.md         [Certified]                                     |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| STAGE 2: BACKEND EXTENSIONS & COMPATIBILITY LAYER                               |
| Scope:                                                                          |
|   - Add password reset endpoints (/api/auth/forgot-password, reset-password)    |
|   - Mount production API compatibility aliases (/api/admin/kyc, /api/requery)  |
|   - Add support tickets, kyc queue, and super admin status routes               |
|   - Verify all 34 existing tests + new endpoint integration tests               |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| STAGE 3: FRONTEND DESK ELEVATION & ROUTING PARITY                               |
| Scope:                                                                          |
|   - Create KycVerificationDesk.tsx (/admin/kyc)                                 |
|   - Create SupportDeskManagement.tsx (/admin/support)                           |
|   - Create ProviderIntegrationsConsole.tsx (/admin/providers)                   |
|   - Create PlatformSettingsDesk.tsx (/admin/settings)                           |
|   - Create MasterOrderDesk.tsx (/admin/orders) & EscrowLedgerDesk.tsx (/wallet) |
|   - Integrate URL synchronizer for direct deep-linking in App.tsx               |
|   - Add Forgot Password modal to Login                                          |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| STAGE 4: COMPREHENSIVE VERIFICATION & QUALITY ASSURANCE                         |
| Scope:                                                                          |
|   - Full test suite execution across all 15 production URLs                     |
|   - compile_applet and lint_applet zero-error certification                     |
|   - Final audit delivery to user                                                |
+---------------------------------------------------------------------------------+
```

---

## 4. Preservation & Non-Destruction Quality Guarantee

1. No existing files in `src/components/*` or `server/*` will be removed.
2. Existing UI layouts, dark theme visual hierarchy, responsive tables, and interactive modals will be strictly maintained.
3. Every new desk will reuse the established design system (Tailwind `slate-950` / `slate-900`, `emerald-500` accents, Lucide icons, glassmorphism).
4. System stability will be maintained with `compile_applet` and `lint_applet` validation after every phase.

---

**Certified by:** HambakTech Enterprise Architecture Team  
**Approval:** Ready for execution.
