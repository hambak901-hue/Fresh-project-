# HambakTech — Missing Features & Reconciliation Register
**Document ID:** HAMBAK-STAGE1-MISSING-001  
**Audit Target:** `https://hambaktech.com.ng` (Live Production Next.js Deployment)  
**Local Codebase:** HambakTech Enterprise v1.0.0 (Node.js/Express + React/Tailwind)  
**Date:** November 2026  
**Status:** Comprehensive Analysis & Reconciliation Complete  

---

## 1. Executive Summary

During Stage 1 deep inspection of the live production environment at `https://hambaktech.com.ng` (conducted via authenticated route probing, Turbopack client bundle reverse-engineering, and comparative endpoint mapping), we identified specific features, dedicated views, and REST API conventions present in production that require reconciliation in the local codebase.

Importantly, **the vast majority of core business logic already exists locally** (such as KYC status updates, support tickets, provider pricing, store inventory, academy courses, manual funding approval, and audit logs). However, in the local React SPA, several administrative desks were historically consolidated into overarching tabs (e.g., KYC embedded inside `CustomerManagement.tsx`, provider health inside `ServiceManagement.tsx`, support inside `SupportPage.tsx`), whereas production elevates them to distinct sidebar destinations with dedicated RESTful API contracts.

This register catalogues every identified delta, defines the required backend connections, specifies database requirements, and outlines non-destructive integration pathways that preserve all existing features while achieving 100% parity with production.

---

## 2. Inventory of Missing & Reconciled Desks

| ID | Production Desk / Feature | Production URL | Local Status Prior to Stage 1 | Required Reconciliation Action | Priority |
|:---|:---|:---|:---|:---|:---|
| **MF-01** | Dedicated KYC Compliance Desk | `/admin/kyc` | Embedded in `CustomerManagement.tsx` | Elevate to dedicated `/admin/kyc` view; implement `/api/admin/kyc/pending` & review actions | High |
| **MF-02** | Dedicated Support Ticket Desk | `/admin/support` | Customer view exists; admin managed via chat log | Elevate to dedicated `/admin/support` desk with ticket status, assignment, and canned responses | High |
| **MF-03** | Integration Providers Console | `/admin/providers` | Embedded in `ServiceManagement.tsx` | Provide dedicated Provider health, real-time balance monitors, and `/api/requery` triggers | High |
| **MF-04** | Super Admin Level 0 Console | `/admin/super` | Sub-sections in `SuperAdminDashboard.tsx` | Provide dedicated system float audit, maintenance mode toggle, and diagnostic trigger panel | High |
| **MF-05** | System Settings & Company Profile | `/admin/settings` | SMTP & SMS separated | Consolidate into cohesive platform settings, company profile, and operational parameters | Medium |
| **MF-06** | Dedicated Order Processing Desk | `/admin/orders` | Store orders in `StoreManagement.tsx` | Provide unified multi-service order lifecycle manager (Store, Telecom, NIN, Services) | Medium |
| **MF-07** | Escrow & Float Ledger Desk | `/admin/wallet` | Split between `AuditLogsViewer` & `Reports` | Dedicated system float reconciliation view with provider liabilities vs customer deposits | Medium |
| **MF-08** | Password Recovery Flow | `/forgot-password`, `/reset-password` | Omitted in initial auth routes | Add `/api/auth/forgot-password`, `/api/auth/verify-reset-code`, `/api/auth/reset-password` | High |
| **MF-09** | Production API Compatibility Aliases | `/api/admin/*` | Dispersed in `/api/admin/*` & `/api/wallet/*` | Add endpoint aliases to match exact production routing schemas without breaking existing endpoints | High |
| **MF-10** | Direct Browser URL Deep Linking | `/login`, `/register`, `/admin/*`, `/portal/*` | Single-page state tab-based | Add window history / route synchronizer so direct browser navigation and reloads work seamlessly | Medium |

---

## 3. Detailed Feature Breakdown & Specifications

### MF-01: Dedicated KYC Verification Desk (`/admin/kyc`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/kyc`
- **Component Purpose**: Specialized compliance officer workspace for identity verification, document validation, and risk tier evaluation.
- **Observed Production Endpoints**:
  - `GET /api/admin/kyc/pending` — Returns queue of unverified or pending tier-upgrade accounts.
  - `POST /api/admin/kyc/:userId/approve` — Upgrades tier, increases transaction limits, dispatches notification.
  - `POST /api/admin/kyc/:userId/reject` — Flags user with rejection reason, dispatches SMS/email with corrective steps.

#### Local Gap Analysis
- Local codebase contains Tier 1/2/3 user models and KYC fields (`tier`, `bvn`, `nin`, `documents`) in `server/db/data.json`, but verification actions were scattered across the general customer table.

