<?php
/**
 * @file sync_legacy_users.php
 * Synchronizes legacy Prisma/Next.js "User", "Wallet", "UserRole" records
 * into production "users", "wallets", and "user_profiles" tables.
 */

declare(strict_types=1);

header('Content-Type: application/json');

try {
    $cfg = require __DIR__ . '/../config/config.php';
    $dbCfg = $cfg['database'];
    $pdo = new PDO(
        "mysql:host={$dbCfg['host']};dbname={$dbCfg['database']};charset=utf8mb4",
        $dbCfg['username'],
        $dbCfg['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // 1. Check if legacy User table exists
    $hasUserTable = false;
    $tables = $pdo->query("SHOW TABLES LIKE 'User'")->fetchAll();
    if (count($tables) > 0) {
        $hasUserTable = true;
    }

    if (!$hasUserTable) {
        echo json_encode(['success' => true, 'message' => 'No legacy User table found.']);
        exit;
    }

    // 2. Fetch all legacy users
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
        
        // Map role
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

        // Insert or update users table
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

        // Sync wallets table
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
