<?php
/**
 * @file UlamaDataAdapter.php
 * Official UlamaData Production Telecommunications Adapter
 * Target: cPanel PHP 8.2+ / MySQL 8.x
 *
 * Verified Documentation & Live Probes:
 * https://www.ulamadata.ng/documentation/*
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Telecom;

use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class UlamaDataAdapter implements TelecomAdapterInterface
{
    private string $baseUrl;
    private string $apiKey;
    private int $timeout;
    private Database $db;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, int $timeout = 30)
    {
        $this->db = Database::getInstance();
        $config = file_exists(__DIR__ . '/../../config/config.php') ? require __DIR__ . '/../../config/config.php' : [];
        $providerConfig = $config['providers']['ulamadata'] ?? [];

        $dbProvider = null;
        try {
            $dbProvider = $this->db->fetchOne('SELECT api_key, base_url, timeout_seconds FROM providers WHERE id = "ulamadata"');
        } catch (\Throwable) {
        }

        $envUrl = getenv('ULAMADATA_BASE_URL') ?: '';
        $dbUrl = !empty($dbProvider['base_url']) && $dbProvider['base_url'] !== 'https://api.example.com'
            ? (string)$dbProvider['base_url']
            : '';
        $resolved = $baseUrl ?: ($dbUrl ?: ($envUrl ?: ($providerConfig['base_url'] ?? 'https://www.ulamadata.ng')));
        // Normalize: strip trailing slash and any trailing /api so endpoint paths '/api/...' never double up
        $resolved = preg_replace('#/api/?$#i', '', rtrim($resolved, '/')) ?: 'https://www.ulamadata.ng';
        $this->baseUrl = rtrim($resolved, '/');

        $this->apiKey = $apiKey ?: (getenv('ULAMADATA_API_KEY') ?: (!empty($dbProvider['api_key']) ? (string)$dbProvider['api_key'] : (string)($providerConfig['api_key'] ?? '')));
        $this->timeout = $timeout ?: ((int)($dbProvider['timeout_seconds'] ?? ($providerConfig['timeout'] ?? 30)));
    }

    public function getName(): string
    {
        return 'UlamaData Sovereign Gateway';
    }

    public function getId(): string
    {
        return 'ulamadata';
    }

    /**
     * Map network name to Ulamadata network ID (GET /api/get-networks?service=airtime)
     * 1 = MTN, 2 = AIRTEL, 3 = GLO, 4 = 9MOBILE
     */
    public function getNetworkId(string $network): int
    {
        $norm = strtoupper(trim($network));
        if (str_contains($norm, 'MTN')) return 1;
        if (str_contains($norm, 'AIRTEL')) return 2;
        if (str_contains($norm, 'GLO')) return 3;
        if (str_contains($norm, '9MOB') || str_contains($norm, 'ETISALAT')) return 4;
        return 1;
    }

    /**
     * Map network name for Airtime Swap (docs: 1 = MTN, 2 = GLO, 3 = AIRTEL, 4 = 9MOBILE)
     */
    public function getSwapNetworkId(string $network): int
    {
        $norm = strtoupper(trim($network));
        if (str_contains($norm, 'MTN')) return 1;
        if (str_contains($norm, 'GLO')) return 2;
        if (str_contains($norm, 'AIRTEL')) return 3;
        if (str_contains($norm, '9MOB') || str_contains($norm, 'ETISALAT')) return 4;
        return 1;
    }

    /**
     * Map cable provider to Ulamadata cable ID
     * 1 = GOTV, 2 = DSTV, 3 = STARTIMES, 4 = SHOWMAX
     */
    public function getCableId(string $provider): int
    {
        $norm = strtoupper(trim($provider));
        if (str_contains($norm, 'GOTV')) return 1;
        if (str_contains($norm, 'DSTV')) return 2;
        if (str_contains($norm, 'STAR')) return 3;
        if (str_contains($norm, 'SHOWMAX')) return 4;
        return 1;
    }

    /**
     * Map electricity disco to Ulamadata disco ID (verified via GET /api/get-bill)
     * 1=Ikeja, 2=Eko, 3=Kano, 4=Port Harcourt, 5=Jos, 6=Ibadan,
     * 7=Kaduna, 8=Abuja, 9=Enugu, 10=Benin, 11=Yola, 12=Aba
     */
    public function getDiscoId(string $disco): int
    {
        $norm = strtoupper(trim($disco));
        if (str_contains($norm, 'IKEDC') || str_contains($norm, 'IKEJA')) return 1;
        if (str_contains($norm, 'EKEDC') || str_contains($norm, 'EKO')) return 2;
        if (str_contains($norm, 'KEDCO') || str_contains($norm, 'KANO')) return 3;
        if (str_contains($norm, 'PHED') || str_contains($norm, 'PORT')) return 4;
        if (str_contains($norm, 'JED') || str_contains($norm, 'JOS')) return 5;
        if (str_contains($norm, 'IBEDC') || str_contains($norm, 'IBADAN')) return 6;
        if (str_contains($norm, 'KAEDCO') || str_contains($norm, 'KEDC') || str_contains($norm, 'KADUNA')) return 7;
        if (str_contains($norm, 'AEDC') || str_contains($norm, 'ABUJA')) return 8;
        if (str_contains($norm, 'EEDC') || str_contains($norm, 'ENUGU')) return 9;
        if (str_contains($norm, 'BEDC') || str_contains($norm, 'BENIN')) return 10;
        if (str_contains($norm, 'YEDC') || str_contains($norm, 'YOLA')) return 11;
        if (str_contains($norm, 'ABEDC') || str_contains($norm, 'ABA')) return 12;
        return 1;
    }

    /**
     * Map exam body to Ulamadata exam ID (verified via GET /api/get-exam)
     * 2 = NECO, 5 = WAEC
     */
    public function getExamId(string $examName): int
    {
        $norm = strtoupper(trim($examName));
        if (str_contains($norm, 'NECO')) return 2;
        if (str_contains($norm, 'WAEC')) return 5;
        if (is_numeric($norm)) return (int)$norm;

        try {
            $res = $this->executeHttp('/api/get-exam', 'GET');
            $list = $res['data']['data'] ?? $res['data'] ?? [];
            if (is_array($list)) {
                foreach ($list as $item) {
                    $label = strtoupper((string)($item['exam_name'] ?? ($item['name'] ?? '')));
                    if ($label !== '' && str_contains($label, $norm)) {
                        return (int)($item['exam_id'] ?? ($item['id'] ?? 5));
                    }
                }
            }
        } catch (\Throwable) {
        }
        return 5;
    }

    private function executeHttp(string $endpoint, string $method = 'GET', ?array $payload = null): array
    {
        if (empty($this->apiKey)) {
            throw new RuntimeException('UlamaData API credentials are not configured. Please supply an API key in Super Admin > Provider Settings.');
        }

        $url = $this->baseUrl . (str_starts_with($endpoint, '/') ? $endpoint : '/' . $endpoint);
        $ch = curl_init();
        $startTime = microtime(true);

        $headers = [
            'Authorization: Token ' . $this->apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ];

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        if (strtoupper($method) === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($payload !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            }
        } elseif (strtoupper($method) !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        }

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = null;
        if ($rawResponse !== false && $rawResponse !== '') {
            $parsed = json_decode((string)$rawResponse, true);
        }

        $reference = $payload['request-id'] ?? ($payload['ident'] ?? ($payload['reference'] ?? ($parsed['ident'] ?? null)));
        $this->logProviderCall($endpoint, $method, $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("UlamaData network communication error: {$curlError} ({$url})");
        }

        if ($statusCode >= 400) {
            $msg = is_array($parsed)
                ? ($parsed['message'] ?? ($parsed['msg'] ?? ($parsed['detail'] ?? ($parsed['error'] ?? "Upstream provider error HTTP {$statusCode}"))))
                : "Upstream provider error HTTP {$statusCode}";
            throw new RuntimeException("UlamaData Error: {$msg}");
        }

        return [
            'status_code' => $statusCode,
            'latency_ms' => $latencyMs,
            'data' => is_array($parsed) ? $parsed : [],
            'raw' => $rawResponse,
        ];
    }

    private function logProviderCall(string $endpoint, string $method, int $statusCode, $req, $res, int $latencyMs, ?string $ref): void
    {
        try {
            $this->db->execute(
                'INSERT INTO provider_logs (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES (:id, "ulamadata", :ep, :m, :code, :req, :res, :lat, :ref, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'ep' => $endpoint,
                    'm' => $method,
                    'code' => $statusCode,
                    'req' => $req ? json_encode($req) : null,
                    'res' => is_string($res) ? $res : json_encode($res),
                    'lat' => $latencyMs,
                    'ref' => $ref,
                ]
            );
        } catch (\Throwable) {
        }
    }

    /**
     * 1. Query Gateway Balance (GET /api/user)
     */
    public function checkBalance(): array
    {
        $res = $this->executeHttp('/api/user', 'GET');
        $root = $res['data'];
        $userData = is_array($root['user'] ?? null) ? $root['user'] : $root;
        $balance = (float)($root['balance'] ?? $root['wallet'] ?? $userData['wallet_balance'] ?? $userData['wallet'] ?? $userData['balance'] ?? 0.00);

        return [
            'success' => true,
            'balance' => $balance,
            'currency' => 'NGN',
            'username' => $userData['username'] ?? ($userData['name'] ?? 'HambakTech'),
            'latency_ms' => $res['latency_ms'],
        ];
    }

    /**
     * 2. Airtime Vending (POST /api/airtime)
     */
    public function topupAirtime(string $network, string $phone, float $amount, string $airtimeType = 'VTU'): array
    {
        $networkId = $this->getNetworkId($network);
        $requestId = 'HT_AIR_' . strtoupper(bin2hex(random_bytes(5)));
        $payload = [
            'network' => $networkId,
            'phone' => $phone,
            'amount' => (int)round($amount),
            'type' => strtoupper($airtimeType ?: 'VTU'),
            'bypass' => true,
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/airtime', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered'], true);
        $providerRef = (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $requestId)));

        if (!$isSuccess) {
            $msg = $data['message'] ?? ($data['msg'] ?? 'Airtime top-up failed upstream');
            throw new RuntimeException((string)$msg);
        }

        return [
            'status' => 'successful',
            'provider_reference' => $providerRef,
            'network' => $network,
            'phone' => $phone,
            'amount' => $amount,
            'raw' => $data,
        ];
    }

    /**
     * Fetch Official Ulamadata Networks & Carrier Prefixes (GET /api/get-networks)
     */
    public function getNetworks(string $service = 'data'): array
    {
        $svc = in_array(strtolower($service), ['airtime', 'data'], true) ? strtolower($service) : 'data';
        $res = $this->executeHttp('/api/get-networks?service=' . urlencode($svc), 'GET');
        $rows = is_array($res['data']) ? $res['data'] : [];
        if (isset($rows['data']) && is_array($rows['data'])) {
            $rows = $rows['data'];
        }
        $normalized = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rawNet = strtoupper(trim((string)($row['network'] ?? ($row['code'] ?? ($row['name'] ?? '')))));
            if ($rawNet === '') {
                continue;
            }
            $netCode = str_contains($rawNet, 'AIRTEL') ? 'AIRTEL'
                : (str_contains($rawNet, 'GLO') ? 'GLO'
                : (str_contains($rawNet, '9MOB') ? '9MOBILE' : 'MTN'));
            $prefixes = [];
            if (!empty($row['prefix'])) {
                foreach (explode('|', (string)$row['prefix']) as $pfx) {
                    $clean = preg_replace('/\D+/', '', trim($pfx));
                    if ($clean !== '') {
                        $prefixes[] = $clean;
                    }
                }
            }
            $normalized[] = [
                'id' => (int)($row['id'] ?? $this->getNetworkId($netCode)),
                'network' => $netCode,
                'label' => (string)($row['network'] ?? $netCode),
                'prefixes' => array_values(array_unique($prefixes)),
            ];
        }
        return $normalized;
    }

    /**
     * 3. Data Bundle Vending (POST /api/data)
     */
    public function purchaseData(string $network, string $phone, string|int $planId, bool $ported = false, ?string $requestId = null): array
    {
        $reqId = $requestId ?: ('HT_DAT_' . strtoupper(bin2hex(random_bytes(5))));
        $payload = [
            'phone' => $phone,
            'plan' => (int)$planId,
            'bypass' => $ported,
            'request-id' => $reqId,
        ];

        $res = $this->executeHttp('/api/data', 'POST', $payload);
        $data = $res['data'];

        $statusRaw = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? ''))));
        $isSuccess = in_array($statusRaw, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($statusRaw, ['pending', 'processing', 'queued', 'initiated'], true);
        $providerRef = (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId)));

        if (!$isSuccess && !$isPending) {
            $msg = $data['message'] ?? ($data['msg'] ?? ($data['api_response'] ?? 'Data bundle vending failed upstream'));
            throw new RuntimeException((string)$msg);
        }

        return [
            'status' => $isSuccess ? 'successful' : 'pending',
            'provider_reference' => $providerRef,
            'network' => $network,
            'phone' => $phone,
            'plan_id' => $planId,
            'api_response' => $data['api_response'] ?? ($data['response'] ?? ($data['message'] ?? null)),
            'raw' => $data,
        ];
    }

    /**
     * Split comma/array PIN & serial lists, pair them 1:1, and verify completeness & uniqueness.
     */
    public function parseAndVerifyVouchers(array $data, int $expectedQuantity, string $network, float $faceValue = 0): array
    {
        $splitField = static function ($val): array {
            if (is_array($val)) {
                $out = [];
                foreach ($val as $item) {
                    if (is_array($item)) {
                        $v = trim((string)($item['pin'] ?? ($item['serial'] ?? ($item['code'] ?? ''))));
                    } else {
                        $v = trim((string)$item);
                    }
                    if ($v !== '') {
                        $out[] = $v;
                    }
                }
                return $out;
            }
            $str = trim((string)$val);
            if ($str === '') {
                return [];
            }
            $parts = preg_split('/\s*,\s*/', $str) ?: [];
            $out = [];
            foreach ($parts as $p) {
                $p = trim($p);
                if ($p !== '') {
                    $out[] = $p;
                }
            }
            return $out;
        };

        $rawPins = $data['pin'] ?? ($data['pins'] ?? ($data['cards'] ?? ''));
        $rawSerials = $data['serial'] ?? ($data['serials'] ?? '');

        $pins = [];
        $serials = [];

        if (is_array($rawPins) && isset($rawPins[0]) && is_array($rawPins[0])) {
            foreach ($rawPins as $row) {
                $p = trim((string)($row['pin'] ?? ($row['code'] ?? '')));
                $s = trim((string)($row['serial'] ?? ($row['serial_number'] ?? '')));
                if ($p !== '') $pins[] = $p;
                if ($s !== '') $serials[] = $s;
            }
        } else {
            $pins = $splitField($rawPins);
            $serials = $splitField($rawSerials);
        }

        $loadPin = trim((string)($data['load_pin'] ?? ($data['load_code'] ?? '')));
        $checkBal = trim((string)($data['check_balance'] ?? ''));
        $cardName = trim((string)($data['card_name'] ?? ''));

        $vouchers = [];
        $pairCount = min(count($pins), count($serials));
        for ($i = 0; $i < $pairCount; $i++) {
            $vouchers[] = [
                'index' => $i + 1,
                'pin' => $pins[$i],
                'serial' => $serials[$i],
                'value' => $faceValue > 0 ? $faceValue : (float)($data['pinsize'] ?? 0),
                'network' => strtoupper($network),
                'load_code' => $loadPin,
                'check_balance' => $checkBal,
                'card_name' => $cardName,
            ];
        }

        if (count($pins) === 0 || count($serials) === 0) {
            return [
                'valid' => false,
                'error' => 'Provider returned no PIN or serial numbers.',
                'pin_count' => count($pins),
                'serial_count' => count($serials),
                'vouchers' => $vouchers,
            ];
        }

        if (count($pins) !== count($serials)) {
            return [
                'valid' => false,
                'error' => sprintf('Voucher count mismatch: %d PIN(s) vs %d serial(s).', count($pins), count($serials)),
                'pin_count' => count($pins),
                'serial_count' => count($serials),
                'vouchers' => $vouchers,
            ];
        }

        if (count($pins) !== $expectedQuantity) {
            return [
                'valid' => false,
                'error' => sprintf('Expected %d voucher(s), received %d from provider.', $expectedQuantity, count($pins)),
                'pin_count' => count($pins),
                'serial_count' => count($serials),
                'vouchers' => $vouchers,
            ];
        }

        $seenPairs = [];
        $seenPins = [];
        foreach ($vouchers as $v) {
            $pairKey = $v['pin'] . '|' . $v['serial'];
            if (isset($seenPairs[$pairKey]) || isset($seenPins[$v['pin']])) {
                return [
                    'valid' => false,
                    'error' => 'Duplicate voucher PIN or serial detected in provider response.',
                    'pin_count' => count($pins),
                    'serial_count' => count($serials),
                    'vouchers' => $vouchers,
                ];
            }
            $seenPairs[$pairKey] = true;
            $seenPins[$v['pin']] = true;
        }

        return [
            'valid' => true,
            'error' => null,
            'pin_count' => count($pins),
            'serial_count' => count($serials),
            'vouchers' => $vouchers,
        ];
    }

    /**
     * 4a. Live Airtime PIN Catalogue (GET /api/get-recharge-pins)
     */
    public function fetchAirtimePinCatalogue(): array
    {
        $res = $this->executeHttp('/api/get-recharge-pins', 'GET');
        $rows = $res['data'];
        if (isset($rows['data']) && is_array($rows['data'])) {
            $rows = $rows['data'];
        }
        if (!is_array($rows)) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $providerPlanId = (int)($row['id'] ?? 0);
            if ($providerPlanId <= 0) {
                continue;
            }
            $rawNet = strtoupper(trim((string)($row['network'] ?? 'MTN')));
            $network = str_contains($rawNet, 'AIRTEL') ? 'AIRTEL'
                : (str_contains($rawNet, 'GLO') ? 'GLO'
                : (str_contains($rawNet, '9MOB') || str_contains($rawNet, 'ETISALAT') ? '9MOBILE' : 'MTN'));
            $items[] = [
                'provider_plan_id' => $providerPlanId,
                'network' => $network,
                'network_id' => $this->getNetworkId($network),
                'denomination' => (float)($row['pinsize'] ?? ($row['amount'] ?? 0)),
                'wholesale_cost' => (float)($row['price'] ?? 0),
                'api_discount' => (float)($row['apidiscount'] ?? 0),
                'available_stock' => max(0, (int)($row['available'] ?? 0)),
                'raw' => $row,
            ];
        }
        return $items;
    }

    /**
     * 4b. Sync Airtime PIN Catalogue into airtime_pin_denominations (preserves fixed/admin-locked prices)
     */
    public function syncAirtimePinCatalogue(bool $recalculateUnlocked = false): array
    {
        $items = $this->fetchAirtimePinCatalogue();
        $defaultMarkup = 1.0;
        try {
            $mRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "pin_default_markup_percent"');
            if ($mRow && is_numeric($mRow['setting_value'])) {
                $defaultMarkup = max(0.0, (float)$mRow['setting_value']);
            }
        } catch (\Throwable) {
        }

        $synced = 0;
        $inserted = 0;
        $updated = 0;
        $preservedOverrides = 0;
        $syncedIds = [];

        foreach ($items as $item) {
            $ppid = $item['provider_plan_id'];
            $wholesale = $item['wholesale_cost'];
            $denomination = $item['denomination'];
            if ($ppid <= 0 || $denomination <= 0 || $wholesale <= 0) {
                continue;
            }

            $rowId = 'apin_ud_' . $ppid;
            $defaultSelling = round($wholesale * (1 + ($defaultMarkup / 100)), 2);

            $existing = $this->db->fetchOne('SELECT id, price, pricing_mode, admin_price_locked FROM airtime_pin_denominations WHERE id = :id', ['id' => $rowId]);
            if (!$existing) {
                $this->db->execute(
                    'INSERT INTO airtime_pin_denominations
                     (id, provider_plan_id, network, network_id, value, wholesale_cost, api_discount, available_stock, max_quantity, price, pricing_mode, admin_price_locked, provider_id, is_active, updated_at)
                     VALUES
                     (:id, :ppid, :net, :nid, :val, :wcost, :adisc, :avail, 50, :price, "default_markup", 0, "ulamadata", 1, NOW())',
                    [
                        'id' => $rowId,
                        'ppid' => $ppid,
                        'net' => $item['network'],
                        'nid' => $item['network_id'],
                        'val' => $denomination,
                        'wcost' => $wholesale,
                        'adisc' => $item['api_discount'],
                        'avail' => $item['available_stock'],
                        'price' => $defaultSelling,
                    ]
                );
                $inserted++;
            } else {
                $isLocked = (int)($existing['admin_price_locked'] ?? 0) === 1
                    || in_array((string)($existing['pricing_mode'] ?? ''), ['fixed', 'markup_percent', 'discount_percent'], true);

                if ($isLocked || !$recalculateUnlocked) {
                    $this->db->execute(
                        'UPDATE airtime_pin_denominations
                         SET provider_plan_id = :ppid,
                             network = :net,
                             network_id = :nid,
                             value = :val,
                             wholesale_cost = :wcost,
                             api_discount = :adisc,
                             available_stock = :avail,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $ppid,
                            'net' => $item['network'],
                            'nid' => $item['network_id'],
                            'val' => $denomination,
                            'wcost' => $wholesale,
                            'adisc' => $item['api_discount'],
                            'avail' => $item['available_stock'],
                        ]
                    );
                    if ($isLocked) {
                        $preservedOverrides++;
                    }
                } else {
                    $this->db->execute(
                        'UPDATE airtime_pin_denominations
                         SET provider_plan_id = :ppid,
                             network = :net,
                             network_id = :nid,
                             value = :val,
                             wholesale_cost = :wcost,
                             api_discount = :adisc,
                             available_stock = :avail,
                             price = :price,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $ppid,
                            'net' => $item['network'],
                            'nid' => $item['network_id'],
                            'val' => $denomination,
                            'wcost' => $wholesale,
                            'adisc' => $item['api_discount'],
                            'avail' => $item['available_stock'],
                            'price' => $defaultSelling,
                        ]
                    );
                }
                $updated++;
            }

            $syncedIds[] = $rowId;
            $synced++;
        }

        if (!empty($syncedIds)) {
            $placeholders = implode(',', array_fill(0, count($syncedIds), '?'));
            $this->db->execute(
                "UPDATE airtime_pin_denominations SET is_active = 0, updated_at = NOW() WHERE provider_id = 'ulamadata' AND id NOT IN ({$placeholders})",
                $syncedIds
            );
        }

        return [
            'synced_count' => $synced,
            'inserted_count' => $inserted,
            'updated_count' => $updated,
            'preserved_overrides' => $preservedOverrides,
            'items' => $items,
            'timestamp' => date('c'),
        ];
    }

    /**
     * 4c. Airtime PIN Vending (POST /api/recharge_card)
     */
    public function vendAirtimePin(string $network, float $value, int $quantity, string $businessName, ?int $planTypeId = null, ?string $requestId = null): array
    {
        $networkId = $this->getNetworkId($network);
        if ($planTypeId === null || $planTypeId <= 0) {
            $liveCatalogue = $this->fetchAirtimePinCatalogue();
            foreach ($liveCatalogue as $c) {
                if ($c['network_id'] === $networkId && abs($c['denomination'] - $value) < 0.01) {
                    $planTypeId = $c['provider_plan_id'];
                    break;
                }
            }
        }
        if ($planTypeId === null || $planTypeId <= 0) {
            throw new RuntimeException("No valid Ulamadata plan_type ID found for {$network} ₦{$value} Airtime PIN.");
        }

        $reqId = $requestId ?: ('HT_APIN_' . strtoupper(bin2hex(random_bytes(5))));
        $cardName = trim($businessName) !== '' ? mb_substr(trim($businessName), 0, 50) : 'HambakTech';
        $payload = [
            'network' => $networkId,
            'plan_type' => $planTypeId,
            'quantity' => $quantity,
            'card_name' => $cardName,
            'request-id' => $reqId,
        ];

        $res = $this->executeHttp('/api/recharge_card', 'POST', $payload);
        $data = $res['data'];

        $statusRaw = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? ''))));
        $isSuccess = in_array($statusRaw, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($statusRaw, ['pending', 'processing', 'queued', 'initiated'], true);
        $providerRef = (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId)));

        if ($isPending) {
            return [
                'status' => 'pending',
                'provider_reference' => $providerRef,
                'network' => $network,
                'quantity' => $quantity,
                'vouchers' => [],
                'cards' => [],
                'incomplete_vouchers' => false,
                'raw' => $data,
            ];
        }

        if (!$isSuccess) {
            throw new RuntimeException((string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? 'Airtime PIN generation failed upstream'))));
        }

        $parsed = $this->parseAndVerifyVouchers($data, $quantity, $network, $value);
        if (!$parsed['valid']) {
            return [
                'status' => 'pending',
                'incomplete_vouchers' => true,
                'integrity_error' => $parsed['error'],
                'provider_reference' => $providerRef,
                'network' => $network,
                'quantity' => $quantity,
                'vouchers' => $parsed['vouchers'],
                'cards' => $parsed['vouchers'],
                'raw' => $data,
            ];
        }

        return [
            'status' => 'successful',
            'incomplete_vouchers' => false,
            'provider_reference' => $providerRef,
            'network' => $network,
            'quantity' => count($parsed['vouchers']),
            'vouchers' => $parsed['vouchers'],
            'cards' => $parsed['vouchers'],
            'load_pin' => (string)($data['load_pin'] ?? ''),
            'check_balance' => (string)($data['check_balance'] ?? ''),
            'old_wallet' => $data['old_wallet'] ?? ($data['old_balance'] ?? null),
            'new_wallet' => $data['new_wallet'] ?? ($data['new_balance'] ?? null),
            'raw' => $data,
        ];
    }

    /**
     * 5. Data PIN Vending (POST /api/data_card)
     */
    public function vendDataPin(string $network, string|int $planId, int $quantity, string $businessName, ?string $requestId = null): array
    {
        $networkId = $this->getNetworkId($network);
        $reqId = $requestId ?: ('HT_DPIN_' . strtoupper(bin2hex(random_bytes(5))));
        $cardName = trim($businessName) !== '' ? mb_substr(trim($businessName), 0, 50) : 'HambakTech';
        $payload = [
            'network' => $networkId,
            'plan' => (int)$planId,
            'quantity' => $quantity,
            'card_name' => $cardName,
            'request-id' => $reqId,
        ];

        $res = $this->executeHttp('/api/data_card', 'POST', $payload);
        $data = $res['data'];

        $statusRaw = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? ''))));
        $isSuccess = in_array($statusRaw, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($statusRaw, ['pending', 'processing', 'queued', 'initiated'], true);
        $providerRef = (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId)));

        if ($isPending) {
            return [
                'status' => 'pending',
                'provider_reference' => $providerRef,
                'network' => $network,
                'quantity' => $quantity,
                'vouchers' => [],
                'cards' => [],
                'incomplete_vouchers' => false,
                'raw' => $data,
            ];
        }

        if (!$isSuccess) {
            throw new RuntimeException((string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? 'Data PIN generation failed upstream'))));
        }

        $parsed = $this->parseAndVerifyVouchers($data, $quantity, $network, 0);
        if (!$parsed['valid']) {
            return [
                'status' => 'pending',
                'incomplete_vouchers' => true,
                'integrity_error' => $parsed['error'],
                'provider_reference' => $providerRef,
                'network' => $network,
                'quantity' => $quantity,
                'vouchers' => $parsed['vouchers'],
                'cards' => $parsed['vouchers'],
                'raw' => $data,
            ];
        }

        return [
            'status' => 'successful',
            'incomplete_vouchers' => false,
            'provider_reference' => $providerRef,
            'network' => $network,
            'quantity' => count($parsed['vouchers']),
            'vouchers' => $parsed['vouchers'],
            'cards' => $parsed['vouchers'],
            'load_pin' => (string)($data['load_pin'] ?? ''),
            'check_balance' => (string)($data['check_balance'] ?? ''),
            'old_wallet' => $data['old_wallet'] ?? ($data['old_balance'] ?? null),
            'new_wallet' => $data['new_wallet'] ?? ($data['new_balance'] ?? null),
            'raw' => $data,
        ];
    }

    /**
     * 6. Airtime Swap (POST /api/airtime-swap)
     */
    public function processAirtimeSwap(string $network, string $phone, float $amount): array
    {
        $networkId = $this->getSwapNetworkId($network);
        $payload = [
            'network' => $networkId,
            'phone' => $phone,
            'amount' => (int)round($amount),
        ];

        $res = $this->executeHttp('/api/airtime-swap', 'POST', $payload);
        $data = $res['data'];

        return [
            'status' => 'pending',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? ('UD_SWP_' . time()))),
            'network' => $network,
            'phone' => $phone,
            'amount' => $amount,
            'transfer_number' => $data['transfer_number'] ?? $data['merchant_number'] ?? $data['phone'] ?? null,
            'instructions' => $data['message'] ?? $data['instructions'] ?? 'Transfer airtime to provided merchant number and await automated verification.',
            'raw' => $data,
        ];
    }

    /**
     * 7. Smartcard Validation (POST /api/cable/cable-validation)
     */
    public function validateSmartcard(string $provider, string $smartcard): array
    {
        $cableId = $this->getCableId($provider);
        $res = $this->executeHttp('/api/cable/cable-validation', 'POST', [
            'cable' => $cableId,
            'iuc' => $smartcard,
        ]);
        $data = $res['data'];

        $customer = $data['name'] ?? ($data['customer_name'] ?? ($data['Customer_Name'] ?? ''));
        if (empty($customer)) {
            throw new RuntimeException((string)($data['message'] ?? 'Unable to validate smartcard. Please check IUC/smartcard number.'));
        }

        return [
            'success' => true,
            'customer_name' => $customer,
            'status' => $data['status'] ?? 'active',
            'due_date' => $data['due_date'] ?? null,
            'raw' => $data,
        ];
    }

    /**
     * 8. Cable TV Subscription (POST /api/cable)
     */
    public function renewCable(string $provider, string $smartcard, string $packageCode): array
    {
        $cableId = $this->getCableId($provider);
        $requestId = 'HT_CAB_' . strtoupper(bin2hex(random_bytes(5)));
        $payload = [
            'cable' => $cableId,
            'iuc' => $smartcard,
            'cable_plan' => (int)$packageCode,
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/cable', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        if (!in_array($status, ['success', 'successful'], true)) {
            throw new RuntimeException((string)($data['message'] ?? ($data['msg'] ?? 'Cable TV renewal failed upstream')));
        }

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? $requestId)),
            'provider' => $provider,
            'smartcard' => $smartcard,
            'package' => $packageCode,
            'raw' => $data,
        ];
    }

    /**
     * 9. Electricity Meter Validation (POST /api/bill/bill-validation)
     */
    public function validateMeter(string $discoCode, string $meterNumber, string $meterType): array
    {
        $discoId = $this->getDiscoId($discoCode);
        $mType = (strtolower($meterType) === 'postpaid') ? 'postpaid' : 'prepaid';

        $res = $this->executeHttp('/api/bill/bill-validation', 'POST', [
            'disco' => $discoId,
            'meter_number' => $meterNumber,
            'meter_type' => $mType,
        ]);
        $data = $res['data'];

        $customer = $data['name'] ?? ($data['customer_name'] ?? ($data['Customer_Name'] ?? ''));
        if (empty($customer)) {
            throw new RuntimeException((string)($data['message'] ?? 'Meter number could not be validated with distribution company.'));
        }

        return [
            'success' => true,
            'customer_name' => $customer,
            'address' => $data['address'] ?? ($data['Customer_Address'] ?? ''),
            'meter_number' => $meterNumber,
            'disco' => $discoCode,
            'meter_type' => $mType,
            'raw' => $data,
        ];
    }

    /**
     * 10. Electricity Bill Payment & STS Token (POST /api/bill)
     */
    public function vendElectricity(string $discoCode, string $meterNumber, float $amount, string $meterType): array
    {
        $discoId = $this->getDiscoId($discoCode);
        $mType = (strtolower($meterType) === 'postpaid') ? 'postpaid' : 'prepaid';
        $requestId = 'HT_ELE_' . strtoupper(bin2hex(random_bytes(5)));

        $payload = [
            'disco' => $discoId,
            'meter_number' => $meterNumber,
            'meter_type' => $mType,
            'amount' => (int)round($amount),
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/bill', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        if (!in_array($status, ['success', 'successful'], true)) {
            throw new RuntimeException((string)($data['message'] ?? ($data['msg'] ?? 'Electricity payment failed upstream')));
        }

        $token = $data['token'] ?? ($data['Token'] ?? ($data['purchased_code'] ?? null));
        $units = $data['units'] ?? ($data['Units'] ?? null);

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? $requestId)),
            'disco' => $discoCode,
            'meter_number' => $meterNumber,
            'token' => $token,
            'units' => $units,
            'amount' => $amount,
            'raw' => $data,
        ];
    }

    /**
     * 11. Examination Scratch Cards (POST /api/exam)
     */
    public function vendExamPin(string $examName, int $quantity): array
    {
        $examId = $this->getExamId($examName);
        $requestId = 'HT_EXM_' . strtoupper(bin2hex(random_bytes(5)));
        $payload = [
            'exam' => $examId,
            'quantity' => $quantity,
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/exam', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        if (!in_array($status, ['success', 'successful'], true)) {
            throw new RuntimeException((string)($data['message'] ?? ($data['msg'] ?? 'Examination PIN purchase failed upstream')));
        }

        $cards = $data['cards'] ?? ($data['pins'] ?? ($data['pin'] ?? []));
        if (is_string($cards)) {
            $cards = [$cards];
        }
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? $requestId)),
            'exam' => $examName,
            'quantity' => is_array($cards) && count($cards) > 0 ? count($cards) : $quantity,
            'cards' => $cards,
            'raw' => $data,
        ];
    }

    /**
     * 12. Bulk SMS Messaging (POST /api/bulk-sms)
     */
    public function sendBulkSms(string $senderId, array $recipients, string $message): array
    {
        $cleanRecipients = array_values(array_filter(array_map('trim', $recipients), static fn($r) => $r !== ''));
        $phoneList = implode(',', $cleanRecipients);
        $payload = [
            'subject' => substr($senderId ?: 'HAMBAK', 0, 11),
            'bulkPhones' => $phoneList,
            'message' => $message,
        ];

        $res = $this->executeHttp('/api/bulk-sms', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        if (!in_array($status, ['success', 'successful'], true)) {
            throw new RuntimeException((string)($data['message'] ?? ($data['msg'] ?? 'Bulk SMS delivery failed upstream')));
        }

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? ('UD_SMS_' . time()))),
            'recipients_count' => count($cleanRecipients),
            'units_charged' => $data['units'] ?? count($cleanRecipients),
            'raw' => $data,
        ];
    }

    /**
     * 13. Query Transaction Reference (GET /api/transaction/{ref})
     */
    public function queryTransaction(string $reference): array
    {
        $res = $this->executeHttp('/api/transaction/' . rawurlencode($reference), 'GET');
        return $res['data'];
    }

    /**
     * 14. Dynamic Plan Synchronization (GET /api/data_plans + GET /api/get-networks?service=data)
     * Updates wholesale_cost & metadata without overwriting admin-configured selling prices.
     */
    public function syncLivePlans(bool $recalculateUnlocked = false): array
    {
        // 1. Fetch & cache official network prefixes
        $networkMap = [];
        try {
            $networks = $this->getNetworks('data');
            foreach ($networks as $net) {
                $networkMap[$net['network']] = $net;
            }
            if (!empty($networks)) {
                $this->db->execute(
                    'INSERT INTO system_settings (id, setting_key, setting_value, category, description)
                     VALUES ("set_ulamadata_prefixes", "ulamadata_network_prefixes", :val, "telecom", "Cached official Ulamadata network prefixes")
                     ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
                    [
                        'val' => json_encode($networkMap),
                        'val2' => json_encode($networkMap),
                    ]
                );
            }
        } catch (\Throwable) {
        }

        // 2. Fetch live Ulamadata data plans
        $res = $this->executeHttp('/api/data_plans', 'GET');
        $livePlans = $res['data']['plans'] ?? ($res['data']['data'] ?? $res['data']);
        if (!is_array($livePlans)) {
            $livePlans = [];
        }

        // 3. Read platform default markup %
        $defaultMarkup = 15.0;
        try {
            $mRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "data_default_markup_percent"');
            if ($mRow && is_numeric($mRow['setting_value'])) {
                $defaultMarkup = max(0.0, (float)$mRow['setting_value']);
            }
        } catch (\Throwable) {
        }

        $synced = 0;
        $inserted = 0;
        $updated = 0;
        $preservedOverrides = 0;
        $syncedIds = [];

        foreach ($livePlans as $p) {
            if (!is_array($p)) {
                continue;
            }
            $rawNet = $p['network'] ?? 1;
            if (is_numeric($rawNet)) {
                $networkName = match ((int)$rawNet) {
                    1 => 'MTN',
                    2 => 'AIRTEL',
                    3 => 'GLO',
                    4 => '9MOBILE',
                    default => 'MTN'
                };
            } else {
                $upperNet = strtoupper(trim((string)$rawNet));
                $networkName = str_contains($upperNet, 'AIRTEL') ? 'AIRTEL'
                    : (str_contains($upperNet, 'GLO') ? 'GLO'
                    : (str_contains($upperNet, '9MOB') ? '9MOBILE' : 'MTN'));
            }

            $planId = trim((string)($p['plan_id'] ?? ($p['id'] ?? '')));
            if ($planId === '') {
                continue;
            }
            $wholesale = (float)($p['price'] ?? ($p['amount'] ?? 0));
            if ($wholesale <= 0) {
                continue;
            }

            $size = trim((string)($p['datasize'] ?? ($p['size'] ?? ($p['plan'] ?? '1GB'))));
            $ptype = trim((string)($p['type'] ?? ($p['plan_type'] ?? 'SME')));
            if ($ptype === '') {
                $ptype = 'SME';
            }
            $rawDay = trim((string)($p['day'] ?? ($p['validity'] ?? '30')));
            if (is_numeric($rawDay)) {
                $validity = ((int)$rawDay === 1) ? '1 Day' : "{$rawDay} Days";
            } else {
                $validity = $rawDay !== '' ? $rawDay : '30 Days';
            }
            $rawName = trim((string)($p['name'] ?? ''));
            $name = $rawName !== ''
                ? "{$networkName} {$size} ({$rawName})"
                : "{$networkName} {$size} ({$ptype})";
            $name = mb_substr($name, 0, 145);

            $rowId = 'plan_ud_' . $planId;
            $networkId = (int)($networkMap[$networkName]['id'] ?? $this->getNetworkId($networkName));
            $defaultSelling = (float)round($wholesale * (1 + ($defaultMarkup / 100)), 2);

            $existing = $this->db->fetchOne('SELECT id, price, pricing_mode, admin_price_locked FROM telecom_plans WHERE id = :id', ['id' => $rowId]);

            if (!$existing) {
                $this->db->execute(
                    'INSERT INTO telecom_plans
                     (id, provider_plan_id, network, network_id, name, size, plan_type, validity, wholesale_cost, price, pricing_mode, admin_price_locked, is_active, provider_id, updated_at)
                     VALUES
                     (:id, :ppid, :net, :nid, :name, :size, :ptype, :val, :wcost, :price, "default_markup", 0, 1, "ulamadata", NOW())',
                    [
                        'id' => $rowId,
                        'ppid' => $planId,
                        'net' => $networkName,
                        'nid' => $networkId,
                        'name' => $name,
                        'size' => $size,
                        'ptype' => mb_substr($ptype, 0, 95),
                        'val' => mb_substr($validity, 0, 48),
                        'wcost' => $wholesale,
                        'price' => $defaultSelling,
                    ]
                );
                $inserted++;
            } else {
                $isLocked = (int)($existing['admin_price_locked'] ?? 0) === 1
                    || in_array((string)($existing['pricing_mode'] ?? ''), ['fixed', 'markup_percent', 'discount_percent'], true);

                if ($isLocked || !$recalculateUnlocked) {
                    // Preserve admin-configured selling price; only update wholesale_cost and provider metadata
                    $this->db->execute(
                        'UPDATE telecom_plans
                         SET provider_plan_id = :ppid,
                             network = :net,
                             network_id = :nid,
                             name = :name,
                             size = :size,
                             plan_type = :ptype,
                             validity = :val,
                             wholesale_cost = :wcost,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $planId,
                            'net' => $networkName,
                            'nid' => $networkId,
                            'name' => $name,
                            'size' => $size,
                            'ptype' => mb_substr($ptype, 0, 95),
                            'val' => mb_substr($validity, 0, 48),
                            'wcost' => $wholesale,
                        ]
                    );
                    if ($isLocked) {
                        $preservedOverrides++;
                    }
                } else {
                    $this->db->execute(
                        'UPDATE telecom_plans
                         SET provider_plan_id = :ppid,
                             network = :net,
                             network_id = :nid,
                             name = :name,
                             size = :size,
                             plan_type = :ptype,
                             validity = :val,
                             wholesale_cost = :wcost,
                             price = :price,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $planId,
                            'net' => $networkName,
                            'nid' => $networkId,
                            'name' => $name,
                            'size' => $size,
                            'ptype' => mb_substr($ptype, 0, 95),
                            'val' => mb_substr($validity, 0, 48),
                            'wcost' => $wholesale,
                            'price' => $defaultSelling,
                        ]
                    );
                }
                $updated++;
            }

            $syncedIds[] = $rowId;
            $synced++;
        }

        // 4. Deactivate legacy/removed plans that no longer exist on Ulamadata (e.g. fake seeded 101..402)
        if (!empty($syncedIds)) {
            $placeholders = implode(',', array_fill(0, count($syncedIds), '?'));
            $this->db->execute(
                "UPDATE telecom_plans SET is_active = 0, updated_at = NOW() WHERE provider_id = 'ulamadata' AND id NOT IN ({$placeholders})",
                $syncedIds
            );
        }

        return [
            'synced_count' => $synced,
            'inserted_count' => $inserted,
            'updated_count' => $updated,
            'preserved_overrides' => $preservedOverrides,
            'networks_cached' => count($networkMap),
            'timestamp' => date('c'),
        ];
    }

    public function ping(): array
    {
        try {
            $bal = $this->checkBalance();
            return ['status' => 'operational', 'balance' => $bal['balance'], 'latency_ms' => $bal['latency_ms']];
        } catch (\Throwable $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }
}
