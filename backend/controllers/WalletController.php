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

class WalletController
{
    private Database $db;
    private WalletService $walletService;
    private PaystackAdapter $paystack;

    public function __construct()
    {
        $this->db = Database::getInstance();
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
            'enable_bank_transfer' => false,
        ];
        try {
            $rows = $this->db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("wallet_settings","payment_gateways_settings","active_payment_gateway")'
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
            Response::success([
                'has_virtual_account' => false,
                'status' => 'pending_activation',
                'message' => 'Dedicated NGN virtual accounts will be activated once business regulatory approvals are completed.',
                'bankDetails' => null,
            ]);
        }
    }
}
