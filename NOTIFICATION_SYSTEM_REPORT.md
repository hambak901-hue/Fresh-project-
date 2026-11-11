# HAMBAKTECH — STAGE 8: NOTIFICATION SYSTEM & BROADCAST REPORT

**Audit Date**: November 11, 2026  
**Implementation**: Administrative Notification Hub (`NotificationManagement.tsx`) & Customer Alerts (`NotificationsPage.tsx`)  
**Backend**: `backend/controllers/NotificationController.php` with MySQL tables `notifications`, `announcements`, and `audit_logs`.

---

## 1. Executive Summary

The notification subsystem facilitates real-time multi-channel communication across:
1. **In-Dashboard Notifications**: Direct alerts displayed in the customer notifications drawer.
2. **Public Announcements**: Marquee banners on the landing page and customer portal dashboard.
3. **Mass Broadcasts**: Targeted dispatches to all users, specific roles (customers vs staff), or individual user IDs.
4. **Email & SMS Transmission**: Transactional notification dispatches triggered by critical business events.

---

## 2. Notification Subsystem Capabilities

### A. Broadcast Composer
- **Target Channels**: In-App, Email, SMS, or Omni-channel.
- **Audience Targeting**: All users, customers only, staff only, or specific customer by numeric User ID.
- **Priority Styles**: Information (blue), Success (green), Warning/Maintenance (amber), Critical Security Alert (red).

### B. Announcement Management
- Add, edit, toggle visibility, and delete system banners.
- Persisted in MySQL `announcements` table with fields `id`, `title`, `content`, `category`, `is_pinned`, `status`, `author`, `created_at`.
- Active banners display immediately across public landing pages and the customer dashboard.

### C. Delivery Logging & Audit Trail
- Logs every mass broadcast transmission with recipient counts, channel type, author, and timestamp.
- Monitored via `GET /api/admin/notifications/overview`.

---

## 3. Registered API Routes

- `GET /api/admin/notifications/overview`: Aggregated telemetry (in-app alerts, unread counts, active banners, email/SMS log counts).
- `GET /api/admin/notifications/broadcasts`: Full transmission logs of previous broadcasts.
- `POST /api/admin/notifications/broadcast`: Transmits a mass broadcast and records delivery records.
- `GET /api/admin/announcements`: Lists published announcement banners.
- `POST /api/admin/announcements`: Publishes or edits announcement banners.
- `DELETE /api/admin/announcements/:id`: Deletes announcement banner from live rotation.

---

## 4. Verification

Live testing on `https://hambaktech.com.ng`:
- `GET /api/admin/notifications/overview` returns HTTP 200 with active channels `['in_dashboard', 'email', 'sms', 'announcements']`.
