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

        if ($statusCode !== 200 || empty($parsed['status']) || empty($parsed['data'])) {
            $msg = $parsed['message'] ?? "Paystack verification error (HTTP {$statusCode})";
            return [
                'status' => 'failed',
                'amount' => 0.00,
                'reference' => $reference,
                'gateway_response' => $msg,
                'raw' => $parsed,
            ];
        }

        $data = $parsed['data'];
        $nairaAmount = (float)($data['amount'] / 100);
        $isSuccess = ($data['status'] === 'success');

        return [
            'status' => $isSuccess ? 'successful' : ($data['status'] ?? 'failed'),
            'amount' => $nairaAmount,
            'currency' => $data['currency'] ?? 'NGN',
            'reference' => $data['reference'] ?? $reference,
            'paid_at' => $data['paid_at'] ?? null,
            'channel' => $data['channel'] ?? 'card',
            'customer_email' => $data['customer']['email'] ?? '',
            'gateway_response' => $data['gateway_response'] ?? 'Approved',
            'raw' => $data,
        ];
    }

    /**
     * Validate Webhook Signature using HMAC-SHA512
     */
    public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool
    {
        if (empty($signatureHeader) || empty($this->secretKey)) {
            return false;
        }

        $calculated = hash_hmac('sha512', $rawBody, $this->secretKey);
        return hash_equals($calculated, $signatureHeader);
    }

    private function logCall(string $endpoint, string $method, int $code, $req, $res, int $lat, ?string $ref): void
    {
        try {
            $this->db->execute(
                'INSERT INTO provider_logs (id, provider_id, endpoint, method, status_code, request_body, response_body, latency_ms, reference, created_at)
                 VALUES (:id, "paystack", :ep, :m, :code, :req, :res, :lat, :ref, NOW())',
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
