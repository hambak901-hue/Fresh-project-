<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;
use Exception;
use RuntimeException;

/**
 * Ulamadata Telecom & VTU Integration Provider Adapter
 *
 * Provider: Ulamadata / Hambak Tech & Services
 * Base URL: https://ulamadata.ng/api
 * Authentication: Authorization: Token <API_KEY>
 *
 * Supported Capabilities:
 * - User Balance & Profile: GET /api/user
 * - Network Provider Metadata: GET /api/get-networks?service=airtime
 * - Data Plans Directory: GET /api/data_plans
 * - Purchase Airtime: POST /api/airtime
 * - Purchase Data: POST /api/data
 * - Transaction Status: GET /api/airtime/{ident} or GET /api/data/{ident}
 */
class UlamadataAdapter extends BaseProviderAdapter implements ServiceProviderAdapterInterface
{
    public const DEFAULT_CODE = 'ULAMADATA';
    public const DEFAULT_BASE_URL = 'https://ulamadata.ng/api';

    /**
     * Map canonical network identifiers to Ulamadata network IDs
     */
    protected const NETWORK_MAP = [
        'MTN'     => 1,
        'AIRTEL'  => 2,
        'GLO'     => 3,
        '9MOBILE' => 4,
        'ETISALAT'=> 4,
    ];

    public function __construct(string $code = self::DEFAULT_CODE, array $overrides = [])
    {
        if (empty($overrides['baseUrl'])) {
            $overrides['baseUrl'] = getenv('ULAMADATA_BASE_URL') ?: self::DEFAULT_BASE_URL;
        }

        parent::__construct($code, $overrides);

        $envKey = getenv('ULAMADATA_API_KEY') ?: getenv('OLAMICONNECT_API_KEY');
        if (!empty($envKey) && empty($this->apiKey)) {
            $this->apiKey = $envKey;
            $this->providerRecord['apiKeyEncrypted'] = $this->encrypt($envKey);
        }
    }

    public function getCode(): string
    {
        return self::DEFAULT_CODE;
    }

    public function getName(): string
    {
        return 'Ulamadata / Hambak Tech & Services VTU Gateway';
    }

    public function getCategory(): string
    {
        return 'TELECOM_VTU';
    }

    public function getSupportedServices(): array
    {
        return ['airtime', 'data', 'vtu'];
    }

    /**
     * Standard authentication headers for Ulamadata API
     */
    protected function getAuthHeaders(): array
    {
        $headers = [
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: HambakTech-Enterprise/1.0',
        ];

        if (!empty($this->apiKey)) {
            $headers[] = 'Authorization: Token ' . $this->apiKey;
        }

        return $headers;
    }

    /**
     * Authenticate and verify provider connectivity
     */
    public function authenticate(): array
    {
        $bal = $this->queryBalance();
        return [
            'success'       => !empty($bal['success']),
            'authenticated' => !empty($bal['success']),
            'environment'   => 'live',
            'message'       => ($bal['success'] ?? false) ? 'Ulamadata authenticated successfully' : ($bal['error'] ?? 'Authentication failed'),
        ];
    }

    /**
     * Queries live wallet float from Ulamadata (/api/user)
     */
    public function queryBalance(): array
    {
        $url = rtrim($this->baseUrl, '/') . '/user';
        $startTime = microtime(true);

        try {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => $this->getAuthHeaders(),
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_CONNECTTIMEOUT => 7,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            $durationMs = (int) round((microtime(true) - $startTime) * 1000);

            if ($response === false || !empty($curlError)) {
                return [
                    'success'    => false,
                    'error'      => 'Connection to Ulamadata failed: ' . $curlError,
                    'latencyMs'  => $durationMs,
                    'httpCode'   => $httpCode,
                ];
            }

            $json = json_decode($response, true);
            if (!is_array($json)) {
                return [
                    'success'    => false,
                    'error'      => "Invalid JSON response from Ulamadata (HTTP {$httpCode})",
                    'latencyMs'  => $durationMs,
                    'httpCode'   => $httpCode,
                    'raw'        => substr($response, 0, 300),
                ];
            }

            if ($httpCode === 200 && ($json['status'] ?? '') === 'success') {
                $userData = $json['user'] ?? ($json['data']['user'] ?? []);
                $rawBal = (float) ($json['wallet'] ?? $json['balance'] ?? ($userData['wallet'] ?? 0));
                $balKobo = (int) round($rawBal * 100);
                $userName = trim(($userData['name'] ?? '') . ' ' . ($userData['surname'] ?? ''));

                return [
                    'success'     => true,
                    'balanceKobo' => $balKobo,
                    'balanceNgn'  => $rawBal,
                    'currency'    => 'NGN',
                    'status'      => 'ONLINE',
                    'mode'        => 'LIVE',
                    'latencyMs'   => $durationMs,
                    'userName'    => !empty($userName) ? $userName : ($userData['name'] ?? null),
                    'userEmail'   => $userData['email'] ?? null,
                    'raw'         => $json,
                ];
            }

            return [
                'success'    => false,
                'error'      => $json['message'] ?? $json['detail'] ?? "HTTP {$httpCode} error from Ulamadata",
                'latencyMs'  => $durationMs,
                'httpCode'   => $httpCode,
                'raw'        => $json,
            ];
        } catch (\Throwable $e) {
            return [
                'success'   => false,
                'error'     => 'Exception during balance check: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $startTime) * 1000),
            ];
        }
    }

