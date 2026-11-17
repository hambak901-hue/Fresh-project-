# HAMBAKTECH ENTERPRISE — API SECURITY AND GOVERNANCE REPORT

**Document Version:** 1.0.0  
**Target:** HambakTech REST API (`/api/*`)  
**Architecture:** Node.js/Express + PHP 8.2 Backend Adapters  
**Security Tier:** Financial Enterprise & Telecom Grade  

---

## 1. Overview of API Protection Layers

The HambakTech API architecture implements defense-in-depth across 7 concentric security perimeters:

```
[ Client Request ]
       │
       ▼
1. Transport Layer Security (HTTPS / HSTS)
       │
       ▼
2. HTTP Security Headers (nosniff, SAMEORIGIN, CSP, XSS-Filter)
       │
       ▼
3. CSRF Protection Middleware (X-Requested-With / Bearer Token)
       │
       ▼
4. Rate Limiting Middleware (Auth, Financial, Upload, General)
       │
       ▼
5. XSS Sanitization & Prototype Pollution Defense
       │
       ▼
6. Role-Based Access Control (requireCustomer, requireAdmin, requireSuperAdmin)
       │
       ▼
7. Parameter Validation, Idempotency & Audit Trail
```

---

## 2. Security Middleware Specifications

### 2.1 HTTP Security Headers
Every incoming request and outbound response is augmented with the following standard security headers:
- `X-Content-Type-Options: nosniff` (Prevents MIME-type sniffing).
- `X-Frame-Options: SAMEORIGIN` (Protects against UI clickjacking attacks).
- `X-XSS-Protection: 1; mode=block` (Enforces legacy browser XSS filtering).
- `Referrer-Policy: strict-origin-when-cross-origin` (Restricts referrer leakage).

### 2.2 CSRF Protection (`csrfProtection`)
All state-modifying HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`) are inspected by the `csrfProtection` middleware:
- Safe read-only requests (`GET`, `HEAD`, `OPTIONS`) proceed unhindered.
- External webhook callbacks (`/api/wallet/paystack/webhook`) authenticate via cryptographic HMAC SHA-512 signatures.
- Standard client requests must supply either the `X-Requested-With: XMLHttpRequest` header or a valid `Authorization: Bearer <token>` header, neutralizing cross-origin form posting attacks.

### 2.3 Tiered Rate Limiting (`rateLimiter`)
To safeguard application availability and provider quota costs, endpoint-specific sliding-window rate limiters are mounted:
- **Authentication Endpoints (`/api/auth/*`):** 30 requests / minute / IP.
- **Financial & Verification (`/api/verification/verify`, `/api/wallet/manual-funding`):** 50 requests / minute / IP.
- **Document Uploads (`/api/customer/upload`):** 20 requests / minute / IP.
- **General APIs:** 60 requests / minute / IP.

Excessive traffic is met with HTTP `429 Too Many Requests` containing retry-after seconds.

### 2.4 Input Sanitization & Anti-Prototype Pollution
All request bodies undergo automated recursive inspection via `sanitizeBody`:
- Strips `<script>`, `javascript:`, `on*=` handlers, and `<iframe>` injections.
- Explicitly deletes object keys matching `__proto__`, `constructor`, and `prototype`, completely mitigating Prototype Pollution vectors.

---

## 3. Webhook Cryptographic Verification

### Paystack Webhook (`POST /api/wallet/paystack/webhook`)
- **Algorithm:** HMAC-SHA512.
- **Header:** `X-Paystack-Signature`.
- **Validation:** Computed over raw request body using `CREDENTIALS.payments.paystack.secretKey`.
- **Idempotency:** Transactions are verified against the local immutable ledger (`db.data.transactions`). If the transaction reference has already been marked `successful`, subsequent webhook deliveries return HTTP 200 with idempotent no-op confirmation, guaranteeing that customer balances cannot be credited twice.

---

## 4. Error Handling and Diagnostics Protection

1. **Stack Trace Suppression:** In both development and production, API errors return structured JSON errors (`{ error: "Human-readable message" }`) with zero runtime stack traces or system file path disclosures.
2. **Provider Key Masking:** In diagnostic APIs (`/api/system/status`, `/api/admin/overview`), all external integration keys (2SureVerify, Veripine, UlamaData, VTPass, Paystack) are masked with prefix/suffix formatting (e.g. `sk_live_...48f9`), preventing accidental disclosure in administrative views or shared consoles.
3. **Genuine Server Diagnostics:** SFTP connection tests (`/api/cpanel/test-sftp`) perform genuine TCP handshakes via Node `net.Socket` to host port `1624` rather than returning simulated results.

---

## 5. Audit Logging Architecture

Every state change across the API emits a structured entry into `db.data.audit_logs`:
- **Action Type:** e.g., `USER_LOGIN`, `WALLET_ADJUSTMENT`, `KYC_REVIEW`, `PROVIDER_CONFIG_UPDATED`.
- **Actor:** User ID and Email.
- **Network Source:** Client IP address and forwarded-for proxy headers.
- **Timestamp:** ISO 8601 UTC timestamp.
- **Details:** Non-sensitive operational metadata detailing the specific parameters altered.
