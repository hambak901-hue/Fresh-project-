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
        $cleanResolved = rtrim($resolvedUrl, '/');
        $cleanResolved = preg_replace('#/api/v1$#i', '', $cleanResolved) ?? $cleanResolved;
        $this->baseUrl = $cleanResolved !== '' ? $cleanResolved : 'https://2sureverify.com';
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
        $epNorm = '/' . ltrim(trim($endpoint), '/');
        if (!str_starts_with($epNorm, '/api/')) {
            $epNorm = '/api/v1' . $epNorm;
        }
        $url = $this->baseUrl . $epNorm;
        $startTime = microtime(true);
        $requestPayload = $this->buildRequestPayload($epNorm, $payload);
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
        $this->logTransaction($epNorm, $requestPayload, $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, $reference);

        if ($responseBody && $statusCode >= 200 && $statusCode < 300) {
            $decoded = json_decode($responseBody, true);
            if (is_array($decoded)) {
                $statusLower = strtolower((string)($decoded['status'] ?? ''));
                $nestedData = $decoded['data'] ?? null;
                $nestedStatus = is_array($nestedData) ? strtolower((string)($nestedData['status'] ?? '')) : '';
                $badStatuses = ['failed', 'error', 'not_found', 'no_record', 'rejected'];
                $isSuccess = (!isset($decoded['success']) || (bool)$decoded['success'] === true)
                    && !in_array($statusLower, $badStatuses, true)
                    && !in_array($nestedStatus, $badStatuses, true);
                if ($isSuccess && empty($decoded['pending']) && isset($decoded['data']) && is_array($decoded['data']) && empty($decoded['data'])) {
                    $isSuccess = false;
                }
                if ($isSuccess) {
                    $decoded = $this->normalizePhotoField($decoded);
                    $decoded['reference'] = $decoded['reference'] ?? $reference;
                    if (isset($decoded['amount_charged']) && is_numeric($decoded['amount_charged'])) {
                        $decoded['provider_cost'] = (float)$decoded['amount_charged'];
                    }
                    $decoded['success'] = true;
                    return $decoded;
                }
                $nestedMsg = is_array($nestedData) ? ($nestedData['message'] ?? null) : null;
                return [
                    'status' => 'failed',
                    'success' => false,
                    'code' => $statusCode,
                    'message' => (string)($decoded['message'] ?? $decoded['error'] ?? $nestedMsg ?? 'Provider verification request failed'),
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

        $isVninRoute = str_contains(strtolower($endpoint), 'vnin_verification')
            || strtolower((string)($payload['service_key'] ?? '')) === 'vnin_verification'
            || strtolower((string)($payload['tier'] ?? '')) === 'vnin';
        if (str_contains(strtolower($endpoint), 'vnin_verification')) {
            $endpoint = '/api/v1/nin_v2.php';
            $payload['tier'] = 'vnin';
        }

        $result = $this->executeSingleCall($endpoint, $payload, $reference);
        if (!empty($result['success'])) {
            return $result;
        }

        $isInsufficient = static function (array $res): bool {
            return str_contains(strtolower((string)($res['message'] ?? '')), 'insufficient');
        };
        $isNoRecord = static function (array $res): bool {
            $m = strtolower((string)($res['message'] ?? ''));
            return str_contains($m, 'no record found') || str_contains($m, 'not found in nimc') || str_contains($m, 'no matching record');
        };
        $isTransientFail = static function (array $res) use ($isInsufficient, $isNoRecord): bool {
            if ($isInsufficient($res) || $isNoRecord($res)) {
                return false;
            }
            $msgLower = strtolower((string)($res['message'] ?? ''));
            $code = (int)($res['code'] ?? 0);
            return str_contains($msgLower, 'try a different version')
                || str_contains($msgLower, 'could not be completed right now')
                || str_contains($msgLower, 'currently unavailable')
                || str_contains($msgLower, 'temporarily unavailable')
                || str_contains($msgLower, 'service unavailable')
                || str_contains($msgLower, 'maintenance')
                || str_contains($msgLower, 'timed out')
                || $code === 0
                || $code === 404
                || $code >= 500;
        };

        if ($isInsufficient($result)) {
            return $result;
        }

        // For VNIN verification, fall back to V1/V3 with ninVnin slip format if V2 tier=vnin is transiently unavailable
        if ($isVninRoute && $isTransientFail($result)) {
            $vninFallbacks = [
                ['/api/v1/nin_v1.php', array_merge($payload, ['slip_type' => 'ninVnin'])],
                ['/api/v1/nin_v3.php', array_merge($payload, ['tier' => 'v1', 'slip_type' => 'ninVnin'])],
            ];
            $firstNoRec = null;
            foreach ($vninFallbacks as $idx => [$fbEp, $fbPayload]) {
                $fbRes = $this->executeSingleCall($fbEp, $fbPayload, $reference . '_VNFB' . ($idx + 1));
                if (!empty($fbRes['success'])) {
                    return $fbRes;
                }
                if ($isInsufficient($fbRes)) {
                    return $fbRes;
                }
                if ($isNoRecord($fbRes) && $firstNoRec === null) {
                    $firstNoRec = $fbRes;
                }
            }
            if ($firstNoRec !== null) {
                return $firstNoRec;
            }
            return $result;
        }

        // Generalized sibling version failover for _v1.php / _v2.php / _v3.php endpoints
        if ($isTransientFail($result) && preg_match('/^(.*)_v([123])\.php$/i', $endpoint, $m)) {
            $prefix = $m[1];
            $verNum = $m[2];
            $firstNoRec = null;

            // V3 supports independent internal channels (v1, v2): try v2 on same endpoint first when v1 fails transiently
            if ($verNum === '3' && strtolower((string)($payload['tier'] ?? 'v1')) === 'v1') {
                $v3Tier2Payload = array_merge($payload, ['tier' => 'v2']);
                $v3Res = $this->executeSingleCall($endpoint, $v3Tier2Payload, $reference . '_T2');
                if (!empty($v3Res['success'])) {
                    return $v3Res;
                }
                if ($isInsufficient($v3Res)) {
                    return $v3Res;
                }
                if ($isNoRecord($v3Res)) {
                    $firstNoRec = $v3Res;
                }
            }

            $siblings = match ($verNum) {
                '2' => [$prefix . '_v1.php', $prefix . '_v3.php'],
                '3' => [$prefix . '_v1.php', $prefix . '_v2.php'],
                default => [$prefix . '_v3.php', $prefix . '_v2.php'],
            };

            foreach ($siblings as $idx => $fallbackEp) {
                $fbRes = $this->executeSingleCall($fallbackEp, $payload, $reference . '_VFB' . ($idx + 1));
                if (!empty($fbRes['success'])) {
                    return $fbRes;
                }
                if ($isInsufficient($fbRes)) {
                    return $fbRes;
                }
                if ($isNoRecord($fbRes) && $firstNoRec === null) {
                    $firstNoRec = $fbRes;
                }
            }
            if ($firstNoRec !== null) {
                return $firstNoRec;
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

    public function executeGet(string $endpoint): array
    {
        if (empty($this->apiKey)) {
            return [
                'success' => false,
                'status' => 'unconfigured',
                'code' => 503,
                'message' => '2SureVerify API key is not configured on this server.',
            ];
        }

        $epNorm = '/' . ltrim(trim($endpoint), '/');
        if (!str_starts_with($epNorm, '/api/')) {
            $epNorm = '/api/v1' . $epNorm;
        }
        $url = $this->baseUrl . $epNorm;
        $startTime = microtime(true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => [
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
        $this->logTransaction($epNorm, ['method' => 'GET'], $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, null, 'GET');

        if ($responseBody && $statusCode >= 200 && $statusCode < 300) {
            $decoded = json_decode($responseBody, true);
            if (is_array($decoded)) {
                return array_merge(['success' => !isset($decoded['success']) || (bool)$decoded['success']], $decoded);
            }
        }

        return [
            'success' => false,
            'status' => 'error',
            'code' => $curlErrno === CURLE_OPERATION_TIMEDOUT ? 504 : ($statusCode ?: 502),
            'message' => $curlError ?: ('2SureVerify GET request failed (HTTP ' . $statusCode . ')'),
            'raw_error' => $responseBody ?: $curlError,
        ];
    }

    public function getServicesCatalog(): array
    {
        return $this->executeGet('/api/v1/services.php');
    }

    public function getBvnModificationBanks(): array
    {
        return $this->executeGet('/api/v1/bvn_modification_banks.php');
    }

    public function getBvnEnrollmentBanks(): array
    {
        return $this->executeGet('/api/v1/bvn_enrollment_banks.php');
    }

    public function checkStatus(string $reference): array
    {
        $cleanRef = trim($reference);
        if ($cleanRef === '') {
            return ['success' => false, 'status' => 'error', 'code' => 422, 'message' => 'Reference is required for status lookup.'];
        }
        return $this->executeGet('/api/v1/status.php?reference=' . rawurlencode($cleanRef));
    }

    public static function getAllModificationMappingSpecs(): array
    {
        return [
            'nin_mod_name' => [
                'endpoint' => '/api/v1/nin_mod_name.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'affidavit' => 'affidavit',
                    'newspaper_pub' => 'newspaper_pub',
                ],
            ],
            'nin_mod_phone' => [
                'endpoint' => '/api/v1/nin_mod_phone.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'phone' => 'phone',
                    'previous_phone' => 'previous_phone',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'passport_photo' => 'passport_photo',
                ],
            ],
            'nin_mod_address' => [
                'endpoint' => '/api/v1/nin_mod_address.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'address' => 'address',
                    'state' => 'state',
                    'lga' => 'lga',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'address_proof' => 'address_proof',
                ],
            ],
            'nin_mod_dob' => [
                'endpoint' => '/api/v1/nin_mod_dob.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'dob' => 'dob',
                    'current_dob' => 'current_dob',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'birth_certificate' => 'birth_certificate',
                    'affidavit' => 'affidavit',
                ],
            ],
            'nin_mod_dob_name' => [
                'endpoint' => '/api/v1/nin_mod_dob_name.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'dob' => 'dob',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'birth_certificate' => 'birth_certificate',
                    'affidavit' => 'affidavit',
                    'newspaper_pub' => 'newspaper_pub',
                ],
            ],
            'nin_mod_name_phone' => [
                'endpoint' => '/api/v1/nin_mod_name_phone.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'phone' => 'phone',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'affidavit' => 'affidavit',
                    'newspaper_pub' => 'newspaper_pub',
                ],
            ],
            'gender_modification' => [
                'endpoint' => '/api/v1/gender_modification.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'gender' => 'gender',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'gender_proof' => 'gender_proof',
                    'passport_photo' => 'passport_photo',
                ],
            ],
            'suspended_modification' => [
                'endpoint' => '/api/v1/suspended_modification.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'tracking_id' => 'tracking_id',
                    'first_name' => 'first_name',
                    'last_name' => 'last_name',
                    'phone' => 'phone',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'affidavit' => 'affidavit',
                    'passport_photo' => 'passport_photo',
                ],
            ],
            'bvn_generated_modification' => [
                'endpoint' => '/api/v1/bvn_generated_modification.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'bvn' => 'bvn',
                    'first_name' => 'first_name',
                    'last_name' => 'last_name',
                    'phone' => 'phone',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'bvn_slip' => 'bvn_slip',
                    'affidavit' => 'affidavit',
                ],
            ],
            'child_modification' => [
                'endpoint' => '/api/v1/child_modification.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'parent_nin' => 'parent_nin',
                    'first_name' => 'first_name',
                    'last_name' => 'last_name',
                    'dob' => 'dob',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'birth_certificate' => 'birth_certificate',
                    'parent_nin_slip' => 'parent_nin_slip',
                ],
            ],
            'nin_over_age' => [
                'endpoint' => '/api/v1/nin_over_age.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'age_range' => 'age_range',
                    'dob' => 'dob',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'birth_certificate' => 'birth_certificate',
                    'affidavit' => 'affidavit',
                ],
            ],
            'second_nin_mod_name' => [
                'endpoint' => '/api/v1/second_nin_mod_name.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'affidavit' => 'affidavit',
                    'newspaper_pub' => 'newspaper_pub',
                ],
            ],
            'second_nin_mod_phone' => [
                'endpoint' => '/api/v1/second_nin_mod_phone.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'phone' => 'phone',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'passport_photo' => 'passport_photo',
                ],
            ],
            'second_nin_mod_name_auth' => [
                'endpoint' => '/api/v1/second_nin_mod_name_auth.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'email' => 'email',
                    'password' => 'password',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'affidavit' => 'affidavit',
                    'newspaper_pub' => 'newspaper_pub',
                ],
            ],
            'second_nin_mod_phone_auth' => [
                'endpoint' => '/api/v1/second_nin_mod_phone_auth.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'nin' => 'nin',
                    'phone' => 'phone',
                    'email' => 'email',
                    'password' => 'password',
                    'reason' => 'reason',
                ],
                'files' => [
                    'nin_slip' => 'nin_slip',
                    'passport_photo' => 'passport_photo',
                ],
            ],
            'bvn_modification' => [
                'endpoint' => '/api/v1/bvn_modification.php',
                'method' => 'POST',
                'provider_schema_verified' => false,
                'fields' => [
                    'bvn' => 'bvn',
                    'enrollment_type' => 'enrollment_type',
                    'field_to_modify' => 'field_to_modify',
                    'old_value' => 'old_value',
                    'new_value' => 'new_value',
                    'new_dob' => 'dob',
                    'email' => 'email',
                    'phone' => 'phone',
                    'reason' => 'reason',
                ],
                'files' => [
                    'bvn_slip' => 'bvn_slip',
                    'valid_id' => 'valid_id',
                    'affidavit' => 'affidavit',
                ],
            ],
        ];
    }

    public static function getModificationMappingSpec(string $serviceKey, array $formSchema = [], array $requiredDocs = []): array
    {
        $all = self::getAllModificationMappingSpecs();
        $base = $all[$serviceKey] ?? [
            'endpoint' => '',
            'method' => 'POST',
            'provider_schema_verified' => false,
            'fields' => [],
            'files' => [],
        ];

        $fieldMap = $base['fields'];
        $fieldTrace = [];
        foreach ($formSchema as $fDef) {
            if (!is_array($fDef) || empty($fDef['key'])) {
                continue;
            }
            $ck = (string)$fDef['key'];
            $pp = trim((string)($fDef['provider_param'] ?? ($fieldMap[$ck] ?? $ck)));
            $fieldMap[$ck] = $pp;
            $fieldTrace[] = [
                'customer_field' => $ck,
                'internal_field' => $ck,
                'provider_param' => $pp,
                'required' => !empty($fDef['required']),
            ];
        }
        if (empty($fieldTrace)) {
            foreach ($fieldMap as $ck => $pp) {
                $fieldTrace[] = [
                    'customer_field' => $ck,
                    'internal_field' => $ck,
                    'provider_param' => $pp,
                    'required' => false,
                ];
            }
        }

        $fileMap = $base['files'];
        $fileTrace = [];
        foreach ($requiredDocs as $dDef) {
            if (!is_array($dDef) || empty($dDef['key'])) {
                continue;
            }
            $dk = (string)$dDef['key'];
            $pfp = trim((string)($dDef['provider_file_param'] ?? ($fileMap[$dk] ?? $dk)));
            $fileMap[$dk] = $pfp;
            $fileTrace[] = [
                'doc_key' => $dk,
                'provider_file_param' => $pfp,
                'required' => !empty($dDef['required']),
            ];
        }
        if (empty($fileTrace)) {
            foreach ($fileMap as $dk => $pfp) {
                $fileTrace[] = [
                    'doc_key' => $dk,
                    'provider_file_param' => $pfp,
                    'required' => false,
                ];
            }
        }

        return [
            'service_key' => $serviceKey,
            'endpoint' => $base['endpoint'],
            'method' => $base['method'],
            'provider_schema_verified' => (bool)$base['provider_schema_verified'],
            'verification_note' => '2SureVerify api_docs.php verifies endpoint URL, POST method, Manual status, and price, but explicitly defers exact per-endpoint parameter names to file headers/OpenAPI on request. Update provider_param or provider_file_param in Admin Config if upstream requires different keys.',
            'fields' => $fieldMap,
            'files' => $fileMap,
            'field_trace' => $fieldTrace,
            'file_trace' => $fileTrace,
        ];
    }

    public function mapModificationPayload(
        string $serviceKey,
        array $fields,
        array $files = [],
        array $formSchema = [],
        array $requiredDocs = []
    ): array {
        $spec = self::getModificationMappingSpec($serviceKey, $formSchema, $requiredDocs);
        $fieldMap = $spec['fields'];
        $fileMap = $spec['files'];
        $blockedKeys = ['service_key', 'consent', 'idempotency_key', 'pin', 'transaction_pin', 'document_ids', 'supporting_documents'];

        $mappedFields = [];
        $appliedFieldTrace = [];
        foreach ($fields as $k => $v) {
            $key = (string)$k;
            if (in_array($key, $blockedKeys, true) || !is_scalar($v)) {
                continue;
            }
            $strVal = trim((string)$v);
            if ($strVal === '') {
                continue;
            }
            if (!empty($fieldMap) && !array_key_exists($key, $fieldMap)) {
                continue;
            }
            $providerKey = preg_replace('/[^a-zA-Z0-9_]/', '_', (string)($fieldMap[$key] ?? $key)) ?: $key;
            $mappedFields[$providerKey] = $strVal;
            $appliedFieldTrace[] = [
                'internal_field' => $key,
                'provider_param' => $providerKey,
            ];
        }

        $mappedFiles = [];
        foreach ($files as $idx => $fileItem) {
            if (!is_array($fileItem)) {
                continue;
            }
            $docKey = (string)($fileItem['doc_key'] ?? ('document_' . $idx));
            $targetParam = preg_replace('/[^a-zA-Z0-9_]/', '_', (string)($fileMap[$docKey] ?? $docKey)) ?: ('document_' . $idx);
            $mappedFiles[] = array_merge($fileItem, [
                'provider_file_param' => $targetParam,
            ]);
        }

        return [
            'payload' => $mappedFields,
            'files' => $mappedFiles,
            'provider_schema_verified' => $spec['provider_schema_verified'],
            'mapping_trace' => $appliedFieldTrace,
        ];
    }

    /**
     * Submit Manual NIN/BVN Modification Request to 2SureVerify.
     * Supports multipart/form-data when local uploaded files exist or JSON otherwise.
     */
    public function submitModification(
        string $endpoint,
        array $fields,
        array $files = [],
        ?string $reference = null,
        ?string $serviceKey = null,
        array $formSchema = [],
        array $requiredDocs = []
    ): array {
        $ref = ($reference !== null && $reference !== '') ? $reference : ('2SV_MOD_' . strtoupper(bin2hex(random_bytes(6))));
        if (empty($this->apiKey)) {
            return [
                'success' => false,
                'accepted' => false,
                'pending' => false,
                'status' => 'failed',
                'code' => 503,
                'message' => '2SureVerify API key is not configured on the production host.',
                'reference' => $ref,
            ];
        }

        $epNorm = '/' . ltrim(trim($endpoint), '/');
        if (!str_starts_with($epNorm, '/api/')) {
            $epNorm = '/api/v1' . $epNorm;
        }
        $url = $this->baseUrl . $epNorm;
        $startTime = microtime(true);

        $resolvedKey = trim((string)($serviceKey ?? ($fields['service_key'] ?? '')));
        if ($resolvedKey !== '' || !empty($formSchema)) {
            $mapped = $this->mapModificationPayload($resolvedKey, $fields, $files, $formSchema, $requiredDocs);
            $cleanFields = $mapped['payload'];
            $resolvedFiles = $mapped['files'];
        } else {
            $cleanFields = [];
            foreach ($fields as $k => $v) {
                if (in_array($k, ['service_key', 'consent', 'idempotency_key', 'pin', 'transaction_pin', 'document_ids', 'supporting_documents'], true)) {
                    continue;
                }
                if (is_scalar($v) && trim((string)$v) !== '') {
                    $cleanFields[(string)$k] = trim((string)$v);
                }
            }
            $resolvedFiles = $files;
        }
        $cleanFields['reference'] = $cleanFields['reference'] ?? $ref;

        $curlFiles = [];
        $fileIndex = 0;
        foreach ($resolvedFiles as $k => $fileItem) {
            if (is_array($fileItem)) {
                $filePath = (string)($fileItem['file_path'] ?? $fileItem['path'] ?? '');
                $mime = (string)($fileItem['mime_type'] ?? $fileItem['mime'] ?? 'application/octet-stream');
                $origName = basename((string)($fileItem['original_name'] ?? $fileItem['name'] ?? ('document_' . $fileIndex)));
                $rawParam = (string)($fileItem['provider_file_param'] ?? $fileItem['doc_key'] ?? (is_string($k) ? $k : 'document_' . $fileIndex));
            } elseif (is_string($fileItem) && $fileItem !== '') {
                $filePath = $fileItem;
                $mime = is_file($filePath) ? (mime_content_type($filePath) ?: 'application/octet-stream') : 'application/octet-stream';
                $origName = basename($filePath);
                $rawParam = is_string($k) ? $k : ('document_' . $fileIndex);
            } else {
                continue;
            }
            if ($filePath !== '' && is_file($filePath) && is_readable($filePath)) {
                $fieldKey = preg_replace('/[^a-zA-Z0-9_]/', '_', $rawParam) ?: ('document_' . $fileIndex);
                if (isset($curlFiles[$fieldKey])) {
                    $fieldKey .= '_' . $fileIndex;
                }
                $curlFiles[$fieldKey] = new \CURLFile($filePath, $mime, $origName);
                $fileIndex++;
            }
        }

        $ch = curl_init($url);
        if (!empty($curlFiles)) {
            $postBody = array_merge($cleanFields, ['api_key' => $this->apiKey], $curlFiles);
            $headers = [
                'Accept: application/json',
                'Expect:',
                'Authorization: Bearer ' . $this->apiKey,
                'X-Api-Key: ' . $this->apiKey,
            ];
        } else {
            $postBody = json_encode(array_merge($cleanFields, ['api_key' => $this->apiKey]));
            $headers = [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: Bearer ' . $this->apiKey,
                'X-Api-Key: ' . $this->apiKey,
            ];
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postBody,
            CURLOPT_HTTPHEADER => $headers,
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
        $logPayload = $cleanFields;
        if (!empty($curlFiles)) {
            $logPayload['_attached_files'] = array_keys($curlFiles);
        }
        $this->logTransaction($epNorm, $logPayload, $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, $ref, 'POST');

        if ($responseBody && $statusCode >= 200 && $statusCode < 300) {
            $decoded = json_decode($responseBody, true);
            if (is_array($decoded)) {
                $nested = is_array($decoded['data'] ?? null) ? $decoded['data'] : [];
                $provRef = (string)($decoded['reference'] ?? $nested['reference'] ?? $decoded['request_id'] ?? $decoded['transaction_id'] ?? $ref);
                $statusLower = strtolower(trim((string)($decoded['status'] ?? $nested['status'] ?? '')));
                $pendingFlag = $decoded['pending'] ?? $nested['pending'] ?? null;
                $isPending = ($pendingFlag === true || $pendingFlag === 1 || strtolower((string)$pendingFlag) === 'true' || in_array($statusLower, ['pending', 'processing', 'queued', 'submitted', 'in_progress'], true));

                $providerCost = 0.0;
                foreach (['amount_charged', 'charge', 'cost', 'price'] as $costKey) {
                    if (isset($decoded[$costKey]) && is_numeric($decoded[$costKey])) {
                        $providerCost = (float)$decoded[$costKey];
                        break;
                    }
                    if (isset($nested[$costKey]) && is_numeric($nested[$costKey])) {
                        $providerCost = (float)$nested[$costKey];
                        break;
                    }
                }

                if ($isPending) {
                    return [
                        'success' => true,
                        'accepted' => true,
                        'pending' => true,
                        'status' => 'pending',
                        'provider_status' => $statusLower !== '' ? $statusLower : 'pending',
                        'reference' => $provRef,
                        'provider_reference' => $provRef,
                        'provider_cost' => $providerCost,
                        'message' => (string)($decoded['message'] ?? 'Request received by 2SureVerify and queued for manual processing.'),
                        'raw' => $decoded,
                    ];
                }

                $explicitSuccess = $decoded['success'] ?? null;
                $isFailed = ($explicitSuccess === false || strtolower((string)$explicitSuccess) === 'false' || in_array($statusLower, ['failed', 'error', 'rejected', 'declined'], true));
                if (!$isFailed) {
                    return [
                        'success' => true,
                        'accepted' => true,
                        'pending' => false,
                        'status' => in_array($statusLower, ['completed', 'success', 'approved'], true) ? 'completed' : 'pending',
                        'provider_status' => $statusLower !== '' ? $statusLower : 'submitted',
                        'reference' => $provRef,
                        'provider_reference' => $provRef,
                        'provider_cost' => $providerCost,
                        'message' => (string)($decoded['message'] ?? 'Modification request accepted.'),
                        'raw' => $decoded,
                    ];
                }

                return [
                    'success' => false,
                    'accepted' => false,
                    'pending' => false,
                    'status' => 'failed',
                    'code' => $statusCode,
                    'reference' => $provRef,
                    'message' => (string)($decoded['message'] ?? $decoded['error'] ?? 'Provider rejected modification request.'),
                    'raw' => $decoded,
                ];
            }
        }

        $errorMsg = 'Provider modification request failed.';
        if ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
            $errorMsg = 'Gateway timed out while submitting modification request.';
        } elseif ($responseBody) {
            $decodedErr = json_decode($responseBody, true);
            if (is_array($decodedErr) && !empty($decodedErr['message'])) {
                $errorMsg = (string)$decodedErr['message'];
            }
        } elseif ($curlError) {
            $errorMsg = 'Connection error: ' . $curlError;
        }

        return [
            'success' => false,
            'accepted' => false,
            'pending' => false,
            'status' => 'failed',
            'code' => $curlErrno === CURLE_OPERATION_TIMEDOUT ? 504 : ($statusCode ?: 502),
            'message' => $errorMsg,
            'reference' => $ref,
            'raw_error' => $responseBody ?: $curlError,
        ];
    }

    public static function getAllEnrolmentMappingSpecs(): array
    {
        return [
            'bvn_enroll_adult' => [
                'endpoint' => '/api/v1/bvn_enroll_adult.php',
                'method' => 'POST',
                'enrolment_label' => 'NIN Enrolment (Adult)',
                'identity_domain' => 'NIN',
                'provider_schema_verified' => false,
                'fields' => [
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'dob' => 'dob',
                    'gender' => 'gender',
                    'phone' => 'phone',
                    'email' => 'email',
                    'marital_status' => 'marital_status',
                    'state_of_origin' => 'state_of_origin',
                    'lga_of_origin' => 'lga_of_origin',
                    'residence_address' => 'residence_address',
                    'residence_state' => 'residence_state',
                    'residence_lga' => 'residence_lga',
                    'town' => 'town',
                    'notes' => 'notes',
                ],
                'files' => [
                    'passport_photo' => 'passport_photo',
                    'valid_id' => 'valid_id',
                    'address_proof' => 'address_proof',
                ],
            ],
            'bvn_enroll_child' => [
                'endpoint' => '/api/v1/bvn_enroll_child.php',
                'method' => 'POST',
                'enrolment_label' => 'NIN Enrolment (Child)',
                'identity_domain' => 'NIN',
                'provider_schema_verified' => false,
                'fields' => [
                    'first_name' => 'first_name',
                    'middle_name' => 'middle_name',
                    'last_name' => 'last_name',
                    'dob' => 'dob',
                    'gender' => 'gender',
                    'parent_nin' => 'parent_nin',
                    'parent_name' => 'parent_name',
                    'parent_relationship' => 'parent_relationship',
                    'phone' => 'phone',
                    'email' => 'email',
                    'state_of_origin' => 'state_of_origin',
                    'lga_of_origin' => 'lga_of_origin',
                    'residence_address' => 'residence_address',
                    'residence_state' => 'residence_state',
                    'residence_lga' => 'residence_lga',
                    'notes' => 'notes',
                ],
                'files' => [
                    'passport_photo' => 'passport_photo',
                    'birth_certificate' => 'birth_certificate',
                    'parent_nin_slip' => 'parent_nin_slip',
                ],
            ],
        ];
    }

    public static function getEnrolmentMappingSpec(string $serviceKey, array $formSchema = [], array $requiredDocs = []): array
    {
        $all = self::getAllEnrolmentMappingSpecs();
        $base = $all[$serviceKey] ?? [
            'endpoint' => '',
            'method' => 'POST',
            'enrolment_label' => $serviceKey,
            'identity_domain' => 'NIN',
            'provider_schema_verified' => false,
            'fields' => [],
            'files' => [],
        ];

        $fieldMap = $base['fields'];
        $fieldTrace = [];
        foreach ($formSchema as $fDef) {
            if (!is_array($fDef) || empty($fDef['key'])) {
                continue;
            }
            $ck = (string)$fDef['key'];
            $pp = trim((string)($fDef['provider_param'] ?? ($fieldMap[$ck] ?? $ck)));
            $fieldMap[$ck] = $pp;
            $fieldTrace[] = [
                'customer_field' => $ck,
                'internal_field' => $ck,
                'provider_param' => $pp,
                'required' => !empty($fDef['required']),
            ];
        }

        $fileMap = $base['files'];
        $fileTrace = [];
        foreach ($requiredDocs as $dDef) {
            if (!is_array($dDef) || empty($dDef['key'])) {
                continue;
            }
            $dk = (string)$dDef['key'];
            $pfp = trim((string)($dDef['provider_file_param'] ?? ($fileMap[$dk] ?? $dk)));
            $fileMap[$dk] = $pfp;
            $fileTrace[] = [
                'doc_key' => $dk,
                'provider_file_param' => $pfp,
                'required' => !empty($dDef['required']),
            ];
        }

        return [
            'service_key' => $serviceKey,
            'endpoint' => $base['endpoint'],
            'method' => $base['method'],
            'enrolment_label' => $base['enrolment_label'],
            'identity_domain' => $base['identity_domain'],
            'provider_schema_verified' => (bool)$base['provider_schema_verified'],
            'verification_note' => '2SureVerify api_docs.php & /api/v1/services.php verify the endpoint URL, POST method, Manual status, and provider cost, while deferring per-endpoint parameter names to OpenAPI/headers on request. Admins can adjust provider_param and provider_file_param per field/document anytime.',
            'fields' => $fieldMap,
            'files' => $fileMap,
            'field_trace' => $fieldTrace,
            'file_trace' => $fileTrace,
        ];
    }

    public function mapEnrolmentPayload(
        string $serviceKey,
        array $fields,
        array $files = [],
        array $formSchema = [],
        array $requiredDocs = []
    ): array {
        $spec = self::getEnrolmentMappingSpec($serviceKey, $formSchema, $requiredDocs);
        $fieldMap = $spec['fields'];
        $fileMap = $spec['files'];
        $blockedKeys = ['service_key', 'consent', 'idempotency_key', 'pin', 'transaction_pin', 'document_ids', 'supporting_documents'];

        $mappedFields = [];
        foreach ($fields as $k => $v) {
            $key = (string)$k;
            if (in_array($key, $blockedKeys, true) || !is_scalar($v)) {
                continue;
            }
            $strVal = trim((string)$v);
            if ($strVal === '') {
                continue;
            }
            if (!empty($fieldMap) && !array_key_exists($key, $fieldMap)) {
                continue;
            }
            $providerKey = preg_replace('/[^a-zA-Z0-9_]/', '_', (string)($fieldMap[$key] ?? $key)) ?: $key;
            $mappedFields[$providerKey] = $strVal;
        }

        $mappedFiles = [];
        foreach ($files as $idx => $fileItem) {
            if (!is_array($fileItem)) {
                continue;
            }
            $docKey = (string)($fileItem['doc_key'] ?? ('document_' . $idx));
            $targetParam = preg_replace('/[^a-zA-Z0-9_]/', '_', (string)($fileMap[$docKey] ?? $docKey)) ?: ('document_' . $idx);
            $mappedFiles[] = array_merge($fileItem, [
                'provider_file_param' => $targetParam,
            ]);
        }

        return [
            'payload' => $mappedFields,
            'files' => $mappedFiles,
            'provider_schema_verified' => $spec['provider_schema_verified'],
        ];
    }

    public function submitEnrolment(
        string $endpoint,
        array $fields,
        array $files = [],
        ?string $reference = null,
        ?string $serviceKey = null,
        array $formSchema = [],
        array $requiredDocs = []
    ): array {
        $ref = ($reference !== null && $reference !== '') ? $reference : ('2SV_ENR_' . strtoupper(bin2hex(random_bytes(6))));
        if (empty($this->apiKey)) {
            return [
                'success' => false,
                'pending' => false,
                'status' => 'failed',
                'code' => 503,
                'message' => '2SureVerify API key is not configured on the production host.',
                'reference' => $ref,
            ];
        }

        $epNorm = '/' . ltrim(trim($endpoint), '/');
        if (!str_starts_with($epNorm, '/api/')) {
            $epNorm = '/api/v1' . $epNorm;
        }
        $url = $this->baseUrl . $epNorm;
        $startTime = microtime(true);

        $resolvedKey = trim((string)($serviceKey ?? ($fields['service_key'] ?? '')));
        $mapped = $this->mapEnrolmentPayload($resolvedKey, $fields, $files, $formSchema, $requiredDocs);
        $cleanFields = $mapped['payload'];
        $resolvedFiles = $mapped['files'];
        $cleanFields['reference'] = $cleanFields['reference'] ?? $ref;

        $curlFiles = [];
        $fileIndex = 0;
        foreach ($resolvedFiles as $fileItem) {
            if (!is_array($fileItem)) {
                continue;
            }
            $filePath = (string)($fileItem['file_path'] ?? '');
            if ($filePath !== '' && is_file($filePath) && is_readable($filePath)) {
                $mime = (string)($fileItem['mime_type'] ?? 'application/octet-stream');
                $origName = basename((string)($fileItem['original_name'] ?? ('document_' . $fileIndex)));
                $rawParam = (string)($fileItem['provider_file_param'] ?? $fileItem['doc_key'] ?? ('document_' . $fileIndex));
                $fieldKey = preg_replace('/[^a-zA-Z0-9_]/', '_', $rawParam) ?: ('document_' . $fileIndex);
                if (isset($curlFiles[$fieldKey])) {
                    $fieldKey .= '_' . $fileIndex;
                }
                $curlFiles[$fieldKey] = new \CURLFile($filePath, $mime, $origName);
                $fileIndex++;
            }
        }

        $ch = curl_init($url);
        if (!empty($curlFiles)) {
            $postBody = array_merge($cleanFields, ['api_key' => $this->apiKey], $curlFiles);
            $headers = [
                'Accept: application/json',
                'Expect:',
                'Authorization: Bearer ' . $this->apiKey,
                'X-Api-Key: ' . $this->apiKey,
            ];
        } else {
            $postBody = json_encode(array_merge($cleanFields, ['api_key' => $this->apiKey]));
            $headers = [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: Bearer ' . $this->apiKey,
                'X-Api-Key: ' . $this->apiKey,
            ];
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postBody,
            CURLOPT_HTTPHEADER => $headers,
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
        $logPayload = $cleanFields;
        if (!empty($curlFiles)) {
            $logPayload['_attached_files'] = array_keys($curlFiles);
        }
        $this->logTransaction($epNorm, $logPayload, $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, $ref, 'POST');

        if ($responseBody && $statusCode >= 200 && $statusCode < 300) {
            $decoded = json_decode($responseBody, true);
            if (is_array($decoded)) {
                $nested = is_array($decoded['data'] ?? null) ? $decoded['data'] : [];
                $provRef = (string)($decoded['reference'] ?? $nested['reference'] ?? $decoded['request_id'] ?? $ref);
                $statusLower = strtolower(trim((string)($decoded['status'] ?? $nested['status'] ?? '')));
                $pendingFlag = $decoded['pending'] ?? $nested['pending'] ?? null;
                $isPending = ($pendingFlag === true || $pendingFlag === 1 || strtolower((string)$pendingFlag) === 'true' || in_array($statusLower, ['pending', 'processing', 'queued', 'submitted', 'in_progress'], true));

                $providerCost = 0.0;
                foreach (['amount_charged', 'charge', 'cost', 'price'] as $costKey) {
                    if (isset($decoded[$costKey]) && is_numeric($decoded[$costKey])) {
                        $providerCost = (float)$decoded[$costKey];
                        break;
                    }
                    if (isset($nested[$costKey]) && is_numeric($nested[$costKey])) {
                        $providerCost = (float)$nested[$costKey];
                        break;
                    }
                }

                $explicitSuccess = $decoded['success'] ?? null;
                $isFailed = !$isPending && (
                    $explicitSuccess === false
                    || strtolower((string)$explicitSuccess) === 'false'
                    || in_array($statusLower, ['failed', 'error', 'rejected', 'declined'], true)
                );
                if ($isFailed) {
                    return [
                        'success' => false,
                        'pending' => false,
                        'status' => 'failed',
                        'code' => $statusCode,
                        'reference' => $provRef,
                        'message' => (string)($decoded['message'] ?? $decoded['error'] ?? 'Provider rejected enrolment request.'),
                        'raw' => $decoded,
                    ];
                }

                return [
                    'success' => true,
                    'pending' => true,
                    'status' => 'pending',
                    'provider_status' => $statusLower !== '' ? $statusLower : 'pending',
                    'reference' => $provRef,
                    'provider_cost' => $providerCost,
                    'message' => (string)($decoded['message'] ?? 'NIN Enrolment order accepted and queued for manual processing.'),
                    'raw' => $decoded,
                ];
            }
        }

        $errorMsg = 'Provider enrolment request failed.';
        if ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
            $errorMsg = 'Gateway timed out while submitting enrolment request.';
        } elseif ($responseBody) {
            $decodedErr = json_decode($responseBody, true);
            if (is_array($decodedErr) && !empty($decodedErr['message'])) {
                $errorMsg = (string)$decodedErr['message'];
            }
        } elseif ($curlError) {
            $errorMsg = 'Connection error: ' . $curlError;
        }

        return [
            'success' => false,
            'pending' => false,
            'status' => 'failed',
            'code' => $curlErrno === CURLE_OPERATION_TIMEDOUT ? 504 : ($statusCode ?: 502),
            'message' => $errorMsg,
            'reference' => $ref,
            'raw_error' => $responseBody ?: $curlError,
        ];
    }

    /**
     * Poll 2SureVerify /api/v1/status.php?reference=... for an existing modification request.
     */
    public function pollModificationStatus(string $providerReference): array
    {
        if (empty($this->apiKey)) {
            return [
                'success' => false,
                'status' => 'pending',
                'message' => 'Identity gateway credentials not configured.',
                'raw' => null,
            ];
        }

        $epNorm = '/api/v1/status.php?reference=' . urlencode($providerReference);
        $url = $this->baseUrl . $epNorm;
        $startTime = microtime(true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $this->apiKey,
                'X-Api-Key: ' . $this->apiKey,
            ],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $responseBody = curl_exec($ch);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $this->logTransaction('/api/v1/status.php', ['reference' => $providerReference], $responseBody === false ? $curlError : (string)$responseBody, $statusCode, $latencyMs, $providerReference, 'GET');

        if ($responseBody === false || $statusCode === 0) {
            return [
                'success' => false,
                'code' => 502,
                'status' => null,
                'message' => 'Unable to reach verification status desk.',
                'raw' => null,
            ];
        }

        $decoded = json_decode((string)$responseBody, true);
        if (!is_array($decoded)) {
            return [
                'success' => false,
                'code' => $statusCode,
                'status' => null,
                'message' => 'Unexpected status response.',
                'raw' => ['raw_text' => mb_substr((string)$responseBody, 0, 500)],
            ];
        }

        $nested = is_array($decoded['data'] ?? null) ? $decoded['data'] : [];
        $rawStatus = strtolower(trim((string)($nested['status'] ?? $decoded['status'] ?? '')));
        $isPending = !empty($decoded['pending']) || !empty($nested['pending']);
        $remarks = trim((string)(
            $nested['remarks']
            ?? $nested['reason']
            ?? $nested['note']
            ?? $decoded['remarks']
            ?? $decoded['message']
            ?? ''
        ));

        $mapped = null;
        if (in_array($rawStatus, ['completed', 'complete', 'success', 'successful', 'approved', 'done', 'delivered'], true)) {
            $mapped = 'completed';
        } elseif (in_array($rawStatus, ['processing', 'in_progress', 'in-progress', 'queued', 'submitted', 'under_review', 'reviewing'], true)) {
            $mapped = 'processing';
        } elseif (in_array($rawStatus, ['query', 'query_required', 'action_required', 'info_required', 'clarification'], true)) {
            $mapped = 'query_required';
        } elseif (in_array($rawStatus, ['rejected', 'declined', 'cancelled', 'canceled'], true)) {
            $mapped = 'rejected';
        } elseif (in_array($rawStatus, ['failed', 'error'], true)) {
            $mapped = 'failed';
        } elseif ($rawStatus === 'pending' || $rawStatus === 'waiting' || $isPending) {
            $mapped = 'pending';
        }

        return [
            'success' => $statusCode >= 200 && $statusCode < 300,
            'code' => $statusCode,
            'status' => $mapped,
            'provider_status' => $rawStatus ?: ($isPending ? 'pending' : 'unknown'),
            'remarks' => $remarks,
            'data' => $nested,
            'raw' => $decoded,
        ];
    }

    /**
     * Fetch official BVN Modification bank list + wholesale pricing from 2SureVerify.
     */
    public function fetchBvnModificationBanks(): array
    {
        if (empty($this->apiKey)) {
            return ['success' => false, 'data' => [], 'message' => 'Missing API key'];
        }
        $url = $this->baseUrl . '/api/v1/bvn_modification_banks.php';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $this->apiKey,
                'X-Api-Key: ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if (!$body || $code < 200 || $code >= 300) {
            return ['success' => false, 'data' => [], 'message' => "HTTP {$code}"];
        }
        $decoded = json_decode((string)$body, true);
        if (!is_array($decoded) || empty($decoded['data']) || !is_array($decoded['data'])) {
            return ['success' => false, 'data' => [], 'message' => 'Empty bank payload'];
        }
        return [
            'success' => true,
            'data' => $decoded['data'],
        ];
    }

    private function sanitizeLogResponse(?string $responseBody): ?string
    {
        if ($responseBody === null || $responseBody === '') {
            return $responseBody;
        }
        $decoded = json_decode($responseBody, true);
        if (is_array($decoded)) {
            $redactRecursive = static function (array $node) use (&$redactRecursive): array {
                foreach ($node as $k => $v) {
                    $kl = strtolower((string)$k);
                    if (in_array($kl, ['pdf_base64', 'photo', 'base64image', 'signature', 'image', 'token', 'api_key', 'secret', 'secret_key', 'password'], true)) {
                        $node[$k] = is_string($v) && strlen($v) > 32 ? '[REDACTED:' . strlen($v) . 'B]' : '[REDACTED]';
                    } elseif (is_array($v)) {
                        $node[$k] = $redactRecursive($v);
                    }
                }
                return $node;
            };
            return json_encode($redactRecursive($decoded)) ?: substr($responseBody, 0, 4000);
        }
        return strlen($responseBody) > 4000 ? substr($responseBody, 0, 4000) . '...[TRUNCATED]' : $responseBody;
    }

    private function logTransaction(
        string $endpoint,
        array $requestBody,
        ?string $responseBody,
        int $statusCode,
        int $latencyMs,
        ?string $reference,
        string $method = 'POST'
    ): void {
        try {
            $safeReq = $requestBody;
            foreach (['password', 'api_key', 'secret_key', 'token', 'pin', 'transaction_pin', 'photo', 'passport_photo'] as $secretKey) {
                if (isset($safeReq[$secretKey]) && $safeReq[$secretKey] !== '') {
                    $safeReq[$secretKey] = '[REDACTED]';
                }
            }
            foreach (['nin', 'bvn', 'child_nin', 'guardian_nin', 'parent_nin', 'phone', 'phone_number', 'new_phone', 'new_phone_number', 'previous_phone'] as $k) {
                if (!empty($safeReq[$k])) {
                    $v = (string)$safeReq[$k];
                    $safeReq[$k] = strlen($v) > 5 ? substr($v, 0, 3) . '•••••' . substr($v, -2) : 'REDACTED';
                }
            }
            foreach (['dob', 'birthdate', 'residence_address', 'address', 'email'] as $pk) {
                if (!empty($safeReq[$pk]) && is_string($safeReq[$pk])) {
                    $safeReq[$pk] = '[MASKED]';
                }
            }
            foreach ($safeReq as $k => $v) {
                if ($v instanceof \CURLFile) {
                    $safeReq[$k] = '[FILE:' . basename($v->getPostFilename() ?: $v->getFilename()) . ']';
                }
            }
            $db = Database::getInstance();
            $logId = Security::generateUuid();
            $db->execute(
                'INSERT INTO provider_logs 
                 (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES 
                 (:id, "2sureverify", :endpoint, :method, :status, :req, :res, :latency, :ref, NOW())',
                [
                    'id' => $logId,
                    'endpoint' => $endpoint,
                    'method' => $method,
                    'status' => $statusCode,
                    'req' => json_encode($safeReq),
                    'res' => $this->sanitizeLogResponse($responseBody),
                    'latency' => $latencyMs,
                    'ref' => $reference,
                ]
            );
        } catch (\Throwable $e) {
            error_log('[2SureVerify Log Error]: ' . $e->getMessage());
        }
    }
}
