<?php
/**
 * @file autoload.php
 * Universal PSR-4 compatible autoloader for HambakTech Enterprise Backend
 */

declare(strict_types=1);

spl_autoload_register(function (string $class) {
    $prefix = 'HambakTech\\';
    $baseDir = defined('HAMBAKTECH_ROOT') ? rtrim(HAMBAKTECH_ROOT, '/') . '/' : dirname(__DIR__) . '/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relativeClass = substr($class, $len);
    $parts = explode('\\', $relativeClass);

    // Possible file paths to check
    $candidates = [
        $baseDir . implode('/', $parts) . '.php',
        $baseDir . strtolower($parts[0]) . '/' . implode('/', array_slice($parts, 1)) . '.php',
        $baseDir . strtolower(implode('/', $parts)) . '.php',
    ];

    if (count($parts) === 3) {
        // e.g. HambakTech\Adapters\Verification\TwoSureVerifyAdapter
        $candidates[] = $baseDir . strtolower($parts[0]) . '/' . strtolower($parts[1]) . '/' . $parts[2] . '.php';
    }

    foreach ($candidates as $file) {
        if (file_exists($file)) {
            require_once $file;
            return;
        }
    }
});
