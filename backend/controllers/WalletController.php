<?php
/**
 * @file WalletController.php
 * Production Financial Settlement & Wallet Management Controller
 * Target: PHP 8.2+ / MySQL 8.x
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\Auth;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Services\AccountingService;
use HambakTech\Services\DashboardConfigService;
use HambakTech\Adapters\Payment\PaystackAdapter;
use HambakTech\Adapters\Payment\FlutterwaveAdapter;

class WalletController
{
    private Database $db;
    private WalletService $walletService;
    private PaystackAdapter $paystack;
    private FlutterwaveAdapter $flutterwave;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
        $this->paystack = new PaystackAdapter();
        $this->flutterwave = new FlutterwaveAdapter();
    }

    private function getWalletPolicy(): array
    {
        $walletCfg = [
            'min_funding_amount' => 100.0,
            'max_funding_amount' => 500000.0,
            'manual_funding_enabled' => true,
            'bank_name' => 'Moniepoint MFB',
            'bank_account_number' => '5210741634',
            'bank_account_name' => 'Hambaktech_Services',
        ];
        $gwCfg = [
            'active_gateway' => 'paystack',
            'enable_paystack' => true,
            'enable_flutterwave' => false,
            'enable_bank_transfer' => true,
        ];
        try {
            $rows = $this->db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("wallet_settings","payment_gateways_settings","bank_transfer_bank","bank_transfer_account_number","bank_transfer_account_name","active_payment_gateway")'
            );
            $kv = [];
            foreach ($rows as $r) {
                $kv[$r['setting_key']] = $r['setting_value'];
            }
            if (!empty($kv['wallet_settings'])) {
                $dec = json_decode((string)$kv['wallet_settings'], true);
                if (is_array($dec)) {
                    $walletCfg = array_merge($walletCfg, $dec);
                }
            }
            if (!empty($kv['payment_gateways_settings'])) {
                $dec = json_decode((string)$kv['payment_gateways_settings'], true);
                if (is_array($dec)) {
                    $gwCfg = array_merge($gwCfg, $dec);
                }
            }
            if (!empty($kv['bank_transfer_bank'])) {
                $walletCfg['bank_name'] = trim((string)$kv['bank_transfer_bank']);
            }
            if (!empty($kv['bank_transfer_account_number'])) {
                $walletCfg['bank_account_number'] = (string)$kv['bank_transfer_account_number'];
            }
            if (!empty($kv['bank_transfer_account_name'])) {
                $walletCfg['bank_account_name'] = trim((string)$kv['bank_transfer_account_name']);
            }
            if (!empty($kv['active_payment_gateway'])) {
                $gwCfg['active_gateway'] = (string)$kv['active_payment_gateway'];
            }
        } catch (Throwable) {
        }
        $normalizedAcc = preg_replace('/\s+/', '', trim((string)($walletCfg['bank_account_number'] ?? '')));
        $walletCfg['bank_account_number'] = $normalizedAcc !== '' ? $normalizedAcc : '5210741634';
        $walletCfg['min_funding_amount'] = max(100.0, (float)$walletCfg['min_funding_amount']);
        $walletCfg['max_funding_amount'] = max($walletCfg['min_funding_amount'], (float)$walletCfg['max_funding_amount']);

        $activeGw = strtolower((string)($gwCfg['active_gateway'] ?? 'paystack'));
        if ($activeGw === 'flutterwave' && empty($gwCfg['enable_flutterwave'])) {
            $activeGw = !empty($gwCfg['enable_paystack']) ? 'paystack' : 'manual';
        } elseif ($activeGw === 'paystack' && empty($gwCfg['enable_paystack'])) {
            $activeGw = !empty($gwCfg['enable_flutterwave']) ? 'flutterwave' : 'manual';
        }
        $gwCfg['active_gateway'] = $activeGw;

        return ['wallet' => $walletCfg, 'gateways' => $gwCfg];
    }

    /**
     * 1. GET /api/wallet/summary
     */
    public function summary(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $summary = $this->walletService->getSummary($user['id']);
        $policy = $this->getWalletPolicy();
        $wCfg = $policy['wallet'];
        $gCfg = $policy['gateways'];
        $activeGateway = strtolower((string)($gCfg['active_gateway'] ?? 'paystack'));

        // Fetch recent transactions
        $recentTxns = $this->db->fetchAll(
            'SELECT id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at 
             FROM transactions 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 15',
            ['uid' => $user['id']]
        );

        $isAdmin = in_array($user['role'] ?? '', Auth::CONSOLE_ROLES, true);
        foreach ($recentTxns as &$t) {
            $t['amount'] = (float)$t['amount'];
            $t['balance_before'] = (float)$t['balance_before'];
            $t['balance_after'] = (float)$t['balance_after'];
            if (!empty($t['metadata'])) {
                $meta = is_string($t['metadata']) ? json_decode($t['metadata'], true) : $t['metadata'];
                if (!$isAdmin && is_array($meta)) {
                    unset($meta['provider'], $meta['provider_id'], $meta['provider_cost'], $meta['wholesale_cost'], $meta['cost'], $meta['cost_price'], $meta['provider_ref'], $meta['raw_response'], $meta['endpoint'], $meta['api_url']);
                }
                $t['metadata'] = $meta;
            }
            if (!$isAdmin && is_array($t['metadata'])) {
                unset($t['metadata']['provider_response'], $t['metadata']['raw_response'], $t['metadata']['provider_cost'], $t['metadata']['wholesale_cost']);
            }
        }

        $paystackActive = (bool)($gCfg['enable_paystack'] ?? true);
        $flwActive = (bool)($gCfg['enable_flutterwave'] ?? false);
        $manualActive = (bool)($wCfg['manual_funding_enabled'] ?? true) && (bool)($gCfg['enable_bank_transfer'] ?? true);

        $availableGateways = [
            [
                'id' => 'paystack',
                'name' => 'Paystack Merchant Checkout',
                'status' => $paystackActive ? 'active' : 'disabled',
                'is_active' => ($activeGateway === 'paystack' && $paystackActive),
            ],
            [
                'id' => 'manual',
                'name' => 'Direct Bank Transfer',
                'status' => $manualActive ? 'active' : 'disabled',
                'is_active' => ($activeGateway === 'manual' && $manualActive),
            ],
            [
                'id' => 'flutterwave',
                'name' => 'Flutterwave Enterprise Gateway',
                'status' => $flwActive ? 'active' : 'disabled',
                'is_active' => ($activeGateway === 'flutterwave' && $flwActive),
            ],
        ];

        Response::success([
            'wallet_id' => 'wal_' . $user['id'],
            'balance' => $summary['balance'],
            'currency' => $summary['currency'],
            'status' => $summary['status'],
            'totalSpent' => $summary['total_spent'],
            'totalFunded' => $summary['total_funded'],
            'pendingFunding' => $summary['pending_count'],
            'transactionCount' => $summary['total_transactions'],
            'recentTransactions' => $recentTxns,
            'activeGateway' => $activeGateway,
            'availableGateways' => $availableGateways,
            'fundingLimits' => [
                'min_amount' => (float)$wCfg['min_funding_amount'],
                'max_amount' => (float)$wCfg['max_funding_amount'],
            ],
            'bankDetails' => [
                'bank' => (string)($wCfg['bank_name'] ?? 'Moniepoint MFB'),
                'accountNumber' => (string)($wCfg['bank_account_number'] ?? '5210741634'),
                'accountName' => (string)($wCfg['bank_account_name'] ?? 'Hambaktech_Services'),
            ],
        ]);
    }

    /**
     * 2. GET /api/wallet/gateways
     */
    public function gateways(Request $request): void
    {
        $policy = $this->getWalletPolicy();
        $wCfg = $policy['wallet'];
        $gCfg = $policy['gateways'];
        $activeGateway = strtolower((string)($gCfg['active_gateway'] ?? 'paystack'));
        $paystackActive = (bool)($gCfg['enable_paystack'] ?? true);
        $flwActive = (bool)($gCfg['enable_flutterwave'] ?? false);
        $manualActive = (bool)($wCfg['manual_funding_enabled'] ?? true) && (bool)($gCfg['enable_bank_transfer'] ?? true);

        Response::success([
            'activeGateway' => $activeGateway,
            'gateways' => [
                [
                    'id' => 'paystack',
                    'name' => 'Paystack Gateway',
                    'status' => $paystackActive ? 'active' : 'disabled',
                    'is_active' => ($activeGateway === 'paystack' && $paystackActive),
                ],
                [
                    'id' => 'manual',
                    'name' => 'Bank Transfer',
                    'status' => $manualActive ? 'active' : 'disabled',
                    'is_active' => ($activeGateway === 'manual' && $manualActive),
                ],
                [
                    'id' => 'flutterwave',
                    'name' => 'Flutterwave Gateway',
                    'status' => $flwActive ? 'active' : 'disabled',
                    'is_active' => ($activeGateway === 'flutterwave' && $flwActive),
                ],
            ],
        ]);
    }

    /**
     * 3. POST /api/wallet/admin/gateways/switch (Admin only)
     */
    public function switchGateway(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $gatewayId = strtolower((string)$request->input('gatewayId', ''));

        if (!in_array($gatewayId, ['paystack', 'flutterwave', 'manual'], true)) {
            Response::error('Invalid gateway ID.', 422);
            return;
        }

        $policy = $this->getWalletPolicy();
        $gCfg = $policy['gateways'];
        if ($gatewayId === 'flutterwave' && empty($gCfg['enable_flutterwave'])) {
            Response::error('Flutterwave is currently disabled in Payment Gateway settings. Configure valid live credentials and enable it first.', 422);
            return;
        }
        if ($gatewayId === 'paystack' && empty($gCfg['enable_paystack'])) {
            Response::error('Paystack is currently disabled in Payment Gateway settings.', 422);
            return;
        }

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description) 
             VALUES ("set_active_gateway", "active_payment_gateway", :gw, "payment", "Active payment gateway")
             ON DUPLICATE KEY UPDATE setting_value = :gw2',
            ['gw' => $gatewayId, 'gw2' => $gatewayId]
        );

        $gCfg['active_gateway'] = $gatewayId;
        $gJson = json_encode($gCfg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, "payment_gateways_settings", :val, "payment_gateways", "Configuration for payment_gateways", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
            ['id' => Security::generateUuid(), 'val' => $gJson, 'val2' => $gJson]
        );

        Response::success([
            'activeGateway' => $gatewayId,
        ], "Active payment gateway switched to {$gatewayId}");
    }

    /**
     * 4. POST /api/wallet/fund/initiate and /api/wallet/paystack/initialize
     * Server-side checkout initialization with Paystack or Flutterwave
     */
    public function initiateFunding(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $uri = $request->getPath();
        $defaultGateway = str_contains($uri, 'flutterwave') ? 'flutterwave' : 'paystack';
        $gateway = strtolower((string)$request->input('gateway', $defaultGateway));
        $rawCallbackUrl = trim((string)$request->input('callback_url', 'https://hambaktech.com.ng/?payment=verify#portal'));
        $parsedCb = parse_url($rawCallbackUrl);
        $cbHost = strtolower((string)($parsedCb['host'] ?? ''));
        if (!is_array($parsedCb) || ($parsedCb['scheme'] ?? '') !== 'https' || !in_array($cbHost, ['hambaktech.com.ng', 'www.hambaktech.com.ng'], true)) {
            $rawCallbackUrl = 'https://hambaktech.com.ng/?payment=verify#portal';
        }
        $hashPos = strpos($rawCallbackUrl, '#');
        $cbBase = $hashPos !== false ? substr($rawCallbackUrl, 0, $hashPos) : $rawCallbackUrl;
        $cbFrag = $hashPos !== false ? substr($rawCallbackUrl, $hashPos) : '#portal';
        $cbSep = str_contains($cbBase, '?') ? '&' : '?';
        $amount = (float)$request->input('amount', 0);

        $policy = $this->getWalletPolicy();
        $minAmt = (float)$policy['wallet']['min_funding_amount'];
        $maxAmt = (float)$policy['wallet']['max_funding_amount'];
        $gCfg = $policy['gateways'];

        if ($gateway === 'flutterwave' && empty($gCfg['enable_flutterwave'])) {
            Response::error('Flutterwave checkout is currently disabled by administrator settings.', 403);
        }
        if ($gateway === 'paystack' && array_key_exists('enable_paystack', $gCfg) && empty($gCfg['enable_paystack'])) {
            Response::error('Paystack checkout is currently disabled by administrator settings.', 403);
        }

        if ($amount < $minAmt) {
            Response::error('Minimum wallet funding amount is ₦' . number_format($minAmt, 2) . '.', 422);
        }
        if ($amount > $maxAmt) {
            Response::error('Maximum single wallet funding amount is ₦' . number_format($maxAmt, 2) . '.', 422);
        }

        $refPrefix = ($gateway === 'flutterwave') ? 'FLWFUND' : 'PAY_';
        $reference = $refPrefix . strtoupper(bin2hex(random_bytes(6)));
        $paymentRecordId = Security::generateUuid();

        // 1. Create pending record in MySQL
        $this->db->execute(
            'INSERT INTO payment_records (id, user_id, gateway, reference, amount, status, created_at)
             VALUES (:id, :uid, :gateway, :ref, :amt, "pending", NOW())',
            [
                'id' => $paymentRecordId,
                'uid' => $user['id'],
                'gateway' => $gateway,
                'ref' => $reference,
                'amt' => $amount,
            ]
        );

        try {
            if ($gateway === 'flutterwave') {
                $initRes = $this->flutterwave->initializePayment(
                    $user['email'],
                    $amount,
                    $reference,
                    $cbBase . $cbSep . 'gateway=flutterwave&reference=' . rawurlencode($reference) . $cbFrag,
                    ['customer_name' => $user['full_name'], 'phone_number' => $user['phone_number']]
                );
            } else {
                $initRes = $this->paystack->initializePayment(
                    $user['email'],
                    $amount,
                    $reference,
                    $cbBase . $cbSep . 'gateway=paystack&reference=' . rawurlencode($reference) . $cbFrag,
                    ['customer_name' => $user['full_name'], 'phone_number' => $user['phone_number']]
                );
            }

            if (!empty($initRes)) {
                try {
                    $initMeta = array_filter([
                        'flw_va_id' => $initRes['flw_va_id'] ?? null,
                        'flw_charge_id' => $initRes['flw_charge_id'] ?? null,
                        'access_code' => $initRes['access_code'] ?? null,
                        'transfer_details' => $initRes['transfer_details'] ?? null,
                    ], static fn($v) => $v !== null && $v !== '');
                    if (!empty($initMeta)) {
                        $this->db->execute(
                            'UPDATE payment_records SET raw_response = :raw WHERE id = :id',
                            ['raw' => json_encode($initMeta), 'id' => $paymentRecordId]
                        );
                    }
                } catch (Throwable) {
                }
            }

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'wallet',
                'action' => 'WALLET_FUND_INITIATED',
                'service_type' => 'wallet_funding',
                'reference' => $reference,
                'provider' => $gateway,
                'status' => 'pending',
                'amount' => $amount,
                'metadata' => ['gateway' => $gateway],
            ]);

            Response::success([
                'reference' => $reference,
                'tx_ref' => $reference,
                'amount' => $amount,
                'authorization_url' => $initRes['authorization_url'] ?? ($initRes['link'] ?? ''),
                'link' => $initRes['link'] ?? ($initRes['authorization_url'] ?? ''),
                'access_code' => $initRes['access_code'] ?? null,
                'transfer_details' => $initRes['transfer_details'] ?? null,
                'flw_charge_id' => $initRes['flw_charge_id'] ?? ($initRes['flw_va_id'] ?? null),
                'gateway' => $gateway,
            ], 'Payment checkout initialized');
        } catch (Throwable $e) {
            $this->db->execute(
                'UPDATE payment_records SET status = "failed" WHERE id = :id',
                ['id' => $paymentRecordId]
            );

            FootprintService::record([
                'user_id' => $user['id'],
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'wallet',
                'action' => 'WALLET_FUND_INIT_FAILED',
                'service_type' => 'wallet_funding',
                'reference' => $reference,
                'provider' => $gateway,
                'status' => 'failed',
                'amount' => $amount,
                'error_message' => $e->getMessage(),
            ]);

            Response::error($e->getMessage(), 502);
        }
    }

    /**
     * 5. POST /api/wallet/fund/verify and /api/wallet/paystack/verify
     * Secure transaction verification with upstream carrier check
     */
    public function verifyFunding(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $reference = trim((string)($request->input('reference') ?? $request->query('reference', '')));
        $flwTransactionId = (string)($request->input('transaction_id') ?? $request->query('transaction_id', ''));
        $isSuperAdmin = ($user['role'] ?? '') === 'superadmin';

        if (empty($reference) && empty($flwTransactionId)) {
            Response::error('Payment reference is required for verification.', 422);
            return;
        }

        // 1. Look up payment record by reference globally first (prevents IDOR cross-user claiming!)
        $record = null;
        if (!empty($reference)) {
            $record = $this->db->fetchOne(
                'SELECT * FROM payment_records WHERE reference = :ref LIMIT 1',
                ['ref' => $reference]
            );
            if ($record && $record['user_id'] !== $user['id'] && !$isSuperAdmin) {
                Response::error('Unauthorized: This payment reference belongs to a different account.', 403);
                return;
            }
        }

        $targetUserId = (string)($record['user_id'] ?? $user['id']);
        $amount = $record ? (float)$record['amount'] : 0.0;

        // Idempotency: If already credited, do NOT credit again!
        if ($record && $record['status'] === 'successful') {
            $summary = $this->walletService->getSummary($targetUserId);
            Response::success([
                'settled' => true,
                'already_credited' => true,
                'status' => 'successful',
                'reference' => $record['reference'],
                'balance' => $summary['balance'],
            ], 'Payment already credited to your wallet.');
            return;
        }

        // Check if matching transaction already settled in ledger
        if (!empty($reference)) {
            $existingTx = $this->db->fetchOne('SELECT * FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $reference]);
            if ($existingTx) {
                if ($existingTx['user_id'] !== $user['id'] && !$isSuperAdmin) {
                    Response::error('Unauthorized: This transaction reference belongs to a different account.', 403);
                    return;
                }
                if ($existingTx['status'] === 'successful') {
                    $summary = $this->walletService->getSummary($targetUserId);
                    Response::success([
                        'settled' => true,
                        'already_credited' => true,
                        'status' => 'successful',
                        'reference' => $reference,
                        'balance' => $summary['balance'],
                    ], 'Payment already verified and credited.');
                    return;
                }
            }
        }

        $gateway = $record['gateway'] ?? ((str_starts_with($reference, 'FLWFUND') || str_starts_with($reference, 'FLW_')) ? 'flutterwave' : 'paystack');
        $savedVaId = null;
        if ($record && !empty($record['raw_response'])) {
            $recRaw = is_string($record['raw_response']) ? json_decode($record['raw_response'], true) : $record['raw_response'];
            if (is_array($recRaw) && !empty($recRaw['flw_va_id'])) {
                $savedVaId = (string)$recRaw['flw_va_id'];
            }
        }

        try {
            // 2. Perform live verification directly with provider cURL
            if ($gateway === 'flutterwave') {
                $verifyRes = $this->flutterwave->verifyPayment($reference, !empty($flwTransactionId) ? $flwTransactionId : null, $savedVaId);
            } else {
                $verifyRes = $this->paystack->verifyPayment($reference);
            }

            $upStatus = strtolower(trim((string)($verifyRes['status'] ?? '')));

            if ($upStatus === 'successful') {
                $amount = (float)($verifyRes['amount'] ?? 0);
                $feeAmount = max(0.0, (float)($verifyRes['fee'] ?? 0));
                $currency = strtoupper(trim((string)($verifyRes['currency'] ?? 'NGN')));

                if ($currency !== 'NGN') {
                    throw new RuntimeException("Invalid payment currency: {$currency}. Only NGN is supported.");
                }
                if ($amount <= 0) {
                    throw new RuntimeException('Verified payment amount is invalid.');
                }
                if ($record && $amount < (float)$record['amount']) {
                    throw new RuntimeException("Underpayment detected: Expected ₦{$record['amount']}, but received ₦{$amount}.");
                }
                if (!$record && !$isSuperAdmin) {
                    $upEmail = strtolower(trim((string)($verifyRes['customer_email'] ?? '')));
                    $actorEmail = strtolower(trim((string)($user['email'] ?? '')));
                    if ($upEmail === '' || $actorEmail === '' || $upEmail !== $actorEmail) {
                        Response::error('Unauthorized: Upstream payment customer email does not match your account.', 403);
                        return;
                    }
                }

                // 3. Synchronize against concurrent webhook/verify calls via row lock
                $settlement = $this->db->withTransaction(function (Database $db) use ($targetUserId, $reference, $record, $amount, $feeAmount, $gateway, $verifyRes) {
                    if ($record) {
                        $locked = $db->fetchOne(
                            'SELECT id, status FROM payment_records WHERE id = :id FOR UPDATE',
                            ['id' => $record['id']]
                        );
                        if ($locked && $locked['status'] === 'successful') {
                            return ['already_settled' => true];
                        }
                    }

                    $txResult = $this->walletService->credit(
                        $targetUserId,
                        $amount,
                        'funding',
                        $reference,
                        'Automated deposit via ' . ucfirst($gateway),
                        $gateway,
                        [
                            'provider_raw' => $verifyRes['raw'] ?? null,
                            'channel' => $verifyRes['channel'] ?? 'card',
                            'gateway_fee' => $feeAmount,
                        ]
                    );

                    if ($record) {
                        $db->execute(
                            'UPDATE payment_records SET status = "successful", fee = :fee, paid_at = NOW(), raw_response = :raw WHERE id = :id',
                            [
                                'fee' => $feeAmount,
                                'raw' => json_encode($verifyRes['raw'] ?? $verifyRes),
                                'id' => $record['id'],
                            ]
                        );
                    }

                    return ['already_settled' => false, 'txResult' => $txResult];
                });

                if (!empty($settlement['already_settled'])) {
                    $summary = $this->walletService->getSummary($targetUserId);
                    Response::success([
                        'settled' => true,
                        'already_credited' => true,
                        'status' => 'successful',
                        'reference' => $reference,
                        'balance' => $summary['balance'],
                    ], 'Payment already verified and credited.');
                    return;
                }

                $txResult = $settlement['txResult'];
                $ownerUser = ($targetUserId === $user['id'])
                    ? $user
                    : ($this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $targetUserId]) ?: $user);

                // Best-effort accounting ledger synchronization
                try {
                    (new AccountingService($this->db))->syncWebsiteTransactions();
                } catch (Throwable) {
                }

                // Customer notification (best-effort)
                try {
                    $this->db->execute(
                        'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                         VALUES (:id, :uid, "Wallet Credited", :msg, "success", 0, NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $targetUserId,
                            'msg' => '₦' . number_format($amount, 2) . " has been credited to your wallet via {$gateway} (Ref: {$reference}).",
                        ]
                    );
                } catch (Throwable) {
                }

                FootprintService::record([
                    'user_id' => $targetUserId,
                    'user_email' => $ownerUser['email'] ?? null,
                    'user_name' => $ownerUser['full_name'] ?? null,
                    'category' => 'wallet',
                    'action' => 'WALLET_FUND_SUCCESSFUL',
                    'service_type' => 'wallet_funding',
                    'reference' => $reference,
                    'provider' => $gateway,
                    'status' => 'successful',
                    'amount' => $amount,
                    'metadata' => ['balance_after' => $txResult['balance_after'] ?? null, 'verified_by' => $user['id']],
                ]);

                // Send automated wallet credit receipt email from notification@hambaktech.com.ng
                try {
                    $mailer = new MailService();
                    $safeName = htmlspecialchars((string)($ownerUser['full_name'] ?? 'Valued Customer'), ENT_QUOTES, 'UTF-8');
                    $amtFmt = '₦' . number_format($amount, 2);
                    $balFmt = '₦' . number_format((float)($txResult['balance_after'] ?? 0), 2);
                    $gwLabel = ucfirst($gateway);
                    $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                        . "<h2 style='margin:0 0 12px;color:#059669;'>Wallet Credited: {$amtFmt}</h2>"
                        . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                        . "<p style='color:#334155;'>Your wallet deposit of <strong>{$amtFmt}</strong> via <strong>{$gwLabel}</strong> has been confirmed.</p>"
                        . "<div style='background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;margin:14px 0;font-size:13px;color:#334155;'>"
                        . "<div><strong>Reference:</strong> <code>{$reference}</code></div>"
                        . "<div><strong>New Balance:</strong> {$balFmt}</div></div>"
                        . "<p style='color:#64748b;font-size:12px;'>This is an automated receipt from HAMBAKTECH Notifications. Reply if you need assistance.</p></div>";
                    $mailer->send(
                        (string)$ownerUser['email'],
                        (string)($ownerUser['full_name'] ?? 'Customer'),
                        "Wallet Funding Confirmation ({$amtFmt}) — HAMBAKTECH",
                        $html,
                        null,
                        MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'WALLET_CREDIT_RECEIPT_EMAIL']
                    );
                } catch (Throwable) {
                }

                Response::success([
                    'settled' => true,
                    'status' => 'successful',
                    'amount' => $amount,
                    'balance' => $txResult['balance_after'],
                    'transaction' => $txResult,
                ], 'Payment verified and wallet credited successfully!');
            } elseif (in_array($upStatus, ['pending', 'ongoing', 'processing', 'queued', 'abandoned', ''], true)) {
                // Gateway has NOT rejected payment — user may still be completing checkout or bank transfer!
                Response::success([
                    'settled' => false,
                    'pending' => true,
                    'status' => 'pending',
                    'gateway_status' => $upStatus !== '' ? $upStatus : 'pending',
                    'reference' => $reference,
                    'message' => 'Payment is still awaiting confirmation from ' . ucfirst($gateway) . '.',
                ], 'Payment is still awaiting confirmation. Complete checkout and click Verify Payment.');
            } else {
                // Terminal gateway failure (failed, reversed, cancelled, error)
                if ($record && $record['status'] !== 'successful') {
                    $this->db->execute(
                        'UPDATE payment_records SET status = "failed", raw_response = :raw WHERE id = :id AND status != "successful"',
                        ['raw' => json_encode($verifyRes['raw'] ?? $verifyRes), 'id' => $record['id']]
                    );
                }

                FootprintService::record([
                    'user_id' => $targetUserId,
                    'user_email' => $user['email'] ?? null,
                    'user_name' => $user['full_name'] ?? null,
                    'category' => 'wallet',
                    'action' => 'WALLET_FUND_FAILED',
                    'service_type' => 'wallet_funding',
                    'reference' => $reference,
                    'provider' => $gateway,
                    'status' => 'failed',
                    'amount' => $amount,
                    'error_message' => $verifyRes['gateway_response'] ?? 'Transaction failed',
                ]);

                Response::error('Payment not verified upstream: ' . ($verifyRes['gateway_response'] ?? 'Transaction failed'), 400);
            }
        } catch (Throwable $e) {
            FootprintService::record([
                'user_id' => $targetUserId,
                'user_email' => $user['email'] ?? null,
                'user_name' => $user['full_name'] ?? null,
                'category' => 'wallet',
                'action' => 'WALLET_FUND_ERROR',
                'service_type' => 'wallet_funding',
                'reference' => $reference,
                'provider' => $gateway,
                'status' => 'failed',
                'amount' => $amount,
                'error_message' => $e->getMessage(),
            ]);
            Response::error($e->getMessage(), 502);
        }
    }

    /**
     * 6. POST /api/wallet/paystack/webhook
     * Official Paystack Webhook Handler with HMAC-SHA512 validation
     */
    public function paystackWebhook(Request $request): void
    {
        $rawBody = file_get_contents('php://input') ?: '';
        $signature = $request->header('x-paystack-signature') ?? ($request->header('X-Paystack-Signature') ?? '');

        if (!$this->paystack->validateWebhookSignature($rawBody, $signature)) {
            Response::error('Invalid Paystack webhook signature', 401);
            return;
        }

        $payload = json_decode($rawBody, true) ?: [];
        $event = $payload['event'] ?? '';

        if ($event === 'charge.success') {
            $data = $payload['data'] ?? [];
            $reference = trim((string)($data['reference'] ?? ''));
            $amountInKobo = (float)($data['amount'] ?? 0);
            $amount = round($amountInKobo / 100, 2);
            $feeAmount = round(((float)($data['fees'] ?? 0)) / 100, 2);
            $currency = strtoupper(trim((string)($data['currency'] ?? 'NGN')));
            $email = strtolower(trim((string)($data['customer']['email'] ?? '')));

            if (empty($reference) || $amount <= 0 || $currency !== 'NGN') {
                Response::success(['status' => 'ignored_invalid_payload']);
                return;
            }

            // Prioritize payment_records.reference first to avoid cross-account email mismatch
            $recordMatch = $this->db->fetchOne('SELECT user_id FROM payment_records WHERE reference = :ref LIMIT 1', ['ref' => $reference]);
            $user = null;
            if ($recordMatch && !empty($recordMatch['user_id'])) {
                $user = ['id' => $recordMatch['user_id']];
            } elseif ($email !== '') {
                $user = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]);
            }

            if ($user) {
                $settledRes = $this->db->withTransaction(function (Database $db) use ($user, $reference, $amount, $feeAmount, $event, $data) {
                    $record = $db->fetchOne(
                        'SELECT id, status, amount FROM payment_records WHERE reference = :ref FOR UPDATE',
                        ['ref' => $reference]
                    );
                    if ($record && $record['status'] === 'successful') {
                        return ['already_settled' => true];
                    }
                    if ($record && $amount < (float)$record['amount']) {
                        throw new RuntimeException('Paystack webhook underpayment rejected.');
                    }

                    $tx = $this->walletService->credit(
                        $user['id'],
                        $amount,
                        'funding',
                        $reference,
                        'Paystack Webhook Automated Settlement',
                        'paystack',
                        [
                            'webhook_event' => $event,
                            'channel' => $data['channel'] ?? 'card',
                            'gateway_fee' => $feeAmount,
                        ]
                    );

                    if ($record) {
                        $db->execute(
                            'UPDATE payment_records SET status = "successful", fee = :fee, paid_at = NOW(), raw_response = :raw WHERE id = :id',
                            ['fee' => $feeAmount, 'raw' => json_encode($data), 'id' => $record['id']]
                        );
                    }
                    return ['already_settled' => false, 'tx' => $tx];
                });

                if (empty($settledRes['already_settled'])) {
                    try {
                        (new AccountingService($this->db))->syncWebsiteTransactions();
                    } catch (Throwable) {
                    }
                    try {
                        $uRow = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $user['id']]);
                        if ($uRow && !empty($uRow['email'])) {
                            $mailer = new MailService();
                            $amtFmt = '₦' . number_format($amount, 2);
                            $balFmt = '₦' . number_format((float)($settledRes['tx']['balance_after'] ?? 0), 2);
                            $safeName = htmlspecialchars((string)($uRow['full_name'] ?: 'Customer'), ENT_QUOTES, 'UTF-8');
                            $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                                . "<h2 style='margin:0 0 12px;color:#059669;'>Wallet Credited: {$amtFmt}</h2>"
                                . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                                . "<p style='color:#334155;'>Your Paystack wallet deposit of <strong>{$amtFmt}</strong> (Ref: <code>{$reference}</code>) has been confirmed. New Balance: <strong>{$balFmt}</strong>.</p></div>";
                            $mailer->send((string)$uRow['email'], (string)($uRow['full_name'] ?: 'Customer'), "Wallet Funding Confirmed ({$amtFmt}) — HAMBAKTECH", $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'PAYSTACK_WEBHOOK_CREDIT_EMAIL']);
                        }
                    } catch (Throwable) {
                    }
                }
            }
        }

        Response::success(['status' => 'processed']);
    }

    /**
     * 7. POST /api/wallet/flutterwave/webhook
     * Official Flutterwave Webhook Handler with v4 (flutterwave-signature HMAC-SHA256) and v3 (verif-hash) validation
     */
    public function flutterwaveWebhook(Request $request): void
    {
        $rawBody = file_get_contents('php://input') ?: '';
        $signature = $request->header('flutterwave-signature')
            ?? $request->header('Flutterwave-Signature')
            ?? $request->header('verif-hash')
            ?? ($request->header('Verif-Hash') ?? '');

        if (!$this->flutterwave->validateWebhookSignature($rawBody, (string)$signature)) {
            Response::error('Invalid Flutterwave webhook signature', 401);
            return;
        }

        $payload = json_decode($rawBody, true) ?: [];
        $data = $payload['data'] ?? [];
        $statusLower = strtolower((string)($data['status'] ?? ''));

        if ($data && in_array($statusLower, ['successful', 'succeeded', 'completed', 'paid'], true)) {
            $rawRef = (string)($data['meta']['wallet_reference'] ?? ($data['tx_ref'] ?? ($data['reference'] ?? '')));
            $reference = trim($rawRef);
            $alphaRef = preg_replace('/[^A-Za-z0-9]/', '', $reference) ?: $reference;
            $amount = (float)($data['amount'] ?? 0.0);
            $feeAmount = (float)($data['fees'][0]['amount'] ?? ($data['app_fee'] ?? 0.0));
            $currency = strtoupper((string)($data['currency'] ?? 'NGN'));
            $email = strtolower(trim((string)($data['customer']['email'] ?? '')));

            if (!empty($reference) && $amount > 0 && $currency === 'NGN') {
                $recordMatch = $this->db->fetchOne(
                    'SELECT user_id, reference FROM payment_records WHERE reference = :ref OR REPLACE(reference, "_", "") = :aref LIMIT 1',
                    ['ref' => $reference, 'aref' => $alphaRef]
                );
                if ($recordMatch) {
                    $reference = (string)$recordMatch['reference'];
                    $user = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $recordMatch['user_id']]);
                } else {
                    $user = !empty($email)
                        ? $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email])
                        : null;
                }

                if ($user) {
                    $settledRes = $this->db->withTransaction(function (Database $db) use ($user, $reference, $amount, $feeAmount, $data) {
                        $record = $db->fetchOne(
                            'SELECT id, status, amount, reference FROM payment_records WHERE reference = :ref FOR UPDATE',
                            ['ref' => $reference]
                        );
                        if ($record && $record['status'] === 'successful') {
                            return ['already_settled' => true];
                        }
                        if ($record && $amount < (float)$record['amount']) {
                            throw new RuntimeException('Flutterwave webhook underpayment rejected.');
                        }

                        $tx = $this->walletService->credit(
                            $user['id'],
                            $amount,
                            'funding',
                            $reference,
                            'Flutterwave Webhook Automated Settlement',
                            'flutterwave',
                            ['flw_id' => $data['id'] ?? null, 'gateway_fee' => $feeAmount]
                        );

                        if ($record) {
                            $db->execute(
                                'UPDATE payment_records SET status = "successful", fee = :fee, paid_at = NOW(), raw_response = :raw WHERE id = :id',
                                ['fee' => $feeAmount, 'raw' => json_encode($data), 'id' => $record['id']]
                            );
                        }
                        return ['already_settled' => false, 'tx' => $tx];
                    });

                    if (empty($settledRes['already_settled'])) {
                        try {
                            (new AccountingService($this->db))->syncWebsiteTransactions();
                        } catch (Throwable) {
                        }
                    }

                    if (empty($settledRes['already_settled']) && !empty($user['email'])) {
                        try {
                            $mailer = new MailService();
                            $amtFmt = '₦' . number_format($amount, 2);
                            $balFmt = '₦' . number_format((float)($settledRes['tx']['balance_after'] ?? 0), 2);
                            $safeName = htmlspecialchars((string)($user['full_name'] ?? 'Customer'), ENT_QUOTES, 'UTF-8');
                            $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                                . "<h2 style='margin:0 0 12px;color:#059669;'>Wallet Credited: {$amtFmt}</h2>"
                                . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                                . "<p style='color:#334155;'>Your Flutterwave transfer of <strong>{$amtFmt}</strong> (Ref: <code>{$reference}</code>) has settled into your wallet. New Balance: <strong>{$balFmt}</strong>.</p></div>";
                            $mailer->send((string)$user['email'], (string)($user['full_name'] ?? 'Customer'), "Wallet Funding Confirmed ({$amtFmt}) — HAMBAKTECH", $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'FLW_WEBHOOK_CREDIT_EMAIL']);
                        } catch (Throwable) {
                        }
                    }
                }
            }
        }

        Response::success(['status' => 'processed']);
    }

    /**
     * 8. POST /api/wallet/manual-funding
     * Handles real file upload or JSON receipt submission with secure storage outside public root
     */
    public function manualFunding(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $policy = $this->getWalletPolicy();
        $wCfg = $policy['wallet'];
        $gCfg = $policy['gateways'];
        if (empty($wCfg['manual_funding_enabled']) || (array_key_exists('enable_bank_transfer', $gCfg) && empty($gCfg['enable_bank_transfer']))) {
            Response::error('Manual bank transfer deposits are currently disabled by administrators.', 403);
        }

        $amount = (float)$request->input('amount', 0);
        $depositorName = trim((string)($request->input('depositor_name') ?? $request->input('sender_name', $user['full_name'])));
        // Always enforce authoritative receiving bank details from server wallet_settings (prevents client-side spoofing)
        $bankName = trim((string)($wCfg['bank_name'] ?? 'Moniepoint MFB')) ?: 'Moniepoint MFB';
        $accountNumber = preg_replace('/\s+/', '', trim((string)($wCfg['bank_account_number'] ?? '5210741634'))) ?: '5210741634';
        $paymentRef = trim((string)($request->input('reference') ?? $request->input('payment_reference', '')));
        $paymentDate = (string)($request->input('payment_date', date('Y-m-d')));
        $paymentMethod = (string)($request->input('payment_method', 'Bank Transfer'));
        $remarks = trim((string)($request->input('remarks', 'Manual bank deposit')));

        $minManual = max(500.0, (float)$wCfg['min_funding_amount']);
        $maxManual = (float)$wCfg['max_funding_amount'];
        if ($amount < $minManual) {
            Response::error('Minimum manual funding amount is ₦' . number_format($minManual, 2) . '.', 422);
            return;
        }
        if ($amount > $maxManual) {
            Response::error('Maximum manual funding amount is ₦' . number_format($maxManual, 2) . '.', 422);
            return;
        }

        if (empty($paymentRef)) {
            $paymentRef = 'MAN_REF_' . strtoupper(bin2hex(random_bytes(5)));
        }

        // Prevent duplicate submissions with identical reference
        $existingReq = $this->db->fetchOne(
            'SELECT id, status FROM manual_funding_requests WHERE payment_reference = :ref OR (user_id = :uid AND amount = :amt AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE))',
            ['ref' => $paymentRef, 'uid' => $user['id'], 'amt' => $amount]
        );
        if ($existingReq) {
            Response::error("A manual funding request with this reference or recent amount is already {$existingReq['status']}.", 409);
            return;
        }

        // Handle required receipt file upload (ignore untrusted external payment_proof_url strings)
        if (!isset($_FILES['receipt']) || !is_array($_FILES['receipt'])) {
            Response::error('Bank transfer receipt upload (JPG, PNG, or PDF) is required.', 422);
            return;
        }
        if ($_FILES['receipt']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Receipt upload failed (code ' . (int)$_FILES['receipt']['error'] . '). Ensure file is JPG, PNG, or PDF and under 5MB.', 422);
            return;
        }

        $storageDir = dirname(__DIR__) . '/storage/receipts';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
            @file_put_contents($storageDir . '/.htaccess', "Deny from all\n");
        }

        $file = $_FILES['receipt'];
        $maxBytes = 5 * 1024 * 1024; // 5MB
        if ($file['size'] <= 0 || $file['size'] > $maxBytes) {
            Response::error('Uploaded receipt must be valid and not exceed 5MB.', 422);
            return;
        }

        $allowedExts = ['jpg', 'jpeg', 'png', 'pdf'];
        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Invalid receipt format. Allowed formats: JPG, PNG, PDF.', 422);
            return;
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : '';
        if ($finfo) {
            finfo_close($finfo);
        }
        $allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!in_array($mime, $allowedMimes, true)) {
            Response::error('File content validation failed. Please upload a valid JPG, PNG, or PDF receipt.', 422);
            return;
        }

        $proofFilename = 'receipt_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $destination = $storageDir . '/' . $proofFilename;

        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            Response::error('Failed to securely store receipt file on server.', 500);
            return;
        }

        $receiptUrl = '/api/wallet/receipt/' . $proofFilename;
        $requestId = Security::generateUuid();

        $this->db->execute(
            'INSERT INTO manual_funding_requests 
             (id, user_id, amount, bank_name, account_number, payment_reference, payment_date, payment_method, depositor_name, remarks, teller_proof_url, proof_filename, status, created_at)
             VALUES 
             (:id, :uid, :amt, :bank, :acc, :ref, :pdate, :pmeth, :name, :rem, :url, :fname, "pending", NOW())',
            [
                'id' => $requestId,
                'uid' => $user['id'],
                'amt' => $amount,
                'bank' => $bankName,
                'acc' => $accountNumber,
                'ref' => $paymentRef,
                'pdate' => $paymentDate,
                'pmeth' => $paymentMethod,
                'name' => $depositorName,
                'rem' => $remarks,
                'url' => $receiptUrl,
                'fname' => $proofFilename,
            ]
        );

        // 1. Notify ALL active console admins/superadmins/managers authorized for wallet approvals
        $amtFmt = '₦' . number_format($amount, 2);
        $adminTitle = "New Manual Funding: {$amtFmt}";
        $adminMsg = "Customer {$depositorName} submitted transfer proof for {$amtFmt} to {$bankName} ({$accountNumber}, Ref: {$paymentRef}). Review required.";
        $notifiedEmails = [];
        try {
            $consoleAdmins = $this->db->fetchAll(
                'SELECT u.id, u.email, u.full_name, u.role, u.assigned_permissions, p.assigned_permissions AS profile_permissions
                 FROM users u
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.status = "active" AND u.role IN ("superadmin", "admin", "manager", "staff", "support")'
            );
            foreach ($consoleAdmins as $adm) {
                $admRole = DashboardConfigService::normalizeRole((string)($adm['role'] ?? ''));
                $admPerms = [];
                $hasExplicit = false;
                foreach ([$adm['assigned_permissions'] ?? null, $adm['profile_permissions'] ?? null] as $rawPerm) {
                    if (is_string($rawPerm) && trim($rawPerm) !== '') {
                        $dec = json_decode($rawPerm, true);
                        if (is_array($dec)) {
                            $admPerms = $dec;
                            $hasExplicit = true;
                            break;
                        }
                    } elseif (is_array($rawPerm)) {
                        $admPerms = $rawPerm;
                        $hasExplicit = true;
                        break;
                    }
                }
                if ($admRole === 'superadmin') {
                    $admPerms = ['*'];
                } elseif (!$hasExplicit && Auth::isConsoleRole($admRole)) {
                    $admPerms = DashboardConfigService::getDefaultPermissionsForRole($admRole);
                }
                if (!Auth::hasPermission(['role' => $admRole, 'permissions' => $admPerms], 'wallet')) {
                    continue;
                }
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, "alert", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $adm['id'],
                        'title' => $adminTitle,
                        'msg' => $adminMsg,
                    ]
                );
                if (!empty($adm['email'])) {
                    $notifiedEmails[] = ['email' => (string)$adm['email'], 'name' => (string)($adm['full_name'] ?? 'Admin')];
                }
            }
        } catch (Throwable) {
            // Fallback single notification if schema query fails
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, "usr_superadmin", :title, :msg, "alert", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'title' => $adminTitle,
                    'msg' => $adminMsg,
                ]
            );
        }

        // Best-effort email alert to finance/superadmin team
        if (!empty($notifiedEmails)) {
            try {
                $mailer = new MailService();
                $safeDep = htmlspecialchars($depositorName, ENT_QUOTES, 'UTF-8');
                $safeRef = htmlspecialchars($paymentRef, ENT_QUOTES, 'UTF-8');
                $safeCustEmail = htmlspecialchars((string)($user['email'] ?? ''), ENT_QUOTES, 'UTF-8');
                $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    . "<h2 style='margin:0 0 12px;color:#0284c7;'>New Manual Funding Proof: {$amtFmt}</h2>"
                    . "<p style='color:#334155;'>A customer submitted a manual bank transfer deposit awaiting Admin approval:</p>"
                    . "<div style='background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;margin:14px 0;font-size:13px;color:#334155;'>"
                    . "<div><strong>Depositor:</strong> {$safeDep} ({$safeCustEmail})</div>"
                    . "<div><strong>Amount:</strong> {$amtFmt}</div>"
                    . "<div><strong>Receiving Account:</strong> {$bankName} ({$accountNumber})</div>"
                    . "<div><strong>Reference:</strong> <code>{$safeRef}</code></div></div>"
                    . "<p style='color:#64748b;font-size:12px;'>Log into the Admin Funding Queue to inspect the uploaded receipt and Approve or Reject.</p></div>";
                foreach ($notifiedEmails as $rec) {
                    $mailer->send($rec['email'], $rec['name'], "Pending Manual Funding ({$amtFmt}) — HAMBAKTECH Admin", $html, null, MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'ADMIN_MANUAL_FUNDING_ALERT_EMAIL']);
                }
            } catch (Throwable) {
            }
        }

        // 2. Send Acknowledgement notification to customer
        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, "Funding Request Received", :msg, "info", 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'msg' => "Your manual transfer proof for {$amtFmt} (Ref: {$paymentRef}) has been received and is pending verification.",
            ]
        );

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'wallet',
            'action' => 'WALLET_MANUAL_FUND_SUBMITTED',
            'service_type' => 'manual_transfer',
            'reference' => $paymentRef,
            'provider' => 'bank_transfer',
            'status' => 'pending',
            'amount' => $amount,
            'metadata' => [
                'bank_name' => $bankName,
                'account_number' => $accountNumber,
                'depositor_name' => $depositorName,
                'proof_filename' => $proofFilename,
            ],
        ]);

        Response::success([
            'request_id' => $requestId,
            'reference' => $paymentRef,
            'amount' => $amount,
            'bank_name' => $bankName,
            'account_number' => $accountNumber,
            'status' => 'pending',
            'proof_url' => $receiptUrl,
            'message' => 'Manual funding submitted! Finance team will verify and credit your wallet.',
        ], 'Payment proof submitted successfully. You will be notified upon verification.', 201);
    }

    /**
     * 9. GET /api/wallet/receipt/:filename
     * Secure streaming of uploaded receipts with permission check
     */
    public function getReceipt(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $filename = basename($params['filename'] ?? '');

        if (empty($filename)) {
            Response::error('File not specified', 400);
        }

        // Permission check: Must be owner or admin
        $req = $this->db->fetchOne('SELECT user_id, proof_filename FROM manual_funding_requests WHERE proof_filename = :fn', ['fn' => $filename]);
        if (!$req) {
            Response::error('File record not found', 404);
        }

        $role = strtolower((string)($user['role'] ?? 'customer'));
        $perms = is_array($user['permissions'] ?? null) ? $user['permissions'] : [];
        $canViewReceipts = in_array($role, Auth::CONSOLE_ROLES, true) && (
            $role === 'superadmin' ||
            in_array('*', $perms, true) ||
            in_array('wallet', $perms, true) ||
            in_array('customers', $perms, true)
        );
        if (!$canViewReceipts && $user['id'] !== $req['user_id']) {
            Response::error('Unauthorized access to receipt file', 403);
        }

        $filepath = dirname(__DIR__) . '/storage/receipts/' . $filename;
        if (!file_exists($filepath)) {
            Response::error('Receipt file not found on disk', 404);
        }

        $ext = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));
        $mimes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'pdf' => 'application/pdf',
        ];
        $contentType = $mimes[$ext] ?? 'application/octet-stream';

        header('Content-Type: ' . $contentType);
        header('Content-Length: ' . filesize($filepath));
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Cache-Control: private, no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        readfile($filepath);
        exit;
    }

    /**
     * 10. GET /api/wallet/statement
     */
    public function statement(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $rawStart = trim((string)$request->query('startDate', ''));
        $rawEnd = trim((string)$request->query('endDate', ''));
        $startDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawStart) ? $rawStart : '';
        $endDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawEnd) ? $rawEnd : '';
        $category = (string)$request->query('category', '');
        $type = (string)$request->query('type', '');

        $data = $this->walletService->getStatement($user['id'], $startDate ?: null, $endDate ?: null, $category ?: null, $type ?: null);
        Response::success($data);
    }

    /**
     * 11. GET /api/wallet/transactions
     */
    public function transactions(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $limit = min(100, max(1, (int)$request->query('limit', 50)));
        $offset = max(0, (int)$request->query('offset', 0));
        $category = (string)$request->query('category', '');

        $whereSql = 'WHERE user_id = :uid ';
        $params = ['uid' => $user['id']];

        if (!empty($category)) {
            $whereSql .= 'AND category = :cat ';
            $params['cat'] = $category;
        }

        $isAdmin = in_array($user['role'] ?? '', Auth::CONSOLE_ROLES, true);

        $idRows = $this->db->fetchAll(
            'SELECT id FROM transactions ' . $whereSql . 'ORDER BY created_at DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset,
            $params
        );
        $rows = [];
        if (!empty($idRows)) {
            $ids = array_values(array_filter(array_column($idRows, 'id')));
            if (!empty($ids)) {
                $placeholders = [];
                $idParams = [];
                foreach ($ids as $idx => $tid) {
                    $ph = ':tx_' . $idx;
                    $placeholders[] = $ph;
                    $idParams['tx_' . $idx] = $tid;
                }
                $rows = $this->db->fetchAll(
                    'SELECT id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at
                     FROM transactions
                     WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $idParams
                );
                $orderMap = array_flip($ids);
                usort($rows, static fn($a, $b) => ($orderMap[$a['id']] ?? PHP_INT_MAX) <=> ($orderMap[$b['id']] ?? PHP_INT_MAX));
            }
        }
        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
            $r['balance_before'] = (float)$r['balance_before'];
            $r['balance_after'] = (float)$r['balance_after'];
            if (!empty($r['metadata'])) {
                $meta = is_string($r['metadata']) ? json_decode($r['metadata'], true) : $r['metadata'];
                if (!$isAdmin && is_array($meta)) {
                    unset($meta['provider'], $meta['provider_id'], $meta['provider_cost'], $meta['wholesale_cost'], $meta['cost'], $meta['cost_price'], $meta['provider_ref'], $meta['raw_response'], $meta['endpoint'], $meta['api_url']);
                }
                $r['metadata'] = $meta;
            }
        }

        Response::success(['transactions' => $rows]);
    }

    /**
     * 12. GET /api/wallet/virtual-account (Future Dedicated Virtual Account Architecture)
     */
    public function virtualAccount(Request $request): void
    {
        $user = Auth::requireAuth($request);

        $va = $this->db->fetchOne(
            'SELECT * FROM customer_virtual_accounts WHERE user_id = :uid',
            ['uid' => $user['id']]
        );

        if ($va) {
            Response::success([
                'has_virtual_account' => true,
                'account_number' => $va['account_number'],
                'bank_name' => $va['bank_name'],
                'status' => $va['account_status'],
                'created_at' => $va['created_at'],
            ]);
        } else {
            $policy = $this->getWalletPolicy();
            $walletBank = $policy['wallet'] ?? [];
            $bankName = trim((string)($walletBank['manual_bank_name'] ?? $walletBank['bank_name'] ?? ''));
            $accountNumber = trim((string)($walletBank['manual_account_number'] ?? $walletBank['bank_account_number'] ?? ''));
            $accountName = trim((string)($walletBank['manual_account_name'] ?? $walletBank['bank_account_name'] ?? ''));
            Response::success([
                'has_virtual_account' => false,
                'status' => 'pending_activation',
                'message' => 'Dedicated NGN virtual accounts will be activated once business regulatory approvals are completed on Flutterwave.',
                'bankDetails' => [
                    'bank' => $bankName,
                    'accountNumber' => $accountNumber,
                    'accountName' => $accountName,
                ],
            ]);
        }
    }
}
