# HAMBakTECH — Stage 4: Future Virtual Bank Account Architecture
**Document Ref:** `HT-ARCH-VACC-004`  
**Security Classification:** Confidential / Enterprise Architecture Blueprint  
**Release Date:** November 2026  
**Module:** Dedicated Customer NUBAN Accounts, Inbound Webhooks & Automated Ledger Credit

---

## 1. Executive Summary

A critical competitive advantage and retention driver for Nigerian digital vending portals is the provision of **individually assigned dedicated Virtual Bank Accounts (NUBANs)**. Rather than relying on manual bank transfer receipts and administrative review queues, customers receive a personal 10-digit NUBAN account in their name. Inbound bank transfers from any Nigerian banking app automatically fund their HambakTech wallet within seconds.

This architecture document defines the structural blueprint, regulatory eligibility prerequisites, partner provider integrations, webhook security protocols, and ledger processing pipelines required for future virtual bank account provisioning.

---

## 2. Regulatory & Compliance Prerequisite (Strict Level 2 Gate)

In strict adherence to Central Bank of Nigeria (CBN) regulations on Tier 2 / Tier 3 customer onboarding (Circular `FPR/DIR/GEN/CIR/06/010`):

> **Mandatory Rule:** An individual dedicated NUBAN virtual account **CANNOT** be provisioned for any customer who has not attained **Level 2 (Identity Verified)**.

### Why Level 2 is Enforced
1. **Name Matching:** Banking regulations mandate that virtual account names must reflect the verified legal name of the user (e.g., `HAMBAK / ADEBAYO ADELEKE`), not an anonymous or alias handle.
2. **NIN/BVN Linkage:** Partner deposit banks (Providus, Wema, Monnify) require a verified National Identity Number (NIN) or Bank Verification Number (BVN) on file to allocate a NUBAN to a third-party wallet.
3. **AML Anti-Layering:** Unverified accounts cannot receive inbound third-party transfers, preventing money mule networks from exploiting the platform for unlicensed remittances.

---

## 3. Data Schema & Model Representation

Virtual accounts are modeled in `server/db/database.ts` and `src/types.ts`:

```typescript
export interface VirtualAccountItem {
  id: string;                     // Unique record identifier
  user_id: string;                // Customer ID
  account_number: string;         // 10-digit NUBAN (e.g. "9928374821")
  account_name: string;           // E.g. "HAMBAK / FATIMOH MUSBAU"
  bank_name: string;              // E.g. "Providus Bank" | "Wema Bank (ALAT)"
  bank_code: string;              // Central Bank routing code (e.g. "101", "035")
  provider: 'providus' | 'monnify' | 'wema' | 'flutterwave' | 'reserved_stub';
  status: 'active' | 'suspended' | 'closed' | 'pending_kyc';
  assigned_at: string;            // ISO timestamp
  total_inflow: number;           // Cumulative amount funded via this account
  last_funding_at?: string;       // Most recent transfer timestamp
  webhook_reference?: string;     // Provider transaction tracking ID
}
```

---

## 4. Partner Provider Gateways

The system is architected as a modular adapter interface allowing switching between primary and failover providers:

### A. Providus Bank (Direct Open Banking API)
- **Endpoint:** `POST /api/v1/pi-provision/dynamic-account`
- **Payload:** User NIN/BVN, Legal Name, Customer Reference.
- **Settlement:** Real-time NIBSS Instant Payments (NIP) notification.

### B. Monnify (TeamApt / Moniepoint)
- **Endpoint:** `POST /api/v2/bank-transfer/reserved-accounts`
- **Features:** Multi-bank allocation (Providus, Wema, Sterling, Moniepoint) under a single customer profile.
- **Contract Code:** Securely passed via protected server environment variables.

### C. Wema Bank (ALAT for Business)
- **Endpoint:** `POST /alat/v1/accounts/virtual`
- **Features:** Direct national clearing access with instant settlement into HambakTech master operational pool.

### D. Flutterwave Virtual Accounts
- **Endpoint:** `POST /v3/virtual-account-numbers`
- **Features:** Automated BVN verification and instant NUBAN assignment.

---

## 5. Inbound Webhook Ingress & Settlement Engine

When a customer transfers funds to their virtual account, the partner bank issues an asynchronous HTTPS webhook notification to HambakTech:

```
[Customer Bank App] ──(NIP Transfer)──> [Partner Deposit Bank]
                                                │
                                       (HTTPS Webhook Event)
                                                ▼
                                    [POST /api/wallet/webhook/virtual-account]
                                                │
                                  ┌─────────────┴─────────────┐
                                  ▼                           ▼
                        [HMAC Signature Verify]      [Idempotency Check]
                                  │                           │
                                  └─────────────┬─────────────┘
                                                ▼
                                  [Double-Entry Ledger Credit]
                                  ├── Wallet Balance += Net Amount
                                  ├── Transaction Record (Type: 'wallet_funding')
                                  └── Total Inflow += Net Amount
                                                ▼
                                  [Instant Customer Notification]
                                  ├── In-App Notification Center
                                  ├── SMS Alert Dispatch
                                  └── Transaction Receipt Email
```

### Critical Webhook Security Controls
1. **Cryptographic Signature Verification:** Incoming webhook headers must include an `X-Signature` or `X-Providus-Signature` computed using HMAC-SHA512 with the shared integration secret. Payloads with missing or mismatched signatures are rejected with HTTP 401.
2. **Idempotency & Replay Prevention:** Every inbound transfer includes a unique provider session ID (`session_id` or `transaction_reference`). The engine verifies that this reference has not already been credited. If already processed, it responds with HTTP 200 OK without double-crediting the customer.
3. **No Fake Accounts:** The platform does not generate simulated or fabricated bank account numbers in production. The UI displays the account only once it is legitimately provisioned and registered in the NIBSS directory.
4. **Separation from Manual Funding:** Virtual account deposits are credited programmatically and isolated from the administrator manual funding queue (`/api/wallet/manual-funding`), avoiding human bottlenecking while preserving clear audit logs.
