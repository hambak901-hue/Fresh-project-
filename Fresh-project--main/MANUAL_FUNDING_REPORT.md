# HAMBakTECH — MANUAL FUNDING & BANK TRANSFER WORKFLOW REPORT
**Document Reference:** `HT-MAN-FUND-2026-07`  
**Phase:** Stage 7 — Complete Wallet and Payment System  
**Workflow:** Manual Bank Transfer Verification & Administrative Approval  
**Status:** FULLY IMPLEMENTED & OPERATIONAL  

---

## 1. Executive Summary

This report outlines the implementation and operational verification of the manual bank transfer funding system on HAMBakTECH. 

Customers who prefer direct electronic bank transfers or cash deposits can transfer funds directly to HAMBakTECH's official bank account, submit their payment proof with an authentic transaction receipt, and receive atomic wallet credit upon administrative verification.

---

## 2. Official Payment Instructions & Configuration

The official receiving bank details are configured across both database (`system_settings`) and backend services:

| Field | Configuration Value | Admin Configurable |
| :--- | :--- | :--- |
| **Receiving Bank** | `Moniepoint MFB` | Yes (via Admin Settings) |
| **Account Number** | `5210471634` | Yes (via Admin Settings) |
| **Account Name** | `Hambaktech_Services` | Yes (via Admin Settings) |
| **Minimum Deposit** | `₦500.00` | Yes |
| **Accepted Currencies**| `NGN` (Nigerian Naira) | Fixed |

These details are prominently presented to customers in the `WalletModal.tsx` funding dialog and the `WalletPage.tsx` treasury view, with one-tap copy buttons.

---

## 3. Customer Submission Form & Validation

### 3.1 Required Form Fields
The customer manual funding submission form (`WalletModal.tsx` and `WalletPage.tsx`) captures complete transaction metadata:
1. **Funding Amount (₦):** Validated to be numeric and $\ge ₦500$.
2. **Depositor / Sender Full Name:** Customer's legal account name.
3. **Payment Date:** Date the transfer was initiated.
4. **Payment Method:** Dropdown selection (`Mobile App Transfer`, `USSD Transfer`, `Internet Banking`, `ATM Transfer`, `Bank Branch Deposit`, `POS Transfer`).
5. **Session ID / Bank Reference:** Unique alphanumeric transaction reference from the bank.
6. **Transaction Remarks / Narration:** Optional customer note.
7. **Payment Receipt File:** Validated uploaded image or document.

### 3.2 File Upload Security Architecture
Receipt files are subject to rigorous defense-in-depth security:
* **Allowed Extensions:** `.jpg`, `.jpeg`, `.png`, `.pdf`
* **MIME-Type Validation:** `image/jpeg`, `image/png`, `application/pdf`
* **Size Limit:** Enforced at maximum 5MB.
* **Storage Path:** `backend/storage/receipts/` — located **outside** public web accessibility.
* **Directory Shielding:** Protected with `.htaccess` containing `Deny from all` to prevent direct browser execution or directory enumeration.
* **Sanitized Filenames:** Files are renamed on ingest to randomized UUID hashes (e.g. `receipt_66e12609_1731234.png`).
* **Authenticated Streaming Endpoint:** Receipts are served exclusively via `/api/wallet/receipt/:filename`, which validates JWT authentication and authorizes only the owning customer or authorized administrators.

---

## 4. Administrative Approval & Rejection Workflow

```
Customer Submits Proof
      |
      v
Request logged in `manual_funding_requests` with status = 'pending'
      |
      v
Admin Navigates to Admin Dashboard -> "Phase 7 Treasury & Approvals"
      |
      +---> Inspects: Depositor Name, Amount, Reference, Date, Method, Remarks
      +---> Clicks "View Receipt" -> Authenticated image preview modal opens
      |
      +---> ACTION 1: APPROVE
      |       |
      |       v
      |     Atomic Transaction:
      |     1. Check request status == 'pending' (pessimistic lock)
      |     2. Lock customer wallet (`SELECT ... FOR UPDATE`)
      |     3. Insert immutable `wallet_ledger` entry (type: 'credit', ref: payment_ref)
      |     4. Update wallet balance += amount, increment ledger_version
      |     5. Update request status = 'approved', approved_by = admin_id, approved_at = NOW()
      |     6. Create customer in-dashboard notification & dispatch confirmation email
      |     7. Record administrator action in `audit_logs`
      |
      +---> ACTION 2: REJECT
              |
              v
            1. Prompt displays requiring mandatory rejection reason
            2. Update request status = 'rejected', review_notes = reason
            3. Zero wallet changes; zero ledger credits
            4. Dispatch rejection notification & email to customer
```

---

## 5. Verification & Testing Matrix

| Test ID | Test Scenario | Expected Result | Actual Result |
| :--- | :--- | :--- | :--- |
| **MF-01** | Minimum Deposit Validation | Submitting ₦200 triggers validation error "Minimum manual funding amount is ₦500.00" | Validation error displayed, form submission blocked |
| **MF-02** | Large File Rejection | Submitting 8MB PDF triggers file size limit error | Rejected before upload with message "File exceeds maximum size of 5MB" |
| **MF-03** | Valid Receipt Upload & Submission | Submitting valid 1.2MB PNG with Moniepoint reference | Stored in protected storage, request queued with `pending` status |
| **MF-04** | Admin Receipt Preview | Admin opens receipt modal in `ManualFundingQueue.tsx` | Authenticated image renders clearly; unauthenticated direct URL access denied |
| **MF-05** | Atomic Approval | Admin clicks "Approve Deposit" | Customer wallet credited instantly; ledger entry created; request marked `approved` |
| **MF-06** | Duplicate Approval Prevention | Admin double-clicks "Approve" button | Idempotency guard prevents second credit; returns error "Funding request has already been processed" |
| **MF-07** | Rejection with Reason | Admin rejects deposit with "Session ID could not be found in Moniepoint statement" | Status updated to `rejected`, notification sent to customer with reason |

---

## 6. Conclusion

The manual funding module provides complete audit compliance, strict file upload protection, transparent customer tracking, and foolproof administrative approval controls.
