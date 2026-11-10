# HAMBakTECH — PAYSTACK LIVE INTEGRATION & TEST REPORT
**Document Reference:** `HT-PAY-TEST-2026-07`  
**Phase:** Stage 7 — Complete Wallet and Payment System  
**Gateway:** Paystack (Mastercard, Visa, Verve, USSD, Bank Account)  
**Status:** FULLY INTEGRATED & VERIFIED  

---

## 1. Overview

This report details the implementation and live testing of the Paystack payment gateway on HAMBakTECH. All checkout and payment verification flows are routed strictly through authenticated server-side endpoints, with signature-validated webhooks and duplicate credit protection. All simulated production checkout shortcuts have been permanently removed.

---

## 2. Technical Architecture & Endpoints

### 2.1 Backend Adapters
* **PHP Production Adapter:** `backend/adapters/payment/PaystackAdapter.php`
* **Node.js Gateway Controller:** `server/adapters/payment/PaymentAdapter.ts` & `server/routes/wallet.ts`
* **API Base URL:** `https://api.paystack.co`

### 2.2 Endpoint Routing

```
Customer Browser
      |
      | 1. POST /api/wallet/fund/initialize (amount: ₦5,000)
      v
HAMBakTECH Server (Backend)
      |
      | 2. POST https://api.paystack.co/transaction/initialize
      |    Authorization: Bearer sk_live_...
      |    Body: { email, amount: 500000, reference: "PAY-..." }
      v
Paystack API
      |
      | 3. Returns { authorization_url, reference }
      v
HAMBakTECH Server
      |
      | 4. Returns authorization_url to Frontend
      v
Customer Browser (Redirects to Paystack Secure Checkout)
      |
      | 5. Payment completed
      |
      +----------> Paystack Webhook Engine
                        |
                        | 6. POST /api/webhooks/paystack
                        |    Header: x-paystack-signature: <hmac_sha512>
                        v
                  HAMBakTECH Webhook Handler
                        |
                        | 7. Validates HMAC signature with secret key
                        | 8. Verifies currency = NGN & amount matches
                        | 9. Executes atomic wallet credit via WalletService
                        v
                  Customer Wallet Credited (Instant)
```

---

## 3. Cryptographic Signature Validation

Every incoming webhook notification from Paystack must supply a valid `x-paystack-signature` HTTP header matching HMAC SHA512 of the raw request payload:

```php
// backend/adapters/payment/PaystackAdapter.php
public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool {
    if (empty($signatureHeader) || empty($this->secretKey)) {
        return false;
    }
    $computedHash = hash_hmac('sha512', $rawBody, $this->secretKey);
    return hash_equals($computedHash, $signatureHeader);
}
```

If the signature header does not match `$computedHash`, the endpoint rejects the payload immediately with `HTTP 401 Unauthorized` and logs a security alert.

---

## 4. Verification & Amount Safety Matrix

To prevent parameter manipulation or currency arbitrage attacks, the verification routine enforces three mandatory checks:
1. **Status Check:** Payload status must explicitly equal `'success'`.
2. **Currency Check:** Currency must strictly match `'NGN'`.
3. **Amount Check:** The verified amount in kobo (`amount / 100`) must exactly equal or exceed the anticipated transaction order amount.

---

## 5. Live Test Matrix & Results

| Test ID | Test Scenario | Input Data | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PST-01** | Standard Server Checkout Init | ₦10,000.00 funding | Generates unique `PAY-` reference, returns valid `authorization_url` | HTTP 200, valid checkout URL generated | **PASSED** |
| **PST-02** | Live Card Payment Successful | Successful card authorization | Webhook received, HMAC verified, customer wallet credited +₦10,000 | Wallet credited atomically, ledger logged | **PASSED** |
| **PST-03** | Webhook Replay / Duplicate Event | Identical webhook posted twice in 2 seconds | First request credits wallet. Second request detects existing reference, responds 200 without duplicate debit/credit | Single credit recorded, duplicate averted | **PASSED** |
| **PST-04** | Invalid Webhook Signature | Modified payload with fake `x-paystack-signature` | Webhook rejected with HTTP 401, no database modifications | HTTP 401 Unauthorized, security audit logged | **PASSED** |
| **PST-05** | Failed / Declined Card Payment | Insufficient funds card test | Paystack returns `failed`. Transaction status marked as `failed`, zero balance changes | Transaction marked `failed`, no balance changes | **PASSED** |
| **PST-06** | Browser Return Verification | User returns from checkout to `/wallet?reference=PAY-...` | System calls `/transaction/verify/:ref` server-side to guarantee reconciliation before user sees balance | Verified and reconciled instantly | **PASSED** |

---

## 6. Conclusion

The Paystack gateway integration is complete, reliable, and verified against all common fraud vectors (signature spoofing, double crediting, amount alteration). No mock or simulated checkout exists in the production code path.
