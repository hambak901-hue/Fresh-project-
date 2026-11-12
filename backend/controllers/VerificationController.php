<?php
/**
 * @file VerificationController.php
 * Sovereign Identity Verification & Modification Controller
 * Supports Veripine and 2SureVerify Providers with atomic debit, honest provider checks & auto-refund
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Exception;
use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;
use HambakTech\Adapters\Verification\VeripineAdapter;

class VerificationController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    private function resolveActiveProviderId(?string $serviceProvider = null): string
    {
        if (!empty($serviceProvider) && in_array(strtolower($serviceProvider), ['veripine', '2sureverify'], true)) {
            return strtolower($serviceProvider);
        }
        try {
            $setting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_verification_provider"');
            if ($setting && !empty($setting['setting_value'])) {
                $val = strtolower(trim((string)$setting['setting_value']));
                if (in_array($val, ['veripine', '2sureverify'], true)) {
                    return $val;
                }
            }
            $defaultRow = $this->db->fetchOne('SELECT id FROM providers WHERE provider_type = "identity" AND is_default = 1 AND is_active = 1 LIMIT 1');
            if ($defaultRow && !empty($defaultRow['id'])) {
                return strtolower((string)$defaultRow['id']);
            }
        } catch (Throwable) {
        }
        return 'veripine';
    }

    private function mapCategoryKey(string $categoryName): string
    {
        $c = strtolower(trim($categoryName));
        if (str_contains($c, 'bvn')) return 'bvn_verification';
        if (str_contains($c, 'mod')) return 'nin_modification';
        if (str_contains($c, 'enrol')) return 'enrolment';
        if (str_contains($c, 'add') || str_contains($c, 'ipe') || str_contains($c, 'clearance') || str_contains($c, 'personal')) {
            return 'additional_services';
        }
        return 'nin_verification';
    }

    public function services(Request $request): void
    {
        $user = Auth::user($request);
        $isAdmin = $user && in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
        $activeProvider = $this->resolveActiveProviderId();

        if ($isAdmin) {
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.wholesale_cost, s.selling_price,
                        s.provider_id as provider, s.endpoint, s.is_active as enabled,
                        s.required_fields, s.slip_type_supported, c.name as category_name, c.code as category_code
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
        } else {
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.selling_price,
                        s.is_active as enabled, s.required_fields, s.slip_type_supported, c.name as category_name, c.code as category_code
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
        }

        $categories = [
            'nin_verification' => [],
            'bvn_verification' => [],
            'nin_modification' => [],
            'enrolment' => [],
            'additional_services' => [],
        ];

        foreach ($rows as &$r) {
            $r['selling_price'] = (float)$r['selling_price'];
            $r['enabled'] = (bool)$r['enabled'];
            $r['slip_type_supported'] = (bool)$r['slip_type_supported'];
            if ($isAdmin) {
                $r['wholesale_cost'] = (float)$r['wholesale_cost'];
                $r['margin'] = round($r['selling_price'] - $r['wholesale_cost'], 2);
            }
            if (is_string($r['required_fields'])) {
                $r['required_fields'] = json_decode($r['required_fields'], true) ?: [];
            }
            $catKey = !empty($r['category_code']) ? $this->mapCategoryKey((string)$r['category_code']) : $this->mapCategoryKey((string)($r['category_name'] ?? ''));
            $r['category'] = $catKey;
            unset($r['category_name'], $r['category_code']);
            if (!isset($categories[$catKey])) {
                $categories[$catKey] = [];
            }
            $categories[$catKey][] = $r;
        }

        $slipTypes = [
            ['id' => 'ninStandard', 'name' => 'NIN Standard Slip', 'description' => 'Official standard NIN verification slip'],
            ['id' => 'ninPremium', 'name' => 'NIN Premium Slip', 'description' => 'High-security digital ID card format'],
            ['id' => 'ninLong', 'name' => 'NIN Long Slip', 'description' => 'Comprehensive full-record NIMC slip'],
            ['id' => 'ninValidating', 'name' => 'NIN Validating Slip', 'description' => 'Institutional verification certificate'],
        ];

        Response::success([
            'activeProvider' => $isAdmin ? $activeProvider : 'sovereign',
            'services' => $rows,
            'categories' => $categories,
            'slipTypes' => $slipTypes,
        ]);
    }

    public function verify(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $serviceKey = trim((string)($request->input('serviceKey') ?? $request->input('service_key', 'nin_v1')));
        $nestedPayload = $request->input('payload', []);
        $allInputs = array_merge($request->getBody(), is_array($nestedPayload) ? $nestedPayload : []);

        $slipType = (string)($allInputs['slip_type'] ?? $request->input('slip_type', 'ninStandard'));
        $tier = (string)($allInputs['tier'] ?? $request->input('tier', 'standard'));

        $searchValue = trim((string)(
            $allInputs['search_value']
            ?? $allInputs['nin']
            ?? $allInputs['bvn']
            ?? $allInputs['phone']
            ?? $allInputs['phone_number']
            ?? $allInputs['tracking_id']
            ?? $allInputs['trackingId']
            ?? $allInputs['reference_id']
            ?? ''
        ));

        if ($searchValue === '' && (!empty($allInputs['firstname']) || !empty($allInputs['first_name']))) {
            $fn = trim((string)($allInputs['firstname'] ?? $allInputs['first_name'] ?? ''));
            $ln = trim((string)($allInputs['lastname'] ?? $allInputs['surname'] ?? $allInputs['last_name'] ?? ''));
            $searchValue = trim($fn . ' ' . $ln);
        }

        if ($searchValue === '') {
            Response::error('Please provide the required NIN, BVN, phone number, tracking ID, or search parameters.', 422);
        }

        // 1. Fetch Service Configuration from MySQL
        $service = $this->db->fetchOne(
            'SELECT s.*, c.code as category_code FROM service_catalogue s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.service_key = :k AND s.is_active = 1',
            ['k' => $serviceKey]
        );

        if (!$service) {
            Response::error('Selected verification service is unavailable or inactive.', 404);
        }

        // Determine adapter and ensure credentials exist before debiting wallet
        $preferredProvider = $this->resolveActiveProviderId($service['provider_id'] ?? null);
        $veripine = new VeripineAdapter();
        $twoSure = new TwoSureVerifyAdapter();
        $config = file_exists(__DIR__ . '/../config/config.php') ? require __DIR__ . '/../config/config.php' : [];
        $hasTwoSureKey = !empty(getenv('TWOSUREVERIFY_API_KEY')) || !empty($config['providers']['2sureverify']['api_key']);
        if (!$hasTwoSureKey) {
            try {
                $r = $this->db->fetchOne('SELECT api_key FROM providers WHERE id = "2sureverify"');
                $hasTwoSureKey = !empty($r['api_key']);
            } catch (Throwable) {
            }
        }

        $usedProvider = $preferredProvider;
        if ($preferredProvider === 'veripine' && !$veripine->hasCredentials() && $hasTwoSureKey) {
            $usedProvider = '2sureverify';
        } elseif ($preferredProvider === '2sureverify' && !$hasTwoSureKey && $veripine->hasCredentials()) {
            $usedProvider = 'veripine';
        }

        $adapter = ($usedProvider === 'veripine') ? $veripine : $twoSure;
        if (($usedProvider === 'veripine' && !$veripine->hasCredentials()) || ($usedProvider === '2sureverify' && !$hasTwoSureKey)) {
            Response::error(
                'Identity provider credentials are not configured on this server. Please configure Veripine or 2SureVerify API keys in Super Admin > Service & Provider Settings.',
                503
            );
        }

        $cost = (float)$service['selling_price'];
        $wholesaleCost = (float)$service['wholesale_cost'];
        $endpoint = (string)($service['endpoint'] ?? $serviceKey);

        // 2. Atomic Wallet Debit
        $reference = 'VRF_' . strtoupper(bin2hex(random_bytes(6)));
        try {
            $debitResult = $this->walletService->debit(
                $user['id'],
                $cost,
                'nin_verification',
                $reference,
                "Identity verification fee for {$service['name']} ({$searchValue})",
                'internal',
                ['service_key' => $serviceKey, 'search_value' => $searchValue]
            );
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
            return;
        }

        // 3. Dispatch to Real Upstream Provider Adapter
        $recordId = Security::generateUuid();
        try {
            $payload = array_merge($allInputs, [
                'service_key' => $serviceKey,
                'search_value' => $searchValue,
                'slip_type' => $slipType,
                'tier' => $tier,
                'reference' => $reference,
            ]);
            unset($payload['testSandbox']);

            $providerResult = $adapter->verify($endpoint, $payload);

            $ok = !isset($providerResult['success']) ? true : (bool)$providerResult['success'];
            if (strtolower((string)($providerResult['status'] ?? '')) === 'failed') {
                $ok = false;
            }
            if (!$ok) {
                throw new Exception((string)($providerResult['message'] ?? 'Upstream identity verification failed.'));
            }

            $resultData = $providerResult['data'] ?? $providerResult;
            $actualProviderCost = (float)($providerResult['provider_cost'] ?? $wholesaleCost);

            // 4. Save to verification_records
            $this->db->execute(
                'INSERT INTO verification_records
                 (id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, result_data, created_at)
                 VALUES
                 (:id, :uid, :type, :skey, :search, :prov, :cost, :pcost, "completed", :ref, :slip, 1, :result, NOW())',
                [
                    'id' => $recordId,
                    'uid' => $user['id'],
                    'type' => strtoupper(explode('_', $serviceKey)[0] ?? 'NIN'),
                    'skey' => $serviceKey,
                    'search' => $searchValue,
                    'prov' => $usedProvider,
                    'cost' => $cost,
                    'pcost' => $actualProviderCost,
                    'ref' => $reference,
                    'slip' => $slipType,
                    'result' => json_encode($resultData),
                ]
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'IDENTITY_VERIFIED',
                'service_type' => $serviceKey,
                'reference' => $reference,
                'provider' => $usedProvider,
                'status' => 'successful',
                'amount' => $cost,
                'metadata' => [
                    'slip_type' => $slipType,
                    'search_type' => strtoupper(explode('_', $serviceKey)[0] ?? 'NIN'),
                ],
            ]);

            Response::success([
                'verification_id' => $recordId,
                'recordId' => $recordId,
                'reference' => $reference,
                'cost' => $cost,
                'balance_after' => $debitResult['balance_after'],
                'newBalance' => $debitResult['balance_after'],
                'slip_type' => $slipType,
                'data' => $resultData,
                'result' => $resultData,
                'service' => [
                    'key' => $serviceKey,
                    'name' => $service['name'],
                    'category' => $this->mapCategoryKey((string)($service['category_code'] ?? '')),
                ],
            ], 'Verification completed successfully!');
        } catch (Exception $e) {
            $refundRef = 'REFUND_' . $reference;
            $this->walletService->credit(
                $user['id'],
                $cost,
                'manual_adjustment',
                $refundRef,
                "Automatic refund for failed verification {$reference}",
                'internal'
            );

            $this->db->execute(
                'INSERT INTO verification_records
                 (id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, result_data, created_at)
                 VALUES
                 (:id, :uid, "FAILED", :skey, :search, :prov, :cost, 0.00, "failed", :ref, :slip, 0, :result, NOW())',
                [
                    'id' => $recordId,
                    'uid' => $user['id'],
                    'skey' => $serviceKey,
                    'search' => $searchValue,
                    'prov' => $usedProvider,
                    'cost' => $cost,
                    'ref' => $reference,
                    'slip' => $slipType,
                    'result' => json_encode(['error' => $e->getMessage()]),
                ]
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'service',
                'action' => 'IDENTITY_VERIFY_FAILED',
                'service_type' => $serviceKey,
                'reference' => $reference,
                'provider' => $usedProvider,
                'status' => 'failed',
                'amount' => $cost,
                'error_message' => $e->getMessage(),
                'metadata' => ['slip_type' => $slipType],
            ]);

            Response::error('Verification could not be completed: ' . $e->getMessage() . '. Your wallet has been automatically refunded.', 502);
        }
    }

    public function history(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $limit = min(100, max(1, (int)$request->query('limit', 50)));
        $category = trim((string)$request->query('category', ''));
        $search = trim((string)$request->query('search', ''));
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $selectCols = $isAdmin
            ? 'id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, result_data as result, created_at'
            : 'id, user_id, type, service_key, search_value, cost, status, reference, slip_type, has_slip, result_data as result, created_at';

        $sql = "SELECT {$selectCols} FROM verification_records WHERE user_id = :uid ";
        $params = ['uid' => $user['id']];

        if (!empty($category) && $category !== 'all') {
            $sql .= 'AND (LOWER(type) = :cat OR LOWER(service_key) LIKE :catlike) ';
            $params['cat'] = strtolower($category);
            $params['catlike'] = '%' . strtolower($category) . '%';
        }
        if (!empty($search)) {
            $sql .= 'AND (search_value LIKE :q1 OR reference LIKE :q2 OR service_key LIKE :q3) ';
            $like = '%' . $search . '%';
            $params['q1'] = $like;
            $params['q2'] = $like;
            $params['q3'] = $like;
        }
        $sql .= 'ORDER BY created_at DESC LIMIT ' . (int)$limit;

        $rows = $this->db->fetchAll($sql, $params);
        foreach ($rows as &$r) {
            $r['cost'] = (float)$r['cost'];
            if (isset($r['provider_cost'])) {
                $r['provider_cost'] = (float)$r['provider_cost'];
            }
            $r['has_slip'] = (bool)$r['has_slip'];
            if (!empty($r['result']) && is_string($r['result'])) {
                $r['result'] = json_decode($r['result'], true);
            }
        }

        Response::success([
            'count' => count($rows),
            'history' => $rows,
            'verifications' => $rows,
        ]);
    }

    /**
     * GET /api/verification/slip-templates
     */
    public function slipTemplates(Request $request): void
    {
        $category = strtoupper(trim((string)$request->query('category', '')));
        $templates = [];
        try {
            $sql = 'SELECT * FROM slip_templates WHERE is_active = 1 ';
            $params = [];
            if (!empty($category) && $category !== 'ALL') {
                $sql .= 'AND UPPER(category) = :cat ';
                $params['cat'] = $category;
            }
            $sql .= 'ORDER BY display_order ASC, name ASC';
            $templates = $this->db->fetchAll($sql, $params);
            foreach ($templates as &$t) {
                $t['is_active'] = (bool)$t['is_active'];
                $t['display_order'] = (int)$t['display_order'];
            }
        } catch (Throwable) {
        }

        Response::success([
            'count' => count($templates),
            'templates' => $templates,
        ]);
    }

    /**
     * GET /api/verification/banks/modification
     */
    public function modificationBanks(Request $request): void
    {
        $banks = [
            ['bank_name' => 'Access Bank', 'price' => 4500],
            ['bank_name' => 'First Bank of Nigeria', 'price' => 4500],
            ['bank_name' => 'Guaranty Trust Bank (GTBank)', 'price' => 4500],
            ['bank_name' => 'United Bank for Africa (UBA)', 'price' => 4500],
            ['bank_name' => 'Zenith Bank', 'price' => 4500],
            ['bank_name' => 'Fidelity Bank', 'price' => 4500],
            ['bank_name' => 'Union Bank', 'price' => 4500],
            ['bank_name' => 'Sterling Bank', 'price' => 4500],
            ['bank_name' => 'Wema Bank', 'price' => 4500],
        ];
        Response::success(['data' => $banks]);
    }

    /**
     * GET /api/verification/banks/enrollment
     */
    public function enrollmentBanks(Request $request): void
    {
        $banks = [
            ['bank_name' => 'First Bank BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'Access Bank BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'UBA BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'Zenith Bank BVN Enrolment', 'price' => 3500],
            ['bank_name' => 'Wema Bank BVN Enrolment', 'price' => 3500],
        ];
        Response::success(['data' => $banks]);
    }

    /**
     * GET /api/verification/status/:ref
     */
    public function checkStatus(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $ref = trim((string)($params['ref'] ?? ''));
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $record = $this->db->fetchOne(
            'SELECT * FROM verification_records WHERE reference = :ref OR id = :id LIMIT 1',
            ['ref' => $ref, 'id' => $ref]
        );
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isAdmin && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification record.');
        }

        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $record['result'] = json_decode($record['result_data'], true);
        }
        if (!$isAdmin) {
            unset($record['provider'], $record['provider_cost']);
        }

        Response::success([
            'status' => $record['status'],
            'record' => $record,
        ]);
    }

    /**
     * GET /api/verification/record/:id
     */
    public function getRecord(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $record = $this->db->fetchOne('SELECT * FROM verification_records WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$record) {
            Response::notFound('Verification record not found.');
        }
        if (!$isAdmin && $record['user_id'] !== $user['id']) {
            Response::forbidden('Unauthorized access to verification record.');
        }

        $record['cost'] = (float)$record['cost'];
        $record['has_slip'] = (bool)$record['has_slip'];
        if (!empty($record['result_data']) && is_string($record['result_data'])) {
            $record['result'] = json_decode($record['result_data'], true);
        }
        if (!$isAdmin) {
            unset($record['provider'], $record['provider_cost']);
        } else {
            $record['provider_cost'] = (float)($record['provider_cost'] ?? 0);
        }

        Response::success(['record' => $record]);
    }

    public function banks(Request $request): void
    {
        $banks = [
            ['name' => 'Access Bank', 'code' => '044'],
            ['name' => 'First Bank of Nigeria', 'code' => '011'],
            ['name' => 'Guaranty Trust Bank (GTBank)', 'code' => '058'],
            ['name' => 'United Bank for Africa (UBA)', 'code' => '033'],
            ['name' => 'Zenith Bank', 'code' => '057'],
            ['name' => 'Moniepoint Microfinance Bank', 'code' => '50515'],
            ['name' => 'OPay (PayCom)', 'code' => '999992'],
            ['name' => 'Kuda Bank', 'code' => '50211'],
            ['name' => 'Palmpay', 'code' => '999991'],
            ['name' => 'Fidelity Bank', 'code' => '070'],
            ['name' => 'Stanbic IBTC Bank', 'code' => '221'],
            ['name' => 'Union Bank', 'code' => '032'],
            ['name' => 'Sterling Bank', 'code' => '232'],
            ['name' => 'Wema Bank (ALAT)', 'code' => '035'],
        ];
        Response::success(['banks' => $banks]);
    }
}
