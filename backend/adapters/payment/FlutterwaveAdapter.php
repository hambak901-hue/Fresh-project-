<?php
/**
 * @file FlutterwaveAdapter.php
 * Official Flutterwave Production Payment Gateway Adapter
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
    private string $secretKey;
    private string $publicKey;
    private string $encryptionKey;
    private string $secretHash;
    private string $baseUrl;
    private int $timeout;
    private Database $db;

    public function __construct(
        string $secretKey = '',
        string $publicKey = '',
        string $encryptionKey = '',
        string $baseUrl = 'https://api.flutterwave.com/v3',
        int $timeout = 30
    ) {
        $this->db = Database::getInstance();
        $config = file_exists(__DIR__ . '/../../config/config.php') ? require __DIR__ . '/../../config/config.php' : [];
        $providerConfig = $config['providers']['flutterwave'] ?? [];

        $dbProvider = null;
        try {
            $dbProvider = $this->db->fetchOne('SELECT secret_key, public_key, api_key, base_url, timeout_seconds FROM providers WHERE id = "flutterwave"');
        } catch (\Throwable) {}

        $this->baseUrl = rtrim($baseUrl ?: ($dbProvider['base_url'] ?? ($providerConfig['base_url'] ?? 'https://api.flutterwave.com/v3')), '/');
        $this->secretKey = $secretKey ?: (getenv('FLUTTERWAVE_SECRET_KEY') ?: (!empty($dbProvider['secret_key']) ? $dbProvider['secret_key'] : (!empty($dbProvider['api_key']) ? $dbProvider['api_key'] : ($providerConfig['secret_key'] ?? ''))));
        $this->publicKey = $publicKey ?: (getenv('FLUTTERWAVE_PUBLIC_KEY') ?: (!empty($dbProvider['public_key']) ? $dbProvider['public_key'] : ($providerConfig['public_key'] ?? '')));
        $this->encryptionKey = $encryptionKey ?: (getenv('FLUTTERWAVE_ENCRYPTION_KEY') ?: ($providerConfig['encryption_key'] ?? ''));
        $this->secretHash = getenv('FLW_SECRET_HASH') ?: ($providerConfig['secret_hash'] ?? 'HambakTech_FLW_Webhook_Secure_Key');
        $this->timeout = $timeout ?: ((int)($dbProvider['timeout_seconds'] ?? 30));
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

    /**
     * 1. Initialize Standard Flutterwave Hosted Checkout
     * POST https://api.flutterwave.com/v3/payments
     */
    public function initializePayment(string $email, float $amount, string $reference, string $callbackUrl, array $metadata = []): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Flutterwave Secret Key is not configured. Please supply FLUTTERWAVE_SECRET_KEY in Admin > Payment Settings.');
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
                'logo' => 'https://hambaktech.com.ng/logo.svg',
            ],
        ];

        $ch = curl_init("{$this->baseUrl}/payments");
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
        $this->logCall('/payments', 'POST', $statusCode, $payload, $parsed ?: $rawResponse, $latencyMs, $reference);

        if ($rawResponse === false) {
            throw new RuntimeException("Flutterwave gateway communication error: {$curlError}");
        }

        if ($statusCode !== 200 || empty($parsed['status']) || $parsed['status'] !== 'success' || empty($parsed['data']['link'])) {
            $msg = $parsed['message'] ?? "Flutterwave payment initialization failed (HTTP {$statusCode})";
            // Check for known KYC / activation restrictions
            if (str_contains(strtolower($msg), 'inactive') || str_contains(strtolower($msg), 'kyc') || str_contains(strtolower($msg), 'compliance')) {
                throw new RuntimeException("Flutterwave Merchant Restriction: {$msg}. Please ensure your Flutterwave business account compliance and live credentials are activated.");
            }
            throw new RuntimeException("Flutterwave Error: {$msg}");
        }

        return [
            'authorization_url' => $parsed['data']['link'],
            'reference' => $reference,
            'amount' => $amount,
        ];
    }

    /**
     * 2. Verify Flutterwave Transaction
     * By reference or transaction ID
     * GET https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref={reference}
     * GET https://api.flutterwave.com/v3/transactions/{id}/verify
     */
    public function verifyPayment(string $reference, ?string $transactionId = null): array
    {
        if (empty($this->secretKey)) {
            throw new RuntimeException('Flutterwave Secret Key is not configured.');
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
        $isSuccess = ($data['status'] === 'successful');

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

    /**
     * 3. Validate Webhook Signature
     * Flutterwave webhooks provide header `verif-hash`
     */
    public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool
    {
        if (empty($signatureHeader)) {
            return false;
        }

        if (!empty($this->secretHash) && hash_equals($this->secretHash, $signatureHeader)) {
            return true;
        }

        // Also check if signature matches secretKey
        return hash_equals($this->secretKey, $signatureHeader);
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
            ];
        }

        $ch = curl_init("{$this->baseUrl}/balances");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer {$this->secretKey}",
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $rawResponse = curl_exec($ch);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $parsed = json_decode((string)$rawResponse, true);

        if ($statusCode === 200 && ($parsed['status'] ?? '') === 'success') {
            return [
                'status' => 'operational',
                'message' => 'Flutterwave live connection verified and balances operational',
                'operational' => true,
                'data' => $parsed['data'] ?? [],
            ];
        }

        $msg = $parsed['message'] ?? "HTTP {$statusCode}";
        return [
            'status' => 'restricted',
            'message' => "Flutterwave reported: {$msg}",
            'operational' => false,
        ];
    }

    private function logCall(string $endpoint, string $method, int $code, $req, $res, int $lat, ?string $ref): void
    {
        try {
            $this->db->execute(
                'INSERT INTO provider_logs (id, provider_id, endpoint, method, status_code, request_payload, response_payload, latency_ms, reference, created_at)
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
        } catch (\Throwable) {}
    }
}
