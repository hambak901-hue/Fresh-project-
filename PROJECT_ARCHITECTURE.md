# Project Architecture: HambakTech Enterprise Portal
**Author**: Senior Software Architect & Systems Engineer  
**System Target**: Production Cloud Host cPanel Shared Hosting (IP: <CPANEL_HOST>, Port: 1624, User: <CPANEL_USER>)  
**Phase**: Phase 01: Project Foundation and System Architecture  
**Status**: Completed & Approved

---

## 1. Executive Summary & Production Technology Strategy

HambakTech Enterprise Portal is a high-availability Nigerian fintech, identity verification (NIN/BVN), telecommunications (data/airtime vending), utility billing, and academy platform.

### Hosting Compatibility Decision:
* **The Production Constraint**: Standard cPanel shared hosting accounts (such as Production Cloud Host) are optimized for **PHP 8.2+ and MySQL/MariaDB**, where processes run on Apache/LiteSpeed web servers under suPHP or PHP-FPM. Continuous Node.js daemons on shared hosting are often subject to process killing, memory throttles, and socket resets.
* **The Architectural Solution**:
  1. **Production Runtime**: A native **PHP 8.2+ REST backend** located in `/backend` (or `public_html/api`), paired with a compiled, minified **static SPA frontend** (`/dist`) deployed directly into `public_html/`.
  2. **Development Runtime**: A full-stack TypeScript + Express + Vite dev server (`server.ts`) for real-time development in AI Studio, mirroring the exact contract of the PHP 8.2 production backend.
  3. **Zero Runtime Coupling**: Development tooling (Node.js, tsx, Vite, Tailwind CLI) stays strictly in the build phase. The production server requires only PHP 8.2+ and MySQL.

---

## 2. Comprehensive Subsystem Architectures

### 2.1 Frontend Architecture
* **Framework**: React 19 SPA built via Vite 8.
* **Styling**: Tailwind CSS v4 design system with modern dark fintech theme, high-contrast typography (`Plus Jakarta Sans` and `JetBrains Mono`), and micro-interactions.
* **State Management**:
  * `AuthContext`: Session lifecycle, role awareness, and reactive wallet balance auto-refresh.
  * API Layer: Centralized typed HTTP client (`src/lib/api.ts`) managing Bearer authorization headers and error standardizations.
* **Component Layering**:
  * Phase Tracker: Enforces strict sequential phase execution without jumping ahead.
  * Dashboards: Role-segregated views (Customer Portal, Admin Portal, Super Admin Console).
  * Services: Isolated verification forms, telecom selectors, and payment checkouts.

### 2.2 Backend Architecture (PHP 8.2+)
* **Location**: `/backend`
* **Entry Point**: `backend/index.php` front controller managed by `.htaccess`.
* **Pattern**: Modular Service-Repository with Adapter Pattern for 3P integrations.
* **Core Modules**:
  * `HambakTech\Core\Router`: Clean URL regex dispatcher.
  * `HambakTech\Core\Response`: Uniform envelope `{ success, message, statusCode, data, errors, timestamp }`.
  * `HambakTech\Core\Security`: BCRYPT cost-12 hashing, CSRF validation, output escaping, and identity masking.
  * `HambakTech\Core\Auth`: HMAC-SHA256 JWT generation and RBAC role validation.
  * `HambakTech\Config\Database`: PDO MySQL wrapper with transactions and optimistic locking.

### 2.3 Provider Adapter Architecture
The portal abstracts third-party services behind unified PHP interfaces so providers can be swapped or failed-over without changing business logic:
* **Identity Verification (`VerificationAdapterInterface`)**:
  * `TwoSureVerifyAdapter`: Primary gateway using API key `664469ea92436a4c7ff997281a32a742dcd84f9a5e6603f0`.
  * `VeripineAdapter`: Failover gateway using API key `ninbvn_6443d1d6279df9af26b60dc4`.
* **Telecommunications & VTU (`TelecomAdapterInterface`)**:
  * `UlamaDataAdapter`: SME & CG data top-ups via API key `7aOkA4OzIF6xfuUIXbvk7ByxVGH0U5gSNy1OfpYb`.
  * `VTpassAdapter`: Airtime, electricity tokens, and cable TV via Public/Secret keys.
* **Payment Gateways (`PaymentGatewayInterface`)**:
  * `FlutterwaveAdapter`: Automated card, USSD, and virtual bank accounts.
  * `MoniepointBankAdapter`: Dedicated virtual accounts for manual/automated bank transfers.

### 2.4 Security & Data Privacy Architecture
* **Credentials Isolation**: Private provider API keys, FTP passwords, and SMTP secrets reside solely in server environment files (`.env` / `config.php`) and are NEVER transmitted to the client.
* **Price & Margin Protection**: Provider cost prices are strictly isolated in `provider_service_mappings`. Customer-facing endpoints return only the tier-specific `selling_price`.
* **Identity Protection**: NIN, BVN, and phone numbers are masked in customer logs (`Security::maskIdentifier`).
* **Financial Integrity**: Double-entry immutable `wallet_ledger` records both before-balance and after-balance with mandatory idempotency keys to eliminate double-spending.

### 2.5 Mail & Communication Architecture
* **SMTP Gateway**: Connected directly to `lon110.truehost.cloud:587` with TLS encryption.
* **Sender Identity**: `notifications@hambaktech.com.ng` (Password: `Hamohullah19@..`).
* **Purpose**: Instant transactional emails (Welcome, OTP, KYC status, Wallet credit, Verification slips).
