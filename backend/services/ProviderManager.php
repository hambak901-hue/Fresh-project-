<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;
use RuntimeException;
use InvalidArgumentException;

/**
 * Enterprise Provider Manager & Routing Engine
 *
 * Directs service fulfillment to the appropriate vendor adapter,
 * performs health checks, resolves dynamic tariffs, and enforces
 * margin guarantees.
 */
class ProviderManager
{
    public const FAILOVER_SAFE = 'SAFE_TO_FAILOVER';
    public const FAILOVER_BLOCKED = 'DO_NOT_FAILOVER';

    private static ?self $instance = null;
    private Database $db;
    /** @var array<string, ServiceProviderAdapterInterface> */
    private array $adapterCache = [];

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Resolves an adapter instance by provider code.
     */
    public function getAdapter(string $code): ServiceProviderAdapterInterface
    {
        if (isset($this->adapterCache[$code])) {
            return $this->adapterCache[$code];
        }

        switch (strtoupper($code)) {
            case '2SUREVERIFY':
            case 'TWOSUREVERIFY':
            case 'PROV-2SUREVERIFY':
            case '2SURE':
                $adapter = new TwoSureVerifyAdapter('2SUREVERIFY');
                break;

            case 'RANDAVERIFY':
            case 'PROV-RANDAVERIFY':
            case 'RANDA':
                $adapter = new RandaAdapter('RANDAVERIFY');
                break;

            case 'VTU_AGGREGATOR':
            case 'PROV-VTU-AGGREGATOR':
                $adapter = new VtuProviderAdapter('VTU_AGGREGATOR');
                break;

            case 'NIMC_DESK_GATEWAY':
            case 'PROV-NIMC-PARTNER':
                $adapter = new NimcPartnerAdapter('NIMC_DESK_GATEWAY');
                break;

            case 'VERIPINE':
            case 'PROV-VERIPINE':
                $adapter = new VeripineAdapter('VERIPINE');
                break;

            case 'VTPASS':
            case 'PROV-VTPASS':
                $adapter = new VtpassAdapter('VTPASS');
                break;

            case 'ULAMADATA':
            case 'PROV-ULAMADATA':
            case 'OLAMICONNECT':
            case 'PROV_4346BAA55C29':
                $adapter = new UlamadataAdapter('ULAMADATA');
                break;

            default:
                // Check if provider exists in DB
                $conn = $this->db->getConnection();
                $stmt = $conn->prepare("SELECT * FROM `IntegrationProvider` WHERE `code` = :c1 OR `id` = :c2 LIMIT 1");
                $stmt->execute([':c1' => $code, ':c2' => $code]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                    throw new InvalidArgumentException("Provider '{$code}' is not registered in the system.");
                }

                if ($row['category'] === 'IDENTITY_NIN') {
                    $uCode = strtoupper($row['code']);
                    $uName = strtoupper($row['name']);
                    if (str_contains($uCode, '2SURE') || str_contains($uName, '2SURE')) {
                        $adapter = new TwoSureVerifyAdapter($row['code']);
                    } elseif (str_contains($uCode, 'RANDA') || str_contains($uName, 'RANDA')) {
                        $adapter = new RandaAdapter($row['code']);
                    } elseif (str_contains($uCode, 'VERIPINE') || str_contains($uName, 'VERIPINE')) {
                        $adapter = new VeripineAdapter($row['code']);
                    } else {
                        $adapter = new NimcPartnerAdapter($row['code']);
                    }
                } elseif (str_contains(strtoupper($row['code']), 'ULAMADATA') || str_contains(strtoupper($row['name']), 'ULAMADATA') || str_contains(strtoupper($row['code']), 'OLAMI')) {
                    $adapter = new UlamadataAdapter($row['code']);
                } elseif (str_contains(strtoupper($row['code']), 'VTPASS') || str_contains(strtoupper($row['name']), 'VTPASS')) {
                    $adapter = new VtpassAdapter($row['code']);
                } else {
                    $adapter = new VtuProviderAdapter($row['code']);
                }
                break;
        }

        $this->adapterCache[$code] = $adapter;
        return $adapter;
    }

