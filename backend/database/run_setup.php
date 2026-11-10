<?php
declare(strict_types=1);

/**
 * Database Initializer & Migration Runner for cPanel
 */

define('HAMBAKTECH_ROOT', dirname(__DIR__));
require_once HAMBAKTECH_ROOT . '/core/autoload.php';

use HambakTech\Config\DatabaseConfig;

header('Content-Type: application/json');

// Security key check
$token = $_GET['setup_key'] ?? '';
if ($token !== 'hambak_install_2026_secure') {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized setup execution']);
    exit;
}

try {
    $pdo = DatabaseConfig::getConnection();
    $schemaFile = __DIR__ . '/schema.sql';
    $seedFile = __DIR__ . '/seed.sql';

    $results = [];

    if (file_exists($schemaFile)) {
        $sql = file_get_contents($schemaFile);
        $pdo->exec($sql);
        $results['schema'] = 'Executed successfully';
    }

    if (file_exists($seedFile)) {
        $sql = file_get_contents($seedFile);
        $pdo->exec($sql);
        $results['seed'] = 'Executed successfully';
    }

    // Run Migrator if available
    if (file_exists(__DIR__ . '/migrate.php')) {
        // Run migration logic
        require_once __DIR__ . '/migrate.php';
        $results['migration'] = 'Migrator executed';
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'HambakTech cPanel database successfully provisioned and seeded',
        'results' => $results
    ], JSON_PRETTY_PRINT);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage(),
        'trace' => $e->getFile() . ':' . $e->getLine()
    ], JSON_PRETTY_PRINT);
}
