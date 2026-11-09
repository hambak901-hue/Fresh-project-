<?php
/**
 * @file PaymentGatewayInterface.php
 * Contract for Payment Gateways (Paystack / Flutterwave)
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Payment;

interface PaymentGatewayInterface
{
    public function getName(): string;
    public function initializePayment(string $email, float $amount, string $reference, string $callbackUrl): array;
    public function verifyPayment(string $reference): array;
}
