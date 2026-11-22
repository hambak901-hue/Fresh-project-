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

    public const ERR_PROVIDER_WALLET = 'This service is temporarily unavailable. Please try again later, or contact support on WhatsApp for faster assistance.';
    public const ERR_PROVIDER_UNAVAILABLE = 'We could not process your request at this time. Please try again later, or contact support on WhatsApp for faster assistance.';
    public const ERR_PROVIDER_AUTH = 'Service temporarily unavailable. Please contact support if the issue persists.';
    public const ERR_CUSTOMER_WALLET = 'Your wallet balance is insufficient to complete this transaction. Please fund your wallet and try again.';
    public const ERR_TXN_REFUNDED = 'Your transaction could not be completed. Your wallet has been refunded.';
    public const ERR_TXN_REFUND_PENDING = 'Your transaction could not be completed. Your refund is being processed. Please check your transaction history.';

    public static function logPrivateError(string $scope, \Throwable|string $error, array $context = []): void
    {
        try {
            $detail = $error instanceof \Throwable
                ? sprintf('%s in %s:%d', $error->getMessage(), $error->getFile(), $error->getLine())
                : (string)$error;
            $ctxJson = !empty($context) ? ' | context=' . json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '';
            error_log("[HambakTech {$scope}]: {$detail}{$ctxJson}");
        } catch (\Throwable) {
            // Never let logging failure interrupt error handling
        }
    }

    public static function isCustomerWalletInsufficient(\Throwable|string $error): bool
    {
        $msg = trim($error instanceof \Throwable ? $error->getMessage() : (string)$error);
        if ($msg === '') {
            return false;
        }
        if (preg_match('/(?:provider|ulamadata|olamiconnect|2sureverify|twosureverify|veripine|vtpass|merchant|upstream|randa|paystack|flutterwave|vendor|api\s+wallet|partner)/i', $msg) === 1) {
            return false;
        }
        if (strcasecmp($msg, self::ERR_CUSTOMER_WALLET) === 0 || preg_match('/^your\s+wallet\s+balance\s+is\s+insufficient/i', $msg) === 1) {
            return true;
        }
        // WalletService::debit() customer shortfall format
        return preg_match('/^insufficient\s+wallet\s+balance\.\s*(?:available:|please\s+fund\s+your\s+wallet)/i', $msg) === 1;
    }

    public static function classifyProviderError(\Throwable|string $error, ?int $httpStatus = null): array
    {
        if ($error instanceof \PDOException) {
            return [
                'category' => 'provider_unavailable',
                'message' => self::ERR_PROVIDER_UNAVAILABLE,
                'http_status' => 500,
            ];
        }

        $msg = trim($error instanceof \Throwable ? $error->getMessage() : (string)$error);
        $code = $error instanceof \Throwable ? (int)$error->getCode() : 0;
        $status = $httpStatus ?? ($code >= 400 && $code < 600 ? $code : null);

        if (strcasecmp($msg, self::ERR_CUSTOMER_WALLET) === 0) {
            return [
                'category' => 'customer_wallet',
                'message' => self::ERR_CUSTOMER_WALLET,
                'http_status' => 400,
            ];
        }

        // 1. Provider wallet / merchant balance / quota exhausted
        if (
            preg_match('/(?:insufficient|low|empty|exhausted|depleted).{0,45}(?:balance|wallet|fund|credit|unit|float|account)/i', $msg) === 1
            || preg_match('/\b(?:fund\s+(?:your\s+)?(?:merchant|api|provider|vendor|partner|account)?\s*wallet|low\s+balance|credit\s+limit|exceeded\s+quota|not\s+enough\s+(?:fund|balance|credit))\b/i', $msg) === 1
        ) {
            return [
                'category' => 'provider_wallet',
                'message' => self::ERR_PROVIDER_WALLET,
                'http_status' => 503,
            ];
        }

        // 2. Provider authentication / authorization / credential misconfiguration
        if (
            $status === 401
            || $status === 403
            || preg_match('/\b(?:invalid|missing|expired|wrong|incorrect|revoked|unconfigured|not\s+configured)\s+(?:api[_\s-]?key|secret(?:[_\s-]?key)?|public[_\s-]?key|token|auth(?:entication)?|credential|signature|client[_\s-]?(?:id|secret))\b/i', $msg) === 1
            || preg_match('/\b(?:unauthenticated|unauthorized|forbidden|access\s+denied|auth(?:entication|orization)\s+failed|invalid\s+signature|ip\s+(?:address\s+)?not\s+whitelisted|merchant\s+restriction|credentials?\s+(?:missing|not\s+configured)|secret\s+key\s+is\s+not\s+configured|bearer\s+token)\b/i', $msg) === 1
        ) {
            return [
                'category' => 'provider_auth',
                'message' => self::ERR_PROVIDER_AUTH,
                'http_status' => 503,
            ];
        }

        // 3. Provider HTTP 5xx, transport/cURL/SSL/JSON/SQL/internal failures
        if (
            ($status !== null && $status >= 500)
            || preg_match('/\b(?:curl|guzzle|pdoexception|sqlstate|mariadb|mysql|syntax\s+error|stack\s+trace|uncaught|ssl|tls|socket|connection\s+(?:timed\s+out|refused|reset)|could\s+not\s+resolve\s+host|empty\s+reply|failed\s+to\s+open\s+stream|errno\s*=?\s*\d+|timed?\s*out|bad\s+gateway|service\s+unavailable|gateway\s+timeout)\b/i', $msg) === 1
            || preg_match('/https?:\/\/\S+/i', $msg) === 1
            || preg_match('/\b(?:ulamadata|olamiconnect|vtpass|2sureverify|twosureverify|2sure|veripine|randa|flutterwave|rave|paystack|monnify)\b/i', $msg) === 1
            || preg_match('/(?:\/home\/|\/var\/|\/app\/|\/usr\/|C:\\\\|\.php(?::\d+)?)/i', $msg) === 1
            || preg_match('/\b(?:table|column|duplicate\s+entry|foreign\s+key\s+constraint|integrity\s+constraint)\b/i', $msg) === 1
            || preg_match('/\bhttp\s*(?:4\d\d|5\d\d|status\s*\d+)\b/i', $msg) === 1
            || preg_match('/^\s*[\{\[]/', $msg) === 1
        ) {
            return [
                'category' => 'provider_unavailable',
                'message' => self::ERR_PROVIDER_UNAVAILABLE,
                'http_status' => 502,
            ];
        }

        $sanitized = self::sanitizeCustomerError($msg, self::ERR_PROVIDER_UNAVAILABLE);
        if ($sanitized === self::ERR_PROVIDER_UNAVAILABLE) {
            return [
                'category' => 'provider_unavailable',
                'message' => self::ERR_PROVIDER_UNAVAILABLE,
                'http_status' => 502,
            ];
        }

        return [
            'category' => 'customer_validation',
            'message' => $sanitized,
            'http_status' => 422,
        ];
    }

    public static function sanitizeWalletDebitError(\Throwable $e): string
    {
        if (self::isCustomerWalletInsufficient($e)) {
            return self::ERR_CUSTOMER_WALLET;
        }
        $msg = trim($e->getMessage());
        if (
            preg_match('/^wallet\s+is\s+(?:frozen|suspended|closed)\b/i', $msg) === 1
            || strcasecmp($msg, 'Debit amount must be greater than zero.') === 0
        ) {
            return $msg;
        }
        self::logPrivateError('WalletDebit', $e);
        return self::ERR_PROVIDER_UNAVAILABLE;
    }

    public static function sanitizeCustomerError(
        string $rawMessage,
        ?string $fallback = null
    ): string {
        $safeFallback = $fallback ?? self::ERR_PROVIDER_UNAVAILABLE;
        $msg = trim($rawMessage);
        if ($msg === '') {
            return $safeFallback;
        }

        // Normalize customer's own wallet balance shortfall notice to the standard message
        if (self::isCustomerWalletInsufficient($msg)) {
            return self::ERR_CUSTOMER_WALLET;
        }

        // Mask upstream/merchant insufficient balance/wallet/credit errors
        if (
            preg_match('/(?:insufficient|low|empty|exhausted|depleted).{0,45}(?:balance|wallet|fund|credit|unit|float|account)/i', $msg) === 1
            || preg_match('/\b(?:fund\s+(?:your\s+)?(?:merchant|api|provider|vendor|partner|account)?\s*wallet|low\s+balance|credit\s+limit|exceeded\s+quota)\b/i', $msg) === 1
        ) {
            return self::ERR_PROVIDER_WALLET;
        }

        // Mask upstream auth/credential errors
        if (
            preg_match('/\b(?:invalid|missing|expired|wrong|incorrect|revoked|unconfigured|not\s+configured)\s+(?:api[_\s-]?key|secret(?:[_\s-]?key)?|public[_\s-]?key|token|auth(?:entication)?|credential|signature|client[_\s-]?(?:id|secret))\b/i', $msg) === 1
            || preg_match('/\b(?:unauthenticated|unauthorized|forbidden|access\s+denied|auth(?:entication|orization)\s+failed|invalid\s+signature|ip\s+(?:address\s+)?not\s+whitelisted|merchant\s+restriction|credentials?\s+(?:missing|not\s+configured)|secret\s+key\s+is\s+not\s+configured|bearer\s+token)\b/i', $msg) === 1
        ) {
            return self::ERR_PROVIDER_AUTH;
        }

        // Mask URLs, endpoints, provider names, keys, HTTP/cURL/PDO/path internals
        $patterns = [
            '/https?:\/\/\S+/i',
            '/\b(?:ulamadata|olamiconnect|vtpass|2sureverify|twosureverify|2sure|veripine|randa|flutterwave|rave|paystack|monnify)\b/i',
            '/\b(?:api[_\s-]?key|secret[_\s-]?key|public[_\s-]?key|client[_\s-]?secret|client[_\s-]?id|bearer|authorization|webhook[_\s-]?hash|encryption[_\s-]?key|smtp|phpmailer)\b/i',
            '/\b(?:curl|guzzle|pdoexception|sqlstate|mariadb|mysql|syntax\s+error|stack\s+trace|uncaught|ssl|tls|socket|connection\s+(?:timed\s+out|refused|reset)|could\s+not\s+resolve\s+host|empty\s+reply|failed\s+to\s+open\s+stream|errno\s*=?\s*\d+)\b/i',
            '/\b(?:upstream|merchant\s+wallet|provider\s+(?:error|timeout|balance|wallet|rejected|failed|unavailable|status)|gateway\s+(?:credentials|error|timeout))\b/i',
            '/(?:\/home\/|\/var\/|\/app\/|\/usr\/|C:\\\\|\.php(?::\d+)?)/i',
            '/\b(?:table|column|duplicate\s+entry|foreign\s+key\s+constraint|integrity\s+constraint)\b/i',
            '/\bhttp\s*(?:4\d\d|5\d\d|status\s*\d+)\b/i',
            '/^\s*[\{\[]/',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $msg) === 1) {
                return $safeFallback;
            }
        }

        if (mb_strlen($msg) > 220) {
            return $safeFallback;
        }

        return $msg;
    }

    public static function sanitizeCustomerMetadata(?array $meta): ?array
    {
        if ($meta === null) {
            return null;
        }
        $sensitiveKeys = [
            'raw', 'raw_response', 'provider', 'provider_id', 'provider_name',
            'provider_balance', 'provider_cost', 'wholesale_cost', 'endpoint',
            'api_url', 'webhook_payload', 'gateway_response', 'integrity_error',
            'trace', 'stack', 'exception', 'provider_raw', 'debug',
        ];
        foreach ($sensitiveKeys as $key) {
            unset($meta[$key]);
        }
        if (isset($meta['error']) && is_string($meta['error']) && $meta['error'] !== '') {
            $meta['error'] = self::sanitizeCustomerError($meta['error'], self::ERR_PROVIDER_UNAVAILABLE);
        }
        if (isset($meta['provider_remarks']) && is_string($meta['provider_remarks']) && $meta['provider_remarks'] !== '') {
            $meta['provider_remarks'] = self::sanitizeCustomerError($meta['provider_remarks'], self::ERR_PROVIDER_UNAVAILABLE);
        }
        if (isset($meta['remarks']) && is_string($meta['remarks']) && $meta['remarks'] !== '') {
            $meta['remarks'] = self::sanitizeCustomerError($meta['remarks'], self::ERR_PROVIDER_UNAVAILABLE);
        }
        return $meta;
    }
}
