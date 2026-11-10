<?php
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

define('HAMBAKTECH_ROOT', __DIR__);
require_once __DIR__ . '/core/autoload.php';

use HambakTech\Config\DatabaseConfig;

try {
    $pdo = DatabaseConfig::getConnection();
    echo "DB_CONNECTED\n";

    // 1. Run Schema
    $schemaFile = __DIR__ . '/database/schema.sql';
    if (file_exists($schemaFile)) {
        $sql = file_get_contents($schemaFile);
        $pdo->exec($sql);
        echo "SCHEMA_EXECUTED\n";
    }

    // 2. Run Seed
    $seedFile = __DIR__ . '/database/seed.sql';
    if (file_exists($seedFile)) {
        $sql = file_get_contents($seedFile);
        $pdo->exec($sql);
        echo "SEED_EXECUTED\n";
    }

    echo "SETUP_SUCCESS\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine() . "\n";
}
