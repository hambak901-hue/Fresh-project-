<?php
/**
 * @file FootprintService.php
 * Centralized Enterprise Activity Monitoring & Security Audit Trail Engine
 * Records all user/customer/visitor/service transactions securely in MySQL.
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Database;
use HambakTech\Core\Security;
use Throwable;

class FootprintService
{
    private static ?Database $db = null;

    private static function getDb(): Database
    {
        if (self::$db === null) {
            self::$db = Database::getInstance();
        }
        return self::$db;
    }

    /**
     * Ensure the activity_footprints table exists with proper indexes
     */
    public static function ensureTable(): void
    {
        try {
            $db = self::getDb();
            $db->execute(
                'CREATE TABLE IF NOT EXISTS activity_footprints (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) NULL,
                    user_email VARCHAR(191) NULL,
                    user_name VARCHAR(191) NULL,
                    category ENUM("auth", "wallet", "service", "admin", "security", "visitor") NOT NULL,
                    action VARCHAR(100) NOT NULL,
                    service_type VARCHAR(100) NULL,
                    reference VARCHAR(100) NULL,
                    provider VARCHAR(100) NULL,
                    status ENUM("pending", "processing", "successful", "failed") NOT NULL DEFAULT "successful",
                    amount DECIMAL(16,2) NULL,
                    error_message TEXT NULL,
                    metadata JSON NULL,
                    ip_address VARCHAR(50) NULL,
                    user_agent VARCHAR(500) NULL,
                    device_info VARCHAR(100) NULL,
                    browser_info VARCHAR(100) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_fp_created (created_at),
                    INDEX idx_fp_category (category),
                    INDEX idx_fp_user (user_id),
                    INDEX idx_fp_status (status),
                    INDEX idx_fp_ref (reference)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) {
            error_log('[FootprintService::ensureTable] ' . $e->getMessage());
        }
    }

    /**
     * Record a system/user activity footprint
     */
    public static function record(
        string|array $category,
        string $action = 'UNKNOWN_ACTION',
        ?array $user = null,
        ?string $serviceType = null,
        ?string $reference = null,
        ?string $provider = null,
        string $status = 'successful',
        ?float $amount = null,
        ?string $errorMessage = null,
        ?array $metadata = null,
        ?string $ipAddress = null,
        ?string $userAgent = null
    ): string {
        self::ensureTable();

        if (is_array($category)) {
            $p = $category;
            $cat = (string)($p['category'] ?? 'service');
            $act = (string)($p['action'] ?? 'ACTION');
            $userId = $p['user_id'] ?? ($p['user']['id'] ?? null);
            $userEmail = $p['user_email'] ?? ($p['user']['email'] ?? null);
            $userName = $p['user_name'] ?? ($p['user']['full_name'] ?? ($p['user']['name'] ?? null));
            $stype = $p['service_type'] ?? null;
            $ref = $p['reference'] ?? null;
            $prov = $p['provider'] ?? null;
            $stat = (string)($p['status'] ?? 'successful');
            $amt = isset($p['amount']) ? (float)$p['amount'] : null;
            $err = $p['error_message'] ?? null;
            $meta = $p['metadata'] ?? null;
            $ip = $p['ip_address'] ?? null;
            $ua = $p['user_agent'] ?? null;
        } else {
            $cat = $category;
            $act = $action;
            $userId = $user['id'] ?? null;
            $userEmail = $user['email'] ?? null;
            $userName = $user['full_name'] ?? ($user['name'] ?? null);
            $stype = $serviceType;
            $ref = $reference;
            $prov = $provider;
            $stat = $status;
            $amt = $amount;
            $err = $errorMessage;
            $meta = $metadata;
            $ip = $ipAddress;
            $ua = $userAgent;
        }

        $id = 'fp_' . Security::generateUuid();

        // Auto-detect IP and User-Agent if not supplied
        if ($ip === null) {
            $ip = self::getClientIp();
        }
        if ($ua === null) {
            $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown Agent';
        }

        $userAgentTruncated = mb_substr((string)$ua, 0, 500);
        $deviceInfo = self::parseDevice((string)$ua);
        $browserInfo = self::parseBrowser((string)$ua);

        // Sanitize metadata to never store passwords, pins, tokens, or card details
        $sanitizedMetadata = self::sanitizeMetadata($meta);

        try {
            $db = self::getDb();
            $db->execute(
                'INSERT INTO activity_footprints 
                 (id, user_id, user_email, user_name, category, action, service_type, reference, provider, status, amount, error_message, metadata, ip_address, user_agent, device_info, browser_info, created_at)
                 VALUES 
                 (:id, :uid, :email, :name, :cat, :act, :stype, :ref, :prov, :st, :amt, :err, :meta, :ip, :ua, :dev, :brow, NOW())',
                [
                    'id' => $id,
                    'uid' => $userId,
                    'email' => $userEmail,
                    'name' => $userName,
                    'cat' => $cat,
                    'act' => $act,
                    'stype' => $stype,
                    'ref' => $ref,
                    'prov' => $prov,
                    'st' => in_array($stat, ['pending', 'processing', 'successful', 'failed'], true) ? $stat : 'successful',
                    'amt' => $amt !== null ? number_format($amt, 2, '.', '') : null,
                    'err' => $err,
                    'meta' => $sanitizedMetadata ? json_encode($sanitizedMetadata) : null,
                    'ip' => mb_substr((string)$ip, 0, 50),
                    'ua' => $userAgentTruncated,
                    'dev' => $deviceInfo,
                    'brow' => $browserInfo,
                ]
            );
        } catch (Throwable $e) {
            error_log('[FootprintService::record] ' . $e->getMessage());
        }

        return $id;
    }

    /**
     * Extract client IP address safely
     */
    private static function getClientIp(): string
    {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_CLIENT_IP',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR'
        ];

        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ips = explode(',', (string)$_SERVER[$header]);
                $ip = trim($ips[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return '127.0.0.1';
    }

    /**
     * Parse device and operating system from User-Agent
     */
    public static function parseDevice(string $ua): string
    {
        if (preg_match('/iPhone|iPad|iPod/i', $ua)) {
            return 'iOS Mobile';
        }
        if (preg_match('/Android/i', $ua)) {
            return preg_match('/Mobile/i', $ua) ? 'Android Mobile' : 'Android Tablet';
        }
        if (preg_match('/Windows NT 10.0/i', $ua)) {
            return 'Windows 10/11 Desktop';
        }
        if (preg_match('/Windows/i', $ua)) {
            return 'Windows PC';
        }
        if (preg_match('/Macintosh|Mac OS X/i', $ua)) {
            return 'macOS Desktop';
        }
        if (preg_match('/Linux/i', $ua)) {
            return 'Linux Workstation';
        }
        if (preg_match('/CrOS/i', $ua)) {
            return 'ChromeOS';
        }
        return 'Desktop / Unknown Device';
    }

    /**
     * Parse browser name from User-Agent
     */
    public static function parseBrowser(string $ua): string
    {
        if (preg_match('/Edg\/([0-9\.]+)/i', $ua, $m)) {
            return 'Microsoft Edge ' . explode('.', $m[1])[0];
        }
        if (preg_match('/Chrome\/([0-9\.]+)/i', $ua, $m) && !preg_match('/Edg/i', $ua)) {
            return 'Google Chrome ' . explode('.', $m[1])[0];
        }
        if (preg_match('/Safari\/([0-9\.]+)/i', $ua, $m) && !preg_match('/Chrome/i', $ua)) {
            return 'Apple Safari';
        }
        if (preg_match('/Firefox\/([0-9\.]+)/i', $ua, $m)) {
            return 'Mozilla Firefox ' . explode('.', $m[1])[0];
        }
        if (preg_match('/Opera|OPR\/([0-9\.]+)/i', $ua, $m)) {
            return 'Opera Browser';
        }
        return 'Standard Web Browser';
    }

    /**
     * Strips all passwords, credentials, tokens, pins, card numbers
     */
    private static function sanitizeMetadata(?array $data): ?array
    {
        if (!$data) return null;

        $sensitiveKeys = [
            'password', 'password_hash', 'new_password', 'current_password', 'confirm_password',
            'pin', 'transaction_pin', 'transaction_pin_hash', 'secret_key', 'api_key', 'auth_token',
            'token', 'jwt', 'cvv', 'card_number', 'bvn_raw', 'credit_card'
        ];

        $clean = [];
        foreach ($data as $k => $v) {
            $lowerKey = strtolower((string)$k);
            if (in_array($lowerKey, $sensitiveKeys, true)) {
                $clean[$k] = '[REDACTED_SECURITY_POLICY]';
            } elseif (is_array($v)) {
                $clean[$k] = self::sanitizeMetadata($v);
            } else {
                $clean[$k] = $v;
            }
        }
        return $clean;
    }
}
