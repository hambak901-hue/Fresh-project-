<?php
/**
 * @file VerificationAdapterInterface.php
 * Contract for Sovereign Identity Verification Adapters
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Verification;

interface VerificationAdapterInterface
{
    public function getName(): string;
    public function verify(string $endpoint, array $payload): array;
    public function ping(): array;
}
