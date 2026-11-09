# HAMBAKTECH ENTERPRISE — STAGE 2: FRONTEND-TO-BACKEND CONNECTION REPORT
**Frontend Framework**: React 19 + TypeScript + Vite + Tailwind CSS  
**Production Backend**: PHP 8.2+ with MariaDB / MySQL Relational Core  
**API Protocol**: RESTful JSON over HTTPS  
**Preservation Status**: 100% Intact (Zero Visual Redesign, Zero Layout Alteration)

---

## 1. Frontend Preservation Verification

In accordance with strict instructions, the frontend has been preserved in its entirety:
- **Visual Design & Themes**: The green/emerald branding, Tailwind CSS typography, animations, dark mode palettes, and responsive grids remain identical.
- **Routing & Views**: All public landing pages, Customer Portal (NIN, Telecom, Wallet, Digital Services, Store, Academy, Reports, Notifications, Profile), and Super Admin views remain intact in `/src/`.
- **State Management**: `AuthContext.tsx` maintains session state, user balances, and JWT token resolution.
- **Production Asset Build**: Built cleanly with `npm run build` into `/dist/` (`dist/index.html`, `dist/assets/index-*.css`, `dist/assets/index-*.js`).

---

## 2. Dual-Environment Connectivity Architecture

### 2.1 Development & Preview Environment (AI Studio)
In the interactive AI Studio development environment:
- Dev server runs on port 3000 (`tsx server.ts`).
- Vite dev server hot-reloads React components and serves CSS/assets.
- API endpoints (`/api/*`) are handled seamlessly by Express while maintaining exact schema parity with the PHP backend.

### 2.2 Production Environment (TrueHost LON110 / cPanel Native)
In production on cPanel:
- The React build output (`/dist/*`) is deployed directly into the web root (`public_html/`).
- The PHP backend (`/backend/`) is hosted alongside the frontend.
- When the browser fetches `/api/*`, Apache/LiteSpeed rewrites the request directly to `/backend/index.php` via `.htaccess`.
- FastCGI executes PHP 8.2 with PDO connection pooling.
- **Critical Benefit**: **No Node.js daemon, PM2, or background terminal process is needed on cPanel!**

---

## 3. End-to-End API Endpoint Matrix

| Frontend Module | API Endpoint | HTTP Method | PHP Controller Handler | MySQL Table(s) Read/Written |
| :--- | :--- | :--- | :--- | :--- |
| Public Landing & CMS | `/api/cms/public-data` | `GET` | `CmsController::publicData` | `website_branding`, `cms_sections`, `announcements`, `faqs`, `navigation_menus`, `dashboard_modules` |
| Auth & Sessions | `/api/auth/login` | `POST` | `AuthController::login` | `users`, `user_profiles`, `wallets`, `audit_logs` |
| Customer Registration | `/api/auth/register` | `POST` | `AuthController::register` | `users`, `user_profiles`, `wallets`, `notifications` |
| Customer Profile | `/api/auth/profile` | `PUT` | `AuthController::updateProfile` | `users`, `user_profiles` |
| Customer PIN | `/api/auth/set-pin` | `POST` | `AuthController::setPin` | `users` |
| Wallet Overview | `/api/wallet/summary` | `GET` | `WalletController::summary` | `wallets`, `transactions` |
| Ledger History | `/api/wallet/transactions` | `GET` | `WalletController::transactions` | `transactions`, `wallet_ledger` |
| Card Checkout | `/api/wallet/fund/initiate` | `POST` | `WalletController::initiateFunding` | `payment_records` |
| Manual Deposit | `/api/wallet/manual-funding` | `POST` | `WalletController::manualFunding` | `manual_funding_requests` |
| Identity Catalog | `/api/verification/services`| `GET` | `VerificationController::services` | `service_catalogue`, `service_categories` |
| Identity Verification | `/api/verification/verify` | `POST` | `VerificationController::verify` | `wallets`, `wallet_ledger`, `transactions`, `verification_records`, `provider_logs` |
| Telecom Catalog | `/api/telecom/plans` | `GET` | `TelecomController::plans` | `telecom_plans`, `cable_packages`, `electricity_discos`, `exam_packages`, `airtime_swap_configs` |
| Data Bundle Order | `/api/telecom/data` | `POST` | `TelecomController::purchaseData` | `wallets`, `wallet_ledger`, `transactions`, `telecom_orders`, `provider_logs` |
| Airtime Recharge | `/api/telecom/airtime` | `POST` | `TelecomController::topupAirtime` | `wallets`, `wallet_ledger`, `transactions`, `telecom_orders` |
| Electricity Token | `/api/telecom/electricity` | `POST` | `TelecomController::vendElectricity`| `wallets`, `wallet_ledger`, `transactions`, `telecom_orders` |
| Cable TV Bouquet | `/api/telecom/cable` | `POST` | `TelecomController::renewCable` | `wallets`, `wallet_ledger`, `transactions`, `telecom_orders` |
| Admin Analytics | `/api/admin/overview` | `GET` | `AdminController::overview` | `users`, `wallets`, `transactions`, `telecom_orders`, `verification_records`, `providers` |
| Customer Directory | `/api/admin/customers` | `GET` | `AdminController::customers` | `users`, `wallets`, `user_profiles` |
| Manual Fund Approval | `/api/admin/funding-requests/:id/action` | `POST` | `AdminController::approveFunding` | `manual_funding_requests`, `wallets`, `wallet_ledger`, `transactions`, `notifications` |
| Balance Adjustment | `/api/admin/customers/adjust-balance` | `POST` | `AdminController::creditDebitUser` | `wallets`, `wallet_ledger`, `transactions`, `audit_logs` |

---

## 4. Production Deployment Layout on cPanel

```
public_html/
├── index.html                      # Built React entry point (from dist/)
├── assets/                         # Optimized JS, CSS & images (from dist/)
│   ├── index-*.js
│   └── index-*.css
├── favicon.ico
├── .htaccess                       # Main cPanel rewrite configuration
└── backend/                        # PHP 8.2 backend directory
    ├── index.php                   # Front controller
    ├── config/
    │   └── config.php              # Production database & provider keys
    ├── core/
    ├── controllers/
    ├── services/
    ├── adapters/
    └── database/
        ├── schema.sql
        └── seed.sql
```

The React frontend and PHP backend form a cohesive, decoupled, and secure enterprise solution ready for high-concurrency production usage.
