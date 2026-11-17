<?php
/**
 * @file Security.php
 * Enterprise Cryptographic & Input Sanitization Engine
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Security
{
    private static function getSalt(): string
    {
        return (string)(getenv('APP_SALT') ?: '');
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verifyPassword(string $plainText, ?string $hash, ?string $email = null): bool
    {
        if (empty($plainText) || empty($hash)) {
            return false;
        }

        $cleanText = trim($plainText);

        // Native PHP password verification (Bcrypt, Argon2id, Argon2i)
        if (str_starts_with($hash, '$2y$') ||
            str_starts_with($hash, '$2a$') ||
            str_starts_with($hash, '$2b$') ||
            str_starts_with($hash, '$argon2id$') ||
            str_starts_with($hash, '$argon2i$')) {

            // Normalize $2b$ to $2y$ if needed for OpenBSD bcrypt hashes
            if (str_starts_with($hash, '$2b$')) {
                $normalized = '$2y$' . substr($hash, 4);
                if (@password_verify($plainText, $normalized) || @password_verify($cleanText, $normalized)) {
                    return true;
                }
            }

            if (@password_verify($plainText, $hash) || @password_verify($cleanText, $hash)) {
                return true;
            }
        }

        // SHA-256 with configured salt (legacy migration only)
        $salt = self::getSalt();
        if ($salt !== '' && (hash_equals(hash('sha256', $plainText . $salt), $hash) || hash_equals(hash('sha256', $cleanText . $salt), $hash))) {
            return true;
        }

        // Plain SHA-256 without salt (legacy migration only)
        if (hash_equals(hash('sha256', $plainText), $hash) || hash_equals(hash('sha256', $cleanText), $hash)) {
            return true;
        }

        return false;
    }

    public static function hashPin(string $pin): string
    {
        return password_hash((string)$pin, PASSWORD_BCRYPT, ['cost' => 10]);
    }

    public static function verifyPin(string $plainPin, ?string $hash): bool
    {
        if (empty($plainPin) || empty($hash)) {
            return false;
        }

        $plainPinStr = (string)$plainPin;

        if (str_starts_with($hash, '$2y$') ||
            str_starts_with($hash, '$2a$') ||
            str_starts_with($hash, '$2b$') ||
            str_starts_with($hash, '$argon2id$')) {
            if (str_starts_with($hash, '$2b$')) {
                $normalized = '$2y$' . substr($hash, 4);
                if (@password_verify($plainPinStr, $normalized)) {
                    return true;
                }
            }
            if (@password_verify($plainPinStr, $hash)) {
                return true;
            }
        }

        $salt = self::getSalt();
        if ($salt !== '' && hash_equals(hash('sha256', $plainPinStr . $salt), $hash)) {
            return true;
        }
        if (hash_equals(hash('sha256', $plainPinStr), $hash)) {
            return true;
        }

        return false;
    }

    public static function generateUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // version 4
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // variant RFC 4122
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function clean(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map([self::class, 'clean'], $value);
        }
        if (is_string($value)) {
            return htmlspecialchars(strip_tags($value), ENT_QUOTES, 'UTF-8');
        }
        return $value;
    }

    /**
     * Resolves authoritative client IP address without blindly trusting spoofable proxy headers.
     * Forwarded headers are honored ONLY when REMOTE_ADDR belongs to TRUSTED_PROXY_IPS.
     */
    public static function resolveClientIp(): string
    {
        $remoteRaw = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
        $remoteIp = filter_var($remoteRaw, FILTER_VALIDATE_IP) ? $remoteRaw : '';

        if ($remoteIp !== '' && self::isTrustedProxy($remoteIp)) {
            $cfIp = trim((string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
            if ($cfIp !== '' && filter_var($cfIp, FILTER_VALIDATE_IP)) {
                return $cfIp;
            }

            $xff = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
            if ($xff !== '') {
                $parts = array_reverse(array_map('trim', explode(',', $xff)));
                foreach ($parts as $candidate) {
                    if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP) && !self::isTrustedProxy($candidate)) {
                        return $candidate;
                    }
                }
            }

            $realIp = trim((string)($_SERVER['HTTP_X_REAL_IP'] ?? ''));
            if ($realIp !== '' && filter_var($realIp, FILTER_VALIDATE_IP) && !self::isTrustedProxy($realIp)) {
                return $realIp;
            }
        }

        return $remoteIp !== '' ? $remoteIp : '127.0.0.1';
    }

    private static function isTrustedProxy(string $ip): bool
    {
        $rawList = (string)($_ENV['TRUSTED_PROXY_IPS'] ?? getenv('TRUSTED_PROXY_IPS') ?: '');
        if (trim($rawList) === '') {
            return false;
        }
        $entries = array_filter(array_map('trim', explode(',', $rawList)));
        foreach ($entries as $entry) {
            if ($entry === $ip) {
                return true;
            }
            if (str_contains($entry, '/') && str_contains($ip, '.')) {
                [$subnet, $bitsStr] = explode('/', $entry, 2);
                $bits = (int)$bitsStr;
                if ($bits >= 0 && $bits <= 32 && filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                    $ipLong = ip2long($ip);
                    $subLong = ip2long($subnet);
                    if ($ipLong !== false && $subLong !== false) {
                        $mask = $bits === 0 ? 0 : (~0 << (32 - $bits));
                        if (($ipLong & $mask) === ($subLong & $mask)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }
}
