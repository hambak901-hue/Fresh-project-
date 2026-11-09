# PHASE 9: KNOWN LIMITATIONS & PHASE 10 DEPLOYMENT ROADMAP

**System**: HambakTech Enterprise Portal  
**Target Host**: TrueHost LON110 Tier-3 Server (51.89.153.183:1624)  
**Document Status**: Production Staging Baseline  
**Date**: November 8, 2026  

---

## 1. Intentional Staged Capabilities (Coming Soon Modules)

In accordance with the 10-Phase Waterfall Masterplan, certain auxiliary modules are intentionally staged as "Coming Soon" for customer access while their backend administration suites are fully implemented:

### 1.1 Flutterwave Payment Gateway
- **Current State**: Paystack is the primary active online payment gateway (`pk_live_...` and webhook signature).
- **Staging**: The Flutterwave adapter is staged as "Coming Soon" in the gateway selector pending merchant account tier approval. The code architecture is modular and ready for live keys.

### 1.2 Hardware Store & POS Terminal Vending
- **Current State**: The Super Admin Store Management console (`StoreManagement.tsx`) is fully functional (adding items, inventory tracking, prices, and status).
- **Customer View**: Staged with an interactive Coming Soon page featuring a waitlist subscription and preview modal.

### 1.3 Technology Academy
- **Current State**: The Super Admin Academy Management console (`AcademyManagement.tsx`) manages courses, curriculum syllabi, and enrollment fees.
- **Customer View**: Staged with an interactive Coming Soon syllabus preview and registration waitlist.

### 1.4 Advanced Financial Reports & Downline Journals
- **Current State**: Basic transaction histories, date-range filters, and customer statements are active in `WalletPage.tsx` and `TransactionsPage.tsx`.
- **Customer View**: The dedicated Reports module is staged as Coming Soon, while Super Admin maintains complete real-time gross revenue metrics.

---

## 2. Cloud Preview vs. TrueHost LON110 Production Environment Differences

| Feature | Cloud Run Development Container | TrueHost LON110 Production (cPanel) |
|---|---|---|
| **Port Binding** | Fixed port 3000 (proxy through 8080) | Port assigned via cPanel Node.js Application Manager or Unix Socket |
| **Outbound SMTP Socket** | External TCP port 465/587 may be blocked by container firewall; emails logged in simulated mode | Native outbound socket access to `lon110.truehost.cloud:465` (contact@hambaktech.com.ng) |
| **File Persistence** | Ephemeral container filesystem (persists across reboots in `server/db/data.json`) | Persistent SSD disk storage on `/home/hambaktech/public_html` |
| **Database Engine** | Atomic JSON & in-memory ledger (`database.ts`) | Direct MySQL / MariaDB via cPanel PHPMyAdmin |

---

## 3. Phase 10 Production Deployment Roadmap

Phase 10 represents the final stage of the masterplan:
1. **Production Vite Build**: Execute `npm run build` with chunk splitting, gzip compression, and assets optimization.
2. **cPanel Node.js Setup**: Generate `.htaccess` rewrite rules and `server.js` entry point compatible with cPanel CloudLinux Passenger.
3. **Database Migration Script**: Run SQL table creation script in TrueHost PHPMyAdmin.
4. **Automated SFTP Deployment**: Deploy application package directly to `51.89.153.183:1624` using the credentials vault.
5. **Live Verification**: Verify domain resolution (`hambaktech.com.ng`), SSL certificate, and end-to-end transaction processing on the live TrueHost server.

---

## 4. Sign-Off

All documented limitations are intentional architectural staging points and do not compromise the security, ledger integrity, or core VTU/Identity capabilities of the HambakTech Enterprise Portal.
