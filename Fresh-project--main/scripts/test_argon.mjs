import { execSync } from 'child_process';
import fs from 'fs';

const phpScript = `<?php
header("Content-Type: application/json");
require_once __DIR__ . "/api/core/Security.php";
use HambakTech\Core\Security;

// Check PHP argon2 support
$argonSupported = defined('PASSWORD_ARGON2ID');

// Test password_verify on a sample argon2 hash from User table
$sampleHash = '$argon2id$v=19$m=65536,t=3,p=4$OWdqMFhIN000LnlnWVZZLg$3PWf7E3ouzyD1qL/t2TvS63jN5ot9+4tfJihAEsnpIY';
$info = password_get_info($sampleHash);

echo json_encode([
    "success" => true,
    "argonSupported" => $argonSupported,
    "hashInfo" => $info,
    "phpVersion" => phpversion()
]);
@unlink(__FILE__);
`;

fs.writeFileSync('/tmp/_test_argon.php', phpScript);
execSync('curl -s -m 30 -T /tmp/_test_argon.php --user "qfqzpeqx:2h9PAQk[kE[t96" "ftp://51.89.153.183:21/public_html/_test_argon.php"');
const res = execSync('curl -s -m 20 "https://hambaktech.com.ng/_test_argon.php"', { encoding: 'utf-8' });
console.log('Argon2 test result:', res);
