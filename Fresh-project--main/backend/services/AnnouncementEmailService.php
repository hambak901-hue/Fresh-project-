<?php
/**
 * @file AnnouncementEmailService.php
 * Customer Announcement Email Delivery, Audience Targeting, Deduplication & In-App Sync Service
 *
 * Sender Name : HAMBAKTECH Support
 * From        : notification@hambaktech.com.ng
 * Reply-To    : support@hambaktech.com.ng
 */

declare(strict_types=1);

namespace HambakTech\Services;

use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class AnnouncementEmailService
{
    public const SENDER_NAME = 'HAMBAKTECH Support';
    public const FROM_EMAIL = 'notification@hambaktech.com.ng';
    public const REPLY_TO_EMAIL = 'support@hambaktech.com.ng';
    public const SUPPORT_NOTE = 'Need assistance or have questions about this announcement? Simply reply to this email and our support team will be happy to assist you.';

    private Database $db;
    private static bool $schemaChecked = false;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Safely ensure required announcement targeting and delivery tracking schema exists.
     */
    public function ensureSchema(): void
    {
        if (self::$schemaChecked) {
            return;
        }
        self::$schemaChecked = true;

        try {
            $this->db->execute(
                'CREATE TABLE IF NOT EXISTS announcement_email_deliveries (
                    id VARCHAR(36) PRIMARY KEY,
                    announcement_id VARCHAR(64) NOT NULL,
                    announcement_source VARCHAR(32) NOT NULL DEFAULT "announcement",
                    user_id VARCHAR(36) NULL,
                    recipient_email VARCHAR(191) NOT NULL,
                    recipient_name VARCHAR(191) NULL,
                    status ENUM("pending", "sent", "failed", "skipped") NOT NULL DEFAULT "pending",
                    message_id VARCHAR(255) NULL,
                    error_message TEXT NULL,
                    attempts INT NOT NULL DEFAULT 1,
                    sent_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_ann_email (announcement_id, recipient_email),
                    INDEX idx_aed_ann_status (announcement_id, status),
                    INDEX idx_aed_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable) {
        }

        $columns = [
            'target_audience' => 'ADD COLUMN target_audience VARCHAR(64) NOT NULL DEFAULT "all_customers"',
            'target_user_id' => 'ADD COLUMN target_user_id VARCHAR(36) NULL',
        ];
        foreach ($columns as $col => $alterClause) {
            try {
                $exists = $this->db->fetchOne(
                    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "announcements" AND COLUMN_NAME = :col',
                    ['col' => $col]
                );
                if (!$exists) {
                    $this->db->execute("ALTER TABLE `announcements` {$alterClause}");
                }
            } catch (Throwable) {
            }
        }
    }

    /**
     * Normalize target audience aliases into canonical keys.
     */
    public static function normalizeAudience(?string $audience): string
    {
        $raw = strtolower(trim((string)$audience));
        return match ($raw) {
            '', 'all', 'customer', 'customers', 'all_customers', 'public' => 'all_customers',
            '1', 'tier_1', 'tier1', 'level_1' => 'tier_1',
            '2', 'tier_2', 'tier2', 'level_2' => 'tier_2',
            '3', 'tier_3', 'tier3', 'level_3' => 'tier_3',
            'verified', 'verified_kyc', 'kyc_verified' => 'verified_kyc',
            'pending', 'pending_kyc', 'unverified_kyc' => 'pending_kyc',
            'admin', 'admins', 'superadmin', 'staff' => 'admins',
            'all_users', 'everyone' => 'all_users',
            'specific_user', 'user', 'single' => 'specific_user',
            default => 'all_customers',
        };
    }

    /**
     * Determine whether an announcement is active/published and eligible for delivery.
     */
    public static function isDeliverable(array $announcement): bool
    {
        if (array_key_exists('status', $announcement)) {
            $status = strtolower(trim((string)$announcement['status']));
            if ($status !== '' && $status !== 'published' && $status !== 'active' && $status !== '1') {
                return false;
            }
        }
        if (array_key_exists('is_active', $announcement)) {
            $val = $announcement['is_active'];
            if ($val === false || $val === 0 || $val === '0' || $val === 'false' || $val === 'draft' || $val === 'inactive') {
                return false;
            }
        }
        return true;
    }

    /**
     * Determine whether a published announcement should be visible on a specific user's dashboard.
     */
    public static function isVisibleToUser(array $announcement, array $user): bool
    {
        if (!self::isDeliverable($announcement)) {
            return false;
        }

        $targetUserId = trim((string)($announcement['target_user_id'] ?? ''));
        $audience = self::normalizeAudience($announcement['target_audience'] ?? 'all_customers');

        if ($targetUserId !== '' || $audience === 'specific_user') {
            return $targetUserId !== '' && (string)($user['id'] ?? '') === $targetUserId;
        }

        $role = strtolower((string)($user['role'] ?? 'customer'));
        $tier = (int)($user['tier'] ?? 1);
        $kycStatus = strtolower((string)($user['kyc_status'] ?? 'pending'));

        return match ($audience) {
            'all_users' => true,
            'admins' => in_array($role, ['admin', 'superadmin', 'staff'], true),
            'tier_1' => in_array($role, ['customer', 'agent'], true) && $tier === 1,
            'tier_2' => in_array($role, ['customer', 'agent'], true) && $tier === 2,
            'tier_3' => in_array($role, ['customer', 'agent'], true) && $tier === 3,
            'verified_kyc' => in_array($role, ['customer', 'agent'], true) && $kycStatus === 'verified',
            'pending_kyc' => in_array($role, ['customer', 'agent'], true) && in_array($kycStatus, ['pending', 'unverified'], true),
            default => in_array($role, ['customer', 'agent'], true),
        };
    }

    /**
     * Resolve targeted active users with valid email addresses, deduplicated by email.
     */
    public function resolveRecipients(string $targetAudience = 'all_customers', ?string $targetUserId = null): array
    {
        $audience = self::normalizeAudience($targetAudience);
        $uid = trim((string)$targetUserId);

        if ($uid !== '' || $audience === 'specific_user') {
            if ($uid === '') {
                return [];
            }
            $rows = $this->db->fetchAll(
                'SELECT id, email, full_name, role, tier, kyc_status, status
                 FROM users
                 WHERE id = :uid AND status = "active" AND email IS NOT NULL AND email != ""',
                ['uid' => $uid]
            );
        } else {
            $sql = 'SELECT id, email, full_name, role, tier, kyc_status, status
                    FROM users
                    WHERE status = "active" AND email IS NOT NULL AND email != ""';
            $params = [];

            switch ($audience) {
                case 'all_users':
                    break;
                case 'admins':
                    $sql .= ' AND role IN ("admin", "superadmin", "staff")';
                    break;
                case 'tier_1':
                    $sql .= ' AND role IN ("customer", "agent") AND tier = 1';
                    break;
                case 'tier_2':
                    $sql .= ' AND role IN ("customer", "agent") AND tier = 2';
                    break;
                case 'tier_3':
                    $sql .= ' AND role IN ("customer", "agent") AND tier = 3';
                    break;
                case 'verified_kyc':
                    $sql .= ' AND role IN ("customer", "agent") AND kyc_status = "verified"';
                    break;
                case 'pending_kyc':
                    $sql .= ' AND role IN ("customer", "agent") AND kyc_status IN ("pending", "unverified")';
                    break;
                case 'all_customers':
                default:
                    $sql .= ' AND role IN ("customer", "agent")';
                    break;
            }

            $sql .= ' ORDER BY created_at ASC';
            $rows = $this->db->fetchAll($sql, $params);
        }

        $deduped = [];
        $seenEmails = [];
        foreach ($rows as $row) {
            $cleanEmail = strtolower(trim((string)($row['email'] ?? '')));
            if ($cleanEmail === '' || !filter_var($cleanEmail, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            if (isset($seenEmails[$cleanEmail])) {
                continue;
            }
            $seenEmails[$cleanEmail] = true;
            $row['email'] = $cleanEmail;
            $deduped[] = $row;
        }

        return $deduped;
    }

    /**
     * Ensure targeted users receive a non-duplicated in-app dashboard notification alongside the notice board.
     * Existing dashboard notification functionality is strictly preserved and never blocked on error.
     */
    public function ensureInAppNotifications(array $announcement, array $recipients): int
    {
        if (!self::isDeliverable($announcement) || empty($recipients)) {
            return 0;
        }

        $announcementId = (string)($announcement['id'] ?? '');
        $title = trim((string)($announcement['title'] ?? 'Platform Announcement'));
        $content = trim((string)($announcement['content'] ?? $announcement['message'] ?? ''));
        if ($announcementId === '' || $title === '' || $content === '') {
            return 0;
        }

        $category = strtolower(trim((string)($announcement['category'] ?? $announcement['type'] ?? 'general')));
        $notifType = match ($category) {
            'security', 'alert' => 'alert',
            'maintenance', 'warning' => 'warning',
            'offer', 'success' => 'success',
            default => 'info',
        };
        $actionLink = '#announcement:' . $announcementId;

        $inserted = 0;
        foreach ($recipients as $user) {
            $uid = (string)($user['id'] ?? '');
            if ($uid === '') {
                continue;
            }

            try {
                $existing = $this->db->fetchOne(
                    'SELECT id FROM notifications WHERE user_id = :uid AND action_link = :alink LIMIT 1',
                    ['uid' => $uid, 'alink' => $actionLink]
                );
                if ($existing) {
                    continue;
                }

                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, :tp, 0, :alink, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $uid,
                        'title' => $title,
                        'msg' => $content,
                        'tp' => $notifType,
                        'alink' => $actionLink,
                    ]
                );
                $inserted++;
            } catch (Throwable) {
            }
        }

        return $inserted;
    }

    /**
     * Dispatch emails for an active/published announcement with strict per-(announcement, recipient) deduplication.
     *
     * @param array $announcement Expected keys: id, title, content|message, category|type, status|is_active, target_audience?, target_user_id?, created_at?
     * @param array $options Optional keys: recipients (pre-resolved array), source ('announcement'|'broadcast'), retry_failed (bool)
     */
    public function dispatchForAnnouncement(array $announcement, array $options = []): array
    {
        $this->ensureSchema();

        $announcementId = trim((string)($announcement['id'] ?? ''));
        $title = trim((string)($announcement['title'] ?? ''));
        $message = trim((string)($announcement['content'] ?? $announcement['message'] ?? ''));
        $audience = self::normalizeAudience($announcement['target_audience'] ?? $announcement['target_role'] ?? 'all_customers');
        $targetUserId = !empty($announcement['target_user_id'])
            ? (string)$announcement['target_user_id']
            : (!empty($announcement['user_id']) ? (string)$announcement['user_id'] : null);
        $source = (string)($options['source'] ?? 'announcement');
        $retryFailed = (bool)($options['retry_failed'] ?? false);

        if ($announcementId === '' || $title === '' || $message === '') {
            return [
                'triggered' => false,
                'reason' => 'missing_fields',
                'total_targeted' => 0,
                'sent' => 0,
                'failed' => 0,
                'skipped_duplicates' => 0,
                'errors' => [],
            ];
        }

        if (!self::isDeliverable($announcement)) {
            return [
                'triggered' => false,
                'reason' => 'inactive_or_draft',
                'announcement_id' => $announcementId,
                'target_audience' => $audience,
                'total_targeted' => 0,
                'sent' => 0,
                'failed' => 0,
                'skipped_duplicates' => 0,
                'errors' => [],
            ];
        }

        $recipients = isset($options['recipients']) && is_array($options['recipients'])
            ? $this->normalizeExplicitRecipients($options['recipients'])
            : $this->resolveRecipients($audience, $targetUserId);

        if (empty($recipients)) {
            return [
                'triggered' => true,
                'reason' => 'no_targeted_recipients',
                'announcement_id' => $announcementId,
                'target_audience' => $audience,
                'sender_name' => self::SENDER_NAME,
                'from_email' => self::FROM_EMAIL,
                'reply_to' => self::REPLY_TO_EMAIL,
                'total_targeted' => 0,
                'sent' => 0,
                'failed' => 0,
                'skipped_duplicates' => 0,
                'errors' => [],
            ];
        }

        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }

        $mailService = new MailService();
        $sentCount = 0;
        $failedCount = 0;
        $skippedDuplicates = 0;
        $errorsSample = [];

        foreach ($recipients as $recipient) {
            $cleanEmail = strtolower(trim((string)($recipient['email'] ?? '')));
            if ($cleanEmail === '' || !filter_var($cleanEmail, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            $recipientName = trim((string)($recipient['full_name'] ?? 'Valued Customer')) ?: 'Valued Customer';
            $userId = !empty($recipient['id']) ? (string)$recipient['id'] : null;

            // Duplicate prevention check per (announcement_id, recipient_email)
            $deliveryId = null;
            try {
                $existing = $this->db->fetchOne(
                    'SELECT id, status, attempts FROM announcement_email_deliveries
                     WHERE announcement_id = :aid AND recipient_email = :email LIMIT 1',
                    ['aid' => $announcementId, 'email' => $cleanEmail]
                );

                if ($existing) {
                    if ($existing['status'] === 'sent' || $existing['status'] === 'pending') {
                        $skippedDuplicates++;
                        continue;
                    }
                    if ($existing['status'] === 'failed' && !$retryFailed) {
                        $skippedDuplicates++;
                        continue;
                    }
                    $deliveryId = (string)$existing['id'];
                    $this->db->execute(
                        'UPDATE announcement_email_deliveries
                         SET status = "pending", attempts = attempts + 1, updated_at = NOW()
                         WHERE id = :id',
                        ['id' => $deliveryId]
                    );
                } else {
                    $deliveryId = Security::generateUuid();
                    $this->db->execute(
                        'INSERT INTO announcement_email_deliveries
                         (id, announcement_id, announcement_source, user_id, recipient_email, recipient_name, status, attempts, created_at, updated_at)
                         VALUES (:id, :aid, :src, :uid, :email, :name, "pending", 1, NOW(), NOW())',
                        [
                            'id' => $deliveryId,
                            'aid' => $announcementId,
                            'src' => $source,
                            'uid' => $userId,
                            'email' => $cleanEmail,
                            'name' => $recipientName,
                        ]
                    );
                }
            } catch (Throwable $e) {
                // Unique constraint race condition or transient DB check -> skip to prevent duplicate email
                $skippedDuplicates++;
                continue;
            }

            // Build template & dispatch via existing SMTP configuration
            try {
                $tpl = $this->buildEmailTemplate($announcement, $recipientName);
                $res = $mailService->send(
                    $cleanEmail,
                    $recipientName,
                    $tpl['subject'],
                    $tpl['html'],
                    null,
                    [
                        'from_email' => self::FROM_EMAIL,
                        'from_name' => self::SENDER_NAME,
                        'reply_to' => self::REPLY_TO_EMAIL,
                        'text_body' => $tpl['text'],
                        'audit_action' => 'ANNOUNCEMENT_EMAIL_DISPATCHED',
                    ]
                );

                $isSent = !empty($res['sent']);
                $messageId = (string)($res['message_id'] ?? '');
                $errMsg = $isSent ? null : mb_substr((string)($res['error'] ?? $res['message'] ?? 'SMTP delivery failed'), 0, 900);

                $this->db->execute(
                    'UPDATE announcement_email_deliveries
                     SET status = :st, message_id = :mid, error_message = :err, sent_at = CASE WHEN :st2 = "sent" THEN NOW() ELSE sent_at END, updated_at = NOW()
                     WHERE id = :id',
                    [
                        'st' => $isSent ? 'sent' : 'failed',
                        'st2' => $isSent ? 'sent' : 'failed',
                        'mid' => $messageId ?: null,
                        'err' => $errMsg,
                        'id' => $deliveryId,
                    ]
                );

                if ($isSent) {
                    $sentCount++;
                } else {
                    $failedCount++;
                    if (count($errorsSample) < 5 && $errMsg) {
                        $errorsSample[] = "{$cleanEmail}: {$errMsg}";
                    }
                }
            } catch (Throwable $e) {
                $failedCount++;
                $errMsg = mb_substr($e->getMessage(), 0, 900);
                if (count($errorsSample) < 5) {
                    $errorsSample[] = "{$cleanEmail}: {$errMsg}";
                }
                try {
                    $this->db->execute(
                        'UPDATE announcement_email_deliveries
                         SET status = "failed", error_message = :err, updated_at = NOW()
                         WHERE id = :id',
                        ['err' => $errMsg, 'id' => $deliveryId]
                    );
                } catch (Throwable) {
                }
            }
        }

        // Batch audit record (never exposes SMTP credentials)
        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
                 VALUES (:id, NULL, :email, "ANNOUNCEMENT_EMAIL_BATCH", :details, "127.0.0.1", NOW())',
                [
                    'id' => Security::generateUuid(),
                    'email' => self::FROM_EMAIL,
                    'details' => json_encode([
                        'announcement_id' => $announcementId,
                        'title' => $title,
                        'target_audience' => $audience,
                        'total_targeted' => count($recipients),
                        'sent' => $sentCount,
                        'failed' => $failedCount,
                        'skipped_duplicates' => $skippedDuplicates,
                    ]),
                ]
            );
        } catch (Throwable) {
        }

        return [
            'triggered' => true,
            'announcement_id' => $announcementId,
            'sender_name' => self::SENDER_NAME,
            'from_email' => self::FROM_EMAIL,
            'reply_to' => self::REPLY_TO_EMAIL,
            'target_audience' => $audience,
            'total_targeted' => count($recipients),
            'sent' => $sentCount,
            'failed' => $failedCount,
            'skipped_duplicates' => $skippedDuplicates,
            'errors' => $errorsSample,
        ];
    }

    /**
     * Aggregate email delivery statistics per announcement ID for Admin UI display.
     */
    public function getDeliveryStatsMap(array $announcementIds): array
    {
        if (empty($announcementIds)) {
            return [];
        }
        $this->ensureSchema();

        $cleanIds = array_values(array_unique(array_filter(array_map('strval', $announcementIds))));
        if (empty($cleanIds)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
        $map = [];
        try {
            $rows = $this->db->fetchAll(
                "SELECT announcement_id,
                        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                        COUNT(*) as total_logged,
                        MAX(sent_at) as last_sent_at
                 FROM announcement_email_deliveries
                 WHERE announcement_id IN ({$placeholders})
                 GROUP BY announcement_id",
                $cleanIds
            );
            foreach ($rows as $row) {
                $map[(string)$row['announcement_id']] = [
                    'sent_count' => (int)($row['sent_count'] ?? 0),
                    'failed_count' => (int)($row['failed_count'] ?? 0),
                    'total_logged' => (int)($row['total_logged'] ?? 0),
                    'last_sent_at' => $row['last_sent_at'] ?? null,
                ];
            }
        } catch (Throwable) {
        }
        return $map;
    }

    /**
     * Build clean, mobile-friendly HTML and plain-text email payload for an announcement.
     */
    public function buildEmailTemplate(array $announcement, string $recipientName): array
    {
        $rawTitle = trim((string)($announcement['title'] ?? 'Platform Announcement'));
        $rawContent = trim((string)($announcement['content'] ?? $announcement['message'] ?? ''));
        $rawCategory = strtolower(trim((string)($announcement['category'] ?? $announcement['type'] ?? 'general')));
        $createdAtRaw = (string)($announcement['created_at'] ?? '');
        $timestamp = $createdAtRaw !== '' ? strtotime($createdAtRaw) : false;
        $publishedDate = $timestamp ? date('F j, Y \a\t g:i A', $timestamp) . ' WAT' : date('F j, Y \a\t g:i A') . ' WAT';

        $categoryMeta = match ($rawCategory) {
            'maintenance', 'warning' => ['label' => 'Maintenance Notice', 'bg' => '#fef3c7', 'fg' => '#92400e', 'border' => '#fde68a'],
            'security', 'alert' => ['label' => 'Security Advisory', 'bg' => '#fee2e2', 'fg' => '#991b1b', 'border' => '#fecaca'],
            'offer', 'success' => ['label' => 'Special Update & Offer', 'bg' => '#dcfce7', 'fg' => '#166534', 'border' => '#bbf7d0'],
            'update' => ['label' => 'Platform Update', 'bg' => '#dbeafe', 'fg' => '#1e40af', 'border' => '#bfdbfe'],
            default => ['label' => 'Official Announcement', 'bg' => '#dbeafe', 'fg' => '#1e40af', 'border' => '#bfdbfe'],
        };

        $safeName = htmlspecialchars($recipientName ?: 'Valued Customer', ENT_QUOTES, 'UTF-8');
        $safeTitle = htmlspecialchars($rawTitle, ENT_QUOTES, 'UTF-8');
        $safeMessageHtml = nl2br(htmlspecialchars($rawContent, ENT_QUOTES, 'UTF-8'));
        $safeDate = htmlspecialchars($publishedDate, ENT_QUOTES, 'UTF-8');
        $safeBadgeLabel = htmlspecialchars($categoryMeta['label'], ENT_QUOTES, 'UTF-8');
        $safeSupportNote = htmlspecialchars(self::SUPPORT_NOTE, ENT_QUOTES, 'UTF-8');
        $subject = '[HAMBAKTECH] ' . $rawTitle;

        $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$safeTitle} - HAMBAKTECH</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
                    <!-- Header -->
                    <tr>
                        <td style="padding:26px 28px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);text-align:left;">
                            <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">
                                HAMBAKTECH
                            </div>
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#bfdbfe;margin-top:4px;font-weight:600;">
                                HAMBAK TECH &amp; SERVICES &bull; Where Technology Meets Services
                            </div>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:28px;">
                            <div style="margin-bottom:14px;">
                                <span style="display:inline-block;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;background-color:{$categoryMeta['bg']};color:{$categoryMeta['fg']};border:1px solid {$categoryMeta['border']};">
                                    {$safeBadgeLabel}
                                </span>
                            </div>

                            <h1 style="margin:0 0 10px 0;font-size:21px;line-height:1.35;font-weight:800;color:#0f172a;">
                                {$safeTitle}
                            </h1>

                            <p style="margin:0 0 20px 0;font-size:12px;color:#64748b;">
                                Published on <strong style="color:#334155;">{$safeDate}</strong>
                            </p>

                            <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">
                                Hello <strong>{$safeName}</strong>,
                            </p>

                            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1d4ed8;border-radius:10px;padding:18px 20px;margin:16px 0 22px 0;font-size:14px;line-height:1.7;color:#1e293b;">
                                {$safeMessageHtml}
                            </div>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 24px 0;">
                                <tr>
                                    <td style="border-radius:10px;background-color:#1d4ed8;">
                                        <a href="https://hambaktech.com.ng/#login" style="display:inline-block;padding:12px 22px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                                            Open Customer Dashboard &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Reply Assistance Notice -->
                            <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;">
                                <p style="margin:0;font-size:12.5px;line-height:1.6;color:#1e3a8a;">
                                    {$safeSupportNote}
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:18px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
                            <p style="margin:0 0 6px 0;font-size:11.5px;color:#475569;font-weight:600;">
                                HAMBAKTECH Support &bull; <a href="mailto:support@hambaktech.com.ng" style="color:#1d4ed8;text-decoration:none;">support@hambaktech.com.ng</a>
                            </p>
                            <p style="margin:0;font-size:11px;line-height:1.5;color:#64748b;">
                                &copy; 2024&ndash;2026 HAMBAK TECH &amp; SERVICES (BN 9284726).<br>
                                Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;

        $text = "HAMBAKTECH — Official Announcement\n"
            . str_repeat('=', 44) . "\n"
            . "{$rawTitle}\n"
            . "Published: {$publishedDate}\n\n"
            . "Hello {$recipientName},\n\n"
            . "{$rawContent}\n\n"
            . self::SUPPORT_NOTE . "\n\n"
            . "Customer Dashboard: https://hambaktech.com.ng/#login\n"
            . "HAMBAK TECH & SERVICES (BN 9284726) | support@hambaktech.com.ng\n";

        return [
            'subject' => $subject,
            'html' => $html,
            'text' => $text,
        ];
    }

    private function normalizeExplicitRecipients(array $recipients): array
    {
        $deduped = [];
        $seen = [];
        foreach ($recipients as $row) {
            $email = strtolower(trim((string)($row['email'] ?? '')));
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            if (isset($seen[$email])) {
                continue;
            }
            $seen[$email] = true;
            $row['email'] = $email;
            $deduped[] = $row;
        }
        return $deduped;
    }
}
