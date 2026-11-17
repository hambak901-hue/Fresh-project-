# HAMBakTECH — FLUTTERWAVE ACTIVATION & LIVE TEST REPORT
**Document Reference:** `HT-FLW-ACT-2026-07`  
**Phase:** Stage 7 — Complete Wallet and Payment System  
**Gateway:** Flutterwave (Cards, Direct Bank Transfer, USSD, Barter, Mobile Money)  
**Status:** FULLY ACTIVATED & OPERATIONAL (No Longer Coming Soon)  

---

## 1. Executive Summary

Flutterwave is now **fully activated** as an operational payment gateway on the HAMBakTECH platform. All "Coming Soon" badges and restrictions have been removed from both the customer-facing funding modal and the administrative treasury interface.

The integration leverages the official Flutterwave v3 API with server-side payment initialization, customer checkout redirects, strict verification queries, webhook processing protected by secret hash verification, and duplicate credit prevention.

---

## 2. Official Documentation & Configuration

* **Quickstart Guide:** [Flutterwave Quickstart](https://developer.flutterwave.com/docs/quickstart)
* **Authentication:** [Flutterwave Authentication](https://developer.flutterwave.com/docs/authentication)
* **Transaction Verification:** [Flutterwave Verification](https://developer.flutterwave.com/docs/transaction-verification)
* **Webhooks:** [Flutterwave Webhooks](https://developer.flutterwave.com/docs/webhooks)

### 2.1 Backend Implementation Files
* **PHP Production Adapter:** `backend/adapters/payment/FlutterwaveAdapter.php`
* **Node Gateway Service:** `server/adapters/payment/PaymentAdapter.ts`
* **API Base URL:** `https://api.flutterwave.com/v3`

### 2.2 Secure Credentials
* `FLUTTERWAVE_PUBLIC_KEY`: Configured in protected server environment.
* `FLUTTERWAVE_SECRET_KEY`: Configured in protected server environment.
* `FLW_SECRET_HASH`: Configured webhook secret hash used to authenticate incoming notifications via the `verif-hash` HTTP header.

---

## 3. Checkout & Verification Workflow

```
Customer Browser
      |
      | 1. Selects "Flutterwave Gateway" -> Enters ₦15,000.00
      v
HAMBakTECH Backend (/api/wallet/fund/initialize)
      |
      | 2. POST https://api.flutterwave.com/v3/payments
      |    Authorization: Bearer <FLUTTERWAVE_SECRET_KEY>
      |    Body: {
      |      tx_ref: "FLW-1731234567-ABCD",
      |      amount: 15000,
      |      currency: "NGN",
      |      redirect_url: "https://hambaktech.com.ng/wallet",
      |      customer: { email, name, phonenumber },
      |      customizations: { title: "HAMBakTECH Wallet Funding" }
      |    }
      v
Flutterwave API
      |
      | 3. Returns { status: "success", data: { link: "https://checkout.flutterwave.com/..." } }
      v
Customer Browser
      |
      | 4. Redirects to Flutterwave Secure Hosted Checkout
      | 5. Completes payment via Card / Bank Transfer / USSD
      |
      +----------> Flutterwave Webhook System
                        |
                        | 6. POST /api/webhooks/flutterwave
                        |    Header: verif-hash: <FLW_SECRET_HASH>
                        |    Body: { "event": "charge.completed", "data": { "id": 12345, "tx_ref": "FLW-..." } }
                        v
                  HAMBakTECH Webhook Receiver
                        |
                        | 7. Verifies verif-hash matches configured secret
                        | 8. Calls GET https://api.flutterwave.com/v3/transactions/12345/verify
                        | 9. Validates currency === 'NGN' and amount >= expected
                        | 10. Calls WalletService->creditUserWalletAtomic()
                        v
                  Customer Wallet Credited Immediately
```

---

## 4. Webhook Security & Idempotency

### 4.1 Secret Hash Header Validation (`verif-hash`)
Flutterwave transmits the configured secret hash in the `verif-hash` header. The receiver executes a strict timing-safe check:

```php
// backend/adapters/payment/FlutterwaveAdapter.php
public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool {
    if (empty($signatureHeader) || empty($this->secretHash)) {
        return false;
    }
    return hash_equals($this->secretHash, $signatureHeader);
}
```

### 4.2 Server-Side Re-Verification Safeguard
To defend against forged payloads, the webhook receiver does not rely solely on the webhook body. It extracts `data.id` and queries Flutterwave's transaction verification endpoint directly:
`GET https://api.flutterwave.com/v3/transactions/{id}/verify`
Only when Flutterwave confirms `data.status === 'successful'` is the transaction processed.

---

## 5. Live Test Matrix

| Test Case | Scenario | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- |
| **FLW-01** | Gateway Activation Verification | Flutterwave shows as active in customer modal & admin panel without "Coming Soon" label | **VERIFIED** |
| **FLW-02** | Payment Initialization | POST payload returns official `checkout.flutterwave.com` redirect link with valid reference | **VERIFIED** |
| **FLW-03** | Webhook with Valid `verif-hash` | Processes event, verifies transaction status, credits wallet atomically | **VERIFIED** |
| **FLW-04** | Webhook with Invalid `verif-hash` | Immediately rejected with HTTP 401 Unauthorized; zero database modifications | **VERIFIED** |
| **FLW-05** | Webhook Duplicate Replay | Replaying the same webhook twice triggers idempotency duplicate guard; no double credit | **VERIFIED** |
| **FLW-06** | Currency Mismatch Defense | Injected transaction returning USD instead of NGN is flagged and rejected | **VERIFIED** |
| **FLW-07** | Dual-Gateway Switching | Admin can switch primary gateway between Paystack and Flutterwave smoothly via Admin Dashboard | **VERIFIED** |

---

## 6. Future Virtual Accounts Architecture

The codebase contains a clean architectural blueprint for dedicated Flutterwave Virtual Accounts (`backend/database/schema.sql` -> `customer_virtual_accounts` table), ensuring that future auto-assigned virtual bank account features are completely decoupled from manual bank funding and standard card checkouts.

---

## 7. Conclusion

Flutterwave is fully operational and certified for production traffic on HAMBakTECH. Customers can seamlessly choose Flutterwave or Paystack to fund their digital treasury wallets.
