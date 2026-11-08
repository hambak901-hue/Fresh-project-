# REST API Structure & Endpoint Specifications: HambakTech Enterprise
**Protocol**: HTTPS  
**Content-Type**: `application/json`  
**Authentication**: `Authorization: Bearer <token>`  
**Base URL (cPanel Production)**: `https://hambaktech.com.ng/api` (or `/backend/api`)  
**Base URL (Development)**: `http://localhost:3000/api`

---

## 1. Response Envelope Standard

Every API response follows a consistent contract:

### Success Response (HTTP 200 / 201)
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "statusCode": 200,
  "data": { ... },
  "errors": [],
  "timestamp": "2026-11-08T00:15:00Z"
}
```

### Error Response (HTTP 400 / 401 / 403 / 404 / 500)
```json
{
  "success": false,
  "message": "Invalid credentials or insufficient balance",
  "statusCode": 400,
  "data": null,
  "errors": ["Field 'amount' must be greater than 100"],
  "timestamp": "2026-11-08T00:15:00Z"
}
```

---

## 2. API Endpoint Catalog

### 2.1 System & Diagnostics
* `GET /api/health`: Basic uptime and runtime heartbeat.
* `GET /api/system/status`: Full credentials vault check, database count, and SMTP/SFTP readiness.
* `POST /api/system/test-smtp`: Dispatches test email through `lon110.truehost.cloud:587`.
* `GET /api/system/audit-logs`: (Admin only) Returns administrative audit trail.

### 2.2 Authentication & User Profiles
* `POST /api/auth/register`:
  * **Body**: `{ email, password, full_name, phone_number }`
  * **Returns**: `{ token, user }` + auto-initializes wallet + welcome email.
* `POST /api/auth/login`:
  * **Body**: `{ email, password }`
  * **Returns**: `{ token, user, role }`
* `GET /api/auth/me`:
  * **Headers**: `Authorization: Bearer <token>`
  * **Returns**: Current authenticated user profile, tier, and permissions.
* `POST /api/auth/quick-switch`:
  * Switches between Customer and Super Admin during testing and preview.

### 2.3 Service Catalogue & Pricing (Customer-facing)
* `GET /api/services/catalogue`:
  * **Security Rule**: Cost prices and provider internal IDs are stripped. Only tier-specific selling prices are returned.
* `GET /api/services/categories`:
  * Returns active service categories (Identity, Telecom, Utilities, Academy, Store).

### 2.4 Identity Verification (Phase 05 Ready)
* `GET /api/verification/services`:
  * Returns verification types (NIN Standard, NIN by Phone, BVN, CAC).
* `POST /api/verification/verify`:
  * **Headers**: `Authorization: Bearer <token>`
  * **Body**: `{ type: "NIN"|"BVN", identifier: "12345678901", provider: "2sureverify"|"veripine" }`
  * **Actions**: Checks wallet, debits fee, invokes provider adapter, returns verified biodata slip.
* `GET /api/verification/history`:
  * Returns user's past verification records and generated slips.

### 2.5 Telecommunications & Bills (Phase 06 Ready)
* `GET /api/telecom/plans`:
  * Returns MTN, Airtel, Glo, and 9mobile data bundle sizes and retail pricing.
* `POST /api/telecom/purchase-data`:
  * **Body**: `{ planId: "mtn_1gb", phone: "08031234567" }`
  * **Actions**: Checks balance, debits wallet, routes order to UlamaData or VTpass.
* `POST /api/telecom/purchase-airtime`:
  * **Body**: `{ network: "MTN", phone: "08031234567", amount: 1000 }`
  * **Actions**: Applies automated discount (e.g. 2.5%), debits wallet, recharges phone.

### 2.6 Wallet & Ledger Transactions (Phase 07 Ready)
* `GET /api/wallet/summary`:
  * Returns user balance, total spent, total funded, and Moniepoint dedicated virtual account details.
* `POST /api/wallet/fund`:
  * **Body**: `{ amount: 5000, gateway: "flutterwave"|"moniepoint_bank" }`
  * **Actions**: Credits user wallet via Flutterwave or manual transfer.
* `GET /api/wallet/transactions`:
  * Returns ledger entries with balance before/after for complete transparency.

### 2.7 cPanel & Server Deployment (Phase 10 Ready)
* `GET /api/cpanel/info`:
  * Returns server specifications (`lon110.truehost.cloud`, SFTP: 1624, Nameservers).
* `POST /api/cpanel/test-sftp`:
  * Validates SFTP credentials handshake.
* `GET /api/cpanel/export-package`:
  * Generates deployment configuration package (`.htaccess`, SQL migrations, upload scripts).