    /**
     * Resolves canonical network code to Ulamadata numeric network ID
     */
    public function resolveNetworkId(string $network): int
    {
        $clean = strtoupper(trim($network));
        foreach (self::NETWORK_MAP as $key => $id) {
            if (str_contains($clean, $key)) {
                return $id;
            }
        }
        return 1; // Default MTN
    }

    /**
     * Fetches live networks catalog from Ulamadata
     */
    public function getNetworks(string $service = 'airtime'): array
    {
        $url = rtrim($this->baseUrl, '/') . '/get-networks?service=' . urlencode($service);
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT        => 15,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $json = json_decode((string) $response, true);
        if (!is_array($json)) return [];
        return isset($json['data']) ? $json['data'] : (isset($json[0]) ? $json : []);
    }

    /**
     * Fetches live data plans from Ulamadata
     */
    public function getDataPlans(): array
    {
        $url = rtrim($this->baseUrl, '/') . '/data_plans';
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT        => 20,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $json = json_decode((string) $response, true);
        if (!is_array($json)) return [];
        return isset($json['data']) ? $json['data'] : (isset($json[0]) ? $json : []);
    }

    /**
     * Customer phone validation and preliminary routing check
     */
    public function verifyCustomer(string $serviceType, array $params): array
    {
        $phone = preg_replace('/\D/', '', (string) ($params['phone'] ?? $params['billersCode'] ?? ''));
        if (strlen($phone) < 11) {
            return [
                'success' => false,
                'message' => 'Invalid Nigerian mobile phone number length.',
            ];
        }

        return [
            'success'      => true,
            'customerName' => 'Subscriber ' . substr($phone, 0, 4) . '***' . substr($phone, -4),
            'accountStatus'=> 'ACTIVE',
            'phone'        => $phone,
        ];
    }

    /**
     * Executes VTU airtime or data purchase on Ulamadata
     */
    public function executeTransaction(array $params): array
    {
        $type = strtolower((string) ($params['serviceType'] ?? $params['serviceID'] ?? 'airtime'));
        $phone = preg_replace('/\D/', '', (string) ($params['phone'] ?? $params['billersCode'] ?? ''));

        // Infer network from parameter or serviceID if not explicitly provided
        $network = (string) ($params['network'] ?? '');
        if (empty($network)) {
            $rawSid = strtoupper((string)($params['serviceID'] ?? $params['serviceType'] ?? ''));
            if (str_contains($rawSid, 'AIRTEL') || str_contains($rawSid, 'AIR')) {
                $network = 'AIRTEL';
            } elseif (str_contains($rawSid, 'GLO')) {
                $network = 'GLO';
            } elseif (str_contains($rawSid, '9MOB') || str_contains($rawSid, 'ETISALAT')) {
                $network = '9MOBILE';
            } else {
                $network = 'MTN';
            }
        }
        $networkId = $this->resolveNetworkId($network);
        $amount = (float) ($params['amount'] ?? 0);
        $clientRef = (string) ($params['requestId'] ?? $params['request_id'] ?? ('HT_ULA_' . bin2hex(random_bytes(8))));

        $airtimeType = (string) ($params['airtime_type'] ?? $params['airtimeType'] ?? $params['type'] ?? 'VTU');
        $portedNumber = isset($params['Ported_number']) ? (bool)$params['Ported_number'] : (isset($params['bypass_validation']) ? (bool)$params['bypass_validation'] : true);

        if (str_contains($type, 'data')) {
            $planId = (int) ($params['planId'] ?? $params['variation_code'] ?? 0);
            return $this->purchaseData($networkId, $phone, $planId, $clientRef);
        }

        return $this->purchaseAirtime($networkId, $phone, $amount, $clientRef, $airtimeType, $portedNumber);
    }

