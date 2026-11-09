<?php
/**
 * @file database.php
 * Production Database Connection Factory
 * Standard PDO with UTF-8 mb4, Strict Error Exceptions & Connection Pooling
 */

declare(strict_types=1);

namespace HambakTech\Config;

use PDO;
use PDOException;
use RuntimeException;

class DatabaseConfig
{
    private static ?PDO $connection = null;

    public static function getConnection(): PDO
    {
        if (self::$connection !== null) {
            return self::$connection;
        }

        $config = require __DIR__ . '/config.php';
        $db = $config['database'];

        $dsn = sprintf(
            '%s:host=%s;port=%d;dbname=%s;charset=%s',
            $db['driver'],
            $db['host'],
            $db['port'],
            $db['database'],
            $db['charset']
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => true,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, sql_mode='STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'",
            PDO::ATTR_TIMEOUT => 5,
        ];

        try {
            self::$connection = new PDO($dsn, $db['username'], $db['password'], $options);
            return self::$connection;
        } catch (PDOException $e) {
            error_log('[HambakTech DB Connection Failed]: ' . $e->getMessage());
            throw new RuntimeException('Database service temporarily unavailable. Please verify MariaDB/MySQL credentials.', 500, $e);
        }
    }
}
