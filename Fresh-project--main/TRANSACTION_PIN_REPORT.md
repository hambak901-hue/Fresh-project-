# HAMBakTECH — Stage 4: Transaction PIN & Purchase Authorization Report
**Document Ref:** `HT-SEC-PIN-004`  
**Security Classification:** Confidential / Financial Engineering  
**Release Date:** November 2026  
**Module:** Transaction Authorization, 4-Digit Security PIN & Risk Policy Engine

---

## 1. Executive Summary

In financial and identity services portals, account authentication (login) is insufficient to protect customer funds against session hijacking, shared-device vulnerabilities, and unauthorized purchases. The **HAMBakTECH Stage 4 Transaction Authorization System** introduces a mandatory secondary authorization layer using a 4-digit cryptographic security PIN, combined with an anti-brute-force lockout engine and a 7-step transactional pipeline.

---

## 2. 4-Digit PIN Cryptographic Architecture

### A. Protected Storage & Hashing
- **Algorithm:** **bcrypt** with a work factor of 10 salt rounds.
- **Data Model:** Stored in the database within `user.transaction_pin_hash`.
- **Absolute Privacy:** The plaintext PIN is never stored in persistent storage, never included in logs or error traces, and never transmitted to third-party telecommunications providers or payment processors.
- **Default Test Credential:** In development/staging environments, customer accounts are provisioned with test PIN `1234`, hashed securely with bcrypt.

### B. Anti-Brute-Force & Lockout Controls
To defeat automated dictionary attacks and PIN guessing:
1. **Max Allowed Attempts:** A maximum of **3 consecutive failed PIN attempts** is permitted.
2. **Lockout Trigger:** Upon the 3rd failed attempt, the customer's PIN authorization capability is automatically locked for **15 minutes** (`pin_locked_until = Date.now() + 15 * 60 * 1000`).
3. **Attempt Tracking:** Failed attempts and lockout expiration timestamps are stored securely on the user record (`failed_pin_attempts`, `pin_locked_until`).
4. **Counter Reset:** Upon entering a valid PIN, `failed_pin_attempts` is reset immediately to `0`.
5. **Lockout Enforcement:** Any attempt to authorize a transaction while the lockout is active returns HTTP 429 / 403 with the exact remaining lockout duration in minutes.

### C. Secure Configuration & PIN Change Flow
Implemented under `/api/customer/pin`:
- Modifying or setting a new transaction PIN requires the user's current account password for re-authentication.
- Plaintext PIN must strictly conform to a 4-digit numeric pattern (`/^\d{4}$/`). Trivial patterns (e.g. `0000`, `9999`) or sequential patterns can be flagged.

---

## 3. 7-Step Purchase Authorization Pipeline

Every service transaction follows a strict 7-stage state machine designed to prevent double charging and ensure ledger integrity:

```
[1. Form Submission] 
        │
[2. Pricing & Cost Calculation] 
        │
[3. Confirmation Dialog] 
        │
[4. Transaction PIN Modal Prompt] 
        │
[5. Pre-flight Verification Gate]
   ├── PIN Validation (bcrypt check & brute-force audit)
   ├── KYC Tier Qualification (Service Rule min_kyc_level)
   ├── Daily Volume Cap Check (Limit vs. spent today)
   └── Wallet Balance Check (Balance >= Amount)
        │
[6. Atomic Execution Engine]
   ├── Wallet Debit (Instant balance reduction)
   ├── Service API Call (Provider gateway request)
   └── Ledger Record Creation (Transaction reference & audit log)
        │
[7. Result Display & Sovereign Receipt]
```

### Protection Against Double-Debits
- In the event of a network timeout or ambiguous provider response, the transaction status is marked as `pending`.
- The user's wallet is not debited twice upon re-query.
- Automated status polling (`/api/verification/poll/:reference` or `/api/telecom/query-status`) queries provider order records using the existing reference without initiating new debits.

---

## 4. Super Admin Service Security Policy Matrix

Super Administrators control which services mandate a transaction PIN and what KYC tier is required via the Admin KYC & Policy Console (`AdminKycManagement.tsx:rules`):

| Service Key | Service Name | Category | Mandatory PIN | Min. KYC Level | Daily Cap (₦) |
|---|---|---|---|---|---|
| `airtime_vending` | Airtime Top-Up | Telecom | Yes | Level 1 | ₦50,000 |
| `data_bundle` | SME & Corporate Data | Telecom | Yes | Level 1 | ₦100,000 |
| `airtime_pin` | Airtime Recharge PINs | Telecom | Yes | Level 2 | ₦200,000 |
| `data_pin` | Data Recharge PINs | Telecom | Yes | Level 2 | ₦200,000 |
| `airtime_swap` | Airtime to Cash Swap | Telecom | Yes | Level 3 | ₦500,000 |
| `cable_tv` | Cable TV Subscription | Digital | Yes | Level 1 | ₦100,000 |
| `electricity_bill` | Electricity STS Tokens | Digital | Yes | Level 1 | ₦150,000 |
| `exam_scratch_cards` | WAEC/NECO Cards | Digital | Yes | Level 1 | ₦50,000 |
| `bulk_sms` | Bulk SMS Broadcasts | Digital | Yes | Level 3 | ₦500,000 |
| `nin_verification` | Sovereign NIN Verification | Identity | Yes | Level 2 | ₦200,000 |
| `bvn_verification` | Sovereign BVN Lookup | Identity | Yes | Level 2 | ₦200,000 |
| `nin_modification` | Official NIN Field Update | Identity | Yes | Level 2 | ₦200,000 |
| `virtual_account_inbound` | Dedicated Virtual Account | Wallet | No | Level 2 | ₦2,000,000 |

Administrators can modify these rules dynamically via `PUT /api/kyc/admin/service-rules/:key` without rebuilding or restarting the application.

---

## 5. Frontend PIN Component Integration

The interactive PIN modal is implemented in `src/components/customer/TransactionPinModal.tsx`:
- Rendered in a backdrop modal with numeric keypad and pin-dot display.
- Integrated across:
  - `DigitalServicesPage.tsx` (Cable TV and Electricity purchases)
  - `TelecomPage.tsx` (Airtime top-up, data bundles, and PIN generators)
  - `NinServicesPage.tsx` (Sovereign NIN/BVN verification lookups and modifications)
- Provides clear feedback on debit amounts, errors, and test PIN assistance.
