# HAMBakTECH — STAGE 6: TELECOMMUNICATIONS CATALOGUE REPORT
**Dynamic Multi-Network Data & Utility Plan Architecture**
**Target Gateway:** UlamaData Sovereign Engine (`https://www.ulamadata.ng`)
**Production Host:** `https://hambaktech.com.ng`

---

## 1. Dynamic Catalogue Retrieval & Database Caching Strategy
Hardcoding telecommunication plans creates vulnerability to upstream price adjustments and plan code deprecation. HambakTech implements a **Dynamic Synchronized Caching Model**:

1. **Persistent Table:** `telecom_plans` in MySQL 8.0 store plan IDs, provider plan IDs, network names, plan types (SME, Corporate, Gifting, Direct), data sizes, validity periods, wholesale costs, retail selling prices, and active flags.
2. **Dynamic Sync Engine:** The endpoint `POST /api/telecom/plans/sync` queries UlamaData's `/api/data/plans/` endpoint, iterates through available packages across MTN, Glo, Airtel, and 9mobile, and executes an `INSERT ... ON DUPLICATE KEY UPDATE` statement updating wholesale costs while preserving admin custom margins.
3. **Cache Timestamping:** Every record maintains `created_at` and `updated_at` timestamps allowing administrative auditing of plan lifecycle updates.

