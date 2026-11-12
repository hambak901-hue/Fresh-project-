<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;
use Exception;

/**
 * Telecom & VTU Carrier Gateway Adapter
 *
 * Implements automated airtime top-up, data bundle activation,
 * network detection, and vendor balance monitoring.
 */
class VtuProviderAdapter extends BaseProviderAdapter
{
    public const DEFAULT_CODE = 'VTU_AGGREGATOR';

    public function __construct(string $code = self::DEFAULT_CODE, array $overrides = [])
    {
        parent::__construct($code, $overrides);
    }

    public function getSupportedServices(): array
    {
        return [
            'RCH-MTN-100', 'RCH-MTN-200', 'RCH-MTN-500', 'RCH-MTN-1000',
            'RCH-AIR-100', 'RCH-AIR-200', 'RCH-AIR-500', 'RCH-AIR-1000',
            'RCH-GLO-100', 'RCH-GLO-200', 'RCH-GLO-500', 'RCH-GLO-1000',
            'RCH-9MB-100', 'RCH-9MB-200', 'RCH-9MB-500', 'RCH-9MB-1000',
        ];
    }

    public function queryBalance(): array
    {
        if ($this->isSandbox() || empty($this->apiKey)) {
            // Simulated live balance from database or sandbox default
            $balanceKobo = (int) ($this->providerRecord['balanceKobo'] ?? 2500000);
            return [
                'success'     => true,
                'balanceKobo' => $balanceKobo,
                'balanceNgn'  => $balanceKobo / 100,
                'currency'    => 'NGN',
                'status'      => 'ONLINE',
                'mode'        => 'SANDBOX',
                'raw'         => ['status' => 'success', 'balance' => $balanceKobo / 100],
            ];
        }

        $res = $this->makeHttpRequest('GET', '/wallet/balance');
        if ($res['success'] && isset($res['data']['balance'])) {
            $balanceKobo = (int) round(((float) $res['data']['balance']) * 100);
            return [
                'success'     => true,
                'balanceKobo' => $balanceKobo,
                'balanceNgn'  => $balanceKobo / 100,
                'currency'    => 'NGN',
                'status'      => 'ONLINE',
                'mode'        => 'LIVE',
                'raw'         => $res['data'],
            ];
        }

        return [
            'success'     => false,
            'balanceKobo' => 0,
            'balanceNgn'  => 0,
            'currency'    => 'NGN',
            'status'      => 'ERROR',
            'mode'        => 'LIVE',
            'error'       => $res['error'] ?? 'Failed to retrieve provider balance',
            'raw'         => $res['raw'] ?? null,
        ];
    }

    public function verifyCustomer(string $serviceType, array $params): array
    {
        $phone = preg_replace('/\D/', '', (string) ($params['phone'] ?? ''));
        if (strlen($phone) < 10) {
            return [
                'success'      => false,
                'message'      => 'Invalid recipient mobile phone number format',
                'customerName' => null,
            ];
        }

        // Detect carrier prefix
        $prefix = substr($phone, -10, 3);
        $detectedNetwork = 'UNKNOWN';
        if (in_array($prefix, ['803', '806', '703', '706', '813', '816', '810', '814', '903', '906', '913', '916'])) {
            $detectedNetwork = 'MTN';
        } elseif (in_array($prefix, ['802', '808', '708', '812', '701', '902', '901', '904', '907', '912'])) {
            $detectedNetwork = 'AIRTEL';
        } elseif (in_array($prefix, ['805', '807', '705', '815', '811', '905', '915'])) {
            $detectedNetwork = 'GLO';
        } elseif (in_array($prefix, ['809', '817', '818', '909', '908'])) {
            $detectedNetwork = '9MOBILE';
        }

        return [
            'success'         => true,
            'detectedNetwork' => $detectedNetwork,
            'phone'           => $phone,
            'customerName'    => 'Subscriber (' . $detectedNetwork . ')',
            'accountStatus'   => 'ACTIVE',
        ];
    }

    public function fulfillAirtime(string $network, string $phone, int $amountKobo, string $clientReference): array
    {
        return $this->executeTransaction([
            'serviceCode'     => 'RCH-' . strtoupper(substr($network, 0, 3)) . '-100',
            'phone'           => $phone,
            'network'         => $network,
            'amountKobo'      => $amountKobo,
            'clientReference' => $clientReference,
        ]);
    }