#### Required Solution & Design Language
- **Frontend Component**: `/src/components/admin/KycVerificationDesk.tsx`
  - Status filter pills: `All`, `Pending Review`, `Verified (Tier 2/3)`, `Rejected / Incomplete`.
  - Side-by-side document inspection modal (Government ID, NIN Slip, Proof of Address, Selfie).
  - One-click Tier 2 (`₦200,000` daily limit) and Tier 3 (`₦5,000,000` daily limit) approvals.
  - Canned rejection reasons (Blurry image, Name mismatch, Expired document).
- **Backend Endpoints**:
  - `GET /api/admin/kyc/pending` (filter users where `kyc_status === 'pending' || kyc_status === 'submitted'`)
  - `POST /api/admin/kyc/:id/review` (`{ decision: 'approved' | 'rejected', tier: number, reason?: string }`)
- **Theme**: Dark slate (`bg-slate-900/50`, `border-slate-800`), Emerald buttons for approval, Amber for Tier 2, Rose for rejection.

---

### MF-02: Dedicated Support Desk (`/admin/support`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/support`
- **Component Purpose**: Centralized customer support desk handling ticketing, inquiries, dispute escalations, and automated quick responses.
- **Observed Production Endpoints**:
  - `GET /api/admin/support/tickets` — Lists support threads with filters for `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.
  - `POST /api/admin/support/tickets/:id/reply` — Posts admin response and sends email/in-app notification to customer.
  - `PUT /api/admin/support/tickets/:id/status` — Updates ticket status and assigns to staff members.

#### Local Gap Analysis
- Local system has customer-facing `SupportPage.tsx` and `MessagesPage.tsx`, but no dedicated admin workspace for support agents to triage and assign tickets.

#### Required Solution & Design Language
- **Frontend Component**: `/src/components/admin/SupportDeskManagement.tsx`
  - Ticket queue with priority badges (`Urgent`, `High`, `Normal`, `Low`).
  - Active conversation split view: Ticket list on left (35%), active conversation thread with composer and customer quick-dossier on right (65%).
  - Pre-defined response templates (e.g., "Network Delay Advisory", "Refund Initiated", "Verification Guidance").
- **Backend Endpoints**:
  - `GET /api/admin/support/tickets`
  - `POST /api/admin/support/tickets/:id/reply`
  - `PUT /api/admin/support/tickets/:id/assign`
  - `PUT /api/admin/support/tickets/:id/status`
- **Database Schema**:
  - Add collection `support_tickets` in `server/db/database.ts` with fields: `id`, `ticket_no`, `user_id`, `user_name`, `user_email`, `subject`, `category`, `priority`, `status`, `assigned_to`, `messages: [{ sender, text, timestamp }]`, `created_at`, `updated_at`.

---

### MF-03: Integration Providers Console (`/admin/providers`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/providers`
- **Observed Production Endpoints**:
  - `GET /api/admin/providers` — Status, latency, API balance for 2SureVerify, Ulamadata, Paystack, Monnify.
  - `GET /api/admin/provider-products` — Mapping of internal product SKUs to upstream provider service codes.
  - `POST /api/requery` — Force-triggers upstream requery for stuck/pending transactions.
  - `GET /api/admin/webhooks` — Logs of incoming webhook payloads and validation status.

#### Local Gap Analysis
- Local adapters exist in `server/adapters/*` and service pricing is configured in `ServiceManagement.tsx`, but there was no single diagnostic cockpit showing live provider balances, ping health, automated failover triggers, or requery queues.

#### Required Solution & Design Language
- **Frontend Component**: `/src/components/admin/ProviderIntegrationsConsole.tsx`
  - Grid of Provider Cards:
    1. **2SureVerify** (NIN, BVN, Voter's Card, Driver's License verification API).
    2. **Ulamadata** (Airtime, Data, Cable TV, Electricity, Exam PINs, Bulk SMS).
    3. **Paystack** (Virtual accounts, cards, bank transfer).
    4. **Monnify** (Dedicated reserved accounts, card collections).
  - Real-time balance badges, ping latency, and environment toggle (Sandbox vs Production).
  - Manual Requery Tool: enter transaction reference or provider order ID to trigger upstream verification.
  - Webhook Traffic Inspector: inspect raw headers, signature status, and payload body.
- **Backend Endpoints**:
  - `GET /api/admin/providers`
  - `POST /api/requery` (supports `{ reference: string, provider: 'ulamadata' | '2sureverify' | 'paystack' }`)
  - `GET /api/admin/webhooks`

---

