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

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, int $timeout = 55)
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
        $this->timeout = max(55, (int)($timeout ?: ($dbProvider['timeout_seconds'] ?? ($providerConfig['timeout'] ?? 55))));
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
        if (str_contains($norm, 'IKEDC') || str_contains($norm, 'IKEJA') || $norm === 'DISC_IKJ') return 1;
        if (str_contains($norm, 'EKEDC') || str_contains($norm, 'EKO') || $norm === 'DISC_EKD') return 2;
        if (str_contains($norm, 'KEDCO') || str_contains($norm, 'KANO') || $norm === 'DISC_KAN') return 3;
        if (str_contains($norm, 'PHED') || str_contains($norm, 'PORT') || $norm === 'DISC_POR') return 4;
        if (str_contains($norm, 'JED') || str_contains($norm, 'JOS')) return 5;
        if (str_contains($norm, 'IBEDC') || str_contains($norm, 'IBADAN') || $norm === 'DISC_IBA') return 6;
        if (str_contains($norm, 'KAEDCO') || str_contains($norm, 'KEDC') || str_contains($norm, 'KADUNA')) return 7;
        if (str_contains($norm, 'AEDC') || str_contains($norm, 'ABUJA') || $norm === 'DISC_ABJ') return 8;
        if (str_contains($norm, 'EEDC') || str_contains($norm, 'ENUGU')) return 9;
        if (str_contains($norm, 'BEDC') || str_contains($norm, 'BENIN')) return 10;
        if (str_contains($norm, 'YEDC') || str_contains($norm, 'YOLA')) return 11;
        if (str_contains($norm, 'ABEDC') || str_contains($norm, 'ABA')) return 12;
        return 1;
    }

    /**
     * Map exam body to Ulamadata exam ID (verified live via GET /api/get-exam: 2 = NECO, 5 = WAEC)
     */
    public function getExamId(string $examName): int
    {
        $norm = strtoupper(trim($examName));
        if (is_numeric($norm) && (int)$norm > 0) {
            return (int)$norm;
        }

        try {
            $row = $this->db->fetchOne(
                'SELECT provider_plan_id FROM exam_packages WHERE (UPPER(exam_name) = :en OR id = :id) AND provider_plan_id IS NOT NULL AND provider_plan_id > 0 LIMIT 1',
                ['en' => $norm, 'id' => strtolower($examName)]
            );
            if ($row && (int)$row['provider_plan_id'] > 0) {
                return (int)$row['provider_plan_id'];
            }
        } catch (\Throwable) {
        }

        if (str_contains($norm, 'NECO')) return 2;
        if (str_contains($norm, 'WAEC')) return 5;

        try {
            $plans = $this->fetchExamPlans();
            foreach ($plans as $item) {
                $label = strtoupper((string)($item['exam_name'] ?? ($item['name'] ?? '')));
                if ($label !== '' && str_contains($label, $norm)) {
                    return (int)$item['provider_plan_id'];
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
        $curlErrno = curl_errno($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = null;
        if ($rawResponse !== false && $rawResponse !== '') {
            $parsed = json_decode((string)$rawResponse, true);
        }

        $reference = $payload['request-id'] ?? ($payload['ident'] ?? ($payload['reference'] ?? ($parsed['ident'] ?? null)));
        $this->logProviderCall($endpoint, $method, $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            $reqId = isset($payload['request-id']) ? trim((string)$payload['request-id']) : '';
            if ($curlErrno === CURLE_OPERATION_TIMEDOUT && strtoupper($method) === 'POST' && $reqId !== '' && !str_starts_with($endpoint, '/api/transaction/')) {
                try {
                    $recheck = $this->queryTransaction($reqId);
                    $reStatus = strtolower(trim((string)($recheck['status'] ?? ($recheck['Status'] ?? ''))));
                    if (in_array($reStatus, ['success', 'successful', 'delivered', 'completed'], true)) {
                        return [
                            'status_code' => 200,
                            'latency_ms' => $latencyMs,
                            'data' => $recheck,
                            'raw' => json_encode($recheck),
                        ];
                    }
                    if (in_array($reStatus, ['failed', 'fail', 'error', 'reversed'], true)) {
                        $errMsg = (string)($recheck['message'] ?? ($recheck['api_response'] ?? 'Transaction failed upstream after timeout'));
                        throw new RuntimeException($errMsg);
                    }
                } catch (RuntimeException $re) {
                    if (!str_contains($re->getMessage(), 'network communication error') && !str_contains($re->getMessage(), 'HTTP 404')) {
                        throw $re;
                    }
                } catch (\Throwable) {
                }
                return [
                    'status_code' => 202,
                    'latency_ms' => $latencyMs,
                    'data' => [
                        'status' => 'pending',
                        'request-id' => $reqId,
                        'message' => 'Carrier request timed out and is awaiting delivery confirmation. Use Check Status to verify.',
                    ],
                    'raw' => '',
                ];
            }
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
    public function topupAirtime(string $network, string $phone, float $amount, string $airtimeType = 'VTU', ?string $requestId = null): array
    {
        $networkId = $this->getNetworkId($network);
        $reqId = $requestId ?: ('HT_AIR_' . strtoupper(bin2hex(random_bytes(5))));
        $payload = [
            'network' => $networkId,
            'phone' => $phone,
            'amount' => (int)round($amount),
            'type' => strtoupper($airtimeType ?: 'VTU'),
            'bypass' => true,
            'request-id' => $reqId,
        ];

        $res = $this->executeHttp('/api/airtime', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? 'failed'))));
        $msg = (string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? '')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($status, ['pending', 'processing', 'queued', 'initiated'], true)
            || str_contains(strtolower($msg), 'is processing');
        $providerRef = (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId)));

        if (!$isSuccess && !$isPending) {
            throw new RuntimeException($msg !== '' ? $msg : 'Airtime top-up failed upstream');
        }

        return [
            'status' => $isSuccess ? 'successful' : 'pending',
            'provider_reference' => $providerRef,
            'network' => $network,
            'phone' => $phone,
            'amount' => $amount,
            'api_response' => $msg,
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
     * 4b. Sync Airtime PIN Catalogue into airtime_pin_denominations (preserves fixed/admin-locked prices & disables anomalous upstream costs)
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
        $anomaliesDisabled = 0;
        $syncedIds = [];

        foreach ($items as $item) {
            $ppid = $item['provider_plan_id'];
            $wholesale = $item['wholesale_cost'];
            $denomination = $item['denomination'];
            if ($ppid <= 0 || $denomination <= 0 || $wholesale <= 0) {
                continue;
            }

            // Guard against corrupted upstream catalog prices (e.g. 9mobile ₦200/₦500/₦1000 returning ₦96.03)
            $isAnomaly = $wholesale < ($denomination * 0.70);
            $rowId = 'apin_ud_' . $ppid;
            $defaultSelling = round($wholesale * (1 + ($defaultMarkup / 100)), 2);

            $existing = $this->db->fetchOne('SELECT id, price, pricing_mode, admin_price_locked, is_active FROM airtime_pin_denominations WHERE id = :id', ['id' => $rowId]);
            if (!$existing) {
                $activeFlag = $isAnomaly ? 0 : 1;
                if ($isAnomaly) {
                    $anomaliesDisabled++;
                }
                $this->db->execute(
                    'INSERT INTO airtime_pin_denominations
                     (id, provider_plan_id, network, network_id, value, wholesale_cost, api_discount, available_stock, max_quantity, price, pricing_mode, admin_price_locked, provider_id, is_active, updated_at)
                     VALUES
                     (:id, :ppid, :net, :nid, :val, :wcost, :adisc, :avail, 50, :price, "default_markup", 0, "ulamadata", :act, NOW())',
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
                        'act' => $activeFlag,
                    ]
                );
                $inserted++;
            } else {
                $isLocked = (int)($existing['admin_price_locked'] ?? 0) === 1
                    || in_array((string)($existing['pricing_mode'] ?? ''), ['fixed', 'markup_percent', 'discount_percent'], true);

                if ($isAnomaly && !$isLocked) {
                    $anomaliesDisabled++;
                    $this->db->execute(
                        'UPDATE airtime_pin_denominations
                         SET provider_plan_id = :ppid,
                             network = :net,
                             network_id = :nid,
                             value = :val,
                             wholesale_cost = :wcost,
                             api_discount = :adisc,
                             available_stock = :avail,
                             is_active = 0,
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
                } elseif ($isLocked || !$recalculateUnlocked) {
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
            'anomalies_disabled' => $anomaliesDisabled,
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
     * 6. Airtime Swap (Disabled — Ulamadata documentation exposes no automated /api/airtime-swap endpoint)
     */
    public function processAirtimeSwap(string $network, string $phone, float $amount): array
    {
        throw new RuntimeException('Automated Airtime-to-Cash conversion is not currently supported by the active carrier gateway.');
    }

    /**
     * 7a. Fetch Live Cable TV Plans (GET /api/get-cable-plan?cable=... or GET /api/get-cable)
     */
    public function fetchCablePlans(?string $cable = null): array
    {
        $rawList = [];
        if ($cable !== null && trim($cable) !== '') {
            $res = $this->executeHttp('/api/get-cable-plan?cable=' . urlencode(strtoupper(trim($cable))), 'GET');
            $data = $res['data'];
            $rows = isset($data['data']) && is_array($data['data']) ? $data['data'] : $data;
            if (is_array($rows)) {
                $rawList = $rows;
            }
        } else {
            try {
                $res = $this->executeHttp('/api/get-cable', 'GET');
                $data = $res['data'];
                $rows = isset($data['data']) && is_array($data['data']) ? $data['data'] : $data;
                if (is_array($rows) && !empty($rows)) {
                    $rawList = $rows;
                }
            } catch (\Throwable) {
            }
            if (empty($rawList)) {
                foreach (['GOTV', 'DSTV', 'STARTIMES', 'SHOWMAX'] as $prov) {
                    try {
                        $res = $this->executeHttp('/api/get-cable-plan?cable=' . $prov, 'GET');
                        $data = $res['data'];
                        $rows = isset($data['data']) && is_array($data['data']) ? $data['data'] : $data;
                        if (is_array($rows)) {
                            foreach ($rows as $r) {
                                if (is_array($r)) {
                                    $rawList[] = $r;
                                }
                            }
                        }
                    } catch (\Throwable) {
                    }
                }
            }
        }

        $items = [];
        foreach ($rawList as $row) {
            if (!is_array($row)) {
                continue;
            }
            $planId = (int)($row['id'] ?? 0);
            $rawCable = strtolower(trim((string)($row['cable'] ?? '')));
            $provider = str_contains($rawCable, 'dstv') ? 'dstv'
                : (str_contains($rawCable, 'gotv') ? 'gotv'
                : (str_contains($rawCable, 'showmax') ? 'showmax' : 'startimes'));
            $cableId = (int)($row['cable_id'] ?? $this->getCableId($provider));
            $price = (float)($row['price'] ?? 0);
            $name = trim((string)($row['name'] ?? ''));
            if ($planId <= 0 || $price <= 0 || $name === '') {
                continue;
            }
            $items[] = [
                'provider_plan_id' => $planId,
                'cable_id' => $cableId,
                'provider' => $provider,
                'name' => mb_substr($name, 0, 100),
                'code' => 'ud-' . $provider . '-' . $planId,
                'wholesale_cost' => $price,
            ];
        }
        return $items;
    }

    /**
     * 7b. Sync Live Cable TV Bouquets into cable_packages (preserves admin-locked pricing)
     */
    public function syncCablePackages(bool $recalculateUnlocked = false): array
    {
        $items = $this->fetchCablePlans();
        $defaultMarkup = 2.0;
        try {
            $mRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "cable_default_markup_percent"');
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
            $rowId = 'cab_ud_' . $item['provider_plan_id'];
            $wholesale = (float)$item['wholesale_cost'];
            $defaultSelling = round($wholesale * (1 + ($defaultMarkup / 100)), 2);

            $existing = $this->db->fetchOne('SELECT id, price, pricing_mode, admin_price_locked FROM cable_packages WHERE id = :id', ['id' => $rowId]);
            if (!$existing) {
                $this->db->execute(
                    'INSERT INTO cable_packages
                     (id, provider_plan_id, cable_id, provider, name, code, channels, wholesale_cost, price, pricing_mode, admin_price_locked, provider_id, is_active, updated_at)
                     VALUES
                     (:id, :ppid, :cid, :prov, :name, :code, 0, :wcost, :price, "default_markup", 0, "ulamadata", 1, NOW())',
                    [
                        'id' => $rowId,
                        'ppid' => $item['provider_plan_id'],
                        'cid' => $item['cable_id'],
                        'prov' => $item['provider'],
                        'name' => $item['name'],
                        'code' => $item['code'],
                        'wcost' => $wholesale,
                        'price' => $defaultSelling,
                    ]
                );
                $inserted++;
            } else {
                $isLocked = (int)($existing['admin_price_locked'] ?? 0) === 1
                    || in_array((string)($existing['pricing_mode'] ?? ''), ['fixed', 'markup_percent', 'discount_percent'], true);

                if ($isLocked || !$recalculateUnlocked) {
                    $this->db->execute(
                        'UPDATE cable_packages
                         SET provider_plan_id = :ppid,
                             cable_id = :cid,
                             provider = :prov,
                             name = :name,
                             code = :code,
                             wholesale_cost = :wcost,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $item['provider_plan_id'],
                            'cid' => $item['cable_id'],
                            'prov' => $item['provider'],
                            'name' => $item['name'],
                            'code' => $item['code'],
                            'wcost' => $wholesale,
                        ]
                    );
                    if ($isLocked) {
                        $preservedOverrides++;
                    }
                } else {
                    $this->db->execute(
                        'UPDATE cable_packages
                         SET provider_plan_id = :ppid,
                             cable_id = :cid,
                             provider = :prov,
                             name = :name,
                             code = :code,
                             wholesale_cost = :wcost,
                             price = :price,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $item['provider_plan_id'],
                            'cid' => $item['cable_id'],
                            'prov' => $item['provider'],
                            'name' => $item['name'],
                            'code' => $item['code'],
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

        if (!empty($syncedIds)) {
            $placeholders = implode(',', array_fill(0, count($syncedIds), '?'));
            $this->db->execute(
                "UPDATE cable_packages SET is_active = 0, updated_at = NOW() WHERE id NOT IN ({$placeholders})",
                $syncedIds
            );
        }

        return [
            'synced_count' => $synced,
            'inserted_count' => $inserted,
            'updated_count' => $updated,
            'preserved_overrides' => $preservedOverrides,
            'timestamp' => date('c'),
        ];
    }

    /**
     * 7. Smartcard Validation (GET /api/cable/cable-validation?iuc=...&cable=1|2|3|4)
     */
    public function validateSmartcard(string $provider, string $smartcard): array
    {
        $cableId = is_numeric($provider) && (int)$provider > 0 ? (int)$provider : $this->getCableId($provider);
        $query = http_build_query([
            'iuc' => trim($smartcard),
            'cable' => $cableId,
        ]);
        $res = $this->executeHttp('/api/cable/cable-validation?' . $query, 'GET');
        $data = $res['data'];

        $statusRaw = strtolower(trim((string)($data['status'] ?? '')));
        $customer = trim((string)($data['name'] ?? ($data['customer_name'] ?? ($data['Customer_Name'] ?? ''))));
        $lowerCust = strtolower($customer);

        if ($statusRaw === 'fail' || $customer === '' || str_contains($lowerCust, 'unable to verify') || str_contains($lowerCust, 'invalid')) {
            $errMsg = trim((string)($data['message'] ?? ''));
            throw new RuntimeException($errMsg !== '' && strtolower($errMsg) !== 'unable to verify'
                ? $errMsg
                : 'Unable to validate smartcard/IUC number with the cable provider. Please confirm the number and decoder type.');
        }

        $outstanding = trim((string)($data['outstandingAmount'] ?? ($data['outstanding_amount'] ?? '')));
        return [
            'success' => true,
            'customer_name' => $customer,
            'status' => $data['status'] ?? 'active',
            'outstanding_amount' => $outstanding !== '' && is_numeric($outstanding) ? (float)$outstanding : 0.0,
            'due_date' => $data['due_date'] ?? null,
            'message' => $data['message'] ?? $customer,
            'raw' => $data,
        ];
    }

    /**
     * 8. Cable TV Subscription (POST /api/cable)
     */
    public function renewCable(string $provider, string $smartcard, string|int $packageCode, bool $bypass = false, ?string $requestId = null): array
    {
        $cableId = is_numeric($provider) && (int)$provider > 0 ? (int)$provider : $this->getCableId($provider);
        $cablePlanId = 0;

        if (is_numeric($packageCode) && (int)$packageCode > 0) {
            $cablePlanId = (int)$packageCode;
        } else {
            try {
                $pkgRow = $this->db->fetchOne(
                    'SELECT provider_plan_id, cable_id FROM cable_packages WHERE (id = :id OR code = :code) AND provider_plan_id IS NOT NULL AND provider_plan_id > 0 LIMIT 1',
                    ['id' => (string)$packageCode, 'code' => (string)$packageCode]
                );
                if ($pkgRow) {
                    $cablePlanId = (int)$pkgRow['provider_plan_id'];
                    if (!empty($pkgRow['cable_id'])) {
                        $cableId = (int)$pkgRow['cable_id'];
                    }
                }
            } catch (\Throwable) {
            }
        }

        if ($cablePlanId <= 0) {
            throw new RuntimeException('Selected cable bouquet lacks a valid live plan ID. Sync Cable Packages in Admin first.');
        }

        $reqId = $requestId ?: ('HT_CAB_' . strtoupper(bin2hex(random_bytes(5))));
        $payload = [
            'cable' => $cableId,
            'iuc' => trim($smartcard),
            'cable_plan' => $cablePlanId,
            'bypass' => $bypass,
            'request-id' => $reqId,
        ];

        $res = $this->executeHttp('/api/cable', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? 'failed'))));
        $msg = (string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? '')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($status, ['pending', 'processing', 'queued', 'initiated'], true)
            || str_contains(strtolower($msg), 'is processing');

        if (!$isSuccess && !$isPending) {
            throw new RuntimeException($msg !== '' ? $msg : 'Cable TV renewal failed upstream');
        }

        return [
            'status' => $isSuccess ? 'successful' : 'pending',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId))),
            'provider' => $provider,
            'smartcard' => $smartcard,
            'package' => $cablePlanId,
            'api_response' => $msg,
            'raw' => $data,
        ];
    }

    /**
     * 9a. Fetch Live Electricity DISCOs (GET /api/get-bill)
     */
    public function fetchElectricityDiscos(): array
    {
        $res = $this->executeHttp('/api/get-bill', 'GET');
        $rows = $res['data'];
        if (isset($rows['data']) && is_array($rows['data'])) {
            $rows = $rows['data'];
        }
        if (!is_array($rows)) {
            return [];
        }

        $slugMap = [
            1 => 'ikeja-electric',
            2 => 'eko-electric',
            3 => 'kano-electric',
            4 => 'portharcourt-electric',
            5 => 'jos-electric',
            6 => 'ibadan-electric',
            7 => 'kaduna-electric',
            8 => 'abuja-electric',
            9 => 'enugu-electric',
            10 => 'benin-electric',
            11 => 'yola-electric',
            12 => 'aba-electric',
        ];

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $discoId = (int)($row['id'] ?? 0);
            $name = trim((string)($row['name'] ?? ''));
            $abb = strtoupper(trim((string)($row['abb'] ?? '')));
            $apiDisc = (float)($row['apidiscount'] ?? 0);
            if ($discoId <= 0 || $name === '') {
                continue;
            }
            $code = $slugMap[$discoId] ?? strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name));
            $display = $abb !== '' && !str_contains(strtoupper($name), $abb) ? "{$name} ({$abb})" : $name;
            $items[] = [
                'provider_disco_id' => $discoId,
                'name' => mb_substr($display, 0, 100),
                'abbreviation' => $abb,
                'code' => $code,
                'api_discount' => $apiDisc,
            ];
        }
        return $items;
    }

    /**
     * 9b. Sync All 12 Live DISCOs into electricity_discos (preserves admin min/max/fees)
     */
    public function syncElectricityDiscos(): array
    {
        $items = $this->fetchElectricityDiscos();
        $synced = 0;
        $inserted = 0;
        $updated = 0;
        $syncedIds = [];

        foreach ($items as $item) {
            $rowId = 'disc_ud_' . $item['provider_disco_id'];
            $existing = $this->db->fetchOne(
                'SELECT id FROM electricity_discos WHERE id = :id OR code = :code LIMIT 1',
                ['id' => $rowId, 'code' => $item['code']]
            );
            $targetId = $existing ? (string)$existing['id'] : $rowId;
            if (!$existing) {
                $this->db->execute(
                    'INSERT INTO electricity_discos
                     (id, provider_disco_id, abbreviation, name, code, api_discount, minimum_amount, max_amount, fee_type, convenience_fee, discount_percent, admin_price_locked, provider_id, is_active, updated_at)
                     VALUES
                     (:id, :pdid, :abb, :name, :code, :adisc, 1000.00, 500000.00, "fixed_fee", 100.00, 0.00, 0, "ulamadata", 1, NOW())',
                    [
                        'id' => $targetId,
                        'pdid' => $item['provider_disco_id'],
                        'abb' => $item['abbreviation'],
                        'name' => $item['name'],
                        'code' => $item['code'],
                        'adisc' => $item['api_discount'],
                    ]
                );
                $inserted++;
            } else {
                $this->db->execute(
                    'UPDATE electricity_discos
                     SET provider_disco_id = :pdid,
                         abbreviation = :abb,
                         name = :name,
                         code = :code,
                         api_discount = :adisc,
                         provider_id = "ulamadata",
                         is_active = 1,
                         updated_at = NOW()
                     WHERE id = :id',
                    [
                        'id' => $targetId,
                        'pdid' => $item['provider_disco_id'],
                        'abb' => $item['abbreviation'],
                        'name' => $item['name'],
                        'code' => $item['code'],
                        'adisc' => $item['api_discount'],
                    ]
                );
                $updated++;
            }
            $syncedIds[] = $targetId;
            $synced++;
        }

        if (!empty($syncedIds)) {
            $placeholders = implode(',', array_fill(0, count($syncedIds), '?'));
            $this->db->execute(
                "UPDATE electricity_discos SET is_active = 0, updated_at = NOW() WHERE id NOT IN ({$placeholders})",
                $syncedIds
            );
        }

        return [
            'synced_count' => $synced,
            'inserted_count' => $inserted,
            'updated_count' => $updated,
            'timestamp' => date('c'),
        ];
    }

    /**
     * 9. Electricity Meter Validation (GET /api/bill/bill-validation?meter_number=...&meter_type=...&disco=...)
     */
    public function validateMeter(string $discoCode, string $meterNumber, string $meterType): array
    {
        $discoId = 0;
        if (is_numeric($discoCode) && (int)$discoCode > 0) {
            $discoId = (int)$discoCode;
        } else {
            try {
                $dRow = $this->db->fetchOne(
                    'SELECT provider_disco_id FROM electricity_discos WHERE (id = :id OR code = :code) AND provider_disco_id IS NOT NULL AND provider_disco_id > 0 LIMIT 1',
                    ['id' => $discoCode, 'code' => $discoCode]
                );
                if ($dRow) {
                    $discoId = (int)$dRow['provider_disco_id'];
                }
            } catch (\Throwable) {
            }
            if ($discoId <= 0) {
                $discoId = $this->getDiscoId($discoCode);
            }
        }

        $mType = (strtolower(trim($meterType)) === 'postpaid') ? 'postpaid' : 'prepaid';
        $query = http_build_query([
            'meter_number' => trim($meterNumber),
            'meter_type' => $mType,
            'disco' => $discoId,
        ]);

        $res = $this->executeHttp('/api/bill/bill-validation?' . $query, 'GET');
        $data = $res['data'];

        $statusRaw = strtolower(trim((string)($data['status'] ?? '')));
        $customer = trim((string)($data['name'] ?? ($data['customer_name'] ?? ($data['Customer_Name'] ?? ''))));
        $lowerCust = strtolower($customer);

        if ($statusRaw === 'fail' || $customer === '' || str_contains($lowerCust, 'unable to verify') || str_contains($lowerCust, 'invalid')) {
            throw new RuntimeException('Unable to verify meter number with the distribution company. Please verify the meter number, meter type, and DISCO.');
        }

        $address = trim((string)($data['customer_address'] ?? ($data['address'] ?? ($data['Customer_Address'] ?? ''))));
        if (strtolower($address) === 'unable to verify') {
            $address = '';
        }
        $outstanding = trim((string)($data['outstandingAmount'] ?? ($data['outstanding_amount'] ?? '')));

        return [
            'success' => true,
            'customer_name' => $customer,
            'address' => $address,
            'meter_number' => trim($meterNumber),
            'disco' => $discoCode,
            'disco_id' => $discoId,
            'meter_type' => $mType,
            'outstanding_amount' => $outstanding !== '' && is_numeric($outstanding) ? (float)$outstanding : 0.0,
            'raw' => $data,
        ];
    }

    /**
     * 10. Electricity Bill Payment & STS Token (POST /api/bill)
     */
    public function vendElectricity(string $discoCode, string $meterNumber, float $amount, string $meterType, string $phone = '', bool $bypass = false, ?string $requestId = null): array
    {
        $discoId = 0;
        if (is_numeric($discoCode) && (int)$discoCode > 0) {
            $discoId = (int)$discoCode;
        } else {
            try {
                $dRow = $this->db->fetchOne(
                    'SELECT provider_disco_id FROM electricity_discos WHERE (id = :id OR code = :code) AND provider_disco_id IS NOT NULL AND provider_disco_id > 0 LIMIT 1',
                    ['id' => $discoCode, 'code' => $discoCode]
                );
                if ($dRow) {
                    $discoId = (int)$dRow['provider_disco_id'];
                }
            } catch (\Throwable) {
            }
            if ($discoId <= 0) {
                $discoId = $this->getDiscoId($discoCode);
            }
        }

        $mType = (strtolower(trim($meterType)) === 'postpaid') ? 'postpaid' : 'prepaid';
        $reqId = $requestId ?: ('HT_ELE_' . strtoupper(bin2hex(random_bytes(5))));

        $payload = [
            'disco' => $discoId,
            'meter_type' => $mType,
            'meter_number' => trim($meterNumber),
            'amount' => (int)round($amount),
            'bypass' => $bypass,
            'request-id' => $reqId,
        ];
        if (trim($phone) !== '') {
            $payload['phone'] = trim($phone);
        }

        $res = $this->executeHttp('/api/bill', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? 'failed'))));
        $msg = (string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? '')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($status, ['pending', 'processing', 'queued', 'initiated'], true)
            || str_contains(strtolower($msg), 'is processing');

        if (!$isSuccess && !$isPending) {
            throw new RuntimeException($msg !== '' ? $msg : 'Electricity payment failed upstream');
        }

        $rawToken = trim((string)($data['token'] ?? ($data['Token'] ?? ($data['purchased_code'] ?? ($data['pin'] ?? '')))));
        if (in_array(strtolower($rawToken), ['', 'null', 'none', 'n/a', 'undefined'], true)) {
            $rawToken = null;
        }
        $units = trim((string)($data['units'] ?? ($data['Units'] ?? '')));
        if (in_array(strtolower($units), ['', 'null', 'none', 'n/a'], true)) {
            $units = null;
        }

        // For prepaid meters, never fabricate a token; if upstream has not returned the STS token yet, keep pending so status check can retrieve it.
        $finalStatus = $isSuccess ? 'successful' : 'pending';
        if ($mType === 'prepaid' && $rawToken === null) {
            $finalStatus = 'pending';
        }

        return [
            'status' => $finalStatus,
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId))),
            'disco' => $discoCode,
            'meter_number' => trim($meterNumber),
            'meter_type' => $mType,
            'token' => $rawToken,
            'units' => $units,
            'amount' => $amount,
            'api_response' => $msg,
            'raw' => $data,
        ];
    }

    /**
     * 11a. Fetch Live Examination Plans (GET /api/get-exam)
     */
    public function fetchExamPlans(): array
    {
        $res = $this->executeHttp('/api/get-exam', 'GET');
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
            $examId = (int)($row['id'] ?? ($row['exam_id'] ?? 0));
            $name = strtoupper(trim((string)($row['name'] ?? ($row['exam_name'] ?? ''))));
            $price = (float)($row['price'] ?? 0);
            if ($examId <= 0 || $name === '' || $price <= 0) {
                continue;
            }
            $items[] = [
                'provider_plan_id' => $examId,
                'exam_name' => $name,
                'name' => "{$name} Result Checker PIN",
                'wholesale_cost' => $price,
            ];
        }
        return $items;
    }

    /**
     * 11b. Sync Live Exam Packages into exam_packages (preserves admin-locked prices & disables unsupported/stale rows)
     */
    public function syncExamPackages(bool $recalculateUnlocked = false): array
    {
        $items = $this->fetchExamPlans();
        $defaultMarkup = 5.0;
        try {
            $mRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "exam_default_markup_percent"');
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
            $rowId = 'exm_ud_' . $item['provider_plan_id'];
            $wholesale = (float)$item['wholesale_cost'];
            $defaultSelling = round($wholesale * (1 + ($defaultMarkup / 100)), 2);

            $existing = $this->db->fetchOne('SELECT id, price, pricing_mode, admin_price_locked FROM exam_packages WHERE id = :id', ['id' => $rowId]);
            if (!$existing) {
                $desc = "Official {$item['exam_name']} e-PIN scratch card / token generated directly via verified exam gateway.";
                $this->db->execute(
                    'INSERT INTO exam_packages
                     (id, provider_plan_id, exam_name, name, description, wholesale_cost, price, pricing_mode, admin_price_locked, max_quantity, provider_id, is_active, updated_at)
                     VALUES
                     (:id, :ppid, :ename, :name, :desc, :wcost, :price, "default_markup", 0, 10, "ulamadata", 1, NOW())',
                    [
                        'id' => $rowId,
                        'ppid' => $item['provider_plan_id'],
                        'ename' => $item['exam_name'],
                        'name' => $item['name'],
                        'desc' => $desc,
                        'wcost' => $wholesale,
                        'price' => $defaultSelling,
                    ]
                );
                $inserted++;
            } else {
                $isLocked = (int)($existing['admin_price_locked'] ?? 0) === 1
                    || in_array((string)($existing['pricing_mode'] ?? ''), ['fixed', 'markup_percent', 'discount_percent'], true);

                if ($isLocked || !$recalculateUnlocked) {
                    $this->db->execute(
                        'UPDATE exam_packages
                         SET provider_plan_id = :ppid,
                             exam_name = :ename,
                             name = :name,
                             wholesale_cost = :wcost,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $item['provider_plan_id'],
                            'ename' => $item['exam_name'],
                            'name' => $item['name'],
                            'wcost' => $wholesale,
                        ]
                    );
                    if ($isLocked) {
                        $preservedOverrides++;
                    }
                } else {
                    $this->db->execute(
                        'UPDATE exam_packages
                         SET provider_plan_id = :ppid,
                             exam_name = :ename,
                             name = :name,
                             wholesale_cost = :wcost,
                             price = :price,
                             updated_at = NOW()
                         WHERE id = :id',
                        [
                            'id' => $rowId,
                            'ppid' => $item['provider_plan_id'],
                            'ename' => $item['exam_name'],
                            'name' => $item['name'],
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

        if (!empty($syncedIds)) {
            $placeholders = implode(',', array_fill(0, count($syncedIds), '?'));
            $this->db->execute(
                "UPDATE exam_packages SET is_active = 0, updated_at = NOW() WHERE id NOT IN ({$placeholders})",
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
     * 11. Examination Scratch Cards (POST /api/exam)
     */
    public function vendExamPin(string $examName, int $quantity, ?int $providerPlanId = null, ?string $requestId = null): array
    {
        $examId = ($providerPlanId !== null && $providerPlanId > 0) ? $providerPlanId : $this->getExamId($examName);
        $reqId = $requestId ?: ('HT_EXM_' . strtoupper(bin2hex(random_bytes(5))));
        $payload = [
            'exam' => $examId,
            'quantity' => $quantity,
            'request-id' => $reqId,
        ];

        $res = $this->executeHttp('/api/exam', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? 'failed'))));
        $msg = (string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? '')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered', 'completed'], true);
        $isPending = in_array($status, ['pending', 'processing', 'queued', 'initiated'], true);

        if (!$isSuccess && !$isPending) {
            throw new RuntimeException($msg !== '' ? $msg : 'Examination PIN purchase failed upstream');
        }

        $rawCards = $data['cards'] ?? ($data['pins'] ?? ($data['pin'] ?? []));
        $rawSerials = $data['serial'] ?? ($data['serials'] ?? []);
        $cards = [];
        if (is_string($rawCards)) {
            $pinsArr = array_values(array_filter(array_map('trim', preg_split('/\s*,\s*/', $rawCards) ?: [])));
            $serArr = is_string($rawSerials) ? array_values(array_filter(array_map('trim', preg_split('/\s*,\s*/', $rawSerials) ?: []))) : (array)$rawSerials;
            foreach ($pinsArr as $idx => $p) {
                $cards[] = [
                    'pin' => $p,
                    'serial' => (string)($serArr[$idx] ?? ''),
                ];
            }
        } elseif (is_array($rawCards)) {
            foreach ($rawCards as $idx => $c) {
                if (is_array($c)) {
                    $cards[] = [
                        'pin' => (string)($c['pin'] ?? ($c['code'] ?? ($c['token'] ?? json_encode($c)))),
                        'serial' => (string)($c['serial'] ?? ($c['serial_number'] ?? '')),
                    ];
                } else {
                    $serList = is_array($rawSerials) ? $rawSerials : [];
                    $cards[] = [
                        'pin' => trim((string)$c),
                        'serial' => trim((string)($serList[$idx] ?? '')),
                    ];
                }
            }
        }

        return [
            'status' => $isSuccess ? 'successful' : 'pending',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $reqId))),
            'exam' => $examName,
            'quantity' => count($cards) > 0 ? count($cards) : $quantity,
            'cards' => $cards,
            'api_response' => $msg,
            'raw' => $data,
        ];
    }

    /**
     * 12a. Bulk SMS Messaging (POST /api/bulk-sms)
     */
    public function sendBulkSms(string $senderId, array $recipients, string $message, ?string $requestId = null): array
    {
        $cleanRecipients = array_values(array_filter(array_map('trim', $recipients), static fn($r) => $r !== ''));
        $phoneList = implode(',', $cleanRecipients);
        $reqId = $requestId ?: ('HT_SMS_' . strtoupper(bin2hex(random_bytes(5))));
        $payload = [
            'subject' => mb_substr($senderId ?: 'HAMBAK', 0, 11),
            'bulkPhones' => $phoneList,
            'message' => $message,
        ];

        $res = $this->executeHttp('/api/bulk-sms', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower(trim((string)($data['status'] ?? ($data['Status'] ?? 'failed'))));
        $msg = (string)($data['message'] ?? ($data['api_response'] ?? ($data['msg'] ?? '')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered', 'completed', 'sent'], true);
        $isPending = in_array($status, ['pending', 'processing', 'queued', 'initiated'], true);

        if (!$isSuccess && !$isPending) {
            throw new RuntimeException($msg !== '' ? $msg : 'Bulk SMS delivery failed upstream');
        }

        $smsId = (string)($data['sms_id'] ?? ($data['id'] ?? ($data['ident'] ?? ($data['request-id'] ?? $reqId))));
        return [
            'status' => $isSuccess ? 'successful' : 'pending',
            'provider_reference' => $smsId,
            'sms_id' => $smsId,
            'recipients_count' => count($cleanRecipients),
            'units_charged' => $data['units'] ?? count($cleanRecipients),
            'api_response' => $msg,
            'raw' => $data,
        ];
    }

    /**
     * 12b. Bulk SMS Delivery Report Lookup (GET /api/sms-report?sms_id=...)
     */
    public function getSmsReport(string $smsId): array
    {
        $cleanId = trim($smsId);
        if ($cleanId === '') {
            return ['available' => false, 'status' => 'unavailable', 'message' => 'Missing SMS campaign reference.'];
        }
        try {
            $res = $this->executeHttp('/api/sms-report?sms_id=' . rawurlencode($cleanId), 'GET');
            $data = $res['data'];
            return [
                'available' => true,
                'sms_id' => $cleanId,
                'status' => strtolower((string)($data['status'] ?? 'submitted')),
                'report' => $data,
            ];
        } catch (\Throwable $e) {
            return [
                'available' => false,
                'sms_id' => $cleanId,
                'status' => 'unavailable',
                'message' => 'Delivery report status is not available for this reference right now.',
            ];
        }
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
