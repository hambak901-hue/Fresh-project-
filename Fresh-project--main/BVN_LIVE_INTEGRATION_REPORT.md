# HAMBAKTECH ENTERPRISE — STAGE 5: BVN LIVE INTEGRATION REPORT
**Document Reference**: `HT-ENG-REP-BVN-05`  
**Provider**: 2SureVerify Gateway (`https://2sureverify.com/api_docs.php`)  
**Authority**: Central Bank of Nigeria (CBN) / Nigeria Inter-Bank Settlement System (NIBSS)  
**Status**: VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary
This report details the implementation, endpoint mapping, bank selection architecture, and document issuance workflows for Bank Verification Number (BVN) services on the HambakTech Enterprise portal. All BVN verification and modification workflows communicate directly with 2SureVerify upstream endpoints, backed by strict NDPR consent enforcement, dual-margin price controls, and audit journaling.

---

## 2. Integrated BVN Services

| Service Key | Service Name | Upstream Endpoint | Required Fields | Functional Scope |
|---|---|---|---|---|
| `bvn_v1` | BVN Verification (V1 Standard) | `/api/v1/bvn_v1.php` | `bvn`, `slip_type` | Validates 11-digit BVN against NIBSS records with slip format choice (`bvnStandard`, `plasticBvn`). |
| `bvn_v2` | BVN Verification (V2) | `/api/v1/bvn_v2.php` | `bvn` | Standard CBN biometric record check with registered full names, DOB, phone, and enrollment bank. |
| `bvn_v3` | BVN Verification (V3 Multi-Version) | `/api/v1/bvn_v3.php` | `bvn`, `tier`, `slip_type` | 5-version biometric query routing with high-speed certificate generation. |
| `bvn_retrieval` | BVN Retrieval by Phone | `/api/v1/bvn_retrieval.php` | `phone` | Resolves and retrieves the 11-digit BVN registered to a Nigerian phone number. |
| `bvn_modification` | BVN Modification (Bank Specific) | `/api/v1/bvn_modification.php` | `bvn`, `bank_name`, `modification_details` | Bank-specific BVN record modification routed through designated commercial bank agencies. |
| `bvn_enroll_adult` | BVN Enrolment (Adult) | `/api/v1/bvn_enroll_adult.php` | `nin`, `first_name`, `last_name`, `phone`, `bank_name` | Adult BVN biometric enrollment with partner bank choice and agency capture. |
| `bvn_enroll_child` | BVN Enrolment (Child) | `/api/v1/bvn_enroll_child.php` | `child_nin`, `parent_bvn`, `first_name`, `last_name` | Minor/child banking identity enrollment with parental BVN linkage. |

---

## 3. Dynamic Bank Selection Engine

Commercial banks enforce distinct wholesale pricing and verification prerequisites for BVN modifications and enrolments. HambakTech implements dynamic bank query endpoints:

1. **BVN Modification Banks** (`GET /api/verification/banks/modification`):
   - Queries `https://2sureverify.com/api/v1/bvn_modification_banks.php`.
   - Returns real-time bank catalog (Access Bank, First Bank, GTBank, Zenith Bank, UBA, FCMB, Stanbic IBTC, OPay/PalmPay, NIBSS Agency).
   - Applies administrator-configured gross margin (wholesale + ₦4,000 margin) while protecting wholesale figures from customer exposure.

2. **BVN Enrolment Banks** (`GET /api/verification/banks/enrollment`):
   - Queries `https://2sureverify.com/api/v1/bvn_enrollment_banks.php`.
   - Returns partner enrollment institutions with automated retail markups.

---

## 4. BVN Verification Result & Document Formats
Upon successful verification, 2SureVerify returns certified NIBSS attributes:
- `bvn`: 11-digit Bank Verification Number.
- `first_name`, `middle_name`, `surname`: Certified legal names.
- `date_of_birth`: Registered date of birth.
- `phone_number`: Primary banking telephone number.
- `enrollment_bank`: Commercial bank where biometric capture occurred.
- `enrollment_branch`: Branch location of initial registration.
- `gender`: Verified biological gender.
- `photo`: Certified passport photograph from banking records.
- `pdf_base64` or `slip_image_url`: Genuine document returned directly by provider.

---

## 5. Error Management and Instant Refund Architecture
- If the BVN is invalid, not found, or flagged by NIBSS, 2SureVerify returns an explicit rejection payload.
- The portal captures the exact rejection reason (`"Invalid BVN"`, `"Record does not exist"`, etc.) and records it in `provider_logs`.
- The customer's debited wallet balance is **immediately credited back** via `db.adjustBalance(userId, fee, 'manual_adjustment', ...)`.
- An in-app alert notification is dispatched detailing the instant refund.
- No fabricated BVN certificate or fake slip is ever rendered.