### MF-04: Super Admin Level 0 Operations Console (`/admin/super`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/super`
- **Observed Production Endpoints**:
  - `GET /api/admin/super/status` — Returns database health, memory usage, uptime, active sessions, and environment status.
  - `POST /api/admin/super/maintenance` — Enables/disables platform-wide maintenance mode.
  - `GET /api/admin/super/float-audit` — Reconciles total customer wallet balances against provider float reserves.

#### Local Gap Analysis
- Local `SuperAdminDashboard.tsx` had staff permissions, audit logs, and manual funding, but lacked the specialized system status diagnostics and maintenance mode governance.

#### Required Solution & Design Language
- **Frontend Component**: Integrated into `/src/components/admin/SuperAdminDashboard.tsx` and elevated as a primary view:
  - System Health telemetry cards (Node.js uptime, memory footprint, active users, DB read/write throughput).
  - Emergency Maintenance Mode toggle with customizable customer banner text.
  - Financial Float Reconciliation: Total User Balances vs Upstream Provider Float balances, calculating platform solvency ratio.
  - Database Backup & Diagnostic Snapshot triggers.
- **Backend Endpoints**:
  - `GET /api/admin/super/status`
  - `POST /api/admin/super/maintenance`
  - `GET /api/admin/super/float-audit`

---

### MF-05: System Settings & Company Profile Desk (`/admin/settings`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/settings`
- **Observed Production Endpoints**:
  - `GET /api/admin/settings/company`
  - `POST /api/admin/settings/company`
  - `GET /api/admin/settings/platform`
  - `POST /api/admin/settings/platform`

#### Local Gap Analysis
- Local system had isolated `SmtpSettings.tsx` and `SmsSettingsManagement.tsx`, but lacked a unified master settings desk for company information (CAC RC number, contact address, support telephone, legal entity name) and platform global toggles (auto-refund on failure, minimum wallet funding amount, referral bonus percentage).

#### Required Solution & Design Language
- **Frontend Component**: `/src/components/admin/PlatformSettingsDesk.tsx`
  - Tabbed settings interface:
    - Tab 1: **Company Profile** (Brand name, CAC registration number, Head office, Support lines, Official emails).
    - Tab 2: **Financial & Wallet Rules** (Minimum wallet funding `₦500`, maximum daily transfer, automated refund timeout, referral reward).
    - Tab 3: **Communications Gateway** (Unified SMTP credentials, SMS API provider, WhatsApp business link).
    - Tab 4: **Security & Session Policy** (Session timeout in minutes, mandatory 2FA for staff, IP whitelisting for Super Admin).
- **Backend Endpoints**:
  - `GET /api/admin/settings`
  - `POST /api/admin/settings/company`
  - `POST /api/admin/settings/platform`

---

### MF-06: Dedicated Order Processing Desk (`/admin/orders`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/orders`
- **Component Purpose**: Master log for multi-category customer orders across physical/digital goods, telecom bundles, and verified slips.

#### Required Solution & Design Language
- **Frontend Component**: `/src/components/admin/MasterOrderDesk.tsx`
  - Unified table filterable by category (`Telecom / VTU`, `NIN / Identity Slip`, `Store Products`, `Digital Services`, `Academy Enrollments`).
  - Order lifecycle actions: Mark fulfilled, Print order receipt, Issue full/partial refund, Download customer document attachment.
- **Backend Endpoints**:
  - `GET /api/admin/orders` (unifies transactions with product metadata).
  - `PUT /api/admin/orders/:id/status` (updates status and dispatches status update email).

---

### MF-07: Escrow & Float Ledger Desk (`/admin/wallet`)

#### Production Findings
- **Route**: `https://hambaktech.com.ng/admin/wallet`
- **Component Purpose**: Financial officer ledger tracking inbound deposits, upstream outbound cost debits, manual funding approvals, and ledger reconciliation.

#### Required Solution & Design Language
- **Frontend Component**: Elevated within `/src/components/admin/ManualFundingQueue.tsx` & `/src/components/admin/EscrowLedgerDesk.tsx`
  - Real-time Escrow Summary: Total User Deposits, Provider Float Reserve, Unsettled Inbound Payments, Platform Gross Profit.
  - Live ledger table with double-entry debits and credits.
- **Backend Endpoints**:
  - `GET /api/admin/wallet/ledger`
  - `GET /api/admin/payments/manual` (alias for `/api/wallet/manual/pending`)
  - `POST /api/admin/payments/manual/approve`
  - `POST /api/admin/payments/manual/reject`

---

### MF-08: User Password Recovery Flow

#### Production Findings
- Direct access to `/forgot-password` and `/reset-password` on `https://hambaktech.com.ng`.

