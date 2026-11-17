# HAMBAKTECH ENTERPRISE — STAGE 5: SLIP TEMPLATE MANAGEMENT REPORT
**Document Reference**: `HT-ENG-REP-SLIP-05`  
**Module**: Identity Slip Template Studio & Specimen Management  
**Status**: VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary
This report documents the architectural design, administrative management, and customer selection workflow for identity slip templates. In accordance with strict integrity requirements, **administrator-uploaded slip templates serve exclusively as demonstration layout previews** to assist customers in selecting their preferred certificate format (such as NIMC Long Slip, Plastic Digital Card, or CBN BVN Slip). They are **strictly segregated from genuine provider verification documents**, which are generated solely from authentic registry records upon live query completion.

---

## 2. Dedicated Administrative Management Interface

Located under **Admin Dashboard > Service Management > Slip Templates**, administrators possess full CRUD control over preview templates:

### 2.1 Configuration Attributes
- `id`: Unique identifier (e.g. `tpl_nin_long`, `tpl_nin_plastic`).
- `name`: Display title (e.g. *"NIMC Long Slip (Standard Official Format)"*).
- `category`: Classification tag (`NIN`, `BVN`, `OTHER`).
- `demo_image_url`: High-resolution visual specimen (pre-configured with verified server assets `/assets/aistudio/IMG_0483_23e1a1e1.png`, `/assets/aistudio/IMG_0484_0fb633df.png`, `/assets/aistudio/IMG_0486_66e12609.jpeg`).
- `description`: Explanatory layout guidance for customers.
- `supported_service`: Target service key (e.g. `all_nin`, `nin_v1`, `all_bvn`).
- `display_order`: Numerical ordering in the customer selection grid.
- `badge`: Highlight tag (e.g. *"Recommended"*, *"Plastic Card"*, *"CBN Official"*).
- `watermark_text`: Prominent watermark overlay text (default: *"DEMO SPECIMEN - SAMPLE PREVIEW ONLY"*).
- `is_active`: Boolean switch toggling customer visibility.

### 2.2 Administrative Actions
1. **Add Template**: Modal supporting title, category, service binding, demo image URL, description, badge, and watermark.
2. **Edit Template**: In-place modification of any template parameter.
3. **Toggle Active Status**: Instantly enable or disable a template in customer-facing flows without deleting data.
4. **Delete Template**: Permanent removal with audit logging.
5. **Quick Asset Presets**: Instant selection buttons for uploaded specimen assets.

---

## 3. Customer Selection Experience

When a customer accesses an identity verification service with slip support (`currentService.slip_type_supported === true`):
1. **Interactive Specimen Cards**: Customers see visual preview cards displaying the administrator-uploaded specimen thumbnail.
2. **Explicit Watermarking**: Every preview card carries an unmistakable, rotated watermark overlay reading **"SAMPLE SPECIMEN"** to prevent confusion with actual identity data.
3. **Specimen Zoom Preview**: Customers can click the zoom icon to view the full specimen in an overlay modal with full watermark banners and layout notes.
4. **Transparent Customer Notice**:
   > *"Specimen Guidance: Previews above illustrate certified layout dimensions. Real government documents with authentic sovereign tracking seals and official registry QR codes are delivered upon transaction confirmation."*
5. **Dynamic Filtering**: The selector automatically filters templates matching the active service (e.g. NIN templates for NIN verification, BVN templates for BVN verification).

---

## 4. Separation from Genuine Provider Documents

| Aspect | Administrator Demonstration Template | Genuine Provider Verification Document |
|---|---|---|
| **Source** | Uploaded by administrator via Admin Studio. | Returned directly from 2SureVerify / NIMC / NIBSS registry. |
| **Data Content** | Fictitious specimen layout / placeholder design. | Actual customer biodata, verified photo, registered phone, DOB, tracking code. |
| **Watermark** | Prominent *"DEMO SPECIMEN - SAMPLE PREVIEW ONLY"*. | Authentic sovereign coat of arms and cryptographic QR seal. |
| **Delivery Point** | Displayed in pre-purchase form for format selection. | Issued in Verified Result panel & Slip Modal upon live confirmation. |
| **Formats** | Static PNG / JPEG previews. | Authentic Base64 PDF, direct PDF URL, or printable digital slip. |

---

## 5. Security and Regulatory Integrity
- Specimen files never contain active PII (Personally Identifiable Information) of real citizens.
- Watermarks are burned into the preview display via CSS backdrop overlays and SVG stampings to prevent screenshots from being misrepresented as valid ID.
- Customers cannot download raw demonstration templates as identity documents; only authentic post-verification slips can be printed or exported.
