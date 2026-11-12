<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;
use RuntimeException;

/**
 * Base Integration Provider Adapter
 *
 * Provides reusable HTTP communication, credential decryption,
 * transaction logging, and standard response transformations.
 */
abstract class BaseProviderAdapter implements ServiceProviderAdapterInterface
{
    protected Database $db;
    protected string $encryptionKey;
    protected array $providerRecord = [];
    protected string $code;
    protected string $name;
    protected string $category;
    protected string $baseUrl;
    protected ?string $apiKey = null;
    protected ?string $apiSecret = null;
    protected ?string $publicKey = null;
    protected ?string $webhookSecret = null;
    protected array $settings = [];

    public function __construct(string $code, array $overrides = [])
    {
        $this->db = Database::getInstance();
        $this->encryptionKey = $this->deriveEncryptionKey();
        $this->code = $code;

        $this->loadConfiguration($overrides);
    }

    protected function deriveEncryptionKey(): string
    {
        $secret = $_ENV['ENCRYPTION_KEY'] 
            ?? $_ENV['JWT_SECRET'] 
            ?? getenv('ENCRYPTION_KEY') 
            ?? getenv('JWT_SECRET');
        $appEnv = $_ENV['APP_ENV'] ?? getenv('APP_ENV') ?? (getenv('NODE_ENV') ?: 'production');

        if (empty($secret)) {
            if ($appEnv === 'production') {
                throw new RuntimeException('SECURITY FATAL: ENCRYPTION_KEY or JWT_SECRET must be configured in production environment. Failing closed.');
            }
            // Strictly isolated test-fixture key for offline testing only — cannot be used in production
            $secret = 'test_fixture_only_deterministic_key';
        }

        return hash('sha256', $secret, true);
    }