#### Gap in Local Codebase
- Local `AuthContext` and `server/routes/auth.ts` supported registration, login, profile updating, and change-password (when authenticated), but lacked the unauthenticated forgotten-password reset loop via email/SMS token.

#### Required Solution
- **Backend Endpoints in `server/routes/auth.ts`**:
  - `POST /api/auth/forgot-password` (`{ email: string }`) — Generates 6-digit numeric OTP with 15-minute expiry, sends email via `mailer.ts` or console in dev, returns `{ success: true, message: 'Reset code sent' }`.
  - `POST /api/auth/verify-reset-code` (`{ email: string, code: string }`) — Validates OTP validity.
  - `POST /api/auth/reset-password` (`{ email: string, code: string, new_password: string }`) — Hashes new password with bcrypt, clears OTP, returns success confirmation.
- **Frontend Component**:
  - Forgot Password modal/view integrated seamlessly into Login screen with OTP input and new password confirmation.

---

### MF-09: Production API Compatibility Aliases

To ensure that any client or integration expecting the exact production path structure succeeds, the following endpoint aliases must be mounted on the Express server:

| Production Expected Route | Local Native Route | Purpose |
|:---|:---|:---|
| `GET /api/admin/users` | `GET /api/admin/users` | Master user directory with role/status query filters |
| `GET /api/admin/kyc/pending` | `GET /api/admin/kyc/pending` | Compliance desk queue |
| `GET /api/admin/payments/manual` | `GET /api/wallet/manual/pending` | Pending manual bank transfer funding requests |
| `POST /api/admin/payments/manual/approve` | `POST /api/wallet/manual/approve` | Manual funding approval |
| `POST /api/admin/payments/manual/reject` | `POST /api/wallet/manual/reject` | Manual funding rejection |
| `GET /api/admin/providers` | `GET /api/admin/providers` | Upstream provider connection health & balances |
| `GET /api/admin/provider-products` | `GET /api/admin/services` | Service tariffs & upstream mapping |
| `POST /api/requery` | `POST /api/telecom/requery` | Transaction requery trigger |
| `GET /api/admin/products` | `GET /api/admin/store/products` | E-commerce catalog |
| `GET /api/admin/store/orders` | `GET /api/admin/orders` | Store orders |
| `GET /api/admin/academy/students` | `GET /api/admin/academy/students` | Academy enrolled students |
| `GET /api/admin/academy/courses` | `GET /api/admin/academy/courses` | Academy curriculum |
| `GET /api/public/dashboard/config` | `GET /api/public/dashboard/config` | Dynamic navigation & layout configuration |
| `GET /api/public/dashboard/quick-actions`| `GET /api/public/dashboard/quick-actions` | Role-based quick launch shortcuts |
| `GET /api/admin/activity/summary` | `GET /api/admin/activity/summary` | 24-hour audit metrics |
| `GET /api/admin/super/status` | `GET /api/admin/super/status` | Level 0 diagnostic telemetry |

---

### MF-10: Browser Direct URL Deep-Linking & History Synchronizer

#### Observed Behavior on Production
- Navigating directly to `https://hambaktech.com.ng/admin/users` or `https://hambaktech.com.ng/login` renders the specific desk directly without needing to start at the landing page and click multiple tabs.

#### Solution
- Implement lightweight window URL sync in `src/App.tsx`:
  - Reads `window.location.pathname` on mount.
  - Updates URL pathname via `window.history.pushState` when switching views (e.g., `/admin/users`, `/admin/kyc`, `/admin/providers`, `/portal/dashboard`, `/login`).
  - Supports browser Back/Forward navigation (`popstate` listener).
  - Preserves SPA execution without full-page reloads.

---

## 4. Preservation & Non-Destructive Principles

1. **Zero Deletion Policy**: No working components, utility functions, or route handlers will be deleted.
2. **Backward Compatibility**: All existing local endpoints (e.g., `/api/wallet/manual/pending`, `/api/admin/services`) remain intact; new aliases will simply route to or wrap the existing verified logic.
3. **Design Continuity**: All new desks adopt the exact same UI component library, color system (`slate-950`, `slate-900`, `emerald-500`, `cyan-500`, `border-slate-800`), font hierarchy (Inter + JetBrains Mono), responsive grid layouts, and Lucide icon conventions.
4. **Credential Isolation**: All new provider interfaces respect the strict env-var-first architecture established in Phase 9, never leaking secret keys to frontend bundles.

---

**Certified by:** HambakTech Lead Integration Architect  
**Next Phase:** Execute Preservation Register (`PRESERVATION_REGISTER.md`) followed by Correction & Upgrade Plan (`CORRECTION_PLAN.md`).
