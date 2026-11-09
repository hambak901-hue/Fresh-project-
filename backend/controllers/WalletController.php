<?php
/**
 * @file WalletController.php
 * Financial Operations & Ledger Management Controller
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
use HambakTech\Adapters\Payment\PaystackAdapter;

class WalletController
{
    private Database $db;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->walletService = new WalletService();
    }

    public function summary(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $summary = $this->walletService->getSummary($user['id']);
        Response::success($summary);
    }

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

        $rows = $this->db->fetchAll($sql, $params);
        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
            $r['balance_before'] = (float)$r['balance_before'];
            $r['balance_after'] = (float)$r['balance_after'];
            if (!empty($r['metadata'])) {
                $r['metadata'] = json_decode($r['metadata'], true);
            }
        }

        Response::success(['transactions' => $rows]);
    }

    public function initiateFunding(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $amount = (float)$request->input('amount', 0);
        $gateway = (string)$request->input('gateway', 'paystack');

        if ($amount < 100) {
            Response::error('Minimum wallet funding amount is ₦100.00.', 422);
        }

        $reference = 'PAY_' . strtoupper(bin2hex(random_bytes(6)));
        $paymentRecordId = Security::generateUuid();

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

        $paystack = new PaystackAdapter();
        $callbackUrl = 'https://hambaktech.com.ng/dashboard?payment=verify&reference=' . $reference;
        $initData = $paystack->initializePayment($user['email'], $amount, $reference, $callbackUrl);

        Response::success([
            'reference' => $reference,
            'amount' => $amount,
            'checkout_url' => $initData['authorization_url'],
            'access_code' => $initData['access_code'] ?? null,
        ], 'Payment checkout initialized');
    }

    public function verifyFunding(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $reference = (string)$request->input('reference', $request->query('reference', ''));

        if (empty($reference)) {
            Response::error('Payment reference is required.', 422);
        }

        $record = $this->db->fetchOne(
            'SELECT * FROM payment_records WHERE reference = :ref AND user_id = :uid',
            ['ref' => $reference, 'uid' => $user['id']]
        );

        if (!$record) {
            // Check if transaction already settled
            $existingTx = $this->db->fetchOne('SELECT * FROM transactions WHERE reference = :ref', ['ref' => $reference]);
            if ($existingTx) {
                Response::success(['settled' => true, 'reference' => $reference], 'Payment already verified');
                return;
            }
            Response::error('Payment record not found.', 404);
        }

        if ($record['status'] === 'successful') {
            Response::success(['settled' => true, 'reference' => $reference], 'Payment already credited');
            return;
        }

        $paystack = new PaystackAdapter();
        $verifyRes = $paystack->verifyPayment($reference);

        if ($verifyRes['status'] === 'successful') {
            $amount = (float)$record['amount'];

            // Execute atomic ledger credit with row locking
            $txResult = $this->walletService->credit(
                $user['id'],
                $amount,
                'funding',
                $reference,
                'Automated wallet deposit via Paystack',
                'paystack',
                ['payment_record_id' => $record['id']]
            );

            // Update payment record
            $this->db->execute(
                'UPDATE payment_records SET status = "successful", paid_at = NOW() WHERE id = :id',
                ['id' => $record['id']]
            );

            Response::success([
                'settled' => true,
                'amount' => $amount,
                'balance_after' => $txResult['balance_after'],
            ], 'Wallet funded successfully!');
        } else {
            $this->db->execute(
                'UPDATE payment_records SET status = "failed" WHERE id = :id',
                ['id' => $record['id']]
            );
            Response::error('Payment verification failed with provider.', 400);
        }
    }

    public function manualFunding(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $amount = (float)$request->input('amount', 0);
        $bankName = (string)$request->input('bank_name', 'Moniepoint MFB / TrueHost');
        $accountNumber = (string)$request->input('account_number', '8210492817');
        $depositorName = trim((string)$request->input('depositor_name', ''));
        $proofUrl = (string)$request->input('teller_proof_url', '');

        if ($amount <= 0 || empty($depositorName)) {
            Response::error('Deposit amount and depositor name are required.', 422);
        }

        $requestId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO manual_funding_requests 
             (id, user_id, amount, bank_name, account_number, depositor_name, teller_proof_url, status, created_at)
             VALUES 
             (:id, :uid, :amt, :bank, :acc, :name, :proof, "pending", NOW())',
            [
                'id' => $requestId,
                'uid' => $user['id'],
                'amt' => $amount,
                'bank' => $bankName,
                'acc' => $accountNumber,
                'name' => $depositorName,
                'proof' => $proofUrl,
            ]
        );

        Response::success([
            'request_id' => $requestId,
            'amount' => $amount,
            'status' => 'pending',
        ], 'Manual funding request logged. Finance team will credit your wallet upon confirmation.', 201);
    }
}
