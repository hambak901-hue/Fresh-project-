# HAMBakTECH — STAGE 6: TELECOMMUNICATIONS WEBHOOK & IDEMPOTENCY REPORT
**Asynchronous Order Settlement & Upstream Event Reconciler**
**Target Endpoint:** `https://hambaktech.com.ng/api/telecom/webhook`
**Upstream Provider:** UlamaData Sovereign Gateway (`https://www.ulamadata.ng`)

---

## 1. Webhook Architecture Overview
In high-volume telecom vending, mobile network operators (MTN, Airtel, Glo, 9mobile) frequently transition orders from `pending` to `successful` or `failed` asynchronously after queue execution.

The HambakTech webhook processor at `/api/telecom/webhook` provides guaranteed atomic delivery, cryptographic verification, and strict idempotency protection against duplicate network requests and retry storms.

```
+---------------------------------------------------------------------------------------+
|                               ULAMADATA WEBHOOK LIFECYCLE                             |
+---------------------------------------------------------------------------------------+
|  UlamaData Cloud Dispatcher                                                           |
|       │                                                                               |
|       ▼                                                                               |
|  POST https://hambaktech.com.ng/api/telecom/webhook                                  |
|  Payload: {"ident": "1298456", "status": "successful", "balance_after": 38100}        |
|       │                                                                               |
|       ▼                                                                               |
|  1. Parse JSON Payload & Extract Reference (`ident` / `reference` / `id`)             |
|       │                                                                               |
|       ▼                                                                               |
|  2. Idempotency Check in `telecom_orders`                                             |
|       ├───────────────────────────────────────────────────────┐                       |
|       ▼                                                       ▼                       |
|  Order Already 'successful'                               Order Found & Pending       |
|  [Action: Return HTTP 200 {"status": "already_processed"}]    │                       |
|  (Never double-debit or double-credit)                        │                       |
|                                                               ▼                       |
|                                         Is Status 'successful' or 'failed'?           |
|                                         ┌─────────────────────┴──────────────────────┐|
|                                         ▼                                            ▼|
|                                  [SUCCESSFUL]                                    [FAILED]|
|                                         │                                            │|
|                       UPDATE telecom_orders status='successful'      UPDATE telecom_orders status='failed'|
|                       Log reconciliation audit record               Execute Instant Automated Wallet Refund|
|                       HTTP 200 {"status": "reconciled"}              (WalletService::credit)|
|                                                                      HTTP 200 {"status": "reconciled"}|
+---------------------------------------------------------------------------------------+
```

---

## 2. Supported Webhook Payload Schemas
UlamaData dispatches webhook notifications when an asynchronous transaction status resolves:

```json
{
  "ident": "UD_DAT_98451298",
  "Status": "successful",
  "network": "MTN",
  "plan": "1GB",
  "mobile_number": "08031234567",
  "balance_before": "38410.00",
  "balance_after": "38140.00",
  "date": "2026-11-10 15:24:12"
}
```

Failure notification:
```json
{
  "ident": "UD_AIR_77812901",
  "Status": "failed",
  "network": "GLO",
  "mobile_number": "08051234567",
  "reason": "Subscriber phone line currently suspended by carrier",
  "date": "2026-11-10 15:25:01"
}
```

---

## 3. Idempotency & Concurrency Protection
To prevent financial race conditions, double balance deductions, or duplicate customer refunds:
1. **Unique Reference Constraint:** Every outgoing order generates an immutable reference prefix (e.g., `UD_DAT_`, `UD_AIR_`, `UD_PIN_`, `UD_CAB_`, `UD_ELE_`) stored in `telecom_orders.provider_ref`.
2. **Current State Verification:**
   - If an order in `telecom_orders` is already marked `successful`, receiving a subsequent `successful` webhook returns an immediate HTTP 200 `{"status": "already_processed"}` without mutating ledger balances.
   - If an order is marked `failed`, duplicate `failed` webhooks are rejected from triggering multiple refunds.
3. **Atomic Wallet Reversal:**
   - On verified upstream failure, the refund is executed inside an atomic transaction:
   ```php
   $refundRef = 'REFUND_WH_' . $order['provider_ref'];
   $this->walletService->credit(
       $order['user_id'],
       (float)$order['amount'],
       'manual_adjustment',
       $refundRef,
       "Automated refund for failed telecom order {$order['provider_ref']}"
   );
   ```
   - The ledger table `wallet_ledgers` logs the refund reference with an exact timestamp, preventing identical refund records from existing.

---

## 4. Webhook Security & Verification Hardening
1. **IP / Token Whitelisting:** The webhook route checks provider identifiers and ensures request integrity.
2. **Graceful Handling of Unrecognized References:** If a webhook arrives for an order that did not originate from HambakTech (e.g. testing pings from provider tools), the system logs an audit trace and responds with HTTP 200 `{"status": "ignored"}` to prevent upstream timeout retries.
3. **Audit Logging:** Every incoming webhook is recorded in `provider_logs` with raw headers and body for non-repudiation.

---

## 5. Live Production Webhook Test
A simulated test payload sent to the live production endpoint:

```bash
curl -X POST https://hambaktech.com.ng/api/telecom/webhook \
  -H "Content-Type: application/json" \
  -d '{"ident": "UD_DAT_TEST_001", "status": "successful"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ignored",
    "message": "Reference not found in local orders"
  }
}
```
The endpoint responds instantly with HTTP 200, acknowledging delivery without server errors.
