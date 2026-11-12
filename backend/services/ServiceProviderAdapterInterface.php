<?php
declare(strict_types=1);

namespace Hambak\Services;

/**
 * Universal Integration Provider Adapter Interface
 *
 * Enforces decoupling between the core order engine and external service providers.
 * All third-party fulfillment vendors (VTU aggregators, NIMC identity desks, SMS gateways,
 * Veripine, RandaVerify, etc.) implement this unified contract.
 *
 * Standard lifecycle:
 * - authenticate
 * - healthCheck
 * - verify
 * - requery
 * - getBalance
 * - getDocument
 * - handleWebhook
 * - verifyWebhookSignature
 * - normalizeResponse
 */
interface ServiceProviderAdapterInterface
{
    /**
     * Unique alphanumeric provider code (e.g. "RANDAVERIFY", "VERIPINE", "VTPASS")
     */
    public function getCode(): string;

    /**
     * Human-readable provider name
     */
    public function getName(): string;

    /**
     * Provider category: TELECOM_VTU | IDENTITY_NIN | SMS_NOTIFICATION | PAYMENT_GATEWAY
     */
    public function getCategory(): string;

    /**
     * Array of canonical service codes supported by this adapter
     */
    public function getSupportedServices(): array;

    /**
     * Validates provider credentials and configuration
     * Returns: ['success' => bool, 'authenticated' => bool, 'environment' => string, 'message' => string]
     */
    public function authenticate(): array;

    /**
     * Performs a health check against the provider gateway
     * Returns: ['success' => bool, 'status' => 'HEALTHY'|'DEGRADED'|'DOWN', 'latencyMs' => int, 'message' => string]
     */
    public function healthCheck(): array;

    /**
     * Universal identity or service verification method
     * $type: 'NIN' | 'BVN' | 'PHONE' | 'DEMOGRAPHY' | 'METER' | 'SMARTCARD'
     * Returns normalized standard verification result
     */
    public function verify(string $type, array $params): array;

    /**
     * Queries remote status of a previously submitted transaction / report
     */
    public function requery(string $reference): array;

    /**
     * Queries provider float / wallet balance when supported
     * Returns: ['success' => bool, 'balanceKobo' => int, 'balanceNgn' => float, 'currency' => string, 'mode' => string]
     */
    public function getBalance(): array;

    /**
     * Retrieves an authorized provider document (e.g. printable PDF slip, certificate, statement)
     * Returns: ['success' => bool, 'mimeType' => string, 'pdfBinary' => ?string, 'dataUri' => ?string, 'url' => ?string]
     */
    public function getDocument(string $identifier, array $options = []): array;

    /**
     * Verifies cryptographic signature of incoming webhook
     */
    public function verifyWebhookSignature(string $rawBody, array $headers, string $secret): bool;

    /**
     * Processes an incoming provider webhook callback payload
     */
    public function handleWebhook(array $headers, array $payload): array;

    /**
     * Normalizes a raw provider response into HambakTech standard identity/order result
     */
    public function normalizeResponse(array $raw, string $type = 'NIN'): array;

    // =========================================================================
    // Legacy compatibility methods (preserved for existing order callers)
    // =========================================================================

    public function queryBalance(): array;

    public function verifyCustomer(string $serviceType, array $params): array;

    public function executeTransaction(array $params): array;

    public function queryTransaction(string $transactionReference): array;
}
