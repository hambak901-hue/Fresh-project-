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
use HambakTech\Core\SchemaSync;
use HambakTech\Services\WalletService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Services\AccountingService;
use HambakTech\Services\DashboardConfigService;
use HambakTech\Adapters\Payment\PaystackAdapter;

class WalletController
{
    private Database $db;
    private WalletService $walletService;
    private PaystackAdapter $paystack;

    public function __construct()
    {
        $this->db = Database::getInstance();
        SchemaSync::syncPaystackDvaSchema($this->db);
        $this->walletService = new WalletService();
        $this->paystack = new PaystackAdapter();
    }

    private function getWalletPolicy(): array
    {
        $walletCfg = [
            'min_funding_amount' => 100.0,
            'max_funding_amount' => 500000.0,
            'manual_funding_enabled' => false,
            'bank_name' => '',
            'bank_account_number' => '',
            'bank_account_name' => '',
        ];
        $gwCfg = [
            'active_gateway' => 'paystack',
            'enable_paystack' => true,
            'enable_paystack_dva' => false,
            'dva_rollout_mode' => 'paused',
            'dva_test_user_emails' => '',
            'dva_require_bvn' => true,
            'dva_auto_provision_on_register' => true,
            'dva_auto_provision_on_wallet_open' => true,
            'paystack_dva_preferred_bank' => 'wema-bank',
            'dva_fee_bearer' => 'customer',
            'enable_bank_transfer' => false,
        ];
        $custDashCfg = [
            'enable_virtual_accounts' => true,
        ];
        try {
            $rows = $this->db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("wallet_settings","payment_gateways_settings","active_payment_gateway","customer_dashboard_settings")'
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
            if (!empty($kv['customer_dashboard_settings'])) {
                $dec = json_decode((string)$kv['customer_dashboard_settings'], true);
                if (is_array($dec)) {
                    $custDashCfg = array_merge($custDashCfg, $dec);
                }
            }
        } catch (Throwable) {
        }
        $walletCfg['manual_funding_enabled'] = false;
        $walletCfg['bank_name'] = '';
        $walletCfg['bank_account_number'] = '';
        $walletCfg['bank_account_name'] = '';
        $walletCfg['min_funding_amount'] = max(100.0, (float)$walletCfg['min_funding_amount']);
        $walletCfg['max_funding_amount'] = max($walletCfg['min_funding_amount'], (float)$walletCfg['max_funding_amount']);

        $gwCfg['enable_bank_transfer'] = false;
        $gwCfg['active_gateway'] = 'paystack';
        $gwCfg['enable_paystack_dva'] = array_key_exists('enable_paystack_dva', $gwCfg)
            ? (bool)$gwCfg['enable_paystack_dva']
            : false;
        $gwCfg['enable_virtual_accounts'] = array_key_exists('enable_virtual_accounts', $custDashCfg)
            ? (bool)$custDashCfg['enable_virtual_accounts']
            : true;
        $rolloutMode = strtolower(trim((string)($gwCfg['dva_rollout_mode'] ?? 'paused')));
        $gwCfg['dva_rollout_mode'] = in_array($rolloutMode, ['testing_allowlist', 'all_eligible', 'paused'], true)
            ? $rolloutMode
            : 'paused';
        $testEmails = [];
        foreach (preg_split('/[\s,;]+/', (string)($gwCfg['dva_test_user_emails'] ?? '')) ?: [] as $em) {
            $emLower = strtolower(trim((string)$em));
            if ($emLower !== '' && filter_var($emLower, FILTER_VALIDATE_EMAIL)) {
                $testEmails[] = $emLower;
            }
        }
        $gwCfg['dva_test_user_emails_list'] = array_values(array_unique($testEmails));
        $gwCfg['dva_test_user_emails'] = implode(', ', $gwCfg['dva_test_user_emails_list']);
        $gwCfg['dva_require_bvn'] = array_key_exists('dva_require_bvn', $gwCfg)
            ? (bool)$gwCfg['dva_require_bvn']
            : true;
        $gwCfg['dva_auto_provision_on_register'] = array_key_exists('dva_auto_provision_on_register', $gwCfg)
            ? (bool)$gwCfg['dva_auto_provision_on_register']
            : true;
        $gwCfg['dva_auto_provision_on_wallet_open'] = array_key_exists('dva_auto_provision_on_wallet_open', $gwCfg)
            ? (bool)$gwCfg['dva_auto_provision_on_wallet_open']
            : true;
        $gwCfg['paystack_dva_preferred_bank'] = trim((string)($gwCfg['paystack_dva_preferred_bank'] ?? 'wema-bank')) ?: 'wema-bank';
        $gwCfg['dva_fee_bearer'] = strtolower(trim((string)($gwCfg['dva_fee_bearer'] ?? 'customer'))) === 'merchant'
            ? 'merchant'
            : 'customer';

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
                    unset($meta['provider'], $meta['provider_id'], $meta['provider_cost'], $meta['wholesale_cost'], $meta['cost'], $meta['cost_price'], $meta['provider_ref'], $meta['raw_response'], $meta['provider_response'], $meta['endpoint'], $meta['api_url']);
                    $meta = Security::sanitizeCustomerMetadata($meta);
                }
                $t['metadata'] = $meta;
            }
        }

        $paystackActive = (bool)($gCfg['enable_paystack'] ?? true);

        $availableGateways = [
            [
                'id' => 'paystack',
                'name' => 'Paystack Merchant Checkout',
                'status' => $paystackActive ? 'active' : 'disabled',
                'is_active' => ($activeGateway === 'paystack' && $paystackActive),
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
            'bankDetails' => null,
        ]);
    }

    /**
     * 2. GET /api/wallet/gateways
     */
    public function gateways(Request $request): void
    {
        $policy = $this->getWalletPolicy();
        $gCfg = $policy['gateways'];
        $activeGateway = strtolower((string)($gCfg['active_gateway'] ?? 'paystack'));
        $paystackActive = (bool)($gCfg['enable_paystack'] ?? true);

        Response::success([
            'activeGateway' => $activeGateway,
            'gateways' => [
                [
                    'id' => 'paystack',
                    'name' => 'Paystack Gateway',
                    'status' => $paystackActive ? 'active' : 'disabled',
                    'is_active' => ($activeGateway === 'paystack' && $paystackActive),
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

        if ($gatewayId !== 'paystack') {
            Response::error('Invalid gateway ID. Only Paystack is supported as an automated online payment gateway.', 422);
            return;
        }

        $policy = $this->getWalletPolicy();
        $gCfg = $policy['gateways'];
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
     * Server-side checkout initialization with Paystack
     */
    public function initiateFunding(Request $request): void
    {
        $user = Auth::requireVerifiedEmail($request);
        $gateway = strtolower(trim((string)$request->input('gateway', 'paystack')));
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

        if ($gateway !== 'paystack') {
            Response::error('Unsupported payment gateway. Paystack is the sole active wallet funding gateway.', 422);
            return;
        }
        if (array_key_exists('enable_paystack', $gCfg) && empty($gCfg['enable_paystack'])) {
            Response::error('Paystack checkout is currently disabled by administrator settings.', 403);
            return;
        }

        if ($amount < $minAmt) {
            Response::error('Minimum wallet funding amount is ₦' . number_format($minAmt, 2) . '.', 422);
        }
        if ($amount > $maxAmt) {
            Response::error('Maximum single wallet funding amount is ₦' . number_format($maxAmt, 2) . '.', 422);
        }

        $reference = 'PAY_' . strtoupper(bin2hex(random_bytes(6)));
        $paymentRecordId = Security::generateUuid();

        // 1. Create pending record in MySQL
        $this->db->execute(
            'INSERT INTO payment_records (id, user_id, gateway, reference, amount, status, created_at)
             VALUES (:id, :uid, :gateway, :ref, :amt, "pending", NOW())',
            [
                'id' => $paymentRecordId,
                'uid' => $user['id'],
                'gateway' => 'paystack',
                'ref' => $reference,
                'amt' => $amount,
            ]
        );

        try {
            $initRes = $this->paystack->initializePayment(
                $user['email'],
                $amount,
                $reference,
                $cbBase . $cbSep . 'gateway=paystack&reference=' . rawurlencode($reference) . $cbFrag,
                ['customer_name' => $user['full_name'], 'phone_number' => $user['phone_number']]
            );

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

            Security::logPrivateError('PaystackFundInit', $e, [
                'user_id' => $user['id'],
                'reference' => $reference,
                'amount' => $amount,
            ]);
            $classified = Security::classifyProviderError($e);
            $clientMsg = match ($classified['category']) {
                'provider_auth' => Security::ERR_PROVIDER_AUTH,
                'provider_wallet' => Security::ERR_PROVIDER_WALLET,
                default => Security::ERR_PROVIDER_UNAVAILABLE,
            };
            Response::error($clientMsg, (int)$classified['http_status']);
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

        $gateway = strtolower((string)($record['gateway'] ?? 'paystack'));
        if ($gateway !== 'paystack') {
            Response::error('This payment gateway is no longer supported. Please contact support for older transaction references.', 400);
            return;
        }

        try {
            // 2. Perform live verification directly with Paystack
            $verifyRes = $this->paystack->verifyPayment($reference);

            $upStatus = strtolower(trim((string)($verifyRes['status'] ?? '')));

            // Protect Paystack Checkout verification from misclassifying DVA bank transfers
            if (($verifyRes['channel'] ?? '') === 'dedicated_nuban') {
                Response::error('This reference belongs to a Dedicated Virtual Account bank transfer, which is settled automatically via Paystack webhook verification.', 400);
                return;
            }

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

                Response::error('Payment verification was not successful. Please try again or contact support.', 400);
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
            Security::logPrivateError('PaystackFundVerify', $e, [
                'user_id' => $targetUserId,
                'reference' => $reference,
                'amount' => $amount,
            ]);
            $classified = Security::classifyProviderError($e);
            $clientMsg = match ($classified['category']) {
                'customer_validation' => $classified['message'],
                'provider_auth' => Security::ERR_PROVIDER_AUTH,
                'provider_wallet' => Security::ERR_PROVIDER_WALLET,
                default => Security::ERR_PROVIDER_UNAVAILABLE,
            };
            Response::error($clientMsg, (int)$classified['http_status']);
        }
    }

    /**
     * Retired Flutterwave Webhook Endpoint Guard
     * Paystack is the sole active automated funding gateway; reject safely without fatal error.
     */
    public function flutterwaveWebhook(Request $request): void
    {
        Security::logPrivateError('FlutterwaveWebhookIgnored', 'Retired Flutterwave webhook endpoint called', [
            'ip' => Security::resolveClientIp(),
        ]);
        Response::error('Flutterwave gateway is retired; Paystack is the sole active wallet funding gateway.', 410);
    }

    /**
     * 6. POST /api/wallet/paystack/webhook
     * Official Paystack Webhook Handler with HMAC-SHA512 validation
     */
    public function paystackWebhook(Request $request): void
    {
        $rawBody = file_get_contents('php://input') ?: '';
        $signature = $request->header('x-paystack-signature') ?? ($request->header('X-Paystack-Signature') ?? '');
        $clientIp = Security::resolveClientIp();

        if (!$this->paystack->validateWebhookSignature($rawBody, $signature)) {
            Security::logPrivateError('PaystackWebhookRejected', 'Invalid or missing X-Paystack-Signature header', [
                'ip' => $clientIp,
                'has_signature' => trim((string)$signature) !== '',
            ]);
            $this->recordPaystackDvaAuditLog(
                null,
                'PAYSTACK_WEBHOOK_INVALID_SIGNATURE',
                [
                    'ip' => $clientIp,
                    'has_signature' => trim((string)$signature) !== '',
                ],
                $clientIp
            );
            Response::error('Invalid Paystack webhook signature', 401);
            return;
        }

        $this->recordLastSuccessfulWebhookTimestamp();

        $payload = json_decode($rawBody, true) ?: [];
        $event = strtolower(trim((string)($payload['event'] ?? '')));
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

        // -----------------------------------------------------------------
        // Event 1: Paystack Customer Identification Results
        // -----------------------------------------------------------------
        if ($event === 'customeridentification.success' || $event === 'customeridentification.failed') {
            $custCode = trim((string)($data['customer_code'] ?? ''));
            $email = strtolower(trim((string)($data['email'] ?? '')));
            $isSuccess = ($event === 'customeridentification.success');
            $reason = $isSuccess ? null : trim((string)($data['reason'] ?? 'Customer identity validation failed with payment partner.'));

            $va = null;
            if ($custCode !== '') {
                $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE paystack_customer_code = :cc LIMIT 1', ['cc' => $custCode]);
            }
            if (!$va && $email !== '') {
                $uRow = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :em LIMIT 1', ['em' => $email]);
                if ($uRow) {
                    $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $uRow['id']]);
                }
            }
            if ($va) {
                $this->db->execute(
                    'UPDATE customer_virtual_accounts
                        SET kyc_validation_status = :kvs,
                            assignment_status = CASE
                                WHEN :failed1 = 1 AND assignment_status != "assigned" THEN "failed"
                                ELSE assignment_status
                            END,
                            provisioning_status = CASE
                                WHEN provisioning_status IN ("active", "suspended", "deactivated") THEN provisioning_status
                                WHEN :failed3 = 1 THEN "awaiting_customer_info"
                                ELSE "processing"
                            END,
                            error_code = CASE
                                WHEN :failed4 = 1 THEN "CUSTOMER_IDENTIFICATION_FAILED"
                                ELSE NULL
                            END,
                            failure_reason = CASE WHEN :failed2 = 1 THEN :reason ELSE NULL END,
                            last_synced_at = NOW(),
                            raw_assignment_payload = :raw,
                            updated_at = NOW()
                      WHERE id = :id',
                    [
                        'kvs' => $isSuccess ? 'verified' : 'failed',
                        'failed1' => $isSuccess ? 0 : 1,
                        'failed2' => $isSuccess ? 0 : 1,
                        'failed3' => $isSuccess ? 0 : 1,
                        'failed4' => $isSuccess ? 0 : 1,
                        'reason' => $reason,
                        'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                        'id' => $va['id'],
                    ]
                );

                if (!$isSuccess) {
                    $this->recordPaystackDvaAuditLog(
                        null,
                        'PAYSTACK_DVA_IDENTIFICATION_FAILED',
                        [
                            'target_user_id' => $va['user_id'] ?? null,
                            'paystack_customer_code' => $custCode ?: ($va['paystack_customer_code'] ?? null),
                            'reason' => $reason,
                        ],
                        $request->getIp()
                    );
                }

                // Automatically complete two-step dedicated account creation once identification succeeds
                if ($isSuccess && !in_array((string)($va['provisioning_status'] ?? ''), ['active', 'suspended', 'deactivated'], true)) {
                    $resolvedCustCode = $custCode ?: (string)($va['paystack_customer_code'] ?? '');
                    if ($resolvedCustCode !== '') {
                        try {
                            $this->completeDvaAfterIdentification((string)$va['user_id'], $resolvedCustCode);
                        } catch (Throwable $e) {
                            Security::logPrivateError('PaystackDvaPostIdentification', $e, ['user_id' => $va['user_id']]);
                        }
                    }
                }
            }
            Response::success(['status' => 'processed', 'event' => $event]);
            return;
        }

        // -----------------------------------------------------------------
        // Event 2: Paystack Dedicated Virtual Account Assignment Result
        // -----------------------------------------------------------------
        if ($event === 'dedicatedaccount.assign.success' || $event === 'dedicatedaccount.assign.failed') {
            $customerObj = is_array($data['customer'] ?? null) ? $data['customer'] : [];
            $custCode = trim((string)($customerObj['customer_code'] ?? ($data['customer_code'] ?? '')));
            $custEmail = strtolower(trim((string)($customerObj['email'] ?? ($data['email'] ?? ''))));
            $dvaObj = is_array($data['dedicated_account'] ?? null) ? $data['dedicated_account'] : [];

            $userRow = null;
            if ($custCode !== '') {
                $vaMatch = $this->db->fetchOne('SELECT user_id FROM customer_virtual_accounts WHERE paystack_customer_code = :cc LIMIT 1', ['cc' => $custCode]);
                if ($vaMatch && !empty($vaMatch['user_id'])) {
                    $userRow = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $vaMatch['user_id']]);
                }
            }
            if (!$userRow && $custEmail !== '') {
                $userRow = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE LOWER(email) = :em LIMIT 1', ['em' => $custEmail]);
            }

            if ($userRow) {
                if ($event === 'dedicatedaccount.assign.success' && !empty($dvaObj['account_number'])) {
                    $saved = $this->persistPaystackDvaAssignment($userRow['id'], $custCode, $dvaObj, 'verified', $data);
                    if ($saved && ($saved['assignment_status'] ?? '') === 'assigned') {
                        try {
                            $this->db->execute(
                                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                                 VALUES (:id, :uid, "Dedicated Bank Account Ready", :msg, "success", 0, NOW())',
                                [
                                    'id' => Security::generateUuid(),
                                    'uid' => $userRow['id'],
                                    'msg' => "Your dedicated {$saved['bank_name']} funding account ({$saved['account_number']}) is now active. Bank transfers to this account automatically credit your wallet.",
                                ]
                            );
                        } catch (Throwable) {
                        }
                        FootprintService::record([
                            'user_id' => $userRow['id'],
                            'user_email' => $userRow['email'] ?? null,
                            'user_name' => $userRow['full_name'] ?? null,
                            'category' => 'wallet',
                            'action' => 'DVA_ASSIGNED',
                            'service_type' => 'paystack_dva',
                            'reference' => 'PSK_DVA_' . ($saved['dedicated_account_id'] ?? $saved['account_number']),
                            'provider' => 'paystack',
                            'status' => 'successful',
                            'metadata' => [
                                'bank_name' => $saved['bank_name'],
                                'account_number' => $saved['account_number'],
                            ],
                        ]);
                    }
                } else {
                    $failMsg = trim((string)($data['reason'] ?? ($data['message'] ?? 'Paystack could not assign a dedicated account for this profile.')));
                    $existingVa = $this->db->fetchOne('SELECT id, assignment_status, provisioning_status FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userRow['id']]);
                    if ($existingVa && ($existingVa['assignment_status'] ?? '') !== 'assigned' && ($existingVa['provisioning_status'] ?? '') !== 'active') {
                        $this->db->execute(
                            'UPDATE customer_virtual_accounts
                                SET provider = "paystack",
                                    paystack_customer_code = COALESCE(:cc, paystack_customer_code),
                                    account_status = "inactive",
                                    assignment_status = "failed",
                                    provisioning_status = "failed",
                                    error_code = "DVA_ASSIGN_FAILED",
                                    failure_reason = :reason,
                                    last_synced_at = NOW(),
                                    raw_assignment_payload = :raw,
                                    updated_at = NOW()
                              WHERE id = :id',
                            [
                                'cc' => $custCode ?: null,
                                'reason' => $this->mapPaystackDvaErrorToSafeMessage($failMsg),
                                'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                                'id' => $existingVa['id'],
                            ]
                        );
                    }
                    $this->recordPaystackDvaAuditLog(
                        ['id' => $userRow['id'], 'email' => $userRow['email'] ?? null],
                        'PAYSTACK_DVA_ASSIGN_FAILED',
                        [
                            'target_user_id' => $userRow['id'],
                            'event' => $event,
                            'paystack_customer_code' => $custCode ?: null,
                            'error_code' => 'DVA_ASSIGN_FAILED',
                        ]
                    );
                }
            }
            Response::success(['status' => 'processed', 'event' => $event]);
            return;
        }

        // -----------------------------------------------------------------
        // Event 3: Failed Charge Events (Never Credit Wallet)
        // -----------------------------------------------------------------
        if ($event === 'charge.failed') {
            $reference = trim((string)($data['reference'] ?? ''));
            if ($reference === '') {
                Response::success(['status' => 'ignored_missing_reference']);
                return;
            }
            if ($this->classifyPaystackChargeIsDva($data, $reference)) {
                $res = $this->recordPaystackDvaFailedCharge($data, $event);
                Response::success($res);
                return;
            }
            $this->db->execute(
                'UPDATE payment_records SET status = "failed", raw_response = :raw WHERE reference = :ref AND status != "successful"',
                ['raw' => Security::sanitizeProviderLogPayload($data, 12000), 'ref' => $reference]
            );
            Response::success(['status' => 'processed_checkout_failed', 'reference' => $reference]);
            return;
        }

        // -----------------------------------------------------------------
        // Event 4: Refund / Reversal Events
        // -----------------------------------------------------------------
        if (in_array($event, ['refund.processed', 'refund.failed', 'refund.pending', 'refund.processing'], true)) {
            $res = $this->handlePaystackRefundWebhook($data, $event);
            Response::success($res);
            return;
        }

        // -----------------------------------------------------------------
        // Event 5: Dispute / Chargeback Events
        // -----------------------------------------------------------------
        if (in_array($event, ['charge.dispute.create', 'charge.dispute.remind', 'charge.dispute.resolve'], true)) {
            $res = $this->handlePaystackDisputeWebhook($data, $event);
            Response::success($res);
            return;
        }

        // -----------------------------------------------------------------
        // Event 6: Charge Success (Strictly Separate DVA vs Checkout)
        // -----------------------------------------------------------------
        if ($event === 'charge.success') {
            $reference = trim((string)($data['reference'] ?? ''));
            $txStatus = strtolower(trim((string)($data['status'] ?? 'success')));
            $amountInKobo = (float)($data['amount'] ?? 0);
            $amount = round($amountInKobo / 100, 2);
            $feeAmount = max(0.0, round(((float)($data['fees'] ?? 0)) / 100, 2));
            $currency = strtoupper(trim((string)($data['currency'] ?? 'NGN')));

            if ($txStatus !== 'success' || $reference === '' || $amount <= 0 || $currency !== 'NGN') {
                Response::success(['status' => 'ignored_invalid_payload']);
                return;
            }

            if ($this->classifyPaystackChargeIsDva($data, $reference)) {
                $dvaSettlement = $this->settlePaystackDvaCharge($data, $event);
                Response::success($dvaSettlement);
                return;
            }

            // Standard Paystack Merchant Checkout settlement (preserved & separate from DVA)
            $email = strtolower(trim((string)($data['customer']['email'] ?? '')));
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
                            'funding_method' => 'paystack_checkout',
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

        Response::success(['status' => 'processed', 'event' => $event]);
    }

    /**
     * 7. POST /api/wallet/manual-funding
     * Handles real file upload or JSON receipt submission with secure storage outside public root
     */
    public function manualFunding(Request $request): void
    {
        Auth::requireAuth($request);
        Response::error('Direct Bank Transfer and Bank Transfer Proof submission have been discontinued. Please fund your wallet via Paystack.', 410);
        return;
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
                    unset($meta['provider'], $meta['provider_id'], $meta['provider_cost'], $meta['wholesale_cost'], $meta['cost'], $meta['cost_price'], $meta['provider_ref'], $meta['raw_response'], $meta['provider_response'], $meta['endpoint'], $meta['api_url']);
                    $meta = Security::sanitizeCustomerMetadata($meta);
                }
                $r['metadata'] = $meta;
            }
        }

        Response::success(['transactions' => $rows]);
    }

    /**
     * 12. GET /api/wallet/virtual-account
     * Returns the customer's Paystack Dedicated Virtual Account state cleanly.
     * Reuses assigned account idempotently; for existing eligible customers with no DVA yet,
     * automatically initiates provisioning once inside an atomic DB lock without requiring a manual button.
     */
    public function virtualAccount(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $syncPending = ((string)$request->query('sync', '0')) === '1';
        $skipAuto = ((string)$request->query('no_auto', '0')) === '1';
        $state = $this->buildVirtualAccountPayloadForUser($user, $syncPending, !$skipAuto);
        Response::success($state);
    }

    /**
     * 13. POST /api/wallet/virtual-account/provision
     * Accepts optional consent, BVN, and Nigerian bank account details for Paystack DVA
     * onboarding/identification and provisions or retries idempotently.
     */
    public function provisionVirtualAccount(Request $request): void
    {
        $user = Auth::requireVerifiedEmail($request);
        $preferredBank = trim((string)$request->input('preferred_bank', ''));
        $dvaConsent = $request->input('dva_consent');
        $bvnInput = preg_replace('/\D/', '', (string)$request->input('bvn', ''));
        $bankCodeInput = trim((string)$request->input('bank_code', ''));
        $accountNumberInput = preg_replace('/\D/', '', (string)$request->input('account_number', ''));

        if ($bvnInput !== '' && strlen($bvnInput) !== 11) {
            Response::error('BVN must be exactly 11 numeric digits.', 422);
            return;
        }
        if ($accountNumberInput !== '' && strlen($accountNumberInput) !== 10) {
            Response::error('Bank account number must be exactly 10 digits.', 422);
            return;
        }
        if ($accountNumberInput !== '' && $bankCodeInput === '') {
            Response::error('Please select the bank associated with your account number.', 422);
            return;
        }

        if ($bvnInput !== '') {
            $dupBvn = $this->db->fetchOne(
                'SELECT user_id FROM user_profiles WHERE bvn = :bvn AND user_id != :uid LIMIT 1',
                ['bvn' => $bvnInput, 'uid' => $user['id']]
            );
            if ($dupBvn) {
                Response::error('This BVN is already linked to another HambakTech account.', 409);
                return;
            }
        }

        if ($dvaConsent !== null || $bvnInput !== '' || $bankCodeInput !== '' || $accountNumberInput !== '') {
            $consentBool = filter_var($dvaConsent, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $saveConsent = $consentBool === true ? 1 : 0;
            $last4 = $accountNumberInput !== '' ? substr($accountNumberInput, -4) : '';
            try {
                $this->db->execute(
                    'INSERT INTO user_profiles (user_id, bvn, dva_consent, dva_consent_at, dva_bank_code, dva_bank_account_last4, updated_at)
                     VALUES (:uid, :bvn, :cons, CASE WHEN :cons2 = 1 THEN NOW() ELSE NULL END, :bc, :l4, NOW())
                     ON DUPLICATE KEY UPDATE
                        bvn = COALESCE(NULLIF(:bvn2, ""), bvn),
                        dva_consent = CASE WHEN :cons3 = 1 THEN 1 ELSE dva_consent END,
                        dva_consent_at = CASE WHEN :cons4 = 1 AND dva_consent_at IS NULL THEN NOW() ELSE dva_consent_at END,
                        dva_bank_code = COALESCE(NULLIF(:bc2, ""), dva_bank_code),
                        dva_bank_account_last4 = COALESCE(NULLIF(:l4b, ""), dva_bank_account_last4),
                        updated_at = NOW()',
                    [
                        'uid' => $user['id'],
                        'bvn' => $bvnInput ?: null,
                        'cons' => $saveConsent,
                        'cons2' => $saveConsent,
                        'bc' => $bankCodeInput ?: null,
                        'l4' => $last4 ?: null,
                        'bvn2' => $bvnInput,
                        'cons3' => $saveConsent,
                        'cons4' => $saveConsent,
                        'bc2' => $bankCodeInput,
                        'l4b' => $last4,
                    ]
                );
            } catch (Throwable) {
            }

            if ($saveConsent === 1) {
                try {
                    $this->db->execute(
                        'UPDATE customer_virtual_accounts
                            SET dva_consent = 1,
                                dva_consent_at = COALESCE(dva_consent_at, NOW()),
                                updated_at = NOW()
                          WHERE user_id = :uid',
                        ['uid' => $user['id']]
                    );
                } catch (Throwable) {
                }
            }
        }

        $res = $this->requestPaystackDvaForUser($user, $preferredBank ?: null, [
            'bvn' => $bvnInput,
            'bank_code' => $bankCodeInput,
            'account_number' => $accountNumberInput,
            'force_retry' => true,
        ]);

        if (!empty($res['error'])) {
            Response::error((string)$res['error'], (int)($res['http_status'] ?? 400));
            return;
        }

        Response::success($res['payload'], (string)($res['message'] ?? 'Dedicated virtual account status updated.'));
    }

    /**
     * GET /api/wallet/virtual-account/banks
     * Returns supported Nigerian banks from Paystack for customer identification forms.
     */
    public function listDvaBanks(Request $request): void
    {
        Auth::requireAuth($request);
        if (!$this->paystack->hasSecretKey()) {
            Response::success(['banks' => []]);
            return;
        }
        try {
            $res = $this->paystack->listBanks('nigeria');
            $banks = [];
            foreach (($res['banks'] ?? []) as $b) {
                if (!is_array($b) || empty($b['code']) || empty($b['name'])) {
                    continue;
                }
                if (array_key_exists('active', $b) && empty($b['active'])) {
                    continue;
                }
                $banks[] = [
                    'name' => (string)$b['name'],
                    'code' => (string)$b['code'],
                    'slug' => (string)($b['slug'] ?? ''),
                ];
            }
            Response::success(['banks' => $banks]);
        } catch (Throwable) {
            Response::success(['banks' => []]);
        }
    }

    /**
     * 14. GET /api/admin/wallet/paystack/dva-status
     * Comprehensive Paystack DVA Management Overview, searchable paginated Customer Directory,
     * filterable Deposit Monitoring, Quarantined/Unmatched Transfers queue, and live policy/webhook health.
     */
    public function adminDvaStatus(Request $request): void
    {
        Auth::requirePermission($request, 'wallet');
        $policy = $this->getWalletPolicy();
        $capability = $this->paystack->checkDvaCapability();
        $gwPolicy = $policy['gateways'];

        // Directory filters & pagination
        $dirSearch = trim((string)$request->query('search', ''));
        $dirStatus = strtolower(trim((string)$request->query('status', 'all')));
        $dirKyc = strtolower(trim((string)$request->query('kyc_status', 'all')));
        $dirPage = max(1, (int)$request->query('page', 1));
        $dirLimit = min(100, max(5, (int)$request->query('limit', 15)));
        $dirOffset = ($dirPage - 1) * $dirLimit;

        // Deposit monitoring filters & pagination
        $txCustomer = trim((string)$request->query('tx_customer', ''));
        $txStatus = strtolower(trim((string)$request->query('tx_status', 'all')));
        $txRef = trim((string)$request->query('tx_reference', ''));
        $dateFromRaw = trim((string)$request->query('date_from', ''));
        $dateToRaw = trim((string)$request->query('date_to', ''));
        $dateFrom = preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFromRaw) ? $dateFromRaw : '';
        $dateTo = preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateToRaw) ? $dateToRaw : '';
        $txPage = max(1, (int)$request->query('tx_page', 1));
        $txLimit = min(100, max(5, (int)$request->query('tx_limit', 15)));
        $txOffset = ($txPage - 1) * $txLimit;

        $accounts = [];
        $accountsTotal = 0;
        $settlements = [];
        $settlementsTotal = 0;
        $unmatchedSettlements = [];
        $totals = [
            'eligible_customers_count' => 0,
            'assigned_accounts' => 0,
            'active_accounts' => 0,
            'pending_accounts' => 0,
            'failed_accounts' => 0,
            'suspended_accounts' => 0,
            'deactivated_accounts' => 0,
            'awaiting_info_accounts' => 0,
            'under_review_accounts' => 0,
            'settled_count' => 0,
            'under_review_count' => 0,
            'disputed_count' => 0,
            'reversed_count' => 0,
            'reversed_disputed_count' => 0,
            'failed_settlement_count' => 0,
            'total_gross' => 0.0,
            'total_paystack_fees' => 0.0,
            'customer_borne_fees' => 0.0,
            'merchant_borne_fees' => 0.0,
            'net_settlement' => 0.0,
            'total_net_credited' => 0.0,
            'wallet_liability_created' => 0.0,
            'under_review_amount' => 0.0,
            'reversed_amount' => 0.0,
            'reversed_disputed_amount' => 0.0,
        ];

        try {
            // 1. Live Overview DB Aggregates (unfiltered global truth)
            $requireBvn = !empty($gwPolicy['dva_require_bvn']);
            $bvnCondition = $requireBvn
                ? ' AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = u.id AND up.bvn IS NOT NULL AND CHAR_LENGTH(REGEXP_REPLACE(up.bvn, "[^0-9]", "")) = 11)'
                : '';
            try {
                $eligRow = $this->db->fetchOne(
                    'SELECT COUNT(*) AS cnt
                     FROM users u
                     WHERE u.role IN ("customer", "student", "agent")
                       AND u.status = "active"
                       AND (COALESCE(u.email_verified, 0) = 1 OR COALESCE(u.email_verification_required, 0) = 0)
                       AND COALESCE(u.kyc_level, u.tier, 1) >= 2' . $bvnCondition
                );
                $totals['eligible_customers_count'] = (int)($eligRow['cnt'] ?? 0);
            } catch (Throwable) {
                $bvnFallback = $requireBvn
                    ? ' AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = u.id AND up.bvn IS NOT NULL AND CHAR_LENGTH(TRIM(up.bvn)) = 11)'
                    : '';
                $eligRow = $this->db->fetchOne(
                    'SELECT COUNT(*) AS cnt
                     FROM users u
                     WHERE u.role IN ("customer", "student", "agent")
                       AND u.status = "active"
                       AND (COALESCE(u.email_verified, 0) = 1 OR COALESCE(u.email_verification_required, 0) = 0)
                       AND COALESCE(u.kyc_level, u.tier, 1) >= 2' . $bvnFallback
                );
                $totals['eligible_customers_count'] = (int)($eligRow['cnt'] ?? 0);
            }

            $vaAgg = $this->db->fetchOne(
                'SELECT
                    COUNT(CASE WHEN (provisioning_status = "active" OR (assignment_status = "assigned" AND account_status = "active" AND account_number != "")) THEN 1 END) AS active_cnt,
                    COUNT(CASE WHEN (provisioning_status IN ("processing", "pending_identification") OR (provisioning_status = "not_requested" AND assignment_status = "pending")) THEN 1 END) AS pending_cnt,
                    COUNT(CASE WHEN (provisioning_status = "failed" OR (provisioning_status = "not_requested" AND assignment_status = "failed")) THEN 1 END) AS failed_cnt,
                    COUNT(CASE WHEN provisioning_status = "suspended" THEN 1 END) AS suspended_cnt,
                    COUNT(CASE WHEN (provisioning_status = "deactivated" OR assignment_status = "deactivated") THEN 1 END) AS deactivated_cnt,
                    COUNT(CASE WHEN provisioning_status = "awaiting_customer_info" THEN 1 END) AS awaiting_cnt,
                    COUNT(CASE WHEN provisioning_status = "under_review" THEN 1 END) AS review_cnt
                 FROM customer_virtual_accounts
                 WHERE provider = "paystack"'
            );
            if ($vaAgg) {
                $totals['assigned_accounts'] = (int)($vaAgg['active_cnt'] ?? 0);
                $totals['active_accounts'] = (int)($vaAgg['active_cnt'] ?? 0);
                $totals['pending_accounts'] = (int)($vaAgg['pending_cnt'] ?? 0);
                $totals['failed_accounts'] = (int)($vaAgg['failed_cnt'] ?? 0);
                $totals['suspended_accounts'] = (int)($vaAgg['suspended_cnt'] ?? 0);
                $totals['deactivated_accounts'] = (int)($vaAgg['deactivated_cnt'] ?? 0);
                $totals['awaiting_info_accounts'] = (int)($vaAgg['awaiting_cnt'] ?? 0);
                $totals['under_review_accounts'] = (int)($vaAgg['review_cnt'] ?? 0);
            }

            $agg = $this->db->fetchOne(
                'SELECT
                    COUNT(CASE WHEN settlement_status = "settled" THEN 1 END) AS settled_count,
                    COUNT(CASE WHEN settlement_status = "under_review" THEN 1 END) AS under_review_count,
                    COUNT(CASE WHEN settlement_status = "disputed" THEN 1 END) AS disputed_count,
                    COUNT(CASE WHEN settlement_status = "reversed" THEN 1 END) AS reversed_count,
                    COUNT(CASE WHEN settlement_status = "failed" THEN 1 END) AS failed_settlement_count,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("settled", "disputed") THEN gross_amount ELSE 0 END), 0) AS total_gross,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("settled", "disputed") THEN paystack_fee ELSE 0 END), 0) AS total_paystack_fees,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("settled", "disputed") THEN CASE WHEN customer_borne_fee > 0 THEN customer_borne_fee WHEN fee_bearer = "customer" THEN paystack_fee ELSE 0 END ELSE 0 END), 0) AS customer_borne_fees,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("settled", "disputed") THEN CASE WHEN merchant_borne_fee > 0 THEN merchant_borne_fee WHEN fee_bearer = "merchant" THEN paystack_fee ELSE 0 END ELSE 0 END), 0) AS merchant_borne_fees,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("settled", "disputed") THEN CASE WHEN net_settlement_amount > 0 THEN net_settlement_amount ELSE GREATEST(0, gross_amount - paystack_fee) END ELSE 0 END), 0) AS net_settlement,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("settled", "disputed") THEN net_credit_amount ELSE 0 END), 0) AS total_net_credited,
                    COALESCE(SUM(CASE WHEN settlement_status = "under_review" THEN gross_amount ELSE 0 END), 0) AS under_review_amount,
                    COALESCE(SUM(CASE WHEN settlement_status = "reversed" THEN net_credit_amount ELSE 0 END), 0) AS reversed_amount,
                    COALESCE(SUM(CASE WHEN settlement_status IN ("reversed", "disputed") THEN gross_amount ELSE 0 END), 0) AS reversed_disputed_amount
                 FROM paystack_dva_settlements'
            );
            if ($agg) {
                $totals['settled_count'] = (int)$agg['settled_count'];
                $totals['under_review_count'] = (int)$agg['under_review_count'];
                $totals['disputed_count'] = (int)$agg['disputed_count'];
                $totals['reversed_count'] = (int)$agg['reversed_count'];
                $totals['reversed_disputed_count'] = (int)$agg['disputed_count'] + (int)$agg['reversed_count'];
                $totals['failed_settlement_count'] = (int)$agg['failed_settlement_count'];
                $totals['total_gross'] = round((float)$agg['total_gross'], 2);
                $totals['total_paystack_fees'] = round((float)$agg['total_paystack_fees'], 2);
                $totals['customer_borne_fees'] = round((float)$agg['customer_borne_fees'], 2);
                $totals['merchant_borne_fees'] = round((float)$agg['merchant_borne_fees'], 2);
                $totals['net_settlement'] = round((float)$agg['net_settlement'], 2);
                $totals['total_net_credited'] = round((float)$agg['total_net_credited'], 2);
                $totals['wallet_liability_created'] = round((float)$agg['total_net_credited'], 2);
                $totals['under_review_amount'] = round((float)$agg['under_review_amount'], 2);
                $totals['reversed_amount'] = round((float)$agg['reversed_amount'], 2);
                $totals['reversed_disputed_amount'] = round((float)$agg['reversed_disputed_amount'], 2);
            }

            // 2. Searchable & Paginated Customer Virtual Account Directory
            $dirWhere = ' WHERE va.provider = "paystack"';
            $dirParams = [];
            if ($dirSearch !== '') {
                $likeVal = '%' . $dirSearch . '%';
                $dirWhere .= ' AND (u.full_name LIKE :ds1 OR u.email LIKE :ds2 OR va.user_id LIKE :ds3 OR va.account_number LIKE :ds4 OR va.bank_name LIKE :ds5 OR va.paystack_customer_code LIKE :ds6)';
                $dirParams['ds1'] = $likeVal;
                $dirParams['ds2'] = $likeVal;
                $dirParams['ds3'] = $likeVal;
                $dirParams['ds4'] = $likeVal;
                $dirParams['ds5'] = $likeVal;
                $dirParams['ds6'] = $likeVal;
            }
            if ($dirStatus !== '' && $dirStatus !== 'all') {
                if ($dirStatus === 'pending') {
                    $dirWhere .= ' AND (va.provisioning_status IN ("processing", "pending_identification") OR va.assignment_status = "pending")';
                } elseif (in_array($dirStatus, ['active', 'processing', 'pending_identification', 'awaiting_customer_info', 'failed', 'suspended', 'deactivated', 'under_review', 'not_requested'], true)) {
                    $dirWhere .= ' AND va.provisioning_status = :dst';
                    $dirParams['dst'] = $dirStatus;
                }
            }
            if ($dirKyc !== '' && $dirKyc !== 'all') {
                if (in_array($dirKyc, ['unverified', 'pending', 'verified', 'failed'], true)) {
                    $dirWhere .= ' AND (va.kyc_validation_status = :dkyc1 OR LOWER(COALESCE(u.kyc_status, "")) = :dkyc2)';
                    $dirParams['dkyc1'] = $dirKyc;
                    $dirParams['dkyc2'] = $dirKyc;
                }
            }

            $dirCountRow = $this->db->fetchOne(
                'SELECT COUNT(*) AS cnt
                 FROM customer_virtual_accounts va
                 LEFT JOIN users u ON u.id = va.user_id' . $dirWhere,
                $dirParams
            );
            $accountsTotal = (int)($dirCountRow['cnt'] ?? 0);

            $accounts = $this->db->fetchAll(
                'SELECT va.id, va.user_id, va.provider, va.paystack_customer_code, va.dedicated_account_id,
                        va.account_number, va.account_name, va.bank_name, va.bank_slug, va.bank_code, va.currency,
                        va.account_status, va.kyc_validation_status, va.dva_consent, va.dva_consent_at,
                        va.assignment_status, va.provisioning_status, va.failure_reason, va.error_code,
                        va.total_inflow, va.assigned_at, va.last_synced_at, va.last_funding_at, va.created_at, va.updated_at,
                        u.full_name AS customer_name, u.email AS customer_email, u.kyc_status AS customer_kyc_status,
                        COALESCE(u.kyc_level, u.tier, 1) AS kyc_level,
                        (SELECT COUNT(*) FROM paystack_dva_settlements s WHERE s.user_id = va.user_id AND s.settlement_status = "settled") AS deposits_count,
                        (SELECT COALESCE(SUM(s.net_credit_amount), 0) FROM paystack_dva_settlements s WHERE s.user_id = va.user_id AND s.settlement_status = "settled") AS settled_deposits_total,
                        (SELECT MAX(COALESCE(s.settled_at, s.created_at)) FROM paystack_dva_settlements s WHERE s.user_id = va.user_id AND s.settlement_status IN ("settled", "disputed")) AS last_deposit_at
                 FROM customer_virtual_accounts va
                 LEFT JOIN users u ON u.id = va.user_id' . $dirWhere . '
                 ORDER BY va.updated_at DESC, va.created_at DESC
                 LIMIT ' . (int)$dirLimit . ' OFFSET ' . (int)$dirOffset,
                $dirParams
            );
            foreach ($accounts as &$acc) {
                $settledSum = (float)($acc['settled_deposits_total'] ?? 0);
                $acc['total_inflow'] = round(max((float)($acc['total_inflow'] ?? 0), $settledSum), 2);
                $acc['deposits_count'] = (int)($acc['deposits_count'] ?? 0);
                $acc['kyc_level'] = (int)($acc['kyc_level'] ?? 1);
                $acc['kyc_status'] = (string)($acc['customer_kyc_status'] ?: $acc['kyc_validation_status'] ?: 'unverified');
                $acc['dva_consent'] = !empty($acc['dva_consent']);
                $acc['provisioning_status'] = $this->resolveCanonicalProvisioningStatus($acc);
                $acc['last_deposit_at'] = $acc['last_deposit_at'] ?: ($acc['last_funding_at'] ?? null);
            }
            unset($acc);

            // 3. Filterable & Paginated DVA Deposit Monitoring
            $txWhere = ' WHERE 1=1';
            $txParams = [];
            if ($txCustomer !== '') {
                $cLike = '%' . $txCustomer . '%';
                $txWhere .= ' AND (u.full_name LIKE :tc1 OR u.email LIKE :tc2 OR s.user_id LIKE :tc3 OR s.account_number LIKE :tc4)';
                $txParams['tc1'] = $cLike;
                $txParams['tc2'] = $cLike;
                $txParams['tc3'] = $cLike;
                $txParams['tc4'] = $cLike;
            }
            if ($txRef !== '') {
                $rLike = '%' . $txRef . '%';
                $txWhere .= ' AND (s.paystack_reference LIKE :tr1 OR COALESCE(s.session_id, "") LIKE :tr2)';
                $txParams['tr1'] = $rLike;
                $txParams['tr2'] = $rLike;
            }
            if ($txStatus !== '' && $txStatus !== 'all') {
                if (in_array($txStatus, ['settled', 'under_review', 'failed', 'disputed', 'reversed'], true)) {
                    $txWhere .= ' AND s.settlement_status = :ts';
                    $txParams['ts'] = $txStatus;
                }
            }
            if ($dateFrom !== '') {
                $txWhere .= ' AND s.created_at >= :df';
                $txParams['df'] = $dateFrom . ' 00:00:00';
            }
            if ($dateTo !== '') {
                $txWhere .= ' AND s.created_at <= :dt';
                $txParams['dt'] = $dateTo . ' 23:59:59';
            }

            $txCountRow = $this->db->fetchOne(
                'SELECT COUNT(*) AS cnt
                 FROM paystack_dva_settlements s
                 LEFT JOIN users u ON u.id = s.user_id' . $txWhere,
                $txParams
            );
            $settlementsTotal = (int)($txCountRow['cnt'] ?? 0);

            $settlements = $this->db->fetchAll(
                'SELECT s.*, u.full_name AS customer_name, u.email AS customer_email
                 FROM paystack_dva_settlements s
                 LEFT JOIN users u ON u.id = s.user_id' . $txWhere . '
                 ORDER BY s.created_at DESC
                 LIMIT ' . (int)$txLimit . ' OFFSET ' . (int)$txOffset,
                $txParams
            );
            foreach ($settlements as &$st) {
                $st = $this->formatSettlementRowForAdmin($st);
            }
            unset($st);

            // 4. Dedicated Unmatched / Quarantined / Disputed Queue
            $unmatchedSettlements = $this->db->fetchAll(
                'SELECT s.*, u.full_name AS customer_name, u.email AS customer_email
                 FROM paystack_dva_settlements s
                 LEFT JOIN users u ON u.id = s.user_id
                 WHERE s.settlement_status IN ("under_review", "disputed")
                 ORDER BY s.created_at DESC
                 LIMIT 100'
            );
            foreach ($unmatchedSettlements as &$ust) {
                $ust = $this->formatSettlementRowForAdmin($ust);
            }
            unset($ust);
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackAdminDvaStatus', $e);
        }

        $lastWebhookAt = $this->getLastSuccessfulWebhookTimestamp();

        Response::success([
            'capability' => $capability,
            'last_successful_webhook_at' => $lastWebhookAt,
            'policy' => [
                'enable_paystack_dva' => (bool)$gwPolicy['enable_paystack_dva'],
                'enable_virtual_accounts' => (bool)$gwPolicy['enable_virtual_accounts'],
                'dva_rollout_mode' => $gwPolicy['dva_rollout_mode'],
                'dva_test_user_emails' => $gwPolicy['dva_test_user_emails_list'] ?? [],
                'dva_require_bvn' => (bool)$gwPolicy['dva_require_bvn'],
                'dva_auto_provision_on_register' => (bool)$gwPolicy['dva_auto_provision_on_register'],
                'dva_auto_provision_on_wallet_open' => (bool)$gwPolicy['dva_auto_provision_on_wallet_open'],
                'preferred_bank' => $gwPolicy['paystack_dva_preferred_bank'],
                'fee_bearer' => $gwPolicy['dva_fee_bearer'],
            ],
            'totals' => $totals,
            'reconciliation' => [
                'gross_deposits' => $totals['total_gross'],
                'customer_borne_fees' => $totals['customer_borne_fees'],
                'merchant_borne_fees' => $totals['merchant_borne_fees'],
                'total_paystack_fees' => $totals['total_paystack_fees'],
                'net_settlement' => $totals['net_settlement'],
                'wallet_liability_created' => $totals['wallet_liability_created'],
                'quarantined_count' => $totals['under_review_count'],
                'quarantined_amount' => $totals['under_review_amount'],
                'disputed_count' => $totals['disputed_count'],
                'reversed_count' => $totals['reversed_count'],
                'reversed_amount' => $totals['reversed_amount'],
            ],
            'accounts' => $accounts,
            'accounts_pagination' => [
                'page' => $dirPage,
                'limit' => $dirLimit,
                'total' => $accountsTotal,
                'total_pages' => max(1, (int)ceil($accountsTotal / $dirLimit)),
            ],
            'settlements' => $settlements,
            'settlements_pagination' => [
                'page' => $txPage,
                'limit' => $txLimit,
                'total' => $settlementsTotal,
                'total_pages' => max(1, (int)ceil($settlementsTotal / $txLimit)),
            ],
            'unmatched_settlements' => $unmatchedSettlements,
        ]);
    }

    /**
     * GET /api/admin/wallet/paystack/dva-customer/:id
     * Returns customer profile summary (no raw BVN/NIN), DVA details, associated deposits, and assignment/audit history.
     */
    public function adminDvaCustomerDetail(Request $request, array $params): void
    {
        Auth::requirePermission($request, 'wallet');
        $userId = trim((string)($params['id'] ?? ''));
        if ($userId === '') {
            Response::error('Customer user_id is required.', 422);
            return;
        }

        $userRow = $this->db->fetchOne(
            'SELECT u.id, u.full_name, u.email, u.phone_number, u.role, u.status,
                    u.kyc_status, COALESCE(u.kyc_level, u.tier, 1) AS kyc_level,
                    u.email_verified, COALESCE(w.balance, u.wallet_balance, 0) AS wallet_balance, u.created_at
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE u.id = :uid LIMIT 1',
            ['uid' => $userId]
        );
        if (!$userRow) {
            Response::error('Customer not found.', 404);
            return;
        }

        $profile = null;
        try {
            $profile = $this->db->fetchOne('SELECT bvn, dva_consent, dva_consent_at, dva_bank_code, dva_bank_account_last4 FROM user_profiles WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        } catch (Throwable) {
        }
        $bvnDigits = preg_replace('/\D/', '', (string)($profile['bvn'] ?? ''));
        $hasBvn = strlen($bvnDigits) === 11;

        $va = $this->db->fetchOne(
            'SELECT id, user_id, provider, paystack_customer_code, dedicated_account_id, order_ref,
                    account_number, account_name, bank_name, bank_id, bank_slug, bank_code, currency,
                    account_status, kyc_validation_status, dva_consent, dva_consent_at,
                    assignment_status, provisioning_status, failure_reason, error_code,
                    total_inflow, assigned_at, last_synced_at, last_funding_at, created_at, updated_at
             FROM customer_virtual_accounts
             WHERE user_id = :uid LIMIT 1',
            ['uid' => $userId]
        );
        if ($va) {
            $va['total_inflow'] = (float)($va['total_inflow'] ?? 0);
            $va['dva_consent'] = !empty($va['dva_consent']);
            $va['provisioning_status'] = $this->resolveCanonicalProvisioningStatus($va);
        }

        $deposits = $this->db->fetchAll(
            'SELECT s.*, u.full_name AS customer_name, u.email AS customer_email
             FROM paystack_dva_settlements s
             LEFT JOIN users u ON u.id = s.user_id
             WHERE s.user_id = :uid
             ORDER BY s.created_at DESC
             LIMIT 50',
            ['uid' => $userId]
        );
        foreach ($deposits as &$dep) {
            $dep = $this->formatSettlementRowForAdmin($dep);
        }
        unset($dep);

        $history = [];
        try {
            $uLike = '%' . $userId . '%';
            $auditRows = $this->db->fetchAll(
                'SELECT id, user_id, user_email, action, details, ip_address, created_at
                 FROM audit_logs
                 WHERE (action LIKE "PAYSTACK\_%" OR action LIKE "ADMIN\_DVA\_%")
                   AND (user_id = :uid1 OR details LIKE :ulike1)
                 ORDER BY created_at DESC
                 LIMIT 40',
                ['uid1' => $userId, 'ulike1' => $uLike]
            );
            foreach ($auditRows as $ar) {
                $det = is_string($ar['details'] ?? null) ? json_decode((string)$ar['details'], true) : ($ar['details'] ?? null);
                $history[] = [
                    'id' => $ar['id'],
                    'source' => 'audit_log',
                    'action' => $ar['action'],
                    'actor' => $ar['user_email'] ?: 'system',
                    'details' => $this->redactAuditDetails(is_array($det) ? $det : []),
                    'created_at' => $ar['created_at'],
                ];
            }
        } catch (Throwable) {
        }
        try {
            $uLike2 = '%' . $userId . '%';
            $fpRows = $this->db->fetchAll(
                'SELECT id, user_id, user_email, action, status, amount, reference, error_message, metadata, created_at
                 FROM activity_footprints
                 WHERE (service_type = "paystack_dva" OR action LIKE "DVA\_%" OR action LIKE "ADMIN\_DVA\_%")
                   AND (user_id = :uid2 OR metadata LIKE :ulike2)
                 ORDER BY created_at DESC
                 LIMIT 40',
                ['uid2' => $userId, 'ulike2' => $uLike2]
            );
            foreach ($fpRows as $fp) {
                $meta = is_string($fp['metadata'] ?? null) ? json_decode((string)$fp['metadata'], true) : ($fp['metadata'] ?? null);
                $history[] = [
                    'id' => 'fp_' . $fp['id'],
                    'source' => 'footprint',
                    'action' => $fp['action'],
                    'actor' => $fp['user_email'] ?: 'system',
                    'status' => $fp['status'],
                    'reference' => $fp['reference'],
                    'amount' => $fp['amount'] !== null ? (float)$fp['amount'] : null,
                    'details' => $this->redactAuditDetails(is_array($meta) ? $meta : []),
                    'created_at' => $fp['created_at'],
                ];
            }
        } catch (Throwable) {
        }
        usort($history, static fn($a, $b) => strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? '')));

        Response::success([
            'customer' => [
                'id' => $userRow['id'],
                'full_name' => $userRow['full_name'],
                'email' => $userRow['email'],
                'phone_number' => $userRow['phone_number'],
                'role' => $userRow['role'],
                'status' => $userRow['status'],
                'kyc_status' => $userRow['kyc_status'],
                'kyc_level' => (int)$userRow['kyc_level'],
                'email_verified' => !empty($userRow['email_verified']),
                'wallet_balance' => round((float)$userRow['wallet_balance'], 2),
                'has_bvn' => $hasBvn,
                'bvn_last4' => $hasBvn ? ('*******' . substr($bvnDigits, -4)) : null,
                'dva_consent' => !empty($profile['dva_consent']) || !empty($va['dva_consent']),
                'created_at' => $userRow['created_at'],
            ],
            'virtual_account' => $va ?: null,
            'deposits' => $deposits,
            'history' => array_slice($history, 0, 50),
        ]);
    }

    /**
     * 15. POST /api/admin/wallet/paystack/dva-requery
     * Requeries Paystack API for an existing Paystack-generated DVA status or pending inbound transfer.
     * Does NOT manually create accounts or manually credit balances.
     */
    public function adminRequeryDva(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'wallet');
        $userId = trim((string)$request->input('user_id', ''));
        $date = trim((string)$request->input('date', ''));

        if ($userId === '') {
            Response::error('Customer user_id is required.', 422);
            return;
        }
        if (!$this->paystack->hasSecretKey()) {
            Response::error('Paystack secret key is not configured.', 400);
            return;
        }

        $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        if (!$va) {
            Response::error('No Paystack DVA request record found for this customer.', 404);
            return;
        }

        try {
            $syncMsg = 'Synced Paystack DVA state.';
            if (!empty($va['paystack_customer_code'])) {
                $fetched = $this->paystack->fetchDedicatedAccountsByCustomer((string)$va['paystack_customer_code']);
                $activeDva = $this->pickConfirmedDvaFromList($fetched['accounts'] ?? []);
                if ($activeDva) {
                    $this->persistPaystackDvaAssignment($userId, (string)$va['paystack_customer_code'], $activeDva, 'verified', $activeDva);
                    $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]) ?: $va;
                    $syncMsg = 'Confirmed Paystack dedicated account synced.';
                } else {
                    $this->db->execute(
                        'UPDATE customer_virtual_accounts SET last_synced_at = NOW(), updated_at = NOW() WHERE user_id = :uid',
                        ['uid' => $userId]
                    );
                }
            }

            if (!empty($va['account_number']) && !empty($va['bank_slug'])) {
                $rq = $this->paystack->requeryDedicatedAccount(
                    (string)$va['account_number'],
                    (string)$va['bank_slug'],
                    $date ?: gmdate('Y-m-d')
                );
                if (!empty($rq['message'])) {
                    $syncMsg = $rq['message'];
                }
            }

            $this->recordPaystackDvaAuditLog(
                $admin,
                'PAYSTACK_DVA_REFRESHED',
                [
                    'target_user_id' => $userId,
                    'account_number' => $va['account_number'] ?? null,
                    'provisioning_status' => $this->resolveCanonicalProvisioningStatus($va),
                    'requery_date' => $date ?: gmdate('Y-m-d'),
                    'result' => $syncMsg,
                ],
                $request->getIp()
            );

            Response::success(['account' => $va], $syncMsg);
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackAdminDvaRequery', $e, ['user_id' => $userId]);
            Response::error('Unable to sync Paystack dedicated account status right now.', 502);
        }
    }

    /**
     * 16. POST /api/admin/wallet/paystack/dva-action
     * Admin lifecycle controls for Paystack DVA: provision (retry failed only), suspend, reactivate, deactivate (superadmin + Paystack supported), mark_under_review.
     */
    public function adminDvaAction(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'wallet');
        $userId = trim((string)$request->input('user_id', ''));
        $action = strtolower(trim((string)$request->input('action', '')));
        $reason = trim((string)$request->input('reason', ''));

        if ($userId === '' || !in_array($action, ['provision', 'suspend', 'reactivate', 'deactivate', 'mark_under_review'], true)) {
            Response::error('Valid user_id and action (provision, suspend, reactivate, deactivate, mark_under_review) are required.', 422);
            return;
        }

        if ($action === 'deactivate' && strtolower((string)($admin['role'] ?? '')) !== 'superadmin') {
            Response::error('Only Super Administrators are authorized to deactivate a Paystack dedicated virtual account.', 403);
            return;
        }

        $targetUser = $this->db->fetchOne('SELECT * FROM users WHERE id = :uid LIMIT 1', ['uid' => $userId]);
        if (!$targetUser) {
            Response::error('Customer account not found.', 404);
            return;
        }

        if ($action === 'provision') {
            $existingVa = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
            if (
                $existingVa
                && $this->resolveCanonicalProvisioningStatus($existingVa) === 'active'
                && preg_match('/^\d{10}$/', (string)($existingVa['account_number'] ?? ''))
            ) {
                Response::error('This customer already has an active Paystack dedicated virtual account. Active accounts will not be regenerated.', 409);
                return;
            }
            $res = $this->requestPaystackDvaForUser($targetUser, null, ['force_retry' => true, 'admin_triggered' => true]);
            if (!empty($res['error'])) {
                Response::error((string)$res['error'], (int)($res['http_status'] ?? 400));
                return;
            }
            $this->recordPaystackDvaAuditLog(
                $admin,
                'PAYSTACK_DVA_ADMIN_RETRY_PROVISION',
                [
                    'target_user_id' => $userId,
                    'target_email' => $targetUser['email'] ?? null,
                    'message' => $res['message'] ?? 'Provisioning triggered',
                ],
                $request->getIp()
            );
            Response::success($res['payload'], (string)($res['message'] ?? 'Paystack DVA provisioning triggered.'));
            return;
        }

        $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        if (!$va) {
            Response::error('No dedicated virtual account record exists for this customer.', 404);
            return;
        }

        $auditAction = 'PAYSTACK_DVA_' . strtoupper($action);
        if ($action === 'suspend') {
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "inactive",
                        provisioning_status = "suspended",
                        failure_reason = :reason,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE id = :id',
                ['reason' => $reason ?: 'Temporarily suspended by administrator.', 'id' => $va['id']]
            );
            $auditAction = 'PAYSTACK_DVA_SUSPENDED';
        } elseif ($action === 'reactivate') {
            if (empty($va['account_number']) || empty($va['bank_name'])) {
                Response::error('Cannot reactivate a DVA without an assigned Paystack account number.', 422);
                return;
            }
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "active",
                        assignment_status = "assigned",
                        provisioning_status = "active",
                        failure_reason = NULL,
                        error_code = NULL,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE id = :id',
                ['id' => $va['id']]
            );
            $auditAction = 'PAYSTACK_DVA_REACTIVATED';
        } elseif ($action === 'mark_under_review') {
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "pending_approval",
                        provisioning_status = "under_review",
                        failure_reason = :reason,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE id = :id',
                ['reason' => $reason ?: 'Placed under compliance review by administrator.', 'id' => $va['id']]
            );
            $auditAction = 'PAYSTACK_DVA_UNDER_REVIEW';
        } elseif ($action === 'deactivate') {
            if (empty($va['dedicated_account_id']) || !$this->paystack->hasSecretKey()) {
                Response::error('Deactivation is only supported when Paystack is configured and the account has a confirmed Paystack dedicated_account_id.', 422);
                return;
            }
            $deactRes = $this->paystack->deactivateDedicatedAccount((int)$va['dedicated_account_id']);
            if (empty($deactRes['ok'])) {
                Response::error((string)($deactRes['message'] ?? 'Paystack refused deactivation of this dedicated virtual account.'), 400);
                return;
            }
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "inactive",
                        assignment_status = "deactivated",
                        provisioning_status = "deactivated",
                        failure_reason = :reason,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE id = :id',
                ['reason' => $reason ?: 'Deactivated via Paystack API by Super Administrator.', 'id' => $va['id']]
            );
            $auditAction = 'PAYSTACK_DVA_DEACTIVATED';
        }

        FootprintService::record([
            'user_id' => $admin['id'],
            'user_email' => $admin['email'] ?? null,
            'user_name' => $admin['full_name'] ?? null,
            'category' => 'admin_wallet',
            'action' => 'ADMIN_DVA_' . strtoupper($action),
            'service_type' => 'paystack_dva',
            'reference' => 'ADM_DVA_' . strtoupper(substr(str_replace('-', '', $userId), 0, 12)),
            'provider' => 'paystack',
            'status' => 'successful',
            'metadata' => ['target_user_id' => $userId, 'reason' => $reason],
        ]);

        $this->recordPaystackDvaAuditLog(
            $admin,
            $auditAction,
            [
                'target_user_id' => $userId,
                'target_email' => $targetUser['email'] ?? null,
                'account_number' => $va['account_number'] ?? null,
                'dedicated_account_id' => $va['dedicated_account_id'] ?? null,
                'reason' => $reason ?: null,
            ],
            $request->getIp()
        );

        $updated = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE id = :id LIMIT 1', ['id' => $va['id']]);
        Response::success(['account' => $updated], "Customer dedicated virtual account updated ({$action}).");
    }

    /**
     * 17. POST /api/admin/wallet/paystack/dva-resolve-settlement
     * Investigates quarantined ('under_review') or disputed DVA deposits:
     * - reverify: re-verifies directly via Paystack API and only settles if Paystack confirms & matches assigned DVA.
     * - mark_failed: marks an unverified/invalid record failed with mandatory investigation reason (no wallet credit).
     * - verified_attribute: SuperAdmin-only exceptional resolution requiring Paystack server verification + written evidence + audit log.
     */
    public function adminResolveDvaSettlement(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'wallet');
        $settlementId = trim((string)$request->input('settlement_id', ''));
        $action = strtolower(trim((string)$request->input('action', 'reverify')));
        $reason = trim((string)$request->input('reason', ''));

        if ($settlementId === '' || !in_array($action, ['reverify', 'mark_failed', 'verified_attribute'], true)) {
            Response::error('Valid settlement_id and action (reverify, mark_failed, verified_attribute) are required.', 422);
            return;
        }

        $row = $this->db->fetchOne('SELECT * FROM paystack_dva_settlements WHERE id = :id LIMIT 1', ['id' => $settlementId]);
        if (!$row) {
            Response::error('DVA settlement record not found.', 404);
            return;
        }

        if ($row['settlement_status'] === 'settled' || $row['settlement_status'] === 'reversed') {
            Response::error("Settlement is already {$row['settlement_status']} and cannot be altered.", 409);
            return;
        }

        if ($action === 'mark_failed') {
            if (strlen($reason) < 5) {
                Response::error('Please provide an investigation reason (at least 5 characters) before marking failed.', 422);
                return;
            }
            $this->db->execute(
                'UPDATE paystack_dva_settlements
                    SET settlement_status = "failed",
                        quarantine_reason = :qr,
                        resolved_by = :rby,
                        resolved_at = NOW()
                  WHERE id = :id AND settlement_status IN ("under_review", "disputed")',
                [
                    'qr' => substr($reason, 0, 120),
                    'rby' => $admin['id'],
                    'id' => $settlementId,
                ]
            );
            $this->recordPaystackDvaAuditLog(
                $admin,
                'PAYSTACK_DVA_QUARANTINE_MARKED_FAILED',
                [
                    'settlement_id' => $settlementId,
                    'paystack_reference' => $row['paystack_reference'],
                    'gross_amount' => (float)$row['gross_amount'],
                    'reason' => $reason,
                ],
                $request->getIp()
            );
            $updated = $this->db->fetchOne('SELECT * FROM paystack_dva_settlements WHERE id = :id LIMIT 1', ['id' => $settlementId]);
            Response::success(['settlement' => $updated ? $this->formatSettlementRowForAdmin($updated) : null], 'Quarantined DVA record marked as failed.');
            return;
        }

        if (!$this->paystack->hasSecretKey()) {
            Response::error('Paystack secret key is required to verify transaction details.', 400);
            return;
        }

        if ($action === 'verified_attribute') {
            $superAdmin = Auth::requireSuperAdmin($request);
            $targetUserId = trim((string)$request->input('target_user_id', ''));
            $confirmed = filter_var($request->input('confirm_verified_attribution', false), FILTER_VALIDATE_BOOLEAN);
            if ($targetUserId === '' || strlen($reason) < 15 || !$confirmed) {
                Response::error('SuperAdmin attribution requires target_user_id, written investigation evidence (min 15 chars), and explicit confirmation.', 422);
                return;
            }
            $targetUser = $this->db->fetchOne('SELECT id, full_name, email, status FROM users WHERE id = :uid LIMIT 1', ['uid' => $targetUserId]);
            if (!$targetUser) {
                Response::error('Target customer account not found.', 404);
                return;
            }

            try {
                $verify = $this->paystack->verifyPayment((string)$row['paystack_reference']);
                if (strtolower((string)($verify['status'] ?? '')) !== 'successful') {
                    Response::error('Cannot attribute: Paystack server verification does not confirm a successful deposit.', 400);
                    return;
                }
                if (strtoupper((string)($verify['currency'] ?? 'NGN')) !== 'NGN' || abs((float)($verify['amount'] ?? 0) - (float)$row['gross_amount']) > 0.01) {
                    Response::error('Cannot attribute: Paystack verified amount or currency does not match the quarantined record.', 409);
                    return;
                }
                if (empty($verify['fee_confirmed'])) {
                    Response::error('Cannot attribute: Paystack actual transaction fee is not confirmed.', 409);
                    return;
                }

                $policy = $this->getWalletPolicy();
                $feeBearer = strtolower((string)($policy['gateways']['dva_fee_bearer'] ?? 'customer')) === 'merchant' ? 'merchant' : 'customer';
                $grossAmount = round((float)$verify['amount'], 2);
                $paystackFee = max(0.0, round((float)$verify['fee'], 2));
                $customerFee = $feeBearer === 'customer' ? $paystackFee : 0.0;
                $merchantFee = $feeBearer === 'merchant' ? $paystackFee : 0.0;
                $netSettlement = round(max(0.0, $grossAmount - $paystackFee), 2);
                $netCredit = $feeBearer === 'merchant' ? $grossAmount : $netSettlement;
                $reference = (string)$row['paystack_reference'];

                $va = $this->db->fetchOne('SELECT id, account_number, bank_name FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $targetUserId]);

                $txRes = $this->db->withTransaction(function (Database $db) use (
                    $row, $targetUserId, $va, $superAdmin, $reason, $reference, $grossAmount, $paystackFee, $customerFee, $merchantFee, $netSettlement, $netCredit, $feeBearer, $verify
                ) {
                    $locked = $db->fetchOne('SELECT id, settlement_status FROM paystack_dva_settlements WHERE id = :id FOR UPDATE', ['id' => $row['id']]);
                    if (!$locked || in_array($locked['settlement_status'], ['settled', 'reversed'], true)) {
                        return ['already_settled' => true];
                    }
                    $tx = $this->walletService->credit(
                        $targetUserId,
                        $netCredit,
                        'funding',
                        $reference,
                        "Paystack DVA Deposit (SuperAdmin Verified Resolution • {$reference})",
                        'paystack',
                        [
                            'funding_method' => 'paystack_dva',
                            'channel' => 'dedicated_nuban',
                            'gross_amount' => $grossAmount,
                            'paystack_fee' => $paystackFee,
                            'customer_borne_fee' => $customerFee,
                            'merchant_borne_fee' => $merchantFee,
                            'net_settlement_amount' => $netSettlement,
                            'net_credit_amount' => $netCredit,
                            'fee_bearer' => $feeBearer,
                            'fee_confirmed' => true,
                            'resolved_by_superadmin' => $superAdmin['id'],
                            'evidence_note' => $reason,
                        ]
                    );
                    if (!empty($tx['duplicate'])) {
                        return ['already_settled' => true];
                    }
                    $wtxId = $tx['transaction_id'] ?? ($tx['id'] ?? null);
                    $db->execute(
                        'UPDATE paystack_dva_settlements
                            SET user_id = :uid,
                                virtual_account_id = :vaid,
                                paystack_fee = :fee,
                                customer_borne_fee = :cbf,
                                merchant_borne_fee = :mbf,
                                net_credit_amount = :net,
                                net_settlement_amount = :nset,
                                fee_bearer = :fb,
                                fee_confirmed = 1,
                                settlement_status = "settled",
                                quarantine_reason = :qr,
                                wallet_transaction_id = :wtx,
                                resolved_by = :rby,
                                resolved_at = NOW(),
                                settled_at = COALESCE(settled_at, NOW())
                          WHERE id = :id',
                        [
                            'uid' => $targetUserId,
                            'vaid' => $va['id'] ?? ($row['virtual_account_id'] ?? null),
                            'fee' => $paystackFee,
                            'cbf' => $customerFee,
                            'mbf' => $merchantFee,
                            'net' => $netCredit,
                            'nset' => $netSettlement,
                            'fb' => $feeBearer,
                            'qr' => substr('verified_attribution: ' . $reason, 0, 120),
                            'wtx' => $wtxId,
                            'rby' => $superAdmin['id'],
                            'id' => $row['id'],
                        ]
                    );
                    $payRaw = array_merge(is_array($verify['raw'] ?? null) ? $verify['raw'] : [], [
                        'funding_method' => 'paystack_dva',
                        'channel' => 'dedicated_nuban',
                        'gross_amount' => $grossAmount,
                        'paystack_fee' => $paystackFee,
                        'net_credit_amount' => $netCredit,
                    ]);
                    $db->execute(
                        'INSERT INTO payment_records (id, user_id, gateway, reference, amount, fee, status, paid_at, raw_response, created_at)
                         VALUES (:id, :uid, "paystack", :ref, :amt, :fee, "successful", NOW(), :raw, NOW())
                         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), status = "successful", amount = VALUES(amount), fee = VALUES(fee), paid_at = NOW(), raw_response = VALUES(raw_response)',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $targetUserId,
                            'ref' => $reference,
                            'amt' => $netCredit,
                            'fee' => $paystackFee,
                            'raw' => Security::sanitizeProviderLogPayload($payRaw, 12000),
                        ]
                    );
                    if (!empty($va['id'])) {
                        $db->execute(
                            'UPDATE customer_virtual_accounts SET total_inflow = total_inflow + :net, last_funding_at = NOW(), updated_at = NOW() WHERE id = :vaid',
                            ['net' => $netCredit, 'vaid' => $va['id']]
                        );
                    }
                    return ['already_settled' => false, 'tx' => $tx];
                });

                if (!empty($txRes['already_settled'])) {
                    Response::error('Settlement has already been finalized or reversed.', 409);
                    return;
                }

                try {
                    (new AccountingService($this->db))->syncWebsiteTransactions();
                } catch (Throwable) {
                }

                $this->recordPaystackDvaAuditLog(
                    $superAdmin,
                    'PAYSTACK_DVA_EXCEPTIONAL_ATTRIBUTION',
                    [
                        'settlement_id' => $settlementId,
                        'paystack_reference' => $reference,
                        'target_user_id' => $targetUserId,
                        'target_email' => $targetUser['email'],
                        'gross_amount' => $grossAmount,
                        'paystack_fee' => $paystackFee,
                        'net_credit' => $netCredit,
                        'evidence' => $reason,
                    ],
                    $request->getIp()
                );

                $updated = $this->db->fetchOne('SELECT * FROM paystack_dva_settlements WHERE id = :id LIMIT 1', ['id' => $settlementId]);
                Response::success(
                    ['status' => 'settled', 'settlement' => $updated ? $this->formatSettlementRowForAdmin($updated) : null],
                    'Verified Paystack deposit credited to customer wallet ledger with SuperAdmin audit trail.'
                );
                return;
            } catch (Throwable $e) {
                Security::logPrivateError('PaystackDvaSuperAdminAttribution', $e, ['settlement_id' => $settlementId]);
                Response::error('Unable to verify and attribute transaction with Paystack right now.', 502);
                return;
            }
        }

        try {
            $verify = $this->paystack->verifyPayment((string)$row['paystack_reference']);
            if (strtolower((string)($verify['status'] ?? '')) !== 'successful') {
                Response::error('Paystack does not report this transaction as successful yet (' . ($verify['status'] ?? 'pending') . ').', 400);
                return;
            }
            $verifiedRaw = is_array($verify['raw'] ?? null) ? $verify['raw'] : [];
            if (empty($verifiedRaw)) {
                Response::error('Paystack verification payload was empty.', 502);
                return;
            }
            // Merge stored dedicated account hints if missing from /transaction/verify
            $storedRaw = is_string($row['raw_payload'] ?? null) ? json_decode((string)$row['raw_payload'], true) : [];
            if (is_array($storedRaw)) {
                if (empty($verifiedRaw['authorization']['receiver_bank_account_number']) && !empty($storedRaw['authorization'])) {
                    $verifiedRaw['authorization'] = array_merge($storedRaw['authorization'], $verifiedRaw['authorization'] ?? []);
                }
                if (empty($verifiedRaw['metadata']['receiver_account_number']) && !empty($storedRaw['metadata'])) {
                    $verifiedRaw['metadata'] = array_merge($storedRaw['metadata'], $verifiedRaw['metadata'] ?? []);
                }
            }
            $res = $this->settlePaystackDvaCharge($verifiedRaw, 'admin_reverify', $admin['id']);
            $this->recordPaystackDvaAuditLog(
                $admin,
                'PAYSTACK_DVA_SETTLEMENT_REVERIFIED',
                [
                    'settlement_id' => $settlementId,
                    'paystack_reference' => $row['paystack_reference'],
                    'result_status' => $res['status'] ?? 'processed',
                ],
                $request->getIp()
            );
            Response::success($res, 'Paystack verification completed (' . ($res['status'] ?? 'processed') . ').');
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackDvaAdminResolve', $e, ['settlement_id' => $settlementId]);
            Response::error('Unable to verify DVA transaction with Paystack right now.', 502);
        }
    }

    /**
     * 18. POST /api/admin/wallet/paystack/dva-settings
     * Strictly SuperAdmin-only endpoint to manage Paystack DVA controls cleanly from DVA Management.
     */
    public function adminSaveDvaSettings(Request $request): void
    {
        $superAdmin = Auth::requireSuperAdmin($request);

        $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "payment_gateways_settings" LIMIT 1');
        $current = ($row && !empty($row['setting_value'])) ? (json_decode((string)$row['setting_value'], true) ?: []) : [];

        $enableDva = $request->input('enable_paystack_dva', $current['enable_paystack_dva'] ?? false);
        $enableDvaBool = filter_var($enableDva, FILTER_VALIDATE_BOOLEAN);

        $enableVaFlag = $request->input('enable_virtual_accounts', $enableDvaBool);
        $enableVaBool = filter_var($enableVaFlag, FILTER_VALIDATE_BOOLEAN);

        $bankPref = strtolower(trim((string)$request->input('preferred_bank', $request->input('paystack_dva_preferred_bank', $current['paystack_dva_preferred_bank'] ?? 'wema-bank'))));
        if (!preg_match('/^[a-z0-9-]{2,60}$/', $bankPref)) {
            $bankPref = 'wema-bank';
        }

        $feeBearer = strtolower(trim((string)$request->input('fee_bearer', $request->input('dva_fee_bearer', $current['dva_fee_bearer'] ?? 'customer'))));
        if (!in_array($feeBearer, ['customer', 'merchant'], true)) {
            $feeBearer = 'customer';
        }

        $rolloutMode = strtolower(trim((string)$request->input('dva_rollout_mode', $current['dva_rollout_mode'] ?? ($enableDvaBool ? 'testing_allowlist' : 'paused'))));
        if (!in_array($rolloutMode, ['testing_allowlist', 'all_eligible', 'paused'], true)) {
            $rolloutMode = 'paused';
        }

        $rawEmails = (string)$request->input('dva_test_user_emails', $current['dva_test_user_emails'] ?? '');
        $cleanEmails = [];
        foreach (preg_split('/[\s,;]+/', $rawEmails) ?: [] as $em) {
            $emLower = strtolower(trim((string)$em));
            if ($emLower !== '' && filter_var($emLower, FILTER_VALIDATE_EMAIL)) {
                $cleanEmails[] = $emLower;
            }
        }
        $emailsCsv = implode(', ', array_values(array_unique($cleanEmails)));

        $requireBvn = filter_var($request->input('dva_require_bvn', $current['dva_require_bvn'] ?? true), FILTER_VALIDATE_BOOLEAN);
        $autoReg = filter_var($request->input('dva_auto_provision_on_register', $current['dva_auto_provision_on_register'] ?? true), FILTER_VALIDATE_BOOLEAN);
        $autoOpen = filter_var($request->input('dva_auto_provision_on_wallet_open', $current['dva_auto_provision_on_wallet_open'] ?? true), FILTER_VALIDATE_BOOLEAN);

        $next = array_merge($current, [
            'active_gateway' => 'paystack',
            'enable_paystack' => array_key_exists('enable_paystack', $current) ? (bool)$current['enable_paystack'] : true,
            'enable_paystack_dva' => $enableDvaBool,
            'paystack_dva_preferred_bank' => $bankPref,
            'dva_fee_bearer' => $feeBearer,
            'dva_rollout_mode' => $rolloutMode,
            'dva_test_user_emails' => $emailsCsv,
            'dva_require_bvn' => $requireBvn,
            'dva_auto_provision_on_register' => $autoReg,
            'dva_auto_provision_on_wallet_open' => $autoOpen,
        ]);
        unset($next['enable_flutterwave'], $next['flutterwave_charge_percent'], $next['enable_bank_transfer']);

        $jsonVal = json_encode($next, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, "payment_gateways_settings", :v1, "payment_gateways", "Configuration for payment_gateways", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
            ['id' => Security::generateUuid(), 'v1' => $jsonVal, 'v2' => $jsonVal]
        );

        // Keep customer_dashboard_settings enable_virtual_accounts in sync
        try {
            $cdRow = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "customer_dashboard_settings" LIMIT 1');
            $cd = ($cdRow && !empty($cdRow['setting_value'])) ? (json_decode((string)$cdRow['setting_value'], true) ?: []) : [];
            $cd['enable_virtual_accounts'] = $enableVaBool;
            $cdJson = json_encode($cd, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, "customer_dashboard_settings", :v1, "customer_dashboard", "Customer dashboard module toggles", NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'v1' => $cdJson, 'v2' => $cdJson]
            );
        } catch (Throwable) {
        }

        $this->recordPaystackDvaAuditLog(
            $superAdmin,
            'PAYSTACK_DVA_SETTINGS_UPDATED',
            [
                'enable_paystack_dva' => $enableDvaBool,
                'enable_virtual_accounts' => $enableVaBool,
                'dva_rollout_mode' => $rolloutMode,
                'preferred_bank' => $bankPref,
                'fee_bearer' => $feeBearer,
                'dva_require_bvn' => $requireBvn,
                'test_allowlist_count' => count($cleanEmails),
            ],
            $request->getIp()
        );

        Response::success([
            'policy' => [
                'enable_paystack_dva' => $enableDvaBool,
                'enable_virtual_accounts' => $enableVaBool,
                'dva_rollout_mode' => $rolloutMode,
                'dva_test_user_emails' => array_values(array_unique($cleanEmails)),
                'dva_require_bvn' => $requireBvn,
                'dva_auto_provision_on_register' => $autoReg,
                'dva_auto_provision_on_wallet_open' => $autoOpen,
                'preferred_bank' => $bankPref,
                'fee_bearer' => $feeBearer,
            ],
        ], 'Paystack DVA policy settings saved successfully.');
    }

    private function formatSettlementRowForAdmin(array $st): array
    {
        $st['gross_amount'] = (float)($st['gross_amount'] ?? 0);
        $st['paystack_fee'] = (float)($st['paystack_fee'] ?? 0);
        $st['customer_borne_fee'] = (float)($st['customer_borne_fee'] ?? (($st['fee_bearer'] ?? 'customer') === 'customer' ? $st['paystack_fee'] : 0));
        $st['merchant_borne_fee'] = (float)($st['merchant_borne_fee'] ?? (($st['fee_bearer'] ?? 'customer') === 'merchant' ? $st['paystack_fee'] : 0));
        $st['net_credit_amount'] = (float)($st['net_credit_amount'] ?? 0);
        $st['net_settlement_amount'] = (float)($st['net_settlement_amount'] ?? max(0.0, $st['gross_amount'] - $st['paystack_fee']));
        $st['fee_confirmed'] = !empty($st['fee_confirmed']);
        $st['webhook_status'] = match ((string)($st['settlement_status'] ?? 'under_review')) {
            'settled' => 'verified_settled',
            'under_review' => 'quarantined_review',
            'disputed' => 'dispute_flagged',
            'reversed' => 'reversed',
            'failed' => 'failed_charge',
            default => (string)($st['settlement_status'] ?? 'unknown'),
        };
        unset($st['raw_payload']);
        return $st;
    }

    private function recordLastSuccessfulWebhookTimestamp(): void
    {
        try {
            $nowIso = gmdate('c');
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES ("set_psk_last_wh", "paystack_dva_last_webhook_at", :v1, "payment_gateways", "Timestamp of last HMAC-SHA512 verified Paystack webhook", NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()',
                ['v1' => $nowIso, 'v2' => $nowIso]
            );
        } catch (Throwable) {
        }
    }

    private function getLastSuccessfulWebhookTimestamp(): ?string
    {
        try {
            $row = $this->db->fetchOne(
                'SELECT setting_value FROM system_settings WHERE setting_key = "paystack_dva_last_webhook_at" LIMIT 1'
            );
            if ($row && !empty($row['setting_value'])) {
                return (string)$row['setting_value'];
            }
            $sRow = $this->db->fetchOne('SELECT MAX(created_at) AS latest FROM paystack_dva_settlements');
            if ($sRow && !empty($sRow['latest'])) {
                return (string)$sRow['latest'];
            }
        } catch (Throwable) {
        }
        return null;
    }

    private function redactAuditDetails(array $details): array
    {
        $clean = [];
        foreach ($details as $k => $v) {
            $kStr = (string)$k;
            if (preg_match('/secret|token|password|private_key|authorization_code|signature|^bvn$|^nin$|raw_payload/i', $kStr)) {
                continue;
            }
            if (is_array($v)) {
                $clean[$kStr] = $this->redactAuditDetails($v);
            } else {
                $clean[$kStr] = $v;
            }
        }
        return $clean;
    }

    private function recordPaystackDvaAuditLog(?array $actor, string $action, array $details = [], ?string $ip = null): void
    {
        try {
            $safeDetails = $this->redactAuditDetails($details);
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
                 VALUES (:id, :uid, :email, :act, :det, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $actor['id'] ?? null,
                    'email' => $actor['email'] ?? null,
                    'act' => substr($action, 0, 100),
                    'det' => json_encode($safeDetails, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                    'ip' => $ip ?: Security::resolveClientIp(),
                ]
            );
        } catch (Throwable) {
        }
    }

    // =========================================================================
    // PAYSTACK DVA INTERNAL ORCHESTRATION & SETTLEMENT HELPERS
    // =========================================================================

    private function resolveCanonicalProvisioningStatus(?array $va): string
    {
        if (!$va) {
            return 'not_requested';
        }
        $ps = strtolower(trim((string)($va['provisioning_status'] ?? '')));
        $allowed = [
            'not_requested',
            'awaiting_customer_info',
            'pending_identification',
            'processing',
            'active',
            'failed',
            'suspended',
            'deactivated',
            'under_review',
        ];
        if (in_array($ps, $allowed, true) && $ps !== 'not_requested') {
            return $ps;
        }
        $as = strtolower(trim((string)($va['assignment_status'] ?? 'not_requested')));
        $ast = strtolower(trim((string)($va['account_status'] ?? '')));
        if ($as === 'assigned' && $ast === 'active' && !empty($va['account_number'])) {
            return 'active';
        }
        if ($as === 'pending') {
            return 'processing';
        }
        if ($as === 'failed') {
            return 'failed';
        }
        if ($as === 'deactivated') {
            return 'deactivated';
        }
        return 'not_requested';
    }

    private function evaluateDvaReadiness(array $user, ?array $profile, ?array $va, array $policy): array
    {
        $gw = $policy['gateways'];
        $currentLevel = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $emailVerified = !empty($user['email_verified']) || empty($user['email_verification_required']);
        $isActive = (($user['status'] ?? 'active') === 'active');
        $dvaFeatureOn = !empty($gw['enable_paystack']) && !empty($gw['enable_paystack_dva']) && !empty($gw['enable_virtual_accounts']);

        $rolloutMode = (string)($gw['dva_rollout_mode'] ?? 'testing_allowlist');
        $userEmailLower = strtolower(trim((string)($user['email'] ?? '')));
        $allowlist = is_array($gw['dva_test_user_emails_list'] ?? null) ? $gw['dva_test_user_emails_list'] : [];
        $inRolloutScope = ($rolloutMode === 'all_eligible')
            || ($rolloutMode === 'testing_allowlist' && $userEmailLower !== '' && in_array($userEmailLower, $allowlist, true));

        $phoneNorm = $this->normalizeNigerianPhone((string)($user['phone_number'] ?? ''));
        $hasPhone = $phoneNorm !== '';
        $bvnDigits = preg_replace('/\D/', '', (string)($profile['bvn'] ?? ($user['bvn'] ?? '')));
        $hasBvn = strlen($bvnDigits) === 11;
        $requireBvn = !empty($gw['dva_require_bvn']);
        $hasConsent = !empty($profile['dva_consent']) || !empty($va['dva_consent']);

        $missing = [];
        if (!$isActive) {
            $missing[] = 'active_account';
        }
        if (!$emailVerified) {
            $missing[] = 'email_verification';
        }
        if (!$hasPhone) {
            $missing[] = 'phone_number';
        }
        if ($currentLevel < 2) {
            $missing[] = 'kyc_level_2';
        }
        if ($requireBvn && !$hasBvn) {
            $missing[] = 'bvn';
        }
        if (!$hasConsent) {
            $missing[] = 'dva_consent';
        }

        $eligible = $dvaFeatureOn && $inRolloutScope && empty($missing);

        $guidance = 'Your account is ready for an automatic Paystack dedicated virtual account.';
        if (!$dvaFeatureOn || $rolloutMode === 'paused') {
            $guidance = 'Dedicated virtual account provisioning is currently paused.';
        } elseif (!$inRolloutScope) {
            $guidance = 'Dedicated virtual accounts are currently in controlled testing and will be activated automatically once rollout completes.';
        } elseif (!$emailVerified) {
            $guidance = 'Verify your email address first to unlock automatic dedicated virtual account provisioning.';
        } elseif ($currentLevel < 2) {
            $guidance = 'Complete KYC Level 2 verification with your valid identity details to unlock your permanent Paystack bank account.';
        } elseif ($requireBvn && !$hasBvn) {
            $guidance = 'Paystack CBN compliance requires a verified 11-digit BVN (NIN alone is not sufficient) before assigning a dedicated bank account.';
        } elseif (!$hasPhone) {
            $guidance = 'Add a valid Nigerian phone number to your profile to receive a dedicated bank account.';
        } elseif (!$hasConsent) {
            $guidance = 'Accept Dedicated Virtual Account provisioning consent to authorize Paystack to issue your personal bank account.';
        }

        return [
            'dva_feature_on' => $dvaFeatureOn,
            'rollout_mode' => $rolloutMode,
            'in_rollout_scope' => $inRolloutScope,
            'eligible' => $eligible,
            'email_verified' => $emailVerified,
            'current_level' => $currentLevel,
            'has_bvn' => $hasBvn,
            'require_bvn' => $requireBvn,
            'has_phone' => $hasPhone,
            'has_consent' => $hasConsent,
            'missing_requirements' => $missing,
            'guidance' => $guidance,
        ];
    }

    public function buildVirtualAccountPayloadForUser(array $user, bool $syncPending = false, bool $allowAutoProvision = false): array
    {
        $policy = $this->getWalletPolicy();
        $gw = $policy['gateways'];
        $profile = null;
        try {
            $profile = $this->db->fetchOne('SELECT * FROM user_profiles WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
        } catch (Throwable) {
        }
        $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);

        $readiness = $this->evaluateDvaReadiness($user, $profile, $va, $policy);
        $provStatus = $this->resolveCanonicalProvisioningStatus($va);

        // Auto-initiate provisioning ONCE for existing eligible customers opening their wallet
        if (
            $allowAutoProvision
            && !empty($gw['dva_auto_provision_on_wallet_open'])
            && $readiness['eligible']
            && $this->paystack->hasSecretKey()
            && in_array($provStatus, ['not_requested', 'awaiting_customer_info'], true)
        ) {
            try {
                $autoRes = $this->requestPaystackDvaForUser($user);
                if (!empty($autoRes['payload'])) {
                    return $autoRes['payload'];
                }
                $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
                $provStatus = $this->resolveCanonicalProvisioningStatus($va);
            } catch (Throwable $e) {
                Security::logPrivateError('PaystackDvaAutoWalletOpen', $e, ['user_id' => $user['id']]);
            }
        }

        // Safely sync pending/processing assignments with Paystack (never creates a second account on GET)
        $lastSyncedTs = !empty($va['last_synced_at']) ? (strtotime((string)$va['last_synced_at']) ?: 0) : 0;
        $shouldSyncPending = $syncPending || ($lastSyncedTs < (time() - 20));
        if (
            $shouldSyncPending
            && $va
            && ($va['provider'] ?? '') === 'paystack'
            && in_array($provStatus, ['processing', 'pending_identification'], true)
            && $this->paystack->hasSecretKey()
        ) {
            try {
                $lookupId = !empty($va['paystack_customer_code'])
                    ? (string)$va['paystack_customer_code']
                    : strtolower(trim((string)($user['email'] ?? '')));
                if ($lookupId !== '') {
                    $fetched = $this->paystack->fetchDedicatedAccountsByCustomer($lookupId);
                    $confirmed = $this->pickConfirmedDvaFromList($fetched['accounts'] ?? []);
                    if ($confirmed) {
                        $custCode = trim((string)($fetched['customer']['customer_code'] ?? $va['paystack_customer_code'] ?? ''));
                        $va = $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $confirmed, 'verified', $confirmed) ?: $va;
                        $provStatus = $this->resolveCanonicalProvisioningStatus($va);
                    } else {
                        $this->db->execute(
                            'UPDATE customer_virtual_accounts SET last_synced_at = NOW(), updated_at = NOW() WHERE id = :id',
                            ['id' => $va['id']]
                        );
                    }
                }
            } catch (Throwable $e) {
                Security::logPrivateError('PaystackDvaPendingSync', $e, ['user_id' => $user['id']]);
            }
        }

        // If account is missing information and not active/blocked, surface awaiting_customer_info accurately
        if (
            in_array($provStatus, ['not_requested'], true)
            && !$readiness['eligible']
            && $readiness['dva_feature_on']
            && $readiness['in_rollout_scope']
        ) {
            $provStatus = 'awaiting_customer_info';
        }

        $isConfirmedActive = $va
            && ($va['provider'] ?? '') === 'paystack'
            && $provStatus === 'active'
            && ($va['account_status'] ?? '') === 'active'
            && ($va['assignment_status'] ?? '') === 'assigned'
            && preg_match('/^\d{10}$/', (string)($va['account_number'] ?? ''))
            && !empty($va['bank_name']);

        $assignmentStatus = $va ? (string)($va['assignment_status'] ?? 'not_requested') : 'not_requested';
        if ($isConfirmedActive) {
            $assignmentStatus = 'assigned';
        } elseif ($va && ($va['provider'] ?? '') !== 'paystack' && ($va['account_status'] ?? '') !== 'active') {
            $assignmentStatus = 'not_requested';
        }

        $publicVa = $isConfirmedActive ? [
            'id' => $va['id'],
            'user_id' => $va['user_id'],
            'provider' => 'paystack',
            'paystack_customer_code' => $va['paystack_customer_code'] ?? null,
            'dedicated_account_id' => isset($va['dedicated_account_id']) ? (int)$va['dedicated_account_id'] : null,
            'account_number' => $va['account_number'],
            'account_name' => $va['account_name'] ?: ($user['full_name'] ?? 'HambakTech Customer'),
            'bank_name' => $va['bank_name'],
            'bank_slug' => $va['bank_slug'] ?? null,
            'bank_code' => $va['bank_code'] ?? ($va['bank_slug'] ?? ''),
            'currency' => $va['currency'] ?? 'NGN',
            'status' => 'active',
            'account_status' => 'active',
            'assignment_status' => 'assigned',
            'provisioning_status' => 'active',
            'kyc_validation_status' => $va['kyc_validation_status'] ?? 'verified',
            'total_inflow' => (float)($va['total_inflow'] ?? 0),
            'assigned_at' => $va['assigned_at'] ?? ($va['updated_at'] ?? $va['created_at']),
            'last_synced_at' => $va['last_synced_at'] ?? null,
            'last_funding_at' => $va['last_funding_at'] ?? null,
        ] : null;

        $msg = match ($provStatus) {
            'active' => 'Paystack dedicated virtual account active. Bank transfers automatically credit your wallet.',
            'processing' => 'Your Paystack dedicated virtual account request is currently processing and awaiting confirmation from Paystack.',
            'pending_identification' => 'Paystack is verifying your customer identification details before issuing your bank account.',
            'under_review' => 'Your dedicated virtual account is currently under compliance review.',
            'suspended' => 'Your dedicated virtual account is temporarily suspended. Please fund via Paystack Checkout or contact support.',
            'deactivated' => 'Your dedicated virtual account has been deactivated. Please contact support or use Paystack Checkout.',
            'failed' => !empty($va['failure_reason'])
                ? (string)$va['failure_reason']
                : 'Dedicated account provisioning failed temporarily. Please retry or use Paystack Checkout.',
            'awaiting_customer_info' => !empty($va['failure_reason']) && empty($readiness['missing_requirements'])
                ? (string)$va['failure_reason']
                : $readiness['guidance'],
            default => $readiness['guidance'],
        };

        $legacyStatus = match (true) {
            $isConfirmedActive => 'active',
            in_array($provStatus, ['processing', 'pending_identification', 'under_review'], true) => 'pending',
            in_array('kyc_level_2', $readiness['missing_requirements'], true) || in_array('bvn', $readiness['missing_requirements'], true) => 'pending_kyc',
            default => 'unassigned',
        };

        return [
            'has_virtual_account' => $isConfirmedActive,
            'dva_enabled' => $readiness['dva_feature_on'] && $readiness['in_rollout_scope'],
            'dva_feature_enabled' => $readiness['dva_feature_on'],
            'rollout_mode' => $readiness['rollout_mode'],
            'in_rollout_scope' => $readiness['in_rollout_scope'],
            'paystack_configured' => $this->paystack->hasSecretKey(),
            'eligible' => $readiness['eligible'],
            'email_verified' => $readiness['email_verified'],
            'has_bvn' => $readiness['has_bvn'],
            'require_bvn' => $readiness['require_bvn'],
            'dva_consent' => $readiness['has_consent'],
            'missing_requirements' => $readiness['missing_requirements'],
            'required_level' => 2,
            'current_level' => $readiness['current_level'],
            'status' => $legacyStatus,
            'assignment_status' => $assignmentStatus,
            'provisioning_status' => $provStatus,
            'kyc_validation_status' => $va['kyc_validation_status'] ?? ($readiness['current_level'] >= 2 ? 'verified' : 'unverified'),
            'error_code' => $va['error_code'] ?? null,
            'failure_reason' => in_array($provStatus, ['failed', 'awaiting_customer_info', 'suspended', 'deactivated', 'under_review'], true)
                ? ($va['failure_reason'] ?? null)
                : null,
            'assigned_at' => $va['assigned_at'] ?? null,
            'last_synced_at' => $va['last_synced_at'] ?? null,
            'fee_bearer' => $gw['dva_fee_bearer'],
            'preferred_bank' => $gw['paystack_dva_preferred_bank'],
            'virtual_account' => $publicVa,
            'account_number' => $publicVa['account_number'] ?? null,
            'account_name' => $publicVa['account_name'] ?? null,
            'bank_name' => $publicVa['bank_name'] ?? null,
            'message' => $msg,
        ];
    }

    /**
     * Non-throwing automatic provisioning hook called after registration/email verification/KYC approval.
     */
    public function autoProvisionDvaIfEligible(array $user, array $extraIdentification = []): array
    {
        try {
            $policy = $this->getWalletPolicy();
            $profile = $this->db->fetchOne('SELECT * FROM user_profiles WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
            $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
            $readiness = $this->evaluateDvaReadiness($user, $profile, $va, $policy);

            if ($va && $this->resolveCanonicalProvisioningStatus($va) === 'active') {
                return ['status' => 'active', 'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false)];
            }

            if (!$readiness['dva_feature_on'] || !$readiness['in_rollout_scope']) {
                return ['status' => 'skipped_rollout', 'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false)];
            }

            if (!$readiness['eligible']) {
                $this->recordAwaitingCustomerInfoRow($user, $readiness);
                return ['status' => 'awaiting_customer_info', 'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false)];
            }

            return $this->requestPaystackDvaForUser($user, null, $extraIdentification);
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackDvaAutoHook', $e, ['user_id' => $user['id'] ?? null]);
            return ['status' => 'deferred'];
        }
    }

    private function recordAwaitingCustomerInfoRow(array $user, array $readiness): void
    {
        $existing = $this->db->fetchOne('SELECT id, provisioning_status, assignment_status FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
        if ($existing) {
            $cur = $this->resolveCanonicalProvisioningStatus($existing);
            if (in_array($cur, ['active', 'processing', 'pending_identification', 'suspended', 'deactivated', 'under_review'], true)) {
                return;
            }
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET provisioning_status = "awaiting_customer_info",
                        account_status = "pending_approval",
                        assignment_status = "not_requested",
                        dva_consent = CASE WHEN :c1 = 1 THEN 1 ELSE dva_consent END,
                        dva_consent_at = CASE WHEN :c2 = 1 AND dva_consent_at IS NULL THEN NOW() ELSE dva_consent_at END,
                        failure_reason = :reason,
                        error_code = "MISSING_REQUIREMENTS",
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE id = :id',
                [
                    'c1' => !empty($readiness['has_consent']) ? 1 : 0,
                    'c2' => !empty($readiness['has_consent']) ? 1 : 0,
                    'reason' => $readiness['guidance'],
                    'id' => $existing['id'],
                ]
            );
            return;
        }

        $this->db->execute(
            'INSERT INTO customer_virtual_accounts
                (id, user_id, provider, order_ref, account_number, account_name, bank_name, account_status, kyc_validation_status, dva_consent, dva_consent_at, assignment_status, provisioning_status, failure_reason, error_code, last_synced_at, created_at, updated_at)
             VALUES
                (:id, :uid, "paystack", :oref, "", :aname, "", "pending_approval", "unverified", :c1, CASE WHEN :c2 = 1 THEN NOW() ELSE NULL END, "not_requested", "awaiting_customer_info", :reason, "MISSING_REQUIREMENTS", NOW(), NOW(), NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'oref' => 'PSK_DVA_REQ_' . strtoupper(substr(str_replace('-', '', $user['id']), 0, 12)),
                'aname' => mb_substr((string)($user['full_name'] ?? 'HambakTech Customer'), 0, 180),
                'c1' => !empty($readiness['has_consent']) ? 1 : 0,
                'c2' => !empty($readiness['has_consent']) ? 1 : 0,
                'reason' => $readiness['guidance'],
            ]
        );
    }

    public function requestPaystackDvaForUser(array $user, ?string $preferredBankOverride = null, array $extraIdentification = []): array
    {
        $policy = $this->getWalletPolicy();
        $gw = $policy['gateways'];

        $profile = null;
        try {
            $profile = $this->db->fetchOne('SELECT * FROM user_profiles WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
        } catch (Throwable) {
        }
        $existingSnapshot = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);
        $readiness = $this->evaluateDvaReadiness($user, $profile, $existingSnapshot, $policy);

        if (!$readiness['dva_feature_on'] || $readiness['rollout_mode'] === 'paused') {
            return ['error' => 'Paystack dedicated virtual accounts are not enabled on this platform right now.', 'http_status' => 403];
        }
        if (!$readiness['in_rollout_scope'] && empty($extraIdentification['admin_triggered'])) {
            return ['error' => $readiness['guidance'], 'http_status' => 403];
        }
        if (!$readiness['eligible']) {
            $this->recordAwaitingCustomerInfoRow($user, $readiness);
            return ['error' => $readiness['guidance'], 'http_status' => 422];
        }
        if (!$this->paystack->hasSecretKey()) {
            return ['error' => 'Paystack dedicated virtual account service is temporarily unavailable. Please use Paystack Instant Checkout or contact support.', 'http_status' => 503];
        }

        $preferredBank = strtolower(trim((string)($preferredBankOverride ?: $gw['paystack_dva_preferred_bank'])));
        if (!preg_match('/^[a-z0-9-]{2,60}$/', $preferredBank)) {
            $preferredBank = 'wema-bank';
        }

        $bvnDigits = preg_replace('/\D/', '', (string)($extraIdentification['bvn'] ?? ($profile['bvn'] ?? ($user['bvn'] ?? ''))));
        $bankCode = trim((string)($extraIdentification['bank_code'] ?? ($profile['dva_bank_code'] ?? '')));
        $bankAccountNo = preg_replace('/\D/', '', (string)($extraIdentification['account_number'] ?? ''));
        $forceRetry = !empty($extraIdentification['force_retry']);

        // Step 1: Atomic idempotency & concurrency lock inside transaction (never hold DB lock across HTTP calls)
        $lockOutcome = $this->db->withTransaction(function (Database $db) use ($user, $forceRetry) {
            $existing = $db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid FOR UPDATE', ['uid' => $user['id']]);
            $curStatus = $this->resolveCanonicalProvisioningStatus($existing);

            if ($existing && $curStatus === 'active' && !empty($existing['account_number'])) {
                return ['action' => 'already_assigned', 'row' => $existing];
            }
            if ($existing && in_array($curStatus, ['suspended', 'deactivated', 'under_review'], true)) {
                return ['action' => 'blocked_' . $curStatus, 'row' => $existing];
            }
            if ($existing && in_array($curStatus, ['processing', 'pending_identification'], true) && !$forceRetry) {
                $updatedTs = strtotime((string)($existing['updated_at'] ?? $existing['created_at'] ?? '')) ?: 0;
                if ($updatedTs > (time() - 30)) {
                    return ['action' => 'already_pending', 'row' => $existing];
                }
            }

            if ($existing) {
                $db->execute(
                    'UPDATE customer_virtual_accounts
                        SET provider = "paystack",
                            account_status = "pending_approval",
                            assignment_status = "pending",
                            provisioning_status = "processing",
                            dva_consent = 1,
                            dva_consent_at = COALESCE(dva_consent_at, NOW()),
                            failure_reason = NULL,
                            error_code = NULL,
                            last_synced_at = NOW(),
                            updated_at = NOW()
                      WHERE id = :id',
                    ['id' => $existing['id']]
                );
            } else {
                $db->execute(
                    'INSERT INTO customer_virtual_accounts
                        (id, user_id, provider, order_ref, account_number, account_name, bank_name, account_status, kyc_validation_status, dva_consent, dva_consent_at, assignment_status, provisioning_status, last_synced_at, created_at, updated_at)
                     VALUES
                        (:id, :uid, "paystack", :oref, "", :aname, "", "pending_approval", "pending", 1, NOW(), "pending", "processing", NOW(), NOW(), NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $user['id'],
                        'oref' => 'PSK_DVA_REQ_' . strtoupper(substr(str_replace('-', '', $user['id']), 0, 12)),
                        'aname' => mb_substr((string)($user['full_name'] ?? 'HambakTech Customer'), 0, 180),
                    ]
                );
            }

            return ['action' => 'proceed', 'row' => $existing];
        });

        if ($lockOutcome['action'] === 'already_assigned') {
            return [
                'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                'message' => 'Your existing Paystack dedicated bank account is active.',
            ];
        }
        if (str_starts_with($lockOutcome['action'], 'blocked_')) {
            return [
                'error' => 'Dedicated virtual account is currently ' . substr($lockOutcome['action'], 8) . '. Please contact support.',
                'http_status' => 403,
            ];
        }
        if ($lockOutcome['action'] === 'already_pending') {
            return [
                'payload' => $this->buildVirtualAccountPayloadForUser($user, true, false),
                'message' => 'Account assignment is in progress and awaiting Paystack confirmation.',
            ];
        }

        // Step 2: Check Paystack provider list, customer profile, existing DVAs, and assign via official Paystack endpoints
        $this->recordPaystackDvaAuditLog(
            ['id' => $user['id'], 'email' => $user['email'] ?? null],
            'PAYSTACK_DVA_PROVISIONING',
            [
                'target_user_id' => $user['id'],
                'preferred_bank' => $preferredBank,
                'admin_triggered' => !empty($extraIdentification['admin_triggered']),
            ]
        );
        try {
            [$firstName, $lastName] = $this->splitFullName((string)($user['full_name'] ?? ''));
            $phone = $this->normalizeNigerianPhone((string)($user['phone_number'] ?? ''));

            // Ensure preferred_bank matches an enabled provider returned by Paystack when available
            try {
                $cap = $this->paystack->checkDvaCapability();
                if (!empty($cap['capable']) && !empty($cap['providers']) && is_array($cap['providers'])) {
                    $slugs = array_values(array_filter(array_map(
                        static fn($p) => strtolower(trim((string)($p['provider_slug'] ?? ''))),
                        $cap['providers']
                    )));
                    if (!empty($slugs) && !in_array($preferredBank, $slugs, true)) {
                        $preferredBank = $slugs[0];
                    }
                }
            } catch (Throwable) {
            }

            // A. Create or fetch Paystack customer
            $custRes = $this->paystack->createOrFetchCustomer([
                'email' => $user['email'],
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => $phone,
                'reference' => $user['id'],
                'metadata' => ['hambak_user_id' => $user['id']],
            ]);

            if (empty($custRes['ok']) || empty($custRes['customer']['customer_code'])) {
                throw new RuntimeException((string)($custRes['message'] ?? 'Unable to register customer profile with Paystack.'));
            }

            $psCustomer = $custRes['customer'];
            $custCode = (string)$psCustomer['customer_code'];
            $custNumericId = isset($psCustomer['id']) ? (int)$psCustomer['id'] : null;

            // Keep Paystack customer phone/name synced if phone was previously missing
            if ($phone !== '' && empty($psCustomer['phone'])) {
                try {
                    $this->paystack->updateCustomer($custCode, ['first_name' => $firstName, 'last_name' => $lastName, 'phone' => $phone]);
                } catch (Throwable) {
                }
            }

            $this->db->execute(
                'UPDATE customer_virtual_accounts SET paystack_customer_code = :cc, last_synced_at = NOW(), updated_at = NOW() WHERE user_id = :uid',
                ['cc' => $custCode, 'uid' => $user['id']]
            );

            // B. Reuse existing active DVA if Paystack already generated one for this customer
            $existingRemote = $this->paystack->fetchDedicatedAccountsByCustomer($custCode, $custNumericId);
            $confirmedRemote = $this->pickConfirmedDvaFromList($existingRemote['accounts'] ?? []);
            if ($confirmedRemote) {
                $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $confirmedRemote, 'verified', $confirmedRemote);
                return [
                    'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                    'message' => 'Dedicated virtual account confirmed and linked to your wallet.',
                ];
            }

            // C. If explicit bank_account identification fields (bvn + bank_code + account_number) are supplied
            // and customer is not yet identified on Paystack, execute official Customer Identification API first
            $isCustomerIdentified = !empty($psCustomer['identified']);
            if (!$isCustomerIdentified && strlen($bvnDigits) === 11 && $bankCode !== '' && strlen($bankAccountNo) === 10) {
                $idRes = $this->paystack->validateCustomerIdentification($custCode, [
                    'type' => 'bank_account',
                    'bvn' => $bvnDigits,
                    'bank_code' => $bankCode,
                    'account_number' => $bankAccountNo,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                ]);
                if (!empty($idRes['ok'])) {
                    $this->db->execute(
                        'UPDATE customer_virtual_accounts
                            SET kyc_validation_status = "pending",
                                assignment_status = "pending",
                                provisioning_status = "pending_identification",
                                last_synced_at = NOW(),
                                updated_at = NOW()
                          WHERE user_id = :uid AND provisioning_status != "active"',
                        ['uid' => $user['id']]
                    );
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                        'message' => 'Customer identification submitted to Paystack. Your dedicated account will be created automatically once identification confirms.',
                    ];
                }
            }

            // D. Two-step create if customer already identified; otherwise Single-Step Assign (passing BVN/bank if available)
            if ($isCustomerIdentified) {
                $createRes = $this->paystack->createDedicatedAccount($custCode, $preferredBank);
                $dvaData = is_array($createRes['data'] ?? null) ? $createRes['data'] : [];

                if (!empty($createRes['ok']) && !empty($dvaData['account_number']) && !empty($dvaData['assigned'])) {
                    $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $dvaData, 'verified', $dvaData);
                    FootprintService::record([
                        'user_id' => $user['id'],
                        'user_email' => $user['email'] ?? null,
                        'user_name' => $user['full_name'] ?? null,
                        'category' => 'wallet',
                        'action' => 'DVA_ASSIGNED',
                        'service_type' => 'paystack_dva',
                        'reference' => 'PSK_DVA_' . ($dvaData['id'] ?? $custCode),
                        'provider' => 'paystack',
                        'status' => 'successful',
                        'metadata' => ['bank_name' => $dvaData['bank']['name'] ?? ''],
                    ]);
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                        'message' => 'Dedicated virtual account generated by Paystack and ready for transfers.',
                    ];
                }

                if (!empty($createRes['ok'])) {
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                        'message' => 'Dedicated account request submitted to Paystack. Your account number will appear once Paystack confirms assignment.',
                    ];
                }
            } else {
                $createRes = ['ok' => false, 'status_code' => 0, 'message' => ''];
            }

            // E. Official Paystack Single-Step Assignment (POST /dedicated_account/assign)
            $assignPayload = [
                'email' => $user['email'],
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => $phone,
                'preferred_bank' => $preferredBank,
            ];
            if (strlen($bvnDigits) === 11) {
                $assignPayload['bvn'] = $bvnDigits;
            }
            if ($bankCode !== '' && strlen($bankAccountNo) === 10) {
                $assignPayload['bank_code'] = $bankCode;
                $assignPayload['account_number'] = $bankAccountNo;
            }
            $assignRes = $this->paystack->assignDedicatedVirtualAccount($assignPayload);

            if (!empty($assignRes['ok'])) {
                $assignData = is_array($assignRes['data'] ?? null) ? $assignRes['data'] : [];
                if (!empty($assignData['account_number']) && !empty($assignData['assigned'])) {
                    $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $assignData, 'verified', $assignData);
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                        'message' => 'Dedicated virtual account generated by Paystack and ready for transfers.',
                    ];
                }
                return [
                    'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                    'message' => 'Dedicated account assignment is in progress with Paystack. Your account number will appear shortly.',
                ];
            }

            // Fallback to two-step create if assign wasn't supported for this customer state
            if (!$isCustomerIdentified) {
                $createRes = $this->paystack->createDedicatedAccount($custCode, $preferredBank);
                $dvaData = is_array($createRes['data'] ?? null) ? $createRes['data'] : [];
                if (!empty($createRes['ok']) && !empty($dvaData['account_number']) && !empty($dvaData['assigned'])) {
                    $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $dvaData, 'verified', $dvaData);
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                        'message' => 'Dedicated virtual account generated by Paystack and ready for transfers.',
                    ];
                }
                if (!empty($createRes['ok'])) {
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false, false),
                        'message' => 'Dedicated account request submitted to Paystack.',
                    ];
                }
            }

            // Paystack declined (e.g., DVA not enabled on merchant account or BVN/bank identification required)
            $rawMsg = (string)($assignRes['message'] ?? $createRes['message'] ?? 'Paystack could not provision a dedicated account.');
            $lowerRaw = strtolower($rawMsg);
            $needsIdentificationInfo = str_contains($lowerRaw, 'identification') || str_contains($lowerRaw, 'bvn') || str_contains($lowerRaw, 'bank') || str_contains($lowerRaw, 'validate');
            $safeCustomerMsg = $this->mapPaystackDvaErrorToSafeMessage($rawMsg);
            $nextProvStatus = $needsIdentificationInfo ? 'awaiting_customer_info' : 'failed';
            $nextErrCode = $needsIdentificationInfo ? 'IDENTIFICATION_REQUIRED' : 'PAYSTACK_PROVISION_DECLINED';

            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = :ast,
                        assignment_status = :asst,
                        provisioning_status = :pst,
                        error_code = :ecode,
                        failure_reason = :reason,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE user_id = :uid AND assignment_status != "assigned" AND provisioning_status != "active"',
                [
                    'ast' => $needsIdentificationInfo ? 'pending_approval' : 'inactive',
                    'asst' => $needsIdentificationInfo ? 'not_requested' : 'failed',
                    'pst' => $nextProvStatus,
                    'ecode' => $nextErrCode,
                    'reason' => $safeCustomerMsg,
                    'uid' => $user['id'],
                ]
            );

            Security::logPrivateError('PaystackDvaProvisionRejected', new RuntimeException($rawMsg), [
                'user_id' => $user['id'],
                'paystack_customer_code' => $custCode,
                'create_status' => $createRes['status_code'] ?? 0,
                'assign_status' => $assignRes['status_code'] ?? 0,
            ]);
            $this->recordPaystackDvaAuditLog(
                ['id' => $user['id'], 'email' => $user['email'] ?? null],
                'PAYSTACK_DVA_PROVISIONING_FAILED',
                [
                    'target_user_id' => $user['id'],
                    'paystack_customer_code' => $custCode,
                    'error_code' => $nextErrCode,
                ]
            );

            return ['error' => $safeCustomerMsg, 'http_status' => $needsIdentificationInfo ? 422 : 503];
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackDvaProvisionException', $e, ['user_id' => $user['id']]);
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "inactive",
                        assignment_status = "failed",
                        provisioning_status = "failed",
                        error_code = "PAYSTACK_UNAVAILABLE",
                        failure_reason = :reason,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE user_id = :uid AND assignment_status != "assigned" AND provisioning_status != "active"',
                [
                    'reason' => 'Dedicated account provisioning is temporarily unavailable. Please use Paystack Instant Checkout or try again later.',
                    'uid' => $user['id'],
                ]
            );
            $this->recordPaystackDvaAuditLog(
                ['id' => $user['id'], 'email' => $user['email'] ?? null],
                'PAYSTACK_DVA_PROVISIONING_FAILED',
                [
                    'target_user_id' => $user['id'],
                    'error_code' => 'PAYSTACK_UNAVAILABLE',
                ]
            );
            return [
                'error' => 'We could not provision your dedicated bank account at this time. Please use Paystack Instant Checkout or try again later.',
                'http_status' => 503,
            ];
        }
    }

    private function completeDvaAfterIdentification(string $userId, string $customerCode): void
    {
        $existing = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
        if ($existing && $this->resolveCanonicalProvisioningStatus($existing) === 'active') {
            return;
        }

        $fetched = $this->paystack->fetchDedicatedAccountsByCustomer($customerCode);
        $confirmed = $this->pickConfirmedDvaFromList($fetched['accounts'] ?? []);
        if ($confirmed) {
            $this->persistPaystackDvaAssignment($userId, $customerCode, $confirmed, 'verified', $confirmed);
            return;
        }

        $policy = $this->getWalletPolicy();
        $preferredBank = (string)($policy['gateways']['paystack_dva_preferred_bank'] ?? 'wema-bank');
        $createRes = $this->paystack->createDedicatedAccount($customerCode, $preferredBank);
        $dvaData = is_array($createRes['data'] ?? null) ? $createRes['data'] : [];
        if (!empty($createRes['ok']) && !empty($dvaData['account_number']) && !empty($dvaData['assigned'])) {
            $this->persistPaystackDvaAssignment($userId, $customerCode, $dvaData, 'verified', $dvaData);
        } elseif (empty($createRes['ok'])) {
            $safeMsg = $this->mapPaystackDvaErrorToSafeMessage((string)($createRes['message'] ?? ''));
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET provisioning_status = "failed",
                        assignment_status = "failed",
                        account_status = "inactive",
                        error_code = "DVA_POST_ID_FAILED",
                        failure_reason = :reason,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                  WHERE user_id = :uid AND provisioning_status != "active"',
                ['reason' => $safeMsg, 'uid' => $userId]
            );
        }
    }

    private function pickConfirmedDvaFromList(array $accounts): ?array
    {
        foreach ($accounts as $acc) {
            if (!is_array($acc)) {
                continue;
            }
            $hasNum = !empty($acc['account_number']) && preg_match('/^\d{10}$/', trim((string)$acc['account_number']));
            $isActive = !array_key_exists('active', $acc) || !empty($acc['active']);
            $isAssigned = !array_key_exists('assigned', $acc) || !empty($acc['assigned']);
            if ($hasNum && $isActive && $isAssigned && !empty($acc['bank']['name'])) {
                return $acc;
            }
        }
        return null;
    }

    private function persistPaystackDvaAssignment(string $userId, ?string $customerCode, array $dvaObj, string $kycValidationStatus = 'verified', mixed $rawPayload = null): ?array
    {
        $accNum = preg_replace('/\D/', '', (string)($dvaObj['account_number'] ?? ''));
        $bankObj = is_array($dvaObj['bank'] ?? null) ? $dvaObj['bank'] : [];
        $bankName = trim((string)($bankObj['name'] ?? ''));
        if ($accNum === '' || $bankName === '') {
            return null;
        }

        $dedicatedId = isset($dvaObj['id']) ? (int)$dvaObj['id'] : null;
        $bankId = isset($bankObj['id']) ? (int)$bankObj['id'] : null;
        $bankSlug = trim((string)($bankObj['slug'] ?? '')) ?: null;
        $bankCode = trim((string)($bankObj['code'] ?? ($bankSlug ?? ''))) ?: null;
        $accName = trim((string)($dvaObj['account_name'] ?? '')) ?: null;
        $currency = strtoupper(trim((string)($dvaObj['currency'] ?? 'NGN'))) ?: 'NGN';
        $isAssigned = (!array_key_exists('assigned', $dvaObj) || !empty($dvaObj['assigned']))
            && (!array_key_exists('active', $dvaObj) || !empty($dvaObj['active']));

        $orderRef = 'PSK_DVA_' . ($dedicatedId ? (string)$dedicatedId : $accNum);
        $rawJson = $rawPayload ? Security::sanitizeProviderLogPayload($rawPayload, 12000) : null;

        $savedRow = $this->db->withTransaction(function (Database $db) use ($userId, $customerCode, $dedicatedId, $orderRef, $accNum, $accName, $bankName, $bankId, $bankSlug, $bankCode, $currency, $isAssigned, $kycValidationStatus, $rawJson) {
            // Enforce unique account ownership: never assign an account number already bound to another HAMBAK user
            $ownerConflict = $db->fetchOne(
                'SELECT user_id FROM customer_virtual_accounts WHERE account_number = :anum AND user_id != :uid FOR UPDATE',
                ['anum' => $accNum, 'uid' => $userId]
            );
            if ($ownerConflict) {
                throw new RuntimeException('Dedicated account number ownership conflict detected.');
            }

            $db->execute(
                'INSERT INTO customer_virtual_accounts
                    (id, user_id, provider, paystack_customer_code, dedicated_account_id, order_ref, account_number, account_name, bank_name, bank_id, bank_slug, bank_code, currency, account_status, kyc_validation_status, dva_consent, dva_consent_at, assignment_status, provisioning_status, failure_reason, error_code, assigned_at, last_synced_at, raw_assignment_payload, created_at, updated_at)
                 VALUES
                    (:id, :uid, "paystack", :cc, :did, :oref, :anum, :aname, :bname, :bid, :bslug, :bcode, :curr, :ast, :kvs, 1, NOW(), :asst, :pst, NULL, NULL, CASE WHEN :is_act1 = 1 THEN NOW() ELSE NULL END, NOW(), :raw, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    provider = "paystack",
                    paystack_customer_code = COALESCE(VALUES(paystack_customer_code), paystack_customer_code),
                    dedicated_account_id = COALESCE(VALUES(dedicated_account_id), dedicated_account_id),
                    order_ref = VALUES(order_ref),
                    account_number = VALUES(account_number),
                    account_name = COALESCE(VALUES(account_name), account_name),
                    bank_name = VALUES(bank_name),
                    bank_id = COALESCE(VALUES(bank_id), bank_id),
                    bank_slug = COALESCE(VALUES(bank_slug), bank_slug),
                    bank_code = COALESCE(VALUES(bank_code), bank_code),
                    currency = VALUES(currency),
                    account_status = VALUES(account_status),
                    kyc_validation_status = VALUES(kyc_validation_status),
                    dva_consent = 1,
                    dva_consent_at = COALESCE(dva_consent_at, NOW()),
                    assignment_status = VALUES(assignment_status),
                    provisioning_status = VALUES(provisioning_status),
                    failure_reason = NULL,
                    error_code = NULL,
                    assigned_at = CASE WHEN :is_act2 = 1 AND assigned_at IS NULL THEN NOW() ELSE assigned_at END,
                    last_synced_at = NOW(),
                    raw_assignment_payload = COALESCE(VALUES(raw_assignment_payload), raw_assignment_payload),
                    updated_at = NOW()',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'cc' => $customerCode ?: null,
                    'did' => $dedicatedId,
                    'oref' => $orderRef,
                    'anum' => $accNum,
                    'aname' => $accName,
                    'bname' => $bankName,
                    'bid' => $bankId,
                    'bslug' => $bankSlug,
                    'bcode' => $bankCode,
                    'curr' => $currency,
                    'ast' => $isAssigned ? 'active' : 'pending_approval',
                    'kvs' => $kycValidationStatus,
                    'asst' => $isAssigned ? 'assigned' : 'pending',
                    'pst' => $isAssigned ? 'active' : 'processing',
                    'is_act1' => $isAssigned ? 1 : 0,
                    'is_act2' => $isAssigned ? 1 : 0,
                    'raw' => $rawJson,
                ]
            );

            $saved = $db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
            return $saved;
        });

        if ($isAssigned && !empty($accNum)) {
            $this->recordPaystackDvaAuditLog(
                ['id' => $userId],
                'PAYSTACK_DVA_ASSIGNED',
                [
                    'target_user_id' => $userId,
                    'paystack_customer_code' => $customerCode ?: null,
                    'dedicated_account_id' => $dedicatedId,
                    'account_number' => $accNum,
                    'bank_name' => $bankName,
                    'kyc_validation_status' => $kycValidationStatus,
                ]
            );
        }

        return $savedRow ?? null;
    }

    /**
     * Strictly separates Paystack DVA bank transfers from Paystack Checkout transactions
     * (including Checkout "Pay with Transfer", which uses channel = 'bank_transfer' + PAY_ reference).
     */
    private function classifyPaystackChargeIsDva(array $data, string $reference): bool
    {
        $channel = strtolower(trim((string)($data['channel'] ?? '')));
        $auth = is_array($data['authorization'] ?? null) ? $data['authorization'] : [];
        $meta = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        $receiverAccNo = preg_replace('/\D/', '', (string)($auth['receiver_bank_account_number'] ?? ($meta['receiver_account_number'] ?? '')));
        $dedicatedAccObj = is_array($data['dedicated_account'] ?? null) ? $data['dedicated_account'] : [];

        // If an initiated Checkout payment_records row exists for this reference, NEVER treat as DVA unless explicitly DVA
        if ($reference !== '' && $channel !== 'dedicated_nuban') {
            $checkoutRec = $this->db->fetchOne(
                'SELECT id, raw_response FROM payment_records WHERE reference = :ref LIMIT 1',
                ['ref' => $reference]
            );
            if ($checkoutRec) {
                $rawDec = is_string($checkoutRec['raw_response'] ?? null) ? json_decode((string)$checkoutRec['raw_response'], true) : [];
                $isRecordedDva = is_array($rawDec) && (($rawDec['funding_method'] ?? '') === 'paystack_dva' || ($rawDec['channel'] ?? '') === 'dedicated_nuban');
                if (!$isRecordedDva) {
                    return false;
                }
            }
        }

        if ($channel === 'dedicated_nuban' || !empty($dedicatedAccObj['account_number']) || !empty($meta['dedicated_account_id'])) {
            return true;
        }

        // Only treat receiver_bank_account_number as DVA when it is NOT a Checkout one-time bank_transfer OR matches an assigned customer DVA
        if ($receiverAccNo !== '') {
            if ($channel !== 'bank_transfer') {
                return true;
            }
            $vaMatch = $this->db->fetchOne(
                'SELECT id FROM customer_virtual_accounts WHERE provider = "paystack" AND account_number = :acc LIMIT 1',
                ['acc' => $receiverAccNo]
            );
            return (bool)$vaMatch;
        }

        return false;
    }

    private function quarantinePaystackDvaSettlement(
        string $reference,
        ?int $txIdNum,
        ?int $dedicatedAccId,
        string $accNumber,
        ?string $custCode,
        float $grossAmount,
        float $paystackFee,
        bool $feeConfirmed,
        string $feeBearer,
        string $currency,
        ?string $senderBank,
        ?string $senderName,
        ?string $senderMasked,
        ?string $sessionId,
        string $quarantineReason,
        array $rawPayload,
        ?string $matchedUserId = null,
        ?string $matchedVaId = null
    ): void {
        try {
            $custFee = ($feeConfirmed && $feeBearer === 'customer') ? $paystackFee : 0.0;
            $merchFee = ($feeConfirmed && $feeBearer === 'merchant') ? $paystackFee : 0.0;
            $netSettle = $feeConfirmed ? round(max(0.0, $grossAmount - $paystackFee), 2) : 0.0;
            $netCredit = ($feeBearer === 'merchant') ? $grossAmount : ($feeConfirmed ? round(max(0.0, $grossAmount - $paystackFee), 2) : 0.0);

            $this->db->execute(
                'INSERT INTO paystack_dva_settlements
                    (id, user_id, virtual_account_id, paystack_reference, paystack_transaction_id, dedicated_account_id, account_number, paystack_customer_code, gross_amount, paystack_fee, customer_borne_fee, merchant_borne_fee, net_credit_amount, net_settlement_amount, fee_bearer, fee_confirmed, currency, sender_bank, sender_account_name, sender_account_number_masked, session_id, settlement_status, quarantine_reason, raw_payload, created_at)
                 VALUES
                    (:id, :uid, :vaid, :ref, :tid, :did, :acc, :cc, :gross, :fee, :cbf, :mbf, :net, :nset, :fb, :fc, :curr, :sb, :sn, :sm, :sid, "under_review", :qr, :raw, NOW())
                 ON DUPLICATE KEY UPDATE
                    user_id = CASE WHEN settlement_status IN ("settled", "reversed") THEN user_id ELSE COALESCE(VALUES(user_id), user_id) END,
                    virtual_account_id = CASE WHEN settlement_status IN ("settled", "reversed") THEN virtual_account_id ELSE COALESCE(VALUES(virtual_account_id), virtual_account_id) END,
                    paystack_fee = CASE WHEN settlement_status IN ("settled", "reversed") THEN paystack_fee ELSE VALUES(paystack_fee) END,
                    fee_confirmed = CASE WHEN settlement_status IN ("settled", "reversed") THEN fee_confirmed ELSE VALUES(fee_confirmed) END,
                    settlement_status = CASE WHEN settlement_status IN ("settled", "reversed") THEN settlement_status ELSE "under_review" END,
                    quarantine_reason = CASE WHEN settlement_status IN ("settled", "reversed") THEN quarantine_reason ELSE VALUES(quarantine_reason) END,
                    raw_payload = CASE WHEN settlement_status IN ("settled", "reversed") THEN raw_payload ELSE VALUES(raw_payload) END',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $matchedUserId,
                    'vaid' => $matchedVaId,
                    'ref' => $reference,
                    'tid' => $txIdNum,
                    'did' => $dedicatedAccId,
                    'acc' => $accNumber ?: 'UNKNOWN',
                    'cc' => $custCode ?: null,
                    'gross' => $grossAmount,
                    'fee' => $paystackFee,
                    'cbf' => $custFee,
                    'mbf' => $merchFee,
                    'net' => $netCredit,
                    'nset' => $netSettle,
                    'fb' => $feeBearer,
                    'fc' => $feeConfirmed ? 1 : 0,
                    'curr' => $currency,
                    'sb' => $senderBank ?: null,
                    'sn' => $senderName ?: null,
                    'sm' => $senderMasked,
                    'sid' => $sessionId ?: null,
                    'qr' => substr($quarantineReason, 0, 120),
                    'raw' => Security::sanitizeProviderLogPayload($rawPayload, 12000),
                ]
            );

            FootprintService::record([
                'user_id' => $matchedUserId,
                'category' => 'wallet',
                'action' => 'DVA_TRANSFER_QUARANTINED',
                'service_type' => 'paystack_dva',
                'reference' => $reference,
                'provider' => 'paystack',
                'status' => 'pending',
                'amount' => $grossAmount,
                'metadata' => [
                    'quarantine_reason' => $quarantineReason,
                    'account_number' => $accNumber,
                    'fee_confirmed' => $feeConfirmed,
                ],
            ]);
            $this->recordPaystackDvaAuditLog(
                $matchedUserId ? ['id' => $matchedUserId] : null,
                'PAYSTACK_DVA_QUARANTINED',
                [
                    'target_user_id' => $matchedUserId,
                    'paystack_reference' => $reference,
                    'account_number' => $accNumber,
                    'gross_amount' => $grossAmount,
                    'quarantine_reason' => $quarantineReason,
                ]
            );
        } catch (Throwable) {
        }
    }

    private function recordPaystackDvaFailedCharge(array $data, string $event): array
    {
        $reference = trim((string)($data['reference'] ?? ''));
        $txIdNum = isset($data['id']) ? (int)$data['id'] : null;
        $grossAmount = round(((float)($data['amount'] ?? 0)) / 100, 2);
        $currency = strtoupper(trim((string)($data['currency'] ?? 'NGN')));
        $auth = is_array($data['authorization'] ?? null) ? $data['authorization'] : [];
        $meta = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        $custObj = is_array($data['customer'] ?? null) ? $data['customer'] : [];
        $dvaObj = is_array($data['dedicated_account'] ?? null) ? $data['dedicated_account'] : [];

        $receiverAccount = preg_replace('/\D/', '', (string)($auth['receiver_bank_account_number'] ?? ($meta['receiver_account_number'] ?? ($dvaObj['account_number'] ?? ''))));
        $custCode = trim((string)($custObj['customer_code'] ?? ''));
        $dedicatedAccId = isset($meta['dedicated_account_id']) ? (int)$meta['dedicated_account_id'] : (isset($dvaObj['id']) ? (int)$dvaObj['id'] : null);
        $failReason = trim((string)($data['gateway_response'] ?? ($data['message'] ?? 'Paystack DVA charge failed')));

        $va = null;
        if ($receiverAccount !== '') {
            $va = $this->db->fetchOne('SELECT id, user_id, account_number FROM customer_virtual_accounts WHERE provider = "paystack" AND account_number = :acc LIMIT 1', ['acc' => $receiverAccount]);
        }

        try {
            $this->db->execute(
                'INSERT INTO paystack_dva_settlements
                    (id, user_id, virtual_account_id, paystack_reference, paystack_transaction_id, dedicated_account_id, account_number, paystack_customer_code, gross_amount, paystack_fee, customer_borne_fee, merchant_borne_fee, net_credit_amount, net_settlement_amount, fee_bearer, fee_confirmed, currency, settlement_status, quarantine_reason, raw_payload, created_at)
                 VALUES
                    (:id, :uid, :vaid, :ref, :tid, :did, :acc, :cc, :gross, 0.00, 0.00, 0.00, 0.00, 0.00, "customer", 0, :curr, "failed", :qr, :raw, NOW())
                 ON DUPLICATE KEY UPDATE
                    settlement_status = CASE WHEN settlement_status IN ("settled", "reversed", "disputed") THEN settlement_status ELSE "failed" END,
                    quarantine_reason = CASE WHEN settlement_status IN ("settled", "reversed", "disputed") THEN quarantine_reason ELSE VALUES(quarantine_reason) END',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $va['user_id'] ?? null,
                    'vaid' => $va['id'] ?? null,
                    'ref' => $reference,
                    'tid' => $txIdNum,
                    'did' => $dedicatedAccId,
                    'acc' => $receiverAccount ?: ($va['account_number'] ?? 'UNKNOWN'),
                    'cc' => $custCode ?: null,
                    'gross' => $grossAmount,
                    'curr' => $currency,
                    'qr' => substr($failReason, 0, 120),
                    'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                ]
            );
        } catch (Throwable) {
        }

        FootprintService::record([
            'user_id' => $va['user_id'] ?? null,
            'category' => 'wallet',
            'action' => 'DVA_TRANSFER_FAILED',
            'service_type' => 'paystack_dva',
            'reference' => $reference,
            'provider' => 'paystack',
            'status' => 'failed',
            'amount' => $grossAmount,
            'error_message' => $failReason,
            'metadata' => ['webhook_event' => $event],
        ]);
        $this->recordPaystackDvaAuditLog(
            !empty($va['user_id']) ? ['id' => $va['user_id']] : null,
            'PAYSTACK_WEBHOOK_FAILED',
            [
                'target_user_id' => $va['user_id'] ?? null,
                'paystack_reference' => $reference,
                'event' => $event,
                'gross_amount' => $grossAmount,
                'reason' => $failReason,
            ]
        );

        return ['status' => 'recorded_failed_transfer', 'reference' => $reference];
    }

    private function handlePaystackRefundWebhook(array $data, string $event): array
    {
        $txRef = trim((string)($data['transaction_reference'] ?? ($data['reference'] ?? '')));
        if ($txRef === '') {
            return ['status' => 'ignored_missing_transaction_reference', 'event' => $event];
        }

        if ($event !== 'refund.processed') {
            return ['status' => 'noted_refund_status', 'event' => $event, 'reference' => $txRef];
        }

        $refundId = (string)($data['id'] ?? '');
        $reason = trim((string)($data['merchant_note'] ?? ($data['customer_note'] ?? 'Paystack DVA refund processed')));
        return $this->executePaystackReversal($txRef, $event, $reason, ['paystack_refund_id' => $refundId, 'raw_event' => $data]);
    }

    private function handlePaystackDisputeWebhook(array $data, string $event): array
    {
        $txObj = is_array($data['transaction'] ?? null) ? $data['transaction'] : [];
        $txRef = trim((string)($txObj['reference'] ?? ($data['transaction_reference'] ?? ($data['reference'] ?? ''))));
        if ($txRef === '') {
            return ['status' => 'ignored_missing_dispute_reference', 'event' => $event];
        }

        $disputeId = (string)($data['id'] ?? '');
        $disputeStatus = strtolower(trim((string)($data['status'] ?? 'open')));
        $resolution = strtolower(trim((string)($data['resolution'] ?? '')));

        $settlement = $this->db->fetchOne('SELECT * FROM paystack_dva_settlements WHERE paystack_reference = :ref LIMIT 1', ['ref' => $txRef]);
        if (!$settlement) {
            return ['status' => 'ignored_unknown_dva_dispute', 'event' => $event, 'reference' => $txRef];
        }

        if ($event === 'charge.dispute.resolve') {
            $lost = in_array($resolution, ['merchant-accepted', 'auto-accepted', 'bank-accepted', 'accepted', 'lost'], true);
            $won = in_array($resolution, ['merchant-won', 'bank-rejected', 'declined', 'won'], true);

            if ($lost) {
                return $this->executePaystackReversal(
                    $txRef,
                    $event,
                    "Paystack dispute resolved against merchant ({$resolution})",
                    ['dispute_id' => $disputeId, 'dispute_status' => $disputeStatus, 'resolution' => $resolution]
                );
            }
            if ($won && $settlement['settlement_status'] === 'disputed') {
                $this->db->execute(
                    'UPDATE paystack_dva_settlements
                        SET settlement_status = "settled",
                            dispute_status = :ds,
                            dispute_reference = COALESCE(:dr, dispute_reference)
                      WHERE id = :id AND settlement_status = "disputed"',
                    ['ds' => 'won:' . $resolution, 'dr' => $disputeId ?: null, 'id' => $settlement['id']]
                );
                return ['status' => 'dispute_won_restored', 'reference' => $txRef];
            }
        }

        // create / remind / unresolved dispute: flag cleanly without altering settled history unless reversed
        $this->db->execute(
            'UPDATE paystack_dva_settlements
                SET settlement_status = CASE WHEN settlement_status = "reversed" THEN "reversed" ELSE "disputed" END,
                    dispute_status = :ds,
                    dispute_reference = COALESCE(:dr, dispute_reference)
              WHERE id = :id',
            [
                'ds' => $disputeStatus ?: 'open',
                'dr' => $disputeId ?: null,
                'id' => $settlement['id'],
            ]
        );

        FootprintService::record([
            'user_id' => $settlement['user_id'] ?? null,
            'category' => 'wallet',
            'action' => 'DVA_DISPUTE_UPDATED',
            'service_type' => 'paystack_dva',
            'reference' => $txRef,
            'provider' => 'paystack',
            'status' => 'pending',
            'amount' => (float)$settlement['net_credit_amount'],
            'metadata' => ['event' => $event, 'dispute_id' => $disputeId, 'dispute_status' => $disputeStatus],
        ]);
        $this->recordPaystackDvaAuditLog(
            !empty($settlement['user_id']) ? ['id' => $settlement['user_id']] : null,
            'PAYSTACK_DVA_DISPUTE',
            [
                'target_user_id' => $settlement['user_id'] ?? null,
                'paystack_reference' => $txRef,
                'event' => $event,
                'dispute_id' => $disputeId,
                'dispute_status' => $disputeStatus,
            ]
        );

        return ['status' => 'dispute_flagged', 'reference' => $txRef, 'dispute_status' => $disputeStatus];
    }

    private function executePaystackReversal(string $paystackReference, string $event, string $reason, array $extra = []): array
    {
        $res = $this->db->withTransaction(function (Database $db) use ($paystackReference, $event, $reason, $extra) {
            $settlement = $db->fetchOne(
                'SELECT * FROM paystack_dva_settlements WHERE paystack_reference = :ref FOR UPDATE',
                ['ref' => $paystackReference]
            );
            if (!$settlement) {
                return ['status' => 'ignored_no_dva_settlement', 'reference' => $paystackReference];
            }
            if ($settlement['settlement_status'] === 'reversed') {
                return ['status' => 'already_reversed', 'reference' => $paystackReference, 'reversal_reference' => $settlement['reversal_reference']];
            }
            if (empty($settlement['user_id'])) {
                $db->execute(
                    'UPDATE paystack_dva_settlements SET settlement_status = "reversed", reversal_reason = :rr, reversed_at = NOW() WHERE id = :id',
                    ['rr' => substr($reason, 0, 255), 'id' => $settlement['id']]
                );
                return ['status' => 'reversed_uncredited_quarantine', 'reference' => $paystackReference];
            }

            $tx = null;
            if (!empty($settlement['wallet_transaction_id'])) {
                $tx = $db->fetchOne('SELECT * FROM transactions WHERE id = :id FOR UPDATE', ['id' => $settlement['wallet_transaction_id']]);
            }
            if (!$tx) {
                $tx = $db->fetchOne('SELECT * FROM transactions WHERE reference = :ref AND user_id = :uid LIMIT 1 FOR UPDATE', [
                    'ref' => $paystackReference,
                    'uid' => $settlement['user_id'],
                ]);
            }
            if (!$tx || ($tx['status'] ?? '') !== 'successful') {
                $db->execute(
                    'UPDATE paystack_dva_settlements SET settlement_status = "reversed", reversal_reason = :rr, reversed_at = NOW() WHERE id = :id',
                    ['rr' => substr($reason, 0, 255), 'id' => $settlement['id']]
                );
                return ['status' => 'reversed_without_wallet_tx', 'reference' => $paystackReference];
            }

            // Check wallet balance before attempting automated debit reversal
            $wallet = $db->lockWalletForUpdate((string)$settlement['user_id']);
            $revAmt = (float)$tx['amount'];
            if (!$wallet || (float)$wallet['balance'] < $revAmt) {
                $db->execute(
                    'UPDATE paystack_dva_settlements
                        SET settlement_status = "disputed",
                            quarantine_reason = "reversal_insufficient_balance",
                            reversal_reason = :rr,
                            dispute_status = COALESCE(:ds, dispute_status),
                            dispute_reference = COALESCE(:dr, dispute_reference)
                      WHERE id = :id',
                    [
                        'rr' => substr($reason, 0, 255),
                        'ds' => $extra['dispute_status'] ?? 'reversal_pending_recovery',
                        'dr' => $extra['dispute_id'] ?? ($extra['paystack_refund_id'] ?? null),
                        'id' => $settlement['id'],
                    ]
                );
                return ['status' => 'disputed_insufficient_balance_for_reversal', 'reference' => $paystackReference];
            }

            $revResult = $this->walletService->reverseTransaction(
                (string)$tx['id'],
                'system_paystack_webhook',
                $reason,
                array_merge($extra, ['webhook_event' => $event, 'funding_method' => 'paystack_dva'])
            );

            $db->execute(
                'UPDATE paystack_dva_settlements
                    SET settlement_status = "reversed",
                        reversal_transaction_id = :rtx,
                        reversal_reference = :rref,
                        reversal_reason = :rr,
                        dispute_status = COALESCE(:ds, dispute_status),
                        dispute_reference = COALESCE(:dr, dispute_reference),
                        reversed_at = NOW()
                  WHERE id = :id',
                [
                    'rtx' => $revResult['transaction_id'] ?? null,
                    'rref' => $revResult['reversal_reference'] ?? null,
                    'rr' => substr($reason, 0, 255),
                    'ds' => $extra['dispute_status'] ?? null,
                    'dr' => $extra['dispute_id'] ?? ($extra['paystack_refund_id'] ?? null),
                    'id' => $settlement['id'],
                ]
            );

            if (!empty($settlement['virtual_account_id'])) {
                $db->execute(
                    'UPDATE customer_virtual_accounts SET total_inflow = GREATEST(0.00, total_inflow - :amt), updated_at = NOW() WHERE id = :vaid',
                    ['amt' => $revAmt, 'vaid' => $settlement['virtual_account_id']]
                );
            }

            return [
                'status' => 'reversed',
                'reference' => $paystackReference,
                'reversal_reference' => $revResult['reversal_reference'] ?? null,
                'balance_after' => $revResult['balance_after'] ?? null,
                'user_id' => $settlement['user_id'],
                'amount' => $revAmt,
            ];
        });

        if (($res['status'] ?? '') === 'reversed') {
            $this->recordPaystackDvaAuditLog(
                !empty($res['user_id']) ? ['id' => $res['user_id']] : null,
                'PAYSTACK_DVA_REVERSAL',
                [
                    'target_user_id' => $res['user_id'] ?? null,
                    'paystack_reference' => $paystackReference,
                    'reversal_reference' => $res['reversal_reference'] ?? null,
                    'amount' => $res['amount'] ?? 0,
                    'event' => $event,
                    'reason' => $reason,
                ]
            );
            try {
                (new AccountingService($this->db))->syncWebsiteTransactions();
            } catch (Throwable) {
            }
            try {
                $amtFmt = '₦' . number_format((float)$res['amount'], 2);
                $balFmt = '₦' . number_format((float)($res['balance_after'] ?? 0), 2);
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, "Bank Transfer Reversed", :msg, "warning", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $res['user_id'],
                        'msg' => "A Paystack DVA deposit of {$amtFmt} (Orig Ref: {$paystackReference}) was reversed ({$reason}). Reversal Ref: {$res['reversal_reference']}. Updated wallet balance: {$balFmt}.",
                    ]
                );
            } catch (Throwable) {
            }
        }

        return $res;
    }

    private function settlePaystackDvaCharge(array $data, string $event, ?string $adminActorId = null): array
    {
        $reference = trim((string)($data['reference'] ?? ''));
        if ($reference === '') {
            return ['status' => 'ignored_missing_reference'];
        }

        // Fast duplicate check before hitting Paystack verification API unnecessarily
        $preCheck = $this->db->fetchOne(
            'SELECT settlement_status, user_id FROM paystack_dva_settlements WHERE paystack_reference = :ref LIMIT 1',
            ['ref' => $reference]
        );
        if ($preCheck && in_array($preCheck['settlement_status'], ['settled', 'reversed', 'disputed'], true)) {
            $this->recordPaystackDvaAuditLog(
                !empty($preCheck['user_id']) ? ['id' => $preCheck['user_id']] : null,
                'PAYSTACK_DVA_DUPLICATE_WEBHOOK',
                ['paystack_reference' => $reference, 'event' => $event, 'stage' => 'precheck_settlement']
            );
            return ['status' => 'already_settled', 'reference' => $reference];
        }
        $preTx = $this->db->fetchOne(
            'SELECT status, user_id FROM transactions WHERE reference = :ref LIMIT 1',
            ['ref' => $reference]
        );
        if ($preTx && $preTx['status'] === 'successful') {
            $this->recordPaystackDvaAuditLog(
                !empty($preTx['user_id']) ? ['id' => $preTx['user_id']] : null,
                'PAYSTACK_DVA_DUPLICATE_WEBHOOK',
                ['paystack_reference' => $reference, 'event' => $event, 'stage' => 'precheck_transaction']
            );
            return ['status' => 'already_settled', 'reference' => $reference];
        }

        $txIdNum = isset($data['id']) ? (int)$data['id'] : null;
        $grossAmount = round(((float)($data['amount'] ?? 0)) / 100, 2);
        $feeConfirmed = array_key_exists('fees', $data) && $data['fees'] !== null && is_numeric($data['fees']);
        $paystackFee = $feeConfirmed ? max(0.0, round(((float)$data['fees']) / 100, 2)) : 0.0;
        $currency = strtoupper(trim((string)($data['currency'] ?? 'NGN')));

        $auth = is_array($data['authorization'] ?? null) ? $data['authorization'] : [];
        $meta = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        $custObj = is_array($data['customer'] ?? null) ? $data['customer'] : [];
        $dvaObj = is_array($data['dedicated_account'] ?? null) ? $data['dedicated_account'] : [];

        $receiverAccount = preg_replace('/\D/', '', (string)($auth['receiver_bank_account_number'] ?? ($meta['receiver_account_number'] ?? ($dvaObj['account_number'] ?? ''))));
        $custCode = trim((string)($custObj['customer_code'] ?? ''));
        $dedicatedAccId = isset($meta['dedicated_account_id']) ? (int)$meta['dedicated_account_id'] : (isset($auth['dedicated_account_id']) ? (int)$auth['dedicated_account_id'] : (isset($dvaObj['id']) ? (int)$dvaObj['id'] : null));

        $senderBank = trim((string)($auth['sender_bank'] ?? ($auth['bank'] ?? 'Bank Transfer')));
        $senderName = trim((string)($auth['sender_name'] ?? ($meta['sender_name'] ?? '')));
        $senderNumRaw = preg_replace('/\D/', '', (string)($auth['sender_bank_account_number'] ?? ''));
        $senderMasked = $senderNumRaw !== '' ? ('******' . substr($senderNumRaw, -4)) : null;
        $sessionId = trim((string)($auth['narration'] ?? ($data['receipt_number'] ?? ($meta['session_id'] ?? ''))));

        $policy = $this->getWalletPolicy();
        $feeBearer = strtolower((string)($policy['gateways']['dva_fee_bearer'] ?? 'customer')) === 'merchant' ? 'merchant' : 'customer';

        if ($grossAmount <= 0 || $currency !== 'NGN') {
            return ['status' => 'ignored_invalid_amount_or_currency'];
        }

        // Always confirm Paystack transaction & actual fee via /transaction/verify when fee is unconfirmed or 0 (never silently assume zero!)
        $needsVerify = (!$feeConfirmed || $paystackFee <= 0.0) && $event !== 'admin_reverify';
        if ($needsVerify && $this->paystack->hasSecretKey()) {
            try {
                $verify = $this->paystack->verifyPayment($reference);
                $vStatus = strtolower((string)($verify['status'] ?? ''));
                if ($vStatus === 'successful') {
                    $vAmount = round((float)($verify['amount'] ?? 0), 2);
                    $vCurrency = strtoupper((string)($verify['currency'] ?? 'NGN'));
                    if ($vCurrency !== 'NGN' || abs($vAmount - $grossAmount) > 0.01) {
                        $this->quarantinePaystackDvaSettlement(
                            $reference, $txIdNum, $dedicatedAccId, $receiverAccount, $custCode,
                            $grossAmount, $paystackFee, $feeConfirmed, $feeBearer, $currency,
                            $senderBank, $senderName, $senderMasked, $sessionId,
                            'verification_amount_or_currency_mismatch', $data
                        );
                        return ['status' => 'under_review_verification_mismatch', 'reference' => $reference];
                    }
                    if (!empty($verify['fee_confirmed'])) {
                        $feeConfirmed = true;
                        $paystackFee = max(0.0, round((float)$verify['fee'], 2));
                    }
                    if (!empty($verify['id']) && !$txIdNum) {
                        $txIdNum = (int)$verify['id'];
                    }
                    if ($receiverAccount === '' && !empty($verify['authorization']['receiver_bank_account_number'])) {
                        $receiverAccount = preg_replace('/\D/', '', (string)$verify['authorization']['receiver_bank_account_number']);
                    }
                    if ($custCode === '' && !empty($verify['customer']['customer_code'])) {
                        $custCode = trim((string)$verify['customer']['customer_code']);
                    }
                } elseif (in_array($vStatus, ['failed', 'abandoned', 'reversed'], true)) {
                    return $this->recordPaystackDvaFailedCharge($data, $event);
                }
            } catch (Throwable $e) {
                Security::logPrivateError('PaystackDvaFeeVerify', $e, ['reference' => $reference]);
            }
        }

        // Strict DVA account resolution — match assigned customer_virtual_accounts cleanly
        $va = null;
        if ($receiverAccount !== '') {
            $va = $this->db->fetchOne(
                'SELECT * FROM customer_virtual_accounts WHERE provider = "paystack" AND account_number = :acc LIMIT 1',
                ['acc' => $receiverAccount]
            );
        }
        if (!$va && $dedicatedAccId) {
            $va = $this->db->fetchOne(
                'SELECT * FROM customer_virtual_accounts WHERE provider = "paystack" AND dedicated_account_id = :did LIMIT 1',
                ['did' => $dedicatedAccId]
            );
        }

        if (!$va) {
            $this->quarantinePaystackDvaSettlement(
                $reference, $txIdNum, $dedicatedAccId, $receiverAccount, $custCode,
                $grossAmount, $paystackFee, $feeConfirmed, $feeBearer, $currency,
                $senderBank, $senderName, $senderMasked, $sessionId,
                'unmatched_virtual_account', $data
            );
            return ['status' => 'under_review_unmatched_dva', 'reference' => $reference];
        }

        if ($custCode !== '' && !empty($va['paystack_customer_code']) && strcasecmp($custCode, (string)$va['paystack_customer_code']) !== 0) {
            $this->quarantinePaystackDvaSettlement(
                $reference, $txIdNum, $dedicatedAccId, $receiverAccount ?: (string)$va['account_number'], $custCode,
                $grossAmount, $paystackFee, $feeConfirmed, $feeBearer, $currency,
                $senderBank, $senderName, $senderMasked, $sessionId,
                'customer_code_mismatch', $data, (string)$va['user_id'], (string)$va['id']
            );
            return ['status' => 'under_review_customer_mismatch', 'reference' => $reference];
        }

        $provStatus = $this->resolveCanonicalProvisioningStatus($va);
        if (($va['account_status'] ?? '') !== 'active' || ($va['assignment_status'] ?? '') !== 'assigned' || in_array($provStatus, ['deactivated', 'suspended', 'under_review'], true)) {
            $this->quarantinePaystackDvaSettlement(
                $reference, $txIdNum, $dedicatedAccId, $receiverAccount ?: (string)$va['account_number'], $custCode,
                $grossAmount, $paystackFee, $feeConfirmed, $feeBearer, $currency,
                $senderBank, $senderName, $senderMasked, $sessionId,
                'inactive_virtual_account_' . $provStatus, $data, (string)$va['user_id'], (string)$va['id']
            );
            return ['status' => 'under_review_inactive_dva', 'reference' => $reference];
        }

        $ownerRow = $this->db->fetchOne('SELECT id, email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $va['user_id']]);
        if (!$ownerRow) {
            $this->quarantinePaystackDvaSettlement(
                $reference, $txIdNum, $dedicatedAccId, $receiverAccount ?: (string)$va['account_number'], $custCode,
                $grossAmount, $paystackFee, $feeConfirmed, $feeBearer, $currency,
                $senderBank, $senderName, $senderMasked, $sessionId,
                'user_not_found', $data, (string)$va['user_id'], (string)$va['id']
            );
            return ['status' => 'under_review_user_not_found', 'reference' => $reference];
        }

        // Never silently assume zero fee if Paystack did not confirm actual transaction fee
        if (!$feeConfirmed) {
            $this->quarantinePaystackDvaSettlement(
                $reference, $txIdNum, $dedicatedAccId, $receiverAccount ?: (string)$va['account_number'], $custCode,
                $grossAmount, 0.0, false, $feeBearer, $currency,
                $senderBank, $senderName, $senderMasked, $sessionId,
                'unconfirmed_paystack_fee', $data, (string)$va['user_id'], (string)$va['id']
            );
            return ['status' => 'under_review_unconfirmed_fee', 'reference' => $reference];
        }

        $customerBorneFee = ($feeBearer === 'customer') ? $paystackFee : 0.0;
        $merchantBorneFee = ($feeBearer === 'merchant') ? $paystackFee : 0.0;
        $netSettlementAmount = round(max(0.0, $grossAmount - $paystackFee), 2);
        $netCredit = ($feeBearer === 'merchant')
            ? $grossAmount
            : $netSettlementAmount;

        if ($netCredit <= 0) {
            $this->quarantinePaystackDvaSettlement(
                $reference, $txIdNum, $dedicatedAccId, $receiverAccount ?: (string)$va['account_number'], $custCode,
                $grossAmount, $paystackFee, true, $feeBearer, $currency,
                $senderBank, $senderName, $senderMasked, $sessionId,
                'non_positive_net_credit', $data, (string)$va['user_id'], (string)$va['id']
            );
            return ['status' => 'under_review_non_positive_net', 'reference' => $reference];
        }

        $bankLabel = $va['bank_name'] ?: 'Paystack Partner Bank';
        $accNumLabel = $va['account_number'] ?: $receiverAccount;

        $settlement = $this->db->withTransaction(function (Database $db) use (
            $va, $reference, $txIdNum, $dedicatedAccId, $accNumLabel, $custCode,
            $grossAmount, $paystackFee, $customerBorneFee, $merchantBorneFee, $netSettlementAmount, $netCredit, $feeBearer,
            $currency, $senderBank, $senderName, $senderMasked, $sessionId, $bankLabel, $event, $data, $adminActorId
        ) {
            // Replay/duplicate webhook check locked on paystack_dva_settlements, transactions & payment_records
            $dupSettle = $db->fetchOne(
                'SELECT id, settlement_status FROM paystack_dva_settlements WHERE paystack_reference = :ref FOR UPDATE',
                ['ref' => $reference]
            );
            if ($dupSettle && in_array($dupSettle['settlement_status'], ['settled', 'reversed', 'disputed'], true)) {
                return ['already_settled' => true];
            }

            $dupTx = $db->fetchOne(
                'SELECT id, status FROM transactions WHERE reference = :ref FOR UPDATE',
                ['ref' => $reference]
            );
            if ($dupTx && $dupTx['status'] === 'successful') {
                return ['already_settled' => true];
            }

            $dupPay = $db->fetchOne(
                'SELECT id, status FROM payment_records WHERE reference = :ref FOR UPDATE',
                ['ref' => $reference]
            );
            if ($dupPay && $dupPay['status'] === 'successful') {
                return ['already_settled' => true];
            }

            $tx = $this->walletService->credit(
                (string)$va['user_id'],
                $netCredit,
                'funding',
                $reference,
                "Dedicated Bank Transfer Credit ({$bankLabel} • {$accNumLabel})",
                'paystack',
                [
                    'funding_method' => 'paystack_dva',
                    'webhook_event' => $event,
                    'channel' => 'dedicated_nuban',
                    'gross_amount' => $grossAmount,
                    'paystack_fee' => $paystackFee,
                    'gateway_fee' => $paystackFee,
                    'customer_borne_fee' => $customerBorneFee,
                    'merchant_borne_fee' => $merchantBorneFee,
                    'net_settlement_amount' => $netSettlementAmount,
                    'net_credit_amount' => $netCredit,
                    'fee_bearer' => $feeBearer,
                    'fee_confirmed' => true,
                    'dedicated_account_number' => $accNumLabel,
                    'dedicated_bank_name' => $bankLabel,
                    'sender_bank' => $senderBank,
                    'sender_account_name' => $senderName,
                ]
            );

            if (!empty($tx['duplicate'])) {
                return ['already_settled' => true];
            }

            $wtxId = $tx['transaction_id'] ?? ($tx['id'] ?? null);

            $db->execute(
                'INSERT INTO paystack_dva_settlements
                    (id, user_id, virtual_account_id, paystack_reference, paystack_transaction_id, dedicated_account_id, account_number, paystack_customer_code, gross_amount, paystack_fee, customer_borne_fee, merchant_borne_fee, net_credit_amount, net_settlement_amount, fee_bearer, fee_confirmed, currency, sender_bank, sender_account_name, sender_account_number_masked, session_id, settlement_status, quarantine_reason, wallet_transaction_id, settled_at, resolved_by, resolved_at, raw_payload, created_at)
                 VALUES
                    (:id, :uid, :vaid, :ref, :tid, :did, :acc, :cc, :gross, :fee, :cbf, :mbf, :net, :nset, :fb, 1, :curr, :sb, :sn, :sm, :sid, "settled", NULL, :wtx, NOW(), :rby, CASE WHEN :rby2 IS NOT NULL THEN NOW() ELSE NULL END, :raw, NOW())
                 ON DUPLICATE KEY UPDATE
                    user_id = VALUES(user_id),
                    virtual_account_id = VALUES(virtual_account_id),
                    settlement_status = "settled",
                    quarantine_reason = NULL,
                    wallet_transaction_id = VALUES(wallet_transaction_id),
                    gross_amount = VALUES(gross_amount),
                    net_credit_amount = VALUES(net_credit_amount),
                    net_settlement_amount = VALUES(net_settlement_amount),
                    paystack_fee = VALUES(paystack_fee),
                    customer_borne_fee = VALUES(customer_borne_fee),
                    merchant_borne_fee = VALUES(merchant_borne_fee),
                    fee_bearer = VALUES(fee_bearer),
                    fee_confirmed = 1,
                    settled_at = COALESCE(settled_at, NOW()),
                    resolved_by = COALESCE(VALUES(resolved_by), resolved_by),
                    resolved_at = COALESCE(VALUES(resolved_at), resolved_at),
                    raw_payload = VALUES(raw_payload)',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $va['user_id'],
                    'vaid' => $va['id'],
                    'ref' => $reference,
                    'tid' => $txIdNum,
                    'did' => $dedicatedAccId ?: ($va['dedicated_account_id'] ?? null),
                    'acc' => $accNumLabel,
                    'cc' => $custCode ?: ($va['paystack_customer_code'] ?? null),
                    'gross' => $grossAmount,
                    'fee' => $paystackFee,
                    'cbf' => $customerBorneFee,
                    'mbf' => $merchantBorneFee,
                    'net' => $netCredit,
                    'nset' => $netSettlementAmount,
                    'fb' => $feeBearer,
                    'curr' => $currency,
                    'sb' => $senderBank ?: null,
                    'sn' => $senderName ?: null,
                    'sm' => $senderMasked,
                    'sid' => $sessionId ?: null,
                    'wtx' => $wtxId,
                    'rby' => $adminActorId,
                    'rby2' => $adminActorId,
                    'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                ]
            );

            $payRaw = array_merge($data, [
                'funding_method' => 'paystack_dva',
                'channel' => 'dedicated_nuban',
                'gross_amount' => $grossAmount,
                'paystack_fee' => $paystackFee,
                'customer_borne_fee' => $customerBorneFee,
                'merchant_borne_fee' => $merchantBorneFee,
                'net_credit_amount' => $netCredit,
                'net_settlement_amount' => $netSettlementAmount,
                'fee_bearer' => $feeBearer,
            ]);
            $db->execute(
                'INSERT INTO payment_records (id, user_id, gateway, reference, amount, fee, status, paid_at, raw_response, created_at)
                 VALUES (:id, :uid, "paystack", :ref, :amt, :fee, "successful", NOW(), :raw, NOW())
                 ON DUPLICATE KEY UPDATE status = "successful", amount = VALUES(amount), fee = VALUES(fee), paid_at = NOW(), raw_response = VALUES(raw_response)',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $va['user_id'],
                    'ref' => $reference,
                    'amt' => $netCredit,
                    'fee' => $paystackFee,
                    'raw' => Security::sanitizeProviderLogPayload($payRaw, 12000),
                ]
            );

            $db->execute(
                'UPDATE customer_virtual_accounts
                    SET total_inflow = total_inflow + :net,
                        last_funding_at = NOW(),
                        updated_at = NOW()
                  WHERE id = :vaid',
                ['net' => $netCredit, 'vaid' => $va['id']]
            );

            return ['already_settled' => false, 'tx' => $tx];
        });

        if (!empty($settlement['already_settled'])) {
            $this->recordPaystackDvaAuditLog(
                !empty($va['user_id']) ? ['id' => $va['user_id']] : null,
                'PAYSTACK_DVA_DUPLICATE_WEBHOOK',
                ['paystack_reference' => $reference, 'event' => $event, 'stage' => 'atomic_lock']
            );
            return ['status' => 'already_settled', 'reference' => $reference];
        }

        $tx = $settlement['tx'];

        $this->recordPaystackDvaAuditLog(
            ['id' => $va['user_id'], 'email' => $ownerRow['email'] ?? null],
            'PAYSTACK_DVA_DEPOSIT_CREDITED',
            [
                'target_user_id' => $va['user_id'],
                'paystack_reference' => $reference,
                'account_number' => $accNumLabel,
                'gross_amount' => $grossAmount,
                'paystack_fee' => $paystackFee,
                'net_credit_amount' => $netCredit,
                'fee_bearer' => $feeBearer,
                'event' => $event,
            ]
        );

        try {
            (new AccountingService($this->db))->syncWebsiteTransactions();
        } catch (Throwable) {
        }

        $netFmt = '₦' . number_format($netCredit, 2);
        $grossFmt = '₦' . number_format($grossAmount, 2);
        $feeDeductedFmt = '₦' . number_format($customerBorneFee, 2);
        $feeTotalFmt = '₦' . number_format($paystackFee, 2);
        $balFmt = '₦' . number_format((float)($tx['balance_after'] ?? 0), 2);
        $feeSummaryText = $feeBearer === 'merchant'
            ? "Fee deducted: ₦0.00 (Paystack charge {$feeTotalFmt} covered by merchant)"
            : "Fee deducted: {$feeDeductedFmt}";

        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Bank Transfer Credited", :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $va['user_id'],
                    'msg' => "Deposit received on {$bankLabel} ({$accNumLabel}). Gross received: {$grossFmt} | {$feeSummaryText} | Net credited: {$netFmt} | Updated balance: {$balFmt} | Ref: {$reference}.",
                ]
            );
        } catch (Throwable) {
        }

        try {
            FootprintService::record([
                'user_id' => $va['user_id'],
                'user_email' => $ownerRow['email'] ?? null,
                'user_name' => $ownerRow['full_name'] ?? null,
                'category' => 'wallet',
                'action' => 'DVA_TRANSFER_CREDITED',
                'service_type' => 'paystack_dva',
                'reference' => $reference,
                'provider' => 'paystack',
                'status' => 'successful',
                'amount' => $netCredit,
                'metadata' => [
                    'gross_amount' => $grossAmount,
                    'paystack_fee' => $paystackFee,
                    'customer_borne_fee' => $customerBorneFee,
                    'merchant_borne_fee' => $merchantBorneFee,
                    'net_settlement_amount' => $netSettlementAmount,
                    'net_credit_amount' => $netCredit,
                    'fee_bearer' => $feeBearer,
                    'balance_after' => (float)($tx['balance_after'] ?? 0),
                ],
            ]);

            if (!empty($ownerRow['email'])) {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($ownerRow['full_name'] ?: 'Customer'), ENT_QUOTES, 'UTF-8');
                $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    . "<h2 style='margin:0 0 12px;color:#059669;'>Wallet Credited: {$netFmt}</h2>"
                    . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                    . "<p style='color:#334155;'>Your inbound bank transfer to your dedicated Paystack account has been automatically verified and credited to your HAMBAKTECH wallet.</p>"
                    . "<div style='background:#f8fafc;border:1px solid #e2e8f0;padding:14px;border-radius:8px;margin:14px 0;font-size:13px;color:#334155;line-height:1.7;'>"
                    . "<div><strong>Dedicated Account:</strong> {$bankLabel} &bull; <code>{$accNumLabel}</code></div>"
                    . "<div><strong>Gross Amount Received:</strong> {$grossFmt}</div>"
                    . "<div><strong>Fee Deducted:</strong> " . ($feeBearer === 'merchant' ? "₦0.00 (Paystack charge {$feeTotalFmt} covered by merchant)" : $feeDeductedFmt) . "</div>"
                    . "<div><strong>Net Amount Credited:</strong> <strong style='color:#059669;'>{$netFmt}</strong></div>"
                    . "<div><strong>Updated Wallet Balance:</strong> <strong>{$balFmt}</strong></div>"
                    . "<div><strong>Transaction Reference:</strong> <code>{$reference}</code></div></div></div>";
                $mailer->send(
                    (string)$ownerRow['email'],
                    (string)($ownerRow['full_name'] ?: 'Customer'),
                    "Dedicated Account Deposit Confirmed ({$netFmt}) — HAMBAKTECH",
                    $html,
                    null,
                    MailService::NOTIFICATION_OPTIONS + ['audit_action' => 'DVA_WEBHOOK_CREDIT_EMAIL']
                );
            }
        } catch (Throwable) {
        }

        return [
            'status' => 'settled',
            'reference' => $reference,
            'gross_amount' => $grossAmount,
            'paystack_fee' => $paystackFee,
            'customer_borne_fee' => $customerBorneFee,
            'merchant_borne_fee' => $merchantBorneFee,
            'net_settlement_amount' => $netSettlementAmount,
            'net_credit_amount' => $netCredit,
            'balance_after' => (float)($tx['balance_after'] ?? 0),
        ];
    }

    private function splitFullName(string $fullName): array
    {
        $clean = preg_replace('/\s+/', ' ', trim($fullName)) ?? '';
        if ($clean === '') {
            return ['Hambak', 'Customer'];
        }
        $parts = explode(' ', $clean, 2);
        $first = trim($parts[0]) ?: 'Hambak';
        $last = isset($parts[1]) && trim($parts[1]) !== '' ? trim($parts[1]) : $first;
        return [$first, $last];
    }

    private function normalizeNigerianPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '234') && strlen($digits) >= 13) {
            return '+' . $digits;
        }
        if (str_starts_with($digits, '0') && strlen($digits) === 11) {
            return '+234' . substr($digits, 1);
        }
        if (strlen($digits) === 10) {
            return '+234' . $digits;
        }
        return '+' . $digits;
    }

    private function mapPaystackDvaErrorToSafeMessage(string $rawMsg): string
    {
        $lower = strtolower($rawMsg);
        if (str_contains($lower, 'not enabled') || str_contains($lower, 'registered business') || str_contains($lower, 'feature') || str_contains($lower, 'not available')) {
            return 'Dedicated virtual accounts are not yet enabled on the payment gateway merchant profile. Please fund your wallet via Paystack Instant Checkout.';
        }
        if (str_contains($lower, 'identification') || str_contains($lower, 'bvn') || str_contains($lower, 'validate')) {
            return 'Paystack requires additional customer bank verification before assigning a dedicated account. Please fund via Paystack Instant Checkout or contact support.';
        }
        return 'We could not generate your dedicated bank account at this time. Please use Paystack Instant Checkout or try again later.';
    }
}
