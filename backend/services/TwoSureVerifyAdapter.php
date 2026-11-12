<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;
use Exception;
use RuntimeException;

/**
 * 2SureVerify Identity & Official Document Provider Adapter
 *
 * Provider: 2SureVerify (https://2sureverify.com/api/v1/)
 * Base URL: https://2sureverify.com/api/v1/
 * Authentication: X-Api-Key: YOUR_API_KEY
 *
 * Official Endpoints:
 * - NIN:
 *   - V1: POST /nin_v1.php (nin, slip_type)
 *   - V2: POST /nin_v2.php (nin, tier) -> basic, standard, premium, regular, vnin, vip
 *   - V3: POST /nin_v3.php (nin, tier, slip_type)
 * - PHONE:
 *   - V1: POST /phone_v1.php (phone, slip_type)
 *   - V2: POST /phone_v2.php (phone, tier) -> lookup, premium, standard, regular, vnin (lookup returns data only)
 *   - V3: POST /phone_v3.php (phone, tier, slip_type)
 * - DEMOGRAPHY:
 *   - V1: POST /demo_v1.php (firstname, lastname, dob, gender, slip_type)
 *   - V2: POST /demo_v2.php (firstname, lastname, dob, gender)
 *   - V3: POST /demo_v3.php (firstname, lastname, dob, gender, tier, slip_type)
 * - BVN:
 *   - V1: POST /bvn_v1.php (bvn, slip_type)
 *   - V2: POST /bvn_v2.php (bvn, tier) -> premium, standard
 *   - V3: POST /bvn_v3.php (bvn, tier, slip_type) -> tiers v1, v2, v3, v4, v5
 * - VNIN:
 *   - POST /vnin_verification.php (vnin, reference)
 * - STATUS:
 *   - GET /status.php?reference=...
 * - SERVICES:
 *   - GET /services.php
 *
 * Response & Data Handling:
 * - Preserves all identity fields: firstname, middlename, surname, gender, dob, phone, nin, bvn, address, state, lga, photo, tracking_id
 * - Preserves metadata: reference, transaction_id, amount_charged, balance_before, balance_after, pending
 * - If pending = true, stores as PENDING, does NOT mark successful, uses /status.php?reference=... for requeries
 * - Photo: decodes raw base64 JPEG, stores securely, normalizes to displayable data URI
 * - PDF: receives data.pdf_base64, validates %PDF- header, decodes, securely stores, associates with transaction, streams via /api/portal/nin/slip-pdf/{reference}
 */
class TwoSureVerifyAdapter extends BaseProviderAdapter implements ServiceProviderAdapterInterface
{
    public const DEFAULT_CODE = '2SUREVERIFY';

    protected string $environment = 'LIVE';

    public function __construct(string $code = self::DEFAULT_CODE, array $overrides = [])
    {
        if (empty($overrides['baseUrl'])) {
            $overrides['baseUrl'] = getenv('TWOSUREVERIFY_BASE_URL') ?: (getenv('2SUREVERIFY_BASE_URL') ?: 'https://2sureverify.com/api/v1');
        }

        parent::__construct($code, $overrides);

        $envKey = getenv('TWOSUREVERIFY_API_KEY') ?: (getenv('2SUREVERIFY_API_KEY') ?: getenv('SUREVERIFY_API_KEY'));
        if (!empty($envKey) && empty($this->apiKey)) {
            $this->apiKey = $envKey;
            $this->providerRecord['apiKeyEncrypted'] = $this->encrypt($envKey);
        }

        // Determine environment: live if valid API key is present and not prefixed with test
        if (!empty($this->apiKey) && !str_starts_with($this->apiKey, '2sv_test_')) {
            $this->environment = 'LIVE';
        } else {
            $this->environment = 'SANDBOX';
        }
    }

    public function getCode(): string
    {
        return self::DEFAULT_CODE;
    }

    public function getName(): string
    {
        return '2SureVerify Identity & Document Gateway';
    }

    public function getCategory(): string
    {
        return 'IDENTITY_NIN';
    }

    public function getEnvironment(): string
    {
        return $this->environment;
    }

    public function isLive(): bool
    {
        return $this->environment === 'LIVE' && !empty($this->apiKey);
    }

    public function getSupportedServices(): array
    {
        return [
            'NIN-VAL-006', // NIN Verification
            'NIN-VAL-004', // NIN Verification (alias)
            'NIN-PHN-009', // NIN Phone Search
            'NIN-DMG-010', // NIN Demography Search
            'ID-BVN-012',  // BVN Verification
            'ID-BPH-013',  // BVN Phone Search
            'VNIN-VAL-015',// VNIN Verification
            'NIN-SLIP-STANDARD',
            'NIN-SLIP-PREMIUM',
            'NIN-SLIP-LONG',
            'NIN-SLIP-VALIDATION',
        ];
    }

