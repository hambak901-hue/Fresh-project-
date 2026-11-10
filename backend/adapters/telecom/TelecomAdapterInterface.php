<?php
/**
 * @file TelecomAdapterInterface.php
 * Official Telecommunications Provider Interface
 * Standard PHP 8.2+ Architecture
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Telecom;

interface TelecomAdapterInterface
{
    public function getName(): string;
    public function getId(): string;
    public function checkBalance(): array;
    public function purchaseData(string $network, string $phone, string|int $planId, bool $ported = true): array;
    public function topupAirtime(string $network, string $phone, float $amount, string $airtimeType = 'VTU'): array;
    public function vendAirtimePin(string $network, float $value, int $quantity, string $businessName): array;
    public function vendDataPin(string $network, string|int $planId, int $quantity, string $businessName): array;
    public function processAirtimeSwap(string $network, string $phone, float $amount): array;
    public function validateSmartcard(string $provider, string $smartcard): array;
    public function renewCable(string $provider, string $smartcard, string $packageCode): array;
    public function validateMeter(string $discoCode, string $meterNumber, string $meterType): array;
    public function vendElectricity(string $discoCode, string $meterNumber, float $amount, string $meterType): array;
    public function vendExamPin(string $examName, int $quantity): array;
    public function sendBulkSms(string $senderId, array $recipients, string $message): array;
    public function queryTransaction(string $reference): array;
    public function syncLivePlans(): array;
    public function ping(): array;
}
