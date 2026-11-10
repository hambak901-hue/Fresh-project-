<?php
/**
 * @file PaymentGatewayInterface.php
 * Enterprise Contract for Payment Gateways (Paystack / Flutterwave)
 * Target: PHP 8.2+ / MySQL 8.x
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Payment;

interface PaymentGatewayInterface
{
    public function getName(): string;
    public function getId(): string;
    public function getStatus(): string;
    public function initializePayment(string $email, float $amount, string $reference, string $callbackUrl, array $metadata = []): array;
    public function verifyPayment(string $reference, ?string $transactionId = null): array;
    public function validateWebhookSignature(string $rawBody, string $signatureHeader): bool;
}