```sql
CREATE TABLE IF NOT EXISTS `telecom_plans` (
  `id` VARCHAR(64) PRIMARY KEY,
  `provider_plan_id` VARCHAR(64) NOT NULL,
  `network` VARCHAR(32) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `size` VARCHAR(32) NOT NULL,
  `plan_type` VARCHAR(32) NOT NULL DEFAULT 'SME',
  `validity` VARCHAR(64) NOT NULL DEFAULT '30 Days',
  `wholesale_cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `provider_id` VARCHAR(64) NOT NULL DEFAULT 'ulamadata',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_network_type` (`network`, `plan_type`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 2. Dual-Tier Pricing & Wholesale Cost Protection
To safeguard proprietary business intelligence, **wholesale costs are never leaked to customer API responses**:
- When customers query `GET /api/telecom/plans`, the system returns the retail price, size, validity, and network identifier.
- Only authenticated Super Administrators and automated financial accounting subroutines have access to `wholesale_cost` and gross profit margins.

### Current Telecom Margin Breakdown Table

| Network | Plan Name | Data Size | Plan Type | Validity | Wholesale Cost | Retail Price | HambakTech Profit Margin | Margin % |
|---|---|---|---|---|---|---|---|---|
| **MTN** | MTN SME 500MB | 500MB | SME | 30 Days | ₦135.00 | ₦160.00 | ₦25.00 | 18.5% |
| **MTN** | MTN SME 1GB | 1GB | SME | 30 Days | ₦270.00 | ₦310.00 | ₦40.00 | 14.8% |
| **MTN** | MTN SME 2GB | 2GB | SME | 30 Days | ₦540.00 | ₦620.00 | ₦80.00 | 14.8% |
| **MTN** | MTN SME 3GB | 3GB | SME | 30 Days | ₦810.00 | ₦930.00 | ₦120.00 | 14.8% |
| **MTN** | MTN SME 5GB | 5GB | SME | 30 Days | ₦1,350.00 | ₦1,550.00 | ₦200.00 | 14.8% |
| **MTN** | MTN SME 10GB | 10GB | SME | 30 Days | ₦2,700.00 | ₦3,100.00 | ₦400.00 | 14.8% |
| **AIRTEL** | Airtel Corporate 1GB | 1GB | Corporate | 30 Days | ₦290.00 | ₦340.00 | ₦50.00 | 17.2% |
| **AIRTEL** | Airtel Corporate 2GB | 2GB | Corporate | 30 Days | ₦580.00 | ₦680.00 | ₦100.00 | 17.2% |
| **AIRTEL** | Airtel Corporate 5GB | 5GB | Corporate | 30 Days | ₦1,450.00 | ₦1,700.00 | ₦250.00 | 17.2% |
| **GLO** | Glo Corporate 1GB | 1GB | Corporate | 30 Days | ₦260.00 | ₦300.00 | ₦40.00 | 15.4% |
| **GLO** | Glo Corporate 2GB | 2GB | Corporate | 30 Days | ₦520.00 | ₦600.00 | ₦80.00 | 15.4% |
| **GLO** | Glo Corporate 5GB | 5GB | Corporate | 30 Days | ₦1,300.00 | ₦1,500.00 | ₦200.00 | 15.4% |
| **9MOBILE** | 9mobile SME 1GB | 1GB | SME | 30 Days | ₦250.00 | ₦290.00 | ₦40.00 | 16.0% |
| **9MOBILE** | 9mobile SME 2GB | 2GB | SME | 30 Days | ₦500.00 | ₦580.00 | ₦80.00 | 16.0% |
| **AIRTIME** | Airtime Top-Up (All Networks) | VTU | Direct | Instant | ₦97.00 per ₦100 | ₦97.50 per ₦100 | ₦0.50 per ₦100 | 2.5% Customer Discount |

---

## 3. Utility, Cable & Education Services Catalogue

In addition to data bundles, the synchronized catalogue encompasses:

### A. Cable TV Bouquets (`cable_packages`)
- **DStv:** Yanga (₦4,200), Confam (₦7,400), Compact (₦12,500).
- **GOtv:** Smallie (₦1,300), Jinja (₦2,700), Jolli (₦3,950), Max (₦5,700).
- **StarTimes:** Nova (₦1,500), Basic (₦2,600), Classic (₦3,800).
- **Showmax:** Mobile (₦1,450), Pro Mobile (₦3,200).

### B. Electricity Discos (`electricity_discos`)
- **IKEDC** (Ikeja Electric), **EKEDC** (Eko Electric), **AEDC** (Abuja Electric), **KEDCO** (Kano Electric), **PHED** (Port Harcourt Electric), **IBEDC** (Ibadan Electric), **JED** (Jos Electric), **KAEDCO** (Kaduna Electric), **BEDC** (Benin Electric), **EEDC** (Enugu Electric).
- Minimum payment: ₦500.00. Wholesale discount margin: ₦50.00 per transaction.

### C. Examination Scratch Cards (`exam_packages`)
- **WAEC Result Checker e-PIN:** Wholesale ₦3,300.00 | Retail ₦3,600.00 (Margin: ₦300.00).
- **NECO Result Token:** Wholesale ₦1,150.00 | Retail ₦1,300.00 (Margin: ₦150.00).
- **JAMB UTME Profile & PIN:** Wholesale ₦4,500.00 | Retail ₦4,800.00 (Margin: ₦300.00).
- **NABTEB Result Checker Card:** Wholesale ₦1,350.00 | Retail ₦1,500.00 (Margin: ₦150.00).

### D. Airtime-to-Cash Swap Configs (`airtime_swap_configs`)
- **MTN:** 82% Cashout Payout (*600*Merchant*Amount*PIN#)
- **Airtel:** 80% Cashout Payout (*432*1*Merchant*Amount*PIN#)
- **Glo:** 75% Cashout Payout (*131*Merchant*Amount*PIN#)
- **9mobile:** 75% Cashout Payout (*223*PIN*Amount*Merchant#)

---

## 4. Administrative Refresh & Dynamic Synchronization
The Super Administrator can trigger a synchronization request from the administrative dashboard or via cURL:

```bash
curl -X POST https://hambaktech.com.ng/api/telecom/plans/sync \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully synchronized 48 plans from UlamaData!",
  "data": {
    "synced_count": 48,
    "timestamp": "2026-11-10T07:20:00+01:00"
  }
}
```
All prices update in real-time without requiring application rebuilds.
