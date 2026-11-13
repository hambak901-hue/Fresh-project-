<?php
/**
 * @file SystemController.php
 * System Health, Schema Sync, Diagnostics, Public Rates & cPanel Controller
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Auth;
use HambakTech\Core\SchemaSync;

class SystemController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function health(Request $request): void
    {
        $dbStatus = 'healthy';
        $dbVersion = 'unknown';

        try {
            $row = $this->db->fetchOne('SELECT VERSION() as ver');
            $dbVersion = $row['ver'] ?? 'connected';
        } catch (Throwable $e) {
            $dbStatus = 'error: ' . $e->getMessage();
        }

        Response::success([
            'service' => 'HAMBAK TECH & SERVICES API',
            'engine' => 'PHP ' . PHP_VERSION,
            'database' => [
                'status' => $dbStatus,
                'version' => $dbVersion,
                'driver' => 'pdo_mysql',
            ],
            'server_time' => date('c'),
        ]);
    }

    public function status(Request $request): void
    {
        Response::success([
            'service' => 'HAMBAK TECH & SERVICES API',
            'status' => 'ONLINE',
            'timestamp' => date('c'),
        ]);
    }

    public function settings(Request $request): void
    {
        $bankRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_bank"');
        $accNumRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_account_number"');
        $accNameRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_account_name"');

        $settings = [
            'nin_fee' => 200,
            'bvn_fee' => 250,
            'mtn_sme_1gb' => 270,
            'airtel_1gb' => 290,
            'glo_1gb' => 260,
            'nine_mobile_1gb' => 250,
            'airtime_discount_percent' => 2.5,
            'maintenance_mode' => false,
            'bank_transfer_account_name' => $accNameRow['setting_value'] ?? 'Hambaktech_Services',
            'bank_transfer_bank' => $bankRow['setting_value'] ?? 'Moniepoint MFB',
            'bank_transfer_account_number' => $accNumRow['setting_value'] ?? '5210471634',
            'company_name' => 'HAMBAK TECH & SERVICES',
            'brand_name' => 'HAMBAKTECH',
            'business_reg_number' => 'BN 9284726',
            'whatsapp_number' => '09155104724',
            'business_phone' => '08147837664',
            'support_phone' => '09127469686',
            'support_email' => 'support@hambaktech.com.ng',
            'info_email' => 'info@hambaktech.com.ng',
            'office_address' => 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
        ];

        try {
            $user = Auth::user($request);
            if ($user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true)) {
                $verRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_verification_provider"');
                $telRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_telecom_provider"');
                $gwRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_payment_gateway"');
                $settings['active_verification_provider'] = $verRow['setting_value'] ?? 'veripine';
                $settings['active_telecom_provider'] = $telRow['setting_value'] ?? 'ulamadata';
                $settings['active_payment_gateway'] = $gwRow['setting_value'] ?? 'paystack';
            }
        } catch (Throwable) {
        }

        Response::success(['settings' => $settings]);
    }

    /**
     * GET /api/system/rates (Public)
     */
    public function rates(Request $request): void
    {
        $services = [];
        try {
            $services = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.selling_price as price, c.code as category
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
            foreach ($services as &$s) {
                $s['price'] = (float)$s['price'];
            }
        } catch (Throwable) {
        }

        $dataPlans = [];
        try {
            $dataPlans = $this->db->fetchAll(
                'SELECT id, network, name, size, plan_type, validity, price FROM telecom_plans WHERE is_active = 1 ORDER BY network ASC, price ASC LIMIT 40'
            );
            foreach ($dataPlans as &$p) {
                $p['price'] = (float)$p['price'];
            }
        } catch (Throwable) {
        }

        Response::success([
            'rates' => [
                'identity' => $services,
                'data_plans' => $dataPlans,
                'airtime_discount_percent' => 2.5,
            ],
        ]);
    }

    /**
     * POST /api/system/sync-schema (Super Admin / Admin)
     */
    public function syncSchema(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $result = SchemaSync::sync($this->db);
        Response::success($result, 'Database schema synchronized successfully.');
    }

    /**
     * POST /api/system/test-smtp (Admin)
     */
    public function testSmtp(Request $request): void
    {
        $admin = new AdminController();
        $admin->testSmtpConnection($request);
    }

    public function cpanelDiagnostics(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $extensions = [
            'pdo' => extension_loaded('pdo'),
            'pdo_mysql' => extension_loaded('pdo_mysql'),
            'curl' => extension_loaded('curl'),
            'mbstring' => extension_loaded('mbstring'),
            'openssl' => extension_loaded('openssl'),
            'json' => extension_loaded('json'),
            'fileinfo' => extension_loaded('fileinfo'),
        ];

        $tables = $this->db->fetchAll('SHOW TABLES');

        Response::success([
            'cpanel_compatibility' => '100% Ready',
            'php_version' => PHP_VERSION,
            'extensions' => $extensions,
            'tables_count' => count($tables),
            'node_dependency_in_prod' => false,
        ]);
    }

    /**
     * GET /api/cpanel/info (Admin)
     */
    public function cpanelInfo(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $tables = $this->db->fetchAll('SHOW TABLES');
        Response::success([
            'server' => [
                'php_version' => PHP_VERSION,
                'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Apache/LiteSpeed',
                'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? HAMBAKTECH_ROOT,
                'database_driver' => 'pdo_mysql',
                'tables_count' => count($tables),
                'memory_limit' => ini_get('memory_limit'),
                'upload_max_filesize' => ini_get('upload_max_filesize'),
            ],
            'environment' => 'production',
        ]);
    }

    /**
     * POST /api/cpanel/test-sftp (Admin)
     */
    public function testSftp(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $host = trim((string)($request->input('host') ?? getenv('FTP_HOST') ?: 'mail.hambaktech.com.ng'));
        $port = (int)($request->input('port') ?? 21);
        $start = microtime(true);
        $errno = 0;
        $errstr = '';
        $conn = @fsockopen($host, $port, $errno, $errstr, 5);
        $latency = (int)round((microtime(true) - $start) * 1000);

        if (!$conn) {
            Response::error("Unable to reach {$host}:{$port} ({$errstr})", 502);
        }
        $banner = fgets($conn, 256) ?: '';
        fclose($conn);

        Response::success([
            'connectionDetails' => [
                'host' => $host,
                'port' => $port,
                'latency_ms' => $latency,
                'banner' => trim($banner),
                'writable_storage' => is_writable(HAMBAKTECH_ROOT),
            ],
        ], "Remote transfer endpoint {$host}:{$port} reachable ({$latency}ms).");
    }

    /**
     * GET /api/cpanel/export-package (Admin)
     */
    public function exportPackage(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        Response::success([
            'package' => [
                'backend_root' => HAMBAKTECH_ROOT,
                'schema_sync_endpoint' => '/api/system/sync-schema',
                'php_version' => PHP_VERSION,
                'generated_at' => date('c'),
            ],
        ], 'Deployment manifest generated.');
    }

    public function initDatabase(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $schemaFile = HAMBAKTECH_ROOT . '/database/schema.sql';
        $seedFile = HAMBAKTECH_ROOT . '/database/seed.sql';

        $pdo = \HambakTech\Config\DatabaseConfig::getConnection();
        $executed = [];
        if (file_exists($schemaFile)) {
            $pdo->exec(file_get_contents($schemaFile));
            $executed[] = 'schema.sql';
        }
        if (file_exists($seedFile)) {
            $pdo->exec(file_get_contents($seedFile));
            $executed[] = 'seed.sql';
        }
        $sync = SchemaSync::sync($this->db);
        Response::success([
            'message' => 'Database tables, seeds, and SchemaSync applied.',
            'executed' => $executed,
            'sync' => $sync,
        ]);
    }
}
