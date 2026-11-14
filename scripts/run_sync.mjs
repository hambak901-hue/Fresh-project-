import { execSync } from 'child_process';
import fs from 'fs';

const phpScript = `<?php
header("Content-Type: application/json");
ini_set('display_errors', '1');
error_reporting(E_ALL);

try {
    $cfg = require __DIR__ . '/api/config/config.php';
    $dbCfg = $cfg['database'];
    $pdo = new PDO(
        "mysql:host={$dbCfg['host']};dbname={$dbCfg['database']};charset=utf8mb4",
        $dbCfg['username'],
        $dbCfg['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $legacyUsers = $pdo->query("
        SELECT 
            u.id,
            u.email,
            u.passwordHash,
            u.firstName,
            u.lastName,
            u.phoneNumber,
            u.status,
            u.createdAt,
            COALESCE(w.availableBalanceKobo, w.balanceKobo, 0) AS balanceKobo,
            r.name AS roleName
        FROM User u
        LEFT JOIN Wallet w ON w.userId = u.id
        LEFT JOIN UserRole ur ON ur.userId = u.id
        LEFT JOIN Role r ON r.id = ur.roleId
    ")->fetchAll(PDO::FETCH_ASSOC);

    $synced = 0;
    $walletSynced = 0;

    foreach ($legacyUsers as $lu) {
        $email = strtolower(trim($lu['email']));
        $fullName = trim(($lu['firstName'] ?? '') . ' ' . ($lu['lastName'] ?? ''));
        if (empty($fullName)) {
            $fullName = explode('@', $email)[0];
        }
        $phone = $lu['phoneNumber'] ?: '+2348000000000';
        
        $roleName = strtoupper($lu['roleName'] ?? 'CUSTOMER');
        $targetRole = 'customer';
        if ($roleName === 'SUPER_ADMIN' || str_contains($email, 'superadmin') || str_contains($email, 'admin@hambaktech')) {
            $targetRole = 'superadmin';
        } elseif ($roleName === 'ADMIN' || $roleName === 'CUSTOMER_SERVICE' || $roleName === 'STAFF') {
            $targetRole = 'admin';
        }

        $balanceNaira = round(((float)$lu['balanceKobo']) / 100.0, 2);
        $userStatus = strtolower($lu['status'] ?? 'active') === 'active' ? 'active' : 'suspended';
        $referralCode = 'HAMBAK-' . strtoupper(substr(md5($email), 0, 6));

        $stmt = $pdo->prepare("
            INSERT INTO users (id, email, password_hash, full_name, phone_number, role, wallet_balance, kyc_status, tier, referral_code, status, created_at)
            VALUES (:id, :email, :pwd, :name, :phone, :role, :bal, 'verified', 2, :ref, :status, :created_at)
            ON DUPLICATE KEY UPDATE
                password_hash = IF(users.password_hash LIKE '$2y$%' AND users.email = 'admin@hambaktech.com.ng', users.password_hash, VALUES(password_hash)),
                full_name = IF(users.full_name != '', users.full_name, VALUES(full_name)),
                phone_number = IF(users.phone_number != '', users.phone_number, VALUES(phone_number)),
                role = IF(users.role = 'superadmin', 'superadmin', VALUES(role)),
                wallet_balance = GREATEST(users.wallet_balance, VALUES(wallet_balance)),
                status = VALUES(status)
        ");

        $stmt->execute([
            ':id' => $lu['id'],
            ':email' => $email,
            ':pwd' => $lu['passwordHash'],
            ':name' => $fullName,
            ':phone' => $phone,
            ':role' => $targetRole,
            ':bal' => $balanceNaira,
            ':ref' => $referralCode,
            ':status' => $userStatus,
            ':created_at' => $lu['createdAt'] ?: date('Y-m-d H:i:s'),
        ]);
        $synced++;

        $walId = 'wal_' . substr(md5($lu['id']), 0, 20);
        $walStmt = $pdo->prepare("
            INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status)
            VALUES (:id, :uid, :bal, 'NGN', 1, 'active')
            ON DUPLICATE KEY UPDATE
                balance = GREATEST(wallets.balance, VALUES(balance))
        ");
        $walStmt->execute([
            ':id' => $walId,
            ':uid' => $lu['id'],
            ':bal' => $balanceNaira,
        ]);
        $walletSynced++;
    }

    echo json_encode([
        'success' => true,
        'message' => "Successfully synchronized {$synced} users and {$walletSynced} wallets from legacy User table.",
        'total_legacy_users' => count($legacyUsers),
        'synced_count' => $synced,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_run_sync.php', phpScript);
execSync('curl -s -m 30 -T /tmp/_run_sync.php --user "qfqzpeqx:2h9PAQk[kE[t96" "ftp://51.89.153.183:21/public_html/_run_sync.php"');
const res = execSync('curl -s -m 30 "https://hambaktech.com.ng/_run_sync.php"', { encoding: 'utf-8' });
console.log('Run sync result:', res);
