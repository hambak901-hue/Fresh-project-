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
    $stmt = $pdo->query("SELECT id, email, full_name, role, status, LEFT(password_hash, 25) as hash_preview, LENGTH(password_hash) as hash_len FROM users LIMIT 50");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Also check tables in database
    $tablesStmt = $pdo->query("SHOW TABLES");
    $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode(["success" => true, "count" => count($users), "users" => $users, "tables" => $tables]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_check_users.php', phpScript);
execSync('curl -s -m 30 -T /tmp/_check_users.php --user "qfqzpeqx:2h9PAQk[kE[t96" "ftp://51.89.153.183:21/public_html/_check_users.php"');
const res = execSync('curl -s -m 20 "https://hambaktech.com.ng/_check_users.php"', { encoding: 'utf-8' });
console.log('Result from live server:', res);