    /**
     * Map template type / slip name to 2SureVerify NIN tier (V2)
     * V2 tiers: basic, standard, premium, regular, vnin, vip
     */
    public static function mapNinTier(?string $templateType, ?string $slipName, ?string $explicitTier = null): string
    {
        if (!empty($explicitTier)) {
            return strtolower(trim($explicitTier));
        }

        $type = strtoupper(trim((string)$templateType));
        $name = strtolower(trim((string)$slipName));

        if ($type === 'VALIDATION' || str_contains($name, 'validat') || str_contains($name, 'basic')) {
            return 'basic';
        }
        if ($type === 'PREMIUM' || str_contains($name, 'premium')) {
            return 'premium';
        }
        if ($type === 'LONG' || str_contains($name, 'long') || str_contains($name, 'regular')) {
            return 'regular';
        }
        if ($type === 'VNIN' || str_contains($name, 'vnin')) {
            return 'vnin';
        }
        if ($type === 'VIP' || str_contains($name, 'vip')) {
            return 'vip';
        }

        return 'standard';
    }

    /**
     * Map template type / slip name to 2SureVerify NIN slip_type (V1/V3)
     */
    public static function mapNinSlipType(?string $templateType, ?string $slipName, ?string $explicitSlipType = null): string
    {
        if (!empty($explicitSlipType)) {
            return trim($explicitSlipType);
        }

        $type = strtoupper(trim((string)$templateType));
        $name = strtolower(trim((string)$slipName));

        if ($type === 'VALIDATION' || str_contains($name, 'validat') || str_contains($name, 'basic')) {
            return 'ninBasic';
        }
        if ($type === 'PREMIUM' || str_contains($name, 'premium')) {
            return 'ninPremium';
        }
        if ($type === 'LONG' || str_contains($name, 'long') || str_contains($name, 'regular')) {
            return 'ninRegular';
        }
        if ($type === 'VNIN' || str_contains($name, 'vnin')) {
            return 'ninVnin';
        }
        if ($type === 'VIP' || str_contains($name, 'vip')) {
            return 'ninVip';
        }

        return 'ninStandard';
    }

    /**
     * Map template type / slip name to 2SureVerify Phone tier (V2)
     * V2 tiers: lookup, premium, standard, regular, vnin
     * Note: lookup returns data only without generating PDF
     */
    public static function mapPhoneTier(?string $templateType, ?string $slipName, ?string $explicitTier = null): string
    {
        if (!empty($explicitTier)) {
            return strtolower(trim($explicitTier));
        }

        $type = strtoupper(trim((string)$templateType));
        $name = strtolower(trim((string)$slipName));

        if (empty($templateType) && empty($slipName)) {
            return 'lookup';
        }
        if ($type === 'LOOKUP' || str_contains($name, 'lookup')) {
            return 'lookup';
        }
        if ($type === 'PREMIUM' || str_contains($name, 'premium')) {
            return 'premium';
        }
        if ($type === 'LONG' || str_contains($name, 'long') || str_contains($name, 'regular')) {
            return 'regular';
        }
        if ($type === 'VNIN' || str_contains($name, 'vnin')) {
            return 'vnin';
        }

        return 'standard';
    }

    /**
     * Map BVN tier (V2: premium, standard; V3: v1..v5)
     */
    public static function mapBvnTier(?string $templateType, ?string $slipName, ?string $explicitTier = null, string $version = 'v2'): string
    {
        if (!empty($explicitTier)) {
            return strtolower(trim($explicitTier));
        }

        if ($version === 'v3') {
            return 'v1';
        }

        $type = strtoupper(trim((string)$templateType));
        $name = strtolower(trim((string)$slipName));

        if ($type === 'PREMIUM' || str_contains($name, 'premium')) {
            return 'premium';
        }

        return 'standard';
    }

    /**
     * Sends authenticated HTTP request to 2SureVerify using X-Api-Key header.
     */
    protected function makeHttpRequest(
        string $method,
        string $endpoint,
        array $data = [],
        array $headers = [],
        int $timeout = 30
    ): array {
        $customHeaders = [
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: HambakTech-SmartPlatform/1.0',
        ];
        if (!empty($this->apiKey)) {
            $customHeaders[] = 'X-Api-Key: ' . $this->apiKey;
        }

        if (!str_starts_with($endpoint, '/')) {
            $endpoint = '/' . $endpoint;
        }

        return parent::makeHttpRequest($method, $endpoint, $data, array_merge($customHeaders, $headers), $timeout);
    }

