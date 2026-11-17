<?php
/**
 * @file FlutterwaveAdapter.php
 * Official Flutterwave Production Payment Gateway Adapter (v4 OAuth2 + v3 Compatibility)
 * Target: PHP 8.2+ / MySQL 8.x
 *
 * Documentation References:
 * https://developer.flutterwave.com/docs/quickstart
 * https://developer.flutterwave.com/docs/authentication
 * https://developer.flutterwave.com/docs/transaction-verification
 * https://developer.flutterwave.com/docs/webhooks
 * https://developer.flutterwave.com/docs/ngn-virtual-accounts
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Payment;

use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class FlutterwaveAdapter implements PaymentGatewayInterface
{
    private const V4_TOKEN_URL = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';
    private const V4_BASE_URL = 'https://f4bexperience.flutterwave.com';
    private const V3_BASE_URL = 'https://api.flutterwave.com/v3';

    private string $secretKey;
    private string $publicKey;
    private string $encryptionKey;
    private string $secretHash;
    private string $baseUrl;
    private int $timeout;
    private Database $db;
    private ?string $cachedAccessToken = null;
    private int $tokenExpiresAt = 0;

    public function __construct(
        string $secretKey = '',
        string $publicKey = '',
        string $encryptionKey = '',
        string $baseUrl = '',
        int $timeout = 30
    ) {
        $this->db = Database::getInstance();
        $config = file_exists(__DIR__ . '/../../config/config.php') ? require __DIR__ . '/../../config/config.php' : [];
        $providerConfig = $config['providers']['flutterwave'] ?? [];

        $dbProvider = null;
        try {
            $dbProvider = $this->db->fetchOne('SELECT secret_key, public_key, api_key, base_url, timeout_seconds FROM providers WHERE id = "flutterwave"');
        } catch (\Throwable) {
        }

        $this->secretKey = $secretKey ?: (getenv('FLUTTERWAVE_SECRET_KEY') ?: (!empty($dbProvider['secret_key']) ? (string)$dbProvider['secret_key'] : (!empty($dbProvider['api_key']) ? (string)$dbProvider['api_key'] : (string)($providerConfig['secret_key'] ?? ''))));
        $this->publicKey = $publicKey ?: (getenv('FLUTTERWAVE_PUBLIC_KEY') ?: (!empty($dbProvider['public_key']) ? (string)$dbProvider['public_key'] : (string)($providerConfig['public_key'] ?? '')));
        $this->encryptionKey = $encryptionKey ?: (getenv('FLUTTERWAVE_ENCRYPTION_KEY') ?: (string)($providerConfig['encryption_key'] ?? ''));
        $this->secretHash = getenv('FLUTTERWAVE_SECRET_HASH') ?: (getenv('FLW_SECRET_HASH') ?: (getenv('FLUTTERWAVE_WEBHOOK_SECRET') ?: (string)($providerConfig['secret_hash'] ?? '')));
        $this->timeout = $timeout ?: ((int)($dbProvider['timeout_seconds'] ?? 30));

        $rawBase = $baseUrl ?: (getenv('FLUTTERWAVE_BASE_URL') ?: (!empty($dbProvider['base_url']) ? (string)$dbProvider['base_url'] : (string)($providerConfig['base_url'] ?? '')));
        if ($this->isV4Credentials()) {
            if ($rawBase === '' || str_contains($rawBase, 'api.flutterwave.com/v3')) {
                $this->baseUrl = self::V4_BASE_URL;
            } else {
                $this->baseUrl = rtrim($rawBase, '/');
            }
        } else {
            $this->baseUrl = rtrim($rawBase ?: self::V3_BASE_URL, '/');
        }
    }

    public function isV4Credentials(): bool
    {
        if ($this->secretKey === '') {
            return false;
        }
        if (str_starts_with($this->secretKey, 'FLWSECK')) {
            return false;
        }
        return !empty($this->publicKey) && !str_starts_with($this->publicKey, 'FLWPUBK');
    }

    public function getName(): string
    {
        return 'Flutterwave Enterprise Gateway';
    }

    public function getId(): string
    {
        return 'flutterwave';
    }

    public function getStatus(): string
    {
        return !empty($this->secretKey) ? 'active' : 'unconfigured';
    }

    private function getV4AccessToken(): string
    {
        if ($this->cachedAccessToken !== null && time() < ($this->tokenExpiresAt - 30)) {
            return $this->cachedAccessToken;
        }

        if ($this->publicKey === '' || $this->secretKey === '') {
            throw new RuntimeException('Flutterwave v4 OAuth2 client_id and client_secret are not configured.');
        }

        $body = http_build_query([
            'client_id' => $this->publicKey,
            'client_secret' => $this->secretKey,
            'grant_type' => 'client_credentials',
        ]);

        $ch = curl_init(self::V4_TOKEN_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => min($this->timeout, 15),
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException("Flutterwave OAuth2 token error: {$err}");
        }

        $parsed = json_decode((string)$raw, true);
        if ($code >= 400 || empty($parsed['access_token'])) {
            $msg = is_array($parsed) ? ($parsed['error_description'] ?? $parsed['error'] ?? "HTTP {$code}") : "HTTP {$code}";
            throw new RuntimeException("Flutterwave OAuth2 authentication failed: {$msg}");
        }

        $this->cachedAccessToken = (string)$parsed['access_token'];
        $this->tokenExpiresAt = time() + (int)($parsed['expires_in'] ?? 540);
        return $this->cachedAccessToken;
    }

    private function getAuthHeaders(string $idempotencyKey = ''): array
    {
        $bearer = $this->isV4Credentials() ? $this->getV4AccessToken() : $this->secretKey;
        $headers = [
            "Authorization: Bearer {$bearer}",
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        if ($this->isV4Credentials()) {
            $headers[] = 'X-Trace-Id: ' . Security::generateUuid();
            if ($idempotencyKey !== '') {
                $headers[] = 'X-Idempotency-Key: ' . $idempotencyKey;
            }
        }
        return $headers;
    }

    /**
     * 1. Initialize Flutterwave Checkout
     * Supports v3 /payments hosted link and v4 orchestration/direct-charges or bank_transfer virtual flow.
     */
    public function initializePayment(string $email, float $amount, string $reference, string $callbackUrl, array $metadata = []): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Flutterwave Secret Key is not configured. Please supply FLUTTERWAVE_SECRET_KEY in Admin > Payment Settings.');
        }

        if ($this->isV4Credentials()) {
            return $this->initializePaymentV4($email, $amount, $reference, $callbackUrl, $metadata);
        }

        $payload = [
            'tx_ref' => $reference,
            'amount' => (string)$amount,
            'currency' => 'NGN',
            'redirect_url' => $callbackUrl,
            'payment_options' => 'card,ussd,banktransfer,account',
            'meta' => array_merge($metadata, [
                'platform' => 'HambakTech Enterprise',
                'service' => 'Wallet Funding',
            ]),
            'customer' => [
                'email' => $email,
                'name' => $metadata['customer_name'] ?? 'HambakTech Verified Customer',
                'phonenumber' => $metadata['phone_number'] ?? '',
            ],
            'customizations' => [
                'title' => 'HambakTech Wallet Top-Up',
                'description' => 'Official wallet funding for telecommunications and NIMC verification',
                'logo' => 'https://hambaktech.com.ng/logo.png',
            ],
        ];

        $ch = curl_init("{$this->baseUrl}/payments");
        $startTime = microtime(true);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => $this->getAuthHeaders($reference),
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = json_decode((string)$rawResponse, true);
        $this->logCall('/payments', 'POST', $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("Flutterwave gateway communication error: {$curlError}");
        }

        if ($statusCode !== 200 || empty($parsed['status']) || $parsed['status'] !== 'success' || empty($parsed['data']['link'])) {
            $msg = $parsed['message'] ?? "Flutterwave payment initialization failed (HTTP {$statusCode})";
            if (str_contains(strtolower($msg), 'inactive') || str_contains(strtolower($msg), 'kyc') || str_contains(strtolower($msg), 'compliance')) {
                throw new RuntimeException("Flutterwave Merchant Restriction: {$msg}. Please ensure your Flutterwave business account compliance and live credentials are activated.");
            }
            throw new RuntimeException("Flutterwave Error: {$msg}");
        }

        return [
            'authorization_url' => $parsed['data']['link'],
            'link' => $parsed['data']['link'],
            'reference' => $reference,
            'tx_ref' => $reference,
            'amount' => $amount,
        ];
    }

    private function initializePaymentV4(string $email, float $amount, string $reference, string $callbackUrl, array $metadata = []): array
    {
        $fullName = trim((string)($metadata['customer_name'] ?? 'HambakTech Customer'));
        $parts = preg_split('/\s+/', $fullName, 2) ?: ['HambakTech', 'Customer'];
        $firstName = trim($parts[0] ?? 'HambakTech') ?: 'HambakTech';
        $lastName = trim($parts[1] ?? 'Customer') ?: 'Customer';
        $phone = preg_replace('/\D/', '', (string)($metadata['phone_number'] ?? '08000000000'));
        if (str_starts_with($phone, '0') && strlen($phone) === 11) {
            $phone = substr($phone, 1);
        } elseif (str_starts_with($phone, '234')) {
            $phone = substr($phone, 3);
        }
        $cleanPhone = $phone ?: '8000000000';
        $alphaRef = preg_replace('/[^A-Za-z0-9]/', '', $reference) ?: ('FLWFUND' . strtoupper(bin2hex(random_bytes(5))));

        // Step 1: Lookup or create Flutterwave v4 customer
        $customerId = $this->findOrCreateV4Customer($email, $firstName, $lastName, $cleanPhone);

        // Step 2: Create dynamic Virtual Account (/virtual-accounts) for seamless NGN bank transfer
        $vaPayload = [
            'reference' => $alphaRef,
            'customer_id' => $customerId,
            'expiry' => 3600,
            'amount' => $amount,
            'currency' => 'NGN',
            'account_type' => 'dynamic',
            'meta' => array_merge($metadata, [
                'platform' => 'HambakTech Enterprise',
                'service' => 'Wallet Funding',
                'wallet_reference' => $reference,
            ]),
        ];

        $vaRes = $this->requestV4('/virtual-accounts', 'POST', $vaPayload, $alphaRef);
        if ($vaRes['ok'] && is_array($vaRes['data'])) {
            $va = $vaRes['data'];
            $accNum = (string)($va['account_number'] ?? ($va['virtual_account']['account_number'] ?? ''));
            if ($accNum !== '') {
                $transferDetails = [
                    'account_number' => $accNum,
                    'bank_name' => (string)($va['account_bank_name'] ?? ($va['bank_name'] ?? 'Wema Bank')),
                    'account_name' => (string)($va['account_name'] ?? ($fullName . ' / HAMBAKTECH')),
                    'amount' => (float)($va['amount'] ?? $amount),
                    'currency' => (string)($va['currency'] ?? 'NGN'),
                    'expires_at' => (string)($va['account_expiration_datetime'] ?? ($va['expiry_datetime'] ?? '')),
                    'note' => (string)($va['note'] ?? 'Transfer the exact amount to this temporary account to fund your wallet automatically.'),
                    'reference' => $reference,
                    'flw_reference' => (string)($va['reference'] ?? $alphaRef),
                    'flw_va_id' => (string)($va['id'] ?? ''),
                ];
                return [
                    'authorization_url' => '',
                    'link' => '',
                    'reference' => $reference,
                    'tx_ref' => $reference,
                    'flw_charge_id' => (string)($va['id'] ?? ''),
                    'flw_va_id' => (string)($va['id'] ?? ''),
                    'transfer_details' => $transferDetails,
                    'amount' => $amount,
                ];
            }
        }

        $parsed = $vaRes['parsed'] ?? [];
        $statusCode = (int)($vaRes['status_code'] ?? 0);
        $errDetail = '';
        if (is_array($parsed)) {
            $errDetail = (string)($parsed['error']['message'] ?? $parsed['message'] ?? '');
            if (!empty($parsed['error']['validation_errors']) && is_array($parsed['error']['validation_errors'])) {
                $parts = [];
                foreach ($parsed['error']['validation_errors'] as $ve) {
                    if (is_array($ve) && (!empty($ve['field_name']) || !empty($ve['message']))) {
                        $parts[] = trim(($ve['field_name'] ?? '') . ' ' . ($ve['message'] ?? ''));
                    }
                }
                if (!empty($parts)) {
                    $errDetail .= ($errDetail !== '' ? ' — ' : '') . implode('; ', $parts);
                }
            }
        }
        if ($errDetail === '') {
            $errDetail = "Flutterwave v4 virtual account creation failed (HTTP {$statusCode})";
        }
        throw new RuntimeException("Flutterwave v4 Bank Transfer Error: {$errDetail}");
    }

    private function findOrCreateV4Customer(string $email, string $firstName, string $lastName, string $phone): string
    {
        $lookup = $this->requestV4('/customers?email=' . rawurlencode($email), 'GET', null, '');
        if ($lookup['ok'] && is_array($lookup['data'])) {
            $rows = isset($lookup['data'][0]) ? $lookup['data'] : (isset($lookup['data']['id']) ? [$lookup['data']] : []);
            foreach ($rows as $cust) {
                if (is_array($cust) && !empty($cust['id']) && strtolower((string)($cust['email'] ?? '')) === strtolower($email)) {
                    return (string)$cust['id'];
                }
            }
        }

        $phoneClean = preg_replace('/\D/', '', $phone) ?: '8000000000';
        if (strlen($phoneClean) < 7) {
            $phoneClean = '8000000000';
        }

        $create = $this->requestV4('/customers', 'POST', [
            'email' => $email,
            'name' => ['first' => $firstName, 'last' => $lastName],
            'phone' => ['country_code' => '234', 'number' => $phoneClean],
        ], 'cust_' . md5(strtolower($email) . '_' . $phoneClean));

        if ($create['ok'] && !empty($create['data']['id'])) {
            return (string)$create['data']['id'];
        }

        // Re-check customer lookup in case of concurrent creation or existing record
        $reLookup = $this->requestV4('/customers?email=' . rawurlencode($email), 'GET', null, '');
        if ($reLookup['ok'] && is_array($reLookup['data'])) {
            $rows = isset($reLookup['data'][0]) ? $reLookup['data'] : (isset($reLookup['data']['id']) ? [$reLookup['data']] : []);
            foreach ($rows as $cust) {
                if (is_array($cust) && !empty($cust['id']) && strtolower((string)($cust['email'] ?? '')) === strtolower($email)) {
                    return (string)$cust['id'];
                }
            }
        }

        $parsed = $create['parsed'] ?? [];
        $code = (int)($create['status_code'] ?? 0);
        $msg = is_array($parsed)
            ? (string)($parsed['error']['message'] ?? $parsed['message'] ?? "Unable to register Flutterwave v4 customer (HTTP {$code})")
            : "Unable to register Flutterwave v4 customer (HTTP {$code})";
        throw new RuntimeException("Flutterwave v4 Customer Error: {$msg}");
    }

    private function requestV4(string $endpoint, string $method, ?array $payload, string $idempotencyKey): array
    {
        $headers = $this->getAuthHeaders($idempotencyKey);
        $ch = curl_init("{$this->baseUrl}{$endpoint}");
        $startTime = microtime(true);

        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ];
        if (strtoupper($method) === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($payload ?? []);
        }
        curl_setopt_array($ch, $opts);

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($rawResponse === false) {
            throw new RuntimeException("Flutterwave v4 communication error: {$curlError}");
        }

        $parsed = json_decode((string)$rawResponse, true);
        $this->logCall($endpoint, $method, $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $idempotencyKey ?: null);

        $ok = ($statusCode >= 200 && $statusCode < 300 && is_array($parsed) && (($parsed['status'] ?? '') === 'success'));
        return [
            'ok' => $ok,
            'status_code' => $statusCode,
            'data' => $parsed['data'] ?? null,
            'parsed' => $parsed,
        ];
    }

    /**
     * 2. Verify Flutterwave Transaction
     */
    public function verifyPayment(string $reference, ?string $transactionId = null): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Flutterwave Secret Key is not configured.');
        }

        if ($this->isV4Credentials()) {
            return $this->verifyPaymentV4($reference, $transactionId);
        }

        if (!empty($transactionId)) {
            $url = "{$this->baseUrl}/transactions/" . rawurlencode($transactionId) . "/verify";
        } else {
            $url = "{$this->baseUrl}/transactions/verify_by_reference?tx_ref=" . rawurlencode($reference);
        }

        $ch = curl_init($url);
        $startTime = microtime(true);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = json_decode((string)$rawResponse, true);
        $this->logCall($url, 'GET', $statusCode, ['reference' => $reference, 'id' => $transactionId], $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("Flutterwave verification network error: {$curlError}");
        }

        if ($statusCode !== 200 || empty($parsed['status']) || empty($parsed['data'])) {
            $msg = $parsed['message'] ?? "Flutterwave verification error (HTTP {$statusCode})";
            return [
                'status' => 'failed',
                'amount' => 0.00,
                'reference' => $reference,
                'gateway_response' => $msg,
                'raw' => $parsed,
            ];
        }

        $data = $parsed['data'];
        $nairaAmount = (float)($data['amount'] ?? 0.00);
        $isSuccess = (($data['status'] ?? '') === 'successful');

        return [
            'status' => $isSuccess ? 'successful' : ($data['status'] ?? 'failed'),
            'amount' => $nairaAmount,
            'currency' => $data['currency'] ?? 'NGN',
            'reference' => $data['tx_ref'] ?? $reference,
            'flw_id' => $data['id'] ?? null,
            'paid_at' => $data['created_at'] ?? null,
            'channel' => $data['payment_type'] ?? 'card',
            'customer_email' => $data['customer']['email'] ?? '',
            'gateway_response' => $data['processor_response'] ?? ($data['narration'] ?? 'Approved'),
            'raw' => $data,
        ];
    }

    private function verifyPaymentV4(string $reference, ?string $transactionId = null): array
    {
        $alphaRef = preg_replace('/[^A-Za-z0-9]/', '', $reference) ?: $reference;
        $chargeCandidates = [];
        if (!empty($transactionId)) {
            $chargeCandidates[] = '/charges/' . rawurlencode($transactionId);
        }
        $chargeCandidates[] = '/charges?reference=' . rawurlencode($reference);
        if ($alphaRef !== $reference) {
            $chargeCandidates[] = '/charges?reference=' . rawurlencode($alphaRef);
        }

        $data = null;
        $lastParsed = null;
        $lastCode = 0;

        foreach ($chargeCandidates as $ep) {
            $res = $this->requestV4($ep, 'GET', null, '');
            $lastCode = $res['status_code'];
            $lastParsed = $res['parsed'];
            if (!$res['ok'] || empty($res['data'])) {
                continue;
            }
            $rowSet = $res['data'];
            if (is_array($rowSet) && isset($rowSet[0]) && is_array($rowSet[0])) {
                foreach ($rowSet as $row) {
                    if (
                        ($row['reference'] ?? '') === $reference ||
                        ($row['reference'] ?? '') === $alphaRef ||
                        (!empty($transactionId) && ($row['id'] ?? '') === $transactionId)
                    ) {
                        $data = $row;
                        break 2;
                    }
                }
                $data = $rowSet[0];
                break;
            } elseif (is_array($rowSet) && isset($rowSet['status'])) {
                $data = $rowSet;
                break;
            }
        }

        // Only confirmed /charges responses may mark a transaction as successful.
        if (!is_array($data) || empty($data)) {
            $vaRes = $this->requestV4('/virtual-accounts?reference=' . rawurlencode($alphaRef), 'GET', null, '');
            $vaState = 'pending';
            $vaMsg = is_array($lastParsed)
                ? ($lastParsed['message'] ?? "Awaiting bank transfer confirmation (HTTP {$lastCode})")
                : "Awaiting bank transfer confirmation";
            if ($vaRes['ok'] && is_array($vaRes['data'])) {
                $vaRows = isset($vaRes['data'][0]) ? $vaRes['data'] : [$vaRes['data']];
                $vaRow = is_array($vaRows[0] ?? null) ? $vaRows[0] : [];
                $vaStatusLower = strtolower((string)($vaRow['status'] ?? ''));
                if ($vaStatusLower === 'active') {
                    $vaMsg = 'Virtual account active — awaiting incoming bank transfer settlement.';
                } elseif ($vaStatusLower === 'inactive') {
                    $vaState = 'pending';
                    $vaMsg = 'Temporary transfer window closed or awaiting settlement confirmation.';
                }
            }
            return [
                'status' => $vaState,
                'amount' => 0.00,
                'reference' => $reference,
                'gateway_response' => $vaMsg,
                'raw' => $lastParsed,
            ];
        }

        $chargeStatus = strtolower((string)($data['status'] ?? ''));
        $isSuccess = in_array($chargeStatus, ['succeeded', 'successful', 'completed', 'paid'], true);
        $isPending = in_array($chargeStatus, ['pending', 'awaiting_payment', 'ongoing', 'processing', ''], true);

        return [
            'status' => $isSuccess ? 'successful' : ($isPending ? 'pending' : $chargeStatus),
            'amount' => (float)($data['amount'] ?? 0.00),
            'currency' => strtoupper((string)($data['currency'] ?? 'NGN')),
            'reference' => (string)($data['meta']['wallet_reference'] ?? ($data['reference'] ?? $reference)),
            'flw_id' => $data['id'] ?? null,
            'paid_at' => $data['created_datetime'] ?? ($data['created_at'] ?? null),
            'channel' => $data['payment_method']['type'] ?? 'bank_transfer',
            'customer_email' => $data['customer']['email'] ?? '',
            'gateway_response' => (string)($data['processor_response']['message'] ?? ($data['status'] ?? 'Pending')),
            'raw' => $data,
        ];
    }

    /**
     * 3. Validate Webhook Signature
     * Supports both Flutterwave v4 `flutterwave-signature` (base64 HMAC-SHA256) and v3 `verif-hash`.
     */
    public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool
    {
        if (empty($signatureHeader)) {
            return false;
        }

        $candidateSecrets = array_values(array_filter([
            $this->secretHash,
            $this->secretKey,
        ], static fn($s) => $s !== ''));

        foreach ($candidateSecrets as $secret) {
            if (hash_equals($secret, $signatureHeader)) {
                return true;
            }
            $expectedBase64 = base64_encode(hash_hmac('sha256', $rawBody, $secret, true));
            if (hash_equals($expectedBase64, $signatureHeader)) {
                return true;
            }
            $expectedHex = hash_hmac('sha256', $rawBody, $secret);
            if (hash_equals($expectedHex, strtolower($signatureHeader))) {
                return true;
            }
        }

        return false;
    }

    /**
     * 4. Check Account Status & Credentials Health
     */
    public function testConnection(): array
    {
        if (empty($this->secretKey)) {
            return [
                'status' => 'unconfigured',
                'message' => 'Flutterwave Secret Key has not been provided',
                'operational' => false,
                'latency_ms' => 0,
            ];
        }

        $start = microtime(true);
        if ($this->isV4Credentials()) {
            $headers = $this->getAuthHeaders();
            $ch = curl_init("{$this->baseUrl}/wallets/balances");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => true,
            ]);

            $rawResponse = curl_exec($ch);
            $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);
            $latencyMs = (int)round((microtime(true) - $start) * 1000);

            $parsed = json_decode((string)$rawResponse, true);
            if ($rawResponse !== false && $statusCode === 200 && ($parsed['status'] ?? '') === 'success') {
                $ngnBal = 0.00;
                foreach ((array)($parsed['data'] ?? []) as $balItem) {
                    if (strtoupper((string)($balItem['currency'] ?? '')) === 'NGN') {
                        $ngnBal = (float)($balItem['available_balance'] ?? 0.00);
                        break;
                    }
                }
                return [
                    'status' => 'operational',
                    'message' => "Flutterwave v4 OAuth2 live connection verified ({$latencyMs}ms).",
                    'operational' => true,
                    'balance' => $ngnBal,
                    'latency_ms' => $latencyMs,
                    'data' => $parsed['data'] ?? [],
                ];
            }

            $msg = is_array($parsed) ? ($parsed['message'] ?? $parsed['error']['message'] ?? "HTTP {$statusCode}") : ($err ?: "HTTP {$statusCode}");
            return [
                'status' => 'error',
                'message' => "Flutterwave v4 error: {$msg}",
                'operational' => false,
                'latency_ms' => $latencyMs,
            ];
        }

        $ch = curl_init("{$this->baseUrl}/balances");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $this->getAuthHeaders(),
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $rawResponse = curl_exec($ch);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $latencyMs = (int)round((microtime(true) - $start) * 1000);

        $parsed = json_decode((string)$rawResponse, true);

        if ($rawResponse !== false && $statusCode === 200 && ($parsed['status'] ?? '') === 'success') {
            $ngnBal = null;
            foreach ((array)($parsed['data'] ?? []) as $balItem) {
                if (strtoupper((string)($balItem['currency'] ?? '')) === 'NGN') {
                    $ngnBal = (float)($balItem['available_balance'] ?? 0.00);
                    break;
                }
            }
            return [
                'status' => 'operational',
                'message' => "Flutterwave live connection verified and balances operational ({$latencyMs}ms).",
                'operational' => true,
                'balance' => $ngnBal,
                'latency_ms' => $latencyMs,
                'data' => $parsed['data'] ?? [],
            ];
        }

        $msg = is_array($parsed) ? ($parsed['message'] ?? "HTTP {$statusCode}") : ($err ?: "HTTP {$statusCode}");
        return [
            'status' => 'restricted',
            'message' => "Flutterwave reported: {$msg}",
            'operational' => false,
            'latency_ms' => $latencyMs,
        ];
    }

    private function logCall(string $endpoint, string $method, int $code, $req, $res, int $lat, ?string $ref): void
    {
        try {
            $this->db->execute(
                'INSERT INTO provider_logs (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES (:id, "flutterwave", :ep, :m, :code, :req, :res, :lat, :ref, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'ep' => $endpoint,
                    'm' => $method,
                    'code' => $code,
                    'req' => is_string($req) ? $req : json_encode($req),
                    'res' => is_string($res) ? $res : json_encode($res),
                    'lat' => $lat,
                    'ref' => $ref,
                ]
            );
        } catch (\Throwable) {
        }
    }
}
