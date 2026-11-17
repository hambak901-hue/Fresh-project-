<?php
/**
 * @file backup.php
 * Automated Encrypted MySQL Database Backup Utility (AES-256-GCM)
 */

declare(strict_types=1);

namespace HambakTech\Database;

if (PHP_SAPI !== 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Forbidden: database backup utility cannot be invoked directly over HTTP.']);
    exit(1);
}

if (!defined('HAMBAKTECH_ROOT')) {
    define('HAMBAKTECH_ROOT', dirname(__DIR__));
}
require_once HAMBAKTECH_ROOT . '/core/autoload.php';

use PDO;
use RuntimeException;
use HambakTech\Config\DatabaseConfig;

class BackupManager
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? DatabaseConfig::getConnection();
    }

    private static function resolveBackupKey(): string
    {
        $secret = $_ENV['BACKUP_ENCRYPTION_KEY']
            ?? getenv('BACKUP_ENCRYPTION_KEY')
            ?: ($_ENV['ENCRYPTION_KEY'] ?? getenv('ENCRYPTION_KEY') ?: ($_ENV['JWT_SECRET'] ?? getenv('JWT_SECRET')));

        $appEnv = strtolower(trim((string)($_ENV['APP_ENV'] ?? getenv('APP_ENV') ?: 'production')));
        if (empty($secret)) {
            if ($appEnv === 'testing' && PHP_SAPI === 'cli') {
                $secret = 'test_fixture_only_deterministic_key';
            } else {
                throw new RuntimeException('SECURITY FATAL: BACKUP_ENCRYPTION_KEY or ENCRYPTION_KEY must be configured to create encrypted database backups.');
            }
        }

        return hash('sha256', (string)$secret, true);
    }

    public static function encryptPayload(string $sqlPlaintext): string
    {
        $key = self::resolveBackupKey();
        $compressed = function_exists('gzencode') ? gzencode($sqlPlaintext, 6) : $sqlPlaintext;
        if ($compressed === false) {
            $compressed = $sqlPlaintext;
        }
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt(
            $compressed,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            'HAMBAK_BACKUP_V1',
            16
        );

        if ($ciphertext === false || strlen($tag) !== 16) {
            throw new RuntimeException('Failed to encrypt database backup payload.');
        }

        $envelope = json_encode([
            'v' => 1,
            'alg' => 'aes-256-gcm',
            'compressed' => function_exists('gzencode'),
            'iv' => base64_encode($iv),
            'tag' => base64_encode($tag),
            'ct' => base64_encode($ciphertext),
        ]);

        return "HAMBAK_ENC_V1:" . base64_encode((string)$envelope);
    }

    public static function decryptPayload(string $encryptedContents): string
    {
        if (!str_starts_with($encryptedContents, 'HAMBAK_ENC_V1:')) {
            throw new RuntimeException('Unrecognized encrypted backup format.');
        }
        $rawJson = base64_decode(substr($encryptedContents, strlen('HAMBAK_ENC_V1:')), true);
        $env = $rawJson ? json_decode($rawJson, true) : null;
        if (!is_array($env) || empty($env['iv']) || empty($env['tag']) || empty($env['ct'])) {
            throw new RuntimeException('Corrupted encrypted backup header.');
        }

        $key = self::resolveBackupKey();
        $iv = base64_decode((string)$env['iv'], true);
        $tag = base64_decode((string)$env['tag'], true);
        $ct = base64_decode((string)$env['ct'], true);
        if ($iv === false || $tag === false || $ct === false) {
            throw new RuntimeException('Invalid base64 encoding in encrypted backup.');
        }

        $plain = openssl_decrypt(
            $ct,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            'HAMBAK_BACKUP_V1'
        );
        if ($plain === false) {
            throw new RuntimeException('Encrypted backup authentication failed.');
        }

        if (!empty($env['compressed']) && function_exists('gzdecode')) {
            $decoded = @gzdecode($plain);
            if ($decoded !== false) {
                return $decoded;
            }
        }
        return $plain;
    }

    public static function ensureBackupDirProtection(string $dir): void
    {
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        $htaccessPath = rtrim($dir, '/') . '/.htaccess';
        if (!file_exists($htaccessPath)) {
            @file_put_contents(
                $htaccessPath,
                "Order Deny,Allow\nDeny from all\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\nOptions -Indexes -ExecCGI\n"
            );
        }
    }

    public function buildSqlDump(string $initiatedBy = 'cli'): string
    {
        $tables = $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

        $out = "-- =====================================================================\n";
        $out .= "-- HAMBAKTECH ENTERPRISE PORTAL — ENCRYPTED DATABASE BACKUP\n";
        $out .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
        $out .= "-- Initiated by: " . $initiatedBy . "\n";
        $out .= "-- Server Version: " . $this->pdo->getAttribute(PDO::ATTR_SERVER_VERSION) . "\n";
        $out .= "-- =====================================================================\n\n";
        $out .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";

        foreach ($tables as $table) {
            $safeTable = str_replace('`', '', (string)$table);
            $createRow = $this->pdo->query("SHOW CREATE TABLE `{$safeTable}`")->fetch(PDO::FETCH_ASSOC);
            if (!$createRow || !isset($createRow['Create Table'])) {
                continue;
            }
            $out .= "DROP TABLE IF EXISTS `{$safeTable}`;\n";
            $out .= $createRow['Create Table'] . ";\n\n";

            $rows = $this->pdo->query("SELECT * FROM `{$safeTable}`")->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($rows)) {
                $columns = array_keys($rows[0]);
                $escapedColumns = array_map(fn($c) => "`" . str_replace('`', '', (string)$c) . "`", $columns);

                foreach ($rows as $row) {
                    $values = array_map(function ($val) {
                        if ($val === null) {
                            return 'NULL';
                        }
                        return $this->pdo->quote((string)$val);
                    }, array_values($row));

                    $out .= "INSERT INTO `{$safeTable}` (" . implode(', ', $escapedColumns) . ") VALUES (" . implode(', ', $values) . ");\n";
                }
                $out .= "\n";
            }
        }

        $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";
        return $out;
    }

    public function backup(string $destinationFile, string $initiatedBy = 'cli'): bool
    {
        if (!str_ends_with($destinationFile, '.enc')) {
            $destinationFile .= '.enc';
        }

        $sqlDump = $this->buildSqlDump($initiatedBy);
        $encryptedPayload = self::encryptPayload($sqlDump);

        $dir = dirname($destinationFile);
        self::ensureBackupDirProtection($dir);

        $res = file_put_contents($destinationFile, $encryptedPayload, LOCK_EX);
        if ($res !== false) {
            @chmod($destinationFile, 0600);
            return true;
        }
        return false;
    }
}

if (PHP_SAPI === 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    $target = HAMBAKTECH_ROOT . '/storage/backups/hambaktech_backup_' . date('Ymd_His') . '.sql.enc';
    $bm = new BackupManager();
    if ($bm->backup($target, 'cli')) {
        echo "Encrypted backup saved successfully to {$target}." . PHP_EOL;
    } else {
        fwrite(STDERR, "Failed to write encrypted backup file to {$target}.\n");
        exit(1);
    }
}
