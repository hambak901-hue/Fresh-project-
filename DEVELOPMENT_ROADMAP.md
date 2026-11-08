# 10-Phase Development Roadmap: HambakTech Enterprise
**Project**: HambakTech Enterprise Services Portal  
**Strategy**: Strict Sequential Waterfall Execution (No phase jumping)  
**Target Environment**: TrueHost LON110 cPanel (PHP 8.2+ & MySQL)  

---

## Roadmap Phases Summary

| Phase | Title | Focus Area | Status |
| :--- | :--- | :--- | :--- |
| **01** | **Project Foundation & Architecture** | Credentials Vault, Database Schema, PHP 8.2 Backend, Adapters, Auth | **COMPLETED & VERIFIED** |
| **02** | **Public Website and Branding** | High-conversion Landing Page, CMS, Auth Modals, Rates Calculator | Queued Next |
| **03** | **Customer Dashboard** | User Portal, Tiered KYC, Notifications, Profile Settings | Queued |
| **04** | **Super Admin Dashboard** | User Management, Pricing Controls, Provider Toggles, Audit Logs | Queued |
| **05** | **NIN & BVN Integration** | 2SureVerify & Veripine, Identity Slips, Phone/CAC Lookup | Queued |
| **06** | **Telecommunications Integration** | UlamaData & VTpass, MTN SME, Airtel, Glo, 9mobile, Bills | Queued |
| **07** | **Wallet and Payment System** | Flutterwave Gateway, Moniepoint Virtual Accounts, Immutable Ledger | Queued |
| **08** | **Additional Modules & Comms** | Hambak Academy, Digital Goods Store, TrueHost LON110 SMTP & SMS | Queued |
| **09** | **Complete System Integration** | Security Stress Test, Provider Idempotency, Edge Cases, Bug Fixes | Queued |
| **10** | **Production & cPanel Deployment** | Static SPA Build, MySQL Import, SFTP Upload to LON110 (51.89.153.183:1624) | Queued |

---

## Detailed Phase Breakdown

### Phase 01: Project Foundation and System Architecture (COMPLETED)
* **Goal**: Establish the full decoupled architecture, secure credentials vault, normalized 25-table database, PHP 8.2 backend, and developer environment.
* **Deliverables**:
  1. Secure credentials vault (`.env`, `credentials.ts`, `backend/config/config.php`).
  2. Complete MySQL/MariaDB database schema (`backend/database/schema.sql`) and seeds (`seed.sql`).
  3. Decoupled PHP 8.2+ backend architecture with Router, Auth, Response, and Security.
  4. Unified Provider Adapter interfaces for Verification, Telecom, and Payments.
  5. Full-stack development server with mock/proxy contracts matching production PHP.
  6. Documentation: `PROJECT_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_STRUCTURE.md`, `DEVELOPMENT_ROADMAP.md`, `DEPLOYMENT_REQUIREMENTS.md`.

---

### Phase 02: Public Website and Branding (NEXT)
* **Goal**: Build high-conversion, professional public-facing web pages and brand identity for HambakTech.
* **Deliverables**:
  1. Hero section with live value propositions, trust badges, and CTA buttons.
  2. Live pricing calculator fetching realtime rates from backend.
  3. Interactive services showcase (NIN/BVN, Data Bundles, Airtime, Utility Bills, Academy).
  4. Customer Registration and Login modals with instant validation.
  5. Brand CMS sections: FAQs, Testimonials, About Us, Contact form.

---

### Phase 03: Customer Dashboard
* **Goal**: Complete self-service portal for registered users.
* **Deliverables**:
  1. Dashboard glance card: wallet balance, KYC level, quick action buttons.
  2. Tier 1 to Tier 3 KYC verification submission portal.
  3. Real-time notifications bell and message center.
  4. Profile, password change, and 2FA configuration.

---

### Phase 04: Super Admin Dashboard
* **Goal**: Global administrative management and operations control.
* **Deliverables**:
  1. System metrics: total volume, active users, provider balances, net profit.
  2. User directory: adjust balances, upgrade KYC tiers, ban/unban accounts.
  3. Real-time pricing manager: adjust NIN/BVN fees and SME data prices.
  4. Active provider switcher (e.g. toggle 2SureVerify <-> Veripine).

---

### Phase 05: NIN and BVN Integration
* **Goal**: Implement identity verification workflows with official slip rendering.
* **Deliverables**:
  1. NIN standard verification with photo, biodata, and NIMC slip generation.
  2. NIN by Phone number lookup.
  3. Central Bank of Nigeria BVN biometric query.
  4. CAC business registration lookup.

---

### Phase 06: Telecommunications Integration
* **Goal**: Full automated vending for Nigerian data and airtime.
* **Deliverables**:
  1. MTN SME & Corporate Gifting data vending via UlamaData.
  2. Airtel, Glo, 9mobile data bundle purchasing.
  3. Discounted airtime recharge with automated carrier detection.
  4. Cable TV (DSTV, GOtv) and Electricity token vending via VTpass.

---

### Phase 07: Wallet and Payment System
* **Goal**: High-reliability payment collection and accounting.
* **Deliverables**:
  1. Flutterwave inline checkout integration.
  2. Moniepoint virtual bank account transfer verification.
  3. Double-entry immutable ledger tracking every kobo.
  4. Referral bonus engine.

---

### Phase 08: Additional Modules and Communications
* **Goal**: Expansion features and customer retention tools.
* **Deliverables**:
  1. Hambak Academy courses catalogue and student enrollments.
  2. Digital goods store for licenses and developer keys.
  3. Automated transactional emails via `lon110.truehost.cloud:587`.
  4. Bulk SMS broadcast tool.

---

### Phase 09: Complete System Integration and Testing
* **Goal**: End-to-end security hardening, regression testing, and stress testing.
* **Deliverables**:
  1. Concurrency and double-spend attack testing.
  2. Provider timeout and failover verification.
  3. Input sanitization, XSS, and SQL-injection audit.
  4. Cross-browser responsive testing (desktop, tablet, mobile).

---

### Phase 10: Production Preparation and cPanel Deployment
* **Goal**: Package and deploy the complete application to TrueHost LON110.
* **Deliverables**:
  1. Production Vite static build (`npm run build`).
  2. MySQL database creation and schema import into `qfqzpeqx_hambakdb`.
  3. SFTP upload to `51.89.153.183:1624` into `/home/qfqzpeqx/public_html`.
  4. Live verification of domain `hambaktech.com.ng`.
