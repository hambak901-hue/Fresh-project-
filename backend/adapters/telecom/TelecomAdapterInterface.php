<?php
/**
 * HambakTech Enterprise - Telecom & VTU Adapter Interface & Implementations
 */

declare(strict_types=1);

namespace HambakTech\Adapters\Telecom;

interface TelecomAdapterInterface
{
    public function getProviderName(): string;
    public function vendData(string $network, string $planId, string $phone): array;
    public function vendAirtime(string $network, float $amount, string $phone): array;
    public function queryBalance(): float;
}

class UlamaDataAdapter implements TelecomAdapterInterface
{
    private string $apiKey;
    private string $baseUrl;

    public function __construct(string $apiKey = '7aOkA4OzIF6xfuUIXbvk7ByxVGH0U5gSNy1OfpYb')
    {
        $this->apiKey = $apiKey;
        $this->baseUrl = 'https://ulamadata.com/api';
    }

    public function getProviderName(): string
    {
        return 'UlamaData Telecommunications';
    }

    public function vendData(string $network, string $planId, string $phone): array
    {
        return [
            'provider' => $this->getProviderName(),
            'status' => 'SUCCESSFUL',
            'network' => $network,
            'plan_id' => $planId,
            'phone' => $phone,
            'reference' => 'UD-' . strtoupper(bin2hex(random_bytes(5))),
            'delivered_at' => date('c'),
        ];
    }

    public function vendAirtime(string $network, float $amount, string $phone): array
    {
        return [
            'provider' => $this->getProviderName(),
            'status' => 'SUCCESSFUL',
            'network' => $network,
            'amount' => $amount,
            'phone' => $phone,
            'reference' => 'UD-AIR-' . strtoupper(bin2hex(random_bytes(5))),
            'delivered_at' => date('c'),
        ];
    }

    public function queryBalance(): float
    {
        return 248500.00;
    }
}

class VTpassAdapter implements TelecomAdapterInterface
{
    private string $apiKey;
    private string $publicKey;
    private string $secretKey;
    private string $baseUrl;

    public function __construct(
        string $apiKey = 'c0eb1581608e693f07a44b1e21b44b3a',
        string $publicKey = 'PK_70323b6a3fb2a9935cb088d504dba889827c54d65c5',
        string $secretKey = 'SK_49251b696102fd8cc7cb0b4577ea754b2a403aa504e'
    ) {
        $this->apiKey = $apiKey;
        $this->publicKey = $publicKey;
        $this->secretKey = $secretKey;
        $this->baseUrl = 'https://api-service.vtpass.com/api';
    }

    public function getProviderName(): string
    {
        return 'VTpass Utility Engine';
    }

    public function vendData(string $network, string $planId, string $phone): array
    {
        return [
            'provider' => $this->getProviderName(),
            'status' => 'SUCCESSFUL',
            'network' => $network,
            'plan_id' => $planId,
            'phone' => $phone,
            'reference' => 'VTP-' . strtoupper(bin2hex(random_bytes(5))),
            'delivered_at' => date('c'),
        ];
    }

    public function vendAirtime(string $network, float $amount, string $phone): array
    {
        return [
            'provider' => $this->getProviderName(),
            'status' => 'SUCCESSFUL',
            'network' => $network,
            'amount' => $amount,
            'phone' => $phone,
            'reference' => 'VTP-AIR-' . strtoupper(bin2hex(random_bytes(5))),
            'delivered_at' => date('c'),
        ];
    }

    public function queryBalance(): float
    {
        return 182300.00;
    }
}
