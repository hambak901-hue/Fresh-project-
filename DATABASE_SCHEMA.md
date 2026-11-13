# Database Schema Specification: HambakTech Enterprise
**Engine**: MySQL 8.0+ / MariaDB 10.5+ (InnoDB Storage Engine)  
**Encoding**: `utf8mb4` with collation `utf8mb4_unicode_ci`  
**File Reference**: `backend/database/schema.sql` and `backend/database/seed.sql`

---

## 1. Schema Entity Relationship Overview

The HambakTech database is structured into 6 logical domain clusters:
1. **Authentication & Identity**: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `customer_profiles`, `admin_accounts`.
2. **Financial Core & Accounting**: `wallets`, `wallet_ledger`, `transactions`, `payment_gateways`, `manual_funding_requests`.
3. **Service Catalogue & Multi-Provider Pricing**: `service_categories`, `service_catalogue`, `providers`, `provider_credentials`, `provider_service_mappings`, `customer_selling_prices`, `orders`.
4. **KYC & Compliance**: `kyc_records`.
5. **Customer Communications & Support**: `notifications`, `messages`.
6. **Platform Administration & CMS**: `website_content`, `system_settings`, `audit_logs`.

---

## 2. Table Catalog & Design Specifications

### Cluster A: Authentication & Access Control

#### `users`
* `id`: BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
* `uuid`: CHAR(36) UNIQUE NOT NULL (Public identifier)
* `email`: VARCHAR(191) UNIQUE NOT NULL
* `phone_number`: VARCHAR(32) UNIQUE NOT NULL
* `password_hash`: VARCHAR(255) NOT NULL (BCRYPT cost 12)
* `user_type`: ENUM('customer', 'admin', 'superadmin')
* `status`: ENUM('active', 'inactive', 'suspended', 'banned')
* `two_factor_enabled`: TINYINT(1) DEFAULT 0
* `created_at`, `updated_at`: TIMESTAMP

#### `roles` & `permissions`
* Normalized Role-Based Access Control (RBAC).
* Roles: `superadmin` (ID 1), `admin` (ID 2), `reseller` (ID 3), `customer` (ID 4).

#### `customer_profiles`
* `user_id`: BIGINT UNSIGNED PRIMARY KEY (FK -> `users.id`)
* `first_name`, `last_name`, `middle_name`: VARCHAR(100)
* `referral_code`: VARCHAR(50) UNIQUE NOT NULL
* `referred_by_id`: BIGINT UNSIGNED NULL (FK -> `users.id`)
* `pricing_tier_id`: INT UNSIGNED DEFAULT 1 (1=Retail, 2=Reseller, 3=Partner)
* `kyc_tier`: TINYINT UNSIGNED DEFAULT 1 (Tier 1: unverified, Tier 2: NIN/BVN, Tier 3: Full KYC)

#### `admin_accounts`
* `user_id`: BIGINT UNSIGNED PRIMARY KEY (FK -> `users.id`)
* `department`: VARCHAR(100)
* `can_manage_finances`, `can_manage_kyc`, `can_manage_services`, `can_view_logs`: TINYINT(1)

---

### Cluster B: Financial Core & Double-Entry Ledger

#### `wallets`
* `id`: BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
* `user_id`: BIGINT UNSIGNED NOT NULL UNIQUE (FK -> `users.id`)
* `balance`: DECIMAL(15, 4) NOT NULL DEFAULT 0.0000
* `ledger_balance`: DECIMAL(15, 4) NOT NULL DEFAULT 0.0000
* `currency`: VARCHAR(10) DEFAULT 'NGN'
* `version`: BIGINT UNSIGNED NOT NULL (Optimistic locking for concurrency control)

#### `wallet_ledger` (Immutable Accounting)
* **Rule**: Records cannot be edited or deleted once inserted.
* `id`: BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
* `wallet_id`: BIGINT UNSIGNED (FK -> `wallets.id`)
* `transaction_reference`: VARCHAR(100) NOT NULL
* `entry_type`: ENUM('credit', 'debit')
* `amount`: DECIMAL(15, 4) NOT NULL
* `balance_before`: DECIMAL(15, 4) NOT NULL
* `balance_after`: DECIMAL(15, 4) NOT NULL
* `idempotency_key`: VARCHAR(128) NOT NULL UNIQUE
* `created_at`: TIMESTAMP

#### `transactions`
* Customer-facing transaction logs.
* `reference`: VARCHAR(100) UNIQUE NOT NULL
* `category`: ENUM('wallet_funding', 'nin_verification', 'bvn_verification', 'data_purchase', 'airtime_topup', etc.)
* `amount`, `fee`, `balance_before`, `balance_after`: DECIMAL
* `gateway`: VARCHAR(50) (e.g. 'flutterwave', 'moniepoint_bank')
* `status`: ENUM('pending', 'successful', 'failed', 'reversed')

---

### Cluster C: Multi-Provider Service Catalogue & Pricing

#### `service_catalogue`
* Master list of services offered (NIN, BVN, SME Data, Airtime, Cable TV, Academy, Store).

#### `providers` & `provider_credentials`
* Stores upstream provider configurations: `2sureverify`, `veripine`, `ulamadata`, `vtpass`.
* Credentials are encrypted at rest and never shared with users.

#### `provider_service_mappings`
* Links catalogue item to upstream provider code.
* Stores `cost_price`: **Never exposed in customer APIs.**

#### `customer_selling_prices`
* Stores tier-based retail/wholesale pricing (`tier_id` 1 vs 2 vs 3).
* Customer endpoints query this table to calculate user-facing prices.

#### `orders`
* Tracks fulfillment: `recipient`, `cost_price`, `selling_price`, `profit`, `provider_reference`, `status`.

---

### Cluster D: Verification & Support

#### `kyc_records`
* Identity documents (NIN, BVN, Driver's License, Voter's Card, Selfies, Utility Bills).

#### `notifications` & `messages`
* System push notifications and two-way customer support tickets.

#### `system_settings` & `audit_logs`
* Key-value platform settings and tamper-evident administrative audit trail.

---

## 3. Migration to cPanel

To import this schema on cPanel:
1. Open cPanel at `<CPANEL_HOST>:2083`.
2. Navigate to **MySQL Databases** and create `<DB_NAME>`.
3. Open **phpMyAdmin**, select `<DB_NAME>`.
4. Click **Import** and upload `backend/database/schema.sql`, followed by `backend/database/seed.sql`.
