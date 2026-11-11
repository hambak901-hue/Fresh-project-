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

    /**
     * 1. GET /api/wallet/summary
     */
    public function summary(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $summary = $this->walletService->getSummary($user['id']);

        // Fetch dynamic bank transfer settings configured by administrator
        $bankNameSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_bank"');
        $accountNumSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_account_number"');
        $accountNameSetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "bank_transfer_account_name"');
        $activeGatewaySetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_payment_gateway"');

        $activeGateway = $activeGatewaySetting['setting_value'] ?? 'paystack';

        // Fetch recent transactions
        $recentTxns = $this->db->fetchAll(
            'SELECT id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at 
             FROM transactions 
             WHERE user_id = :uid 
             ORDER BY created_at DESC LIMIT 15',
            ['uid' => $user['id']]
        );

        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);
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

        $availableGateways = [
            [
                'id' => 'paystack',
                'name' => 'Paystack Merchant Checkout',
                'status' => 'active',
                'is_active' => ($activeGateway === 'paystack'),
            ],
            [
                'id' => 'flutterwave',
                'name' => 'Flutterwave Enterprise Gateway',
                'status' => 'active',
                'is_active' => ($activeGateway === 'flutterwave'),
            ],
            [
                'id' => 'manual',
                'name' => 'Direct Moniepoint Bank Transfer',
                'status' => 'active',
                'is_active' => ($activeGateway === 'manual'),
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
            'bankDetails' => [
                'bank' => $bankNameSetting['setting_value'] ?? 'Moniepoint MFB',
                'accountNumber' => $accountNumSetting['setting_value'] ?? '5210471634',
                'accountName' => $accountNameSetting['setting_value'] ?? 'Hambaktech_Services',
            ],
        ]);
    }

    /**
     * 2. GET /api/wallet/gateways
     */
    public function gateways(Request $request): void
    {
        $activeGatewaySetting = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "active_payment_gateway"');
        $activeGateway = $activeGatewaySetting['setting_value'] ?? 'paystack';

        Response::success([
            'activeGateway' => $activeGateway,
            'gateways' => [
                [
                    'id' => 'paystack',
                    'name' => 'Paystack Gateway',
                    'status' => 'active',
                    'is_active' => ($activeGateway === 'paystack'),
                ],
                [
                    'id' => 'flutterwave',
                    'name' => 'Flutterwave Gateway',
                    'status' => 'active',
                    'is_active' => ($activeGateway === 'flutterwave'),
                ],
                [
                    'id' => 'manual',
                    'name' => 'Moniepoint Bank Transfer',
                    'status' => 'active',
                    'is_active' => ($activeGateway === 'manual'),
                ]
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
        }

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description) 
             VALUES ("set_active_gateway", "active_payment_gateway", :gw, "payment", "Active payment gateway")
             ON DUPLICATE KEY UPDATE setting_value = :gw2',
            ['gw' => $gatewayId, 'gw2' => $gatewayId]
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
        $amount = (float)$request->input('amount', 0);
        $gateway = strtolower((string)$request->input('gateway', 'paystack'));
        $callbackUrl = (string)$request->input('callback_url', 'https://hambaktech.com.ng/dashboard?payment=verify');

        if ($amount < 100) {
            Response::error('Minimum wallet funding amount is ₦100.00.', 422);
        }

        $refPrefix = ($gateway === 'flutterwave') ? 'FLW_FUND_' : 'PAY_';
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
                    $callbackUrl . '&gateway=flutterwave&reference=' . $reference,
                    ['customer_name' => $user['full_name'], 'phone_number' => $user['phone_number']]
                );
            } else {
                $initRes = $this->paystack->initializePayment(
                    $user['email'],
                    $amount,
                    $reference,
                    $callbackUrl . '&gateway=paystack&reference=' . $reference,
                    ['customer_name' => $user['full_name'], 'phone_number' => $user['phone_number']]
                );
            }

            Response::success([
                'reference' => $reference,
                'amount' => $amount,
                'authorization_url' => $initRes['authorization_url'],
                'access_code' => $initRes['access_code'] ?? null,
                'gateway' => $gateway,
            ], 'Payment checkout initialized');
        } catch (Throwable $e) {
            $this->db->execute(
                'UPDATE payment_records SET status = "failed" WHERE id = :id',
                ['id' => $paymentRecordId]
            );
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

        if (empty($reference) && empty($flwTransactionId)) {
            Response::error('Payment reference is required for verification.', 422);
        }

        // 1. Look up payment record in MySQL
        $record = null;
        if (!empty($reference)) {
            $record = $this->db->fetchOne(
                'SELECT * FROM payment_records WHERE reference = :ref AND user_id = :uid',
                ['ref' => $reference, 'uid' => $user['id']]
            );
        }

        // Idempotency: If already credited, do NOT credit again!
        if ($record && $record['status'] === 'successful') {
            $summary = $this->walletService->getSummary($user['id']);
            Response::success([
                'settled' => true,
                'already_credited' => true,
                'reference' => $record['reference'],
                'balance' => $summary['balance'],
            ], 'Payment already credited to your wallet.');
            return;
        }

        // Check if matching transaction already settled in ledger
        $existingTx = $this->db->fetchOne('SELECT * FROM transactions WHERE reference = :ref', ['ref' => $reference]);
        if ($existingTx && $existingTx['status'] === 'successful') {
            $summary = $this->walletService->getSummary($user['id']);
            Response::success([
                'settled' => true,
                'already_credited' => true,
                'reference' => $reference,
                'balance' => $summary['balance'],
            ], 'Payment already verified and credited.');
            return;
        }

        $gateway = $record['gateway'] ?? (str_starts_with($reference, 'FLW_') ? 'flutterwave' : 'paystack');

        try {
            // 2. Perform live verification directly with provider cURL
            if ($gateway === 'flutterwave') {
                $verifyRes = $this->flutterwave->verifyPayment($reference, !empty($flwTransactionId) ? $flwTransactionId : null);
            } else {
                $verifyRes = $this->paystack->verifyPayment($reference);
            }

            if ($verifyRes['status'] === 'successful') {
                $amount = (float)$verifyRes['amount'];
                $currency = $verifyRes['currency'] ?? 'NGN';

                // Currency and amount verification
                if ($currency !== 'NGN') {
                    throw new RuntimeException("Invalid payment currency: {$currency}. Only NGN is supported.");
                }

                if ($record && $amount < (float)$record['amount']) {
                    throw new RuntimeException("Underpayment detected: Expected ₦{$record['amount']}, but received ₦{$amount}.");
                }

                // 3. Atomic wallet credit with immutable ledger entry
                $txResult = $this->walletService->credit(
                    $user['id'],
                    $amount,
                    'funding',
                    $reference,
                    "Automated deposit via " . ucfirst($gateway),
                    $gateway,
                    [
                        'provider_raw' => $verifyRes['raw'] ?? null,
                        'channel' => $verifyRes['channel'] ?? 'card',
                    ]
                );

                if ($record) {
                    $this->db->execute(
                        'UPDATE payment_records SET status = "successful", paid_at = NOW() WHERE id = :id',
                        ['id' => $record['id']]
                    );
                }

                // Customer notification
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, "Wallet Credited", :msg, "success", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $user['id'],
                        'msg' => "₦" . number_format($amount, 2) . " has been credited to your wallet via {$gateway} (Ref: {$reference}).",
                    ]
                );

                Response::success([
                    'settled' => true,
                    'amount' => $amount,
                    'balance' => $txResult['balance_after'],
                    'transaction' => $txResult,
                ], 'Payment verified and wallet credited successfully!');
            } else {
                if ($record) {
                    $this->db->execute(
                        'UPDATE payment_records SET status = "failed" WHERE id = :id',
                        ['id' => $record['id']]
                    );
                }
                Response::error("Payment not verified upstream: " . ($verifyRes['gateway_response'] ?? 'Transaction incomplete'), 400);
            }
        } catch (Throwable $e) {
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
            $reference = $data['reference'] ?? '';
            $amountInKobo = (float)($data['amount'] ?? 0);
            $amount = $amountInKobo / 100;
            $email = $data['customer']['email'] ?? '';

            if (empty($reference)) {
                Response::success(['status' => 'ignored_missing_ref']);
                return;
            }

            // Check if user exists
            $user = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $email]);
            if (!$user) {
                // Try from payment_records
                $record = $this->db->fetchOne('SELECT user_id FROM payment_records WHERE reference = :ref', ['ref' => $reference]);
                if ($record) {
                    $user = ['id' => $record['user_id']];
                }
            }

            if ($user) {
                // Idempotent credit
                $this->walletService->credit(
                    $user['id'],
                    $amount,
                    'funding',
                    $reference,
                    'Paystack Webhook Automated Settlement',
                    'paystack',
                    ['webhook_event' => $event]
                );

                $this->db->execute(
                    'UPDATE payment_records SET status = "successful", paid_at = NOW() WHERE reference = :ref',
                    ['ref' => $reference]
                );
            }
        }

        Response::success(['status' => 'processed']);
    }

    /**
     * 7. POST /api/wallet/flutterwave/webhook
     * Official Flutterwave Webhook Handler with verif-hash validation
     */
    public function flutterwaveWebhook(Request $request): void
    {
        $rawBody = file_get_contents('php://input') ?: '';
        $signature = $request->header('verif-hash') ?? ($request->header('Verif-Hash') ?? '');

        if (!$this->flutterwave->validateWebhookSignature($rawBody, $signature)) {
            Response::error('Invalid Flutterwave webhook signature', 401);
            return;
        }

        $payload = json_decode($rawBody, true) ?: [];
        $event = $payload['event'] ?? ($payload['event.type'] ?? '');
        $data = $payload['data'] ?? [];

        if ($data && ($data['status'] ?? '') === 'successful') {
            $reference = $data['tx_ref'] ?? '';
            $amount = (float)($data['amount'] ?? 0.0);
            $currency = $data['currency'] ?? 'NGN';
            $email = $data['customer']['email'] ?? '';

            if (!empty($reference) && $currency === 'NGN') {
                $user = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $email]);
                if (!$user) {
                    $record = $this->db->fetchOne('SELECT user_id FROM payment_records WHERE reference = :ref', ['ref' => $reference]);
                    if ($record) {
                        $user = ['id' => $record['user_id']];
                    }
                }

                if ($user) {
                    $this->walletService->credit(
                        $user['id'],
                        $amount,
                        'funding',
                        $reference,
                        'Flutterwave Webhook Automated Settlement',
                        'flutterwave',
                        ['flw_id' => $data['id'] ?? null]
                    );

                    $this->db->execute(
                        'UPDATE payment_records SET status = "successful", paid_at = NOW() WHERE reference = :ref',
                        ['ref' => $reference]
                    );
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
        $amount = (float)$request->input('amount', 0);
        $depositorName = trim((string)($request->input('depositor_name') ?? $request->input('sender_name', $user['full_name'])));
        $bankName = trim((string)($request->input('bank_name', 'Moniepoint MFB')));
        $accountNumber = trim((string)($request->input('account_number', '5210471634')));
        $paymentRef = trim((string)($request->input('reference') ?? $request->input('payment_reference', '')));
        $paymentDate = (string)($request->input('payment_date', date('Y-m-d')));
        $paymentMethod = (string)($request->input('payment_method', 'Bank Transfer'));
        $remarks = trim((string)($request->input('remarks', 'Manual bank deposit')));

        if ($amount < 500) {
            Response::error('Minimum manual funding amount is ₦500.00.', 422);
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
        }

        // Handle receipt file upload
        $proofFilename = null;
        $receiptUrl = (string)$request->input('payment_proof_url', '');

        $storageDir = dirname(__DIR__) . '/storage/receipts';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
            // Protect from direct web execution
            @file_put_contents($storageDir . '/.htaccess', "Deny from all\n");
        }

        if (isset($_FILES['receipt']) && $_FILES['receipt']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['receipt'];
            $maxBytes = 5 * 1024 * 1024; // 5MB

            if ($file['size'] > $maxBytes) {
                Response::error('Uploaded receipt must not exceed 5MB.', 422);
            }

            $allowedExts = ['jpg', 'jpeg', 'png', 'pdf'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

            if (!in_array($ext, $allowedExts, true)) {
                Response::error('Invalid receipt format. Allowed formats: JPG, PNG, PDF.', 422);
            }

            // Verify MIME type
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            $allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
            if (!in_array($mime, $allowedMimes, true)) {
                Response::error('File content validation failed. Please upload a valid document or image.', 422);
            }

            $proofFilename = 'receipt_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $destination = $storageDir . '/' . $proofFilename;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                Response::error('Failed to securely store receipt file on server.', 500);
            }

            $receiptUrl = '/api/wallet/receipt/' . $proofFilename;
        }

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

        // 1. Notify Super Admin in dashboard notifications
        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, "usr_superadmin", :title, :msg, "alert", 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'title' => "New Manual Funding: ₦" . number_format($amount, 2),
                'msg' => "Customer {$depositorName} submitted transfer proof for ₦" . number_format($amount, 2) . " (Ref: {$paymentRef}). Review required.",
            ]
        );

        // 2. Send Acknowledgement notification to customer
        $this->db->execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :uid, "Funding Request Received", :msg, "info", 0, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $user['id'],
                'msg' => "Your manual transfer proof for ₦" . number_format($amount, 2) . " (Ref: {$paymentRef}) has been received and is pending verification.",
            ]
        );

        Response::success([
            'request_id' => $requestId,
            'reference' => $paymentRef,
            'amount' => $amount,
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

        if ($user['role'] !== 'admin' && $user['role'] !== 'superadmin' && $user['id'] !== $req['user_id']) {
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
        readfile($filepath);
        exit;
    }

    /**
     * 10. GET /api/wallet/statement
     */
    public function statement(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $startDate = (string)$request->query('startDate', '');
        $endDate = (string)$request->query('endDate', '');
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

        $sql = 'SELECT id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at
                FROM transactions 
                WHERE user_id = :uid ';
        $params = ['uid' => $user['id']];

        if (!empty($category)) {
            $sql .= 'AND category = :cat ';
            $params['cat'] = $category;
        }

        $sql .= 'ORDER BY created_at DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;

        $isAdmin = in_array($user['role'] ?? '', ['admin', 'superadmin'], true);

        $rows = $this->db->fetchAll($sql, $params);
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
            // Return structured architectural status
            Response::success([
                'has_virtual_account' => false,
                'status' => 'pending_activation',
                'message' => 'Dedicated NGN virtual accounts will be activated once business regulatory approvals are completed on Flutterwave.',
                'bankDetails' => [
                    'bank' => 'Moniepoint MFB',
                    'accountNumber' => '5210471634',
                    'accountName' => 'Hambaktech_Services',
                ],
            ]);
        }
    }
}
