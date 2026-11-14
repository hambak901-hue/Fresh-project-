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

    public function hasCredentials(): bool
    {
        return !empty($this->apiKey);
    }

    private function buildRequestPayload(string $endpoint, array $payload): array
    {
        $ep = strtolower(trim($endpoint));
        $serviceKey = strtolower(trim((string)($payload['service_key'] ?? '')));
        $slipType = trim((string)($payload['slip_type'] ?? ''));
        $tier = strtolower(trim((string)($payload['tier'] ?? '')));
        $nin = preg_replace('/\D/', '', (string)($payload['nin'] ?? $payload['search_value'] ?? '')) ?? '';
        $rawVnin = preg_replace('/[^A-Za-z0-9]/', '', (string)($payload['nin'] ?? $payload['vnin'] ?? $payload['search_value'] ?? '')) ?? '';
        $phone = preg_replace('/\D/', '', (string)($payload['phone'] ?? $payload['phone_number'] ?? $payload['search_value'] ?? '')) ?? '';
        $bvn = preg_replace('/\D/', '', (string)($payload['bvn'] ?? $payload['search_value'] ?? '')) ?? '';

        $shortGender = strtolower(trim((string)($payload['gender'] ?? 'm')));
        $shortGender = ($shortGender === 'female' || $shortGender === 'f') ? 'f' : 'm';

        $validNinSlips = ['ninBasic', 'ninRegular', 'ninStandard', 'ninPremium', 'ninVnin', 'ninSpecial'];
        $safeNinSlip = in_array($slipType, $validNinSlips, true) ? $slipType : 'ninStandard';

        // Map internal HAMBAKTECH BVN slip code 'bankBvn' to 2SureVerify's supported slip_type
        $bvnSlipMap = [
            'bvnBasic' => 'bvnBasic',
            'bvnAdvanced' => 'bvnAdvanced',
            'plasticBvn' => 'plasticBvn',
            'bankBvn' => 'bvnAdvanced',
        ];
        $providerBvnSlip = $bvnSlipMap[$slipType] ?? 'bvnBasic';

        $ninSlipToV2Tier = [
            'ninBasic' => 'basic',
            'ninRegular' => 'regular',
            'ninStandard' => 'standard',
            'ninPremium' => 'premium',
            'ninVnin' => 'vnin',
            'ninSpecial' => 'vip',
        ];
        $phoneSlipToV2Tier = [
            'ninBasic' => 'regular',
            'ninRegular' => 'regular',
            'ninStandard' => 'standard',
            'ninPremium' => 'premium',
            'ninVnin' => 'vnin',
            'ninSpecial' => 'premium',
        ];

        if (str_contains($ep, 'nin_v1.php')) {
            return ['nin' => $nin, 'slip_type' => $safeNinSlip];
        }
        if (str_contains($ep, 'phone_v1.php')) {
            return ['phone' => $phone, 'slip_type' => $safeNinSlip];
        }
        if (str_contains($ep, 'nin_v2.php') || str_contains($ep, 'vnin')) {
            if ($serviceKey === 'vnin_verification' || str_contains($ep, 'vnin')) {
                $v2Tier = 'vnin';
                $targetNin = $rawVnin !== '' ? $rawVnin : $nin;
            } else {
                $v2Tier = in_array($tier, ['basic', 'standard', 'premium', 'regular', 'vnin', 'vip'], true)
                    ? $tier
                    : ($ninSlipToV2Tier[$safeNinSlip] ?? 'basic');
                $targetNin = $v2Tier === 'vnin' && $rawVnin !== '' ? $rawVnin : $nin;
            }
            return ['nin' => $targetNin, 'tier' => $v2Tier];
        }
        if (str_contains($ep, 'phone_v2.php')) {
            $v2PhoneTier = in_array($tier, ['lookup', 'premium', 'standard', 'regular', 'vnin'], true)
                ? $tier
                : ($phoneSlipToV2Tier[$safeNinSlip] ?? 'standard');
            return ['phone' => $phone, 'tier' => $v2PhoneTier];
        }
        if (str_contains($ep, 'nin_v3.php')) {
            $v3Tier = in_array($tier, ['v1', 'v2', 'v3', 'v4', 'v5'], true) ? $tier : 'v1';
            return ['nin' => $nin, 'tier' => $v3Tier, 'slip_type' => $safeNinSlip];
        }
        if (str_contains($ep, 'phone_v3.php')) {
            $v3Tier = in_array($tier, ['v1', 'v2', 'v3', 'v4', 'v5'], true) ? $tier : 'v1';
            return ['phone' => $phone, 'tier' => $v3Tier, 'slip_type' => $safeNinSlip];
        }
        if (str_contains($ep, 'demo_v1.php')) {
            return [
                'firstname' => trim((string)($payload['firstname'] ?? $payload['first_name'] ?? '')),
                'lastname' => trim((string)($payload['lastname'] ?? $payload['surname'] ?? $payload['last_name'] ?? '')),
                'dob' => trim((string)($payload['dob'] ?? $payload['birthdate'] ?? '')),
                'gender' => strtoupper($shortGender),
                'slip_type' => $safeNinSlip,
            ];
        }
        if (str_contains($ep, 'demo_v2.php')) {
            return [
                'firstname' => trim((string)($payload['firstname'] ?? $payload['first_name'] ?? '')),
                'lastname' => trim((string)($payload['lastname'] ?? $payload['surname'] ?? $payload['last_name'] ?? '')),
                'dob' => trim((string)($payload['dob'] ?? $payload['birthdate'] ?? '')),
                'gender' => $shortGender,
            ];
        }
        if (str_contains($ep, 'demo_v3.php')) {
            return [
                'firstname' => trim((string)($payload['firstname'] ?? $payload['first_name'] ?? '')),
                'lastname' => trim((string)($payload['lastname'] ?? $payload['surname'] ?? $payload['last_name'] ?? '')),
                'dob' => trim((string)($payload['dob'] ?? $payload['birthdate'] ?? '')),
                'gender' => $shortGender,
                'tier' => in_array($tier, ['v1', 'v2'], true) ? $tier : 'v1',
                'slip_type' => $safeNinSlip,
            ];
        }
        if (str_contains($ep, 'bvn_retrieval.php')) {
            return [
                'first_name' => trim((string)($payload['first_name'] ?? $payload['firstname'] ?? '')),
                'last_name' => trim((string)($payload['last_name'] ?? $payload['lastname'] ?? $payload['surname'] ?? '')),
                'phone_number' => $phone,
            ];
        }
        if (str_contains($ep, 'bvn_v1.php')) {
            return ['bvn' => $bvn, 'slip_type' => $providerBvnSlip];
        }
        if (str_contains($ep, 'bvn_v2.php')) {
            return ['bvn' => $bvn, 'tier' => in_array($tier, ['standard', 'premium'], true) ? $tier : 'premium'];
        }
        if (str_contains($ep, 'bvn_v3.php')) {
            return ['bvn' => $bvn, 'tier' => in_array($tier, ['v1', 'v2', 'v3', 'v4', 'v5'], true) ? $tier : 'v1', 'slip_type' => $providerBvnSlip];
        }

        // Preserve full payload for modification / enrolment / additional endpoints (strip internal keys)
        $clean = $payload;
        unset($clean['service_key'], $clean['search_value'], $clean['consent'], $clean['idempotency_key'], $clean['slip_template_id']);
        return $clean;
    }

    private function normalizePhotoField(array $data): array
    {
        $rawPhoto = $data['photo'] ?? $data['base64Image'] ?? $data['image'] ?? null;
        if (!empty($rawPhoto) && is_string($rawPhoto)) {
            $p = trim($rawPhoto);
            $isUrlOrAsset = str_starts_with($p, 'data:')
                || str_starts_with($p, 'http://')
                || str_starts_with($p, 'https://')
                || str_starts_with($p, '/assets/')
                || str_starts_with($p, '/uploads/');
            if ($p !== '' && !$isUrlOrAsset) {
                $mime = str_starts_with($p, 'iVBOR') ? 'image/png' : 'image/jpeg';
                $p = "data:{$mime};base64," . $p;
            }
            if ($p !== '') {
                $data['photo'] = $p;
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

    private function executeSingleCall(string $endpoint, array $payload, string $reference): array
    {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
        $startTime = microtime(true);
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

    public function verify(string $endpoint, array $payload): array
    {
        $reference = (string)($payload['reference'] ?? ('2SV_' . strtoupper(bin2hex(random_bytes(6)))));

        if (empty($this->apiKey)) {
            return [
                'status' => 'failed',
                'success' => false,
                'code' => 503,
                'message' => '2SureVerify API key is not configured on the production host. Please set TWOSUREVERIFY_API_KEY.',
                'reference' => $reference,
            ];
        }

        if (str_contains(strtolower($endpoint), 'vnin_verification')) {
            $endpoint = '/api/v1/nin_v2.php';
            $payload['tier'] = 'vnin';
        }

        $result = $this->executeSingleCall($endpoint, $payload, $reference);
        if (!empty($result['success'])) {
            return $result;
        }

        $isTransientFail = static function (array $res): bool {
            $msgLower = strtolower((string)($res['message'] ?? ''));
            $code = (int)($res['code'] ?? 0);
            if (str_contains($msgLower, 'insufficient') || str_contains($msgLower, 'no record found') || str_contains($msgLower, 'not found in nimc')) {
                return false;
            }
            return str_contains($msgLower, 'try a different version')
                || str_contains($msgLower, 'could not be completed right now')
                || str_contains($msgLower, 'currently unavailable')
                || str_contains($msgLower, 'temporarily unavailable')
                || str_contains($msgLower, 'service unavailable')
                || str_contains($msgLower, 'maintenance')
                || $code === 404
                || $code >= 500;
        };

        // If a _v1.php endpoint fails transiently or asks callers to try V2 or V3, fail over internally
        if ($isTransientFail($result) && preg_match('/^(.*)_v1\.php$/i', $endpoint, $m)) {
            $prefix = $m[1];
            foreach ([$prefix . '_v3.php', $prefix . '_v2.php'] as $idx => $fallbackEp) {
                $fbRes = $this->executeSingleCall($fallbackEp, $payload, $reference . '_VFB' . ($idx + 1));
                if (!empty($fbRes['success'])) {
                    return $fbRes;
                }
                if (!$isTransientFail($fbRes)) {
                    return $fbRes;
                }
            }
        }

        return $result;
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
            $safeReq = $requestBody;
            foreach (['nin', 'bvn', 'phone', 'phone_number'] as $k) {
                if (!empty($safeReq[$k])) {
                    $v = (string)$safeReq[$k];
                    $safeReq[$k] = strlen($v) > 5 ? substr($v, 0, 3) . '•••••' . substr($v, -2) : 'REDACTED';
                }
            }
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
                    'req' => json_encode($safeReq),
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
