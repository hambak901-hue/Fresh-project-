<?php
/**
 * @file VtpassAdapter.php
 * Official VTpass Production & Sandbox Telecommunications Adapter
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Telecom;

use RuntimeException;
use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class VtpassAdapter implements TelecomAdapterInterface
{
    private string $baseUrl;
    private string $apiKey;
    private string $publicKey;
    private string $secretKey;
    private string $env;
    private int $timeout;
    private Database $db;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, ?string $publicKey = null, ?string $secretKey = null, int $timeout = 30)
    {
        $this->db = Database::getInstance();
        $configFile = __DIR__ . '/../../config/config.php';
        $config = file_exists($configFile) ? require $configFile : [];
        $cfg = $config['providers']['vtpass'] ?? [];

        $dbRow = null;
        try {
            $dbRow = $this->db->fetchOne('SELECT base_url, api_key, public_key, secret_key, timeout_seconds FROM providers WHERE id = "vtpass"');
        } catch (Throwable) {
        }

        $this->env = getenv('VTPASS_ENV') ?: (string)($cfg['env'] ?? 'live');
        $defaultUrl = ($this->env === 'sandbox') ? 'https://sandbox.vtpass.com/api' : 'https://api-service.vtpass.com/api';
        $envUrl = getenv('VTPASS_API_BASE_URL') ?: (getenv('VTPASS_BASE_URL') ?: '');
        $dbUrl = !empty($dbRow['base_url']) && $dbRow['base_url'] !== 'https://api.example.com' ? (string)$dbRow['base_url'] : '';

        $this->baseUrl = rtrim($baseUrl ?: ($envUrl ?: ($dbUrl ?: ($cfg['base_url'] ?? $defaultUrl))), '/');
        $this->apiKey = $apiKey ?: (getenv('VTPASS_API_KEY') ?: (!empty($dbRow['api_key']) ? (string)$dbRow['api_key'] : (string)($cfg['api_key'] ?? '')));
        $this->publicKey = $publicKey ?: (getenv('VTPASS_PUBLIC_KEY') ?: (!empty($dbRow['public_key']) ? (string)$dbRow['public_key'] : (string)($cfg['public_key'] ?? '')));
        $this->secretKey = $secretKey ?: (getenv('VTPASS_SECRET_KEY') ?: (!empty($dbRow['secret_key']) ? (string)$dbRow['secret_key'] : (string)($cfg['secret_key'] ?? '')));
        $this->timeout = $timeout ?: (int)($dbRow['timeout_seconds'] ?? ($cfg['timeout'] ?? 30));
    }

    public function getName(): string
    {
        return 'VTpass Enterprise Gateway (' . strtoupper($this->env) . ')';
    }

    public function getId(): string
    {
        return 'vtpass';
    }

    private function generateRequestId(): string
    {
        $tz = new \DateTimeZone('Africa/Lagos');
        $now = new \DateTimeImmutable('now', $tz);
        return $now->format('YmdHi') . substr(bin2hex(random_bytes(4)), 0, 8);
    }

    private function mapAirtimeServiceId(string $network): string
    {
        $norm = strtoupper(trim($network));
        if (str_contains($norm, 'GLO')) return 'glo';
        if (str_contains($norm, 'AIRTEL')) return 'airtel';
        if (str_contains($norm, '9MOB') || str_contains($norm, 'ETISALAT')) return 'etisalat';
        return 'mtn';
    }

    private function mapDataServiceId(string $network): string
    {
        return $this->mapAirtimeServiceId($network) . '-data';
    }

    private function mapCableServiceId(string $provider): string
    {
        $norm = strtolower(trim($provider));
        if (str_contains($norm, 'gotv')) return 'gotv';
        if (str_contains($norm, 'star')) return 'startimes';
        if (str_contains($norm, 'showmax')) return 'showmax';
        return 'dstv';
    }

    private function mapDiscoServiceId(string $disco): string
    {
        $norm = strtoupper(trim($disco));
        if (str_contains($norm, 'IKEDC') || str_contains($norm, 'IKEJA')) return 'ikeja-electric';
        if (str_contains($norm, 'EKEDC') || str_contains($norm, 'EKO')) return 'eko-electric';
        if (str_contains($norm, 'AEDC') || str_contains($norm, 'ABUJA')) return 'abuja-electric';
        if (str_contains($norm, 'KEDCO') || str_contains($norm, 'KANO')) return 'kano-electric';
        if (str_contains($norm, 'PHED') || str_contains($norm, 'PORT')) return 'portharcourt-electric';
        if (str_contains($norm, 'JED') || str_contains($norm, 'JOS')) return 'jos-electric';
        if (str_contains($norm, 'IBEDC') || str_contains($norm, 'IBADAN')) return 'ibadan-electric';
        if (str_contains($norm, 'KAEDCO') || str_contains($norm, 'KADUNA')) return 'kaduna-electric';
        if (str_contains($norm, 'BEDC') || str_contains($norm, 'BENIN')) return 'benin-electric';
        if (str_contains($norm, 'EEDC') || str_contains($norm, 'ENUGU')) return 'enugu-electric';
        return strtolower($disco);
    }

    private function executeHttp(string $endpoint, string $method = 'GET', ?array $payload = null): array
    {
        if (empty($this->apiKey) || (strtoupper($method) === 'POST' && empty($this->secretKey)) || (strtoupper($method) === 'GET' && empty($this->publicKey))) {
            throw new RuntimeException('VTpass API credentials are not fully configured.');
        }

        $url = $this->baseUrl . (str_starts_with($endpoint, '/') ? $endpoint : '/' . $endpoint);
        $ch = curl_init($url);
        $startTime = microtime(true);

        $headers = [
            'api-key: ' . $this->apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        if (strtoupper($method) === 'POST') {
            $headers[] = 'secret-key: ' . $this->secretKey;
        } else {
            $headers[] = 'public-key: ' . $this->publicKey;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        if (strtoupper($method) === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($payload !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            }
        }

        $raw = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = ($raw !== false && $raw !== '') ? json_decode((string)$raw, true) : null;
        $ref = $payload['request_id'] ?? null;
        $this->logProviderCall($endpoint, $method, $statusCode, $payload, $parsed ?: ($raw === false ? $curlError : $raw), $latencyMs, $ref);

        if ($raw === false) {
            throw new RuntimeException("VTpass network error: {$curlError}");
        }

        if ($statusCode >= 400) {
            $msg = is_array($parsed) ? ($parsed['response_description'] ?? $parsed['message'] ?? $parsed['error'] ?? "HTTP {$statusCode}") : "HTTP {$statusCode}";
            throw new RuntimeException("VTpass Error: {$msg}");
        }

        return [
            'status_code' => $statusCode,
            'latency_ms' => $latencyMs,
            'data' => is_array($parsed) ? $parsed : [],
            'raw' => $raw,
        ];
    }

    private function logProviderCall(string $endpoint, string $method, int $statusCode, $req, $res, int $latencyMs, ?string $ref): void
    {
        try {
            $this->db->execute(
                'INSERT INTO provider_logs (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES (:id, "vtpass", :ep, :m, :code, :req, :res, :lat, :ref, NOW())',
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
        } catch (Throwable) {
        }
    }

    public function checkBalance(): array
    {
        $res = $this->executeHttp('/balance', 'GET');
        $data = $res['data'];
        $bal = (float)($data['contents']['balance'] ?? 0.00);
        return [
            'success' => true,
            'balance' => $bal,
            'currency' => 'NGN',
            'env' => $this->env,
            'latency_ms' => $res['latency_ms'],
        ];
    }

    public function purchaseData(string $network, string $phone, string|int $planId, bool $ported = true): array
    {
        $requestId = $this->generateRequestId();
        $serviceId = $this->mapDataServiceId($network);
        $payload = [
            'request_id' => $requestId,
            'serviceID' => $serviceId,
            'billersCode' => $phone,
            'variation_code' => (string)$planId,
            'phone' => $phone,
        ];

        $res = $this->executeHttp('/pay', 'POST', $payload);
        $data = $res['data'];
        $code = (string)($data['code'] ?? '');
        $txStatus = strtolower((string)($data['content']['transactions']['status'] ?? ''));

        if ($code !== '000' && $txStatus !== 'delivered') {
            throw new RuntimeException((string)($data['response_description'] ?? 'VTpass data purchase failed'));
        }

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['content']['transactions']['transactionId'] ?? $requestId),
            'request_id' => $requestId,
            'network' => $network,
            'phone' => $phone,
            'plan_id' => $planId,
            'raw' => $data,
        ];
    }

    public function topupAirtime(string $network, string $phone, float $amount, string $airtimeType = 'VTU'): array
    {
        $requestId = $this->generateRequestId();
        $serviceId = $this->mapAirtimeServiceId($network);
        $payload = [
            'request_id' => $requestId,
            'serviceID' => $serviceId,
            'amount' => (int)round($amount),
            'phone' => $phone,
        ];

        $res = $this->executeHttp('/pay', 'POST', $payload);
        $data = $res['data'];
        $code = (string)($data['code'] ?? '');
        $txStatus = strtolower((string)($data['content']['transactions']['status'] ?? ''));

        if ($code !== '000' && $txStatus !== 'delivered') {
            throw new RuntimeException((string)($data['response_description'] ?? 'VTpass airtime topup failed'));
        }

        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['content']['transactions']['transactionId'] ?? $requestId),
            'request_id' => $requestId,
            'network' => $network,
            'phone' => $phone,
            'amount' => $amount,
            'raw' => $data,
        ];
    }

    public function vendAirtimePin(string $network, float $value, int $quantity, string $businessName): array
    {
        throw new RuntimeException('Recharge card PIN printing is not supported by VTpass directly. Switch active telecom provider to UlamaData for PIN vending.');
    }

    public function vendDataPin(string $network, string|int $planId, int $quantity, string $businessName): array
    {
        throw new RuntimeException('Data PIN printing is not supported by VTpass directly. Switch active telecom provider to UlamaData for Data PIN vending.');
    }

    public function processAirtimeSwap(string $network, string $phone, float $amount): array
    {
        throw new RuntimeException('Airtime Swap is not supported on VTpass gateway.');
    }

    public function validateSmartcard(string $provider, string $smartcard): array
    {
        $serviceId = $this->mapCableServiceId($provider);
        $res = $this->executeHttp('/merchant-verify', 'POST', [
            'serviceID' => $serviceId,
            'billersCode' => $smartcard,
        ]);
        $data = $res['data'];
        $content = $data['content'] ?? [];
        $customer = $content['Customer_Name'] ?? ($content['customerName'] ?? ($content['name'] ?? ''));
        if (empty($customer) || !empty($content['error'])) {
            throw new RuntimeException((string)($content['error'] ?? $data['response_description'] ?? 'Smartcard validation failed'));
        }
        return [
            'success' => true,
            'customer_name' => $customer,
            'status' => $content['Status'] ?? ($content['status'] ?? 'active'),
            'due_date' => $content['Due_Date'] ?? null,
            'bouquet' => $content['Current_Bouquet'] ?? null,
            'raw' => $data,
        ];
    }

    public function renewCable(string $provider, string $smartcard, string $packageCode): array
    {
        $requestId = $this->generateRequestId();
        $serviceId = $this->mapCableServiceId($provider);
        $payload = [
            'request_id' => $requestId,
            'serviceID' => $serviceId,
            'billersCode' => $smartcard,
            'variation_code' => $packageCode,
            'phone' => '08000000000',
            'subscription_type' => 'change',
        ];
        $res = $this->executeHttp('/pay', 'POST', $payload);
        $data = $res['data'];
        if ((string)($data['code'] ?? '') !== '000') {
            throw new RuntimeException((string)($data['response_description'] ?? 'VTpass cable TV subscription failed'));
        }
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['content']['transactions']['transactionId'] ?? $requestId),
            'request_id' => $requestId,
            'provider' => $provider,
            'smartcard' => $smartcard,
            'package' => $packageCode,
            'raw' => $data,
        ];
    }

    public function validateMeter(string $discoCode, string $meterNumber, string $meterType): array
    {
        $serviceId = $this->mapDiscoServiceId($discoCode);
        $res = $this->executeHttp('/merchant-verify', 'POST', [
            'serviceID' => $serviceId,
            'billersCode' => $meterNumber,
            'type' => strtolower($meterType) === 'postpaid' ? 'postpaid' : 'prepaid',
        ]);
        $data = $res['data'];
        $content = $data['content'] ?? [];
        $customer = $content['Customer_Name'] ?? ($content['customerName'] ?? ($content['name'] ?? ''));
        if (empty($customer) || !empty($content['error'])) {
            throw new RuntimeException((string)($content['error'] ?? $data['response_description'] ?? 'Meter validation failed'));
        }
        return [
            'success' => true,
            'customer_name' => $customer,
            'address' => $content['Address'] ?? ($content['address'] ?? ''),
            'meter_number' => $meterNumber,
            'disco' => $discoCode,
            'meter_type' => $meterType,
            'raw' => $data,
        ];
    }

    public function vendElectricity(string $discoCode, string $meterNumber, float $amount, string $meterType): array
    {
        $requestId = $this->generateRequestId();
        $serviceId = $this->mapDiscoServiceId($discoCode);
        $payload = [
            'request_id' => $requestId,
            'serviceID' => $serviceId,
            'billersCode' => $meterNumber,
            'variation_code' => strtolower($meterType) === 'postpaid' ? 'postpaid' : 'prepaid',
            'amount' => (int)round($amount),
            'phone' => '08000000000',
        ];
        $res = $this->executeHttp('/pay', 'POST', $payload);
        $data = $res['data'];
        if ((string)($data['code'] ?? '') !== '000') {
            throw new RuntimeException((string)($data['response_description'] ?? 'VTpass electricity vending failed'));
        }
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['content']['transactions']['transactionId'] ?? $requestId),
            'request_id' => $requestId,
            'disco' => $discoCode,
            'meter_number' => $meterNumber,
            'token' => $data['purchased_code'] ?? ($data['token'] ?? ($data['mainToken'] ?? null)),
            'units' => $data['units'] ?? ($data['mainTokenUnits'] ?? null),
            'amount' => $amount,
            'raw' => $data,
        ];
    }

    public function vendExamPin(string $examName, int $quantity): array
    {
        $requestId = $this->generateRequestId();
        $norm = strtolower(trim($examName));
        $serviceId = str_contains($norm, 'jamb') ? 'jamb' : 'waec';
        $payload = [
            'request_id' => $requestId,
            'serviceID' => $serviceId,
            'variation_code' => $serviceId === 'jamb' ? 'utme-no-mock' : 'waecdirect',
            'quantity' => $quantity,
            'phone' => '08000000000',
        ];
        $res = $this->executeHttp('/pay', 'POST', $payload);
        $data = $res['data'];
        if ((string)($data['code'] ?? '') !== '000') {
            throw new RuntimeException((string)($data['response_description'] ?? 'VTpass education PIN vending failed'));
        }
        return [
            'status' => 'successful',
            'provider_reference' => (string)($data['content']['transactions']['transactionId'] ?? $requestId),
            'exam' => $examName,
            'quantity' => $quantity,
            'cards' => $data['cards'] ?? [['pin' => $data['purchased_code'] ?? '', 'serial' => $requestId]],
            'raw' => $data,
        ];
    }

    public function sendBulkSms(string $senderId, array $recipients, string $message): array
    {
        throw new RuntimeException('Bulk SMS is not supported via VTpass.');
    }

    public function queryTransaction(string $reference): array
    {
        $res = $this->executeHttp('/requery', 'POST', ['request_id' => $reference]);
        return $res['data'];
    }

    public function syncLivePlans(): array
    {
        $services = ['MTN' => 'mtn-data', 'AIRTEL' => 'airtel-data', 'GLO' => 'glo-data', '9MOBILE' => 'etisalat-data'];
        $synced = 0;

        foreach ($services as $net => $serviceId) {
            try {
                $res = $this->executeHttp('/service-variations?serviceID=' . urlencode($serviceId), 'GET');
                $variations = $res['data']['content']['varations'] ?? ($res['data']['content']['variations'] ?? []);
                foreach ($variations as $v) {
                    $code = (string)($v['variation_code'] ?? '');
                    if ($code === '') continue;
                    $wholesale = (float)($v['variation_amount'] ?? 0);
                    $price = round($wholesale * 1.05, 2);
                    $name = (string)($v['name'] ?? $code);

                    $this->db->execute(
                        'INSERT INTO telecom_plans
                         (id, provider_plan_id, network, name, size, plan_type, validity, wholesale_cost, price, is_active, provider_id, created_at)
                         VALUES (:id, :ppid, :net, :name, :size, "Direct", "30 Days", :wc, :pr, 1, "vtpass", NOW())
                         ON DUPLICATE KEY UPDATE wholesale_cost = :wc2, name = :name2, is_active = 1',
                        [
                            'id' => 'plan_vt_' . preg_replace('/[^a-zA-Z0-9_]/', '_', $serviceId . '_' . $code),
                            'ppid' => $code,
                            'net' => $net,
                            'name' => $name,
                            'size' => $name,
                            'wc' => $wholesale,
                            'pr' => $price,
                            'wc2' => $wholesale,
                            'name2' => $name,
                        ]
                    );
                    $synced++;
                }
            } catch (Throwable) {
                // Skip individual network failure during sync
            }
        }

        return ['synced_count' => $synced, 'provider' => 'vtpass', 'timestamp' => date('c')];
    }

    public function ping(): array
    {
        try {
            $bal = $this->checkBalance();
            return [
                'status' => 'operational',
                'balance' => $bal['balance'],
                'latency_ms' => $bal['latency_ms'],
                'message' => 'VTpass gateway reachable and balance retrieved.',
            ];
        } catch (Throwable $e) {
            return [
                'status' => empty($this->apiKey) ? 'unconfigured' : 'error',
                'message' => $e->getMessage(),
            ];
        }
    }
}
