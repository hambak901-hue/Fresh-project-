# HAMBAKTECH ENTERPRISE — STAGE 5: NIN LIVE INTEGRATION REPORT
**Document Reference**: `HT-ENG-REP-NIN-05`  
**Provider**: 2SureVerify Gateway (`https://2sureverify.com/api_docs.php`)  
**Standard**: National Identity Management Commission (NIMC) Verification Suite  
**Status**: VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary
HambakTech Enterprise has completed the production-grade live integration of the National Identity Number (NIN) suite powered by 2SureVerify as the primary sovereign verification adapter. The integration replaces all simulated mock responses in live production mode with genuine REST endpoints, strict HTTP transaction tracing, immutable reference preservation, automated wallet balance debits and instant refunds on failure, and comprehensive NDPR (Nigeria Data Protection Regulation) compliance.

---

## 2. Integrated NIN Verification Endpoints

The system maps all official 2SureVerify endpoints through both the Node.js development gateway (`/server/adapters/verification/VerificationAdapter.ts`) and the production cPanel PHP 8.2+ backend adapter (`/backend/adapters/verification/TwoSureVerifyAdapter.php`):

| Service Key | Service Name | Upstream Endpoint | Required Parameters | Purpose & Verification Scope |
|---|---|---|---|---|
| `nin_v1` | NIN Verification (V1 Standard) | `/api/v1/nin_v1.php` | `nin`, `slip_type` | Primary NIMC lookup returning official biodata with slip layout formatting. |
| `nin_v2` | NIN Verification (V2 Multi-Tier) | `/api/v1/nin_v2.php` | `nin`, `tier` | Multi-tier NIN verification with tier filtering (`basic`, `standard`, `premium`, `vnin`, `vip`). |
| `nin_v3` | NIN Verification (V3 5-Version) | `/api/v1/nin_v3.php` | `nin`, `tier`, `slip_type` | 5 independent upstream verification versions with custom slip styling. |
| `phone_v1` | Phone Verification (V1) | `/api/v1/phone_v1.php` | `phone`, `slip_type` | Resolve linked NIMC record from registered Nigerian mobile telephone number. |
| `phone_v2` | Phone Verification (V2 Multi-Tier) | `/api/v1/phone_v2.php` | `phone`, `tier` | Multi-tier phone-to-NIN resolution across basic, standard, premium, and VIP tiers. |
| `phone_v3` | Phone Verification (V3 5-Version) | `/api/v1/phone_v3.php` | `phone`, `tier`, `slip_type` | Multi-version phone-to-NIN resolution with document slip generation. |
| `demo_v1` | Demographic Verification (V1) | `/api/v1/demo_v1.php` | `firstname`, `lastname`, `dob`, `gender` | Match and locate 11-digit NIN via demographic attributes. |
| `demo_v2` | Demographic Verification (V2) | `/api/v1/demo_v2.php` | `firstname`, `lastname`, `dob`, `gender`, `tier` | Tiered demographic matching engine. |
| `demo_v3` | Demographic Verification (V3) | `/api/v1/demo_v3.php` | `firstname`, `lastname`, `dob`, `gender`, `tier`, `slip_type` | Extended demographic matching with official slip printing. |
| `vnin_verification`| Virtual NIN (VNIN) Lookup | `/api/v1/nin_v2.php` | `nin` (or 16-char VNIN) | Validates enterprise 16-digit VNIN tokens into verified NIMC records. |

---

## 3. Integrated NIN Modification & Enrolment Services

All 16 NIMC modifications and premium operational services are fully configured with administrative wholesale tariffs and customer selling prices:

1. **Name Modification** (`/api/v1/nin_mod_name.php`): Official correction of first name, middle name, or surname on the national register.
2. **Phone Modification** (`/api/v1/nin_mod_phone.php`): Updating the registered mobile number linked to the NIN profile.
3. **Address Modification** (`/api/v1/nin_mod_address.php`): Correction of residence address, LGA, and State.
4. **Date of Birth Modification** (`/api/v1/nin_mod_dob.php`): Full legal date of birth modification with affidavit submission.
5. **Name & DOB Modification** (`/api/v1/nin_mod_dob_name.php`): Simultaneous change of citizen names and birth date.
6. **Name & Phone Modification** (`/api/v1/nin_mod_name_phone.php`): Combined legal name correction and telephone update.
7. **Gender Modification** (`/api/v1/gender_modification.php`): Correction of gender classification on identity record.
8. **Suspended NIN Modification** (`/api/v1/suspended_modification.php`): Lifting of administrative suspension on flagged NINs.
9. **BVN Generated Modification** (`/api/v1/bvn_generated_modification.php`): Biometric capture & profile upgrade for BVN-generated NINs.
10. **Child Modification** (`/api/v1/child_modification.php`): Update of minor record with parent NIN consent linkage.
11. **Over-Age Modification** (`/api/v1/nin_over_age.php`): Age bracket adjustment (5-9, 10-15, 15-20 years).
12. **Second NIN Name Mod (No Auth)** (`/api/v1/second_nin_mod_name.php`): Name update without self-service credentials.
13. **Second NIN Phone Mod (No Auth)** (`/api/v1/second_nin_mod_phone.php`): Phone update without self-service credentials.
14. **Second NIN Name Mod (With Auth)** (`/api/v1/second_nin_mod_name_auth.php`): Self-service portal email/password update.
15. **Second NIN Phone Mod (With Auth)** (`/api/v1/second_nin_mod_phone_auth.php`): Self-service portal phone update.
16. **Personalisation 1 & 2** (`/api/v1/personalization.php`, `/api/v1/personalization_2.php`): High-res photo stamping and card personalisation.
17. **Validation & Sync** (`/api/v1/validation.php`): Instant database synchronization for dormant NINs.
18. **IPE Clearance** (`/api/v1/ipe_clearance.php`): Internal Processing Error portal clearance.
19. **NIN/BVN Delinking** (`/api/v1/delinking.php`): Disassociation of wrongly linked BVN from NIMC record.

---

## 4. Upstream Authentication & Protocol
- **Base URL**: `https://2sureverify.com`
- **Authentication**: `X-Api-Key: <SUREVERIFY_API_KEY>` header and `Authorization: Bearer <SUREVERIFY_API_KEY>`.
- **Request Format**: JSON (`Content-Type: application/json`, `Accept: application/json`).
- **Timeout**: 30 seconds with automatic timeout tracking and latency measurement.
- **Failover Provider**: Veripine Identity API (`https://api.veripine.com/v1`).

---

## 5. Strict Zero-Fabrication Rule (No Simulated Production Successes)
In strict compliance with architectural directives:
- When a live query fails (e.g. invalid NIN, disconnected provider, network error, upstream error message), the system **never** manufactures simulated biodata or fake slips.
- The failure is recorded in `provider_logs` with HTTP status code and latency.
- The debited wallet amount is **immediately refunded** to the customer's wallet ledger with a transparent receipt.
- A user notification is dispatched: `"[Service Name] Failed - [Amount] Refunded"`.
- Sandbox simulation is only permitted when the request explicitly specifies `testSandbox: true` (e.g. for development or admin connectivity probes).

---

## 6. Document Delivery Architecture
- When 2SureVerify returns binary PDF content (`pdf_base64`), the customer can directly download the genuine PDF via the "Download Provider PDF" action.
- When 2SureVerify returns a hosted PDF link (`pdf_url`), the document opens directly from the authenticated gateway.
- When structured JSON records are returned, the client displays verified biodata stamped with official tracking ID and timestamp.
- Demonstration slip templates are strictly visual previews for format selection and are never substituted for actual provider documents.
