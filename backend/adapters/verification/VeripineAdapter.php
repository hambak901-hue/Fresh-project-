<?php
/**
 * @file VeripineAdapter.php
 * Official Veripine Identity Verification Adapter (HambakTech\Adapters\Verification)
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Verification;

use HambakTech\Core\Database;
use HambakTech\Core\Security;
use Throwable;

class VeripineAdapter implements VerificationAdapterInterface
{
    private string $baseUrl;
    private string $apiKey;
    private int $timeout;
    private Database $db;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, int $timeout = 30)
    {
        $this->db = Database::getInstance();
        $configFile = __DIR__ . '/../../config/config.php';
        $config = file_exists($configFile) ? require $configFile : [];
        $cfg = $config['providers']['veripine'] ?? [];

        $dbRow = null;
        try {
            $dbRow = $this->db->fetchOne('SELECT base_url, api_key, timeout_seconds FROM providers WHERE id = "veripine"');
        } catch (Throwable) {
        }

        $envUrl = getenv('VERIPINE_BASE_URL') ?: '';
        $envKey = getenv('VERIPINE_API_KEY') ?: '';
        $rawDbUrl = !empty($dbRow['base_url']) ? trim((string)$dbRow['base_url']) : '';
        $dbUrl = ($rawDbUrl !== '' && !str_contains($rawDbUrl, 'api.example.com') && !str_contains($rawDbUrl, 'api.veripine.com'))
            ? $rawDbUrl
            : '';
        $dbKey = !empty($dbRow['api_key']) ? (string)$dbRow['api_key'] : '';

        $resolvedUrl = $baseUrl ?: ($dbUrl ?: ($envUrl ?: ($cfg['base_url'] ?? 'https://veripine.com/api')));
        $this->baseUrl = rtrim($resolvedUrl, '/');
        $this->apiKey = $apiKey ?: ($dbKey ?: ($envKey ?: (string)($cfg['api_key'] ?? '')));
        $this->timeout = $timeout ?: (int)($dbRow['timeout_seconds'] ?? ($cfg['timeout'] ?? 30));
    }

    public function getName(): string
    {
        return 'veripine';
    }

    public function hasCredentials(): bool
    {
        return !empty($this->apiKey);
    }

    public function checkBalance(): array
    {
        if (empty($this->apiKey)) {
            return [
                'success' => false,
                'status' => 'unconfigured',
                'balance' => 0.0,
                'latency_ms' => 0,
                'message' => 'Veripine API key is not configured.',
            ];
        }

        $url = $this->baseUrl . '/balance';
        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'x-api-key: ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT => min($this->timeout, 15),
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $latencyMs = (int)round((microtime(true) - $start) * 1000);

        if ($raw === false) {
            return [
                'success' => false,
                'status' => 'error',
                'balance' => 0.0,
                'latency_ms' => $latencyMs,
                'message' => 'Veripine connection error: ' . $err,
            ];
        }

        $decoded = json_decode((string)$raw, true);
        $this->logTransaction('/balance', 'GET', ['check' => 'balance'], (string)$raw, $code, $latencyMs, 'VP_BAL_' . time());

        if ($code >= 200 && $code < 300 && is_array($decoded) && strtolower((string)($decoded['status'] ?? '')) === 'success') {
            $bal = (float)($decoded['data']['balance'] ?? ($decoded['balance'] ?? 0));
            return [
                'success' => true,
                'status' => 'operational',
                'balance' => $bal,
                'currency' => 'NGN',
                'latency_ms' => $latencyMs,
                'message' => 'Veripine gateway connected and operational.',
                'raw' => $decoded,
            ];
        }

        $msg = is_array($decoded) ? ($decoded['message'] ?? $decoded['error'] ?? "HTTP {$code}") : "HTTP {$code}";
        return [
            'success' => false,
            'status' => 'error',
            'balance' => 0.0,
            'latency_ms' => $latencyMs,
            'message' => "Veripine error: {$msg}",
        ];
    }

    public function ping(): array
    {
        $res = $this->checkBalance();
        return [
            'provider' => 'veripine',
            'status' => !empty($res['success']) ? 'operational' : ($res['status'] ?? 'error'),
            'balance' => $res['balance'] ?? 0.0,
            'latency_ms' => $res['latency_ms'] ?? 0,
            'message' => $res['message'] ?? '',
            'timestamp' => date('c'),
        ];
    }

    public function verify(string $endpoint, array $payload): array
    {
        $reference = (string)($payload['reference'] ?? ('VP_' . strtoupper(bin2hex(random_bytes(6)))));

        if (empty($this->apiKey)) {
            return [
                'status' => 'failed',
                'success' => false,
                'code' => 503,
                'message' => 'Veripine API key (VERIPINE_API_KEY) is not configured.',
                'reference' => $reference,
            ];
        }

        $resolvedEndpoint = $this->resolveEndpoint($endpoint);
        $requestBody = $this->buildPayload($resolvedEndpoint, $payload);

        $url = $this->baseUrl . $resolvedEndpoint;
        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($requestBody),
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'x-api-key: ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $latencyMs = (int)round((microtime(true) - $start) * 1000);

        $this->logTransaction($resolvedEndpoint, 'POST', $requestBody, $raw === false ? $err : (string)$raw, $code, $latencyMs, $reference);

        if ($raw === false) {
            return [
                'status' => 'failed',
                'success' => false,
                'code' => 502,
                'message' => 'Veripine network error: ' . $err,
                'reference' => $reference,
            ];
        }

        $decoded = json_decode((string)$raw, true);
        if (!is_array($decoded)) {
            return [
                'status' => 'failed',
                'success' => false,
                'code' => $code ?: 502,
                'message' => 'Invalid JSON response from Veripine.',
                'reference' => $reference,
                'raw_error' => (string)$raw,
            ];
        }

        $statusLower = strtolower((string)($decoded['status'] ?? ''));
        $isOk = ($code >= 200 && $code < 300) && ($statusLower === 'success' || ($decoded['success'] ?? false) === true);

        if (!$isOk) {
            return [
                'status' => 'failed',
                'success' => false,
                'code' => $code ?: 400,
                'message' => (string)($decoded['message'] ?? $decoded['error'] ?? 'Veripine verification failed.'),
                'reference' => $decoded['reference_id'] ?? $decoded['reference'] ?? $reference,
                'raw_error' => $decoded,
            ];
        }

        $inner = is_array($decoded['data'] ?? null) ? $decoded['data'] : $decoded;
        if (!empty($inner['photo']) && is_string($inner['photo']) && !str_starts_with($inner['photo'], 'data:') && !str_starts_with($inner['photo'], 'http') && !str_starts_with($inner['photo'], '/')) {
            $inner['photo'] = 'data:image/jpeg;base64,' . $inner['photo'];
        }
        $inner['provider'] = 'veripine';
        $inner['verified_at'] = $inner['verified_at'] ?? date('c');

        return [
            'status' => 'success',
            'success' => true,
            'code' => 200,
            'message' => (string)($decoded['message'] ?? 'Identity verified successfully.'),
            'reference' => (string)($decoded['reportID'] ?? $decoded['reference_id'] ?? $decoded['reference'] ?? $reference),
            'provider_cost' => (float)($decoded['amount'] ?? $decoded['cost'] ?? 0),
            'data' => $inner,
        ];
    }

    private function resolveEndpoint(string $endpoint): string
    {
        $ep = strtolower(trim($endpoint));
        if (str_contains($ep, 'modification-status') || str_contains($ep, 'mod_stat')) {
            return '/nin-modification-status';
        }
        if (str_contains($ep, 'modification') || str_contains($ep, 'nin_mod')) {
            return '/nin-modification';
        }
        if (str_contains($ep, 'bvn') && str_contains($ep, 'phone')) {
            return '/bvn-phone';
        }
        if (str_contains($ep, 'bvn')) {
            return '/bvn-verification';
        }
        if (str_contains($ep, 'phone')) {
            return '/nin-phone';
        }
        if (str_contains($ep, 'tracking')) {
            return '/nin-tracking';
        }
        if (str_contains($ep, 'demograph')) {
            return '/nin-demography';
        }
        if (str_starts_with($endpoint, '/nin-') || str_starts_with($endpoint, '/bvn-')) {
            return $endpoint;
        }
        return '/nin-verification';
    }

    private function buildPayload(string $endpoint, array $payload): array
    {
        $cleanPhone = function ($phone): string {
            $p = preg_replace('/\D/', '', (string)$phone);
            if (str_starts_with($p, '234') && strlen($p) === 13) {
                return '0' . substr($p, 3);
            }
            return $p;
        };

        return match ($endpoint) {
            '/nin-phone' => [
                'phone' => $cleanPhone($payload['phone'] ?? $payload['telephone'] ?? ''),
                'consent' => true,
            ],
            '/nin-tracking' => [
                'tracking_id' => trim((string)($payload['tracking_id'] ?? $payload['trackingId'] ?? '')),
                'consent' => true,
            ],
            '/nin-demography' => [
                'firstname' => trim((string)($payload['firstname'] ?? $payload['first_name'] ?? $payload['firstName'] ?? '')),
                'lastname' => trim((string)($payload['lastname'] ?? $payload['surname'] ?? $payload['last_name'] ?? $payload['lastName'] ?? '')),
                'gender' => strtolower(trim((string)($payload['gender'] ?? 'male'))),
                'dob' => trim((string)($payload['dob'] ?? $payload['birthdate'] ?? '')),
                'consent' => true,
            ],
            '/bvn-verification' => [
                'bvn' => preg_replace('/\D/', '', (string)($payload['bvn'] ?? '')),
                'consent' => true,
            ],
            '/bvn-phone' => [
                'phone' => $cleanPhone($payload['phone'] ?? ''),
                'consent' => true,
            ],
            '/nin-modification' => array_filter([
                'service_type' => $payload['service_type'] ?? $payload['modification_type'] ?? 'nin_name_modification',
                'nin' => preg_replace('/\D/', '', (string)($payload['nin'] ?? '')),
                'surname' => trim((string)($payload['surname'] ?? $payload['last_name'] ?? '')),
                'firstname' => trim((string)($payload['firstname'] ?? $payload['first_name'] ?? '')),
                'phone_number' => $cleanPhone($payload['phone_number'] ?? $payload['phone'] ?? ''),
                'new_surname' => $payload['new_surname'] ?? null,
                'new_firstname' => $payload['new_firstname'] ?? null,
                'new_phone' => $payload['new_phone'] ?? null,
                'new_address' => $payload['new_address'] ?? null,
                'new_state' => $payload['new_state'] ?? null,
                'new_lga' => $payload['new_lga'] ?? null,
                'consent' => true,
            ], fn($v) => $v !== null && $v !== ''),
            '/nin-modification-status' => [
                'reference_id' => trim((string)($payload['reference_id'] ?? $payload['reference'] ?? '')),
            ],
            default => [
                'nin' => preg_replace('/\D/', '', (string)($payload['nin'] ?? $payload['vnin'] ?? '')),
                'consent' => true,
            ],
        };
    }

    private function logTransaction(
        string $endpoint,
        string $method,
        array $requestBody,
        ?string $responseBody,
        int $statusCode,
        int $latencyMs,
        ?string $reference
    ): void {
        try {
            // Redact sensitive fields before storing
            $safeReq = $requestBody;
            foreach (['nin', 'bvn', 'phone', 'phone_number'] as $k) {
                if (!empty($safeReq[$k])) {
                    $v = (string)$safeReq[$k];
                    $safeReq[$k] = strlen($v) > 5 ? substr($v, 0, 3) . '•••••' . substr($v, -2) : 'REDACTED';
                }
            }
            $this->db->execute(
                'INSERT INTO provider_logs 
                 (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES 
                 (:id, "veripine", :endpoint, :method, :status, :req, :res, :latency, :ref, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'endpoint' => $endpoint,
                    'method' => $method,
                    'status' => $statusCode,
                    'req' => json_encode($safeReq),
                    'res' => $responseBody,
                    'latency' => $latencyMs,
                    'ref' => $reference,
                ]
            );
        } catch (Throwable $e) {
            error_log('[Veripine Log Error]: ' . $e->getMessage());
        }
    }
}
