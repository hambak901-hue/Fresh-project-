<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;
use Exception;

/**
 * NIMC Verified Enterprise Partner Desk Adapter
 *
 * Implements national identity verification, tracking ID lookups,
 * pre-enrolment validation, and digital identity slip generation.
 */
class NimcPartnerAdapter extends BaseProviderAdapter
{
    public const DEFAULT_CODE = 'NIMC_DESK_GATEWAY';

    public function __construct(string $code = self::DEFAULT_CODE, array $overrides = [])
    {
        parent::__construct($code, $overrides);
    }

    public function getSupportedServices(): array
    {
        return [
            'NIN-ENR-001', // NIN Fresh Enrolment Assistance
            'NIN-MOD-002', // NIN Data Modification
            'NIN-RPR-003', // NIN Slip Reprint & QR Generation
            'NIN-VAL-004', // NIN Live Status Validation
            'NIN-IPE-005', // IPE Clearance & Tracking
            'NIN-BYP-006', // NIN Biometric Verification Assistance
        ];
    }

    public function queryBalance(): array
    {
        $balanceKobo = (int) ($this->providerRecord['balanceKobo'] ?? 5000000);
        return [
            'success'     => true,
            'balanceKobo' => $balanceKobo,
            'balanceNgn'  => $balanceKobo / 100,
            'currency'    => 'NGN',
            'status'      => 'ONLINE',
            'mode'        => $this->isSandbox() ? 'SANDBOX' : 'LIVE',
            'credits'     => (int) floor($balanceKobo / 200000), // ~₦2,000 per search credit
            'raw'         => ['status' => 'active', 'walletBalance' => $balanceKobo / 100],
        ];
    }

    public function verifyCustomer(string $serviceType, array $params): array
    {
        $nin = preg_replace('/\D/', '', (string) ($params['nin'] ?? ''));
        if (strlen($nin) !== 11) {
            return [
                'success'      => false,
                'message'      => 'National Identification Number must be exactly 11 numeric digits',
                'customerName' => null,
            ];
        }

        // Never fabricate citizen names or government registry records
        return [
            'success'       => true,
            'nin'           => substr($nin, 0, 3) . '****' . substr($nin, -2),
            'customerName'  => null,
            'accountStatus' => 'PENDING_DESK_VERIFICATION',
            'trackingId'    => null,
        ];
    }

    public function verifyNin(string $nin, string $clientReference): array
    {
        return $this->executeTransaction([
            'serviceCode'     => 'NIN-VAL-004',
            'nin'             => $nin,
            'clientReference' => $clientReference,
        ]);
    }

    public function executeTransaction(array $params): array
    {
        $serviceCode = (string) ($params['serviceCode'] ?? 'NIN-VAL-004');
        $nin = preg_replace('/\D/', '', (string) ($params['nin'] ?? ''));
        $amountKobo = (int) ($params['amountKobo'] ?? 300000);
        $clientRef = (string) ($params['clientReference'] ?? ('NIMC_' . bin2hex(random_bytes(8))));

        $appEnv = getenv('APP_ENV') ?: (getenv('NODE_ENV') ?: 'production');
        $isProd = ($appEnv === 'production');

        // Query provider product cost if configured
        $providerCostKobo = 0;
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                SELECT pp.* FROM `ProviderProduct` pp
                JOIN `IntegrationProvider` ip ON pp.`providerId` = ip.`id`
                WHERE pp.`serviceCode` = :code AND ip.`code` = :pcode
                LIMIT 1
            ");
            $stmt->execute([':code' => $serviceCode, ':pcode' => $this->code]);
            $product = $stmt->fetch(PDO::FETCH_ASSOC);
            $providerCostKobo = $product ? (int) $product['providerCostKobo'] : 0;
        } catch (\Throwable) {
            $providerCostKobo = 0;
        }

        // Without real verified partner credentials, NIN requests must NEVER fabricate success
        if ($isProd || empty($this->apiKey)) {
            $deskMsg = 'NIN service request logged and queued for authorized operations desk fulfillment.';

            $this->logTransaction([
                'providerId'        => $this->providerRecord['id'] ?? 'prov-nimc-partner',
                'serviceId'         => $params['serviceId'] ?? null,
                'orderId'           => $params['orderId'] ?? null,
                'orderItemId'       => $params['orderItemId'] ?? null,
                'providerReference' => null, // Never fabricate government references
                'clientReference'   => $clientRef,
                'status'            => 'PENDING',
                'costKobo'          => $providerCostKobo,
                'amountKobo'        => $amountKobo,
                'requestJson'       => json_encode($params),
                'responseJson'      => json_encode([
                    'status'        => 'QUEUED_FOR_DESK',
                    'nin'           => $nin ? (substr($nin, 0, 3) . '****' . substr($nin, -2)) : 'N/A',
                    'message'       => $deskMsg,
                ]),
                'rawStatus'         => 'QUEUED_FOR_DESK',
            ]);

            return [
                'success'           => false,
                'status'            => 'QUEUED_FOR_DESK',
                'providerReference' => null,
                'clientReference'   => $clientRef,
                'costKobo'          => 0,
                'message'           => $deskMsg,
                'raw'               => ['status' => 'QUEUED_FOR_DESK'],
            ];
        }

        // Live verified partner endpoint execution (only when certified credentials exist)
        $endpoint = '/v1/identity/nin/validate';
        $res = $this->makeHttpRequest('POST', $endpoint, [
            'nin'             => $nin,
            'clientReference' => $clientRef,
        ]);

        $status = $res['success'] ? 'SUCCESS' : 'FAILED';
        $pRef = $res['data']['providerReference'] ?? null;

        $this->logTransaction([
            'providerId'        => $this->providerRecord['id'] ?? 'prov-nimc-partner',
            'serviceId'         => $params['serviceId'] ?? null,
            'orderId'           => $params['orderId'] ?? null,
            'orderItemId'       => $params['orderItemId'] ?? null,
            'providerReference' => $pRef,
            'clientReference'   => $clientRef,
            'status'            => $status,
            'costKobo'          => $providerCostKobo,
            'amountKobo'        => $amountKobo,
            'requestJson'       => json_encode($params),
            'responseJson'      => json_encode($res['data'] ?? []),
            'rawStatus'         => (string) ($res['statusCode'] ?? 0),
            'errorMessage'      => $res['error'] ?? null,
        ]);

        return [
            'success'           => $res['success'],
            'status'            => $status,
            'providerReference' => $pRef,
            'clientReference'   => $clientRef,
            'costKobo'          => $providerCostKobo,
            'message'           => $res['success'] ? 'Verification completed via partner gateway.' : ($res['error'] ?? 'Partner verification failed.'),
            'raw'               => $res['data'] ?? null,
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
            return ['success' => false, 'message' => "NIMC transaction '{$transactionReference}' not found"];
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
        return ['received' => true, 'processed' => true];
    }

    protected function logTransaction(array $data): void
    {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                INSERT INTO `ProviderTransaction`
                (`id`, `providerId`, `serviceId`, `orderId`, `orderItemId`, `providerReference`, `clientReference`, `requestPayload`, `responsePayload`, `status`, `costKobo`, `amountKobo`, `rawStatus`, `createdAt`, `updatedAt`)
                VALUES
                (:id, :provId, :srvId, :ordId, :itmId, :pRef, :cRef, :req, :res, :status, :cost, :amt, :rawSt, NOW(3), NOW(3))
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
                ':rawSt'  => $data['rawStatus'] ?? 'VERIFIED',
            ]);
        } catch (Exception $e) {
            error_log("Failed to log NIMC transaction: " . $e->getMessage());
        }
    }
}
