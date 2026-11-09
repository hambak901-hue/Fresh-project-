<?php
/**
 * @file TelecomAdapterInterface.php
 * Contract for Telecom Vending Adapters
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Telecom;

interface TelecomAdapterInterface
{
    public function getName(): string;
    public function purchaseData(string $network, string $phone, string|int $planId): array;
    public function topupAirtime(string $network, string $phone, float $amount): array;
    public function vendElectricity(string $discoCode, string $meterNumber, float $amount, string $meterType): array;
    public function renewCable(string $provider, string $smartcard, string $packageCode): array;
    public function ping(): array;
}
