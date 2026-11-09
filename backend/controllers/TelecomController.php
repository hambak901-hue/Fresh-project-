<?php
/**
 * @file TelecomController.php
 * Automated Telecommunications Vending Controller
 * Data Bundles, Airtime Top-Up, Electricity Tokens, Cable TV, and Exam Cards
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
use HambakTech\Adapters\Telecom\UlamaDataAdapter;

class TelecomController
{
    private Database $db;
    private WalletService $walletService;
    private UlamaDataAdapter $adapter;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
        $config = require __DIR__ . '/../config/config.php';
        $p = $config['providers']['ulamadata'] ?? [];
        $this->adapter = new UlamaDataAdapter($p['base_url'] ?? 'https://ulamadata.com', $p['api_key'] ?? '');
    }

    public function plans(Request $request): void
    {
        $network = strtoupper((string)$request->query('network', ''));

        $sql = 'SELECT id, provider_plan_id, network, name, size, plan_type as type, validity, wholesale_cost, price, is_active as enabled, provider_id as provider 
                FROM telecom_plans WHERE is_active = 1 ';
        $params = [];
        if (!empty($network)) {
            $sql .= 'AND network = :net ';
            $params['net'] = $network;
        }
        $sql .= 'ORDER BY network ASC, price ASC';

        $dataPlans = $this->db->fetchAll($sql, $params);
        foreach ($dataPlans as &$p) {
            $p['wholesale_cost'] = (float)$p['wholesale_cost'];
            $p['price'] = (float)$p['price'];
            $p['enabled'] = (bool)$p['enabled'];
        }

        $cablePackages = $this->db->fetchAll('SELECT * FROM cable_packages WHERE is_active = 1 ORDER BY provider ASC, price ASC');
        $electricityDiscos = $this->db->fetchAll('SELECT * FROM electricity_discos WHERE is_active = 1 ORDER BY name ASC');
        $examPackages = $this->db->fetchAll('SELECT * FROM exam_packages WHERE is_active = 1 ORDER BY price ASC');
        $airtimeSwap = $this->db->fetchAll('SELECT * FROM airtime_swap_configs WHERE is_active = 1');

        Response::success([
            'plans' => $dataPlans,
            'cable_packages' => $cablePackages,
            'electricity_discos' => $electricityDiscos,
            'exam_packages' => $examPackages,
            'airtime_swap' => $airtimeSwap,
            'airtime_discount_percent' => 2.5,
        ]);
    }

    public function purchaseData(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $planId = (string)$request->input('plan_id', '');
        $phone = trim((string)$request->input('phone', ''));

        if (empty($planId) || empty($phone)) {
            Response::error('Data plan selection and recipient phone number are required.', 422);
        }

        $plan = $this->db->fetchOne('SELECT * FROM telecom_plans WHERE id = :id AND is_active = 1', ['id' => $planId]);
        if (!$plan) {
            Response::error('Selected data plan is currently not available.', 404);
        }

        $price = (float)$plan['price'];
        $wholesaleCost = (float)$plan['wholesale_cost'];
        $profit = $price - $wholesaleCost;
        $reference = 'UD_DAT_' . strtoupper(bin2hex(random_bytes(6)));

        // 1. Atomic Wallet Debit
        $debitResult = $this->walletService->debit(
            $user['id'],
            $price,
            'data_purchase',
            $reference,
            "{$plan['network']} {$plan['size']} Data top-up to {$phone}",
            'internal',
            ['plan_id' => $planId, 'phone' => $phone]
        );

        // 2. Dispatch to Telecom Provider Adapter
        $orderId = Security::generateUuid();
        try {
            $dispatchRes = $this->adapter->purchaseData($plan['network'], $phone, $plan['provider_plan_id']);

            $this->db->execute(
                'INSERT INTO telecom_orders 
                 (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, status, metadata, created_at)
                 VALUES 
                 (:id, :uid, "data", :net, :phone, :plan, :amt, :cost, :profit, "ulamadata", :pref, "successful", :meta, NOW())',
                [
                    'id' => $orderId,
                    'uid' => $user['id'],
                    'net' => $plan['network'],
                    'phone' => $phone,
                    'plan' => "{$plan['network']} {$plan['size']} ({$plan['plan_type']})",
                    'amt' => $price,
                    'cost' => $wholesaleCost,
                    'profit' => $profit,
                    'pref' => $dispatchRes['provider_reference'] ?? $reference,
                    'meta' => json_encode($dispatchRes),
                ]
            );

            Response::success([
                'order_id' => $orderId,
                'reference' => $reference,
                'network' => $plan['network'],
                'phone' => $phone,
                'amount' => $price,
                'balance_after' => $debitResult['balance_after'],
            ], "{$plan['size']} Data successfully delivered to {$phone}!");
        } catch (Exception $e) {
            // Auto refund
            $this->walletService->credit($user['id'], $price, 'manual_adjustment', 'REFUND_' . $reference, "Refund for failed data order {$reference}");
            Response::error('Failed to dispatch data with network operator: ' . $e->getMessage(), 502);
        }
    }

    public function topupAirtime(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $network = strtoupper((string)$request->input('network', ''));
        $phone = trim((string)$request->input('phone', ''));
        $amount = (float)$request->input('amount', 0);

        if (empty($network) || empty($phone) || $amount < 50) {
            Response::error('Network, valid phone number, and minimum ₦50 airtime amount are required.', 422);
        }

        // Apply 2.5% platform discount
        $discountedPrice = round($amount * 0.975, 2);
        $reference = 'UD_AIR_' . strtoupper(bin2hex(random_bytes(6)));

        $debitResult = $this->walletService->debit(
            $user['id'],
            $discountedPrice,
            'airtime',
            $reference,
            "₦{$amount} {$network} Airtime recharge to {$phone} (2.5% discount)",
            'internal',
            ['network' => $network, 'phone' => $phone, 'face_value' => $amount]
        );

        $orderId = Security::generateUuid();
        $dispatchRes = $this->adapter->topupAirtime($network, $phone, $amount);

        $this->db->execute(
            'INSERT INTO telecom_orders 
             (id, user_id, service_type, network, phone, plan, amount, cost_price, profit, provider_id, provider_ref, status, metadata, created_at)
             VALUES 
             (:id, :uid, "airtime", :net, :phone, :plan, :amt, :cost, :profit, "ulamadata", :pref, "successful", :meta, NOW())',
            [
                'id' => $orderId,
                'uid' => $user['id'],
                'net' => $network,
                'phone' => $phone,
                'plan' => "₦{$amount} VTU Airtime",
                'amt' => $discountedPrice,
                'cost' => $amount * 0.97,
                'profit' => $discountedPrice - ($amount * 0.97),
                'pref' => $dispatchRes['provider_reference'] ?? $reference,
                'meta' => json_encode($dispatchRes),
            ]
        );

        Response::success([
            'order_id' => $orderId,
            'reference' => $reference,
            'amount_charged' => $discountedPrice,
            'balance_after' => $debitResult['balance_after'],
        ], "₦{$amount} Airtime successfully credited to {$phone}!");
    }

    public function vendElectricity(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $discoCode = (string)$request->input('disco', 'ikeja-electric');
        $meterNumber = trim((string)$request->input('meter_number', ''));
        $meterType = (string)$request->input('meter_type', 'prepaid');
        $amount = (float)$request->input('amount', 0);

        if (empty($meterNumber) || $amount < 500) {
            Response::error('Meter number and minimum ₦500 amount are required.', 422);
        }

        $reference = 'UD_ELE_' . strtoupper(bin2hex(random_bytes(6)));
        $debitResult = $this->walletService->debit(
            $user['id'],
            $amount,
            'cable_tv',
            $reference,
            "Electricity payment for {$discoCode} (Meter: {$meterNumber})",
            'internal'
        );

        $dispatch = $this->adapter->vendElectricity($discoCode, $meterNumber, $amount, $meterType);
        $orderId = Security::generateUuid();

        $this->db->execute(
            'INSERT INTO telecom_orders 
             (id, user_id, service_type, phone, plan, amount, cost_price, profit, provider_id, provider_ref, status, metadata, created_at)
             VALUES 
             (:id, :uid, "electricity", :phone, :plan, :amt, :cost, 50.00, "ulamadata", :pref, "successful", :meta, NOW())',
            [
                'id' => $orderId,
                'uid' => $user['id'],
                'phone' => $meterNumber,
                'plan' => strtoupper($discoCode) . " Token",
                'amt' => $amount,
                'cost' => $amount - 50.00,
                'pref' => $dispatch['provider_reference'],
                'meta' => json_encode($dispatch),
            ]
        );

        Response::success([
            'order_id' => $orderId,
            'token' => $dispatch['token'],
            'units' => $dispatch['units'],
            'balance_after' => $debitResult['balance_after'],
            'data' => $dispatch,
        ], 'Prepaid token generated successfully!');
    }

    public function renewCable(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $provider = (string)$request->input('provider', 'gotv');
        $smartcard = trim((string)$request->input('smartcard', ''));
        $packageCode = (string)$request->input('package_code', '');
        $amount = (float)$request->input('amount', 0);

        if (empty($smartcard) || $amount <= 0) {
            Response::error('Smartcard/IUC number and package selection are required.', 422);
        }

        $reference = 'UD_CAB_' . strtoupper(bin2hex(random_bytes(6)));
        $debitResult = $this->walletService->debit(
            $user['id'],
            $amount,
            'cable_tv',
            $reference,
            "Cable TV renewal for {$provider} (IUC: {$smartcard})",
            'internal'
        );

        $dispatch = $this->adapter->renewCable($provider, $smartcard, $packageCode);
        $orderId = Security::generateUuid();

        $this->db->execute(
            'INSERT INTO telecom_orders 
             (id, user_id, service_type, phone, plan, amount, cost_price, profit, provider_id, provider_ref, status, metadata, created_at)
             VALUES 
             (:id, :uid, "cable", :phone, :plan, :amt, :cost, 100.00, "ulamadata", :pref, "successful", :meta, NOW())',
            [
                'id' => $orderId,
                'uid' => $user['id'],
                'phone' => $smartcard,
                'plan' => strtoupper($provider) . " Subscription",
                'amt' => $amount,
                'cost' => $amount - 100.00,
                'pref' => $dispatch['provider_reference'],
                'meta' => json_encode($dispatch),
            ]
        );

        Response::success([
            'order_id' => $orderId,
            'balance_after' => $debitResult['balance_after'],
            'data' => $dispatch,
        ], 'Cable TV subscription renewed successfully!');
    }

    public function orders(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $limit = min(100, max(1, (int)$request->query('limit', 50)));

        $rows = $this->db->fetchAll(
            'SELECT id, service_type, network, phone, plan, amount, provider_id as provider, provider_ref, status, metadata, created_at
             FROM telecom_orders
             WHERE user_id = :uid
             ORDER BY created_at DESC LIMIT ' . (int)$limit,
            ['uid' => $user['id']]
        );

        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
            if (!empty($r['metadata'])) {
                $r['metadata'] = json_decode($r['metadata'], true);
            }
        }

        Response::success(['orders' => $rows]);
    }
}
