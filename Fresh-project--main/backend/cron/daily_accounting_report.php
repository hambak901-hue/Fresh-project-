<?php
/**
 * @file daily_accounting_report.php
 * Scheduled cPanel Cron Entry Point for HAMBAKTECH Daily 12:00 PM Africa/Lagos Financial Report.
 * Dispatches Previous Day Final + Current Day (00:00 - 11:59 AM WAT) accounting brief once per day.
 */

declare(strict_types=1);

define('HAMBAKTECH_ROOT', dirname(__DIR__));
require_once HAMBAKTECH_ROOT . '/core/autoload.php';

use HambakTech\Core\Database;
use HambakTech\Services\AccountingService;

$isCli = (php_sapi_name() === 'cli');

if (!$isCli) {
    $providedToken = (string)($_SERVER['HTTP_X_CRON_TOKEN'] ?? ($_GET['token'] ?? ''));
    try {
        $serviceCheck = new AccountingService(Database::getInstance());
        $cfg = $serviceCheck->getConfig();
        $expectedToken = (string)($cfg['cron_secret_token'] ?? '');
        if ($expectedToken === '' || $providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Forbidden. CLI cron execution required.']);
            exit(1);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Cron bootstrap error.']);
        exit(1);
    }
}

try {
    $db = Database::getInstance();
    $service = new AccountingService($db);
    $force = $isCli && in_array('--force', $argv ?? [], true);
    $result = $service->dispatchDailyMiddayReport($force, 'cron');

    $summary = [
        'timestamp_lagos' => $service->lagosNow()->format('Y-m-d H:i:s') . ' WAT',
        'success' => !empty($result['success']),
        'skipped' => !empty($result['skipped']),
        'report_key' => $result['report_key'] ?? null,
        'recipients' => $result['recipients'] ?? [],
        'reason' => $result['reason'] ?? null,
        'error' => $result['error'] ?? null,
    ];

    if (!$isCli) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($summary, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(!empty($result['success']) ? 0 : 1);
} catch (Throwable $e) {
    fwrite(STDERR, '[daily_accounting_report] Error: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
