# HAMBAKTECH ENTERPRISE — FILE UPLOAD SECURITY AND STORAGE REPORT

**Document Version:** 1.0.0  
**Target:** Document Ingestion, KYC Verification, and Payment Receipt Pipelines  
**Endpoints:** `POST /api/customer/upload`, `POST /api/customer/kyc-submit`, `POST /api/customer/manual-funding`, `GET /api/customer/document/:id`  
**Security Standard:** Strict MIME / Magic-Byte Validation & Anti-Webshell Defense  

---

## 1. Upload Pipeline Architecture

The file upload pipeline in HambakTech Enterprise protects the server and user confidentiality through a multi-tiered ingestion workflow:

```
[ Client Document Upload ]
         │
         ▼
1. File Size Verification (Strict 5MB Ceiling)
         │
         ▼
2. Dangerous Extension Filtering (.php, .sh, .exe, .html, .js)
         │
         ▼
3. Magic-Byte Header Verification (Validates authentic binary signatures)
         │
         ▼
4. Cryptographic UUID Filename Generation (Anti-collision, zero path traversal)
         │
         ▼
5. Protected Access Authorization (Customer ownership check or Admin role)
```

---

## 2. Security Controls Implemented

### 2.1 Magic-Byte Binary Signature Verification
MIME types cannot be spoofed by modifying HTTP `Content-Type` headers or file extensions. The `validateUploadBuffer` service inspects the leading 8 bytes of the binary payload:

| Target Format | Expected MIME Type | Magic Byte Signature (Hex) | Leading ASCII Marker |
| :--- | :--- | :--- | :--- |
| **JPEG / JPG** | `image/jpeg` | `ffd8ff` | `\xFF\xD8\xFF` |
| **PNG** | `image/png` | `89504e470d0a1a0a` | `\x89PNG\r\n\x1a\n` |
| **PDF** | `application/pdf` | `25504446` | `%PDF` |
| **WebP** | `image/webp` | `52494646` ... `57454250` | `RIFF....WEBP` |

Any file claiming to be an image or document that fails magic-byte analysis is immediately rejected with HTTP `400 Bad Request`.

### 2.2 Prohibited File Formats and Extensions
The system strictly rejects any file matching executable, script, or server-side interpretative extensions:
- Executables: `.exe`, `.bin`, `.bat`, `.cmd`
- Server-side scripts: `.php`, `.phtml`, `.sh`, `.bash`, `.py`, `.pl`, `.cgi`
- Client-side scripts & HTML: `.html`, `.htm`, `.js`, `.ts`, `.svg` (prevents SVG-embedded XSS attacks)

### 2.3 Strict Size Limitations
- **Maximum File Size:** 5 MB (`5,242,880 bytes`).
- Requests exceeding this threshold are blocked before disk or buffer exhaustion occurs, mitigating Denial of Service (DoS) vectors.

### 2.4 Cryptographic Filename Generation
To eliminate path traversal attacks (e.g., `../../etc/passwd` or overwrite exploits):
- Original client filenames are discarded for filesystem storage.
- A cryptographically random name is generated using standard UUID v4:
  ```typescript
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  const secureName = `doc_${timestamp}_${uuid}.${extension}`;
  ```

---

## 3. Access Control & Non-Predictable Document Retrieval

Private customer documents (National Identity Number slips, Bank Verification Number certificates, bank transfer deposit slips, and ID cards) are **never** accessible through static, predictable web directories.

1. **Endpoint:** `GET /api/customer/document/:id`
2. **Access Authorization:**
   - The requesting user session is resolved via `requireCustomer`.
   - The server verifies: `document.user_id === req.user.id || req.user.role === 'admin' || req.user.role === 'superadmin'`.
   - Unauthorized attempts return HTTP `403 Forbidden` and trigger an immediate audit security alert (`UNAUTHORIZED_DOCUMENT_ACCESS`).
3. **Response Headers:**
   - `X-Content-Type-Options: nosniff` (Prevents browser from treating images as executable HTML).
   - `Content-Disposition: inline; filename="..."` (Sanitized filename).

---

## 4. Test Verification Summary

| Test Case | Payload Description | Expected Result | Actual Result |
| :--- | :--- | :--- | :--- |
| **UPL-01** | Authentic JPEG National ID scan (1.2 MB) | HTTP 201 Created; Secure UUID assigned | **PASSED** |
| **UPL-02** | PHP webshell renamed as `shell.jpg` (Magic bytes invalid) | HTTP 400 Bad Request; Rejection | **PASSED** |
| **UPL-03** | Oversized PDF bank statement (8.4 MB > 5MB limit) | HTTP 400 Bad Request; Size exceeded | **PASSED** |
| **UPL-04** | Direct URL access to another customer's KYC document | HTTP 403 Forbidden; Access denied | **PASSED** |
| **UPL-05** | Administrator review access to customer KYC document | HTTP 200 OK; Document delivered | **PASSED** |
