<?php
/**
 * @file VerificationController.php
 * Sovereign Identity Verification & Modification Controller
 * Integrates 2SureVerify & Veripine Providers with atomic debit & auto-refund
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Exception;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;
use HambakTech\Adapters\Verification\TwoSureVerifyAdapter;

class VerificationController
{
    private Database $db;
    private WalletService $walletService;
    private TwoSureVerifyAdapter $adapter;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
        $config = require __DIR__ . '/../config/config.php';
        $p = $config['providers']['2sureverify'] ?? [];
        $this->adapter = new TwoSureVerifyAdapter($p['base_url'] ?? 'https://2sureverify.com', $p['api_key'] ?? '');
    }

    public function services(Request $request): void
    {
        // Check if requester is authenticated admin
        $isAdmin = false;
        try {
            $user = Auth::requireAuth($request);
            if (in_array($user['role'] ?? '', ['admin', 'superadmin'], true)) {
                $isAdmin = true;
            }
        } catch (\Throwable) {
            $isAdmin = false;
        }

        if ($isAdmin) {
            // ADMIN MODEL: Includes provider ID, wholesale cost, endpoint, and margins
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.wholesale_cost, s.selling_price, 
                        s.provider_id as provider, s.endpoint, s.is_active as enabled, 
                        s.required_fields, s.slip_type_supported, c.name as category
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
            foreach ($rows as &$r) {
                $r['wholesale_cost'] = (float)$r['wholesale_cost'];
                $r['selling_price'] = (float)$r['selling_price'];
                $r['margin'] = round($r['selling_price'] - $r['wholesale_cost'], 2);
                $r['enabled'] = (bool)$r['enabled'];
                $r['slip_type_supported'] = (bool)$r['slip_type_supported'];
                if (is_string($r['required_fields'])) {
                    $r['required_fields'] = json_decode($r['required_fields'], true) ?: [];
                }
            }
        } else {
            // CUSTOMER-SAFE MODEL: Strictly hides provider names, wholesale costs, and endpoints
            $rows = $this->db->fetchAll(
                'SELECT s.service_key as `key`, s.name, s.description, s.selling_price, 
                        s.is_active as enabled, s.required_fields, s.slip_type_supported, c.name as category
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 WHERE s.is_active = 1
                 ORDER BY c.display_order ASC, s.name ASC'
            );
            foreach ($rows as &$r) {
                $r['selling_price'] = (float)$r['selling_price'];
                $r['enabled'] = (bool)$r['enabled'];
                $r['slip_type_supported'] = (bool)$r['slip_type_supported'];
                if (is_string($r['required_fields'])) {
                    $r['required_fields'] = json_decode($r['required_fields'], true) ?: [];
                }
            }
        }

        Response::success(['services' => $rows]);
    }

    public function verify(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $serviceKey = (string)$request->input('service_key', 'nin_v1');
        $searchValue = trim((string)$request->input('search_value', ''));
        $slipType = (string)$request->input('slip_type', 'ninStandard');
        $tier = (string)$request->input('tier', 'standard');
        $allInputs = $request->getBody();

        // 1. Fetch Service Configuration from MySQL
        $service = $this->db->fetchOne(
            'SELECT * FROM service_catalogue WHERE service_key = :k AND is_active = 1',
            ['k' => $serviceKey]
        );

        if (!$service) {
            Response::error('Selected verification service is unavailable or inactive.', 404);
        }

        $cost = (float)$service['selling_price'];
        $wholesaleCost = (float)$service['wholesale_cost'];
        $endpoint = $service['endpoint'];

        if (empty($searchValue)) {
            $searchValue = $request->input('nin') 
                ?? $request->input('phone') 
                ?? $request->input('bvn') 
                ?? $request->input('first_name') 
                ?? '12345678901';
        }

        // 2. Atomic Wallet Debit with row-level locking
        $reference = 'VRF_' . strtoupper(bin2hex(random_bytes(6)));
        $debitResult = null;

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

        // 3. Dispatch to Upstream Provider Adapter
        $recordId = Security::generateUuid();
        try {
            $payload = array_merge($allInputs, [
                'service_key' => $serviceKey,
                'search_value' => $searchValue,
                'slip_type' => $slipType,
                'tier' => $tier,
                'reference' => $reference,
            ]);

            $providerResult = $this->adapter->verify($endpoint, $payload);
            $resultData = $providerResult['data'] ?? $providerResult;

            // 4. Save to verification_records
            $this->db->execute(
                'INSERT INTO verification_records 
                 (id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, result_data, created_at)
                 VALUES 
                 (:id, :uid, :type, :skey, :search, "2sureverify", :cost, :pcost, "completed", :ref, :slip, 1, :result, NOW())',
                [
                    'id' => $recordId,
                    'uid' => $user['id'],
                    'type' => strtoupper(explode('_', $serviceKey)[0] ?? 'NIN'),
                    'skey' => $serviceKey,
                    'search' => $searchValue,
                    'cost' => $cost,
                    'pcost' => $wholesaleCost,
                    'ref' => $reference,
                    'slip' => $slipType,
                    'result' => json_encode($resultData),
                ]
            );

            Response::success([
                'verification_id' => $recordId,
                'reference' => $reference,
                'cost' => $cost,
                'balance_after' => $debitResult['balance_after'],
                'slip_type' => $slipType,
                'data' => $resultData,
            ], 'Verification completed successfully!');
        } catch (Exception $e) {
            // Auto-Refund on failure
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
                 (:id, :uid, "FAILED", :skey, :search, "2sureverify", :cost, 0.00, "failed", :ref, :slip, 0, :result, NOW())',
                [
                    'id' => $recordId,
                    'uid' => $user['id'],
                    'skey' => $serviceKey,
                    'search' => $searchValue,
                    'cost' => $cost,
                    'ref' => $reference,
                    'slip' => $slipType,
                    'result' => json_encode(['error' => $e->getMessage()]),
                ]
            );

            Response::error('Verification could not be completed at this time. Your wallet has been automatically refunded.', 502);
        }
    }

    public function history(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $limit = min(100, max(1, (int)$request->query('limit', 50)));
        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        if ($isAdmin) {
            $rows = $this->db->fetchAll(
                'SELECT id, user_id, type, service_key, search_value, provider, cost, provider_cost, status, reference, slip_type, has_slip, result_data as result, created_at
                 FROM verification_records
                 WHERE user_id = :uid
                 ORDER BY created_at DESC LIMIT ' . (int)$limit,
                ['uid' => $user['id']]
            );
        } else {
            // Customer-safe history: Provider names and provider costs are completely omitted
            $rows = $this->db->fetchAll(
                'SELECT id, user_id, type, service_key, search_value, cost, status, reference, slip_type, has_slip, result_data as result, created_at
                 FROM verification_records
                 WHERE user_id = :uid
                 ORDER BY created_at DESC LIMIT ' . (int)$limit,
                ['uid' => $user['id']]
            );
        }

        foreach ($rows as &$r) {
            $r['cost'] = (float)$r['cost'];
            if (isset($r['provider_cost'])) {
                $r['provider_cost'] = (float)$r['provider_cost'];
            }
            $r['has_slip'] = (bool)$r['has_slip'];
            if (!empty($r['result'])) {
                $r['result'] = json_decode($r['result'], true);
            }
        }

        Response::success(['history' => $rows]);
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
