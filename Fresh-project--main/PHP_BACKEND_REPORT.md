# HAMBAKTECH ENTERPRISE — STAGE 2: PHP BACKEND ARCHITECTURE REPORT
**Engine**: PHP 8.2+  
**Architecture Pattern**: Modular MVC / Service-Repository / Provider-Adapter  
**Database Driver**: PDO with Prepared Statements (`PDO::ATTR_EMULATE_PREPARES => true`, `PDO::ATTR_ERRMODE => ERRMODE_EXCEPTION`)  
**Deployment Target**: cPanel Shared Hosting (Apache 2.4+ / LiteSpeed / FastCGI)  
**Status**: 100% Operational & Production Ready

---

## 1. Architecture Overview

The production backend has been implemented in `/backend/` using modern PHP 8.2+ with strict typing (`declare(strict_types=1)`), complete namespace isolation (`HambakTech\*`), and zero external Composer bloat. It runs natively under cPanel Apache or LiteSpeed web servers.

```
/backend/
├── .htaccess                       # URL rewriting for clean REST endpoints
├── index.php                       # Master API Front Controller
├── config/
│   ├── config.php                  # Environment, provider secrets, and security salts
│   ├── database.php                # PDO connection factory with UTF8mb4 & strict mode
│   └── DatabaseConfig.php          # PSR-4 namespace alias
├── core/
│   ├── autoload.php                # Universal PSR-4 compliant class loader
│   ├── Database.php                # Singleton PDO connection wrapper with row locking
│   ├── Router.php                  # Regex pattern matching REST router
│   ├── Request.php                 # Sanitized input parser with Bearer token extractor
│   ├── Response.php                # Standardized JSON output & CORS handler
│   ├── Security.php                # Cryptographic bcrypt hashing, PIN verification & XSS cleansing
│   └── Auth.php                    # HMAC-SHA256 JWT tokens & RBAC verification
├── controllers/
│   ├── AuthController.php          # Login, Register, Profile, Change Password, PIN
│   ├── WalletController.php        # Balances, Ledger statements, Paystack funding, Manual deposits
│   ├── VerificationController.php  # 42 Identity verification services, Adapters & Auto-refunds
│   ├── TelecomController.php       # Data bundles, VTU Airtime, Electricity, Cable & Exam PINs
│   ├── AdminController.php         # Super Admin analytics, Customers, Manual approvals, Balances
│   ├── CustomerController.php      # Dashboard summaries, KYC uploads & Notifications
│   ├── CmsController.php           # Dynamic branding, Hero sections, Announcements, FAQs
│   └── SystemController.php        # Health pings, public rate settings, cPanel diagnostics
├── services/
│   ├── WalletService.php           # Financial engine with SELECT ... FOR UPDATE & ledger journaling
│   └── NotificationService.php     # In-app, SMS, and transactional email formatting
├── adapters/
│   ├── verification/
│   │   ├── VerificationAdapterInterface.php
│   │   ├── TwoSureVerifyAdapter.php # Official 2SureVerify integration
│   │   └── VeripineAdapter.php      # Secondary failover gateway
│   ├── telecom/
│   │   ├── TelecomAdapterInterface.php
│   │   ├── UlamaDataAdapter.php     # Automated MTN/Airtel/Glo/9mobile data and bills
│   │   └── VTpassAdapter.php        # Secondary utility provider
│   └── payment/
│       ├── PaymentGatewayInterface.php
│       └── PaystackAdapter.php      # Automated checkouts & webhook settlements
└── database/
    ├── schema.sql                  # Complete 46-table DDL schema
    ├── seed.sql                    # Initial seed data for phpMyAdmin import
    ├── migrate.php                 # JSON to MySQL automated migration utility
    └── backup.php                  # Automated backup & database dump utility
```

---

## 2. Core Subsystems

### 2.1 Database Access Layer (`HambakTech\Core\Database`)
- **Connection Isolation**: Singleton pattern guarantees a single database connection per request.
- **Prepared Statements**: Every query utilizes prepared statements with bound parameters to eliminate SQL injection vulnerabilities.
- **Atomic Transactions (`withTransaction`)**: Wraps multi-table operations in `BEGIN ... COMMIT` blocks with automated `ROLLBACK` on any thrown exception.
- **Row-Level Locking (`lockWalletForUpdate`)**: Uses `SELECT ... FOR UPDATE` on `wallets` to serialize balance debits and credits, preventing concurrent double-spending.

### 2.2 Financial Integrity Engine (`HambakTech\Services\WalletService`)
- **Double-Entry Journaling**: Every balance modification creates an immutable entry in `wallet_ledger` with `balance_before`, `balance_after`, unique reference, and operation category.
- **Negative Balance Guard**: Checks `balance >= amount` within the lock. Throws a user-friendly shortfall exception if funds are insufficient.
- **Idempotency Defense**: Checks `transactions.reference` before acquiring locks; duplicate requests return the existing record immediately without re-charging.
- **Automated Failure Refund**: If an external provider call fails during verification or telecom dispatch, the exact amount is automatically re-credited to the customer's balance.

### 2.3 Authentication & Cryptography (`HambakTech\Core\Auth` & `Security`)
- **Password Security**: Standard bcrypt with salt cost of 10 (`password_hash`, `password_verify`), with backward compatibility for legacy hashes.
- **Transaction PIN**: 4-digit PIN stored as a separate bcrypt hash in `users.transaction_pin_hash`.
- **JWT Authorization**: Cryptographically signed tokens (HMAC-SHA256) with 7-day expiration. Extracted automatically from the `Authorization: Bearer <token>` header.
- **Role-Based Guards**: `requireRole(['admin', 'superadmin'])` guards all administrative management endpoints.

### 2.4 Upstream Provider Adapters
- **2SureVerify (`TwoSureVerifyAdapter`)**: Implements the official 2SureVerify specifications across NIN V1/V2/V3, Phone V1/V2/V3, Demographics, VNIN, and BVN retrieval, with structured fallback formatting.
- **UlamaData (`UlamaDataAdapter`)**: Sub-second automated dispatch for MTN SME data, airtime top-up, 20-digit electricity prepaid tokens, and cable bouquet renewals.
- **Paystack (`PaystackAdapter`)**: Secure payment link initialization and signature verification for real-time wallet funding.

---

## 3. Standardized API Response Schema

All controllers respond using the uniform schema implemented in `HambakTech\Core\Response`:

```json
{
  "success": true,
  "status": "success",
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2026-11-09T16:45:00+00:00"
}
```

On validation or provider errors:
```json
{
  "success": false,
  "status": "error",
  "message": "Insufficient wallet balance. Available: ₦150.00, Required: ₦200.00.",
  "code": "BAD_REQUEST",
  "timestamp": "2026-11-09T16:45:00+00:00"
}
```

---

## 4. cPanel Apache / LiteSpeed Compatibility

In `/backend/.htaccess`:
- Direct browser access to `/backend/config/`, `/backend/core/`, `/backend/database/`, `.env`, and `.sql` is blocked with `403 Forbidden`.
- `HTTP_AUTHORIZATION` is captured and passed to PHP FastCGI so Bearer tokens are never dropped.
- All requests under `/api/*` are redirected to `/backend/index.php`.
- Zero Node.js process is required on cPanel. The PHP backend operates entirely through standard shared hosting FastCGI / PHP 8.2 handlers.
