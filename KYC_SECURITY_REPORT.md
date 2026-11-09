# HAMBakTECH — Stage 4: KYC Security & Data Privacy Report
**Document Ref:** `HT-SEC-KYC-004`  
**Security Classification:** Highly Confidential / Compliance & Legal  
**Release Date:** November 2026  
**Standards:** Nigeria Data Protection Act (NDPA) 2023, NDPR, ISO/IEC 27001, CBN AML/CFT Regulations

---

## 1. Regulatory Context & Lawful Basis

HAMBakTECH operates as a regulated digital services portal and telecommunications vendor in Nigeria. Processing customer personally identifiable information (PII) is conducted under two primary lawful bases:

1. **Statutory Legal Obligation:** Central Bank of Nigeria (CBN) Anti-Money Laundering, Combating the Financing of Terrorism and Countering Proliferation Financing (AML/CFT/CPF) Regulations mandating Customer Due Diligence (CDD) prior to financial transactions or virtual account allocations.
2. **Explicit Data Subject Consent:** Enforced under Section 24 of the NDPA 2023 and the NDPR. Customers must explicitly opt-in to the processing of their identity data, with consent timestamps permanently recorded in the database ledger (`consent_obtained: true`, `consent_timestamp: ISOString`).

---

## 2. Data Minimization & Collection Boundaries

In accordance with NDPR Principle 2.1(a) (*Adequacy and Data Minimization*), HAMBakTECH strictly enforces tiered data collection boundaries:

| Verification Level | Data Collected | Justification | Prohibited Data |
|---|---|---|---|
| **Level 1 (Basic)** | Full name, phone, email, residential address, LGA, State | Minimum contact data for billing receipts and account recovery | No BVN, No NIN, No biometric photographs |
| **Level 2 (Identity Verified)** | 11-digit NIN or BVN, Official ID document scan, ID serial | Required for CDD validation against NIMC/NIBSS registries and virtual account issuance | No raw biometric templates, no fingerprint scans, no financial passwords |
| **Level 3 (Enhanced)** | Live selfie photograph, Proof of residence (Utility bill/statement) | Visual identity matching and physical address verification for high-volume transactions | No unrelated personal files, no credit card numbers, no medical records |

---

## 3. Cryptographic Storage & Transmission Controls

1. **Transit Security:** All traffic between the client browser, API gateways, and downstream sovereign verification providers is strictly enforced over **TLS 1.3** with HSTS (`Strict-Transport-Security`). Insecure HTTP connections are dropped automatically.
2. **At-Rest Protection:**
   - Sensitive government numbers (NIN, BVN) stored within the database are isolated from public projection models and sanitized in API response envelopes.
   - User transaction PINs are never stored in plaintext and are hashed using **bcrypt** with a salt factor of 10.
3. **Upload File Security:**
   - Uploaded identity documents (scans, selfies, utility bills) are processed through `server/services/security.ts:validateUploadFile`.
   - **Magic Byte Verification:** File payloads are verified using file signatures (`89 50 4E 47` for PNG, `FF D8 FF` for JPG, `25 50 44 46` for PDF). Spoofed file extensions (e.g., `.exe` renamed to `.jpg`) are rejected immediately with HTTP 400.
   - **Size Boundaries:** Strict 5.0 MB maximum file size limit.
   - **Filename Sanitization:** Uploaded files are stripped of original paths, assigned random UUID hashes, and isolated in restricted storage locations.

---

## 4. Role-Based Access Control (RBAC) & Audit Trails

To prevent unauthorized viewing of customer identity records, the application enforces strict multi-layered authorization:

1. **Endpoint Protection:** Customer identity endpoints (`/api/kyc/admin/*`) require a valid JWT bearer token with either `admin` or `superadmin` role. Unauthorized requests receive HTTP 403 Forbidden.
2. **Document Viewing Protection:** Documents are rendered inside authenticated preview modals. Raw file paths are not exposed publicly.
3. **Immutable Review Audit Logging:** Every review action executed by a compliance officer (approval, rejection, or request for information) generates an immutable review record capturing:
   - Unique review action ID (`REV-...`)
   - Action type (`approved`, `rejected`, `info_requested`)
   - Reviewer User ID, Name, and Email
   - Compliance notes or mandatory rejection reasons
   - Precise UTC timestamp

---

## 5. Zero-Knowledge Sovereign Lookups

When executing automated queries against 2SureVerify or Veripine:
- The system transmits the customer's NIN or BVN solely for real-time cryptographic validation.
- No third-party government database dumps or biometric face templates are retained on local servers.
- Upon receiving confirmation of match from the provider, the system stores only the verification status (`verified: true`), provider transaction reference (`AUTO-VERIF-...`), and match score.

---

## 6. Data Subject Rights & Retention Schedule

1. **Right to Rectification:** If a customer's submission is rejected due to inaccurate data or illegible document scans, the portal permits immediate resubmission without requiring administrator intervention.
2. **Right to Erasure:** Customers may request deletion of their account. However, statutory transaction logs and CDD audit records are retained for a legally mandated 5-year AML retention window as prescribed by the Money Laundering (Prevention and Prohibition) Act 2022.
3. **Breach Notification Protocol:** In the event of a security incident affecting identity data, notification protocols are established to inform the Nigeria Data Protection Commission (NDPC) within 72 hours.
