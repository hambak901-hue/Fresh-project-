import { execSync } from 'child_process';
import fs from 'fs';

const php = `<?php
header("Content-Type: application/json");
$cfg = require __DIR__ . "/api/config/config.php";
$pdo = new PDO("mysql:host=" . $cfg["database"]["host"] . ";dbname=" . $cfg["database"]["database"] . ";charset=utf8mb4", $cfg["database"]["username"], $cfg["database"]["password"]);
$stmt = $pdo->query("SELECT id, email, passwordHash FROM User WHERE email LIKE '%admin%' OR email LIKE '%hambak%'");
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_show_user_admin.php', php);
execSync('curl -s -m 30 -T /tmp/_show_user_admin.php --user "${process.env.CPANEL_FTP_USER || ''}:${process.env.CPANEL_SFTP_PASS || ''}" "ftp://${process.env.CPANEL_FTP_HOST || ''}:21/public_html/_show_user_admin.php"');
console.log(execSync('curl -s "https://hambaktech.com.ng/_show_user_admin.php"', { encoding: 'utf-8' }));
