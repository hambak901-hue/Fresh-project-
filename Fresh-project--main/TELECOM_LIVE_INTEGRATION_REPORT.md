# HAMBakTECH — STAGE 6: TELECOMMUNICATIONS LIVE INTEGRATION REPORT
**Enterprise VTU, Bill Payments & Telecommunications Infrastructure**
**Production Target:** cPanel <HOST_NODE> Linux / PHP 8.2+ / MySQL 8.0+
**Primary Gateway:** UlamaData Sovereign Gateway (`https://www.ulamadata.ng`)
**Secondary Failover:** VTpass Commercial Engine (`https://api-service.vtpass.com/api`)
**Live Production URL:** `https://hambaktech.com.ng`

---

## 1. Executive Summary & Architectural Migration
In accordance with Stage 6 specifications, all telecommunications operations have been migrated from preliminary Node.js development adapters to the native, high-performance PHP 8.2+ backend with direct cURL communication to the **UlamaData Sovereign Gateway**.

All simulated production fallbacks, randomized 16-digit recharge card PINs, fabricated 20-digit STS electricity tokens, and fake customer verification results have been completely eliminated. The platform now operates under a strict **Zero-Simulation Policy**: every transaction connects to the upstream telecom carrier network. If the provider rejects a request, an upstream carrier error is caught, recorded in `provider_logs`, returned transparently to the user, and an automatic atomic wallet refund is credited instantly.

```
+---------------------------------------------------------------------------------------+
|                               HAMBAKTECH TELECOM ROUTING                              |
+---------------------------------------------------------------------------------------+
|  React Client / Mobile PWA                                                            |
|       │                                                                               |
|       ▼                                                                               |
|  Apache / LiteSpeed Web Server (.htaccess Front-Controller Routing)                  |
|       │                                                                               |
|       ▼                                                                               |
|  PHP 8.2+ /backend/index.php ──► Router                                               |
|       │                                                                               |
|       ▼                                                                               |
|  HambakTech\Controllers\TelecomController                                             |
|       │                                                                               |
|       ├─────────────────────────┬───────────────────────────┐                         |
|       ▼                         ▼                           ▼                         |
|  1. Auth & PIN Guard      2. Atomic Wallet Debit      3. Provider Gateway             |
|     (Auth::requireAuth)      (WalletService::debit)      (UlamaDataAdapter)           |
|                                                             │                         |
|                                                             ▼                         |
|                                                       cURL HTTP POST                  |
|                                                    (Authorization: Token)             |
|                                                             │                         |
|                                   ┌─────────────────────────┴────────────────────────┐|
|                                   ▼                                                  ▼|
|                            [200 OK SUCCESS]                                   [4xx/5xx FAILURE]|
|                                   │                                                  │|
|                       INSERT telecom_orders (successful)                credit wallet (REFUND)|
|                       Return PIN / Token / Balance                      INSERT telecom_orders (failed)|
|                                                                         Return Safe Error Message|
+---------------------------------------------------------------------------------------+
```

---

## 2. UlamaData Official API Specifications & Endpoint Mapping

All calls to UlamaData utilize bearer token authentication via the HTTP header `Authorization: Token {apiKey}` and exchange JSON payloads.

| Operation | Service Category | UlamaData Official Endpoint | HTTP Method | Request Parameters | Response Payload |
|---|---|---|---|---|---|
| **User Balance** | Core Account | `/api/user/` | `GET` | *None* | `user.wallet_balance`, `user.username` |
| **Airtime Top-up** | Airtime VTU | `/api/topup/` | `POST` | `network` (1-4), `amount`, `mobile_number`, `Ported_number`, `airtime_type` | `ident`, `status`, `network`, `amount`, `balance_before`, `balance_after` |
| **Data Vending** | Dynamic Bundles | `/api/data/` | `POST` | `network` (1-4), `mobile_number`, `plan` (int ID), `Ported_number` | `ident`, `status`, `plan`, `balance_before`, `balance_after` |
| **Airtime PIN** | Card Printing | `/api/airtimepin/` | `POST` | `network` (1-4), `amount`, `quantity`, `name_on_card` | `ident`, `status`, `cards: [{pin, serial, load_code, value}]` |
| **Data PIN** | Data Card Printing | `/api/datapin/` | `POST` | `network` (1-4), `plan`, `quantity`, `name_on_card` | `ident`, `status`, `cards: [{pin, serial, load_code, size}]` |
| **Airtime Swap** | Airtime-to-Cash | `/api/airtimeswap/` | `POST` | `network` (1-4), `mobile_number`, `amount` | `ident`, `transfer_number`, `instructions`, `status` |
| **Smartcard Validation** | Cable Verification | `/api/cable/verify` | `GET` | `cable` (1-4), `smartcard` | `customer_name`, `status`, `due_date` |
| **Cable Subscription** | Cable Renewal | `/api/cable/` | `POST` | `cablename` (1-4), `cableplan`, `smart_card_number` | `ident`, `status`, `cable`, `balance_after` |
| **Meter Validation** | Disco Verification | `/api/electricity/verify` | `GET` | `disco` (1-10), `meternumber`, `type` (1=Prepaid, 2=Postpaid) | `customer_name`, `address`, `meter_number` |
| **Electricity Bill** | Token Generation | `/api/billpayment/` | `POST` | `disco_name` (1-10), `meter_number`, `MeterType` (1/2), `amount` | `ident`, `token`, `units`, `amount`, `status` |
| **Exam Scratch Cards** | Education e-PINs | `/api/exam/` | `POST` | `exam_name` (`WAEC`, `NECO`, `NABTEB`, `JAMB`), `quantity` | `ident`, `status`, `cards: [{pin, serial, exam}]` |
| **Bulk SMS** | Messaging | `/api/bulksms/` | `POST` | `sender`, `recipient`, `message` | `ident`, `status`, `units`, `recipients_count` |
| **Transaction Status** | Query & Audit | `/api/transactions/?reference={ref}` | `GET` | `reference` | `ident`, `status`, `product_name`, `date` |
| **Dynamic Plans Sync** | Catalogue Sync | `/api/data/plans/` | `GET` | *None* | `plans: [{id, network, plan, amount, validity}]` |

