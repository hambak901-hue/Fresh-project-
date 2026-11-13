<?php
/**
 * @file TwoSureVerifyAdapter.php
 * Official 2SureVerify Identity API Client
 * Docs: https://2sureverify.com/api_docs.php
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Verification;

use Exception;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class TwoSureVerifyAdapter implements VerificationAdapterInterface
{
    private string $baseUrl;
    private string $apiKey;
    private int $timeout;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, ?int $timeout = null)
    {
        $configFile = __DIR__ . '/../../config/config.php';
        $config = file_exists($configFile) ? require $configFile : [];
        $cfg = $config['providers']['2sureverify'] ?? [];

        $dbRow = null;
        try {
            $dbRow = Database::getInstance()->fetchOne('SELECT base_url, api_key, timeout_seconds FROM providers WHERE id = "2sureverify"');
        } catch (\Throwable) {
        }

        $envUrl = getenv('TWOSUREVERIFY_BASE_URL') ?: '';
        $envKey = getenv('TWOSUREVERIFY_API_KEY') ?: (getenv('SUREVERIFY_API_KEY') ?: '');
        $dbUrl = !empty($dbRow['base_url']) && $dbRow['base_url'] !== 'https://api.example.com' ? (string)$dbRow['base_url'] : '';
        $dbKey = !empty($dbRow['api_key']) ? (string)$dbRow['api_key'] : '';

        $resolvedUrl = $baseUrl ?: ($dbUrl ?: ($envUrl ?: ($cfg['base_url'] ?? 'https://2sureverify.com')));
        $this->baseUrl = rtrim($resolvedUrl, '/');
        $this->apiKey = $apiKey ?: ($dbKey ?: ($envKey ?: (string)($cfg['api_key'] ?? '')));
        $configuredTimeout = $timeout ?? (int)($dbRow['timeout_seconds'] ?? ($cfg['timeout'] ?? 35));
        $this->timeout = max(15, min(40, $configuredTimeout > 0 ? $configuredTimeout : 35));
    }

    public function getName(): string
    {
        return '2sureverify';
    }

    private function buildRequestPayload(string $endpoint, array $payload): array
    {
        $ep = strtolower(trim($endpoint));
        $slipType = trim((string)($payload['slip_type'] ?? 'ninStandard'));
        $tier = trim((string)($payload['tier'] ?? 'basic'));
        $nin = trim((string)($payload['nin'] ?? $payload['search_value'] ?? ''));
        $phone = trim((string)($payload['phone'] ?? $payload['phone_number'] ?? $payload['search_value'] ?? ''));
        $bvn = trim((string)($payload['bvn'] ?? $payload['search_value'] ?? ''));

        if (str_contains($ep, 'nin_v1.php')) {
            return ['nin' => $nin, 'slip_type' => $slipType];
        }
        if (str_contains($ep, 'phone_v1.php')) {
            return ['phone' => $phone, 'slip_type' => $slipType];
        }
        if (str_contains($ep, 'nin_v2.php')) {
            return ['nin' => $nin, 'tier' => $tier];
        }
        if (str_contains($ep, 'phone_v2.php')) {
            return ['phone' => $phone, 'tier' => $tier];
        }
        if (str_contains($ep, 'nin_v3.php')) {
            return ['nin' => $nin, 'tier' => $tier ?: 'v1', 'slip_type' => $slipType];
        }
        if (str_contains($ep, 'phone_v3.php')) {
            return ['phone' => $phone, 'tier' => $tier ?: 'v1', 'slip_type' => $slipType];
        }
        if (str_contains($ep, 'vnin')) {
            return ['nin' => $nin, 'slip_type' => $slipType];
        }
        if (str_contains($ep, 'bvn_v1.php')) {
            return ['bvn' => $bvn, 'slip_type' => $slipType];
        }
        if (str_contains($ep, 'bvn_v2.php') || str_contains($ep, 'bvn_v3.php')) {
            return ['bvn' => $bvn, 'tier' => $tier, 'slip_type' => $slipType];
        }

        // Preserve full payload for modification / enrolment / additional endpoints (strip internal keys)
        $clean = $payload;
        unset($clean['service_key'], $clean['search_value'], $clean['consent'], $clean['idempotency_key'], $clean['slip_template_id']);
        return $clean;
    }

    private function normalizePhotoField(array $data): array
    {
        if (!empty($data['photo']) && is_string($data['photo'])) {
            $p = trim($data['photo']);
            $isUrlOrAsset = str_starts_with($p, 'data:')
                || str_starts_with($p, 'http://')
                || str_starts_with($p, 'https://')
                || str_starts_with($p, '/assets/')
                || str_starts_with($p, '/uploads/');
            if ($p !== '' && !$isUrlOrAsset) {
                $mime = str_starts_with($p, 'iVBOR') ? 'image/png' : 'image/jpeg';
                $data['photo'] = "data:{$mime};base64," . $p;
            }
        }
        if (!empty($data['user_data']) && is_array($data['user_data'])) {
            $data['user_data'] = $this->normalizePhotoField($data['user_data']);
        }
        if (!empty($data['data']) && is_array($data['data'])) {
            $data['data'] = $this->normalizePhotoField($data['data']);
        }
        return $data;
    }

    public function verify(string $endpoint, array $payload): array
    {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
        $startTime = microtime(true);
        $statusCode = 200;
        $responseBody = '';
        $reference = $payload['reference'] ?? ('2SV_' . strtoupper(bin2hex(random_bytes(6))));

        // Perform real provider cURL call
        if (!empty($this->apiKey)) {
            $requestPayload = $this->buildRequestPayload($endpoint, $payload);
            $ch = curl_init($url);
            $jsonPayload = json_encode(array_merge($requestPayload, ['api_key' => $this->apiKey]));

            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $jsonPayload,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Accept: application/json',
                    'Authorization: Bearer ' . $this->apiKey,
                    'X-Api-Key: ' . $this->apiKey,
                ],
                CURLOPT_CONNECTTIMEOUT => 12,
                CURLOPT_TIMEOUT => $this->timeout,
                CURLOPT_SSL_VERIFYPEER => true,
            ]);

            $responseBody = curl_exec($ch);
            $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErrno = curl_errno($ch);
            $curlError = curl_error($ch);
            curl_close($ch);

            $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
            $this->logTransaction($endpoint, $requestPayload, $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, $reference);

            if ($responseBody && $statusCode >= 200 && $statusCode < 300) {
                $decoded = json_decode($responseBody, true);
                if (is_array($decoded)) {
                    $statusLower = strtolower((string)($decoded['status'] ?? ''));
                    $isSuccess = (!isset($decoded['success']) || (bool)$decoded['success'] === true) && $statusLower !== 'failed' && $statusLower !== 'error';
                    if ($isSuccess) {
                        $decoded = $this->normalizePhotoField($decoded);
                        $decoded['reference'] = $decoded['reference'] ?? $reference;
                        if (isset($decoded['amount_charged']) && is_numeric($decoded['amount_charged'])) {
                            $decoded['provider_cost'] = (float)$decoded['amount_charged'];
                        }
                        $decoded['success'] = true;
                        return $decoded;
                    }
                    return [
                        'status' => 'failed',
                        'success' => false,
                        'code' => $statusCode,
                        'message' => (string)($decoded['message'] ?? $decoded['error'] ?? 'Provider verification request failed'),
                        'reference' => $decoded['reference'] ?? $reference,
                        'raw_error' => $responseBody,
                    ];
                }
            }

            // Upstream provider returned an error, timeout, or non-JSON response
            $errorMsg = 'Provider verification request failed';
            if ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
                $errorMsg = 'Verification gateway timed out while waiting for identity registry response.';
            } elseif ($responseBody) {
                $decodedErr = json_decode($responseBody, true);
                if (is_array($decodedErr) && !empty($decodedErr['message'])) {
                    $errorMsg = (string)$decodedErr['message'];
                }
            } elseif ($curlError) {
                $errorMsg = 'Connection error: ' . $curlError;
            }

            return [
                'status' => 'failed',
                'success' => false,
                'code' => $curlErrno === CURLE_OPERATION_TIMEDOUT ? 504 : ($statusCode ?: 502),
                'message' => $errorMsg,
                'reference' => $reference,
                'raw_error' => $responseBody ?: $curlError,
            ];
        }

        // Live mode without API key configured returns genuine failure
        return [
            'status' => 'failed',
            'success' => false,
            'code' => 503,
            'message' => '2SureVerify API key is not configured on the production host. Please set TWOSUREVERIFY_API_KEY.',
            'reference' => $reference,
        ];
    }

    public function ping(): array
    {
        if (empty($this->apiKey)) {
            return [
                'provider' => '2sureverify',
                'status' => 'unconfigured',
                'latency_ms' => 0,
                'message' => '2SureVerify API key is not configured.',
                'timestamp' => date('c'),
            ];
        }

        $start = microtime(true);
        $ch = curl_init($this->baseUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_NOBODY => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $ok = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $latency = (int)round((microtime(true) - $start) * 1000);

        return [
            'provider' => '2sureverify',
            'status' => ($ok !== false && $code > 0 && $code < 500) ? 'operational' : 'error',
            'http_code' => $code,
            'latency_ms' => $latency,
            'message' => ($ok !== false && $code > 0 && $code < 500)
                ? "2SureVerify reachable (HTTP {$code}, {$latency}ms)"
                : ("2SureVerify check failed: " . ($err ?: "HTTP {$code}")),
            'timestamp' => date('c'),
        ];
    }

    private function logTransaction(
        string $endpoint,
        array $requestBody,
        ?string $responseBody,
        int $statusCode,
        int $latencyMs,
        ?string $reference
    ): void {
        try {
            $db = Database::getInstance();
            $logId = Security::generateUuid();
            $db->execute(
                'INSERT INTO provider_logs 
                 (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES 
                 (:id, "2sureverify", :endpoint, "POST", :status, :req, :res, :latency, :ref, NOW())',
                [
                    'id' => $logId,
                    'endpoint' => $endpoint,
                    'status' => $statusCode,
                    'req' => json_encode($requestBody),
                    'res' => $responseBody,
                    'latency' => $latencyMs,
                    'ref' => $reference,
                ]
            );
        } catch (\Throwable $e) {
            error_log('[2SureVerify Log Error]: ' . $e->getMessage());
        }
    }
}
