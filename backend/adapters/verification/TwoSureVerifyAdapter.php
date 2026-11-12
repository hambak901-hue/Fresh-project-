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

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, int $timeout = 30)
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
        $this->timeout = $timeout ?: (int)($dbRow['timeout_seconds'] ?? ($cfg['timeout'] ?? 30));
    }

    public function getName(): string
    {
        return '2sureverify';
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
            $ch = curl_init($url);
            $jsonPayload = json_encode(array_merge($payload, ['api_key' => $this->apiKey]));

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
                CURLOPT_TIMEOUT => $this->timeout,
                CURLOPT_SSL_VERIFYPEER => true,
            ]);

            $responseBody = curl_exec($ch);
            $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
            $this->logTransaction($endpoint, $payload, $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, $reference);

            if ($responseBody && $statusCode >= 200 && $statusCode < 300) {
                $decoded = json_decode($responseBody, true);
                if (is_array($decoded)) {
                    $decoded['reference'] = $decoded['reference'] ?? $reference;
                    return $decoded;
                }
            }

            // Upstream provider returned an error or non-200 status
            $errorMsg = 'Provider verification request failed';
            if ($responseBody) {
                $decodedErr = json_decode($responseBody, true);
                if (is_array($decodedErr) && !empty($decodedErr['message'])) {
                    $errorMsg = $decodedErr['message'];
                }
            } elseif ($curlError) {
                $errorMsg = 'Connection error: ' . $curlError;
            }

            return [
                'status' => 'failed',
                'success' => false,
                'code' => $statusCode ?: 502,
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
        } catch (Exception $e) {
            error_log('[2SureVerify Log Error]: ' . $e->getMessage());
        }
    }
}
