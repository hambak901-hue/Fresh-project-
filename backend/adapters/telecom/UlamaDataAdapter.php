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
     * 3. Data Bundle Vending (POST /api/data)
     */
    public function purchaseData(string $network, string $phone, string|int $planId, bool $ported = true): array
    {
        $requestId = 'HT_DAT_' . strtoupper(bin2hex(random_bytes(5)));
        $payload = [
            'phone' => $phone,
            'plan' => (int)$planId,
            'bypass' => $ported,
            'Ported_number' => $ported,
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/data', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        $isSuccess = in_array($status, ['success', 'successful', 'delivered'], true);
        $providerRef = (string)($data['request-id'] ?? ($data['ident'] ?? ($data['id'] ?? $requestId)));

        if (!$isSuccess) {
            $msg = $data['message'] ?? ($data['msg'] ?? 'Data bundle vending failed upstream');
            throw new RuntimeException((string)$msg);
        }

        return [
            'status' => 'successful',
            'provider_reference' => $providerRef,
            'network' => $network,
            'phone' => $phone,
            'plan_id' => $planId,
            'raw' => $data,
        ];
    }

    /**
     * 4. Airtime PIN Vending (POST /api/recharge_card)
     */
    public function vendAirtimePin(string $network, float $value, int $quantity, string $businessName): array
    {
        $networkId = $this->getNetworkId($network);
        $requestId = 'HT_PIN_' . strtoupper(bin2hex(random_bytes(5)));
        $payload = [
            'network' => $networkId,
            'amount' => (int)round($value),
            'quantity' => $quantity,
            'business_name' => $businessName ?: 'HambakTech Enterprise',
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/recharge_card', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        if (!in_array($status, ['success', 'successful'], true)) {
            throw new RuntimeException((string)($data['message'] ?? ($data['msg'] ?? 'Airtime PIN generation failed upstream')));
        }

        $cards = $data['cards'] ?? ($data['pins'] ?? ($data['pin'] ?? []));
        if (is_string($cards)) {
            $cards = [$cards];
        }
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? $requestId)),
            'network' => $network,
            'quantity' => is_array($cards) && count($cards) > 0 ? count($cards) : $quantity,
            'cards' => $cards,
            'raw' => $data,
        ];
    }

    /**
     * 5. Data PIN Vending (POST /api/data_card)
     */
    public function vendDataPin(string $network, string|int $planId, int $quantity, string $businessName): array
    {
        $networkId = $this->getNetworkId($network);
        $requestId = 'HT_DPIN_' . strtoupper(bin2hex(random_bytes(5)));
        $payload = [
            'network' => $networkId,
            'plan' => (int)$planId,
            'amount' => (int)$planId,
            'quantity' => $quantity,
            'business_name' => $businessName ?: 'HambakTech Enterprise',
            'request-id' => $requestId,
        ];

        $res = $this->executeHttp('/api/data_card', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower((string)($data['status'] ?? ($data['Status'] ?? 'failed')));
        if (!in_array($status, ['success', 'successful'], true)) {
            throw new RuntimeException((string)($data['message'] ?? ($data['msg'] ?? 'Data PIN generation failed upstream')));
        }

        $cards = $data['cards'] ?? ($data['pins'] ?? ($data['pin'] ?? []));
        if (is_string($cards)) {
            $cards = [$cards];
        }
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['request-id'] ?? ($data['ident'] ?? $requestId)),
            'network' => $network,
            'quantity' => is_array($cards) && count($cards) > 0 ? count($cards) : $quantity,
            'cards' => $cards,
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
     * 14. Dynamic Plan Synchronization (GET /api/data_plans)
     */
    public function syncLivePlans(): array
    {
        $res = $this->executeHttp('/api/data_plans', 'GET');
        $livePlans = $res['data']['plans'] ?? ($res['data']['data'] ?? $res['data']);
        if (!is_array($livePlans)) {
            $livePlans = [];
        }

        $synced = 0;
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

            $planId = (string)($p['plan_id'] ?? ($p['id'] ?? ''));
            if ($planId === '') {
                continue;
            }
            $wholesale = (float)($p['price'] ?? ($p['amount'] ?? 250));
            $selling = (float)round($wholesale * 1.15);
            $size = (string)($p['datasize'] ?? ($p['size'] ?? ($p['plan'] ?? '1GB')));
            $name = (string)($p['name'] ?? "{$networkName} {$size}");
            $ptype = (string)($p['type'] ?? ($p['plan_type'] ?? 'SME'));
            $validity = (string)($p['day'] ?? ($p['validity'] ?? '30 Days'));

            $this->db->execute(
                'INSERT INTO telecom_plans 
                 (id, provider_plan_id, network, name, size, plan_type, validity, wholesale_cost, price, is_active, provider_id, updated_at)
                 VALUES 
                 (:id, :ppid, :net, :name, :size, :ptype, :val, :wcost, :price, 1, "ulamadata", NOW())
                 ON DUPLICATE KEY UPDATE wholesale_cost = :wcost2, name = :name2, updated_at = NOW()',
                [
                    'id' => 'plan_ud_' . $planId,
                    'ppid' => $planId,
                    'net' => $networkName,
                    'name' => $name,
                    'size' => $size,
                    'ptype' => $ptype,
                    'val' => $validity,
                    'wcost' => $wholesale,
                    'price' => $selling,
                    'wcost2' => $wholesale,
                    'name2' => $name,
                ]
            );
            $synced++;
        }

        return ['synced_count' => $synced, 'timestamp' => date('c')];
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
