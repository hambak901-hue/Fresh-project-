# HAMBAKTECH ENTERPRISE — STAGE 5: IDENTITY RESULT SECURITY REPORT
**Document Reference**: `HT-ENG-REP-SEC-05`  
**Regulatory Compliance**: Nigeria Data Protection Regulation (NDPR) & NIMC Identity Access Standard  
**Status**: VERIFIED & AUDITED  

---

## 1. Executive Summary
This report outlines the data security, cryptographic privacy, access control, and audit protocols governing identity verification results on the HambakTech Enterprise portal. All identity verification transactions—spanning NIN, BVN, demographics, and modifications—are processed in strict alignment with the Nigeria Data Protection Act (NDPA) and NIMC licensing guidelines.

---

## 2. Mandatory Customer Consent (NDPR Compliance)
Before any query can be dispatched to 2SureVerify or Veripine:
- The customer must actively attest to regulatory authorization via the consent checkbox:
  > *"I certify that I have obtained full legal authorization from the subject individual to query, verify, or modify their identity record in accordance with NDPR regulations."*
- If the `consent` flag is omitted or false, the backend rejects the request immediately with HTTP 400 (`"Customer consent is required"`).
- The consent event is cryptographically timestamped and stored alongside the transaction reference.

---

## 3. PII Masking and Access Segregation
1. **Public & Customer Isolation**:
   - Customer history endpoints (`/api/verification/history`, `/api/verification/record/:id`) strictly strip provider wholesale costs (`provider_cost`) and provider gateway credentials.
   - Customers only see the retail selling price and generic gateway references.
2. **Staff Role Separation**:
   - Only accounts with `superadmin` or authorized `admin` privileges (with the `services` and `kyc` permission scopes) can inspect provider cURL logs, request/response bodies, or wholesale margins.
3. **Sensitive Number Masking**:
   - In transaction lists and audit trails, sensitive 11-digit numbers can be partially masked (e.g. `3535****922`) to protect citizens from shoulder surfing and screen captures.

---

## 4. Wallet Integrity & Atomic Transactions
To prevent financial discrepancies and protect user trust:
1. **Pre-Flight Balance Validation**: The system checks `user.wallet_balance >= service.selling_price` before contacting upstream APIs.
2. **Atomic Ledger Debit**: A debit transaction record is written to the wallet ledger with a unique reference (`VRF_<timestamp>_<hash>`).
3. **Automated Refund on Failure**:
   - If the upstream provider returns an error (network failure, invalid identifier, service downtime), the system executes an immediate refund via `db.adjustBalance()`.
   - The ledger entry records: `"REFUND: Failed [Service Name] ([Provider Error])"`.
   - An in-app push notification is dispatched to notify the customer of the refund.
4. **No Double-Debits**: Idempotency is enforced through unique transaction references.

---

## 5. Provider Document Security & Authentic Storage
- Genuine binary documents returned as Base64 PDFs are decoded strictly client-side into in-memory BLOBs with MIME type `application/pdf`.
- They are never written to unauthenticated public web directories.
- Stored verification results are tied directly to the querying `user_id` and cannot be accessed by unauthorized cross-tenant requests.

---

## 6. Audit Logging and Security Monitoring
Every identity verification lifecycle event triggers an immutable audit log entry:
- `IDENTITY_SERVICE_EXECUTED`: Records user ID, service key, reference, cost, and provider.
- `PROVIDER_CONFIG_UPDATED`: Records changes to upstream endpoints or timeouts.
- `SERVICE_PRICE_UPDATED`: Records wholesale and selling price adjustments with staff attribution.
- Logs are stored in `db.data.audit_logs` and `db.data.provider_logs` with microsecond latency metrics and IP tracking.
