<?php
/**
 * HambakTech Enterprise - Database Connection Handler (PHP 8.2+ PDO)
 */

declare(strict_types=1);

namespace HambakTech\Config;

use PDO;
use PDOException;
use RuntimeException;

class Database
{
    private static ?PDO $instance = null;

    public static function getConnection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $config = require __DIR__ . '/config.php';
        $db = $config['database'];

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'],
            $db['port'],
            $db['database'],
            $db['charset']
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ];

        try {
            self::$instance = new PDO($dsn, $db['username'], $db['password'], $options);
            return self::$instance;
        } catch (PDOException $e) {
            // In development or when local mysql is absent, throw descriptive runtime exception
            throw new RuntimeException("Database connection error: " . $e->getMessage());
        }
    }

    public static function beginTransaction(): void
    {
        self::getConnection()->beginTransaction();
    }

    public static function commit(): void
    {
        self::getConnection()->commit();
    }

    public static function rollBack(): void
    {
        if (self::getConnection()->inTransaction()) {
            self::getConnection()->rollBack();
        }
    }
}
