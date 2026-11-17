# HAMBAK TECH & SERVICES — PHASE 1 LIVE PRODUCTION AUDIT & ROLE/DASHBOARD REVIEW

**Target Production System:** `https://hambaktech.com.ng/`  
**Live Environment Verified via HTTPS Probes:** PHP `8.3.36`, MySQL `8.0.42` (`pdo_mysql`), Apache/cPanel SPA + `/api/*` REST Router  
**Audit Method:** Full static inspection of PHP backend (`/backend`), MySQL schema/migrations (`/backend/database`, `/backend/core/SchemaSync.php`), React 19 SPA (`/src`), Express local dev mirror (`/server`), and live read-only HTTP probes against `https://hambaktech.com.ng/`.

---

## 1. Executive Summary of Production Architecture

```text
React 19 + Vite SPA (/src -> /dist)
   └── HTTPS /api/* (.htaccess rewrite -> /backend/index.php)
         └── PHP 8.3 Custom Router + PDO MySQL Controllers (/backend/controllers/*)
               ├── Auth / Session / RBAC Engine (JWT HS256 + user_sessions + token_version)
               ├── WalletService (SELECT ... FOR UPDATE + wallet_ledger + transactions)
               ├── Paystack / Flutterwave / Manual Bank Transfer Approvals
               ├── Notification + Email (SMTP / PHPMailer-style SmtpTransport) + Customer Messages
               ├── Verification / Modification / Enrolment (2SureVerify / Veripine)
               └── Telecom / VTU (UlamaData / VTpass)
```

- **Local Sandbox Note:** This workspace runs Express + LowDB (`server.ts`, `server/db/data.json`) as a local development mirror on port 3000 because PHP and MySQL CLIs and cPanel FTP/MySQL credentials are not present in this container. All production changes must target PHP (`backend/`) + MySQL migrations + React frontend (`src/`), while keeping `server/` synchronized for local testing.

---

## 2. Inspection of Existing Roles, Dashboards & Access Control

### 2.1 Discovered User Roles
Inspected `users.role` ENUM, `roles` seed table, `staff_accounts` schema, `Auth.php`, `AuthController.php`, `AdminController.php`, `App.tsx`, `CustomerDashboard.tsx`, and `SuperAdminDashboard.tsx`:

| Role / Identifier | Where Configured | Actual Runtime Status | Dashboard Interface |
|---|---|---|---|
| `superadmin` | `users.role` ENUM, `roles` table (`rol_superadmin`) | **Active.** Wildcard `['*']` permissions; full global console & gateway/staff authority. | `SuperAdminDashboard` (Phase `04`) + can switch to `CustomerDashboard` (Phase `03`) |
| `admin` (including delegated Staff / Managers) | `users.role` ENUM, `roles` table (`rol_admin`) | **Active.** Used both for legacy admins (`assigned_permissions = NULL`) and delegated staff/managers (`assigned_permissions = JSON array`). | `SuperAdminDashboard` (Phase `04`) filtered dynamically by `user.permissions` |
| `customer` | `users.role` ENUM, `roles` table (`rol_customer`, `"Customer / Agent"`) | **Active.** Standard portal customer / agent with KYC Tiers 1–3 (`tier` / `kyc_level`). | `CustomerDashboard` (Phase `03`) + `NinServicesPage` (Phase `05`) |
| `agent` | Shown in `CustomerManagement.tsx` `<select>` | **Alias only.** `AdminController::createCustomer()` converts `'agent'` to `users.role = 'customer'`. | `CustomerDashboard` |
| `staff` | Shown in `CustomerManagement.tsx` `<select>`, referenced in `AdminController::overview()` SQL | **Misconfigured.** `AdminController::createCustomer()` line 4898 silently coerces `'staff'` into `'customer'`. Actual staff creation works via `StaffPermissionsManagement` -> `POST /api/admin/staff` (`role = 'admin'` + `assigned_permissions`). | Intended: `SuperAdminDashboard` (filtered); Broken when created via Customer Management |
| `staff_accounts` (`analyst`, `manager`, `executive`, `superadmin`) & `role_permissions` | `backend/database/schema.sql`, `SchemaSync.php` | **Dormant.** Created in MySQL schema sync, never queried by `Auth.php` or any controller. | None (no controller reads `staff_accounts`) |