    public function executeTransaction(array $params): array
    {
        $serviceCode = (string) ($params['serviceCode'] ?? '');
        $phone = preg_replace('/\D/', '', (string) ($params['phone'] ?? ''));
        $amountKobo = (int) ($params['amountKobo'] ?? 0);
        $clientRef = (string) ($params['clientReference'] ?? ('VTU_' . bin2hex(random_bytes(8))));

        // Retrieve provider cost from ProviderProduct table
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare("
            SELECT pp.*, ip.id AS provId 
            FROM `ProviderProduct` pp
            JOIN `IntegrationProvider` ip ON pp.`providerId` = ip.`id`
            WHERE pp.`serviceCode` = :code AND ip.`code` = :pcode AND pp.`isAvailable` = 1
            LIMIT 1
        ");
        $stmt->execute([':code' => $serviceCode, ':pcode' => $this->code]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        $providerCostKobo = $product ? (int) $product['providerCostKobo'] : (int) round($amountKobo * 0.97);

        $appEnv = getenv('APP_ENV') ?: (getenv('NODE_ENV') ?: 'production');
        $isProd = ($appEnv === 'production');

        if ($isProd && (empty($this->apiKey) || $this->isSandbox())) {
            // In production, NEVER simulate fake provider success!
            $errorMsg = empty($this->apiKey) 
                ? 'Provider API credentials not configured in production environment.' 
                : 'Provider is in SANDBOX mode; automated live dispatch prohibited in production.';

            $this->logTransaction([
                'providerId'        => $this->providerRecord['id'] ?? 'prov-vtu-aggregator',
                'serviceId'         => $params['serviceId'] ?? null,
                'orderId'           => $params['orderId'] ?? null,
                'orderItemId'       => $params['orderItemId'] ?? null,
                'providerReference' => null,
                'clientReference'   => $clientRef,
                'status'            => 'FAILED',
                'costKobo'          => $providerCostKobo,
                'amountKobo'        => $amountKobo,
                'requestJson'       => json_encode($params),
                'responseJson'      => json_encode(['error' => $errorMsg]),
                'rawStatus'         => 'PROD_MOCK_BLOCKED',
                'errorCode'         => 'ERR_PROD_UNCONFIGURED',
                'errorMessage'      => $errorMsg,
            ]);

            return [
                'success'           => false,
                'status'            => 'FAILED',
                'providerReference' => null,
                'clientReference'   => $clientRef,
                'costKobo'          => 0,
                'message'           => $errorMsg . ' Order queued for manual desk fulfillment.',
                'raw'               => null,
            ];
        }

        if ($this->isSandbox() || empty($this->apiKey)) {
            $providerRef = 'SBX_VTU_' . strtoupper(bin2hex(random_bytes(6)));
            
            // Record provider transaction log in non-production local development only
            $this->logTransaction([
                'providerId'        => $this->providerRecord['id'] ?? 'prov-vtu-aggregator',
                'serviceId'         => $params['serviceId'] ?? null,
                'orderId'           => $params['orderId'] ?? null,
                'orderItemId'       => $params['orderItemId'] ?? null,
                'providerReference' => $providerRef,
                'clientReference'   => $clientRef,
                'status'            => 'SUCCESS',
                'costKobo'          => $providerCostKobo,
                'amountKobo'        => $amountKobo,
                'requestJson'       => json_encode($params),
                'responseJson'      => json_encode(['status' => 'delivered', 'reference' => $providerRef]),
                'rawStatus'         => '200_OK_DELIVERED',
            ]);

            return [
                'success'           => true,
                'status'            => 'SUCCESS',
                'providerReference' => $providerRef,
                'clientReference'   => $clientRef,
                'costKobo'          => $providerCostKobo,
                'message'           => "Airtime top-up of ₦" . number_format($amountKobo / 100, 2) . " delivered to {$phone} successfully (Local Sandbox Mode).",
                'raw'               => ['reference' => $providerRef, 'recipient' => $phone, 'status' => 'successful'],
            ];
        }

        // Live API execution call
        $res = $this->makeHttpRequest('POST', '/airtime/topup', [
            'network'   => $product['network'] ?? 'MTN',
            'phone'     => $phone,
            'amount'    => $amountKobo / 100,
            'reference' => $clientRef,
        ]);

        $status = $res['success'] ? 'SUCCESS' : 'FAILED';
        $providerRef = $res['data']['reference'] ?? ($res['success'] ? ('LIVE_VTU_' . bin2hex(random_bytes(6))) : null);

        $this->logTransaction([
            'providerId'        => $this->providerRecord['id'] ?? 'prov-vtu-aggregator',
            'serviceId'         => $params['serviceId'] ?? null,
            'orderId'           => $params['orderId'] ?? null,
            'orderItemId'       => $params['orderItemId'] ?? null,
            'providerReference' => $providerRef,
            'clientReference'   => $clientRef,
            'status'            => $status,
            'costKobo'          => $providerCostKobo,
            'amountKobo'        => $amountKobo,
            'requestJson'       => json_encode($params),
            'responseJson'      => is_string($res['raw']) ? $res['raw'] : json_encode($res['data']),
            'rawStatus'         => (string) $res['statusCode'],
            'errorMessage'      => $res['error'] ?? null,
        ]);

        return [
            'success'           => $res['success'],
            'status'            => $status,
            'providerReference' => $providerRef,
            'clientReference'   => $clientRef,
            'costKobo'          => $providerCostKobo,
            'message'           => $res['success'] ? 'Transaction executed successfully.' : ($res['error'] ?? 'Execution failed at carrier gateway.'),
            'raw'               => $res['data'],
        ];
    }

    public function queryTransaction(string $transactionReference): array
    {
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare("
            SELECT * FROM `ProviderTransaction` 
            WHERE `clientReference` = :ref1 OR `providerReference` = :ref2
            LIMIT 1
        ");
        $stmt->execute([':ref1' => $transactionReference, ':ref2' => $transactionReference]);
        $tx = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tx) {
            return [
                'success' => false,
                'message' => "Transaction reference '{$transactionReference}' not found",
            ];
        }

        return [
            'success'           => true,
            'status'            => $tx['status'],
            'providerReference' => $tx['providerReference'],
            'clientReference'   => $tx['clientReference'],
            'costKobo'          => (int) $tx['costKobo'],
            'amountKobo'        => (int) $tx['amountKobo'],
            'executedAt'        => $tx['executedAt'] ?? $tx['createdAt'],
        ];
    }

    public function handleWebhook(array $headers, array $payload): array
    {
        $conn = $this->db->getConnection();
        $providerId = $this->providerRecord['id'] ?? 'prov-vtu-aggregator';

        $stmt = $conn->prepare("
            INSERT INTO `ProviderWebhookLog` 
            (`id`, `providerId`, `event`, `signature`, `payloadJson`, `isVerified`, `isProcessed`, `ipAddress`, `receivedAt`)
            VALUES (:id, :provId, :event, :sig, :payload, 1, 1, :ip, NOW(3))
        ");
        $stmt->execute([
            ':id'      => 'wh_' . bin2hex(random_bytes(8)),
            ':provId'  => $providerId,
            ':event'   => (string) ($payload['event'] ?? 'vtu.transaction.updated'),
            ':sig'     => $headers['x-provider-signature'] ?? null,
            ':payload' => json_encode($payload),
            ':ip'      => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
        ]);

        return ['received' => true, 'processed' => true];
    }

    protected function logTransaction(array $data): void
    {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                INSERT INTO `ProviderTransaction`
                (`id`, `providerId`, `serviceId`, `orderId`, `orderItemId`, `providerReference`, `clientReference`, `requestPayload`, `responsePayload`, `status`, `costKobo`, `amountKobo`, `rawStatus`, `errorMessage`, `createdAt`, `updatedAt`)
                VALUES
                (:id, :provId, :srvId, :ordId, :itmId, :pRef, :cRef, :req, :res, :status, :cost, :amt, :rawSt, :errMsg, NOW(3), NOW(3))
            ");
            $stmt->execute([
                ':id'     => 'ptx_' . bin2hex(random_bytes(10)),
                ':provId' => $data['providerId'],
                ':srvId'  => $data['serviceId'] ?? null,
                ':ordId'  => $data['orderId'] ?? null,
                ':itmId'  => $data['orderItemId'] ?? null,
                ':pRef'   => $data['providerReference'] ?? null,
                ':cRef'   => $data['clientReference'],
                ':req'    => $data['requestJson'] ?? null,
                ':res'    => $data['responseJson'] ?? null,
                ':status' => $data['status'] ?? 'SUCCESS',
                ':cost'   => $data['costKobo'] ?? 0,
                ':amt'    => $data['amountKobo'] ?? 0,
                ':rawSt'  => $data['rawStatus'] ?? 'OK',
                ':errMsg' => $data['errorMessage'] ?? null,
            ]);
        } catch (Exception $e) {
            error_log("Failed to log provider transaction: " . $e->getMessage());
        }
    }
}