    protected function loadConfiguration(array $overrides = []): void
    {
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare("SELECT * FROM `IntegrationProvider` WHERE `code` = :code LIMIT 1");
        $stmt->execute([':code' => $this->code]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $this->providerRecord = array_merge($record, $overrides);

        $this->name = $this->providerRecord['name'] ?? $this->code;
        $this->category = $this->providerRecord['category'] ?? 'TELECOM_VTU';
        $this->baseUrl = rtrim($this->providerRecord['baseUrl'] ?? '', '/');

        if (!empty($this->providerRecord['apiKeyEncrypted'])) {
            $this->apiKey = $this->decrypt($this->providerRecord['apiKeyEncrypted']);
        }
        if (!empty($this->providerRecord['apiSecretEncrypted'])) {
            $this->apiSecret = $this->decrypt($this->providerRecord['apiSecretEncrypted']);
        }
        $this->publicKey = $this->providerRecord['publicKey'] ?? null;
        if (!empty($this->providerRecord['webhookSecretEncrypted'])) {
            $this->webhookSecret = $this->decrypt($this->providerRecord['webhookSecretEncrypted']);
        }

        if (!empty($this->providerRecord['settingsJson'])) {
            $this->settings = is_array($this->providerRecord['settingsJson'])
                ? $this->providerRecord['settingsJson']
                : (json_decode($this->providerRecord['settingsJson'], true) ?: []);
        }
    }

    public function getCode(): string
    {
        return $this->code;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getCategory(): string
    {
        return $this->category;
    }

    public function getBaseUrl(): string
    {
        return $this->baseUrl;
    }

    public function isSandbox(): bool
    {
        return ($this->providerRecord['status'] ?? 'SANDBOX') === 'SANDBOX';
    }

    public function decrypt(string $ciphertext): string
    {
        if (empty($ciphertext)) {
            return '';
        }

        $decoded = base64_decode($ciphertext, true);
        if ($decoded === false) {
            return '';
        }

        $pos = strpos($decoded, '::');
        if ($pos === false) {
            return '';
        }

        $iv = substr($decoded, 0, $pos);
        $encrypted = substr($decoded, $pos + 2);

        if (strlen($iv) !== 16) {
            return '';
        }

        $decrypted = openssl_decrypt(
            $encrypted,
            'AES-256-CBC',
            $this->encryptionKey,
            OPENSSL_RAW_DATA,
            $iv
        );

        return $decrypted !== false ? $decrypted : '';
    }

    public function encrypt(string $plaintext): string
    {
        if (empty($plaintext)) {
            return '';
        }

        $iv = random_bytes(16);
        $ciphertext = openssl_encrypt(
            $plaintext,
            'AES-256-CBC',
            $this->encryptionKey,
            OPENSSL_RAW_DATA,
            $iv
        );

        return base64_encode($iv . '::' . $ciphertext);
    }

    /**
     * Sends authenticated HTTP request to provider API endpoint
     */
    protected function makeHttpRequest(
        string $method,
        string $endpoint,
        array $data = [],
        array $headers = [],
        int $timeout = 30
    ): array {
        $url = filter_var($endpoint, FILTER_VALIDATE_URL) ? $endpoint : ($this->baseUrl . '/' . ltrim($endpoint, '/'));

        $ch = curl_init();
        $hasAuth = false;
        foreach ($headers as $h) {
            if (stripos($h, 'Authorization:') === 0 || stripos($h, 'X-Api-Key:') === 0 || stripos($h, 'api-key:') === 0) {
                $hasAuth = true;
                break;
            }
        }

        $defaultHeaders = [
            'Accept: application/json',
            'Content-Type: application/json',
        ];

        if ($this->apiKey && !$hasAuth) {
            $defaultHeaders[] = 'Authorization: Bearer ' . $this->apiKey;
        }

        $mergedHeaders = array_merge($defaultHeaders, $headers);

        $options = [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT      => 'HambakTech-SmartPlatform/1.0',
            CURLOPT_HTTPHEADER     => $mergedHeaders,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];

        if (strtoupper($method) === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = json_encode($data);
        } elseif (strtoupper($method) === 'PUT') {
            $options[CURLOPT_CUSTOMREQUEST] = 'PUT';
            $options[CURLOPT_POSTFIELDS] = json_encode($data);
        } elseif (strtoupper($method) === 'GET' && !empty($data)) {
            $options[CURLOPT_URL] = $url . '?' . http_build_query($data);
        }

        curl_setopt_array($ch, $options);
        $responseBody = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($responseBody === false) {
            return [
                'success'    => false,
                'statusCode' => 0,
                'error'      => $curlError ?: 'Connection failed',
                'data'       => null,
            ];
        }

        $decoded = json_decode($responseBody, true);
        return [
            'success'    => $httpCode >= 200 && $httpCode < 300,
            'statusCode' => $httpCode,
            'data'       => $decoded ?: $responseBody,
            'raw'        => $responseBody,
        ];
    }

    public function authenticate(): array
    {
        return [
            'success'       => !empty($this->apiKey),
            'authenticated' => !empty($this->apiKey),
            'environment'   => $this->providerRecord['settingsJson']['environment'] ?? 'sandbox',
            'message'       => !empty($this->apiKey) ? 'Credentials configured' : 'API credentials not configured',
        ];
    }

    public function healthCheck(): array
    {
        $start = microtime(true);
        $res = $this->queryBalance();
        $latencyMs = (int)((microtime(true) - $start) * 1000);
        return [
            'success'   => !empty($res['success']),
            'status'    => !empty($res['success']) ? 'HEALTHY' : 'DEGRADED',
            'latencyMs' => $latencyMs,
            'message'   => $res['message'] ?? 'Health check completed',
        ];
    }

    public function verify(string $type, array $params): array
    {
        return $this->verifyCustomer($type, $params);
    }

    public function requery(string $reference): array
    {
        return $this->queryTransaction($reference);
    }

    public function getBalance(): array
    {
        return $this->queryBalance();
    }

    public function getDocument(string $identifier, array $options = []): array
    {
        return [
            'success' => false,
            'message' => 'Document retrieval not supported by this provider',
        ];
    }

    public function verifyWebhookSignature(string $rawBody, array $headers, string $secret): bool
    {
        $sig = $headers['x-webhook-signature'] ?? ($headers['x-signature'] ?? null);
        if (!$sig || !$secret) return false;
        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $sig);
    }

    public function normalizeResponse(array $raw, string $type = 'NIN'): array
    {
        return [
            'success'  => true,
            'provider' => $this->code,
            'raw'      => $raw,
        ];
    }

    public function queryBalance(): array
    {
        return [
            'success'      => true,
            'balanceKobo'  => (int)($this->providerRecord['balanceKobo'] ?? 0),
            'balanceNgn'   => (int)($this->providerRecord['balanceKobo'] ?? 0) / 100,
            'currency'     => $this->providerRecord['currency'] ?? 'NGN',
            'mode'         => 'SANDBOX',
        ];
    }

    public function verifyCustomer(string $serviceType, array $params): array
    {
        return [
            'success'       => true,
            'customerName'  => 'Verified Applicant',
            'accountStatus' => 'ACTIVE',
            'raw'           => $params,
        ];
    }

    public function executeTransaction(array $params): array
    {
        return [
            'success'           => true,
            'status'            => 'SUCCESS',
            'providerReference' => $this->code . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(3)),
            'clientReference'   => $params['clientReference'] ?? 'CLIENT-REF',
            'costKobo'          => 0,
            'message'           => 'Executed successfully',
            'raw'               => $params,
        ];
    }

    public function queryTransaction(string $transactionReference): array
    {
        return [
            'success' => true,
            'status'  => 'SUCCESS',
            'raw'     => ['reference' => $transactionReference],
        ];
    }

    public function handleWebhook(array $headers, array $payload): array
    {
        return ['status' => 'acknowledged'];
    }
}
