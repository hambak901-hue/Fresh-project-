<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;

/**
 * Audit and Security Event Logger
 * 
 * Provides centralized, tamper-resistant logging for administrative actions,
 * privilege checks, authentication events, and critical security operations.
 * Sensitive information (passwords, tokens, API secrets) is strictly redacted.
 */
class AuditService
{
    private static ?AuditService $instance = null;
    private Database $db;

    private function __construct()
    {
        $this->db = Database::getInstance();
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Redact sensitive fields from data array
     */
    public static function sanitizeDetails(array $data): array
    {
        $sensitiveKeys = [
            'password', 'passwordHash', 'password_hash', 'currentPassword', 'newPassword',
            'token', 'sessionToken', 'session_token', 'apiKey', 'apiKeyEncrypted',
            'apiSecret', 'apiSecretEncrypted', 'webhookSecret', 'webhookSecretEncrypted',
            'secret', 'authorization', 'bearer', 'cookie', 'creditCard', 'cvv'
        ];

        $cleaned = [];
        foreach ($data as $k => $v) {
            $lowerKey = strtolower((string)$k);
            $isSensitive = false;
            foreach ($sensitiveKeys as $sensitive) {
                if (str_contains($lowerKey, strtolower($sensitive))) {
                    $isSensitive = true;
                    break;
                }
            }

            if ($isSensitive) {
                $cleaned[$k] = '[REDACTED_SECRET]';
            } elseif (is_array($v)) {
                $cleaned[$k] = self::sanitizeDetails($v);
            } else {
                $cleaned[$k] = $v;
            }
        }
        return $cleaned;
    }

    /**
     * Record an action in the AuditLog table
     */
    public function log(
        string $action,
        string $module,
        ?string $userId = null,
        ?string $entity = null,
        ?string $entityId = null,
        array $details = [],
        string $status = 'SUCCESS',
        string $ipAddress = '127.0.0.1'
    ): void {
        try {
            $sanitized = self::sanitizeDetails($details);
            $id = 'aud-' . bin2hex(random_bytes(16));
            $conn = $this->db->getConnection();

            // Guard foreign key constraint on User.id
            if ($userId !== null) {
                $uChk = $conn->prepare('SELECT 1 FROM `User` WHERE `id` = :uid LIMIT 1');
                $uChk->execute([':uid' => $userId]);
                if (!$uChk->fetchColumn()) {
                    $sanitized['_originalUserId'] = $userId;
                    $userId = null;
                }
            }
            
            $stmt = $conn->prepare(
                'INSERT INTO `AuditLog` (`id`, `userId`, `action`, `entity`, `entityId`, `module`, `ipAddress`, `details`, `status`, `createdAt`)
                 VALUES (:id, :userId, :action, :entity, :entityId, :module, :ipAddress, :details, :status, NOW(3))'
            );

            $stmt->execute([
                ':id'        => $id,
                ':userId'    => $userId,
                ':action'    => strtoupper($action),
                ':entity'    => $entity,
                ':entityId'  => $entityId,
                ':module'    => strtoupper($module),
                ':ipAddress' => substr($ipAddress, 0, 45),
                ':details'   => json_encode($sanitized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ':status'    => strtoupper($status),
            ]);
        } catch (\Throwable $e) {
            error_log('[AuditService Log Error] ' . $e->getMessage());
        }
    }

    /**
     * Record a security event in the SecurityEvent table
     */
    public function logSecurityEvent(
        string $eventType,
        string $severity = 'LOW', // LOW, MEDIUM, HIGH, CRITICAL
        ?string $userId = null,
        array $details = [],
        string $ipAddress = '127.0.0.1',
        string $userAgent = 'System'
    ): void {
        try {
            $sanitized = self::sanitizeDetails($details);
            $id = 'sec-' . bin2hex(random_bytes(16));
            $conn = $this->db->getConnection();

            $stmt = $conn->prepare(
                'INSERT INTO `SecurityEvent` (`id`, `userId`, `eventType`, `ipAddress`, `userAgent`, `severity`, `detailsJson`, `createdAt`)
                 VALUES (:id, :userId, :eventType, :ipAddress, :userAgent, :severity, :detailsJson, NOW(3))'
            );

            $stmt->execute([
                ':id'          => $id,
                ':userId'      => $userId,
                ':eventType'   => strtoupper($eventType),
                ':ipAddress'   => substr($ipAddress, 0, 45),
                ':userAgent'   => substr($userAgent, 0, 255),
                ':severity'    => strtoupper($severity),
                ':detailsJson' => json_encode($sanitized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]);
        } catch (\Throwable $e) {
            error_log('[AuditService SecurityEvent Error] ' . $e->getMessage());
        }
    }
}
