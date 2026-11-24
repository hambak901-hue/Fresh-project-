<?php
/**
 * @file PaystackAdapter.php
 * Official Paystack Automated Checkout & Webhook Settlement Gateway
 * Production Target: PHP 8.2+ / MySQL 8.x
 *
 * Documentation: https://paystack.com/docs/
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Payment;

use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class PaystackAdapter implements PaymentGatewayInterface
{
    private string $secretKey;
    private string $publicKey;
    private string $baseUrl;
    private int $timeout;
    private Database $db;

    public function __construct(string $secretKey = '', string $publicKey = '', string $baseUrl = 'https://api.paystack.co', int $timeout = 30)
    {
        $this->db = Database::getInstance();
        $config = file_exists(__DIR__ . '/../../config/config.php') ? require __DIR__ . '/../../config/config.php' : [];
        $providerConfig = $config['providers']['paystack'] ?? [];

        $dbProvider = null;
        try {
            $dbProvider = $this->db->fetchOne('SELECT secret_key, public_key, api_key, base_url, timeout_seconds FROM providers WHERE id = "paystack"');
        } catch (\Throwable) {}

        $this->baseUrl = rtrim($baseUrl ?: ($dbProvider['base_url'] ?? ($providerConfig['base_url'] ?? 'https://api.paystack.co')), '/');
        $this->secretKey = $secretKey ?: (getenv('PAYSTACK_SECRET_KEY') ?: (!empty($dbProvider['secret_key']) ? $dbProvider['secret_key'] : (!empty($dbProvider['api_key']) ? $dbProvider['api_key'] : ($providerConfig['secret_key'] ?? ''))));
        $this->publicKey = $publicKey ?: (getenv('PAYSTACK_PUBLIC_KEY') ?: (!empty($dbProvider['public_key']) ? $dbProvider['public_key'] : ($providerConfig['public_key'] ?? '')));
        $this->timeout = $timeout ?: ((int)($dbProvider['timeout_seconds'] ?? 30));
    }

    public function getName(): string
    {
        return 'Paystack Merchant Checkout';
    }

    public function getId(): string
    {
        return 'paystack';
    }

    public function getStatus(): string
    {
        return !empty($this->secretKey) ? 'active' : 'unconfigured';
    }

    public function hasSecretKey(): bool
    {
        return !empty($this->secretKey);
    }

    /**
     * Generic authenticated Paystack API HTTP helper with sanitized provider audit logging.
     *
     * @return array{ok: bool, status_code: int, message: string, data: mixed, raw: mixed}
     */
    private function apiRequest(string $method, string $path, ?array $payload = null, ?string $ref = null): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Paystack Secret Key is not configured.');
        }

        $cleanPath = '/' . ltrim($path, '/');
        $url = "{$this->baseUrl}{$cleanPath}";
        $ch = curl_init($url);
        $startTime = microtime(true);

        $headers = [
            "Authorization: Bearer {$this->secretKey}",
            'Accept: application/json',
        ];

        $upperMethod = strtoupper($method);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ];

        if ($upperMethod === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($payload ?? []);
            $headers[] = 'Content-Type: application/json';
        } elseif ($upperMethod !== 'GET') {
            $opts[CURLOPT_CUSTOMREQUEST] = $upperMethod;
            if ($payload !== null) {
                $opts[CURLOPT_POSTFIELDS] = json_encode($payload);
                $headers[] = 'Content-Type: application/json';
            }
        }

        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = json_decode((string)$rawResponse, true);
        $logPayload = $payload ?? [];
        if (isset($logPayload['bvn'])) {
            $logPayload['bvn'] = '***REDACTED***';
        }
        if (isset($logPayload['account_number']) && strlen((string)$logPayload['account_number']) > 4) {
            $logPayload['account_number'] = '******' . substr((string)$logPayload['account_number'], -4);
        }
        $this->logCall($cleanPath, $upperMethod, $statusCode, $logPayload, $parsed ?: $rawResponse, $latencyMs, $ref);

        if ($rawResponse === false) {
            throw new RuntimeException("Paystack communication failure: {$curlError}");
        }

        $ok = ($statusCode >= 200 && $statusCode < 300) && !empty($parsed['status']);
        $message = is_array($parsed)
            ? (string)($parsed['message'] ?? ($ok ? 'OK' : "Paystack HTTP {$statusCode}"))
            : "Paystack HTTP {$statusCode}";

        return [
            'ok' => $ok,
            'status_code' => $statusCode,
            'message' => $message,
            'data' => is_array($parsed) ? ($parsed['data'] ?? null) : null,
            'raw' => $parsed,
        ];
    }

    /**
     * Check whether this Paystack business account has Dedicated Virtual Accounts (DVA) enabled
     * and fetch available bank providers via GET /dedicated_account/available_providers.
     */
    public function checkDvaCapability(): array
    {
        if (empty($this->secretKey)) {
            return [
                'configured' => false,
                'capable' => false,
                'reason' => 'missing_secret_key',
                'message' => 'PAYSTACK_SECRET_KEY is not configured in this environment.',
                'providers' => [],
            ];
        }

        try {
            $res = $this->apiRequest('GET', '/dedicated_account/available_providers', null, 'DVA_CAPABILITY_CHECK');
            $providers = is_array($res['data']) ? $res['data'] : [];
            $capable = $res['ok'] && count($providers) > 0;

            return [
                'configured' => true,
                'capable' => $capable,
                'status_code' => $res['status_code'],
                'reason' => $capable ? 'enabled' : ($res['ok'] ? 'no_providers_returned' : 'paystack_feature_disabled'),
                'message' => $res['message'],
                'providers' => $providers,
            ];
        } catch (\Throwable $e) {
            return [
                'configured' => true,
                'capable' => false,
                'reason' => 'api_error',
                'message' => $e->getMessage(),
                'providers' => [],
            ];
        }
    }

    /**
     * Fetch a Paystack customer record by email or customer code (GET /customer/{email_or_code}).
     */
    public function fetchCustomer(string $emailOrCode): ?array
    {
        $res = $this->apiRequest('GET', '/customer/' . rawurlencode(trim($emailOrCode)), null, $emailOrCode);
        if ($res['ok'] && is_array($res['data'])) {
            return $res['data'];
        }
        return null;
    }

    /**
     * Create or fetch an existing Paystack Customer (POST /customer -> fallback GET /customer/{email}).
     */
    public function createOrFetchCustomer(array $userData): array
    {
        $email = strtolower(trim((string)($userData['email'] ?? '')));
        if ($email === '') {
            throw new RuntimeException('Customer email is required for Paystack customer creation.');
        }

        $payload = array_filter([
            'email' => $email,
            'first_name' => trim((string)($userData['first_name'] ?? 'Customer')) ?: 'Customer',
            'last_name' => trim((string)($userData['last_name'] ?? 'User')) ?: 'User',
            'phone' => trim((string)($userData['phone'] ?? '')),
            'metadata' => $userData['metadata'] ?? null,
        ], static fn($v) => $v !== null && $v !== '');

        $res = $this->apiRequest('POST', '/customer', $payload, $userData['reference'] ?? $email);
        if ($res['ok'] && is_array($res['data']) && !empty($res['data']['customer_code'])) {
            return [
                'ok' => true,
                'customer' => $res['data'],
                'message' => $res['message'],
            ];
        }

        // If already exists or update needed, fetch by email
        $existing = $this->fetchCustomer($email);
        if ($existing && !empty($existing['customer_code'])) {
            return [
                'ok' => true,
                'customer' => $existing,
                'message' => 'Existing Paystack customer fetched.',
            ];
        }

        return [
            'ok' => false,
            'customer' => null,
            'status_code' => $res['status_code'],
            'message' => $res['message'],
        ];
    }

    /**
     * Update an existing Paystack Customer (PUT /customer/{code}).
     */
    public function updateCustomer(string $customerCode, array $userData): array
    {
        $payload = array_filter([
            'first_name' => isset($userData['first_name']) ? trim((string)$userData['first_name']) : null,
            'last_name' => isset($userData['last_name']) ? trim((string)$userData['last_name']) : null,
            'phone' => isset($userData['phone']) ? trim((string)$userData['phone']) : null,
            'metadata' => $userData['metadata'] ?? null,
        ], static fn($v) => $v !== null && $v !== '');

        return $this->apiRequest('PUT', '/customer/' . rawurlencode(trim($customerCode)), $payload, $customerCode);
    }

    /**
     * Fetch supported Nigerian banks from Paystack (GET /bank?country=nigeria).
     */
    public function listBanks(string $country = 'nigeria'): array
    {
        $res = $this->apiRequest('GET', '/bank?country=' . rawurlencode($country) . '&perPage=100', null, 'PAYSTACK_BANKS');
        return [
            'ok' => $res['ok'],
            'banks' => is_array($res['data']) ? $res['data'] : [],
            'message' => $res['message'],
        ];
    }

    /**
     * Validate Customer Identification with Paystack (POST /customer/{code}/identification).
     * Official documented fields: country, type ('bank_account'), account_number, bvn, bank_code, first_name, last_name.
     */
    public function validateCustomerIdentification(string $customerCode, array $kycData): array
    {
        $payload = array_filter([
            'country' => 'NG',
            'type' => (string)($kycData['type'] ?? 'bank_account'),
            'account_number' => !empty($kycData['account_number']) ? preg_replace('/\D/', '', (string)$kycData['account_number']) : null,
            'bvn' => !empty($kycData['bvn']) ? preg_replace('/\D/', '', (string)$kycData['bvn']) : null,
            'bank_code' => !empty($kycData['bank_code']) ? trim((string)$kycData['bank_code']) : null,
            'first_name' => !empty($kycData['first_name']) ? trim((string)$kycData['first_name']) : null,
            'last_name' => !empty($kycData['last_name']) ? trim((string)$kycData['last_name']) : null,
        ], static fn($v) => $v !== null && $v !== '');

        return $this->apiRequest(
            'POST',
            '/customer/' . rawurlencode($customerCode) . '/identification',
            $payload,
            $customerCode
        );
    }

    /**
     * Official Paystack Single-Step Dedicated Virtual Account Assignment (POST /dedicated_account/assign).
     * Creates/identifies the customer and queues DVA assignment asynchronously (notified via webhook).
     */
    public function assignDedicatedVirtualAccount(array $payload): array
    {
        $clean = array_filter([
            'email' => strtolower(trim((string)($payload['email'] ?? ''))),
            'first_name' => trim((string)($payload['first_name'] ?? '')),
            'last_name' => trim((string)($payload['last_name'] ?? '')),
            'phone' => trim((string)($payload['phone'] ?? '')),
            'preferred_bank' => trim((string)($payload['preferred_bank'] ?? 'wema-bank')),
            'country' => 'NG',
            'account_number' => !empty($payload['account_number']) ? trim((string)$payload['account_number']) : null,
            'bvn' => !empty($payload['bvn']) ? preg_replace('/\D/', '', (string)$payload['bvn']) : null,
            'bank_code' => !empty($payload['bank_code']) ? trim((string)$payload['bank_code']) : null,
            'subaccount' => !empty($payload['subaccount']) ? trim((string)$payload['subaccount']) : null,
            'split_code' => !empty($payload['split_code']) ? trim((string)$payload['split_code']) : null,
        ], static fn($v) => $v !== null && $v !== '');

        return $this->apiRequest(
            'POST',
            '/dedicated_account/assign',
            $clean,
            $clean['email'] ?? null
        );
    }

    /**
     * Two-Step Create Dedicated Virtual Account for an identified customer (POST /dedicated_account).
     */
    public function createDedicatedAccount(string $customerCode, ?string $preferredBank = null): array
    {
        $payload = array_filter([
            'customer' => trim($customerCode),
            'preferred_bank' => $preferredBank ? trim($preferredBank) : null,
        ], static fn($v) => $v !== null && $v !== '');

        return $this->apiRequest('POST', '/dedicated_account', $payload, $customerCode);
    }

    /**
     * Fetch Dedicated Accounts assigned to a Paystack customer (GET /dedicated_account?customer=ID or GET /customer/CODE).
     */
    public function fetchDedicatedAccountsByCustomer(string $customerIdOrCode, ?int $customerNumericId = null): array
    {
        $customerData = null;
        if (str_starts_with($customerIdOrCode, 'CUS_') || str_contains($customerIdOrCode, '@')) {
            $customerData = $this->fetchCustomer($customerIdOrCode);
            if ($customerData && !empty($customerData['id'])) {
                $customerNumericId = (int)$customerData['id'];
            }
        } elseif (is_numeric($customerIdOrCode)) {
            $customerNumericId = (int)$customerIdOrCode;
        }

        if ($customerNumericId && $customerNumericId > 0) {
            $res = $this->apiRequest('GET', '/dedicated_account?customer=' . $customerNumericId . '&active=true', null, (string)$customerNumericId);
            if ($res['ok'] && is_array($res['data'])) {
                return [
                    'ok' => true,
                    'customer' => $customerData,
                    'accounts' => $res['data'],
                    'message' => $res['message'],
                ];
            }
        }

        $fallbackAccounts = [];
        if (is_array($customerData)) {
            if (!empty($customerData['dedicated_accounts']) && is_array($customerData['dedicated_accounts'])) {
                $fallbackAccounts = $customerData['dedicated_accounts'];
            } elseif (!empty($customerData['dedicated_account']) && is_array($customerData['dedicated_account'])) {
                $fallbackAccounts = [$customerData['dedicated_account']];
            }
        }

        return [
            'ok' => $customerData !== null,
            'customer' => $customerData,
            'accounts' => $fallbackAccounts,
            'message' => $customerData ? 'Customer fetched.' : 'Customer not found on Paystack.',
        ];
    }

    /**
     * Fetch single dedicated account by Paystack numeric ID (GET /dedicated_account/{id}).
     */
    public function fetchDedicatedAccount(int $dedicatedAccountId): array
    {
        return $this->apiRequest('GET', '/dedicated_account/' . $dedicatedAccountId, null, (string)$dedicatedAccountId);
    }

    /**
     * Requery a Dedicated Virtual Account for pending bank transfer notifications (GET /dedicated_account/requery).
     */
    public function requeryDedicatedAccount(string $accountNumber, string $providerSlug, ?string $date = null): array
    {
        $params = [
            'account_number' => trim($accountNumber),
            'provider_slug' => trim($providerSlug),
        ];
        if ($date && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $params['date'] = $date;
        }
        $qs = http_build_query($params);
        return $this->apiRequest('GET', '/dedicated_account/requery?' . $qs, null, $accountNumber);
    }

    /**
     * Deactivate a Dedicated Virtual Account (DELETE /dedicated_account/{id}).
     */
    public function deactivateDedicatedAccount(int $dedicatedAccountId): array
    {
        return $this->apiRequest('DELETE', '/dedicated_account/' . $dedicatedAccountId, null, (string)$dedicatedAccountId);
    }

    /**
     * Initialize Paystack Checkout Transaction
     * POST https://api.paystack.co/transaction/initialize
     * Amount in kobo (NGN * 100)
     */
    public function initializePayment(string $email, float $amount, string $reference, string $callbackUrl, array $metadata = []): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Paystack Secret Key is not configured. Please supply PAYSTACK_SECRET_KEY in Admin > Payment Settings.');
        }

        $amountInKobo = (int)round($amount * 100);
        $payload = [
            'email' => $email,
            'amount' => $amountInKobo,
            'reference' => $reference,
            'callback_url' => $callbackUrl,
            'currency' => 'NGN',
            'metadata' => array_merge($metadata, [
                'custom_fields' => [
                    [
                        'display_name' => 'Service',
                        'variable_name' => 'service',
                        'value' => 'HambakTech Wallet Top-Up',
                    ]
                ]
            ]),
        ];

        $ch = curl_init("{$this->baseUrl}/transaction/initialize");
        $startTime = microtime(true);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer {$this->secretKey}",
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = json_decode((string)$rawResponse, true);

        // Audit log in provider_logs
        $this->logCall('/transaction/initialize', 'POST', $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("Paystack communication failure: {$curlError}");
        }

        if ($statusCode !== 200 || empty($parsed['status']) || empty($parsed['data']['authorization_url'])) {
            $msg = $parsed['message'] ?? "Paystack initialization error (HTTP {$statusCode})";
            throw new RuntimeException("Paystack Error: {$msg}");
        }

        return [
            'authorization_url' => $parsed['data']['authorization_url'],
            'access_code' => $parsed['data']['access_code'] ?? null,
            'reference' => $reference,
            'amount' => $amount,
        ];
    }

    /**
     * Verify Paystack Transaction
     * GET https://api.paystack.co/transaction/verify/{reference}
     */
    public function verifyPayment(string $reference, ?string $transactionId = null): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Paystack Secret Key is not configured.');
        }

        $url = "{$this->baseUrl}/transaction/verify/" . rawurlencode($reference);
        $ch = curl_init($url);
        $startTime = microtime(true);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer {$this->secretKey}",
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $rawResponse = curl_exec($ch);
        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $parsed = json_decode((string)$rawResponse, true);

        // Audit log in provider_logs
        $this->logCall('/transaction/verify', 'GET', $statusCode, ['reference' => $reference], $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("Paystack verification communication failure: {$curlError}");
        }

        if ($statusCode === 429 || $statusCode >= 500 || $statusCode === 0) {
            $msg = is_array($parsed) ? ($parsed['message'] ?? "Temporary Paystack gateway issue (HTTP {$statusCode})") : "Temporary Paystack gateway issue (HTTP {$statusCode})";
            return [
                'status' => 'pending',
                'amount' => 0.00,
                'fee' => 0.00,
                'fee_confirmed' => false,
                'reference' => $reference,
                'gateway_response' => $msg,
                'raw' => $parsed,
            ];
        }

        if ($statusCode !== 200 || empty($parsed['status']) || empty($parsed['data'])) {
            $msg = is_array($parsed) ? ($parsed['message'] ?? "Paystack verification error (HTTP {$statusCode})") : "Paystack verification error (HTTP {$statusCode})";
            $isUninitiatedOrPending = $statusCode === 400 && (
                stripos((string)$msg, 'not found') !== false ||
                stripos((string)$msg, 'does not exist') !== false
            );
            return [
                'status' => $isUninitiatedOrPending ? 'abandoned' : 'failed',
                'amount' => 0.00,
                'fee' => 0.00,
                'fee_confirmed' => false,
                'reference' => $reference,
                'gateway_response' => $msg,
                'raw' => $parsed,
            ];
        }

        $data = $parsed['data'];
        $nairaAmount = round(((float)($data['amount'] ?? 0)) / 100, 2);
        $feeConfirmed = array_key_exists('fees', $data) && $data['fees'] !== null && is_numeric($data['fees']);
        $feeNaira = $feeConfirmed ? max(0.0, round(((float)$data['fees']) / 100, 2)) : 0.00;
        $isSuccess = (strtolower((string)($data['status'] ?? '')) === 'success');

        return [
            'id' => isset($data['id']) ? (int)$data['id'] : null,
            'status' => $isSuccess ? 'successful' : strtolower((string)($data['status'] ?? 'failed')),
            'amount' => $nairaAmount,
            'fee' => $feeNaira,
            'fee_confirmed' => $feeConfirmed,
            'currency' => strtoupper((string)($data['currency'] ?? 'NGN')),
            'reference' => $data['reference'] ?? $reference,
            'paid_at' => $data['paid_at'] ?? null,
            'channel' => strtolower((string)($data['channel'] ?? 'card')),
            'customer_email' => $data['customer']['email'] ?? '',
            'customer' => is_array($data['customer'] ?? null) ? $data['customer'] : [],
            'authorization' => is_array($data['authorization'] ?? null) ? $data['authorization'] : [],
            'metadata' => is_array($data['metadata'] ?? null) ? $data['metadata'] : [],
            'gateway_response' => $data['gateway_response'] ?? 'Approved',
            'raw' => $data,
        ];
    }

    /**
     * Validate Webhook Signature using HMAC-SHA512
     */
    public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool
    {
        $cleanSig = strtolower(trim($signatureHeader));
        if ($cleanSig === '' || empty($this->secretKey)) {
            return false;
        }

        $calculated = hash_hmac('sha512', $rawBody, $this->secretKey);
        return hash_equals($calculated, $cleanSig);
    }

    private function logCall(string $endpoint, string $method, int $code, $req, $res, int $lat, ?string $ref): void
    {
        try {
            $this->db->execute(
                'INSERT INTO provider_logs (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES (:id, "paystack", :ep, :m, :code, :req, :res, :lat, :ref, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'ep' => Security::sanitizeProviderUrl($endpoint),
                    'm' => $method,
                    'code' => $code,
                    'req' => Security::sanitizeProviderLogPayload($req, 4000),
                    'res' => Security::sanitizeProviderLogPayload($res, 4000),
                    'lat' => $lat,
                    'ref' => $ref,
                ]
            );
        } catch (\Throwable) {}
    }
}
