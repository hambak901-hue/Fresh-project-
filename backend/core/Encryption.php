<?php
declare(strict_types=1);

namespace Hambak\Core;

/**
 * HambakTech Smart Digital Platform v1.0
 * Authoritative Encryption & Decryption Utility (AES-256-CBC)
 * Dual-stack runtime compatible with TypeScript src/lib/encryption.ts.
 */
class Encryption
{
    private static ?string $derivedKey = null;

    /**
     * Resolves derived 32-byte binary key from environment secrets.
     */
    private static function getKey(): string
    {
        if (self::$derivedKey !== null) {
            return self::$derivedKey;
        }

        $secret = $_ENV['ENCRYPTION_KEY'] 
            ?? $_ENV['JWT_SECRET'] 
            ?? getenv('ENCRYPTION_KEY') 
            ?? getenv('JWT_SECRET');

        $appEnv = $_ENV['APP_ENV'] ?? getenv('APP_ENV') ?? 'development';
        $isProduction = ($appEnv === 'production');

        if (empty($secret)) {
            if ($isProduction) {
                throw new \RuntimeException(
                    'SECURITY FATAL: ENCRYPTION_KEY or JWT_SECRET must be configured in production environment. Failing closed.'
                );
            }
            // Strictly isolated test-fixture key for offline testing only — cannot be used in production
            $secret = 'test_fixture_only_deterministic_key';
        }

        self::$derivedKey = hash('sha256', (string)$secret, true);
        return self::$derivedKey;
    }

    /**
     * Encrypts plaintext using AES-256-CBC with a random 16-byte IV.
     * Output format: base64(iv . '::' . ciphertext) matching TypeScript encryption.ts.
     */
    public static function encrypt(string $plainText): string
    {
        if ($plainText === '') {
            return '';
        }

        $key = self::getKey();
        $iv = random_bytes(16);
        $encrypted = openssl_encrypt(
            $plainText,
            'AES-256-CBC',
            $key,
            OPENSSL_RAW_DATA,
            $iv
        );

        if ($encrypted === false) {
            throw new \RuntimeException('Encryption failed.');
        }

        return base64_encode($iv . '::' . $encrypted);
    }

    /**
     * Decrypts ciphertext in format base64(iv . '::' . ciphertext).
     * Returns decrypted plaintext or null on failure.
     */
    public static function decrypt(?string $payload): ?string
    {
        if (empty($payload)) {
            return null;
        }

        $raw = base64_decode($payload, true);
        if ($raw === false) {
            return null;
        }

        $parts = explode('::', $raw, 2);
        if (count($parts) !== 2 || strlen($parts[0]) !== 16) {
            return null;
        }

        $iv = $parts[0];
        $ciphertext = $parts[1];
        $key = self::getKey();

        $decrypted = openssl_decrypt(
            $ciphertext,
            'AES-256-CBC',
            $key,
            OPENSSL_RAW_DATA,
            $iv
        );

        return $decrypted !== false ? $decrypted : null;
    }
}
