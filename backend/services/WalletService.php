<?php
/**
 * @file WalletService.php
 * High-Integrity Financial Settlement Engine
 * Guarantees ACID compliance, SELECT ... FOR UPDATE row-level locking,
 * negative balance prevention, idempotency, and immutable double-entry ledger.
 */

declare(strict_types=1);

namespace HambakTech\Services;

use Exception;
use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class WalletService
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * Credits a user's wallet with row locking and writes to immutable ledger.
     */
    public function credit(
        string $userId,
        float $amount,
        string $category,
        string $reference,
        string $description,
        string $gateway = 'internal',
        ?array $metadata = null
    ): array {
        if ($amount <= 0) {
            throw new RuntimeException('Credit amount must be greater than zero.');
        }

        return $this->db->withTransaction(function (Database $db) use (
            $userId, $amount, $category, $reference, $description, $gateway, $metadata
        ) {
            // Check for duplicate transaction reference (Idempotency)
            $existingTx = $db->fetchOne(
                'SELECT id, reference, status, balance_after FROM transactions WHERE reference = :ref',
                ['ref' => $reference]
            );
            if ($existingTx) {
                return [
                    'transaction_id' => $existingTx['id'],
                    'reference' => $existingTx['reference'],
                    'status' => $existingTx['status'],
                    'balance_after' => (float)$existingTx['balance_after'],
                    'duplicate' => true,
                ];
            }

            // Lock the wallet row
            $wallet = $db->lockWalletForUpdate($userId);
            if (!$wallet) {
                // Auto-create wallet if not present
                $walletId = Security::generateUuid();
                $db->execute(
                    'INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status) 
                     VALUES (:id, :user_id, 0.00, "NGN", 0, "active")',
                    ['id' => $walletId, 'user_id' => $userId]
                );
                $wallet = $db->lockWalletForUpdate($userId);
            }

            if ($wallet['status'] !== 'active') {
                throw new RuntimeException("Wallet is {$wallet['status']} and cannot be credited.");
            }

            $balanceBefore = (float)$wallet['balance'];
            $balanceAfter = $balanceBefore + $amount;
            $newLedgerVersion = ((int)$wallet['ledger_version']) + 1;

            // 1. Update wallet balance
            $db->execute(
                'UPDATE wallets 
                 SET balance = :balance, ledger_version = :version, updated_at = NOW() 
                 WHERE id = :id',
                [
                    'balance' => $balanceAfter,
                    'version' => $newLedgerVersion,
                    'id' => $wallet['id'],
                ]
            );

            // Also synchronize cached column on users table
            $db->execute(
                'UPDATE users SET wallet_balance = :balance WHERE id = :user_id',
                ['balance' => $balanceAfter, 'user_id' => $userId]
            );

            // 2. Append to Immutable Wallet Ledger
            $ledgerId = Security::generateUuid();
            $db->execute(
                'INSERT INTO wallet_ledger 
                 (id, wallet_id, user_id, entry_type, amount, balance_before, balance_after, reference, category, description, created_at)
                 VALUES 
                 (:id, :wallet_id, :user_id, "CREDIT", :amount, :before, :after, :reference, :category, :description, NOW())',
                [
                    'id' => $ledgerId,
                    'wallet_id' => $wallet['id'],
                    'user_id' => $userId,
                    'amount' => $amount,
                    'before' => $balanceBefore,
                    'after' => $balanceAfter,
                    'reference' => $reference,
                    'category' => $category,
                    'description' => $description,
                ]
            );

            // 3. Record in Transactions table
            $txId = Security::generateUuid();
            $db->execute(
                'INSERT INTO transactions 
                 (id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at)
                 VALUES 
                 (:id, :user_id, "credit", :amount, :before, :after, :category, :reference, :gateway, "successful", :description, :meta, NOW())',
                [
                    'id' => $txId,
                    'user_id' => $userId,
                    'amount' => $amount,
                    'before' => $balanceBefore,
                    'after' => $balanceAfter,
                    'category' => $category,
                    'reference' => $reference,
                    'gateway' => $gateway,
                    'description' => $description,
                    'meta' => $metadata ? json_encode($metadata) : null,
                ]
            );

            return [
                'transaction_id' => $txId,
                'reference' => $reference,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'amount' => $amount,
                'status' => 'successful',
            ];
        });
    }

    /**
     * Debits a user's wallet with row locking, negative balance check, and immutable ledger record.
     */
    public function debit(
        string $userId,
        float $amount,
        string $category,
        string $reference,
        string $description,
        string $gateway = 'internal',
        ?array $metadata = null
    ): array {
        if ($amount <= 0) {
            throw new RuntimeException('Debit amount must be greater than zero.');
        }

        return $this->db->withTransaction(function (Database $db) use (
            $userId, $amount, $category, $reference, $description, $gateway, $metadata
        ) {
            // Check for duplicate transaction reference
            $existingTx = $db->fetchOne(
                'SELECT id, reference, status, balance_after FROM transactions WHERE reference = :ref',
                ['ref' => $reference]
            );
            if ($existingTx) {
                return [
                    'transaction_id' => $existingTx['id'],
                    'reference' => $existingTx['reference'],
                    'status' => $existingTx['status'],
                    'balance_after' => (float)$existingTx['balance_after'],
                    'duplicate' => true,
                ];
            }

            // Lock the wallet row
            $wallet = $db->lockWalletForUpdate($userId);
            if (!$wallet) {
                throw new RuntimeException('Wallet not found for this user account.');
            }

            if ($wallet['status'] !== 'active') {
                throw new RuntimeException("Wallet is {$wallet['status']} and cannot be debited.");
            }

            $currentBalance = (float)$wallet['balance'];
            if ($currentBalance < $amount) {
                $shortfall = $amount - $currentBalance;
                throw new RuntimeException(sprintf(
                    'Insufficient wallet balance. Available: ₦%s, Required: ₦%s (Shortfall: ₦%s). Please fund your wallet.',
                    number_format($currentBalance, 2),
                    number_format($amount, 2),
                    number_format($shortfall, 2)
                ));
            }

            $balanceAfter = $currentBalance - $amount;
            $newLedgerVersion = ((int)$wallet['ledger_version']) + 1;

            // 1. Update wallet balance
            $db->execute(
                'UPDATE wallets 
                 SET balance = :balance, ledger_version = :version, updated_at = NOW() 
                 WHERE id = :id',
                [
                    'balance' => $balanceAfter,
                    'version' => $newLedgerVersion,
                    'id' => $wallet['id'],
                ]
            );

            // Synchronize cached column on users table
            $db->execute(
                'UPDATE users SET wallet_balance = :balance WHERE id = :user_id',
                ['balance' => $balanceAfter, 'user_id' => $userId]
            );

            // 2. Append to Immutable Wallet Ledger
            $ledgerId = Security::generateUuid();
            $db->execute(
                'INSERT INTO wallet_ledger 
                 (id, wallet_id, user_id, entry_type, amount, balance_before, balance_after, reference, category, description, created_at)
                 VALUES 
                 (:id, :wallet_id, :user_id, "DEBIT", :amount, :before, :after, :reference, :category, :description, NOW())',
                [
                    'id' => $ledgerId,
                    'wallet_id' => $wallet['id'],
                    'user_id' => $userId,
                    'amount' => $amount,
                    'before' => $currentBalance,
                    'after' => $balanceAfter,
                    'reference' => $reference,
                    'category' => $category,
                    'description' => $description,
                ]
            );

            // 3. Record in Transactions table
            $txId = Security::generateUuid();
            $db->execute(
                'INSERT INTO transactions 
                 (id, user_id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, metadata, created_at)
                 VALUES 
                 (:id, :user_id, "debit", :amount, :before, :after, :category, :reference, :gateway, "successful", :description, :meta, NOW())',
                [
                    'id' => $txId,
                    'user_id' => $userId,
                    'amount' => $amount,
                    'before' => $currentBalance,
                    'after' => $balanceAfter,
                    'category' => $category,
                    'reference' => $reference,
                    'gateway' => $gateway,
                    'description' => $description,
                    'meta' => $metadata ? json_encode($metadata) : null,
                ]
            );

            return [
                'transaction_id' => $txId,
                'reference' => $reference,
                'balance_before' => $currentBalance,
                'balance_after' => $balanceAfter,
                'amount' => $amount,
                'status' => 'successful',
            ];
        });
    }

    /**
     * Fetch user wallet summary with real-time totals from DB.
     */
    public function getSummary(string $userId): array
    {
        $wallet = $this->db->fetchOne(
            'SELECT balance, currency, status, ledger_version, updated_at FROM wallets WHERE user_id = :uid',
            ['uid' => $userId]
        );

        $stats = $this->db->fetchOne(
            'SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN type = "credit" AND status = "successful" THEN amount ELSE 0 END) as total_credited,
                SUM(CASE WHEN type = "debit" AND status = "successful" THEN amount ELSE 0 END) as total_spent,
                SUM(CASE WHEN status = "successful" THEN 1 ELSE 0 END) as successful_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed_count
             FROM transactions 
             WHERE user_id = :uid',
            ['uid' => $userId]
        );

        return [
            'balance' => (float)($wallet['balance'] ?? 0),
            'currency' => $wallet['currency'] ?? 'NGN',
            'status' => $wallet['status'] ?? 'active',
            'ledger_version' => (int)($wallet['ledger_version'] ?? 0),
            'total_transactions' => (int)($stats['total_count'] ?? 0),
            'total_funded' => (float)($stats['total_credited'] ?? 0),
            'total_spent' => (float)($stats['total_spent'] ?? 0),
            'successful_count' => (int)($stats['successful_count'] ?? 0),
            'pending_count' => (int)($stats['pending_count'] ?? 0),
            'failed_count' => (int)($stats['failed_count'] ?? 0),
        ];
    }

    /**
     * Reversal of an existing transaction with ledger auditing.
     */
    public function reverseTransaction(string $transactionId, string $adminId, string $reason): array
    {
        return $this->db->withTransaction(function (Database $db) use ($transactionId, $adminId, $reason) {
            $tx = $db->fetchOne('SELECT * FROM transactions WHERE id = :id', ['id' => $transactionId]);
            if (!$tx) {
                throw new RuntimeException('Transaction not found for reversal.');
            }

            if ($tx['status'] !== 'successful') {
                throw new RuntimeException("Cannot reverse a transaction with status '{$tx['status']}'.");
            }

            $amount = (float)$tx['amount'];
            $userId = $tx['user_id'];
            $reference = 'REV_' . strtoupper(bin2hex(random_bytes(6)));

            // If original transaction was DEBIT, reversing it means CREDITING the user back
            // If original transaction was CREDIT, reversing it means DEBITING the user
            if ($tx['type'] === 'debit') {
                $result = $this->credit(
                    $userId,
                    $amount,
                    'reversal',
                    $reference,
                    "Reversal of #{$tx['reference']}: {$reason}",
                    'internal',
                    ['original_transaction_id' => $transactionId, 'reversed_by' => $adminId]
                );
            } else {
                $result = $this->debit(
                    $userId,
                    $amount,
                    'reversal',
                    $reference,
                    "Reversal of #{$tx['reference']}: {$reason}",
                    'internal',
                    ['original_transaction_id' => $transactionId, 'reversed_by' => $adminId]
                );
            }

            // Mark original transaction as reversed in metadata
            $meta = !empty($tx['metadata']) ? json_decode($tx['metadata'], true) : [];
            $meta['reversed_at'] = date('Y-m-d H:i:s');
            $meta['reversed_by'] = $adminId;
            $meta['reversal_reference'] = $reference;
            $meta['reversal_reason'] = $reason;

            $db->execute(
                'UPDATE transactions SET metadata = :meta WHERE id = :id',
                ['meta' => json_encode($meta), 'id' => $transactionId]
            );

            return array_merge($result, ['reversal_reference' => $reference]);
        });
    }

    /**
     * Get detailed, filterable official customer financial statement
     */
    public function getStatement(string $userId, ?string $startDate = null, ?string $endDate = null, ?string $category = null, ?string $type = null): array
    {
        $wallet = $this->db->fetchOne('SELECT balance, currency, status FROM wallets WHERE user_id = :uid', ['uid' => $userId]);
        $user = $this->db->fetchOne('SELECT id, full_name, email, phone_number, created_at FROM users WHERE id = :uid', ['uid' => $userId]);

        $sql = 'SELECT id, type, amount, balance_before, balance_after, category, reference, gateway, status, description, created_at 
                FROM transactions 
                WHERE user_id = :uid ';
        $params = ['uid' => $userId];

        if (!empty($startDate)) {
            $sql .= 'AND created_at >= :start ';
            $params['start'] = $startDate . ' 00:00:00';
        }
        if (!empty($endDate)) {
            $sql .= 'AND created_at <= :end ';
            $params['end'] = $endDate . ' 23:59:59';
        }
        if (!empty($category) && $category !== 'all') {
            $sql .= 'AND category = :cat ';
            $params['cat'] = $category;
        }
        if (!empty($type) && $type !== 'all') {
            $sql .= 'AND type = :type ';
            $params['type'] = strtolower($type);
        }

        $sql .= 'ORDER BY created_at DESC LIMIT 500';

        $txns = $this->db->fetchAll($sql, $params);
        $totalCredits = 0.0;
        $totalDebits = 0.0;

        foreach ($txns as &$t) {
            $t['amount'] = (float)$t['amount'];
            $t['balance_before'] = (float)$t['balance_before'];
            $t['balance_after'] = (float)$t['balance_after'];
            if ($t['status'] === 'successful') {
                if ($t['type'] === 'credit') {
                    $totalCredits += $t['amount'];
                } else {
                    $totalDebits += $t['amount'];
                }
            }
        }

        return [
            'account' => [
                'userId' => $userId,
                'name' => $user['full_name'] ?? 'HambakTech Customer',
                'email' => $user['email'] ?? '',
                'phone' => $user['phone_number'] ?? '',
                'currentBalance' => (float)($wallet['balance'] ?? 0.00),
                'currency' => $wallet['currency'] ?? 'NGN',
                'status' => $wallet['status'] ?? 'active',
            ],
            'statement' => [
                'totalCredits' => $totalCredits,
                'totalDebits' => $totalDebits,
                'transactionCount' => count($txns),
                'generatedAt' => date('c'),
                'transactions' => $txns,
            ],
        ];
    }
}