### 2.2 Dashboard Coverage per Active Role
1. **`customer` → `CustomerDashboard.tsx` (Well-structured, preserve):**
   - Sidebar sections: Main Services (`overview`, `nin`, `telecom`, `wallet`, `referrals`), Digital Utilities (`store`, `digital`, `academy`, `reports`), History & Audits (`transactions`, `orders`, `notifications`, `messages`), Account & Security (`kyc`, `profile`, `settings`, `support`).
   - **Missing for Phase 2:** Printing & Document Services section/page (`Submit Printing Request`, `My Printing Orders`, `Printing Price Guide`, `Delivery Information`, `Printing Support`) and `mod_printing` row in `dashboard_modules`.
2. **`admin` (Delegated Staff / Manager) & `superadmin` → `SuperAdminDashboard.tsx` (Preserve, extend RBAC):**
   - Sidebar dynamically filters navigation items by `user.permissions` (`*`, `permission`, `permissionsAny`, `superAdminOnly`).
   - Enforces admin session idle timeout (`admin_session_timeout_minutes`, default 60m), User-Agent binding, `token_version` revocation, and optional MFA.
   - **Missing for Phase 2:** Printing Management module (`permission: 'printing'`) and `printing` / `printing_pricing` granular permission options in `StaffPermissionsManagement.tsx` and `$allowedPerms` in `AdminController.php`.

---

## 3. Concrete Permission, Role & Architecture Issues Found

1. **High — Coarse Backend `Auth::requireRole(['admin', 'superadmin'])` Bypassing Granular Staff Permissions:**
   - Although `SuperAdminDashboard.tsx` hides sidebar items based on `user.permissions`, multiple PHP controllers only check `Auth::requireRole($request, ['admin', 'superadmin'])` instead of `Auth::requirePermission($request, ...)`:
     - `NotificationController.php` (all 7 admin endpoints ignore `'notifications'`)
     - `SupportController.php` (`adminTickets`, `updateStatus`, `deleteTicket`, and admin reply/view bypass `'support'`)
     - `CmsController.php` (all 11 admin endpoints ignore `'cms'`)
     - `AcademyController.php` (all 10 admin endpoints ignore `'services'`)
     - `ModificationController.php` (all 9 admin endpoints ignore `'services'`)
     - `EnrolmentController.php` (all 9 admin endpoints ignore `'services'`)
     - `TelecomController.php` (all 14 admin endpoints ignore `'services'`)
     - `AdminController::updateBankSettings()` (line 822 ignores `'wallet'`)
     - `WalletController::switchGateway()` (line 212 uses `requireRole` instead of `requireSuperAdmin` — inconsistent with `SettingsController::updateSettings` which enforces `requireSuperAdmin` for `payment_gateways`)
   - *Risk:* A delegated printing staff operator (with `role='admin'` and `permissions=['printing']`) could call CMS, Telecom pricing, Notifications broadcast, or Gateway switch APIs directly.

2. **High — Empty `assigned_permissions` Escalation in `Auth::user()` & `AuthController::login()`:**
   - `Auth::user()` (line 435) and `AuthController::login()` (line 242) do `elseif ($user['role'] === 'admin' && empty($perms))` and grant **8 broad permissions** (`customers`, `wallet`, `kyc`, `services`, `support`, `reports`, `referrals`, `withdrawals`).
   - Because `json_decode('[]', true)` evaluates to `empty($perms) === true`, saving an explicit empty permission array `[]` for a restricted staff member escalates them to 8 administrative permissions!
   - *Fix:* Only grant legacy default permissions when BOTH `assigned_permissions` and `profile_permissions` are `NULL` or empty string `""` (never configured), NOT when explicitly stored as valid JSON `'[]'`.

3. **Medium — Silent `'staff'` Role Coercion in `AdminController::createCustomer()`:**
   - `CustomerManagement.tsx` offers `<option value="staff">Staff</option>`, and line 4839 accepts `'staff'`, **but line 4898 coerces anything other than `'admin'`/`'superadmin'` to `'customer'`**.
   - *Fix:* If `'staff'` is selected in `createCustomer()`, require `superadmin` caller (403 otherwise) and provision `role = 'admin'` with explicit safe staff permissions (default `['printing', 'support']` or supplied `permissions`), while preserving `'agent'` as `role = 'customer'` with agent tag in profile metadata.