    /**
     * Purchases Airtime via POST /api/airtime
     */
    public function purchaseAirtime(int $networkId, string $phone, float $amount, string $clientRef, string $airtimeType = 'VTU', bool $portedNumber = true): array
    {
        $url = rtrim($this->baseUrl, '/') . '/airtime';
        $payload = [
            'network'       => $networkId,
            'amount'        => (int) round($amount),
            'mobile_number' => $phone,
            'Ported_number' => $portedNumber,
            'airtime_type'  => $airtimeType,
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT        => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || !empty($curlError)) {
            return [
                'success' => false,
                'status'  => 'FAILED',
                'message' => 'Upstream connection error to Ulamadata: ' . $curlError,
                'raw'     => null,
            ];
        }

        $json = json_decode($response, true);
        if (!is_array($json)) {
            return [
                'success' => false,
                'status'  => 'FAILED',
                'message' => "Invalid response from Ulamadata airtime gateway (HTTP {$httpCode})",
                'raw'     => $response,
            ];
        }

        $isSuccess = ($httpCode === 200 || $httpCode === 201) &&
                     (($json['status'] ?? '') === 'success' || strtolower((string)($json['data']['status'] ?? '')) === 'successful');

        $ident = $json['data']['ident'] ?? $json['ident'] ?? null;

        return [
            'success'           => $isSuccess,
            'status'            => $isSuccess ? 'SUCCESS' : 'FAILED',
            'clientReference'   => $clientRef,
            'providerReference' => $ident,
            'amount'            => $amount,
            'phone'             => $phone,
            'message'           => $json['message'] ?? ($isSuccess ? 'Airtime recharge successful.' : 'Airtime transaction failed.'),
            'raw'               => $json,
        ];
    }

    /**
     * Purchases Data Bundle via POST /api/data
     */
    public function purchaseData(int $networkId, string $phone, int $planId, string $clientRef): array
    {
        $url = rtrim($this->baseUrl, '/') . '/data';
        $payload = [
            'network'       => $networkId,
            'mobile_number' => $phone,
            'plan'          => $planId,
            'Ported_number' => true,
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT        => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || !empty($curlError)) {
            return [
                'success' => false,
                'status'  => 'FAILED',
                'message' => 'Upstream connection error to Ulamadata: ' . $curlError,
                'raw'     => null,
            ];
        }

        $json = json_decode($response, true);
        if (!is_array($json)) {
            return [
                'success' => false,
                'status'  => 'FAILED',
                'message' => "Invalid response from Ulamadata data gateway (HTTP {$httpCode})",
                'raw'     => $response,
            ];
        }

        $isSuccess = ($httpCode === 200 || $httpCode === 201) &&
                     (($json['status'] ?? '') === 'success' || strtolower((string)($json['data']['status'] ?? '')) === 'successful');

        $ident = $json['data']['ident'] ?? $json['ident'] ?? null;

        return [
            'success'           => $isSuccess,
            'status'            => $isSuccess ? 'SUCCESS' : 'FAILED',
            'clientReference'   => $clientRef,
            'providerReference' => $ident,
            'phone'             => $phone,
            'message'           => $json['message'] ?? ($isSuccess ? 'Data bundle recharge successful.' : 'Data transaction failed.'),
            'raw'               => $json,
        ];
    }

    /**
     * Requeries transaction status by provider identifier or client reference
     */
    public function queryTransaction(string $transactionReference): array
    {
        $url = rtrim($this->baseUrl, '/') . '/airtime/' . urlencode($transactionReference);
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT        => 15,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $json = json_decode((string) $response, true);
        if (is_array($json) && ($json['status'] ?? '') === 'success') {
            return [
                'success' => true,
                'status'  => strtoupper((string) ($json['data']['status'] ?? 'SUCCESS')),
                'raw'     => $json,
            ];
        }

        return [
            'success' => false,
            'status'  => 'UNKNOWN',
            'raw'     => $json,
        ];
    }

    /**
     * Verifies inbound webhook signature from Ulamadata if configured
     */
    public function verifyWebhookSignature(string $rawPayload, array $headers, string $secret): bool
    {
        if (empty($secret)) {
            return true;
        }

        $sig = $headers['x-ulamadata-signature'] ?? $headers['x-webhook-signature'] ?? null;
        if (!empty($sig)) {
            $expected = hash_hmac('sha256', $rawPayload, $secret);
            return hash_equals($expected, (string) $sig);
        }

        $auth = $headers['authorization'] ?? '';
        if (str_starts_with(strtolower($auth), 'token ')) {
            return hash_equals($secret, trim(substr($auth, 6)));
        }

        return true;
    }

    /**
     * Handles inbound webhook payload from Ulamadata
     */
    public function handleWebhook(array $headers, array $payload): array
    {
        $ident = $payload['data']['ident'] ?? $payload['ident'] ?? null;
        $status = strtolower((string) ($payload['data']['status'] ?? $payload['status'] ?? ''));

        $isSuccess = ($status === 'successful' || $status === 'success');
        $isFailed = ($status === 'failed');

        return [
            'success'           => true,
            'providerReference' => $ident,
            'status'            => $isSuccess ? 'SUCCESS' : ($isFailed ? 'FAILED' : 'PROCESSING'),
            'raw'               => $payload,
        ];
    }
}
