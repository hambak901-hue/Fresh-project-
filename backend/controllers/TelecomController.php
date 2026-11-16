<?php
/**
 * @file TelecomController.php
 * Production Telecommunications & VTU Controller
 * Target: cPanel PHP 8.2+ / MySQL 8.x
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Exception;
use Throwable;
use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;
use HambakTech\Adapters\Telecom\TelecomAdapterInterface;
use HambakTech\Adapters\Telecom\UlamaDataAdapter;
use HambakTech\Adapters\Telecom\VtpassAdapter;

class TelecomController
{
    private Database $db;
    private WalletService $walletService;
    private TelecomAdapterInterface $adapter;
    private string $activeProviderId;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
        $this->activeProviderId = $this->resolveActiveProviderId();
        $this->adapter = ($this->activeProviderId === 'vtpass') ? new VtpassAdapter() : new UlamaDataAdapter();
    }

    private function resolveActiveProviderId(): string
    {
        try {
            $setting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_telecom_provider"');
            if ($setting && !empty($setting['setting_value'])) {
                $val = strtolower(trim((string)$setting['setting_value']));
                if (in_array($val, ['ulamadata', 'vtpass'], true)) {
                    return $val;
                }
            }
            $defaultRow = $this->db->fetchOne('SELECT id FROM providers WHERE provider_type = "telecom" AND is_default = 1 AND is_active = 1 LIMIT 1');
            if ($defaultRow && !empty($defaultRow['id'])) {
                $val = strtolower(trim((string)$defaultRow['id']));
                if (in_array($val, ['ulamadata', 'vtpass'], true)) {
                    return $val;
                }
            }
        } catch (Throwable) {
        }
        return 'ulamadata';
    }

    private function logFootprint(array $user, string $serviceType, string $action, string $ref, float $amount, string $status, ?string $provider = 'ulamadata', ?string $error = null, ?array $meta = []): void
    {
        try {
            FootprintService::record([
                'user_id' => $user['id'] ?? null,
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => $action,
                'service_type' => $serviceType,
                'reference' => $ref,
                'provider' => $provider,
                'status' => $status,
                'amount' => $amount,
                'error_message' => $error,
                'metadata' => $meta,
            ]);
        } catch (\Throwable) {
            // Non-blocking footprint record
        }
    }

    private static bool $schemaChecked = false;

    /**
     * Ensures telecom_plans & telecom_orders support dynamic Ulamadata categories,
     * admin pricing precedence, and duplicate-request idempotency.
     */
    public function ensureDataSchema(): void
    {
        if (self::$schemaChecked) {
            return;
        }
        self::$schemaChecked = true;
        try {
            $cols = $this->db->fetchAll('SHOW COLUMNS FROM telecom_plans');
            $colMap = [];
            foreach ($cols as $c) {
                $colMap[strtolower((string)$c['Field'])] = strtolower((string)$c['Type']);
            }
            if (isset($colMap['plan_type']) && str_starts_with($colMap['plan_type'], 'enum')) {
                $this->db->execute('ALTER TABLE telecom_plans MODIFY COLUMN plan_type VARCHAR(100) NOT NULL DEFAULT "SME"');
            }
            if (isset($colMap['name']) && !str_contains($colMap['name'], '150') && !str_contains($colMap['name'], '200')) {
                $this->db->execute('ALTER TABLE telecom_plans MODIFY COLUMN name VARCHAR(150) NOT NULL');
            }
            $addCols = [
                'pricing_mode' => 'ALTER TABLE telecom_plans ADD COLUMN pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup" AFTER price',
                'fixed_price' => 'ALTER TABLE telecom_plans ADD COLUMN fixed_price DECIMAL(15,2) NULL AFTER pricing_mode',
                'markup_percent' => 'ALTER TABLE telecom_plans ADD COLUMN markup_percent DECIMAL(8,2) NULL AFTER fixed_price',
                'discount_percent' => 'ALTER TABLE telecom_plans ADD COLUMN discount_percent DECIMAL(8,2) NULL AFTER markup_percent',
                'admin_price_locked' => 'ALTER TABLE telecom_plans ADD COLUMN admin_price_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_percent',
                'network_id' => 'ALTER TABLE telecom_plans ADD COLUMN network_id INT NULL AFTER network',
            ];
            foreach ($addCols as $colName => $ddl) {
                if (!isset($colMap[$colName])) {
                    try {
                        $this->db->execute($ddl);
                    } catch (Throwable) {
                    }
                }
            }

            $orderCols = $this->db->fetchAll('SHOW COLUMNS FROM telecom_orders');
            $orderMap = [];
            foreach ($orderCols as $c) {
                $orderMap[strtolower((string)$c['Field'])] = true;
            }
            if (!isset($orderMap['idempotency_key'])) {
                try {
                    $this->db->execute('ALTER TABLE telecom_orders ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER provider_ref, ADD INDEX idx_to_idem (user_id, idempotency_key)');
                } catch (Throwable) {
                }
            }

            // Stage 5 Phase 2: Upgrade airtime_pin_denominations
            try {
                $apinCols = $this->db->fetchAll('SHOW COLUMNS FROM airtime_pin_denominations');
                $apinMap = [];
                foreach ($apinCols as $c) {
                    $apinMap[strtolower((string)$c['Field'])] = strtolower((string)$c['Type']);
                }
                $apinAdds = [
                    'provider_plan_id' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN provider_plan_id INT NULL AFTER id',
                    'network_id' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN network_id INT NULL AFTER network',
                    'api_discount' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN api_discount DECIMAL(8,2) NOT NULL DEFAULT 0.00 AFTER wholesale_cost',
                    'available_stock' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN available_stock INT NOT NULL DEFAULT 0 AFTER api_discount',
                    'max_quantity' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN max_quantity INT NOT NULL DEFAULT 50 AFTER available_stock',
                    'pricing_mode' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup" AFTER price',
                    'fixed_price' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN fixed_price DECIMAL(15,2) NULL AFTER pricing_mode',
                    'markup_percent' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN markup_percent DECIMAL(8,2) NULL AFTER fixed_price',
                    'discount_percent' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN discount_percent DECIMAL(8,2) NULL AFTER markup_percent',
                    'admin_price_locked' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN admin_price_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_percent',
                    'provider_id' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata" AFTER admin_price_locked',
                    'updated_at' => 'ALTER TABLE airtime_pin_denominations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active',
                ];
                foreach ($apinAdds as $colName => $ddl) {
                    if (!isset($apinMap[$colName])) {
                        try {
                            $this->db->execute($ddl);
                        } catch (Throwable) {
                        }
                    }
                }
            } catch (Throwable) {
            }

            // Stage 5 Phase 2: Upgrade data_pin_denominations
            try {
                $dpinCols = $this->db->fetchAll('SHOW COLUMNS FROM data_pin_denominations');
                $dpinMap = [];
                foreach ($dpinCols as $c) {
                    $dpinMap[strtolower((string)$c['Field'])] = strtolower((string)$c['Type']);
                }
                if (isset($dpinMap['name']) && !str_contains($dpinMap['name'], '150')) {
                    try {
                        $this->db->execute('ALTER TABLE data_pin_denominations MODIFY COLUMN name VARCHAR(150) NOT NULL');
                    } catch (Throwable) {
                    }
                }
                $dpinAdds = [
                    'provider_plan_id' => 'ALTER TABLE data_pin_denominations ADD COLUMN provider_plan_id INT NULL AFTER id',
                    'network_id' => 'ALTER TABLE data_pin_denominations ADD COLUMN network_id INT NULL AFTER network',
                    'validity' => 'ALTER TABLE data_pin_denominations ADD COLUMN validity VARCHAR(50) NOT NULL DEFAULT "30 Days" AFTER size',
                    'plan_type' => 'ALTER TABLE data_pin_denominations ADD COLUMN plan_type VARCHAR(100) NULL AFTER validity',
                    'available_stock' => 'ALTER TABLE data_pin_denominations ADD COLUMN available_stock INT NOT NULL DEFAULT 0 AFTER wholesale_cost',
                    'max_quantity' => 'ALTER TABLE data_pin_denominations ADD COLUMN max_quantity INT NOT NULL DEFAULT 50 AFTER available_stock',
                    'pricing_mode' => 'ALTER TABLE data_pin_denominations ADD COLUMN pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup" AFTER price',
                    'fixed_price' => 'ALTER TABLE data_pin_denominations ADD COLUMN fixed_price DECIMAL(15,2) NULL AFTER pricing_mode',
                    'markup_percent' => 'ALTER TABLE data_pin_denominations ADD COLUMN markup_percent DECIMAL(8,2) NULL AFTER fixed_price',
                    'discount_percent' => 'ALTER TABLE data_pin_denominations ADD COLUMN discount_percent DECIMAL(8,2) NULL AFTER markup_percent',
                    'admin_price_locked' => 'ALTER TABLE data_pin_denominations ADD COLUMN admin_price_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_percent',
                    'provider_id' => 'ALTER TABLE data_pin_denominations ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata" AFTER admin_price_locked',
                    'updated_at' => 'ALTER TABLE data_pin_denominations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active',
                ];
                foreach ($dpinAdds as $colName => $ddl) {
                    if (!isset($dpinMap[$colName])) {
                        try {
                            $this->db->execute($ddl);
                        } catch (Throwable) {
                        }
                    }
                }
            } catch (Throwable) {
            }

            // Ensure cable_packages supports UlamaData provider_plan_id & pricing overrides
            try {
                $cabCols = $this->db->fetchAll('SHOW COLUMNS FROM cable_packages');
                $cabMap = [];
                foreach ($cabCols as $c) {
                    $cabMap[strtolower((string)$c['Field'])] = strtolower((string)$c['Type']);
                }
                if (isset($cabMap['name']) && !str_contains($cabMap['name'], '150')) {
                    try { $this->db->execute('ALTER TABLE cable_packages MODIFY COLUMN name VARCHAR(150) NOT NULL'); } catch (Throwable) {}
                }
                $cabAdds = [
                    'provider_plan_id' => 'ALTER TABLE cable_packages ADD COLUMN provider_plan_id INT NULL AFTER id',
                    'cable_id' => 'ALTER TABLE cable_packages ADD COLUMN cable_id INT NULL AFTER provider_plan_id',
                    'pricing_mode' => 'ALTER TABLE cable_packages ADD COLUMN pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup" AFTER price',
                    'fixed_price' => 'ALTER TABLE cable_packages ADD COLUMN fixed_price DECIMAL(15,2) NULL AFTER pricing_mode',
                    'markup_percent' => 'ALTER TABLE cable_packages ADD COLUMN markup_percent DECIMAL(8,2) NULL AFTER fixed_price',
                    'discount_percent' => 'ALTER TABLE cable_packages ADD COLUMN discount_percent DECIMAL(8,2) NULL AFTER markup_percent',
                    'admin_price_locked' => 'ALTER TABLE cable_packages ADD COLUMN admin_price_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_percent',
                    'provider_id' => 'ALTER TABLE cable_packages ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata" AFTER admin_price_locked',
                    'updated_at' => 'ALTER TABLE cable_packages ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active',
                ];
                foreach ($cabAdds as $colName => $ddl) {
                    if (!isset($cabMap[$colName])) {
                        try { $this->db->execute($ddl); } catch (Throwable) {}
                    }
                }
            } catch (Throwable) {}

            // Ensure electricity_discos supports UlamaData provider_disco_id & fee settings
            try {
                $discCols = $this->db->fetchAll('SHOW COLUMNS FROM electricity_discos');
                $discMap = [];
                foreach ($discCols as $c) {
                    $discMap[strtolower((string)$c['Field'])] = strtolower((string)$c['Type']);
                }
                $discAdds = [
                    'provider_disco_id' => 'ALTER TABLE electricity_discos ADD COLUMN provider_disco_id INT NULL AFTER id',
                    'abbreviation' => 'ALTER TABLE electricity_discos ADD COLUMN abbreviation VARCHAR(30) NULL AFTER provider_disco_id',
                    'api_discount' => 'ALTER TABLE electricity_discos ADD COLUMN api_discount DECIMAL(8,2) NOT NULL DEFAULT 0.00 AFTER code',
                    'max_amount' => 'ALTER TABLE electricity_discos ADD COLUMN max_amount DECIMAL(15,2) NOT NULL DEFAULT 500000.00 AFTER minimum_amount',
                    'fee_type' => 'ALTER TABLE electricity_discos ADD COLUMN fee_type VARCHAR(30) NOT NULL DEFAULT "fixed_fee" AFTER max_amount',
                    'convenience_fee' => 'ALTER TABLE electricity_discos ADD COLUMN convenience_fee DECIMAL(15,2) NOT NULL DEFAULT 100.00 AFTER fee_type',
                    'discount_percent' => 'ALTER TABLE electricity_discos ADD COLUMN discount_percent DECIMAL(8,2) NOT NULL DEFAULT 0.00 AFTER convenience_fee',
                    'admin_price_locked' => 'ALTER TABLE electricity_discos ADD COLUMN admin_price_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_percent',
                    'provider_id' => 'ALTER TABLE electricity_discos ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata" AFTER admin_price_locked',
                    'updated_at' => 'ALTER TABLE electricity_discos ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active',
                ];
                foreach ($discAdds as $colName => $ddl) {
                    if (!isset($discMap[$colName])) {
                        try { $this->db->execute($ddl); } catch (Throwable) {}
                    }
                }
            } catch (Throwable) {}

            // Ensure exam_packages supports UlamaData provider_plan_id & pricing overrides
            try {
                $exmCols = $this->db->fetchAll('SHOW COLUMNS FROM exam_packages');
                $exmMap = [];
                foreach ($exmCols as $c) {
                    $exmMap[strtolower((string)$c['Field'])] = strtolower((string)$c['Type']);
                }
                if (isset($exmMap['exam_name']) && str_starts_with($exmMap['exam_name'], 'enum')) {
                    try { $this->db->execute('ALTER TABLE exam_packages MODIFY COLUMN exam_name VARCHAR(50) NOT NULL'); } catch (Throwable) {}
                }
                $exmAdds = [
                    'provider_plan_id' => 'ALTER TABLE exam_packages ADD COLUMN provider_plan_id INT NULL AFTER id',
                    'pricing_mode' => 'ALTER TABLE exam_packages ADD COLUMN pricing_mode VARCHAR(30) NOT NULL DEFAULT "default_markup" AFTER price',
                    'fixed_price' => 'ALTER TABLE exam_packages ADD COLUMN fixed_price DECIMAL(15,2) NULL AFTER pricing_mode',
                    'markup_percent' => 'ALTER TABLE exam_packages ADD COLUMN markup_percent DECIMAL(8,2) NULL AFTER fixed_price',
                    'discount_percent' => 'ALTER TABLE exam_packages ADD COLUMN discount_percent DECIMAL(8,2) NULL AFTER markup_percent',
                    'admin_price_locked' => 'ALTER TABLE exam_packages ADD COLUMN admin_price_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_percent',
                    'max_quantity' => 'ALTER TABLE exam_packages ADD COLUMN max_quantity INT NOT NULL DEFAULT 10 AFTER admin_price_locked',
                    'provider_id' => 'ALTER TABLE exam_packages ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT "ulamadata" AFTER max_quantity',
                    'updated_at' => 'ALTER TABLE exam_packages ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active',
                ];
                foreach ($exmAdds as $colName => $ddl) {
                    if (!isset($exmMap[$colName])) {
                        try { $this->db->execute($ddl); } catch (Throwable) {}
                    }
                }
            } catch (Throwable) {}

            // Stage 5 Phase 2: Ensure telecom_vouchers table exists for protected PIN/Serial storage
            try {
                $this->db->execute(
                    'CREATE TABLE IF NOT EXISTS telecom_vouchers (
                        id VARCHAR(36) PRIMARY KEY,
                        order_id VARCHAR(36) NOT NULL,
                        user_id VARCHAR(36) NOT NULL,
                        service_type ENUM("airtime_pin", "data_pin") NOT NULL,
                        network VARCHAR(30) NOT NULL,
                        denomination_label VARCHAR(80) NOT NULL,
                        face_value DECIMAL(15, 2) NULL,
                        pin_code VARCHAR(120) NOT NULL,
                        serial_number VARCHAR(120) NOT NULL,
                        load_code VARCHAR(100) NULL,
                        check_balance_code VARCHAR(100) NULL,
                        card_name VARCHAR(120) NULL,
                        voucher_index INT NOT NULL DEFAULT 1,
                        provider_ref VARCHAR(100) NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uniq_order_voucher_idx (order_id, voucher_index),
                        UNIQUE KEY uniq_pin_serial_pair (service_type, network, pin_code, serial_number),
                        INDEX idx_tv_user (user_id),
                        INDEX idx_tv_order (order_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
                );
            } catch (Throwable) {
            }
        } catch (Throwable) {
        }
    }

    public static function readAirtimeDiscountPercent(Database $db): float
    {
        try {
            $row = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "airtime_discount_percent"');
            if ($row !== null && $row['setting_value'] !== null && $row['setting_value'] !== '') {
                $val = (float)$row['setting_value'];
                if ($val >= 0 && $val <= 50) {
                    return round($val, 2);
                }
            }
        } catch (Throwable) {
        }
        return 2.5;
    }

    public static function readBulkSmsSettings(Database $db): array
    {
        $defaults = [
            'enabled' => true,
            'unit_price' => 3.50,
            'wholesale_unit_price' => 2.50,
            'max_recipients' => 500,
            'default_sender' => 'HAMBAK',
        ];
        try {
            $rows = $db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("bulksms_enabled", "bulksms_unit_price", "bulksms_wholesale_unit_price", "bulksms_max_recipients", "bulksms_default_sender")'
            );
            foreach ($rows as $row) {
                $k = (string)($row['setting_key'] ?? '');
                $v = $row['setting_value'] ?? null;
                if ($v === null || $v === '') {
                    continue;
                }
                if ($k === 'bulksms_enabled') {
                    $defaults['enabled'] = !in_array(strtolower(trim((string)$v)), ['0', 'false', 'off', 'no', 'disabled'], true);
                } elseif ($k === 'bulksms_unit_price' && is_numeric($v) && (float)$v > 0) {
                    $defaults['unit_price'] = round((float)$v, 2);
                } elseif ($k === 'bulksms_wholesale_unit_price' && is_numeric($v) && (float)$v >= 0) {
                    $defaults['wholesale_unit_price'] = round((float)$v, 2);
                } elseif ($k === 'bulksms_max_recipients' && is_numeric($v) && (int)$v > 0) {
                    $defaults['max_recipients'] = min(5000, max(1, (int)$v));
                } elseif ($k === 'bulksms_default_sender') {
                    $clean = preg_replace('/[^A-Za-z0-9._ -]/', '', trim((string)$v)) ?? '';
                    if ($clean !== '') {
                        $defaults['default_sender'] = substr($clean, 0, 11);
                    }
                }
            }
        } catch (Throwable) {
        }
        return $defaults;
    }

    public static function readAirtimeSwapEnabled(Database $db): bool
    {
        try {
            $row = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "airtime_swap_enabled" LIMIT 1');
            if ($row && $row['setting_value'] !== null && $row['setting_value'] !== '') {
                return !in_array(strtolower(trim((string)$row['setting_value'])), ['0', 'false', 'off', 'no', 'disabled'], true);
            }
        } catch (Throwable) {
        }
        return true;
    }

    private function readSettingFloat(string $key, float $default, float $min = 0.0, float $max = 100.0): float
    {
        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1', ['k' => $key]);
            if ($row && $row['setting_value'] !== null && $row['setting_value'] !== '' && is_numeric($row['setting_value'])) {
                $val = (float)$row['setting_value'];
                if ($val >= $min && $val <= $max) {
                    return round($val, 2);
                }
            }
        } catch (Throwable) {
        }
        return $default;
    }

    private function getAirtimeDiscountPercent(): float
    {
        return self::readAirtimeDiscountPercent($this->db);
    }

    private function extractIdempotencyKey(Request $request): string
    {
        $raw = trim((string)($request->header('x-idempotency-key') ?? $request->input('idempotency_key') ?? $request->input('idempotencyKey') ?? ''));
        return $raw !== '' ? mb_substr($raw, 0, 95) : '';
    }

    private function findIdempotentOrder(string $userId, string $serviceType, string $idempotencyKey): ?array
    {
        if ($idempotencyKey === '') {
            return null;
        }
        try {
            return $this->db->fetchOne(
                'SELECT id, service_type, network, phone, plan, amount, status, provider_ref, metadata, created_at
                 FROM telecom_orders
                 WHERE user_id = :uid AND service_type = :st AND idempotency_key = :ikey AND status IN ("successful", "pending")
                 ORDER BY created_at DESC LIMIT 1',
                ['uid' => $userId, 'st' => $serviceType, 'ikey' => $idempotencyKey]
            );
        } catch (Throwable) {
            return null;
        }
    }

    private function respondExistingOrder(string $userId, array $existingOrder, string $message): void
    {
        $walletRow = $this->db->fetchOne('SELECT wallet_balance FROM users WHERE id = :uid LIMIT 1', ['uid' => $userId]);
        $bal = (float)($walletRow['wallet_balance'] ?? 0);
        $safeRef = 'HT-' . strtoupper(substr(str_replace('-', '', (string)$existingOrder['id']), 0, 10));
        Response::success([
            'order_id' => $existingOrder['id'],
            'reference' => $safeRef,
            'network' => $existingOrder['network'] ?? null,
            'phone' => $existingOrder['phone'],
            'amount' => (float)$existingOrder['amount'],
            'status' => $existingOrder['status'],
            'balance_after' => $bal,
            'newBalance' => $bal,
            'deduplicated' => true,
            'order' => [
                'id' => $existingOrder['id'],
                'reference' => $safeRef,
                'provider_ref' => $safeRef,
                'service' => $existingOrder['service_type'],
                'service_type' => $existingOrder['service_type'],
                'network' => $existingOrder['network'] ?? null,
                'recipient' => $existingOrder['phone'],
                'phone' => $existingOrder['phone'],
                'plan' => $existingOrder['plan'],
                'amount' => (float)$existingOrder['amount'],
                'status' => $existingOrder['status'],
                'created_at' => $existingOrder['created_at'],
            ],
        ], $message);
    }

    private function acquireOrderLock(string $userId, string $serviceType, string $target): string
    {
        $lockName = 'ht_tel_' . hash('sha256', $userId . '|' . $serviceType . '|' . strtolower(trim($target)));
        try {
            $row = $this->db->fetchOne('SELECT GET_LOCK(:k, 3) AS acquired', ['k' => $lockName]);
            if ((int)($row['acquired'] ?? 0) !== 1) {
                Response::error('An identical order request is currently processing. Please wait a few seconds before retrying.', 409);
            }
        } catch (Throwable) {
            return '';
        }
        register_shutdown_function(function () use ($lockName): void {
            $this->releaseOrderLock($lockName);
        });
        return $lockName;
    }

    private function releaseOrderLock(string $lockName): void
    {
        if ($lockName === '') {
            return;
        }
        try {
            $this->db->execute('DO RELEASE_LOCK(:k)', ['k' => $lockName]);
        } catch (Throwable) {
        }
    }

    private function hasRecentDuplicateOrder(string $userId, string $serviceType, string $phone, float $amount, ?string $plan = null, int $windowSeconds = 15): bool
    {
        try {
            $sql = 'SELECT id FROM telecom_orders
                    WHERE user_id = :uid AND service_type = :st AND phone = :ph
                      AND ABS(amount - :amt) < 0.01
                      AND status IN ("successful", "pending")
                      AND created_at >= DATE_SUB(NOW(), INTERVAL :win SECOND)';
            $params = [
                'uid' => $userId,
                'st' => $serviceType,
                'ph' => $phone,
                'amt' => round($amount, 2),
                'win' => max(1, $windowSeconds),
            ];
            if ($plan !== null && $plan !== '') {
                $sql .= ' AND plan = :pl';
                $params['pl'] = $plan;
            }
            $sql .= ' LIMIT 1';
            return (bool)$this->db->fetchOne($sql, $params);
        } catch (Throwable) {
            return false;
        }
    }

    private function verifyWebhookSecretHeader(Request $request, string $raw, string $providerCode, string $envKey): array
    {
        $secret = trim((string)(getenv($envKey) ?: ($_ENV[$envKey] ?? '')));
        if ($secret === '') {
            try {
                $row = $this->db->fetchOne('SELECT webhook_secret FROM providers WHERE id = :id OR code = :code LIMIT 1', [
                    'id' => $providerCode,
                    'code' => $providerCode,
                ]);
                if ($row && !empty($row['webhook_secret'])) {
                    $secret = trim((string)$row['webhook_secret']);
                }
            } catch (Throwable) {
            }
        }

        if ($secret === '') {
            return ['configured' => false, 'authenticated' => false];
        }

        $sigHeader = trim((string)(
            $request->header('x-ulamadata-signature')
            ?? $request->header('x-vtpass-signature')
            ?? $request->header('x-webhook-signature')
            ?? $request->header('x-signature')
            ?? $request->header('x-webhook-secret')
            ?? ''
        ));
        $authHeader = trim((string)($request->header('authorization') ?? ''));
        $bearer = str_starts_with(strtolower($authHeader), 'bearer ') ? trim(substr($authHeader, 7)) : '';
        $expectedHmac = hash_hmac('sha256', $raw, $secret);

        $sigMatched = $sigHeader !== '' && (
            hash_equals($secret, $sigHeader)
            || hash_equals($expectedHmac, strtolower($sigHeader))
            || hash_equals('sha256=' . $expectedHmac, strtolower($sigHeader))
        );
        $bearerMatched = $bearer !== '' && hash_equals($secret, $bearer);

        return ['configured' => true, 'authenticated' => ($sigMatched || $bearerMatched)];
    }

    private function getNetworkPrefixMap(): array
    {
        $fallback = [
            'MTN' => ['0702', '0703', '0704', '0706', '0707', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916'],
            'AIRTEL' => ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0911', '0912'],
            'GLO' => ['0705', '0805', '0807', '0811', '0815', '0905', '0915'],
            '9MOBILE' => ['0809', '0817', '0818', '0908', '0909'],
        ];
        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "ulamadata_network_prefixes"');
            if ($row && !empty($row['setting_value'])) {
                $decoded = json_decode((string)$row['setting_value'], true);
                if (is_array($decoded) && !empty($decoded)) {
                    foreach ($fallback as $net => $pfxs) {
                        $apiPfxs = $decoded[$net]['prefixes'] ?? [];
                        if (is_array($apiPfxs) && !empty($apiPfxs)) {
                            $fallback[$net] = array_values(array_unique(array_merge($apiPfxs, $pfxs)));
                        }
                    }
                    return $fallback;
                }
            }
            if ($this->adapter instanceof UlamaDataAdapter) {
                $nets = $this->adapter->getNetworks('data');
                if (!empty($nets)) {
                    $map = [];
                    foreach ($nets as $n) {
                        $map[$n['network']] = $n;
                        if (!empty($n['prefixes'])) {
                            $fallback[$n['network']] = array_values(array_unique(array_merge($n['prefixes'], $fallback[$n['network']] ?? [])));
                        }
                    }
                    $this->db->execute(
                        'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                         VALUES ("set_ulamadata_prefixes", "ulamadata_network_prefixes", :v, "telecom", "Cached network prefixes")
                         ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                        ['v' => json_encode($map), 'v2' => json_encode($map)]
                    );
                }
            }
        } catch (Throwable) {
        }
        return $fallback;
    }

    private function normalizeNigerianPhone(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', trim($raw));
        if (str_starts_with($digits, '234') && strlen($digits) === 13) {
            $digits = '0' . substr($digits, 3);
        } elseif (strlen($digits) === 10 && preg_match('/^[789][01]\d{8}$/', $digits)) {
            $digits = '0' . $digits;
        }
        return $digits;
    }

    private function validatePhoneForNetwork(string $rawPhone, string $selectedNetwork, bool $ported = false): array
    {
        $phone = $this->normalizeNigerianPhone($rawPhone);
        $selected = strtoupper(trim($selectedNetwork));
        if ($selected === 'ETISALAT') {
            $selected = '9MOBILE';
        }

        if (!preg_match('/^0[789][01]\d{8}$/', $phone)) {
            return [
                'valid' => false,
                'matches_network' => false,
                'ported' => $ported,
                'ported_allowed' => false,
                'formatted_phone' => $phone,
                'detected_network' => null,
                'selected_network' => $selected,
                'message' => 'Enter a valid 11-digit Nigerian mobile number (e.g. 0803..., 0814..., 0901...).',
            ];
        }

        $prefixMap = $this->getNetworkPrefixMap();
        $prefix4 = substr($phone, 0, 4);
        $prefix5 = substr($phone, 0, 5);
        $detected = null;
        foreach ($prefixMap as $net => $prefixes) {
            if (in_array($prefix5, $prefixes, true) || in_array($prefix4, $prefixes, true)) {
                $detected = $net;
                break;
            }
        }

        if ($detected === null) {
            if ($ported) {
                return [
                    'valid' => true,
                    'matches_network' => true,
                    'ported' => true,
                    'ported_allowed' => true,
                    'formatted_phone' => $phone,
                    'detected_network' => null,
                    'selected_network' => $selected,
                    'message' => "{$phone} accepted in ported-number mode for {$selected}.",
                ];
            }
            return [
                'valid' => false,
                'matches_network' => false,
                'ported' => false,
                'ported_allowed' => false,
                'formatted_phone' => $phone,
                'detected_network' => null,
                'selected_network' => $selected,
                'message' => "Number prefix {$prefix4} could not be matched to a supported Nigerian mobile carrier. Enable Ported / MNP mode if transferred.",
            ];
        }

        $matches = ($selected === '' || $detected === $selected);
        if (!$matches) {
            if ($ported) {
                return [
                    'valid' => true,
                    'matches_network' => false,
                    'ported' => true,
                    'ported_allowed' => true,
                    'formatted_phone' => $phone,
                    'detected_network' => $detected,
                    'selected_network' => $selected,
                    'message' => "{$phone} has {$detected} prefix, confirmed as ported to {$selected} (MNP).",
                ];
            }
            return [
                'valid' => true,
                'matches_network' => false,
                'ported' => false,
                'ported_allowed' => false,
                'formatted_phone' => $phone,
                'detected_network' => $detected,
                'selected_network' => $selected,
                'message' => "{$phone} belongs to {$detected}, which does not match your selected network ({$selected}). Select {$detected} or mark the line as ported (MNP).",
            ];
        }

        return [
            'valid' => true,
            'matches_network' => true,
            'ported' => $ported,
            'ported_allowed' => true,
            'formatted_phone' => $phone,
            'detected_network' => $detected,
            'selected_network' => $selected,
            'message' => "{$phone} verified for {$detected} Nigeria.",
        ];
    }

    /**
     * POST /api/telecom/validate-phone
     */
    public function validatePhone(Request $request): void
    {
        Auth::requireAuth($request);
        $phone = (string)$request->input('phone', '');
        $network = strtoupper(trim((string)$request->input('network', '')));
        $ported = filter_var($request->input('ported') ?? $request->input('allow_ported') ?? false, FILTER_VALIDATE_BOOLEAN);
        if (trim($phone) === '' || $network === '') {
            Response::error('Recipient phone number and network are required for validation.', 422);
            return;
        }
        $result = $this->validatePhoneForNetwork($phone, $network, $ported);
        Response::success($result, $result['message']);
    }

    /**
     * 1. GET /api/telecom/plans
     * Dynamic service catalogue from database cache
     */
    public function plans(Request $request): void
    {
        $this->ensureDataSchema();
        $network = strtoupper((string)$request->query('network', ''));

        // Auto-sync Ulamadata live plans if DB has not yet synced real plan_ud_% entries
        try {
            $liveCount = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM telecom_plans WHERE id LIKE "plan_ud_%" AND is_active = 1');
            if ((int)($liveCount['cnt'] ?? 0) === 0 && $this->adapter instanceof UlamaDataAdapter) {
                $this->adapter->syncLivePlans();
            }
        } catch (Throwable) {
        }

        // Check if requester is authenticated admin
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        if ($isAdmin) {
            $sql = 'SELECT id, provider_plan_id, network, network_id, name, size, plan_type as type, validity, wholesale_cost, price, pricing_mode, fixed_price, markup_percent, discount_percent, admin_price_locked, is_active as enabled, provider_id as provider 
                    FROM telecom_plans WHERE is_active = 1 ';
            $params = [];
            if (!empty($network)) {
                $sql .= 'AND network = :net ';
                $params['net'] = $network;
            }
            $sql .= 'ORDER BY network ASC, plan_type ASC, price ASC';

            $dataPlans = $this->db->fetchAll($sql, $params);
            foreach ($dataPlans as &$p) {
                $p['wholesale_cost'] = (float)$p['wholesale_cost'];
                $p['price'] = (float)$p['price'];
                $p['fixed_price'] = $p['fixed_price'] !== null ? (float)$p['fixed_price'] : null;
                $p['markup_percent'] = $p['markup_percent'] !== null ? (float)$p['markup_percent'] : null;
                $p['discount_percent'] = $p['discount_percent'] !== null ? (float)$p['discount_percent'] : null;
                $p['admin_price_locked'] = (bool)($p['admin_price_locked'] ?? false);
                $p['margin'] = round($p['price'] - $p['wholesale_cost'], 2);
                $p['enabled'] = (bool)$p['enabled'];
            }
        } else {
            // CUSTOMER-SAFE MODEL: Omits wholesale_cost, provider_plan_id, pricing rules, and provider completely
            $sql = 'SELECT id, network, name, size, plan_type as type, validity, price, is_active as enabled 
                    FROM telecom_plans WHERE is_active = 1 ';
            $params = [];
            if (!empty($network)) {
                $sql .= 'AND network = :net ';
                $params['net'] = $network;
            }
            $sql .= 'ORDER BY network ASC, plan_type ASC, price ASC';

            $dataPlans = $this->db->fetchAll($sql, $params);
            foreach ($dataPlans as &$p) {
                $p['price'] = (float)$p['price'];
                $p['enabled'] = (bool)$p['enabled'];
            }
        }

        $categoriesByNetwork = [];
        foreach ($dataPlans as $p) {
            $netKey = $p['network'];
            $cat = $p['type'];
            if (!isset($categoriesByNetwork[$netKey])) {
                $categoriesByNetwork[$netKey] = [];
            }
            if (!in_array($cat, $categoriesByNetwork[$netKey], true)) {
                $categoriesByNetwork[$netKey][] = $cat;
            }
        }

        if ($isAdmin) {
            $cablePackages = $this->db->fetchAll('SELECT * FROM cable_packages WHERE is_active = 1 ORDER BY provider ASC, price ASC');
            $electricityDiscos = $this->db->fetchAll('SELECT * FROM electricity_discos WHERE is_active = 1 ORDER BY name ASC');
        } else {
            $cablePackages = $this->db->fetchAll('SELECT id, provider as provider_type, name, price, is_active FROM cable_packages WHERE is_active = 1 ORDER BY provider ASC, price ASC');
            $electricityDiscos = $this->db->fetchAll('SELECT id, name, code, is_active FROM electricity_discos WHERE is_active = 1 ORDER BY name ASC');
        }
        try {
            $examPackages = $this->db->fetchAll('SELECT id, name, price, is_active FROM exam_packages WHERE is_active = 1 ORDER BY price ASC');
        } catch (\Throwable) {
            $examPackages = [];
        }

        try {
            $airtimeSwap = $this->db->fetchAll('SELECT network, conversion_rate_percent, conversion_rate_percent as swap_rate_percent, is_active FROM airtime_swap_configs WHERE is_active = 1');
        } catch (\Throwable) {
            $airtimeSwap = [];
        }

        $airtimeDiscount = $this->getAirtimeDiscountPercent();
        $bulkSms = self::readBulkSmsSettings($this->db);

        Response::success([
            'activeProvider' => $isAdmin ? $this->activeProviderId : 'sovereign',
            'active_provider' => $isAdmin ? $this->activeProviderId : 'sovereign',
            'plans' => $dataPlans,
            'categories_by_network' => $categoriesByNetwork,
            'cable_packages' => $cablePackages,
            'electricity_discos' => $electricityDiscos,
            'exam_packages' => $examPackages,
            'airtime_swap' => $airtimeSwap,
            'airtime_discount_percent' => $airtimeDiscount,
            'bulksms_unit_price' => $bulkSms['unit_price'],
            'bulksms_sender_id' => $bulkSms['default_sender'],
        ]);
    }

    /**
     * 2. POST /api/telecom/plans/sync (Admin or Auto)
     * Dynamic catalogue synchronization directly from provider
     */
    public function syncPlans(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $recalc = filter_var($request->input('recalculate_unlocked', false), FILTER_VALIDATE_BOOLEAN);
        try {
            if ($this->adapter instanceof UlamaDataAdapter) {
                $res = $this->adapter->syncLivePlans($recalc);
            } else {
                $res = $this->adapter->syncLivePlans();
            }
            Response::success($res, "Successfully synchronized {$res['synced_count']} plans from UlamaData (preserved {$res['preserved_overrides']} admin-configured prices)!");
        } catch (Throwable $e) {
            Response::error('Failed to sync plans from provider: ' . $e->getMessage(), 502);
        }
    }

    /**
     * 3. POST /api/telecom/data and POST /api/telecom/purchase-data
     */
    public function purchaseData(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $planId = trim((string)($request->input('planId') ?? $request->input('plan_id', '')));
        $rawPhone = trim((string)$request->input('phone', ''));
        $selectedNetwork = strtoupper(trim((string)$request->input('network', '')));
        $ported = filter_var($request->input('ported') ?? $request->input('allow_ported') ?? false, FILTER_VALIDATE_BOOLEAN);
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if ($planId === '' || $rawPhone === '') {
            Response::error('Data plan selection and recipient phone number are required.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'data', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing data bundle order.');
                return;
            }
        }

        $plan = $this->db->fetchOne('SELECT * FROM telecom_plans WHERE (id = :id OR provider_plan_id = :ppid) AND is_active = 1', [
            'id' => $planId,
            'ppid' => $planId,
        ]);
        if (!$plan) {
            Response::error('Selected data plan is currently not available.', 404);
            return;
        }

        if ($selectedNetwork !== '' && $selectedNetwork !== strtoupper((string)$plan['network'])) {
            Response::error("Selected plan belongs to {$plan['network']}, not {$selectedNetwork}.", 422);
            return;
        }

        $phoneCheck = $this->validatePhoneForNetwork($rawPhone, (string)$plan['network'], $ported);
        if (!$phoneCheck['valid'] || (!$phoneCheck['matches_network'] && !$ported)) {
            Response::error($phoneCheck['message'], 422);
            return;
        }
        $phone = $phoneCheck['formatted_phone'];

        $price = (float)$plan['price'];
        $wholesaleCost = (float)$plan['wholesale_cost'];
        if ($price <= 0) {
            Response::error('Data plan selling price is not configured. Contact support.', 422);
            return;
        }
        $profit = round($price - $wholesaleCost, 2);
        $planLabel = "{$plan['network']} {$plan['size']} ({$plan['plan_type']})";

        // Enforce compulsory Transaction PIN before acquiring order lock or debiting wallet
        $this->verifyTransactionPinOrFail($user, $request, 'telecom_data', 'data');

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'data', $idempotencyKey !== '' ? $idempotencyKey : ($phone . '|' . $plan['id']));

        // Re-check inside exclusive lock to eliminate concurrent double-spend/double-order race
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'data', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing data bundle order.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'data', $phone, $price, $planLabel, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical data bundle purchase for this number was just submitted. Please check your Order History before retrying.', 409);
            return;
        }

        $reference = 'HT_DAT_' . strtoupper(bin2hex(random_bytes(6)));

        // 1. Atomic Wallet Debit
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $price,
                'data_purchase',
                $reference,
                "{$plan['network']} {$plan['size']} Data top-up to {$phone}",
                'internal',
                ['plan_id' => $plan['id'], 'phone' => $phone]
            );
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error($e->getMessage(), 400);
            return;
        }

        // 2. Dispatch to Live Provider
        $orderId = Security::generateUuid();
        try {
            if ($this->adapter instanceof UlamaDataAdapter) {
                $dispatchRes = $this->adapter->purchaseData($plan['network'], $phone, $plan['provider_plan_id'], $ported, $reference);
            } else {
                $dispatchRes = $this->adapter->purchaseData($plan['network'], $phone, $plan['provider_plan_id'], $ported);
            }

            $orderStatus = ($dispatchRes['status'] ?? 'successful') === 'pending' ? 'pending' : 'successful';
            $providerRef = (string)($dispatchRes['provider_reference'] ?? $reference);

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "data", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, :st, :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $plan['network'],
                    'phone' => $phone,
                    'plan' => $planLabel,
                    'amt' => $price,
                    'cost' => $wholesaleCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $providerRef,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'st' => $orderStatus,
                    'meta' => json_encode([
                        'internal_reference' => $reference,
                        'plan_id' => $plan['id'],
                        'validity' => $plan['validity'],
                        'api_response' => $dispatchRes['api_response'] ?? null,
                        'raw' => $dispatchRes['raw'] ?? $dispatchRes,
                    ]),
                ]
            );

            $customerSafeRef = 'HT-' . strtoupper(substr(str_replace('-', '', $orderId), 0, 10));
            $order = [
                'id' => $orderId,
                'reference' => $customerSafeRef,
                'provider_ref' => $customerSafeRef,
                'service' => 'data',
                'service_type' => 'data',
                'network' => $plan['network'],
                'recipient' => $phone,
                'phone' => $phone,
                'plan' => $planLabel,
                'amount' => $price,
                'status' => $orderStatus,
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'data', $orderStatus === 'pending' ? 'DATA_ORDER_PENDING' : 'DATA_PURCHASED', $reference, $price, $orderStatus, $this->activeProviderId, null, [
                'network' => $plan['network'],
                'phone' => $phone,
                'plan' => $planLabel,
            ]);

            if ($orderStatus === 'successful') {
                $this->triggerReferralReward((string)$user['id'], 'data', 'data', 'TEL_' . $orderId, $price, $wholesaleCost);
            }

            $msg = $orderStatus === 'pending'
                ? "{$plan['size']} Data order for {$phone} is processing and will complete shortly."
                : "{$plan['size']} Data successfully delivered to {$phone}!";

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'reference' => $customerSafeRef,
                'network' => $plan['network'],
                'phone' => $phone,
                'amount' => $price,
                'status' => $orderStatus,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], $msg);
        } catch (Throwable $e) {
            $this->walletService->credit($user['id'], $price, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed data order {$reference}");

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "data", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $plan['network'],
                    'phone' => $phone,
                    'plan' => $planLabel,
                    'amt' => $price,
                    'cost' => $wholesaleCost,
                    'prov' => $this->activeProviderId,
                    'pref' => $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(['internal_reference' => $reference, 'error' => $e->getMessage()]),
                ]
            );

            $this->logFootprint($user, 'data', 'DATA_PURCHASE_FAILED', $reference, $price, 'failed', $this->activeProviderId, $e->getMessage(), [
                'network' => $plan['network'],
                'phone' => $phone,
            ]);

            $this->releaseOrderLock($lockKey);
            Response::error('Failed to dispatch data: ' . $e->getMessage() . '. Your wallet balance has been refunded.', 502);
        }
    }

    /**
     * 4. POST /api/telecom/airtime
     */
    public function topupAirtime(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $network = strtoupper(trim((string)$request->input('network', '')));
        if ($network === 'ETISALAT') {
            $network = '9MOBILE';
        }
        $rawPhone = trim((string)$request->input('phone', ''));
        $amount = (float)$request->input('amount', 0);
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if ($network === '' || $rawPhone === '' || $amount < 50) {
            Response::error('Network, valid phone number, and minimum ₦50 airtime amount are required.', 422);
            return;
        }

        $phone = $this->normalizeNigerianPhone($rawPhone);
        if (!preg_match('/^0[789][01]\d{8}$/', $phone)) {
            Response::error('Enter a valid 11-digit Nigerian mobile number.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'airtime', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing airtime order.');
                return;
            }
        }

        // Enforce compulsory Transaction PIN before locking or debiting wallet
        $this->verifyTransactionPinOrFail($user, $request, 'telecom_airtime', 'airtime');

        $discountPercent = $this->getAirtimeDiscountPercent();
        $discountedPrice = round($amount * (1 - ($discountPercent / 100)), 2);
        $discountSaved = round($amount - $discountedPrice, 2);
        $wholesaleDiscountPct = $this->readSettingFloat('airtime_wholesale_discount_percent', 3.0, 0.0, 50.0);
        $wholesaleCost = round($amount * (1 - ($wholesaleDiscountPct / 100)), 2);

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'airtime', $idempotencyKey !== '' ? $idempotencyKey : ($phone . '|' . round($discountedPrice, 2)));
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'airtime', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing airtime order.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'airtime', $phone, $discountedPrice, null, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical airtime recharge for this number was just submitted. Please check your Order History before retrying.', 409);
            return;
        }

        $reference = 'UD_AIR_' . strtoupper(bin2hex(random_bytes(6)));

        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $discountedPrice,
                'airtime',
                $reference,
                "₦{$amount} {$network} Airtime recharge to {$phone} ({$discountPercent}% discount)",
                'internal',
                ['network' => $network, 'phone' => $phone, 'face_value' => $amount, 'discount_percent' => $discountPercent]
            );
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        try {
            $dispatchRes = $this->adapter->topupAirtime($network, $phone, $amount);
            $orderStatus = ($dispatchRes['status'] ?? 'successful') === 'pending' ? 'pending' : 'successful';
            if (isset($dispatchRes['cost_price']) && is_numeric($dispatchRes['cost_price']) && (float)$dispatchRes['cost_price'] > 0) {
                $wholesaleCost = round((float)$dispatchRes['cost_price'], 2);
            }
            $profit = round($discountedPrice - $wholesaleCost, 2);

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "airtime", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, :st, :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $network,
                    'phone' => $phone,
                    'plan' => "₦{$amount} VTU Airtime",
                    'amt' => $discountedPrice,
                    'cost' => $wholesaleCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $dispatchRes['provider_reference'] ?? $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'st' => $orderStatus,
                    'meta' => json_encode($dispatchRes),
                ]
            );

            $order = [
                'id' => $orderId,
                'reference' => $reference,
                'service' => 'airtime',
                'service_type' => 'airtime',
                'network' => $network,
                'recipient' => $phone,
                'phone' => $phone,
                'plan' => "₦{$amount} VTU Airtime",
                'amount' => $discountedPrice,
                'status' => $orderStatus,
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'airtime', $orderStatus === 'pending' ? 'AIRTIME_ORDER_PENDING' : 'AIRTIME_TOPUP', $reference, $discountedPrice, $orderStatus, $this->activeProviderId, null, [
                'network' => $network,
                'phone' => $phone,
                'amount' => $amount,
                'discount_percent' => $discountPercent,
            ]);

            if ($orderStatus === 'successful') {
                $this->triggerReferralReward((string)$user['id'], 'airtime', 'airtime', 'TEL_' . $orderId, $discountedPrice, $wholesaleCost);
            }

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'reference' => $reference,
                'amount_charged' => $discountedPrice,
                'status' => $orderStatus,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'discountSaved' => $discountSaved,
                'airtime_discount_percent' => $discountPercent,
                'order' => $order,
            ], $orderStatus === 'pending' ? "₦{$amount} Airtime order for {$phone} is processing." : "₦{$amount} Airtime successfully credited to {$phone}!");
        } catch (Throwable $e) {
            $this->walletService->credit($user['id'], $discountedPrice, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed airtime {$reference}");

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "airtime", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $network,
                    'phone' => $phone,
                    'plan' => "₦{$amount} Airtime",
                    'amt' => $discountedPrice,
                    'cost' => $wholesaleCost,
                    'prov' => $this->activeProviderId,
                    'pref' => $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(['error' => $e->getMessage()]),
                ]
            );

            $this->logFootprint($user, 'airtime', 'AIRTIME_TOPUP_FAILED', $reference, $discountedPrice, 'failed', $this->activeProviderId, $e->getMessage(), [
                'network' => $network,
                'phone' => $phone,
            ]);

            $this->releaseOrderLock($lockKey);
            Response::error('Failed to recharge airtime: ' . $e->getMessage() . '. Your wallet balance has been refunded.', 502);
        }
    }

    private function triggerReferralReward(string $userId, string $category, string $serviceKey, string $sourceRef, float $gross, float $wholesale): void
    {
        try {
            (new ReferralEngineService($this->db))->recordQualifyingTransaction([
                'user_id' => $userId,
                'service_category' => $category,
                'service_key' => $serviceKey,
                'source_reference' => $sourceRef,
                'gross_amount' => $gross,
                'wholesale_cost' => $wholesale,
                'gateway_fee' => 0.0,
            ]);
        } catch (Throwable) {
        }
    }

    private function mapTelecomReferralCategory(string $serviceType): string
    {
        return match ($serviceType) {
            'data' => 'data',
            'airtime' => 'airtime',
            'airtime_pin' => 'airtime_pin',
            'data_pin' => 'data_pin',
            'cable' => 'cable',
            'electricity' => 'electricity',
            'exam' => 'exam_pin',
            'bulksms' => 'bulksms',
            default => $serviceType,
        };
    }

    private function verifyTransactionPinOrFail(array $user, Request $request, string $categoryKey = 'telecom_pins', ?string $serviceKey = null): bool
    {
        $pinService = new PinSecurityService($this->db);
        $pinService->requireValidPin($user, $request->getBody(), $categoryKey, $serviceKey);
        return true;
    }

    private function fetchOrderVouchers(string $orderId): array
    {
        try {
            $rows = $this->db->fetchAll(
                'SELECT voucher_index, pin_code, serial_number, denomination_label, face_value, network, load_code, check_balance_code, card_name, created_at
                 FROM telecom_vouchers
                 WHERE order_id = :oid
                 ORDER BY voucher_index ASC',
                ['oid' => $orderId]
            );
            $out = [];
            foreach ($rows as $r) {
                $out[] = [
                    'index' => (int)$r['voucher_index'],
                    'pin' => (string)$r['pin_code'],
                    'serial' => (string)$r['serial_number'],
                    'denomination_label' => (string)$r['denomination_label'],
                    'value' => $r['face_value'] !== null ? (float)$r['face_value'] : 0.0,
                    'network' => (string)$r['network'],
                    'load_code' => (string)($r['load_code'] ?? ''),
                    'check_balance' => (string)($r['check_balance_code'] ?? ''),
                    'card_name' => (string)($r['card_name'] ?? ''),
                    'created_at' => $r['created_at'],
                ];
            }
            return $out;
        } catch (Throwable) {
            return [];
        }
    }

    private function saveVerifiedVouchers(
        string $orderId,
        string $userId,
        string $serviceType,
        string $network,
        string $denomLabel,
        ?float $faceValue,
        array $vouchers,
        string $providerRef
    ): array {
        if (empty($vouchers)) {
            throw new RuntimeException('No verified vouchers supplied for persistence.');
        }

        // Verify none of these PIN+serial pairs already exist for a different order
        foreach ($vouchers as $v) {
            $dup = $this->db->fetchOne(
                'SELECT order_id FROM telecom_vouchers
                 WHERE service_type = :st AND network = :net AND pin_code = :pin AND serial_number = :ser
                 LIMIT 1',
                [
                    'st' => $serviceType,
                    'net' => strtoupper($network),
                    'pin' => (string)$v['pin'],
                    'ser' => (string)$v['serial'],
                ]
            );
            if ($dup && (string)$dup['order_id'] !== $orderId) {
                throw new RuntimeException('Provider returned a duplicate voucher PIN/serial already assigned to another order.');
            }
        }

        foreach ($vouchers as $idx => $v) {
            $vIndex = (int)($v['index'] ?? ($idx + 1));
            $this->db->execute(
                'INSERT INTO telecom_vouchers
                 (id, order_id, user_id, service_type, network, denomination_label, face_value, pin_code, serial_number, load_code, check_balance_code, card_name, voucher_index, provider_ref, created_at)
                 VALUES
                 (:id, :oid, :uid, :st, :net, :dlabel, :fval, :pin, :ser, :lcode, :cbal, :cname, :vidx, :pref, NOW())
                 ON DUPLICATE KEY UPDATE
                   pin_code = VALUES(pin_code),
                   serial_number = VALUES(serial_number),
                   load_code = VALUES(load_code),
                   check_balance_code = VALUES(check_balance_code),
                   card_name = VALUES(card_name)',
                [
                    'id' => Security::generateUuid(),
                    'oid' => $orderId,
                    'uid' => $userId,
                    'st' => $serviceType,
                    'net' => strtoupper($network),
                    'dlabel' => $denomLabel,
                    'fval' => $faceValue,
                    'pin' => (string)$v['pin'],
                    'ser' => (string)$v['serial'],
                    'lcode' => (string)($v['load_code'] ?? ''),
                    'cbal' => (string)($v['check_balance'] ?? ''),
                    'cname' => (string)($v['card_name'] ?? ''),
                    'vidx' => $vIndex,
                    'pref' => $providerRef,
                ]
            );
        }

        return $this->fetchOrderVouchers($orderId);
    }

    /**
     * 5. POST /api/telecom/airtime-pin and /api/telecom/purchase-airtime-pin
     */
    public function vendAirtimePin(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        if (!$this->verifyTransactionPinOrFail($user, $request, 'telecom_pins', 'airtime_pin')) {
            return;
        }

        $denominationId = trim((string)($request->input('denominationId') ?? $request->input('denomination_id') ?? $request->input('id') ?? ''));
        $network = strtoupper(trim((string)$request->input('network', '')));
        if ($network === 'ETISALAT') {
            $network = '9MOBILE';
        }
        $denominationValue = (float)($request->input('denomination') ?? $request->input('value') ?? 0);
        $quantity = (int)$request->input('quantity', 1);
        $rawCardName = trim((string)($request->input('card_name') ?? $request->input('businessName') ?? $request->input('business_name') ?? 'HambakTech'));
        $cardName = $rawCardName !== '' ? mb_substr($rawCardName, 0, 50) : 'HambakTech';
        $idempotencyKey = trim((string)($request->header('x-idempotency-key') ?? $request->input('idempotency_key') ?? $request->input('idempotencyKey') ?? ''));

        if ($quantity < 1) {
            Response::error('Quantity must be at least 1 card.', 422);
            return;
        }

        // Idempotency deduplication before any stock check or wallet debit
        if ($idempotencyKey !== '') {
            $existingOrder = $this->db->fetchOne(
                'SELECT id, service_type, network, phone, plan, amount, status, created_at
                 FROM telecom_orders
                 WHERE user_id = :uid AND service_type = "airtime_pin" AND idempotency_key = :ikey AND status IN ("successful", "pending")
                 ORDER BY created_at DESC LIMIT 1',
                ['uid' => $user['id'], 'ikey' => mb_substr($idempotencyKey, 0, 95)]
            );
            if ($existingOrder) {
                $walletRow = $this->db->fetchOne('SELECT wallet_balance FROM users WHERE id = :uid', ['uid' => $user['id']]);
                $bal = (float)($walletRow['wallet_balance'] ?? 0);
                $savedVouchers = $existingOrder['status'] === 'successful'
                    ? $this->fetchOrderVouchers((string)$existingOrder['id'])
                    : [];
                $safeRef = 'HT-' . strtoupper(substr(str_replace('-', '', (string)$existingOrder['id']), 0, 10));
                Response::success([
                    'order_id' => $existingOrder['id'],
                    'reference' => $safeRef,
                    'status' => $existingOrder['status'],
                    'vouchers' => $savedVouchers,
                    'pins' => $savedVouchers,
                    'quantity' => count($savedVouchers),
                    'balance_after' => $bal,
                    'newBalance' => $bal,
                    'deduplicated' => true,
                    'order' => [
                        'id' => $existingOrder['id'],
                        'reference' => $safeRef,
                        'provider_ref' => $safeRef,
                        'service' => 'airtime_pin',
                        'service_type' => 'airtime_pin',
                        'network' => $existingOrder['network'],
                        'recipient' => $cardName,
                        'phone' => $existingOrder['phone'],
                        'plan' => $existingOrder['plan'],
                        'amount' => (float)$existingOrder['amount'],
                        'status' => $existingOrder['status'],
                        'voucher_count' => count($savedVouchers),
                        'created_at' => $existingOrder['created_at'],
                    ],
                ], 'Duplicate request prevented; returning existing Airtime PIN order.');
                return;
            }
        }

        // Lookup active Airtime PIN denomination in DB
        $denom = null;
        if ($denominationId !== '') {
            $denom = $this->db->fetchOne(
                'SELECT * FROM airtime_pin_denominations WHERE id = :id AND is_active = 1 LIMIT 1',
                ['id' => $denominationId]
            );
        } elseif ($network !== '' && $denominationValue > 0) {
            $denom = $this->db->fetchOne(
                'SELECT * FROM airtime_pin_denominations WHERE network = :net AND ABS(value - :val) < 0.01 AND is_active = 1 AND id LIKE "apin_ud_%" LIMIT 1',
                ['net' => $network, 'val' => $denominationValue]
            );
            if (!$denom) {
                $denom = $this->db->fetchOne(
                    'SELECT * FROM airtime_pin_denominations WHERE network = :net AND ABS(value - :val) < 0.01 AND is_active = 1 LIMIT 1',
                    ['net' => $network, 'val' => $denominationValue]
                );
            }
        }

        if (!$denom) {
            Response::error('Selected Airtime PIN denomination is currently unavailable or disabled.', 404);
            return;
        }

        $denomNet = strtoupper((string)$denom['network']);
        if ($network !== '' && $network !== $denomNet) {
            Response::error("Selected denomination belongs to {$denomNet}, not {$network}.", 422);
            return;
        }
        $network = $denomNet;
        $faceValue = (float)$denom['value'];
        $providerPlanId = (int)($denom['provider_plan_id'] ?? 0);
        $maxQuantity = max(1, (int)($denom['max_quantity'] ?? 50));
        $availStock = max(0, (int)($denom['available_stock'] ?? 0));

        if ($quantity > $maxQuantity) {
            Response::error("Maximum allowed quantity per Airtime PIN order is {$maxQuantity} card(s).", 422);
            return;
        }

        if ($availStock <= 0) {
            Response::error("{$network} ₦" . number_format($faceValue) . " Airtime PINs are currently out of stock (0 available).", 409);
            return;
        }
        if ($quantity > $availStock) {
            Response::error("Only {$availStock} {$network} ₦" . number_format($faceValue) . " PIN(s) available in stock.", 422);
            return;
        }

        // Re-verify live provider stock right before wallet debit
        if ($this->adapter instanceof UlamaDataAdapter && $providerPlanId > 0) {
            try {
                $liveItems = $this->adapter->fetchAirtimePinCatalogue();
                foreach ($liveItems as $li) {
                    if ((int)$li['provider_plan_id'] === $providerPlanId) {
                        $availStock = max(0, (int)$li['available_stock']);
                        $this->db->execute(
                            'UPDATE airtime_pin_denominations SET available_stock = :avail, wholesale_cost = :wcost, api_discount = :adisc, updated_at = NOW() WHERE id = :id',
                            [
                                'avail' => $availStock,
                                'wcost' => $li['wholesale_cost'],
                                'adisc' => $li['api_discount'],
                                'id' => $denom['id'],
                            ]
                        );
                        $denom['wholesale_cost'] = $li['wholesale_cost'];
                        break;
                    }
                }
            } catch (Throwable) {
                // Use cached stock when live check temporarily fails; actual vend enforces upstream response
            }
        }

        if ($availStock <= 0) {
            Response::error("{$network} ₦" . number_format($faceValue) . " Airtime PINs are currently out of stock (0 available from carrier).", 409);
            return;
        }
        if ($quantity > $availStock) {
            Response::error("Requested quantity ({$quantity}) exceeds live available stock ({$availStock}).", 422);
            return;
        }

        // Server-side selling price (never charge wholesale cost!)
        $unitPrice = round((float)$denom['price'], 2);
        $wholesaleUnit = round((float)$denom['wholesale_cost'], 2);
        if ($unitPrice <= 0) {
            Response::error('Airtime PIN selling price is not configured. Contact support.', 422);
            return;
        }

        $totalPrice = round($unitPrice * $quantity, 2);
        $totalCost = round($wholesaleUnit * $quantity, 2);
        $profit = round($totalPrice - $totalCost, 2);
        $planLabel = "{$quantity}x {$network} ₦" . number_format($faceValue) . " Airtime PINs";

        // 12-second accidental rapid double-submit guard
        $recentDup = $this->db->fetchOne(
            'SELECT id FROM telecom_orders
             WHERE user_id = :uid AND service_type = "airtime_pin" AND network = :net AND plan = :pl
               AND status IN ("successful", "pending")
               AND created_at >= (NOW() - INTERVAL 12 SECOND)
             LIMIT 1',
            ['uid' => $user['id'], 'net' => $network, 'pl' => $planLabel]
        );
        if ($recentDup) {
            Response::error('An identical Airtime PIN order was just submitted. Please check your Order History before retrying.', 409);
            return;
        }

        $reference = 'HT_APIN_' . strtoupper(bin2hex(random_bytes(6)));

        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $totalPrice,
                'airtime',
                $reference,
                "{$planLabel} ({$cardName})",
                'internal',
                ['denomination_id' => $denom['id'], 'quantity' => $quantity, 'card_name' => $cardName]
            );
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        $customerSafeRef = 'HT-' . strtoupper(substr(str_replace('-', '', $orderId), 0, 10));

        try {
            if ($this->adapter instanceof UlamaDataAdapter) {
                $dispatch = $this->adapter->vendAirtimePin($network, $faceValue, $quantity, $cardName, $providerPlanId > 0 ? $providerPlanId : null, $reference);
            } else {
                $dispatch = $this->adapter->vendAirtimePin($network, $faceValue, $quantity, $cardName);
            }

            $dispatchStatus = strtolower((string)($dispatch['status'] ?? 'pending'));
            $incomplete = !empty($dispatch['incomplete_vouchers']);
            $providerRef = (string)($dispatch['provider_reference'] ?? $reference);
            $rawVouchers = is_array($dispatch['vouchers'] ?? null) ? $dispatch['vouchers'] : ($dispatch['cards'] ?? []);

            if ($dispatchStatus === 'pending' || $incomplete) {
                $integrityErr = (string)($dispatch['integrity_error'] ?? 'Provider order is pending voucher delivery.');
                $this->db->execute(
                    'INSERT INTO telecom_orders
                     (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                     VALUES
                     (:id, :uid, "airtime_pin", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "pending", :meta, NOW())',
                    [
                        'id' => $orderId,
                        'uid' => $user['id'],
                        'net' => $network,
                        'phone' => $cardName,
                        'plan' => $planLabel,
                        'amt' => $totalPrice,
                        'cost' => $totalCost,
                        'prov' => $this->activeProviderId,
                        'pref' => $providerRef,
                        'ikey' => $idempotencyKey !== '' ? mb_substr($idempotencyKey, 0, 95) : null,
                        'meta' => json_encode([
                            'internal_reference' => $reference,
                            'denomination_id' => $denom['id'],
                            'face_value' => $faceValue,
                            'quantity' => $quantity,
                            'card_name' => $cardName,
                            'incomplete_vouchers' => $incomplete,
                            'integrity_error' => $integrityErr,
                            'raw' => $dispatch['raw'] ?? $dispatch,
                        ]),
                    ]
                );

                $this->logFootprint($user, 'airtime_pin', 'AIRTIME_PIN_PENDING', $reference, $totalPrice, 'pending', $this->activeProviderId, $incomplete ? $integrityErr : null, [
                    'network' => $network,
                    'quantity' => $quantity,
                    'denomination' => $faceValue,
                ]);

                $order = [
                    'id' => $orderId,
                    'reference' => $customerSafeRef,
                    'provider_ref' => $customerSafeRef,
                    'service' => 'airtime_pin',
                    'service_type' => 'airtime_pin',
                    'network' => $network,
                    'recipient' => $cardName,
                    'phone' => $cardName,
                    'plan' => $planLabel,
                    'amount' => $totalPrice,
                    'status' => 'pending',
                    'voucher_count' => 0,
                    'created_at' => date('Y-m-d H:i:s'),
                ];

                Response::success([
                    'order_id' => $orderId,
                    'reference' => $customerSafeRef,
                    'status' => 'pending',
                    'incomplete_vouchers' => $incomplete,
                    'vouchers' => [],
                    'pins' => [],
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'total_amount' => $totalPrice,
                    'balance_after' => $debitResult['balance_after'],
                    'newBalance' => $debitResult['balance_after'],
                    'order' => $order,
                ], $incomplete
                    ? 'Provider returned incomplete voucher data. Order marked Pending for verification — please click Verify/Requery in Orders.'
                    : 'Airtime PIN order is currently processing. Click Verify in Orders to retrieve vouchers once settled.');
                return;
            }

            // Persist order first, then save & verify 100% unique vouchers
            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "airtime_pin", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, "successful", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $network,
                    'phone' => $cardName,
                    'plan' => $planLabel,
                    'amt' => $totalPrice,
                    'cost' => $totalCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $providerRef,
                    'ikey' => $idempotencyKey !== '' ? mb_substr($idempotencyKey, 0, 95) : null,
                    'meta' => json_encode([
                        'internal_reference' => $reference,
                        'denomination_id' => $denom['id'],
                        'face_value' => $faceValue,
                        'quantity' => $quantity,
                        'card_name' => $cardName,
                        'load_pin' => $dispatch['load_pin'] ?? '',
                        'check_balance' => $dispatch['check_balance'] ?? '',
                        'raw' => $dispatch['raw'] ?? $dispatch,
                    ]),
                ]
            );

            try {
                $savedVouchers = $this->saveVerifiedVouchers(
                    $orderId,
                    (string)$user['id'],
                    'airtime_pin',
                    $network,
                    "₦" . number_format($faceValue) . " Airtime PIN",
                    $faceValue,
                    $rawVouchers,
                    $providerRef
                );
            } catch (Throwable $voucherEx) {
                $this->db->execute(
                    'UPDATE telecom_orders SET status = "pending", profit = 0.00 WHERE id = :id',
                    ['id' => $orderId]
                );
                throw new RuntimeException($voucherEx->getMessage());
            }

            // Decrement cached stock cleanly
            try {
                $this->db->execute(
                    'UPDATE airtime_pin_denominations SET available_stock = GREATEST(0, available_stock - :qty), updated_at = NOW() WHERE id = :id',
                    ['qty' => $quantity, 'id' => $denom['id']]
                );
            } catch (Throwable) {
            }

            $order = [
                'id' => $orderId,
                'reference' => $customerSafeRef,
                'provider_ref' => $customerSafeRef,
                'service' => 'airtime_pin',
                'service_type' => 'airtime_pin',
                'network' => $network,
                'recipient' => $cardName,
                'phone' => $cardName,
                'plan' => $planLabel,
                'amount' => $totalPrice,
                'status' => 'successful',
                'voucher_count' => count($savedVouchers),
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'airtime_pin', 'AIRTIME_PIN_VENDED', $reference, $totalPrice, 'successful', $this->activeProviderId, null, [
                'network' => $network,
                'quantity' => $quantity,
                'denomination' => $faceValue,
            ]);

            $this->triggerReferralReward((string)$user['id'], 'airtime_pin', 'airtime_pin', 'TEL_' . $orderId, $totalPrice, $totalCost);

            Response::success([
                'order_id' => $orderId,
                'reference' => $customerSafeRef,
                'status' => 'successful',
                'vouchers' => $savedVouchers,
                'pins' => $savedVouchers,
                'quantity' => count($savedVouchers),
                'unit_price' => $unitPrice,
                'total_amount' => $totalPrice,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], count($savedVouchers) . " {$network} ₦" . number_format($faceValue) . " Recharge PIN(s) generated successfully!");
        } catch (Throwable $e) {
            $refundRef = 'REFUND_' . $reference;
            $alreadyRefunded = $this->db->fetchOne('SELECT id FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $refundRef]);
            if (!$alreadyRefunded) {
                $this->walletService->credit($user['id'], $totalPrice, 'manual_adjustment', $refundRef, "Refund for failed Airtime PIN order {$reference}");
            }
            $existingFailed = $this->db->fetchOne('SELECT id FROM telecom_orders WHERE id = :id LIMIT 1', ['id' => $orderId]);
            if (!$existingFailed) {
                $this->db->execute(
                    'INSERT INTO telecom_orders (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                     VALUES (:id, :uid, "airtime_pin", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                    [
                        'id' => $orderId,
                        'uid' => $user['id'],
                        'net' => $network,
                        'phone' => $cardName,
                        'plan' => $planLabel,
                        'amt' => $totalPrice,
                        'cost' => $totalCost,
                        'prov' => $this->activeProviderId,
                        'pref' => $reference,
                        'ikey' => $idempotencyKey !== '' ? mb_substr($idempotencyKey, 0, 95) : null,
                        'meta' => json_encode(['internal_reference' => $reference, 'error' => $e->getMessage()]),
                    ]
                );
            } else {
                $this->db->execute('UPDATE telecom_orders SET status = "failed", profit = 0.00 WHERE id = :id', ['id' => $orderId]);
            }
            $this->logFootprint($user, 'airtime_pin', 'AIRTIME_PIN_FAILED', $reference, $totalPrice, 'failed', $this->activeProviderId, $e->getMessage());
            Response::error('Failed to generate Airtime PINs: ' . $e->getMessage() . '. Your wallet balance has been refunded.', 502);
        }
    }

    /**
     * 6. POST /api/telecom/data-pin and /api/telecom/purchase-data-pin
     */
    public function vendDataPin(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        if (!$this->verifyTransactionPinOrFail($user, $request, 'telecom_pins', 'data_pin')) {
            return;
        }

        $network = strtoupper(trim((string)$request->input('network', '')));
        if ($network === 'ETISALAT') {
            $network = '9MOBILE';
        }
        $planId = trim((string)($request->input('planId') ?? $request->input('plan_id') ?? $request->input('id') ?? ''));
        $quantity = (int)$request->input('quantity', 1);
        $rawCardName = trim((string)($request->input('card_name') ?? $request->input('businessName') ?? $request->input('business_name') ?? 'HambakTech'));
        $cardName = $rawCardName !== '' ? mb_substr($rawCardName, 0, 50) : 'HambakTech';
        $idempotencyKey = trim((string)($request->header('x-idempotency-key') ?? $request->input('idempotency_key') ?? $request->input('idempotencyKey') ?? ''));

        if ($quantity < 1) {
            Response::error('Quantity must be at least 1 card.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->db->fetchOne(
                'SELECT id, service_type, network, phone, plan, amount, status, created_at
                 FROM telecom_orders
                 WHERE user_id = :uid AND service_type = "data_pin" AND idempotency_key = :ikey AND status IN ("successful", "pending")
                 ORDER BY created_at DESC LIMIT 1',
                ['uid' => $user['id'], 'ikey' => mb_substr($idempotencyKey, 0, 95)]
            );
            if ($existingOrder) {
                $walletRow = $this->db->fetchOne('SELECT wallet_balance FROM users WHERE id = :uid', ['uid' => $user['id']]);
                $bal = (float)($walletRow['wallet_balance'] ?? 0);
                $savedVouchers = $existingOrder['status'] === 'successful'
                    ? $this->fetchOrderVouchers((string)$existingOrder['id'])
                    : [];
                $safeRef = 'HT-' . strtoupper(substr(str_replace('-', '', (string)$existingOrder['id']), 0, 10));
                Response::success([
                    'order_id' => $existingOrder['id'],
                    'reference' => $safeRef,
                    'status' => $existingOrder['status'],
                    'vouchers' => $savedVouchers,
                    'pins' => $savedVouchers,
                    'quantity' => count($savedVouchers),
                    'balance_after' => $bal,
                    'newBalance' => $bal,
                    'deduplicated' => true,
                    'order' => [
                        'id' => $existingOrder['id'],
                        'reference' => $safeRef,
                        'provider_ref' => $safeRef,
                        'service' => 'data_pin',
                        'service_type' => 'data_pin',
                        'network' => $existingOrder['network'],
                        'recipient' => $cardName,
                        'phone' => $existingOrder['phone'],
                        'plan' => $existingOrder['plan'],
                        'amount' => (float)$existingOrder['amount'],
                        'status' => $existingOrder['status'],
                        'voucher_count' => count($savedVouchers),
                        'created_at' => $existingOrder['created_at'],
                    ],
                ], 'Duplicate request prevented; returning existing Data PIN order.');
                return;
            }
        }

        // Strict isolation: ONLY allow confirmed data_pin_denominations rows with confirmed provider_plan_id (never /api/data_plans fallback)
        if ($planId === '') {
            Response::error('Data PIN service is currently disabled pending confirmed Ulamadata Data PIN plan IDs and pricing.', 403);
            return;
        }

        $plan = $this->db->fetchOne(
            'SELECT * FROM data_pin_denominations WHERE id = :id AND is_active = 1 AND provider_plan_id IS NOT NULL AND provider_plan_id > 0 LIMIT 1',
            ['id' => $planId]
        );
        if (!$plan) {
            Response::error('Selected Data PIN plan is unavailable or disabled until confirmed Ulamadata Data PIN catalogue IDs are supplied.', 404);
            return;
        }

        $planNet = strtoupper((string)$plan['network']);
        if ($network !== '' && $network !== $planNet) {
            Response::error("Selected Data PIN plan belongs to {$planNet}, not {$network}.", 422);
            return;
        }
        $network = $planNet;

        $maxQuantity = max(1, (int)($plan['max_quantity'] ?? 50));
        $availStock = max(0, (int)($plan['available_stock'] ?? 0));
        if ($quantity > $maxQuantity) {
            Response::error("Maximum allowed quantity per Data PIN order is {$maxQuantity} card(s).", 422);
            return;
        }
        if ($availStock <= 0) {
            Response::error("{$plan['name']} Data PINs are currently out of stock (0 available).", 409);
            return;
        }
        if ($quantity > $availStock) {
            Response::error("Requested quantity ({$quantity}) exceeds available stock ({$availStock}).", 422);
            return;
        }

        $unitPrice = round((float)$plan['price'], 2);
        $wholesaleUnit = round((float)$plan['wholesale_cost'], 2);
        if ($unitPrice <= 0) {
            Response::error('Data PIN selling price is not configured. Contact support.', 422);
            return;
        }

        $totalPrice = round($unitPrice * $quantity, 2);
        $totalCost = round($wholesaleUnit * $quantity, 2);
        $profit = round($totalPrice - $totalCost, 2);
        $planLabel = "{$quantity}x {$network} {$plan['size']} Data PINs";

        $recentDup = $this->db->fetchOne(
            'SELECT id FROM telecom_orders
             WHERE user_id = :uid AND service_type = "data_pin" AND network = :net AND plan = :pl
               AND status IN ("successful", "pending")
               AND created_at >= (NOW() - INTERVAL 12 SECOND)
             LIMIT 1',
            ['uid' => $user['id'], 'net' => $network, 'pl' => $planLabel]
        );
        if ($recentDup) {
            Response::error('An identical Data PIN order was just submitted. Please check your Order History before retrying.', 409);
            return;
        }

        $reference = 'HT_DPIN_' . strtoupper(bin2hex(random_bytes(6)));

        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $totalPrice,
                'data_purchase',
                $reference,
                "{$planLabel} ({$cardName})",
                'internal',
                ['data_pin_id' => $plan['id'], 'quantity' => $quantity, 'card_name' => $cardName]
            );
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        $customerSafeRef = 'HT-' . strtoupper(substr(str_replace('-', '', $orderId), 0, 10));

        try {
            if ($this->adapter instanceof UlamaDataAdapter) {
                $dispatch = $this->adapter->vendDataPin($network, (int)$plan['provider_plan_id'], $quantity, $cardName, $reference);
            } else {
                $dispatch = $this->adapter->vendDataPin($network, (int)$plan['provider_plan_id'], $quantity, $cardName);
            }

            $dispatchStatus = strtolower((string)($dispatch['status'] ?? 'pending'));
            $incomplete = !empty($dispatch['incomplete_vouchers']);
            $providerRef = (string)($dispatch['provider_reference'] ?? $reference);
            $rawVouchers = is_array($dispatch['vouchers'] ?? null) ? $dispatch['vouchers'] : ($dispatch['cards'] ?? []);

            if ($dispatchStatus === 'pending' || $incomplete) {
                $integrityErr = (string)($dispatch['integrity_error'] ?? 'Provider Data PIN order is pending delivery.');
                $this->db->execute(
                    'INSERT INTO telecom_orders
                     (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                     VALUES
                     (:id, :uid, "data_pin", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "pending", :meta, NOW())',
                    [
                        'id' => $orderId,
                        'uid' => $user['id'],
                        'net' => $network,
                        'phone' => $cardName,
                        'plan' => $planLabel,
                        'amt' => $totalPrice,
                        'cost' => $totalCost,
                        'prov' => $this->activeProviderId,
                        'pref' => $providerRef,
                        'ikey' => $idempotencyKey !== '' ? mb_substr($idempotencyKey, 0, 95) : null,
                        'meta' => json_encode([
                            'internal_reference' => $reference,
                            'data_pin_id' => $plan['id'],
                            'size' => $plan['size'],
                            'quantity' => $quantity,
                            'card_name' => $cardName,
                            'incomplete_vouchers' => $incomplete,
                            'integrity_error' => $integrityErr,
                            'raw' => $dispatch['raw'] ?? $dispatch,
                        ]),
                    ]
                );

                $this->logFootprint($user, 'data_pin', 'DATA_PIN_PENDING', $reference, $totalPrice, 'pending', $this->activeProviderId, $incomplete ? $integrityErr : null);

                Response::success([
                    'order_id' => $orderId,
                    'reference' => $customerSafeRef,
                    'status' => 'pending',
                    'incomplete_vouchers' => $incomplete,
                    'vouchers' => [],
                    'pins' => [],
                    'quantity' => $quantity,
                    'balance_after' => $debitResult['balance_after'],
                    'newBalance' => $debitResult['balance_after'],
                    'order' => [
                        'id' => $orderId,
                        'reference' => $customerSafeRef,
                        'provider_ref' => $customerSafeRef,
                        'service' => 'data_pin',
                        'service_type' => 'data_pin',
                        'network' => $network,
                        'recipient' => $cardName,
                        'phone' => $cardName,
                        'plan' => $planLabel,
                        'amount' => $totalPrice,
                        'status' => 'pending',
                        'voucher_count' => 0,
                        'created_at' => date('Y-m-d H:i:s'),
                    ],
                ], $incomplete
                    ? 'Provider returned incomplete Data PIN vouchers. Order marked Pending for verification.'
                    : 'Data PIN order is processing. Check Orders & Receipts to verify completion.');
                return;
            }

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "data_pin", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, "successful", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $network,
                    'phone' => $cardName,
                    'plan' => $planLabel,
                    'amt' => $totalPrice,
                    'cost' => $totalCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $providerRef,
                    'ikey' => $idempotencyKey !== '' ? mb_substr($idempotencyKey, 0, 95) : null,
                    'meta' => json_encode([
                        'internal_reference' => $reference,
                        'data_pin_id' => $plan['id'],
                        'size' => $plan['size'],
                        'quantity' => $quantity,
                        'card_name' => $cardName,
                        'raw' => $dispatch['raw'] ?? $dispatch,
                    ]),
                ]
            );

            try {
                $savedVouchers = $this->saveVerifiedVouchers(
                    $orderId,
                    (string)$user['id'],
                    'data_pin',
                    $network,
                    (string)$plan['size'] . ' Data PIN',
                    null,
                    $rawVouchers,
                    $providerRef
                );
            } catch (Throwable $voucherEx) {
                $this->db->execute('UPDATE telecom_orders SET status = "pending", profit = 0.00 WHERE id = :id', ['id' => $orderId]);
                throw new RuntimeException($voucherEx->getMessage());
            }

            try {
                $this->db->execute(
                    'UPDATE data_pin_denominations SET available_stock = GREATEST(0, available_stock - :qty), updated_at = NOW() WHERE id = :id',
                    ['qty' => $quantity, 'id' => $plan['id']]
                );
            } catch (Throwable) {
            }

            $order = [
                'id' => $orderId,
                'reference' => $customerSafeRef,
                'provider_ref' => $customerSafeRef,
                'service' => 'data_pin',
                'service_type' => 'data_pin',
                'network' => $network,
                'recipient' => $cardName,
                'phone' => $cardName,
                'plan' => $planLabel,
                'amount' => $totalPrice,
                'status' => 'successful',
                'voucher_count' => count($savedVouchers),
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'data_pin', 'DATA_PIN_VENDED', $reference, $totalPrice, 'successful', $this->activeProviderId);
            $this->triggerReferralReward((string)$user['id'], 'data_pin', 'data_pin', 'TEL_' . $orderId, $totalPrice, $totalCost);

            Response::success([
                'order_id' => $orderId,
                'reference' => $customerSafeRef,
                'status' => 'successful',
                'vouchers' => $savedVouchers,
                'pins' => $savedVouchers,
                'quantity' => count($savedVouchers),
                'unit_price' => $unitPrice,
                'total_amount' => $totalPrice,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], count($savedVouchers) . " Data PIN(s) generated successfully!");
        } catch (Throwable $e) {
            $refundRef = 'REFUND_' . $reference;
            $alreadyRefunded = $this->db->fetchOne('SELECT id FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $refundRef]);
            if (!$alreadyRefunded) {
                $this->walletService->credit($user['id'], $totalPrice, 'manual_adjustment', $refundRef, "Refund for failed Data PIN order {$reference}");
            }
            $existingFailed = $this->db->fetchOne('SELECT id FROM telecom_orders WHERE id = :id LIMIT 1', ['id' => $orderId]);
            if (!$existingFailed) {
                $this->db->execute(
                    'INSERT INTO telecom_orders (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                     VALUES (:id, :uid, "data_pin", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                    [
                        'id' => $orderId,
                        'uid' => $user['id'],
                        'net' => $network,
                        'phone' => $cardName,
                        'plan' => $planLabel,
                        'amt' => $totalPrice,
                        'cost' => $totalCost,
                        'prov' => $this->activeProviderId,
                        'pref' => $reference,
                        'ikey' => $idempotencyKey !== '' ? mb_substr($idempotencyKey, 0, 95) : null,
                        'meta' => json_encode(['internal_reference' => $reference, 'error' => $e->getMessage()]),
                    ]
                );
            } else {
                $this->db->execute('UPDATE telecom_orders SET status = "failed", profit = 0.00 WHERE id = :id', ['id' => $orderId]);
            }
            $this->logFootprint($user, 'data_pin', 'DATA_PIN_FAILED', $reference, $totalPrice, 'failed', $this->activeProviderId, $e->getMessage());
            Response::error('Failed to generate Data PINs: ' . $e->getMessage() . '. Your wallet balance has been refunded.', 502);
        }
    }

    /**
     * 7. POST /api/telecom/airtime-swap
     */
    public function processAirtimeSwap(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        if (!self::readAirtimeSwapEnabled($this->db)) {
            Response::error('Airtime to Cash service is currently disabled by administrator.', 403);
            return;
        }

        $network = strtoupper(trim((string)$request->input('network', '')));
        if ($network === 'ETISALAT') {
            $network = '9MOBILE';
        }
        $phone = trim((string)$request->input('phone', ''));
        $amount = (float)$request->input('amount', 0);
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if ($network === '' || $phone === '' || $amount < 500) {
            Response::error('Network, phone number and minimum ₦500 amount required.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'airtime_swap', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing airtime swap request.');
                return;
            }
        }

        $this->verifyTransactionPinOrFail($user, $request, 'telecom_swap', 'airtime_swap');

        $swapConfig = null;
        try {
            $swapConfig = $this->db->fetchOne('SELECT * FROM airtime_swap_configs WHERE network = :net LIMIT 1', ['net' => $network]);
        } catch (Throwable) {
        }
        if ($swapConfig && empty($swapConfig['is_active'])) {
            Response::error("Airtime swap for {$network} is currently inactive.", 403);
            return;
        }

        $conversionRate = $swapConfig && is_numeric($swapConfig['conversion_rate_percent'] ?? null)
            ? (float)$swapConfig['conversion_rate_percent']
            : 80.0;
        $wholesaleRate = $this->readSettingFloat('airtime_swap_wholesale_rate_percent', min(100.0, $conversionRate + 5.0), 0.0, 100.0);
        $customerPayout = round($amount * ($conversionRate / 100), 2);
        $wholesaleValue = round($amount * ($wholesaleRate / 100), 2);
        $expectedProfit = round(max(0.0, $wholesaleValue - $customerPayout), 2);

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'airtime_swap', $idempotencyKey !== '' ? $idempotencyKey : ($phone . '|' . round($amount, 2)));
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'airtime_swap', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing airtime swap request.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'airtime_swap', $phone, $amount, null, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical airtime swap request was just submitted. Please check your Order History.', 409);
            return;
        }

        try {
            $merchantPhone = trim((string)($swapConfig['merchant_phone'] ?? ''));
            $ussdTemplate = trim((string)($swapConfig['ussd_code'] ?? ''));
            $bankName = trim((string)($request->input('bankName') ?? $request->input('bank_name', 'Wallet Direct Credit')));
            $accountNumber = trim((string)($request->input('accountNumber') ?? $request->input('account_number', '')));
            $accountName = trim((string)($request->input('accountName') ?? $request->input('account_name', '')));
            if ($merchantPhone === '' && $this->activeProviderId === 'vtpass') {
                $dispatch = $this->adapter->processAirtimeSwap($network, $phone, $amount);
            } else {
                $ussdFormatted = $ussdTemplate !== ''
                    ? str_replace(['AMOUNT', '{AMOUNT}'], (string)((int)round($amount)), $ussdTemplate)
                    : "Transfer ₦{$amount} airtime to {$merchantPhone}";
                $dispatch = [
                    'status' => 'pending',
                    'provider_reference' => 'SWP_' . strtoupper(bin2hex(random_bytes(5))),
                    'transfer_number' => $merchantPhone,
                    'ussd_code' => $ussdFormatted,
                    'instructions' => "Dial {$ussdFormatted} from {$phone} to transfer ₦" . number_format($amount, 0) . " {$network} airtime to merchant line {$merchantPhone}. Payout of ₦" . number_format($customerPayout, 2) . " ({$conversionRate}%) will be settled to " . ($accountNumber !== '' ? "{$bankName} ({$accountNumber} - {$accountName})" : 'your Wallet') . " once verified.",
                    'payout_destination' => $accountNumber !== '' ? 'bank' : 'wallet',
                    'bank_name' => $bankName,
                    'account_number' => $accountNumber,
                    'account_name' => $accountName,
                    'estimated_payout' => $customerPayout,
                    'conversion_rate_percent' => $conversionRate,
                ];
            }
            $orderId = Security::generateUuid();

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "airtime_swap", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, "pending", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $network,
                    'phone' => $phone,
                    'plan' => "₦{$amount} Airtime Swap ({$conversionRate}%)",
                    'amt' => $amount,
                    'cost' => $customerPayout,
                    'profit' => $expectedProfit,
                    'prov' => $this->activeProviderId,
                    'pref' => $dispatch['provider_reference'] ?? ('SWP_' . strtoupper(bin2hex(random_bytes(5)))),
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(array_merge($dispatch, [
                        'conversion_rate_percent' => $conversionRate,
                        'customer_payout' => $customerPayout,
                        'wholesale_value' => $wholesaleValue,
                    ])),
                ]
            );

            $order = [
                'id' => $orderId,
                'reference' => $dispatch['provider_reference'] ?? $orderId,
                'service' => 'airtime_swap',
                'service_type' => 'airtime_swap',
                'network' => $network,
                'recipient' => $phone,
                'phone' => $phone,
                'plan' => "₦{$amount} Airtime Swap",
                'amount' => $amount,
                'payout_amount' => $customerPayout,
                'status' => 'pending',
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'order' => $order,
                'transfer_number' => $dispatch['transfer_number'] ?? ($swapConfig['merchant_phone'] ?? ''),
                'instructions' => $dispatch['instructions'] ?? ($swapConfig['ussd_code'] ?? ''),
                'swapDetails' => $dispatch,
            ], 'Airtime swap initiated! Please transfer airtime to complete.');
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error('Failed to initiate airtime swap: ' . $e->getMessage(), 502);
        }
    }

    /**
     * 8. GET /api/telecom/cable/validate & POST /api/telecom/verify-smartcard
     */
    public function validateSmartcard(Request $request): void
    {
        Auth::requireAuth($request);
        $provider = (string)($request->input('provider') ?? $request->query('provider', 'gotv'));
        $smartcard = trim((string)($request->input('smartcardNumber') ?? $request->input('smartcard') ?? $request->query('smartcardNumber') ?? $request->query('smartcard', '')));

        if (empty($smartcard)) {
            Response::error('Smartcard number required.', 422);
        }

        try {
            $res = $this->adapter->validateSmartcard($provider, $smartcard);
            Response::success([
                'success' => true,
                'provider' => $provider,
                'smartcardNumber' => $smartcard,
                'customerName' => $res['customer_name'] ?? 'Verified Customer',
                'dueDate' => $res['due_date'] ?? date('Y-m-d', strtotime('+30 days')),
                'status' => $res['status'] ?? 'active',
                'bouquet' => $res['bouquet'] ?? '',
                'data' => $res,
            ]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    /**
     * 9. POST /api/telecom/cable/subscribe and /api/telecom/purchase-cable
     */
    public function renewCable(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $provider = strtolower(trim((string)$request->input('provider', 'gotv')));
        $smartcard = trim((string)($request->input('smartcardNumber') ?? $request->input('smartcard', '')));
        $packageCode = trim((string)($request->input('packageId') ?? $request->input('package_code', '')));
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if ($smartcard === '' || $packageCode === '') {
            Response::error('Smartcard/IUC number and cable package selection are required.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'cable', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing cable subscription order.');
                return;
            }
        }

        $pkg = $this->db->fetchOne(
            'SELECT * FROM cable_packages WHERE (id = :id OR code = :code) AND is_active = 1 LIMIT 1',
            ['id' => $packageCode, 'code' => $packageCode]
        );
        if (!$pkg) {
            Response::error('Selected cable TV package is unavailable or inactive.', 404);
            return;
        }

        $amount = (float)$pkg['price'];
        if ($amount <= 0) {
            Response::error('Cable TV package price is not configured.', 422);
            return;
        }
        $wholesaleCost = (float)($pkg['wholesale_cost'] ?? 0) > 0 ? (float)$pkg['wholesale_cost'] : $amount;
        $profit = round($amount - $wholesaleCost, 2);
        $planLabel = ($pkg['name'] ?? strtoupper($provider)) . ' Subscription';

        // Enforce compulsory Transaction PIN before lock & debit
        $this->verifyTransactionPinOrFail($user, $request, 'telecom_bills', 'cable');

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'cable', $idempotencyKey !== '' ? $idempotencyKey : ($smartcard . '|' . $pkg['id']));
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'cable', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing cable subscription order.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'cable', $smartcard, $amount, $planLabel, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical cable subscription for this smartcard was just submitted. Please check your Order History.', 409);
            return;
        }

        $reference = 'UD_CAB_' . strtoupper(bin2hex(random_bytes(6)));
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $amount,
                'cable_tv',
                $reference,
                "Cable TV renewal for {$provider} (IUC: {$smartcard})",
                'internal',
                ['package_id' => $pkg['id'], 'smartcard' => $smartcard]
            );
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        try {
            $dispatch = $this->adapter->renewCable((string)($pkg['provider'] ?: $provider), $smartcard, (string)($pkg['code'] ?: $packageCode));
            $orderStatus = ($dispatch['status'] ?? 'successful') === 'pending' ? 'pending' : 'successful';
            if (isset($dispatch['cost_price']) && is_numeric($dispatch['cost_price']) && (float)$dispatch['cost_price'] > 0) {
                $wholesaleCost = round((float)$dispatch['cost_price'], 2);
                $profit = round($amount - $wholesaleCost, 2);
            }

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "cable", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, :st, :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => strtoupper((string)($pkg['provider'] ?: $provider)),
                    'phone' => $smartcard,
                    'plan' => $planLabel,
                    'amt' => $amount,
                    'cost' => $wholesaleCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $dispatch['provider_reference'] ?? $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'st' => $orderStatus,
                    'meta' => json_encode($dispatch),
                ]
            );

            $order = [
                'id' => $orderId,
                'reference' => $reference,
                'service' => 'cable',
                'service_type' => 'cable',
                'recipient' => $smartcard,
                'phone' => $smartcard,
                'plan' => $planLabel,
                'amount' => $amount,
                'status' => $orderStatus,
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'cable', $orderStatus === 'pending' ? 'CABLE_PENDING' : 'CABLE_RENEWED', $reference, $amount, $orderStatus, $this->activeProviderId);
            if ($orderStatus === 'successful') {
                $this->triggerReferralReward((string)$user['id'], 'cable', 'cable', 'TEL_' . $orderId, $amount, $wholesaleCost);
            }

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'reference' => $reference,
                'status' => $orderStatus,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], $orderStatus === 'pending' ? 'Cable TV subscription order is processing.' : 'Cable TV subscription renewed successfully!');
        } catch (Throwable $e) {
            $this->walletService->credit($user['id'], $amount, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed cable subscription {$reference}");
            $this->db->execute(
                'INSERT INTO telecom_orders (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES (:id, :uid, "cable", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => strtoupper((string)($pkg['provider'] ?: $provider)),
                    'phone' => $smartcard,
                    'plan' => $planLabel,
                    'amt' => $amount,
                    'cost' => $wholesaleCost,
                    'prov' => $this->activeProviderId,
                    'pref' => $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(['error' => $e->getMessage()]),
                ]
            );
            $this->logFootprint($user, 'cable', 'CABLE_FAILED', $reference, $amount, 'failed', $this->activeProviderId, $e->getMessage());
            $this->releaseOrderLock($lockKey);
            Response::error('Failed to renew cable: ' . $e->getMessage() . '. Wallet refunded.', 502);
        }
    }

    /**
     * 10. GET /api/telecom/electricity/validate & POST /api/telecom/verify-meter
     */
    public function validateMeter(Request $request): void
    {
        Auth::requireAuth($request);
        $disco = (string)($request->input('discoId') ?? $request->input('disco') ?? $request->query('discoId') ?? $request->query('disco', 'ikeja-electric'));
        $meterNumber = trim((string)($request->input('meterNumber') ?? $request->input('meter_number') ?? $request->query('meterNumber') ?? $request->query('meter_number', '')));
        $meterType = (string)($request->input('meterType') ?? $request->input('meter_type') ?? $request->query('meterType') ?? $request->query('meter_type', 'prepaid'));

        if (empty($meterNumber)) {
            Response::error('Meter number required.', 422);
        }

        try {
            $res = $this->adapter->validateMeter($disco, $meterNumber, $meterType);
            Response::success([
                'success' => true,
                'discoId' => $disco,
                'discoName' => strtoupper(str_replace('-', ' ', $disco)),
                'meterNumber' => $meterNumber,
                'meterType' => $meterType,
                'customerName' => $res['customer_name'] ?? 'Verified Customer',
                'address' => $res['address'] ?? 'Customer Address',
                'tariffClass' => 'R2 Residential',
                'data' => $res,
            ]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    /**
     * 11. POST /api/telecom/electricity/pay & /api/telecom/purchase-electricity
     */
    public function vendElectricity(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $discoCode = trim((string)($request->input('discoId') ?? $request->input('disco', 'ikeja-electric')));
        $meterNumber = trim((string)($request->input('meterNumber') ?? $request->input('meter_number', '')));
        $meterType = trim((string)($request->input('meterType') ?? $request->input('meter_type', 'prepaid')));
        $amount = (float)$request->input('amount', 0);
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if ($meterNumber === '' || $amount < 500) {
            Response::error('Meter number and minimum ₦500 amount are required.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'electricity', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing electricity token order.');
                return;
            }
        }

        $this->verifyTransactionPinOrFail($user, $request, 'telecom_bills', 'electricity');

        $commissionPct = $this->readSettingFloat('electricity_commission_percent', 1.5, 0.0, 20.0);
        $wholesaleCost = round($amount * (1 - ($commissionPct / 100)), 2);
        $planLabel = strtoupper($discoCode) . ' Token';

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'electricity', $idempotencyKey !== '' ? $idempotencyKey : ($meterNumber . '|' . round($amount, 2)));
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'electricity', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing electricity token order.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'electricity', $meterNumber, $amount, $planLabel, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical electricity payment for this meter was just submitted. Please check your Order History.', 409);
            return;
        }

        $reference = 'UD_ELE_' . strtoupper(bin2hex(random_bytes(6)));
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $amount,
                'electricity',
                $reference,
                "Electricity payment for {$discoCode} (Meter: {$meterNumber})",
                'internal',
                ['disco' => $discoCode, 'meter_number' => $meterNumber, 'meter_type' => $meterType]
            );
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        try {
            $dispatch = $this->adapter->vendElectricity($discoCode, $meterNumber, $amount, $meterType);
            $orderStatus = ($dispatch['status'] ?? 'successful') === 'pending' ? 'pending' : 'successful';
            if (isset($dispatch['cost_price']) && is_numeric($dispatch['cost_price']) && (float)$dispatch['cost_price'] > 0) {
                $wholesaleCost = round((float)$dispatch['cost_price'], 2);
            }
            $profit = round($amount - $wholesaleCost, 2);

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "electricity", :net, :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, :st, :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => strtoupper($discoCode),
                    'phone' => $meterNumber,
                    'plan' => $planLabel,
                    'amt' => $amount,
                    'cost' => $wholesaleCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $dispatch['provider_reference'] ?? $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'st' => $orderStatus,
                    'meta' => json_encode($dispatch),
                ]
            );

            $token = $dispatch['token'] ?? '';
            $units = $dispatch['units'] ?? 'Standard Units';

            $order = [
                'id' => $orderId,
                'reference' => $reference,
                'service' => 'electricity',
                'service_type' => 'electricity',
                'recipient' => $meterNumber,
                'phone' => $meterNumber,
                'plan' => strtoupper($discoCode) . ' Electricity',
                'amount' => $amount,
                'status' => $orderStatus,
                'created_at' => date('Y-m-d H:i:s'),
                'token' => $token,
                'units' => $units,
            ];

            $this->logFootprint($user, 'electricity', $orderStatus === 'pending' ? 'ELECTRICITY_PENDING' : 'ELECTRICITY_VENDED', $reference, $amount, $orderStatus, $this->activeProviderId);
            if ($orderStatus === 'successful') {
                $this->triggerReferralReward((string)$user['id'], 'electricity', 'electricity', 'TEL_' . $orderId, $amount, $wholesaleCost);
            }

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'reference' => $reference,
                'token' => $token,
                'units' => $units,
                'status' => $orderStatus,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], $orderStatus === 'pending' ? 'Electricity token order is processing.' : 'Prepaid token generated successfully!');
        } catch (Throwable $e) {
            $this->walletService->credit($user['id'], $amount, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed electricity token {$reference}");
            $this->db->execute(
                'INSERT INTO telecom_orders (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES (:id, :uid, "electricity", :net, :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => strtoupper($discoCode),
                    'phone' => $meterNumber,
                    'plan' => $planLabel,
                    'amt' => $amount,
                    'cost' => $wholesaleCost,
                    'prov' => $this->activeProviderId,
                    'pref' => $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(['error' => $e->getMessage()]),
                ]
            );
            $this->logFootprint($user, 'electricity', 'ELECTRICITY_FAILED', $reference, $amount, 'failed', $this->activeProviderId, $e->getMessage());
            $this->releaseOrderLock($lockKey);
            Response::error('Failed to vend electricity token: ' . $e->getMessage() . '. Wallet refunded.', 502);
        }
    }

    /**
     * 12. POST /api/telecom/exam/purchase & /api/telecom/purchase-exam-pin
     */
    public function vendExamPin(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $examName = strtoupper(trim((string)($request->input('examId') ?? $request->input('exam_name', 'WAEC'))));
        $quantity = max(1, min(10, (int)$request->input('quantity', 1)));
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'exam', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing exam PIN order.');
                return;
            }
        }

        $exam = $this->db->fetchOne('SELECT * FROM exam_packages WHERE (UPPER(exam_name) = :name OR id = :id) AND is_active = 1 LIMIT 1', [
            'name' => $examName,
            'id' => strtolower($examName),
        ]);
        if (!$exam) {
            Response::error('Selected examination package is unavailable.', 404);
            return;
        }

        $this->verifyTransactionPinOrFail($user, $request, 'telecom_bills', 'exam_pin');

        $totalPrice = round((float)$exam['price'] * $quantity, 2);
        $wholesaleCost = round((float)$exam['wholesale_cost'] * $quantity, 2);
        $profit = round($totalPrice - $wholesaleCost, 2);
        $planLabel = "{$quantity}x {$exam['exam_name']} PINs";

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'exam', $idempotencyKey !== '' ? $idempotencyKey : ($exam['exam_name'] . '|' . $quantity));
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'exam', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing exam PIN order.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'exam', 'CARD_PRINT', $totalPrice, $planLabel, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical examination PIN purchase was just submitted. Please check your Order History.', 409);
            return;
        }

        $reference = 'UD_EXM_' . strtoupper(bin2hex(random_bytes(6)));
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $totalPrice,
                'exam_pin',
                $reference,
                "{$quantity}x {$exam['exam_name']} Result Checker Tokens",
                'internal',
                ['exam_id' => $exam['id'], 'quantity' => $quantity]
            );
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        try {
            $examPlanId = !empty($exam['provider_plan_id']) ? (int)$exam['provider_plan_id'] : null;
            if ($this->adapter instanceof UlamaDataAdapter) {
                $dispatch = $this->adapter->vendExamPin($exam['exam_name'], $quantity, $examPlanId, $reference);
            } else {
                $dispatch = $this->adapter->vendExamPin($exam['exam_name'], $quantity);
            }
            $orderStatus = ($dispatch['status'] ?? 'successful') === 'pending' ? 'pending' : 'successful';

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "exam", :net, "CARD_PRINT", :plan, :amt, :cost, :profit, :prov, :pref, :ikey, :st, :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => strtoupper((string)$exam['exam_name']),
                    'plan' => $planLabel,
                    'amt' => $totalPrice,
                    'cost' => $wholesaleCost,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $dispatch['provider_reference'] ?? $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'st' => $orderStatus,
                    'meta' => json_encode($dispatch),
                ]
            );

            $order = [
                'id' => $orderId,
                'reference' => $reference,
                'service' => 'exam',
                'service_type' => 'exam',
                'recipient' => 'CARD_PRINT',
                'plan' => $planLabel,
                'amount' => $totalPrice,
                'status' => $orderStatus,
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'exam', $orderStatus === 'pending' ? 'EXAM_PIN_PENDING' : 'EXAM_PIN_VENDED', $reference, $totalPrice, $orderStatus, $this->activeProviderId);
            if ($orderStatus === 'successful') {
                $this->triggerReferralReward((string)$user['id'], 'exam_pin', 'exam_pin', 'TEL_' . $orderId, $totalPrice, $wholesaleCost);
            }

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'reference' => $reference,
                'pins' => $dispatch['cards'] ?? [],
                'quantity' => $quantity,
                'status' => $orderStatus,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], "{$quantity} {$exam['exam_name']} PINs generated successfully!");
        } catch (Throwable $e) {
            $this->walletService->credit($user['id'], $totalPrice, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed exam PIN {$reference}");
            $this->db->execute(
                'INSERT INTO telecom_orders (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES (:id, :uid, "exam", :net, "CARD_PRINT", :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => strtoupper((string)$exam['exam_name']),
                    'plan' => $planLabel,
                    'amt' => $totalPrice,
                    'cost' => $wholesaleCost,
                    'prov' => $this->activeProviderId,
                    'pref' => $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(['error' => $e->getMessage()]),
                ]
            );
            $this->logFootprint($user, 'exam', 'EXAM_PIN_FAILED', $reference, $totalPrice, 'failed', $this->activeProviderId, $e->getMessage());
            $this->releaseOrderLock($lockKey);
            Response::error('Failed to purchase exam PINs: ' . $e->getMessage() . '. Wallet refunded.', 502);
        }
    }

    /**
     * 13. POST /api/telecom/bulksms & /api/telecom/send-bulksms
     */
    public function sendBulkSms(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $smsCfg = self::readBulkSmsSettings($this->db);
        if (!$smsCfg['enabled']) {
            Response::error('Bulk SMS service is currently disabled by administrator.', 403);
            return;
        }

        $senderIdRaw = trim((string)($request->input('senderId') ?? $request->input('sender_id', $smsCfg['default_sender'])));
        $senderId = substr(preg_replace('/[^A-Za-z0-9._ -]/', '', $senderIdRaw) ?: $smsCfg['default_sender'], 0, 11);
        $recipientsInput = $request->input('recipients', []);
        $rawList = is_string($recipientsInput) ? preg_split('/[\s,;]+/', $recipientsInput) : (array)$recipientsInput;
        $recipients = array_values(array_unique(array_filter(array_map('trim', $rawList ?: []), static fn ($r) => $r !== '')));
        $message = trim((string)$request->input('message', ''));
        $idempotencyKey = $this->extractIdempotencyKey($request);

        if (empty($recipients) || $message === '') {
            Response::error('Valid recipients and message content are required.', 422);
            return;
        }
        if (count($recipients) > (int)$smsCfg['max_recipients']) {
            Response::error('Maximum allowed recipients per dispatch is ' . (int)$smsCfg['max_recipients'] . '.', 422);
            return;
        }

        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'bulksms', $idempotencyKey);
            if ($existingOrder) {
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing Bulk SMS dispatch.');
                return;
            }
        }

        $this->verifyTransactionPinOrFail($user, $request, 'telecom_bulksms', 'bulksms');

        $pages = max(1, (int)ceil(mb_strlen($message, 'UTF-8') / 160));
        $units = count($recipients) * $pages;
        $totalCost = round($units * (float)$smsCfg['unit_price'], 2);
        $wholesaleTotal = round($units * (float)$smsCfg['wholesale_unit_price'], 2);
        $profit = round($totalCost - $wholesaleTotal, 2);
        $recipientPreview = substr(implode(',', $recipients), 0, 100);
        $planLabel = "Bulk SMS ({$units} units)";

        $lockKey = $this->acquireOrderLock((string)$user['id'], 'bulksms', $idempotencyKey !== '' ? $idempotencyKey : hash('sha256', $recipientPreview . '|' . $message));
        if ($idempotencyKey !== '') {
            $existingOrder = $this->findIdempotentOrder((string)$user['id'], 'bulksms', $idempotencyKey);
            if ($existingOrder) {
                $this->releaseOrderLock($lockKey);
                $this->respondExistingOrder((string)$user['id'], $existingOrder, 'Duplicate request prevented; returning existing Bulk SMS dispatch.');
                return;
            }
        }
        if ($this->hasRecentDuplicateOrder((string)$user['id'], 'bulksms', $recipientPreview, $totalCost, $planLabel, 15)) {
            $this->releaseOrderLock($lockKey);
            Response::error('An identical Bulk SMS dispatch was just submitted. Please check your Order History.', 409);
            return;
        }

        $reference = 'UD_SMS_' . strtoupper(bin2hex(random_bytes(6)));
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $totalCost,
                'bulksms',
                $reference,
                'Bulk SMS to ' . count($recipients) . " recipients ({$units} units)",
                'internal',
                ['sender_id' => $senderId, 'recipients_count' => count($recipients), 'units' => $units]
            );
        } catch (Throwable $e) {
            $this->releaseOrderLock($lockKey);
            Response::error($e->getMessage(), 400);
            return;
        }

        $orderId = Security::generateUuid();
        try {
            $dispatch = $this->adapter->sendBulkSms($senderId, $recipients, $message);
            $orderStatus = ($dispatch['status'] ?? 'successful') === 'pending' ? 'pending' : 'successful';

            $this->db->execute(
                'INSERT INTO telecom_orders
                 (id, user_id, service_type, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES
                 (:id, :uid, "bulksms", :phone, :plan, :amt, :cost, :profit, :prov, :pref, :ikey, :st, :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'phone' => $recipientPreview,
                    'plan' => $planLabel,
                    'amt' => $totalCost,
                    'cost' => $wholesaleTotal,
                    'profit' => $profit,
                    'prov' => $this->activeProviderId,
                    'pref' => $dispatch['provider_reference'] ?? $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'st' => $orderStatus,
                    'meta' => json_encode($dispatch),
                ]
            );

            $order = [
                'id' => $orderId,
                'reference' => $reference,
                'service' => 'bulksms',
                'service_type' => 'bulksms',
                'recipient' => $recipientPreview,
                'plan' => $planLabel,
                'amount' => $totalCost,
                'status' => $orderStatus,
                'created_at' => date('Y-m-d H:i:s'),
            ];

            $this->logFootprint($user, 'bulksms', $orderStatus === 'pending' ? 'BULKSMS_PENDING' : 'BULKSMS_SENT', $reference, $totalCost, $orderStatus, $this->activeProviderId);
            if ($orderStatus === 'successful') {
                $this->triggerReferralReward((string)$user['id'], 'bulksms', 'bulksms', 'TEL_' . $orderId, $totalCost, $wholesaleTotal);
            }

            $this->releaseOrderLock($lockKey);
            Response::success([
                'order_id' => $orderId,
                'messageId' => $orderId,
                'pages' => $pages,
                'recipientCount' => count($recipients),
                'recipients_count' => count($recipients),
                'units_charged' => $units,
                'status' => $orderStatus,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'order' => $order,
            ], 'Bulk SMS dispatched successfully!');
        } catch (Throwable $e) {
            $this->walletService->credit($user['id'], $totalCost, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed Bulk SMS {$reference}");
            $this->db->execute(
                'INSERT INTO telecom_orders (id, user_id, service_type, phone, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at)
                 VALUES (:id, :uid, "bulksms", :phone, :plan, :amt, :cost, 0.00, :prov, :pref, :ikey, "failed", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'phone' => $recipientPreview,
                    'plan' => $planLabel,
                    'amt' => $totalCost,
                    'cost' => $wholesaleTotal,
                    'prov' => $this->activeProviderId,
                    'pref' => $reference,
                    'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
                    'meta' => json_encode(['error' => $e->getMessage()]),
                ]
            );
            $this->logFootprint($user, 'bulksms', 'BULKSMS_FAILED', $reference, $totalCost, 'failed', $this->activeProviderId, $e->getMessage());
            $this->releaseOrderLock($lockKey);
            Response::error('Failed to send Bulk SMS: ' . $e->getMessage() . '. Wallet refunded.', 502);
        }
    }

    /**
     * 14. POST /api/telecom/webhook (Ulamadata Webhook Handler)
     * Authenticated (HMAC/Bearer secret OR mandatory fail-closed upstream transaction requery) + atomic FOR UPDATE refund guard
     */
    public function webhook(Request $request): void
    {
        $raw = file_get_contents('php://input') ?: '';
        $auth = $this->verifyWebhookSecretHeader($request, $raw, 'ulamadata', 'ULAMADATA_WEBHOOK_SECRET');
        if ($auth['configured'] && !$auth['authenticated']) {
            Response::unauthorized('Invalid Ulamadata webhook signature.');
            return;
        }

        $payload = json_decode($raw ?: '{}', true) ?: [];
        $ref = $payload['request-id'] ?? ($payload['ident'] ?? ($payload['reference'] ?? ($payload['id'] ?? null)));
        if (!$ref) {
            Response::error('Missing transaction reference', 400);
            return;
        }

        $order = $this->db->fetchOne('SELECT * FROM telecom_orders WHERE provider_ref = :ref OR id = :id LIMIT 1', [
            'ref' => (string)$ref,
            'id' => (string)$ref,
        ]);

        if (!$order) {
            if (!$auth['authenticated']) {
                Response::unauthorized('Webhook authentication failed.');
                return;
            }
            Response::success(['status' => 'ignored', 'message' => 'Reference not found in local orders']);
            return;
        }

        $upstreamPayload = $payload;
        if (!$auth['authenticated']) {
            // Fail closed unless upstream provider confirms the exact status for this reference
            $queryRef = (string)($order['provider_ref'] ?: $ref);
            try {
                $ulama = $this->adapter instanceof UlamaDataAdapter ? $this->adapter : new UlamaDataAdapter();
                $verified = $ulama->queryTransaction($queryRef);
                $verifiedStatus = strtolower((string)($verified['status'] ?? ($verified['Status'] ?? '')));
                if ($verifiedStatus === '') {
                    Response::unauthorized('Webhook authentication failed: upstream transaction verification returned empty status.');
                    return;
                }
                $upstreamPayload = array_merge($payload, is_array($verified) ? $verified : [], ['status' => $verifiedStatus, 'upstream_reverified' => true]);
            } catch (Throwable) {
                Response::unauthorized('Webhook authentication failed: unable to verify transaction with provider.');
                return;
            }
        }

        $upstreamStatus = strtolower((string)($upstreamPayload['status'] ?? ($upstreamPayload['Status'] ?? '')));
        $isSuccess = in_array($upstreamStatus, ['success', 'successful', 'delivered', 'completed'], true);
        $isFailed = in_array($upstreamStatus, ['failed', 'fail', 'error', 'reversed'], true);

        if (!$isSuccess && !$isFailed) {
            Response::success(['status' => 'ignored', 'reference' => $ref]);
            return;
        }

        $outcome = $this->db->withTransaction(function (Database $db) use ($order, $upstreamPayload, $isSuccess, $isFailed, $ref) {
            $locked = $db->fetchOne('SELECT * FROM telecom_orders WHERE id = :id FOR UPDATE', ['id' => $order['id']]);
            if (!$locked) {
                return 'not_found';
            }
            if ($locked['status'] === 'successful' && $isSuccess) {
                return 'already_processed';
            }
            if (in_array($locked['status'], ['failed', 'refunded'], true)) {
                return 'already_terminal';
            }

            $existingMeta = !empty($locked['metadata']) ? (json_decode((string)$locked['metadata'], true) ?: []) : [];
            $existingMeta['webhook_payload'] = $upstreamPayload;
            $existingMeta['webhook_at'] = date('c');

            if ($isSuccess) {
                if (in_array((string)$locked['service_type'], ['airtime_pin', 'data_pin'], true)) {
                    $expectedQty = max(1, (int)($existingMeta['quantity'] ?? 1));
                    $faceVal = (float)($existingMeta['face_value'] ?? 0);
                    $ulama = $this->adapter instanceof UlamaDataAdapter ? $this->adapter : new UlamaDataAdapter();
                    $parsed = $ulama->parseAndVerifyVouchers($upstreamPayload, $expectedQty, (string)($locked['network'] ?? 'MTN'), $faceVal);
                    if ($parsed['valid']) {
                        try {
                            $denomLabel = (string)$locked['service_type'] === 'airtime_pin'
                                ? ('₦' . number_format($faceVal) . ' Airtime PIN')
                                : (((string)($existingMeta['size'] ?? 'Data')) . ' Data PIN');
                            $this->saveVerifiedVouchers(
                                (string)$locked['id'],
                                (string)$locked['user_id'],
                                (string)$locked['service_type'],
                                (string)($locked['network'] ?? 'MTN'),
                                $denomLabel,
                                $faceVal > 0 ? $faceVal : null,
                                $parsed['vouchers'],
                                (string)($locked['provider_ref'] ?? $ref)
                            );
                            $profit = round((float)$locked['amount'] - (float)$locked['cost_price'], 2);
                            $db->execute(
                                'UPDATE telecom_orders SET status = "successful", profit = :profit, metadata = :meta, updated_at = NOW() WHERE id = :id',
                                ['id' => $locked['id'], 'profit' => $profit, 'meta' => json_encode($existingMeta)]
                            );
                            return 'successful';
                        } catch (Throwable $vx) {
                            $existingMeta['incomplete_vouchers'] = true;
                            $existingMeta['integrity_error'] = $vx->getMessage();
                            $db->execute(
                                'UPDATE telecom_orders SET metadata = :meta, updated_at = NOW() WHERE id = :id',
                                ['id' => $locked['id'], 'meta' => json_encode($existingMeta)]
                            );
                            return 'incomplete_vouchers';
                        }
                    }
                    $existingMeta['incomplete_vouchers'] = true;
                    $existingMeta['integrity_error'] = $parsed['error'];
                    $db->execute(
                        'UPDATE telecom_orders SET metadata = :meta, updated_at = NOW() WHERE id = :id',
                        ['id' => $locked['id'], 'meta' => json_encode($existingMeta)]
                    );
                    return 'incomplete_vouchers';
                }

                $profit = round((float)$locked['amount'] - (float)$locked['cost_price'], 2);
                $db->execute(
                    'UPDATE telecom_orders SET status = "successful", profit = :profit, metadata = :meta, updated_at = NOW() WHERE id = :id',
                    ['id' => $locked['id'], 'profit' => $profit, 'meta' => json_encode($existingMeta)]
                );
                return 'successful';
            }

            if ($isFailed) {
                $db->execute(
                    'UPDATE telecom_orders SET status = "failed", profit = 0.00, metadata = :meta, updated_at = NOW() WHERE id = :id',
                    ['id' => $locked['id'], 'meta' => json_encode($existingMeta)]
                );
                $refundRef = 'REFUND_WH_' . ($locked['provider_ref'] ?: $locked['id']);
                $alreadyRefunded = $db->fetchOne('SELECT id FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $refundRef]);
                if (!$alreadyRefunded) {
                    $this->walletService->credit(
                        $locked['user_id'],
                        (float)$locked['amount'],
                        'manual_adjustment',
                        $refundRef,
                        "Automated refund for failed telecom order {$locked['id']}"
                    );
                }
                return 'failed_refunded';
            }

            return 'noop';
        });

        if ($outcome === 'successful') {
            $this->triggerReferralReward((string)$order['user_id'], $this->mapTelecomReferralCategory((string)$order['service_type']), (string)$order['service_type'], 'TEL_' . $order['id'], (float)$order['amount'], (float)$order['cost_price']);
        } elseif ($outcome === 'failed_refunded') {
            try {
                (new ReferralEngineService($this->db))->reverseRewardsForSource('TEL_' . $order['id'], 'Telecom webhook failure refund');
            } catch (Throwable) {
            }
        }

        if ($outcome === 'already_processed') {
            Response::success(['status' => 'already_processed']);
            return;
        }

        Response::success(['status' => 'reconciled', 'outcome' => $outcome, 'reference' => $ref]);
    }

    /**
     * 15. GET /api/telecom/orders and /api/telecom/history
     */
    public function orders(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $limit = min(100, max(1, (int)$request->query('limit', 50)));
        $service = (string)$request->query('service', '');
        $search = (string)$request->query('search', '');

        $selectCols = $isAdmin
            ? 'id, service_type, service_type as service, network, phone, phone as recipient, plan, amount, cost_price, profit, provider_id as provider, provider_ref, status, metadata, created_at'
            : 'id, service_type, service_type as service, network, phone, phone as recipient, plan, amount, status, metadata, created_at';

        $sql = "SELECT {$selectCols} FROM telecom_orders WHERE user_id = :uid ";
        $params = ['uid' => $user['id']];

        if (!empty($service) && $service !== 'all') {
            $sql .= 'AND service_type = :srv ';
            $params['srv'] = $service;
        }
        if (!empty($search)) {
            $sql .= 'AND (phone LIKE :srch OR plan LIKE :srch2 OR id LIKE :srch3) ';
            $params['srch'] = "%{$search}%";
            $params['srch2'] = "%{$search}%";
            $params['srch3'] = "%{$search}%";
        }

        $sql .= 'ORDER BY created_at DESC LIMIT ' . (int)$limit;

        $rows = $this->db->fetchAll($sql, $params);
        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
            $meta = !empty($r['metadata'])
                ? (is_string($r['metadata']) ? json_decode($r['metadata'], true) : $r['metadata'])
                : null;
            if (!$isAdmin) {
                $safeRef = is_array($meta) && !empty($meta['internal_reference'])
                    ? (string)$meta['internal_reference']
                    : ('HT-' . strtoupper(substr(str_replace('-', '', (string)$r['id']), 0, 10)));
                $r['reference'] = $safeRef;
                $r['provider_ref'] = $safeRef;
                if (is_array($meta)) {
                    unset(
                        $meta['raw'],
                        $meta['raw_response'],
                        $meta['provider'],
                        $meta['provider_id'],
                        $meta['provider_reference'],
                        $meta['provider_ref'],
                        $meta['wholesale_cost'],
                        $meta['cost_price'],
                        $meta['endpoint'],
                        $meta['api_url'],
                        $meta['webhook_payload']
                    );
                }
            }
            $r['metadata'] = $meta;
            if (in_array((string)$r['service_type'], ['airtime_pin', 'data_pin'], true) && $r['status'] === 'successful') {
                $vouchers = $this->fetchOrderVouchers((string)$r['id']);
                $r['vouchers'] = $vouchers;
                $r['voucher_count'] = count($vouchers);
            } else {
                $r['voucher_count'] = 0;
            }
        }

        Response::success([
            'count' => count($rows),
            'orders' => $rows,
        ]);
    }

    /**
     * 15b. GET /api/telecom/vouchers/:id
     * Protected voucher retrieval for the authenticated order owner (or admin).
     */
    public function orderVouchers(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $orderId = trim((string)($request->param('id') ?? ''));
        if ($orderId === '') {
            Response::error('Order ID is required.', 400);
            return;
        }

        $order = $this->db->fetchOne('SELECT * FROM telecom_orders WHERE id = :id LIMIT 1', ['id' => $orderId]);
        if (!$order) {
            Response::error('PIN order not found.', 404);
            return;
        }
        if (!$isAdmin && (string)$order['user_id'] !== (string)$user['id']) {
            Response::error('Forbidden: You do not have permission to access vouchers for this order.', 403);
            return;
        }

        $vouchers = $this->fetchOrderVouchers($orderId);
        $meta = !empty($order['metadata']) && is_string($order['metadata']) ? (json_decode($order['metadata'], true) ?: []) : [];
        $safeRef = !empty($meta['internal_reference'])
            ? (string)$meta['internal_reference']
            : ('HT-' . strtoupper(substr(str_replace('-', '', (string)$order['id']), 0, 10)));

        $orderPayload = [
            'id' => $order['id'],
            'service_type' => $order['service_type'],
            'service' => $order['service_type'],
            'network' => $order['network'],
            'phone' => $order['phone'],
            'plan' => $order['plan'],
            'amount' => (float)$order['amount'],
            'status' => $order['status'],
            'reference' => $isAdmin ? ($order['provider_ref'] ?: $safeRef) : $safeRef,
            'provider_ref' => $isAdmin ? $order['provider_ref'] : $safeRef,
            'created_at' => $order['created_at'],
        ];

        Response::success([
            'order' => $orderPayload,
            'vouchers' => $vouchers,
            'voucher_count' => count($vouchers),
        ]);
    }

    /**
     * 16. GET /api/telecom/cable-packages
     */
    public function cablePackages(Request $request): void
    {
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $rows = $this->db->fetchAll('SELECT * FROM cable_packages WHERE is_active = 1 ORDER BY provider ASC, price ASC');
        $grouped = [];
        foreach ($rows as &$r) {
            $r['price'] = (float)$r['price'];
            if ($isAdmin) {
                $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            } else {
                unset($r['wholesale_cost']);
            }
            $prov = strtolower($r['provider']);
            if (!isset($grouped[$prov])) {
                $grouped[$prov] = [];
            }
            $grouped[$prov][] = $r;
        }

        Response::success([
            'packages' => $grouped,
            'rawList' => $rows,
        ]);
    }

    /**
     * 17. GET /api/telecom/electricity-discos
     */
    public function electricityDiscos(Request $request): void
    {
        $rows = $this->db->fetchAll('SELECT * FROM electricity_discos WHERE is_active = 1 ORDER BY name ASC');
        foreach ($rows as &$r) {
            $r['minimum_amount'] = (float)$r['minimum_amount'];
            $r['min'] = $r['minimum_amount'];
        }

        Response::success([
            'discos' => $rows,
        ]);
    }

    /**
     * 18. GET /api/telecom/exam-packages
     */
    public function examPackages(Request $request): void
    {
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $rows = $this->db->fetchAll('SELECT * FROM exam_packages WHERE is_active = 1 ORDER BY price ASC');
        foreach ($rows as &$r) {
            $r['price'] = (float)$r['price'];
            if ($isAdmin) {
                $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            } else {
                unset($r['wholesale_cost']);
            }
        }

        Response::success([
            'packages' => $rows,
        ]);
    }

    /**
     * 19. GET /api/telecom/airtime-pins/denominations
     */
    public function airtimePinDenominations(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        try {
            $liveCount = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM airtime_pin_denominations WHERE id LIKE "apin_ud_%"');
            if ((int)($liveCount['cnt'] ?? 0) === 0 && $this->adapter instanceof UlamaDataAdapter) {
                $this->adapter->syncAirtimePinCatalogue();
            }
        } catch (Throwable) {
        }

        $rows = $this->db->fetchAll(
            'SELECT * FROM airtime_pin_denominations
             WHERE is_active = 1 AND id LIKE "apin_ud_%"
             ORDER BY FIELD(network, "MTN", "AIRTEL", "GLO", "9MOBILE"), value ASC'
        );

        $out = [];
        $hasInStock = false;
        foreach ($rows as $r) {
            $faceValue = (float)$r['value'];
            $selling = (float)$r['price'];
            $availStock = max(0, (int)($r['available_stock'] ?? 0));
            $inStock = $availStock > 0;
            if ($inStock) {
                $hasInStock = true;
            }
            $discountPct = $faceValue > 0 ? round((($faceValue - $selling) / $faceValue) * 100, 2) : 0.0;
            $item = [
                'id' => (string)$r['id'],
                'network' => strtoupper((string)$r['network']),
                'denomination' => $faceValue,
                'price' => $selling,
                'selling_price' => $selling,
                'discount_percent' => $discountPct,
                'discount_rate' => $discountPct,
                'available_stock' => $availStock,
                'in_stock' => $inStock,
                'max_quantity' => max(1, (int)($r['max_quantity'] ?? 50)),
                'enabled' => (bool)$r['is_active'],
            ];
            if ($isAdmin) {
                $item['provider_plan_id'] = (int)($r['provider_plan_id'] ?? 0);
                $item['wholesale_cost'] = (float)$r['wholesale_cost'];
                $item['api_discount'] = (float)($r['api_discount'] ?? 0);
                $item['pricing_mode'] = (string)($r['pricing_mode'] ?? 'default_markup');
                $item['fixed_price'] = $r['fixed_price'] !== null ? (float)$r['fixed_price'] : null;
                $item['markup_percent'] = $r['markup_percent'] !== null ? (float)$r['markup_percent'] : null;
                $item['admin_price_locked'] = (bool)($r['admin_price_locked'] ?? false);
            }
            $out[] = $item;
        }

        Response::success([
            'denominations' => $out,
            'has_in_stock' => $hasInStock,
            'catalogue_status' => count($out) === 0
                ? 'Awaiting live Ulamadata Airtime PIN catalogue sync.'
                : ($hasInStock ? 'available' : 'out_of_stock'),
        ]);
    }

    /**
     * 20. GET /api/telecom/data-pins/denominations
     */
    public function dataPinDenominations(Request $request): void
    {
        $this->ensureDataSchema();
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $rows = $this->db->fetchAll(
            'SELECT * FROM data_pin_denominations
             WHERE is_active = 1 AND provider_plan_id IS NOT NULL AND provider_plan_id > 0
             ORDER BY FIELD(network, "MTN", "AIRTEL", "GLO", "9MOBILE"), price ASC'
        );

        $out = [];
        $hasInStock = false;
        foreach ($rows as $r) {
            $availStock = max(0, (int)($r['available_stock'] ?? 0));
            $inStock = $availStock > 0;
            if ($inStock) {
                $hasInStock = true;
            }
            $item = [
                'id' => (string)$r['id'],
                'network' => strtoupper((string)$r['network']),
                'size' => (string)$r['size'],
                'plan_name' => (string)$r['name'],
                'name' => (string)$r['name'],
                'validity' => (string)($r['validity'] ?? '30 Days'),
                'price' => (float)$r['price'],
                'available_stock' => $availStock,
                'in_stock' => $inStock,
                'max_quantity' => max(1, (int)($r['max_quantity'] ?? 50)),
                'enabled' => (bool)$r['is_active'],
            ];
            if ($isAdmin) {
                $item['provider_plan_id'] = (int)$r['provider_plan_id'];
                $item['wholesale_cost'] = (float)$r['wholesale_cost'];
                $item['pricing_mode'] = (string)($r['pricing_mode'] ?? 'default_markup');
                $item['fixed_price'] = $r['fixed_price'] !== null ? (float)$r['fixed_price'] : null;
                $item['markup_percent'] = $r['markup_percent'] !== null ? (float)$r['markup_percent'] : null;
                $item['discount_percent'] = $r['discount_percent'] !== null ? (float)$r['discount_percent'] : null;
                $item['admin_price_locked'] = (bool)($r['admin_price_locked'] ?? false);
            }
            $out[] = $item;
        }

        Response::success([
            'denominations' => $out,
            'available_for_purchase' => count($out) > 0 && $hasInStock,
            'catalogue_status' => count($out) === 0
                ? 'Awaiting confirmed Ulamadata Data PIN plan IDs and pricing — Data PIN purchases are temporarily disabled.'
                : ($hasInStock ? 'available' : 'out_of_stock'),
        ]);
    }

    /**
     * 21. GET /api/telecom/airtime-swap/config
     */
    public function airtimeSwapConfig(Request $request): void
    {
        $rows = $this->db->fetchAll('SELECT * FROM airtime_swap_configs WHERE is_active = 1');
        foreach ($rows as &$r) {
            $ratePct = (float)$r['conversion_rate_percent'];
            $r['conversion_rate_percent'] = $ratePct;
            $r['conversion_rate'] = $ratePct;
            $r['rate'] = $ratePct;
            $r['min_amount'] = isset($r['min_amount']) ? (float)$r['min_amount'] : 500.0;
            $r['max_amount'] = isset($r['max_amount']) ? (float)$r['max_amount'] : 50000.0;
            $r['ussd_template'] = (string)($r['ussd_code'] ?? '');
            $r['enabled'] = (bool)($r['is_active'] ?? 1);
        }
        Response::success(['configs' => $rows, 'enabled' => self::readAirtimeSwapEnabled($this->db)]);
    }

    /**
     * 22. GET /api/telecom/verify/:ref
     */
    public function verifyTransaction(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $ref = (string)($request->param('ref') ?? $request->query('reference', ''));
        if (empty($ref)) {
            Response::error('Reference required', 400);
            return;
        }

        $order = $this->db->fetchOne(
            'SELECT * FROM telecom_orders WHERE provider_ref = :ref OR id = :id OR idempotency_key = :ikey LIMIT 1',
            [
                'ref' => $ref,
                'id' => $ref,
                'ikey' => $ref,
            ]
        );
        if (!$order && str_starts_with(strtoupper($ref), 'HT-')) {
            $hexPrefix = strtoupper(substr($ref, 3));
            if ($hexPrefix !== '' && ctype_xdigit($hexPrefix)) {
                $order = $this->db->fetchOne(
                    "SELECT * FROM telecom_orders WHERE REPLACE(UPPER(id), '-', '') LIKE :pfx ORDER BY created_at DESC LIMIT 1",
                    ['pfx' => $hexPrefix . '%']
                );
            }
        }
        if (!$order) {
            $order = $this->db->fetchOne(
                'SELECT * FROM telecom_orders WHERE metadata LIKE :iref ORDER BY created_at DESC LIMIT 1',
                ['iref' => '%"internal_reference":"' . $ref . '"%']
            );
        }

        if ($order && !$isAdmin && $order['user_id'] !== $user['id']) {
            Response::error('Order not found', 404);
            return;
        }

        $queryRef = $order['provider_ref'] ?? $ref;

        try {
            $res = $this->adapter->queryTransaction($queryRef);
            $upStatus = strtolower((string)($res['status'] ?? ($res['Status'] ?? '')));
            if ($order && $order['status'] === 'pending') {
                if (in_array($upStatus, ['success', 'successful', 'delivered', 'completed'], true)) {
                    if (in_array((string)$order['service_type'], ['airtime_pin', 'data_pin'], true)) {
                        $existingMeta = !empty($order['metadata']) && is_string($order['metadata']) ? (json_decode($order['metadata'], true) ?: []) : [];
                        $expectedQty = max(1, (int)($existingMeta['quantity'] ?? 1));
                        $faceVal = (float)($existingMeta['face_value'] ?? 0);
                        $ulama = $this->adapter instanceof UlamaDataAdapter ? $this->adapter : new UlamaDataAdapter();
                        $parsed = $ulama->parseAndVerifyVouchers(is_array($res) ? $res : [], $expectedQty, (string)($order['network'] ?? 'MTN'), $faceVal);
                        if ($parsed['valid']) {
                            $denomLabel = (string)$order['service_type'] === 'airtime_pin'
                                ? ('₦' . number_format($faceVal) . ' Airtime PIN')
                                : (((string)($existingMeta['size'] ?? 'Data')) . ' Data PIN');
                            $this->saveVerifiedVouchers(
                                (string)$order['id'],
                                (string)$order['user_id'],
                                (string)$order['service_type'],
                                (string)($order['network'] ?? 'MTN'),
                                $denomLabel,
                                $faceVal > 0 ? $faceVal : null,
                                $parsed['vouchers'],
                                (string)$queryRef
                            );
                            $profit = round((float)$order['amount'] - (float)$order['cost_price'], 2);
                            $this->db->execute(
                                'UPDATE telecom_orders SET status = "successful", profit = :profit, updated_at = NOW() WHERE id = :id',
                                ['id' => $order['id'], 'profit' => $profit]
                            );
                            $order['status'] = 'successful';
                            $this->triggerReferralReward((string)$order['user_id'], $this->mapTelecomReferralCategory((string)$order['service_type']), (string)$order['service_type'], 'TEL_' . $order['id'], (float)$order['amount'], (float)$order['cost_price']);
                        } else {
                            $existingMeta['incomplete_vouchers'] = true;
                            $existingMeta['integrity_error'] = $parsed['error'];
                            $this->db->execute(
                                'UPDATE telecom_orders SET metadata = :meta, updated_at = NOW() WHERE id = :id',
                                ['id' => $order['id'], 'meta' => json_encode($existingMeta)]
                            );
                        }
                    } else {
                        $profit = round((float)$order['amount'] - (float)$order['cost_price'], 2);
                        $this->db->execute(
                            'UPDATE telecom_orders SET status = "successful", profit = :profit, updated_at = NOW() WHERE id = :id',
                            ['id' => $order['id'], 'profit' => $profit]
                        );
                        $order['status'] = 'successful';
                        $this->triggerReferralReward((string)$order['user_id'], $this->mapTelecomReferralCategory((string)$order['service_type']), (string)$order['service_type'], 'TEL_' . $order['id'], (float)$order['amount'], (float)$order['cost_price']);
                    }
                } elseif (in_array($upStatus, ['failed', 'fail', 'error', 'reversed'], true)) {
                    $refunded = $this->db->withTransaction(function (Database $db) use ($order) {
                        $locked = $db->fetchOne('SELECT * FROM telecom_orders WHERE id = :id FOR UPDATE', ['id' => $order['id']]);
                        if (!$locked || in_array($locked['status'], ['failed', 'refunded'], true)) {
                            return false;
                        }
                        $db->execute('UPDATE telecom_orders SET status = "failed", profit = 0.00, updated_at = NOW() WHERE id = :id', ['id' => $locked['id']]);
                        $refundRef = 'REFUND_VQ_' . ($locked['provider_ref'] ?: $locked['id']);
                        $alreadyRefunded = $db->fetchOne('SELECT id FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $refundRef]);
                        if (!$alreadyRefunded) {
                            $this->walletService->credit($locked['user_id'], (float)$locked['amount'], 'manual_adjustment', $refundRef, "Refund for failed telecom order {$locked['id']}");
                        }
                        return true;
                    });
                    if ($refunded) {
                        try {
                            (new ReferralEngineService($this->db))->reverseRewardsForSource('TEL_' . $order['id'], 'Telecom transaction verify refund');
                        } catch (Throwable) {
                        }
                    }
                    $order['status'] = 'failed';
                }
            }

            $vouchers = [];
            if ($order && in_array((string)$order['service_type'], ['airtime_pin', 'data_pin'], true) && $order['status'] === 'successful') {
                $vouchers = $this->fetchOrderVouchers((string)$order['id']);
                $order['vouchers'] = $vouchers;
                $order['voucher_count'] = count($vouchers);
            }

            if (!$isAdmin && $order) {
                unset($order['provider_id'], $order['cost_price'], $order['profit'], $order['metadata'], $order['provider_ref']);
            }
            if (!$isAdmin && is_array($res)) {
                $res = [
                    'status' => $order['status'] ?? ($res['status'] ?? 'unknown'),
                    'message' => $res['api_response'] ?? ($res['response'] ?? ($res['message'] ?? 'Status verified')),
                ];
            }

            Response::success([
                'success' => true,
                'result' => $res,
                'order' => $order,
                'vouchers' => $vouchers,
            ]);
        } catch (Throwable $e) {
            if (!$isAdmin && $order) {
                unset($order['provider_id'], $order['cost_price'], $order['profit'], $order['metadata'], $order['provider_ref']);
            }
            Response::success([
                'success' => true,
                'result' => ['status' => $order['status'] ?? 'unknown', 'message' => $e->getMessage()],
                'order' => $order,
            ]);
        }
    }

    /**
     * 23. GET /api/telecom/providers
     * Customers receive safe service/network availability; Admins receive live provider diagnostics.
     */
    public function providers(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $airtimeDiscount = $this->getAirtimeDiscountPercent();

        if (!$isAdmin) {
            Response::success([
                'status' => 'operational',
                'airtime_discount_percent' => $airtimeDiscount,
                'networks' => [
                    ['code' => 'MTN', 'name' => 'MTN Nigeria', 'status' => 'operational'],
                    ['code' => 'AIRTEL', 'name' => 'Airtel Nigeria', 'status' => 'operational'],
                    ['code' => 'GLO', 'name' => 'Globacom', 'status' => 'operational'],
                    ['code' => '9MOBILE', 'name' => '9mobile', 'status' => 'operational'],
                ],
                'services' => ['airtime', 'data', 'airtime_pin', 'data_pin', 'cable', 'electricity', 'exam', 'bulksms', 'airtime_swap'],
            ]);
            return;
        }

        $activeProvider = $this->resolveActiveProviderId();

        $ulamaAdapter = new UlamaDataAdapter();
        $ulamadataBal = 0.00;
        $ulamadataLatency = 0;
        $ulamadataStatus = 'error';
        $ulamadataMsg = '';
        try {
            $bal = $ulamaAdapter->checkBalance();
            $ulamadataBal = (float)($bal['balance'] ?? 0);
            $ulamadataLatency = (int)($bal['latency_ms'] ?? 0);
            $ulamadataStatus = 'operational';
            $ulamadataMsg = 'UlamaData gateway active and authenticated';
        } catch (Throwable $e) {
            $ulamadataStatus = str_contains(strtolower($e->getMessage()), 'not configured') ? 'unconfigured' : 'error';
            $ulamadataMsg = $e->getMessage();
        }

        $vtpassAdapter = new VtpassAdapter();
        $vtpassBal = 0.00;
        $vtpassLatency = 0;
        $vtpassStatus = 'error';
        $vtpassMsg = '';
        try {
            $vBal = $vtpassAdapter->checkBalance();
            $vtpassBal = (float)($vBal['balance'] ?? 0);
            $vtpassLatency = (int)($vBal['latency_ms'] ?? 0);
            $vtpassStatus = 'operational';
            $vtpassMsg = 'VTpass gateway active and authenticated';
        } catch (Throwable $e) {
            $vtpassStatus = str_contains(strtolower($e->getMessage()), 'not configured') ? 'unconfigured' : 'error';
            $vtpassMsg = $e->getMessage();
        }

        $providers = [
            [
                'id' => 'ulamadata',
                'name' => 'UlamaData Sovereign Gateway',
                'base_url' => 'https://www.ulamadata.ng',
                'is_primary' => ($activeProvider === 'ulamadata'),
                'balance' => $ulamadataBal,
                'currency' => 'NGN',
                'latency_ms' => $ulamadataLatency,
                'status' => $ulamadataStatus,
                'message' => $ulamadataMsg,
            ],
            [
                'id' => 'vtpass',
                'name' => 'VTpass Enterprise VTU',
                'base_url' => 'https://api-service.vtpass.com/api',
                'is_primary' => ($activeProvider === 'vtpass'),
                'balance' => $vtpassBal,
                'currency' => 'NGN',
                'latency_ms' => $vtpassLatency,
                'status' => $vtpassStatus,
                'message' => $vtpassMsg,
            ],
        ];

        $activeBal = ($activeProvider === 'vtpass') ? $vtpassBal : $ulamadataBal;
        $activeMsg = ($activeProvider === 'vtpass') ? $vtpassMsg : $ulamadataMsg;

        Response::success([
            'active_provider' => $activeProvider,
            'activeProvider' => $activeProvider,
            'airtime_discount_percent' => $airtimeDiscount,
            'wallet_balance' => $activeBal,
            'message' => $activeMsg,
            'providers' => $providers,
        ]);
    }

    // =========================================================================
    // ADMIN DATA BUNDLES PRICING, SYNC & ORDER MONITORING (STAGE 5 PHASE 1)
    // =========================================================================

    private function getDefaultDataMarkupPercent(): float
    {
        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "data_default_markup_percent"');
            if ($row && is_numeric($row['setting_value'])) {
                return max(0.0, (float)$row['setting_value']);
            }
        } catch (Throwable) {
        }
        return 15.0;
    }

    private function computeSellingPrice(float $wholesaleCost, string $mode, ?float $fixedPrice, ?float $markupPercent, ?float $discountPercent, float $defaultMarkup): float
    {
        if ($mode === 'fixed' && $fixedPrice !== null && $fixedPrice >= 0) {
            return round($fixedPrice, 2);
        }
        if ($mode === 'markup_percent' && $markupPercent !== null) {
            return round(max(0.0, $wholesaleCost * (1 + ($markupPercent / 100))), 2);
        }
        if ($mode === 'discount_percent' && $discountPercent !== null) {
            $base = ($fixedPrice !== null && $fixedPrice > 0)
                ? $fixedPrice
                : round($wholesaleCost * (1 + ($defaultMarkup / 100)), 2);
            return round(max(0.0, $base * (1 - ($discountPercent / 100))), 2);
        }
        return round(max(0.0, $wholesaleCost * (1 + ($defaultMarkup / 100))), 2);
    }

    /**
     * GET /api/admin/telecom/plans
     */
    public function adminPlans(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();

        try {
            $liveCount = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM telecom_plans WHERE id LIKE "plan_ud_%"');
            if ((int)($liveCount['cnt'] ?? 0) === 0 && $this->adapter instanceof UlamaDataAdapter) {
                $this->adapter->syncLivePlans();
            }
        } catch (Throwable) {
        }

        $network = strtoupper(trim((string)$request->query('network', '')));
        $category = trim((string)$request->query('category', ''));

        $sql = 'SELECT id, provider_plan_id, network, network_id, name, size, plan_type, plan_type as type, validity, wholesale_cost, price, pricing_mode, fixed_price, markup_percent, discount_percent, admin_price_locked, is_active, provider_id, updated_at
                FROM telecom_plans
                WHERE (id LIKE "plan_ud_%" OR is_active = 1) ';
        $params = [];
        if ($network !== '' && $network !== 'ALL') {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }
        if ($category !== '' && $category !== 'ALL') {
            $sql .= 'AND plan_type = :cat ';
            $params['cat'] = $category;
        }
        $sql .= 'ORDER BY network ASC, plan_type ASC, wholesale_cost ASC';

        $rows = $this->db->fetchAll($sql, $params);
        $categoriesByNetwork = [];
        foreach ($rows as &$r) {
            $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            $r['price'] = (float)$r['price'];
            $r['fixed_price'] = $r['fixed_price'] !== null ? (float)$r['fixed_price'] : null;
            $r['markup_percent'] = $r['markup_percent'] !== null ? (float)$r['markup_percent'] : null;
            $r['discount_percent'] = $r['discount_percent'] !== null ? (float)$r['discount_percent'] : null;
            $r['admin_price_locked'] = (bool)($r['admin_price_locked'] ?? false);
            $r['is_active'] = (bool)$r['is_active'];
            $r['enabled'] = $r['is_active'];
            $r['margin'] = round($r['price'] - $r['wholesale_cost'], 2);
            $r['margin_percent'] = $r['price'] > 0 ? round(($r['margin'] / $r['price']) * 100, 1) : 0;

            $net = (string)$r['network'];
            $cat = (string)$r['plan_type'];
            if (!isset($categoriesByNetwork[$net])) {
                $categoriesByNetwork[$net] = [];
            }
            if (!in_array($cat, $categoriesByNetwork[$net], true)) {
                $categoriesByNetwork[$net][] = $cat;
            }
        }

        Response::success([
            'plans' => $rows,
            'categories_by_network' => $categoriesByNetwork,
            'data_default_markup_percent' => $this->getDefaultDataMarkupPercent(),
            'airtime_discount_percent' => $this->getAirtimeDiscountPercent(),
            'active_provider' => $this->activeProviderId,
        ]);
    }

    /**
     * PUT /api/admin/telecom/plans/:id
     */
    public function adminUpdatePlan(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $id = (string)$request->param('id', '');
        $plan = $this->db->fetchOne('SELECT * FROM telecom_plans WHERE id = :id', ['id' => $id]);
        if (!$plan) {
            Response::error('Data plan not found.', 404);
            return;
        }

        $wholesale = (float)$plan['wholesale_cost'];
        $defaultMarkup = $this->getDefaultDataMarkupPercent();
        $mode = strtolower(trim((string)($request->input('pricing_mode') ?? $plan['pricing_mode'] ?? 'fixed')));
        if (!in_array($mode, ['fixed', 'markup_percent', 'discount_percent', 'default_markup'], true)) {
            $mode = 'fixed';
        }

        $fixedPrice = $request->input('fixed_price') !== null && $request->input('fixed_price') !== ''
            ? (float)$request->input('fixed_price')
            : ($request->input('price') !== null && $mode === 'fixed' ? (float)$request->input('price') : ($plan['fixed_price'] !== null ? (float)$plan['fixed_price'] : null));

        $markupPercent = $request->input('markup_percent') !== null && $request->input('markup_percent') !== ''
            ? (float)$request->input('markup_percent')
            : ($plan['markup_percent'] !== null ? (float)$plan['markup_percent'] : null);

        $discountPercent = $request->input('discount_percent') !== null && $request->input('discount_percent') !== ''
            ? (float)$request->input('discount_percent')
            : ($plan['discount_percent'] !== null ? (float)$plan['discount_percent'] : null);

        $isActive = $request->input('is_active') !== null
            ? (filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
            : (int)$plan['is_active'];

        if ($mode === 'fixed' && ($fixedPrice === null || $fixedPrice <= 0)) {
            Response::error('Fixed selling price must be greater than ₦0.', 422);
            return;
        }
        if ($mode === 'markup_percent' && ($markupPercent === null || $markupPercent < -50 || $markupPercent > 500)) {
            Response::error('Markup percentage must be between -50% and 500%.', 422);
            return;
        }
        if ($mode === 'discount_percent' && ($discountPercent === null || $discountPercent < 0 || $discountPercent > 90)) {
            Response::error('Discount percentage must be between 0% and 90%.', 422);
            return;
        }

        $computedPrice = $this->computeSellingPrice($wholesale, $mode, $fixedPrice, $markupPercent, $discountPercent, $defaultMarkup);
        $locked = ($mode !== 'default_markup') ? 1 : 0;

        $this->db->execute(
            'UPDATE telecom_plans
             SET price = :price,
                 pricing_mode = :mode,
                 fixed_price = :fp,
                 markup_percent = :mp,
                 discount_percent = :dp,
                 admin_price_locked = :locked,
                 is_active = :active,
                 updated_at = NOW()
             WHERE id = :id',
            [
                'price' => $computedPrice,
                'mode' => $mode,
                'fp' => $fixedPrice,
                'mp' => $markupPercent,
                'dp' => $discountPercent,
                'locked' => $locked,
                'active' => $isActive,
                'id' => $id,
            ]
        );

        $updated = $this->db->fetchOne('SELECT * FROM telecom_plans WHERE id = :id', ['id' => $id]);
        $updated['wholesale_cost'] = (float)$updated['wholesale_cost'];
        $updated['price'] = (float)$updated['price'];
        $updated['fixed_price'] = $updated['fixed_price'] !== null ? (float)$updated['fixed_price'] : null;
        $updated['markup_percent'] = $updated['markup_percent'] !== null ? (float)$updated['markup_percent'] : null;
        $updated['discount_percent'] = $updated['discount_percent'] !== null ? (float)$updated['discount_percent'] : null;
        $updated['admin_price_locked'] = (bool)$updated['admin_price_locked'];
        $updated['is_active'] = (bool)$updated['is_active'];
        $updated['margin'] = round($updated['price'] - $updated['wholesale_cost'], 2);

        Response::success(['plan' => $updated], 'Data plan pricing updated successfully.');
    }

    /**
     * POST /api/admin/telecom/plans/bulk-pricing
     */
    public function adminBulkPlanPricing(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();

        $network = strtoupper(trim((string)$request->input('network', 'ALL')));
        $category = trim((string)$request->input('category', 'ALL'));
        $mode = strtolower(trim((string)$request->input('pricing_mode', 'markup_percent')));
        $value = (float)$request->input('value', 0);
        $skipFixedOverrides = filter_var($request->input('skip_fixed_overrides', true), FILTER_VALIDATE_BOOLEAN);

        if ($request->input('data_default_markup_percent') !== null) {
            $defVal = max(0.0, min(500.0, (float)$request->input('data_default_markup_percent')));
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                 VALUES ("set_data_default_markup", "data_default_markup_percent", :v, "pricing", "Default data plan markup percentage")
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                ['v' => (string)$defVal, 'v2' => (string)$defVal]
            );
        }

        $sql = 'SELECT * FROM telecom_plans WHERE id LIKE "plan_ud_%" ';
        $params = [];
        if ($network !== '' && $network !== 'ALL') {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }
        if ($category !== '' && $category !== 'ALL') {
            $sql .= 'AND plan_type = :cat ';
            $params['cat'] = $category;
        }

        $plans = $this->db->fetchAll($sql, $params);
        $defaultMarkup = $this->getDefaultDataMarkupPercent();
        $updatedCount = 0;
        $skippedFixed = 0;

        foreach ($plans as $plan) {
            if ($skipFixedOverrides && ($plan['pricing_mode'] ?? '') === 'fixed') {
                $skippedFixed++;
                continue;
            }
            $wholesale = (float)$plan['wholesale_cost'];
            if ($mode === 'markup_percent') {
                $newPrice = $this->computeSellingPrice($wholesale, 'markup_percent', null, $value, null, $defaultMarkup);
                $this->db->execute(
                    'UPDATE telecom_plans SET price = :p, pricing_mode = "markup_percent", markup_percent = :mp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'mp' => $value, 'id' => $plan['id']]
                );
            } elseif ($mode === 'discount_percent') {
                $base = ($plan['fixed_price'] !== null && (float)$plan['fixed_price'] > 0) ? (float)$plan['fixed_price'] : null;
                $newPrice = $this->computeSellingPrice($wholesale, 'discount_percent', $base, null, $value, $defaultMarkup);
                $this->db->execute(
                    'UPDATE telecom_plans SET price = :p, pricing_mode = "discount_percent", discount_percent = :dp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'dp' => $value, 'id' => $plan['id']]
                );
            } elseif ($mode === 'default_markup') {
                $newPrice = $this->computeSellingPrice($wholesale, 'default_markup', null, null, null, $defaultMarkup);
                $this->db->execute(
                    'UPDATE telecom_plans SET price = :p, pricing_mode = "default_markup", fixed_price = NULL, markup_percent = NULL, discount_percent = NULL, admin_price_locked = 0, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'id' => $plan['id']]
                );
            }
            $updatedCount++;
        }

        Response::success([
            'updated_count' => $updatedCount,
            'skipped_fixed' => $skippedFixed,
            'data_default_markup_percent' => $defaultMarkup,
        ], "Updated pricing for {$updatedCount} data plans" . ($skippedFixed > 0 ? " (preserved {$skippedFixed} fixed-price overrides)." : '.'));
    }

    /**
     * PUT /api/admin/telecom/category-status
     */
    public function adminToggleCategory(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $network = strtoupper(trim((string)$request->input('network', '')));
        $category = trim((string)$request->input('category', ''));
        $isActive = filter_var($request->input('is_active', true), FILTER_VALIDATE_BOOLEAN) ? 1 : 0;

        if ($network === '' || $category === '') {
            Response::error('Network and category are required.', 422);
            return;
        }

        $this->db->execute(
            'UPDATE telecom_plans SET is_active = :active, updated_at = NOW() WHERE network = :net AND plan_type = :cat AND id LIKE "plan_ud_%"',
            ['active' => $isActive, 'net' => $network, 'cat' => $category]
        );

        Response::success(['network' => $network, 'category' => $category, 'is_active' => (bool)$isActive], "Category {$category} ({$network}) updated.");
    }

    /**
     * GET /api/admin/telecom/orders
     */
    public function adminOrders(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $limit = min(200, max(1, (int)$request->query('limit', 50)));
        $service = trim((string)$request->query('service', ''));
        $status = trim((string)$request->query('status', ''));

        $sql = 'SELECT o.id, o.user_id, u.full_name as customer_name, u.email as customer_email, o.service_type, o.network, o.phone, o.plan, o.amount, o.cost_price, o.profit, o.provider_id, o.provider_ref, o.status, o.metadata, o.created_at, o.updated_at
                FROM telecom_orders o
                LEFT JOIN users u ON u.id = o.user_id
                WHERE 1=1 ';
        $params = [];
        if ($service !== '' && $service !== 'all') {
            $sql .= 'AND o.service_type = :srv ';
            $params['srv'] = $service;
        } else {
            $sql .= 'AND o.service_type IN ("data", "airtime", "airtime_pin", "data_pin", "airtime_swap", "cable", "electricity", "exam", "bulksms") ';
        }
        if ($status !== '' && $status !== 'all') {
            $sql .= 'AND o.status = :st ';
            $params['st'] = $status;
        }
        $sql .= 'ORDER BY o.created_at DESC LIMIT ' . (int)$limit;

        $rows = $this->db->fetchAll($sql, $params);
        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
            $r['cost_price'] = (float)$r['cost_price'];
            $r['profit'] = (float)$r['profit'];
            if (!empty($r['metadata']) && is_string($r['metadata'])) {
                $r['metadata'] = json_decode($r['metadata'], true);
            }
            if (in_array((string)$r['service_type'], ['airtime_pin', 'data_pin'], true) && $r['status'] === 'successful') {
                $vCountRow = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM telecom_vouchers WHERE order_id = :oid', ['oid' => $r['id']]);
                $r['voucher_count'] = (int)($vCountRow['cnt'] ?? 0);
            } else {
                $r['voucher_count'] = 0;
            }
        }

        Response::success([
            'count' => count($rows),
            'orders' => $rows,
        ]);
    }

    // =========================================================================
    // STAGE 5 PHASE 2: ADMIN AIRTIME PIN & DATA PIN CATALOGUE & PRICING MANAGER
    // =========================================================================

    private function getDefaultPinMarkupPercent(): float
    {
        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "pin_default_markup_percent"');
            if ($row && is_numeric($row['setting_value'])) {
                return max(0.0, (float)$row['setting_value']);
            }
        } catch (Throwable) {
        }
        return 1.0;
    }

    /**
     * GET /api/admin/telecom/airtime-pins
     */
    public function adminAirtimePins(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();

        try {
            $liveCount = $this->db->fetchOne('SELECT COUNT(*) AS cnt FROM airtime_pin_denominations WHERE id LIKE "apin_ud_%"');
            if ((int)($liveCount['cnt'] ?? 0) === 0 && $this->adapter instanceof UlamaDataAdapter) {
                $this->adapter->syncAirtimePinCatalogue();
            }
        } catch (Throwable) {
        }

        $network = strtoupper(trim((string)$request->query('network', '')));
        $sql = 'SELECT * FROM airtime_pin_denominations WHERE id LIKE "apin_ud_%" ';
        $params = [];
        if ($network !== '' && $network !== 'ALL') {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }
        $sql .= 'ORDER BY FIELD(network, "MTN", "AIRTEL", "GLO", "9MOBILE"), value ASC';

        $rows = $this->db->fetchAll($sql, $params);
        $out = [];
        foreach ($rows as $r) {
            $denomination = (float)$r['value'];
            $wholesale = (float)$r['wholesale_cost'];
            $selling = (float)$r['price'];
            $profit = round($selling - $wholesale, 2);
            $priceAnomaly = $denomination > 0 && $wholesale > 0 && $wholesale < ($denomination * 0.70);
            $out[] = [
                'id' => (string)$r['id'],
                'provider_plan_id' => (int)($r['provider_plan_id'] ?? 0),
                'network' => strtoupper((string)$r['network']),
                'network_id' => (int)($r['network_id'] ?? 0),
                'denomination' => $denomination,
                'wholesale_cost' => $wholesale,
                'api_discount' => (float)($r['api_discount'] ?? 0),
                'available_stock' => max(0, (int)($r['available_stock'] ?? 0)),
                'in_stock' => ((int)($r['available_stock'] ?? 0)) > 0,
                'max_quantity' => max(1, (int)($r['max_quantity'] ?? 50)),
                'price' => $selling,
                'selling_price' => $selling,
                'pricing_mode' => (string)($r['pricing_mode'] ?? 'default_markup'),
                'fixed_price' => $r['fixed_price'] !== null ? (float)$r['fixed_price'] : null,
                'markup_percent' => $r['markup_percent'] !== null ? (float)$r['markup_percent'] : null,
                'discount_percent' => $r['discount_percent'] !== null ? (float)$r['discount_percent'] : null,
                'admin_price_locked' => (bool)($r['admin_price_locked'] ?? false),
                'profit' => $profit,
                'margin_percent' => $selling > 0 ? round(($profit / $selling) * 100, 2) : 0.0,
                'price_anomaly' => $priceAnomaly,
                'is_active' => (bool)$r['is_active'],
                'enabled' => (bool)$r['is_active'],
                'updated_at' => $r['updated_at'] ?? null,
            ];
        }

        Response::success([
            'denominations' => $out,
            'pin_default_markup_percent' => $this->getDefaultPinMarkupPercent(),
            'active_provider' => $this->activeProviderId,
        ]);
    }

    /**
     * POST /api/admin/telecom/airtime-pins/sync
     */
    public function adminSyncAirtimePins(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $recalculateUnlocked = filter_var($request->input('recalculate_unlocked', false), FILTER_VALIDATE_BOOLEAN);

        $adapter = $this->adapter instanceof UlamaDataAdapter ? $this->adapter : new UlamaDataAdapter();
        try {
            $syncRes = $adapter->syncAirtimePinCatalogue($recalculateUnlocked);
            Response::success($syncRes, "Synced {$syncRes['synced_count']} Airtime PIN denominations from Ulamadata (preserved {$syncRes['preserved_overrides']} admin-locked prices).");
        } catch (Throwable $e) {
            Response::error('Failed to sync Ulamadata Airtime PIN catalogue: ' . $e->getMessage(), 502);
        }
    }

    /**
     * PUT /api/admin/telecom/airtime-pins/:id
     */
    public function adminUpdateAirtimePin(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $id = (string)$request->param('id', '');
        $row = $this->db->fetchOne('SELECT * FROM airtime_pin_denominations WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::error('Airtime PIN denomination not found.', 404);
            return;
        }

        $wholesale = (float)$row['wholesale_cost'];
        $defaultMarkup = $this->getDefaultPinMarkupPercent();
        $mode = strtolower(trim((string)($request->input('pricing_mode') ?? $row['pricing_mode'] ?? 'fixed')));
        if (!in_array($mode, ['fixed', 'markup_percent', 'discount_percent', 'default_markup'], true)) {
            $mode = 'fixed';
        }

        $fixedPrice = $request->input('fixed_price') !== null && $request->input('fixed_price') !== ''
            ? (float)$request->input('fixed_price')
            : ($request->input('price') !== null && $mode === 'fixed' ? (float)$request->input('price') : ($row['fixed_price'] !== null ? (float)$row['fixed_price'] : null));

        $markupPercent = $request->input('markup_percent') !== null && $request->input('markup_percent') !== ''
            ? (float)$request->input('markup_percent')
            : ($row['markup_percent'] !== null ? (float)$row['markup_percent'] : null);

        $discountPercent = $request->input('discount_percent') !== null && $request->input('discount_percent') !== ''
            ? (float)$request->input('discount_percent')
            : ($row['discount_percent'] !== null ? (float)$row['discount_percent'] : null);

        $maxQty = $request->input('max_quantity') !== null && $request->input('max_quantity') !== ''
            ? max(1, min(500, (int)$request->input('max_quantity')))
            : max(1, (int)($row['max_quantity'] ?? 50));

        $isActive = $request->input('is_active') !== null
            ? (filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
            : (int)$row['is_active'];

        if ($mode === 'fixed' && ($fixedPrice === null || $fixedPrice <= 0)) {
            Response::error('Fixed selling price must be greater than ₦0.', 422);
            return;
        }
        if ($mode === 'markup_percent' && ($markupPercent === null || $markupPercent < -50 || $markupPercent > 500)) {
            Response::error('Markup percentage must be between -50% and 500%.', 422);
            return;
        }
        if ($mode === 'discount_percent' && ($discountPercent === null || $discountPercent < 0 || $discountPercent > 90)) {
            Response::error('Discount percentage must be between 0% and 90%.', 422);
            return;
        }

        $computedPrice = $this->computeSellingPrice($wholesale, $mode, $fixedPrice, $markupPercent, $discountPercent, $defaultMarkup);
        $locked = ($mode !== 'default_markup') ? 1 : 0;

        $this->db->execute(
            'UPDATE airtime_pin_denominations
             SET price = :price,
                 pricing_mode = :mode,
                 fixed_price = :fp,
                 markup_percent = :mp,
                 discount_percent = :dp,
                 admin_price_locked = :locked,
                 max_quantity = :mq,
                 is_active = :active,
                 updated_at = NOW()
             WHERE id = :id',
            [
                'price' => $computedPrice,
                'mode' => $mode,
                'fp' => $fixedPrice,
                'mp' => $markupPercent,
                'dp' => $discountPercent,
                'locked' => $locked,
                'mq' => $maxQty,
                'active' => $isActive,
                'id' => $id,
            ]
        );

        $updated = $this->db->fetchOne('SELECT * FROM airtime_pin_denominations WHERE id = :id', ['id' => $id]);
        $denomination = (float)$updated['value'];
        $wcost = (float)$updated['wholesale_cost'];
        $selling = (float)$updated['price'];
        $profit = round($selling - $wcost, 2);

        Response::success([
            'denomination' => [
                'id' => (string)$updated['id'],
                'provider_plan_id' => (int)($updated['provider_plan_id'] ?? 0),
                'network' => strtoupper((string)$updated['network']),
                'denomination' => $denomination,
                'wholesale_cost' => $wcost,
                'api_discount' => (float)($updated['api_discount'] ?? 0),
                'available_stock' => max(0, (int)($updated['available_stock'] ?? 0)),
                'in_stock' => ((int)($updated['available_stock'] ?? 0)) > 0,
                'max_quantity' => max(1, (int)($updated['max_quantity'] ?? 50)),
                'price' => $selling,
                'selling_price' => $selling,
                'pricing_mode' => (string)$updated['pricing_mode'],
                'fixed_price' => $updated['fixed_price'] !== null ? (float)$updated['fixed_price'] : null,
                'markup_percent' => $updated['markup_percent'] !== null ? (float)$updated['markup_percent'] : null,
                'discount_percent' => $updated['discount_percent'] !== null ? (float)$updated['discount_percent'] : null,
                'admin_price_locked' => (bool)$updated['admin_price_locked'],
                'profit' => $profit,
                'margin_percent' => $selling > 0 ? round(($profit / $selling) * 100, 2) : 0.0,
                'price_anomaly' => $denomination > 0 && $wcost > 0 && $wcost < ($denomination * 0.70),
                'is_active' => (bool)$updated['is_active'],
                'enabled' => (bool)$updated['is_active'],
            ],
        ], 'Airtime PIN denomination updated successfully.');
    }

    /**
     * POST /api/admin/telecom/airtime-pins/bulk-pricing
     */
    public function adminBulkAirtimePinPricing(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();

        $network = strtoupper(trim((string)$request->input('network', 'ALL')));
        $mode = strtolower(trim((string)$request->input('pricing_mode', 'markup_percent')));
        $value = (float)$request->input('value', 1.0);
        $skipFixedOverrides = filter_var($request->input('skip_fixed_overrides', true), FILTER_VALIDATE_BOOLEAN);

        if ($request->input('pin_default_markup_percent') !== null) {
            $defVal = max(0.0, min(500.0, (float)$request->input('pin_default_markup_percent')));
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                 VALUES ("set_pin_default_markup", "pin_default_markup_percent", :v, "pricing", "Default PIN markup percentage")
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                ['v' => (string)$defVal, 'v2' => (string)$defVal]
            );
        }

        $sql = 'SELECT * FROM airtime_pin_denominations WHERE id LIKE "apin_ud_%" ';
        $params = [];
        if ($network !== '' && $network !== 'ALL') {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }

        $rows = $this->db->fetchAll($sql, $params);
        $defaultMarkup = $this->getDefaultPinMarkupPercent();
        $updatedCount = 0;
        $skippedFixed = 0;

        foreach ($rows as $row) {
            if ($skipFixedOverrides && ($row['pricing_mode'] ?? '') === 'fixed') {
                $skippedFixed++;
                continue;
            }
            $wholesale = (float)$row['wholesale_cost'];
            if ($mode === 'markup_percent') {
                $newPrice = $this->computeSellingPrice($wholesale, 'markup_percent', null, $value, null, $defaultMarkup);
                $this->db->execute(
                    'UPDATE airtime_pin_denominations SET price = :p, pricing_mode = "markup_percent", markup_percent = :mp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'mp' => $value, 'id' => $row['id']]
                );
            } elseif ($mode === 'discount_percent') {
                $base = ($row['fixed_price'] !== null && (float)$row['fixed_price'] > 0) ? (float)$row['fixed_price'] : null;
                $newPrice = $this->computeSellingPrice($wholesale, 'discount_percent', $base, null, $value, $defaultMarkup);
                $this->db->execute(
                    'UPDATE airtime_pin_denominations SET price = :p, pricing_mode = "discount_percent", discount_percent = :dp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'dp' => $value, 'id' => $row['id']]
                );
            } elseif ($mode === 'default_markup') {
                $newPrice = $this->computeSellingPrice($wholesale, 'default_markup', null, null, null, $defaultMarkup);
                $this->db->execute(
                    'UPDATE airtime_pin_denominations SET price = :p, pricing_mode = "default_markup", fixed_price = NULL, markup_percent = NULL, discount_percent = NULL, admin_price_locked = 0, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'id' => $row['id']]
                );
            }
            $updatedCount++;
        }

        Response::success([
            'updated_count' => $updatedCount,
            'skipped_fixed' => $skippedFixed,
            'pin_default_markup_percent' => $defaultMarkup,
        ], "Updated pricing for {$updatedCount} Airtime PIN denominations" . ($skippedFixed > 0 ? " (preserved {$skippedFixed} fixed-price overrides)." : '.'));
    }

    /**
     * GET /api/admin/telecom/data-pins
     */
    public function adminDataPins(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();

        $network = strtoupper(trim((string)$request->query('network', '')));
        $sql = 'SELECT * FROM data_pin_denominations WHERE provider_plan_id IS NOT NULL AND provider_plan_id > 0 ';
        $params = [];
        if ($network !== '' && $network !== 'ALL') {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }
        $sql .= 'ORDER BY FIELD(network, "MTN", "AIRTEL", "GLO", "9MOBILE"), wholesale_cost ASC';

        $rows = $this->db->fetchAll($sql, $params);
        $out = [];
        foreach ($rows as $r) {
            $wholesale = (float)$r['wholesale_cost'];
            $selling = (float)$r['price'];
            $profit = round($selling - $wholesale, 2);
            $out[] = [
                'id' => (string)$r['id'],
                'provider_plan_id' => (int)$r['provider_plan_id'],
                'network' => strtoupper((string)$r['network']),
                'network_id' => (int)($r['network_id'] ?? 0),
                'size' => (string)$r['size'],
                'plan_name' => (string)$r['name'],
                'name' => (string)$r['name'],
                'validity' => (string)($r['validity'] ?? '30 Days'),
                'wholesale_cost' => $wholesale,
                'available_stock' => max(0, (int)($r['available_stock'] ?? 0)),
                'in_stock' => ((int)($r['available_stock'] ?? 0)) > 0,
                'max_quantity' => max(1, (int)($r['max_quantity'] ?? 50)),
                'price' => $selling,
                'selling_price' => $selling,
                'pricing_mode' => (string)($r['pricing_mode'] ?? 'default_markup'),
                'fixed_price' => $r['fixed_price'] !== null ? (float)$r['fixed_price'] : null,
                'markup_percent' => $r['markup_percent'] !== null ? (float)$r['markup_percent'] : null,
                'discount_percent' => $r['discount_percent'] !== null ? (float)$r['discount_percent'] : null,
                'admin_price_locked' => (bool)($r['admin_price_locked'] ?? false),
                'profit' => $profit,
                'margin_percent' => $selling > 0 ? round(($profit / $selling) * 100, 2) : 0.0,
                'is_active' => (bool)$r['is_active'],
                'enabled' => (bool)$r['is_active'],
                'updated_at' => $r['updated_at'] ?? null,
            ];
        }

        Response::success([
            'denominations' => $out,
            'pin_default_markup_percent' => $this->getDefaultPinMarkupPercent(),
            'catalogue_status' => count($out) === 0
                ? 'Awaiting confirmed Ulamadata Data PIN plan IDs and pricing (Data PIN endpoint /api/data_card uses separate confirmed Data PIN plan IDs, never /api/data_plans).'
                : 'available',
        ]);
    }

    /**
     * PUT /api/admin/telecom/data-pins/:id
     */
    public function adminUpdateDataPin(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $id = (string)$request->param('id', '');
        $row = $this->db->fetchOne('SELECT * FROM data_pin_denominations WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::error('Data PIN plan not found.', 404);
            return;
        }

        $wholesale = (float)$row['wholesale_cost'];
        $defaultMarkup = $this->getDefaultPinMarkupPercent();
        $mode = strtolower(trim((string)($request->input('pricing_mode') ?? $row['pricing_mode'] ?? 'fixed')));
        if (!in_array($mode, ['fixed', 'markup_percent', 'discount_percent', 'default_markup'], true)) {
            $mode = 'fixed';
        }

        $fixedPrice = $request->input('fixed_price') !== null && $request->input('fixed_price') !== ''
            ? (float)$request->input('fixed_price')
            : ($request->input('price') !== null && $mode === 'fixed' ? (float)$request->input('price') : ($row['fixed_price'] !== null ? (float)$row['fixed_price'] : null));

        $markupPercent = $request->input('markup_percent') !== null && $request->input('markup_percent') !== ''
            ? (float)$request->input('markup_percent')
            : ($row['markup_percent'] !== null ? (float)$row['markup_percent'] : null);

        $discountPercent = $request->input('discount_percent') !== null && $request->input('discount_percent') !== ''
            ? (float)$request->input('discount_percent')
            : ($row['discount_percent'] !== null ? (float)$row['discount_percent'] : null);

        $maxQty = $request->input('max_quantity') !== null && $request->input('max_quantity') !== ''
            ? max(1, min(500, (int)$request->input('max_quantity')))
            : max(1, (int)($row['max_quantity'] ?? 50));

        $isActive = $request->input('is_active') !== null
            ? (filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
            : (int)$row['is_active'];

        $computedPrice = $this->computeSellingPrice($wholesale, $mode, $fixedPrice, $markupPercent, $discountPercent, $defaultMarkup);
        $locked = ($mode !== 'default_markup') ? 1 : 0;

        $this->db->execute(
            'UPDATE data_pin_denominations
             SET price = :price,
                 pricing_mode = :mode,
                 fixed_price = :fp,
                 markup_percent = :mp,
                 discount_percent = :dp,
                 admin_price_locked = :locked,
                 max_quantity = :mq,
                 is_active = :active,
                 updated_at = NOW()
             WHERE id = :id',
            [
                'price' => $computedPrice,
                'mode' => $mode,
                'fp' => $fixedPrice,
                'mp' => $markupPercent,
                'dp' => $discountPercent,
                'locked' => $locked,
                'mq' => $maxQty,
                'active' => $isActive,
                'id' => $id,
            ]
        );

        $updated = $this->db->fetchOne('SELECT * FROM data_pin_denominations WHERE id = :id', ['id' => $id]);
        Response::success(['denomination' => $updated], 'Data PIN plan updated successfully.');
    }

    /**
     * POST /api/admin/telecom/data-pins/bulk-pricing
     */
    public function adminBulkDataPinPricing(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();

        $network = strtoupper(trim((string)$request->input('network', 'ALL')));
        $mode = strtolower(trim((string)$request->input('pricing_mode', 'markup_percent')));
        $value = (float)$request->input('value', 1.0);
        $skipFixedOverrides = filter_var($request->input('skip_fixed_overrides', true), FILTER_VALIDATE_BOOLEAN);

        $sql = 'SELECT * FROM data_pin_denominations WHERE provider_plan_id IS NOT NULL AND provider_plan_id > 0 ';
        $params = [];
        if ($network !== '' && $network !== 'ALL') {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }

        $rows = $this->db->fetchAll($sql, $params);
        $defaultMarkup = $this->getDefaultPinMarkupPercent();
        $updatedCount = 0;
        $skippedFixed = 0;

        foreach ($rows as $row) {
            if ($skipFixedOverrides && ($row['pricing_mode'] ?? '') === 'fixed') {
                $skippedFixed++;
                continue;
            }
            $wholesale = (float)$row['wholesale_cost'];
            if ($mode === 'markup_percent') {
                $newPrice = $this->computeSellingPrice($wholesale, 'markup_percent', null, $value, null, $defaultMarkup);
                $this->db->execute(
                    'UPDATE data_pin_denominations SET price = :p, pricing_mode = "markup_percent", markup_percent = :mp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'mp' => $value, 'id' => $row['id']]
                );
            } elseif ($mode === 'discount_percent') {
                $base = ($row['fixed_price'] !== null && (float)$row['fixed_price'] > 0) ? (float)$row['fixed_price'] : null;
                $newPrice = $this->computeSellingPrice($wholesale, 'discount_percent', $base, null, $value, $defaultMarkup);
                $this->db->execute(
                    'UPDATE data_pin_denominations SET price = :p, pricing_mode = "discount_percent", discount_percent = :dp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'dp' => $value, 'id' => $row['id']]
                );
            } elseif ($mode === 'default_markup') {
                $newPrice = $this->computeSellingPrice($wholesale, 'default_markup', null, null, null, $defaultMarkup);
                $this->db->execute(
                    'UPDATE data_pin_denominations SET price = :p, pricing_mode = "default_markup", fixed_price = NULL, markup_percent = NULL, discount_percent = NULL, admin_price_locked = 0, updated_at = NOW() WHERE id = :id',
                    ['p' => $newPrice, 'id' => $row['id']]
                );
            }
            $updatedCount++;
        }

        Response::success([
            'updated_count' => $updatedCount,
            'skipped_fixed' => $skippedFixed,
        ], "Updated pricing for {$updatedCount} Data PIN plans.");
    }

    /**
     * 24. POST /api/telecom/providers/switch (Admin only)
     */
    public function switchProvider(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $providerId = strtolower(trim((string)($request->input('providerId') ?? $request->input('provider_id', ''))));

        if (!in_array($providerId, ['ulamadata', 'vtpass'], true)) {
            Response::error('Invalid telecom provider ID. Supported: ulamadata, vtpass.', 422);
        }

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
             VALUES ("set_active_telecom_provider", "active_telecom_provider", :pv, "telecom", "Active telecom provider")
             ON DUPLICATE KEY UPDATE setting_value = :pv2',
            ['pv' => $providerId, 'pv2' => $providerId]
        );

        try {
            $this->db->execute('UPDATE providers SET is_default = 0 WHERE provider_type = "telecom"');
            $this->db->execute('UPDATE providers SET is_default = 1, is_active = 1 WHERE id = :id', ['id' => $providerId]);
        } catch (Throwable) {
        }

        Response::success([
            'activeProvider' => $providerId,
            'active_provider' => $providerId,
        ], "Active telecom provider switched to {$providerId}.");
    }

    /**
     * 25. POST /api/telecom/webhook/vtpass
     */
    public function vtpassWebhook(Request $request): void
    {
        $raw = file_get_contents('php://input') ?: '';
        $auth = $this->verifyWebhookSecretHeader($request, $raw, 'vtpass', 'VTPASS_WEBHOOK_SECRET');
        if ($auth['configured'] && !$auth['authenticated']) {
            Response::unauthorized('Invalid VTpass webhook signature.');
            return;
        }

        $payload = json_decode($raw ?: '{}', true) ?: [];
        $data = $payload['data'] ?? $payload;
        $tx = $data['content']['transactions'] ?? [];
        $ref = trim((string)($data['requestId'] ?? $tx['transactionId'] ?? $payload['request_id'] ?? ''));
        if ($ref === '') {
            Response::error('Missing transaction reference', 400);
            return;
        }

        $order = $this->db->fetchOne('SELECT * FROM telecom_orders WHERE provider_ref = :ref OR id = :id LIMIT 1', ['ref' => $ref, 'id' => $ref]);
        if (!$order) {
            if (!$auth['authenticated']) {
                Response::unauthorized('Webhook authentication failed.');
                return;
            }
            Response::success(['response' => 'success', 'status' => 'ignored', 'message' => 'Reference not found in local orders']);
            return;
        }

        // Unconditionally re-query VTpass /requery API for authoritative transaction state (prevents forged webhook refunds)
        $queryRef = (string)($order['provider_ref'] ?: $ref);
        try {
            $vtpass = new VtpassAdapter();
            $verified = $vtpass->queryTransaction($queryRef);
            $verifiedTx = $verified['content']['transactions'] ?? [];
            $st = strtolower((string)($verifiedTx['status'] ?? $verified['status'] ?? ''));
            if ($st === '') {
                Response::unauthorized('VTpass webhook verification failed: empty upstream status.');
                return;
            }
        } catch (Throwable) {
            Response::unauthorized('VTpass webhook verification failed: unable to verify transaction with VTpass.');
            return;
        }

        $isSuccess = in_array($st, ['delivered', 'successful', 'success'], true);
        $isFailed = in_array($st, ['failed', 'reversed'], true);

        if (!$isSuccess && !$isFailed) {
            Response::success(['response' => 'success', 'status' => 'ignored', 'reference' => $ref]);
            return;
        }

        $outcome = $this->db->withTransaction(function (Database $db) use ($order, $isSuccess, $isFailed) {
            $locked = $db->fetchOne('SELECT * FROM telecom_orders WHERE id = :id FOR UPDATE', ['id' => $order['id']]);
            if (!$locked) {
                return 'not_found';
            }
            if ($locked['status'] === 'successful' && $isSuccess) {
                return 'already_processed';
            }
            if (in_array($locked['status'], ['failed', 'refunded'], true)) {
                return 'already_terminal';
            }

            if ($isSuccess) {
                $profit = round((float)$locked['amount'] - (float)$locked['cost_price'], 2);
                $db->execute(
                    'UPDATE telecom_orders SET status = "successful", profit = :profit, updated_at = NOW() WHERE id = :id',
                    ['id' => $locked['id'], 'profit' => $profit]
                );
                return 'successful';
            }

            if ($isFailed) {
                $db->execute(
                    'UPDATE telecom_orders SET status = "failed", profit = 0.00, updated_at = NOW() WHERE id = :id',
                    ['id' => $locked['id']]
                );
                $refundRef = 'REFUND_VT_' . ($locked['provider_ref'] ?: $locked['id']);
                $alreadyRefunded = $db->fetchOne('SELECT id FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $refundRef]);
                if (!$alreadyRefunded) {
                    $this->walletService->credit(
                        $locked['user_id'],
                        (float)$locked['amount'],
                        'manual_adjustment',
                        $refundRef,
                        "Automated VTpass refund for {$locked['provider_ref']}"
                    );
                }
                return 'failed_refunded';
            }

            return 'noop';
        });

        if ($outcome === 'successful') {
            $this->triggerReferralReward((string)$order['user_id'], $this->mapTelecomReferralCategory((string)$order['service_type']), (string)$order['service_type'], 'TEL_' . $order['id'], (float)$order['amount'], (float)$order['cost_price']);
        } elseif ($outcome === 'failed_refunded') {
            try {
                (new ReferralEngineService($this->db))->reverseRewardsForSource('TEL_' . $order['id'], 'VTpass webhook failure refund');
            } catch (Throwable) {
            }
        }

        Response::success(['response' => 'success', 'status' => 'reconciled', 'outcome' => $outcome, 'reference' => $ref]);
    }

    // =========================================================================
    // TELECOM CONFIG, BILL CATALOG SYNC & ADMIN TELECOM MANAGEMENT ENDPOINTS
    // =========================================================================

    public function telecomConfig(Request $request): void
    {
        $this->ensureDataSchema();
        $bulkSms = self::readBulkSmsSettings($this->db);
        Response::success([
            'airtime_discount_percent' => $this->getAirtimeDiscountPercent(),
            'airtime_swap_enabled' => self::readAirtimeSwapEnabled($this->db),
            'bulksms' => [
                'enabled' => (bool)$bulkSms['enabled'],
                'unit_price' => (float)$bulkSms['unit_price'],
                'max_recipients' => (int)$bulkSms['max_recipients'],
                'default_sender' => (string)$bulkSms['default_sender'],
            ],
            'bulksms_unit_price' => (float)$bulkSms['unit_price'],
            'bulksms_sender_id' => (string)$bulkSms['default_sender'],
        ]);
    }

    public function smsReport(Request $request): void
    {
        Auth::requireAuth($request);
        $smsId = trim((string)($request->query('sms_id') ?? $request->query('reference', '')));
        if ($smsId === '') {
            Response::error('sms_id query parameter is required.', 422);
            return;
        }
        if ($this->adapter instanceof UlamaDataAdapter) {
            Response::success($this->adapter->getSmsReport($smsId));
            return;
        }
        Response::success(['available' => false, 'sms_id' => $smsId, 'status' => 'unavailable']);
    }

    public function adminCablePackages(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $rows = $this->db->fetchAll('SELECT * FROM cable_packages ORDER BY provider ASC, price ASC');
        foreach ($rows as &$r) {
            $r['price'] = (float)$r['price'];
            $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            $r['is_active'] = (bool)$r['is_active'];
            $r['admin_price_locked'] = (bool)($r['admin_price_locked'] ?? false);
        }
        Response::success(['count' => count($rows), 'packages' => $rows]);
    }

    public function adminSyncCablePackages(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $recalc = filter_var($request->input('recalculate_unlocked', false), FILTER_VALIDATE_BOOLEAN);
        if (!($this->adapter instanceof UlamaDataAdapter)) {
            Response::error('Active provider does not support live cable package sync.', 422);
            return;
        }
        $res = $this->adapter->syncCablePackages($recalc);
        Response::success($res, 'Cable TV packages synced from provider.');
    }

    public function adminUpdateCablePackage(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $id = (string)$request->param('id', '');
        $row = $this->db->fetchOne('SELECT * FROM cable_packages WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::error('Cable package not found.', 404);
            return;
        }
        $price = $request->input('price');
        $isActive = $request->input('is_active');
        if ($price !== null && is_numeric($price) && (float)$price > 0) {
            $this->db->execute(
                'UPDATE cable_packages SET price = :p, pricing_mode = "fixed", fixed_price = :fp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                ['p' => round((float)$price, 2), 'fp' => round((float)$price, 2), 'id' => $id]
            );
        }
        if ($isActive !== null) {
            $this->db->execute('UPDATE cable_packages SET is_active = :act, updated_at = NOW() WHERE id = :id', ['act' => $isActive ? 1 : 0, 'id' => $id]);
        }
        $updated = $this->db->fetchOne('SELECT * FROM cable_packages WHERE id = :id', ['id' => $id]);
        Response::success(['package' => $updated], 'Cable package updated.');
    }

    public function adminBulkCablePricing(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $markup = (float)$request->input('markup_percent', 2.0);
        $rows = $this->db->fetchAll('SELECT id, wholesale_cost, admin_price_locked FROM cable_packages');
        $count = 0;
        foreach ($rows as $r) {
            if (!empty($r['admin_price_locked'])) {
                continue;
            }
            $newPrice = round((float)$r['wholesale_cost'] * (1 + ($markup / 100)), 2);
            $this->db->execute('UPDATE cable_packages SET price = :p, pricing_mode = "markup_percent", markup_percent = :mp, updated_at = NOW() WHERE id = :id', [
                'p' => $newPrice, 'mp' => $markup, 'id' => $r['id']
            ]);
            $count++;
        }
        Response::success(['updated_count' => $count], "Updated pricing for {$count} cable packages.");
    }

    public function adminElectricityDiscos(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $rows = $this->db->fetchAll('SELECT * FROM electricity_discos ORDER BY name ASC');
        foreach ($rows as &$r) {
            $r['minimum_amount'] = (float)$r['minimum_amount'];
            $r['is_active'] = (bool)$r['is_active'];
        }
        Response::success(['count' => count($rows), 'discos' => $rows]);
    }

    public function adminSyncElectricityDiscos(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        if (!($this->adapter instanceof UlamaDataAdapter)) {
            Response::error('Active provider does not support live electricity DISCO sync.', 422);
            return;
        }
        $res = $this->adapter->syncElectricityDiscos();
        Response::success($res, 'Electricity DISCOs synced from provider.');
    }

    public function adminUpdateElectricityDisco(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $id = (string)$request->param('id', '');
        $row = $this->db->fetchOne('SELECT * FROM electricity_discos WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::error('Electricity DISCO not found.', 404);
            return;
        }
        $minAmt = $request->input('minimum_amount');
        $isActive = $request->input('is_active');
        if ($minAmt !== null && is_numeric($minAmt) && (float)$minAmt >= 100) {
            $this->db->execute('UPDATE electricity_discos SET minimum_amount = :m, updated_at = NOW() WHERE id = :id', ['m' => round((float)$minAmt, 2), 'id' => $id]);
        }
        if ($isActive !== null) {
            $this->db->execute('UPDATE electricity_discos SET is_active = :act, updated_at = NOW() WHERE id = :id', ['act' => $isActive ? 1 : 0, 'id' => $id]);
        }
        $updated = $this->db->fetchOne('SELECT * FROM electricity_discos WHERE id = :id', ['id' => $id]);
        Response::success(['disco' => $updated], 'Electricity DISCO updated.');
    }

    public function adminExamPackages(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $rows = $this->db->fetchAll('SELECT * FROM exam_packages ORDER BY price ASC');
        foreach ($rows as &$r) {
            $r['price'] = (float)$r['price'];
            $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            $r['is_active'] = (bool)$r['is_active'];
        }
        Response::success(['count' => count($rows), 'packages' => $rows]);
    }

    public function adminSyncExamPackages(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $recalc = filter_var($request->input('recalculate_unlocked', false), FILTER_VALIDATE_BOOLEAN);
        if (!($this->adapter instanceof UlamaDataAdapter)) {
            Response::error('Active provider does not support live exam package sync.', 422);
            return;
        }
        $res = $this->adapter->syncExamPackages($recalc);
        Response::success($res, 'Exam packages synced from provider.');
    }

    public function adminUpdateExamPackage(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $id = (string)$request->param('id', '');
        $row = $this->db->fetchOne('SELECT * FROM exam_packages WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::error('Exam package not found.', 404);
            return;
        }
        $price = $request->input('price');
        $isActive = $request->input('is_active');
        if ($price !== null && is_numeric($price) && (float)$price > 0) {
            $this->db->execute(
                'UPDATE exam_packages SET price = :p, pricing_mode = "fixed", fixed_price = :fp, admin_price_locked = 1, updated_at = NOW() WHERE id = :id',
                ['p' => round((float)$price, 2), 'fp' => round((float)$price, 2), 'id' => $id]
            );
        }
        if ($isActive !== null) {
            $this->db->execute('UPDATE exam_packages SET is_active = :act, updated_at = NOW() WHERE id = :id', ['act' => $isActive ? 1 : 0, 'id' => $id]);
        }
        $updated = $this->db->fetchOne('SELECT * FROM exam_packages WHERE id = :id', ['id' => $id]);
        Response::success(['package' => $updated], 'Exam package updated.');
    }

    public function adminBulkSmsConfig(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        Response::success(['config' => self::readBulkSmsSettings($this->db)]);
    }

    public function adminUpdateBulkSmsConfig(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $map = [
            'enabled' => ['key' => 'bulksms_enabled', 'desc' => 'Bulk SMS enabled flag'],
            'unit_price' => ['key' => 'bulksms_unit_price', 'desc' => 'Bulk SMS customer selling price per unit'],
            'wholesale_unit_price' => ['key' => 'bulksms_wholesale_unit_price', 'desc' => 'Bulk SMS wholesale cost per unit'],
            'max_recipients' => ['key' => 'bulksms_max_recipients', 'desc' => 'Bulk SMS maximum recipients'],
            'default_sender' => ['key' => 'bulksms_default_sender', 'desc' => 'Bulk SMS default sender ID'],
        ];
        foreach ($map as $inputField => $meta) {
            $val = $request->input($inputField);
            if ($val === null) {
                continue;
            }
            $strVal = is_bool($val) ? ($val ? '1' : '0') : (string)$val;
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, :sk, :sv, "telecom", :desc, NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :sv2, updated_at = NOW()',
                ['id' => 'set_' . $meta['key'], 'sk' => $meta['key'], 'sv' => $strVal, 'desc' => $meta['desc'], 'sv2' => $strVal]
            );
        }
        Response::success(['config' => self::readBulkSmsSettings($this->db)], 'Bulk SMS configuration updated.');
    }

    public function adminTelecomSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        Response::success([
            'settings' => [
                'active_provider' => $this->activeProviderId,
                'airtime_discount_percent' => $this->getAirtimeDiscountPercent(),
                'airtime_swap_enabled' => self::readAirtimeSwapEnabled($this->db),
                'bulksms' => self::readBulkSmsSettings($this->db),
            ],
        ]);
    }

    public function adminUpdateTelecomSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $updates = [
            'airtime_discount_percent' => $request->input('airtime_discount_percent'),
            'airtime_swap_enabled' => $request->input('airtime_swap_enabled'),
            'data_default_markup_percent' => $request->input('data_default_markup_percent'),
        ];
        foreach ($updates as $key => $val) {
            if ($val === null) {
                continue;
            }
            $strVal = is_bool($val) ? ($val ? '1' : '0') : (string)$val;
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, :sk, :sv, "telecom", :desc, NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :sv2, updated_at = NOW()',
                ['id' => 'set_' . $key, 'sk' => $key, 'sv' => $strVal, 'desc' => $key, 'sv2' => $strVal]
            );
        }
        Response::success([
            'airtime_discount_percent' => $this->getAirtimeDiscountPercent(),
            'airtime_swap_enabled' => self::readAirtimeSwapEnabled($this->db),
        ], 'Telecom settings saved.');
    }

    public function adminCreateDataPin(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $this->ensureDataSchema();
        $network = strtoupper(trim((string)$request->input('network', 'MTN')));
        $name = trim((string)$request->input('name', ''));
        $size = trim((string)$request->input('size', ''));
        $price = (float)$request->input('price', 0);
        $wholesale = (float)$request->input('wholesale_cost', $price);
        $providerPlanId = (int)$request->input('provider_plan_id', 0);
        if ($name === '' || $size === '' || $price <= 0 || $providerPlanId <= 0) {
            Response::error('name, size, price (> 0), and verified provider_plan_id (> 0) are required.', 422);
            return;
        }
        $id = 'dpin_' . $providerPlanId . '_' . strtolower($network);
        $this->db->execute(
            'INSERT INTO data_pin_denominations (id, provider_plan_id, network, name, size, wholesale_cost, price, is_active, updated_at)
             VALUES (:id, :ppid, :net, :name, :size, :wc, :pr, 1, NOW())
             ON DUPLICATE KEY UPDATE name = :name2, size = :size2, wholesale_cost = :wc2, price = :pr2, is_active = 1, updated_at = NOW()',
            [
                'id' => $id, 'ppid' => $providerPlanId, 'net' => $network, 'name' => $name, 'size' => $size,
                'wc' => $wholesale, 'pr' => $price, 'name2' => $name, 'size2' => $size, 'wc2' => $wholesale, 'pr2' => $price,
            ]
        );
        Response::success(['id' => $id], 'Data PIN package saved.');
    }

}