### Provider ID Mapping Constants
- **Networks (`network`):** `1` = MTN, `2` = GLO, `3` = 9MOBILE, `4` = AIRTEL.
- **Cable Providers (`cablename`):** `1` = GOTV, `2` = DSTV, `3` = STARTIMES, `4` = SHOWMAX.
- **Electricity Discos (`disco_name`):**
  - `1` = Ikeja Electric (IKEDC)
  - `2` = Eko Electric (EKEDC)
  - `3` = Abuja Electric (AEDC)
  - `4` = Kano Electric (KEDCO)
  - `5` = Port Harcourt Electric (PHED)
  - `6` = Jos Electric (JED)
  - `7` = Ibadan Electric (IBEDC)
  - `8` = Kaduna Electric (KAEDCO)
  - `9` = Benin Electric (BEDC)
  - `10` = Enugu Electric (EEDC)
- **Meter Types (`MeterType`):** `1` = Prepaid, `2` = Postpaid.

---

## 3. Strict Zero-Simulation Enforcement Policy
Previous staging iterations allowed client-side mock data or simulated responses when upstream test keys returned 401 or 500. Under the Stage 6 production rules:
1. **No Fake Recharge PINs:** The backend does not fabricate 16-digit codes. PIN array responses must come directly from UlamaData `cards` array.
2. **No Fake STS Tokens:** Electricity payments never generate 20-digit pseudo-tokens. If the utility disco rejects the meter, an upstream failure is returned.
3. **No Fabricated Customer Names:** Smartcard and electricity meter validations return the exact customer identity registered on the DISCO/Multichoice databases.
4. **Instant Automated Wallet Refund:** If an order fails upstream after the user's wallet has been debited:
   - A credit ledger transaction is immediately created with description `"Refund for failed order {reference}"`.
   - The user balance is atomically restored to its previous value.
   - An audit row is inserted into `telecom_orders` marked as `failed` with provider metadata.
   - HTTP 502 with customer-safe error is returned.

---

## 4. Multi-Provider Architecture & Secure Admin Credentials
The `UlamaDataAdapter` supports dynamic runtime configuration:
1. **Priority 1:** Database table `providers` (queried by `id = 'ulamadata'`).
2. **Priority 2:** Operating system environment variable `ULAMADATA_API_KEY`.
3. **Priority 3:** Encrypted PHP server configuration file `backend/config/config.php`.

Super Administrators can configure or update API tokens via the Super Admin Console without redeploying code. The administrative provider overview (`GET /api/telecom/providers`) measures round-trip latency (in milliseconds) and live wallet balance directly from UlamaData's user API.

---

## 5. Live Production Deployment Verification
- **Endpoint:** `https://hambaktech.com.ng/api/telecom/providers`
- **Response Format:**
```json
{
  "success": true,
  "active_provider": "ulamadata",
  "activeProvider": "ulamadata",
  "wallet_balance": 38920.00,
  "message": "UlamaData gateway active and authenticated",
  "providers": [
    {
      "id": "ulamadata",
      "name": "UlamaData Sovereign Gateway",
      "base_url": "https://www.ulamadata.ng",
      "is_primary": true,
      "balance": 38920.00,
      "currency": "NGN",
      "latency_ms": 68,
      "status": "operational"
    },
    {
      "id": "vtpass",
      "name": "VTpass Engine (Secondary / Failover)",
      "base_url": "https://api-service.vtpass.com/api",
      "is_primary": false,
      "balance": 0.00,
      "currency": "NGN",
      "latency_ms": 85,
      "status": "standby"
    }
  ]
}
```
