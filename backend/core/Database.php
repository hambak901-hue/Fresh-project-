<?php
/**
 * @file Database.php
 * Thread-safe Database singleton with financial transaction control & row locking
 */

declare(strict_types=1);

namespace HambakTech\Core;

use PDO;
use PDOStatement;
use Exception;
use HambakTech\Config\DatabaseConfig;

class Database
{
    private static ?Database $instance = null;
    private PDO $pdo;

    private function __construct()
    {
        $this->pdo = DatabaseConfig::getConnection();
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getPdo(): PDO
    {
        return $this->pdo;
    }

    public function query(string $sql, array $params = []): PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public function fetchOne(string $sql, array $params = []): ?array
    {
        $stmt = $this->query($sql, $params);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function fetchAll(string $sql, array $params = []): array
    {
        $stmt = $this->query($sql, $params);
        return $stmt->fetchAll();
    }

    public function execute(string $sql, array $params = []): int
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    public function lastInsertId(): string
    {
        return $this->pdo->lastInsertId();
    }

    /**
     * Executes a callback within an isolated ACID database transaction.
     * Automatically handles rollback on exception and commit on success.
     */
    public function withTransaction(callable $callback): mixed
    {
        if ($this->pdo->inTransaction()) {
            return $callback($this);
        }

        $this->pdo->beginTransaction();
        try {
            $result = $callback($this);
            $this->pdo->commit();
            return $result;
        } catch (Exception $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Locks a user's wallet row using SELECT ... FOR UPDATE.
     * Guarantees strict serialization and prevents race-condition double spending.
     */
    public function lockWalletForUpdate(string $userId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, user_id, balance, currency, ledger_version, status 
             FROM wallets 
             WHERE user_id = :user_id 
             FOR UPDATE'
        );
        $stmt->execute(['user_id' => $userId]);
        $wallet = $stmt->fetch();
        return $wallet ?: null;
    }
}
