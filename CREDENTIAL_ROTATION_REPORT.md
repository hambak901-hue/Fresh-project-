# HAMBAKTECH ENTERPRISE — CREDENTIAL ROTATION AND PROTECTION REPORT

**Document Version:** 1.0.0  
**Classification:** Enterprise Security Audit & Operational Guide  
**Application Target:** HambakTech Enterprise Portal (`hambaktech.com.ng`)  
**Compliance Standard:** ISO/IEC 27001 & PCI-DSS Key Management Guidelines  

---

## 1. Scope & Objective

This report details the credential inspection, exposure mitigation, and rotation policy established during Stage 3 security remediation. Because historical commits and source archives previously contained hardcoded mock keys, default passwords, and static configuration strings, all affected secrets are classified as potentially compromised and transitioned to protected server-side environment variables.

---

## 2. Protected Credential Inventory & Storage Matrix

All application secrets are strictly loaded through server-side environment variables (`process.env.*` in Node.js and `getenv()` in PHP). Zero static fallback credentials remain in application source code.

| Integration Component | Environment Variable Key | Storage Location | Sensitivity | Exposure Risk | Rotation Policy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Application JWT Secret** | `JWT_SECRET` | Server `.env` | Critical | High | 90 days / On-demand |
| **Application Cryptographic Salt** | `APP_SALT` | Server `.env` | Critical | Medium | Semi-annual |
| **cPanel MySQL Database** | `DB_PASSWORD` | Server `.env` / cPanel Vault | Critical | High | Immediate Rotation |
| **2SureVerify NIN API** | `SUREVERIFY_API_KEY` | Server `.env` | High | High | Immediate Rotation |
| **Veripine BVN API** | `VERIPINE_API_KEY` | Server `.env` | High | High | Immediate Rotation |
| **UlamaData Telecom API** | `ULAMADATA_API_KEY` | Server `.env` | High | High | Immediate Rotation |
| **VTPass API & Secret** | `VTPASS_SECRET_KEY` | Server `.env` | High | High | Immediate Rotation |
| **Paystack Secret Key** | `PAYSTACK_SECRET_KEY` | Server `.env` | Critical | High | Immediate Rotation |
| **Flutterwave Secret Key** | `FLUTTERWAVE_SECRET_KEY` | Server `.env` | Critical | High | Immediate Rotation |
| **TrueHost SMTP Password** | `SMTP_PASS` | Server `.env` | High | Medium | Immediate Rotation |
| **TrueHost SFTP Deployment** | `CPANEL_SFTP_PASS` | Server `.env` | Critical | High | Immediate Rotation |
| **Root Administrator Password** | `INITIAL_ADMIN_PASSWORD` | Server `.env` | Critical | High | Immediate Rotation |

---

## 3. Credential Remediation Actions Taken

1. **Elimination of Hardcoded Fallbacks:**
   - Modified `backend/config/config.php` to remove static fallback strings for database password, JWT secret, and payment API keys.
   - Modified `backend/core/Security.php` to remove the static `SALT` constant and read dynamically from `getenv('APP_SALT')`.
   - Modified `server/db/database.ts` to remove static fallback salts in `verifyPassword` and `verifyPin`.
   - Cleaned `SuperAdminDashboard.tsx` to remove prefilled administrative email and password strings.
2. **Template Sanitization:**
   - Updated `.env.example` with comprehensive variable templates with zero sensitive values.
3. **Information Disclosure Prevention:**
   - Diagnostic endpoints (`/api/system/status`, `/api/admin/overview`, `/api/cpanel/info`) return only configuration booleans (`configured: true/false`) or masked previews (e.g. `sk_live_...48f9`), never exposing full keys or database passwords.

---

## 4. Credential Rotation Step-by-Step Procedure

To complete rotation of potentially exposed integration secrets, the system administrator must execute the following procedures:

### Step 1: TrueHost cPanel & Database Credentials
1. Log into TrueHost cPanel at `lon110.truehost.cloud:2083`.
2. Navigate to **MySQL Databases** &rarr; **Current Users** &rarr; `hambaktech_user`.
3. Click **Change Password** and generate a new 32-character random string.
4. Update `DB_PASSWORD` in the server environment configuration file.

### Step 2: Payment Gateways (Paystack & Flutterwave)
1. **Paystack Dashboard:**
   - Log into `dashboard.paystack.com` &rarr; **Settings** &rarr; **API Keys & Webhooks**.
   - Click **Generate New Secret Key**.
   - Update `PAYSTACK_SECRET_KEY` on the production server.
   - Configure webhook endpoint to `https://hambaktech.com.ng/api/wallet/paystack/webhook`.
2. **Flutterwave Dashboard:**
   - Log into `app.flutterwave.com` &rarr; **Settings** &rarr; **API Keys**.
   - Rotate API keys and update `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_ENCRYPTION_KEY`.

### Step 3: Sovereign Identity & Telecom Providers
1. **2SureVerify:** Access partner portal and request regeneration of API token. Update `SUREVERIFY_API_KEY`.
2. **Veripine:** Generate new authorization bearer key and update `VERIPINE_API_KEY`.
3. **UlamaData:** Reset API token in portal dashboard and update `ULAMADATA_API_KEY`.
4. **VTPass:** Rotate Secret Key and update `VTPASS_SECRET_KEY`.

### Step 4: Outbound Mail & SFTP
1. **TrueHost Webmail LON110:**
   - Reset email password for `notifications@hambaktech.com.ng` via cPanel **Email Accounts**.
   - Update `SMTP_PASS` in environment variables.
2. **SFTP Deployment Account:**
   - Reset FTP password for `51.89.153.183:1624` via cPanel **FTP Accounts**.
   - Update `CPANEL_SFTP_PASS` in environment variables.

---

## 5. Verification Checklist

- [x] Zero plaintext secrets printed in logs or terminal outputs.
- [x] Zero API keys bundled in frontend client builds (`dist/`).
- [x] `.env.example` verified free of sensitive production values.
- [x] All adapters safely read from `CREDENTIALS.*` object loaded from environment.
- [x] Rotation procedures documented and operationalized.