    /**
     * Validates provider credentials by pinging /services.php
     */
    public function authenticate(): array
    {
        if (empty($this->apiKey)) {
            return [
                'success'       => false,
                'authenticated' => false,
                'environment'   => $this->environment,
                'message'       => '2SureVerify API key (X-Api-Key) is not configured in environment or database.',
            ];
        }

        try {
            $res = $this->makeHttpRequest('GET', '/services.php');
            $statusCode = (int)($res['statusCode'] ?? 0);
            if (!empty($res['success']) || $statusCode === 200 || !empty($res['data'])) {
                return [
                    'success'       => true,
                    'authenticated' => true,
                    'environment'   => $this->environment,
                    'message'       => '2SureVerify credentials successfully authenticated against official gateway.',
                ];
            }

            return [
                'success'       => false,
                'authenticated' => false,
                'environment'   => $this->environment,
                'message'       => $res['message'] ?? 'Authentication rejected by 2SureVerify API.',
            ];
        } catch (\Throwable $e) {
            return [
                'success'       => false,
                'authenticated' => false,
                'environment'   => $this->environment,
                'message'       => 'Connection error during authentication: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Performs real-time health check against 2SureVerify /services.php
     */
    public function healthCheck(): array
    {
        $start = microtime(true);
        try {
            $res = $this->makeHttpRequest('GET', '/services.php', [], [], 15);
            $latencyMs = (int) round((microtime(true) - $start) * 1000);

            $httpCode = (int)($res['statusCode'] ?? ($res['httpCode'] ?? 0));
            $isReachable = $httpCode && in_array($httpCode, [200, 400, 401, 403]);
            $isSuccess = !empty($res['success']) || $httpCode === 200;

            return [
                'success'   => $isReachable,
                'status'    => $isSuccess ? 'HEALTHY' : ($isReachable ? 'DEGRADED' : 'DOWN'),
                'latencyMs' => $latencyMs,
                'message'   => $isSuccess
                    ? "2SureVerify gateway is operational ({$latencyMs}ms)."
                    : ($res['message'] ?? "Gateway returned HTTP {$httpCode} ({$latencyMs}ms)"),
            ];
        } catch (\Throwable $e) {
            $latencyMs = (int) round((microtime(true) - $start) * 1000);
            return [
                'success'   => false,
                'status'    => 'DOWN',
                'latencyMs' => $latencyMs,
                'message'   => 'Health check failed: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * 1. NIN Verification (/nin_v1.php, /nin_v2.php, /nin_v3.php)
     *
     * V1: POST /nin_v1.php -> { "nin": "...", "slip_type": "ninBasic" }
     * V2: POST /nin_v2.php -> { "nin": "...", "tier": "basic" } (basic, standard, premium, regular, vnin, vip)
     * V3: POST /nin_v3.php -> { "nin": "...", "tier": "v1", "slip_type": "ninStandard" }
     */
    public function verifyNin(string $nin, string $clientReference, array $options = []): array
    {
        $cleanNin = preg_replace('/\D/', '', $nin);

        // Version selection: default to v2 as standard tier-based endpoint, or honor explicit version
        $version = strtolower((string)($options['version'] ?? 'v2'));
        $templateType = $options['templateType'] ?? null;
        $slipName = $options['slipName'] ?? null;

        $tier = self::mapNinTier($templateType, $slipName, $options['tier'] ?? null);
        $slipType = self::mapNinSlipType($templateType, $slipName, $options['slip_type'] ?? ($options['slipType'] ?? null));

        $payload = [
            'nin'       => $cleanNin,
            'reference' => $clientReference,
            'consent'   => true,
        ];

        switch ($version) {
            case 'v1':
                $endpoint = '/nin_v1.php';
                $payload['slip_type'] = $slipType;
                break;

            case 'v3':
                $endpoint = '/nin_v3.php';
                $payload['tier'] = $options['tier'] ?? 'v1';
                $payload['slip_type'] = $slipType;
                break;

            case 'v2':
            default:
                $endpoint = '/nin_v2.php';
                $payload['tier'] = $tier;
                break;
        }

        if (!$this->isLive()) {
            return [
                'success'           => false,
                'status'            => 'FAILED',
                'providerCode'      => self::DEFAULT_CODE,
                'clientReference'   => $clientReference,
                'isProviderFailure' => true,
                'message'           => '2SureVerify live API credentials required or gateway unconfigured.',
            ];
        }

        $res = $this->makeHttpRequest('POST', $endpoint, $payload);
        return $this->normalize2SureResponse($res, 'NIN', $cleanNin, $clientReference, $options);
    }

    /**
     * 2. NIN Phone Search (/phone_v1.php, /phone_v2.php, /phone_v3.php)
     *
     * V1: phone + slip_type
     * V2: phone + tier (lookup, premium, standard, regular, vnin; lookup returns data only, no PDF)
     * V3: phone + tier + slip_type
     */
    public function searchNinByPhone(string $phone, string $clientReference, array $options = []): array
    {
        $cleanPhone = preg_replace('/\D/', '', $phone);
        if (str_starts_with($cleanPhone, '234') && strlen($cleanPhone) === 13) {
            $cleanPhone = '0' . substr($cleanPhone, 3);
        }

        $version = strtolower((string)($options['version'] ?? 'v2'));
        $templateType = $options['templateType'] ?? null;
        $slipName = $options['slipName'] ?? null;

        $tier = self::mapPhoneTier($templateType, $slipName, $options['tier'] ?? null);
        $slipType = self::mapNinSlipType($templateType, $slipName, $options['slip_type'] ?? ($options['slipType'] ?? null));

        $payload = [
            'phone'     => $cleanPhone,
            'reference' => $clientReference,
            'consent'   => true,
        ];

        switch ($version) {
            case 'v1':
                $endpoint = '/phone_v1.php';
                $payload['slip_type'] = $slipType;
                break;

            case 'v3':
                $endpoint = '/phone_v3.php';
                $payload['tier'] = $options['tier'] ?? 'v1';
                $payload['slip_type'] = $slipType;
                break;

            case 'v2':
            default:
                $endpoint = '/phone_v2.php';
                $payload['tier'] = $tier;
                break;
        }

        if (!$this->isLive()) {
            return [
                'success'           => false,
                'status'            => 'FAILED',
                'providerCode'      => self::DEFAULT_CODE,
                'clientReference'   => $clientReference,
                'isProviderFailure' => true,
                'message'           => '2SureVerify live API credentials required or gateway unconfigured.',
            ];
        }

        $res = $this->makeHttpRequest('POST', $endpoint, $payload);
        return $this->normalize2SureResponse($res, 'PHONE', $cleanPhone, $clientReference, $options);
    }

    /**
     * 3. NIN Demography Search (/demo_v1.php, /demo_v2.php, /demo_v3.php)
     *
     * V1: firstname, lastname, dob, gender, slip_type
     * V2: firstname, lastname, dob, gender
     * V3: firstname, lastname, dob, gender, tier, slip_type
     */
    public function searchNinDemography(array $demographics, string $clientReference, array $options = []): array
    {
        $version = strtolower((string)($options['version'] ?? 'v2'));
        $templateType = $options['templateType'] ?? null;
        $slipName = $options['slipName'] ?? null;

        $firstname = trim((string)($demographics['firstname'] ?? ($demographics['firstName'] ?? '')));
        $lastname = trim((string)($demographics['lastname'] ?? ($demographics['lastName'] ?? ($demographics['surname'] ?? ''))));
        $dob = trim((string)($demographics['dob'] ?? ($demographics['birthdate'] ?? '')));
        $rawGender = strtolower(trim((string)($demographics['gender'] ?? 'male')));
        $gender = str_starts_with($rawGender, 'f') ? 'f' : 'm';

        $tier = self::mapNinTier($templateType, $slipName, $options['tier'] ?? null);
        $slipType = self::mapNinSlipType($templateType, $slipName, $options['slip_type'] ?? ($options['slipType'] ?? null));

        $payload = [
            'firstname' => $firstname,
            'lastname'  => $lastname,
            'dob'       => $dob,
            'gender'    => $gender,
            'reference' => $clientReference,
            'consent'   => true,
        ];

        switch ($version) {
            case 'v1':
                $endpoint = '/demo_v1.php';
                $payload['slip_type'] = $slipType;
                break;

            case 'v3':
                $endpoint = '/demo_v3.php';
                $payload['tier'] = $options['tier'] ?? 'v1';
                $payload['slip_type'] = $slipType;
                break;

            case 'v2':
            default:
                $endpoint = '/demo_v2.php';
                break;
        }

        if (!$this->isLive()) {
            return [
                'success'           => false,
                'status'            => 'FAILED',
                'providerCode'      => self::DEFAULT_CODE,
                'clientReference'   => $clientReference,
                'isProviderFailure' => true,
                'message'           => '2SureVerify live API credentials required or gateway unconfigured.',
            ];
        }

        $res = $this->makeHttpRequest('POST', $endpoint, $payload);
        return $this->normalize2SureResponse($res, 'DEMOGRAPHY', $firstname, $clientReference, $options);
    }

    /**
     * 4. BVN Verification (/bvn_v1.php, /bvn_v2.php, /bvn_v3.php)
     *
     * V1: bvn + slip_type
     * V2: bvn + tier (premium, standard)
     * V3: bvn + tier (v1..v5) + slip_type
     */
    public function verifyBvn(string $bvn, string $clientReference, array $options = []): array
    {
        $cleanBvn = preg_replace('/\D/', '', $bvn);
        $version = strtolower((string)($options['version'] ?? 'v2'));
        $templateType = $options['templateType'] ?? null;
        $slipName = $options['slipName'] ?? null;

        $tier = self::mapBvnTier($templateType, $slipName, $options['tier'] ?? null, $version);
        $slipType = $options['slip_type'] ?? ($options['slipType'] ?? ($tier === 'premium' ? 'bvnPremium' : 'bvnStandard'));

        $payload = [
            'bvn'       => $cleanBvn,
            'reference' => $clientReference,
            'consent'   => true,
        ];

        switch ($version) {
            case 'v1':
                $endpoint = '/bvn_v1.php';
                $payload['slip_type'] = $slipType;
                break;

            case 'v3':
                $endpoint = '/bvn_v3.php';
                $payload['tier'] = $tier;
                $payload['slip_type'] = $slipType;
                break;

            case 'v2':
            default:
                $endpoint = '/bvn_v2.php';
                $payload['tier'] = $tier;
                break;
        }

        if (!$this->isLive()) {
            return [
                'success'           => false,
                'status'            => 'FAILED',
                'providerCode'      => self::DEFAULT_CODE,
                'clientReference'   => $clientReference,
                'isProviderFailure' => true,
                'message'           => '2SureVerify live API credentials required or gateway unconfigured.',
            ];
        }

        $res = $this->makeHttpRequest('POST', $endpoint, $payload);
        return $this->normalize2SureResponse($res, 'BVN', $cleanBvn, $clientReference, $options);
    }

    /**
     * 5. VNIN Verification (/vnin_verification.php)
     */
    public function verifyVnin(string $vnin, string $clientReference, array $options = []): array
    {
        $cleanVnin = strtoupper(trim($vnin));

        if (!$this->isLive()) {
            return [
                'success'           => false,
                'status'            => 'FAILED',
                'providerCode'      => self::DEFAULT_CODE,
                'clientReference'   => $clientReference,
                'isProviderFailure' => true,
                'message'           => '2SureVerify live API credentials required or gateway unconfigured.',
            ];
        }

        $res = $this->makeHttpRequest('POST', '/vnin_verification.php', [
            'vnin'      => $cleanVnin,
            'reference' => $clientReference,
            'consent'   => true,
        ]);

        return $this->normalize2SureResponse($res, 'VNIN', $cleanVnin, $clientReference, $options);
    }

    /**
     * 6. BVN Phone Search (/bvn_phone.php, /bvn_phone_v2.php)
     */
    public function searchBvnByPhone(string $phone, string $clientReference, array $options = []): array
    {
        // 2SureVerify documentation does not support BVN search by phone; fallback provider is required
        return [
            'success'           => false,
            'status'            => 'UNSUPPORTED',
            'isProviderFailure' => true,
            'httpCode'          => 501,
            'providerCode'      => self::DEFAULT_CODE,
            'clientReference'   => $clientReference,
            'message'           => '2SureVerify does not support BVN search by phone; routing to configured fallback gateway.',
        ];
    }

    /**
     * Queries remote status of a previously submitted reference (/status.php?reference=...)
     */
    public function requery(string $reference): array
    {
        if (!$this->isLive()) {
            return [
                'success'   => true,
                'status'    => 'COMPLETED',
                'reference' => $reference,
                'message'   => 'Transaction status verified (Sandbox)',
            ];
        }

        $res = $this->makeHttpRequest('GET', '/status.php?reference=' . urlencode($reference));
        return $this->normalize2SureResponse($res, 'STATUS', '', $reference);
    }

    /**
     * Alias for requery to support legacy callers
     */
    public function checkStatus(string $reference): array
    {
        return $this->requery($reference);
    }

    /**
     * Queries available services catalog (/services.php)
     */
    public function getServices(): array
    {
        return $this->makeHttpRequest('GET', '/services.php');
    }

    /**
     * Decodes and securely processes raw base64 photo (e.g. JPEG).
     * Normalizes to data URI for immediate UI display and saves to uploads/photos for persistent audit trail.
     */
    public function handlePhoto(?string $photoData, string $reference): array
    {
        if (empty($photoData)) {
            return ['dataUri' => null, 'fileUrl' => null];
        }

        $rawBase64 = $photoData;
        $mimeType = 'image/jpeg';

        if (str_starts_with($photoData, 'data:image/')) {
            $parts = explode(',', $photoData, 2);
            if (count($parts) === 2) {
                if (preg_match('/^data:(image\/[a-zA-Z0-9\+]+);base64/', $parts[0], $m)) {
                    $mimeType = $m[1];
                }
                $rawBase64 = $parts[1];
            }
        }

        $binary = base64_decode($rawBase64, true);
        if ($binary === false || strlen($binary) < 20) {
            return ['dataUri' => null, 'fileUrl' => null];
        }

        if (str_starts_with($binary, "\xFF\xD8\xFF")) {
            $mimeType = 'image/jpeg';
            $ext = 'jpg';
        } elseif (str_starts_with($binary, "\x89PNG\r\n\x1a\n")) {
            $mimeType = 'image/png';
            $ext = 'png';
        } else {
            $ext = 'jpg';
        }

        $dataUri = "data:{$mimeType};base64," . base64_encode($binary);
        $fileUrl = null;

        try {
            $docRoot = !empty($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/') : '';
            $projectRoot = dirname(__DIR__, 2);
            $candidateDirs = array_filter([
                $docRoot ? ($docRoot . '/uploads/photos') : null,
                $projectRoot . '/public/uploads/photos',
                $projectRoot . '/uploads/photos',
                $projectRoot . '/production-package/production-frontend/uploads/photos',
            ]);

            $safeRef = preg_replace('/[^a-zA-Z0-9_-]/', '_', $reference);
            $filename = "2sv_photo_{$safeRef}.{$ext}";

            foreach ($candidateDirs as $dir) {
                if (!is_dir($dir)) {
                    @mkdir($dir, 0755, true);
                }
                @file_put_contents($dir . '/' . $filename, $binary);
            }
            $fileUrl = "/uploads/photos/{$filename}";
        } catch (\Throwable $e) {
            error_log("[2SureVerify] Failed to persist photo: " . $e->getMessage());
        }

        return ['dataUri' => $dataUri, 'fileUrl' => $fileUrl];
    }

    /**
     * Safely decodes and stores provider-generated PDF (from data.pdf_base64)
     * Validates %PDF- header magic bytes.
     * Returns application streaming URL: /api/portal/nin/slip-pdf/{reference}
     */
    public function handlePdfBase64(string $base64Data, string $reference, ?string $altReference = null): ?string
    {
        if (empty($base64Data)) {
            return null;
        }

        try {
            if (str_contains($base64Data, ',')) {
                $parts = explode(',', $base64Data, 2);
                $base64Data = $parts[1] ?? $parts[0];
            }

            $binary = base64_decode($base64Data, true);
            if ($binary === false || strlen($binary) < 30) {
                return null;
            }

            // Validate PDF header magic bytes: %PDF-
            if (!str_starts_with($binary, '%PDF-')) {
                error_log("[2SureVerify] Returned pdf_base64 does not contain valid %PDF header");
                return null;
            }

            $docRoot = !empty($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/') : '';
            $projectRoot = dirname(__DIR__, 2);
            $candidateDirs = array_filter([
                $docRoot ? ($docRoot . '/uploads/slips') : null,
                $projectRoot . '/public/uploads/slips',
                $projectRoot . '/uploads/slips',
                $projectRoot . '/production-package/production-frontend/uploads/slips',
            ]);

            $safeRef = preg_replace('/[^a-zA-Z0-9_-]/', '_', $reference);
            $fileNames = ["2sv_{$safeRef}.pdf"];

            if (!empty($altReference)) {
                $safeAlt = preg_replace('/[^a-zA-Z0-9_-]/', '_', $altReference);
                if ($safeAlt !== $safeRef) {
                    $fileNames[] = "2sv_{$safeAlt}.pdf";
                }
            }

            foreach ($candidateDirs as $baseDir) {
                if (!is_dir($baseDir)) {
                    @mkdir($baseDir, 0755, true);
                }
                foreach ($fileNames as $fn) {
                    @file_put_contents($baseDir . '/' . $fn, $binary);
                }
            }

            return "/api/portal/nin/slip-pdf/{$safeRef}";
        } catch (\Throwable $e) {
            error_log("[2SureVerify] Failed to process and store pdf_base64: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Normalizes 2SureVerify raw response into standard HambakTech identity format
     */
    protected function normalize2SureResponse(array $res, string $type, string $queryValue, string $clientReference, array $options = []): array
    {
        $httpCode = $res['httpCode'] ?? 200;
        $body = is_array($res['data'] ?? null) ? $res['data'] : (is_array($res) ? $res : []);

        // 1. Check for Pending state
        $isPending = !empty($body['pending']) || 
                     (isset($body['pending']) && ($body['pending'] === true || $body['pending'] === 'true' || $body['pending'] === 1)) ||
                     (!empty($body['status']) && in_array(strtoupper((string)$body['status']), ['PENDING', 'PROCESSING', 'QUEUED'], true));

        if ($isPending) {
            return [
                'success'           => false,
                'status'            => 'PENDING',
                'isPending'         => true,
                'providerCode'      => self::DEFAULT_CODE,
                'providerName'      => $this->getName(),
                'providerReference' => $body['reference'] ?? ($body['transaction_id'] ?? $clientReference),
                'transactionId'     => $body['transaction_id'] ?? null,
                'clientReference'   => $clientReference,
                'verificationType'  => $type,
                'amount_charged'    => $body['amount_charged'] ?? null,
                'balance_before'    => $body['balance_before'] ?? null,
                'balance_after'     => $body['balance_after'] ?? null,
                'message'           => $body['message'] ?? 'Transaction is currently processing with upstream provider (pending).',
                'raw'               => $body,
            ];
        }

        $isSuccess = !empty($body['success']) || (!empty($body['status']) && strtolower((string)$body['status']) === 'success');

        if (!$isSuccess) {
            $msg = $body['message'] ?? ($body['error'] ?? '2SureVerify verification query returned unsuccessful status.');
            $isRefunded = !empty($body['refunded']) || 
                          (isset($body['refunded']) && ($body['refunded'] === true || $body['refunded'] === 'true' || $body['refunded'] === 1)) ||
                          in_array(strtoupper((string)($body['status'] ?? '')), ['REFUNDED', 'REVERSED'], true) ||
                          stripos($msg, 'refund') !== false || stripos($msg, 'reversed') !== false;

            return [
                'success'           => false,
                'status'            => $isRefunded ? 'REFUNDED' : 'FAILED',
                'providerCode'      => self::DEFAULT_CODE,
                'httpCode'          => $httpCode,
                'clientReference'   => $clientReference,
                'message'           => $msg,
                'refunded'          => $isRefunded,
                'isNotFound'        => (bool) (stripos($msg, 'not found') !== false || stripos($msg, 'no record') !== false || $httpCode === 404),
                'isProviderFailure' => (bool) ($httpCode >= 500 || stripos($msg, 'timeout') !== false || stripos($msg, 'unavailable') !== false || stripos($msg, 'insufficient') !== false || $isRefunded),
                'raw'               => $body,
            ];
        }

        $data = is_array($body['data'] ?? null) ? $body['data'] : $body;

        // Extract identifier
        $nin = preg_replace('/\D/', '', (string)($data['nin'] ?? ($type === 'NIN' ? $queryValue : '')));
        $maskedNin = strlen($nin) === 11 ? substr($nin, 0, 3) . '•••••' . substr($nin, -3) : ($data['maskedNin'] ?? '•••••••••••');

        $bvn = preg_replace('/\D/', '', (string)($data['bvn'] ?? ($type === 'BVN' ? $queryValue : '')));
        $maskedBvn = strlen($bvn) === 11 ? substr($bvn, 0, 3) . '•••••' . substr($bvn, -3) : ($data['maskedBvn'] ?? null);

        $phone = preg_replace('/\D/', '', (string)($data['phone'] ?? ($data['telephoneno'] ?? ($type === 'PHONE' || $type === 'BVN_PHONE' ? $queryValue : ''))));
        $maskedPhone = strlen($phone) >= 10 ? substr($phone, 0, 4) . '••••' . substr($phone, -2) : $phone;

        $firstname = trim((string)($data['firstname'] ?? ($data['first_name'] ?? '')));
        $surname = trim((string)($data['surname'] ?? ($data['lastname'] ?? ($data['last_name'] ?? ''))));
        $middlename = trim((string)($data['middlename'] ?? ($data['middle_name'] ?? '')));
        $fullName = trim("{$surname} {$firstname} {$middlename}");

        // Safely process photo if returned
        $photoResult = $this->handlePhoto($data['photo'] ?? ($body['photo'] ?? null), $clientReference);

        // Handle provider-generated PDF if supplied
        $documentUrl = null;
        $pdfBase64 = $data['pdf_base64'] ?? ($body['pdf_base64'] ?? null);
        $provRef = (string)($body['reference'] ?? ($body['transaction_id'] ?? ($data['reference'] ?? '')));
        if (!empty($pdfBase64)) {
            $documentUrl = $this->handlePdfBase64((string)$pdfBase64, $clientReference, $provRef);
        }

        // Build complete demographics while preserving ALL original provider fields
        $rawPhotoVal = $data['photo'] ?? ($body['photo'] ?? null);
        $photoDataUri = $photoResult['dataUri'];
        if (empty($photoDataUri) && !empty($rawPhotoVal)) {
            $photoDataUri = str_starts_with($rawPhotoVal, 'data:image/') ? $rawPhotoVal : 'data:image/jpeg;base64,' . $rawPhotoVal;
        }

        $demographics = array_merge($data, [
            'nin'               => $nin ?: ($data['nin'] ?? null),
            'maskedNin'         => $maskedNin,
            'bvn'               => $bvn ?: ($data['bvn'] ?? null),
            'maskedBvn'         => $maskedBvn,
            'vnin'              => $data['vnin'] ?? ($type === 'VNIN' ? $queryValue : null),
            'firstname'         => $firstname,
            'middlename'        => $middlename,
            'surname'           => $surname,
            'lastname'          => $surname,
            'fullName'          => $fullName ?: 'Citizen Applicant',
            'phone'             => $phone,
            'maskedPhone'       => $maskedPhone,
            'gender'            => $data['gender'] ?? null,
            'birthdate'         => $data['dob'] ?? ($data['birthdate'] ?? null),
            'dob'               => $data['dob'] ?? ($data['birthdate'] ?? null),
            'photo'             => $photoDataUri,
            'photoUrl'          => $photoResult['fileUrl'] ?? null,
            'residence_state'   => $data['state'] ?? ($data['residence_state'] ?? null),
            'state'             => $data['state'] ?? ($data['residence_state'] ?? null),
            'stateOfOrigin'     => $data['state_of_origin'] ?? ($data['stateOfOrigin'] ?? ($data['state'] ?? null)),
            'residence_lga'     => $data['lga'] ?? ($data['residence_lga'] ?? null),
            'lga'               => $data['lga'] ?? ($data['residence_lga'] ?? null),
            'residence_address' => $data['address'] ?? ($data['residence_address'] ?? null),
            'address'           => $data['address'] ?? ($data['residence_address'] ?? null),
            'tracking_id'       => $data['tracking_id'] ?? ($clientReference),
        ]);

        return [
            'success'               => true,
            'status'                => 'SUCCESS',
            'providerCode'          => self::DEFAULT_CODE,
            'providerName'          => $this->getName(),
            'providerReference'     => $body['reference'] ?? ($data['reference'] ?? ('2SV_' . bin2hex(random_bytes(6)))),
            'transaction_id'        => $body['transaction_id'] ?? ($data['transaction_id'] ?? null),
            'transactionId'         => $body['transaction_id'] ?? ($data['transaction_id'] ?? null),
            'clientReference'       => $clientReference,
            'verificationType'      => $type,
            'maskedIdentifier'      => $maskedNin ?: ($maskedBvn ?: $maskedPhone),
            'amount_charged'        => $body['amount_charged'] ?? ($data['amount_charged'] ?? null),
            'balance_before'        => $body['balance_before'] ?? ($data['balance_before'] ?? null),
            'balance_after'         => $body['balance_after'] ?? ($data['balance_after'] ?? null),
            'providerDocumentUrl'   => $documentUrl,
            'pdf_base64'            => $pdfBase64,
            'demographics'          => $demographics,
            'verifiedAt'            => date('c'),
            'message'               => $body['message'] ?? 'Identity verified successfully via 2SureVerify Gateway.',
            'raw'                   => $body,
        ];
    }

    /**
     * Mock fixtures are strictly disabled for live customer production transactions.
     */
    protected function getMockFixture(string $type, string $queryValue, string $clientReference, array $options = []): array
    {
        return [
            'success'           => false,
            'status'            => 'FAILED',
            'providerCode'      => self::DEFAULT_CODE,
            'clientReference'   => $clientReference,
            'message'           => '2SureVerify live API credentials required. Mock fixtures are disabled.',
            'isProviderFailure' => true,
        ];
    }

    // =========================================================================
    // Interface compliance methods
    // =========================================================================

    public function verify(string $type, array $params): array
    {
        $ref = $params['clientReference'] ?? ($params['reference'] ?? ('2SV_' . date('YmdHis')));
        return match (strtoupper($type)) {
            'NIN'        => $this->verifyNin((string)($params['nin'] ?? ''), $ref, $params),
            'PHONE'      => $this->searchNinByPhone((string)($params['phone'] ?? ''), $ref, $params),
            'DEMOGRAPHY' => $this->searchNinDemography($params, $ref, $params),
            'BVN'        => $this->verifyBvn((string)($params['bvn'] ?? ''), $ref, $params),
            'BVN_PHONE'  => $this->searchBvnByPhone((string)($params['phone'] ?? ''), $ref, $params),
            'VNIN'       => $this->verifyVnin((string)($params['vnin'] ?? ''), $ref, $params),
            default      => $this->verifyNin((string)($params['nin'] ?? ''), $ref, $params),
        };
    }

    public function getBalance(): array
    {
        if (!$this->isLive()) {
            return [
                'success'     => true,
                'balanceKobo' => 0,
                'balanceNgn'  => 0,
                'currency'    => 'NGN',
                'mode'        => $this->environment,
            ];
        }

        try {
            $services = $this->getServices();
            $bal = $services['walletBalance'] ?? ($services['balance'] ?? ($services['data']['balance'] ?? 0));
            $balNgn = (float)$bal;
            return [
                'success'     => true,
                'balanceKobo' => (int)round($balNgn * 100),
                'balanceNgn'  => $balNgn,
                'currency'    => 'NGN',
                'mode'        => $this->environment,
            ];
        } catch (\Throwable) {
            return [
                'success'     => true,
                'balanceKobo' => 0,
                'balanceNgn'  => 0,
                'currency'    => 'NGN',
                'mode'        => $this->environment,
            ];
        }
    }

    public function getDocument(string $identifier, array $options = []): array
    {
        $safeRef = preg_replace('/[^a-zA-Z0-9_-]/', '_', $identifier);
        $fileName = str_starts_with($safeRef, '2sv_') ? "{$safeRef}.pdf" : "2sv_{$safeRef}.pdf";

        $docRoot = !empty($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/') : '';
        $projectRoot = dirname(__DIR__, 2);
        $candidatePaths = array_filter([
            $docRoot ? ($docRoot . '/uploads/slips/' . $fileName) : null,
            $projectRoot . '/public/uploads/slips/' . $fileName,
            $projectRoot . '/uploads/slips/' . $fileName,
            $projectRoot . '/production-package/production-frontend/uploads/slips/' . $fileName,
            $docRoot ? ($docRoot . '/uploads/slips/' . $safeRef . '.pdf') : null,
            $projectRoot . '/uploads/slips/' . $safeRef . '.pdf',
        ]);

        foreach ($candidatePaths as $filePath) {
            if (file_exists($filePath)) {
                $binary = file_get_contents($filePath);
                if ($binary !== false && str_starts_with($binary, '%PDF-')) {
                    return [
                        'success'   => true,
                        'mimeType'  => 'application/pdf',
                        'pdfBinary' => $binary,
                        'url'       => "/api/portal/nin/slip-pdf/{$safeRef}",
                    ];
                }
            }
        }

        // Database Fallback from ProviderTransaction:
        // If file not on disk or identifier was providerReference / clientReference / transaction id, query database!
        try {
            $pdo = \Hambak\Core\Database::getInstance()->getConnection();
            $stmt = $pdo->prepare("
                SELECT responsePayload, clientReference, providerReference 
                FROM ProviderTransaction 
                WHERE clientReference = ? 
                   OR providerReference = ? 
                   OR id = ? 
                ORDER BY createdAt DESC 
                LIMIT 1
            ");
            $stmt->execute([$identifier, $identifier, $identifier]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && !empty($row['responsePayload'])) {
                $resp = json_decode($row['responsePayload'], true);
                $pdfB64 = $resp['data']['pdf_base64'] ?? ($resp['pdf_base64'] ?? null);
                if (!empty($pdfB64)) {
                    if (str_contains($pdfB64, ',')) {
                        $parts = explode(',', $pdfB64, 2);
                        $pdfB64 = $parts[1] ?? $parts[0];
                    }
                    $bin = base64_decode($pdfB64, true);
                    if ($bin !== false && str_starts_with($bin, '%PDF-')) {
                        // Cache it to disk for subsequent instant streaming
                        if ($docRoot && is_dir($docRoot . '/uploads/slips')) {
                            @file_put_contents($docRoot . '/uploads/slips/' . $fileName, $bin);
                        }
                        return [
                            'success'   => true,
                            'mimeType'  => 'application/pdf',
                            'pdfBinary' => $bin,
                            'url'       => "/api/portal/nin/slip-pdf/{$safeRef}",
                        ];
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log("[2SureVerify] getDocument DB fallback error: " . $e->getMessage());
        }

        return [
            'success' => false,
            'error'   => 'Provider document not found for this reference.',
        ];
    }

    public function verifyWebhookSignature(string $rawBody, array $headers, string $secret): bool
    {
        return true;
    }

    public function handleWebhook(array $headers, array $payload): array
    {
        return ['success' => true, 'message' => '2SureVerify webhook processed'];
    }

    public function normalizeResponse(array $raw, string $type = 'NIN'): array
    {
        return $this->normalize2SureResponse(['data' => $raw], $type, '', 'REF_' . time());
    }

    public function queryBalance(): array
    {
        return $this->getBalance();
    }

    public function verifyCustomer(string $serviceType, array $params): array
    {
        return $this->verify($serviceType, $params);
    }

    public function executeTransaction(array $params): array
    {
        $type = $params['serviceType'] ?? 'NIN';
        return $this->verify($type, $params);
    }

    public function queryTransaction(string $transactionReference): array
    {
        return $this->requery($transactionReference);
    }
}
