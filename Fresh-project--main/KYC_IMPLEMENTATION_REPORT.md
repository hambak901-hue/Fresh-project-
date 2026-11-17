# HAMBakTECH — Stage 4: KYC Implementation Report
**Document Ref:** `HT-REP-KYC-004`  
**Security Classification:** Confidential / Enterprise Architecture  
**Release Date:** November 2026  
**Module:** Know Your Customer (KYC), Identity Verification & Tier Management

---

## 1. Executive Summary

This report documents the design, implementation, and regulatory compliance of the **HAMBakTECH Stage 4 KYC & Customer Verification System**. In compliance with Central Bank of Nigeria (CBN) AML/CFT circulars and Nigeria Data Protection Regulation (NDPR) guidelines, this module transforms identity verification from a superficial profile editor into an enterprise-grade customer onboarding, verification, and service-gating pipeline.

The system introduces a 4-tier progressive hierarchy, real-time automated government registry lookups (NIMC/NIBSS via 2SureVerify/Veripine), an administrative compliance review desk, and dynamic security policy controls linking service access and wallet capabilities directly to verified identity levels.

---

## 2. 4-Tier Verification Hierarchy

| Tier Level | Name | Requirements | Daily Limit | Permitted Services & Privileges |
|---|---|---|---|---|
| **Level 0** | Unverified | User registration (Email/Password) | ₦0 | Dashboard view only. All telecom purchases, sovereign queries, and wallet withdrawals blocked. |
| **Level 1** | Basic Profile | Verified email & phone, basic personal details | ₦20,000 | Standard Airtime top-up, basic SME Data bundles up to ₦20,000/day. |
| **Level 2** | Identity Verified | Verified NIN or BVN, official government ID (NIN Slip, Driver's License, Voter's Card, Passport) | ₦200,000 | **All telecom services**, sovereign NIN/BVN verification lookups, slip generation, **individual Virtual Bank Account (NUBAN) eligibility**. |
| **Level 3** | Enhanced Enterprise | Live selfie photograph matching ID, proof of residential address (utility bill / bank statement within 3 months) | ₦2,000,000 | Bulk SMS portal, Airtime swap, high-volume merchant transactions, developer API credentials. |

---

## 3. Customer KYC Interface (`/customer/kyc`)

The customer-facing verification center is implemented in `src/components/customer/CustomerKycPage.tsx` and accessible via navigation item `13. Identity & KYC`:

1. **Interactive Level Stepper:** Visually presents the 4-tier hierarchy, current achieved tier, daily limit, and tier upgrade requirements.
2. **Dedicated Application Form:** Dynamically renders tier-specific fields:
   - *Level 1 Fields:* Full legal name, date of birth, phone number, email address, residential address, state, and LGA.
   - *Level 2 Fields:* 11-digit NIN, 11-digit BVN, document type selector, ID serial number, and encrypted scan upload.
   - *Level 3 Fields:* Live selfie photograph and residential utility bill upload.
3. **Automated vs. Manual Verification Toggle:** Allows customers to opt-in for real-time algorithmic checks via 2SureVerify or route through manual administrative review.
4. **Active Submission Tracker:** Real-time visual status cards:
   - *Pending:* Displays submission timestamp, automated check status, and expected compliance queue turnaround.
   - *Info Requested:* Direct response view displaying compliance officer notes and a resubmission channel.
   - *Approved:* Displays verified badge, active limits, and reviewer identification.
   - *Rejected:* Displays mandatory compliance rejection reason with instant correction and resubmission flow.
5. **Virtual Bank Account Card:** Displays dedicated account number, bank name, account holder name, and copy tool. Clearly notifies Level 0 & 1 users of the Level 2 requirement before virtual bank account allocation.

---

## 4. Verification Engines: Automated & Manual

### A. Automated Verification Engine
- **Provider Gateway:** 2SureVerify / Veripine Sovereign Verification Adapter (`server/adapters/verification/VerificationAdapter.ts`).
- **Validation Pipeline:**
  1. The customer's 11-digit NIN or BVN is queried against the authoritative NIMC or NIBSS national database.
  2. The system executes fuzzy Levenshtein name-matching comparing the customer's legal name on record with the government registry record.
  3. Validates date of birth consistency.
  4. Upon a 100% match, generates an immutable cryptographic verification reference (`AUTO-VERIF-...`) and automatically promotes the customer's account to Level 2.
  5. If automated check fails or returns partial mismatch, the application is automatically redirected to the manual compliance review queue.

### B. Manual Compliance Review Desk
- Dedicated admin portal (`src/components/admin/AdminKycManagement.tsx`) with real-time status counters.
- Detailed inspection drawer providing compliance officers with side-by-side comparison of user-entered data and attached government documents.
- Compliance officers can:
  - **Approve:** Promotes user to target level, sets `kyc_status = 'verified'`, and logs reviewer identity and timestamp.
  - **Request Additional Info:** Sends in-app and email alert to customer with explicit instructions.
  - **Reject:** Enforces mandatory documented reason, recorded permanently in review history.
  - **Run On-Demand Automated Check:** Allows officers to trigger live 2SureVerify queries directly from the review drawer.

---

## 5. API Endpoint Specifications

All endpoints are protected under `server/routes/kyc.ts`:

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/kyc/status` | Authenticated Customer | Retrieves user KYC tier, daily limit, active submission, virtual account, and service rules. |
| `POST` | `/api/kyc/submit` | Authenticated Customer | Submits KYC application package with explicit NDPR consent logging. |
| `POST` | `/api/kyc/authorize-purchase` | Authenticated Customer | Executes 7-step pre-flight check (PIN, KYC tier, volume cap, wallet balance). |
| `GET` | `/api/kyc/virtual-account` | Authenticated Customer | Returns virtual bank account details (blocks if KYC tier < 2). |
| `GET` | `/api/kyc/admin/submissions` | Administrator | Lists submissions with filter by status (`pending`, `approved`, `rejected`, `info_requested`), level, and search. |
| `GET` | `/api/kyc/admin/submissions/:id` | Administrator | Retrieves deep submission inspection package with attached document URLs. |
| `POST` | `/api/kyc/admin/submissions/:id/review` | Administrator | Approves, rejects, or requests information on a submission with audit trail. |
| `POST` | `/api/kyc/admin/submissions/:id/auto-verify` | Administrator | Triggers live sovereign API check on submission. |
| `GET` | `/api/kyc/admin/service-rules` | Administrator | Retrieves matrix of service PIN and KYC tier rules. |
| `PUT` | `/api/kyc/admin/service-rules/:key` | Administrator | Updates service PIN requirement, minimum tier, or daily volume limit. |

---

## 6. Verification Status

- **Database Models & Seed Data:** Added `KycSubmission`, `ServiceSecurityRule`, `VirtualAccountItem` to `server/db/database.ts` with complete data access layers.
- **Backend API Routes:** Fully implemented in `server/routes/kyc.ts` and mounted in `server.ts` at `/api/kyc`.
- **Frontend Client:** Exported in `src/lib/api.ts` with full TypeScript interfaces in `src/types.ts`.
- **UI Components:** `CustomerKycPage.tsx` and `AdminKycManagement.tsx` mounted and verified in both Customer and Super Admin consoles.