4. **Medium — Permission Whitelist Drift (`AdminController.php` vs `StaffPermissionsManagement.tsx`):**
   - `AdminController::$allowedPerms` includes `pin_security` and `accounting_*`, which are partially missing from `StaffPermissionsManagement.tsx`, and neither includes `'printing'` or `'printing_pricing'` yet.

5. **Low — Minor Hygiene Items:**
   - `AuthController::login()` line 251 records footprint `'CUSTOMER_LOGIN'` even for `'admin'` and `'superadmin'` logins.
   - `backend/middleware/AuthMiddleware.php` is unused legacy code referencing non-existent `Hambak\Core\Auth` namespaces (actual routing uses `HambakTech\Core\Auth`). Preserve untouched or document as legacy dead code.

---

## 4. Audited Reusable Infrastructure (Confirmed Ready for Phase 2)

| Capability | Live Production Implementation | Phase 2 Reuse Plan |
|---|---|---|
| **Wallet & Immutable Ledger** | `WalletService::debit()` / `credit()` (`SELECT ... FOR UPDATE`, `wallets`, `wallet_ledger`, `transactions`) | Debit wallet atomically on printing quote/deposit/balance payment; credit wallet on authorized refund (`gateway='internal'`, `category='printing_service'`). |
| **Gateways & Manual Transfers** | `WalletController` Paystack/Flutterwave verify + `manual_funding_requests` | Support wallet payment (instant + Transaction PIN), Paystack/Flutterwave checkout initialization & verification, and Manual Bank Transfer receipt review under Printing Payment Records. |
| **PIN Security** | `PinSecurityService::requireValidPin()` | Validate customer Transaction PIN before wallet payment of printing orders (respecting configured `pin_policy`). |
| **File Uploads** | `CustomerController::uploadDocument()` (`finfo` MIME check, `backend/storage/uploads/` with `.htaccess` deny, `uploaded_documents`, authenticated `/api/customer/document/:id`) | Extend safely for printing artwork uploads (`JPG`, `PNG`, `WEBP`, `PDF`, plus safe document/vector extensions with strict extension + size + MIME check) stored outside web execution. |
| **Notifications & Email** | `notifications` table + `customer_messages` + `MailService::send()` + `SmtpTransport` | Notify customers & printing admins on request submission, quotation sent, approval/decline, payment confirmed, production started, ready for collection/dispatch, out for delivery, completed, or rejected/cancelled, including order ref & `#printing` link. |
| **Schema Synchronization** | `SchemaSync::sync()` (`INFORMATION_SCHEMA` + `CREATE TABLE IF NOT EXISTS`) | Add `SchemaSync::syncPrintingModuleSchema($db)` alongside standalone additive SQL migration + rollback script. |

---

## 5. Safest Additive Integration & Rollback Plan

1. **Zero Destructive SQL:** Only `CREATE TABLE IF NOT EXISTS` for new `printing_*` tables and idempotent `INSERT IGNORE` into `dashboard_modules` (`mod_printing`) and default categories/delivery zones. Zero modifications to existing `transactions`, `wallets`, `verification_records`, `telecom_orders`, or `users` data.
2. **Modular Code Addition:**
   - New service & controller: `backend/services/PrintingService.php`, `backend/controllers/PrintingController.php`
   - Additive route block in `backend/index.php` (preserving all existing routes above)
   - Additive schema hook in `backend/core/SchemaSync.php` + standalone migration `backend/database/migrations/2026_12_printing_module_upgrade.sql` & rollback `backend/database/migrations/2026_12_printing_module_rollback.sql`
   - Additive React components: `src/components/customer/PrintingServicesPage.tsx` & `src/components/admin/AdminPrintingManagement.tsx` wired into `CustomerDashboard.tsx`, `SuperAdminDashboard.tsx`, `DashboardOverview.tsx`, `types.ts`, and `api.ts`
   - Synchronized Express dev mirror `server/routes/printing.ts` for local verification in Node container.
3. **RBAC Hardening:** Apply surgical `Auth::requirePermission(...)` & empty-array permission fix without altering any existing `superadmin`, legacy `admin` (`assigned_permissions = NULL`), or `customer` sessions/permissions.
4. **Rollback Strategy:** Removing the route block in `backend/index.php` + reverting frontend tab entries restores pre-printing behavior cleanly without losing any core customer, NIN, VTU, or wallet records; `2026_12_printing_module_rollback.sql` cleanly removes only printing-specific tables if ever required.
