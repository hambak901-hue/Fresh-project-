<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use PDO;

/**
 * Service Catalog Business Logic Service
 */
class ServiceCatalogService
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function getCategories(): array
    {
        $stmt = $this->db->getConnection()->query(
            'SELECT `id`, `code`, `name`, `slug`, `description`, `icon`, `displayOrder`
             FROM `ServiceCategory`
             ORDER BY `displayOrder` ASC, `name` ASC'
        );
        return $stmt->fetchAll();
    }

    public function getServices(?string $categorySlug = null, ?string $search = null): array
    {
        $conn = $this->db->getConnection();
        $sql = 'SELECT s.`id`, s.`code`, s.`name`, s.`slug`, s.`categoryId`, s.`shortDescription`, s.`fullDescription`,
                       s.`icon`, s.`imageUrl`,
                       COALESCE(st.`customerPriceKobo`, s.`basePriceKobo`) AS `basePriceKobo`,
                       s.`bulkPriceKobo`, s.`buyingPriceKobo`, s.`pricingType`,
                       s.`unit`, s.`currency`, s.`status`, s.`isFeatured`, s.`deliveryTimeEstimate`, s.`features`,
                       c.`name` AS `categoryName`, c.`slug` AS `categorySlug`,
                       COALESCE(st.`fulfillmentMode`, s.`fulfillmentMode`, \'MANUAL\') AS `fulfillmentMode`,
                       s.`isAvailable`, s.`customerInstructions`, s.`adminInstructions`,
                       s.`providerId`, s.`providerProductCode`, s.`providerProductId`
                FROM `Service` s
                JOIN `ServiceCategory` c ON s.`categoryId` = c.`id`
                LEFT JOIN `ServiceTariff` st ON st.`serviceId` = s.`id` AND st.`isActive` = 1
                WHERE s.`status` IN (\'ACTIVE\', \'COMING_SOON\', \'MAINTENANCE\')
                  AND s.`status` != \'DISABLED\'
                  AND (s.`fulfillmentMode` IS NULL OR s.`fulfillmentMode` != \'DISABLED\')
                  AND (st.`fulfillmentMode` IS NULL OR st.`fulfillmentMode` != \'DISABLED\')';
        
        $params = [];
        if (!empty($categorySlug)) {
            $sql .= ' AND (c.`slug` = :catSlug OR c.`code` = :catCode OR c.`id` = :catId)';
            $params[':catSlug'] = $categorySlug;
            $params[':catCode'] = $categorySlug;
            $params[':catId'] = $categorySlug;
        }
        if (!empty($search)) {
            $sql .= ' AND (s.`name` LIKE :searchName OR s.`shortDescription` LIKE :searchDesc OR s.`code` LIKE :searchCode)';
            $params[':searchName'] = '%' . $search . '%';
            $params[':searchDesc'] = '%' . $search . '%';
            $params[':searchCode'] = '%' . $search . '%';
        }

        $sql .= ' ORDER BY s.`isFeatured` DESC, s.`name` ASC';

        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $services = $stmt->fetchAll();

        foreach ($services as &$s) {
            $s = $this->enrichService($s);
        }

        return $services;
    }

    private function enrichService(array $s): array
    {
        $baseKobo = (int)($s['basePriceKobo'] ?? 0);
        $bulkKobo = isset($s['bulkPriceKobo']) && $s['bulkPriceKobo'] !== null ? (int)$s['bulkPriceKobo'] : null;
        $buyingKobo = isset($s['buyingPriceKobo']) && $s['buyingPriceKobo'] !== null ? (int)$s['buyingPriceKobo'] : null;

        $priceNaira = (float)($baseKobo / 100);
        $s['basePriceKobo'] = $baseKobo;
        $s['bulkPriceKobo'] = $bulkKobo;
        $s['buyingPriceKobo'] = $buyingKobo;

        // Authoritative pricing in Nigerian Naira for all frontend callers
        $s['price'] = $priceNaira;
        $s['basePrice'] = $priceNaira;
        $s['customer_price'] = $priceNaira;
        $s['customerPriceNgn'] = $priceNaira;
        $s['priceNgn'] = $priceNaira;
        $s['amount'] = $priceNaira;
        $s['bulkPrice'] = $bulkKobo !== null ? (float)($bulkKobo / 100) : null;
        $s['buyingPrice'] = $buyingKobo !== null ? (float)($buyingKobo / 100) : null;

        // Metadata and UI compatibility fields
        $s['category'] = $s['categoryName'] ?? ($s['categorySlug'] ?? 'General');
        $s['description'] = !empty($s['shortDescription']) ? $s['shortDescription'] : (!empty($s['fullDescription']) ? $s['fullDescription'] : $s['name']);
        $s['turnaroundTime'] = !empty($s['deliveryTimeEstimate']) ? $s['deliveryTimeEstimate'] : '24-48 Hours';
        $s['isVariablePrice'] = (($s['pricingType'] ?? '') === 'VARIABLE' || $baseKobo === 0);

        $s['isFeatured'] = (bool)($s['isFeatured'] ?? false);
        $s['features'] = is_string($s['features'] ?? null) ? json_decode($s['features'], true) : ($s['features'] ?? []);

        // Authoritative Phase 5 fields
        $rawAvail = !isset($s['isAvailable']) || (int)$s['isAvailable'] === 1;
        $s['rawIsAvailable'] = $rawAvail;
        $s['isAvailable'] = $rawAvail && ($s['status'] ?? 'ACTIVE') === 'ACTIVE' && (($s['fulfillmentMode'] ?? '') !== 'DISABLED');
        $s['fulfillmentMode'] = $s['fulfillmentMode'] ?? 'MANUAL';
        $s['imageUrl'] = $s['imageUrl'] ?? null;
        $s['customerInstructions'] = $s['customerInstructions'] ?? null;
        $s['adminInstructions'] = $s['adminInstructions'] ?? null;
        $s['providerId'] = $s['providerId'] ?? null;
        $s['providerProductCode'] = $s['providerProductCode'] ?? null;
        $s['providerProductId'] = $s['providerProductId'] ?? null;

        return $s;
    }

    public function getServiceBySlug(string $slug): ?array
    {
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare(
            'SELECT s.*, 
                    COALESCE(st.`customerPriceKobo`, s.`basePriceKobo`) AS `basePriceKobo`,
                    COALESCE(st.`fulfillmentMode`, \'MANUAL\') AS `fulfillmentMode`,
                    c.`name` AS `categoryName`, c.`slug` AS `categorySlug`
             FROM `Service` s
             JOIN `ServiceCategory` c ON s.`categoryId` = c.`id`
             LEFT JOIN `ServiceTariff` st ON st.`serviceId` = s.`id` AND st.`isActive` = 1
             WHERE (s.`id` = :ident1 OR s.`slug` = :ident2 OR s.`code` = :ident3)
             LIMIT 1'
        );
        $stmt->execute([
            ':ident1' => $slug,
            ':ident2' => $slug,
            ':ident3' => $slug,
        ]);
        $service = $stmt->fetch();

        if (!$service) return null;

        $service = $this->enrichService($service);
        $service['isAvailable'] = ($service['status'] === 'ACTIVE' && ($service['fulfillmentMode'] ?? '') !== 'DISABLED');

        // Fetch requirements
        $reqStmt = $conn->prepare('SELECT * FROM `ServiceRequirement` WHERE `serviceId` = :sid ORDER BY `displayOrder` ASC');
        $reqStmt->execute([':sid' => $service['id']]);
        $service['requirements'] = $reqStmt->fetchAll();

        return $service;
    }

    public function getServicesForAdmin(?string $category = null, ?string $search = null, ?string $status = null, ?string $availability = null, ?string $fulfillment = null, ?string $provider = null): array
    {
        $conn = $this->db->getConnection();
        $sql = 'SELECT s.*, 
                       c.`name` AS `categoryName`, c.`slug` AS `categorySlug`,
                       st.`customerPriceKobo` AS `tariffCustomerPriceKobo`,
                       st.`providerCostKobo` AS `tariffProviderCostKobo`,
                       st.`agentPriceKobo` AS `tariffAgentPriceKobo`,
                       st.`corporatePriceKobo` AS `tariffCorporatePriceKobo`,
                       st.`minimumPriceKobo` AS `tariffMinimumPriceKobo`,
                       COALESCE(s.`fulfillmentMode`, st.`fulfillmentMode`, \'MANUAL\') AS `fulfillmentMode`,
                       st.`providerProductId`,
                       st.`isActive` AS `tariffIsActive`
                FROM `Service` s
                JOIN `ServiceCategory` c ON s.`categoryId` = c.`id`
                LEFT JOIN `ServiceTariff` st ON st.`serviceId` = s.`id`
                WHERE 1=1';
        
        $params = [];
        if (!empty($category) && $category !== 'ALL') {
            $sql .= ' AND (c.`slug` = :catSlug OR c.`code` = :catCode OR c.`id` = :catId)';
            $params[':catSlug'] = $category;
            $params[':catCode'] = $category;
            $params[':catId'] = $category;
        }
        if (!empty($search)) {
            $sql .= ' AND (s.`name` LIKE :searchName OR s.`code` LIKE :searchCode OR s.`shortDescription` LIKE :searchDesc)';
            $params[':searchName'] = '%' . $search . '%';
            $params[':searchCode'] = '%' . $search . '%';
            $params[':searchDesc'] = '%' . $search . '%';
        }
        if (!empty($status) && $status !== 'ALL') {
            $sql .= ' AND s.`status` = :status';
            $params[':status'] = $status;
        }
        if (!empty($availability) && $availability !== 'ALL') {
            if ($availability === 'AVAILABLE') {
                $sql .= ' AND s.`isAvailable` = 1';
            } else if ($availability === 'UNAVAILABLE') {
                $sql .= ' AND (s.`isAvailable` = 0 OR s.`isAvailable` IS NULL)';
            }
        }
        if (!empty($fulfillment) && $fulfillment !== 'ALL') {
            $sql .= ' AND (s.`fulfillmentMode` = :fulfillment OR st.`fulfillmentMode` = :fulfillment)';
            $params[':fulfillment'] = $fulfillment;
        }
        if (!empty($provider) && $provider !== 'ALL') {
            $sql .= ' AND (s.`providerId` = :providerId OR st.`providerProductId` IN (SELECT `id` FROM `ProviderProduct` WHERE `providerId` = :providerId))';
            $params[':providerId'] = $provider;
        }

        $sql .= ' ORDER BY c.`displayOrder` ASC, s.`isFeatured` DESC, s.`name` ASC';

        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $services = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($services as &$s) {
            $s = $this->enrichService($s);
        }

        return $services;
    }

    public function getServiceById(string $id): ?array
    {
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare('SELECT s.*, c.`name` AS `categoryName`, c.`slug` AS `categorySlug` FROM `Service` s JOIN `ServiceCategory` c ON s.`categoryId` = c.`id` WHERE s.`id` = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $service = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$service) return null;

        return $this->enrichService($service);
    }

    /**
     * Validate provider and provider product mapping integrity
     */
    public function validateProviderMapping(array $data, ?string $currentServiceId = null): void
    {
        $conn = $this->db->getConnection();
        $providerId = !empty($data['providerId']) ? trim((string)$data['providerId']) : null;
        $providerProductId = !empty($data['providerProductId']) ? trim((string)$data['providerProductId']) : null;
        $fulfillmentMode = $data['fulfillmentMode'] ?? null;

        if ($providerId !== null) {
            $pStmt = $conn->prepare("SELECT `id`, `name`, `status` FROM `IntegrationProvider` WHERE `id` = :pid LIMIT 1");
            $pStmt->execute([':pid' => $providerId]);
            $provider = $pStmt->fetch(PDO::FETCH_ASSOC);
            if (!$provider) {
                throw new \InvalidArgumentException("Provider '{$providerId}' does not exist.");
            }
        }

        if ($providerProductId !== null) {
            $ppStmt = $conn->prepare("SELECT `id`, `providerId`, `name`, `isAvailable`, `fulfillmentMode` FROM `ProviderProduct` WHERE `id` = :ppid LIMIT 1");
            $ppStmt->execute([':ppid' => $providerProductId]);
            $product = $ppStmt->fetch(PDO::FETCH_ASSOC);
            if (!$product) {
                throw new \InvalidArgumentException("Provider product '{$providerProductId}' does not exist.");
            }

            // Check provider ownership if providerId is also given
            if ($providerId !== null && $product['providerId'] !== $providerId) {
                throw new \InvalidArgumentException("Provider product '{$providerProductId}' does not belong to provider '{$providerId}'.");
            }

            // If fulfillmentMode is AUTOMATED, verify the product is available and not disabled
            if ($fulfillmentMode === 'AUTOMATED') {
                if (isset($product['isAvailable']) && (int)$product['isAvailable'] === 0) {
                    throw new \InvalidArgumentException("Cannot set AUTOMATED fulfillment: provider product '{$product['name']}' is currently unavailable.");
                }
                if (($product['fulfillmentMode'] ?? '') === 'DISABLED') {
                    throw new \InvalidArgumentException("Cannot set AUTOMATED fulfillment: provider product '{$product['name']}' has fulfillment disabled.");
                }
            }
        }
    }

    public function createService(array $data): array
    {
        $this->validateProviderMapping($data);
        $conn = $this->db->getConnection();
        $id = $data['id'] ?? ('srv_' . bin2hex(random_bytes(8)));
        $code = strtoupper(trim((string)($data['code'] ?? '')));
        $name = trim((string)($data['name'] ?? ''));
        $slug = $data['slug'] ?? strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $code), '-'));
        $categoryId = $data['categoryId'] ?? '';
        $shortDesc = $data['shortDescription'] ?? $name;
        $fullDesc = $data['fullDescription'] ?? $shortDesc;
        $icon = $data['icon'] ?? 'Sparkles';
        $imageUrl = !empty($data['imageUrl']) ? trim((string)$data['imageUrl']) : null;
        $basePriceKobo = (int)($data['basePriceKobo'] ?? 0);
        $bulkPriceKobo = isset($data['bulkPriceKobo']) && $data['bulkPriceKobo'] !== null ? (int)$data['bulkPriceKobo'] : null;
        $buyingPriceKobo = isset($data['buyingPriceKobo']) && $data['buyingPriceKobo'] !== null ? (int)$data['buyingPriceKobo'] : null;
        $pricingType = in_array($data['pricingType'] ?? '', ['FIXED', 'VARIABLE', 'BULK', 'UNIT_RATE', 'TIERED'], true) ? $data['pricingType'] : 'FIXED';
        $unit = $data['unit'] ?? null;
        $currency = $data['currency'] ?? 'NGN';
        $status = in_array($data['status'] ?? '', ['ACTIVE', 'INACTIVE', 'COMING_SOON', 'MAINTENANCE', 'DISABLED'], true) ? $data['status'] : 'ACTIVE';
        $isFeatured = !empty($data['isFeatured']) ? 1 : 0;
        $deliveryTimeEstimate = $data['deliveryTimeEstimate'] ?? 'Instant - 24 Hours';
        $features = isset($data['features']) ? (is_string($data['features']) ? $data['features'] : json_encode($data['features'])) : json_encode([]);

        $fulfillmentMode = in_array($data['fulfillmentMode'] ?? '', ['AUTOMATED', 'ASSISTED', 'MANUAL', 'DISABLED'], true) ? $data['fulfillmentMode'] : 'MANUAL';
        $isAvailable = isset($data['isAvailable']) ? (!empty($data['isAvailable']) ? 1 : 0) : 1;
        $providerId = !empty($data['providerId']) ? trim((string)$data['providerId']) : null;
        $providerProductCode = !empty($data['providerProductCode']) ? trim((string)$data['providerProductCode']) : null;
        $providerProductId = !empty($data['providerProductId']) ? trim((string)$data['providerProductId']) : null;
        $customerInstructions = !empty($data['customerInstructions']) ? trim((string)$data['customerInstructions']) : null;
        $adminInstructions = !empty($data['adminInstructions']) ? trim((string)$data['adminInstructions']) : null;

        $stmt = $conn->prepare(
            'INSERT INTO `Service` (
                `id`, `code`, `name`, `slug`, `categoryId`, `shortDescription`, `fullDescription`,
                `icon`, `imageUrl`, `basePriceKobo`, `bulkPriceKobo`, `buyingPriceKobo`, `pricingType`,
                `unit`, `currency`, `status`, `isFeatured`, `deliveryTimeEstimate`, `features`,
                `fulfillmentMode`, `isAvailable`, `providerId`, `providerProductCode`, `providerProductId`,
                `customerInstructions`, `adminInstructions`,
                `createdAt`, `updatedAt`
            ) VALUES (
                :id, :code, :name, :slug, :catId, :shortDesc, :fullDesc,
                :icon, :imageUrl, :basePrice, :bulkPrice, :buyingPrice, :pricingType,
                :unit, :curr, :status, :isFeatured, :delivery, :features,
                :fulfillmentMode, :isAvailable, :providerId, :providerProductCode, :providerProductId,
                :customerInstructions, :adminInstructions,
                NOW(3), NOW(3)
            )'
        );

        $stmt->execute([
            ':id' => $id,
            ':code' => $code,
            ':name' => $name,
            ':slug' => $slug,
            ':catId' => $categoryId,
            ':shortDesc' => $shortDesc,
            ':fullDesc' => $fullDesc,
            ':icon' => $icon,
            ':imageUrl' => $imageUrl,
            ':basePrice' => $basePriceKobo,
            ':bulkPrice' => $bulkPriceKobo,
            ':buyingPrice' => $buyingPriceKobo,
            ':pricingType' => $pricingType,
            ':unit' => $unit,
            ':curr' => $currency,
            ':status' => $status,
            ':isFeatured' => $isFeatured,
            ':delivery' => $deliveryTimeEstimate,
            ':features' => $features,
            ':fulfillmentMode' => $fulfillmentMode,
            ':isAvailable' => $isAvailable,
            ':providerId' => $providerId,
            ':providerProductCode' => $providerProductCode,
            ':providerProductId' => $providerProductId,
            ':customerInstructions' => $customerInstructions,
            ':adminInstructions' => $adminInstructions,
        ]);

        // Automatically synchronize default ServiceTariff entry
        $tariffStmt = $conn->prepare(
            'INSERT INTO `ServiceTariff` (
                `id`, `serviceId`, `customerPriceKobo`, `providerCostKobo`,
                `agentPriceKobo`, `corporatePriceKobo`, `minimumPriceKobo`,
                `profitMarginKobo`, `fulfillmentMode`, `providerProductId`, `priority`, `isActive`,
                `createdAt`, `updatedAt`
            ) VALUES (
                :tid, :sid, :custPrice, :costPrice,
                :agentPrice, :corpPrice, :minPrice,
                :margin, :fulfillmentMode, :providerProductId, 1, 1,
                NOW(3), NOW(3)
            ) ON DUPLICATE KEY UPDATE 
                `customerPriceKobo` = VALUES(`customerPriceKobo`),
                `fulfillmentMode` = VALUES(`fulfillmentMode`),
                `providerProductId` = VALUES(`providerProductId`),
                `updatedAt` = NOW(3)'
        );
        $tariffId = 'trf_' . bin2hex(random_bytes(8));
        $costKobo = $buyingPriceKobo ?? 0;
        $marginKobo = max(0, $basePriceKobo - $costKobo);
        $agentKobo = (int)round($basePriceKobo * 0.96);
        $corpKobo = (int)round($basePriceKobo * 0.94);
        $minKobo = (int)round($basePriceKobo * 0.90);

        $tariffStmt->execute([
            ':tid' => $tariffId,
            ':sid' => $id,
            ':custPrice' => $basePriceKobo,
            ':costPrice' => $costKobo,
            ':agentPrice' => $agentKobo,
            ':corpPrice' => $corpKobo,
            ':minPrice' => $minKobo,
            ':margin' => $marginKobo,
            ':fulfillmentMode' => $fulfillmentMode,
            ':providerProductId' => $providerProductId,
        ]);

        return $this->getServiceById($id) ?? ['id' => $id, 'code' => $code, 'name' => $name];
    }

    public function updateService(string $id, array $data): ?array
    {
        $conn = $this->db->getConnection();

        if (array_key_exists('providerId', $data) || array_key_exists('providerProductId', $data) || isset($data['fulfillmentMode'])) {
            $currStmt = $conn->prepare("SELECT `providerId`, `providerProductId`, `fulfillmentMode` FROM `Service` WHERE `id` = :id LIMIT 1");
            $currStmt->execute([':id' => $id]);
            $curr = $currStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $checkData = [
                'providerId'        => array_key_exists('providerId', $data) ? $data['providerId'] : ($curr['providerId'] ?? null),
                'providerProductId' => array_key_exists('providerProductId', $data) ? $data['providerProductId'] : ($curr['providerProductId'] ?? null),
                'fulfillmentMode'   => $data['fulfillmentMode'] ?? ($curr['fulfillmentMode'] ?? null),
            ];
            $this->validateProviderMapping($checkData, $id);
        }

        $fields = [];
        $params = [':id' => $id];

        if (isset($data['name'])) {
            $fields[] = '`name` = :name';
            $params[':name'] = trim((string)$data['name']);
        }
        if (isset($data['shortDescription'])) {
            $fields[] = '`shortDescription` = :shortDesc';
            $params[':shortDesc'] = trim((string)$data['shortDescription']);
        }
        if (isset($data['fullDescription'])) {
            $fields[] = '`fullDescription` = :fullDesc';
            $params[':fullDesc'] = trim((string)$data['fullDescription']);
        }
        if (isset($data['icon'])) {
            $fields[] = '`icon` = :icon';
            $params[':icon'] = trim((string)$data['icon']);
        }
        if (array_key_exists('imageUrl', $data)) {
            $fields[] = '`imageUrl` = :imageUrl';
            $params[':imageUrl'] = !empty($data['imageUrl']) ? trim((string)$data['imageUrl']) : null;
        }
        if (isset($data['basePriceKobo'])) {
            $fields[] = '`basePriceKobo` = :basePrice';
            $params[':basePrice'] = (int)$data['basePriceKobo'];
        }
        if (array_key_exists('bulkPriceKobo', $data)) {
            $fields[] = '`bulkPriceKobo` = :bulkPrice';
            $params[':bulkPrice'] = $data['bulkPriceKobo'] !== null ? (int)$data['bulkPriceKobo'] : null;
        }
        if (array_key_exists('buyingPriceKobo', $data)) {
            $fields[] = '`buyingPriceKobo` = :buyingPrice';
            $params[':buyingPrice'] = $data['buyingPriceKobo'] !== null ? (int)$data['buyingPriceKobo'] : null;
        }
        if (isset($data['pricingType'])) {
            $fields[] = '`pricingType` = :pricingType';
            $params[':pricingType'] = $data['pricingType'];
        }
        if (array_key_exists('unit', $data)) {
            $fields[] = '`unit` = :unit';
            $params[':unit'] = $data['unit'];
        }
        if (isset($data['status'])) {
            $fields[] = '`status` = :status';
            $params[':status'] = $data['status'];
        }
        if (isset($data['isFeatured'])) {
            $fields[] = '`isFeatured` = :isFeatured';
            $params[':isFeatured'] = !empty($data['isFeatured']) ? 1 : 0;
        }
        if (isset($data['deliveryTimeEstimate'])) {
            $fields[] = '`deliveryTimeEstimate` = :delivery';
            $params[':delivery'] = $data['deliveryTimeEstimate'];
        }
        if (isset($data['features'])) {
            $fields[] = '`features` = :features';
            $params[':features'] = is_string($data['features']) ? $data['features'] : json_encode($data['features']);
        }

        // Phase 5 Fields
        if (isset($data['fulfillmentMode'])) {
            $fields[] = '`fulfillmentMode` = :fulfillmentMode';
            $params[':fulfillmentMode'] = $data['fulfillmentMode'];
        }
        if (isset($data['isAvailable'])) {
            $fields[] = '`isAvailable` = :isAvailable';
            $params[':isAvailable'] = !empty($data['isAvailable']) ? 1 : 0;
        }
        if (array_key_exists('providerId', $data)) {
            $fields[] = '`providerId` = :providerId';
            $params[':providerId'] = !empty($data['providerId']) ? trim((string)$data['providerId']) : null;
        }
        if (array_key_exists('providerProductCode', $data)) {
            $fields[] = '`providerProductCode` = :providerProductCode';
            $params[':providerProductCode'] = !empty($data['providerProductCode']) ? trim((string)$data['providerProductCode']) : null;
        }
        if (array_key_exists('providerProductId', $data)) {
            $fields[] = '`providerProductId` = :providerProductId';
            $params[':providerProductId'] = !empty($data['providerProductId']) ? trim((string)$data['providerProductId']) : null;
        }
        if (array_key_exists('customerInstructions', $data)) {
            $fields[] = '`customerInstructions` = :customerInstructions';
            $params[':customerInstructions'] = !empty($data['customerInstructions']) ? trim((string)$data['customerInstructions']) : null;
        }
        if (array_key_exists('adminInstructions', $data)) {
            $fields[] = '`adminInstructions` = :adminInstructions';
            $params[':adminInstructions'] = !empty($data['adminInstructions']) ? trim((string)$data['adminInstructions']) : null;
        }

        if (empty($fields)) {
            return $this->getServiceById($id);
        }

        $fields[] = '`updatedAt` = NOW(3)';
        $sql = 'UPDATE `Service` SET ' . implode(', ', $fields) . ' WHERE `id` = :id';
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);

        // Synchronize with ServiceTariff if price or fulfillment mode or provider changed
        if (isset($data['basePriceKobo']) || isset($data['fulfillmentMode']) || array_key_exists('providerProductId', $data)) {
            $tariffUpdates = [];
            $tariffParams = [':sid' => $id];
            if (isset($data['basePriceKobo'])) {
                $tariffUpdates[] = '`customerPriceKobo` = :custPrice';
                $tariffParams[':custPrice'] = (int)$data['basePriceKobo'];
            }
            if (isset($data['fulfillmentMode'])) {
                $tariffUpdates[] = '`fulfillmentMode` = :fMode';
                $tariffParams[':fMode'] = $data['fulfillmentMode'];
            }
            if (array_key_exists('providerProductId', $data)) {
                $tariffUpdates[] = '`providerProductId` = :pProdId';
                $tariffParams[':pProdId'] = !empty($data['providerProductId']) ? trim((string)$data['providerProductId']) : null;
            }
            if (!empty($tariffUpdates)) {
                $tariffUpdates[] = '`updatedAt` = NOW(3)';
                $tSql = 'UPDATE `ServiceTariff` SET ' . implode(', ', $tariffUpdates) . ' WHERE `serviceId` = :sid';
                $tStmt = $conn->prepare($tSql);
                $tStmt->execute($tariffParams);
            }
        }

        return $this->getServiceById($id);
    }

    public function deleteService(string $id): bool
    {
        $conn = $this->db->getConnection();
        // Safe soft-delete / status archiving to maintain relational integrity
        $stmt = $conn->prepare('UPDATE `Service` SET `status` = \'INACTIVE\', `updatedAt` = NOW(3) WHERE `id` = :id');
        return $stmt->execute([':id' => $id]);
    }

    public function getCategoriesWithStats(): array
    {
        $sql = "
            SELECT c.`id`, c.`code`, c.`name`, c.`slug`, c.`description`, c.`icon`, c.`displayOrder`,
                   COUNT(s.`id`) AS `serviceCount`
            FROM `ServiceCategory` c
            LEFT JOIN `Service` s ON s.`categoryId` = c.`id`
            GROUP BY c.`id`, c.`code`, c.`name`, c.`slug`, c.`description`, c.`icon`, c.`displayOrder`
            ORDER BY c.`displayOrder` ASC, c.`name` ASC
        ";
        $stmt = $this->db->getConnection()->query($sql);
        $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($categories as &$c) {
            $c['displayOrder'] = (int) $c['displayOrder'];
            $c['serviceCount'] = (int) $c['serviceCount'];
        }
        return $categories;
    }

    public function getCategoryById(string $id): ?array
    {
        $stmt = $this->db->getConnection()->prepare(
            'SELECT c.*, COUNT(s.`id`) AS `serviceCount`
             FROM `ServiceCategory` c
             LEFT JOIN `Service` s ON s.`categoryId` = c.`id`
             WHERE c.`id` = :id OR c.`slug` = :slug OR c.`code` = :code
             GROUP BY c.`id`
             LIMIT 1'
        );
        $stmt->execute([':id' => $id, ':slug' => $id, ':code' => $id]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$res) return null;
        $res['displayOrder'] = (int) $res['displayOrder'];
        $res['serviceCount'] = (int) $res['serviceCount'];
        return $res;
    }

    public function createCategory(array $data): array
    {
        $conn = $this->db->getConnection();
        $name = trim((string)($data['name'] ?? ''));
        $code = strtoupper(trim((string)($data['code'] ?? '')));
        $slug = trim((string)($data['slug'] ?? ''));
        if (empty($slug)) {
            $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $name));
        }
        $description = trim((string)($data['description'] ?? ''));
        $icon = trim((string)($data['icon'] ?? 'Layers'));
        $displayOrder = (int)($data['displayOrder'] ?? 0);

        // Check for duplicates
        $dupStmt = $conn->prepare("SELECT `id` FROM `ServiceCategory` WHERE `code` = :code OR `slug` = :slug LIMIT 1");
        $dupStmt->execute([':code' => $code, ':slug' => $slug]);
        if ($dupStmt->fetch()) {
            throw new \InvalidArgumentException("Category with code '{$code}' or slug '{$slug}' already exists.");
        }

        $id = 'cat_' . bin2hex(random_bytes(6));
        $stmt = $conn->prepare("
            INSERT INTO `ServiceCategory` (`id`, `code`, `name`, `slug`, `description`, `icon`, `displayOrder`, `createdAt`, `updatedAt`)
            VALUES (:id, :code, :name, :slug, :desc, :icon, :ord, NOW(3), NOW(3))
        ");
        $stmt->execute([
            ':id'   => $id,
            ':code' => $code,
            ':name' => $name,
            ':slug' => $slug,
            ':desc' => $description ?: null,
            ':icon' => $icon,
            ':ord'  => $displayOrder,
        ]);

        return $this->getCategoryById($id) ?? ['id' => $id, 'name' => $name, 'code' => $code];
    }

    public function updateCategory(string $id, array $data): ?array
    {
        $conn = $this->db->getConnection();
        $existing = $this->getCategoryById($id);
        if (!$existing) return null;

        $fields = [];
        $params = [':id' => $existing['id']];

        if (isset($data['name'])) {
            $fields[] = '`name` = :name';
            $params[':name'] = trim((string)$data['name']);
        }
        if (isset($data['description'])) {
            $fields[] = '`description` = :desc';
            $params[':desc'] = trim((string)$data['description']);
        }
        if (isset($data['icon'])) {
            $fields[] = '`icon` = :icon';
            $params[':icon'] = trim((string)$data['icon']);
        }
        if (isset($data['displayOrder'])) {
            $fields[] = '`displayOrder` = :ord';
            $params[':ord'] = (int)$data['displayOrder'];
        }

        if (!empty($fields)) {
            $fields[] = '`updatedAt` = NOW(3)';
            $sql = 'UPDATE `ServiceCategory` SET ' . implode(', ', $fields) . ' WHERE `id` = :id';
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
        }

        return $this->getCategoryById($existing['id']);
    }

    public function deleteCategory(string $id): bool
    {
        $conn = $this->db->getConnection();
        $existing = $this->getCategoryById($id);
        if (!$existing) {
            throw new \RuntimeException("Category '{$id}' not found.");
        }
        if ($existing['serviceCount'] > 0) {
            throw new \RuntimeException("Cannot delete category '{$existing['name']}'. It has {$existing['serviceCount']} active service(s) assigned.");
        }

        $stmt = $conn->prepare("DELETE FROM `ServiceCategory` WHERE `id` = :id");
        return $stmt->execute([':id' => $existing['id']]);
    }
}

