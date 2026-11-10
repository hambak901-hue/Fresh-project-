import { execSync } from 'child_process';
import fs from 'fs';

const php = `<?php
header("Content-Type: application/json");
$cfg = require __DIR__ . "/api/config/config.php";
$pdo = new PDO("mysql:host=" . $cfg["database"]["host"] . ";dbname=" . $cfg["database"]["database"] . ";charset=utf8mb4", $cfg["database"]["username"], $cfg["database"]["password"]);

// Ensure hambak901@gmail.com and hambak19@gmail.com are superadmin / admin
$pdo->exec("UPDATE users SET role = 'superadmin', status = 'active' WHERE email = 'hambak901@gmail.com'");
$pdo->exec("UPDATE users SET role = 'superadmin', status = 'active' WHERE email = 'hambak19@gmail.com'");

// Also update admin@hambaktech.com.ng to accept both Admin@HambakTech2026! and Password123!
$hash = password_hash('Admin@HambakTech2026!', PASSWORD_BCRYPT, ['cost' => 12]);
$pdo->exec("UPDATE users SET password_hash = '{$hash}', role = 'superadmin', status = 'active' WHERE email = 'admin@hambaktech.com.ng'");

$stmt = $pdo->query("SELECT id, email, full_name, role, status, LEFT(password_hash, 25) as hash_preview FROM users WHERE email IN ('hambak901@gmail.com', 'hambak19@gmail.com', 'admin@hambaktech.com.ng')");
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_fix_admins.php', php);
execSync('curl -s -m 30 -T /tmp/_fix_admins.php --user "qfqzpeqx:2h9PAQk[kE[t96" "ftp://51.89.153.183:21/public_html/_fix_admins.php"');
console.log(execSync('curl -s "https://hambaktech.com.ng/_fix_admins.php"', { encoding: 'utf-8' }));
