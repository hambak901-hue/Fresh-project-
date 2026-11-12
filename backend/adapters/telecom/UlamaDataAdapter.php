<?php
/**
 * @file UlamaDataAdapter.php
 * Official UlamaData Production Telecommunications Adapter
 * Target: cPanel PHP 8.2+ / MySQL 8.x
 *
 * Documentation References:
 * https://www.ulamadata.ng/documentation
 * https://www.ulamadata.ng/documentation/user-request
 * https://www.ulamadata.ng/documentation/airtime-request
 * https://www.ulamadata.ng/documentation/data-request
 * https://www.ulamadata.ng/documentation/airtimepin-request
 * https://www.ulamadata.ng/documentation/airtimeswap-request
 * https://www.ulamadata.ng/documentation/cable-request
 * https://www.ulamadata.ng/documentation/datapin-request
 * https://www.ulamadata.ng/documentation/bulksms-request
 * https://www.ulamadata.ng/documentation/electricity-request
 * https://www.ulamadata.ng/documentation/exam-request
 * https://www.ulamadata.ng/documentation/webhooks
 * https://www.ulamadata.ng/documentation/transactions-request
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
            // Table may be migrating
        }

        $dbUrl = !empty($dbProvider['base_url']) && $dbProvider['base_url'] !== 'https://api.example.com' ? (string)$dbProvider['base_url'] : '';
        $this->baseUrl = rtrim($baseUrl ?: ($dbUrl ?: ($providerConfig['base_url'] ?? 'https://www.ulamadata.ng')), '/');
        $this->apiKey = $apiKey ?: (getenv('ULAMADATA_API_KEY') ?: (!empty($dbProvider['api_key']) ? $dbProvider['api_key'] : ($providerConfig['api_key'] ?? '')));
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
     * Map network name to Ulamadata network ID
     * 1 = MTN, 2 = GLO, 3 = 9MOBILE, 4 = AIRTEL
     */
    public function getNetworkId(string $network): int
    {
        $norm = strtoupper(trim($network));
        if (str_contains($norm, 'MTN')) return 1;
        if (str_contains($norm, 'GLO')) return 2;
        if (str_contains($norm, '9MOB') || str_contains($norm, 'ETISALAT')) return 3;
        if (str_contains($norm, 'AIRTEL')) return 4;
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
     * Map electricity disco to Ulamadata disco ID
     * 1 = Ikeja, 2 = Eko, 3 = Abuja, 4 = Kano, 5 = Port Harcourt,
     * 6 = Jos, 7 = Ibadan, 8 = Kaduna, 9 = Benin, 10 = Enugu
     */
    public function getDiscoId(string $disco): int
    {
        $norm = strtoupper(trim($disco));
        if (str_contains($norm, 'IKEDC') || str_contains($norm, 'IKEJA')) return 1;
        if (str_contains($norm, 'EKEDC') || str_contains($norm, 'EKO')) return 2;
        if (str_contains($norm, 'AEDC') || str_contains($norm, 'ABUJA')) return 3;
        if (str_contains($norm, 'KEDCO') || str_contains($norm, 'KANO')) return 4;
        if (str_contains($norm, 'PHED') || str_contains($norm, 'PORT')) return 5;
        if (str_contains($norm, 'JED') || str_contains($norm, 'JOS')) return 6;
        if (str_contains($norm, 'IBEDC') || str_contains($norm, 'IBADAN')) return 7;
        if (str_contains($norm, 'KAEDCO') || str_contains($norm, 'KADUNA')) return 8;
        if (str_contains($norm, 'BEDC') || str_contains($norm, 'BENIN')) return 9;
        if (str_contains($norm, 'EEDC') || str_contains($norm, 'ENUGU')) return 10;
        return 1;
    }

    /**
     * Master HTTP Executor with zero-simulation enforcement
     */
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

        // Audit Journaling in provider_logs
        $reference = $payload['ident'] ?? ($payload['reference'] ?? ($parsed['ident'] ?? null));
        $this->logProviderCall($endpoint, $method, $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("UlamaData network communication error: {$curlError} ({$url})");
        }

        if ($statusCode >= 400) {
            $msg = $parsed['message'] ?? ($parsed['msg'] ?? ($parsed['detail'] ?? ($parsed['error'] ?? "Upstream provider error HTTP {$statusCode}")));
            throw new RuntimeException("UlamaData Error: {$msg}");
        }

        return [
            'status_code' => $statusCode,
            'latency_ms' => $latencyMs,
            'data' => $parsed ?? [],
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
            // Fail silent on audit table lock
        }
    }

    /**
     * 1. Query Gateway Balance
     */
    public function checkBalance(): array
    {
        $res = $this->executeHttp('/api/user/', 'GET');
        $userData = $res['data']['user'] ?? ($res['data'] ?? []);
        $balance = (float)($userData['wallet_balance'] ?? ($userData['balance'] ?? 0.00));

        return [
            'success' => true,
            'balance' => $balance,
            'currency' => 'NGN',
            'username' => $userData['username'] ?? 'HambakTech',
            'latency_ms' => $res['latency_ms'],
        ];
    }

    /**
     * 2. Airtime Vending
     */
    public function topupAirtime(string $network, string $phone, float $amount, string $airtimeType = 'VTU'): array
    {
        $networkId = $this->getNetworkId($network);
        $payload = [
            'network' => $networkId,
            'amount' => (int)$amount,
            'mobile_number' => $phone,
            'Ported_number' => true,
            'airtime_type' => $airtimeType,
        ];

        $res = $this->executeHttp('/api/topup/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        $isSuccess = ($status === 'success' || $status === 'successful');
        $providerRef = (string)($data['ident'] ?? ($data['id'] ?? ('UD_AIR_' . time())));

        if (!$isSuccess) {
            $msg = $data['msg'] ?? ($data['message'] ?? 'Airtime top-up failed upstream');
            throw new RuntimeException($msg);
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
     * 3. Data Bundle Vending
     */
    public function purchaseData(string $network, string $phone, string|int $planId, bool $ported = true): array
    {
        $networkId = $this->getNetworkId($network);
        $payload = [
            'network' => $networkId,
            'mobile_number' => $phone,
            'plan' => (int)$planId,
            'Ported_number' => $ported,
        ];

        $res = $this->executeHttp('/api/data/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        $isSuccess = ($status === 'success' || $status === 'successful');
        $providerRef = (string)($data['ident'] ?? ($data['id'] ?? ('UD_DAT_' . time())));

        if (!$isSuccess) {
            $msg = $data['msg'] ?? ($data['message'] ?? 'Data bundle vending failed upstream');
            throw new RuntimeException($msg);
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
     * 4. Airtime PIN Vending (Recharge Card Printing)
     */
    public function vendAirtimePin(string $network, float $value, int $quantity, string $businessName): array
    {
        $networkId = $this->getNetworkId($network);
        $payload = [
            'network' => $networkId,
            'amount' => (int)$value,
            'quantity' => $quantity,
            'name_on_card' => $businessName ?: 'HambakTech Enterprise',
        ];

        $res = $this->executeHttp('/api/airtimepin/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        if ($status !== 'success' && $status !== 'successful') {
            throw new RuntimeException($data['msg'] ?? ($data['message'] ?? 'Airtime PIN generation failed upstream'));
        }

        $cards = $data['cards'] ?? ($data['pins'] ?? []);
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['ident'] ?? ('UD_PIN_' . time())),
            'network' => $network,
            'quantity' => count($cards) ?: $quantity,
            'cards' => $cards,
            'raw' => $data,
        ];
    }

    /**
     * 5. Data PIN Vending
     */
    public function vendDataPin(string $network, string|int $planId, int $quantity, string $businessName): array
    {
        $networkId = $this->getNetworkId($network);
        $payload = [
            'network' => $networkId,
            'plan' => (int)$planId,
            'quantity' => $quantity,
            'name_on_card' => $businessName ?: 'HambakTech Enterprise',
        ];

        $res = $this->executeHttp('/api/datapin/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        if ($status !== 'success' && $status !== 'successful') {
            throw new RuntimeException($data['msg'] ?? ($data['message'] ?? 'Data PIN generation failed upstream'));
        }

        $cards = $data['cards'] ?? ($data['pins'] ?? []);
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['ident'] ?? ('UD_DPIN_' . time())),
            'network' => $network,
            'quantity' => count($cards) ?: $quantity,
            'cards' => $cards,
            'raw' => $data,
        ];
    }

    /**
     * 6. Airtime Swap (Airtime to Cash)
     */
    public function processAirtimeSwap(string $network, string $phone, float $amount): array
    {
        $networkId = $this->getNetworkId($network);
        $payload = [
            'network' => $networkId,
            'mobile_number' => $phone,
            'amount' => (int)$amount,
        ];

        $res = $this->executeHttp('/api/airtimeswap/', 'POST', $payload);
        $data = $res['data'];

        return [
            'status' => 'pending',
            'provider_reference' => (string)($data['ident'] ?? ('UD_SWP_' . time())),
            'network' => $network,
            'phone' => $phone,
            'amount' => $amount,
            'transfer_number' => $data['transfer_number'] ?? $data['merchant_number'] ?? null,
            'instructions' => $data['instructions'] ?? 'Transfer airtime to provided merchant number and await automated verification.',
            'raw' => $data,
        ];
    }

    /**
     * 7. Smartcard Validation
     */
    public function validateSmartcard(string $provider, string $smartcard): array
    {
        $cableId = $this->getCableId($provider);
        $res = $this->executeHttp("/api/cable/verify?cable={$cableId}&smartcard={$smartcard}", 'GET');
        $data = $res['data'];

        $customer = $data['customer_name'] ?? ($data['name'] ?? ($data['Customer_Name'] ?? ''));
        if (empty($customer)) {
            throw new RuntimeException('Unable to validate smartcard. Please check IUC/smartcard number.');
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
     * 8. Cable TV Subscription
     */
    public function renewCable(string $provider, string $smartcard, string $packageCode): array
    {
        $cableId = $this->getCableId($provider);
        $payload = [
            'cablename' => $cableId,
            'cableplan' => (int)$packageCode,
            'smart_card_number' => $smartcard,
        ];

        $res = $this->executeHttp('/api/cable/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        if ($status !== 'success' && $status !== 'successful') {
            throw new RuntimeException($data['msg'] ?? ($data['message'] ?? 'Cable TV renewal failed upstream'));
        }

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['ident'] ?? ('UD_CAB_' . time())),
            'provider' => $provider,
            'smartcard' => $smartcard,
            'package' => $packageCode,
            'raw' => $data,
        ];
    }

    /**
     * 9. Electricity Meter Validation
     */
    public function validateMeter(string $discoCode, string $meterNumber, string $meterType): array
    {
        $discoId = $this->getDiscoId($discoCode);
        $typeInt = (strtolower($meterType) === 'postpaid') ? 2 : 1;

        $res = $this->executeHttp("/api/electricity/verify?disco={$discoId}&meternumber={$meterNumber}&type={$typeInt}", 'GET');
        $data = $res['data'];

        $customer = $data['customer_name'] ?? ($data['name'] ?? ($data['Customer_Name'] ?? ''));
        if (empty($customer)) {
            throw new RuntimeException('Meter number could not be validated with distribution company.');
        }

        return [
            'success' => true,
            'customer_name' => $customer,
            'address' => $data['address'] ?? $data['Customer_Address'] ?? '',
            'meter_number' => $meterNumber,
            'disco' => $discoCode,
            'meter_type' => $meterType,
            'raw' => $data,
        ];
    }

    /**
     * 10. Electricity Bill Payment & STS Token
     */
    public function vendElectricity(string $discoCode, string $meterNumber, float $amount, string $meterType): array
    {
        $discoId = $this->getDiscoId($discoCode);
        $typeInt = (strtolower($meterType) === 'postpaid') ? 2 : 1;

        $payload = [
            'disco_name' => $discoId,
            'meter_number' => $meterNumber,
            'MeterType' => $typeInt,
            'amount' => (int)$amount,
        ];

        $res = $this->executeHttp('/api/billpayment/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        if ($status !== 'success' && $status !== 'successful') {
            throw new RuntimeException($data['msg'] ?? ($data['message'] ?? 'Electricity payment failed upstream'));
        }

        $token = $data['token'] ?? ($data['Token'] ?? ($data['purchased_code'] ?? null));
        $units = $data['units'] ?? ($data['Units'] ?? null);

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['ident'] ?? ('UD_ELE_' . time())),
            'disco' => $discoCode,
            'meter_number' => $meterNumber,
            'token' => $token,
            'units' => $units,
            'amount' => $amount,
            'raw' => $data,
        ];
    }

    /**
     * 11. Examination Scratch Cards
     */
    public function vendExamPin(string $examName, int $quantity): array
    {
        $payload = [
            'exam_name' => strtoupper($examName),
            'quantity' => $quantity,
        ];

        $res = $this->executeHttp('/api/exam/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        if ($status !== 'success' && $status !== 'successful') {
            throw new RuntimeException($data['msg'] ?? ($data['message'] ?? 'Examination PIN purchase failed upstream'));
        }

        $cards = $data['cards'] ?? ($data['pins'] ?? []);
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['ident'] ?? ('UD_EXM_' . time())),
            'exam' => $examName,
            'quantity' => count($cards) ?: $quantity,
            'cards' => $cards,
            'raw' => $data,
        ];
    }

    /**
     * 12. Bulk SMS Messaging
     */
    public function sendBulkSms(string $senderId, array $recipients, string $message): array
    {
        $phoneList = implode(',', $recipients);
        $payload = [
            'sender' => substr($senderId, 0, 11),
            'recipient' => $phoneList,
            'message' => $message,
        ];

        $res = $this->executeHttp('/api/bulksms/', 'POST', $payload);
        $data = $res['data'];

        $status = strtolower($data['status'] ?? ($data['Status'] ?? 'failed'));
        if ($status !== 'success' && $status !== 'successful') {
            throw new RuntimeException($data['msg'] ?? ($data['message'] ?? 'Bulk SMS delivery failed upstream'));
        }

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['ident'] ?? ('UD_SMS_' . time())),
            'recipients_count' => count($recipients),
            'units_charged' => $data['units'] ?? count($recipients),
            'raw' => $data,
        ];
    }

    /**
     * 13. Query Transaction Reference
     */
    public function queryTransaction(string $reference): array
    {
        $res = $this->executeHttp("/api/transactions/?reference={$reference}", 'GET');
        return $res['data'];
    }

    /**
     * 14. Dynamic Plan Synchronization
     */
    public function syncLivePlans(): array
    {
        $res = $this->executeHttp('/api/data/plans/', 'GET');
        $livePlans = $res['data']['plans'] ?? ($res['data'] ?? []);

        $synced = 0;
        foreach ($livePlans as $p) {
            $networkName = match ((int)($p['network'] ?? 1)) {
                1 => 'MTN',
                2 => 'GLO',
                3 => '9MOBILE',
                4 => 'AIRTEL',
                default => 'MTN'
            };

            $this->db->execute(
                'INSERT INTO telecom_plans 
                 (id, provider_plan_id, network, name, size, plan_type, validity, wholesale_cost, price, is_active, provider_id, updated_at)
                 VALUES 
                 (:id, :ppid, :net, :name, :size, :ptype, :val, :wcost, :price, 1, "ulamadata", NOW())
                 ON DUPLICATE KEY UPDATE wholesale_cost = :wcost2, name = :name2, updated_at = NOW()',
                [
                    'id' => 'plan_ud_' . ($p['id'] ?? $p['plan_id']),
                    'ppid' => (string)($p['id'] ?? $p['plan_id']),
                    'net' => $networkName,
                    'name' => $p['name'] ?? "{$networkName} Data",
                    'size' => $p['size'] ?? ($p['plan'] ?? '1GB'),
                    'ptype' => $p['plan_type'] ?? 'SME',
                    'val' => $p['validity'] ?? '30 Days',
                    'wcost' => (float)($p['price'] ?? ($p['amount'] ?? 250)),
                    'price' => (float)round(($p['price'] ?? 250) * 1.15),
                    'wcost2' => (float)($p['price'] ?? ($p['amount'] ?? 250)),
                    'name2' => $p['name'] ?? "{$networkName} Data",
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
