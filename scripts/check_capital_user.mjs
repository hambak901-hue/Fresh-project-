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
    $cols = $pdo->query("DESCRIBE User")->fetchAll(PDO::FETCH_ASSOC);
    $rows = $pdo->query("SELECT * FROM User LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(["success" => true, "cols" => $cols, "rows" => $rows]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_check_capital_user.php', phpScript);
execSync('curl -s -m 30 -T /tmp/_check_capital_user.php --user "${process.env.CPANEL_FTP_USER || ''}:${process.env.CPANEL_SFTP_PASS || ''}" "ftp://${process.env.CPANEL_FTP_HOST || ''}:21/public_html/_check_capital_user.php"');
const res = execSync('curl -s -m 20 "https://hambaktech.com.ng/_check_capital_user.php"', { encoding: 'utf-8' });
console.log('Result from User table:', res);
