<?php
/**
 * @file backup.php
 * Automated MySQL Database Backup & Dump Utility for cPanel
 */

declare(strict_types=1);

namespace HambakTech\Database;

define('HAMBAKTECH_ROOT', dirname(__DIR__));
require_once HAMBAKTECH_ROOT . '/core/autoload.php';

use PDO;
use Exception;
use HambakTech\Config\DatabaseConfig;

class BackupManager
{
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = DatabaseConfig::getConnection();
    }

    public function backup(string $destinationFile): bool
    {
        echo "Starting MySQL database backup..." . PHP_EOL;
        $tables = $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

        $out = "-- =====================================================================\n";
        $out .= "-- HAMBAKTECH ENTERPRISE PORTAL — AUTOMATED DATABASE BACKUP\n";
        $out .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
        $out .= "-- Server Version: " . $this->pdo->getAttribute(PDO::ATTR_SERVER_VERSION) . "\n";
        $out .= "-- =====================================================================\n\n";
        $out .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";

        foreach ($tables as $table) {
            // Table Create DDL
            $createRow = $this->pdo->query("SHOW CREATE TABLE `{$table}`")->fetch();
            $out .= "DROP TABLE IF EXISTS `{$table}`;\n";
            $out .= $createRow['Create Table'] . ";\n\n";

            // Table Data
            $rows = $this->pdo->query("SELECT * FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($rows)) {
                $columns = array_keys($rows[0]);
                $escapedColumns = array_map(fn($c) => "`{$c}`", $columns);

                foreach ($rows as $row) {
                    $values = array_map(function ($val) {
                        if ($val === null) return 'NULL';
                        return $this->pdo->quote((string)$val);
                    }, array_values($row));

                    $out .= "INSERT INTO `{$table}` (" . implode(', ', $escapedColumns) . ") VALUES (" . implode(', ', $values) . ");\n";
                }
                $out .= "\n";
            }
        }

        $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";

        $dir = dirname($destinationFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $res = file_put_contents($destinationFile, $out);
        if ($res !== false) {
            echo "Backup saved successfully to {$destinationFile} (" . round(strlen($out) / 1024, 2) . " KB)." . PHP_EOL;
            return true;
        } else {
            echo "Failed to write backup file to {$destinationFile}." . PHP_EOL;
            return false;
        }
    }
}

if (php_sapi_name() === 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    $target = HAMBAKTECH_ROOT . '/storage/backups/hambaktech_backup_' . date('Ymd_His') . '.sql';
    $bm = new BackupManager();
    $bm->backup($target);
}
