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
            'enable_paystack_dva' => true,
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
            : true;
        $gwCfg['enable_virtual_accounts'] = array_key_exists('enable_virtual_accounts', $custDashCfg)
            ? (bool)$custDashCfg['enable_virtual_accounts']
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
        $event = trim((string)($payload['event'] ?? ''));
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
                            assignment_status = CASE WHEN :failed1 = 1 AND assignment_status != "assigned" THEN "failed" ELSE assignment_status END,
                            failure_reason = CASE WHEN :failed2 = 1 THEN :reason ELSE failure_reason END,
                            raw_assignment_payload = :raw,
                            updated_at = NOW()
                      WHERE id = :id',
                    [
                        'kvs' => $isSuccess ? 'verified' : 'failed',
                        'failed1' => $isSuccess ? 0 : 1,
                        'failed2' => $isSuccess ? 0 : 1,
                        'reason' => $reason,
                        'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                        'id' => $va['id'],
                    ]
                );
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
                    $existingVa = $this->db->fetchOne('SELECT id, assignment_status FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userRow['id']]);
                    if ($existingVa && ($existingVa['assignment_status'] ?? '') !== 'assigned') {
                        $this->db->execute(
                            'UPDATE customer_virtual_accounts
                                SET provider = "paystack",
                                    paystack_customer_code = COALESCE(:cc, paystack_customer_code),
                                    account_status = "inactive",
                                    assignment_status = "failed",
                                    failure_reason = :reason,
                                    raw_assignment_payload = :raw,
                                    updated_at = NOW()
                              WHERE id = :id',
                            [
                                'cc' => $custCode ?: null,
                                'reason' => $failMsg,
                                'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                                'id' => $existingVa['id'],
                            ]
                        );
                    }
                }
            }
            Response::success(['status' => 'processed', 'event' => $event]);
            return;
        }

        // -----------------------------------------------------------------
        // Event 3: Charge Success (Distinguish DVA Transfers vs Checkout)
        // -----------------------------------------------------------------
        if ($event === 'charge.success') {
            $reference = trim((string)($data['reference'] ?? ''));
            $amountInKobo = (float)($data['amount'] ?? 0);
            $amount = round($amountInKobo / 100, 2);
            $feeAmount = max(0.0, round(((float)($data['fees'] ?? 0)) / 100, 2));
            $currency = strtoupper(trim((string)($data['currency'] ?? 'NGN')));
            $channel = strtolower(trim((string)($data['channel'] ?? '')));
            $auth = is_array($data['authorization'] ?? null) ? $data['authorization'] : [];
            $meta = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
            $receiverAccNo = trim((string)($auth['receiver_bank_account_number'] ?? ($meta['receiver_account_number'] ?? '')));
            $isDvaTransfer = ($channel === 'dedicated_nuban') || ($receiverAccNo !== '');

            if (empty($reference) || $amount <= 0 || $currency !== 'NGN') {
                Response::success(['status' => 'ignored_invalid_payload']);
                return;
            }

            if ($isDvaTransfer) {
                $dvaSettlement = $this->settlePaystackDvaCharge($data, $event);
                Response::success($dvaSettlement);
                return;
            }

            // Standard Paystack Merchant Checkout settlement (preserved)
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
     * Reuses assigned account idempotently; NEVER triggers duplicate Paystack creation on GET/refresh.
     */
    public function virtualAccount(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $syncPending = ((string)$request->query('sync', '0')) === '1';
        $state = $this->buildVirtualAccountPayloadForUser($user, $syncPending);
        Response::success($state);
    }

    /**
     * 13. POST /api/wallet/virtual-account/provision
     * Requests a Paystack Dedicated Virtual Account directly from Paystack's official API
     * for an eligible HAMBAK customer, reusing any existing assigned/pending account idempotently.
     */
    public function provisionVirtualAccount(Request $request): void
    {
        $user = Auth::requireVerifiedEmail($request);
        $preferredBank = trim((string)$request->input('preferred_bank', ''));
        $res = $this->requestPaystackDvaForUser($user, $preferredBank ?: null);

        if (!empty($res['error'])) {
            Response::error((string)$res['error'], (int)($res['http_status'] ?? 400));
            return;
        }

        Response::success($res['payload'], (string)($res['message'] ?? 'Dedicated virtual account status updated.'));
    }

    /**
     * 14. GET /api/admin/wallet/paystack/dva-status
     * Read-only Admin visibility into Paystack DVA business eligibility, Paystack-generated accounts,
     * and automated inbound webhook settlements (no manual account creation or manual approvals).
     */
    public function adminDvaStatus(Request $request): void
    {
        Auth::requirePermission($request, 'wallet');
        $policy = $this->getWalletPolicy();
        $capability = $this->paystack->checkDvaCapability();

        $accounts = [];
        try {
            $accounts = $this->db->fetchAll(
                'SELECT va.id, va.user_id, va.provider, va.paystack_customer_code, va.dedicated_account_id,
                        va.account_number, va.account_name, va.bank_name, va.bank_slug, va.currency,
                        va.account_status, va.kyc_validation_status, va.assignment_status,
                        va.failure_reason, va.total_inflow, va.last_funding_at, va.created_at, va.updated_at,
                        u.full_name AS customer_name, u.email AS customer_email,
                        COALESCE(u.kyc_level, u.tier, 1) AS kyc_level
                 FROM customer_virtual_accounts va
                 LEFT JOIN users u ON u.id = va.user_id
                 WHERE va.provider = "paystack"
                 ORDER BY va.updated_at DESC, va.created_at DESC
                 LIMIT 200'
            );
            foreach ($accounts as &$acc) {
                $acc['total_inflow'] = (float)($acc['total_inflow'] ?? 0);
                $acc['kyc_level'] = (int)($acc['kyc_level'] ?? 1);
            }
        } catch (Throwable) {
        }

        $settlements = [];
        $totals = [
            'assigned_accounts' => 0,
            'pending_accounts' => 0,
            'failed_accounts' => 0,
            'settled_count' => 0,
            'under_review_count' => 0,
            'total_gross' => 0.0,
            'total_paystack_fees' => 0.0,
            'total_net_credited' => 0.0,
        ];
        try {
            foreach ($accounts as $acc) {
                $as = (string)($acc['assignment_status'] ?? '');
                if ($as === 'assigned' && ($acc['account_status'] ?? '') === 'active') {
                    $totals['assigned_accounts']++;
                } elseif ($as === 'pending') {
                    $totals['pending_accounts']++;
                } elseif ($as === 'failed') {
                    $totals['failed_accounts']++;
                }
            }

            $agg = $this->db->fetchOne(
                'SELECT
                    COUNT(CASE WHEN settlement_status = "settled" THEN 1 END) AS settled_count,
                    COUNT(CASE WHEN settlement_status = "under_review" THEN 1 END) AS under_review_count,
                    COALESCE(SUM(CASE WHEN settlement_status = "settled" THEN gross_amount ELSE 0 END), 0) AS total_gross,
                    COALESCE(SUM(CASE WHEN settlement_status = "settled" THEN paystack_fee ELSE 0 END), 0) AS total_paystack_fees,
                    COALESCE(SUM(CASE WHEN settlement_status = "settled" THEN net_credit_amount ELSE 0 END), 0) AS total_net_credited
                 FROM paystack_dva_settlements'
            );
            if ($agg) {
                $totals['settled_count'] = (int)$agg['settled_count'];
                $totals['under_review_count'] = (int)$agg['under_review_count'];
                $totals['total_gross'] = (float)$agg['total_gross'];
                $totals['total_paystack_fees'] = (float)$agg['total_paystack_fees'];
                $totals['total_net_credited'] = (float)$agg['total_net_credited'];
            }

            $settlements = $this->db->fetchAll(
                'SELECT s.*, u.full_name AS customer_name, u.email AS customer_email
                 FROM paystack_dva_settlements s
                 LEFT JOIN users u ON u.id = s.user_id
                 ORDER BY s.created_at DESC
                 LIMIT 100'
            );
            foreach ($settlements as &$st) {
                $st['gross_amount'] = (float)$st['gross_amount'];
                $st['paystack_fee'] = (float)$st['paystack_fee'];
                $st['net_credit_amount'] = (float)$st['net_credit_amount'];
                unset($st['raw_payload']);
            }
        } catch (Throwable) {
        }

        Response::success([
            'capability' => $capability,
            'policy' => [
                'enable_paystack_dva' => (bool)$policy['gateways']['enable_paystack_dva'],
                'enable_virtual_accounts' => (bool)$policy['gateways']['enable_virtual_accounts'],
                'preferred_bank' => $policy['gateways']['paystack_dva_preferred_bank'],
                'fee_bearer' => $policy['gateways']['dva_fee_bearer'],
            ],
            'totals' => $totals,
            'accounts' => $accounts,
            'settlements' => $settlements,
        ]);
    }

    /**
     * 15. POST /api/admin/wallet/paystack/dva-requery
     * Requeries Paystack API for an existing Paystack-generated DVA status or pending inbound transfer.
     * Does NOT manually create accounts or manually credit balances.
     */
    public function adminRequeryDva(Request $request): void
    {
        Auth::requirePermission($request, 'wallet');
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

            Response::success(['account' => $va], $syncMsg);
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackAdminDvaRequery', $e, ['user_id' => $userId]);
            Response::error('Unable to sync Paystack dedicated account status right now.', 502);
        }
    }

    // =========================================================================
    // PAYSTACK DVA INTERNAL ORCHESTRATION & SETTLEMENT HELPERS
    // =========================================================================

    public function buildVirtualAccountPayloadForUser(array $user, bool $syncPending = false): array
    {
        $policy = $this->getWalletPolicy();
        $gw = $policy['gateways'];
        $currentLevel = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $emailVerified = !empty($user['email_verified']) || empty($user['email_verification_required']);
        $isActive = (($user['status'] ?? 'active') === 'active');
        $dvaFeatureOn = !empty($gw['enable_paystack']) && !empty($gw['enable_paystack_dva']) && !empty($gw['enable_virtual_accounts']);
        $eligible = $dvaFeatureOn && $emailVerified && $isActive && $currentLevel >= 2;

        $va = $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $user['id']]);

        // Only query Paystack for an ALREADY-pending assignment (never create a new account on GET)
        if (
            $syncPending
            && $va
            && ($va['provider'] ?? '') === 'paystack'
            && ($va['assignment_status'] ?? '') === 'pending'
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
                    }
                }
            } catch (Throwable $e) {
                Security::logPrivateError('PaystackDvaPendingSync', $e, ['user_id' => $user['id']]);
            }
        }

        $isConfirmedActive = $va
            && ($va['provider'] ?? '') === 'paystack'
            && ($va['account_status'] ?? '') === 'active'
            && ($va['assignment_status'] ?? '') === 'assigned'
            && !empty($va['account_number'])
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
            'bank_code' => $va['bank_slug'] ?? '',
            'currency' => $va['currency'] ?? 'NGN',
            'status' => 'active',
            'account_status' => 'active',
            'assignment_status' => 'assigned',
            'kyc_validation_status' => $va['kyc_validation_status'] ?? 'verified',
            'total_inflow' => (float)($va['total_inflow'] ?? 0),
            'last_funding_at' => $va['last_funding_at'] ?? null,
            'assigned_at' => $va['updated_at'] ?? $va['created_at'],
        ] : null;

        $msg = 'Upgrade to KYC Level 2 to qualify for an automatic Paystack dedicated bank account.';
        if (!$dvaFeatureOn) {
            $msg = 'Dedicated virtual account provisioning is currently disabled.';
        } elseif (!$emailVerified) {
            $msg = 'Please verify your email address before requesting a dedicated bank account.';
        } elseif ($isConfirmedActive) {
            $msg = 'Paystack dedicated virtual account active. Transfers automatically credit your wallet after applicable Paystack charges.';
        } elseif ($assignmentStatus === 'pending') {
            $msg = 'Your Paystack dedicated account request is awaiting confirmation from Paystack.';
        } elseif ($assignmentStatus === 'failed') {
            $msg = !empty($va['failure_reason'])
                ? (string)$va['failure_reason']
                : 'Your previous account assignment could not be completed. You may retry when ready.';
        } elseif ($eligible) {
            $msg = 'You qualify for a Paystack dedicated NGN bank account. Request yours to receive transfers directly into your wallet.';
        }

        return [
            'has_virtual_account' => $isConfirmedActive,
            'dva_enabled' => $dvaFeatureOn,
            'paystack_configured' => $this->paystack->hasSecretKey(),
            'eligible' => $eligible,
            'email_verified' => $emailVerified,
            'required_level' => 2,
            'current_level' => $currentLevel,
            'status' => $isConfirmedActive ? 'active' : ($assignmentStatus === 'pending' ? 'pending' : ($currentLevel < 2 ? 'pending_kyc' : 'unassigned')),
            'assignment_status' => $assignmentStatus,
            'kyc_validation_status' => $va['kyc_validation_status'] ?? ($currentLevel >= 2 ? 'verified' : 'unverified'),
            'failure_reason' => ($assignmentStatus === 'failed') ? ($va['failure_reason'] ?? null) : null,
            'fee_bearer' => $gw['dva_fee_bearer'],
            'preferred_bank' => $gw['paystack_dva_preferred_bank'],
            'virtual_account' => $publicVa,
            'account_number' => $publicVa['account_number'] ?? null,
            'account_name' => $publicVa['account_name'] ?? null,
            'bank_name' => $publicVa['bank_name'] ?? null,
            'message' => $msg,
        ];
    }

    public function requestPaystackDvaForUser(array $user, ?string $preferredBankOverride = null): array
    {
        $policy = $this->getWalletPolicy();
        $gw = $policy['gateways'];

        if (empty($gw['enable_paystack']) || empty($gw['enable_paystack_dva']) || empty($gw['enable_virtual_accounts'])) {
            return ['error' => 'Paystack dedicated virtual accounts are not enabled on this platform right now.', 'http_status' => 403];
        }
        if ((int)($user['kyc_level'] ?? $user['tier'] ?? 1) < 2) {
            return ['error' => 'Complete KYC Level 2 verification before requesting a dedicated bank account.', 'http_status' => 403];
        }
        if (!$this->paystack->hasSecretKey()) {
            return ['error' => 'Paystack dedicated virtual account service is temporarily unavailable. Please use Paystack Instant Checkout or contact support.', 'http_status' => 503];
        }

        $preferredBank = $preferredBankOverride ?: (string)$gw['paystack_dva_preferred_bank'];
        if (!in_array($preferredBank, ['wema-bank', 'titan-paystack'], true)) {
            $preferredBank = 'wema-bank';
        }

        // Step 1: Atomic idempotency lock check inside transaction (never hold lock over HTTP calls)
        $lockOutcome = $this->db->withTransaction(function (Database $db) use ($user) {
            $existing = $db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid FOR UPDATE', ['uid' => $user['id']]);
            if (
                $existing
                && ($existing['provider'] ?? '') === 'paystack'
                && ($existing['assignment_status'] ?? '') === 'assigned'
                && ($existing['account_status'] ?? '') === 'active'
                && !empty($existing['account_number'])
            ) {
                return ['action' => 'already_assigned', 'row' => $existing];
            }

            if (
                $existing
                && ($existing['provider'] ?? '') === 'paystack'
                && ($existing['assignment_status'] ?? '') === 'pending'
            ) {
                $updatedTs = strtotime((string)($existing['updated_at'] ?? $existing['created_at'] ?? '')) ?: 0;
                if ($updatedTs > (time() - 25)) {
                    return ['action' => 'already_pending', 'row' => $existing];
                }
            }

            if ($existing) {
                $db->execute(
                    'UPDATE customer_virtual_accounts
                        SET provider = "paystack",
                            account_status = "pending_approval",
                            assignment_status = "pending",
                            failure_reason = NULL,
                            updated_at = NOW()
                      WHERE id = :id',
                    ['id' => $existing['id']]
                );
            } else {
                $db->execute(
                    'INSERT INTO customer_virtual_accounts
                        (id, user_id, provider, order_ref, account_number, account_name, bank_name, account_status, kyc_validation_status, assignment_status, created_at, updated_at)
                     VALUES
                        (:id, :uid, "paystack", :oref, "", :aname, "", "pending_approval", "pending", "pending", NOW(), NOW())',
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
                'payload' => $this->buildVirtualAccountPayloadForUser($user, false),
                'message' => 'Your existing Paystack dedicated bank account is active.',
            ];
        }

        if ($lockOutcome['action'] === 'already_pending') {
            return [
                'payload' => $this->buildVirtualAccountPayloadForUser($user, true),
                'message' => 'Account assignment is in progress and awaiting Paystack confirmation.',
            ];
        }

        // Step 2: Check existing Paystack customer/accounts first & request official DVA via Paystack API
        try {
            [$firstName, $lastName] = $this->splitFullName((string)($user['full_name'] ?? ''));
            $phone = $this->normalizeNigerianPhone((string)($user['phone_number'] ?? ''));

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

            $this->db->execute(
                'UPDATE customer_virtual_accounts SET paystack_customer_code = :cc, updated_at = NOW() WHERE user_id = :uid',
                ['cc' => $custCode, 'uid' => $user['id']]
            );

            // B. Reuse existing active DVA if Paystack already generated one for this customer
            $existingRemote = $this->paystack->fetchDedicatedAccountsByCustomer($custCode, $custNumericId);
            $confirmedRemote = $this->pickConfirmedDvaFromList($existingRemote['accounts'] ?? []);
            if ($confirmedRemote) {
                $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $confirmedRemote, 'verified', $confirmedRemote);
                return [
                    'payload' => $this->buildVirtualAccountPayloadForUser($user, false),
                    'message' => 'Dedicated virtual account confirmed and linked to your wallet.',
                ];
            }

            // C. Request new DVA directly from Paystack
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
                    'payload' => $this->buildVirtualAccountPayloadForUser($user, false),
                    'message' => 'Dedicated virtual account generated by Paystack and ready for transfers.',
                ];
            }

            // If Paystack reports assignment queued or requires single-step assign
            if (!empty($createRes['ok'])) {
                return [
                    'payload' => $this->buildVirtualAccountPayloadForUser($user, false),
                    'message' => 'Dedicated account request submitted to Paystack. Your account number will appear once Paystack confirms assignment.',
                ];
            }

            // Try Single-Step Assign endpoint (POST /dedicated_account/assign)
            $assignRes = $this->paystack->assignDedicatedVirtualAccount([
                'email' => $user['email'],
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => $phone,
                'preferred_bank' => $preferredBank,
            ]);

            if (!empty($assignRes['ok'])) {
                $assignData = is_array($assignRes['data'] ?? null) ? $assignRes['data'] : [];
                if (!empty($assignData['account_number']) && !empty($assignData['assigned'])) {
                    $this->persistPaystackDvaAssignment((string)$user['id'], $custCode, $assignData, 'verified', $assignData);
                    return [
                        'payload' => $this->buildVirtualAccountPayloadForUser($user, false),
                        'message' => 'Dedicated virtual account generated by Paystack and ready for transfers.',
                    ];
                }
                return [
                    'payload' => $this->buildVirtualAccountPayloadForUser($user, false),
                    'message' => 'Dedicated account assignment is in progress with Paystack. Please check back in a moment.',
                ];
            }

            // Paystack declined (e.g., DVA not enabled on merchant account or customer identification required)
            $rawMsg = (string)($assignRes['message'] ?? $createRes['message'] ?? 'Paystack could not provision a dedicated account.');
            $safeCustomerMsg = $this->mapPaystackDvaErrorToSafeMessage($rawMsg);

            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "inactive",
                        assignment_status = "failed",
                        failure_reason = :reason,
                        updated_at = NOW()
                  WHERE user_id = :uid AND assignment_status != "assigned"',
                ['reason' => $safeCustomerMsg, 'uid' => $user['id']]
            );

            Security::logPrivateError('PaystackDvaProvisionRejected', new RuntimeException($rawMsg), [
                'user_id' => $user['id'],
                'paystack_customer_code' => $custCode,
                'create_status' => $createRes['status_code'] ?? 0,
                'assign_status' => $assignRes['status_code'] ?? 0,
            ]);

            return ['error' => $safeCustomerMsg, 'http_status' => 503];
        } catch (Throwable $e) {
            Security::logPrivateError('PaystackDvaProvisionException', $e, ['user_id' => $user['id']]);
            $this->db->execute(
                'UPDATE customer_virtual_accounts
                    SET account_status = "inactive",
                        assignment_status = "failed",
                        failure_reason = :reason,
                        updated_at = NOW()
                  WHERE user_id = :uid AND assignment_status != "assigned"',
                [
                    'reason' => 'Dedicated account provisioning is temporarily unavailable. Please use Paystack Instant Checkout or try again later.',
                    'uid' => $user['id'],
                ]
            );
            return [
                'error' => 'We could not provision your dedicated bank account at this time. Please use Paystack Instant Checkout or try again later.',
                'http_status' => 503,
            ];
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
        $accName = trim((string)($dvaObj['account_name'] ?? '')) ?: null;
        $currency = strtoupper(trim((string)($dvaObj['currency'] ?? 'NGN'))) ?: 'NGN';
        $isAssigned = (!array_key_exists('assigned', $dvaObj) || !empty($dvaObj['assigned']))
            && (!array_key_exists('active', $dvaObj) || !empty($dvaObj['active']));

        $orderRef = 'PSK_DVA_' . ($dedicatedId ? (string)$dedicatedId : $accNum);
        $rawJson = $rawPayload ? Security::sanitizeProviderLogPayload($rawPayload, 12000) : null;

        $this->db->execute(
            'INSERT INTO customer_virtual_accounts
                (id, user_id, provider, paystack_customer_code, dedicated_account_id, order_ref, account_number, account_name, bank_name, bank_id, bank_slug, currency, account_status, kyc_validation_status, assignment_status, failure_reason, raw_assignment_payload, created_at, updated_at)
             VALUES
                (:id, :uid, "paystack", :cc, :did, :oref, :anum, :aname, :bname, :bid, :bslug, :curr, :ast, :kvs, :asst, NULL, :raw, NOW(), NOW())
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
                currency = VALUES(currency),
                account_status = VALUES(account_status),
                kyc_validation_status = VALUES(kyc_validation_status),
                assignment_status = VALUES(assignment_status),
                failure_reason = NULL,
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
                'curr' => $currency,
                'ast' => $isAssigned ? 'active' : 'pending_approval',
                'kvs' => $kycValidationStatus,
                'asst' => $isAssigned ? 'assigned' : 'pending',
                'raw' => $rawJson,
            ]
        );

        return $this->db->fetchOne('SELECT * FROM customer_virtual_accounts WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);
    }

    private function settlePaystackDvaCharge(array $data, string $event): array
    {
        $reference = trim((string)($data['reference'] ?? ''));
        $txIdNum = isset($data['id']) ? (int)$data['id'] : null;
        $grossAmount = round(((float)($data['amount'] ?? 0)) / 100, 2);
        $paystackFee = max(0.0, round(((float)($data['fees'] ?? 0)) / 100, 2));
        $currency = strtoupper(trim((string)($data['currency'] ?? 'NGN')));

        $auth = is_array($data['authorization'] ?? null) ? $data['authorization'] : [];
        $meta = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        $custObj = is_array($data['customer'] ?? null) ? $data['customer'] : [];

        $receiverAccount = preg_replace('/\D/', '', (string)($auth['receiver_bank_account_number'] ?? ($meta['receiver_account_number'] ?? '')));
        $custCode = trim((string)($custObj['customer_code'] ?? ''));
        $dedicatedAccId = isset($meta['dedicated_account_id']) ? (int)$meta['dedicated_account_id'] : (isset($auth['dedicated_account_id']) ? (int)$auth['dedicated_account_id'] : null);

        $senderBank = trim((string)($auth['sender_bank'] ?? ($auth['bank'] ?? 'Bank Transfer')));
        $senderName = trim((string)($auth['sender_name'] ?? ($meta['sender_name'] ?? '')));
        $senderNumRaw = preg_replace('/\D/', '', (string)($auth['sender_bank_account_number'] ?? ''));
        $senderMasked = $senderNumRaw !== '' ? ('******' . substr($senderNumRaw, -4)) : null;
        $sessionId = trim((string)($auth['narration'] ?? ($data['receipt_number'] ?? ($meta['session_id'] ?? ''))));

        $policy = $this->getWalletPolicy();
        $feeBearer = strtolower((string)($policy['gateways']['dva_fee_bearer'] ?? 'customer')) === 'merchant' ? 'merchant' : 'customer';
        $netCredit = ($feeBearer === 'merchant')
            ? $grossAmount
            : round(max(0.0, $grossAmount - $paystackFee), 2);

        if ($netCredit <= 0) {
            return ['status' => 'ignored_non_positive_net_amount'];
        }

        // Strict DVA account resolution — match assigned active customer_virtual_accounts only
        $va = null;
        if ($receiverAccount !== '') {
            $va = $this->db->fetchOne(
                'SELECT * FROM customer_virtual_accounts
                  WHERE provider = "paystack" AND account_number = :acc AND account_status = "active"
                  LIMIT 1',
                ['acc' => $receiverAccount]
            );
        }
        if (!$va && $dedicatedAccId) {
            $va = $this->db->fetchOne(
                'SELECT * FROM customer_virtual_accounts
                  WHERE provider = "paystack" AND dedicated_account_id = :did AND account_status = "active"
                  LIMIT 1',
                ['did' => $dedicatedAccId]
            );
        }

        if (!$va) {
            // Record safely for audit review without crediting any unverified user
            try {
                $this->db->execute(
                    'INSERT IGNORE INTO paystack_dva_settlements
                        (id, user_id, virtual_account_id, paystack_reference, paystack_transaction_id, dedicated_account_id, account_number, paystack_customer_code, gross_amount, paystack_fee, net_credit_amount, fee_bearer, currency, sender_bank, sender_account_name, sender_account_number_masked, session_id, settlement_status, raw_payload, created_at)
                     VALUES
                        (:id, NULL, NULL, :ref, :tid, :did, :acc, :cc, :gross, :fee, :net, :fb, :curr, :sb, :sn, :sm, :sid, "under_review", :raw, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'ref' => $reference,
                        'tid' => $txIdNum,
                        'did' => $dedicatedAccId,
                        'acc' => $receiverAccount ?: 'UNKNOWN',
                        'cc' => $custCode ?: null,
                        'gross' => $grossAmount,
                        'fee' => $paystackFee,
                        'net' => $netCredit,
                        'fb' => $feeBearer,
                        'curr' => $currency,
                        'sb' => $senderBank ?: null,
                        'sn' => $senderName ?: null,
                        'sm' => $senderMasked,
                        'sid' => $sessionId ?: null,
                        'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                    ]
                );
            } catch (Throwable) {
            }
            return ['status' => 'under_review_unmatched_dva'];
        }

        $bankLabel = $va['bank_name'] ?: 'Paystack Partner Bank';
        $accNumLabel = $va['account_number'] ?: $receiverAccount;

        $settlement = $this->db->withTransaction(function (Database $db) use ($va, $reference, $txIdNum, $dedicatedAccId, $accNumLabel, $custCode, $grossAmount, $paystackFee, $netCredit, $feeBearer, $currency, $senderBank, $senderName, $senderMasked, $sessionId, $bankLabel, $event, $data) {
            // Replay/duplicate webhook check locked on paystack_dva_settlements & transactions
            $dupSettle = $db->fetchOne(
                'SELECT id, settlement_status FROM paystack_dva_settlements WHERE paystack_reference = :ref FOR UPDATE',
                ['ref' => $reference]
            );
            if ($dupSettle && $dupSettle['settlement_status'] === 'settled') {
                return ['already_settled' => true];
            }

            $dupTx = $db->fetchOne(
                'SELECT id, status FROM transactions WHERE reference = :ref FOR UPDATE',
                ['ref' => $reference]
            );
            if ($dupTx && $dupTx['status'] === 'successful') {
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
                    'net_credit_amount' => $netCredit,
                    'fee_bearer' => $feeBearer,
                    'dedicated_account_number' => $accNumLabel,
                    'dedicated_bank_name' => $bankLabel,
                    'sender_bank' => $senderBank,
                    'sender_account_name' => $senderName,
                ]
            );

            $db->execute(
                'INSERT INTO paystack_dva_settlements
                    (id, user_id, virtual_account_id, paystack_reference, paystack_transaction_id, dedicated_account_id, account_number, paystack_customer_code, gross_amount, paystack_fee, net_credit_amount, fee_bearer, currency, sender_bank, sender_account_name, sender_account_number_masked, session_id, settlement_status, wallet_transaction_id, raw_payload, created_at)
                 VALUES
                    (:id, :uid, :vaid, :ref, :tid, :did, :acc, :cc, :gross, :fee, :net, :fb, :curr, :sb, :sn, :sm, :sid, "settled", :wtx, :raw, NOW())
                 ON DUPLICATE KEY UPDATE
                    settlement_status = "settled",
                    wallet_transaction_id = VALUES(wallet_transaction_id),
                    net_credit_amount = VALUES(net_credit_amount),
                    paystack_fee = VALUES(paystack_fee)',
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
                    'net' => $netCredit,
                    'fb' => $feeBearer,
                    'curr' => $currency,
                    'sb' => $senderBank ?: null,
                    'sn' => $senderName ?: null,
                    'sm' => $senderMasked,
                    'sid' => $sessionId ?: null,
                    'wtx' => $tx['id'] ?? null,
                    'raw' => Security::sanitizeProviderLogPayload($data, 12000),
                ]
            );

            $db->execute(
                'INSERT INTO payment_records (id, user_id, gateway, reference, amount, fee, status, paid_at, raw_response, created_at)
                 VALUES (:id, :uid, "paystack", :ref, :amt, :fee, "successful", NOW(), :raw, NOW())
                 ON DUPLICATE KEY UPDATE status = "successful", fee = VALUES(fee), paid_at = NOW()',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $va['user_id'],
                    'ref' => $reference,
                    'amt' => $netCredit,
                    'fee' => $paystackFee,
                    'raw' => Security::sanitizeProviderLogPayload($data, 12000),
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
            return ['status' => 'already_settled', 'reference' => $reference];
        }

        $tx = $settlement['tx'];

        try {
            (new AccountingService($this->db))->syncWebsiteTransactions();
        } catch (Throwable) {
        }

        try {
            $netFmt = '₦' . number_format($netCredit, 2);
            $grossFmt = '₦' . number_format($grossAmount, 2);
            $feeFmt = '₦' . number_format($paystackFee, 2);
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, "Bank Transfer Credited", :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $va['user_id'],
                    'msg' => "Transfer of {$grossFmt} to {$bankLabel} ({$accNumLabel}) confirmed. Net wallet credit: {$netFmt} (Paystack fee: {$feeFmt}). Ref: {$reference}.",
                ]
            );
        } catch (Throwable) {
        }

        try {
            $uRow = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :uid LIMIT 1', ['uid' => $va['user_id']]);
            FootprintService::record([
                'user_id' => $va['user_id'],
                'user_email' => $uRow['email'] ?? null,
                'user_name' => $uRow['full_name'] ?? null,
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
                    'net_credit_amount' => $netCredit,
                    'fee_bearer' => $feeBearer,
                ],
            ]);

            if ($uRow && !empty($uRow['email'])) {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($uRow['full_name'] ?: 'Customer'), ENT_QUOTES, 'UTF-8');
                $balFmt = '₦' . number_format((float)($tx['balance_after'] ?? 0), 2);
                $html = "<div style='font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    . "<h2 style='margin:0 0 12px;color:#059669;'>Wallet Credited: {$netFmt}</h2>"
                    . "<p style='color:#334155;'>Hello <strong>{$safeName}</strong>,</p>"
                    . "<p style='color:#334155;'>Your inbound bank transfer to your dedicated Paystack account has been automatically settled into your HAMBAKTECH wallet.</p>"
                    . "<div style='background:#f8fafc;border:1px solid #e2e8f0;padding:14px;border-radius:8px;margin:14px 0;font-size:13px;color:#334155;line-height:1.7;'>"
                    . "<div><strong>Dedicated Account:</strong> {$bankLabel} &bull; <code>{$accNumLabel}</code></div>"
                    . "<div><strong>Transfer Amount (Gross):</strong> {$grossFmt}</div>"
                    . "<div><strong>Paystack Processing Charge:</strong> {$feeFmt}" . ($feeBearer === 'merchant' ? ' (Covered by merchant)' : '') . "</div>"
                    . "<div><strong>Net Wallet Credit:</strong> <strong style='color:#059669;'>{$netFmt}</strong></div>"
                    . "<div><strong>Reference:</strong> <code>{$reference}</code></div>"
                    . "<div><strong>New Wallet Balance:</strong> {$balFmt}</div></div></div>";
                $mailer->send(
                    (string)$uRow['email'],
                    (string)($uRow['full_name'] ?: 'Customer'),
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
            'net_credit_amount' => $netCredit,
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