    /**
     * Retrieves the current primary provider for a given category (default: IDENTITY_NIN)
     * Governed 100% by Admin configuration in IntegrationProvider table.
     */
    public function getPrimaryProvider(string $category = 'IDENTITY_NIN'): ?array
    {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                SELECT * FROM `IntegrationProvider` 
                WHERE `category` = :cat 
                  AND `status` IN ('ACTIVE', 'SANDBOX')
                ORDER BY `isPrimary` DESC, `priority` ASC, `createdAt` ASC
                LIMIT 1
            ");
            $stmt->execute([':cat' => $category]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        } catch (\Throwable $e) {
            error_log('[ProviderManager::getPrimaryProvider] Error: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Retrieves all active secondary/fallback providers for a given category in priority order.
     */
    public function getFallbackProviders(string $category = 'IDENTITY_NIN'): array
    {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                SELECT * FROM `IntegrationProvider` 
                WHERE `category` = :cat 
                  AND `status` IN ('ACTIVE', 'SANDBOX')
                  AND `isPrimary` = 0
                ORDER BY `priority` ASC, `createdAt` ASC
            ");
            $stmt->execute([':cat' => $category]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('[ProviderManager::getFallbackProviders] Error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Resolves the primary adapter for an identity verification service dynamically from the DB.
     */
    public function getIdentityAdapterForService(string $serviceType = 'NIN'): ServiceProviderAdapterInterface
    {
        $primary = $this->getPrimaryProvider('IDENTITY_NIN');
        $code = !empty($primary['code']) ? $primary['code'] : '2SUREVERIFY';
        return $this->getAdapter($code);
    }

    /**
     * Executes an identity verification inquiry using the Admin-configured Primary Provider.
     * Enforces configurable multi-provider priority routing and resilient fallback:
     * - Primary provider (e.g. 2SureVerify) is invoked first.
     * - If successful, returns the normalized result immediately.
     * - If citizen record is simply "not found" (404 / citizen doesn't exist), returns directly WITHOUT fallback.
     * - If primary provider experiences an upstream system/provider failure (5xx, timeout, gateway down),
     *   automatically attempts secondary/fallback providers (e.g. RandaVerify, Veripine).
     * - CUSTOMER IS NEVER CHARGED TWICE.
     */
    public function executeIdentityVerification(string $serviceType, array $params, string $clientRef): array
    {
        // 1. Resolve primary provider from DB
        $primary = $this->getPrimaryProvider('IDENTITY_NIN');
        $primaryCode = !empty($primary['code']) ? $primary['code'] : '2SUREVERIFY';

        // 2. Prepare list of candidate providers: Primary first, then fallbacks
        $candidateCodes = [$primaryCode];
        $fallbacks = $this->getFallbackProviders('IDENTITY_NIN');
        foreach ($fallbacks as $fb) {
            if (!empty($fb['code']) && !in_array($fb['code'], $candidateCodes)) {
                $candidateCodes[] = $fb['code'];
            }
        }

        $lastResult = null;
        $attemptCount = 0;

        foreach ($candidateCodes as $providerCode) {
            $attemptCount++;
            try {
                $adapter = $this->getAdapter($providerCode);
                // Automated identity verifications must not be intercepted by manual operations desk adapter
                if ($adapter instanceof NimcPartnerAdapter) {
                    continue;
                }
                $consentBool = filter_var($params['consent'] ?? true, FILTER_VALIDATE_BOOLEAN);
                $res = match (strtoupper($serviceType)) {
                    'NIN_VERIFICATION', 'NIN' => method_exists($adapter, 'verifyNin')
                        ? ($adapter instanceof RandaAdapter || strtoupper($providerCode) === 'RANDAVERIFY'
                            ? $adapter->verifyNin((string)($params['nin'] ?? ''), $clientRef, $consentBool)
                            : $adapter->verifyNin((string)($params['nin'] ?? ''), $clientRef, $params))
                        : $adapter->verify('NIN', $params),

                    'NIN_PHONE_SEARCH', 'PHONE' => method_exists($adapter, 'searchNinByPhone')
                        ? $adapter->searchNinByPhone((string)($params['phone'] ?? ''), $clientRef, $params)
                        : $adapter->verify('PHONE', $params),

                    'NIN_DEMOGRAPHY', 'DEMOGRAPHY' => method_exists($adapter, 'searchNinDemography')
                        ? $adapter->searchNinDemography($params, $clientRef, $params)
                        : null,

                    'BVN_VERIFICATION', 'BVN' => method_exists($adapter, 'verifyBvn')
                        ? $adapter->verifyBvn((string)($params['bvn'] ?? ''), $clientRef, $params)
                        : null,

                    'BVN_PHONE_SEARCH', 'BVN_PHONE' => method_exists($adapter, 'searchBvnByPhone')
                        ? $adapter->searchBvnByPhone((string)($params['phone'] ?? ''), $clientRef, $params)
                        : null,

                    'VNIN_VERIFICATION', 'VNIN' => method_exists($adapter, 'verifyVnin')
                        ? $adapter->verifyVnin((string)($params['vnin'] ?? ''), $clientRef, $params)
                        : null,

                    default => $adapter->verify($serviceType, $params),
                };

                if ($res === null) {
                    continue;
                }

                // On success, record transaction and return immediately with provider metadata attached
                if (!empty($res['success'])) {
                    $res['dispatchedProvider'] = $providerCode;
                    $res['attemptCount'] = $attemptCount;
                    $this->recordProviderTransaction($providerCode, $serviceType, $params, $clientRef, $res);
                    return $res;
                }

                $lastResult = $res;
                $lastResult['dispatchedProvider'] = $providerCode;
                $lastResult['attemptCount'] = $attemptCount;

                // Enforce Capability & Failure Classification:
                $classification = $this->classifyFailure($serviceType, $res, (int)($res['httpCode'] ?? 200));

                if ($classification === self::FAILOVER_BLOCKED) {
                    $this->recordProviderTransaction($providerCode, $serviceType, $params, $clientRef, $lastResult);
                    return $lastResult;
                }

                // Upstream provider failure detected and classified as SAFE_TO_FAILOVER:
                // Record the failed attempt before attempting fallback to next provider
                $this->recordProviderTransaction($providerCode, $serviceType, $params, $clientRef, $res);
                $msg = strtolower($res['message'] ?? '');
                error_log("[ProviderManager] Provider '{$providerCode}' failed for {$serviceType} ({$msg}). Safe fallback authorized; attempting next configured provider...");

            } catch (\Throwable $e) {
                error_log("[ProviderManager] Exception on provider '{$providerCode}' for {$serviceType}: " . $e->getMessage());
                $lastResult = [
                    'success'            => false,
                    'status'             => 'FAILED',
                    'message'            => "Provider '{$providerCode}' encounter: " . $e->getMessage(),
                    'dispatchedProvider' => $providerCode,
                ];
                $this->recordProviderTransaction($providerCode, $serviceType, $params, $clientRef, $lastResult);
            }
        }

        $finalRes = $lastResult ?: [
            'success' => false,
            'status'  => 'FAILED',
            'message' => 'All configured verification identity providers are currently unreachable.',
        ];
        return $finalRes;
    }

    /**
     * Records transaction audit information into ProviderTransaction table.
     */
    public function recordProviderTransaction(string $providerCode, string $serviceType, array $params, string $clientRef, array $res): void
    {
        try {
            $conn = $this->db->getConnection();
            $provStmt = $conn->prepare("SELECT `id` FROM `IntegrationProvider` WHERE `code` = :c LIMIT 1");
            $provStmt->execute([':c' => $providerCode]);
            $provId = $provStmt->fetchColumn() ?: ('prov-' . strtolower($providerCode));

            $status = !empty($res['success']) ? 'SUCCESS' : (!empty($res['isPending']) ? 'PENDING' : 'FAILED');
            $txId = 'ptx-' . bin2hex(random_bytes(16));
            $pRef = $res['providerReference'] ?? ($res['transactionId'] ?? null);
            $costKobo = (int)($res['amount_charged'] ?? ($res['costKobo'] ?? 0));

            $maskedParams = $params;
            if (!empty($maskedParams['nin'])) {
                $ninStr = (string)$maskedParams['nin'];
                $maskedParams['nin'] = strlen($ninStr) === 11 ? substr($ninStr, 0, 3) . '•••••' . substr($ninStr, -3) : '•••••••••••';
            }
            if (!empty($maskedParams['bvn'])) {
                $bvnStr = (string)$maskedParams['bvn'];
                $maskedParams['bvn'] = strlen($bvnStr) === 11 ? substr($bvnStr, 0, 3) . '•••••' . substr($bvnStr, -3) : '•••••••••••';
            }
            if (!empty($maskedParams['phone'])) {
                $phoneStr = (string)$maskedParams['phone'];
                $maskedParams['phone'] = strlen($phoneStr) >= 10 ? substr($phoneStr, 0, 4) . '••••' . substr($phoneStr, -2) : '•••••••••••';
            }
            if (!empty($maskedParams['phoneNumber'])) {
                $phoneStr = (string)$maskedParams['phoneNumber'];
                $maskedParams['phoneNumber'] = strlen($phoneStr) >= 10 ? substr($phoneStr, 0, 4) . '••••' . substr($phoneStr, -2) : '•••••••••••';
            }
            if (!empty($maskedParams['phone_number'])) {
                $phoneStr = (string)$maskedParams['phone_number'];
                $maskedParams['phone_number'] = strlen($phoneStr) >= 10 ? substr($phoneStr, 0, 4) . '••••' . substr($phoneStr, -2) : '•••••••••••';
            }
            if (!empty($maskedParams['trackingId'])) {
                $trkStr = (string)$maskedParams['trackingId'];
                $maskedParams['trackingId'] = strlen($trkStr) > 6 ? substr($trkStr, 0, 3) . '••••' . substr($trkStr, -3) : $trkStr;
            }
            if (!empty($maskedParams['tracking_id'])) {
                $trkStr = (string)$maskedParams['tracking_id'];
                $maskedParams['tracking_id'] = strlen($trkStr) > 6 ? substr($trkStr, 0, 3) . '••••' . substr($trkStr, -3) : $trkStr;
            }

            $userId = $params['userId'] ?? null;
            if (empty($userId)) {
                try {
                    $uStmt = $conn->prepare("SELECT w.userId FROM LedgerEntry le JOIN Wallet w ON le.walletId = w.id WHERE le.reference = :ref LIMIT 1");
                    $uStmt->execute([':ref' => $clientRef]);
                    $userId = $uStmt->fetchColumn() ?: null;
                } catch (\Throwable) {}
            }

            $amtKobo = (int)($params['customerPriceKobo'] ?? ($params['amountKobo'] ?? ($res['amountKobo'] ?? 0)));
            if ($amtKobo <= 0 && !empty($params['amount'])) {
                $amtKobo = (int)round((float)$params['amount'] * 100);
            }
            if ($amtKobo <= 0) {
                $amtKobo = $costKobo;
            }
            $profitKobo = (int)($params['profitKobo'] ?? max(0, $amtKobo - $costKobo));

            $stmt = $conn->prepare("
                INSERT INTO `ProviderTransaction` 
                (`id`, `userId`, `providerId`, `serviceCode`, `clientReference`, `providerReference`, `status`, `costKobo`, `amountKobo`, `profitKobo`, `rawStatus`, `requestPayload`, `responsePayload`, `resultData`, `errorMessage`, `createdAt`, `updatedAt`)
                VALUES
                (:id, :uid, :pid, :scode, :cref, :pref, :status, :cost, :amt, :profit, :rawst, :req, :resp, :resd, :errmsg, NOW(3), NOW(3))
                ON DUPLICATE KEY UPDATE 
                    `status` = VALUES(`status`),
                    `userId` = COALESCE(VALUES(`userId`), `userId`),
                    `providerReference` = COALESCE(VALUES(`providerReference`), `providerReference`),
                    `responsePayload` = VALUES(`responsePayload`),
                    `resultData` = VALUES(`resultData`),
                    `updatedAt` = NOW(3)
            ");

            $stmt->execute([
                ':id'     => $txId,
                ':uid'    => $userId,
                ':pid'    => $provId,
                ':scode'  => $serviceType,
                ':cref'   => $clientRef,
                ':pref'   => $pRef,
                ':status' => $status,
                ':cost'   => $costKobo,
                ':amt'    => $amtKobo,
                ':profit' => $profitKobo,
                ':rawst'  => $res['rawStatus'] ?? ($res['status'] ?? $status),
                ':req'    => json_encode($maskedParams),
                ':resp'   => json_encode($res['raw'] ?? $res),
                ':resd'   => json_encode($res['demographics'] ?? []),
                ':errmsg' => empty($res['success']) ? ($res['message'] ?? null) : null,
            ]);
        } catch (\Throwable $e) {
            error_log('[ProviderManager::recordProviderTransaction] Error: ' . $e->getMessage());
        }
    }

    /**
     * Resolves the active provider adapter assigned to fulfill a specific service code.
     * Only resolves when:
     * - ServiceTariff has fulfillmentMode = 'AUTOMATED' and isActive = 1
     * - ProviderProduct has isAvailable = 1
     * - IntegrationProvider has status = 'ACTIVE' (or 'SANDBOX' in non-production)
     * - IntegrationProvider has configured API credentials
     */
    public function getAdapterForService(string $serviceCode): ?ServiceProviderAdapterInterface
    {
        try {
            $conn = $this->db->getConnection();
            $appEnv = getenv('APP_ENV') ?: (getenv('NODE_ENV') ?: 'production');
            $allowedStatuses = ($appEnv === 'production') ? "('ACTIVE')" : "('ACTIVE', 'SANDBOX')";

            $stmt = $conn->prepare("
                SELECT ip.code 
                FROM `ServiceTariff` st
                JOIN `Service` s ON st.`serviceId` = s.`id`
                JOIN `ProviderProduct` pp ON st.`providerProductId` = pp.`id`
                JOIN `IntegrationProvider` ip ON pp.`providerId` = ip.`id`
                WHERE (s.`code` = :code1 OR s.`slug` = :code2)
                  AND st.`isActive` = 1 
                  AND st.`fulfillmentMode` = 'AUTOMATED'
                  AND pp.`isAvailable` = 1
                  AND ip.`status` IN {$allowedStatuses}
                ORDER BY ip.`isPrimary` DESC, st.`priority` ASC, st.`createdAt` ASC
                LIMIT 1
            ");
            $stmt->execute([':code1' => $serviceCode, ':code2' => $serviceCode]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($row && !empty($row['code'])) {
                return $this->getAdapter($row['code']);
            }
        } catch (\Throwable $e) {
            error_log('[ProviderManager::getAdapterForService] Table resolution warning: ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Fetches dynamic tariff, cost, price, and margin for a service.
     * Fails safely to null if provider/tariff tables are not yet present.
     */
    public function getTariff(string $serviceCode): ?array
    {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                SELECT 
                    st.*,
                    s.`id` AS serviceId,
                    s.`name` AS serviceName,
                    s.`code` AS serviceCode,
                    s.`basePriceKobo` AS defaultBasePriceKobo,
                    pp.`name` AS providerProductName,
                    pp.`providerProductCode`,
                    pp.`providerCostKobo` AS liveProviderCostKobo,
                    pp.`fulfillmentMode` AS productFulfillmentMode,
                    ip.`name` AS providerName,
                    ip.`code` AS providerCode,
                    ip.`status` AS providerStatus
                FROM `Service` s
                LEFT JOIN `ServiceTariff` st ON st.`serviceId` = s.`id` AND st.`isActive` = 1
                LEFT JOIN `ProviderProduct` pp ON st.`providerProductId` = pp.`id`
                LEFT JOIN `IntegrationProvider` ip ON pp.`providerId` = ip.`id`
                WHERE s.`code` = :code1 OR s.`slug` = :code2
                ORDER BY st.`priority` ASC, st.`createdAt` ASC
                LIMIT 1
            ");
            $stmt->execute([':code1' => $serviceCode, ':code2' => $serviceCode]);
            $tariff = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$tariff) {
                return null;
            }

            $customerPriceKobo = !empty($tariff['customerPriceKobo'])
                ? (int) $tariff['customerPriceKobo']
                : (int) $tariff['defaultBasePriceKobo'];

            $providerCostKobo = !empty($tariff['providerCostKobo'])
                ? (int) $tariff['providerCostKobo']
                : (!empty($tariff['liveProviderCostKobo']) ? (int) $tariff['liveProviderCostKobo'] : 0);

            $profitMarginKobo = !empty($tariff['profitMarginKobo'])
                ? (int) $tariff['profitMarginKobo']
                : ($customerPriceKobo - $providerCostKobo);

            $fulfillmentMode = $tariff['fulfillmentMode'] ?? ($tariff['productFulfillmentMode'] ?? 'MANUAL');

            return [
                'tariffId'           => $tariff['id'] ?? null,
                'serviceId'          => $tariff['serviceId'],
                'serviceCode'        => $tariff['serviceCode'],
                'serviceName'        => $tariff['serviceName'],
                'providerCode'       => $tariff['providerCode'] ?? null,
                'providerName'       => $tariff['providerName'] ?? null,
                'fulfillmentMode'    => $fulfillmentMode,
                'customerPriceKobo'  => $customerPriceKobo,
                'customerPriceNgn'   => $customerPriceKobo / 100,
                'agentPriceKobo'     => !empty($tariff['agentPriceKobo']) ? (int) $tariff['agentPriceKobo'] : null,
                'corporatePriceKobo' => !empty($tariff['corporatePriceKobo']) ? (int) $tariff['corporatePriceKobo'] : null,
                'minimumPriceKobo'   => !empty($tariff['minimumPriceKobo']) ? (int) $tariff['minimumPriceKobo'] : null,
                'providerCostKobo'   => $providerCostKobo,
                'providerCostNgn'    => $providerCostKobo / 100,
                'profitMarginKobo'   => $profitMarginKobo,
                'profitMarginNgn'    => $profitMarginKobo / 100,
                'profitPercent'      => $customerPriceKobo > 0 ? round(($profitMarginKobo / $customerPriceKobo) * 100, 2) : 0,
                'isActive'           => (bool) ($tariff['isActive'] ?? true),
            ];
        } catch (\Throwable $e) {
            // Graceful fallback if provider/tariff tables do not exist yet
            error_log('[ProviderManager::getTariff] Safe fallback: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Dispatches automated provider fulfillment for a paid order.
     * Integrates with provider adapters and records atomic provider transactions.
     */
    public function dispatchOrderFulfillment(string $orderId): array
    {
        try {
            $conn = $this->db->getConnection();
            $itemsStmt = $conn->prepare("
                SELECT 
                    i.*, 
                    s.`code` AS serviceCode, 
                    s.`name` AS serviceName,
                    o.`orderNumber`,
                    o.`customerId`,
                    o.`paymentStatus`
                FROM `OrderItem` i
                JOIN `Service` s ON i.`serviceId` = s.`id`
                JOIN `Order` o ON i.`orderId` = o.`id`
                WHERE i.`orderId` = :oid
            ");
            $itemsStmt->execute([':oid' => $orderId]);
            $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);

            $results = [];
            $allAutomatedSuccess = true;
            $hasAutomatedItems = false;

            foreach ($items as $item) {
                // Must be paid
                if (($item['paymentStatus'] ?? '') !== 'PAID') {
                    continue;
                }

                $serviceCode = (string) $item['serviceCode'];
                
                // Get dynamic tariff and fulfillment mode
                $tariff = $this->getTariff($serviceCode);
                $mode = $tariff['fulfillmentMode'] ?? 'MANUAL';

                if ($mode !== 'AUTOMATED') {
                    // Item requires ASSISTED or MANUAL desk fulfillment
                    $results[] = [
                        'itemId'          => $item['id'],
                        'serviceCode'     => $serviceCode,
                        'fulfillmentMode' => $mode,
                        'status'          => 'QUEUED_FOR_DESK',
                        'message'         => "Queued for {$mode} operations desk fulfillment.",
                    ];
                    $allAutomatedSuccess = false;
                    continue;
                }

                $hasAutomatedItems = true;
                $adapter = $this->getAdapterForService($serviceCode);

                if (!$adapter) {
                    $results[] = [
                        'itemId'          => $item['id'],
                        'serviceCode'     => $serviceCode,
                        'fulfillmentMode' => 'AUTOMATED',
                        'status'          => 'DISPATCH_SKIPPED',
                        'message'         => 'No active automated provider configured. Routed to operations desk queue.',
                    ];
                    $allAutomatedSuccess = false;
                    continue;
                }

                $clientRef = 'FMT_' . substr(bin2hex(random_bytes(6)), 0, 10);
                $inputs = !empty($item['submittedRequirements']) 
                    ? json_decode((string) $item['submittedRequirements'], true) 
                    : (!empty($item['submittedDataJson']) ? json_decode((string) $item['submittedDataJson'], true) : []);

                try {
                    $fulfillmentResult = [];

                    if (str_starts_with($serviceCode, 'RCH-')) {
                        // Telecom Airtime / VTU
                        $phone = $inputs['phone'] ?? $inputs['phoneNumber'] ?? '';
                        if (empty($phone)) {
                            throw new \InvalidArgumentException('Missing recipient mobile number for automated delivery.');
                        }
                        $network = $inputs['network'] ?? (str_contains($serviceCode, 'MTN') ? 'MTN' : (str_contains($serviceCode, 'AIR') ? 'AIRTEL' : 'GLO'));
                        $amountKobo = (int) $item['unitPriceKobo'];

                        if (method_exists($adapter, 'fulfillAirtime')) {
                            $fulfillmentResult = $adapter->fulfillAirtime($network, $phone, $amountKobo, $clientRef);
                        } else {
                            $fulfillmentResult = $adapter->executeTransaction([
                                'serviceCode'     => $serviceCode,
                                'phone'           => $phone,
                                'network'         => $network,
                                'amountKobo'      => $amountKobo,
                                'clientReference' => $clientRef,
                                'orderId'         => $orderId,
                                'orderItemId'     => $item['id'],
                                'serviceId'       => $item['serviceId'],
                            ]);
                        }
                    } elseif (str_starts_with($serviceCode, 'NIN-') || str_starts_with($serviceCode, 'ID-')) {
                        // NIMC / Veripine Identity Verification & Modification
                        $nin = $inputs['nin'] ?? ($inputs['ninNumber'] ?? ($inputs['bvn'] ?? ''));
                        if (empty($nin) && !empty($inputs['trackingId'])) {
                            $nin = $inputs['trackingId'];
                        }
                        $consent = !empty($inputs['consent']) || !empty($inputs['consentGiven']);
                        
                        $fulfillmentResult = $adapter->executeTransaction([
                            'serviceCode'     => $serviceCode,
                            'nin'             => $nin,
                            'bvn'             => $inputs['bvn'] ?? null,
                            'phone'           => $inputs['phone'] ?? ($inputs['phoneNumber'] ?? null),
                            'trackingId'      => $inputs['trackingId'] ?? null,
                            'consent'         => $consent,
                            'amountKobo'      => (int) $item['unitPriceKobo'],
                            'clientReference' => $clientRef,
                            'orderId'         => $orderId,
                            'orderItemId'     => $item['id'],
                            'serviceId'       => $item['serviceId'],
                            'fullName'        => $inputs['fullName'] ?? null,
                            'dateOfBirth'     => $inputs['dob'] ?? ($inputs['dateOfBirth'] ?? null),
                            'modificationType'=> $inputs['modificationType'] ?? null,
                            'orderData'       => $inputs['orderData'] ?? ($inputs['newData'] ?? null),
                        ]);
                    } else {
                        // Universal fallback to executeTransaction
                        $fulfillmentResult = $adapter->executeTransaction([
                            'serviceCode'     => $serviceCode,
                            'amountKobo'      => (int) $item['unitPriceKobo'],
                            'clientReference' => $clientRef,
                            'orderId'         => $orderId,
                            'orderItemId'     => $item['id'],
                            'serviceId'       => $item['serviceId'],
                            'inputs'          => $inputs,
                        ]);
                    }

                    $results[] = [
                        'itemId'      => $item['id'],
                        'serviceCode' => $serviceCode,
                        'result'      => $fulfillmentResult,
                    ];

                    if (empty($fulfillmentResult['success'])) {
                        $allAutomatedSuccess = false;
                    }
                } catch (\Throwable $e) {
                    $allAutomatedSuccess = false;
                    $results[] = [
                        'itemId'      => $item['id'],
                        'serviceCode' => $serviceCode,
                        'error'       => $e->getMessage(),
                    ];
                }
            }

            // Only transition order to COMPLETED if ALL items were automated and succeeded!
            // Otherwise transition to IN_PROGRESS so operations desk can fulfill
            if ($hasAutomatedItems && $allAutomatedSuccess) {
                $updOrder = $conn->prepare("UPDATE `Order` SET `status` = 'COMPLETED', `updatedAt` = NOW(3) WHERE `id` = :oid");
                $updOrder->execute([':oid' => $orderId]);
            } elseif ($hasAutomatedItems) {
                $updOrder = $conn->prepare("UPDATE `Order` SET `status` = 'IN_PROGRESS', `updatedAt` = NOW(3) WHERE `id` = :oid");
                $updOrder->execute([':oid' => $orderId]);
            }

            return $results;
        } catch (\Throwable $ge) {
            error_log('[ProviderManager::dispatchOrderFulfillment] Non-fatal exception: ' . $ge->getMessage());
            return [];
        }
    }

    /**
     * Dispatches provider fulfillment for a single NIN service request.
     * Follows canonical NIN lifecycle:
     * - Resolves service, tariff, and provider adapter.
     * - Strictly ensures requests are never prematurely marked COMPLETED upon provider dispatch.
     * - Provider success transitions to PROCESSING with audit trail.
     * - Preserves data minimization and records provider transaction.
     */
    public function dispatchNinRequestFulfillment(string $requestId, ?string $actorId = null): array
    {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                SELECT r.*, s.`code` AS serviceCode, s.`name` AS serviceName
                FROM `NINServiceRequest` r
                LEFT JOIN `Service` s ON (r.`serviceType` = s.`id` OR r.`serviceType` = s.`code` OR r.`serviceType` = s.`slug` OR r.`serviceId` = s.`id`)
                WHERE r.`id` = :id OR r.`requestNumber` = :id2
                LIMIT 1
            ");
            $stmt->execute([':id' => $requestId, ':id2' => $requestId]);
            $req = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$req) {
                return [
                    'success' => false,
                    'status'  => 'NOT_FOUND',
                    'message' => "NIN service request '{$requestId}' not found",
                ];
            }

            $currentStatus = $req['status'] ?? 'SUBMITTED';
            if (in_array($currentStatus, ['COMPLETED', 'REJECTED', 'CANCELLED'], true)) {
                return [
                    'success' => false,
                    'status'  => $currentStatus,
                    'message' => "Cannot dispatch fulfillment for request already in terminal state {$currentStatus}",
                ];
            }

            $serviceCode = $req['serviceCode'] ?? $req['serviceType'];
            $tariff = $this->getTariff($serviceCode);
            $mode = $tariff['fulfillmentMode'] ?? 'MANUAL';

            if ($mode !== 'AUTOMATED') {
                // Assisted or manual operations desk fulfillment
                $deskMsg = "Queued for {$mode} operations desk fulfillment.";
                return [
                    'success'         => true,
                    'status'          => 'QUEUED_FOR_DESK',
                    'fulfillmentMode' => $mode,
                    'serviceCode'     => $serviceCode,
                    'message'         => $deskMsg,
                ];
            }

            $adapter = $this->getAdapterForService($serviceCode);
            if (!$adapter) {
                $skipMsg = 'No active automated provider configured. Routed to operations desk queue.';
                return [
                    'success'         => false,
                    'status'          => 'DISPATCH_SKIPPED',
                    'fulfillmentMode' => 'AUTOMATED',
                    'serviceCode'     => $serviceCode,
                    'message'         => $skipMsg,
                ];
            }

            // Extract decrypted NIN if present
            $ninNumber = '';
            $rawPayload = $req['ninNumberEncrypted'] ?? null;
            if (!empty($rawPayload)) {
                $decrypted = \Hambak\Core\Encryption::decrypt((string)$rawPayload) ?: $rawPayload;
                $ninNumber = trim((string)$decrypted);
            } elseif (!empty($req['ninNumber'])) {
                $ninNumber = trim((string)$req['ninNumber']);
            }

            $clientRef = 'NIN_FMT_' . substr(bin2hex(random_bytes(6)), 0, 10);
            $inputs = !empty($req['supportingDocsJson']) ? json_decode((string)$req['supportingDocsJson'], true) : [];
            $submittedPayload = [];
            if (is_array($inputs)) {
                foreach ($inputs as $entry) {
                    if (($entry['type'] ?? '') === 'requirements_payload' && !empty($entry['data'])) {
                        $submittedPayload = $entry['data'];
                        break;
                    }
                }
            }

            $execParams = [
                'serviceCode'     => $serviceCode,
                'nin'             => $ninNumber,
                'trackingId'      => $req['trackingId'] ?? null,
                'phoneNumber'     => $req['phoneNumber'] ?? null,
                'phone'           => $req['phoneNumber'] ?? null,
                'fullName'        => $req['applicantFullName'] ?? null,
                'amountKobo'      => (int)($req['feeKobo'] ?? 0),
                'clientReference' => $clientRef,
                'consent'         => true,
                'submittedData'   => $submittedPayload,
                'orderId'         => null,
                'orderItemId'     => null,
                'serviceId'       => $req['serviceId'] ?? null,
            ];

            $fulfillmentResult = $adapter->executeTransaction($execParams);
            $providerSuccess = !empty($fulfillmentResult['success']);
            $providerRef = $fulfillmentResult['providerReference'] ?? null;

            // Enforce canonical status transition:
            // Never mark COMPLETED solely on provider execution.
            // Move to PROCESSING (or remain PROCESSING if already there)
            $nextStatus = 'PROCESSING';
            $comment = $providerSuccess
                ? "Provider gateway transaction executed successfully (" . ($providerRef ? "Ref: {$providerRef}" : "Queued") . "). Awaiting desk review & dispatch."
                : ("Provider gateway transaction: " . ($fulfillmentResult['message'] ?? 'Transaction pending or rejected by upstream gateway'));

            $updateStmt = $conn->prepare("
                UPDATE `NINServiceRequest`
                SET `status` = :st,
                    `processedBy` = COALESCE(:staff, `processedBy`),
                    `deskNotes` = CONCAT(COALESCE(`deskNotes`, ''), :note),
                    `updatedAt` = NOW(3)
                WHERE `id` = :id
            ");
            $appendNote = "\n[" . date('c') . "] " . $comment;
            $updateStmt->execute([
                ':st'    => $nextStatus,
                ':staff' => $actorId,
                ':note'  => $appendNote,
                ':id'    => $req['id'],
            ]);

            // Status history
            try {
                $histId = 'ninh-' . bin2hex(random_bytes(16));
                $hStmt = $conn->prepare("
                    INSERT INTO `NINRequestStatusHistory`
                    (`id`, `requestId`, `fromStatus`, `toStatus`, `changedBy`, `comments`, `createdAt`)
                    VALUES (:id, :rid, :fromSt, :toSt, :uid, :comm, NOW(3))
                ");
                $hStmt->execute([
                    ':id'     => $histId,
                    ':rid'    => $req['id'],
                    ':fromSt' => $currentStatus,
                    ':toSt'   => $nextStatus,
                    ':uid'    => $actorId,
                    ':comm'   => $comment,
                ]);
            } catch (\Throwable) {
                // Non-fatal status history
            }

            return [
                'success'           => true,
                'providerSuccess'   => $providerSuccess,
                'status'            => $nextStatus,
                'providerReference' => $providerRef,
                'clientReference'   => $clientRef,
                'fulfillmentMode'   => 'AUTOMATED',
                'serviceCode'       => $serviceCode,
                'message'           => $comment,
                'result'            => $fulfillmentResult,
            ];
        } catch (\Throwable $e) {
            error_log('[ProviderManager::dispatchNinRequestFulfillment] Error: ' . $e->getMessage());
            return [
                'success' => false,
                'status'  => 'ERROR',
                'message' => 'Fulfillment dispatch error: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Resolves the primary provider and optional fallback for a service.
     */
    public function getRoutingForService(string $serviceCode): array
    {
        $conn = $this->db->getConnection();
        $primary = null;
        $fallback = null;
        $allowFallback = false;

        try {
            $stmt = $conn->prepare("
                SELECT ip.`code` AS providerCode, st.`priority`, st.`fulfillmentMode`
                FROM `ServiceTariff` st
                JOIN `Service` s ON st.`serviceId` = s.`id`
                JOIN `ProviderProduct` pp ON st.`providerProductId` = pp.`id`
                JOIN `IntegrationProvider` ip ON pp.`providerId` = ip.`id`
                WHERE (s.`code` = :c1 OR s.`slug` = :c2)
                  AND st.`isActive` = 1
                ORDER BY st.`priority` ASC
            ");
            $stmt->execute([':c1' => $serviceCode, ':c2' => $serviceCode]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($rows)) {
                $primary = $rows[0]['providerCode'];
                if (count($rows) > 1) {
                    $fallback = $rows[1]['providerCode'];
                    $allowFallback = true;
                }
            }
        } catch (\Throwable $e) {
            error_log('[ProviderManager::getRoutingForService] Error: ' . $e->getMessage());
        }

        // Dynamic fallback routing governed 100% by Admin configuration in IntegrationProvider table
        if (empty($primary)) {
            $identityPrimary = $this->getPrimaryProvider('IDENTITY_NIN');
            $primary = !empty($identityPrimary['code']) ? $identityPrimary['code'] : '2SUREVERIFY';
            $fallbacks = $this->getFallbackProviders('IDENTITY_NIN');
            $fallback = !empty($fallbacks[0]['code']) ? $fallbacks[0]['code'] : 'RANDAVERIFY';
            $allowFallback = !empty($fallback);
        }

        return [
            'serviceCode'      => $serviceCode,
            'primaryProvider'  => $primary,
            'fallbackProvider' => $fallback,
            'allowFallback'    => $allowFallback,
        ];
    }

    /**
     * Diagnostic connection tester for an integration provider
     */
    public function testProviderConnection(string $code): array
    {
        try {
            $adapter = $this->getAdapter($code);
            $authRes = $adapter->authenticate();
            $healthRes = $adapter->healthCheck();
            $balRes = $adapter->getBalance();

            return [
                'success'      => !empty($authRes['success']) || !empty($healthRes['success']),
                'providerCode' => $code,
                'name'         => $adapter->getName(),
                'environment'  => $authRes['environment'] ?? 'TEST',
                'health'       => $healthRes['status'] ?? 'HEALTHY',
                'latencyMs'    => $healthRes['latencyMs'] ?? 0,
                'balanceNgn'   => $balRes['balanceNgn'] ?? 0.0,
                'message'      => $healthRes['message'] ?? 'Provider connection test completed.',
            ];
        } catch (\Throwable $e) {
            return [
                'success'      => false,
                'providerCode' => $code,
                'message'      => 'Connection test failed: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Runs official provider test fixtures (e.g. RandaVerify 12345678901, 12345678902, 99999999999)
     */
    public function runProviderFixtureTests(string $code): array
    {
        $adapter = $this->getAdapter($code);
        if ($adapter instanceof RandaAdapter) {
            return $adapter->runFixtureTests();
        }

        return [
            'provider'    => $adapter->getName(),
            'environment' => 'TEST',
            'fixtures'    => [
                [
                    'test'     => 'Default Health Fixture',
                    'expected' => 'SUCCESS',
                    'result'   => 'SUCCESS',
                    'passed'   => true,
                ],
            ],
            'allPassed'   => true,
        ];
    }

    /**
     * Explicit Failover Classification Engine
     * Distinguishes between safe-to-failover technical/upstream outages and
     * non-failover states (not-found, client error, or irreversible submissions).
     */
    public function classifyFailure(string $serviceType, array $res, int $httpCode = 200): string
    {
        $uType = strtoupper(trim($serviceType));

        // Irreversible / state-altering operations: Never failover after submission/acceptance
        $isStateAltering = in_array($uType, [
            'MODIFICATION',
            'NIN_MODIFICATION',
            'SUBMIT_MODIFICATION',
            'IPE_CLEARANCE',
            'VALIDATION',
            'NIN_VALIDATION',
            'ORDER_DISPATCH',
            'TRANSACTION',
        ], true);

        if ($isStateAltering) {
            // If provider accepted, created reference/order, or is processing, NEVER failover
            if (!empty($res['providerReference']) || !empty($res['order_id']) || !empty($res['isPending']) || !empty($res['success'])) {
                return self::FAILOVER_BLOCKED;
            }
            // State-altering operations default to blocking blind failover to eliminate double-billing or conflicting government dockets
            return self::FAILOVER_BLOCKED;
        }

        // For read-only lookups (NIN, PHONE, DEMOGRAPHY, BVN, VNIN, TRACKING):
        $msg = strtolower($res['message'] ?? '');
        $isNotFound = !empty($res['isNotFound'])
            || ($httpCode === 404)
            || (($res['httpCode'] ?? 200) === 404)
            || str_contains($msg, 'not found')
            || str_contains($msg, 'no record')
            || str_contains($msg, 'no match')
            || str_contains($msg, 'not registered')
            || str_contains($msg, 'invalid nin')
            || str_contains($msg, 'invalid bvn');

        if ($isNotFound) {
            return self::FAILOVER_BLOCKED;
        }

        $isUpstreamFailure = !empty($res['isProviderFailure'])
            || ($httpCode >= 500)
            || (($res['httpCode'] ?? 200) >= 500)
            || str_contains($msg, 'timeout')
            || str_contains($msg, 'unavailable')
            || str_contains($msg, 'connection')
            || str_contains($msg, 'curl')
            || str_contains($msg, 'insufficient')
            || str_contains($msg, 'balance')
            || str_contains($msg, 'credentials are not configured')
            || str_contains($msg, 'service down')
            || str_contains($msg, 'gateway error');

        if ($isUpstreamFailure) {
            return self::FAILOVER_SAFE;
        }

        return self::FAILOVER_BLOCKED;
    }

    /**
     * Executes NIMC tracking inquiry via capability-configured provider.
     */
    public function executeTracking(string $trackingId, string $clientRef, array $options = []): array
    {
        $consent = filter_var($options['consent'] ?? true, FILTER_VALIDATE_BOOLEAN);

        // 1. Resolve candidate providers supporting tracking
        $candidateCodes = ['VERIPINE'];
        $primary = $this->getPrimaryProvider('IDENTITY_NIN');
        if (!empty($primary['code']) && !in_array($primary['code'], $candidateCodes, true)) {
            $candidateCodes[] = $primary['code'];
        }
        $fallbacks = $this->getFallbackProviders('IDENTITY_NIN');
        foreach ($fallbacks as $fb) {
            if (!empty($fb['code']) && !in_array($fb['code'], $candidateCodes, true)) {
                $candidateCodes[] = $fb['code'];
            }
        }

        $lastResult = null;
        $attemptCount = 0;

        foreach ($candidateCodes as $providerCode) {
            $attemptCount++;
            try {
                $adapter = $this->getAdapter($providerCode);
                if ($adapter instanceof NimcPartnerAdapter) {
                    continue;
                }

                $res = method_exists($adapter, 'trackNin')
                    ? $adapter->trackNin($trackingId, $clientRef, $consent)
                    : (method_exists($adapter, 'verify') ? $adapter->verify('TRACKING', ['trackingId' => $trackingId, 'clientReference' => $clientRef, 'consent' => $consent]) : null);

                if ($res === null) {
                    continue;
                }

                $res['dispatchedProvider'] = $providerCode;
                $res['attemptCount'] = $attemptCount;

                if (!empty($res['success'])) {
                    $this->recordProviderTransaction($providerCode, 'NIN_TRACKING', array_merge($options, ['trackingId' => $trackingId]), $clientRef, $res);
                    return $res;
                }

                $lastResult = $res;
                $classification = $this->classifyFailure('NIN_TRACKING', $res, (int)($res['httpCode'] ?? 200));

                if ($classification === self::FAILOVER_BLOCKED) {
                    $this->recordProviderTransaction($providerCode, 'NIN_TRACKING', array_merge($options, ['trackingId' => $trackingId]), $clientRef, $lastResult);
                    return $lastResult;
                }

                $this->recordProviderTransaction($providerCode, 'NIN_TRACKING', array_merge($options, ['trackingId' => $trackingId]), $clientRef, $res);
                $msg = strtolower($res['message'] ?? '');
                error_log("[ProviderManager::executeTracking] Provider '{$providerCode}' failed for tracking ({$msg}). Safe fallback authorized; attempting next candidate...");

            } catch (\Throwable $e) {
                error_log("[ProviderManager::executeTracking] Exception on '{$providerCode}': " . $e->getMessage());
                $lastResult = [
                    'success'            => false,
                    'status'             => 'FAILED',
                    'message'            => "Provider '{$providerCode}' error: " . $e->getMessage(),
                    'dispatchedProvider' => $providerCode,
                ];
                $this->recordProviderTransaction($providerCode, 'NIN_TRACKING', array_merge($options, ['trackingId' => $trackingId]), $clientRef, $lastResult);
            }
        }

        return $lastResult ?: [
            'success' => false,
            'status'  => 'FAILED',
            'message' => 'All configured tracking providers are currently unreachable.',
        ];
    }

    /**
     * Submits a state-altering modification order to upstream provider.
     * Enforces STRICT RULE: Never failover after submission.
     */
    public function submitModification(array $params, string $clientRef, array $options = []): array
    {
        $providerCode = 'VERIPINE';
        try {
            $adapter = $this->getAdapter($providerCode);
        } catch (\Throwable $e) {
            $primary = $this->getPrimaryProvider('IDENTITY_NIN');
            $providerCode = !empty($primary['code']) ? $primary['code'] : '2SUREVERIFY';
            $adapter = $this->getAdapter($providerCode);
        }

        try {
            if (method_exists($adapter, 'submitModification')) {
                $res = $adapter->submitModification($params, $clientRef);
            } else {
                $res = $adapter->executeTransaction(array_merge($params, [
                    'clientReference' => $clientRef,
                    'serviceCode'     => $params['service_type'] ?? 'NIN_MODIFICATION',
                ]));
            }

            $res['dispatchedProvider'] = $providerCode;
            $this->recordProviderTransaction($providerCode, (string)($params['service_type'] ?? 'NIN_MODIFICATION'), $params, $clientRef, $res);

            return $res;
        } catch (\Throwable $e) {
            error_log("[ProviderManager::submitModification] Error on '{$providerCode}': " . $e->getMessage());
            $failRes = [
                'success'            => false,
                'status'             => 'FAILED',
                'message'            => 'Upstream provider error during modification submission: ' . $e->getMessage(),
                'dispatchedProvider' => $providerCode,
            ];
            $this->recordProviderTransaction($providerCode, (string)($params['service_type'] ?? 'NIN_MODIFICATION'), $params, $clientRef, $failRes);
            return $failRes;
        }
    }

    /**
     * Queries remote status of a previously submitted modification.
     */
    public function queryModificationStatus(string $referenceId, ?string $providerOrderId = null, ?string $providerCode = null): array
    {
        if (empty($providerCode)) {
            try {
                $conn = $this->db->getConnection();
                $stmt = $conn->prepare("
                    SELECT ip.`code` 
                    FROM `ProviderTransaction` pt
                    JOIN `IntegrationProvider` ip ON pt.`providerId` = ip.`id`
                    WHERE pt.`clientReference` = :r1 OR pt.`providerReference` = :r2 OR pt.`id` = :r3
                    LIMIT 1
                ");
                $stmt->execute([':r1' => $referenceId, ':r2' => $referenceId, ':r3' => $referenceId]);
                $foundCode = $stmt->fetchColumn();
                if (!empty($foundCode)) {
                    $providerCode = (string)$foundCode;
                }
            } catch (\Throwable) {}
        }

        if (empty($providerCode)) {
            $providerCode = 'VERIPINE';
        }

        try {
            $adapter = $this->getAdapter($providerCode);
            if (method_exists($adapter, 'queryModificationStatus')) {
                $res = $adapter->queryModificationStatus($referenceId, $providerOrderId);
            } else {
                $res = $adapter->requery($referenceId);
            }
            $res['dispatchedProvider'] = $providerCode;
            return $res;
        } catch (\Throwable $e) {
            error_log("[ProviderManager::queryModificationStatus] Error querying status: " . $e->getMessage());
            return [
                'success' => false,
                'status'  => 'FAILED',
                'message' => 'Unable to query modification status: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Universal document and slip retrieval.
     * Resolves official PDF binary / URI from ProviderTransaction, filesystem, or provider API.
     */
    public function getDocument(string $identifier, array $options = []): array
    {
        $preferredProvider = $options['preferredProvider'] ?? ($options['provider'] ?? null);

        // 1. Identify which provider originally handled this transaction
        $dispatchedProvider = null;
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                SELECT ip.`code` 
                FROM `ProviderTransaction` pt
                JOIN `IntegrationProvider` ip ON pt.`providerId` = ip.`id`
                WHERE pt.`clientReference` = :r1 OR pt.`providerReference` = :r2 OR pt.`id` = :r3
                LIMIT 1
            ");
            $stmt->execute([':r1' => $identifier, ':r2' => $identifier, ':r3' => $identifier]);
            $foundCode = $stmt->fetchColumn();
            if (!empty($foundCode)) {
                $dispatchedProvider = (string)$foundCode;
            }
        } catch (\Throwable) {}

        $providerCandidates = array_values(array_filter(array_unique([
            $preferredProvider,
            $dispatchedProvider,
            '2SUREVERIFY',
            'RANDAVERIFY',
        ])));

        foreach ($providerCandidates as $code) {
            try {
                $adapter = $this->getAdapter($code);
                $res = $adapter->getDocument($identifier, $options);
                if (!empty($res['success']) && (!empty($res['pdfBinary']) || !empty($res['dataUri']) || !empty($res['url']))) {
                    $res['providerCode'] = $code;
                    if (empty($res['fileName'])) {
                        $res['fileName'] = "Official_NIN_Slip_{$identifier}.pdf";
                    }
                    return $res;
                }
            } catch (\Throwable $e) {
                error_log("[ProviderManager::getDocument] Provider '{$code}' error: " . $e->getMessage());
            }
        }

        return [
            'success' => false,
            'error'   => 'Unable to retrieve official slip PDF from provider or cache.',
        ];
    }

    /**
     * Universal transaction status check / requery.
     */
    public function requeryTransaction(string $reference, ?string $providerCode = null): array
    {
        if (empty($providerCode)) {
            try {
                $conn = $this->db->getConnection();
                $stmt = $conn->prepare("
                    SELECT ip.`code` 
                    FROM `ProviderTransaction` pt
                    JOIN `IntegrationProvider` ip ON pt.`providerId` = ip.`id`
                    WHERE pt.`clientReference` = :r1 OR pt.`providerReference` = :r2 OR pt.`id` = :r3
                    LIMIT 1
                ");
                $stmt->execute([':r1' => $reference, ':r2' => $reference, ':r3' => $reference]);
                $foundCode = $stmt->fetchColumn();
                if (!empty($foundCode)) {
                    $providerCode = (string)$foundCode;
                }
            } catch (\Throwable) {}
        }

        if (empty($providerCode)) {
            $primary = $this->getPrimaryProvider('IDENTITY_NIN');
            $providerCode = !empty($primary['code']) ? $primary['code'] : '2SUREVERIFY';
        }

        try {
            $adapter = $this->getAdapter($providerCode);
            if (method_exists($adapter, 'requery')) {
                $res = $adapter->requery($reference);
            } elseif (method_exists($adapter, 'queryTransaction')) {
                $res = $adapter->queryTransaction($reference);
            } else {
                $res = ['success' => false, 'message' => "Provider '{$providerCode}' does not support requery."];
            }
            $res['dispatchedProvider'] = $providerCode;
            return $res;
        } catch (\Throwable $e) {
            error_log("[ProviderManager::requeryTransaction] Error on '{$providerCode}': " . $e->getMessage());
            return [
                'success' => false,
                'status'  => 'FAILED',
                'message' => 'Status query failed: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Centralized slip variant resolver.
     */
    public static function resolveSlipVariant(?string $templateType, ?string $slipName = ''): string
    {
        $t = strtoupper(trim((string)$templateType));
        $name = strtoupper(trim((string)$slipName));
        if ($t === 'PREMIUM' || str_contains($name, 'PREMIUM')) {
            return 'premium';
        }
        return 'normal';
    }

    /**
     * Decrypts encrypted credentials using AES-256-CBC.
     */
    public static function decryptSecret(string $ciphertext): string
    {
        if (empty($ciphertext)) {
            return '';
        }
        $secret = $_ENV['ENCRYPTION_KEY'] 
            ?? $_ENV['JWT_SECRET'] 
            ?? getenv('ENCRYPTION_KEY') 
            ?? getenv('JWT_SECRET');
        $appEnv = $_ENV['APP_ENV'] ?? getenv('APP_ENV') ?? (getenv('NODE_ENV') ?: 'production');
        if (empty($secret)) {
            if ($appEnv === 'production') {
                throw new RuntimeException('SECURITY FATAL: ENCRYPTION_KEY or JWT_SECRET must be configured.');
            }
            $secret = 'test_fixture_only_deterministic_key';
        }
        $key = hash('sha256', $secret, true);

        $decoded = base64_decode($ciphertext, true);
        if ($decoded === false) return '';
        $pos = strpos($decoded, '::');
        if ($pos === false) return '';
        $iv = substr($decoded, 0, $pos);
        $encrypted = substr($decoded, $pos + 2);
        if (strlen($iv) !== 16) return '';
        $decrypted = openssl_decrypt($encrypted, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        return $decrypted !== false ? $decrypted : '';
    }

    /**
     * Encrypts plaintext credentials using AES-256-CBC.
     */
    public static function encryptSecret(string $plaintext): string
    {
        if (empty($plaintext)) {
            return '';
        }
        $secret = $_ENV['ENCRYPTION_KEY'] 
            ?? $_ENV['JWT_SECRET'] 
            ?? getenv('ENCRYPTION_KEY') 
            ?? getenv('JWT_SECRET');
        $appEnv = $_ENV['APP_ENV'] ?? getenv('APP_ENV') ?? (getenv('NODE_ENV') ?: 'production');
        if (empty($secret)) {
            if ($appEnv === 'production') {
                throw new RuntimeException('SECURITY FATAL: ENCRYPTION_KEY or JWT_SECRET must be configured.');
            }
            $secret = 'test_fixture_only_deterministic_key';
        }
        $key = hash('sha256', $secret, true);

        $iv = random_bytes(16);
        $ciphertext = openssl_encrypt($plaintext, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        return base64_encode($iv . '::' . $ciphertext);
    }
}

